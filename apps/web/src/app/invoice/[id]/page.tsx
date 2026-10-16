'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_URL } from '@/lib/api';

interface PublicInvoiceResponse {
  html: string;
  invoiceNumber: string;
}

/** Public, unauthenticated, permanent page a customer lands on after scanning the QR printed on
    their invoice — plain fetch against the public API route, no auth header, no expiry. */
export default function PublicInvoiceViewPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<PublicInvoiceResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/invoices/public/${params.id}/view`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('fetch failed');
        const json = (await res.json()) as PublicInvoiceResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div>
          <p className="text-lg font-medium text-slate-700">Invoice not found.</p>
          <p className="mt-2 text-sm text-slate-500">Check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div>
          <p className="text-lg font-medium text-slate-700">Couldn&apos;t load this invoice.</p>
          <p className="mt-2 text-sm text-slate-500">Check your connection and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-8">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Invoice{data?.invoiceNumber ? ` ${data.invoiceNumber}` : ''}
          </p>
          <p className="text-xs text-slate-500">RetailSarathi</p>
        </div>
        <button
          type="button"
          disabled={!data}
          onClick={() => iframeRef.current?.contentWindow?.print()}
          className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Print
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-2 py-4 sm:px-6 sm:py-8">
        {data ? (
          <iframe
            ref={iframeRef}
            srcDoc={data.html}
            title={`Invoice ${data.invoiceNumber}`}
            className="h-[85vh] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
          />
        ) : (
          <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
        )}
      </main>
    </div>
  );
}
