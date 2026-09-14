import * as XLSX from 'xlsx';
import { isKnownGstSlab, nearestGstSlab } from '@retail-sarathi/gst-engine';

export const PRODUCT_CSV_HEADERS = [
  'sku',
  'barcode',
  'name',
  'hsnCode',
  'category',
  'brand',
  'model',
  'unit',
  'salePrice',
  'purchasePrice',
  'gstRate',
  'stockQty',
  'lowStockThreshold',
  'trackSerial',
  'isActive',
] as const;

export type ProductImportRow = {
  sku: string;
  barcode?: string;
  name?: string;
  hsnCode?: string;
  category?: string;
  brand?: string;
  model?: string;
  unit?: string;
  salePrice?: number;
  purchasePrice?: number;
  gstRate?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  trackSerial?: boolean;
  isActive?: boolean;
  _row: number;
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[%]/g, '')
    .replace(/[\s_-]+/g, '');
}

const HEADER_ALIASES: Record<string, keyof Omit<ProductImportRow, '_row'>> = {
  sku: 'sku',
  barcode: 'barcode',
  name: 'name',
  productname: 'name',
  hsn: 'hsnCode',
  hsncode: 'hsnCode',
  category: 'category',
  brand: 'brand',
  model: 'model',
  unit: 'unit',
  saleprice: 'salePrice',
  mrp: 'salePrice',
  price: 'salePrice',
  purchaseprice: 'purchasePrice',
  cost: 'purchasePrice',
  gstrate: 'gstRate',
  gst: 'gstRate',
  tax: 'gstRate',
  taxrate: 'gstRate',
  igst: 'gstRate',
  stockqty: 'stockQty',
  stock: 'stockQty',
  qty: 'stockQty',
  quantity: 'stockQty',
  lowstockthreshold: 'lowStockThreshold',
  reorderlevel: 'lowStockThreshold',
  trackserial: 'trackSerial',
  isactive: 'isActive',
  active: 'isActive',
};

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return undefined;
}

function parseNum(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).replace(/,/g, '').trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse GST from CSV/Excel cells: 18, "18%", "GST 18", 0.18 (fraction), 0.25 (known slab).
 * Snaps to nearest known slab when close.
 */
export function parseGstRate(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const hadPercent = /%/.test(raw);
  const n = typeof value === 'number' && Number.isFinite(value) ? value : parseNum(value);
  if (n == null) return undefined;

  let rate = n;
  // Spreadsheets often store 18% as 0.18 without a % sign in the cell text.
  // Keep known fractional slabs (e.g. 0.25% rough stones).
  if (!hadPercent && rate > 0 && rate <= 1 && !isKnownGstSlab(rate)) {
    rate = rate * 100;
  }
  return nearestGstSlab(rate);
}

function mapRow(
  raw: Record<string, unknown>,
  rowNum: number,
): ProductImportRow | { error: string; row: number } {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = HEADER_ALIASES[normalizeHeader(k)];
    if (key) mapped[key] = v;
  }

  const sku = mapped.sku != null ? String(mapped.sku).trim() : '';
  if (!sku) return { error: 'Missing sku', row: rowNum };

  return {
    sku,
    barcode: mapped.barcode != null && String(mapped.barcode).trim() !== ''
      ? String(mapped.barcode).trim()
      : undefined,
    name: mapped.name != null ? String(mapped.name).trim() : undefined,
    hsnCode: mapped.hsnCode != null ? String(mapped.hsnCode).trim() : undefined,
    category: mapped.category != null ? String(mapped.category).trim() : undefined,
    brand: mapped.brand != null ? String(mapped.brand).trim() : undefined,
    model: mapped.model != null ? String(mapped.model).trim() : undefined,
    unit: mapped.unit != null ? String(mapped.unit).trim() : undefined,
    salePrice: parseNum(mapped.salePrice),
    purchasePrice: parseNum(mapped.purchasePrice),
    gstRate: parseGstRate(mapped.gstRate),
    stockQty: parseNum(mapped.stockQty),
    lowStockThreshold: parseNum(mapped.lowStockThreshold),
    trackSerial: parseBool(mapped.trackSerial),
    isActive: parseBool(mapped.isActive),
    _row: rowNum,
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function parseProductCsv(text: string): {
  rows: ProductImportRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: [{ row: 0, message: 'File needs a header row and at least one data row' }] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: ProductImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      raw[h] = cells[idx] ?? '';
    });
    const mapped = mapRow(raw, i + 1);
    if ('error' in mapped) {
      errors.push({ row: mapped.row, message: mapped.error });
    } else {
      rows.push(mapped);
    }
  }

  return { rows, errors };
}

export function parseProductSpreadsheet(buffer: Buffer, filename: string): {
  rows: ProductImportRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return parseProductCsv(buffer.toString('utf8'));
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, message: 'Workbook has no sheets' }] };
  }
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const rows: ProductImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  json.forEach((raw, idx) => {
    const mapped = mapRow(raw, idx + 2);
    if ('error' in mapped) {
      errors.push({ row: mapped.row, message: mapped.error });
    } else {
      rows.push(mapped);
    }
  });

  return { rows, errors };
}

export function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildProductCsv(
  items: Array<Record<string, unknown>>,
): string {
  const header = PRODUCT_CSV_HEADERS.join(',');
  const lines = items.map((p) =>
    PRODUCT_CSV_HEADERS.map((h) => escapeCsvCell(p[h])).join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

export function buildProductTemplateCsv(): string {
  const sample = {
    sku: 'BAT-EXD-150',
    barcode: '8902000001501',
    name: 'Exide InvaMaster 150Ah Tubular Battery',
    hsnCode: '8507',
    category: 'Battery',
    brand: 'Exide',
    model: 'IM1500',
    unit: 'pcs',
    salePrice: 14500,
    purchasePrice: 11800,
    gstRate: 28,
    stockQty: 12,
    lowStockThreshold: 3,
    trackSerial: false,
    isActive: true,
  };
  return buildProductCsv([sample]);
}
