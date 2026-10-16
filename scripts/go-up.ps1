# RetailSarathi — bring production back online (Windows PowerShell)
# Run from repo root: .\scripts\go-up.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "`n=== RetailSarathi go-up ===" -ForegroundColor Cyan
Write-Host "Domain: retailsarathi.in / api.retailsarathi.in`n"

Write-Host "Step 1 — Log in (if needed)" -ForegroundColor Yellow
Write-Host "  npx @railway/cli login"
Write-Host "  npx vercel login`n"

Write-Host "Step 2 — Deploy API to Railway" -ForegroundColor Yellow
Write-Host @"
  npx @railway/cli service link api
  npx @railway/cli up
"@

Write-Host "Step 3 — Resume Vercel web" -ForegroundColor Yellow
Write-Host "  npx vercel project resume retailsarathi-web"
Write-Host "  npx vercel deploy --prod`n"

Write-Host "Step 4 — Reseed only if DB is empty" -ForegroundColor Yellow
Write-Host @"
  npx @railway/cli connect Postgres --tunnel-only --port 55434
  # new terminal:
  cd apps/api
  `$env:DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:55434/railway"
  npx ts-node prisma/seed.ts
"@

Write-Host "Step 5 — Verify online" -ForegroundColor Yellow
Write-Host @"
  https://api-production-167c5.up.railway.app/api/v1/health
  https://retailsarathi-web.vercel.app/api/v1/health
  Demo login: owner@demo.retailsarathi.in / Demo@123
"@

Write-Host "Full guide: docs/DEPLOYMENT.md`n" -ForegroundColor Green
