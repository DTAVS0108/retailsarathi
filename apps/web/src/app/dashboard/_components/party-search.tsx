'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { cn, inputClassName, parseError } from './dashboard-ui';

type PartyHit = {
  type: 'CUSTOMER' | 'SUPPLIER';
  id: string;
  name: string;
  phone?: string | null;
  gstin?: string | null;
  balance: number;
  isMsme?: boolean;
  href: string;
};

export function PartySearch({
  className,
  variant = 'default',
}: {
  className?: string;
  /** onHeader = translucent field for themed top chrome */
  variant?: 'default' | 'onHeader';
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PartyHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setError('');
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError('');
        try {
          const res = await apiWithAuth<{ parties: PartyHit[] }>(
            `/parties/search?q=${encodeURIComponent(trimmed)}&limit=12`,
          );
          setHits(res.parties ?? []);
          setOpen(true);
        } catch (e) {
          setError(parseError(e));
          setHits([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const onHeader = variant === 'onHeader';

  return (
    <div ref={wrapRef} className={cn('relative min-w-0', className)}>
      <input
        className={cn(
          inputClassName,
          'h-9 py-1.5 text-sm',
          onHeader && 'rs-on-header-field border-0 shadow-none',
        )}
        placeholder="Search customer or supplier…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (hits.length) setOpen(true);
        }}
        aria-label="Unified party search"
      />
      {open && (hits.length > 0 || loading || error) ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border py-1 shadow-lg"
          style={{
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-surface)',
            color: 'var(--rs-ink)',
          }}
        >
          {loading ? (
            <p className="px-3 py-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
              Searching…
            </p>
          ) : error ? (
            <p className="px-3 py-2 text-xs text-rose-700">{error}</p>
          ) : (
            hits.map((p) => (
              <Link
                key={`${p.type}-${p.id}`}
                href={p.href}
                className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-rs-surface-2"
                onClick={() => {
                  setOpen(false);
                  setQ('');
                }}
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    p.type === 'CUSTOMER' ? 'bg-brand-light text-brand' : 'bg-amber-50 text-amber-900',
                  )}
                >
                  {p.type === 'CUSTOMER' ? 'Cust' : 'Supp'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-rs-ink">{p.name}</span>
                  <span className="block truncate text-xs text-rs-muted">
                    {[p.phone, p.gstin].filter(Boolean).join(' · ') || '—'}
                    {Math.abs(p.balance) > 0.009 ? ` · ${formatINR(p.balance)}` : ''}
                    {p.isMsme ? ' · MSME' : ''}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
