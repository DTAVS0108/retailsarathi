import type { CartLine, Customer, PayRow } from './types';

const EDIT_GRACE_MS = 5 * 60 * 1000;

export { EDIT_GRACE_MS };

export interface BillPreviewProps {
  open: boolean;
  onClose: () => void;
  onConfirmPrint: () => void;
  onConfirmNoPrint: () => void;
  busy?: boolean;
  customer?: Customer | null;
  lines: CartLine[];
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  tradeInTotal: number;
  redeem: number;
  payable: number;
  isIgst: boolean;
  payments: PayRow[];
  notes?: string;
}

export function BillPreviewModal({
  open,
  onClose,
  onConfirmPrint,
  onConfirmNoPrint,
  busy,
  customer,
  lines,
  subtotal,
  totalCgst,
  totalSgst,
  totalIgst,
  tradeInTotal,
  redeem,
  payable,
  isIgst,
  payments,
  notes,
}: BillPreviewProps) {
  if (!open) return null;

  const regular = lines.filter((l) => !l.isTradeIn);
  const tradeIns = lines.filter((l) => l.isTradeIn);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--rs-ink) 50%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Bill preview"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--rs-border)' }}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--rs-ink)' }}>
            Preview bill
          </h3>
          <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
            Check lines and totals before submitting. After print you get 5 minutes to undo &amp; edit
            if something is wrong.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}
          >
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
              Customer
            </p>
            <p className="font-medium" style={{ color: 'var(--rs-ink)' }}>
              {customer ? `${customer.name} · ${customer.phone}` : 'Walk-in'}
            </p>
            {customer?.gstin ? (
              <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                GSTIN {customer.gstin}
              </p>
            ) : null}
          </div>

          <ul className="space-y-1.5">
            {regular.map((l) => (
              <li
                key={l.product.id}
                className="flex justify-between gap-2 rounded-lg px-2 py-1.5"
                style={{ background: 'var(--rs-surface-2)' }}
              >
                <span className="min-w-0 truncate" style={{ color: 'var(--rs-ink)' }}>
                  {l.product.name} × {l.quantity}
                  {l.serialNumbers.length ? (
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--rs-muted)' }}>
                      ({l.serialNumbers.join(', ')})
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium">
                  ₹{Math.max(0, l.unitPrice * l.quantity - l.discount).toFixed(2)}
                </span>
              </li>
            ))}
            {tradeIns.map((l) => (
              <li
                key={`ti-${l.product.id}-${l.tradeInLabel}`}
                className="flex justify-between gap-2 rounded-lg px-2 py-1.5"
                style={{ color: 'var(--rs-warn)' }}
              >
                <span>↩ {l.product.name}</span>
                <span>−₹{Math.abs(l.unitPrice * l.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-1 border-t pt-2" style={{ borderColor: 'var(--rs-border)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--rs-muted)' }}>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {isIgst ? (
              <div className="flex justify-between">
                <span style={{ color: 'var(--rs-muted)' }}>IGST</span>
                <span>₹{totalIgst.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--rs-muted)' }}>CGST</span>
                  <span>₹{totalCgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--rs-muted)' }}>SGST</span>
                  <span>₹{totalSgst.toFixed(2)}</span>
                </div>
              </>
            )}
            {tradeInTotal > 0 ? (
              <div className="flex justify-between" style={{ color: 'var(--rs-warn)' }}>
                <span>Trade-in</span>
                <span>−₹{tradeInTotal.toFixed(2)}</span>
              </div>
            ) : null}
            {redeem > 0 ? (
              <div className="flex justify-between" style={{ color: 'var(--rs-success, #047857)' }}>
                <span>Loyalty</span>
                <span>−₹{redeem.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <span>Payable</span>
              <span style={{ color: 'var(--rs-accent)' }}>₹{payable.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
              Payments
            </p>
            {payments
              .filter((p) => Number(p.amount) > 0)
              .map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span>₹{Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
          </div>

          {notes ? (
            <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
              Notes: {notes}
            </p>
          ) : null}
        </div>

        <div
          className="flex flex-col gap-2 border-t p-4"
          style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
        >
          <button
            type="button"
            className="rs-btn-primary w-full"
            disabled={busy}
            onClick={onConfirmPrint}
          >
            {busy ? 'Submitting…' : 'Confirm & print'}
          </button>
          <button
            type="button"
            className="rs-btn-secondary w-full"
            disabled={busy}
            onClick={onConfirmNoPrint}
          >
            Confirm without print
          </button>
          <button type="button" className="rs-btn-secondary w-full text-sm" disabled={busy} onClick={onClose}>
            Back to edit
          </button>
        </div>
      </div>
    </div>
  );
}

export interface EditGraceState {
  invoiceId: string;
  invoiceNumber: string;
  expiresAt: number;
  snapshot: {
    cart: CartLine[];
    customerId: string;
    notes: string;
    payments: PayRow[];
    loyaltyRedeem: string;
  };
}

export function EditGraceBanner({
  grace,
  now,
  onEdit,
  onDismiss,
  busy,
}: {
  grace: EditGraceState;
  now: number;
  onEdit: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const left = Math.max(0, grace.expiresAt - now);
  if (left <= 0) return null;
  const secs = Math.ceil(left / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(1, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
      style={{
        background: 'color-mix(in srgb, var(--rs-warn) 18%, var(--rs-surface))',
        borderBottom: '1px solid var(--rs-border)',
        color: 'var(--rs-ink)',
      }}
    >
      <span>
        Saved <strong>{grace.invoiceNumber}</strong> — edit window{' '}
        <strong>
          {mm}:{ss}
        </strong>
      </span>
      <div className="flex gap-2">
        <button type="button" className="rs-btn-primary text-xs" style={{ minHeight: 32 }} disabled={busy} onClick={onEdit}>
          Undo &amp; edit
        </button>
        <button type="button" className="rs-btn-secondary text-xs" style={{ minHeight: 32 }} onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  );
}
