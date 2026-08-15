# AVANA Monorepo Platform

AVANA is a multi-tenant, AI-assisted learning platform designed to turn course material (documents, PDFs, text) into cited, personalized study experiences including interactive lessons, flashcard review queues (spaced repetition), practice quizzes, study analytics, and actionable session recommendations.

---

## Architecture & Workspaces

AVANA is structured as a TypeScript monorepo using npm workspaces:

- **`apps/web`**: React 19 + Vite frontend application (Course catalog, Learning Hub, Flashcard reviewer, Quiz engine, Study Analytics, Document Uploader, Course Manager, Content Review Queue).
- **`apps/api`**: Fastify 5 REST API (Authentication, Organizations, Courses, Documents, AI Generation, Content Review, Materialization, Study Consumption & Analytics).
- **`apps/worker`**: BullMQ background worker for asynchronous AI document processing and generation jobs.
- **`database`**: Drizzle ORM schema, PostgreSQL migrations (`0001`–`0009`), and idempotent development seed script.
- **`packages/domain`**: Framework-independent domain logic, entity primitives, domain errors, and authorization policy matrix (`p.require(...)`).
- **`packages/contracts`**: Shared TypeScript types and API error envelopes (`ErrorEnvelope`).
- **`packages/config`**: Shared configuration utilities.
- **`packages/ui`**: Shared UI component library.

---

## Prerequisites

- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **PostgreSQL**: `15+` (or Docker Compose)
- **Redis**: `7+` (or Docker Compose)

---

## Quick Start (Development Setup)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### 3. Start Local Infrastructure (PostgreSQL & Redis)

Using Docker Compose:

```bash
docker compose -f infra/local/compose.yaml up -d
```

### 4. Run Database Migrations & Seed Data

```bash
# Run database migrations
npm run db:migrate

# Seed synthetic local development data
npm run db:seed
```

### 5. Start Development Servers

```bash
# Start API backend (runs on http://127.0.0.1:3000)
npm run dev --workspace=@avana/api

# Start Web frontend (runs on http://localhost:5173)
npm run dev --workspace=@avana/web

# (Optional) Start Background Worker
npm run dev --workspace=@avana/worker
```

---

## Verification & Quality Baseline

Run the complete monorepo verification suite:

```bash
# Type check across all workspaces
npm run type-check

# ESLint linting across all files
npm run lint

# Unit & Integration test suite (Vitest)
npm test

# Production build across all workspaces
npm run build
```

---

## Deployment & Release Checklist

For production deployment instructions, environment variable references, and release verification steps, consult [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

---

## Known MVP Limitations & Scope

- **AI Provider**: Uses `MockModelGateway` by default for deterministic local generation. Production LLM providers (OpenAI, Anthropic, Gemini) can be configured via `AI_PROVIDER`.
- **Storage**: Default document storage uses local filesystem directory `./storage/uploads`. S3/cloud storage driver hooks exist in `@avana/api`.
