'use client';

import { Fragment, useState } from 'react';
import { formatINR } from '@retail-sarathi/ui';

type Cell = { day: number; hour: number; revenue: number; invoiceCount: number };

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Prisma's Date#getDay() is 0=Sunday..6=Saturday; DAY_LABELS above is Monday-first for a more
// natural retail-week reading order, so cells are looked up via this remap.
const JS_DAY_TO_ROW = [6, 0, 1, 2, 3, 4, 5]; // JS getDay() index -> row index in DAY_LABELS

// Sequential single-hue ramp (dataviz skill default blue), light->dark by value — never the
// categorical rainbow for a magnitude encoding.
const LIGHT = [205, 226, 251]; // #cde2fb
const DARK = [13, 54, 107]; // #0d366b

function cellColor(ratio: number) {
  if (ratio <= 0) return '#f1f5f9'; // no sales at all — neutral, not "the lightest blue"
  const r = Math.round(LIGHT[0] + (DARK[0] - LIGHT[0]) * ratio);
  const g = Math.round(LIGHT[1] + (DARK[1] - LIGHT[1]) * ratio);
  const b = Math.round(LIGHT[2] + (DARK[2] - LIGHT[2]) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Day-of-week × hour-of-day sales heatmap — "when do customers actually shop?" at a glance.
    Sequential shading (one hue, light->dark) per the dataviz rule for magnitude data. */
export function PeakHoursHeatmap({ grid }: { grid: Cell[] }) {
  const [hovered, setHovered] = useState<Cell | null>(null);

  if (!grid.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No data for this period</p>;
  }

  const byKey = new Map(grid.map((c) => [`${c.day}-${c.hour}`, c]));
  const max = Math.max(1, ...grid.map((c) => c.revenue));

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        {/* A fixed pixel minWidth (not `inline-block min-w-full`) — the previous wrapper let the
            aspect-square cells' intrinsic sizing blow out an auto-width ancestor at narrower
            desktop widths (~1280-1366px), overflowing this card and, because grid tracks can't
            contain a wider child, the whole page. An explicit minWidth on the grid itself keeps
            this div (a normal block element, correctly bounded by its ChartCard/grid-col parent)
            the source of truth for scrolling, with no ambiguous shrink-to-fit sizing in between. */}
        <div className="grid" style={{ gridTemplateColumns: '48px repeat(24, minmax(20px, 1fr))', minWidth: 640 }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="pb-1 text-center text-[9px] text-slate-400">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
          {DAY_LABELS.map((dayLabel, row) => {
            const jsDay = JS_DAY_TO_ROW.indexOf(row);
            return (
              <Fragment key={row}>
                <div className="flex items-center pr-2 text-[11px] font-medium text-slate-500">{dayLabel}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = byKey.get(`${jsDay}-${hour}`);
                  const ratio = cell ? cell.revenue / max : 0;
                  return (
                    <div
                      key={`${row}-${hour}`}
                      className="m-[1px] aspect-square rounded-sm transition-transform hover:scale-110"
                      style={{ background: cellColor(ratio) }}
                      onMouseEnter={() => cell && setHovered(cell)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      {hovered ? (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
          <span className="font-semibold text-slate-800">
            {DAY_LABELS[JS_DAY_TO_ROW.indexOf(hovered.day)]} {hovered.hour}:00–{hovered.hour + 1}:00
          </span>
          <span className="text-slate-500">
            {formatINR(hovered.revenue)} · {hovered.invoiceCount} invoice{hovered.invoiceCount === 1 ? '' : 's'}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Hover a cell for exact revenue and invoice count.</p>
      )}
    </div>
  );
}
