'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavIcon } from './nav-icons';
import { cn, inputClassName, selectClassName } from './dashboard-ui';

const GST_SLABS = [0, 5, 12, 18, 28] as const;
const CALC_FAB_KEY = 'rs-calc-fab-pos';
const CALC_PANEL_KEY = 'rs-calc-panel-pos';
const FAB_SIZE = 56;
/** Side inset for the floating button (left/right). */
const FAB_EDGE_X = 32;
/** Top/bottom inset for the floating button. */
const FAB_EDGE_Y = 32;
/** Keep open panel fully inside the viewport. */
const PANEL_EDGE = 20;

type Tab = 'basic' | 'gst';
type GstField = 'taxable' | 'final';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatCalc(n: number) {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

function BasicCalculator() {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const freshRef = useRef(fresh);
  const displayRef = useRef(display);
  const accRef = useRef(acc);
  const opRef = useRef(op);

  useEffect(() => {
    freshRef.current = fresh;
  }, [fresh]);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);
  useEffect(() => {
    accRef.current = acc;
  }, [acc]);
  useEffect(() => {
    opRef.current = op;
  }, [op]);

  function inputDigit(d: string) {
    const isFresh = freshRef.current;
    const prev = displayRef.current;
    let next: string;
    if (isFresh || prev === '0') {
      next = d === '.' ? '0.' : d;
    } else if (d === '.' && prev.includes('.')) {
      return;
    } else if (prev.replace('.', '').replace('-', '').length >= 12) {
      return;
    } else {
      next = prev + d;
    }
    freshRef.current = false;
    displayRef.current = next;
    setFresh(false);
    setDisplay(next);
  }

  function clearAll() {
    freshRef.current = true;
    displayRef.current = '0';
    accRef.current = null;
    opRef.current = null;
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
  }

  function backspace() {
    if (freshRef.current || displayRef.current.length <= 1) {
      freshRef.current = true;
      displayRef.current = '0';
      setFresh(true);
      setDisplay('0');
      return;
    }
    const next = displayRef.current.slice(0, -1);
    displayRef.current = next;
    setDisplay(next);
  }

  function applyOp(nextOp: string) {
    const current = Number(displayRef.current);
    const curAcc = accRef.current;
    const curOp = opRef.current;
    if (curAcc === null || curOp === null || freshRef.current) {
      accRef.current = current;
      opRef.current = nextOp;
      freshRef.current = true;
      setAcc(current);
      setOp(nextOp);
      setFresh(true);
      return;
    }
    const result = compute(curAcc, current, curOp);
    const shown = formatCalc(result);
    accRef.current = result;
    opRef.current = nextOp;
    displayRef.current = shown;
    freshRef.current = true;
    setAcc(result);
    setDisplay(shown);
    setOp(nextOp);
    setFresh(true);
  }

  function equals() {
    if (accRef.current === null || opRef.current === null) return;
    const result = compute(accRef.current, Number(displayRef.current), opRef.current);
    const shown = formatCalc(result);
    displayRef.current = shown;
    accRef.current = null;
    opRef.current = null;
    freshRef.current = true;
    setDisplay(shown);
    setAcc(null);
    setOp(null);
    setFresh(true);
  }

  function percent() {
    const shown = formatCalc(Number(displayRef.current) / 100);
    displayRef.current = shown;
    freshRef.current = true;
    setDisplay(shown);
    setFresh(true);
  }

  function toggleSign() {
    const prev = displayRef.current;
    if (prev === '0') return;
    const next = prev.startsWith('-') ? prev.slice(1) : `-${prev}`;
    displayRef.current = next;
    setDisplay(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const key = e.key;
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        inputDigit(key);
        return;
      }
      if (key === '.' || key === ',') {
        e.preventDefault();
        inputDigit('.');
        return;
      }
      if (key === '+' || key === '-' || key === '*' || key === '/') {
        e.preventDefault();
        applyOp(key);
        return;
      }
      if (key === 'Enter' || key === '=') {
        e.preventDefault();
        equals();
        return;
      }
      if (key === 'Backspace') {
        e.preventDefault();
        backspace();
        return;
      }
      if (key === 'Escape') {
        return;
      }
      if (key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearAll();
      }
      if (key === '%') {
        e.preventDefault();
        percent();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const keys: Array<{ label: string; onClick: () => void; className?: string; span?: string }> = [
    { label: 'AC', onClick: clearAll, className: 'bg-slate-200 text-slate-800' },
    { label: '±', onClick: toggleSign, className: 'bg-slate-200 text-slate-800' },
    { label: '%', onClick: percent, className: 'bg-slate-200 text-slate-800' },
    { label: '÷', onClick: () => applyOp('/'), className: 'bg-teal-600 text-white' },
    { label: '7', onClick: () => inputDigit('7') },
    { label: '8', onClick: () => inputDigit('8') },
    { label: '9', onClick: () => inputDigit('9') },
    { label: '×', onClick: () => applyOp('*'), className: 'bg-teal-600 text-white' },
    { label: '4', onClick: () => inputDigit('4') },
    { label: '5', onClick: () => inputDigit('5') },
    { label: '6', onClick: () => inputDigit('6') },
    { label: '−', onClick: () => applyOp('-'), className: 'bg-teal-600 text-white' },
    { label: '1', onClick: () => inputDigit('1') },
    { label: '2', onClick: () => inputDigit('2') },
    { label: '3', onClick: () => inputDigit('3') },
    { label: '+', onClick: () => applyOp('+'), className: 'bg-teal-600 text-white' },
    { label: '0', onClick: () => inputDigit('0'), span: 'col-span-2' },
    { label: '.', onClick: () => inputDigit('.') },
    { label: '=', onClick: equals, className: 'bg-teal-700 text-white' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-right text-3xl font-semibold tabular-nums text-slate-900" title={display}>
          {display}
        </p>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          onClick={backspace}
          aria-label="Backspace"
        >
          ⌫
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button
            key={k.label}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              k.onClick();
            }}
            className={cn(
              'min-h-11 rounded-xl text-base font-semibold transition active:scale-95',
              k.className ?? 'bg-slate-100 text-slate-900 hover:bg-slate-200',
              k.span,
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function compute(a: number, b: number, operator: string) {
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function GstCalculator() {
  const [slab, setSlab] = useState<(typeof GST_SLABS)[number]>(18);
  const [taxable, setTaxable] = useState('');
  const [finalAmt, setFinalAmt] = useState('');
  const [lastEdited, setLastEdited] = useState<GstField>('final');

  const result = useMemo(() => {
    const empty = {
      taxable: null as number | null,
      cgst: null as number | null,
      sgst: null as number | null,
      gst: null as number | null,
      final: null as number | null,
    };
    const rate = slab / 100;
    let base: number;
    let gst: number;
    let final: number;
    if (lastEdited === 'final') {
      final = Number(finalAmt);
      if (!Number.isFinite(final) || finalAmt.trim() === '') return empty;
      base = rate === 0 ? final : final / (1 + rate);
      gst = final - base;
    } else {
      base = Number(taxable);
      if (!Number.isFinite(base) || taxable.trim() === '') return empty;
      gst = base * rate;
      final = base + gst;
    }
    const totalGst = roundMoney(gst);
    const cgst = roundMoney(totalGst / 2);
    const sgst = roundMoney(totalGst - cgst);
    return {
      taxable: roundMoney(base),
      cgst,
      sgst,
      gst: totalGst,
      final: roundMoney(final),
    };
  }, [slab, taxable, finalAmt, lastEdited]);

  function onTaxableChange(value: string) {
    setTaxable(value);
    setLastEdited('taxable');
    const base = Number(value);
    if (!Number.isFinite(base) || value.trim() === '') {
      setFinalAmt('');
      return;
    }
    setFinalAmt(String(roundMoney(base * (1 + slab / 100))));
  }

  function onFinalChange(value: string) {
    setFinalAmt(value);
    setLastEdited('final');
    const final = Number(value);
    if (!Number.isFinite(final) || value.trim() === '') {
      setTaxable('');
      return;
    }
    const base = slab === 0 ? final : final / (1 + slab / 100);
    setTaxable(String(roundMoney(base)));
  }

  function onSlabChange(next: (typeof GST_SLABS)[number]) {
    setSlab(next);
    if (lastEdited === 'final' && finalAmt.trim()) {
      const final = Number(finalAmt);
      if (Number.isFinite(final)) {
        const base = next === 0 ? final : final / (1 + next / 100);
        setTaxable(String(roundMoney(base)));
      }
    } else if (lastEdited === 'taxable' && taxable.trim()) {
      const base = Number(taxable);
      if (Number.isFinite(base)) {
        setFinalAmt(String(roundMoney(base * (1 + next / 100))));
      }
    }
  }

  const halfSlab = slab / 2;
  const money = (n: number | null) =>
    n == null ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>GST slab</span>
        <select
          className={selectClassName}
          value={slab}
          onChange={(e) => onSlabChange(Number(e.target.value) as (typeof GST_SLABS)[number])}
        >
          {GST_SLABS.map((r) => (
            <option key={r} value={r}>
              {r}% GST
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Taxable amount (excl. GST)</span>
          <input
            className={inputClassName}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={taxable}
            onChange={(e) => onTaxableChange(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Final amount (incl. GST)</span>
          <input
            className={inputClassName}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={finalAmt}
            onChange={(e) => onFinalChange(e.target.value)}
          />
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Edit either amount — the other updates automatically. CGST + SGST = total GST (intra-state split).
      </p>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex justify-between gap-2 text-slate-600">
          <span>Taxable</span>
          <span className="font-medium tabular-nums text-slate-900">{money(result.taxable)}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-slate-600">
          <span>CGST ({halfSlab}%)</span>
          <span className="font-medium tabular-nums text-slate-900">{money(result.cgst)}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-slate-600">
          <span>SGST ({halfSlab}%)</span>
          <span className="font-medium tabular-nums text-slate-900">{money(result.sgst)}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-slate-600">
          <span>Total GST ({slab}%)</span>
          <span className="font-medium tabular-nums text-slate-900">{money(result.gst)}</span>
        </div>
        <div className="mt-2 flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold text-slate-900">
          <span>Final</span>
          <span className="tabular-nums text-brand">{money(result.final)}</span>
        </div>
      </div>
    </div>
  );
}

export const OPEN_CALCULATOR_EVENT = 'rs:open-calculator';

/** Open (or toggle) the dashboard calculator from chrome outside the FAB. */
export function requestOpenCalculator() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_CALCULATOR_EVENT));
}

export function FloatingCalculator({ showFab = true }: { showFab?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('basic');
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    mode: 'fab' | 'panel';
    last?: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  function snapFabX(rawX: number) {
    const leftX = FAB_EDGE_X;
    const rightX = Math.max(FAB_EDGE_X, window.innerWidth - FAB_SIZE - FAB_EDGE_X);
    const mid = window.innerWidth / 2;
    return rawX + FAB_SIZE / 2 < mid ? leftX : rightX;
  }

  function clampFab(p: { x: number; y: number }) {
    const bottomNav = window.innerWidth < 768 ? 88 : 24;
    return {
      x: snapFabX(p.x),
      y: clamp(
        p.y,
        FAB_EDGE_Y,
        Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - bottomNav - FAB_EDGE_Y),
      ),
    };
  }

  function clampPanel(p: { x: number; y: number }, w: number, h: number) {
    const bottomNav = window.innerWidth < 768 ? 88 : 24;
    return {
      x: clamp(p.x, PANEL_EDGE, Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE)),
      y: clamp(
        p.y,
        PANEL_EDGE,
        Math.max(PANEL_EDGE, window.innerHeight - h - PANEL_EDGE - bottomNav),
      ),
    };
  }

  function persistFab(next: { x: number; y: number }) {
    try {
      sessionStorage.setItem(CALC_FAB_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function persistPanel(next: { x: number; y: number }) {
    try {
      sessionStorage.setItem(CALC_PANEL_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const defaultFabPos = useCallback(() => {
    const bottomNav = typeof window !== 'undefined' && window.innerWidth < 768 ? 88 : 24;
    const preferLeft = typeof window !== 'undefined' && window.innerWidth < 768;
    return {
      x: preferLeft ? FAB_EDGE_X : Math.max(FAB_EDGE_X, window.innerWidth - FAB_SIZE - FAB_EDGE_X),
      y: Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - bottomNav - FAB_EDGE_Y),
    };
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CALC_FAB_KEY) ?? sessionStorage.getItem('rs-calc-pos');
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setFabPos(clampFab(parsed));
        }
      }
      const panelRaw = sessionStorage.getItem(CALC_PANEL_KEY);
      if (panelRaw) {
        const parsed = JSON.parse(panelRaw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setPanelPos(parsed);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (fabPos) return;
    function place() {
      setFabPos(defaultFabPos());
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [fabPos, defaultFabPos]);

  useEffect(() => {
    if (!fabPos) return;
    function onResize() {
      setFabPos((prev) => (prev ? clampFab(prev) : prev));
      setPanelPos((prev) => {
        if (!prev || !open) return prev;
        const w = Math.min(352, window.innerWidth - PANEL_EDGE * 2);
        const h = Math.min(520, window.innerHeight - PANEL_EDGE * 2);
        return clampPanel(prev, w, h);
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fabPos, open]);

  function openFromFab() {
    const anchor = fabPos ?? defaultFabPos();
    const w = Math.min(352, window.innerWidth - PANEL_EDGE * 2);
    const h = Math.min(520, window.innerHeight - PANEL_EDGE * 2);
    const onLeft = anchor.x + FAB_SIZE / 2 < window.innerWidth / 2;
    const next = clampPanel(
      {
        x: onLeft ? PANEL_EDGE : Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE),
        y: anchor.y,
      },
      w,
      h,
    );
    setPanelPos(next);
    persistPanel(next);
    setOpen(true);
  }

  function openFromHeader() {
    if (openRef.current) {
      setOpen(false);
      return;
    }
    const w = Math.min(352, window.innerWidth - PANEL_EDGE * 2);
    const h = Math.min(520, window.innerHeight - PANEL_EDGE * 2);
    const mobile = window.innerWidth < 768;
    const next = clampPanel(
      {
        x: mobile ? Math.max(PANEL_EDGE, (window.innerWidth - w) / 2) : Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE),
        y: mobile ? 72 : PANEL_EDGE + 48,
      },
      w,
      h,
    );
    setPanelPos(next);
    persistPanel(next);
    setOpen(true);
  }

  useEffect(() => {
    function onRequestOpen() {
      openFromHeader();
    }
    window.addEventListener(OPEN_CALCULATOR_EVENT, onRequestOpen);
    return () => window.removeEventListener(OPEN_CALCULATOR_EVENT, onRequestOpen);
  }, []);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    const w = el.offsetWidth || 352;
    const h = el.offsetHeight || 420;
    setPanelPos((prev) => {
      if (!prev) return prev;
      const next = clampPanel(prev, w, h);
      if (next.x === prev.x && next.y === prev.y) return prev;
      persistPanel(next);
      return next;
    });
  }, [open, tab]);

  function boundsFor(mode: 'fab' | 'panel') {
    const el = panelRef.current;
    const bottomNav = window.innerWidth < 768 ? 88 : 24;
    if (mode === 'fab') {
      return {
        minX: FAB_EDGE_X,
        minY: FAB_EDGE_Y,
        maxX: Math.max(FAB_EDGE_X, window.innerWidth - FAB_SIZE - FAB_EDGE_X),
        maxY: Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - bottomNav - FAB_EDGE_Y),
      };
    }
    const w = Math.min(el?.offsetWidth || 352, window.innerWidth - PANEL_EDGE * 2);
    const h = Math.min(el?.offsetHeight || 420, window.innerHeight - PANEL_EDGE * 2 - bottomNav);
    return {
      minX: PANEL_EDGE,
      minY: PANEL_EDGE,
      maxX: Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE),
      maxY: Math.max(PANEL_EDGE, window.innerHeight - h - PANEL_EDGE - bottomNav),
    };
  }

  function startDrag(e: React.PointerEvent, mode: 'fab' | 'panel') {
    const current = mode === 'fab' ? fabPos : panelPos;
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
      mode,
    };
  }

  function onDragMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    const b = boundsFor(drag.mode);
    const freeX = clamp(drag.originX + dx, b.minX, b.maxX);
    const next = {
      x: drag.mode === 'fab' ? snapFabX(freeX) : freeX,
      y: clamp(drag.originY + dy, b.minY, b.maxY),
    };
    drag.last = next;
    if (drag.mode === 'fab') setFabPos(next);
    else setPanelPos(next);
  }

  function onDragEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode === 'fab') {
      const finalPos = clampFab(drag.last ?? fabPos ?? defaultFabPos());
      setFabPos(finalPos);
      persistFab(finalPos);
      if (!drag.moved) openFromFab();
      return;
    }
    if (drag?.mode === 'panel') {
      const b = boundsFor('panel');
      const raw = drag.last ?? panelPos;
      if (!raw) return;
      const finalPos = {
        x: clamp(raw.x, b.minX, b.maxX),
        y: clamp(raw.y, b.minY, b.maxY),
      };
      setPanelPos(finalPos);
      persistPanel(finalPos);
    }
  }

  function closePanel() {
    setOpen(false);
  }

  if (!fabPos) return null;

  if (!open) {
    if (!showFab) return null;
    return (
      <div
        className="fixed z-[46] hidden select-none touch-none md:block"
        style={{ left: fabPos.x, top: fabPos.y }}
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label="Open calculator — drag along left or right edge"
          onPointerDown={(e) => startDrag(e, 'fab')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-xl shadow-slate-900/25 ring-4 ring-white/90 transition active:cursor-grabbing active:scale-95"
        >
          <NavIcon name="calculator" className="h-6 w-6" />
        </button>
      </div>
    );
  }

  const viewPos = panelPos ?? fabPos;

  return (
    <div
      ref={panelRef}
      className="fixed z-[46] select-none"
      style={{ left: viewPos.x, top: viewPos.y }}
    >
      <div className="flex max-h-[min(36rem,calc(100vh-2.5rem))] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b border-slate-100 px-4 py-3 active:cursor-grabbing"
          onPointerDown={(e) => startDrag(e, 'panel')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Calculator</p>
            <p className="text-xs text-slate-500">Drag header to move</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={closePanel}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Close calculator"
          >
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50 p-1.5">
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              tab === 'basic' ? 'bg-white text-brand shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
            onClick={() => setTab('basic')}
          >
            Basic
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-semibold transition',
              tab === 'gst' ? 'bg-white text-brand shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
            onClick={() => setTab('gst')}
          >
            GST
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-auto overflow-y-auto p-4">
          {tab === 'basic' ? <BasicCalculator /> : <GstCalculator />}
        </div>
      </div>
    </div>
  );
}
