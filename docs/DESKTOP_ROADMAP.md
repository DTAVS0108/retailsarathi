# RetailSarathi Desktop POS — Improvement Roadmap

**Last updated:** 2026-07-26 (Phases 0–4 implemented on desktop; see verification below)

Implementation status (desktop):
- Phase 0: API URL prefs, IGST from shop/customer state, hold resume, return by invoice # / IMEI, theme remaps for panels
- Phase 1: F1–F12 + Ctrl+/, cart edit, global barcode, reprint, drawer kick, printer UI, sync badge, notes, cashier PIN
- Phase 2: MRP/margin display, serial search modal, warranty print trigger, stock adjust, customer quick-add, WhatsApp toast
- Phase 3–4: Multi-bill tabs, trade-in, EMI metadata, day-end shift, full offline catalog pull, auto-update stub
- Split: `pos/` modules (HeldTab, ReturnsTab, helpers, types, SyncBadge, etc.) + `api.ts`; App still orchestrates POS bill UI

---

## 1. Competitive Positioning

### What Desktop Must Own

The desktop Electron app is the **counter weapon** — the thing the cashier stares at 8 hours a day. It must beat competitors on speed-to-bill, hardware integration, and offline resilience.

| Capability | Why desktop owns it | Competitors that do this |
|---|---|---|
| **Sub-second barcode → bill** | Hardware scanner, always-focused input, no browser tab wars | Marg, SalePlus, Phoneo |
| **Thermal print + cash drawer kick** | Direct COM/USB port access via Electron — web can't | Marg, Setuverse, Swadesh |
| **Offline billing with outbox** | SQLite WAL + outbox sync — works when ISP dies mid-rush | Phoneo, Vyapar |
| **IMEI/serial lifecycle at POS** | Select IMEI on sale, auto-deduct, track through return | Phoneo, Setuverse |
| **PIN-based cashier login** | Fast shift switch without email/password — desktop-only concern | SalePlus, Marg |
| **Keyboard-first workflow** | F-key shortcuts, no mouse needed for 90% of billing | Marg, BUSY |
| **Reprint / duplicate receipt** | Thermal reprint from invoice history — common ask at counter | All competitors |
| **Held bill → restore to cart** | Pause customer A, serve B, resume A — fundamental POS flow | All competitors |

### What to Leave to Web

Do **not** build these on desktop. The web dashboard (`apps/web/`) is the right home:

| Feature | Why web, not desktop |
|---|---|
| **Full party khata CRUD** | Complex ledger UI with statement PDF, aging, allocation — desktop shows read-only summary + deep-links to web |
| **GRN / purchase entry** | Multi-page forms with supplier lookup, batch serial import, Excel upload — too complex for counter-mode |
| **Reports / GSTR filing** | Period reports, GSTR-1/3B/2B reconciliation, export to Tally — accountant workflow, not cashier |
| **E-invoice / e-way bill** | Compliance portal integration, IRN generation — triggered from web after finalize |
| **Staff / branch management** | Admin console for roles, branches, subscriptions — web-only |
| **Ecommerce / catalog management** | Product images, descriptions, online store — marketing, not counter |
| **Bank reconciliation** | Statement upload, matching, MSME compliance — accountant in browser |
| **AI / analytics dashboards** | Deep analytics, AI insights — web has more screen real estate and doesn't compete with billing |
| **Warranty card generation** | PDF generation with QR, terms — fire from API on finalize, view/reprint from web |
| **Repair job cards** | Full lifecycle repair tracking — web workflow, desktop just shows "active repairs" count |

**Desktop parties panel strategy:** Keep read-only aging summary + "Open in web" deep-link buttons (current approach is correct). Add quick "Record payment" shortcut that opens web pre-filled.

---

## 2. Phased Roadmap

### Phase 0 — Foundation Fixes (Week 1, days 1–3)

Critical bugs and config issues that block everything else. Zero new features — just fix what's broken.

