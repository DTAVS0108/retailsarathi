'use client';

import Link from 'next/link';
import { Card } from '@retail-sarathi/ui';
import { pageShellClassName, PageHeader, cn } from '../_components/dashboard-ui';

type RoadmapItem = {
  title: string;
  phase: string;
  status: 'live' | 'building' | 'coming-soon';
  description: string;
  integrateLater?: boolean;
};

const ITEMS: RoadmapItem[] = [
  {
    title: 'Billing reliability (stock guards, invoice #, credit limit)',
    phase: 'Phase 0',
    status: 'live',
    description: 'Server-side oversell protection, atomic invoice numbers, payment totals, cancel side-effects, sync stock conflict hard-fail; sales unique-number conflicts return clear 409.',
  },
  {
    title: 'Hold bill / draft → finalize',
    phase: 'Phase 1',
    status: 'live',
    description: 'Web + mobile: save draft, resume/finalize with stock + serial + branch stock deduction.',
  },
  {
    title: 'Split payment + discounts on POS',
    phase: 'Phase 1',
    status: 'live',
    description: 'Multiple payment methods and line discounts on web and mobile POS.',
  },
  {
    title: 'Returns / credit notes',
    phase: 'Phase 1',
    status: 'live',
    description: 'Partial returns linked to original tax invoice (web + mobile More → Returns).',
  },
  {
    title: 'Thermal ESC/POS receipts',
    phase: 'Phase 1',
    status: 'live',
    description: 'GET /invoices/:id/thermal → text + ESC/POS .bin (Hardware page, mobile share, desktop saves file). Live Bluetooth driver still optional.',
  },
  {
    title: 'IMEI / serial at sale + GRN',
    phase: 'Phase 1–2',
    status: 'live',
    description: 'Full picker on web, mobile, and desktop POS; GRN serial receive; resume held bills keeps serials.',
  },
  {
    title: 'Desktop production POS',
    phase: 'Phase 4',
    status: 'live',
    description: 'Online API billing with split pay, hold, IMEI, returns, thermal, WhatsApp; offline SQLite fallback + sync.',
  },
  {
    title: 'Mobile PO + stock take',
    phase: 'Phase 2–4',
    status: 'live',
    description: 'More menu: Purchase orders (GRN) and Stock take cycle count on phone.',
  },
  {
    title: 'WhatsApp bill on finalize',
    phase: 'Phase 3',
    status: 'live',
    description: 'Customer WhatsApp opt-in + POST /invoices/:id/whatsapp (API auto-send when WHATSAPP_API_URL set, else share link).',
  },
  {
    title: 'Real e-Invoice IRN (NIC / GSP)',
    phase: 'Phase 1.5',
    status: 'live',
    description: 'ClearTax/GSP live IRN when EINVOICE_GSP_* env set; demo fallback otherwise.',
  },
  {
    title: 'E-way bill (GSP)',
    phase: 'Phase 1.5',
    status: 'live',
    description: 'Same GSP credentials generate e-way when configured; demo number otherwise.',
  },
  {
    title: 'Purchase order + GRN → purchase bill',
    phase: 'Phase 2',
    status: 'live',
    description: 'PO progress chips, cancel, status filter; full GRN auto-posts purchase bill + purchase price; serial clash checks.',
  },
  {
    title: 'Stock take / cycle count',
    phase: 'Phase 2',
    status: 'live',
    description: 'Blank counts, block complete until all counted, cancel, BranchStock sync, one OPEN session, variance filters (web + mobile).',
  },
  {
    title: 'Purchase bills + supplier aging',
    phase: 'Phase 2–3',
    status: 'live',
    description: 'Due dates, CGST/SGST/IGST, list aging buckets, supplier aging report; stock-in posts AP bill.',
  },
  {
    title: 'Suppliers khata UX (payables board)',
    phase: 'Phase 3',
    status: 'live',
    description: 'List shows pending ₹ + search/sort; shop-wide aging board; bill-by-bill payment allocation; bank fields; WhatsApp dues; statement deep-link to Reports; mobile payable + due dates.',
  },
  {
    title: 'Duplicate purchase invoice guard',
    phase: 'Phase 2',
    status: 'live',
    description: 'Stock-in rejects duplicate supplier invoice # by default (409); check-invoice API + optional append-to-existing; web/mobile warn before confirm.',
  },
  {
    title: 'Stock-in drafts + product enrichment',
    phase: 'Phase 2',
    status: 'live',
    description: 'Resume drafts with serials/commit flags; Complete product queue with required chips (HSN, etc.).',
  },
  {
    title: 'Trade-in pipeline',
    phase: 'Phase 2+',
    status: 'live',
    description: 'Quote → Accept → Receive → Inventory (IMEI required); reject path; enrichment on convert.',
  },
  {
    title: 'Product variants / batch-expiry',
    phase: 'Phase 2+',
    status: 'building',
    description: 'trackBatch toggle, variantLabel, parentProductId on product form; batch section coming on detail view.',
    integrateLater: true,
  },
  {
    title: 'GSTR-2B / ITC reconciliation',
    phase: 'Next #5',
    status: 'live',
    description: '/dashboard/gstr2b — CSV import, auto-match purchase register, ignore lines; MSME 45-day aging pairs with compliance.',
  },
  {
    title: 'Customer 360 + udhaar aging',
    phase: 'Phase 3',
    status: 'live',
    description: 'Ledger entry trail, allocate collect, receivables board, statement + WA (web + mobile).',
  },
  {
    title: 'Loyalty redeem at POS',
    phase: 'Phase 3',
    status: 'live',
    description: 'Redeem points during checkout on web and mobile.',
  },
  {
    title: 'Hindi / voice billing on mobile',
    phase: 'Phase 4',
    status: 'live',
    description: 'hi-IN UI toggle + Hinglish/Hindi voice add-to-cart on POS.',
  },
  {
    title: 'Mobile offline billing',
    phase: 'Phase 4',
    status: 'live',
    description: 'SQLite catalog + outbox sync to /sync/push.',
  },
  {
    title: 'AI agents (alerts + approve → PO)',
    phase: 'Phase 5',
    status: 'live',
    description: 'Realtime alerts; approve creates purchase order when possible.',
  },
  {
    title: 'Native Bluetooth/USB printer driver',
    phase: 'Phase 1+',
    status: 'live',
    description: 'Flutter RFCOMM write + Electron COM/.bin raw ESC/POS via POST /hardware/print-thermal.',
    integrateLater: true,
  },
  {
    title: 'AA bank consent + feed sync',
    phase: 'Next #9',
    status: 'live',
    description: 'connect/start → authorize → callback; AA sync; manual connect still available.',
    integrateLater: true,
  },
  {
    title: 'Cron overdue reminders',
    phase: 'Ops',
    status: 'live',
    description: 'Daily 09:00 RemindersCronService for supplier + customer overdue (REMINDERS_CRON).',
    integrateLater: true,
  },
  {
    title: 'Desktop Electron party khata',
    phase: 'Desktop',
    status: 'live',
    description: 'Khata tab: payables/receivables boards + unified search + open web detail.',
    integrateLater: true,
  },
  {
    title: 'Mobile corrections + scan-to-count',
    phase: 'Next #1',
    status: 'live',
    description: 'Mobile stock take: barcode scan POST /scan, variance reasons, approve PENDING_APPROVAL; web scan parity.',
  },
  {
    title: 'Partial GRN → draft purchase bill',
    phase: 'Next #2',
    status: 'live',
    description: 'PO receive: optional invoice #, billAsDraft checkbox; partial without invoice auto-creates DRAFT bill with link.',
  },
  {
    title: 'Category / ABC cycle counts',
    phase: 'Next #3',
    status: 'live',
    description: 'Start stock take by category or ABC grades; load /stock-takes/abc-cycle and start due productIds.',
  },
  {
    title: 'Variance reason + approval',
    phase: 'Next #4',
    status: 'live',
    description: 'Variance reason dropdown (shrink/damage/found/recount/other); submit → PENDING_APPROVAL; owner Approve posts ADJUSTMENT.',
  },
  {
    title: 'Supplier MSME + 45-day aging',
    phase: 'Next #6',
    status: 'live',
    description: 'isMsme + paymentTermsDays on supplier form; payables board shows msmeOver45 badge for compliance.',
  },
  {
    title: 'Unified party search',
    phase: 'Next',
    status: 'live',
    description: 'GET /parties/search in dashboard header — jump to customer or supplier ledger.',
  },
  {
    title: 'Bank AA feed connect',
    phase: 'Next',
    status: 'live',
    description: 'Bank reconcile: AA connect (provider, consentId, feedUrl), status, /aa/sync for statement import.',
  },
];

