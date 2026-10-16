'use client';

import { Button } from '@retail-sarathi/ui';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function pageWindow(current: number, totalPages: number) {
  const pages: number[] = [];
  const end = Math.min(totalPages, Math.max(1, current - 2) + 4);
  for (let p = Math.max(1, end - 4); p <= end; p += 1) pages.push(p);
  return pages;
}

/** First tables in this dashboard with zebra striping + row hover + a sticky header — scoped to
    the AI Insights redesign only, not retrofitted onto other pages' existing tables. */
export const stickyTheadClassName = 'sticky top-0 z-10 bg-slate-50';
export const zebraRowClassName = 'border-t border-slate-100 even:bg-slate-50/60 hover:bg-teal-50/50 transition-colors';

export function SortHeader({
  label,
  field,
  activeField,
  dir,
  onSort,
  className,
}: {
  label: string;
  field: string;
  activeField: string;
  dir: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = field === activeField;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${active ? 'text-teal-700' : 'text-slate-500'}`}
      >
        {label}
        <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

export function PaginationFooter({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(total, page * pageSize);

  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500">
          Showing <span className="font-medium text-slate-800">{rangeFrom}</span>–
          <span className="font-medium text-slate-800">{rangeTo}</span> of{' '}
          <span className="font-medium text-slate-800">{total}</span>
        </p>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        {pageWindow(page, totalPages).map((p) => (
          <Button key={p} type="button" size="sm" variant={p === page ? 'primary' : 'secondary'} onClick={() => onPageChange(p)}>
            {p}
          </Button>
        ))}
        <Button type="button" size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