| # | Fix | Effort | Files to Touch |
|---|---|---|---|
| 0.1 | **Extract `API_URL` to prefs / env** — hardcoded `localhost:4000` in `App.tsx` line 24 and `PartiesPanel.tsx` line 3. Move to `DesktopPrefs` with a Settings UI field + env fallback. | S | `App.tsx` (remove const, read from prefs), `PartiesPanel.tsx` (accept as prop instead of own const), `prefs.ts` (add `apiUrl` field), `SettingsPanel.tsx` (add API URL input) |
| 0.2 | **Dynamic seller/buyer state for IGST** — `calculateInvoice(lineInputs, '27', '27')` hardcoded at line 341. Read seller state from tenant profile (API) or prefs. Pass buyer state from customer GSTIN (first 2 digits). Enable IGST for inter-state sales. | M | `App.tsx` (read tenant state, parse customer GSTIN prefix), `prefs.ts` (add `sellerStateCode`), `SettingsPanel.tsx` (state dropdown or auto-detect from GSTIN) |
| 0.3 | **Fix held bill restore to cart** — Currently `finalizeHeld()` only calls PATCH finalize. Need a "Restore" button that loads held bill lines back into cart state with products, serials, customer, notes. | M | `App.tsx` (add `restoreHeld(bill)` function that maps `HeldBill.lines` → `CartLine[]`, sets customer/notes/payments; add "Restore to cart" button next to "Finalize" in held tab) |
| 0.4 | **Return search by invoice number / IMEI** — Returns tab requires raw UUID. Add search that queries `/invoices?search=INV-xxx` and auto-resolves the UUID. Also allow IMEI-based return lookup. | M | `App.tsx` (replace raw UUID input with search input, call `/invoices?search=` then pick, add IMEI search path via `/invoices?serial=`) |
| 0.5 | **Fix `InvoicesPanel` hardcoded colors** — Uses `bg-teal-700`, `text-slate-*` etc. instead of CSS variables. Breaks on dark themes. | S | `InvoicesPanel.tsx` (replace all hardcoded Tailwind color classes with `style={{ color: 'var(--rs-ink)' }}` etc., same pattern as `App.tsx`) |
| 0.6 | **Fix `ProductsPanel` hardcoded colors** | S | `ProductsPanel.tsx` (same treatment as 0.5) |
| 0.7 | **Fix `StatsPanel` hardcoded colors** | S | `StatsPanel.tsx` (same treatment) |
| 0.8 | **Fix `PartiesPanel` hardcoded colors** | S | `PartiesPanel.tsx` (same treatment) |

**Verification Phase 0:**
- [ ] Change API URL in settings → app connects to remote server
- [ ] Add a customer with GSTIN starting with "29" (Karnataka) → invoice shows IGST instead of CGST+SGST
- [ ] Hold a bill → switch to Held tab → click "Restore" → cart has all lines, serials, customer, notes
- [ ] Return tab → type invoice number "INV-2026-001" → lines load (not UUID)
- [ ] Switch to Midnight Graphite theme → InvoicesPanel, ProductsPanel, StatsPanel, PartiesPanel all readable

---

### Phase 1 — Professional Counter (Weeks 1–2)

Quick wins that make the POS feel like commercial software. These are the features every shopkeeper notices in the first demo.

