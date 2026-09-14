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
import { Button } from '@retail-sarathi/ui';

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** When true, only an OK button is shown (alert-style). */
  alertOnly?: boolean;
};

type ConfirmRequest = ConfirmOptions & {
  id: string;
  resolve: (value: boolean) => void;
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: Omit<ConfirmOptions, 'alertOnly' | 'cancelLabel'> | string) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

let imperativeApi: ConfirmApi | null = null;

function normalizeOptions(input: ConfirmOptions | string): ConfirmOptions {
  if (typeof input === 'string') return { message: input };
  return input;
}

/** Imperative confirm — drop-in for window.confirm / alert. */
export const confirmDialog: ConfirmApi = {
  confirm: (input) => {
    if (!imperativeApi) {
      console.warn('[confirmDialog] ConfirmProvider is not mounted yet');
      return Promise.resolve(false);
    }
    return imperativeApi.confirm(input);
  },
  alert: async (input) => {
    if (!imperativeApi) {
      console.warn('[confirmDialog] ConfirmProvider is not mounted yet');
      return;
    }
    await imperativeApi.alert(input);
  },
};

export function useConfirmDialog() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmDialog must be used within ConfirmProvider');
  return ctx;
}

function ConfirmModal({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const tone = request.tone ?? (request.alertOnly ? 'default' : 'danger');
  const title =
    request.title ??
    (request.alertOnly ? 'Notice' : tone === 'danger' ? 'Please confirm' : 'Confirm');
  const confirmLabel =
    request.confirmLabel ?? (request.alertOnly ? 'OK' : tone === 'danger' ? 'Confirm' : 'Continue');
  const cancelLabel = request.cancelLabel ?? 'Cancel';

  useEffect(() => {
    const t = window.setTimeout(() => {
      const btn = dialogRef.current?.querySelector<HTMLButtonElement>('[data-confirm-primary]');
      btn?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [request.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(request.alertOnly ? true : false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, request.alertOnly]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/45"
        aria-label="Dismiss"
        onClick={() => onClose(request.alertOnly ? true : false)}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`confirm-title-${request.id}`}
        aria-describedby={`confirm-desc-${request.id}`}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="px-5 py-5 sm:px-6">
          <div className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold',
                tone === 'danger' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-800',
              )}
              aria-hidden
            >
              {tone === 'danger' ? '!' : 'i'}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={`confirm-title-${request.id}`} className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              <p
                id={`confirm-desc-${request.id}`}
                className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600"
              >
                {request.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 sm:px-6">
          {request.alertOnly ? null : (
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={tone === 'danger' && !request.alertOnly ? 'danger' : 'primary'}
            data-confirm-primary
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);
  const active = queue[0] ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeActive = useCallback((confirmed: boolean) => {
    setQueue((prev) => {
      const [current, ...rest] = prev;
      if (current) current.resolve(confirmed);
      return rest;
    });
  }, []);

  const enqueue = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      seq.current += 1;
      const id = `confirm-${Date.now()}-${seq.current}`;
      setQueue((prev) => [...prev, { ...options, id, resolve }]);
    });
  }, []);

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (input) => enqueue(normalizeOptions(input)),
      alert: async (input) => {
        const options = normalizeOptions(input);
        await enqueue({
          ...options,
          alertOnly: true,
          tone: options.tone ?? 'default',
          confirmLabel: options.confirmLabel ?? 'OK',
        });
      },
    }),
    [enqueue],
  );

  useEffect(() => {
    imperativeApi = api;
    return () => {
      if (imperativeApi === api) imperativeApi = null;
    };
  }, [api]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {mounted && active
        ? createPortal(<ConfirmModal request={active} onClose={closeActive} />, document.body)
        : null}
    </ConfirmContext.Provider>
  );
}
