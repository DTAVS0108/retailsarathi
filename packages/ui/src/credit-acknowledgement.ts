/** Letterhead-style credit / udhaar acknowledgement (not a tax invoice). */

import { combinePrintDocuments } from './print';

export interface CreditAcknowledgementData {
  shopName: string;
  shopAddress: string;
  gstin?: string;
  shopPhone?: string;
  shopEmail?: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerAddress?: string;
  grandTotal: number;
  /** Non-CREDIT payments received today */
  amountPaid: number;
  /** CREDIT / pending udhaar */
  amountPending: number;
  payments?: Array<{ method: string; amount: number; reference?: string }>;
  /** Optional goods summary lines */
  lines?: Array<{ name: string; qty: number; amount: number; serialNumbers?: string[] }>;
  notes?: string;
  /** Original copy | Customer copy */
  copyLabel?: 'Original Copy' | 'Customer Copy' | string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function methodLabel(method: string) {
  return method.replace(/_/g, ' ');
}

/**
 * A4 letterhead acknowledgement: paid now + pending balance.
 * Prints customer + shop signature blocks. Use for credit / partial-pay sales.
 */
export function generateCreditAcknowledgementHtml(data: CreditAcknowledgementData): string {
  const paid = Math.max(0, Number(data.amountPaid) || 0);
  const pending = Math.max(0, Number(data.amountPending) || 0);
  const total = Number(data.grandTotal) || paid + pending;
  const copy = escapeHtml(data.copyLabel ?? 'Customer Copy');
  const shopSigLabel =
    data.copyLabel === 'Original Copy'
      ? 'Authorised signatory (original copy)'
      : 'Authorised signatory (customer copy)';

  const paymentRows = (data.payments ?? [])
    .filter((p) => Number(p.amount) > 0)
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(methodLabel(p.method))}${p.reference ? ` <span class="muted">(${escapeHtml(p.reference)})</span>` : ''}</td>
          <td class="num">₹${fmt(Number(p.amount))}</td>
        </tr>`,
    )
    .join('');

  const lineRows = (data.lines ?? [])
    .map((l) => {
      const serials =
        l.serialNumbers?.filter(Boolean).length
          ? `<div class="muted">S/N: ${escapeHtml(l.serialNumbers.join(', '))}</div>`
          : '';
      return `<tr>
        <td>${escapeHtml(l.name)}${serials}</td>
        <td class="num">${l.qty}</td>
        <td class="num">₹${fmt(Number(l.amount))}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment Acknowledgement — ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Noto Sans", system-ui, sans-serif;
      color: #1e293b;
      font-size: 12.5px;
      line-height: 1.45;
      background: #fff;
    }
    .page { max-width: 190mm; margin: 0 auto; }
    .letterhead {
      border-bottom: 3px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: start;
    }
    .shop-name {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: 0.01em;
    }
    .shop-meta { margin-top: 4px; color: #475569; font-size: 11.5px; }
    .doc-badge {
      border: 1px solid #0f766e;
      color: #0f766e;
      padding: 8px 12px;
      text-align: center;
      border-radius: 4px;
      min-width: 120px;
    }
    .doc-badge strong { display: block; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
    .doc-badge span { font-size: 10px; color: #64748b; }
    h1 {
      margin: 0 0 6px;
      text-align: center;
      font-size: 16px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .subtitle {
      text-align: center;
      color: #64748b;
      font-size: 11px;
      margin-bottom: 16px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 4px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #ecfdf5; font-size: 11px; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #64748b; font-size: 11px; }
    .summary {
      margin-top: 14px;
      border: 2px solid #0f766e;
      border-radius: 8px;
      overflow: hidden;
    }
    .summary-row {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 10px 14px;
      border-bottom: 1px solid #99f6e4;
      background: #fff;
    }
    .summary-row:last-child { border-bottom: none; }
    .summary-row.paid { background: #ecfdf5; }
    .summary-row.pending { background: #fff7ed; }
    .summary-row.total { background: #0f766e; color: #fff; font-weight: 700; }
    .summary-row .amt { font-size: 15px; font-weight: 700; }
    .declare {
      margin-top: 16px;
      padding: 12px;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      font-size: 12px;
      color: #334155;
    }
    .sigs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 36px;
    }
    .sig-line {
      border-top: 1px solid #64748b;
      margin-top: 48px;
      padding-top: 6px;
      text-align: center;
      color: #475569;
      font-size: 11px;
    }
    .footer-note {
      margin-top: 22px;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      <div>
        <p class="shop-name">${escapeHtml(data.shopName)}</p>
        <div class="shop-meta">
          ${escapeHtml(data.shopAddress || '')}
          ${data.gstin ? `<br>GSTIN: <strong>${escapeHtml(data.gstin)}</strong>` : ''}
          ${data.shopPhone ? `<br>Phone: ${escapeHtml(data.shopPhone)}` : ''}
          ${data.shopEmail ? ` · ${escapeHtml(data.shopEmail)}` : ''}
        </div>
      </div>
      <div class="doc-badge">
        <strong>Acknowledgement</strong>
        <span>${copy}</span>
      </div>
    </div>

    <h1>Payment / Credit Acknowledgement</h1>
    <p class="subtitle">
      This is not a tax invoice. Tax invoice no. <strong>${escapeHtml(data.invoiceNumber)}</strong> remains the GST document.
    </p>

    <div class="grid-2">
      <div class="box">
        <div class="label">Customer</div>
        <strong>${escapeHtml(data.customerName || 'Walk-in customer')}</strong>
        ${data.customerAddress ? `<div>${escapeHtml(data.customerAddress)}</div>` : ''}
        ${data.customerPhone ? `<div>Phone: ${escapeHtml(data.customerPhone)}</div>` : ''}
        ${data.customerGstin ? `<div>GSTIN: ${escapeHtml(data.customerGstin)}</div>` : ''}
      </div>
      <div class="box">
        <div class="label">Reference</div>
        <div>Invoice no.: <strong>${escapeHtml(data.invoiceNumber)}</strong></div>
        <div>Date: <strong>${escapeHtml(data.date)}</strong></div>
        <div class="muted" style="margin-top:6px">Goods / services as per tax invoice above.</div>
      </div>
    </div>

    ${
      lineRows
        ? `<table>
      <thead><tr><th>Particulars</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>`
        : ''
    }

    ${
      paymentRows
        ? `<table>
      <thead><tr><th>Payment breakup</th><th class="num">Amount</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>`
        : ''
    }

    <div class="summary">
      <div class="summary-row total">
        <span>Invoice total</span>
        <span class="amt">₹${fmt(total)}</span>
      </div>
      <div class="summary-row paid">
        <span>Amount paid / received today</span>
        <span class="amt">₹${fmt(paid)}</span>
      </div>
      <div class="summary-row pending">
        <span>Balance pending (udhaar / credit)</span>
        <span class="amt">₹${fmt(pending)}</span>
      </div>
    </div>

    <div class="declare">
      We acknowledge that against tax invoice <strong>${escapeHtml(data.invoiceNumber)}</strong> dated
      <strong>${escapeHtml(data.date)}</strong>, the customer has paid
      <strong>₹${fmt(paid)}</strong> and a balance of <strong>₹${fmt(pending)}</strong> remains payable to
      <strong>${escapeHtml(data.shopName)}</strong>.
      ${data.notes ? `<br><br>Note: ${escapeHtml(data.notes)}` : ''}
      <br><br>
      The customer agrees to clear the pending amount as per shop credit terms. Goods once sold are subject to the shop’s return and warranty policy.
    </div>

    <div class="sigs">
      <div>
        <div class="sig-line">Customer signature<br><span class="muted">${escapeHtml(data.customerName || 'Customer')}</span></div>
      </div>
      <div>
        <div class="sig-line">For ${escapeHtml(data.shopName)}<br><span class="muted">${escapeHtml(shopSigLabel)}</span></div>
      </div>
    </div>

    <p class="footer-note">Generated by RetailSarathi · Keep with tax invoice for credit tracking</p>
  </div>
</body>
</html>`;
}

/** Original + customer acknowledgement copies in one print job. */
export function generateCreditAcknowledgementBothCopiesHtml(
  data: Omit<CreditAcknowledgementData, 'copyLabel'>,
): string {
  return combinePrintDocuments([
    generateCreditAcknowledgementHtml({ ...data, copyLabel: 'Original Copy' }),
    generateCreditAcknowledgementHtml({ ...data, copyLabel: 'Customer Copy' }),
  ]);
}
