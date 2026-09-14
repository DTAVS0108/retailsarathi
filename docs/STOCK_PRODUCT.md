# Stock & product categorization

Products are categorized on two axes:

| Axis | Field | Purpose |
|------|--------|---------|
| **GST slab** | `gstRate` (required) | Tax / billing — 0, 5, 12, 18, 28, 40% |
| **Category** | `category` + master | Ops browsing — e.g. Battery, Inverter |
| **Brand** | free-text `brand` | Optional, same spelling across SKUs |

## Category master

`ProductCategory` is a per-tenant master (`GET/POST/PATCH/DELETE /categories`).

- Creating/updating a product with a category upserts the master (`ensureCategoryMaster`)
- `POST /categories/sync-from-products` backfills names from existing SKUs
- Web Products + Desktop Products load `/categories` into datalist suggestions (merged with product facets)
- Free-text on the product is still allowed; the master reduces spelling drift for stock boards

## API

### `GET /products`

Query filters:

- `search`, `category`, `brand`, `supplierId`
- `gstRate` — exact slab (e.g. `18`); omit for all
- `lowStock=true` / `outOfStock=true`
- `page`, `pageSize`

### `GET /products/stock-summary`

Returns totals plus:

- `byCategory[]` — `category`, `skuCount`, `stockQty`, `stockValue`, `lowStockCount`
- `byGstSlab[]` — `gstRate`, same metrics

Empty category rolls into **Uncategorized** (display-only; not a filter value).

Stock value uses purchase price when set, else sale price.

### Create / update

`POST /products` and `PATCH /products/:id` accept `category`, `brand`, `gstRate` (and enrichment complete accepts the same via `nearestGstSlab`).

CSV / Excel import columns include `category`, `brand`, `gstRate`.

GST cells accept common formats and snap to a known slab:

- `18`, `18%`, `GST 18`, `0.18` (spreadsheet fraction → 18%)
- Header aliases: `gstRate`, `GST`, `GST %`, `tax`, `taxRate`
- Blank `gstRate` on update leaves the existing slab unchanged
- Known fractional slab `0.25` is kept (not treated as 25%)

### Stock reports

| Endpoint | Purpose |
|----------|---------|
| `GET /reports/stock-valuation` | Snapshot by SKU; optional `category`, `gstRate`; `format=json\|csv\|xlsx\|pdf` |
| `GET /reports/stock-movements` | Ledger over period (`from`/`to`/`fy`/`days`); optional `type`, `productId` |

Web Reports tabs: **Stock valuation** · **Stock movements**.

## Invoice upload (PDF / image / text)

`POST /scan/upload` → parse → `POST /scan/confirm-stock-in`:

- Per-line **GST %** is snapped via `nearestGstSlab` in all OCR strategies (`pushLine`) and on confirm create/update
- **Header-only GST** (CGST/SGST/IGST % without per-line rates): `inferHeaderGstRate` — lines use `line → header → matched product → 18`
- Image/PDF with no embedded text: file is kept; response sets `needsOcr` / `clientOcrRequired` with next steps; re-upload with `extractedText` or use Parse
- Product names ending in model numbers (e.g. `Pro 1100`) keep their GST/HSN when the invoice has a separate HSN + GST column
- Creating a missing SKU from stock-in also stores the invoice GST slab

## Clients

| Surface | Add/edit cat·brand·GST | Filters | Stock boards |
|---------|------------------------|---------|--------------|
| Web Products & Stock | Yes (+ category master suggestions) | GST chips + category/brand/supplier/stock | Yes |
| Web Reports | — | Valuation category/GST; movements type/period | Valuation + movements |
| Web POS product picker | — | GST + category/brand/stock | — |
| Web Products needing details | Category + GST + brand | — | — |
| Mobile Products | Yes (GST chips); SQLite has `category` col | GST + category/brand/supplier/stock | Yes |
| Mobile enrichment | Category + GST + brand | — | — |
| Desktop Products tab | Online create/edit | Search | — |
| Desktop Stats | — | — | GST + category boards → POS picker |
| Desktop POS picker | — | GST + category/brand/stock | — |

Offline:

- Desktop SQLite: `category` / `brand` columns (+ migration via `ensureColumn`)
- Mobile SQLite: `category` column (schema v2)

Shared types: `ProductListQuery`, `ProductStockSummary` in `@retail-sarathi/types`.

## Dev

Root `package.json` sets `"packageManager": "npm@10.9.3"` so `npm run dev` (turbo) works. You can still use `npm run dev:api` / `npm run dev:web`.