| # | Feature | Effort | Files to Touch |
|---|---|---|---|
| 1.1 | **Keyboard shortcut system** — Global handler: `F1`=focus barcode, `F2`=browse products, `F3`=hold bill, `F5`=toggle held, `F8`=clear cart, `F10`=split pay focus, `F12`=finalize (exists). Show shortcut hints on buttons. Add `Ctrl+K` command palette. | M | `App.tsx` (expand `onKey` handler at line 227, add shortcut hints to button labels), new file `ShortcutOverlay.tsx` (Ctrl+/ to show cheat sheet) |
| 1.2 | **Cashier PIN login** — 4–6 digit PIN stored hashed in local SQLite. On app start, show PIN pad instead of email/password. PIN maps to a cached token. Full login only needed once per device. Support multiple cashier PINs (shift handover). | M | `electron/database.ts` (add `cashier_pins` table), `App.tsx` (PIN pad UI before pos view, PIN verification via IPC), `electron/main.ts` (add `auth:verify-pin` IPC handler), `electron/preload.ts` (expose `verifyPin`) |
| 1.3 | **Thermal reprint from invoices** — "Reprint" button on invoice detail modal in `InvoicesPanel`. Calls `/hardware/print-thermal` with stored invoice ID. | S | `InvoicesPanel.tsx` (add reprint button in detail modal, call `apiFetch` then `window.retailSarathi.printThermal`) |
| 1.4 | **Cash drawer kick** — Send ESC/POS drawer kick command (`\x1B\x70\x00\x19\xFA`) after print. Add toggle in settings "Kick cash drawer after print". | S | `electron/main.ts` (append drawer kick bytes to ESC/POS buffer when pref enabled), `prefs.ts` (add `kickDrawerAfterPrint: boolean`), `SettingsPanel.tsx` (add toggle) |
| 1.5 | **Printer settings UI** — COM port selector, test print button, paper width already exists. Add: COM port input, Bluetooth MAC input, "Print test receipt" button. | S | `SettingsPanel.tsx` (new "Printer" section with COM port input, BT address input, test print button that sends sample receipt), `prefs.ts` (add `comPort`, `bluetoothAddress` fields) |
| 1.6 | **Sync health indicator** — Replace text `syncStatus` with a proper status badge. Show: last sync time, outbox count (pending items), online/offline. Pulse animation when syncing. Auto-sync on interval (configurable, default 5 min). | S | `App.tsx` (replace sync text with badge component, add `setInterval` for auto-sync), `prefs.ts` (add `autoSyncIntervalMinutes`) |
| 1.7 | **Global barcode capture** — Barcode scanners type characters fast. Capture keystrokes even when barcode input not focused. Detect rapid sequential alphanumeric input (>6 chars in <200ms), treat as barcode scan. | S | `App.tsx` (add `useEffect` with keystroke buffer that detects scanner-speed input, calls `addToCart` even when input not focused) |
| 1.8 | **Cart line editing** — Currently can't change quantity or discount per line in cart. Add +/- qty buttons, editable discount field, remove line button (X). | S | `App.tsx` (add qty +/-, discount input, remove button to cart line render block around line 1060) |
| 1.9 | **Notes field on cart** — Notes input exists in state but has no UI. Add a collapsible notes textarea below the cart. | S | `App.tsx` (add textarea for `notes` state below cart lines, before payment section) |

**Verification Phase 1:**
- [ ] Press F2 → product browse opens. Press F3 → bill held. Press Ctrl+/ → shortcut overlay shows
- [ ] Set up PIN → close app → reopen → PIN pad appears → enter PIN → POS loads (no email needed)
- [ ] Open invoice in Bills tab → click Reprint → thermal printer fires
- [ ] After bill finalize → cash drawer kicks open (when enabled in settings)
- [ ] Settings → Printer section → enter COM5, click "Test print" → receipt prints
- [ ] Unplug network cable → sell 3 items → status shows "3 pending" → plug cable → auto-sync clears outbox
- [ ] Cover barcode input with hand, scan barcode → product still adds to cart
- [ ] Cart line shows +/- buttons → change qty → total updates. Click X → line removed

---

### Phase 2 — Inventory & Serial Lifecycle (Weeks 3–5)

Features that differentiate from basic POS and match Phoneo/Setuverse.

