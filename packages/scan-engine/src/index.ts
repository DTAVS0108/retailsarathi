export interface ProductLookup {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  salePrice: number;
  gstRate: number;
  hsnCode: string;
}

export interface OrderSheetDraftLine {
  rawText: string;
  barcode?: string;
  sku?: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  productId?: string | null;
  matchConfidence: number;
}

export interface OrderSheetDraft {
  customer: { name?: string; phone?: string; gstin?: string };
  lines: OrderSheetDraftLine[];
  paymentHint?: string;
  notes?: string;
  rawText: string;
  scanSessionId: string;
}

const LABEL_ALIASES: Record<string, string[]> = {
  customerName: ['name', 'customer', 'customer name', 'party', 'party name', 'नाम', 'ग्राहक'],
  phone: ['phone', 'mobile', 'contact', 'mob', 'मोबाइल', 'फोन', 'संपर्क'],
  gstin: ['gstin', 'gst no', 'gst', 'gst number', 'जीएसटी'],
  barcode: ['barcode', 'ean', 'upc', 'बारकोड'],
  sku: ['sku', 'item code', 'code'],
  productName: ['item', 'product', 'model', 'description', 'उत्पाद'],
  quantity: ['qty', 'quantity', 'pcs', 'nos', 'संख्या', 'मात्रा'],
  unitPrice: ['price', 'rate', 'mrp', 'दर'],
  payment: ['payment', 'pay mode', 'pay', 'भुगतान'],
  notes: ['notes', 'remark', 'remarks', 'note', 'टिप्पणी'],
};

function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchField(label: string): string | null {
  const n = normalizeLabel(label);
  for (const [field, aliases] of Object.entries(LABEL_ALIASES)) {
    for (const a of aliases) {
      if (n === a || n.endsWith(` ${a}`) || n.startsWith(`${a} `)) return field;
    }
  }
  return null;
}

function resolveProduct(
  products: ProductLookup[],
  input: { barcode?: string; sku?: string; productName?: string },
): { product: ProductLookup | null; confidence: number } {
  if (input.barcode) {
    const p = products.find((x) => x.barcode === input.barcode);
    if (p) return { product: p, confidence: 1 };
  }
  if (input.sku) {
    const skuUp = input.sku.toUpperCase();
    const p = products.find((x) => x.sku.toUpperCase() === skuUp);
    if (p) return { product: p, confidence: 0.95 };
  }
  if (input.productName) {
    const q = input.productName.toLowerCase();
    const p = products.find(
      (x) =>
        x.name.toLowerCase() === q ||
        x.name.toLowerCase().includes(q) ||
        q.includes(x.name.toLowerCase()),
    );
    if (p) return { product: p, confidence: 0.7 };
  }
  return { product: null, confidence: 0 };
}

export function parseOrderSheetText(
  text: string,
  products: ProductLookup[] = [],
): OrderSheetDraft {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  const draft: OrderSheetDraft = {
    customer: {},
    lines: [],
    rawText: raw,
    scanSessionId: `sess_${Date.now()}`,
  };

  let currentItem: {
    barcode?: string;
    sku?: string;
    productName?: string;
    quantity: number;
    unitPrice?: number;
    rawText: string;
  } | null = null;

  const flushItem = () => {
    if (!currentItem) return;
    const { product, confidence } = resolveProduct(products, currentItem);
    draft.lines.push({
      rawText: currentItem.rawText,
      barcode: currentItem.barcode,
      sku: currentItem.sku ?? product?.sku,
      productName: currentItem.productName ?? product?.name,
      quantity: currentItem.quantity || 1,
      unitPrice: currentItem.unitPrice ?? (product ? Number(product.salePrice) : undefined),
      productId: product?.id ?? null,
      matchConfidence: confidence,
    });
    currentItem = null;
  };

  for (const line of lines) {
    const itemHeader = line.match(/^item\s*\d+\s*[:\-]\s*(.+)$/i);
    if (itemHeader) {
      flushItem();
      currentItem = { productName: itemHeader[1].trim(), quantity: 1, rawText: line };
      continue;
    }

    const kv = line.match(/^([^:：\-–]{1,40})\s*[:：\-–]\s*(.+)$/);
    if (!kv) continue;

    const field = matchField(kv[1]);
    const value = kv[2].trim();
    if (!field) continue;

    if (field === 'customerName') draft.customer.name = value;
    else if (field === 'phone') draft.customer.phone = value.replace(/[^\d+]/g, '');
    else if (field === 'gstin') draft.customer.gstin = value.replace(/\s/g, '').toUpperCase();
    else if (field === 'payment') draft.paymentHint = value;
    else if (field === 'notes') draft.notes = value;
    else if (['barcode', 'sku', 'productName', 'quantity', 'unitPrice'].includes(field)) {
      // A repeated Item/SKU/Barcode starts a new cart line (plain "Item:" without "Item 1:")
      if (
        currentItem &&
        ((field === 'productName' && currentItem.productName) ||
          (field === 'barcode' && currentItem.barcode) ||
          (field === 'sku' && currentItem.sku))
      ) {
        flushItem();
      }
      if (!currentItem && ['barcode', 'sku', 'productName'].includes(field)) {
        currentItem = { quantity: 1, rawText: line };
      }
      if (!currentItem) continue;
      if (field === 'barcode') currentItem.barcode = value.replace(/\s/g, '');
      if (field === 'sku') currentItem.sku = value;
      if (field === 'productName') currentItem.productName = value;
      if (field === 'quantity') {
        const n = parseFloat(value.replace(/[^\d.]/g, ''));
        if (!Number.isNaN(n) && n > 0) currentItem.quantity = n;
      }
      if (field === 'unitPrice') {
        const n = parseFloat(value.replace(/[^\d.]/g, ''));
        if (!Number.isNaN(n)) currentItem.unitPrice = n;
      }
      currentItem.rawText =
        currentItem.rawText === line
          ? line
          : `${currentItem.rawText} | ${line}`.slice(0, 200);
    }
  }
  flushItem();
  return draft;
}

export const SAMPLE_ORDER_SHEET = `Name: Rajesh Kumar
Phone: 9876543210
GSTIN: 27AAAAA0000A1Z5

Item 1: Samsung Galaxy A15
Barcode: 8901234567890
Qty: 2

Item 2: Screen Guard
SKU: SG-A15-001
Qty: 1

Payment: UPI
Notes: Deliver by evening`;
