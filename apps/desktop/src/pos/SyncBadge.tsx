export function SyncBadge({
  online,
  syncing,
  pending,
  failed = 0,
  lastSyncAt,
  statusText,
}: {
  online: boolean;
  syncing: boolean;
  pending: number;
  /** Permanently-stuck outbox entries (FAILED/CONFLICT) — won't resolve on their own by retrying. */
  failed?: number;
  lastSyncAt: string | null;
  statusText?: string;
}) {
  const tone =
    failed > 0
      ? { bg: 'color-mix(in srgb, #dc2626 18%, var(--rs-surface))', fg: '#b91c1c' }
      : !online
        ? { bg: 'color-mix(in srgb, #b45309 18%, var(--rs-surface))', fg: '#b45309' }
        : syncing
          ? { bg: 'color-mix(in srgb, var(--rs-accent) 18%, var(--rs-surface))', fg: 'var(--rs-accent)' }
          : pending > 0
            ? { bg: 'color-mix(in srgb, #ca8a04 18%, var(--rs-surface))', fg: '#a16207' }
            : { bg: 'color-mix(in srgb, #059669 16%, var(--rs-surface))', fg: '#047857' };

  const label =
    failed > 0
      ? `${failed} failed — needs attention`
      : !online
        ? 'Offline'
        : syncing
          ? 'Syncing…'
          : pending > 0
            ? `${pending} pending`
            : 'Synced';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${syncing ? 'rs-sync-pulse' : ''}`}
      style={{ background: tone.bg, color: tone.fg }}
      title={[
        statusText,
        lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleString('en-IN')}` : null,
        pending ? `${pending} in outbox` : null,
        failed ? `${failed} permanently failed — will not auto-retry, needs manual review` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone.fg, opacity: syncing ? 0.7 : 1 }}
      />
      {label}
    </span>
  );
}
