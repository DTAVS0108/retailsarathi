'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatCard,
  formatDate,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { getIndianFinancialYear } from '@retail-sarathi/gst-engine';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';

type Tab = 'overview' | 'accounts' | 'journal' | 'itr';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  debitAccount: { name: string };
  creditAccount: { name: string };
}

interface PnlReport {
  period: { from: string; to: string };
  income: Record<string, number>;
  expenses: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

interface BalanceSheet {
  asOf: string;
  assets: Array<{ name: string; balance: number }>;
  liabilities: Array<{ name: string; balance: number }>;
  equity: Array<{ name: string; balance: number }>;
}

interface ItrSummary {
  financialYear: string;
  grossTurnover: number;
  grossSales?: number;
  returnsTotal?: number;
  purchaseTotal?: number;
  purchaseBillCount?: number;
  totalExpenses: number;
  netProfit: number;
  presumptiveEligible: boolean;
  disclaimer: string;
}

export default function AccountingPage() {
  const fy = getIndianFinancialYear();
  const fyStart = `${fy.startYear}-04-01`;
  const fyEnd = `${fy.endYear}-03-31`;
  const fyLabel = fy.key;

  const [tab, setTab] = useState<Tab>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [itr, setItr] = useState<ItrSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newAccount, setNewAccount] = useState({ code: '', name: '', type: 'EXPENSE' });
  const [journalForm, setJournalForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
  });

  async function loadAll() {
    try {
      setLoading(true);
      setError('');
      const [acc, jnl, pnlRes, bs, itrRes] = await Promise.all([
        apiWithAuth<Account[]>('/accounting/accounts'),
        apiWithAuth<JournalEntry[]>(`/accounting/journal?from=${fyStart}&to=${fyEnd}`),
        apiWithAuth<PnlReport>(`/accounting/reports/pnl?from=${fyStart}&to=${fyEnd}`),
        apiWithAuth<BalanceSheet>(`/accounting/reports/balance-sheet?asOf=${fyEnd}`),
        apiWithAuth<ItrSummary>(`/accounting/itr-prep?fy=${fyLabel}`),
      ]);
      setAccounts(acc);
      setJournal(jnl);
      setPnl(pnlRes);
      setBalanceSheet(bs);
      setItr(itrRes);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const totalAssets = useMemo(
    () => balanceSheet?.assets.reduce((s, a) => s + toNumber(a.balance), 0) ?? 0,
    [balanceSheet],
  );

  async function seedAccounts() {
    try {
      setSaving(true);
      await apiWithAuth('/accounting/accounts/seed', { method: 'POST' });
      setSuccess('Default chart of accounts created.');
      await loadAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      await apiWithAuth('/accounting/accounts', {
        method: 'POST',
        body: JSON.stringify(newAccount),
      });
      setNewAccount({ code: '', name: '', type: 'EXPENSE' });
      setSuccess('Account added.');
      await loadAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function createJournal(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      await apiWithAuth('/accounting/journal', {
        method: 'POST',
        body: JSON.stringify({
          ...journalForm,
          amount: toNumber(journalForm.amount),
        }),
      });
      setJournalForm({ ...journalForm, description: '', amount: '' });
      setSuccess('Journal entry posted.');
      await loadAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function downloadCsv() {
    const csv = await apiWithAuth<string>(`/accounting/itr-prep/export?fy=${fyLabel}`);
    const blob = new Blob([String(csv)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ITR-Prep-${fyLabel}.csv`;
    a.click();
  }

  async function downloadTally() {
    const xml = await apiWithAuth<string>(`/accounting/itr-prep/export/tally?fy=${fyLabel}`);
    const blob = new Blob([String(xml)], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tally-Journal-${fyLabel}.xml`;
    a.click();
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'accounts', label: 'Chart of accounts' },
    { id: 'journal', label: 'Journal' },
    { id: 'itr', label: 'ITR prep' },
  ];

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Accounting & ITR"
        description="Chart of accounts, journal entries, P&L, balance sheet, and CA export packs. Sales auto-post to journal when invoices are finalized."
        actions={
          accounts.length === 0 ? (
            <Button type="button" onClick={() => void seedAccounts()} disabled={saving}>
              Seed default accounts
            </Button>
          ) : null
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <ScrollableTabBar tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <AppLoader label="Loading accounting data…" />
      ) : null}

      {tab === 'overview' && pnl ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total income (FY)" value={formatINR(pnl.totalIncome)} />
            <StatCard label="Total expenses (FY)" value={formatINR(pnl.totalExpenses)} />
            <StatCard label="Net profit (FY)" value={formatINR(pnl.netProfit)} />
            <StatCard label="Total assets" value={formatINR(totalAssets)} />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="border-slate-200">
              <h3 className="mb-4 text-lg font-semibold">Profit & Loss</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-slate-700">Income</p>
                  {Object.entries(pnl.income).map(([name, amt]) => (
                    <div key={name} className="flex justify-between py-1 text-slate-600">
                      <span>{name}</span><span>{formatINR(amt)}</span>
                    </div>
                  ))}
                  {!Object.keys(pnl.income).length ? <p className="text-slate-500">No income entries yet.</p> : null}
                </div>
                <div>
                  <p className="font-medium text-slate-700">Expenses</p>
                  {Object.entries(pnl.expenses).map(([name, amt]) => (
                    <div key={name} className="flex justify-between py-1 text-slate-600">
                      <span>{name}</span><span>{formatINR(amt)}</span>
                    </div>
                  ))}
                  {!Object.keys(pnl.expenses).length ? <p className="text-slate-500">No expense entries yet.</p> : null}
                </div>
              </div>
            </Card>

            <Card className="border-slate-200">
              <h3 className="mb-4 text-lg font-semibold">Balance sheet as of {formatDate(balanceSheet?.asOf)}</h3>
              {balanceSheet ? (
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  {(['assets', 'liabilities', 'equity'] as const).map((section) => (
                    <div key={section}>
                      <p className="mb-2 font-medium capitalize text-slate-700">{section}</p>
                      {balanceSheet[section].map((row) => (
                        <div key={row.name} className="flex justify-between py-1 text-slate-600">
                          <span>{row.name}</span><span>{formatINR(row.balance)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </section>
        </>
      ) : null}

      {tab === 'accounts' ? (
        <section className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <Card className="border-slate-200">
            <form className="space-y-4" onSubmit={createAccount}>
              <h3 className="text-lg font-semibold">Add account</h3>
              <input className={inputClassName} placeholder="Code e.g. 5200" value={newAccount.code} onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })} required />
              <input className={inputClassName} placeholder="Account name" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} required />
              <select className={selectClassName} value={newAccount.type} onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}>
                {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Button type="submit" disabled={saving}>Add account</Button>
            </form>
          </Card>
          <Card className="border-slate-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Code</th>
                  <th className={tableHeaderClassName}>Name</th>
                  <th className={tableHeaderClassName}>Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className={tableCellClassName}>{a.code}</td>
                    <td className={tableCellClassName}>{a.name}</td>
                    <td className={tableCellClassName}>{a.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}

      {tab === 'journal' ? (
        <section className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
          <Card className="border-slate-200">
            <form className="space-y-4" onSubmit={createJournal}>
              <h3 className="text-lg font-semibold">Manual journal entry</h3>
              <input className={inputClassName} type="date" value={journalForm.date} onChange={(e) => setJournalForm({ ...journalForm, date: e.target.value })} required />
              <input className={inputClassName} placeholder="Description" value={journalForm.description} onChange={(e) => setJournalForm({ ...journalForm, description: e.target.value })} required />
              <select className={selectClassName} value={journalForm.debitAccountId} onChange={(e) => setJournalForm({ ...journalForm, debitAccountId: e.target.value })} required>
                <option value="">Debit account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <select className={selectClassName} value={journalForm.creditAccountId} onChange={(e) => setJournalForm({ ...journalForm, creditAccountId: e.target.value })} required>
                <option value="">Credit account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <input className={inputClassName} type="number" min="0" step="0.01" placeholder="Amount" value={journalForm.amount} onChange={(e) => setJournalForm({ ...journalForm, amount: e.target.value })} required />
              <Button type="submit" disabled={saving}>Post entry</Button>
            </form>
          </Card>
          <Card className="border-slate-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Date</th>
                  <th className={tableHeaderClassName}>Description</th>
                  <th className={tableHeaderClassName}>Debit</th>
                  <th className={tableHeaderClassName}>Credit</th>
                  <th className={tableHeaderClassName}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journal.map((e) => (
                  <tr key={e.id}>
                    <td className={tableCellClassName}>{formatDate(e.date)}</td>
                    <td className={tableCellClassName}>{e.description}</td>
                    <td className={tableCellClassName}>{e.debitAccount.name}</td>
                    <td className={tableCellClassName}>{e.creditAccount.name}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}

      {tab === 'itr' && itr ? (
        <Card className="border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold">ITR preparation — FY {itr.financialYear}</h3>
          <p className="text-sm text-amber-700">{itr.disclaimer}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-slate-500">Gross turnover</p><p className="text-xl font-semibold">{formatINR(itr.grossTurnover)}</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-slate-500">Purchases</p><p className="text-xl font-semibold">{formatINR(toNumber(itr.purchaseTotal))}</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-slate-500">Expenses</p><p className="text-xl font-semibold">{formatINR(itr.totalExpenses)}</p></div>
            <div className="rounded-xl border border-slate-200 p-4"><p className="text-slate-500">Net profit</p><p className="text-xl font-semibold">{formatINR(itr.netProfit)}</p></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void downloadCsv()}>Download CSV for CA</Button>
            <Button type="button" variant="secondary" onClick={() => void downloadTally()}>Export Tally XML</Button>
            <Link
              href={`/dashboard/reports?tab=itr&fy=${encodeURIComponent(itr.financialYear)}`}
              className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
            >
              Open ITR pack (sell + buy + quarters)
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
