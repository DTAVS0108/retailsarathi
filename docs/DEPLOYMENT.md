# RetailSarathi — Deployment

**Domain:** [retailsarathi.in](https://retailsarathi.in) (registered)

## Live URLs (production)

| Service | URL | Status |
|---------|-----|--------|
| **Web** | https://retailsarathi-web.vercel.app | ⏸ Pause with `vercel project pause` |
| **API** | https://api-production-167c5.up.railway.app | ⏸ Down with `railway down` |
| **API health** | `/api/v1/health` | Offline until you go up again |

After DNS (below): `https://retailsarathi.in` and `https://api.retailsarathi.in`

**Demo login:** `owner@demo.retailsarathi.in` / `Demo@123`  
**Admin:** `admin@retailsarathi.in` / `Admin@123`

| URL | Service |
|-----|---------|
| `https://retailsarathi.in` | Web (Next.js) |
| `https://www.retailsarathi.in` | Redirect → apex (optional) |
| `https://api.retailsarathi.in` | API (NestJS) |

Domain constants live in `packages/types/src/domain.ts`.

---

## Environment variables

### API (`apps/api/.env`)

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-secret>
REDIS_URL=redis://...
PORT=4000
CORS_ORIGIN="https://retailsarathi.in,https://www.retailsarathi.in"
PUBLIC_API_ORIGIN="https://api.retailsarathi.in"
```

### Web (`apps/web/.env` or Vercel dashboard)

```env
API_PROXY_TARGET=https://api.retailsarathi.in
NEXT_PUBLIC_API_ORIGIN=https://api.retailsarathi.in
NEXT_PUBLIC_SITE_URL=https://retailsarathi.in
```

### Mobile

Set API URL on login (or in app settings) to:

```
https://api.retailsarathi.in/api/v1
```

Constant: `ApiConfig.productionBaseUrl` in `apps/mobile/lib/config/api_config.dart`.

### Desktop

Settings → **API URL** → `https://api.retailsarathi.in/api/v1` for production tenants.

---

## GoDaddy DNS (required to use retailsarathi.in)

### Web (Vercel)

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

Configure in GoDaddy → Domains → retailsarathi.in → DNS.

### API (Railway)

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `api` | `u91jrhfp.up.railway.app` |
| **TXT** | `_railway-verify.api` | `railway-verify=a3249c712d33f61dfdf272ffdfdda4c2ba47d5042c4da069349a6b6fa0edfd05` |

After DNS propagates, update Vercel env `API_PROXY_TARGET` to `https://api.retailsarathi.in` and redeploy.

---

## Go up / go down (cloud on/off)

Use this when you want to **stop billing traffic** or **hide the demo** without deleting the project.

### Quick scripts (Windows)

```powershell
.\scripts\go-down.ps1   # prints exact commands
.\scripts\go-up.ps1     # prints exact commands
```

### Take offline (down)

| Layer | Command | What happens |
|-------|---------|--------------|
| **Web (Vercel)** | `npx vercel project pause retailsarathi-web` | Visitors see Vercel error page. Type project name to confirm. |
| **API (Railway)** | `npx @railway/cli service link api` then `npx @railway/cli down --service api --yes` | API URL returns 404; **Postgres stays running** (data kept, may still bill). |

Optional: remove Postgres in [Railway dashboard](https://railway.app) only if you no longer need production data.

### Bring back online (up)

| Layer | Command | Notes |
|-------|---------|-------|
| **API** | `npx @railway/cli service link api` → `npx @railway/cli up` | Rebuilds from repo `Dockerfile` / `railway.toml`. |
| **Web** | `npx vercel project resume retailsarathi-web` → `npx vercel deploy --prod` | Resume serves last prod build; redeploy if code/env changed. |
| **Seed (once)** | SSH tunnel + `npx ts-node prisma/seed.ts` | Only if DB is empty. See [go-up.ps1](../scripts/go-up.ps1). |

### Verify

```powershell
# Should fail / 404 when down
Invoke-RestMethod https://api-production-167c5.up.railway.app/api/v1/health
Invoke-WebRequest https://retailsarathi-web.vercel.app

# Should succeed when up
Invoke-RestMethod https://retailsarathi-web.vercel.app/api/v1/health
```

### Local dev (separate from cloud)

```powershell
docker compose up -d          # Postgres + Redis
npm run dev                   # web :3000 + api :4000
# stop local:
# Ctrl+C in dev terminals, then: docker compose stop
```

---

## Recommended production stack

| Layer | Suggestion |
|-------|------------|
| Web | **Vercel** (Next.js) |
| API | **Railway** or **Render** (NestJS + Docker) |
| Database | Managed Postgres (Railway, Supabase, Neon) |
| Redis | Upstash or Railway Redis |
| Mobile | Play Store / App Store builds pointing at production API |

---

## Can you deploy from WSL?

**Yes — with two different meanings:**

### 1. WSL as your dev & deploy workstation ✅ (recommended)

Use WSL2 on Windows to run the same stack you use today:

```bash
# In WSL (Ubuntu)
cd /mnt/c/Users/.../RetailSarathi   # or clone inside ~/projects
docker compose up -d
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

Then deploy to cloud from WSL:

- `vercel deploy` (web)
- `railway up` / Render Git deploy (API)
- `flutter build apk` (mobile)

This works well. Node, Docker, and Flutter all run fine in WSL2.

**Tips**

- Keep the repo on the Linux filesystem (`~/RetailSarathi`) for faster I/O, not `/mnt/c/...`.
- Docker Desktop → **Settings → Resources → WSL integration** → enable your distro.
- From Windows browser, use `http://localhost:3000` — WSL forwards ports automatically.

### 2. WSL as the production server on your home PC ⚠️ (possible, not ideal)

You *can* run API + Postgres + nginx on WSL and expose `retailsarathi.in` via:

- **Cloudflare Tunnel** (no port forwarding, free HTTPS), or
- Router port-forward 80/443 → Windows → WSL IP

**Downsides:** PC must stay on 24/7, backups and security are on you, uploads disk on your machine, no auto-scaling.

Good for **staging / demo**, not ideal as primary SaaS hosting.

### 3. What does not run in WSL

- **Electron desktop POS** — build/run on **Windows** (native printers, COM ports, Bluetooth SPP).
- **Android emulator** — use Windows or WSL with Android Studio; physical device testing is easier from Windows.

---

## Quick production checklist

1. [x] Deploy API (Railway)
2. [x] Deploy web (Vercel)
3. [x] Set production env vars
4. [x] Schema pushed + demo account registered
5. [ ] **GoDaddy DNS** (see above) — required for `retailsarathi.in`
6. [ ] Test login at https://retailsarathi.in after DNS
7. [ ] Enable GoDaddy auto-renew
