const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

const IMAGE =
  process.argv[2] ||
  'C:/Users/dmtya/.cursor/projects/c-Users-dmtya-OneDrive-Documents-RetailSarathi/assets/c__Users_dmtya_AppData_Roaming_Cursor_User_workspaceStorage_fdf3d56efb60302380dd7743228a84d3_images_image-05439c64-3eed-4bb8-bbac-29ba4650a541.png';

function score(text) {
  let s = 0;
  if (/GSTIN/i.test(text)) s += 30;
  if (/GOEL|LUMINOUS|BATTERY/i.test(text)) s += 20;
  if (/85072000/.test(text)) s += 20;
  if (/description\s+of\s+goods/i.test(text)) s += 15;
  s += Math.min(40, (text.match(/[A-Za-z]/g) || []).length / 20);
  return s;
}

async function ocrBuffer(buf, worker) {
  const { data } = await worker.recognize(buf);
  return data.text || '';
}

async function main() {
  const worker = await createWorker('eng+hin');
  const input = fs.readFileSync(IMAGE);
  const rotations = [0, 90, 180, 270];
  let best = { rot: 0, text: '', score: -1 };

  for (const rot of rotations) {
    const buf = await sharp(input).rotate(rot).jpeg({ quality: 92 }).toBuffer();
    const text = await ocrBuffer(buf, worker);
    const sc = score(text);
    console.log('\n=== ROT', rot, 'score', sc, 'len', text.length, '===');
    console.log(text.slice(0, 1200));
    if (sc > best.score) best = { rot, text, score: sc };
  }
  await worker.terminate();

  fs.writeFileSync(path.join(__dirname, '_goel-ocr-best.txt'), best.text);
  console.log('\nBEST ROTATION:', best.rot, 'score', best.score);

  const login = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@demo.retailsarathi.in', password: 'Demo@123' }),
  }).then((r) => r.json());

  const parsed = await fetch('http://127.0.0.1:4000/api/v1/scan/parse-purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + login.accessToken,
    },
    body: JSON.stringify({ text: best.text }),
  }).then((r) => r.json());

  console.log('\nPARSE linesTotal:', parsed.linesTotal);
  console.log('supplier:', parsed.supplierName);
  console.log(
    'lines:',
    (parsed.lines || []).map((l) => `${l.name} qty=${l.quantity} rate=${l.unitPrice}`),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
