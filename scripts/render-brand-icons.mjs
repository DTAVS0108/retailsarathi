import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function render(svgRel, outRel, size) {
  const svgPath = path.join(root, svgRel);
  const outPath = path.join(root, outRel);
  const svg = fs.readFileSync(svgPath);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: undefined,
  });
  const png = resvg.render().asPng();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log('wrote', outRel, `(${size}px)`);
}

const rounded = 'apps/web/public/brand/retailsarathi-mark.svg';
const fullbleed = 'apps/web/public/brand/retailsarathi-mark-fullbleed.svg';

const jobs = [
  [fullbleed, 'apps/web/public/favicon.png', 512],
  [fullbleed, 'apps/web/public/favicon-32.png', 32],
  [fullbleed, 'apps/web/public/favicon-16.png', 16],
  [fullbleed, 'apps/web/public/apple-touch-icon.png', 180],
  [fullbleed, 'apps/web/public/brand/retailsarathi-mark-fullbleed.png', 1024],
  [fullbleed, 'apps/mobile/assets/brand/retailsarathi-mark-fullbleed.png', 1024],
  [fullbleed, 'apps/mobile/web/favicon.png', 512],
  [rounded, 'apps/web/public/brand/retailsarathi-mark.png', 1024],
  [rounded, 'apps/mobile/assets/brand/retailsarathi-mark.png', 1024],
];

for (const [svg, out, size] of jobs) {
  render(svg, out, size);
}
