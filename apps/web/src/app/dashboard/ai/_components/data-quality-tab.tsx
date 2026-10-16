'use client';

import { Fragment, useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { inputClassName, parseError, tableCellClassName, tableHeaderClassName } from '../../_components/dashboard-ui';
import { NavIcon } from '../../_components/nav-icons';
import { stickyTheadClassName, zebraRowClassName } from './table-shared';

type ImeiEntry = { serialId: string; productName: string; status: string; serialNumber: string };
type ImeiGroup = { imei: string; count: number; entries: ImeiEntry[]; risk: string; message: string };

export function DataQualityTab() {
  const [imeiAlerts, setImeiAlerts] = useState<ImeiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [ocrText, setOcrText] = useState('Name: Rajesh\nPhone: 9876543210\nBarcode: 8901234567890\nQty: 2');
  const [ocrHints, setOcrHints] = useState<Array<Record<string, unknown>>>([]);
  const [ocrOpen, setOcrOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await apiWithAuth<ImeiGroup[]>('/ai/duplicate-imei');
        setImeiAlerts(res);
      } catch (err) {
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(imei: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(imei)) next.delete(imei);
      else next.add(imei);
      return next;
    });
  }

  async function runOcrHints() {
    try {
      const res = await apiWithAuth<{ suggestions: Array<Record<string, unknown>> }>('/ai/ocr-hints', {
        method: 'POST',
        body: JSON.stringify({ text: ocrText }),
      });
      setOcrHints(res.suggestions);
    } catch (err) {
      setError(parseError(err));
    }
  }

  const filtered = imeiAlerts.filter((g) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return g.imei.toLowerCase().includes(q) || g.entries.some((e) => e.productName.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Duplicate IMEI alerts</h3>
            <p className="text-xs text-slate-500">Same IMEI recorded on more than one serial — possible fraud or data entry error.</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search IMEI or product…"
            className={`${inputClassName} w-56`}
          />
        </div>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {!loading && !filtered.length ? (
          <p className="py-8 text-center text-sm text-slate-500">{search ? 'No matches.' : 'No duplicate IMEIs detected.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={stickyTheadClassName}>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">IMEI</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Occurrences</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Products affected</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Risk</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <Fragment key={g.imei}>
                    <tr
                      onClick={() => toggle(g.imei)}
                      className={`${zebraRowClassName} cursor-pointer`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-800">{g.imei}</td>
                      <td className="px-4 py-2.5 text-slate-600">{g.count}×</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {[...new Set(g.entries.map((e) => e.productName))].join(', ')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                          <NavIcon name="compliance" className="h-3 w-3" />
                          {g.risk}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400">{expanded.has(g.imei) ? '▲' : '▼'}</td>
                    </tr>
                    {expanded.has(g.imei) ? (
                      <tr className="border-t border-slate-100 bg-slate-50/70">
                        <td colSpan={5} className="px-4 py-3">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="px-2 py-1 text-left font-medium">Product</th>
                                <th className="px-2 py-1 text-left font-medium">Serial number</th>
                                <th className="px-2 py-1 text-left font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.entries.map((e) => (
                                <tr key={e.serialId} className="border-t border-slate-200">
                                  <td className="px-2 py-1.5">{e.productName}</td>
                                  <td className="px-2 py-1.5 font-mono">{e.serialNumber}</td>
                                  <td className="px-2 py-1.5">{e.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-slate-200">
        <button
          type="button"
          onClick={() => setOcrOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="text-base font-semibold">Auto-matched fields (utility)</h3>
            <p className="text-xs text-slate-500">Keyword/pattern matching on pasted text, not image OCR or machine learning.</p>
          </div>
          <span className="text-slate-400">{ocrOpen ? '▲' : '▼'}</span>
        </button>
        {ocrOpen ? (
          <div className="mt-3 space-y-3">
            <textarea className="w-full rounded-xl border border-slate-200 p-3 text-sm" rows={6} value={ocrText} onChange={(e) => setOcrText(e.target.value)} />
            <Button type="button" onClick={() => void runOcrHints()}>
              Analyze text
            </Button>
            {ocrHints.length ? (
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={tableHeaderClassName}>Line</th>
                    <th className={tableHeaderClassName}>Suggestion</th>
                    <th className={tableHeaderClassName}>Match confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {ocrHints.map((h, i) => (
                    <tr key={i}>
                      <td className={tableCellClassName}>{String(h.line)}</td>
                      <td className={tableCellClassName}>{String(h.suggestion)}</td>
                      <td className={tableCellClassName}>{Math.round(Number(h.confidence ?? 0) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
