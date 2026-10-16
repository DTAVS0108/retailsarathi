import { createWorker, type Worker } from 'tesseract.js';
import { join } from 'path';
import { existsSync } from 'fs';

// `sharp` only ships .d.mts/.d.cts (no plain .d.ts), which this project's moduleResolution
// setting can't resolve to a proper callable type, and it's a true CJS export with no ESM
// default wrapper (so `import sharp from 'sharp'` type-checks but crashes at runtime with
// "sharp_1.default is not a function" under this tsconfig). Load it via plain require with
// a minimal local type for just the surface used here — same pattern already used for
// xlsx/mammoth elsewhere in this module.
interface SharpInstance {
  rotate(angle?: number): SharpInstance;
  jpeg(opts?: { quality?: number }): SharpInstance;
  extract(region: { left: number; top: number; width: number; height: number }): SharpInstance;
  resize(opts: { width: number }): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ width?: number; height?: number }>;
}
type SharpFn = (input: Buffer, opts?: { failOn?: string }) => SharpInstance;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as SharpFn;

/**
 * Server-side OCR fallback for uploaded images when no client-side
 * `extractedText` is supplied (e.g. API-only integrations, or a client
 * without OCR capability). Mirrors the scoring/rotation strategy already
 * proven in apps/web/src/lib/invoice-ocr.ts so both paths pick the same
 * kind of "best" result — ports of formatInvoiceText/scoreInvoiceOcrText
 * are kept in lockstep with that file; see it for the browser-side twin.
 */

export function looksLikeBinaryGarbage(text: string): boolean {
  if (!text) return false;
  if (/RIFF|WEBPVP8|JFIF|Exif|PNG|%PDF/i.test(text.slice(0, 80))) return true;
  const sample = text.slice(0, 400);
  const weird = (sample.match(/[^\x09\x0A\x0D\x20-\x7E₹]/g) || []).length;
  return weird / Math.max(sample.length, 1) > 0.15;
}

