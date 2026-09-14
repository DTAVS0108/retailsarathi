# RetailSarathi

Offline-first retail management platform for Indian electronics / mobile / repair shops.

**Desktop** (Electron + SQLite) · **Web** (Next.js) · **Mobile** (Flutter) · **API** (NestJS + PostgreSQL)

## Quick Start

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker) — uses port 5433 if 5432 is taken
docker compose up -d

# Run migrations + seed
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed

# Start all apps
npm run dev
```

| App | URL |
|-----|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| API docs | http://localhost:4000/api/docs |
| Desktop | Electron window (port 5173) |
| Mobile | `cd apps/mobile && flutter run` |

## Default Login (seed)

- Email: `owner@demo.retailsarathi.in`
- Password: `Demo@123`

## Production domain

| URL | App |
|-----|-----|
| https://retailsarathi.in | Web |
| https://api.retailsarathi.in | API |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for env vars, DNS, and WSL deploy notes.

Domain constants: `packages/types/src/domain.ts`.

## Flutter mobile

```bash
# API must be running on :4000
cd apps/mobile
flutter pub get
flutter run          # Android emulator → API at 10.0.2.2:4000
flutter run -d chrome
```

See [apps/mobile/README.md](apps/mobile/README.md).

## Project Structure

```
retail-sarathi/
├── apps/
│   ├── api/          # NestJS REST API
│   ├── web/          # Next.js marketing + dashboard
│   ├── mobile/       # Flutter Android / iOS / tablet
│   └── desktop/      # Electron POS (offline-first)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── gst-engine/   # GST calculation library
│   └── ui/           # Shared React components
└── docs/
    ├── BRAND.md
    ├── MVP_SCOPE.md
    └── PILOT_GUIDE.md
```

## License

Proprietary — RetailSarathi
