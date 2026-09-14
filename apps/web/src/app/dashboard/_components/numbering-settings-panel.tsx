'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CREDIT_NOTE_NUMBERING,
  DEFAULT_LEDGER_SETTINGS,
  DEFAULT_TAX_INVOICE_NUMBERING,
  NUMBERING_PATTERN_PRESETS,
  describeResetPeriod,
  formatDocumentNumber,
  getIndianFinancialYear,
  mergeLedgerSettings,
  mergeNumberingSettings,
  previewNextDocumentNumber,
  type DocumentNumberingConfig,
  type LedgerSettings,
  type NumberResetPeriod,
  type TenantNumberingSettings,
} from '@retail-sarathi/gst-engine';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { AppLoader } from '@/app/_components/app-loader';
import { MessageBanner, inputClassName, parseError, selectClassName } from './dashboard-ui';

const RESET_OPTIONS: Array<{ id: NumberResetPeriod; label: string }> = [
  { id: 'financial_year', label: 'Financial year (Apr–Mar)' },
  { id: 'calendar_year', label: 'Calendar year' },
  { id: 'month', label: 'Monthly' },
  { id: 'never', label: 'Never reset' },
];

function NumberingForm({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: DocumentNumberingConfig;
  onChange: (next: DocumentNumberingConfig) => void;
}) {
  const preview = useMemo(
    () => previewNextDocumentNumber(value, 0),
    [value],
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Format preset</span>
        <select
          className={selectClassName}
          value={NUMBERING_PATTERN_PRESETS.find((p) => p.pattern === value.pattern)?.id ?? 'custom'}
          onChange={(e) => {
            const preset = NUMBERING_PATTERN_PRESETS.find((p) => p.id === e.target.value);
            if (preset) onChange({ ...value, pattern: preset.pattern });
          }}
        >
          {NUMBERING_PATTERN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — e.g. {p.example}
            </option>
          ))}
          <option value="custom">Custom pattern</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Prefix</span>
          <input
            className={inputClassName}
            value={value.prefix}
            maxLength={12}
            onChange={(e) => onChange({ ...value, prefix: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Sequence padding</span>
          <input
            className={inputClassName}
            type="number"
            min={3}
            max={8}
            value={value.padLength}
            onChange={(e) => onChange({ ...value, padLength: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Custom pattern</span>
        <input
          className={inputClassName}
          value={value.pattern}
          onChange={(e) => onChange({ ...value, pattern: e.target.value })}
          placeholder="{PREFIX}-{FY}-{SEQ}"
        />
        <span className="text-xs font-normal text-slate-500">
          Tokens: {'{PREFIX}'} {'{FY}'} {'{YEAR}'} {'{MONTH}'} {'{SEQ}'}
        </span>
      </label>

      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Reset counter</span>
        <select
          className={selectClassName}
          value={value.resetPeriod}
          onChange={(e) => onChange({ ...value, resetPeriod: e.target.value as NumberResetPeriod })}
        >
          {RESET_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-slate-500">{describeResetPeriod(value.resetPeriod)}</span>
      </label>

      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
        <span className="font-medium">Next number preview:</span> {preview}
      </div>
    </div>
  );
}

export function NumberingSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [numbering, setNumbering] = useState<TenantNumberingSettings>({
    taxInvoice: { ...DEFAULT_TAX_INVOICE_NUMBERING },
    creditNote: { ...DEFAULT_CREDIT_NOTE_NUMBERING },
  });
  const [ledger, setLedger] = useState<LedgerSettings>({ ...DEFAULT_LEDGER_SETTINGS });
  const [status, setStatus] = useState<{
    sequences: Array<{ docType: string; periodKey: string; currentSeq: number; nextPreview: string }>;
  } | null>(null);

  const fy = useMemo(() => getIndianFinancialYear(), []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [profile, numberingStatus] = await Promise.all([
          apiWithAuth<{ invoiceNumbering?: unknown; ledgerSettings?: unknown }>('/tenants/profile'),
          apiWithAuth<typeof status>('/tenants/numbering-status'),
        ]);
        setNumbering(mergeNumberingSettings(profile.invoiceNumbering));
        setLedger(mergeLedgerSettings(profile.ledgerSettings));
        setStatus(numberingStatus);
      } catch (e) {
        setError(parseError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await apiWithAuth('/tenants/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          invoiceNumbering: numbering,
          ledgerSettings: ledger,
        }),
      });
      const refreshed = await apiWithAuth<typeof status>('/tenants/numbering-status');
      setStatus(refreshed);
      setSuccess('Numbering & ledger settings saved.');
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-slate-200">
        <AppLoader label="Loading numbering settings…" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-slate-200">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Invoice & credit note numbering</h2>
          <p className="text-sm text-slate-500">
            Configure how bill numbers are generated. Recommended: financial-year series ({fy.label}) so
            numbers align with ITR and GST annual returns.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <NumberingForm
            title="Tax invoices (POS bills)"
            description="Used for new sales, held drafts, and finalized bills."
            value={numbering.taxInvoice}
            onChange={(taxInvoice) => setNumbering((n) => ({ ...n, taxInvoice }))}
          />
          <NumberingForm
            title="Credit notes (returns)"
            description="Issued when customers return goods against a tax invoice."
            value={numbering.creditNote}
            onChange={(creditNote) => setNumbering((n) => ({ ...n, creditNote }))}
          />
        </div>

        {status?.sequences?.length ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Current period counters</h3>
            <p className="mt-1 text-xs text-slate-500">
              Live sequence for {fy.label}. Changing format does not renumber existing bills.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {status.sequences.map((row) => (
                <li
                  key={row.docType}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span className="font-medium text-slate-700">
                    {row.docType === 'CREDIT_NOTE' ? 'Credit notes' : 'Tax invoices'}
                  </span>
                  <span className="text-slate-500">Period {row.periodKey}</span>
                  <span className="font-mono text-slate-900">Last #{row.currentSeq || '—'}</span>
                  <span className="text-brand">Next: {row.nextPreview}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save numbering settings'}
          </Button>
        </div>
      </Card>

      <Card className="border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Ledger maintenance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sales and returns can auto-post to your chart of accounts for P&amp;L, balance sheet, and ITR prep.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ledger.autoPostSales}
              onChange={(e) => setLedger((l) => ({ ...l, autoPostSales: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Auto-post sales to ledger</span>
              <span className="block text-slate-500">
                When a bill is finalized, debit Cash/Bank and credit Sales (account 4000).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ledger.autoPostCreditNotes}
              onChange={(e) => setLedger((l) => ({ ...l, autoPostCreditNotes: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Auto-post returns & cancellations</span>
              <span className="block text-slate-500">
                Reverse sales in the journal when a credit note is issued or invoice is cancelled.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ledger.seedAccountsOnFirstSale}
              onChange={(e) => setLedger((l) => ({ ...l, seedAccountsOnFirstSale: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Create default accounts automatically</span>
              <span className="block text-slate-500">
                Cash, Sales, Inventory, Payables, etc. — required before journal entries work.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ledger.autoPostCollections !== false}
              onChange={(e) => setLedger((l) => ({ ...l, autoPostCollections: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Auto-post customer collections</span>
              <span className="block text-slate-500">
                On collect: debit Cash/Bank (1000), credit AR (1100). Reversed when a collection is voided.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={ledger.autoPostPayables !== false}
              onChange={(e) => setLedger((l) => ({ ...l, autoPostPayables: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Auto-post supplier payments</span>
              <span className="block text-slate-500">
                On pay: debit AP (2000), credit Cash/Bank (1000). Reversed on void/bounce.
              </span>
            </span>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-900">Bank feed URL (optional)</span>
            <input
              className={inputClassName}
              placeholder="https://…/statements.csv or JSON"
              value={ledger.bankFeedUrl || ''}
              onChange={(e) =>
                setLedger((l) => ({
                  ...l,
                  bankFeedUrl: e.target.value.trim() || undefined,
                }))
              }
            />
            <span className="block text-xs text-slate-500">
              Bank reconcile → Sync feed. Env BANK_FEED_URL also works.
            </span>
          </label>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          View journal entries, P&amp;L, and ITR export in{' '}
          <Link href="/dashboard/accounting" className="font-medium text-brand hover:underline">
            Accounting &amp; ITR
          </Link>
          . Supplier udhaar is maintained separately on each supplier ledger.
        </p>

        <div className="mt-4">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save ledger settings'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