export function formatInvoiceText(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/[ \t]*----- PAGE\s+(\d+)\s*-----[ \t]*/gi, '\n\n----- PAGE $1 -----\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function scoreInvoiceOcrText(text: string): number {
  const cleaned = formatInvoiceText(text);
  if (cleaned.length < 24) return 0;
  if (looksLikeBinaryGarbage(cleaned)) return -100;

  let score = 0;
  const upper = cleaned.toUpperCase();
  if (/GSTIN|GST\s*IN|GST\s*NO/i.test(cleaned)) score += 35;
  if (/TAX\s*INVOICE|\bINVOICE\b/.test(upper)) score += 25;
  if (/\bHSN\b|\bSAC\b|\bDESCRIPTION\b/.test(upper)) score += 20;
  if (/\d{2}[A-Z0-9]{10}[A-Z0-9]{1}/i.test(cleaned)) score += 45;
  if (/\b(QTY|QUANTITY|RATE|AMOUNT|TAXABLE|CGST|SGST|IGST)\b/i.test(cleaned)) score += 20;
  if (/\b(BATTERY|BATTERIES|INVERTER|LED|BULB|HSN|TRADERS?|ENTERPRISES?)\b/i.test(cleaned)) score += 20;
  if (/\b8\d{5,7}\b/.test(cleaned)) score += 15;
  if (/\b\d{1,3}(,\d{3})*(\.\d{1,2})?\b/.test(cleaned)) score += 10;

  if (/Buyer\s*\(?\s*Bill\s*to|Bill\s*to|Billed\s*to/i.test(cleaned)) score += 45;
  if (/Amount\s+Chargeable|Taxable\s+Value|Grand\s+Total|Place\s+of\s+Supply/i.test(cleaned)) score += 35;
  if (/\bINR\b.*\bOnly\b|Thirty|Thousand|Hundred/i.test(cleaned)) score += 25;
  if (/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i.test(cleaned)) score += 40;
  if (/\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{2,4}\b/i.test(cleaned)) {
    score += 15;
  }

  const letters = (cleaned.match(/[A-Za-z]/g) || []).length;
  const digits = (cleaned.match(/\d/g) || []).length;
  score += Math.min(40, letters / 8);
  score += Math.min(20, digits / 4);

  const lines = cleaned.split('\n').filter((l) => l.trim().length > 3);
  score += Math.min(30, lines.length * 2);

  const realWords = cleaned.match(/\b[A-Za-z]{4,}\b/g) || [];
  if (cleaned.length > 400 && realWords.length < 20) score -= 50;
  if (cleaned.length > 800 && realWords.length < 40) score -= 40;
  const junkLines = lines.filter((l) => {
    const lettersOnly = (l.match(/[A-Za-z]/g) || []).length;
    return lettersOnly > 0 && lettersOnly < 6;
  }).length;
  if (lines.length >= 8 && junkLines / lines.length > 0.55) score -= 45;

  return score;
}

// Bundled at apps/api/ocr-data/{eng,hin}.traineddata — committed to the repo and shipped in
// the Docker image (see Dockerfile) so the very first OCR call works fully offline, with no
// runtime download from Tesseract's CDN. Falls back to tesseract.js's default (CDN-backed)
// resolution only if the bundled files are somehow missing.
const BUNDLED_LANG_PATH = join(__dirname, '..', '..', 'ocr-data');
const hasBundledLangData =
  existsSync(join(BUNDLED_LANG_PATH, 'eng.traineddata')) && existsSync(join(BUNDLED_LANG_PATH, 'hin.traineddata'));

let sharedWorker: Promise<Worker> | null = null;
async function getWorker(): Promise<Worker> {
  if (!sharedWorker) {
    sharedWorker = createWorker(
      'eng+hin',
      1,
      hasBundledLangData ? { langPath: BUNDLED_LANG_PATH, gzip: false } : undefined,
    );
  }
  return sharedWorker;
}

/** Call once at process shutdown if you want a clean exit; not required for normal operation. */
export async function terminateServerOcrWorker(): Promise<void> {
  if (sharedWorker) {
    const w = await sharedWorker;
    await w.terminate();
    sharedWorker = null;
  }
}

async function ocrBuffer(worker: Worker, buffer: Buffer): Promise<string> {
  const { data } = await worker.recognize(buffer);
  return formatInvoiceText(data.text || '');
}

export interface ServerOcrResult {
  text: string;
  score: number;
  rotationDeg: number;
  attemptedRotations: number;
  durationMs: number;
}

/**
 * OCR an uploaded image buffer server-side: tries 0/90/180/270 rotation,
 * scores each with the same heuristic the browser client uses, and returns
 * the best-scoring result plus a top-right crop merge pass (Tally invoices
 * often carry the invoice number/date there) — same two-stage strategy as
 * apps/web/src/lib/invoice-ocr.ts's runInvoiceOcr().
 */
export async function runServerInvoiceOcr(imageBuffer: Buffer): Promise<ServerOcrResult> {
  const started = Date.now();
  const worker = await getWorker();

  // Normalize any input format (webp/heic/gif/bmp/tiff/png/...) to JPEG via sharp first —
  // Tesseract and the rotation step below both work uniformly off one predictable format.
  // sharp's decoders are statically linked (no runtime network fetch), unlike some pure-JS
  // format plugins — important for an offline-first product.
  const normalized = await sharp(imageBuffer, { failOn: 'none' }).rotate().jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(normalized).metadata();
  const baseW = meta.width ?? 0;
  const baseH = meta.height ?? 0;

  const rotations = [0, 90, 180, 270] as const;
  let best: ServerOcrResult = { text: '', score: -Infinity, rotationDeg: 0, attemptedRotations: 0, durationMs: 0 };

  for (const rotation of rotations) {
    const buf = await sharp(normalized).rotate(rotation).jpeg({ quality: 92 }).toBuffer();
    const text = await ocrBuffer(worker, buf);
    let score = scoreInvoiceOcrText(text);
    if (/\b[A-Z]{2}\/\d{4}-\d{2}\/\d{1,6}\b/i.test(text) || /\b\d{2,4}-\d{2}\/\d{1,6}\b/.test(text)) {
      score += 50;
    }
    if (score > best.score) {
      best = { text, score, rotationDeg: rotation, attemptedRotations: best.attemptedRotations + 1, durationMs: 0 };
    } else {
      best.attemptedRotations += 1;
    }
  }

  // Best-effort top-right header crop (invoice no. / date column on Tally-style invoices).
  try {
    const isSideways = best.rotationDeg === 90 || best.rotationDeg === 270;
    const w = isSideways ? baseH : baseW;
    const h = isSideways ? baseW : baseH;
    const cropW = Math.max(1, Math.floor(w * 0.55));
    const cropH = Math.max(1, Math.floor(h * 0.3));
    const cropX = Math.max(0, Math.floor(w * 0.45));
    const headerBuf = await sharp(normalized)
      .rotate(best.rotationDeg)
      .extract({ left: cropX, top: 0, width: Math.min(cropW, w - cropX), height: Math.min(cropH, h) })
      .resize({ width: Math.max(1200, cropW * 2) })
      .jpeg({ quality: 95 })
      .toBuffer();
    const headerText = await ocrBuffer(worker, headerBuf);
    const inv =
      headerText.match(/\b([A-Z]{2}\/\d{4}-\d{2}\/\d{1,6})\b/i)?.[1] ||
      headerText.match(/\b(\d{2,4}-\d{2}\/\d{1,6})\b/)?.[1];
    if (inv && !new RegExp(inv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(best.text)) {
      best.text = formatInvoiceText(`${best.text}\n\nInvoice No.: ${inv}\n`);
    }
  } catch {
    /* crop is best-effort, ignore failures */
  }

  best.durationMs = Date.now() - started;
  return best;
}

export function isImageBuffer(buffer: Buffer, mimeType?: string): boolean {
  if (mimeType && /^image\//i.test(mimeType)) return true;
  if (buffer.length >= 4) {
    const sig = buffer.subarray(0, 4);
    if (sig[0] === 0xff && sig[1] === 0xd8) return true; // JPEG
    if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return true; // PNG
    if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46) return true; // RIFF/WEBP
    if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46) return true; // GIF
    if (sig[0] === 0x42 && sig[1] === 0x4d) return true; // BMP
  }
  return false;
}
