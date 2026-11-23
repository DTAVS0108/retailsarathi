import type { HeldBill } from './types';

export function HeldTab({
  held,
  products,
  onResume,
  onFinalize,
  onCancel,
}: {
  held: HeldBill[];
  products?: Array<{ id: string; stock_qty: number }>;
  onResume: (bill: HeldBill) => void;
  onFinalize: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  function stockGap(b: HeldBill) {
    if (!products?.length || !b.lines?.length) return false;
    for (const l of b.lines) {
      const p = products.find((x) => x.id === l.productId);
      if (!p || p.stock_qty < (Number(l.quantity) || 1)) return true;
    }
    return false;
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="mb-3 text-lg font-bold" style={{ color: 'var(--rs-ink)' }}>
        Held drafts
      </h2>
      <p className="mb-4 text-sm" style={{ color: 'var(--rs-muted)' }}>
        Resume to edit, Finalize as-is when stock is OK, or Cancel to discard the draft.
      </p>
      {!held.length ? (
        <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
          No held bills
        </p>
      ) : (
        <ul className="space-y-2">
          {held.map((b) => {
            const gap = stockGap(b);
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{
                  background: 'var(--rs-surface)',
                  border: '1px solid var(--rs-border)',
                }}
              >
                <div>
                  <div className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                    {b.invoiceNumber}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                    {b.customer?.name || 'Walk-in'} · ₹{Number(b.grandTotal || 0).toLocaleString('en-IN')}
                  </div>
                  {gap ? (
                    <div className="mt-1 text-xs font-medium" style={{ color: 'var(--rs-warn)' }}>
                      Out of stock on some lines — resume to clean up, or cancel
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rs-btn-primary" onClick={() => onResume(b)}>
                    Resume
                  </button>
                  <button
                    type="button"
                    className="rs-btn-ghost disabled:opacity-50"
                    disabled={gap}
                    title={gap ? 'Resume and remove out-of-stock lines first' : undefined}
                    onClick={() => onFinalize(b.id)}
                  >
                    Finalize as-is
                  </button>
                  <button
                    type="button"
                    className="rs-btn-ghost text-xs"
                    style={{ color: 'var(--rs-danger)' }}
                    onClick={() => onCancel(b.id)}
                  >
                    Cancel draft
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
