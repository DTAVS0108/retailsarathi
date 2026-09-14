export type NavLink = {
  href: string;
  label: string;
  id: string;
  icon: string;
  description?: string;
};

export type NavSection = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  items: NavLink[];
};

/** Sidebar + home modules grouped by business function */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'billing',
    title: 'Billing',
    shortTitle: 'Billing',
    icon: 'billing',
    description: 'Bills, invoices, customers, wholesale.',
    items: [
      { href: '/dashboard/pos', label: 'POS / New Bill', id: 'pos', icon: 'pos', description: 'Counter billing with barcode scan' },
      { href: '/dashboard/invoices', label: 'Invoices', id: 'invoices', icon: 'invoices', description: 'Tax invoices, print, cancel' },
      { href: '/dashboard/returns', label: 'Returns', id: 'returns', icon: 'returns', description: 'Credit notes against sales' },
      { href: '/dashboard/customers', label: 'Customers', id: 'customers', icon: 'customers', description: 'Retail & wholesale parties' },
      { href: '/dashboard/wholesale', label: 'Wholesale Pricing', id: 'wholesale', icon: 'wholesale', description: 'Price lists for dealers' },
      { href: '/dashboard/scan', label: 'Scan Order Sheet', id: 'scan', icon: 'scan', description: 'OCR order → bill draft' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    shortTitle: 'Stock',
    icon: 'stock',
    description: 'Catalog, stock-in, suppliers, POs.',
    items: [
      { href: '/dashboard/products', label: 'Products & Stock', id: 'products', icon: 'products', description: 'SKU, HSN, GST slab, qty' },
      {
        href: '/dashboard/stock-in',
        label: 'Upload Invoice → Stock',
        id: 'stock-in',
        icon: 'stock-in',
        description: 'Supplier bill → inventory',
      },
      {
        href: '/dashboard/products-needing-details',
        label: 'Products needing details',
        id: 'products-needing-details',
        icon: 'products-needing-details',
        description: 'Barcode, price, model after stock-in',
      },
      {
        href: '/dashboard/stock-drafts',
        label: 'Stock drafts',
        id: 'stock-drafts',
        icon: 'stock-drafts',
        description: 'Resume soft-saved invoice receiving',
      },
      { href: '/dashboard/trade-in', label: 'Trade-in', id: 'trade-in', icon: 'trade-in', description: 'Buy-back to stock' },
      {
        href: '/dashboard/suppliers',
        label: 'Suppliers & ledger',
        id: 'suppliers',
        icon: 'suppliers',
        description: 'Vendors, bills, payments, cheques',
      },
      {
        href: '/dashboard/purchase-bills',
        label: 'Purchase bills',
        id: 'purchase-bills',
        icon: 'purchase-bills',
        description: 'Supplier invoices linked to stock',
      },
      { href: '/dashboard/purchase-orders', label: 'Purchase Orders', id: 'purchase-orders', icon: 'purchase-orders', description: 'PO → goods receipt' },
      { href: '/dashboard/stock-take', label: 'Stock Take', id: 'stock-take', icon: 'stock-take', description: 'Cycle count & variance' },
      {
        href: '/dashboard/corrections',
        label: 'Corrections',
        id: 'corrections',
        icon: 'corrections',
        description: 'Void bills, archive suppliers, restore products',
      },
    ],
  },
  {
    id: 'service',
    title: 'Service',
    shortTitle: 'Service',
    icon: 'service',
    description: 'Workshop jobs and service billing.',
    items: [
      { href: '/dashboard/repairs', label: 'Repair Jobs', id: 'repairs', icon: 'repairs', description: 'Intake → estimate → delivery' },
    ],
  },
  {
    id: 'gst-finance',
    title: 'GST & Finance',
    shortTitle: 'Finance',
    icon: 'finance',
    description: 'GST returns, accounts, compliance.',
    items: [
      {
        href: '/dashboard/ledgers',
        label: 'Ledgers',
        id: 'ledgers',
        icon: 'accounting',
        description: 'Customer, supplier, sell & buy day books',
      },
      { href: '/dashboard/gst', label: 'GST Reports', id: 'gst', icon: 'gst', description: 'GSTR-1 / GSTR-3B prep' },
      {
        href: '/dashboard/gstr2b',
        label: 'GSTR-2B Reconcile',
        id: 'gstr2b',
        icon: 'compliance',
        description: 'Import 2B CSV, match purchase register',
      },
      {
        href: '/dashboard/reports',
        label: 'Sell & Buy Reports',
        id: 'reports',
        icon: 'analytics',
        description: 'Weekly / monthly / FY · CSV · Excel · PDF',
      },
      { href: '/dashboard/accounting', label: 'Accounting', id: 'accounting', icon: 'accounting', description: 'Books, P&L, ITR prep' },
      {
        href: '/dashboard/bank-reconcile',
        label: 'Bank Reconciliation',
        id: 'bank-reconcile',
        icon: 'accounting',
        description: 'Import bank statements, match to payments',
      },
      {
        href: '/dashboard/compliance',
        label: 'Compliance+',
        id: 'compliance',
        icon: 'compliance',
        description: 'QR, e-invoice, e-way bill',
      },
    ],
  },
  {
    id: 'people-ops',
    title: 'People & Ops',
    shortTitle: 'People',
    icon: 'people',
    description: 'Staff, branches, messaging.',
    items: [
      { href: '/dashboard/staff', label: 'Staff', id: 'staff', icon: 'staff', description: 'Attendance & commissions' },
      { href: '/dashboard/branches', label: 'Multi-Branch', id: 'branches', icon: 'branches', description: 'Transfers & consolidated view' },
      { href: '/dashboard/notifications', label: 'Notifications', id: 'notifications', icon: 'notifications', description: 'SMS / WhatsApp templates' },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    shortTitle: 'Insights',
    icon: 'insights',
    description: 'Analytics and AI helpers.',
    items: [
      { href: '/dashboard/analytics', label: 'Analytics', id: 'analytics', icon: 'analytics', description: 'ABC, margins, salespeople' },
      { href: '/dashboard/ai', label: 'AI Insights', id: 'ai', icon: 'ai', description: 'Reorder & forecast helpers' },
      {
        href: '/dashboard/roadmap',
        label: 'Upgrade roadmap',
        id: 'roadmap',
        icon: 'roadmap',
        description: 'Building now + Coming soon',
      },
    ],
  },
  {
    id: 'channels',
    title: 'Channels',
    shortTitle: 'Channels',
    icon: 'channels',
    description: 'Online orders and devices.',
    items: [
      { href: '/dashboard/ecommerce', label: 'E-commerce Sync', id: 'ecommerce', icon: 'ecommerce', description: 'Marketplace channels' },
      { href: '/dashboard/hardware', label: 'Hardware', id: 'hardware', icon: 'hardware', description: 'Printers & scanners' },
    ],
  },
  {
    id: 'setup',
    title: 'Setup',
    shortTitle: 'Setup',
    icon: 'setup',
    description: 'Profile, plan, and admin.',
    items: [
      { href: '/dashboard/settings', label: 'Shop Settings', id: 'settings', icon: 'settings', description: 'GSTIN, address, bill template' },
      { href: '/dashboard/subscription', label: 'Subscription', id: 'subscription', icon: 'subscription', description: 'Plan & billing' },
      { href: '/admin', label: 'SaaS Admin', id: 'admin', icon: 'admin', description: 'Platform console' },
    ],
  },
];

export function sectionContainingPath(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: { sectionId: string; hrefLen: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (!best || item.href.length > best.hrefLen) {
          best = { sectionId: section.id, hrefLen: item.href.length };
        }
      }
    }
  }
  return best?.sectionId ?? null;
}

export function itemMatchingPath(pathname: string | null): NavLink | null {
  if (!pathname) return null;
  let best: NavLink | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
  }
  return best;
}

export function sectionForItem(item: NavLink | null): NavSection | null {
  if (!item) return null;
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.id === item.id)) ?? null;
}
