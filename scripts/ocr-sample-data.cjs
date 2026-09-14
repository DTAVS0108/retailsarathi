/**
 * OCR all images under "sample data/" with tesseract.js (eng).
 * Writes text to apps/web/public/samples/bills/sample-data-ocr/<basename>.txt
 *
 * Usage: node scripts/ocr-sample-data.cjs
 * Requires: tesseract.js (npm install tesseract.js --no-save)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT_DIR = path.join(ROOT, 'sample data');
const OUTPUT_DIR = path.join(
  ROOT,
  'apps',
  'web',
  'public',
  'samples',
  'bills',
  'sample-data-ocr'
);

const IMAGE_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff']);

function listImages(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXTS.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(dir, name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function outputPathFor(imagePath) {
  const base = path.basename(imagePath);
  // Strip compound extensions like .jpg.jpeg -> basename without final ext
  const stem = base.replace(/\.[^.]+$/, '');
  return path.join(OUTPUT_DIR, `${stem}.txt`);
}

async function main() {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch {
    console.error(
      'tesseract.js not found. Install temporarily:\n  npm install tesseract.js --no-save'
    );
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Input folder missing: ${INPUT_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const images = listImages(INPUT_DIR);
  if (images.length === 0) {
    console.error(`No images found in ${INPUT_DIR}`);
    process.exit(1);
  }

  console.log(`OCR eng: ${images.length} image(s)`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pct = Math.round(m.progress * 100);
        if (pct % 25 === 0) process.stdout.write(`\r  progress ${pct}%   `);
      }
    },
  });

  const results = [];

  for (let i = 0; i < images.length; i++) {
    const imagePath = images[i];
    const outPath = outputPathFor(imagePath);
    const label = path.basename(imagePath);
    console.log(`[${i + 1}/${images.length}] ${label}`);

    try {
      const { data } = await worker.recognize(imagePath);
      const text = (data.text || '').replace(/\r\n/g, '\n').trimEnd() + '\n';
      fs.writeFileSync(outPath, text, 'utf8');
      const lines = text.split('\n').filter((l) => l.length > 0).length;
      console.log(`  -> ${path.relative(ROOT, outPath)} (${lines} non-empty lines)`);
      results.push({ image: label, out: outPath, ok: true, lines });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`  FAILED: ${msg}`);
      results.push({ image: label, out: outPath, ok: false, error: msg });
    }
  }

  await worker.terminate();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\nDone: ${ok}/${results.length} succeeded`);
  for (const r of results) {
    if (!r.ok) console.log(`  fail: ${r.image}: ${r.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
