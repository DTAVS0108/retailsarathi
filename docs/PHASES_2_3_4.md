# Phases 2–4 Completion Summary

## Phase 2 — Wholesale, CRM, Notifications, Scan

| Feature | API | Web UI |
|---------|-----|--------|
| Wholesale price lists (CRUD + items) | `GET/POST/PATCH /wholesale/price-lists`, items endpoints | `/dashboard/wholesale` |
| Segment-based POS pricing | `GET /wholesale/price` + invoice create | POS reprices cart by customer segment |
| Loyalty earn/redeem | Auto-earn on invoice; `POST /customers/:id/loyalty/redeem` | Customers table loyalty column |
| Notifications (MSG91/WhatsApp env) | Templates, send, logs; repair estimate wired | `/dashboard/notifications` |
| Scan templates | `GET/POST/PATCH/DELETE /scan/templates` | Scan page template section |

## Phase 3 — Repair

| Feature | API | Web UI |
|---------|-----|--------|
| Technician assignment | `GET /users/technicians`, `PATCH /repairs/:id/technician` | Repair detail |
| Send estimate → SMS/WhatsApp | `POST /repairs/:id/send-estimate` | Send estimate button |
| Warranty end date | Set on `DELIVERED` | Shown on repair detail |
| Device photos | `PATCH /repairs/:id/photos` | Photo URL list |
| Repair → invoice | Auto on delivery + `POST /repairs/:id/create-invoice` | Create/view invoice |

## Phase 4 — Accounting / ITR

| Feature | API | Web UI |
|---------|-----|--------|
| Chart of accounts + seed | `GET/POST /accounting/accounts`, `POST /accounts/seed` | Accounting → Accounts tab |
| Journal entries | `GET/POST /accounting/journal` | Accounting → Journal tab |
| P&L & balance sheet | Existing report endpoints | Accounting → Overview tab |
| Auto-post sales | `autoPostSale` on every finalized invoice | Automatic |
| ITR prep + CSV + Tally XML | `/accounting/itr-prep`, export endpoints | Accounting → ITR tab |

## Env vars (optional, production notifications)

```
NOTIFICATION_DRY_RUN=false
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...
WHATSAPP_API_URL=...
WHATSAPP_API_TOKEN=...
```

## Verify

```powershell
cd apps/api; npm run build
cd apps/web; npm run build
```

Login: `owner@demo.retailsarathi.in` / `Demo@123`
