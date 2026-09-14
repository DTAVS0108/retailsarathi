# RetailSarathi Mobile (Flutter)

Native Android / iOS / tablet client for the same NestJS API as the web app.

## Prerequisites

1. API running: `apps/api` on port **4000**
2. Flutter SDK 3.32+

## Run

```bash
cd apps/mobile

# Chrome / Windows desktop (uses http://127.0.0.1:4000/api/v1)
flutter run -d chrome
flutter run -d windows

# Android emulator (uses http://10.0.2.2:4000/api/v1)
flutter run

# Physical phone — set API URL on login to http://YOUR_PC_LAN_IP:4000/api/v1
# and ensure phone + PC are on the same Wi‑Fi; Windows firewall must allow port 4000.

# Production API (live app):
# https://api.retailsarathi.in/api/v1
```

## Demo login

- Email: `owner@demo.retailsarathi.in`
- Password: `Demo@123`

## What’s included

| Tab | Features |
|-----|----------|
| Home | Dashboard stats from `/tenants/dashboard` |
| POS | Product grid, category chips, scan/SKU, cart dock, checkout sheet (customer + payment + GST), success → open bill |
| Stock | Search, add/edit products, adjust stock |
| Bills | Invoice list (filter/search), open detail, cancel, print/share |
| More | Reports & ledgers, API URL, sign out |

### Reports (More → Reports & ledgers)

- Monthly sales bars (3/6/12 months)
- Stock in / out flow by type
- Sale ledger (finalized bills + payment mix)
- Buy ledger (purchases / stock-in estimates)
- Range filters: 7d / 30d / 90d

Supplier invoice OCR stock-in is on **web** (`/dashboard/stock-in`) and **mobile** (More → Stock-in / Scan bill).

## Project layout

```
lib/
  config/api_config.dart
  models/models.dart
  services/api_client.dart
  services/auth_state.dart
  screens/app_screens.dart
  screens/products_screen.dart
  screens/invoices_screen.dart
  main.dart
```
