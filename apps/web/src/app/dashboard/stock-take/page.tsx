'use client';

import { AppLoader } from '@/app/_components/app-loader';

import { confirmDialog } from '@/app/_components/confirm-dialog';



import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Card } from '@retail-sarathi/ui';

import { apiWithAuth } from '@/lib/helpers';

import {

  pageShellClassName,

  MessageBanner,

  PageHeader,

  StatusBadge,

  cn,

  formatDate,

  inputClassName,

  parseError,

  selectClassName,

  tableCellClassName,

  tableHeaderClassName,

  toNumber,

} from '../_components/dashboard-ui';



const VARIANCE_REASONS = [

  { value: '', label: '— reason —' },

  { value: 'shrink', label: 'Shrink / theft' },

  { value: 'damage', label: 'Damage' },

  { value: 'found', label: 'Found stock' },

  { value: 'recount', label: 'Recount error' },

  { value: 'other', label: 'Other' },

] as const;



interface StockTakeLine {

  id: string;

  systemQty: number | string;

  countedQty: number | string | null;

  variance: number | null;

  varianceReason?: string | null;

  product: { id: string; name: string; sku: string };

}



interface StockTake {

  id: string;

  status: string;

  notes?: string | null;

  createdAt: string;

  completedAt?: string | null;

  branch?: { name: string } | null;

  lineCount?: number;

  countedLines?: number;

  uncountedLines?: number;

  varianceLines?: number;

  varianceQty?: number;

  missingFields?: string[];

  missingReasons?: number;

  progressPct?: number;

  lines: StockTakeLine[];

}



type AbcCyclePlan = {

  dueCount: number;

  due: Array<{ id: string; name: string; sku: string; abcGrade?: string | null }>;

  productIdsByGrade: { A: string[]; B: string[]; C: string[] };

};



