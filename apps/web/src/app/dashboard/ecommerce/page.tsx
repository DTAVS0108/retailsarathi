'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, formatINR } from '@retail-sarathi/ui';
import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth } from '@/lib/helpers';
import { API_URL } from '@/lib/api';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  EmptyState,
  StatCard,
  cn,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { RowActionsMenu } from '../_components/row-actions-menu';

type OrderStatus = 'IMPORTED' | 'FULFILLED' | 'CANCELLED' | 'FAILED';
type Region = 'india' | 'global' | 'self_hosted';
type BrowseTab = 'popular' | 'india' | 'global' | 'self_hosted' | 'all';

type CredField = { key: string; label: string; placeholder: string; secret?: boolean };

type PlatformDef = {
  id: string;
  label: string;
  blurb: string;
  region: Region;
  popular?: boolean;
  fields: CredField[];
};

type Channel = {
  id: string;
  name: string;
  platform: string;
  isActive: boolean;
  lastSyncAt: string | null;
  hasCredentials?: boolean;
  credentialFields?: string[];
  webhookToken?: string | null;
  _count?: { orders: number };
};

type Order = {
  id: string;
  externalId: string;
  customerName: string | null;
  totalAmount: number | string;
  status: OrderStatus;
  createdAt: string;
  channel: { id: string; name: string; platform: string };
};

type Overview = {
  channelCount: number;
  activeChannelCount: number;
  orderCount: number;
  orderValue: number;
  byStatus: Record<string, number>;
  byPlatform?: Record<string, number>;
  availablePlatforms?: number;
  lastSyncAt: string | null;
};

