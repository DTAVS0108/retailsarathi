# RetailSarathi — production deploy helper (Windows PowerShell)
# Run from repo root: .\scripts\go-live.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "`n=== RetailSarathi go-live ===" -ForegroundColor Cyan
Write-Host "Domain: retailsarathi.in / api.retailsarathi.in`n"

Write-Host "Step 1 — Log in to hosting (browser opens)" -ForegroundColor Yellow
Write-Host "  Railway (API + Postgres):  npx @railway/cli login"
Write-Host "  Vercel (Web):              npx vercel login`n"

Write-Host "Step 2 — Deploy API to Railway" -ForegroundColor Yellow
Write-Host @"
  npx @railway/cli init --name retailsarathi-api
  npx @railway/cli add --database postgres
  npx @railway/cli variables set NODE_ENV=production JWT_SECRET=<random-64-chars> CORS_ORIGIN=https://retailsarathi.in,https://www.retailsarathi.in PUBLIC_API_ORIGIN=https://api.retailsarathi.in
  npx @railway/cli up
  npx @railway/cli domain  # add api.retailsarathi.in
"@

Write-Host "Step 3 — Seed production DB (once API is up)" -ForegroundColor Yellow
Write-Host "  npx @railway/cli run npm run db:seed -w @retail-sarathi/api`n"

Write-Host "Step 4 — Deploy Web to Vercel" -ForegroundColor Yellow
Write-Host @"
  cd apps/web
  npx vercel link
  npx vercel --prod
  npx vercel domains add retailsarathi.in
"@

Write-Host "Step 5 — GoDaddy DNS" -ForegroundColor Yellow
Write-Host "  @     -> Vercel (A/ALIAS from Vercel dashboard)"
Write-Host "  www   -> cname.vercel-dns.com"
Write-Host "  api   -> Railway CNAME target`n"

Write-Host "Full guide: docs/DEPLOYMENT.md`n" -ForegroundColor Green
