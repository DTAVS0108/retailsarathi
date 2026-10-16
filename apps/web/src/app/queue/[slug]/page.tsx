'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { API_URL } from '@/lib/api';

interface QueueResponse {
  shopName: string;
  queue: string[];
}

const POLL_MS = 10_000;

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function PublicRepairQueuePage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const branchId = searchParams.get('branchId') ?? '';
  const [data, setData] = useState<QueueResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const clock = useClock();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const suffix = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        const res = await fetch(`${API_URL}/repairs/public-queue/${params.slug}${suffix}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('fetch failed');
        const json = (await res.json()) as QueueResponse;
        if (!cancelled) {
          setData(json);
          setOffline(false);
          setNotFound(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    }
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.slug, branchId]);

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-slate-400">
        <div>
          <p className="text-lg font-medium text-slate-300">Queue display not found.</p>
          <p className="mt-2 text-sm">Check the shop link and try again.</p>
        </div>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const [primary, ...rest] = queue;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,#0f2f2c,transparent_55%)] bg-slate-950 text-white">
      <style>{`
        @keyframes queue-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.35), 0 0 40px 4px rgba(45, 212, 191, 0.15); }
          50% { box-shadow: 0 0 0 8px rgba(45, 212, 191, 0.08), 0 0 60px 12px rgba(45, 212, 191, 0.25); }
        }
        .queue-primary { animation: queue-glow 2.6s ease-in-out infinite; }
      `}</style>

      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-teal-300 sm:text-base">
              {data?.shopName ?? 'RetailSarathi'}
            </p>
            <p className="text-[11px] leading-tight text-slate-500 sm:text-xs">Repair pickup counter</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-400' : 'bg-emerald-400'}`}
            title={offline ? 'Reconnecting…' : 'Live'}
          />
          {clock ? (
            <p className="font-mono text-sm tabular-nums text-slate-400 sm:text-base">
              {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">Now Serving</p>

        {primary ? (
          <>
            <div className="queue-primary mt-6 flex min-w-[280px] items-center justify-center rounded-3xl border border-teal-400/40 bg-teal-500/10 px-10 py-8 sm:min-w-[420px] sm:px-16 sm:py-12">
              <span className="font-mono text-5xl font-bold tracking-wide text-teal-200 sm:text-7xl">
                {primary}
              </span>
            </div>

            {rest.length > 0 ? (
              <div className="mt-10 w-full max-w-3xl">
                <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
                  Also ready
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {rest.map((jobNumber) => (
                    <div
                      key={jobNumber}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 font-mono text-lg font-semibold text-slate-200 sm:text-xl"
                    >
                      {jobNumber}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-14 w-14 opacity-40">
              <path d="M9 12h6M9 16h6M9 8h6M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
            </svg>
            <p className="text-lg font-medium text-slate-400">No repairs ready for pickup right now.</p>
            <p className="text-sm text-slate-600">This screen updates automatically.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-3 text-center">
        <p className="text-[11px] text-slate-600">
          {offline ? 'Reconnecting…' : `Updates automatically every ${POLL_MS / 1000}s`}
        </p>
      </footer>
    </div>
  );
}
