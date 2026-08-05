# Local Development Runbook

## Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 10.0.0

## Quick Start (Sprint 1.5 — In-Memory Stores)

In Sprint 1.5, the API uses in-memory stores for all data. No database is required.

```bash
# 1. Install dependencies
npm ci

# 2. Set up environment
cp apps/api/.env.example apps/api/.env

# 3. Start the API server (terminal 1)
cd apps/api && npm run dev

# 4. In a separate terminal, start the web app (terminal 2)
cd apps/web && npm run dev
```

The API server is available at `http://localhost:3000`.
The web app is available at `http://localhost:5173`.

## Docker Services (Optional — Sprint 2+)

The `infra/local/compose.yaml` file provides PostgreSQL and Redis for Sprint 2 production-like local development:

| Service    | Image       | Port | Purpose                     |
| ---------- | ----------- | ---- | --------------------------- |
| PostgreSQL | postgres:16 | 5432 | Transactional database      |
| Redis      | redis:7     | 6379 | Session cache / rate limits |

To use Docker services:

```bash
docker compose -f infra/local/compose.yaml up -d
npm run db:migrate
npm run db:seed
```

### Stopping services

```bash
docker compose -f infra/local/compose.yaml down
```

### Resetting data (destroys volumes)

```bash
docker compose -f infra/local/compose.yaml down -v
docker compose -f infra/local/compose.yaml up -d
```

## Database Migrations

### Generate a new migration

```bash
npm run db:generate
```

### Apply pending migrations

```bash
npm run db:migrate
```

### Open Drizzle Studio (GUI)

```bash
npm run db:studio
```

### Migration rules

- Review generated SQL before committing.
- Never edit an applied migration; create a corrective migration instead.
- Rehearse every migration against a fresh database before production.

## Running the API

```bash
# Development mode (with hot reload via tsx watch)
cd apps/api && npm run dev

# Production build
npm run build
cd apps/api && node dist/index.js
```

### How it works (Sprint 1.5)

When `NODE_ENV=development`, the API automatically loads a development composition root (`composeLocalDev.ts`) that wires all existing in-memory stores:

| Store               | Implementation              | Source                                           |
| ------------------- | --------------------------- | ------------------------------------------------ |
| `UserStore`         | `InMemoryUserStore`         | `modules/identity/test/in-memory-stores.ts`      |
| `SessionStore`      | `InMemorySessionStore`      | `modules/identity/test/in-memory-stores.ts`      |
| `OrganizationStore` | `InMemoryOrganizationStore` | `modules/organizations/test/in-memory-stores.ts` |
| `CourseStore`       | `InMemoryCourseStore`       | `modules/courses/test/in-memory-stores.ts`       |
| `AuditStore`        | `InMemoryAuditStore`        | `observability/test/in-memory-stores.ts`         |

Required environment variables (see `apps/api/.env.example`):

| Variable         | Description     | Default       |
| ---------------- | --------------- | ------------- |
| `NODE_ENV`       | Environment     | `development` |
| `AVANA_API_PORT` | API server port | `3000`        |
| `AVANA_API_HOST` | API server host | `127.0.0.1`   |

## Running the Web App

```bash
cd apps/web && npm run dev
```

The Vite dev server proxies `/v1/*` requests to `http://127.0.0.1:3000` (configured in `vite.config.ts`). The `AuthProvider` also falls back to `http://localhost:3000` when `window.location.hostname === 'localhost'`.

### Sign-in flow (local development)

1. Open http://localhost:5173/sign-in
2. Enter any email from `example.com` (e.g. `alice@example.com`)
3. The local identity adapter automatically provisions the user
4. The first user gets `organization_admin` role upon organization creation
5. Navigate to courses, create organizations and courses

## Validation Commands

Run all validation from the repository root:

```bash
# TypeScript type checking
npm run type-check

# Lint (ESLint)
npm run lint

# Run all tests (Vitest)
npm test

# Run tests in watch mode
npm run test:watch

# Production build
npm run build

# Secret scanning
npm run secrets

# Format check
npm run format:check

# Full validation pipeline
npm run type-check && npm run lint && npm test && npm run build && npm run secrets
```

## Common Troubleshooting

### "Missing required environment variable"

Copy `apps/api/.env.example` to `apps/api/.env` and fill in required values.

### PostgreSQL connection refused

Ensure Docker services are running:

```bash
docker compose -f infra/local/compose.yaml ps
```

### Port already in use

Check for existing processes on port 3000 or 5432:

```bash
lsof -i :3000
lsof -i :5432
```

### Migration fails

Ensure PostgreSQL is healthy and the database exists:

```bash
docker compose -f infra/local/compose.yaml exec postgres psql -U avana -d avana -c "SELECT 1"
```

### Tests are slow

Tests use in-memory stores by default and should be fast. If Docker-dependent tests are slow, ensure your Docker runtime is responsive.

### npm install errors

Clear npm cache and retry:

```bash
rm -rf node_modules package-lock.json
npm ci
```
