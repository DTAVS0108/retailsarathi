'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiWithAuth, getToken } from '@/lib/helpers';

/** Product brand — marketing, login (pre-auth), OS labels. */
export const PRODUCT_NAME = 'RetailSarathi';

const STORAGE_KEY = 'rs_shop_branding';
const CHANGE_EVENT = 'rs-shop-branding';

export type ShopBranding = {
  shopName: string;
  ownerName: string;
  logoUrl: string;
};

type ShopBrandingContextValue = {
  /** Display title for chrome (shop name, or product fallback). */
  shopName: string;
  ownerName: string;
  logoUrl: string;
  /** True when a real tenant shop name is known. */
  hasShopName: boolean;
  refresh: () => Promise<void>;
  setBranding: (next: Partial<ShopBranding>) => void;
};

const ShopBrandingContext = createContext<ShopBrandingContextValue | null>(null);

function readStored(): ShopBranding {
  if (typeof window === 'undefined') return { shopName: '', ownerName: '', logoUrl: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shopName: '', ownerName: '', logoUrl: '' };
    const parsed = JSON.parse(raw) as Partial<ShopBranding>;
    return {
      shopName: String(parsed.shopName ?? '').trim(),
      ownerName: String(parsed.ownerName ?? '').trim(),
      logoUrl: String(parsed.logoUrl ?? '').trim(),
    };
  } catch {
    return { shopName: '', ownerName: '', logoUrl: '' };
  }
}

export function writeShopBranding(next: Partial<ShopBranding>) {
  if (typeof window === 'undefined') return;
  const current = readStored();
  const merged: ShopBranding = {
    shopName: next.shopName !== undefined ? String(next.shopName).trim() : current.shopName,
    ownerName: next.ownerName !== undefined ? String(next.ownerName).trim() : current.ownerName,
    logoUrl: next.logoUrl !== undefined ? String(next.logoUrl).trim() : current.logoUrl,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearShopBranding() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function displayShopName(shopName?: string | null) {
  const name = (shopName ?? '').trim();
  return name || PRODUCT_NAME;
}

export function ShopBrandingProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<ShopBranding>({ shopName: '', ownerName: '', logoUrl: '' });

  const syncFromStorage = useCallback(() => {
    setStored(readStored());
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const [profile, me] = await Promise.all([
        apiWithAuth<{ name?: string; logoUrl?: string | null }>('/tenants/profile'),
        apiWithAuth<{ name?: string }>('/auth/me').catch(() => ({ name: undefined })),
      ]);
      writeShopBranding({
        shopName: profile.name ?? '',
        ownerName: me.name ?? readStored().ownerName,
        logoUrl: profile.logoUrl ?? '',
      });
      setStored(readStored());
    } catch {
      /* keep cached branding */
    }
  }, []);

  useEffect(() => {
    syncFromStorage();
    void refresh();
    const onChange = () => syncFromStorage();
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh, syncFromStorage]);

  const value = useMemo<ShopBrandingContextValue>(
    () => ({
      shopName: displayShopName(stored.shopName),
      ownerName: stored.ownerName,
      logoUrl: stored.logoUrl,
      hasShopName: stored.shopName.trim().length > 0,
      refresh,
      setBranding: writeShopBranding,
    }),
    [stored.shopName, stored.ownerName, stored.logoUrl, refresh],
  );

  return <ShopBrandingContext.Provider value={value}>{children}</ShopBrandingContext.Provider>;
}

export function useShopBranding(): ShopBrandingContextValue {
  const ctx = useContext(ShopBrandingContext);
  if (ctx) return ctx;
  // Fallback for rare use outside provider (reads local cache only).
  const stored = typeof window !== 'undefined' ? readStored() : { shopName: '', ownerName: '', logoUrl: '' };
  return {
    shopName: displayShopName(stored.shopName),
    ownerName: stored.ownerName,
    logoUrl: stored.logoUrl,
    hasShopName: stored.shopName.trim().length > 0,
    refresh: async () => undefined,
    setBranding: writeShopBranding,
  };
}
