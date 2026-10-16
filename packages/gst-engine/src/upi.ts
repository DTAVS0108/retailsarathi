export interface UpiPaymentInput {
  /** Payee VPA, e.g. "shopname@okhdfcbank" */
  vpa: string;
  payeeName: string;
  amount: number;
  /** Short transaction note (e.g. invoice number) — UPI apps generally show only ~50 chars. */
  note?: string;
}

/** Builds a standard UPI deep link (`upi://pay?...`) that any UPI app can open to pre-fill a payment. */
export function buildUpiPaymentUri(input: UpiPaymentInput): string {
  const params = new URLSearchParams({
    pa: input.vpa,
    pn: input.payeeName,
    am: input.amount.toFixed(2),
    cu: 'INR',
  });
  if (input.note) params.set('tn', input.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

/** Renders a UPI payment URI as a scannable QR code image (same qrserver.com service used for e-invoice QR). */
export function upiQrImageUrl(uri: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(uri)}`;
}

/** Very loose VPA shape check — `<handle>@<bank/psp>`, no spaces. */
export function isValidUpiId(vpa: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/.test(vpa.trim());
}
