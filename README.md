# AVANA

AVANA is an AI-assisted study platform designed to turn student-owned course material into cited, personalized study actions. The current application is a frontend prototype. It does not yet include a backend, authentication, persistence, document processing, or AI services.

## Architecture and delivery status

The approved production direction is documented in [Technical Blueprint](docs/TECHNICAL_BLUEPRINT.md). The active Sprint 1 scope is documented in [Sprint 1 Implementation Plan](docs/SPRINT_01_IMPLEMENTATION_PLAN.md). Architectural decisions are recorded in [ADRs](docs/adr/).

Sprint 1 PR 2 establishes the npm workspace and application/package boundaries. The API, worker, contracts, domain, configuration, and UI workspaces are placeholders only; later dependency-ordered PRs own their runtime behavior and implementation.

## Workspace

- `apps/web`: existing Vite prototype
- `apps/api`: API placeholder; HTTP composition begins in PR 5
- `apps/worker`: worker placeholder; no jobs are registered
- `packages/contracts`: contract export boundary; contracts begin in PR 4
- `packages/domain`: framework-independent domain boundary; primitives begin in PR 4
- `packages/ui`: shared UI export boundary; no components have been migrated
- `packages/config`: shared configuration export boundary

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer

### Run locally

```bash
npm install
npm run dev:web
```

### Verify the workspace

```bash
npm run build
npm run format:check
npm run lint
npm run secrets
npm run type-check
npm run test:coverage
npm run build --workspace=@avana/web
```

Quality gates are enforced locally and in CI. `npm run format` formats tracked files; `npm run format:check`, `npm run lint`, `npm run secrets`, `npm run type-check`, and `npm run test:coverage` are verification commands. Coverage is reported without a threshold until baseline suites grow. The versioned pre-commit hook formats staged files, lints staged TypeScript, and scans the repository for secrets after `npm install`.

## Contribution

Read [Contributing](docs/CONTRIBUTING.md) before making a change. Use synthetic data only, do not commit secrets or personal data, and keep work within the active sprint task.

## Local platform services

PostgreSQL, Redis, API runtime behavior, worker jobs, and environment configuration are intentionally not present yet. ADR 0004 establishes the future local-development policy; PR 6 will implement the local services. Do not introduce local services, cloud accounts, credentials, or external production integrations in advance of their scheduled work.
