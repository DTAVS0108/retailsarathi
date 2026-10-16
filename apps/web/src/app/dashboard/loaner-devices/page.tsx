'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatusBadge,
  inputClassName,
  parseError,
  selectClassName,
} from '../_components/dashboard-ui';

interface LoanerDevice {
  id: string;
  brand?: string | null;
  model: string;
  identifier?: string | null;
  condition: string;
  status: string;
  notes?: string | null;
}

export default function LoanerDevicesPage() {
  const [items, setItems] = useState<LoanerDevice[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [identifier, setIdentifier] = useState('');

  async function load(status = statusFilter) {
    try {
      setLoading(true);
      setError('');
      const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
      setItems(await apiWithAuth<LoanerDevice[]>(`/loaner-devices${suffix}`));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addDevice(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/loaner-devices', {
        method: 'POST',
        body: JSON.stringify({
          brand: brand.trim() || undefined,
          model: model.trim(),
          identifier: identifier.trim() || undefined,
        }),
      });
      setBrand('');
      setModel('');
      setIdentifier('');
      setSuccess('Loaner device added to the pool.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function retire(id: string) {
    try {
      setError('');
      await apiWithAuth(`/loaner-devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RETIRED' }),
      });
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Loaner Devices"
        description="A pool of shop-owned devices lent to customers while their own device is being repaired."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
        <form className="grid gap-4 md:grid-cols-4" onSubmit={addDevice}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Brand</span>
            <input className={inputClassName} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Samsung" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Model</span>
            <input className={inputClassName} value={model} onChange={(e) => setModel(e.target.value)} required placeholder="e.g. Galaxy A05" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>IMEI / serial (optional)</span>
            <input className={inputClassName} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add to pool'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Loaner pool</h3>
          <select
            className={selectClassName}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              void load(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_LOAN">On loan</option>
            <option value="IN_REPAIR">In repair</option>
            <option value="RETIRED">Retired</option>
          </select>
        </div>
        {loading ? (
          <AppLoader label="Loading…" size="sm" />
        ) : items.length ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {item.brand ? `${item.brand} ` : ''}
                    {item.model}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.identifier ? `${item.identifier} · ` : ''}Condition: {item.condition}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  {item.status !== 'RETIRED' ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => void retire(item.id)}>
                      Retire
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No loaner devices yet"
            description="Add spare phones you can lend out while a repair is in progress."
          />
        )}
      </Card>
    </div>
  );
}
