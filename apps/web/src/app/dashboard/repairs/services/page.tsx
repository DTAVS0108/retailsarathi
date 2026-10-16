'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  inputClassName,
  parseError,
  toNumber,
} from '../../_components/dashboard-ui';

interface ServiceType {
  id: string;
  name: string;
  defaultPrice?: number | null;
  typicalTurnaroundDays?: number | null;
  isActive: boolean;
}

export default function RepairServicesPage() {
  const [items, setItems] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [typicalTurnaroundDays, setTypicalTurnaroundDays] = useState('');

  async function load() {
    try {
      setLoading(true);
      setError('');
      setItems(await apiWithAuth<ServiceType[]>('/repair-service-types'));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createServiceType(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/repair-service-types', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          defaultPrice: defaultPrice ? toNumber(defaultPrice) : undefined,
          typicalTurnaroundDays: typicalTurnaroundDays ? toNumber(typicalTurnaroundDays) : undefined,
        }),
      });
      setName('');
      setDefaultPrice('');
      setTypicalTurnaroundDays('');
      setSuccess('Service type saved.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    try {
      setError('');
      await apiWithAuth(`/repair-service-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Repair Services"
        description="Common repair services with a default price — speeds up intake, but every job can still be free-typed and bespoke."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
        <form className="grid gap-4 md:grid-cols-4" onSubmit={createServiceType}>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            <span>Service name</span>
            <input
              className={inputClassName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Screen Replacement — iPhone 13"
              required
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Default price (₹)</span>
            <input
              className={inputClassName}
              type="number"
              min="0"
              step="0.01"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Typical turnaround (days)</span>
            <input
              className={inputClassName}
              type="number"
              min="0"
              value={typicalTurnaroundDays}
              onChange={(e) => setTypicalTurnaroundDays(e.target.value)}
            />
          </label>
          <div className="md:col-span-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add service type'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Service catalog</h3>
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
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.defaultPrice != null ? formatINR(toNumber(item.defaultPrice)) : 'No default price'}
                    {item.typicalTurnaroundDays != null ? ` · ~${item.typicalTurnaroundDays} day turnaround` : ''}
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => void deactivate(item.id)}>
                  Deactivate
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No service types yet"
            description="Add common repairs (screen replacement, battery swap, etc.) to speed up intake."
          />
        )}
      </Card>
    </div>
  );
}
