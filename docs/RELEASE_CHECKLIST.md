# AVANA MVP — Production Release & Deployment Checklist

This document details the release and operational checklist for deploying the AVANA platform to production.

---

## 1. Environment & Configuration Audit

- [ ] **NODE_ENV**: Set to `production`.
- [ ] **DATABASE_URL**: Set to a production-grade PostgreSQL instance (with SSL enabled, e.g., `sslmode=require`).
- [ ] **REDIS_URL**: Set to a production Redis instance (TLS enabled, password protected).
- [ ] **AVANA_CORS_ORIGIN**: Restrict to authorized production domain(s) only (e.g. `https://app.avana.ai`).
- [ ] **AVANA_API_HOST**: Set to `0.0.0.0` or container network interface.
- [ ] **AVANA_API_PORT**: Set to the appropriate application port (default `3000`).
- [ ] **AI_PROVIDER**: Set to desired production model provider (or `mock` for staging).
- [ ] **Secrets & Keys**: Ensure no production secrets or credentials exist in codebase or `.env` files.

---

## 2. Database & Migrations

- [ ] Run pending migrations: `npm run db:migrate`
- [ ] Verify migration status: Ensure migrations `0001` through `0009` are applied cleanly.
- [ ] **Seed Guard**: Confirm development seed script (`npm run db:seed`) is NOT executed in production (`seed.ts` automatically aborts if `NODE_ENV=production`).

---

## 3. Background Workers & Queues

- [ ] Deploy worker instance: `npm run dev --workspace=@avana/worker` or `node apps/worker/dist/index.js`.
- [ ] Verify Redis connection: Confirm BullMQ worker connects to `AI_GENERATION_QUEUE` (`content_generate`).
- [ ] Confirm graceful shutdown handling (`SIGTERM`/`SIGINT`).

---

## 4. Verification & Build Baseline

- [ ] **Type Check**: `npm run type-check` (Must complete with 0 errors).
- [ ] **Lint**: `npm run lint` (Must complete with 0 warnings and 0 errors).
- [ ] **Automated Tests**: `npm test` (Must pass 60+ test files / 485+ tests).
- [ ] **Production Build**: `npm run build` (Must complete without build errors).

---

## 5. Security & Isolation Verification

- [ ] **Authentication**: Cookies configured with `secure: true` and `sameSite: "lax"`.
- [ ] **Authorization**: Role-based access policy enforced across all endpoints.
- [ ] **Tenant Isolation**: Org-scoped lookups enforced; un-owned/cross-tenant resources return HTTP 404 non-disclosure.
- [ ] **Header Redaction**: `authorization`, `cookie`, `set-cookie` headers redacted from server logs.
- [ ] **Rate Limiting**: Rate limiter enabled (`@fastify/rate-limit`).

---

## 6. Health & Observability

- [ ] Probe `/health` endpoint: Returns HTTP 200 `{ "status": "ok" }`.
- [ ] Probe `/readiness` endpoint: Returns HTTP 200 `{ "status": "ready", "database": "connected" }`.
- [ ] Log aggregation: Verify pino structured logs are streaming to stdout/stderr.

---

## 7. Rollback Considerations

- [ ] Database backup taken prior to migration deployment.
- [ ] Previous container image tag preserved for instant rollback if health check fails.
