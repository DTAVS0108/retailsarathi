'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn, inputClassName } from './dashboard-ui';

export type SupplierOption = {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
};

type SupplierSelectProps = {
  value: string;
  suppliers: SupplierOption[];
  onChange: (supplierId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Allow clearing selection back to empty. Default true. */
  allowClear?: boolean;
};

function matchesQuery(s: SupplierOption, q: string): boolean {
  if (!q) return true;
  const hay = `${s.name} ${s.gstin || ''} ${s.phone || ''}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

/**
 * Searchable supplier picker (combobox). Native &lt;select&gt; cannot filter long lists.
 */
export function SupplierSelect({
  value,
  suppliers,
  onChange,
  placeholder = 'Search supplier by name, GSTIN, or phone…',
  disabled,
  className,
  id,
  allowClear = true,
}: SupplierSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => suppliers.find((s) => s.id === value) ?? null,
    [suppliers, value],
  );

  const filtered = useMemo(() => {
    const list = suppliers.filter((s) => matchesQuery(s, query));
    return list.slice(0, 80);
  }, [suppliers, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function clear() {
    onChange('');
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = filtered[highlight];
      if (open && hit) pick(hit.id);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          className={cn(inputClassName, 'pr-20')}
          placeholder={selected && !open ? selected.name : placeholder}
          value={open ? query : selected?.name ?? ''}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {allowClear && value ? (
            <button
              type="button"
              className="rounded px-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                clear();
              }}
            >
              Clear
            </button>
          ) : null}
          <span className="text-slate-400" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {allowClear ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={cn(
                  'flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50',
                  !value ? 'bg-teal-50 text-teal-900' : 'text-slate-600',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => clear()}
              >
                — Select or type name below —
              </button>
            </li>
          ) : null}
          {!filtered.length ? (
            <li className="px-3 py-2 text-sm text-slate-500">No suppliers match “{query.trim()}”</li>
          ) : (
            filtered.map((s, idx) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  className={cn(
                    'flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50',
                    idx === highlight ? 'bg-slate-50' : '',
                    s.id === value ? 'bg-teal-50' : '',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pick(s.id)}
                >
                  <span className="text-sm font-medium text-slate-900">{s.name}</span>
                  {s.gstin || s.phone ? (
                    <span className="text-xs text-slate-500">
                      {[s.gstin, s.phone].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
