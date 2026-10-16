'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './dashboard-ui';
import { NavIcon } from './nav-icons';

export type RowAction = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  tone?: 'default' | 'danger';
};

/** Menu height is unknown until rendered — this is a fast, good-enough estimate (no
    collision library in this codebase) for deciding whether to flip the panel upward. */
const ESTIMATED_ROW_HEIGHT = 38;
const MENU_MARGIN = 6;

export function RowActionsMenu({ actions, label = 'Row actions' }: { actions: RowAction[]; label?: string }) {
  const visible = actions.filter((a) => !a.hidden);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  function place() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = visible.length * ESTIMATED_ROW_HEIGHT + 8;
    const roomBelow = window.innerHeight - rect.bottom;
    const openUpward = roomBelow < estimatedHeight + MENU_MARGIN && rect.top > estimatedHeight;
    setPos({
      top: openUpward ? rect.top - MENU_MARGIN : rect.bottom + MENU_MARGIN,
      left: rect.right,
      openUpward,
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // Close on an actual user scroll gesture (wheel/touch), not the raw 'scroll' event — this
    // app sets `scroll-behavior: smooth` globally, so a click that auto-scrolls its target into
    // view keeps firing 'scroll' events for a few hundred ms after the click, which would catch
    // the menu we just opened and close it immediately. Wheel/touch only fire for a real
    // in-progress user gesture, so they don't have that race.
    document.addEventListener('wheel', close, { passive: true });
    document.addEventListener('touchmove', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('wheel', close);
      document.removeEventListener('touchmove', close);
      window.removeEventListener('resize', close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!visible.length) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
      >
        <NavIcon name="kebab" className="h-4 w-4" />
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={panelRef}
              id={listId}
              role="menu"
              style={{
                position: 'fixed',
                top: pos.openUpward ? undefined : pos.top,
                bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
                left: pos.left,
                transform: 'translateX(-100%)',
              }}
              className="z-[100] min-w-[10.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              {visible.map((a) => (
                <li key={a.key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={a.disabled}
                    onClick={() => {
                      setOpen(false);
                      a.onClick();
                    }}
                    className={cn(
                      'flex w-full items-center px-3.5 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                      a.tone === 'danger' ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-800 hover:bg-slate-50',
                    )}
                  >
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