const FALLBACK_PLATFORMS: PlatformDef[] = [
  {
    id: 'SHOPIFY',
    label: 'Shopify',
    blurb: 'Admin API access token + shop domain',
    region: 'global',
    popular: true,
    fields: [
      { key: 'shopDomain', label: 'Shop domain', placeholder: 'your-store.myshopify.com' },
      { key: 'accessToken', label: 'Admin API token', placeholder: 'shpat_…', secret: true },
    ],
  },
  {
    id: 'WOOCOMMERCE',
    label: 'WooCommerce',
    blurb: 'REST API keys from WordPress',
    region: 'self_hosted',
    popular: true,
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'consumerKey', label: 'Consumer key', placeholder: 'ck_…', secret: true },
      { key: 'consumerSecret', label: 'Consumer secret', placeholder: 'cs_…', secret: true },
    ],
  },
  {
    id: 'AMAZON',
    label: 'Amazon',
    blurb: 'Seller Central / SP-API credentials',
    region: 'global',
    popular: true,
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'A1…' },
      { key: 'refreshToken', label: 'Refresh token', placeholder: 'Atzr|…', secret: true },
      { key: 'marketplaceId', label: 'Marketplace ID', placeholder: 'A21TJRUUN4KGV' },
    ],
  },
  {
    id: 'FLIPKART',
    label: 'Flipkart',
    blurb: 'Seller Hub API credentials',
    region: 'india',
    popular: true,
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'MEESHO',
    label: 'Meesho',
    blurb: 'Supplier panel API / order export',
    region: 'india',
    popular: true,
    fields: [
      { key: 'supplierId', label: 'Supplier ID', placeholder: 'Supplier ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'MYNTRA',
    label: 'Myntra',
    blurb: 'Partner portal credentials',
    region: 'india',
    fields: [
      { key: 'partnerId', label: 'Partner ID', placeholder: 'Partner ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'AJIO',
    label: 'Ajio',
    blurb: 'Reliance Retail seller credentials',
    region: 'india',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'SNAPDEAL',
    label: 'Snapdeal',
    blurb: 'Seller API credentials',
    region: 'india',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'xAuthToken', label: 'X-Auth token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'JIOMART',
    label: 'JioMart',
    blurb: 'Seller Centre API credentials',
    region: 'india',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', placeholder: 'API secret', secret: true },
    ],
  },
  {
    id: 'NYKAA',
    label: 'Nykaa',
    blurb: 'Marketplace seller credentials',
    region: 'india',
    fields: [
      { key: 'sellerId', label: 'Seller ID', placeholder: 'Seller ID' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'PAYTM_MALL',
    label: 'Paytm Mall',
    blurb: 'Merchant API credentials',
    region: 'india',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', placeholder: 'Merchant ID' },
      { key: 'clientId', label: 'Client ID', placeholder: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret', placeholder: 'Client secret', secret: true },
    ],
  },
  {
    id: 'INDIA_MART',
    label: 'IndiaMART',
    blurb: 'Lead / order API for B2B sellers',
    region: 'india',
    fields: [
      { key: 'glusrId', label: 'GLUSR ID', placeholder: 'GLUSR ID' },
      { key: 'accessToken', label: 'Access token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'ETSY',
    label: 'Etsy',
    blurb: 'Open API key + shop ID',
    region: 'global',
    fields: [
      { key: 'shopId', label: 'Shop ID', placeholder: 'Shop ID' },
      { key: 'accessToken', label: 'Access token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'EBAY',
    label: 'eBay',
    blurb: 'Trading / Sell API credentials',
    region: 'global',
    fields: [
      { key: 'userToken', label: 'User token', placeholder: 'Token', secret: true },
      { key: 'marketplaceId', label: 'Marketplace', placeholder: 'EBAY_IN' },
    ],
  },
  {
    id: 'MAGENTO',
    label: 'Magento',
    blurb: 'Adobe Commerce / Magento REST',
    region: 'self_hosted',
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'accessToken', label: 'Integration token', placeholder: 'Token', secret: true },
    ],
  },
  {
    id: 'OPENCART',
    label: 'OpenCart',
    blurb: 'REST / feed API credentials',
    region: 'self_hosted',
    fields: [
      { key: 'storeUrl', label: 'Store URL', placeholder: 'https://shop.example.com' },
      { key: 'apiKey', label: 'API key', placeholder: 'API key', secret: true },
    ],
  },
  {
    id: 'CUSTOM',
    label: 'Custom API',
    blurb: 'Any REST / CSV feed — Unicommerce, Dukaan, EasyEcom, etc.',
    region: 'self_hosted',
    popular: true,
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com/orders' },
      { key: 'apiKey', label: 'API key', placeholder: 'Bearer / key', secret: true },
      { key: 'marketplaceLabel', label: 'Marketplace label', placeholder: 'e.g. Unicommerce / Dukaan' },
    ],
  },
];

const BROWSE_TABS: Array<{ id: BrowseTab; label: string }> = [
  { id: 'popular', label: 'Popular' },
  { id: 'india', label: 'India marketplaces' },
  { id: 'global', label: 'Global' },
  { id: 'self_hosted', label: 'Self-hosted' },
  { id: 'all', label: 'All' },
];

const ORDER_STATUS_FILTERS: Array<{ value: '' | OrderStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'IMPORTED', label: 'Imported' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
];

const REGION_LABEL: Record<Region, string> = {
  india: 'India',
  global: 'Global',
  self_hosted: 'Self-hosted',
};

function orderStatusTone(status: string): 'green' | 'amber' | 'red' | 'teal' | 'gray' {
  const s = status.toUpperCase();
  if (s === 'FULFILLED') return 'green';
  if (s === 'IMPORTED') return 'teal';
  if (s === 'CANCELLED' || s === 'FAILED') return 'red';
  return 'gray';
}

export default function EcommercePage() {
  const [platforms, setPlatforms] = useState<PlatformDef[]>(FALLBACK_PLATFORMS);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [guideOpen, setGuideOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [browseTab, setBrowseTab] = useState<BrowseTab>('popular');
  const [marketSearch, setMarketSearch] = useState('');
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [platform, setPlatform] = useState('SHOPIFY');
  const [channelName, setChannelName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | OrderStatus>('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [revealedWebhook, setRevealedWebhook] = useState<Record<string, boolean>>({});

  function webhookUrl(channel: Channel): string {
    const base = API_URL.startsWith('http')
      ? API_URL
      : `${typeof window !== 'undefined' ? window.location.origin : ''}${API_URL}`;
    return `${base}/ecommerce/webhook/${channel.id}?token=${channel.webhookToken ?? ''}`;
  }

  async function copyWebhookUrl(channel: Channel) {
    try {
      await navigator.clipboard.writeText(webhookUrl(channel));
      setSuccess('Webhook URL copied to clipboard');
    } catch {
      setError('Could not copy — select and copy the URL manually');
    }
  }

  const platformMeta = useCallback(
    (id: string) =>
      platforms.find((p) => p.id === id) ??
      FALLBACK_PLATFORMS.find((p) => p.id === id) ?? {
        id,
        label: id.replace(/_/g, ' '),
        blurb: 'Marketplace channel',
        region: 'global' as Region,
        fields: [] as CredField[],
      },
    [platforms],
  );

  const selectedPlatform = useMemo(() => platformMeta(platform), [platform, platformMeta]);

  const filteredPlatforms = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    return platforms.filter((p) => {
      if (browseTab === 'popular' && !p.popular) return false;
      if (browseTab === 'india' && p.region !== 'india') return false;
      if (browseTab === 'global' && p.region !== 'global') return false;
      if (browseTab === 'self_hosted' && p.region !== 'self_hosted') return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.blurb.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [platforms, browseTab, marketSearch]);

  const visiblePlatforms = useMemo(() => {
    if (showAllMarkets || browseTab !== 'popular' || marketSearch.trim()) {
      return filteredPlatforms;
    }
    return filteredPlatforms.slice(0, 6);
  }, [filteredPlatforms, showAllMarkets, browseTab, marketSearch]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (channelFilter) params.set('channelId', channelFilter);
    if (statusFilter) params.set('status', statusFilter);
    const qs = params.toString();

    const [c, o, ov, catalog] = await Promise.all([
      apiWithAuth<Channel[]>('/ecommerce/channels'),
      apiWithAuth<Order[]>(`/ecommerce/orders${qs ? `?${qs}` : ''}`),
      apiWithAuth<Overview>('/ecommerce/overview'),
      apiWithAuth<PlatformDef[]>('/ecommerce/platforms').catch(() => FALLBACK_PLATFORMS),
    ]);
    setChannels(c);
    setOrders(o);
    setOverview(ov);
    if (catalog?.length) setPlatforms(catalog);
  }, [channelFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e) => setError(parseError(e)))
      .finally(() => setLoading(false));
  }, [load]);

  function selectPlatform(p: PlatformDef) {
    setPlatform(p.id);
    setCredentials({});
    setChannelName(`${p.label} store`);
  }

  function resetConnectForm() {
    const first = platforms.find((p) => p.popular) ?? platforms[0] ?? FALLBACK_PLATFORMS[0];
    setPlatform(first.id);
    setChannelName(`${first.label} store`);
    setCredentials({});
    setBrowseTab('popular');
    setMarketSearch('');
    setShowAllMarkets(false);
  }

  function openConnect() {
    resetConnectForm();
    setConnectOpen(true);
    setError('');
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = channelName.trim() || `${selectedPlatform.label} store`;
    const creds: Record<string, string> = {};
    for (const field of selectedPlatform.fields) {
      const value = (credentials[field.key] || '').trim();
      if (value) creds[field.key] = value;
    }

    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/ecommerce/channels', {
        method: 'POST',
        body: JSON.stringify({ platform, name, credentials: creds }),
      });
      setSuccess(`${selectedPlatform.label} channel connected`);
      setConnectOpen(false);
      resetConnectForm();
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function syncChannel(id: string) {
    try {
      setSyncingId(id);
      setError('');
      const result = await apiWithAuth<{ imported: number; skipped: number; note?: string; mode?: string }>(
        `/ecommerce/channels/${id}/sync`,
        { method: 'POST' },
      );
      setSuccess(
        result.mode === 'webhook'
          ? result.note || 'This channel receives orders via webhook — see the URL below.'
          : result.imported
            ? `Imported ${result.imported} order${result.imported === 1 ? '' : 's'}${
                result.skipped ? ` · ${result.skipped} skipped` : ''
              }`
            : result.note || 'Sync finished — no new orders',
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleChannel(channel: Channel) {
    try {
      setError('');
      await apiWithAuth(`/ecommerce/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !channel.isActive }),
      });
      setSuccess(channel.isActive ? 'Channel paused' : 'Channel resumed');
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function removeChannel(channel: Channel) {
    const ok = await confirmDialog.confirm({
      title: 'Remove channel?',
      message: `Disconnect “${channel.name}”? Imported orders for this channel will be deleted.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setError('');
      await apiWithAuth(`/ecommerce/channels/${channel.id}`, { method: 'DELETE' });
      if (channelFilter === channel.id) setChannelFilter('');
      setSuccess('Channel removed');
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function setOrderStatus(order: Order, status: OrderStatus) {
    try {
      setBusyOrderId(order.id);
      setError('');
      await apiWithAuth(`/ecommerce/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setSuccess(`Order ${order.externalId} marked ${status.toLowerCase()}`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyOrderId(null);
    }
  }

  const importedCount = overview?.byStatus?.IMPORTED ?? 0;
  const marketplaceCount = overview?.availablePlatforms ?? platforms.length;

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="E-commerce Sync"
        description={`Connect ${marketplaceCount}+ marketplaces and storefronts, pull online orders into RetailSarathi, and track fulfillment from one place.`}
        actions={
          <Button type="button" onClick={openConnect}>
            Connect channel
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <MessageBanner tone="info" autoHideMs={0} alsoToast={false}>
        Named marketplaces (Shopify, Amazon, Flipkart, etc.) are demo mode — Sync now pulls sample orders
        so you can practise the workflow; no live marketplace API calls are made yet, and credentials you
        save are encrypted and held for when a production connector ships. <strong>Custom API</strong> is
        the one real, working path today: connect it to get a webhook URL that any external system
        (Unicommerce, Dukaan, EasyEcom, a Zapier/Make automation, your own storefront) can POST real
        orders to directly.
      </MessageBanner>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Channels"
          value={String(overview?.channelCount ?? 0)}
          hint={`${overview?.activeChannelCount ?? 0} active`}
        />
        <StatCard
          label="Imported orders"
          value={String(overview?.orderCount ?? 0)}
          hint={`${importedCount} awaiting fulfill`}
        />
        <StatCard
          label="Order value"
          value={formatINR(overview?.orderValue ?? 0)}
          hint="Across all channels"
        />
        <StatCard
          label="Marketplaces"
          value={String(marketplaceCount)}
          hint={overview?.lastSyncAt ? `Last sync ${formatDateTime(overview.lastSyncAt)}` : 'Ready to connect'}
        />
      </section>

      <Card className="border-slate-200">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setGuideOpen((o) => !o)}
          aria-expanded={guideOpen}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">How e-commerce sync works</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Browse marketplaces → connect → sync orders → fulfill in RetailSarathi
            </p>
          </div>
          <span className="text-sm font-medium text-teal-700">{guideOpen ? 'Hide' : 'Show'}</span>
        </button>
        {guideOpen ? (
          <ol className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 md:grid-cols-3">
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">1. Pick a marketplace</p>
              <p className="mt-1">
                India (Flipkart, Meesho, Myntra…), global (Shopify, Amazon, Etsy…), or self-hosted /
                custom API.
              </p>
            </li>
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">2. Sync orders</p>
              <p className="mt-1">Pull new marketplace orders. Duplicates are skipped by external order id.</p>
            </li>
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">3. Fulfill here</p>
              <p className="mt-1">Mark orders fulfilled or cancelled as you pack and ship from the counter.</p>
            </li>
          </ol>
        ) : null}
      </Card>

      {connectOpen ? (
        <Card className="border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-white">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Connect a marketplace</h2>
              <p className="text-sm text-slate-500">
                Browse {platforms.length} options — credentials are optional in demo mode.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {BROWSE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setBrowseTab(tab.id);
                  setShowAllMarkets(tab.id !== 'popular');
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  browseTab === tab.id
                    ? 'border-teal-500 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <input
              className={inputClassName}
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Search marketplaces — Meesho, Magento, Nykaa…"
            />
          </div>

          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {visiblePlatforms.length} of {filteredPlatforms.length} shown
            </p>
            {browseTab === 'popular' && !marketSearch.trim() && filteredPlatforms.length > 6 ? (
              <button
                type="button"
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
                onClick={() => setShowAllMarkets((v) => !v)}
              >
                {showAllMarkets ? 'Show popular only' : `Show all ${platforms.length} marketplaces`}
              </button>
            ) : null}
          </div>

          {visiblePlatforms.length ? (
            <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visiblePlatforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPlatform(p)}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-left transition',
                    platform === p.id
                      ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100'
                      : 'border-slate-200 bg-white hover:border-teal-200',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{p.label}</p>
                    <Badge color={p.popular ? 'teal' : 'gray'}>{REGION_LABEL[p.region]}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{p.blurb}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No marketplace match"
              description="Try another search, or pick Custom API for Unicommerce / Dukaan / CSV feeds."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setMarketSearch('');
                    setBrowseTab('all');
                    const custom = platforms.find((p) => p.id === 'CUSTOM');
                    if (custom) selectPlatform(custom);
                  }}
                >
                  Use Custom API
                </Button>
              }
            />
          )}

          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            Selected: <span className="font-semibold text-slate-900">{selectedPlatform.label}</span>
            <span className="text-slate-400"> · </span>
            {REGION_LABEL[selectedPlatform.region]}
          </div>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void createChannel(e)}>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Channel name</span>
              <input
                className={inputClassName}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder={`${selectedPlatform.label} store`}
                required
              />
            </label>
            {selectedPlatform.fields.map((field) => (
              <label key={field.key} className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{field.label}</span>
                <input
                  className={inputClassName}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="off"
                  value={credentials[field.key] || ''}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Connecting…' : `Connect ${selectedPlatform.label}`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConnectOpen(false)}>
                Close
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
            <p className="text-sm text-slate-500">Pause sync, pull orders, or remove a marketplace link.</p>
          </div>
          {!connectOpen ? (
            <Button type="button" variant="secondary" onClick={openConnect}>
              Add another marketplace
            </Button>
          ) : null}
        </div>

        {loading ? (
          <AppLoader label="Loading channels…" />
        ) : !channels.length ? (
          <EmptyState
            title="No channels yet"
            description="Connect Flipkart, Meesho, Shopify, Amazon, WooCommerce, or any custom order API."
            action={
              <Button type="button" onClick={openConnect}>
                Browse marketplaces
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {channels.map((channel) => {
              const meta = platformMeta(channel.platform);
              const orderCount = channel._count?.orders ?? 0;
              return (
                <Card
                  key={channel.id}
                  className={cn('border-slate-200', !channel.isActive && 'opacity-80')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {channel.name}
                        </h3>
                        <Badge color={channel.isActive ? 'green' : 'gray'}>
                          {channel.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {meta.label}
                        <span className="text-slate-300"> · </span>
                        {REGION_LABEL[meta.region]}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Orders
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">{orderCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Last sync
                      </dt>
                      <dd className="mt-0.5 font-medium text-slate-700">
                        {channel.lastSyncAt ? formatDateTime(channel.lastSyncAt) : 'Never'}
                      </dd>
                    </div>
                  </dl>

                  {channel.platform === 'CUSTOM' ? (
                    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2.5 text-xs">
                      <p className="font-semibold text-teal-900">Webhook URL (real orders, not demo)</p>
                      <p className="mt-1 break-all font-mono text-teal-800">
                        {revealedWebhook[channel.id]
                          ? webhookUrl(channel)
                          : `${webhookUrl(channel).split('token=')[0]}token=••••••••••••`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setRevealedWebhook((prev) => ({ ...prev, [channel.id]: !prev[channel.id] }))
                          }
                        >
                          {revealedWebhook[channel.id] ? 'Hide' : 'Reveal'}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void copyWebhookUrl(channel)}>
                          Copy
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {channel.platform !== 'CUSTOM' ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!channel.isActive || syncingId === channel.id}
                        onClick={() => void syncChannel(channel.id)}
                      >
                        {syncingId === channel.id ? 'Syncing…' : 'Sync now'}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void toggleChannel(channel)}
                    >
                      {channel.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setChannelFilter(channel.id);
                        setStatusFilter('');
                      }}
                    >
                      View orders
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void removeChannel(channel)}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card className="border-slate-200">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Imported orders</h2>
            <p className="text-sm text-slate-500">
              Filter by channel or status, then mark fulfilled after packing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className={cn(selectClassName, 'min-w-[10rem]')}
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className={cn(selectClassName, 'min-w-[10rem]')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | OrderStatus)}
            >
              {ORDER_STATUS_FILTERS.map((f) => (
                <option key={f.value || 'all'} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {(channelFilter || statusFilter) && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setChannelFilter('');
                  setStatusFilter('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <AppLoader label="Loading orders…" />
        ) : !orders.length ? (
          <EmptyState
            title="No orders yet"
            description={
              channels.length
                ? 'Run Sync now on a channel to import marketplace orders.'
                : 'Connect a marketplace first, then sync to pull orders.'
            }
            action={
              channels[0] ? (
                <Button
                  type="button"
                  disabled={!channels[0].isActive || syncingId === channels[0].id}
                  onClick={() => void syncChannel(channels[0].id)}
                >
                  Sync first channel
                </Button>
              ) : (
                <Button type="button" onClick={openConnect}>
                  Browse marketplaces
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Order</th>
                  <th className={tableHeaderClassName}>Channel</th>
                  <th className={tableHeaderClassName}>Customer</th>
                  <th className={tableHeaderClassName}>Amount</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={tableHeaderClassName}>Imported</th>
                  <th className={tableHeaderClassName}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className={tableCellClassName}>
                      <p className="font-medium text-slate-900">{order.externalId}</p>
                    </td>
                    <td className={tableCellClassName}>
                      <p>{order.channel?.name ?? '—'}</p>
                      <p className="text-xs text-slate-500">
                        {platformMeta(order.channel?.platform || '').label}
                      </p>
                    </td>
                    <td className={tableCellClassName}>{order.customerName || '—'}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(order.totalAmount))}</td>
                    <td className={tableCellClassName}>
                      <Badge color={orderStatusTone(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className={tableCellClassName}>{formatDateTime(order.createdAt)}</td>
                    <td className={tableCellClassName}>
                      <div className="flex justify-end">
                        <RowActionsMenu
                          actions={[
                            {
                              key: 'fulfill',
                              label: 'Fulfill',
                              hidden: order.status !== 'IMPORTED',
                              disabled: busyOrderId === order.id,
                              onClick: () => void setOrderStatus(order, 'FULFILLED'),
                            },
                            {
                              key: 'cancel',
                              label: 'Cancel',
                              tone: 'danger',
                              hidden: order.status !== 'IMPORTED',
                              disabled: busyOrderId === order.id,
                              onClick: () => void setOrderStatus(order, 'CANCELLED'),
                            },
                            {
                              key: 'reopen',
                              label: 'Reopen',
                              hidden: order.status === 'IMPORTED',
                              disabled: busyOrderId === order.id,
                              onClick: () => void setOrderStatus(order, 'IMPORTED'),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
