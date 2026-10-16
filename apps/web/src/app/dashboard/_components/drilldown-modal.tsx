'use client';

import { formatINR } from '@retail-sarathi/ui';
import { formatDate, tableCellClassName, tableHeaderClassName, toNumber } from './dashboard-ui';

export type DrilldownColumn = {
  key: string;
  label: string;
  format?: 'currency' | 'date' | 'number' | 'text';
};

function renderCell(value: unknown, format?: DrilldownColumn['format']) {
  if (value == null) return '—';
  if (format === 'currency') return formatINR(toNumber(value));
  if (format === 'date') return formatDate(value as string);
  if (format === 'number') return toNumber(value);
  return String(value);
}

export function DrilldownModal({
  open,
  title,
  subtitle,
  columns,
  rows,
  loading,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  columns: DrilldownColumn[];
  rows: Array<Record<string, unknown>>;
  loading?: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={tableHeaderClassName}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td key={c.key} className={tableCellClassName}>
                          {renderCell(row[c.key], c.format)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                      No rows for this selection
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
