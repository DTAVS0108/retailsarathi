/**
 * Minimal ESC/POS thermal receipt builder (58/80mm text printers).
 * Returns printable UTF-8 text + base64 ESC/POS bytes for raw USB/Bluetooth.
 */
export function buildThermalReceipt(data: {
  shopName: string;
  shopAddress?: string;
  gstin?: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  lines: Array<{ name: string; qty: number; rate: number; amount: number }>;
  subtotal: number;
  tax: number;
  grandTotal: number;
  payments?: Array<{ method: string; amount: number }>;
  /** 58mm ≈ 32 cols, 80mm ≈ 48 cols */
  paperWidthMm?: 58 | 80;
}): { text: string; escposBase64: string } {
  const width = data.paperWidthMm === 80 ? 48 : 32;
  const line = (ch = '-') => ch.repeat(width);
  const rows: string[] = [];
  const push = (s: string) => rows.push(s.slice(0, width));
  const money = (n: number) => `₹${n.toFixed(2)}`;

  push(center(data.shopName, width));
  if (data.shopAddress) push(center(data.shopAddress, width));
  if (data.gstin) push(center(`GSTIN ${data.gstin}`, width));
  push(line('='));
  push(`Inv: ${data.invoiceNumber}`);
  push(`Dt: ${data.date.slice(0, 16)}`);
  if (data.customerName) push(`Cust: ${data.customerName}`);
  push(line());
  for (const l of data.lines) {
    push(l.name);
    push(`  ${l.qty} x ${money(l.rate)}`.padEnd(width - money(l.amount).length) + money(l.amount));
  }
  push(line());
  push(`Subtotal`.padEnd(width - money(data.subtotal).length) + money(data.subtotal));
  push(`Tax`.padEnd(width - money(data.tax).length) + money(data.tax));
  push(`TOTAL`.padEnd(width - money(data.grandTotal).length) + money(data.grandTotal));
  if (data.payments?.length) {
    push(line());
    for (const p of data.payments) {
      push(`${p.method}`.padEnd(width - money(p.amount).length) + money(p.amount));
    }
  }
  push(line('='));
  push(center('Thank you!', width));
  push('');
  push('');

  const text = rows.join('\n');
  const escpos = encodeEscPos(text);
  return { text, escposBase64: Buffer.from(escpos).toString('base64') };
}

function center(s: string, width: number) {
  const t = s.slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
}

function encodeEscPos(text: string): Uint8Array {
  const init = [0x1b, 0x40]; // ESC @
  const cut = [0x1d, 0x56, 0x00]; // GS V
  const body = Array.from(Buffer.from(text.replace(/\n/g, '\n'), 'utf8'));
  // Feed a few lines then cut
  const feed = [0x0a, 0x0a, 0x0a];
  return Uint8Array.from([...init, ...body, ...feed, ...cut]);
}
