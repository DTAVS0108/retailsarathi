'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useMemo, useState } from 'react';
import { BILLING_TEMPLATES, Button, Card, generateA4InvoiceHtml } from '@retail-sarathi/ui';
import {
  DEFAULT_INVOICE_DISPLAY_OPTIONS,
  INVOICE_DISPLAY_FIELDS,
  type InvoiceDisplayOptions,
} from '@retail-sarathi/gst-engine';
import { apiWithAuth } from '@/lib/helpers';
import { writeShopBranding } from '@/lib/shop-branding';
import { ShopLogoField } from '../_components/shop-logo-field';
import { assertGstinOptional, normalizeGstin, stateCodeFromGstin } from '@/lib/validators';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  inputClassName,
  parseError,
  textareaClassName,
} from '../_components/dashboard-ui';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';
import { NumberingSettingsPanel } from '../_components/numbering-settings-panel';
import { AppearanceSettingsPanel } from '../_components/appearance-settings-panel';
import { useWebAppearance } from '@/lib/use-web-appearance';

interface TenantProfile {
  name: string;
  logoUrl?: string | null;
  gstin?: string | null;
  stateCode: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  compositionScheme?: boolean | null;
  defaultInvoiceTemplate?: string | null;
  mobileInvoiceTemplate?: string | null;
  invoiceDisplayOptions?: Partial<InvoiceDisplayOptions> | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
}

interface EinvoiceStatus {
  configured: boolean;
  mode: 'live' | 'demo';
  hint: string;
}

interface SettingsFormState {
  name: string;
  gstin: string;
  stateCode: string;
  phone: string;
  email: string;
  address: string;
  compositionScheme: boolean;
}

const EMPTY_FORM: SettingsFormState = {
  name: '',
  gstin: '',
  stateCode: '',
  phone: '',
  email: '',
  address: '',
  compositionScheme: false,
};

