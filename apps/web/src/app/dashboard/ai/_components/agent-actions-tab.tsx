'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { inputClassName, MessageBanner, formatDateTime, parseError, StatusBadge } from '../../_components/dashboard-ui';
import { PaginationFooter, stickyTheadClassName, zebraRowClassName } from './table-shared';
import { RowActionsMenu } from '../../_components/row-actions-menu';

type AgentAction = {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
};

type ActionsResponse = { items: AgentAction[]; total: number; page: number; pageSize: number };

const STATUS_TABS = ['all', 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'] as const;

export function AgentActionsTab({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<AgentAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('pageSize', String(pageSize));
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'all') q.set('status', status);
      const res = await apiWithAuth<ActionsResponse>(`/ai/agent-actions?${q.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        await load();
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, status]);

  async function proposeReorder() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const created = await apiWithAuth<unknown[]>('/ai/agent-actions/propose-reorder', { method: 'POST' });
      setSuccess(`Created ${created.length} reorder action(s) for your approval.`);
      setPage(1);
      await load();
      onChanged?.();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  async function decideAction(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError('');
    try {
      await apiWithAuth(`/ai/agent-actions/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setSuccess(decision === 'APPROVED' ? 'Action approved.' : 'Action rejected.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-slate-200">
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Agent actions</h3>
          <p className="text-xs text-slate-500">AI-proposed actions awaiting your decision, plus history.</p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void proposeReorder()}>
          Propose reorder actions
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
              status === s ? 'bg-teal-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s.toLowerCase()}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search title…"
          className={`${inputClassName} ml-auto w-48`}
        />
      </div>
      {!loading && !rows.length ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {search || status !== 'all' ? 'No actions match these filters.' : 'No agent actions yet. Click "Propose reorder actions" above.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={stickyTheadClassName}>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">When</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Action</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Decide</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={zebraRowClassName}>
                  <td className="px-4 py-2.5 text-slate-600">{formatDateTime(a.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <strong className="text-slate-800">{a.title}</strong>
                    <p className="text-xs text-slate-500">{a.type.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <RowActionsMenu
                      actions={[
                        {
                          key: 'approve',
                          label: 'Approve',
                          hidden: a.status !== 'PENDING',
                          disabled: busy,
                          onClick: () => void decideAction(a.id, 'APPROVED'),
                        },
                        {
                          key: 'reject',
                          label: 'Reject',
                          tone: 'danger',
                          hidden: a.status !== 'PENDING',
                          disabled: busy,
                          onClick: () => void decideAction(a.id, 'REJECTED'),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationFooter
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </Card>
  );
}
