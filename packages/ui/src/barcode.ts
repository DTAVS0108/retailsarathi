// Client-side only (uses `document`) — call from a browser/Electron-renderer context,
// never during SSR. Used for both barcode-scan labels and price-tag printing.
import JsBarcode from 'jsbarcode';

export interface BarcodeLabelItem {
  /** Value encoded in the barcode — the product's barcode, or its SKU when no barcode is set. */
  value: string;
  name: string;
  price?: number;
  copies?: number;
}

export interface BarcodeLabelOptions {
  labelWidthMm?: number;
  labelHeightMm?: number;
  shopName?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Renders a Code128 barcode to an SVG markup string using a real DOM element (browser/Electron only). */
export function renderBarcodeSvg(value: string, opts?: { widthPx?: number; heightPx?: number }): string {
  if (typeof document === 'undefined') return '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value || ' ', {
    format: 'CODE128',
    width: opts?.widthPx ?? 1.6,
    height: opts?.heightPx ?? 40,
    displayValue: false,
    margin: 0,
  });
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Builds a printable HTML document of barcode/price labels sized for common
 * thermal label printers (default 50x25mm, matching the LABEL_PRINTER hardware preset).
 * One `<div class="label">` per copy, each on its own page via `page-break-after`.
 */
export function generateBarcodeLabelsHtml(items: BarcodeLabelItem[], opts?: BarcodeLabelOptions): string {
  const w = opts?.labelWidthMm ?? 50;
  const h = opts?.labelHeightMm ?? 25;
  const labels: string[] = [];

  for (const item of items) {
    const copies = Math.max(1, Math.floor(item.copies ?? 1));
    const svg = renderBarcodeSvg(item.value, { widthPx: 1.4, heightPx: Math.round(h * 1.6) });
    for (let i = 0; i < copies; i++) {
      labels.push(`
        <div class="label">
          ${opts?.shopName ? `<div class="shop">${escapeHtml(opts.shopName)}</div>` : ''}
          <div class="name">${escapeHtml(item.name).slice(0, 40)}</div>
          ${svg}
          <div class="code">${escapeHtml(item.value)}</div>
          ${item.price != null ? `<div class="price">Rs ${item.price.toFixed(2)}</div>` : ''}
        </div>
      `);
    }
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Barcode Labels</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: ${w}mm; height: ${h}mm; padding: 1.5mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    page-break-after: always; overflow: hidden; text-align: center;
  }
  .shop { font-size: 6.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .name {
    font-size: 8px; font-weight: 600; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  svg { width: 92%; height: auto; margin: 1mm 0; }
  .code { font-size: 7px; letter-spacing: 1px; }
  .price { font-size: 10px; font-weight: 800; margin-top: 0.5mm; }
</style>
</head>
<body>${labels.join('')}</body>
</html>`;
}
