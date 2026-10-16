import Database from 'better-sqlite3-multiple-ciphers';
import path from 'path';
import fs from 'fs';
import { app, safeStorage } from 'electron';
import { createHash, randomBytes, randomUUID } from 'crypto';

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;

/** OS-keychain-backed (DPAPI/Keychain/libsecret) — never stored as a raw JWT on disk. */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) return token; // headless/CI fallback, not expected in normal use
  return safeStorage.encryptString(token).toString('base64');
}

function decryptToken(stored: string): string {
  if (!safeStorage.isEncryptionAvailable()) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    // Pre-encryption-fix rows (plaintext) or a key rotated by the OS — treat as unusable.
    return '';
  }
}

let db: Database.Database;

function dbPath() {
  return path.join(app.getPath('userData'), 'retail-sarathi.db');
}

function dbKeyPath() {
  return path.join(app.getPath('userData'), 'db-key.enc');
}

/**
 * The local cache's encryption key protects the whole catalog/invoice DB, not one revocable
 * token — unlike `encryptToken` above, it must fail closed (throw) rather than silently falling
 * back to plaintext if the OS keychain (safeStorage) isn't available.
 */
function getOrCreateDbKey(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure storage (OS keychain) is not available on this device — cannot open or create the encrypted local database.',
    );
  }
  const keyPath = dbKeyPath();
  if (fs.existsSync(keyPath)) {
    return safeStorage.decryptString(fs.readFileSync(keyPath));
  }
  const key = randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, safeStorage.encryptString(key));
  return key;
}

/** SQLCipher-encrypted files don't start with the standard SQLite header magic string. */
function isPlaintextSqliteFile(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    return buf.toString('utf8', 0, 15) === 'SQLite format 3';
  } finally {
    fs.closeSync(fd);
  }
}

export type MigrationStatus =
  | { state: 'not_needed' }
  | { state: 'migrated'; justSwapped: boolean }
  | { state: 'blocked'; pendingCount: number; failedCount: number };

/** Kept open only while migration is blocked, so the app stays usable (plaintext, unencrypted)
    until the outbox drains — `db` is pointed at it so every existing db-* function keeps working. */
let legacyDb: Database.Database | null = null;

function countLegacyOutbox(handle: Database.Database, statuses: string[]): number {
  const placeholders = statuses.map(() => '?').join(',');
  const row = handle
    .prepare(`SELECT COUNT(*) as c FROM sync_outbox WHERE status IN (${placeholders})`)
    .get(...statuses) as { c: number };
  return row?.c ?? 0;
}

function swapLegacyForEncrypted() {
  const p = dbPath();
  fs.renameSync(p, `${p}.pre-encryption.bak`);
}

/**
 * Called once at app startup, before initDatabase(). If a legacy plaintext DB exists with
 * unsynced sync_outbox rows, this can't safely wipe/recreate it as encrypted — that would
 * permanently and silently lose offline invoices the server has never seen. Instead it leaves
 * `db` pointed at the legacy plaintext file (fully usable) and reports 'blocked' so the renderer
 * can show a clear message and retry once online. If the outbox is already clean, it performs the
 * swap and returns 'migrated' so the caller can proceed to initDatabase() as normal.
 */
export function checkMigration(): MigrationStatus {
  const p = dbPath();
  if (!fs.existsSync(p)) return { state: 'not_needed' };
  if (!isPlaintextSqliteFile(p)) return { state: 'migrated', justSwapped: false };

  const legacy = new Database(p);
  const blockingCount = countLegacyOutbox(legacy, ['PENDING', 'FAILED', 'CONFLICT']);
  if (blockingCount === 0) {
    legacy.close();
    swapLegacyForEncrypted();
    return { state: 'migrated', justSwapped: true };
  }

  legacyDb = legacy;
  db = legacy;
  return {
    state: 'blocked',
    pendingCount: countLegacyOutbox(legacy, ['PENDING']),
    failedCount: countLegacyOutbox(legacy, ['FAILED', 'CONFLICT']),
  };
}

/**
 * Retries the migration: runs a real sync against the still-open legacy plaintext DB (draining
 * whatever PENDING rows it can), then re-checks. FAILED/CONFLICT rows need manual resolution
 * elsewhere in the app first — they're never auto-retried, same as everywhere else this app
 * surfaces them. Only swaps to the fresh encrypted DB once the outbox is fully clean.
 */
