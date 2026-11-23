import type {
  DesktopPrefs,
  DefaultPayMethod,
  InvoiceTemplateId,
  LayoutId,
  ThemeId,
  ThemeMeta,
} from './theme/prefs';
import {
  INVOICE_TEMPLATE_OPTIONS,
  LAYOUTS,
  THEMES,
} from './theme/prefs';
import { ThemedSelect } from './ThemedSelect';
import { BusinessProfileSection } from './BusinessProfileSection';
import type { ApiFetch } from './api';
import { API_BASE_URL } from '@retail-sarathi/types';

import type { ReactNode } from 'react';

export function SettingsPanel({
  prefs,
  onChange,
  token,
  apiFetch,
  onProfileChange,
}: {
  prefs: DesktopPrefs;
  onChange: (patch: Partial<DesktopPrefs>) => void | Promise<void>;
  token?: string | null;
  apiFetch?: ApiFetch;
  onProfileChange?: (profile: { shopName: string; logoUrl: string | null }) => void;
}) {
  return (
    <div className="rs-animate-in min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="rs-display text-2xl font-bold" style={{ color: 'var(--rs-ink)' }}>
            Design & settings
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--rs-muted)' }}>
            Pick a look like a Figma board — click a frame to apply. Tuned for busy Indian counters.
          </p>
        </div>
        <div
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: 'var(--rs-accent-soft)', color: 'var(--rs-accent)' }}
        >
          Live preview
        </div>
      </div>

      {apiFetch ? (
        <BusinessProfileSection
          token={token ?? null}
          apiFetch={apiFetch}
          apiUrl={prefs.apiUrl}
          onProfileChange={onProfileChange}
        />
      ) : null}

      <Section title="Color theme" hint="Everyday neutrals first — then signature looks. Saved on this device.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeFrame
              key={t.id}
              theme={t}
              active={prefs.themeId === t.id}
              onSelect={() => void onChange({ themeId: t.id as ThemeId })}
            />
          ))}
        </div>
      </Section>

      <Section title="POS layout" hint="Wireframe frames — choose how catalog & cart split">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {LAYOUTS.map((l) => (
            <LayoutFrame
              key={l.id}
              id={l.id}
              name={l.name}
              description={l.description}
              direction={l.direction}
              showRail={l.showRail}
              catalogPct={
                l.id === 'cart-priority'
                  ? 38
                  : l.id === 'catalog-focus'
                    ? 64
                    : l.id === 'stacked-touch'
                      ? 52
                      : l.id === 'rail-sidebar'
                        ? 48
                        : 50
              }
              active={prefs.layoutId === l.id}
              onSelect={() => void onChange({ layoutId: l.id as LayoutId })}
            />
          ))}
        </div>
      </Section>

      <Section title="Invoice design" hint="Real A4 previews from Rule 46 GST templates — same on web & mobile">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {INVOICE_TEMPLATE_OPTIONS.map((tpl) => (
            <InvoiceFrame
              key={tpl.id}
              id={tpl.id}
              name={tpl.name}
              description={tpl.description}
              previewImage={tpl.previewImage}
              active={prefs.invoiceTemplateId === tpl.id}
              onSelect={() => void onChange({ invoiceTemplateId: tpl.id as InvoiceTemplateId })}
            />
          ))}
        </div>
      </Section>

      <Section title="Connection" hint="Nest API base URL used for login, catalog, and sync">
        <div
          className="space-y-3"
          style={{
            borderRadius: 'var(--rs-radius)',
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            padding: '1.1rem 1.25rem',
          }}
        >
          <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
            API URL
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-sm"
              style={{
                border: '1px solid var(--rs-border)',
                background: 'var(--rs-surface-2)',
                color: 'var(--rs-ink)',
              }}
              value={prefs.apiUrl}
              onChange={(e) => void onChange({ apiUrl: e.target.value.trim() })}
              placeholder={`Dev: http://localhost:4000/api/v1 · Prod: ${API_BASE_URL}`}
            />
          </label>
          <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
            Auto-sync interval (minutes, 0 = off)
            <ThemedSelect
              className="mt-1"
              aria-label="Auto sync interval"
              value={String(prefs.autoSyncIntervalMinutes)}
              options={[
                { value: '0', label: 'Off' },
                { value: '1', label: '1 minute' },
                { value: '5', label: '5 minutes' },
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
              ]}
              onChange={(v) => void onChange({ autoSyncIntervalMinutes: Number(v) })}
            />
          </label>
        </div>
      </Section>

      <Section title="Printer & cash drawer" hint="COM port for ESC/POS / Bluetooth SPP">
        <div
          className="grid gap-4 lg:grid-cols-2"
          style={{
            borderRadius: 'var(--rs-radius)',
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            padding: '1.1rem 1.25rem',
          }}
        >
          <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
            COM port
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-sm"
              style={{
                border: '1px solid var(--rs-border)',
                background: 'var(--rs-surface-2)',
                color: 'var(--rs-ink)',
              }}
              value={prefs.comPort}
              onChange={(e) => void onChange({ comPort: e.target.value.toUpperCase() })}
              placeholder="COM5"
            />
          </label>
          <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
            Bluetooth MAC (optional)
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-sm"
              style={{
                border: '1px solid var(--rs-border)',
                background: 'var(--rs-surface-2)',
                color: 'var(--rs-ink)',
              }}
              value={prefs.bluetoothAddress}
              onChange={(e) => void onChange({ bluetoothAddress: e.target.value })}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
          </label>
          <label className="block text-sm font-medium lg:col-span-2" style={{ color: 'var(--rs-ink)' }}>
            Receipt header
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
              style={{
                border: '1px solid var(--rs-border)',
                background: 'var(--rs-surface-2)',
                color: 'var(--rs-ink)',
              }}
              value={prefs.receiptHeader}
              onChange={(e) => void onChange({ receiptHeader: e.target.value })}
              placeholder="Shop tagline"
            />
          </label>
          <label className="block text-sm font-medium lg:col-span-2" style={{ color: 'var(--rs-ink)' }}>
            Receipt footer
            <input
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
              style={{
                border: '1px solid var(--rs-border)',
                background: 'var(--rs-surface-2)',
                color: 'var(--rs-ink)',
              }}
              value={prefs.receiptFooter}
              onChange={(e) => void onChange({ receiptFooter: e.target.value })}
              placeholder="Thank you! Visit again."
            />
          </label>
          <div className="space-y-2 lg:col-span-2">
            <ToggleRow
              label="Kick cash drawer after print"
              checked={prefs.kickDrawerAfterPrint}
              onChange={(v) => void onChange({ kickDrawerAfterPrint: v })}
            />
            <button
              type="button"
              className="rs-btn-primary mt-2 px-4 text-sm"
              onClick={() => {
                const header = prefs.receiptHeader ? `${prefs.receiptHeader}\n` : '';
                const footer = prefs.receiptFooter ? `\n${prefs.receiptFooter}` : '';
                void window.retailSarathi.printThermal({
                  text: `${header}*** TEST PRINT ***\nRetailSarathi POS\n${new Date().toLocaleString('en-IN')}\n----------------\nPaper: ${prefs.thermalWidth}mm\nCOM: ${prefs.comPort || 'none'}${footer}\n\n`,
                  comPort: prefs.comPort || undefined,
                  bluetoothAddress: prefs.bluetoothAddress || undefined,
                  kickDrawer: prefs.kickDrawerAfterPrint,
                });
              }}
            >
              Print test receipt
            </button>
          </div>
        </div>
      </Section>

      <Section title="Counter & printing" hint="Thermal slip + day-to-day POS behaviour">
        <div
          className="grid gap-5 lg:grid-cols-2"
          style={{
            borderRadius: 'var(--rs-radius)',
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            padding: '1.1rem 1.25rem',
          }}
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
              Thermal paper width
              <ThemedSelect
                className="mt-1"
                aria-label="Thermal paper width"
                value={String(prefs.thermalWidth)}
                options={[
                  { value: '80', label: '80mm — standard' },
                  { value: '58', label: '58mm — compact' },
                ]}
                onChange={(v) => void onChange({ thermalWidth: Number(v) as 58 | 80 })}
              />
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
              Default payment method
              <ThemedSelect
                className="mt-1"
                aria-label="Default payment method"
                value={prefs.defaultPayMethod}
                options={(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER'] as const).map((m) => ({
                  value: m,
                  label: m.replace('_', ' '),
                }))}
                onChange={(v) => void onChange({ defaultPayMethod: v as DefaultPayMethod })}
              />
            </label>
            <label className="block text-sm font-medium" style={{ color: 'var(--rs-ink)' }}>
              Catalog quick tiles
              <ThemedSelect
                className="mt-1"
                aria-label="Catalog quick tiles"
                value={String(prefs.catalogPreviewCount)}
                options={[8, 12, 16, 24].map((n) => ({
                  value: String(n),
                  label: `Show ${n} products`,
                }))}
                onChange={(v) =>
                  void onChange({
                    catalogPreviewCount: Number(v) as DesktopPrefs['catalogPreviewCount'],
                  })
                }
              />
            </label>
          </div>

          <div className="space-y-2.5 text-sm">
            {(
              [
                ['showShopGstin', 'Show GSTIN on thermal'],
                ['showShopAddress', 'Show shop address on thermal'],
                ['showCustomerOnThermal', 'Show customer name on thermal'],
                ['showCalculatorFab', 'Floating calculator button'],
                ['soundOnScan', 'Beep when product is scanned'],
                ['confirmHold', 'Confirm before holding a bill'],
                ['autoFocusBarcode', 'Keep barcode field focused'],
                ['denseUi', 'Dense UI (compact chrome)'],
                ['largeTouchTargets', 'Large touch targets'],
                ['reduceMotion', 'Reduce motion / animations'],
              ] as const
            ).map(([key, label]) => (
              <ToggleRow
                key={key}
                label={label}
                checked={Boolean(prefs[key])}
                onChange={(v) => void onChange({ [key]: v })}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Cashier PIN" hint="Fast unlock without typing email each shift">
        <div
          className="space-y-3"
          style={{
            borderRadius: 'var(--rs-radius)',
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            padding: '1.1rem 1.25rem',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
            After a full login, the POS may ask to save a 4–6 digit PIN for this device. Clear pins
            below if you need to force email login again.
          </p>
          <button
            type="button"
            className="rs-btn-ghost text-sm"
            onClick={() => {
              if (window.confirm('Clear all cashier PINs on this PC?')) {
                void window.retailSarathi.clearCashierPins?.();
              }
            }}
          >
            Clear cashier PINs
          </button>
        </div>
      </Section>

      <p className="pb-4 text-center text-xs" style={{ color: 'var(--rs-muted)' }}>
        Settings save on this PC (SQLite + local cache). Invoice template syncs online when connected.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-9">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
          {title}
        </h3>
        <span className="text-xs" style={{ color: 'var(--rs-muted)' }}>
          {hint}
        </span>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-[color-mix(in_srgb,var(--rs-accent)_6%,transparent)]"
    >
      <span style={{ color: 'var(--rs-ink)' }}>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: checked ? 'var(--rs-accent)' : 'var(--rs-border)' }}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
          style={{ left: checked ? '1.35rem' : '0.15rem' }}
        />
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </label>
  );
}

/** Figma-style artboard for a theme */
function ThemeFrame({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const p = theme.preview;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group text-left transition hover:-translate-y-0.5"
      style={{
        borderRadius: 16,
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
          border: '1px solid rgba(0,0,0,.08)',
          background: p.bg,
          aspectRatio: '16 / 10',
        }}
      >
        {/* Window chrome */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5"
          style={{ background: p.accent }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
          <span className="ml-2 text-[9px] font-semibold text-white/90">RetailSarathi POS</span>
        </div>
        <div className="flex h-[calc(100%-1.6rem)]">
          <div
            className="flex w-[18%] flex-col gap-1 border-r p-1.5"
            style={{
              borderColor: 'rgba(0,0,0,.06)',
              background: p.sidebar || p.surface,
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-1 rounded"
                style={{
                  background: i === 1 ? p.accent : theme.sidebarDark ? 'rgba(255,255,255,0.35)' : `${p.text}22`,
                  width: `${85 - i * 10}%`,
                }}
              />
            ))}
          </div>
          <div className="flex w-[42%] flex-col gap-1 p-2">
            <div className="h-2.5 rounded" style={{ background: p.surface, border: `1px solid ${p.accent}33` }} />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded px-1.5 py-1"
                style={{ background: p.surface }}
              >
                <span className="h-1.5 w-10 rounded" style={{ background: `${p.text}22` }} />
                <span className="h-1.5 w-6 rounded" style={{ background: p.accent }} />
              </div>
            ))}
          </div>
          <div className="flex w-[40%] flex-col justify-between p-2" style={{ background: `${p.text}08` }}>
            <div>
              <div className="mb-1 h-1.5 w-12 rounded" style={{ background: `${p.text}33` }} />
              <div className="mb-1 h-8 rounded" style={{ background: p.surface }} />
              <div className="h-6 rounded" style={{ background: p.surface }} />
            </div>
            <div className="h-5 rounded-md" style={{ background: p.accent }} />
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
          <span className="rs-display text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
            {theme.name}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--rs-muted)' }}>
          {theme.tagline}
        </p>
      </div>
    </button>
  );
}

