# Sample data invoices (from repo `sample data/`)

Golden text transcripts of the photos/webps in `sample data/` for stock-in extraction tests.

| File | Source image | Supplier |
|------|----------------|----------|
| `01-battery-trading.txt` | `1.webp` | Battery Trading Management |
| `02-agarwal-cine.txt` | `1704213522.webp` | Agarwal Cine World |
| `03-techguru-plus.txt` | `GST-Tax-Invoice-Format.webp` | TechGuruPlus |
| `04-raunaq-batteries.txt` | `IMG20260719214546` | Raunaq Batteries |
| `05-vakeel-battery.txt` | `IMG20260719214624` | Vakeel Battery Parts |
| `06-goel-enterprises.txt` | `IMG20260719214646` | Goel Enterprises |
| `07-shubh-traders-merged.txt` | `IMG20260719220921` + `20931` | Shubh Traders (2 pages) |

Raw OCR (noisy) also under `../sample-data-ocr/`.

```bash
node scripts/test-sample-data-deep.cjs
```
