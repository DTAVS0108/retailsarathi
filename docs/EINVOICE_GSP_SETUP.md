# E-invoice GSP setup (live IRN)

Set these in `apps/api/.env` and restart the API:

```env
EINVOICE_GSP_PROVIDER=cleartax
EINVOICE_GSP_HOST=https://api-sandbox.clear.in
EINVOICE_GSP_AUTH_TOKEN=your_cleartax_auth_token
EINVOICE_GSP_GSTIN=27AAAAA0000A1Z5
EINVOICE_ALLOW_DEMO=true
```

- With token + GSTIN → **live** IRN via ClearTax govt-compatible API (`POST /einv/v1/govt/api/Invoice/`).
- Without credentials → demo IRN (unless `EINVOICE_ALLOW_DEMO=false`).
- Status check: `GET /api/v1/compliance/einvoice/status`
- Generate: Compliance+ → Request e-invoice

Production host is usually `https://api.clear.in` (confirm with your GSP).
