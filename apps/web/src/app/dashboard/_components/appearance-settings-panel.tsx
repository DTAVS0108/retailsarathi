'use client';

import {
  WEB_THEMES,
  type WebAppearancePrefs,
  type WebThemeId,
} from '@/lib/appearance-prefs';

export function AppearanceSettingsPanel({
  prefs,
  onChange,
}: {
  prefs: WebAppearancePrefs;
  onChange: (patch: Partial<WebAppearancePrefs>) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold text-[var(--rs-ink)]">Design &amp; settings</h2>
        <p className="mt-1 text-sm text-[var(--rs-muted)]">
          Everyday neutrals first, then signature looks. Saved on this browser for home, login,
          dashboard, and admin. Desktop and mobile keep their own theme pickers.
        </p>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--rs-muted)]">Color theme</h3>
          <span className="text-xs text-[var(--rs-muted)]">{WEB_THEMES.length} looks · click a frame to apply</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {WEB_THEMES.map((t) => {
            const active = prefs.themeId === t.id;
            const p = t.preview;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ themeId: t.id as WebThemeId })}
                className="group text-left transition hover:-translate-y-0.5"
                style={{
                  borderRadius: 'var(--rs-radius)',
                  border: active ? `2px solid ${p.accent}` : '1px solid var(--rs-border)',
                  background: 'var(--rs-surface)',
                  boxShadow: active ? 'var(--rs-shadow)' : '0 4px 16px rgba(0,0,0,.04)',
                  padding: 10,
                }}
              >
                <div
                  className="relative overflow-hidden"
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,.06)',
                    background: p.bg,
                    aspectRatio: '16 / 10',
                  }}
                >
                  {/* Top chrome = same --rs-header band used in the live app */}
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5"
                    style={{
                      background: t.vars['--rs-header'] ?? p.accent,
                      color: (t.vars['--rs-header-ink'] as string) || '#fff',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full opacity-50"
                      style={{ background: 'currentColor' }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full opacity-40"
                      style={{ background: 'currentColor' }}
                    />
                    <span className="ml-1 text-[9px] font-semibold opacity-90">Dashboard</span>
                    <span
                      className="ml-auto h-2 w-8 rounded-sm opacity-90"
                      style={{ background: t.sidebarDark ? 'rgba(255,255,255,0.85)' : p.accent }}
                    />
                  </div>
                  <div className="flex h-[calc(100%-1.6rem)]">
                    <div
                      className="flex w-[28%] flex-col gap-1 border-r p-1.5"
                      style={{
                        borderColor: `${p.text}15`,
                        background: p.sidebar || p.surface,
                      }}
                    >
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 rounded"
                          style={{
                            background: i === 1 ? p.accent : t.sidebarDark ? 'rgba(255,255,255,0.35)' : `${p.text}18`,
                            width: `${80 - i * 8}%`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-2" style={{ background: p.bg }}>
                      <div className="h-2 w-1/3 rounded" style={{ background: `${p.text}22` }} />
                      <div className="grid flex-1 grid-cols-2 gap-1.5">
                        <div className="rounded" style={{ background: p.surface, border: `1px solid ${p.accent}22` }} />
                        <div className="rounded" style={{ background: p.surface, border: `1px solid ${p.accent}22` }} />
                      </div>
                      <div className="h-3 w-1/2 self-end rounded" style={{ background: p.accent }} />
                    </div>
                  </div>
                  {active ? (
                    <span
                      className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                      style={{ background: p.accent }}
                    >
                      Selected
                    </span>
                  ) : null}
                </div>
                <div className="mt-2.5 px-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: p.accent }} />
                    <span className="font-display text-sm font-semibold text-[var(--rs-ink)]">{t.name}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--rs-muted)]">{t.tagline}</p>
                  <p className="mt-0.5 text-[10px] font-medium text-[var(--rs-accent)]">{t.bestFor}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="grid gap-5 rounded-2xl border p-5 sm:grid-cols-2"
        style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface)' }}
      >
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--rs-muted)]">Workspace</h3>
          <label className="block text-sm font-medium text-[var(--rs-ink)]">
            Density
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}
              value={prefs.density}
              onChange={(e) => onChange({ density: e.target.value as WebAppearancePrefs['density'] })}
            >
              <option value="comfortable">Comfortable — spacious cards</option>
              <option value="compact">Compact — more rows on screen</option>
            </select>
          </label>
        </div>
        <div className="space-y-2.5 text-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--rs-muted)]">Chrome</h3>
          {(
            [
              ['stickySidebarGradient', 'Gradient sidebar wash'],
              ['showCalculatorFab', 'Show floating calculator'],
              ['reduceMotion', 'Reduce motion'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--rs-accent)_6%,transparent)]"
            >
              <span className="text-[var(--rs-ink)]">{label}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--rs-accent)]"
                checked={Boolean(prefs[key])}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-[var(--rs-muted)]">
        Saved on this device only. Shop invoice design is under the Invoices tab and syncs to mobile.
      </p>
    </div>
  );
}
