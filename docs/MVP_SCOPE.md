# RetailSarathi — Phase 1 MVP Scope

**Target:** Electronics / mobile / repair shops in India  
**Timeline:** 8–12 weeks  
**Success criteria:** 100+ invoices/day offline, correct stock, GST invoice print, sync on reconnect

---

## In Scope (Phase 1)

### 1. Tenant & Auth
- [x] Multi-tenant schema (`tenant_id` on all tables)
- [x] Single branch per tenant (multi-branch UI deferred)
- [x] Roles: Owner, Manager, Cashier
- [x] JWT auth (API + web); local session (desktop)

### 2. Inventory
- Product CRUD: SKU, barcode, HSN, category, brand, model
- IMEI/serial tracking (electronics)
- Stock ledger: purchase, sale, adjustment
- Supplier master
- Low-stock alerts (threshold per product)
- CSV bulk import

### 3. Billing / POS
- Fast retail billing screen
- Barcode scanner input (keyboard wedge)
- Hold / resume bill
- Split payment: cash, UPI, card, credit
- Credit sales + customer outstanding
- Invoice types: tax invoice, bill of supply
- Thermal (80mm) + A4 PDF print templates
- WhatsApp share link (invoice PDF URL)

### 4. GST (India)
- CGST / SGST / IGST from place of supply
- HSN-wise line items
- GSTR-1 JSON export
- GSTR-3B summary export
- Composition scheme toggle (tenant setting)

### 5. Customers (Basic)
- Profile: name, phone, email, GSTIN, address
- Purchase history
- Outstanding balance
- Tags: birthday, anniversary

### 6. Desktop (Offline-First)
- Electron app with local SQLite
- Full POS + inventory when offline
- Sync outbox on reconnect

### 7. Web
- Marketing landing page
- Login + dashboard
- Product/inventory management
- Sales reports
- GST export download

---

## Out of Scope (Phase 1)

- Wholesale price lists (Phase 2)
- WhatsApp/SMS campaigns (Phase 2)
- Repair job cards (Phase 3)
- Accounting / ITR prep (Phase 4)
- Multi-branch HQ dashboard (Phase 5)
- E-invoice IRN live integration (hook only)
- Mobile staff app

---

## Technical Deliverables

| Component | Stack |
|-----------|-------|
| API | NestJS + PostgreSQL + Prisma |
| Web | Next.js 15 App Router |
| Desktop | Electron + React + SQLite |
| Shared | `@retail-sarathi/types`, `@retail-sarathi/gst-engine`, `@retail-sarathi/ui` |

---

## Acceptance Tests (Pilot)

1. Create 50 products with barcodes; scan and bill 10 items in under 2 minutes.
2. Generate GST tax invoice with correct CGST/SGST for intra-state sale.
3. Disconnect internet; complete 5 bills; reconnect; verify sync to cloud.
4. Export GSTR-1 JSON for a month; validate against GST portal schema.
5. Print thermal receipt on 80mm printer.
