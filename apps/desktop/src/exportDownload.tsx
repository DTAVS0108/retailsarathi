import { useEffect, useId, useRef, useState } from 'react';
import { openSystemPrint } from './pos/invoicePrint';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ExportPayload = {
  filename?: string;
  csv?: string;
  base64?: string;
  html?: string;
  contentType?: string;
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, csv: string) {
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

function downloadBase64(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  downloadBlob(filename, new Blob([bytes], { type: mime }));
}

/** Handle API export response (csv / xlsx base64 / html for print-PDF). */
export async function applyExportDownload(
  format: ExportFormat,
  data: ExportPayload,
): Promise<string> {
  if (format === 'csv' && data.csv && data.filename) {
    downloadCsv(data.filename, data.csv);
    return `Downloaded ${data.filename}`;
  }
  if (format === 'xlsx' && data.base64 && data.filename) {
    downloadBase64(
      data.filename,
      data.base64,
      data.contentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return `Downloaded ${data.filename}`;
  }
  if (format === 'pdf' && data.html) {
    const err = await openSystemPrint(data.html);
    if (err) throw new Error(err);
    return 'Opened print view — use Save as PDF / Print';
  }
  throw new Error('Unexpected export response');
}

const EXPORT_OPTIONS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'csv', label: 'CSV', hint: 'Spreadsheet-friendly text' },
  { value: 'xlsx', label: 'Excel', hint: '.xlsx workbook' },
  { value: 'pdf', label: 'PDF', hint: 'Print / Save as PDF' },
];

/** Single Export control with CSV / Excel / PDF dropdown. */
export function ExportMenu({
  exporting,
  onExport,
  compact,
}: {
  exporting?: boolean;
  onExport: (format: ExportFormat) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={exporting}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        className={compact ? 'rs-btn-secondary text-xs' : 'rs-btn-secondary text-sm'}
        onClick={() => setOpen((v) => !v)}
        title="Export"
      >
        {exporting ? 'Exporting…' : 'Export'}
        <span className="ml-1 opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          className="rs-select-menu absolute right-0 z-40 mt-1 min-w-[9.5rem]"
          style={{ position: 'absolute', top: '100%', right: 0, left: 'auto', width: 'auto', minWidth: 152 }}
        >
          {EXPORT_OPTIONS.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="menuitem"
                className="rs-select-option w-full text-left"
                disabled={exporting}
                onClick={() => {
                  setOpen(false);
                  onExport(opt.value);
                }}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="mt-0.5 block text-[10px] opacity-70">{opt.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