| # | Feature | Effort | Files to Touch |
|---|---|---|---|
| 2.1 | **Product delete / archive** — Soft delete with confirmation. "Archive" marks product inactive (hidden from POS catalog but visible in reports). | S | `ProductsPanel.tsx` (add Delete/Archive buttons on product row, confirmation modal), API dependency: `DELETE /products/:id` or `PATCH /products/:id { archived: true }` |
| 2.2 | **Purchase price / MRP / margin display** — Show purchase price, MRP, and calculated margin% on product card. Read-only on desktop (edit on web). Show margin alert when sale price < purchase price. | M | `types.ts` (add `purchase_price`, `mrp` fields to `LocalProduct`), `App.tsx` (show margin on cart lines), `ProductsPanel.tsx` (display purchase price, MRP, margin% columns), API dependency: product model needs these fields |
| 2.3 | **Serial/IMEI search across catalog** — Search box that queries all serials. "Which product has IMEI 353456789012345?" — useful for customer walk-ins with warranty claims. Shows serial status (IN_STOCK, SOLD, RETURNED). | M | `App.tsx` or new `SerialSearchModal.tsx` (modal with search input, calls `/products/serials/search?q=`), API dependency: serial search endpoint |
| 2.4 | **Warranty card auto-generation** — On finalize of serial-tracked items, auto-trigger warranty card PDF generation via API. Show "Warranty cards" section in invoice detail. Add "Print warranty" action. | M | `InvoicesPanel.tsx` (warranty card section in detail modal), `App.tsx` (trigger warranty generation on finalize), API dependency: `/invoices/:id/warranty-cards` endpoint |
| 2.5 | **Quick stock adjustment** — From ProductsPanel, allow +/- stock adjustment with reason (Damaged, Theft, Miscounted). Creates stock movement via API. | S | `ProductsPanel.tsx` (add "Adjust stock" button per row, modal with qty + reason dropdown), API dependency: `POST /inventory/adjustments` |
| 2.6 | **Product import from ProductsPanel** — CSV/Excel upload for bulk product add. Parse file client-side, preview, submit batch. | L | New file `ProductImportModal.tsx` (file upload, parsing, preview table, submit), `ProductsPanel.tsx` (add Import button that opens modal), API dependency: batch create endpoint |
| 2.7 | **Customer quick-add from POS** — "New customer" button next to customer dropdown. Inline form: name, phone, GSTIN (optional). Creates customer via API without leaving POS tab. | S | `App.tsx` (add "+" button next to customer select, inline form or small modal, POST to `/customers`, refresh customer list) |
| 2.8 | **WhatsApp send with feedback** — Currently silently calls `/invoices/:id/whatsapp`. Show toast with result: "WhatsApp sent to 98765xxxxx" or "Failed: no phone number". Add manual "Send WhatsApp" button on invoice detail. | S | `App.tsx` (capture response from whatsapp call, show in msg), `InvoicesPanel.tsx` (add "Send WhatsApp" button in detail modal) |

**Verification Phase 2:**
- [ ] Delete product → disappears from catalog. Archive → hidden from POS but visible in products list (greyed)
- [ ] Product card shows: Purchase ₹800 → Sale ₹999 → Margin 24.9%. Sale below purchase → red warning
- [ ] Search IMEI "353456789012345" → shows "Samsung Galaxy A54, Status: SOLD, Invoice INV-2026-042"
- [ ] Finalize serial-tracked sale → warranty card PDF auto-generated → visible in invoice detail → can print
- [ ] Adjust stock: Battery -5, reason "Damaged" → stock decrements, movement logged
- [ ] Upload CSV with 50 products → preview shows parsed rows → click Import → products created
- [ ] Click "+" next to customer → enter name "Rajan" + phone → customer created → auto-selected in bill
- [ ] Finalize bill → toast "WhatsApp sent to 98765xxxxx" or "No phone for walk-in customer"

---

### Phase 3 — Advanced POS & Multi-Device (Weeks 6–9)

Features for shops that are growing — multi-counter, trade-in, EMI.

| # | Feature | Effort | Files to Touch |
|---|---|---|---|
| 3.1 | **Multi-bill tabs** — Allow 2–4 bills open simultaneously (like browser tabs). Switch between active bills without holding. Each tab has its own cart, customer, payments. | L | `App.tsx` (refactor cart/customer/payments state into a `BillTab[]` array, add tab bar UI above cart, switch active tab) |
| 3.2 | **Exchange / trade-in at POS** — "Trade-in" button adds negative line. Pick product being traded in, enter trade-in value, deduct from total. Links to trade-in module API. | M | `App.tsx` (add trade-in button, trade-in line type in cart, negative value handling in totals), API dependency: `/tradein` endpoints |
| 3.3 | **EMI / finance split** — Payment method "EMI" with fields: finance provider, EMI tenure, down payment. Stored as structured payment metadata. | M | `App.tsx` (add EMI as payment method, expand PayRow to include emi metadata, EMI detail fields when EMI selected) |
| 3.4 | **Day-end / shift close** — "Close shift" action that summarizes: total sales, payment-wise breakup, cash in drawer, expected vs actual. Prints shift summary on thermal. | M | New file `ShiftCloseModal.tsx` (summary view with cash count input, variance calc, print), `App.tsx` (add shift close to nav/settings), API dependency: `POST /reports/day-end` |
| 3.5 | **Offline full catalog fallback** — Currently offline only shows seeded products. On each sync, persist full product catalog to SQLite. When offline, POS works with full catalog + stock levels. | M | `electron/sync.ts` (expand pull to fetch all products with pagination, upsert all), `electron/database.ts` (add serial numbers table for offline serial tracking) |
| 3.6 | **Sync conflict resolution UI** — When sync push fails for an item, show it in a "Sync issues" panel with retry/discard options. Currently failures silently stay in outbox. | M | New file `SyncPanel.tsx` (show outbox items, retry button, discard button), `App.tsx` (add "Sync issues" count badge on nav, open panel) |
| 3.7 | **Receipt customization** — Configurable receipt: header text (shop name, tagline), footer text (return policy, "Thank you!"), show/hide UPI QR on receipt. | S | `prefs.ts` (add `receiptHeader`, `receiptFooter`, `showUpiQrOnReceipt` fields), `SettingsPanel.tsx` (text inputs for header/footer), `App.tsx` (pass to `generateThermalReceipt`) |