function LayoutFrame({
  id,
  name,
  description,
  direction,
  showRail,
  catalogPct,
  active,
  onSelect,
}: {
  id: LayoutId;
  name: string;
  description: string;
  direction: 'row' | 'column';
  showRail: boolean;
  catalogPct: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left transition hover:-translate-y-0.5"
      style={{
        borderRadius: 16,
        border: active ? '2px solid var(--rs-accent)' : '1px solid var(--rs-border)',
        background: 'var(--rs-surface)',
        boxShadow: active ? 'var(--rs-shadow)' : 'none',
        padding: 10,
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: 12,
          border: '1px dashed var(--rs-border)',
          background:
            'repeating-conic-gradient(var(--rs-bg-deep) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px',
          aspectRatio: '16 / 10',
          padding: 8,
        }}
      >
        {/* Figma-like selection ring */}
        {active ? (
          <div
            className="pointer-events-none absolute inset-1 rounded-lg border-2"
            style={{ borderColor: 'var(--rs-accent)' }}
          />
        ) : null}
        <div
          className="flex h-full overflow-hidden rounded-md border"
          style={{
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-bg)',
            flexDirection: direction === 'column' ? 'column' : 'row',
          }}
        >
          {showRail ? (
            <div
              className="flex shrink-0 flex-col items-center gap-1 py-1.5"
              style={{
                width: direction === 'column' ? '100%' : 18,
                height: direction === 'column' ? 14 : 'auto',
                flexDirection: direction === 'column' ? 'row' : 'column',
                background: 'var(--rs-surface)',
                borderRight: direction === 'row' ? '1px solid var(--rs-border)' : undefined,
                borderBottom: direction === 'column' ? '1px solid var(--rs-border)' : undefined,
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="rounded-sm"
                  style={{
                    width: 8,
                    height: 8,
                    background: i === 1 ? 'var(--rs-accent)' : 'var(--rs-border)',
                  }}
                />
              ))}
            </div>
          ) : null}
          <div
            className="relative flex flex-col gap-1 p-1.5"
            style={{
              flex: direction === 'column' ? `0 0 ${catalogPct}%` : `1 1 ${catalogPct}%`,
              background: 'var(--rs-surface)',
              borderRight: direction === 'row' ? '1px solid var(--rs-border)' : undefined,
              borderBottom: direction === 'column' ? '1px solid var(--rs-border)' : undefined,
            }}
          >
            <span
              className="absolute left-1 top-1 rounded px-1 text-[8px] font-bold uppercase"
              style={{ background: 'var(--rs-accent-soft)', color: 'var(--rs-accent)' }}
            >
              Catalog
            </span>
            <div className="mt-3 space-y-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-2 rounded"
                  style={{
                    width: `${70 - i * 8}%`,
                    background: 'color-mix(in srgb, var(--rs-accent) 22%, transparent)',
                  }}
                />
              ))}
            </div>
          </div>
          <div
            className="relative flex flex-col justify-between p-1.5"
            style={{
              flex: 1,
              background: 'var(--rs-bg-deep)',
            }}
          >
            <span
              className="absolute left-1 top-1 rounded px-1 text-[8px] font-bold uppercase"
              style={{ background: 'var(--rs-surface)', color: 'var(--rs-muted)' }}
            >
              Cart
            </span>
            <div className="mt-3 space-y-1">
              <div className="h-2 w-3/4 rounded" style={{ background: 'var(--rs-surface)' }} />
              <div className="h-2 w-1/2 rounded" style={{ background: 'var(--rs-surface)' }} />
            </div>
            <div className="h-3 rounded" style={{ background: 'var(--rs-accent)' }} />
          </div>
        </div>
        <span
          className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[8px] text-white"
          aria-hidden
        >
          {id}
        </span>
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
          {name}
          {active ? (
            <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: 'var(--rs-accent)' }}>
              Active
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--rs-muted)' }}>
          {description}
        </p>
      </div>
    </button>
  );
}

