# RetailSarathi — 2-Week Pilot Guide

## Objective

Validate Phase 1 MVP with one real electronics/mobile/repair shop before Phase 2 rollout.

## Pre-Pilot Checklist

- [ ] PostgreSQL running (`docker compose up -d`)
- [ ] API seeded (`npm run db:seed`)
- [ ] Desktop POS installed on shop counter PC
- [ ] USB barcode scanner connected (keyboard wedge mode)
- [ ] Thermal printer connected (80mm)
- [ ] Demo products replaced with shop's actual inventory (CSV import or manual)

## Week 1 — Core Operations

| Day | Task | Success Metric |
|-----|------|----------------|
| 1 | Install desktop + login + scan 10 products | All products found by barcode |
| 2 | Bill 20 retail sales (cash + UPI) | Invoices print correctly |
| 3 | Test offline mode (disconnect WiFi, bill 5 sales) | Bills save locally, sync on reconnect |
| 4 | GST invoice review with shop owner | CGST/SGST correct for Maharashtra |
| 5 | Import full product catalog (50+ SKUs) | Stock counts match physical count |

## Week 2 — Extended Features

| Day | Task | Success Metric |
|-----|------|----------------|
| 6 | Create 3 repair job cards | Workflow transitions work |
| 7 | Send repair estimate via WhatsApp template | Customer receives message |
| 8 | Dealer wholesale bill with price list | Dealer price applied correctly |
| 9 | GSTR-1 export for current month | JSON validates |
| 10 | ITR prep summary review with CA | CSV export accepted |

## Feedback Collection

Track in a shared sheet:
- Billing speed (seconds per invoice)
- Scanner reliability (% failed scans)
- Sync conflicts (count + resolution time)
- Missing features (prioritized list)
- Crash/bug reports

## Go/No-Go Criteria for Phase 2

| Criteria | Target |
|----------|--------|
| Daily invoices without crash | 100+ |
| Offline sync success rate | > 98% |
| Owner satisfaction (1-5) | ≥ 4 |
| GST invoice accuracy | 100% sample check |
| Repair workflow completion | 3 jobs end-to-end |

## Support Contacts

- Technical: dev team via GitHub issues
- Training: 2-hour onboarding session on Day 1
- Escalation: owner WhatsApp group for blocking issues

## Post-Pilot Actions

1. Prioritize bug fixes from feedback
2. Replace demo data with production tenant
3. Plan Phase 2 features based on shop priority (wholesale vs repair vs notifications)
4. Schedule follow-up visit at Day 21
