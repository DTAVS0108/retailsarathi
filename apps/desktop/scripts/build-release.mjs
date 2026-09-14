import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version || '0.1.0';
const productName = pkg.build?.productName || 'RetailSarathi';

const downloads = path.join(os.homedir(), 'Downloads');
const buildDir = path.join(downloads, `${productName}-Desktop-Build`);
const setupName = `${productName} Setup ${version}.exe`;
const setupShortcut = path.join(downloads, `${productName}-Setup-${version}.exe`);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: root, ...opts });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

fs.mkdirSync(buildDir, { recursive: true });

console.log(`\n→ Preparing icons…`);
run('node', ['scripts/prepare-icons.mjs']);

console.log(`\n→ Typecheck…`);
run('npx', ['tsc', '-p', 'tsconfig.json']);

console.log(`\n→ Vite build…`);
run('npx', ['vite', 'build']);

console.log(`\n→ Electron builder → ${buildDir}`);
run('npx', [
  'electron-builder',
  `--config.directories.output=${buildDir.replace(/\\/g, '/')}`,
]);

const built = fs
  .readdirSync(buildDir)
  .filter((f) => f.endsWith('.exe') && /setup/i.test(f))
  .sort()
  .pop();

if (!built) {
  console.error('No Setup .exe found in', buildDir);
  process.exit(1);
}

const src = path.join(buildDir, built);
fs.copyFileSync(src, setupShortcut);

console.log('\n✓ Desktop installer ready:');
console.log(' ', setupShortcut);
console.log('  Build folder:', buildDir);
