/**
 * Repair intake token slip — plain text + ESC/POS bytes (desktop/mobile raw print) and a
 * receipt-styled HTML page (web browser print dialog). `jobNumber` doubles as the token: it's
 * already unique per tenant/year and human-readable, so no separate token number is minted.
 * Sibling to apps/api/src/invoices/thermal.util.ts — same ESC/POS init+cut convention.
 */
export interface RepairTokenData {
  shopName: string;
  jobNumber: string;
  receivedAt: string;
  customerName?: string;
  customerPhone?: string;
  deviceModel: string;
  imei?: string | null;
  accessories?: string | null;
  issue: string;
  status: string;
  estimateAmount?: number | null;
  warrantyDays: number;
}

function money(n: number) {
  return `Rs ${n.toFixed(2)}`;
}

export function buildRepairTokenText(data: RepairTokenData, paperWidthMm: 58 | 80 = 58): { text: string; escposBase64: string } {
  const width = paperWidthMm === 80 ? 48 : 32;
  const line = (ch = '-') => ch.repeat(width);
  const center = (s: string) => {
    const t = s.slice(0, width);
    const pad = Math.max(0, Math.floor((width - t.length) / 2));
    return ' '.repeat(pad) + t;
  };
  const rows: string[] = [
    center('=== REPAIR TOKEN ==='),
    center(data.shopName),
    `Token: ${data.jobNumber}`,
    `Date: ${new Date(data.receivedAt).toLocaleString('en-IN')}`,
    line(),
    `Customer: ${data.customerName ?? '-'}`,
    `Phone: ${data.customerPhone ?? '-'}`,
    `Device: ${data.deviceModel}`,
    ...(data.imei ? [`IMEI: ${data.imei}`] : []),
    ...(data.accessories ? [`Accessories: ${data.accessories}`] : []),
    `Issue: ${data.issue}`,
    `Status: ${data.status}`,
    ...(data.estimateAmount != null ? [`Estimate: ${money(Number(data.estimateAmount))}`] : []),
    `Warranty: ${data.warrantyDays} days after delivery`,
    line(),
    'Keep this token slip.',
    'Show at counter for status / pickup.',
    center('===================='),
    '',
    '',
  ];
  const text = rows.join('\n');
  const escpos = encodeEscPos(text);
  return { text, escposBase64: Buffer.from(escpos).toString('base64') };
}

function encodeEscPos(text: string): Uint8Array {
  const init = [0x1b, 0x40]; // ESC @
  const cut = [0x1d, 0x56, 0x00]; // GS V
  const body = Array.from(Buffer.from(text, 'utf8'));
  const feed = [0x0a, 0x0a, 0x0a];
  return Uint8Array.from([...init, ...body, ...feed, ...cut]);
}

export function buildRepairTokenHtml(data: RepairTokenData, paperWidthMm: 58 | 80 = 58): string {
  const widthMm = paperWidthMm;
  const esc = (s: string) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const rows: string[] = [];
  rows.push(`<div class="line">Customer: ${esc(data.customerName ?? '-')}</div>`);
  rows.push(`<div class="line">Phone: ${esc(data.customerPhone ?? '-')}</div>`);
  rows.push(`<div class="line">Device: ${esc(data.deviceModel)}</div>`);
  if (data.imei) rows.push(`<div class="line">IMEI: ${esc(data.imei)}</div>`);
  if (data.accessories) rows.push(`<div class="line">Accessories: ${esc(data.accessories)}</div>`);
  rows.push(`<div class="line">Issue: ${esc(data.issue)}</div>`);
  rows.push(`<div class="line">Status: ${esc(data.status)}</div>`);
  if (data.estimateAmount != null) rows.push(`<div class="line">Estimate: ${esc(money(Number(data.estimateAmount)))}</div>`);
  rows.push(`<div class="line">Warranty: ${data.warrantyDays} days after delivery</div>`);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Repair Token ${esc(data.jobNumber)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { width: ${widthMm}mm; margin: 0; padding: 4mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .title { font-size: 13px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .line { margin: 2px 0; word-break: break-word; }
  .footer { margin-top: 6px; }
  @media print { body { padding: 2mm; } }
</style>
</head>
<body>
  <div class="center bold title">=== REPAIR TOKEN ===</div>
  <div class="center">${esc(data.shopName)}</div>
  <hr />
  <div class="line bold">Token: ${esc(data.jobNumber)}</div>
  <div class="line">Date: ${esc(new Date(data.receivedAt).toLocaleString('en-IN'))}</div>
  <hr />
  ${rows.join('\n  ')}
  <hr />
  <div class="footer center">Keep this token slip.<br/>Show at counter for status / pickup.</div>
</body>
</html>`;
}
