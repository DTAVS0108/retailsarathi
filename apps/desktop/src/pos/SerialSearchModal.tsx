import { useEffect, useState } from 'react';
import type { ApiFetch } from '../api';

export interface SerialHit {
  serialNumber: string;
  status: string;
  productId: string;
  productName: string;
  productSku: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

export function SerialSearchModal({
  open,
  onClose,
  token,
  apiFetch,
  onLoadReturn,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  apiFetch: ApiFetch;
  onLoadReturn?: (invoiceId: string, invoiceNumber?: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SerialHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void (async () => {
        if (q.trim().length < 3) {
          setHits([]);
          return;
        }
        setBusy(true);
        setErr('');
        try {
          const res = await apiFetch<SerialHit[]>(
            token,
            `/products/serials/search?q=${encodeURIComponent(q.trim())}`,
          );
          setHits(Array.isArray(res) ? res : []);
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
          setHits([]);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [q, open, token, apiFetch]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[10vh]"
      style={{ background: 'color-mix(in srgb, var(--rs-ink) 40%, transparent)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-4 shadow-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold" style={{ color: 'var(--rs-ink)' }}>
            Serial / IMEI search
          </h3>
          <button type="button" className="rs-btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          autoFocus
          className="mb-3 w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: '1px solid var(--rs-border)', background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}
          placeholder="Type IMEI or serial…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {busy ? <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>Searching…</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <ul className="max-h-80 space-y-2 overflow-auto">
          {hits.map((h) => (
            <li
              key={`${h.productId}-${h.serialNumber}`}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}
            >
              <div className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {h.serialNumber}
              </div>
              <div style={{ color: 'var(--rs-muted)' }}>
                {h.productName} · {h.productSku} · {h.status}
              </div>
              {h.invoiceNumber ? (
                <div className="mt-1 flex items-center gap-2">
                  <span style={{ color: 'var(--rs-muted)' }}>Invoice {h.invoiceNumber}</span>
                  {onLoadReturn && h.invoiceId ? (
                    <button
                      type="button"
                      className="text-xs font-semibold underline"
                      style={{ color: 'var(--rs-accent)' }}
                      onClick={() => {
                        onLoadReturn(h.invoiceId!, h.invoiceNumber);
                        onClose();
                      }}
                    >
                      Open return
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
          {!busy && q.trim().length >= 3 && hits.length === 0 && !err ? (
            <li className="text-sm" style={{ color: 'var(--rs-muted)' }}>
              No serials matched
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
