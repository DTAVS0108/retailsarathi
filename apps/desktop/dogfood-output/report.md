# Desktop Deep Test Report

Generated: 2026-07-26T06:21:44.307Z
API: http://localhost:4000/api/v1

| Pass | Fail | Skip |
|---:|---:|---:|
| 68 | 4 | 1 |

## Results

| Area | Case | Status | Detail |
|---|---|---|---|
| Auth | Login demo owner | **PASS** |  |
| Auth | Login bad password rejected | **PASS** | HTTP 401 |
| Bootstrap | GET /tenants/profile | **PASS** |  |
| Bootstrap | GET /products?pageSize=500 | **PASS** |  |
| Bootstrap | GET /customers | **PASS** |  |
| Bootstrap | Desktop customers list contract | **PASS** | 8 customers |
| Bootstrap | GET /invoices?status=DRAFT | **PASS** |  |
| Bootstrap | Have at least one product | **PASS** | Deep Test DT-MS1EPS7Z edited |
| Stats | GET /tenants/dashboard | **PASS** |  |
| Stats | GET /analytics/monthly | **PASS** |  |
| Stats | GET /analytics/sale-ledger | **PASS** |  |
| Stats | GET /analytics/stock-flow | **PASS** |  |
| Stats | GET /products/stock-summary | **PASS** |  |
| Stats | GET /reports/day-end | **PASS** |  |
| Products | GET /products/facets | **PASS** |  |
| Products | GET /products/inactive | **PASS** |  |
| Products | GET /categories | **PASS** |  |
| Products | POST /categories/sync-from-products | **PASS** |  |
| Products | GET /products/export | **PASS** |  |
| Products | GET /products/barcode/:code | **SKIP** | no barcode on sample product |
| Products | GET /products/serials/search empty-ish | **PASS** |  |
| Products | Unknown barcode → 404 | **PASS** | HTTP 404 |
| Products | POST /products create | **PASS** |  |
| Products | PATCH product | **PASS** |  |
| Products | POST stock adjust + | **PASS** |  |
| Products | POST stock adjust - | **PASS** |  |
| Products | Stock adjust zero rejected | **FAIL** | API accepted quantity=0 (desktop form blocks; API should too) |
| Products | Drain stock for archive | **PASS** |  |
| Products | DELETE archive | **PASS** |  |
| Products | POST restore | **PASS** |  |
| Customers | POST /customers full fields | **PASS** |  |
| Customers | Duplicate phone rejected | **FAIL** | API accepted duplicate phone (desktop/web can create twin parties) |
| Customers | Invalid phone rejected | **FAIL** | API accepted phone=123 (desktop modal validates; API does not) |
| Customers | Missing name rejected | **FAIL** | API accepted empty name |
| Khata | GET /customers/aging/report | **PASS** |  |
| Khata | GET /suppliers/aging/report | **PASS** |  |
| Khata | GET /parties/search | **PASS** |  |
| Khata | Party search <2 chars rejected | **PASS** | HTTP 400 |
| Khata | GET customer statement | **PASS** |  |
| Khata | GET open-invoices | **PASS** |  |
| Khata | Collect with 0 balance | **PASS** | Accepted as advance/collection (API allows overpay → advance) |
| Khata | GET /suppliers/:id | **PASS** |  |
| POS | POST /invoices/hold | **PASS** |  |
| POS | PATCH finalize held | **PASS** |  |
| POS | GET invoice detail | **PASS** |  |
| POS | GET invoice print payload | **PASS** |  |
| POS | GET thermal text | **PASS** |  |
| POS | Search invoice by number | **PASS** |  |
| POS | POST whatsapp | **PASS** |  |
| POS | POST warranty-cards | **PASS** |  |
| POS | POST /hardware/print-thermal | **PASS** | HTTP 400 |
| POS | PATCH undo within grace | **PASS** |  |
| POS | Undo cancels invoice (not draft) | **PASS** | status=CANCELLED |
| POS | Re-finalize cancelled id rejected | **PASS** | HTTP 400 |
| Returns | POST /invoices/returns | **PASS** |  |
| POS | Hold then finalize (tax-aware path) | **PASS** |  |
| POS | Finalize tax-aware hold | **PASS** |  |
| POS | Split pay CASH+UPI invoice | **PASS** |  |
| POS | Empty lines rejected | **PASS** | HTTP 400 |
| POS | Oversell stock guarded | **PASS** | HTTP 400 |
| Bills | GET invoices FINALIZED | **PASS** |  |
| Bills | GET invoices search empty | **PASS** |  |
| Repairs | GET /repairs | **PASS** |  |
| Repairs | GET /users/technicians | **PASS** |  |
| Repairs | POST /repairs | **PASS** |  |
| Repairs | GET repair detail | **PASS** |  |
| Repairs | PATCH status DIAGNOSED | **PASS** |  |
| Repairs | PATCH status IN_REPAIR | **PASS** |  |
| Repairs | Illegal status jump rejected | **PASS** | HTTP 400 |
| Repairs | POST parts | **PASS** |  |
| Repairs | POST send-estimate | **PASS** | HTTP 201: Repair estimate for Inverter DT-1 (REP-2026-00002): ₹500. Reply YES to approve. |
| Repairs | POST create-invoice | **PASS** | HTTP 201:  |
| Authz | Invalid JWT rejected | **PASS** | HTTP 401 |
