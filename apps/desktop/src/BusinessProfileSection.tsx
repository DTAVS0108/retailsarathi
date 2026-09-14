import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiFetch } from './api';
import { resolveUploadUrl } from './api';
import { BrandMark } from './BrandMark';

type TenantProfile = {
  name?: string;
  logoUrl?: string | null;
};

export function BusinessProfileSection({
  token,
  apiFetch,
  apiUrl,
  onProfileChange,
}: {
  token: string | null;
  apiFetch: ApiFetch;
  apiUrl: string;
  onProfileChange?: (profile: { shopName: string; logoUrl: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shopName, setShopName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        setLoading(true);
        const profile = await apiFetch<TenantProfile>(token, '/tenants/profile');
        const name = (profile.name || '').trim();
        const logo = profile.logoUrl ?? null;
        setShopName(name);
        setLogoUrl(logo);
        if (name) localStorage.setItem('rs_desktop_shop_name', name);
        if (logo) localStorage.setItem('rs_desktop_shop_logo', logo);
        else localStorage.removeItem('rs_desktop_shop_logo');
        onProfileChange?.({ shopName: name, logoUrl: logo });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, apiFetch]);

  async function upload(file: File) {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiFetch<{ logoUrl: string }>(token, '/tenants/logo', { method: 'POST', body });
      setLogoUrl(res.logoUrl);
      localStorage.setItem('rs_desktop_shop_logo', res.logoUrl);
      onProfileChange?.({ shopName, logoUrl: res.logoUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(token, '/tenants/logo', { method: 'DELETE' });
      setLogoUrl(null);
      localStorage.removeItem('rs_desktop_shop_logo');
      onProfileChange?.({ shopName, logoUrl: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Section title="Business profile" hint="Sign in to upload your shop logo and sync shop name from the server.">
        <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
          Connect and sign in to manage your shop logo.
        </p>
      </Section>
    );
  }

  const preview = resolveUploadUrl(apiUrl, logoUrl);

  return (
    <Section title="Business profile" hint="Shop logo appears in the desktop header — synced with web and mobile.">
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
          Loading profile…
        </p>
      ) : (
        <div
          className="flex flex-wrap items-center gap-4"
          style={{
            borderRadius: 'var(--rs-radius)',
            border: '1px solid var(--rs-border)',
            background: 'var(--rs-surface)',
            padding: '1.1rem 1.25rem',
          }}
        >
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[var(--rs-border)] bg-white">
            {preview ? (
              <img src={preview} alt={shopName || 'Shop logo'} className="h-full w-full object-contain p-1" />
            ) : (
              <BrandMark size={56} title={shopName || 'Shop'} apiUrl={apiUrl} />
            )}
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            {shopName ? (
              <div className="text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {shopName}
              </div>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{
                background: 'var(--rs-accent-soft)',
                color: 'var(--rs-accent)',
              }}
            >
              {busy ? 'Uploading…' : preview ? 'Replace logo' : 'Upload logo'}
            </button>
            {preview ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="text-left text-sm font-medium text-red-600"
              >
                Remove logo
              </button>
            ) : null}
            <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
              JPEG, PNG, WebP or GIF · max 2 MB
            </p>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h3 className="mb-1 text-base font-bold" style={{ color: 'var(--rs-ink)' }}>
        {title}
      </h3>
      {hint ? (
        <p className="mb-4 text-sm" style={{ color: 'var(--rs-muted)' }}>
          {hint}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}
