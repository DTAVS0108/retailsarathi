# Sample supplier bills for stock-in / scan testing

Use these on **Dashboard → Stock-in from Invoice** (upload or paste).

| File | Format | What it covers |
|------|--------|----------------|
| `../demo-supplier-invoice.txt` | Plain GST table | Canonical battery/inverter bill |
| `01-slno-mobile-gst.txt` | Sl.No. + GST | Mobiles / accessories |
| `02-pipe-battery.txt` | Pipe `\|` columns | Battery/inverter wholesale |
| `03-csv-simple.csv` | CSV | Spreadsheet export |
| `04-ocr-noisy.txt` | Noisy OCR | Spaced GSTIN, INV0ICE typos, comma amounts |
| `05-tab-units.txt` | Tab + units | pcs/nos columns |
| `06-discount-column.txt` | Qty/Rate/Disc/Amount | Discount % column |
| `07-excel-battery.xlsx` | Excel | Server-side xlsx parse |
| `08-multipage-p1.txt` + `08-multipage-p2.txt` | Two pages | Upload p1, then **Add another page** with p2 |
| `real/shubh-traders-358-p1.png` + `p2.png` (+ `.txt`) | Real Tally e-invoice | Shubh Traders Inv 358 — 6 Luminous lines on p1, tax/totals on p2 |

**Multi-page bills:** Upload/capture page 1 → tap **Add another page** for each extra page → check `----- PAGE N -----` markers in the text box → **Parse full bill text** → fix lines → Confirm.

Real bill smoke test:

```bash
node scripts/test-shubh-multipage.cjs
```

Run automated checks:

```bash
node scripts/test-bill-extraction.cjs
```