function InvoiceFrame({
  id,
  name,
  description,
  previewImage,
  active,
  onSelect,
}: {
  id: InvoiceTemplateId;
  name: string;
  description: string;
  previewImage: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left transition hover:-translate-y-0.5"
      style={{
        borderRadius: 14,
        border: active ? '2px solid var(--rs-accent)' : '1px solid var(--rs-border)',
        background: active ? 'var(--rs-accent-soft)' : 'var(--rs-surface)',
        padding: 8,
        boxShadow: active ? 'var(--rs-shadow)' : 'none',
      }}
    >
      <div
        className="relative overflow-hidden bg-slate-100"
        style={{
          borderRadius: 8,
          border: '1px solid var(--rs-border)',
          aspectRatio: '210 / 297',
        }}
      >
        <img
          src={previewImage}
          alt={`${name} invoice preview`}
          className="h-full w-full object-contain object-top"
          loading="lazy"
        />
        {active ? (
          <span
            className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
            style={{ background: 'var(--rs-accent)' }}
          >
            Selected
          </span>
        ) : null}
      </div>
      <div className="mt-2 px-0.5">
        <div className="text-xs font-semibold" style={{ color: 'var(--rs-ink)' }}>
          {name}
        </div>
        <p className="mt-0.5 text-[10px] leading-snug" style={{ color: 'var(--rs-muted)' }}>
          {description}
        </p>
        <p className="mt-0.5 font-mono text-[9px]" style={{ color: 'var(--rs-muted)' }}>
          {id}
        </p>
      </div>
    </button>
  );
}
