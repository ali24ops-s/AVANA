# Sprint 1 — Gap Summary & Implementation Backlog

This file is a deterministic regeneration of the Sprint 1 backlog by reconciling:

- `docs/SPRINT_01_IMPLEMENTATION_PLAN.md`
- `docs/TECHNICAL_BLUEPRINT.md`
- ADRs `docs/adr/0001-backend-framework.md` through `docs/adr/0004-local-development-services.md`
- The current repository state (placeholders only for API/runtime, no DB/auth/courses/contract/web-shell integration yet)

## Traceability rules

- Each checklist item is traceable to one or more of the documents above OR to an identified placeholder state in the current repo.
- Items are grouped into PR-sized sections matching the Sprint 1 implementation plan.

---

## PR 1 — Architecture decisions and delivery conventions

### Gap checklist (Doc-to-code completeness)

1. **ADR set exists and is accepted**
   - Trace: `docs/adr/0001-...`, `0002-...`, `0003-...`, `0004-...`
   - Current status: Present; verify no additional delivery convention file missing.
2. **Contribution guidance exists for Sprint 1**
   - Trace: `docs/SPRINT_01_IMPLEMENTATION_PLAN.md` (files affected include `docs/CONTRIBUTING.md` and README notes)
   - Current status: `docs/CONTRIBUTING.md` exists.
3. **No additional PR-1 delivery artifacts required by documents**
   - Trace: PR 1 definition of done is “All four ADRs are approved; setup and contribution guidance is sufficient...”
   - Current status: ADRs approved; proceed to PR 2.

### Implementation note

- No code changes expected in PR 1; this PR is a documentation/decision gate.

---

## PR 2 — Monorepo and workspace foundation

### Gap checklist (status after verification)

1. **Confirm workspace scripts & boundaries match target layout**
   - Trace: PR 2 “Files affected: root package.json, lockfile, workspace configuration; move web into apps/web; create placeholders for api/worker; create shared package boundaries ...”
   - Current status: Repo contains `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/config`.
   - Verify: root scripts exist (`build`, `type-check`, `test`, `lint`, `format`, `secrets`) and workspaces are set to `apps/*` and `packages/*`.
   - **Status: COMPLETE (verified)**
2. **API and worker packages must be placeholders that type-check/build**
   - Trace: PR 2 step 3
   - Current status: `apps/api/src/index.ts` and `apps/worker/src/index.ts` exist and intentionally export `{}` with no runtime state.
   - **Status: COMPLETE (verified by file inspection)**
3. **Shared package boundaries exist**
   - Trace: PR 2 step 4
   - Current status: `packages/*/src/index.ts` exist (package entrypoints present).
   - **Status: COMPLETE (verified by package.json inspection)**
4. **No UI <-> API boundary violations**
   - Trace: Blueprint rule + `tools/eslint-boundaries`
   - Current status: `tools/eslint-boundaries/imports.test.ts` exists and passes in `npm test`.
   - **Status: COMPLETE (verified)**

### Definition of done mapping

- “Clean clone can install once and run web build/type-check through root scripts; no import crosses prohibited boundaries.”

---

## PR 3 — Quality, testing, and automation baseline

### Gap checklist

1. **ESLint boundaries rule enforced**
   - Trace: `tools/eslint-boundaries/*` and `eslint.config.js`
   - Current status: boundaries plugin wired and tests present.
2. **Secret scanning configured**
   - Trace: PR 3 implementation steps; root script `secrets` exists.
   - Current status: `secretlint` configured; `.secretlintrc.json` exists.
3. **Test runner baseline exists for web/API/domain**
   - Trace: PR 3 step 3/4 (minimal component test, pure domain rule test)
   - Current status: `apps/web/src/App.test.tsx`, `packages/domain/src/test/domain-rule.test.ts` exist.
4. **CI workflow exists**
   - Trace: PR 3 “Files affected: .github/workflows/ci.yml (new)”
   - Current status: CI file presence must be verified.
5. **PR template exists**
   - Trace: PR 3 “.github/pull_request_template.md (new)”
   - Current status: must be verified.

### Definition of done mapping

- “Every future PR has a consistent local and CI validation path.”

---

## PR 4 — API contract and shared domain primitives

### Gap checklist

1. **OpenAPI contract exists**
   - Trace: PR 4 “packages/contracts/openapi/v1.yaml (new)”
   - Current status: not present in current repo state listing; must be added.
2. **Contract generation/config present**
   - Trace: PR 4 “generated/client wrapper configuration”
   - Current status: not present.
3. **Domain primitives exist**
   - Trace: PR 4 “packages/domain/src/ids.ts, time.ts, errors.ts, roles.ts (new)”
   - Current status: only `index.ts` + tests exist; primitives missing.
4. **Contract validation/breaking-change scripts exist**
   - Trace: PR 4 step 5
   - Current status: not present.

---

## PR 5 — API application skeleton and operational conventions

### Gap checklist

1. **API server composition + config parsing exists**
   - Trace: PR 5 step 1
   - Current status: API placeholder likely lacks Fastify server composition.
2. **Request ID + structured logging + centralized error handler**
   - Trace: PR 5 step 2
   - Current status: not present.
3. **Unauthenticated health/readiness endpoints**
   - Trace: PR 5 step 3
   - Current status: not present.
4. **Versioned route namespace + standard error envelope**
   - Trace: PR 5 step 4
   - Current status: not present.
