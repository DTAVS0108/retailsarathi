/**
 * Electron UI smoke via agent-browser CLI (CDP already connected).
 * Run: node apps/desktop/scripts/desktop-ui-smoke.mjs
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../dogfood-output');
const SHOTS = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + (e.message || '');
  }
}

function snap() {
  return sh('agent-browser snapshot -i');
}

function click(ref) {
  return sh(`agent-browser click "${ref}"`);
}

function fill(ref, text) {
  const t = String(text).replace(/"/g, '\\"');
  return sh(`agent-browser fill "${ref}" "${t}"`);
}

function press(key) {
  return sh(`agent-browser press "${key}"`);
}

function shot(name) {
  sh(`agent-browser screenshot "${path.join(SHOTS, name)}"`);
}

function sleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    execSync(process.platform === 'win32' ? `powershell -Command "Start-Sleep -Milliseconds ${ms}"` : `sleep ${ms / 1000}`);
  }
}

function findRef(snapshot, labelRe) {
  const lines = snapshot.split('\n');
  for (const line of lines) {
    if (!labelRe.test(line)) continue;
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) return m[1];
  }
  return null;
}

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + String(detail).slice(0, 100) : ''}`);
}

sh('agent-browser connect 9222');

// Close any open modal
press('Escape');
press('Escape');

let s = snap();
const posBtn = findRef(s, /button "POS"/);
if (posBtn) click(`@${posBtn}`);
s = snap();
check('Nav → POS', /Scan barcode|Browse products|Bill/.test(s));

// Add product
s = snap();
const prod = findRef(s, /Luminous Zelio|Exide 150Ah|button ".*Stock:/);
if (prod) {
  click(`@${prod}`);
  s = snap();
  check('POS add product to cart', /Qty|quantity|Remove|₹|Luminous|Exide|cart/i.test(s) || /Bill 1/.test(s), 'clicked product');
} else {
  check('POS add product to cart', false, 'no product button found');
}
shot('ui-pos-cart.png');

// Customer modal
s = snap();
const addCust = findRef(s, /button "\+ Add new"/);
if (addCust) {
  click(`@${addCust}`);
  s = snap();
  check('Customer full form modal', /Add customer|Name \*|Phone \*|GSTIN|WhatsApp|Credit limit/.test(s));
  shot('ui-customer-form.png');
  press('Escape');
} else {
  check('Customer full form modal', false, 'Add new not found');
}

// Multi bill — prefer the bill-tab "+" near Bill 1, not payment "+ Add"
s = snap();
let plus = null;
for (const line of s.split('\n')) {
  if (/button "\+" \[ref=(e\d+)\]/.test(line) && !/Add/.test(line)) {
    plus = line.match(/\[ref=(e\d+)\]/)[1];
    // Prefer the one that appears after a Bill tab button in the tree order:
    break;
  }
}
// Prefer first "+" after "Bill 1" in snapshot order
{
  const lines = s.split('\n');
  let seenBill = false;
  for (const line of lines) {
    if (/button "Bill 1/.test(line)) seenBill = true;
    if (seenBill) {
      const m = line.match(/button "\+" \[ref=(e\d+)\]/);
      if (m) {
        plus = m[1];
        break;
      }
    }
  }
}
if (plus) {
  click(`@${plus}`);
  sleep(500);
  s = snap();
  check('Multi-bill new tab', /Bill 2/.test(s));
} else {
  check('Multi-bill new tab', false);
}
shot('ui-multibill.png');

// Browse products F2
press('F2');
s = snap();
check('F2 product picker', /Search name|SKU|barcode|Close|Browse/i.test(s));
shot('ui-picker.png');
press('Escape');

// Shortcuts
press('Control+/');
s = snap();
check('Ctrl+/ shortcuts', /F1|F12|Hold|Shortcut/i.test(s));
shot('ui-shortcuts.png');
press('Escape');

const tabs = [
  ['Held', /Held|Resume|Finalize|No held|draft/i],
  ['Returns', /Return|IMEI|Load|Search|invoice/i],
  ['Bills', /Invoice|Search|FINALIZED|Open|Reprint|Bills/i],
  ['Repairs', /Repair|Token|REP-|New repair|Intake/i],
  ['Products', /SKU|Stock|Archive|Export|product/i],
  ['Khata', /Customer|Supplier|Receivable|Payable|Add customer|aging|Current|Total/i],
  ['Stats', /dashboard|sales|stock|month|today|revenue|ledger/i],
  ['Settings', /API|Printer|Theme|Thermal|COM|Sync|Layout|PIN/i],
];

for (const [label, re] of tabs) {
  s = snap();
  const ref = findRef(s, new RegExp(`button "${label}"`));
  if (!ref) {
    check(`Tab ${label}`, false, 'nav button missing');
    continue;
  }
  click(`@${ref}`);
  sleep(700);
  s = snap();
  const noWebRedirect = label !== 'Khata' || !/Open full web khata/i.test(s);
  check(`Tab ${label}`, re.test(s) && noWebRedirect, noWebRedirect ? '' : 'still has web redirect');
  shot(`ui-tab-${label.toLowerCase()}.png`);
}

// Khata: open Add customer + party row if any
{
  s = snap();
  const khataNav = findRef(s, /button "Khata"/);
  if (khataNav) {
    click(`@${khataNav}`);
    sleep(800);
  }
  s = snap();
  const khataAdd = findRef(s, /button "\+ Add customer"/);
  if (khataAdd) {
    click(`@${khataAdd}`);
    sleep(400);
    s = snap();
    check('Khata Add customer popup', /Add customer|Name \*|Credit limit|WhatsApp/.test(s));
    shot('ui-khata-add-customer.png');
    press('Escape');
  } else {
    check('Khata Add customer popup', false, 'button missing — may not be on Khata tab');
  }
}

// Products: stock filter / create form presence
s = snap();
const prodNav = findRef(s, /button "Products"/);
if (prodNav) click(`@${prodNav}`);
sleep(600);
s = snap();
check('Products management controls', /Export|Add|Low|Archive|Stock|SKU/i.test(s));

const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
fs.writeFileSync(path.join(OUT, 'ui-results.json'), JSON.stringify({ pass, fail, results }, null, 2));
console.log(`\nUI smoke: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
