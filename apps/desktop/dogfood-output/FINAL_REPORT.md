# RetailSarathi Desktop — Deep Test Report

**Date:** 2026-07-26  
**Targets:** Electron POS (`apps/desktop`) + Nest API (`localhost:4000/api/v1`)  
**Demo login:** `owner@demo.retailsarathi.in`

## Summary

| Layer | Pass | Fail | Skip / notes |
|---|---:|---:|---|
| **API deep suite** (desktop contracts + corners) | **68** | **4** | 1 skip (no barcode on sample SKU) |
| **Electron UI smoke** (CDP / agent-browser) | **15** | **1** | Khata “+ Add customer” flake after Settings nav; button confirmed present in follow-up |
| **Typecheck** `apps/desktop` | OK | — | — |

Artifacts: `apps/desktop/dogfood-output/` (`report.md`, `results.json`, `ui-results.json`, `screenshots/`).  
Re-run:

```bash
node apps/desktop/scripts/desktop-deep-test.mjs
# with desktop running + CDP (dev enables port 9222):
node apps/desktop/scripts/desktop-ui-smoke.mjs
```

---

## Feature coverage

### Auth
- Login OK; bad password → 401; invalid JWT → 401.

### Bootstrap / POS shell
- Tenant profile, products page, customers list, held drafts load.
- Customers list returns a **plain array** (desktop contract OK).

### Stats
- Dashboard, monthly analytics, sale ledger, stock flow, stock summary, day-end report — all OK.

### Products
- Facets, inactive, categories sync, export, barcode 404, create/edit, stock ±, archive/restore — OK.
- **FAIL:** `POST /products/:id/stock` with `quantity: 0` is accepted (desktop UI blocks; API should reject).

### Customers / Khata
- Full-field create, aging boards, party search (&lt;2 chars rejected), statement, open invoices, supplier detail, collect (including advance when balance 0) — OK.
- In-app Khata (no “open web khata”) confirmed in UI.
- **FAIL (API validation):**
  - Duplicate phone accepted
  - Phone `123` accepted
  - Empty name accepted  
  (Desktop modal validates phone/name; API does not — twins / garbage parties possible.)

### POS billing
- Hold → finalize, print payload, thermal text, search by number, WhatsApp/warranty endpoints, hardware print (no printer → 4xx OK).
- Undo within grace → status `CANCELLED`; re-finalize same id rejected (matches desktop “restore cart → new bill”).
- Tax-aware hold/finalize, split CASH+UPI hold, empty lines rejected, oversell guarded — OK.

### Returns
- Credit note against finalized invoice — OK.

### Bills / Repairs
- Invoice list filters OK.
- Repair create, status flow (`RECEIVED → DIAGNOSED → IN_REPAIR`), illegal jump rejected, parts, estimate, create-invoice — OK.

### UI (Electron via CDP :9222)
- All nav tabs: POS, Held, Returns, Bills, Repairs, Products, Khata, Stats, Settings.
- Add to cart, full customer form modal, multi-bill tabs, F2 picker, Ctrl+/ shortcuts, Products controls.
- Screenshots under `dogfood-output/screenshots/`.

---

## Real bugs / gaps found

1. **API accepts stock adjust `quantity: 0`** — should 400.
2. **API customer create weak validation** — empty name, invalid phone, duplicate phone all succeed.
3. **Thermal hardware** returns 400 without COM/BT — expected offline; Settings test print still needed for hardware shops.
4. **UI smoke flake:** after leaving Settings, re-finding Khata “+ Add customer” sometimes misses (button exists when Khata is focused).

---

## Not fully hardware-exercised (environment limits)

- Physical thermal printer / cash drawer kick
- Offline SQLite outbox with NIC unplug
- Barcode scanner HID timing
- Cashier PIN cold-start (needs PIN seeded on device)
- Concurrent stock race (`stock-guard.concurrency.spec.ts` needs project Jest/SWC config — not run cleanly via bare `npx jest`)