5. **In-process test harness**
   - Trace: PR 5 step 5
   - Current status: not present.

---

## PR 6 — Database, migrations, and local service runtime

### Gap checklist

1. **Local runtime config exists (Docker Compose)**
   - Trace: PR 6 step 1 + ADR 0004
   - Current status: missing `infra/local/compose.yaml`.
2. **Drizzle schema + migrations for identity/tenancy/course tables**
   - Trace: PR 6 step 2
   - Current status: missing.
3. **Migration tooling + rehearse guidance**
   - Trace: PR 6 step 3
   - Current status: missing.
4. **Scoped database access layer**
   - Trace: PR 6 step 4
   - Current status: missing.
5. **Synthetic seed framework (local/test only)**
   - Trace: PR 6 step 5
   - Current status: missing.

---

## PR 7 — Authentication and session boundary

### Gap checklist

1. **Identity adapter behind an interface**
   - Trace: PR 7 step 1 + ADR 0002
   - Current status: missing.
2. **Session endpoints + `GET /v1/me`**
   - Trace: PR 7 step 2
   - Current status: missing.
3. **Secure cookie configuration + CSRF strategy**
   - Trace: PR 7 step 3
   - Current status: missing.
4. **Create/link local user record on first verified identity**
   - Trace: PR 7 step 4
   - Current status: missing.
5. **Unauthenticated responses are non-disclosing and contract-consistent**
   - Trace: PR 7 step 5
   - Current status: missing.

---

## PR 8 — Authorization and tenancy policy

### Gap checklist

1. **Policy interface + tested roles**
   - Trace: PR 8 step 1/2 + Blueprint roles
   - Current status: missing.
2. **Organization creation + membership reads**
   - Trace: PR 8 step 3
   - Current status: missing.
3. **Organization-scoped resource lookups**
   - Trace: PR 8 step 4
   - Current status: missing.
4. **Audit-event helpers for mutations**
   - Trace: PR 8 step 5
   - Current status: missing.
5. **Negative/role-matrix tests**
   - Trace: PR 8 tests
   - Current status: missing.

---

## PR 9 — Course vertical slice

### Gap checklist

1. **Courses module with create/list/read/update/archive endpoints**
   - Trace: PR 9 step 1
   - Current status: missing.
2. **Domain validation + lifecycle transitions**
   - Trace: PR 9 step 2
   - Current status: missing.
3. **Ownership/membership transactionally**
   - Trace: PR 9 step 3
   - Current status: missing.
4. **Authorization enforced on every operation**
   - Trace: PR 9 step 4
   - Current status: missing.
5. **Audited course lifecycle events**
   - Trace: PR 9 step 5
   - Current status: missing.

---

## PR 10 — Web routing, authenticated shell, and typed API client

### Gap checklist

1. **React Router + route-level page boundaries**
   - Trace: PR 10 step 1
   - Current status: repo likely uses prototype navigation without router routing.
2. **Typed API client integration + TanStack Query**
   - Trace: PR 10 step 2
   - Current status: missing.
3. **Authenticated shell (session loading, signed-out state, sign-out)**
   - Trace: PR 10 step 3
   - Current status: missing.
4. **Course list/create UI from backend data**
   - Trace: PR 10 step 4
   - Current status: missing.
5. **Loading/empty/unauthorized/offline/recoverable error states**
   - Trace: PR 10 step 5
   - Current status: missing.
6. **Web tests for routing and auth/session/course states**
   - Trace: PR 10 tests
   - Current status: minimal App test exists, not Sprint 1 flow tests.

---

## PR 11 — Observability, audit events, and HTTP security baseline

### Gap checklist

1. **Structured logs with redaction**
   - Trace: PR 11 step 1
   - Current status: missing.
2. **Traces/metrics emission**
   - Trace: PR 11 step 2
   - Current status: missing.
3. **Security middleware baseline (headers/CORS/body limits/rate-limit)**
   - Trace: PR 11 step 3
   - Current status: missing.
4. **Immutable audit records for sign-in/out + membership + course mutations**
   - Trace: PR 11 step 4
   - Current status: missing.
5. **Runbooks/threat-model starter docs**
   - Trace: PR 11 step 5
   - Current status: missing.

---

## PR 12 — Sprint integration and release gate

### Gap checklist

1. **E2E critical path: migrate, run API, start web, authenticate, create/list/archive course, sign out, verify access denied**
   - Trace: PR 12 step 1/2
   - Current status: missing E2E suite.
2. **E2E test + fixtures using synthetic data**
   - Trace: PR 12 step 2
   - Current status: missing.
3. **Accessibility smoke test evidence**
   - Trace: PR 12 step 3
   - Current status: missing runbook/notes.
4. **Local runbook + Sprint 1 exit report**
   - Trace: PR 12 step 4/5
   - Current status: missing.
5. **CI updates and dependency scanning gate**
   - Trace: PR 12 step 4
   - Current status: depends on PR 3 CI baseline.

---

## Global Sprint 1 acceptance constraints

- Sprint 1 includes: secure foundation + closed MVP per Sprint 1 outcome.
- Non-goals: uploads/OCR/AI/embeddings/flashcards/quizzes/planner algorithms/billing/production rollout beyond local developer foundations.

---

## Checklist ownership

This file is the backlog used to drive implementation. Implementation will proceed in PR-sized order (PR 1 → PR 12) and stop once all items below are completed or blocked by missing upstream requirements.