export async function retryMigration(token: string, apiUrl: string): Promise<MigrationStatus> {
  if (!legacyDb) return checkMigration();
  const { syncWithServer } = await import('./sync');
  await syncWithServer(token, apiUrl);

  const blockingCount = countLegacyOutbox(legacyDb, ['PENDING', 'FAILED', 'CONFLICT']);
  if (blockingCount > 0) {
    return {
      state: 'blocked',
      pendingCount: countLegacyOutbox(legacyDb, ['PENDING']),
      failedCount: countLegacyOutbox(legacyDb, ['FAILED', 'CONFLICT']),
    };
  }

  const deviceIdRow = legacyDb.prepare('SELECT value FROM settings WHERE key = ?').get('device-id') as
    | { value: string }
    | undefined;
  legacyDb.close();
  legacyDb = null;
  swapLegacyForEncrypted();
  // The fresh encrypted DB starts empty — skip the demo-product seed (this device already had a
  // real catalog) and warm it from the server immediately instead of waiting for the next sync tick.
  initDatabase({ skipSeedIfEmpty: true });
  if (deviceIdRow?.value) setSetting('device-id', deviceIdRow.value); // carry the device identity forward
  await syncWithServer(token, apiUrl);
  return { state: 'migrated', justSwapped: true };
}

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function initDatabase(opts: { skipSeedIfEmpty?: boolean } = {}) {
  const key = getOrCreateDbKey();
  db = new Database(dbPath());
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${key}'"`);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      sale_price REAL NOT NULL,
      gst_rate REAL NOT NULL,
      stock_qty REAL NOT NULL DEFAULT 0,
      category TEXT,
      brand TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cashier_pins (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn('products', 'category', 'category TEXT');
  ensureColumn('products', 'brand', 'brand TEXT');
  ensureColumn('products', 'purchase_price', 'purchase_price REAL NOT NULL DEFAULT 0');
  ensureColumn('products', 'mrp', 'mrp REAL');
  ensureColumn('cashier_pins', 'role', 'role TEXT');

  const count = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  if (count.c === 0 && !opts.skipSeedIfEmpty) {
    seedLocalProducts();
  }
}

function seedLocalProducts() {
  const products = [
    ['8901234567890', 'SAM-A54-128', 'Samsung Galaxy A54 128GB', '8517', 28999, 18, 15, 'Mobile', 'Samsung'],
    ['8901234567891', 'IPH-13-128', 'iPhone 13 128GB', '8517', 54999, 18, 8, 'Mobile', 'Apple'],
    ['8901234567892', 'SCR-IP13', 'iPhone 13 Screen Assembly', '8517', 4500, 18, 25, 'Accessories', 'Apple'],
    ['8901234567893', 'EAR-BT01', 'Bluetooth Earbuds TWS', '8518', 1499, 18, 50, 'Accessories', 'Generic'],
    ['8901234567894', 'CHG-C20', 'Type-C Fast Charger 20W', '8504', 999, 18, 100, 'Accessories', 'Generic'],
  ];

  const insert = db.prepare(`
    INSERT INTO products (id, barcode, sku, name, hsn_code, sale_price, gst_rate, stock_qty, category, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [barcode, sku, name, hsn, price, gst, stock, category, brand] of products) {
    insert.run(randomUUID(), barcode, sku, name, hsn, price, gst, stock, category, brand);
  }
}

export function getLocalProducts() {
  return db.prepare('SELECT * FROM products ORDER BY name').all();
}

export function saveLocalInvoice(invoice: Record<string, unknown>) {
  const id = randomUUID();
  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO invoices (id, invoice_number, payload, created_at, synced)
      VALUES (?, ?, ?, ?, 0)
    `).run(id, invoice.invoiceNumber, JSON.stringify(invoice), new Date().toISOString());

    db.prepare(`
      INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, status, created_at)
      VALUES (?, 'invoice', ?, 'CREATE', ?, 'PENDING', ?)
    `).run(randomUUID(), id, JSON.stringify(invoice), new Date().toISOString());

    const lines = invoice.lines as Array<{ productId?: string; quantity: number }>;
    for (const line of lines) {
      if (line.productId) {
        // Display-cache only — the server is authoritative and re-checks stock at sync-apply
        // time (WHERE stockQty >= qty), so this only stops a negative number showing locally.
        db.prepare('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?')
          .run(line.quantity, line.productId);
      }
    }
  });
  txn();
  return { id };
}

export function getOutbox() {
  return db.prepare("SELECT * FROM sync_outbox WHERE status = 'PENDING'").all();
}

export function markOutboxSynced(id: string) {
  db.prepare("UPDATE sync_outbox SET status = 'SYNCED' WHERE id = ?").run(id);
}

export function markOutboxStatus(id: string, status: 'FAILED' | 'CONFLICT') {
  db.prepare('UPDATE sync_outbox SET status = ? WHERE id = ?').run(status, id);
}

/** Permanently-stuck entries (won't be retried) — surfaced in the sync badge instead of silently
    retried forever. PENDING rows are excluded; those are still mid-flight, not "failed". */
export function getOutboxFailedCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status IN ('FAILED', 'CONFLICT')")
    .get() as { c: number };
  return row?.c ?? 0;
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getJsonSetting<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonSetting(key: string, value: unknown) {
  setSetting(key, JSON.stringify(value));
}

