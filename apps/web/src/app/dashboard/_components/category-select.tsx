'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiWithAuth } from '@/lib/helpers';
import { cn, inputClassName, selectClassName } from './dashboard-ui';

/** Seed options so empty tenants still see useful categories. */
export const DEFAULT_PRODUCT_CATEGORIES = [
  'Battery',
  'Inverter',
  'Stabilizer',
  'Accessories',
  'General',
] as const;

export const CATEGORY_OTHER_VALUE = '__other__';

export function mergeCategoryOptions(categories: string[] = [], current?: string | null) {
  const set = new Set<string>();
  for (const c of [...DEFAULT_PRODUCT_CATEGORIES, ...categories]) {
    const n = String(c || '').trim();
    if (n) set.add(n);
  }
  const cur = String(current || '').trim();
  if (cur && cur !== CATEGORY_OTHER_VALUE) set.add(cur);
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Persist a free-text category into the tenant master list (idempotent). */
export async function persistCategory(name: string): Promise<string | null> {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return null;
  try {
    await apiWithAuth('/categories', {
      method: 'POST',
      body: JSON.stringify({ name: n }),
    });
  } catch {
    /* already exists or offline — product save also ensures master */
  }
  return n;
}

export async function fetchCategoryNames(): Promise<string[]> {
  try {
    const res = await apiWithAuth<Array<{ id: string; name: string }> | string[]>('/categories');
    if (Array.isArray(res) && res.length && typeof res[0] === 'string') {
      return (res as string[]).map((n) => n.trim()).filter(Boolean);
    }
    return (res as Array<{ name: string }>)
      .map((c) => String(c.name || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

type CategorySelectProps = {
  value: string;
  onChange: (value: string) => void;
  /** Known categories (master + facets). Merged with defaults. */
  categories?: string[];
  /** Called when a new category is added so parents can refresh lists. */
  onCategoryAdded?: (name: string) => void;
  /** Filter mode: no Other, optional empty "All". */
  mode?: 'edit' | 'filter';
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
  /** Fetch /categories on mount and merge into options. */
  autoLoad?: boolean;
  id?: string;
  name?: string;
};

export function CategorySelect({
  value,
  onChange,
  categories = [],
  onCategoryAdded,
  mode = 'edit',
  allowEmpty = mode === 'filter',
  emptyLabel = mode === 'filter' ? 'All categories' : 'Select category',
  className,
  selectClassName: selectCls,
  disabled,
  autoLoad = false,
  id,
  name,
}: CategorySelectProps) {
  const [loaded, setLoaded] = useState<string[]>([]);
  const [addingOther, setAddingOther] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');
  const otherRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!autoLoad) return;
    let cancelled = false;
    void fetchCategoryNames().then((names) => {
      if (!cancelled && names.length) setLoaded(names);
    });
    return () => {
      cancelled = true;
    };
  }, [autoLoad]);

  const options = useMemo(
    () => mergeCategoryOptions([...categories, ...loaded]),
    [categories, loaded],
  );

  const matched = useMemo(() => {
    const v = value.trim();
    if (!v) return '';
    return options.find((o) => o.toLowerCase() === v.toLowerCase()) || '';
  }, [options, value]);

  const isCustomValue = Boolean(value.trim() && !matched);
  const showOtherInput = mode === 'edit' && (addingOther || isCustomValue);

  const selectValue = showOtherInput ? CATEGORY_OTHER_VALUE : matched || (allowEmpty ? '' : matched);

  useEffect(() => {
    if (isCustomValue && !addingOther) {
      setOtherDraft(value.trim());
    }
  }, [isCustomValue, value, addingOther]);

  useEffect(() => {
    if (!showOtherInput) return;
    const t = window.setTimeout(() => otherRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [showOtherInput, addingOther]);

  function remember(name: string) {
    setLoaded((prev) => mergeCategoryOptions([...prev, name]));
    onCategoryAdded?.(name);
  }

  async function commitOther(raw: string) {
    if (savingRef.current) return;
    const n = raw.trim().replace(/\s+/g, ' ');
    if (!n) {
      setAddingOther(false);
      setOtherDraft('');
      if (isCustomValue) onChange('');
      return;
    }
    savingRef.current = true;
    try {
      const saved = (await persistCategory(n)) || n;
      setAddingOther(false);
      setOtherDraft('');
      onChange(saved);
      remember(saved);
    } finally {
      savingRef.current = false;
    }
  }

  async function handleSelectChange(next: string) {
    if (next === CATEGORY_OTHER_VALUE) {
      setAddingOther(true);
      setOtherDraft('');
      return;
    }
    setAddingOther(false);
    setOtherDraft('');
    onChange(next);
    if (mode === 'edit' && next.trim()) {
      const saved = await persistCategory(next);
      if (saved) remember(saved);
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <select
        id={id}
        name={name}
        className={selectCls || selectClassName}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => void handleSelectChange(e.target.value)}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {!allowEmpty && !selectValue && !showOtherInput ? (
          <option value="" disabled>
            {emptyLabel}
          </option>
        ) : null}
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        {mode === 'edit' ? <option value={CATEGORY_OTHER_VALUE}>Other (add new)…</option> : null}
      </select>
      {showOtherInput ? (
        <input
          ref={otherRef}
          className={inputClassName}
          value={otherDraft}
          disabled={disabled}
          placeholder="Type new category name"
          onChange={(e) => setOtherDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commitOther(otherDraft);
            }
            if (e.key === 'Escape') {
              setAddingOther(false);
              setOtherDraft('');
              if (!matched) onChange('');
            }
          }}
          onBlur={() => void commitOther(otherDraft)}
        />
      ) : null}
    </div>
  );
}