**Verification Phase 3:**
- [ ] Open Bill 1 with items → click "+" tab → Bill 2 opens empty → add items → switch back to Bill 1 → items preserved
- [ ] Add phone + trade-in phone → trade-in value deducted → net payable correct
- [ ] Select EMI → fill provider "Bajaj Finance", 6 months, ₹5000 down → saved on invoice
- [ ] Click "Close shift" → summary: 45 bills, ₹2.3L sales, Cash ₹1.1L, UPI ₹1.2L → print
- [ ] Disconnect internet → full catalog available → bill 3 items → reconnect → syncs
- [ ] Sync fails for 1 item → badge shows "1 issue" → open → retry → resolves

---

### Phase 4 — Polish & Scale (Weeks 10–12+)

Nice-to-haves and scale features after core is solid.

| # | Feature | Effort | Files to Touch |
|---|---|---|---|
| 4.1 | **Auto-update mechanism** — Electron auto-updater with GitHub releases. Show "Update available" banner, one-click install. | M | `electron/main.ts` (integrate `electron-updater`), new `UpdateBanner.tsx` |
| 4.2 | **Multi-language UI** — Hindi + English toggle (minimum). i18n framework for UI strings. | L | All UI files (extract strings to i18n keys), new `i18n/` folder with `en.json`, `hi.json` |
| 4.3 | **Accessibility audit** — ARIA labels, keyboard navigation for all modals, screen reader support, high-contrast mode. | M | All UI files (add `aria-*` attributes, focus management) |
| 4.4 | **POS analytics overlay** — Small live counter on POS: today's bills count, today's revenue, items sold. Updates on each bill. | S | `App.tsx` (add mini stats bar in POS view, update on finalize) |
| 4.5 | **Customer display** — Second screen support via Electron `BrowserWindow`. Shows current bill items and total to customer-facing display. | L | `electron/main.ts` (create second window on external monitor), new `CustomerDisplay.tsx` (simplified bill view) |
| 4.6 | **Barcode label printing** — Print barcode/QR labels from ProductsPanel. Select products → generate label sheet → print to label printer. | M | New `LabelPrintModal.tsx`, `ProductsPanel.tsx` (add "Print labels" batch action) |
| 4.7 | **Voice amount entry** — "Ek hazaar paanch sau" → 1500 — Web Speech API for amount fields. Useful for shopkeepers who prefer speaking over typing. | L | New `useVoiceInput.ts` hook, integrate into payment amount fields |

---

## 3. Phase 1 Quick-Win Breakdown (1–2 week sprint)

Priority order for maximum impact in minimum time:

### Week 1 (must-ship)

1. **Day 1:** API URL to prefs (0.1) + theme fixes for InvoicesPanel (0.5) — 2 hours each
2. **Day 1–2:** Held bill restore (0.3) — the most embarrassing gap vs competitors
3. **Day 2:** Return search by invoice number (0.4) — second most common complaint
4. **Day 2–3:** Cart line editing (1.8) — can't change qty is a showstopper
5. **Day 3:** Keyboard shortcuts (1.1) — makes demos impressive immediately
6. **Day 3:** Global barcode capture (1.7) — scanners must work even when input unfocused
7. **Day 4:** Thermal reprint (1.3) — one-button feature, high perceived value
8. **Day 4:** Cash drawer kick (1.4) — simple ESC/POS append, "wow it opens the drawer!"
9. **Day 5:** Sync health badge (1.6) — replaces confusing text status

