import { useEffect, useState } from 'react';
import type { ApiFetch } from '../api';

interface DayEnd {
  date: string;
  billCount: number;
  finalizedCount: number;
  grossSales: number;
  paymentBreakdown: Record<string, number>;
  cashTotal: number;
  creditTotal: number;
  returnCount: number;
  returnTotal: number;
}

export function ShiftCloseModal({
  open,
  onClose,
  token,
  apiFetch,
  onPrint,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  apiFetch: ApiFetch;
  onPrint: (text: string) => Promise<void>;
}) {
  const [data, setData] = useState<DayEnd | null>(null);
  const [cashCounted, setCashCounted] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    setBusy(true);
    setErr('');
    void apiFetch<DayEnd>(token, '/reports/day-end')
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [open, token, apiFetch]);

  if (!open) return null;

  const counted = Number(cashCounted);
  const variance =
    data && Number.isFinite(counted) && cashCounted !== ''
      ? Math.round((counted - data.cashTotal) * 100) / 100
      : null;

  async function printSummary() {
    if (!data) return;
    const lines = [
      '=== DAY-END / SHIFT CLOSE ===',
      `Date: ${data.date}`,
      `Bills: ${data.billCount} (finalized ${data.finalizedCount})`,
      `Gross sales: Rs ${data.grossSales.toFixed(2)}`,
      `Cash: Rs ${data.cashTotal.toFixed(2)}`,
      `Credit: Rs ${data.creditTotal.toFixed(2)}`,
      ...Object.entries(data.paymentBreakdown).map(
        ([k, v]) => `  ${k}: Rs ${Number(v).toFixed(2)}`,
      ),
      `Returns: ${data.returnCount} / Rs ${data.returnTotal.toFixed(2)}`,
      cashCounted !== '' ? `Cash counted: Rs ${counted.toFixed(2)}` : '',
      variance != null ? `Variance: Rs ${variance.toFixed(2)}` : '',
      '=============================',
    ].filter(Boolean);
    await onPrint(lines.join('\n'));
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--rs-ink) 40%, transparent)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 shadow-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold" style={{ color: 'var(--rs-ink)' }}>
            Shift summary
          </h3>
          <button type="button" className="rs-btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mb-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
          A printable cash/sales summary for the day — this doesn't lock billing or close a
          shift on the server.
        </p>
        {busy ? <p style={{ color: 'var(--rs-muted)' }}>Loading…</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {data ? (
          <div className="space-y-2 text-sm" style={{ color: 'var(--rs-ink)' }}>
            <p>
              <strong>{data.date}</strong> · {data.finalizedCount} finalized / {data.billCount} bills
            </p>
            <p>Gross sales: ₹{data.grossSales.toLocaleString('en-IN')}</p>
            <p>Cash expected: ₹{data.cashTotal.toLocaleString('en-IN')}</p>
            <p>Credit: ₹{data.creditTotal.toLocaleString('en-IN')}</p>
            <div className="rounded-lg p-2" style={{ background: 'var(--rs-surface-2)' }}>
              {Object.entries(data.paymentBreakdown).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span>₹{Number(v).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <p>
              Returns: {data.returnCount} · ₹{data.returnTotal.toLocaleString('en-IN')}
            </p>
            <label className="block text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
              Cash counted in drawer
              <input
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  border: '1px solid var(--rs-border)',
                  background: 'var(--rs-bg)',
                  color: 'var(--rs-ink)',
                }}
                value={cashCounted}
                onChange={(e) => setCashCounted(e.target.value)}
                inputMode="decimal"
              />
            </label>
            {variance != null ? (
              <p style={{ color: variance === 0 ? '#047857' : '#b45309' }}>
                Variance: ₹{variance.toLocaleString('en-IN')}
              </p>
            ) : null}
            <button type="button" className="rs-btn-primary w-full" onClick={() => void printSummary()}>
              Print shift summary
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
