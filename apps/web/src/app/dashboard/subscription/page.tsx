'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, formatINR } from '@retail-sarathi/ui';
import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  EmptyState,
  cn,
  formatDate,
  inputClassName,
  parseError,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';

type Plan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number | string;
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  features: string[];
  isActive?: boolean;
};

type Subscription = {
  id: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: Plan;
};

type Usage = { users: number; products: number; branches: number };
type UsagePct = { users: number; products: number; branches: number };

type CurrentPayload = {
  subscription: Subscription;
  usage: Usage;
  usagePct?: UsagePct;
  limits: Plan;
  trialDaysLeft?: number | null;
  periodDaysLeft?: number | null;
  billingNote?: string;
};

type BillingCycle = 'monthly' | 'yearly';

const UNLIMITED = 999999;

const COMPARISON_ROWS: Array<{
  key: string;
  label: string;
  value: (plan: Plan) => string;
}> = [
  {
    key: 'price',
    label: 'Price / month',
    value: (p) =>
      p.code === 'ENTERPRISE'
        ? 'Custom'
        : toNumber(p.priceMonthly) <= 0
          ? '₹0'
          : formatINR(toNumber(p.priceMonthly)),
  },
  {
    key: 'users',
    label: 'Users',
    value: (p) => (p.maxUsers >= UNLIMITED ? 'Unlimited' : String(p.maxUsers)),
  },
  {
    key: 'products',
    label: 'Products',
    value: (p) =>
      p.maxProducts >= UNLIMITED ? 'Unlimited' : p.maxProducts.toLocaleString('en-IN'),
  },
  {
    key: 'branches',
    label: 'Branches',
    value: (p) => (p.maxBranches >= UNLIMITED ? 'Unlimited' : String(p.maxBranches)),
  },
];

const FAQ = [
  {
    q: 'When do I need to upgrade?',
    a: 'When users, products, or branches approach your plan limit — or when you need Pro/Business modules like repairs, multi-branch, or e-commerce sync.',
  },
  {
    q: 'Can I downgrade anytime?',
    a: 'Yes, if your current usage still fits the lower plan. Otherwise reduce users/products/branches first, then switch.',
  },
  {
    q: 'How do I get Enterprise?',
    a: 'Enterprise is unlimited and custom-priced. Use Connect to sales — our team will reach out for onboarding and commercial terms.',
  },
  {
    q: 'How will payment work for Pro / Business?',
    a: 'Self-serve plans will checkout via Razorpay (UPI / cards / netbanking). Until that is wired, plan changes apply instantly in demo mode with no charge.',
  },
];

function statusTone(status: string): 'green' | 'amber' | 'red' | 'teal' | 'gray' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'green';
  if (s === 'TRIAL') return 'teal';
  if (s === 'PAST_DUE') return 'amber';
  if (s === 'CANCELLED') return 'red';
  return 'gray';
}

function usageBarTone(pctValue: number): string {
  if (pctValue >= 95) return 'bg-rose-500';
  if (pctValue >= 80) return 'bg-amber-500';
  return 'bg-teal-600';
}

function planRank(code: string) {
  if (code === 'ENTERPRISE') return 4;
  if (code === 'BUSINESS') return 3;
  if (code === 'PRO') return 2;
  return 1;
}

function yearlyPrice(monthly: number) {
  return monthly * 10;
}