### Week 2 (polish)

10. **Day 6:** Printer settings UI (1.5) — currently requires env vars, bad UX
11. **Day 6–7:** Notes field + remaining theme fixes (1.9, 0.6, 0.7, 0.8)
12. **Day 7–8:** IGST fix (0.2) — important for shops selling inter-state
13. **Day 8–9:** Cashier PIN (1.2) — moderate effort but huge perceived professionalism
14. **Day 10:** Integration testing of all Phase 0+1 features together

---

## 4. Risks & API Dependencies

### Hard API Dependencies (Desktop blocked without these)

| Desktop Feature | Required API Endpoint | Status |
|---|---|---|
| Return by invoice number | `GET /invoices?search=INV-xxx` or `GET /invoices?invoiceNumber=xxx` | **Likely exists** — InvoicesPanel already searches |
| Return by IMEI | `GET /invoices?serial=xxx` | **Needs API work** — serial search on invoices |
| IGST calculation | Seller state from `GET /tenants/profile` | **Likely exists** — tenant has GSTIN |
| Thermal reprint | `POST /hardware/print-thermal` with `invoiceId` | **Exists** — already used on finalize |
| Warranty card gen | `POST /invoices/:id/warranty-cards` | **Needs API work** |
| Serial search | `GET /products/serials/search?q=` | **Needs API work** |
| Stock adjustment | `POST /inventory/adjustments` | **Likely exists** — inventory module present |
| Product archive | `PATCH /products/:id { archived: true }` | **Needs API work** — soft delete not in schema |
| Purchase price / MRP | Product model fields `purchasePrice`, `mrp` | **Needs API + schema** — not in Prisma schema today |
| Day-end report | `POST /reports/day-end` or `GET /reports/shift-summary` | **Needs API work** |
| EMI payment metadata | Extended payment model | **Needs API + schema** |
| Trade-in at POS | `/tradein` endpoints | **Exists** — tradein module present |

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Offline stock accuracy** | If two devices sell same IMEI offline, sync conflict | Implement optimistic lock on serials; sync marks conflict, human resolves |
| **PIN security** | PIN stored locally, anyone with DB access can read | Hash with bcrypt, never store plaintext. PIN is convenience, not security — token still expires |
| **Large catalog sync** | 5000+ products take long to sync | Paginate pull, delta sync (only changed since last pull), background sync in main process |
| **COM port detection** | Windows COM ports are unpredictable (Bluetooth SPP especially) | Add "detect printers" button that lists available ports, test print to verify |
| **Electron update path** | Auto-updater requires code signing on Windows | Budget for code signing cert (~$100/yr); without it, Windows SmartScreen blocks |
| **Theme-agnostic UI** | Any new UI component must work across 12 themes (2 dark) | Create `ThemeTest` dev tool that cycles through all themes. Add to CI. |

---

## 5. Verification Plan

### Phase 0 — Automated

```
[ ] Unit test: calculateInvoice with different state codes → IGST when states differ
[ ] Unit test: restore held bill → cart state matches original bill
[ ] Visual regression: screenshot each panel in 4 themes (2 light, 2 dark)
[ ] E2E: hardcoded API_URL string does not appear in built JS
```

### Phase 1 — Manual Checklist (Demo Script)

```
[ ] Cold start → PIN pad → enter PIN → POS loads in <2s
[ ] Scan barcode (input unfocused) → beep → product in cart
[ ] Press F2 → browse modal. Press Escape → closes. Press F12 → finalize
[ ] Ctrl+/ → shortcut cheat sheet overlay
[ ] Add 3 items → edit qty of item 2 to 5 → discount ₹100 on item 3 → totals correct
[ ] Hold bill → switch to Held tab → Restore → cart has all lines
[ ] Finalize → thermal prints → cash drawer kicks → WhatsApp toast shows
[ ] Go to Bills tab → find invoice → click Reprint → receipt prints
[ ] Return tab → type "INV-2026-001" → lines load → select 1 item → create credit note
[ ] Settings → Printer → enter COM5 → Test Print → receipt prints
[ ] Sync badge shows "Last synced 2 min ago · 0 pending"
```

### Phase 2 — Feature-Level

