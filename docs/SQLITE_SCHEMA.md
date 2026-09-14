# Local SQLite Schema (Desktop Offline Mirror)

Mirrors cloud PostgreSQL entities for offline-first operation. Synced via outbox pattern.

## Tables

### products
Local cache of cloud products. Updated on pull sync.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Same as cloud ID after sync |
| sku | TEXT | |
| barcode | TEXT | Scanner lookup |
| name | TEXT | |
| hsn_code | TEXT | |
| sale_price | REAL | |
| gst_rate | REAL | |
| stock_qty | REAL | Decremented on local sale |
| synced_at | TEXT ISO | Last pull timestamp |

### invoices
Local invoices created offline.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| invoice_number | TEXT | LOCAL-{timestamp} until synced |
| payload | TEXT JSON | Full invoice for sync |
| created_at | TEXT ISO | |
| synced | INTEGER 0/1 | |

### sync_outbox
Pending changes to push to server.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| entity_type | TEXT | product, invoice, customer |
| entity_id | TEXT | |
| operation | TEXT | CREATE, UPDATE, DELETE |
| payload | TEXT JSON | |
| status | TEXT | PENDING, SYNCED, CONFLICT, FAILED |
| created_at | TEXT ISO | |

### settings
Key-value store for device_id, last_sync cursor, auth token cache.

## Conflict Resolution

1. Push local outbox entries to `POST /sync/push`
2. Server returns SYNCED / FAILED / CONFLICT per entry
3. CONFLICT entries shown in desktop UI for manual resolution
4. Pull server changes since `sync_cursors.lastSyncedAt`

## Implementation

- File: `apps/desktop/electron/database.ts`
- Sync: `apps/desktop/electron/sync.ts`
- API: `apps/api/src/sync/sync.service.ts`
