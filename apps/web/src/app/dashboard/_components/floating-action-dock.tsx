'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavIcon } from './nav-icons';

const POS_KEY = 'rs-fab-pos';
const FAB_SIZE = 56;

const QUICK_ACTIONS = [
  { href: '/dashboard/pos', label: 'New bill', icon: 'pos' as const, tone: 'bg-teal-600 hover:bg-teal-700' },
  { href: '/dashboard/stock-in', label: 'Stock in', icon: 'stock-in' as const, tone: 'bg-sky-600 hover:bg-sky-700' },
  { href: '/dashboard/scan', label: 'Scan sheet', icon: 'scan' as const, tone: 'bg-violet-600 hover:bg-violet-700' },
  { href: '/dashboard/returns', label: 'Return', icon: 'returns' as const, tone: 'bg-amber-600 hover:bg-amber-700' },
] as const;

const HIDDEN_ON = ['/dashboard/pos'];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function FloatingActionDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(
    null,
  );
  const fabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setPos(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) return;
    function onPointerDown(e: PointerEvent) {
      if (!fabRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const defaultPos = useCallback(() => {
    const margin = 16;
    const bottomNav = typeof window !== 'undefined' && window.innerWidth < 768 ? 88 : 24;
    return {
      x: Math.max(margin, window.innerWidth - FAB_SIZE - margin),
      y: Math.max(margin, window.innerHeight - FAB_SIZE - bottomNav - margin),
    };
  }, []);

  useEffect(() => {
    if (pos) return;
    function place() {
      setPos(defaultPos());
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [pos, defaultPos]);

  function persistPosition(next: { x: number; y: number }) {
    try {
      sessionStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!pos) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    const margin = 8;
    const bottomNav = window.innerWidth < 768 ? 88 : 24;
    const maxX = window.innerWidth - FAB_SIZE - margin;
    const maxY = window.innerHeight - FAB_SIZE - bottomNav - margin;
    const next = {
      x: clamp(drag.originX + dx, margin, Math.max(margin, maxX)),
      y: clamp(drag.originY + dy, margin, Math.max(margin, maxY)),
    };
    setPos(next);
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (pos) persistPosition(pos);
    if (drag && !drag.moved) {
      setOpen((v) => !v);
    }
  }

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  if (!pos) return null;

  return (
    <div
      ref={fabRef}
      className="fixed z-[45] touch-none select-none md:hidden"
      style={{ left: pos.x, top: pos.y, width: FAB_SIZE, height: FAB_SIZE }}
      aria-label="Quick actions"
    >
      <div
        className={`absolute bottom-full right-0 mb-3 flex flex-col items-end gap-2 transition-all duration-300 ease-out ${
          open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
      >
        {QUICK_ACTIONS.map((action, i) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2 rounded-full pl-3 pr-1 py-1 text-white shadow-lg transition-all duration-300 ${action.tone} ${
              open ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
            }`}
            style={{ transitionDelay: open ? `${i * 45}ms` : '0ms' }}
          >
            <span className="text-xs font-semibold">{action.label}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <NavIcon name={action.icon} className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Close quick actions' : 'Open quick actions — drag to move'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-teal-700 text-white shadow-xl shadow-teal-900/25 ring-4 ring-white/90 transition-transform duration-300 active:scale-95 ${
          open ? 'rotate-45 scale-100' : 'animate-fab-breathe'
        }`}
      >
        <NavIcon name="plus" className="relative h-6 w-6" />
      </button>
    </div>
  );
}
