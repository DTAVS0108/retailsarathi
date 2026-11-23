const ROWS: Array<{ keys: string; action: string }> = [
  { keys: 'F1', action: 'Focus barcode' },
  { keys: 'F2', action: 'Browse products' },
  { keys: 'F3', action: 'Hold bill' },
  { keys: 'F5', action: 'Held bills tab' },
  { keys: 'F6', action: 'Serial / IMEI search' },
  { keys: 'F7', action: 'Returns tab' },
  { keys: 'F8', action: 'Clear cart' },
  { keys: 'F9', action: 'Shift summary' },
  { keys: 'F10', action: 'Focus payments' },
  { keys: 'F12', action: 'Preview & submit bill' },
  { keys: 'Ctrl+/', action: 'This cheat sheet' },
  { keys: 'Esc', action: 'Close overlays' },
];

export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--rs-ink) 45%, transparent)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 shadow-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: 'var(--rs-ink)' }}>
            Keyboard shortcuts
          </h3>
          <button type="button" className="rs-btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="space-y-2">
          {ROWS.map((r) => (
            <li key={r.keys} className="flex items-center justify-between gap-3 text-sm">
              <kbd
                className="rounded px-2 py-0.5 font-mono text-xs font-semibold"
                style={{
                  background: 'var(--rs-surface-2)',
                  color: 'var(--rs-ink)',
                  border: '1px solid var(--rs-border)',
                }}
              >
                {r.keys}
              </kbd>
              <span style={{ color: 'var(--rs-muted)' }}>{r.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
