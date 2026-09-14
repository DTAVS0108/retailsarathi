import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');

if (!fs.existsSync(svgPath)) {
  console.error('Missing build/icon.svg');
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Install sharp first: npm install -D sharp -w @retail-sarathi/desktop');
  process.exit(1);
}

await sharp(svgPath).resize(512, 512).png().toFile(pngPath);
console.log('Desktop app icon:', pngPath);