function StatusPill({ status }: { status: RoadmapItem['status'] }) {
  const styles =
    status === 'live'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'building'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  const label = status === 'live' ? 'Live' : status === 'building' ? 'Building now' : 'Coming soon';
  return (
    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', styles)}>
      {label}
    </span>
  );
}

export default function RoadmapPage() {
  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Upgrade roadmap"
        description="Phase 0–5 core is live. Next slice (scan-to-count, partial GRN draft, ABC cycles, variance approval, 2B, MSME) is wired on web + mobile."
      />

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
        <p className="text-sm text-slate-700">
          Billing, stock, CRM, e-invoice/e-way hooks, mobile parity, party khata (supplier + customer entry
          trail), and AI approve→PO are live. <strong>Coming soon</strong> items below are the researched next
          slice — not blockers for daily GST billing. Full research:{' '}
          <code className="text-xs">docs/UPGRADE_PLAN_BILLING_STOCK_CRM.md</code> §7.
        </p>
      </Card>

      <div className="grid gap-3">
        {ITEMS.map((item) => (
          <Card key={item.title} className="border-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                  <StatusPill status={item.status} />
                  <span className="text-xs font-medium text-slate-400">{item.phase}</span>
                </div>
                <p className="text-sm text-slate-500">{item.description}</p>
                {item.integrateLater ? (
                  <p className="text-xs font-medium text-teal-700">
                    Hook ready for later integration — UI shows Coming soon until enabled.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        Need a module sooner?{' '}
        <Link href="/dashboard/settings" className="font-medium text-brand hover:underline">
          Tell us in shop settings notes
        </Link>{' '}
        or prioritize from the upgrade plan.
      </p>
    </div>
  );
}
