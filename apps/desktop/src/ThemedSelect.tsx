import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ThemedSelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Prefer opening above the trigger (e.g. payment row at bottom of cart) */
  menuPlacement?: 'bottom' | 'top';
  'aria-label'?: string;
};

/**
 * Theme-aware select. Native &lt;select&gt; popups on Windows/Electron ignore
 * option colors in dark themes (white-on-white). Menu is portaled + fixed
 * so overflow parents cannot clip it.
 */
export function ThemedSelect({
  value,
  options,
  onChange,
  className = '',
  triggerClassName = '',
  placeholder = 'Select…',
  disabled,
  menuPlacement = 'bottom',
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxH: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const updateCoords = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const preferUp = menuPlacement === 'top';
    const spaceBelow = window.innerHeight - r.bottom - gap - 8;
    const spaceAbove = r.top - gap - 8;
    const openUp =
      preferUp ? spaceAbove >= 100 || spaceAbove > spaceBelow : spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxH = Math.min(224, Math.max(120, openUp ? spaceAbove : spaceBelow));
    if (openUp) {
      setCoords({
        bottom: window.innerHeight - r.top + gap,
        left: r.left,
        width: Math.max(r.width, 120),
        maxH,
      });
    } else {
      setCoords({
        top: r.bottom + gap,
        left: r.left,
        width: Math.max(r.width, 120),
        maxH,
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    const onScroll = () => updateCoords();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menuPlacement, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      const menu = document.getElementById(listId);
      if (menu?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, listId]);

  const menu =
    open && coords
      ? createPortal(
          <ul
            id={listId}
            role="listbox"
            className="rs-select-menu rs-select-menu-fixed"
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxH,
            }}
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value || '__empty'} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className="rs-select-option"
                    data-active={active}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`rs-select ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`rs-select-trigger ${triggerClassName}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rs-select-value">{selected?.label ?? placeholder}</span>
        <span className="rs-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
