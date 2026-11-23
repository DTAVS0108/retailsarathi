import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ThemedSelect } from './ThemedSelect';

const GST_SLABS = [0, 5, 12, 18, 28] as const;
const CALC_FAB_KEY = 'rs-desktop-calc-fab';
const CALC_PANEL_KEY = 'rs-desktop-calc-panel';
const FAB_SIZE = 56;
const FAB_EDGE_X = 28;
const FAB_EDGE_Y = 28;
const PANEL_EDGE = 16;

type Tab = 'basic' | 'gst';
type GstField = 'taxable' | 'final';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatCalc(n: number) {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1e10) / 1e10);
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

function CalcIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="7" y="5" width="10" height="4" rx="1" fill="currentColor" opacity="0.35" />
      <circle cx="8.5" cy="13" r="1.1" fill="currentColor" />
      <circle cx="12" cy="13" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="13" r="1.1" fill="currentColor" />
      <circle cx="8.5" cy="17" r="1.1" fill="currentColor" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
      <circle cx="15.5" cy="17" r="1.1" fill="currentColor" />
    </svg>
  );
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
    if (isFresh || prev === '0') next = d === '.' ? '0.' : d;
    else if (d === '.' && prev.includes('.')) return;
    else if (prev.replace('.', '').replace('-', '').length >= 12) return;
    else next = prev + d;
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

  const keys: Array<{ label: string; onClick: () => void; kind?: 'op' | 'eq' | 'fn'; span?: boolean }> = [
    { label: 'AC', onClick: clearAll, kind: 'fn' },
    { label: '±', onClick: toggleSign, kind: 'fn' },
    { label: '%', onClick: percent, kind: 'fn' },
    { label: '÷', onClick: () => applyOp('/'), kind: 'op' },
    { label: '7', onClick: () => inputDigit('7') },
    { label: '8', onClick: () => inputDigit('8') },
    { label: '9', onClick: () => inputDigit('9') },
    { label: '×', onClick: () => applyOp('*'), kind: 'op' },
    { label: '4', onClick: () => inputDigit('4') },
    { label: '5', onClick: () => inputDigit('5') },
    { label: '6', onClick: () => inputDigit('6') },
    { label: '−', onClick: () => applyOp('-'), kind: 'op' },
    { label: '1', onClick: () => inputDigit('1') },
    { label: '2', onClick: () => inputDigit('2') },
    { label: '3', onClick: () => inputDigit('3') },
    { label: '+', onClick: () => applyOp('+'), kind: 'op' },
    { label: '0', onClick: () => inputDigit('0'), span: true },
    { label: '.', onClick: () => inputDigit('.') },
    { label: '=', onClick: equals, kind: 'eq' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p
          className="truncate text-right text-3xl font-semibold tabular-nums"
          style={{ color: 'var(--rs-ink)' }}
          title={display}
        >
          {display}
        </p>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium"
          style={{ color: 'var(--rs-muted)' }}
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
            className={`min-h-11 rounded-xl text-base font-semibold transition active:scale-95 ${k.span ? 'col-span-2' : ''}`}
            style={
              k.kind === 'op' || k.kind === 'eq'
                ? { background: 'var(--rs-accent)', color: '#fff' }
                : k.kind === 'fn'
                  ? { background: 'var(--rs-bg-deep)', color: 'var(--rs-ink)' }
                  : { background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }
            }
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
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
      <label className="block space-y-1.5 text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
        <span>GST slab</span>
        <ThemedSelect
          aria-label="GST slab"
          value={String(slab)}
          options={GST_SLABS.map((r) => ({ value: String(r), label: `${r}% GST` }))}
          onChange={(v) => onSlabChange(Number(v) as (typeof GST_SLABS)[number])}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
          <span>Taxable (excl. GST)</span>
          <input
            className="rs-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={taxable}
            onChange={(e) => onTaxableChange(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
          <span>Final (incl. GST)</span>
          <input
            className="rs-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={finalAmt}
            onChange={(e) => onFinalChange(e.target.value)}
          />
        </label>
      </div>

      <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
        Edit either amount — the other updates automatically.
      </p>

      <div
        className="rounded-xl border p-3 text-sm"
        style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
      >
        {(
          [
            ['Taxable', result.taxable],
            [`CGST (${halfSlab}%)`, result.cgst],
            [`SGST (${halfSlab}%)`, result.sgst],
            [`Total GST (${slab}%)`, result.gst],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="mt-1.5 flex justify-between gap-2 first:mt-0" style={{ color: 'var(--rs-muted)' }}>
            <span>{label}</span>
            <span className="font-medium tabular-nums" style={{ color: 'var(--rs-ink)' }}>
              {money(value)}
            </span>
          </div>
        ))}
        <div
          className="mt-2 flex justify-between gap-2 border-t pt-2 font-semibold"
          style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-ink)' }}
        >
          <span>Final</span>
          <span className="tabular-nums" style={{ color: 'var(--rs-accent)' }}>
            {money(result.final)}
          </span>
        </div>
      </div>
    </div>
  );
}

export const OPEN_CALCULATOR_EVENT = 'rs:open-calculator';

export function requestOpenCalculator() {
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
    return rawX + FAB_SIZE / 2 < window.innerWidth / 2 ? leftX : rightX;
  }

  function clampFab(p: { x: number; y: number }) {
    return {
      x: snapFabX(p.x),
      y: clamp(p.y, FAB_EDGE_Y, Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - FAB_EDGE_Y)),
    };
  }

  function clampPanel(p: { x: number; y: number }, w: number, h: number) {
    return {
      x: clamp(p.x, PANEL_EDGE, Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE)),
      y: clamp(p.y, PANEL_EDGE, Math.max(PANEL_EDGE, window.innerHeight - h - PANEL_EDGE)),
    };
  }

  const defaultFabPos = useCallback(
    () => ({
      x: Math.max(FAB_EDGE_X, window.innerWidth - FAB_SIZE - FAB_EDGE_X),
      y: Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - FAB_EDGE_Y),
    }),
    [],
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CALC_FAB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setFabPos(clampFab(parsed));
      }
      const panelRaw = sessionStorage.getItem(CALC_PANEL_KEY);
      if (panelRaw) {
        const parsed = JSON.parse(panelRaw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setPanelPos(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (fabPos) return;
    setFabPos(defaultFabPos());
  }, [fabPos, defaultFabPos]);

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
    sessionStorage.setItem(CALC_PANEL_KEY, JSON.stringify(next));
    setOpen(true);
  }

  function openFromHeader() {
    if (openRef.current) {
      setOpen(false);
      return;
    }
    const w = Math.min(352, window.innerWidth - PANEL_EDGE * 2);
    const h = Math.min(520, window.innerHeight - PANEL_EDGE * 2);
    const next = clampPanel(
      {
        x: Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE),
        y: PANEL_EDGE + 56,
      },
      w,
      h,
    );
    setPanelPos(next);
    sessionStorage.setItem(CALC_PANEL_KEY, JSON.stringify(next));
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
      sessionStorage.setItem(CALC_PANEL_KEY, JSON.stringify(next));
      return next;
    });
  }, [open, tab]);

  function boundsFor(mode: 'fab' | 'panel') {
    const el = panelRef.current;
    if (mode === 'fab') {
      return {
        minX: FAB_EDGE_X,
        minY: FAB_EDGE_Y,
        maxX: Math.max(FAB_EDGE_X, window.innerWidth - FAB_SIZE - FAB_EDGE_X),
        maxY: Math.max(FAB_EDGE_Y, window.innerHeight - FAB_SIZE - FAB_EDGE_Y),
      };
    }
    const w = Math.min(el?.offsetWidth || 352, window.innerWidth - PANEL_EDGE * 2);
    const h = Math.min(el?.offsetHeight || 420, window.innerHeight - PANEL_EDGE * 2);
    return {
      minX: PANEL_EDGE,
      minY: PANEL_EDGE,
      maxX: Math.max(PANEL_EDGE, window.innerWidth - w - PANEL_EDGE),
      maxY: Math.max(PANEL_EDGE, window.innerHeight - h - PANEL_EDGE),
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
      sessionStorage.setItem(CALC_FAB_KEY, JSON.stringify(finalPos));
      if (!drag.moved) openFromFab();
      return;
    }
    if (drag?.mode === 'panel') {
      const b = boundsFor('panel');
      const raw = drag.last ?? panelPos;
      if (!raw) return;
      const finalPos = { x: clamp(raw.x, b.minX, b.maxX), y: clamp(raw.y, b.minY, b.maxY) };
      setPanelPos(finalPos);
      sessionStorage.setItem(CALC_PANEL_KEY, JSON.stringify(finalPos));
    }
  }

  if (!fabPos) return null;

  if (!open) {
    if (!showFab) return null;
    return (
      <div className="fixed z-[60] select-none touch-none" style={{ left: fabPos.x, top: fabPos.y }}>
        <button
          type="button"
          aria-label="Open calculator"
          onPointerDown={(e) => startDrag(e, 'fab')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          className="flex h-14 w-14 cursor-grab items-center justify-center rounded-full text-white shadow-xl transition active:scale-95"
          style={{
            background: 'linear-gradient(145deg, color-mix(in srgb, var(--rs-accent) 85%, #111), var(--rs-accent))',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <CalcIcon className="h-6 w-6" />
        </button>
      </div>
    );
  }

  const viewPos = panelPos ?? fabPos;

  return (
    <div ref={panelRef} className="fixed z-[60] select-none" style={{ left: viewPos.x, top: viewPos.y }}>
      <div
        className="flex max-h-[min(36rem,calc(100vh-2.5rem))] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden border shadow-2xl"
        style={{
          borderRadius: 'var(--rs-radius)',
          borderColor: 'var(--rs-border)',
          background: 'var(--rs-surface)',
          boxShadow: 'var(--rs-shadow)',
        }}
      >
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b px-4 py-3 active:cursor-grabbing"
          style={{ borderColor: 'var(--rs-border)' }}
          onPointerDown={(e) => startDrag(e, 'panel')}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
              Calculator
            </p>
            <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
              Drag header to move
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ color: 'var(--rs-muted)' }}
            onClick={() => setOpen(false)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Close calculator"
          >
            ✕
          </button>
        </div>

        <div
          className="grid shrink-0 grid-cols-2 gap-1 border-b p-1.5"
          style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
        >
          {(['basic', 'gst'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-semibold transition"
              style={
                tab === id
                  ? { background: 'var(--rs-surface)', color: 'var(--rs-accent)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
                  : { color: 'var(--rs-muted)' }
              }
              onClick={() => setTab(id)}
            >
              {id === 'basic' ? 'Basic' : 'GST'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'basic' ? <BasicCalculator /> : <GstCalculator />}
        </div>
      </div>
    </div>
  );
}
