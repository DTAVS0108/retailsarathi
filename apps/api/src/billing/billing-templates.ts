export const BILLING_TEMPLATE_IDS = [
  'classic',
  'minimal',
  'modern',
  'gst-formal',
  'retail-bold',
  'tally-einvoice',
  'tally-standard',
  'goel-enterprise',
] as const;

export type BillingTemplateId = (typeof BILLING_TEMPLATE_IDS)[number];

export interface BillingTemplateMeta {
  id: BillingTemplateId;
  name: string;
  description: string;
  accent: string;
  layout: 'a4' | 'thermal';
  /** Good fit for phone PDF / Bluetooth print via the mobile app. */
  mobileRecommended?: boolean;
  /** Shared static preview path (web / desktop public). */
  previewImage: string;
  /** Flutter asset path for the same PNG. */
  mobilePreviewAsset: string;
}

export const BILLING_TEMPLATES: BillingTemplateMeta[] = [
  {
    id: 'classic',
    name: 'Classic GST',
    description: 'Rule 46 compliant layout with HSN table, tax summary, and amount in words.',
    accent: '#0F766E',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/classic.png',
    mobilePreviewAsset: 'assets/invoice_previews/classic.png',
  },
  {
    id: 'minimal',
    name: 'Minimal Compliance',
    description: 'Dense black-and-white format optimised for laser printing and audits.',
    accent: '#1F2937',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/minimal.png',
    mobilePreviewAsset: 'assets/invoice_previews/minimal.png',
  },
  {
    id: 'modern',
    name: 'Modern Pro',
    description: 'Contemporary design with e-invoice QR slot and payment summary.',
    accent: '#1D4ED8',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/modern.png',
    mobilePreviewAsset: 'assets/invoice_previews/modern.png',
  },
  {
    id: 'gst-formal',
    name: 'GST Formal',
    description: 'Government-style tax invoice with signature blocks and legal footer.',
    accent: '#92400E',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/gst-formal.png',
    mobilePreviewAsset: 'assets/invoice_previews/gst-formal.png',
  },
  {
    id: 'retail-bold',
    name: 'Retail Counter',
    description: 'Bold counter bill with large total, UPI note, and customer-friendly layout.',
    accent: '#BE123C',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/retail-bold.png',
    mobilePreviewAsset: 'assets/invoice_previews/retail-bold.png',
  },
  {
    id: 'tally-einvoice',
    name: 'Tally E-Invoice',
    description: 'Tally-style tax invoice with IRN header, large e-invoice QR, and HSN tax table.',
    accent: '#1D4ED8',
    layout: 'a4',
    previewImage: '/invoice-previews/tally-einvoice.png',
    mobilePreviewAsset: 'assets/invoice_previews/tally-einvoice.png',
  },
  {
    id: 'tally-standard',
    name: 'Tally Standard',
    description: 'Classic Tally tax invoice with e-way bill slot, item table, and bank footer.',
    accent: '#374151',
    layout: 'a4',
    previewImage: '/invoice-previews/tally-standard.png',
    mobilePreviewAsset: 'assets/invoice_previews/tally-standard.png',
  },
  {
    id: 'goel-enterprise',
    name: 'B2B Trade',
    description: 'Dealer-style layout with inline CGST/SGST columns, vehicle/e-way header, and bottom IRN QR.',
    accent: '#6D28D9',
    layout: 'a4',
    previewImage: '/invoice-previews/goel-enterprise.png',
    mobilePreviewAsset: 'assets/invoice_previews/goel-enterprise.png',
  },
];

export function isBillingTemplateId(value: string): value is BillingTemplateId {
  return (BILLING_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function resolveTemplateForChannel(
  tenant: { defaultInvoiceTemplate?: string | null; mobileInvoiceTemplate?: string | null },
  channel: 'web' | 'mobile' = 'web',
): BillingTemplateId {
  const raw =
    channel === 'mobile'
      ? tenant.mobileInvoiceTemplate ?? tenant.defaultInvoiceTemplate ?? 'retail-bold'
      : tenant.defaultInvoiceTemplate ?? 'classic';
  return isBillingTemplateId(raw) ? raw : channel === 'mobile' ? 'retail-bold' : 'classic';
}
