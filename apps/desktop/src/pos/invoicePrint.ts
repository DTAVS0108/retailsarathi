import {
  generateA4InvoiceHtml,
  type InvoiceCopyKind,
  type PrintInvoiceData,
} from '@retail-sarathi/ui';

export function buildA4Html(
  printData: PrintInvoiceData,
  templateId?: string,
  copyKind: InvoiceCopyKind = 'original',
): string {
  const data: PrintInvoiceData = {
    ...printData,
    copyKind,
    templateId: templateId || printData.templateId || 'classic',
  };
  return generateA4InvoiceHtml(data, data.templateId ?? 'classic');
}

/**
 * Open A4 print preview (Electron) or iframe print (browser fallback).
 * On Windows, Chromium cannot fill the OS print-preview pane — Electron opens
 * an in-app preview with Print… and Save PDF instead.
 */
export async function openSystemPrint(html: string): Promise<string | null> {
  const printHtml = window.retailSarathi?.printHtml;
  if (typeof printHtml === 'function') {
    try {
      const res = await printHtml(html);
      if (res?.ok) return null;
      const err = res?.error || 'Print failed';
      if (/cancel/i.test(err)) return null;
      return err;
    } catch (e) {
      return e instanceof Error ? e.message : 'Print failed';
    }
  }

  // Browser / fallback: hidden iframe print (more reliable than popup blockers)
  try {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) {
      frame.remove();
      return 'Could not open print frame';
    }
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 300));
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Print failed';
  }
}