```
[ ] Product delete: deleted product not in POS catalog
[ ] Archive: archived product greyed in ProductsPanel, absent from POS
[ ] Serial search: find IMEI → shows product + status + linked invoice
[ ] Warranty: finalize serial sale → warranty card generated → printable
[ ] Stock adjust: -3 units → stock decrements → movement in API
[ ] CSV import: 50 rows → preview correct → import → all created
[ ] Customer quick-add: new customer → auto-selected in bill
```

### Phase 3 — Integration

```
[ ] Multi-tab: 3 bills open → switch between → each has independent state
[ ] Trade-in: net payable = new item - trade-in value
[ ] Day-end: matches API totals ± ₹1 rounding
[ ] Full offline: disconnect → sell 10 items with serials → reconnect → all sync
[ ] Conflict: two devices sell same IMEI → conflict shown → human resolves
```

---

## 6. Architecture Notes

### File Inventory (current)

```
apps/desktop/
├── electron/
│   ├── main.ts          # Electron main process, IPC handlers, thermal print
│   ├── preload.ts       # Context bridge (window.retailSarathi)
│   ├── database.ts      # SQLite schema, CRUD, outbox
│   └── sync.ts          # Push/pull sync with API
├── src/
│   ├── App.tsx           # 1400-line monolith — POS, cart, login, held, returns
│   ├── InvoicesPanel.tsx # Billing history with filters, detail modal
│   ├── ProductsPanel.tsx # CRUD product list
│   ├── PartiesPanel.tsx  # Read-only khata (payables + receivables)
│   ├── StatsPanel.tsx    # Dashboard cards + charts
│   ├── SettingsPanel.tsx # Theme/layout/printer prefs
│   ├── FloatingCalculator.tsx
│   ├── NavIcons.tsx
│   ├── ThemedSelect.tsx
│   ├── BrandMark.tsx
│   ├── types.ts          # LocalProduct + window.retailSarathi typings
│   └── theme/
│       ├── prefs.ts       # 12 themes, 5 layouts, 8 invoice templates, prefs types
│       └── useDesktopPrefs.ts
```

### Key Refactoring Recommendations

1. **Break up `App.tsx`** (1400 lines) — Extract:
   - `PosTab.tsx` — barcode, catalog, cart, payments, totals, finalize (lines 951–1188)
   - `HeldTab.tsx` — held bills list + restore + finalize (lines 870–892)
   - `ReturnsTab.tsx` — return lookup + credit note (lines 894–949)
   - `SerialPickerModal.tsx` — IMEI selection modal (lines 1334–1402)
   - `ProductBrowseModal.tsx` — browse/filter modal (lines 1190–1332)
   - `useCart.ts` — cart state management hook (cart, addToCart, payments, totals)
   - `useAuth.ts` — login, token, online/offline status
   - `api.ts` — `apiFetch` function + `API_URL` config (used by all panels)

2. **Shared `api.ts`** — `PartiesPanel` has its own `API_URL` constant and raw `fetch` calls. All API calls should go through a single `apiFetch` with the configured URL.

3. **Theme compliance** — `InvoicesPanel`, `ProductsPanel`, `StatsPanel`, `PartiesPanel` all use hardcoded Tailwind colors (`bg-teal-700`, `text-slate-*`). Must migrate to CSS custom properties for theme support.

---

## 7. Summary Decision Matrix

| What | Desktop? | Web? | Both? |
|---|---|---|---|
| Billing / POS | **Primary** | View-only | — |
| Thermal print / drawer | **Exclusive** | — | — |
| Barcode scan / IMEI pick | **Primary** | Fallback | — |
| Returns / credit note | **Primary** | Also | Both |
| Product CRUD | Basic | **Full** | Both |
| Khata / party ledger | Read-only | **Full** | — |
| GRN / purchase entry | — | **Exclusive** | — |
| Reports / GST filing | — | **Exclusive** | — |
| Analytics / stats | Summary | **Full** | — |
| Settings / themes | Desktop prefs | Web prefs | Separate |
| Staff / branches | — | **Exclusive** | — |
| E-invoice / compliance | — | **Exclusive** | — |
| Repair job cards | Status badge | **Full** | — |
| Warranty card view | Print trigger | **Full** | — |