function pct(used: number, max: number) {
  if (max >= UNLIMITED) return 0;
  if (!max || max <= 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}

function isUnlimited(n: number) {
  return n >= UNLIMITED;
}

function formatLimit(n: number) {
  if (isUnlimited(n)) return '∞';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function planTagline(code: string) {
  if (code === 'FREE') return 'Start billing & GST for one counter';
  if (code === 'PRO') return 'Best for growing single-store shops';
  if (code === 'BUSINESS') return 'Multi-branch teams & online channels';
  if (code === 'ENTERPRISE') return 'Unlimited scale · custom contract';
  return 'RetailSarathi plan';
}

function isEnterprise(plan: Plan | null | undefined) {
  return plan?.code === 'ENTERPRISE';
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [compareOpen, setCompareOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [connectOpen, setConnectOpen] = useState(true);
  const [paymentStepsOpen, setPaymentStepsOpen] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '', message: '' });
  const [sendingContact, setSendingContact] = useState(false);
  const plansRef = useRef<HTMLElement | null>(null);
  const connectRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      apiWithAuth<Plan[]>('/subscriptions/plans'),
      apiWithAuth<CurrentPayload>('/subscriptions/current'),
    ]);
    setPlans(p);
    setCurrent(c);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e) => setError(parseError(e)))
      .finally(() => setLoading(false));
  }, [load]);

  const sub = current?.subscription;
  const usage = current?.usage;
  const usagePct = current?.usagePct;
  const currentCode = sub?.plan?.code ?? '';

  const recommendedCode = useMemo(() => {
    if (!usage) return 'PRO';
    if (usage.branches > 10 || usage.users > 20 || usage.products > 50000) return 'ENTERPRISE';
    if (usage.branches > 1 || usage.users > 5 || usage.products > 5000) return 'BUSINESS';
    if (currentCode === 'BUSINESS' || currentCode === 'ENTERPRISE') return currentCode;
    return 'PRO';
  }, [usage, currentCode]);

  const usageItems = useMemo(() => {
    if (!usage || !sub) return [];
    return [
      {
        label: 'Users',
        used: usage.users,
        max: sub.plan.maxUsers,
        pct: usagePct?.users ?? pct(usage.users, sub.plan.maxUsers),
      },
      {
        label: 'Products',
        used: usage.products,
        max: sub.plan.maxProducts,
        pct: usagePct?.products ?? pct(usage.products, sub.plan.maxProducts),
      },
      {
        label: 'Branches',
        used: usage.branches,
        max: sub.plan.maxBranches,
        pct: usagePct?.branches ?? pct(usage.branches, sub.plan.maxBranches),
      },
    ];
  }, [usage, usagePct, sub]);

  const hottestUsage = useMemo(
    () => usageItems.reduce((max, item) => Math.max(max, item.pct), 0),
    [usageItems],
  );

  const nextPlan = useMemo(() => {
    if (!sub) return null;
    if (sub.plan.code === 'FREE') return plans.find((p) => p.code === 'PRO') ?? null;
    if (sub.plan.code === 'PRO') return plans.find((p) => p.code === 'BUSINESS') ?? null;
    if (sub.plan.code === 'BUSINESS') return plans.find((p) => p.code === 'ENTERPRISE') ?? null;
    return null;
  }, [sub, plans]);

  function scrollToPlans() {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToConnect() {
    setConnectOpen(true);
    connectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function changePlan(plan: Plan) {
    if (isEnterprise(plan)) {
      scrollToConnect();
      setSuccess('Enterprise is unlimited — connect with our team below');
      return;
    }

    if (plan.code === currentCode && sub?.status === 'ACTIVE') {
      setSuccess(`Already on ${plan.name}`);
      return;
    }

    const isUpgrade = planRank(plan.code) > planRank(currentCode);
    const priceLabel =
      billingCycle === 'yearly' && toNumber(plan.priceMonthly) > 0
        ? `${formatINR(yearlyPrice(toNumber(plan.priceMonthly)))}/year`
        : `${formatINR(toNumber(plan.priceMonthly))}/mo`;

    const ok = await confirmDialog.confirm({
      title: isUpgrade ? `Upgrade to ${plan.name}?` : `Switch to ${plan.name}?`,
      message: isUpgrade
        ? `Move this shop to ${plan.name} (${priceLabel}). Limits and features update immediately.`
        : `Downgrade to ${plan.name}? If usage exceeds ${plan.name} limits, the switch will be blocked.`,
      confirmLabel: isUpgrade ? 'Upgrade now' : 'Switch plan',
      tone: isUpgrade ? 'default' : 'danger',
    });
    if (!ok) return;

    try {
      setBusyCode(plan.code);
      setError('');
      await apiWithAuth('/subscriptions/change-plan', {
        method: 'POST',
        body: JSON.stringify({ planCode: plan.code }),
      });
      setSuccess(`You’re on ${plan.name} now`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyCode(null);
    }
  }

  async function cancelPlan() {
    const ok = await confirmDialog.confirm({
      title: 'Cancel paid plan?',
      message:
        'This moves the shop to Free and marks the subscription cancelled. Blocked if usage is above Free limits.',
      confirmLabel: 'Cancel to Free',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setBusyCode('CANCEL');
      setError('');
      await apiWithAuth('/subscriptions/cancel', { method: 'POST' });
      setSuccess('Cancelled — now on Free');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyCode(null);
    }
  }

  async function submitEnterpriseContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contact.name.trim()) {
      setError('Enter your name so we can connect with you');
      return;
    }
    try {
      setSendingContact(true);
      setError('');
      const res = await apiWithAuth<{ message?: string }>('/subscriptions/enterprise-contact', {
        method: 'POST',
        body: JSON.stringify({
          name: contact.name.trim(),
          phone: contact.phone.trim() || undefined,
          email: contact.email.trim() || undefined,
          message: contact.message.trim() || undefined,
        }),
      });

      const activate = await confirmDialog.confirm({
        title: 'Request sent',
        message:
          `${res.message || 'Our team will connect with you.'} Preview Enterprise (unlimited) on this shop now?`,
        confirmLabel: 'Preview Enterprise',
        cancelLabel: 'Not now',
      });

      setSuccess(res.message || 'Enterprise connect request sent');
      setContact({ name: '', phone: '', email: '', message: '' });

      if (activate) {
        setBusyCode('ENTERPRISE');
        await apiWithAuth('/subscriptions/change-plan', {
          method: 'POST',
          body: JSON.stringify({ planCode: 'ENTERPRISE' }),
        });
        setSuccess('Enterprise preview enabled — unlimited limits on this shop');
        await load();
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSendingContact(false);
      setBusyCode(null);
    }
  }

  function displayPrice(plan: Plan) {
    if (isEnterprise(plan)) {
      return { main: 'Custom', hint: 'Connect for pricing', save: null as string | null };
    }
    const monthly = toNumber(plan.priceMonthly);
    if (monthly <= 0) return { main: '₹0', hint: 'Forever free', save: null as string | null };
    if (billingCycle === 'yearly') {
      const annual = yearlyPrice(monthly);
      return {
        main: formatINR(Math.round(annual / 12)),
        hint: `${formatINR(annual)} billed yearly`,
        save: `Save ${formatINR(monthly * 2)}`,
      };
    }
    return { main: formatINR(monthly), hint: 'Billed monthly', save: null as string | null };
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Subscription"
        description="See what you’re using, pick a plan that fits, or connect for unlimited Enterprise."
        actions={
          <Button type="button" variant="secondary" onClick={scrollToConnect}>
            Connect for Enterprise
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {loading ? (
        <AppLoader label="Loading subscription…" />
      ) : !sub ? (
        <EmptyState
          title="No subscription found"
          description="We could not load a plan for this shop. Refresh, or contact support."
          action={
            <Button type="button" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          {sub.status === 'TRIAL' && (current.trialDaysLeft ?? 99) <= 5 ? (
            <MessageBanner tone="warn" autoHideMs={0} alsoToast={false}>
              Trial ends in {current.trialDaysLeft} day
              {current.trialDaysLeft === 1 ? '' : 's'}
              {sub.trialEndsAt ? ` (${formatDate(sub.trialEndsAt)})` : ''}. Activate a paid plan to keep
              Pro/Business features.
            </MessageBanner>
          ) : null}

          {hottestUsage >= 80 && !isUnlimited(sub.plan.maxUsers) ? (
            <MessageBanner tone="warn" autoHideMs={0} alsoToast={false}>
              You’re at {hottestUsage}% of a plan limit.
              {nextPlan
                ? isEnterprise(nextPlan)
                  ? ' Connect for Enterprise unlimited, or upgrade to the next plan.'
                  : ` Upgrade to ${nextPlan.name} before you hit the ceiling.`
                : ' Connect for Enterprise if you need unlimited scale.'}
            </MessageBanner>
          ) : null}

          <section className="overflow-hidden rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-slate-50 shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5 p-5 sm:p-6 lg:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                    Your plan
                  </p>
                  <Badge color={statusTone(sub.status)}>{sub.status.replace(/_/g, ' ')}</Badge>
                  {isEnterprise(sub.plan) ? <Badge color="amber">Unlimited</Badge> : null}
                </div>

                <div>
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                    {sub.plan.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{planTagline(sub.plan.code)}</p>
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {isEnterprise(sub.plan) ? (
                      <span className="text-2xl font-bold text-slate-900">Custom pricing</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatINR(toNumber(sub.plan.priceMonthly))}
                        </span>
                        <span className="text-sm text-slate-500">/ month</span>
                      </>
                    )}
                    {sub.status === 'TRIAL' && current.trialDaysLeft != null ? (
                      <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                        {current.trialDaysLeft}d trial left
                      </span>
                    ) : null}
                    {sub.status === 'ACTIVE' && current.periodDaysLeft != null && !isEnterprise(sub.plan) ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        Renews in {current.periodDaysLeft}d
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {nextPlan ? (
                    <Button
                      type="button"
                      disabled={busyCode != null}
                      onClick={() =>
                        isEnterprise(nextPlan) ? scrollToConnect() : void changePlan(nextPlan)
                      }
                    >
                      {isEnterprise(nextPlan)
                        ? 'Connect for Enterprise'
                        : `Upgrade to ${nextPlan.name}`}
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={scrollToPlans}>
                    Compare plans
                  </Button>
                  {sub.plan.code !== 'FREE' && sub.status !== 'CANCELLED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyCode != null}
                      onClick={() => void cancelPlan()}
                    >
                      {busyCode === 'CANCEL' ? 'Cancelling…' : 'Cancel to Free'}
                    </Button>
                  ) : null}
                </div>

                <p className="text-xs leading-5 text-slate-500">
                  {current?.billingNote ||
                    'Self-serve plans switch instantly. Enterprise is unlimited — connect with our team.'}
                </p>
              </div>

              <div className="border-t border-teal-100/80 bg-white/70 p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Usage this period</h3>
                  <span className="text-xs text-slate-500">
                    {isEnterprise(sub.plan) ? 'Unlimited plan' : 'Live from your shop'}
                  </span>
                </div>
                <div className="space-y-4">
                  {usageItems.map((item) => (
                    <div key={item.label}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-slate-700">{item.label}</p>
                        <p className="text-sm tabular-nums text-slate-900">
                          <span className="font-semibold">{item.used.toLocaleString('en-IN')}</span>
                          <span className="text-slate-400">
                            {' '}
                            / {isUnlimited(item.max) ? '∞' : item.max.toLocaleString('en-IN')}
                          </span>
                        </p>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isUnlimited(item.max) ? 'bg-teal-500' : usageBarTone(item.pct),
                          )}
                          style={{
                            width: isUnlimited(item.max)
                              ? '12%'
                              : `${Math.max(item.pct, item.pct > 0 ? 3 : 0)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {isUnlimited(item.max)
                          ? 'Unlimited'
                          : item.pct >= 95
                            ? 'Limit reached'
                            : item.pct >= 80
                              ? `${item.pct}% — almost full`
                              : `${item.pct}% used`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {nextPlan ? (
            <Card className="border-slate-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Next step
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {isEnterprise(nextPlan)
                      ? 'Go unlimited with Enterprise'
                      : `Unlock more with ${nextPlan.name}`}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {isEnterprise(nextPlan)
                      ? 'Custom pricing · dedicated onboarding · unlimited users, products & branches'
                      : `${formatINR(toNumber(nextPlan.priceMonthly))}/mo · ${
                          nextPlan.features
                            .filter((f) => !sub.plan.features.includes(f))
                            .slice(0, 2)
                            .join(' · ') || nextPlan.features.slice(0, 2).join(' · ')
                        }`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busyCode != null}
                    onClick={() =>
                      isEnterprise(nextPlan) ? scrollToConnect() : void changePlan(nextPlan)
                    }
                  >
                    {isEnterprise(nextPlan)
                      ? 'Connect to sales'
                      : `Upgrade — ${formatINR(toNumber(nextPlan.priceMonthly))}/mo`}
                  </Button>
                  <Button type="button" variant="secondary" onClick={scrollToPlans}>
                    See all plans
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          <section ref={plansRef} id="plans" className="scroll-mt-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Choose a plan</h2>
                <p className="text-sm text-slate-500">
                  Free → Pro → Business self-serve. Enterprise is unlimited — connect to sales.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                {(['monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={cn(
                      'relative rounded-xl px-3.5 py-2 text-xs font-semibold transition',
                      billingCycle === cycle
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                    {cycle === 'yearly' ? (
                      <span
                        className={cn(
                          'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                          billingCycle === 'yearly'
                            ? 'bg-white/20 text-white'
                            : 'bg-teal-50 text-teal-700',
                        )}
                      >
                        −2 mo
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
              {plans.map((plan) => {
                const price = displayPrice(plan);
                const isCurrent = plan.code === currentCode;
                const isRecommended = plan.code === recommendedCode;
                const isFeatured = plan.code === 'PRO';
                const enterprise = isEnterprise(plan);
                const rankDiff = planRank(plan.code) - planRank(currentCode);
                const cta = enterprise
                  ? isCurrent
                    ? 'Current plan'
                    : 'Connect to sales'
                  : isCurrent && sub.status === 'ACTIVE'
                    ? 'Current plan'
                    : isCurrent && sub.status === 'TRIAL'
                      ? 'Activate plan'
                      : rankDiff > 0
                        ? `Upgrade to ${plan.name}`
                        : rankDiff < 0
                          ? `Switch to ${plan.name}`
                          : `Select ${plan.name}`;

                return (
                  <div
                    key={plan.code}
                    className={cn(
                      'relative flex flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6',
                      isCurrent
                        ? 'border-teal-400 ring-2 ring-teal-100'
                        : enterprise
                          ? 'border-slate-800/20 bg-gradient-to-b from-slate-50 to-white'
                          : isFeatured
                            ? 'border-teal-300'
                            : 'border-slate-200',
                    )}
                  >
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      {isCurrent ? <Badge color="teal">Current</Badge> : null}
                      {isRecommended && !isCurrent ? <Badge color="amber">Recommended</Badge> : null}
                      {isFeatured && !isCurrent && !isRecommended ? (
                        <Badge color="teal">Most popular</Badge>
                      ) : null}
                      {enterprise && !isCurrent ? <Badge color="gray">Unlimited</Badge> : null}
                      {price.save ? <Badge color="green">{price.save}</Badge> : null}
                    </div>

                    <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{planTagline(plan.code)}</p>

                    <div className="mt-4">
                      <p className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                          {price.main}
                        </span>
                        {!enterprise && toNumber(plan.priceMonthly) > 0 ? (
                          <span className="text-sm text-slate-500">/mo</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{price.hint}</p>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Users', value: formatLimit(plan.maxUsers) },
                        { label: 'Products', value: formatLimit(plan.maxProducts) },
                        { label: 'Branches', value: formatLimit(plan.maxBranches) },
                      ].map((cell) => (
                        <div
                          key={cell.label}
                          className="rounded-2xl bg-slate-50 px-2 py-2.5 text-center"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {cell.label}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{cell.value}</p>
                        </div>
                      ))}
                    </div>

                    <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-600">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2.5">
                          <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700"
                            aria-hidden
                          >
                            ✓
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      type="button"
                      className="mt-6 w-full"
                      variant={
                        isCurrent && sub.status === 'ACTIVE'
                          ? 'secondary'
                          : enterprise || isFeatured || rankDiff > 0
                            ? 'primary'
                            : 'secondary'
                      }
                      disabled={
                        busyCode != null || (isCurrent && sub.status === 'ACTIVE' && !enterprise)
                      }
                      onClick={() =>
                        enterprise && !isCurrent ? scrollToConnect() : void changePlan(plan)
                      }
                    >
                      {busyCode === plan.code ? 'Updating…' : cta}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Payment flow (self-serve Pro / Business) */}
          <Card className="border-slate-200">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setPaymentStepsOpen((o) => !o)}
              aria-expanded={paymentStepsOpen}
            >
              <div>
                <h2 className="text-base font-semibold text-slate-900">Payment flow</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  How Pro / Business checkout will work with Razorpay (coming soon)
                </p>
              </div>
              <span className="text-sm font-medium text-teal-700">
                {paymentStepsOpen ? 'Hide' : 'Show'}
              </span>
            </button>
            {paymentStepsOpen ? (
              <ol className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    step: '1',
                    title: 'Pick plan + cycle',
                    body: 'Choose Pro or Business, monthly or yearly, on this page.',
                  },
                  {
                    step: '2',
                    title: 'Create order',
                    body: 'API creates a Razorpay order for the plan amount.',
                  },
                  {
                    step: '3',
                    title: 'Pay securely',
                    body: 'UPI, cards, or netbanking in Razorpay Checkout.',
                  },
                  {
                    step: '4',
                    title: 'Webhook unlocks plan',
                    body: 'Payment success activates the plan and renews the period.',
                  },
                ].map((item) => (
                  <li key={item.step} className="rounded-2xl bg-slate-50 px-3.5 py-3">
                    <p className="text-xs font-bold text-teal-700">Step {item.step}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </Card>

          {/* Connect to sales (Enterprise) */}
          <section
            ref={connectRef}
            id="connect"
            className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-800/10 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 text-white shadow-sm"
          >
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr] lg:p-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200/90">
                  Enterprise
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Connect to sales
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                  Need unlimited users, products, and branches? Tell us about your chain — we’ll
                  connect with custom pricing, onboarding, and SLA.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-200">
                  {[
                    'Unlimited usage across all modules',
                    'Dedicated success manager',
                    'Custom integrations & training',
                    'Priority support with SLA',
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="text-teal-300">✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-4 text-sm font-medium text-teal-200 underline-offset-2 hover:underline"
                  onClick={() => setConnectOpen((o) => !o)}
                >
                  {connectOpen ? 'Hide form' : 'Show connect form'}
                </button>
              </div>

              {connectOpen ? (
                <form
                  className="rounded-2xl border border-white/10 bg-white/95 p-4 text-slate-900 shadow-lg sm:p-5"
                  onSubmit={(e) => void submitEnterpriseContact(e)}
                >
                  <h3 className="text-base font-semibold text-slate-900">Request a callback</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    We create a high-priority ticket so the team can connect with you.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Your name</span>
                      <input
                        className={inputClassName}
                        required
                        value={contact.name}
                        onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                        placeholder="Owner / manager name"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Phone</span>
                      <input
                        className={inputClassName}
                        value={contact.phone}
                        onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                        placeholder="WhatsApp / mobile"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Email</span>
                      <input
                        className={inputClassName}
                        type="email"
                        value={contact.email}
                        onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                        placeholder="you@shop.com"
                      />
                    </label>
                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Message</span>
                      <textarea
                        className={textareaClassName}
                        rows={3}
                        value={contact.message}
                        onChange={(e) => setContact((c) => ({ ...c, message: e.target.value }))}
                        placeholder="Branches, team size, timeline…"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="submit" disabled={sendingContact}>
                      {sendingContact ? 'Sending…' : 'Connect to sales'}
                    </Button>
                    <a
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      href="mailto:sales@retailsarathi.in?subject=Enterprise%20plan%20enquiry"
                    >
                      Email sales@retailsarathi.in
                    </a>
                  </div>
                </form>
              ) : null}
            </div>
          </section>

          <Card className="border-slate-200">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setCompareOpen((o) => !o)}
              aria-expanded={compareOpen}
            >
              <div>
                <h2 className="text-base font-semibold text-slate-900">Compare limits</h2>
                <p className="mt-0.5 text-sm text-slate-500">Caps side by side — Enterprise is unlimited</p>
              </div>
              <span className="text-sm font-medium text-teal-700">{compareOpen ? 'Hide' : 'Show'}</span>
            </button>
            {compareOpen && plans.length ? (
              <div className="mt-4 overflow-x-auto border-t border-slate-100 pt-4">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Limit</th>
                      {plans.map((p) => (
                        <th key={p.code} className="px-3 py-2 font-semibold text-slate-700">
                          {p.name}
                          {p.code === currentCode ? (
                            <span className="ml-1 text-teal-600">(you)</span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2.5 text-slate-500">{row.label}</td>
                        {plans.map((p) => (
                          <td
                            key={p.code}
                            className={cn(
                              'px-3 py-2.5 font-medium text-slate-900',
                              p.code === currentCode && 'bg-teal-50/70',
                            )}
                          >
                            {row.value(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          <Card className="border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Questions</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {FAQ.map((item, i) => {
                const open = faqOpen === i;
                return (
                  <div key={item.q} className="py-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => setFaqOpen(open ? null : i)}
                      aria-expanded={open}
                    >
                      <span className="text-sm font-semibold text-slate-900">{item.q}</span>
                      <span className="text-lg leading-none text-teal-700">{open ? '−' : '+'}</span>
                    </button>
                    {open ? <p className="pb-3 text-sm leading-6 text-slate-600">{item.a}</p> : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
