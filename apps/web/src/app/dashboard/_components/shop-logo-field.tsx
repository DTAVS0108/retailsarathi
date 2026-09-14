'use client';

import { useRef, useState } from 'react';
import { Button } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { resolveUploadUrl } from '@/lib/upload-url';
import { BrandMark } from '@/app/_components/brand-logo';
import { parseError } from '@/app/dashboard/_components/dashboard-ui';

type ShopLogoFieldProps = {
  logoUrl?: string | null;
  shopName?: string;
  onChange: (logoUrl: string | null) => void;
};

export function ShopLogoField({ logoUrl, shopName, onChange }: ShopLogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = resolveUploadUrl(logoUrl);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiWithAuth<{ logoUrl: string }>('/tenants/logo', { method: 'POST', body });
      onChange(res.logoUrl);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await apiWithAuth('/tenants/logo', { method: 'DELETE' });
      onChange(null);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-slate-700">Shop logo</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={shopName || 'Shop logo'} className="h-full w-full object-contain p-1" />
          ) : (
            <BrandMark size={56} title={shopName || 'Shop'} />
          )}
        </div>
        <div className="flex flex-col gap-2">
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
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Uploading…' : preview ? 'Replace logo' : 'Upload logo'}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
              Remove logo
            </Button>
          ) : null}
          <p className="max-w-xs text-xs text-slate-500">JPEG, PNG, WebP or GIF · max 2 MB · shown in app header</p>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