export default function StockTakePage() {

  const [takes, setTakes] = useState<StockTake[]>([]);

  const [activeTake, setActiveTake] = useState<StockTake | null>(null);

  const [counts, setCounts] = useState<Record<string, string>>({});

  const [reasons, setReasons] = useState<Record<string, string>>({});

  const [notes, setNotes] = useState('');

  const [category, setCategory] = useState('');

  const [abcGrades, setAbcGrades] = useState<string[]>([]);

  const [abcPlan, setAbcPlan] = useState<AbcCyclePlan | null>(null);

  const [scanCode, setScanCode] = useState('');

  const [varianceOnly, setVarianceOnly] = useState(false);

  const [uncountedOnly, setUncountedOnly] = useState(false);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const [success, setSuccess] = useState('');

  const scanRef = useRef<HTMLInputElement>(null);



  function hydrateTake(take: StockTake) {

    const initialCounts: Record<string, string> = {};

    const initialReasons: Record<string, string> = {};

    for (const l of take.lines) {

      initialCounts[l.id] = l.countedQty != null ? String(l.countedQty) : '';

      initialReasons[l.id] = l.varianceReason ?? '';

    }

    setCounts(initialCounts);

    setReasons(initialReasons);

  }



  async function load() {

    try {

      setError('');

      const list = await apiWithAuth<StockTake[]>('/stock-takes');

      setTakes(list);

      const open = list.find((t) => t.status === 'OPEN' || t.status === 'PENDING_APPROVAL');

      if (open) {

        setActiveTake(open);

        hydrateTake(open);

      } else {

        setActiveTake(null);

        setCounts({});

        setReasons({});

      }

    } catch (e) {

      setError(parseError(e));

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    void load();

  }, []);



  const visibleLines = useMemo(() => {

    if (!activeTake) return [];

    return activeTake.lines.filter((l) => {

      const countedRaw = counts[l.id];

      const hasCount = countedRaw !== undefined && countedRaw !== '';

      const counted = hasCount ? toNumber(countedRaw) : null;

      const variance = counted == null ? null : counted - toNumber(l.systemQty);

      if (uncountedOnly && hasCount) return false;

      if (varianceOnly && !(variance != null && Math.abs(variance) >= 0.001)) return false;

      return true;

    });

  }, [activeTake, counts, varianceOnly, uncountedOnly]);



  async function loadAbcCycle() {

    setSaving(true);

    setError('');

    try {

      const plan = await apiWithAuth<AbcCyclePlan>('/stock-takes/abc-cycle');

      setAbcPlan(plan);

      setSuccess(`${plan.dueCount} product(s) due for ABC cycle count.`);

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  async function startTake(opts?: { productIds?: string[] }) {

    setSaving(true);

    setError('');

    setSuccess('');

    try {

      const take = await apiWithAuth<StockTake>('/stock-takes', {

        method: 'POST',

        body: JSON.stringify({

          notes: notes.trim() || undefined,

          category: category.trim() || undefined,

          abcGrades: abcGrades.length ? abcGrades : undefined,

          productIds: opts?.productIds,

        }),

      });

      setNotes('');

      setCategory('');

      setAbcGrades([]);

      setAbcPlan(null);

      setSuccess(`Stock take started — ${take.lines.length} products.`);

      await load();

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  async function startAbcDue() {

    if (!abcPlan?.due.length) {

      await loadAbcCycle();

      return;

    }

    const ids = abcPlan.due.map((p) => p.id);

    await startTake({ productIds: ids });

  }



  function toggleGrade(g: string) {

    setAbcGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  }



  async function handleScan(e: React.FormEvent) {

    e.preventDefault();

    if (!activeTake || !scanCode.trim()) return;

    setSaving(true);

    setError('');

    try {

      const updated = await apiWithAuth<StockTake>(`/stock-takes/${activeTake.id}/scan`, {

        method: 'POST',

        body: JSON.stringify({ code: scanCode.trim() }),

      });

      setActiveTake(updated);

      hydrateTake(updated);

      setScanCode('');

      setSuccess('Scan counted +1');

      scanRef.current?.focus();

      await load();

    } catch (err) {

      setError(parseError(err));

    } finally {

      setSaving(false);

    }

  }



  async function saveCounts() {

    if (!activeTake) return;

    const lines = activeTake.lines

      .filter((l) => counts[l.id] !== undefined && counts[l.id] !== '')

      .map((l) => ({

        lineId: l.id,

        countedQty: toNumber(counts[l.id]),

        varianceReason: reasons[l.id]?.trim() || undefined,

      }));

    if (!lines.length) {

      setError('Enter at least one counted quantity before saving.');

      return;

    }

    setSaving(true);

    setError('');

    try {

      const updated = await apiWithAuth<StockTake>(`/stock-takes/${activeTake.id}/counts`, {

        method: 'PATCH',

        body: JSON.stringify({ lines }),

      });

      setActiveTake(updated);

      hydrateTake(updated);

      setSuccess(`Saved ${lines.length} count(s). ${updated.uncountedLines ?? 0} still uncounted.`);

      await load();

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  async function completeTake() {

    if (!activeTake) return;

    const uncounted = activeTake.uncountedLines ?? activeTake.lines.filter((l) => l.countedQty == null).length;

    if (uncounted > 0) {

      setError(`Still ${uncounted} uncounted line(s). Save counts for every product first.`);

      return;

    }

    const ok = await confirmDialog.confirm({

      title: activeTake.status === 'PENDING_APPROVAL' ? 'Already pending approval' : 'Submit stock take?',

      message:

        activeTake.status === 'PENDING_APPROVAL'

          ? 'Session is awaiting owner approval.'

          : `${activeTake.varianceLines ?? 0} variance line(s). With variances, owner approval is required before stock adjusts.`,

      confirmLabel: activeTake.status === 'PENDING_APPROVAL' ? 'OK' : 'Submit',

    });

    if (!ok || activeTake.status === 'PENDING_APPROVAL') return;

    setSaving(true);

    setError('');

    try {

      const updated = await apiWithAuth<StockTake>(`/stock-takes/${activeTake.id}/complete`, { method: 'POST' });

      if (updated.status === 'PENDING_APPROVAL') {

        setActiveTake(updated);

        hydrateTake(updated);

        setSuccess('Submitted for approval — owner must approve before variances post.');

      } else {

        setActiveTake(null);

        setCounts({});

        setReasons({});

        setSuccess('Stock take completed. Variances applied to stock.');

      }

      await load();

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  async function approveTake() {

    if (!activeTake) return;

    const ok = await confirmDialog.confirm({

      title: 'Approve variances?',

      message: 'Applies variance adjustments to stock. This cannot be undone.',

      confirmLabel: 'Approve',

    });

    if (!ok) return;

    setSaving(true);

    setError('');

    try {

      await apiWithAuth(`/stock-takes/${activeTake.id}/approve`, { method: 'POST' });

      setActiveTake(null);

      setCounts({});

      setReasons({});

      setSuccess('Stock take approved. Variances applied to stock.');

      await load();

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  async function cancelTake() {

    if (!activeTake) return;

    const ok = await confirmDialog.confirm({

      title: 'Cancel stock take?',

      message: 'No stock changes will be applied. You can start a new count later.',

      confirmLabel: 'Cancel session',

      tone: 'danger',

    });

    if (!ok) return;

    setSaving(true);

    setError('');

    try {

      await apiWithAuth(`/stock-takes/${activeTake.id}/cancel`, { method: 'POST', body: '{}' });

      setActiveTake(null);

      setCounts({});

      setReasons({});

      setSuccess('Stock take cancelled.');

      await load();

    } catch (e) {

      setError(parseError(e));

    } finally {

      setSaving(false);

    }

  }



  const isPending = activeTake?.status === 'PENDING_APPROVAL';

  const isOpen = activeTake?.status === 'OPEN';



  if (loading) {

    return <AppLoader label="Loading stock takes…" />;

  }



  return (

    <div className={pageShellClassName}>

      <PageHeader

        title="Stock Take / Cycle Count"

        description="Scan or enter counts, set variance reasons, submit for approval when needed."

        actions={

          <div className="flex flex-wrap gap-2">

            <Link href="/dashboard/corrections">

              <Button type="button" variant="secondary">

                Corrections

              </Button>

            </Link>

            <Button type="button" variant="secondary" onClick={() => void load()}>

              Refresh

            </Button>

          </div>

        }

      />



      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}



      {!activeTake ? (

        <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4">

          <h2 className="text-lg font-semibold">Start new stock take</h2>

          <p className="mt-1 text-sm text-slate-500">

            Full count, filter by category or ABC grade, or load ABC cycle due list.

          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">

            <input

              className={inputClassName}

              placeholder="Notes (optional)"

              value={notes}

              onChange={(e) => setNotes(e.target.value)}

            />

            <input

              className={inputClassName}

              placeholder="Category filter (optional)"

              value={category}

              onChange={(e) => setCategory(e.target.value)}

            />

          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-sm">

            {(['A', 'B', 'C'] as const).map((g) => (

              <label key={g} className="flex items-center gap-2">

                <input type="checkbox" checked={abcGrades.includes(g)} onChange={() => toggleGrade(g)} />

                Grade {g}

              </label>

            ))}

          </div>

          {abcPlan ? (

            <p className="mt-2 text-sm text-teal-800">

              ABC cycle: {abcPlan.dueCount} due (A={abcPlan.productIdsByGrade.A.length}, B=

              {abcPlan.productIdsByGrade.B.length}, C={abcPlan.productIdsByGrade.C.length})

            </p>

          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">

            <Button disabled={saving} onClick={() => void startTake()}>

              {saving ? 'Starting…' : 'Start stock take'}

            </Button>

            <Button type="button" variant="secondary" disabled={saving} onClick={() => void loadAbcCycle()}>

              Load ABC cycle

            </Button>

            <Button

              type="button"

              variant="secondary"

              disabled={saving || !abcPlan?.dueCount}

              onClick={() => void startAbcDue()}

            >

              Start due ABC ({abcPlan?.dueCount ?? 0})

            </Button>

          </div>

        </Card>

      ) : (

        <Card className={cn('p-4', isPending ? 'border-violet-200 bg-violet-50/40' : 'border-amber-200 bg-amber-50/50')}>

          <div className="flex flex-wrap items-center justify-between gap-2">

            <div>

              <h2 className="text-lg font-semibold">

                {isPending ? 'Pending approval' : 'Active count session'}

              </h2>

              <p className="text-sm text-slate-500">

                {activeTake.branch?.name ?? 'Branch'} · {activeTake.countedLines ?? 0}/

                {activeTake.lineCount ?? activeTake.lines.length} counted ·{' '}

                {activeTake.varianceLines ?? 0} variances · started {formatDate(activeTake.createdAt)}

              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">

                {(activeTake.missingFields || []).map((f) => (

                  <span

                    key={f}

                    className="inline-flex rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-800"

                  >

                    {f === 'counts'

                      ? 'Uncounted lines'

                      : f === 'reviewVariances'

                        ? 'Review variances'

                        : f === 'varianceReasons'

                          ? 'Variance reasons'

                          : f}

                  </span>

                ))}

                {(activeTake.missingReasons ?? 0) > 0 ? (

                  <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-800">

                    {activeTake.missingReasons} missing reason(s)

                  </span>

                ) : null}

                {!activeTake.missingFields?.length && !isPending ? (

                  <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-teal-800">

                    Ready to submit

                  </span>

                ) : null}

              </div>

            </div>

            <StatusBadge status={activeTake.status} />

          </div>



          {isOpen ? (

            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => void handleScan(e)}>

              <input

                ref={scanRef}

                className={`${inputClassName} max-w-xs flex-1`}

                placeholder="Scan barcode / SKU"

                value={scanCode}

                onChange={(e) => setScanCode(e.target.value)}

                autoComplete="off"

              />

              <Button type="submit" disabled={saving || !scanCode.trim()}>

                Scan +1

              </Button>

            </form>

          ) : null}



          <div className="mt-3 flex flex-wrap gap-4 text-sm">

            <label className="flex items-center gap-2">

              <input type="checkbox" checked={uncountedOnly} onChange={(e) => setUncountedOnly(e.target.checked)} />

              Uncounted only

            </label>

            <label className="flex items-center gap-2">

              <input type="checkbox" checked={varianceOnly} onChange={(e) => setVarianceOnly(e.target.checked)} />

              Variances only

            </label>

            <span className="text-slate-500">Progress {activeTake.progressPct ?? 0}%</span>

          </div>



          <div className="mt-4 overflow-x-auto">

            <table className="min-w-full text-sm">

              <thead>

                <tr>

                  <th className={tableHeaderClassName}>Product</th>

                  <th className={tableHeaderClassName}>System qty</th>

                  <th className={tableHeaderClassName}>Counted qty</th>

                  <th className={tableHeaderClassName}>Variance</th>

                  <th className={tableHeaderClassName}>Reason</th>

                </tr>

              </thead>

              <tbody>

                {visibleLines.map((l) => {

                  const hasCount = counts[l.id] !== undefined && counts[l.id] !== '';

                  const counted = hasCount ? toNumber(counts[l.id]) : null;

                  const variance = counted == null ? null : counted - toNumber(l.systemQty);

                  const hasVariance = variance != null && Math.abs(variance) >= 0.001;

                  return (

                    <tr key={l.id} className="border-t border-slate-100 bg-white/70">

                      <td className={tableCellClassName}>

                        {l.product.name}{' '}

                        <span className="text-slate-400">({l.product.sku})</span>

                      </td>

                      <td className={tableCellClassName}>{toNumber(l.systemQty)}</td>

                      <td className={tableCellClassName}>

                        <input

                          className={cn(

                            `${inputClassName} max-w-28`,

                            !hasCount ? 'border-amber-300 ring-1 ring-amber-100' : '',

                          )}

                          type="number"

                          min="0"

                          step="0.001"

                          placeholder="Count"

                          value={counts[l.id] ?? ''}

                          disabled={isPending}

                          onChange={(e) => setCounts((prev) => ({ ...prev, [l.id]: e.target.value }))}

                        />

                      </td>

                      <td className={tableCellClassName}>

                        <span

                          className={

                            hasVariance ? 'font-medium text-amber-700' : 'text-slate-400'

                          }

                        >

                          {variance == null ? '—' : variance}

                        </span>

                      </td>

                      <td className={tableCellClassName}>

                        {hasVariance ? (

                          <select

                            className={`${selectClassName} max-w-[9rem] text-xs`}

                            value={reasons[l.id] ?? ''}

                            disabled={isPending}

                            onChange={(e) => setReasons((prev) => ({ ...prev, [l.id]: e.target.value }))}

                          >

                            {VARIANCE_REASONS.map((r) => (

                              <option key={r.value || 'empty'} value={r.value}>

                                {r.label}

                              </option>

                            ))}

                          </select>

                        ) : (

                          '—'

                        )}

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

          <div className="mt-4 flex flex-wrap gap-2">

            {isOpen ? (

              <>

                <Button type="button" variant="secondary" disabled={saving} onClick={() => void saveCounts()}>

                  Save counts

                </Button>

                <Button

                  type="button"

                  disabled={saving || (activeTake.uncountedLines ?? 1) > 0}

                  title={(activeTake.uncountedLines ?? 0) > 0 ? 'Count every product before submitting' : undefined}

                  onClick={() => void completeTake()}

                >

                  Submit for approval / complete

                </Button>

              </>

            ) : null}

            {isPending ? (

              <Button type="button" disabled={saving} onClick={() => void approveTake()}>

                Approve & apply variances

              </Button>

            ) : null}

            <Button type="button" variant="secondary" disabled={saving} onClick={() => void cancelTake()}>

              Cancel session

            </Button>

          </div>

        </Card>

      )}



      <Card className="border-slate-200 p-4">

        <h2 className="mb-4 text-lg font-semibold">History</h2>

        {!takes.length ? (

          <p className="text-sm text-slate-500">No stock takes yet.</p>

        ) : (

          <div className="space-y-2">

            {takes.map((t) => (

              <div

                key={t.id}

                className="flex flex-wrap items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"

              >

                <span>

                  {formatDate(t.createdAt)}

                  {t.completedAt ? ` → ${formatDate(t.completedAt)}` : ''} ·{' '}

                  {t.lineCount ?? t.lines.length} lines · {t.varianceLines ?? 0} variances ·{' '}

                  {t.branch?.name ?? 'Branch'}

                  {t.notes ? ` · ${t.notes}` : ''}

                </span>

                <StatusBadge status={t.status} />

              </div>

            ))}

          </div>

        )}

      </Card>

    </div>

  );

}

