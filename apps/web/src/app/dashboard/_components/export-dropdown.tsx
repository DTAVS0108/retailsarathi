'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

type ExportPayload = {
  filename?: string;
  csv?: string;
  base64?: string;
  html?: string;
  contentType?: string;
};

const OPTIONS: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'csv', label: 'CSV', hint: 'Spreadsheet-friendly text' },
  { value: 'xlsx', label: 'Excel', hint: '.xlsx workbook' },
  { value: 'pdf', label: 'PDF', hint: 'Print / Save as PDF' },
];

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download CSV / Excel or open HTML print view for PDF. */
export async function applyWebExport(format: ExportFormat, data: ExportPayload): Promise<string> {
  if (format === 'csv' && data.csv && data.filename) {
    downloadBlob(data.filename, new Blob([data.csv], { type: 'text/csv;charset=utf-8' }));
    return `Downloaded ${data.filename}`;
  }
  if (format === 'xlsx' && data.base64 && data.filename) {
    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    downloadBlob(
      data.filename,
      new Blob([bytes], {
        type:
          data.contentType ??
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    return `Downloaded ${data.filename}`;
  }
  if (format === 'pdf' && data.html) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Popup blocked');
    w.document.write(data.html);
    w.document.close();
    return 'Opened print view — save as PDF from the browser.';
  }
  throw new Error('Unexpected export response');
}

/** Fetch `/reports/...?format=` and apply download / print. */
export async function fetchAndApplyExport(path: string, format: ExportFormat): Promise<string> {
  const sep = path.includes('?') ? '&' : '?';
  const data = await apiWithAuth<ExportPayload>(`${path}${sep}format=${format}`);
  return applyWebExport(format, data);
}

/** Single Export control with CSV / Excel / PDF menu. */
export function ExportDropdown({
  exporting,
  onExport,
  label = 'Export',
  size = 'sm',
}: {
  exporting?: boolean;
  onExport: (format: ExportFormat) => void;
  label?: string;
  size?: 'sm' | 'md';
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
      <Button
        type="button"
        variant="secondary"
        size={size}
        disabled={exporting}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {exporting ? 'Exporting…' : label}
        <span className="opacity-70" aria-hidden>
          ▾
        </span>
      </Button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={exporting}
                className="flex w-full flex-col px-3.5 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => {
                  setOpen(false);
                  onExport(opt.value);
                }}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="text-[11px] text-slate-500">{opt.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
