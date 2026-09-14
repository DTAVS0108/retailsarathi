# Phase 5 — Enterprise Features

## Delivered

| Area | API | Web UI |
|------|-----|--------|
| **Analytics** | `/analytics/overview`, `/abc`, `/dead-stock`, `/margin-by-sku`, `/salesperson` | `/dashboard/analytics` |
| **AI** | `/ai/reorder`, `/forecast/:id`, `/duplicate-imei`, `/ocr-hints` | `/dashboard/ai` |
| **Multi-branch** | `/branches` CRUD, stock, transfers, consolidated P&L | `/dashboard/branches` |
| **E-commerce sync** | `/ecommerce/channels`, sync, orders | `/dashboard/ecommerce` |
| **Hardware** | `/hardware` presets + device config | `/dashboard/hardware` |
| **Compliance+** | `/compliance/audit-log`, invoice QR, e-invoice demo, e-way helper | `/dashboard/compliance` |
| **Staff** | `/staff` CRUD, attendance, commissions | `/dashboard/staff` |
| **Trade-in** | `/trade-in` quote → accept → refurb inventory | `/dashboard/trade-in` |
| **Subscriptions** | `/subscriptions/plans`, `/current`, `/change-plan` | `/dashboard/subscription` |
| **SaaS admin** | `/platform/auth/*`, `/tenants`, `/stats`, `/tickets` | `/admin` |

## Setup

### Subscription plans (auto-seeded on first `/subscriptions/plans` call)
- **FREE** — 1 user, 500 products, 1 branch
- **PRO** — ₹1,499/mo — repair, WhatsApp, scans
- **BUSINESS** — ₹3,999/mo — multi-branch, analytics, e-commerce

### Platform admin (one-time seed)
```powershell
curl -X POST http://localhost:4000/platform/auth/seed -H "Content-Type: application/json" -d "{\"email\":\"admin@retailsarathi.in\",\"password\":\"Admin@123\",\"name\":\"Platform Admin\"}"
```
Then open `/admin` and sign in.

### Production integrations (next steps)
- **AI**: Wire OpenAI/Vision API for OCR; ML demand forecasting
- **E-commerce**: Shopify Admin API, Amazon SP-API OAuth
- **Compliance**: NIC e-invoice GSP (ClearTax/Masters India)
- **Subscriptions**: Razorpay/Stripe billing webhooks
- **Hardware**: ESC/POS native drivers in Tauri desktop app

## Verify
```powershell
cd apps/api; npm run build
cd apps/web; npm run build
```