export function upsertProductsFromServer(products: Array<Record<string, unknown>>) {
  const upsert = db.prepare(`
    INSERT INTO products (id, sku, barcode, name, hsn_code, sale_price, gst_rate, stock_qty, category, brand, purchase_price, mrp, synced_at)
    VALUES (@id, @sku, @barcode, @name, @hsnCode, @salePrice, @gstRate, @stockQty, @category, @brand, @purchasePrice, @mrp, @syncedAt)
    ON CONFLICT(id) DO UPDATE SET
      stock_qty = @stockQty,
      sale_price = @salePrice,
      gst_rate = @gstRate,
      category = @category,
      brand = @brand,
      purchase_price = @purchasePrice,
      mrp = @mrp,
      synced_at = @syncedAt
  `);

  const txn = db.transaction(() => {
    for (const p of products) {
      upsert.run({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode ?? null,
        name: p.name,
        hsnCode: p.hsnCode ?? p.hsn_code,
        salePrice: Number(p.salePrice ?? p.sale_price),
        gstRate: Number(p.gstRate ?? p.gst_rate),
        stockQty: Number(p.stockQty ?? p.stock_qty),
        category: (p.category as string | null) ?? null,
        brand: (p.brand as string | null) ?? null,
        purchasePrice: Number(p.purchasePrice ?? p.purchase_price ?? 0),
        mrp: p.mrp != null ? Number(p.mrp) : null,
        syncedAt: new Date().toISOString(),
      });
    }
  });
  txn();
}

/**
 * Sum of quantities still queued (not yet server-confirmed) per product, across every PENDING
 * outbox invoice — lets the counter show a realistic sellable count instead of trusting the raw
 * local cache, which ignores bills already queued but not yet applied server-side.
 */
export function getPendingQtyByProduct(): Record<string, number> {
  const rows = db
    .prepare("SELECT payload FROM sync_outbox WHERE status = 'PENDING' AND entity_type = 'invoice'")
    .all() as Array<{ payload: string }>;

  const totals: Record<string, number> = {};
  for (const row of rows) {
    let invoice: { lines?: Array<{ productId?: string; quantity?: number }> };
    try {
      invoice = JSON.parse(row.payload);
    } catch {
      continue;
    }
    for (const line of invoice.lines ?? []) {
      if (!line.productId) continue;
      totals[line.productId] = (totals[line.productId] ?? 0) + Number(line.quantity ?? 0);
    }
  }
  return totals;
}

export function getOutboxCount(): number {
  const row = db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'PENDING'").get() as {
    c: number;
  };
  return row?.c ?? 0;
}

function hashPin(pin: string): string {
  const salt = getSetting('pin-salt') || (() => {
    const s = randomUUID();
    setSetting('pin-salt', s);
    return s;
  })();
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

export function hasCashierPins(): boolean {
  const row = db.prepare('SELECT COUNT(*) as c FROM cashier_pins').get() as { c: number };
  return (row?.c ?? 0) > 0;
}

export function setCashierPin(label: string, pin: string, token: string, role?: string) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO cashier_pins (id, label, pin_hash, token, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, label || 'Cashier', hashPin(pin), encryptToken(token), role ?? null, new Date().toISOString());
  return true;
}

type PinLockoutState = { failedAttempts: number; lockedUntil: string | null };

/** One global counter for the PIN-unlock screen as a whole — simpler than per-row tracking,
    and avoids one cashier's mistyped PIN locking out a different cashier's own correct PIN. */
function getPinLockout(): PinLockoutState {
  return getJsonSetting<PinLockoutState>('pin-lockout') ?? { failedAttempts: 0, lockedUntil: null };
}

export function verifyCashierPin(pin: string): {
  ok: boolean;
  token?: string;
  label?: string;
  role?: string | null;
  lockedForMs?: number;
} {
  const lockout = getPinLockout();
  if (lockout.lockedUntil && new Date(lockout.lockedUntil).getTime() > Date.now()) {
    return { ok: false, lockedForMs: new Date(lockout.lockedUntil).getTime() - Date.now() };
  }

  const hash = hashPin(pin);
  const row = db
    .prepare('SELECT label, token, role FROM cashier_pins WHERE pin_hash = ?')
    .get(hash) as { label: string; token: string; role: string | null } | undefined;

  if (row) {
    setJsonSetting('pin-lockout', { failedAttempts: 0, lockedUntil: null });
    return { ok: true, token: decryptToken(row.token), label: row.label, role: row.role };
  }

  const failedAttempts = lockout.failedAttempts + 1;
  const lockedUntil = failedAttempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS).toISOString() : null;
  setJsonSetting('pin-lockout', { failedAttempts: lockedUntil ? 0 : failedAttempts, lockedUntil });
  return { ok: false, lockedForMs: lockedUntil ? PIN_LOCKOUT_MS : undefined };
}

export function clearCashierPins() {
  db.prepare('DELETE FROM cashier_pins').run();
  return true;
}

export { db };
