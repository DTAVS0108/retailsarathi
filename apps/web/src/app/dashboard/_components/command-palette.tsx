'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { NAV_SECTIONS, type NavLink, type NavSection } from './nav-sections';
import { NavIcon } from './nav-icons';

export const OPEN_COMMAND_PALETTE_EVENT = 'rs:open-command-palette';

/** Open the command palette from chrome outside its own keyboard shortcut. */
export function requestOpenCommandPalette() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

type PageResult = { kind: 'page'; id: string; icon: string; label: string; href: string; sectionTitle: string; description?: string };
type PartyResult = {
  kind: 'party';
  id: string;
  label: string;
  href: string;
  sub: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
};
type Result = PageResult | PartyResult;

type PartyHit = {
  type: 'CUSTOMER' | 'SUPPLIER';
  id: string;
  name: string;
  phone?: string | null;
  gstin?: string | null;
  balance: number;
  href: string;
};

const ALL_PAGES: PageResult[] = NAV_SECTIONS.flatMap((section: NavSection) =>
  section.items.map((item: NavLink) => ({
    kind: 'page' as const,
    id: item.id,
    icon: item.icon,
    label: item.label,
    href: item.href,
    sectionTitle: section.title,
    description: item.description,
  })),
);

function matchesQuery(page: PageResult, q: string) {
  const haystack = `${page.label} ${page.sectionTitle} ${page.description ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [parties, setParties] = useState<PartyResult[]>([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_PAGES.slice(0, 8);
    return ALL_PAGES.filter((p) => matchesQuery(p, q)).slice(0, 8);
  }, [query]);

  const results: Result[] = useMemo(() => [...pageResults, ...parties], [pageResults, parties]);

  useEffect(() => {
    function onRequestOpen() {
      setOpen(true);
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onRequestOpen);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onRequestOpen);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setParties([]);
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = results[activeIndex];
        if (pick) {
          setOpen(false);
          router.push(pick.href);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, activeIndex, router]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setParties([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setLoadingParties(true);
        try {
          const res = await apiWithAuth<{ parties: PartyHit[] }>(
            `/parties/search?q=${encodeURIComponent(trimmed)}&limit=6`,
          );
          setParties(
            (res.parties ?? []).map((p) => ({
              kind: 'party' as const,
              id: `${p.type}-${p.id}`,
              label: p.name,
              href: p.href,
              partyType: p.type,
              sub: [p.phone, p.gstin].filter(Boolean).join(' · ') || (Math.abs(p.balance) > 0.009 ? formatINR(p.balance) : ''),
            })),
          );
        } catch {
          setParties([]);
        } finally {
          setLoadingParties(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  if (!open) return null;

  function pick(r: Result) {
    setOpen(false);
    router.push(r.href);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--rs-surface)', borderColor: 'var(--rs-border)', color: 'var(--rs-ink)' }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--rs-border)' }}>
          <span className="shrink-0" style={{ color: 'var(--rs-muted)' }}>
            <NavIcon name="search" className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, customer, or supplier…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--rs-ink)' }}
            aria-label="Command palette search"
          />
          <kbd className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-muted)' }}>
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {pageResults.length > 0 ? (
            <div className="px-2 pb-1">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                Pages
              </p>
              {pageResults.map((r) => {
                const idx = results.indexOf(r);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition"
                    style={{ background: idx === activeIndex ? 'var(--rs-accent-soft)' : 'transparent' }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--rs-surface-2)' }}>
                      <NavIcon name={r.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.label}</span>
                      <span className="block truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {r.sectionTitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {parties.length > 0 || loadingParties ? (
            <div className="px-2 pt-1">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                Customers &amp; Suppliers
              </p>
              {loadingParties ? (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
                  Searching…
                </p>
              ) : (
                parties.map((r) => {
                  const idx = results.indexOf(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pick(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition"
                      style={{ background: idx === activeIndex ? 'var(--rs-accent-soft)' : 'transparent' }}
                    >
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{
                          background: r.partyType === 'CUSTOMER' ? 'var(--rs-accent-soft)' : '#FEF3C7',
                          color: r.partyType === 'CUSTOMER' ? 'var(--rs-accent)' : '#92400E',
                        }}
                      >
                        {r.partyType === 'CUSTOMER' ? 'Cust' : 'Supp'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.label}</span>
                        {r.sub ? (
                          <span className="block truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                            {r.sub}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}

          {results.length === 0 && !loadingParties ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>
              No matches for &ldquo;{query}&rdquo;.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