export default function SettingsPage() {
  const { prefs: appearancePrefs, setPrefs: setAppearancePrefs } = useWebAppearance();
  const [form, setForm] = useState<SettingsFormState>(EMPTY_FORM);
  const [defaultTemplate, setDefaultTemplate] = useState('classic');
  const [mobileTemplate, setMobileTemplate] = useState('retail-bold');
  const [settingsTab, setSettingsTab] = useState<'business' | 'invoices' | 'numbering' | 'appearance'>('business');
  const [templateChannel, setTemplateChannel] = useState<'web' | 'mobile'>('web');
  const [displayOptions, setDisplayOptions] = useState<InvoiceDisplayOptions>({
    ...DEFAULT_INVOICE_DISPLAY_OPTIONS,
  });
  const [bankFields, setBankFields] = useState({
    bankName: '',
    bankAccountNo: '',
    bankIfsc: '',
    bankBranch: '',
  });
  const [complianceLive, setComplianceLive] = useState(false);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError('');
        const [profile, einvoiceStatus] = await Promise.all([
          apiWithAuth<TenantProfile>('/tenants/profile'),
          apiWithAuth<EinvoiceStatus>('/compliance/einvoice/status').catch(() => ({
            configured: false,
            mode: 'demo' as const,
            hint: '',
          })),
        ]);
        setForm({
          name: profile.name || '',
          gstin: profile.gstin || '',
          stateCode: profile.stateCode || '',
          phone: profile.phone || '',
          email: profile.email || '',
          address: profile.address || '',
          compositionScheme: Boolean(profile.compositionScheme),
        });
        writeShopBranding({ shopName: profile.name || '', logoUrl: profile.logoUrl || '' });
        setLogoUrl(profile.logoUrl ?? null);
        setDefaultTemplate(profile.defaultInvoiceTemplate || 'classic');
        setMobileTemplate(profile.mobileInvoiceTemplate || profile.defaultInvoiceTemplate || 'retail-bold');
        setDisplayOptions({
          ...DEFAULT_INVOICE_DISPLAY_OPTIONS,
          ...(profile.invoiceDisplayOptions ?? {}),
        });
        setBankFields({
          bankName: profile.bankName || '',
          bankAccountNo: profile.bankAccountNo || '',
          bankIfsc: profile.bankIfsc || '',
          bankBranch: profile.bankBranch || '',
        });
        setComplianceLive(Boolean(einvoiceStatus.configured));
      } catch (err) {
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!form.name.trim()) throw new Error('Shop name is required.');
      const gstin = assertGstinOptional(form.gstin);
      // GSTIN digits 1–2 are the official state code — always prefer them over a stale field.
      const stateFromGstin = stateCodeFromGstin(gstin);
      const previousState = form.stateCode.trim();
      const stateCode = (stateFromGstin || previousState).padStart(2, '0').slice(0, 2);
      if (!/^\d{2}$/.test(stateCode)) {
        throw new Error('State code is required (2 digits). Enter GSTIN or state code.');
      }

      setSaving(true);
      setError('');
      setSuccess('');
      await apiWithAuth('/tenants/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          gstin,
          stateCode,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
          compositionScheme: form.compositionScheme,
        }),
      });
      setForm((current) => ({
        ...current,
        stateCode,
        gstin: gstin ?? current.gstin,
      }));
      writeShopBranding({ shopName: form.name.trim() });
      setSuccess(
        stateFromGstin && previousState && stateFromGstin !== previousState
          ? `Shop profile updated. State code set to ${stateFromGstin} from GSTIN.`
          : 'Shop profile updated successfully.',
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  const samplePrintData = useMemo(
    () => ({
      shopName: form.name || 'Your Shop Name',
      shopAddress: form.address || 'Your shop address',
      gstin: form.gstin || undefined,
      shopStateCode: form.stateCode || undefined,
      shopPhone: form.phone || undefined,
      invoiceNumber: 'INV-00001',
      date: new Date().toISOString().split('T')[0],
      customerName: 'Sample Customer',
      customerPhone: '9876543210',
      customerGstin: form.gstin || undefined,
      customerStateCode: form.stateCode || undefined,
      customerAddress: 'Sample customer address',
      placeOfSupply: form.stateCode || undefined,
      supplyType: 'INTRA_STATE' as const,
      reverseCharge: false,
      lines: [
        {
          name: 'Samsung Galaxy A55 5G',
          hsnCode: '8517',
          qty: 1,
          rate: 28999,
          taxableAmount: 24575.42,
          amount: 28999,
          gstRate: 18,
          cgst: 2211.79,
          sgst: 2211.79,
          igst: 0,
        },
        {
          name: 'Tempered Glass Screen Guard',
          hsnCode: '3926',
          qty: 2,
          rate: 499,
          taxableAmount: 846.61,
          amount: 998,
          gstRate: 18,
          cgst: 75.7,
          sgst: 75.7,
          igst: 0,
        },
      ],
      subtotal: 25422.03,
      totalCgst: 2287.49,
      totalSgst: 2287.49,
      totalIgst: 0,
      grandTotal: 29997,
      payments: [{ method: 'UPI', amount: 29997 }],
      displayOptions,
      bankName: bankFields.bankName || undefined,
      bankAccountNo: bankFields.bankAccountNo || undefined,
      bankIfsc: bankFields.bankIfsc || undefined,
      bankBranch: bankFields.bankBranch || undefined,
    }),
    [form.name, form.address, form.gstin, form.stateCode, form.phone, displayOptions, bankFields],
  );

  const previewHtml = useMemo(() => {
    if (!previewId) return '';
    try {
      return generateA4InvoiceHtml(samplePrintData, previewId);
    } catch {
      return '<p style="padding:24px;font-family:sans-serif">Unable to render this template.</p>';
    }
  }, [previewId, samplePrintData]);

  const previewName = BILLING_TEMPLATES.find((t) => t.id === previewId)?.name ?? 'Template';

  async function saveInvoiceDisplayOptions() {
    try {
      setSavingDisplay(true);
      setError('');
      setSuccess('');
      await apiWithAuth('/tenants/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          invoiceDisplayOptions: displayOptions,
          bankName: bankFields.bankName.trim() || undefined,
          bankAccountNo: bankFields.bankAccountNo.trim() || undefined,
          bankIfsc: bankFields.bankIfsc.trim() || undefined,
          bankBranch: bankFields.bankBranch.trim() || undefined,
        }),
      });
      setSuccess('Invoice display settings saved.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingDisplay(false);
    }
  }

  function toggleDisplayOption(key: keyof InvoiceDisplayOptions, checked: boolean) {
    setDisplayOptions((current) => ({ ...current, [key]: checked }));
  }

  async function setInvoiceTemplate(templateId: string, channel: 'web' | 'mobile') {
    try {
      setSavingTemplate(true);
      setError('');
      setSuccess('');
      const body =
        channel === 'mobile'
          ? { mobileInvoiceTemplate: templateId }
          : { defaultInvoiceTemplate: templateId };
      await apiWithAuth('/tenants/profile', { method: 'PATCH', body: JSON.stringify(body) });
      if (channel === 'mobile') {
        setMobileTemplate(templateId);
      } else {
        setDefaultTemplate(templateId);
      }
      const name = BILLING_TEMPLATES.find((t) => t.id === templateId)?.name ?? templateId;
      setSuccess(
        `"${name}" is now your ${channel === 'mobile' ? 'mobile app' : 'web dashboard'} invoice template.`,
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function setDefaultInvoiceTemplate(templateId: string) {
    return setInvoiceTemplate(templateId, 'web');
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Shop Settings"
        description="Business profile, invoice layout, print content, and bank details — synced to the mobile app."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <ScrollableTabBar
        tabs={[
          { id: 'business' as const, label: 'Business profile' },
          { id: 'invoices' as const, label: 'Invoices & billing' },
          { id: 'appearance' as const, label: 'Design & settings' },
          { id: 'numbering' as const, label: 'Numbering & ledgers' },
        ]}
        active={settingsTab}
        onChange={setSettingsTab}
      />

      {settingsTab === 'business' ? (
      <Card className="border-slate-200">
        {loading ? (
          <AppLoader label="Loading profile..." />
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Business profile</h2>
              <p className="text-sm text-slate-500">
                These values feed invoices, tax printouts, and customer-facing documents.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <ShopLogoField
                  logoUrl={logoUrl}
                  shopName={form.name}
                  onChange={(next) => {
                    setLogoUrl(next);
                    writeShopBranding({ logoUrl: next || '' });
                  }}
                />
              </div>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Shop name</span>
                <input
                  className={inputClassName}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>GSTIN</span>
                <input
                  className={inputClassName}
                  value={form.gstin}
                  onChange={(event) => {
                    const gstin = normalizeGstin(event.target.value);
                    const stateCode = stateCodeFromGstin(gstin);
                    setForm((current) => ({
                      ...current,
                      gstin,
                      ...(stateCode ? { stateCode } : {}),
                    }));
                  }}
                  maxLength={15}
                  placeholder="e.g. 09AAAAA0000A1Z5"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>State code</span>
                <input
                  className={inputClassName}
                  value={form.stateCode}
                  readOnly={Boolean(stateCodeFromGstin(form.gstin))}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stateCode: event.target.value.replace(/\D/g, '').slice(0, 2),
                    }))
                  }
                  maxLength={2}
                  placeholder="09"
                />
                <span className="block text-xs font-normal text-slate-500">
                  {stateCodeFromGstin(form.gstin)
                    ? 'Locked to first 2 digits of GSTIN (cannot disagree).'
                    : 'Enter 2-digit GST state code, or fill GSTIN to set automatically.'}
                </span>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Phone</span>
                <input
                  className={inputClassName}
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Shop email</span>
                <input
                  className={inputClassName}
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Address</span>
                <textarea
                  className={textareaClassName}
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.compositionScheme}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, compositionScheme: event.target.checked }))
                  }
                />
                <span>
                  <span className="block">Composition scheme</span>
                  <span className="mt-0.5 block font-normal text-slate-500">
                    Enable if this shop is registered under GST composition.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save settings'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(EMPTY_FORM)}>
                Clear
              </Button>
            </div>
          </form>
        )}
      </Card>
      ) : null}

      {settingsTab === 'invoices' ? (
      <>
      <Card className="border-slate-200">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invoice content</h2>
            <p className="text-sm text-slate-500">
              Control what appears on printed bills. QR and IRN stay off until you enable them here
              {complianceLive ? ' (Compliance+ credentials detected).' : ' (Compliance+ not configured yet).'}
            </p>
          </div>

          {!complianceLive ? (
            <MessageBanner tone="info">
              Invoices print as normal GST bills without e-invoice QR or IRN. Add Compliance+ GSP
              credentials in API environment, then enable QR/IRN below when ready.
            </MessageBanner>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            {(['compliance', 'tax', 'party', 'footer'] as const).map((group) => (
              <div key={group} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {group === 'compliance' ? 'Compliance+' : group}
                </h3>
                {INVOICE_DISPLAY_FIELDS.filter((field) => field.group === group).map((field) => {
                  const disabled =
                    field.requiresCompliance && !complianceLive && field.key !== 'showQr';
                  const value = displayOptions[field.key];
                  if (typeof value !== 'boolean') return null;
                  return (
                    <label
                      key={field.key}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                        disabled ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={value}
                        disabled={disabled}
                        onChange={(event) => toggleDisplayOption(field.key, event.target.checked)}
                      />
                      <span>
                        <span className="block font-medium text-slate-900">{field.label}</span>
                        <span className="mt-0.5 block text-slate-500">{field.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Custom footer note</span>
            <textarea
              className={textareaClassName}
              rows={5}
              placeholder={
                'Subject to Bijnor jurisdiction.\nGoods once sold will not be taken back except manufacturing defect.\nWarranty as per manufacturer terms only.\nBattery serials must be preserved for claim.'
              }
              value={displayOptions.customFooterNote}
              onChange={(event) =>
                setDisplayOptions((current) => ({ ...current, customFooterNote: event.target.value }))
              }
            />
            <span className="block text-xs font-normal text-slate-500">
              Shop policy printed under the legal footer. Use one line per term — they appear as separate lines on the bill.
            </span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Bank name</span>
              <input
                className={inputClassName}
                value={bankFields.bankName}
                onChange={(event) => setBankFields((c) => ({ ...c, bankName: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Account number</span>
              <input
                className={inputClassName}
                value={bankFields.bankAccountNo}
                onChange={(event) => setBankFields((c) => ({ ...c, bankAccountNo: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>IFSC</span>
              <input
                className={inputClassName}
                value={bankFields.bankIfsc}
                onChange={(event) => setBankFields((c) => ({ ...c, bankIfsc: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Branch</span>
              <input
                className={inputClassName}
                value={bankFields.bankBranch}
                onChange={(event) => setBankFields((c) => ({ ...c, bankBranch: event.target.value }))}
              />
            </label>
          </div>

          <Button type="button" disabled={savingDisplay} onClick={() => void saveInvoiceDisplayOptions()}>
            {savingDisplay ? 'Saving...' : 'Save invoice content settings'}
          </Button>
        </div>
      </Card>

      <Card className="border-slate-200">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Invoice templates</h2>
            <p className="text-sm text-slate-500">
              Pick separate layouts for the web dashboard and the mobile app. Mobile uses the same HTML
              engine — Bluetooth / Wi‑Fi print from the app follows your mobile template choice.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['web', 'Web dashboard'],
                ['mobile', 'Mobile app'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTemplateChannel(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  templateChannel === id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
            {templateChannel === 'mobile' && defaultTemplate !== mobileTemplate ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={savingTemplate}
                onClick={() => void setInvoiceTemplate(defaultTemplate, 'mobile')}
              >
                Copy web template to mobile
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BILLING_TEMPLATES.map((template) => {
              const activeId = templateChannel === 'mobile' ? mobileTemplate : defaultTemplate;
              const isDefault = activeId === template.id;
              return (
                <div
                  key={`${templateChannel}-${template.id}`}
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    isDefault ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="relative aspect-[210/297] overflow-hidden bg-slate-100">
                    <img
                      src={template.previewImage}
                      alt={`${template.name} invoice preview`}
                      className="h-full w-full object-contain object-top"
                      loading="lazy"
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-1.5"
                      style={{ backgroundColor: template.accent }}
                    />
                  </div>
                  <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">{template.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {template.mobileRecommended ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            Mobile friendly
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Best on web / A4
                          </span>
                        )}
                      </div>
                    </div>
                    {isDefault ? (
                      <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                        {templateChannel === 'mobile' ? 'Mobile default' : 'Web default'}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewId(template.id)}>
                      Preview
                    </Button>
                    {!isDefault ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingTemplate}
                        onClick={() => void setInvoiceTemplate(template.id, templateChannel)}
                      >
                        Set for {templateChannel === 'mobile' ? 'mobile' : 'web'}
                      </Button>
                    ) : null}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      </>
      ) : null}

      {settingsTab === 'appearance' ? (
        <Card className="border-[var(--rs-border)] bg-[var(--rs-surface)]">
          <AppearanceSettingsPanel prefs={appearancePrefs} onChange={setAppearancePrefs} />
        </Card>
      ) : null}

      {settingsTab === 'numbering' ? <NumberingSettingsPanel /> : null}

      {previewId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewName} preview`}
          onClick={() => setPreviewId(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="font-semibold text-slate-900">{previewName}</h3>
                <p className="text-sm text-slate-500">Sample invoice preview</p>
              </div>
              <div className="flex gap-2">
                {defaultTemplate !== previewId && templateChannel === 'web' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingTemplate}
                    onClick={() => void setInvoiceTemplate(previewId, 'web')}
                  >
                    Set for web
                  </Button>
                ) : null}
                {mobileTemplate !== previewId && templateChannel === 'mobile' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingTemplate}
                    onClick={() => void setInvoiceTemplate(previewId, 'mobile')}
                  >
                    Set for mobile
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewId(null)}>
                  Close
                </Button>
              </div>
            </div>
            <iframe title={`${previewName} preview`} className="min-h-[70vh] w-full bg-white" srcDoc={previewHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
