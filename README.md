# AVANA

AVANA is a multi-tenant, AI-assisted learning platform designed to transform raw course material (documents, PDFs, text) into cited, personalized study experiences—including interactive lessons, spaced repetition flashcards, practice quizzes, study analytics, and actionable session recommendations.

---

## Features

- **Document Ingestion & Text Extraction**: Upload course materials (PDF, DOCX, PPTX, TXT) with automatic extraction and text quality analysis.
- **AI-Powered Content Generation**: Asynchronously generate structured lessons, flashcards, and quizzes cited directly from source material.
- **Multi-Provider LLM Gateway**: Pluggable AI generation supporting Google Gemini, GapGPT (OpenAI-compatible), Groq, ArvanCloud, Cloudflare Workers AI, and a deterministic Mock provider with configurable fallback execution.
- **Human-in-the-Loop Content Review**: Review queue allowing educators and admins to inspect, edit, approve, or reject AI-generated content before materialization into course modules.
- **Interactive Learning & Spaced Repetition**: Course reading views, active recall flashcard review sessions with reaction time tracking, and customizable practice quizzes with option shuffling.
- **Study Analytics & Progress Tracking**: Real-time tracking of study sessions, retention metrics, and completion analytics.
- **Multi-Tenant Organization & Course Hierarchy**: Role-based access control (Platform Admin, Org Admin, Teacher, Student) with granular domain authorization policies.
- **Course Library & Content Packs**: Export and import modular course content packs with search, categorization, and Persian localization support.

---

## Architecture

AVANA is architected as a TypeScript monorepo with clear separation between user interfaces, REST APIs, asynchronous background workers, shared domain rules, and data layers:

```
├── apps/
│   ├── api/        # Fastify 5 REST API (Authentication, Courses, Documents, AI Generation, Admin)
│   ├── web/        # React 19 + Vite frontend application (Learning Hub, Flashcards, Quiz, Admin)
│   └── worker/     # BullMQ background worker for asynchronous AI generation jobs
├── packages/
│   ├── contracts/  # OpenAPI 3.1 specifications and shared TypeScript contract definitions
│   ├── domain/     # Framework-agnostic business logic, entity primitives, and authorization policies
│   ├── config/     # Centralized monorepo environment loader and configuration helpers
│   └── ui/         # Shared UI components and primitives
├── database/       # Drizzle ORM schema, PostgreSQL migrations, and idempotent seed scripts
├── infra/          # Infrastructure configurations (Local Docker Compose for PostgreSQL & Redis)
└── docs/           # Architecture Decision Records (ADRs), specs, and operational runbooks
```

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons
- **Backend API**: Fastify 5, TypeScript
- **Background Processing**: BullMQ, Redis 7
- **Database & ORM**: PostgreSQL 16, Drizzle ORM
- **AI Integrations**: Google Gemini, GapGPT, Groq, ArvanCloud, Cloudflare Workers AI
- **Testing & Quality**: Vitest, React Testing Library, ESLint 9, Secretlint, TypeScript

---

## Prerequisites

Ensure you have the following installed locally:

- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **Docker & Docker Compose** (for running PostgreSQL and Redis)

---

## Installation & Setup

### 1. Clone the Repository & Install Dependencies

```bash
git clone <repository-url>
cd avana-landing-and-onboarding
npm install
```

### 2. Configure Environment Variables

Create a local `.env` file from the provided reference template:

```bash
cp .env.example .env
```

Adjust the configuration settings in `.env` as required for your local setup.

> [!NOTE]
> For local development, sensible defaults are pre-configured for PostgreSQL and Redis. To enable live AI generation, provide your API key (e.g. `GEMINI_API_KEY`) or use the default deterministic `mock` gateway.

### 3. Start Local Infrastructure

Start PostgreSQL 16 and Redis 7 via Docker Compose:

```bash
docker compose -f infra/local/compose.yaml up -d
```

### 4. Run Database Migrations & Seed Data

```bash
# Apply database schema migrations
npm run db:migrate

# Seed synthetic development data (sample organizations, courses, and accounts)
npm run db:seed
```

---

## Running the Project

Run each service in separate terminal sessions or background processes:

```bash
# 1. Start the API Backend (http://127.0.0.1:3000)
npm run dev --workspace=@avana/api

# 2. Start the Web Frontend (http://127.0.0.1:5173)
npm run dev --workspace=@avana/web

# 3. (Optional) Start the Background Generation Worker
npm run dev --workspace=@avana/worker
```

---

## Development & Quality Assurance

Run the quality and verification commands across the monorepo:

```bash
# Type-check TypeScript across all workspaces
npm run type-check

# Lint source files with ESLint
npm run lint

# Run unit and integration tests with Vitest
npm test

# Scan codebase for accidental secrets with Secretlint
npm run secrets

# Build production bundles across all packages and apps
npm run build
```

---

## Security

- **Never commit `.env` files, API keys, tokens, passwords, or production credentials to source control.**
- Ensure all sensitive variables are kept in local `.env` files (which are ignored by Git) or managed securely through your deployment environment secret manager.

