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

export type ToastTone = 'success' | 'error' | 'info' | 'warn';

/** Default auto-hide for all toasts / mirrored status messages. */
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

/** Imperative API — usable from any desktop module once ToastProvider is mounted. */
export const toast: ToastApi = {
  push: (input) => {
    if (!imperativeApi) {
      console.warn('[toast] ToastProvider is not mounted yet');
      return '';
    }
    return imperativeApi.push(input);
  },
  success: (message, title) => toast.push({ tone: 'success', message, title: title ?? 'Done' }),
  error: (message, title) => toast.push({ tone: 'error', message, title: title ?? 'Error' }),
  info: (message, title) => toast.push({ tone: 'info', message, title: title ?? 'Info' }),
  warn: (message, title) => toast.push({ tone: 'warn', message, title: title ?? 'Check' }),
  dismiss: (id) => imperativeApi?.dismiss(id),
  clear: () => imperativeApi?.clear(),
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Infer tone from common POS status strings. */
export function inferToastTone(message: string): ToastTone {
  const m = message.toLowerCase();
  if (
    /insufficient|out of stock|failed|error|invalid|must equal|exceeded|not found|cannot|can't|unavailable|denied|rejected|required/.test(
      m,
    )
  ) {
    return 'error';
  }
  if (/removed|review|warning|skip|cancelled|canceled|no sellable|check/.test(m)) {
    return 'warn';
  }
  if (
    /held|finalized|saved|synced|created|added|resumed|cleared|exported|updated|printed|success|sent|opened|preview|registered|restored|archived|adjusted/.test(
      m,
    )
  ) {
    return 'success';
  }
  return 'info';
}

/**
 * Mirror a status / error string into a toast whenever it becomes non-empty.
 * Clears the source string after TOAST_AUTO_HIDE_MS when `clear` is provided
 * (so inline banners disappear with the toast).
 *
 * @example
 * useToastMessage(msg, setMsg);
 * useToastMessage(error, 'error', setError);
 */
export function useToastMessage(
  message: string,
  toneOrClear?: ToastTone | ((next: string) => void),
  clearMaybe?: (next: string) => void,
) {
  const tone = typeof toneOrClear === 'function' ? undefined : toneOrClear;
  const clear = typeof toneOrClear === 'function' ? toneOrClear : clearMaybe;
  const last = useRef('');
  useEffect(() => {
    const text = message.trim();
    if (!text) {
      last.current = '';
      return;
    }
    if (text === last.current) return;
    last.current = text;
    toast.push({
      tone: tone ?? inferToastTone(text),
      message: text,
      durationMs: TOAST_AUTO_HIDE_MS,
    });
    if (!clear) return;
    const timer = window.setTimeout(() => {
      clear('');
      last.current = '';
    }, TOAST_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [message, tone, clear]);
}

function toneColors(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return {
        border: 'color-mix(in srgb, var(--rs-success) 35%, var(--rs-border))',
        bar: 'var(--rs-success)',
        iconBg: 'color-mix(in srgb, var(--rs-success) 14%, var(--rs-surface))',
        iconFg: 'var(--rs-success)',
        glyph: '✓',
      };
    case 'error':
      return {
        border: 'color-mix(in srgb, var(--rs-danger) 40%, var(--rs-border))',
        bar: 'var(--rs-danger)',
        iconBg: 'color-mix(in srgb, var(--rs-danger) 14%, var(--rs-surface))',
        iconFg: 'var(--rs-danger)',
        glyph: '!',
      };
    case 'warn':
      return {
        border: 'color-mix(in srgb, var(--rs-warn) 40%, var(--rs-border))',
        bar: 'var(--rs-warn)',
        iconBg: 'color-mix(in srgb, var(--rs-warn) 16%, var(--rs-surface))',
        iconFg: 'var(--rs-warn)',
        glyph: '!',
      };
    default:
      return {
        border: 'var(--rs-border)',
        bar: 'var(--rs-accent)',
        iconBg: 'var(--rs-accent-soft)',
        iconFg: 'var(--rs-accent)',
        glyph: 'i',
      };
  }
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const colors = toneColors(item.tone);
  const duration = item.durationMs ?? TOAST_AUTO_HIDE_MS;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, item.id, onDismiss]);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
      className="pointer-events-auto relative flex w-[min(100vw-1.5rem,22rem)] gap-3 overflow-hidden border p-3.5 shadow-lg"
      style={{
        borderRadius: 'var(--rs-radius)',
        background: 'var(--rs-surface)',
        borderColor: colors.border,
        color: 'var(--rs-ink)',
        boxShadow: 'var(--rs-shadow)',
        animation: 'rs-toast-in 180ms ease-out',
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold"
        style={{
          borderRadius: 'calc(var(--rs-radius) - 4px)',
          background: colors.iconBg,
          color: colors.iconFg,
        }}
      >
        {colors.glyph}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {item.title ? (
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
            {item.title}
          </p>
        ) : null}
        <p className="text-sm font-semibold leading-snug">{item.message}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 self-start rounded px-1.5 text-lg leading-none opacity-60 hover:opacity-100"
        style={{ color: 'var(--rs-muted)' }}
        onClick={() => onDismiss(item.id)}
      >
        ×
      </button>
      <span
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
        style={{
          background: colors.bar,
          animation: `rs-toast-progress ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const push = useCallback((input: Omit<ToastItem, 'id'> & { id?: string }) => {
    const id = input.id ?? `toast-${Date.now()}-${++seq.current}`;
    setItems((prev) => [...prev.slice(-4), { ...input, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (message, title) => push({ tone: 'success', message, title: title ?? 'Done' }),
      error: (message, title) => push({ tone: 'error', message, title: title ?? 'Error' }),
      info: (message, title) => push({ tone: 'info', message, title: title ?? 'Info' }),
      warn: (message, title) => push({ tone: 'warn', message, title: title ?? 'Check' }),
      dismiss,
      clear,
    }),
    [push, dismiss, clear],
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
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2">
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
