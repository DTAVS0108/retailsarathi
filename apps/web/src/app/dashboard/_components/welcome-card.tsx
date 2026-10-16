'use client';

import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/helpers';
import { useShopBranding } from '@/lib/shop-branding';

function greetingFor(hour: number) {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Working late';
}

/** Live clock + date, personalized greeting — the dashboard's visual anchor. Ticks every second
    via a plain client interval; no server round-trip needed since this is purely presentational. */
export function WelcomeCard() {
  const [now, setNow] = useState<Date | null>(null);
  const { shopName } = useShopBranding();

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const user = getStoredUser();
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 shadow-sm sm:p-8"
      style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)' }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full"
        style={{ backgroundColor: 'var(--rs-header-ink)', opacity: 0.08 }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full"
        style={{ backgroundColor: 'var(--rs-header-ink)', opacity: 0.08 }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium opacity-90">
            {now ? greetingFor(now.getHours()) : 'Welcome'}, {firstName} 👋
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{shopName || 'Your shop'}</h1>
          <p className="mt-1 text-sm opacity-80">Here's what's happening right now.</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">
            {now
              ? now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--:--:--'}
          </p>
          <p className="text-xs opacity-80">
            {now ? now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
