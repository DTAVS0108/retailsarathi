import type { ApiProduct } from './types';

export function stateCodeFromGstin(gstin?: string | null) {
  const g = (gstin ?? '').replace(/\s/g, '').toUpperCase();
  if (g.length >= 2 && /^\d{2}/.test(g)) return g.slice(0, 2);
  return '';
}

export function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeProduct(p: Record<string, unknown>): ApiProduct {
  const purchase = Number(p.purchase_price ?? p.purchasePrice ?? 0);
  const mrpRaw = p.mrp;
  return {
    id: String(p.id),
    sku: String(p.sku ?? ''),
    barcode: (p.barcode as string | null) ?? null,
    name: String(p.name ?? ''),
    hsn_code: String(p.hsn_code ?? p.hsnCode ?? ''),
    sale_price: Number(p.sale_price ?? p.salePrice ?? 0),
    gst_rate: Number(p.gst_rate ?? p.gstRate ?? 0),
    stock_qty: Number(p.stock_qty ?? p.stockQty ?? 0),
    trackSerial: Boolean(p.trackSerial),
    category: (p.category as string | null) ?? null,
    brand: (p.brand as string | null) ?? null,
    model: (p.model as string | null) ?? null,
    lowStockThreshold: Number(p.lowStockThreshold ?? p.low_stock_threshold ?? 5),
    purchasePrice: purchase,
    purchase_price: purchase,
    mrp: mrpRaw != null && mrpRaw !== '' ? Number(mrpRaw) : null,
    serials: Array.isArray(p.serials)
      ? (p.serials as Array<Record<string, unknown>>).map((s) => ({
          id: s.id != null ? String(s.id) : undefined,
          serialNumber: String(s.serialNumber ?? s),
        }))
      : [],
  };
}

export function marginPct(sale: number, purchase: number) {
  if (!(purchase > 0) || !(sale > 0)) return null;
  return Math.round(((sale - purchase) / purchase) * 1000) / 10;
}

export function playScanBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.stop(ctx.currentTime + 0.09);
    window.setTimeout(() => void ctx.close(), 120);
  } catch {
    /* ignore */
  }
}
