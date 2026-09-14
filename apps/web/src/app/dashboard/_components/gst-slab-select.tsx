'use client';

import { GST_SLABS, nearestGstSlab } from '@retail-sarathi/gst-engine';
import { selectClassName } from '../_components/dashboard-ui';

export function GstSlabSelect({
  value,
  onChange,
  className = selectClassName,
  id,
  name,
  allowCustom = true,
}: {
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  name?: string;
  /** Keep a Custom option when OCR/import has a non-slab rate */
  allowCustom?: boolean;
}) {
  const numeric = Number(value);
  const known = GST_SLABS.some((s) => Math.abs(s.value - numeric) < 0.001);
  const selectValue = known ? String(numeric) : allowCustom ? '__custom__' : String(nearestGstSlab(numeric));

  return (
    <div className="space-y-1">
      <select
        id={id}
        name={name}
        className={className}
        value={selectValue === '__custom__' ? '__custom__' : selectValue}
        onChange={(event) => {
          if (event.target.value === '__custom__') return;
          onChange(event.target.value);
        }}
      >
        <optgroup label="GST 2.0 slabs">
          {GST_SLABS.filter((s) => s.group === 'current').map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Special rates">
          {GST_SLABS.filter((s) => s.group === 'special').map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Legacy (older invoices)">
          {GST_SLABS.filter((s) => s.group === 'legacy').map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </optgroup>
        {allowCustom && !known ? (
          <option value="__custom__">Custom {numeric}%</option>
        ) : null}
      </select>
    </div>
  );
}
