import { useEffect, useState } from 'react';

export function UpdateBanner() {
  const [info, setInfo] = useState<{ version?: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void window.retailSarathi.checkForUpdates?.().then((r) => {
      if (r?.available) setInfo({ version: r.version ?? undefined });
    });
  }, []);

  if (!info || dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
      style={{
        background: 'color-mix(in srgb, var(--rs-accent) 14%, var(--rs-surface))',
        borderBottom: '1px solid var(--rs-border)',
        color: 'var(--rs-ink)',
      }}
    >
      <span>
        Update available{info.version ? ` (${info.version})` : ''}. Restart to install when ready.
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rs-btn-primary text-xs"
          onClick={() => void window.retailSarathi.installUpdate?.()}
        >
          Install
        </button>
        <button type="button" className="rs-btn-ghost text-xs" onClick={() => setDismissed(true)}>
          Later
        </button>
      </div>
    </div>
  );
}
