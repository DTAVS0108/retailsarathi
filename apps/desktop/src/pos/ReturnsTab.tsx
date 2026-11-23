export function ReturnsTab({
  returnSearch,
  setReturnSearch,
  returnLines,
  setReturnLines,
  onFind,
  onSubmit,
  onSerialSearch,
}: {
  returnSearch: string;
  setReturnSearch: (v: string) => void;
  returnLines: Array<{ id: string; name: string; max: number; qty: string; selected: boolean }>;
  setReturnLines: React.Dispatch<
    React.SetStateAction<Array<{ id: string; name: string; max: number; qty: string; selected: boolean }>>
  >;
  onFind: () => void;
  onSubmit: () => void;
  onSerialSearch: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--rs-ink)' }}>
        Returns
      </h2>
      <p className="mb-4 text-sm" style={{ color: 'var(--rs-muted)' }}>
        Search by invoice number, UUID, or open IMEI search to find the original bill.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-lg px-3 py-2 text-sm"
          style={{
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            color: 'var(--rs-ink)',
            minHeight: 'var(--rs-touch)',
          }}
          placeholder="Invoice # or ID…"
          value={returnSearch}
          onChange={(e) => setReturnSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFind();
          }}
        />
        <button type="button" className="rs-btn-primary" onClick={onFind}>
          Load
        </button>
        <button type="button" className="rs-btn-secondary" onClick={onSerialSearch}>
          Search IMEI
        </button>
      </div>
      {returnLines.length ? (
        <>
          <ul className="mb-4 space-y-2">
            {returnLines.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
              >
                <label className="flex items-center gap-2" style={{ color: 'var(--rs-ink)' }}>
                  <input
                    type="checkbox"
                    checked={l.selected}
                    onChange={(e) =>
                      setReturnLines((prev) =>
                        prev.map((x) => (x.id === l.id ? { ...x, selected: e.target.checked } : x)),
                      )
                    }
                  />
                  {l.name}
                </label>
                <span style={{ color: 'var(--rs-muted)' }}>max {l.max}</span>
                <input
                  className="w-20 rounded border px-2 py-1"
                  style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}
                  value={l.qty}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Allow an in-progress empty/partial value while typing, but clamp any
                    // parseable number into [0, max] so an out-of-range qty can't be submitted.
                    const parsed = Number(raw);
                    const clamped =
                      raw === '' || Number.isNaN(parsed) ? raw : String(Math.min(Math.max(0, parsed), l.max));
                    setReturnLines((prev) =>
                      prev.map((x) => (x.id === l.id ? { ...x, qty: clamped } : x)),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
          <button type="button" className="rs-btn-primary" onClick={onSubmit}>
            Create credit note
          </button>
        </>
      ) : null}
    </div>
  );
}
