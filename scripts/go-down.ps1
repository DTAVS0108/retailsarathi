# RetailSarathi — take production offline (Windows PowerShell)
# Run from repo root: .\scripts\go-down.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "`n=== RetailSarathi go-down ===" -ForegroundColor Cyan
Write-Host "Stops public traffic. Postgres on Railway stays up (data preserved; may still bill).`n"

Write-Host "Step 1 — Pause Vercel web (interactive)" -ForegroundColor Yellow
Write-Host "  npx vercel project pause retailsarathi-web"
Write-Host "  Type the project name when prompted.`n"

Write-Host "Step 2 — Remove Railway API deployment" -ForegroundColor Yellow
Write-Host @"
  npx @railway/cli service link api
  npx @railway/cli down --service api --yes
"@

Write-Host "Step 3 — Verify offline" -ForegroundColor Yellow
Write-Host @"
  https://retailsarathi-web.vercel.app          -> error / paused page
  https://api-production-167c5.up.railway.app   -> 404 / unreachable
"@

Write-Host "Optional — stop Postgres too (deletes live DB unless you backup first):" -ForegroundColor DarkYellow
Write-Host "  Railway dashboard -> Postgres service -> Settings -> Remove service`n"

Write-Host "Full guide: docs/DEPLOYMENT.md`n" -ForegroundColor Green
