import { FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  INDIAN_STATE_OPTIONS,
  parseAddressPayload,
  validateGstin,
} from '@retail-sarathi/gst-engine';
import type { ApiFetch } from './api';
import type { Customer } from './pos/types';
import { useToastMessage } from './toast';

type Segment = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';

type FormState = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  addressLine2: string;
  city: string;
  pincode: string;
  country: string;
  stateCode: string;
  segment: Segment;
  creditLimit: string;
  whatsappOptIn: boolean;
};

const EMPTY: FormState = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  addressLine2: '',
  city: '',
  pincode: '',
  country: 'IN',
  stateCode: '',
  segment: 'RETAIL',
  creditLimit: '0',
  whatsappOptIn: false,
};

const SEGMENTS: Segment[] = ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'CORPORATE'];

function normalizeGstin(raw: string) {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

function stateCodeFromGstin(gstin?: string | null) {
  if (!gstin) return undefined;
  const normalized = normalizeGstin(gstin);
  const prefix = normalized.slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return undefined;
  if (normalized.length >= 15 && !validateGstin(normalized)) return undefined;
  return prefix;
}

function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const ten =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return ten;
}

export function CustomerFormModal({
  open,
  token,
  apiFetch,
  initialName,
  initialPhone,
  onClose,
  onCreated,
}: {
  open: boolean;
  token: string;
  apiFetch: ApiFetch;
  initialName?: string;
  initialPhone?: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useToastMessage(error, 'error', setError);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      name: initialName?.trim() || '',
      phone: initialPhone?.trim() || '',
    });
    setError('');
    setSaving(false);
  }, [open, initialName, initialPhone]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (!form.name.trim()) throw new Error('Customer name is required.');
      const phone = normalizeIndianPhone(form.phone);
      if (!phone) throw new Error('Enter a valid 10-digit Indian mobile (starts with 6–9).');

      const gstinRaw = normalizeGstin(form.gstin);
      const gstin = gstinRaw || undefined;
      if (gstin && !validateGstin(gstin)) {
        throw new Error('GSTIN must be 15 characters (e.g. 09AAAAA0000A1Z5).');
      }

      const creditLimit = Number(form.creditLimit || 0);
      if (!Number.isFinite(creditLimit) || creditLimit < 0) {
        throw new Error('Credit limit cannot be negative.');
      }

      const addr = parseAddressPayload({
        address: form.address,
        addressLine2: form.addressLine2,
        city: form.city,
        stateCode: form.stateCode || stateCodeFromGstin(gstin),
        pincode: form.pincode,
        country: form.country || 'IN',
      });

      setSaving(true);
      const created = await apiFetch<Customer>(token, '/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone,
          email: form.email.trim() || undefined,
          gstin,
          address: addr.address,
          addressLine2: addr.addressLine2,
          city: addr.city,
          pincode: addr.pincode,
          country: addr.country,
          stateCode: addr.stateCode || stateCodeFromGstin(gstin),
          segment: form.segment,
          creditLimit,
          whatsappOptIn: form.whatsappOptIn,
        }),
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, children: ReactNode, className = '') => (
    <label className={`grid gap-1 text-xs font-medium ${className}`} style={{ color: 'var(--rs-ink)' }}>
      <span>{label}</span>
      {children}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rs-card flex max-h-[92vh] w-full max-w-3xl flex-col gap-4 overflow-hidden p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Add customer</h3>
            <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
              Same fields as web — name, contact, address, GST, credit & WhatsApp.
            </p>
          </div>
          <button type="button" className="rs-btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? (
          <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {error}
          </div>
        ) : null}

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="min-h-0 flex-1 space-y-4 overflow-auto pr-1"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {field(
              'Name *',
              <input
                className="rs-input text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />,
            )}
            {field(
              'Phone *',
              <input
                className="rs-input text-sm"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                inputMode="tel"
                required
              />,
            )}
            {field(
              'Email',
              <input
                className="rs-input text-sm"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />,
            )}
            {field(
              'GSTIN',
              <input
                className="rs-input font-mono text-sm"
                value={form.gstin}
                maxLength={15}
                onChange={(e) => {
                  const gstin = normalizeGstin(e.target.value);
                  const stateCode = stateCodeFromGstin(gstin);
                  setForm((f) => ({ ...f, gstin, ...(stateCode ? { stateCode } : {}) }));
                }}
              />,
            )}
            {field(
              'Segment',
              <select
                className="rs-input text-sm"
                value={form.segment}
                onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as Segment }))}
              >
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>,
            )}
            {field(
              'Credit limit',
              <input
                className="rs-input text-sm"
                type="number"
                min={0}
                step="0.01"
                placeholder="0 = no limit"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />,
            )}
            {field(
              'Address line 1',
              <input
                className="rs-input text-sm"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />,
              'sm:col-span-2',
            )}
            {field(
              'Address line 2',
              <input
                className="rs-input text-sm"
                value={form.addressLine2}
                onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
              />,
              'sm:col-span-2',
            )}
            {field(
              'City',
              <input
                className="rs-input text-sm"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />,
            )}
            {field(
              'State',
              <select
                className="rs-input text-sm"
                value={form.stateCode}
                onChange={(e) => setForm((f) => ({ ...f, stateCode: e.target.value }))}
              >
                <option value="">Select state</option>
                {INDIAN_STATE_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>,
            )}
            {field(
              'PIN code',
              <input
                className="rs-input text-sm"
                value={form.pincode}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                  }))
                }
              />,
            )}
            {field(
              'Country',
              <input
                className="rs-input text-sm"
                value={form.country}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))
                }
                maxLength={2}
              />,
            )}
            <label
              className="flex items-center gap-2 self-end pb-2 text-sm font-medium sm:col-span-2"
              style={{ color: 'var(--rs-ink)' }}
            >
              <input
                type="checkbox"
                checked={form.whatsappOptIn}
                onChange={(e) => setForm((f) => ({ ...f, whatsappOptIn: e.target.checked }))}
              />
              WhatsApp bill opt-in
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--rs-border)' }}>
            <button type="submit" className="rs-btn-primary text-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Create customer'}
            </button>
            <button
              type="button"
              className="rs-btn-secondary text-sm"
              disabled={saving}
              onClick={() => setForm(EMPTY)}
            >
              Reset
            </button>
            <button type="button" className="rs-btn-ghost text-sm" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
