import * as XLSX from 'xlsx';

export type ReportFormat = 'json' | 'csv' | 'xlsx' | 'pdf';

export function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(','));
  return [headers.join(','), ...lines].join('\n') + '\n';
}

export function rowsToXlsxBase64(
  sheets: Array<{ name: string; headers: string[]; rows: Array<Record<string, unknown>> }>,
): string {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: unknown[][] = [sheet.headers];
    for (const row of sheet.rows) {
      aoa.push(sheet.headers.map((h) => row[h] ?? ''));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(buf).toString('base64');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}
