# RetailSarathi API — monorepo production image
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/gst-engine/package.json packages/gst-engine/
COPY packages/scan-engine/package.json packages/scan-engine/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

RUN npm ci

COPY packages ./packages
COPY apps/api ./apps/api
COPY turbo.json ./

RUN npm run build -w @retail-sarathi/types \
  && npm run build -w @retail-sarathi/gst-engine \
  && npm run build -w @retail-sarathi/scan-engine \
  && npm run build -w @retail-sarathi/ui \
  && npm run db:generate -w @retail-sarathi/api \
  && npm run build -w @retail-sarathi/api

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/gst-engine/package.json packages/gst-engine/
COPY packages/scan-engine/package.json packages/scan-engine/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/

RUN npm ci --omit=dev --workspace=@retail-sarathi/api --include-workspace-root

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/gst-engine/dist ./packages/gst-engine/dist
COPY --from=builder /app/packages/scan-engine/dist ./packages/scan-engine/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist

RUN mkdir -p apps/api/uploads

WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma db push && node dist/main.js"]
