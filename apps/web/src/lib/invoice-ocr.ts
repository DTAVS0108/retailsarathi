/** Browser OCR helpers for invoice photos (EXIF + rotation). */

type TesseractApi = {
  recognize: (image: string, language: string) => Promise<{ data: { text: string; confidence?: number } }>;
};

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

function getTesseract(): TesseractApi | undefined {
  return (
    window as Window & {
      Tesseract?: TesseractApi;
    }
  ).Tesseract;
}

function ensureTesseractScript(): void {
  if (typeof document === 'undefined') return;
  if (getTesseract()) return;
  if (document.querySelector(`script[src="${TESSERACT_CDN}"]`)) return;
  const script = document.createElement('script');
  script.src = TESSERACT_CDN;
  script.async = true;
  document.head.appendChild(script);
}

/** Wait for CDN Tesseract (injects script if missing). */
export async function awaitTesseract(timeoutMs = 30_000): Promise<TesseractApi> {
  const existing = getTesseract();
  if (existing) return existing;

  ensureTesseractScript();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = getTesseract();
    if (api) return api;
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(
    'OCR engine failed to load. Check your network (cdn.jsdelivr.net) and refresh the page.',
  );
}

export function looksLikeBinaryGarbage(text: string) {
  if (!text) return false;
  if (/RIFF|WEBPVP8|JFIF|Exif|PNG|%PDF/i.test(text.slice(0, 80))) return true;
  const sample = text.slice(0, 400);
  const weird = (sample.match(/[^\x09\x0A\x0D\x20-\x7E₹]/g) || []).length;
  return weird / Math.max(sample.length, 1) > 0.15;
}

/** Clean OCR / pasted invoice text for readable editing. */
export function formatInvoiceText(raw: string): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/[ \t]*----- PAGE\s+(\d+)\s*-----[ \t]*/gi, '\n\n----- PAGE $1 -----\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreInvoiceOcrText(text: string): number {
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

  // Strong upright-invoice signals (sideways OCR almost never produces these cleanly)
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

  // Penalize sideways / garbage OCR: few real words, mostly tiny fragments
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

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available.');
  ctx.drawImage(img, 0, 0);
  return createImageBitmap(canvas);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode the selected image.'));
    img.src = src;
  });
}

function bitmapToDataUrl(bitmap: ImageBitmap, rotationDeg: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available.');

  const rot = ((rotationDeg % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
  } else {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function recognizeDataUrl(dataUrl: string, tesseract: TesseractApi): Promise<string> {
  const result = await tesseract.recognize(dataUrl, 'eng+hin');
  return formatInvoiceText(result.data.text || '');
}

function cropTopRightDataUrl(bitmap: ImageBitmap, rotationDeg: number): string {
  const full = bitmapToDataUrl(bitmap, rotationDeg);
  // Draw to canvas, crop top-right (Tally invoice no / date column)
  const img = document.createElement('img');
  // Synchronous path via canvas from rotated bitmap instead
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return full;

  const rot = ((rotationDeg % 360) + 360) % 360;
  let w = bitmap.width;
  let h = bitmap.height;
  if (rot === 90 || rot === 270) {
    w = bitmap.height;
    h = bitmap.width;
  }
  canvas.width = w;
  canvas.height = h;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

  const cropW = Math.floor(w * 0.55);
  const cropH = Math.floor(h * 0.3);
  const cropX = Math.floor(w * 0.45);
  const out = document.createElement('canvas');
  out.width = Math.max(1200, cropW * 2);
  out.height = Math.max(700, cropH * 2);
  const octx = out.getContext('2d');
  if (!octx) return full;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(canvas, cropX, 0, cropW, cropH, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.95);
}

function mergeInvoiceHeaderOcr(fullText: string, headerText: string): string {
  const header = formatInvoiceText(headerText);
  if (!header || header.length < 10) return fullText;
  const inv =
    header.match(/\b([A-Z]{2}\/\d{4}-\d{2}\/\d{1,6})\b/i)?.[1] ||
    header.match(/\b(\d{2,4}-\d{2}\/\d{1,6})\b/)?.[1];
  if (!inv) return fullText;
  if (new RegExp(inv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(fullText)) return fullText;
  // Inject a clean invoice line so the API parser can pick it up
  return formatInvoiceText(`${fullText}\n\nInvoice No.: ${inv}\n`);
}

/** OCR with EXIF fix and 0/90/180/270° attempts — picks the best invoice-like result. */
export async function runInvoiceOcr(file: File): Promise<string> {
  const tesseract = await awaitTesseract();

  const bitmap = await fileToBitmap(file);
  const rotations = [0, 90, 180, 270];
  let bestText = '';
  let bestScore = -1;
  let bestRot = 0;

  for (const rotation of rotations) {
    const dataUrl = bitmapToDataUrl(bitmap, rotation);
    const text = await recognizeDataUrl(dataUrl, tesseract);
    let score = scoreInvoiceOcrText(text);
    // Prefer rotations that actually captured an invoice number
    if (/\b[A-Z]{2}\/\d{4}-\d{2}\/\d{1,6}\b/i.test(text) || /\b\d{2,4}-\d{2}\/\d{1,6}\b/.test(text)) {
      score += 50;
    }
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
      bestRot = rotation;
    }
  }

  // Top-right crop often recovers Invoice No. when full-page OCR drops it
  try {
    const headerUrl = cropTopRightDataUrl(bitmap, bestRot);
    const headerText = await recognizeDataUrl(headerUrl, tesseract);
    bestText = mergeInvoiceHeaderOcr(bestText, headerText);
  } catch {
    /* crop is best-effort */
  }

  bitmap.close?.();
  return bestText;
}

export async function runInvoiceOcrDataUrl(dataUrl: string): Promise<string> {
  const tesseract = await awaitTesseract();

  const img = await loadHtmlImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available.');
  ctx.drawImage(img, 0, 0);
  const bitmap = await createImageBitmap(canvas);

  const rotations = [0, 90, 180, 270];
  let bestText = '';
  let bestScore = -1;
  let bestRot = 0;

  for (const rotation of rotations) {
    const rotated = bitmapToDataUrl(bitmap, rotation);
    const text = await recognizeDataUrl(rotated, tesseract);
    let score = scoreInvoiceOcrText(text);
    if (/\b[A-Z]{2}\/\d{4}-\d{2}\/\d{1,6}\b/i.test(text) || /\b\d{2,4}-\d{2}\/\d{1,6}\b/.test(text)) {
      score += 50;
    }
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
      bestRot = rotation;
    }
  }

  try {
    const headerUrl = cropTopRightDataUrl(bitmap, bestRot);
    const headerText = await recognizeDataUrl(headerUrl, tesseract);
    bestText = mergeInvoiceHeaderOcr(bestText, headerText);
  } catch {
    /* crop is best-effort */
  }

  bitmap.close?.();
  return bestText;
}
