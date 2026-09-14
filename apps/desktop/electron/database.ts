import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { createHash, randomUUID } from 'crypto';

let db: Database.Database;

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'retail-sarathi.db');
  db = new Database(dbPath);
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

  const count = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  if (count.c === 0) {
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
        db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?')
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

export function setCashierPin(label: string, pin: string, token: string) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO cashier_pins (id, label, pin_hash, token, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, label || 'Cashier', hashPin(pin), token, new Date().toISOString());
  return true;
}

export function verifyCashierPin(pin: string): { ok: boolean; token?: string; label?: string } {
  const hash = hashPin(pin);
  const row = db
    .prepare('SELECT label, token FROM cashier_pins WHERE pin_hash = ?')
    .get(hash) as { label: string; token: string } | undefined;
  if (!row) return { ok: false };
  return { ok: true, token: row.token, label: row.label };
}

export function clearCashierPins() {
  db.prepare('DELETE FROM cashier_pins').run();
  return true;
}

export { db };
