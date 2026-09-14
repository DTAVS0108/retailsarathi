'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type ToastTone = 'success' | 'error' | 'info' | 'warn';

/** Default auto-hide for all toasts. */
export const TOAST_AUTO_HIDE_MS = 3000;

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastApi = {
  push: (input: Omit<ToastItem, 'id'> & { id?: string }) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warn: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let imperativeApi: ToastApi | null = null;

/** Imperative toast API — works from any client module without hooks. */
export const toast: ToastApi = {
  push: (input) => {
    if (!imperativeApi) {
      console.warn('[toast] ToastProvider is not mounted yet');
      return '';
    }
    return imperativeApi.push(input);
  },
  success: (message, title) => toast.push({ tone: 'success', message, title: title ?? 'Success' }),
  error: (message, title) => toast.push({ tone: 'error', message, title: title ?? 'Something went wrong' }),
  info: (message, title) => toast.push({ tone: 'info', message, title: title ?? 'Info' }),
  warn: (message, title) => toast.push({ tone: 'warn', message, title: title ?? 'Please check' }),
  dismiss: (id) => imperativeApi?.dismiss(id),
  clear: () => imperativeApi?.clear(),
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

function toneStyles(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return {
        wrap: 'border-emerald-200 bg-white text-emerald-950 shadow-emerald-900/10',
        bar: 'bg-emerald-500',
        icon: 'bg-emerald-50 text-emerald-700',
        glyph: '✓',
      };
    case 'error':
      return {
        wrap: 'border-red-200 bg-white text-red-950 shadow-red-900/10',
        bar: 'bg-red-500',
        icon: 'bg-red-50 text-red-700',
        glyph: '!',
      };
    case 'warn':
      return {
        wrap: 'border-amber-200 bg-white text-amber-950 shadow-amber-900/10',
        bar: 'bg-amber-500',
        icon: 'bg-amber-50 text-amber-800',
        glyph: '⚠',
      };
    default:
      return {
        wrap: 'border-teal-200 bg-white text-slate-900 shadow-teal-900/10',
        bar: 'bg-brand',
        icon: 'bg-teal-50 text-brand',
        glyph: 'i',
      };
  }
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const styles = toneStyles(item.tone);
  const duration = item.durationMs ?? TOAST_AUTO_HIDE_MS;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, item.id, onDismiss]);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto relative flex w-[min(100vw-1.5rem,24rem)] gap-3 overflow-hidden rounded-2xl border p-3.5 shadow-lg animate-toast-in',
        styles.wrap,
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold', styles.icon)}>
        {styles.glyph}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {item.title ? <p className="text-sm font-semibold leading-5">{item.title}</p> : null}
        <p className={cn('text-sm leading-5 text-slate-600', item.title ? 'mt-0.5' : 'font-medium text-slate-800')}>
          {item.message}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
        className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
      >
        ✕
      </button>
      <span
        className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left animate-toast-progress', styles.bar)}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const push = useCallback((input: Omit<ToastItem, 'id'> & { id?: string }) => {
    seq.current += 1;
    const id = input.id ?? `toast-${Date.now()}-${seq.current}`;
    const next: ToastItem = {
      id,
      tone: input.tone,
      title: input.title,
      message: input.message,
      durationMs: input.durationMs,
    };
    setItems((prev) => [...prev.slice(-4), next]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (message, title) => push({ tone: 'success', message, title: title ?? 'Success' }),
      error: (message, title) => push({ tone: 'error', message, title: title ?? 'Something went wrong' }),
      info: (message, title) => push({ tone: 'info', message, title: title ?? 'Info' }),
      warn: (message, title) => push({ tone: 'warn', message, title: title ?? 'Please check' }),
      dismiss,
      clear,
    }),
    [clear, dismiss, push],
  );

  useEffect(() => {
    imperativeApi = api;
    return () => {
      if (imperativeApi === api) imperativeApi = null;
    };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-end gap-2 p-3 sm:p-4">
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

/** Parse API / unknown errors into a short user-facing string. */
export function feedbackMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}
