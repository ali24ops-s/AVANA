# AVANA Sprint 1 — Implementation Plan

**Status:** Planned; no implementation authorized by this document  
**Sprint goal:** Establish the secure, testable platform foundation required before document upload and AI work.  
**Baseline:** `TECHNICAL_BLUEPRINT.md`, Phase 1 (Foundation and closed MVP).  
**Product-specification note:** A separate Product Specification was not found in this repository. This plan deliberately limits scope to the blueprint's unambiguous foundation requirements and must be reconciled with the Product Specification before development starts.

## Sprint outcome

At the end of Sprint 1, AVANA has a reproducible monorepo, protected quality gates, an API contract and application skeleton, a migration-backed local database, a safe authentication boundary, a course-domain vertical slice, and a shared error/observability convention. It does **not** include uploads, OCR, AI, embeddings, flashcards, billing, or production deployment.

## Scope and sequencing

|  PR | Task                                                   | Depends on |
| --: | ------------------------------------------------------ | ---------- |
|   1 | Architecture decisions and delivery conventions        | —          |
|   2 | Monorepo/workspace foundation                          | 1          |
|   3 | Shared quality, test, and Git hooks baseline           | 2          |
|   4 | API contract and shared domain primitives              | 2          |
|   5 | API application skeleton and operational conventions   | 3, 4       |
|   6 | Database, migrations, and local service runtime        | 4, 5       |
|   7 | Authentication/session boundary                        | 5, 6       |
|   8 | Authorization and tenancy policy                       | 6, 7       |
|   9 | Course vertical slice                                  | 4, 6, 8    |
|  10 | Web routing, authenticated shell, and typed API client | 2, 4, 7, 9 |
|  11 | Observability, audit events, and security headers      | 5, 7, 8, 9 |
|  12 | Sprint integration, documentation, and release gate    | 1–11       |

Each PR must be independently buildable and reviewable. Do not bundle dependency upgrades, visual redesign, upload work, or unrelated cleanup into these PRs.

---

## PR 1 — Architecture decisions and delivery conventions

**Objective:** Convert the blueprint's intentional choices into reviewable decisions so implementation does not begin with unresolved framework, identity, or environment assumptions.

**Files affected:**

- `docs/adr/0001-backend-framework.md` (new)
- `docs/adr/0002-authentication-provider-strategy.md` (new)
- `docs/adr/0003-database-and-migration-tool.md` (new)
- `docs/adr/0004-local-development-services.md` (new)
- `docs/CONTRIBUTING.md` (new)
- `README.md` (new or updated)

**Dependencies:** None.

**Implementation steps:**

1. Decide Fastify versus NestJS using agreed criteria: validation, OpenAPI generation, team familiarity, testability, and operational simplicity.
2. Decide managed identity versus an in-house session implementation, including ownership of email verification, recovery, MFA, and future SSO.
3. Choose Prisma or Drizzle and document migration review/rollback rules.
4. Define local dependencies (PostgreSQL and Redis), configuration ownership, required environment variables, and synthetic-data policy.
5. Document branch naming, pull-request template, code-owner/reviewer expectations, semantic commit policy if adopted, and the rule that all product changes need acceptance criteria.

**Tests:** Documentation review checklist; verify every decision identifies alternatives, consequences, owner, and revisit trigger.

**Definition of done:** All four ADRs are approved; setup and contribution guidance is sufficient for a new engineer to begin PR 2 without undocumented local knowledge.

## PR 2 — Monorepo and workspace foundation

**Objective:** Restructure the prototype into the target repository boundaries without changing current UI behavior.

**Files affected:**

- Root `package.json`, lockfile, workspace configuration (new)
- `apps/web/**` (move existing Vite application)
- `apps/api/package.json` and source placeholder (new)
- `apps/worker/package.json` and source placeholder (new)
- `packages/contracts/package.json` (new)
- `packages/domain/package.json` (new)
- `packages/ui/package.json` (new, no component migration required)
- Root TypeScript/build configuration (new or updated)
- `README.md`

**Dependencies:** PR 1.

**Implementation steps:**

1. Select the workspace tool documented in ADR 0001/0004 and establish root scripts for build, type-check, test, lint, and format.
2. Move the existing web project into `apps/web` while preserving its current build output and aliases.
3. Create minimal API/worker/package placeholders that can type-check and build but expose no business endpoints or jobs.
4. Create shared package boundaries with explicit package exports; do not add shared runtime state.
5. Update development instructions and remove obsolete root paths.

**Tests:** Root build; web production build; root type-check; verify the existing web application starts from its new location.

**Definition of done:** A clean clone can install once and run the web build/type-check through root scripts; no import crosses prohibited UI/API/infrastructure boundaries.

## PR 3 — Quality, testing, and automation baseline

**Objective:** Make quality checks mandatory before feature development creates untested platform behavior.

**Files affected:**

- Shared ESLint, Prettier, TypeScript, and editor configuration (new)
- Test runner configuration and test setup for web/API/domain packages (new)
- Example unit tests in `packages/domain` and `apps/web` (new)
- `.github/workflows/ci.yml` (new)
- `.github/pull_request_template.md` (new)
- `.gitignore`, `.env.example` files (new or updated)

**Dependencies:** PR 2.

**Implementation steps:**

1. Configure strict TypeScript, lint rules, formatting, import boundaries, and no-secret/no-console production rules.
2. Add unit-test tooling and coverage reporting; do not set a misleading coverage threshold until baseline suites exist.
3. Add a minimal component test and a pure domain-rule test as executable examples.
4. Configure CI to install deterministically and run format verification, lint, type-check, tests, and production web build.
5. Add PR checklist sections for accessibility, security, tests, schema/API compatibility, and observability.

**Tests:** Verify CI-equivalent commands locally; deliberately introduce and confirm detection of a lint/type/test failure during setup (not committed).

**Definition of done:** Every future PR has a consistent local and CI validation path; no actual secrets can be committed through documented configuration paths.

## PR 4 — API contract and shared domain primitives

**Objective:** Establish the typed, versioned boundary between the web app and backend before API implementation.

**Files affected:**

- `packages/contracts/openapi/v1.yaml` (new)
- `packages/contracts/src/**` generated/client wrapper configuration (new)
- `packages/domain/src/ids.ts`, `time.ts`, `errors.ts`, `roles.ts` (new)
- Contract validation/generation scripts (new)
- API contract documentation (new)

**Dependencies:** PR 2.

**Implementation steps:**

1. Define global API conventions: `/v1`, error envelope, request ID, pagination, timestamps, UUIDs, idempotency, and `202` job responses.
2. Specify only Sprint 1 resources: health/readiness, authentication session state, current user, organizations/memberships, and courses.
3. Define schemas for success/error responses and the minimal role set.
4. Generate a typed client or types from OpenAPI; prevent handwritten duplicates.
5. Add contract validation and breaking-change detection scripts.

**Tests:** OpenAPI lint/validation; generated client type-check; contract test that validates representative error and pagination examples.

**Definition of done:** API consumers can import one generated contract; every planned Sprint 1 endpoint has explicit inputs, outputs, authorization expectation, and error cases.

## PR 5 — API application skeleton and operational conventions

**Objective:** Deliver a secure, testable HTTP foundation with no product data yet.

**Files affected:**

- `apps/api/src/server/**` (new)
- `apps/api/src/config/**` (new)
- `apps/api/src/http/**` (new)
- `apps/api/src/routes/health.ts` (new)
- `apps/api/src/routes/v1.ts` (new)
- `apps/api/src/errors/**` (new)
- API environment example and run instructions

**Dependencies:** PR 3 and PR 4.

**Implementation steps:**

1. Create configuration parsing that fails fast for missing/invalid required values and never logs secrets.
2. Establish request IDs, structured logging, centralized error handling, JSON body limits, trusted proxy policy, and graceful shutdown.
3. Implement unauthenticated liveness/readiness endpoints from the OpenAPI contract.
4. Mount the versioned route namespace and return the standard error envelope for unknown/erroring routes.
5. Add a test harness that starts the API in-process and supports dependency injection.

**Tests:** Liveness/readiness success; invalid configuration startup failure; request ID propagation; unknown route/error-envelope test; graceful shutdown test.

**Definition of done:** API starts locally with documented configuration, has no unhandled errors in tests, and all HTTP failures follow the approved contract.

## PR 6 — Database, migrations, and local service runtime

**Objective:** Introduce durable data and reproducible local infrastructure without coupling application features to ad hoc schemas.

**Files affected:**

- `infra/local/compose.yaml` or equivalent local-runtime configuration (new)
- `apps/api/db/schema/**` and migration configuration (new)
- Initial migrations for identity/tenancy/course tables (new)
- `apps/api/src/database/**` (new)
- Seed/fixture framework using synthetic data only (new)
- Database operations documentation (new)

**Dependencies:** PR 4 and PR 5.

**Implementation steps:**

1. Add reproducible local PostgreSQL and Redis services with non-production credentials only.
2. Define initial tables: users, organizations, organization memberships, courses, course memberships, and audit logs; include UUID, timestamps, foreign keys, and uniqueness constraints.
3. Add migration creation, application, rollback/recovery guidance, and a database health dependency.
4. Implement a scoped database access layer; no route may execute unreviewed raw SQL except documented migrations.
5. Add synthetic seed data solely for local development and tests.

**Tests:** Fresh database migration; migration idempotency/replay behavior; foreign-key and unique-membership constraints; database health test; seed isolation test.

**Definition of done:** A new developer can start local services and migrate an empty database; core tenant/course integrity is enforced by the database, not just application code.

## PR 7 — Authentication and session boundary

**Objective:** Implement the approved identity approach for the smallest secure browser session flow.

**Files affected:**

- `apps/api/src/modules/identity/**` (new)
- Auth routes/controllers/services (new)
- Session/cookie configuration (new)
- Identity provider adapter or local development adapter (new)
- Relevant OpenAPI schemas and generated client refresh

**Dependencies:** PR 5 and PR 6.

**Implementation steps:**

1. Implement the ADR-selected identity adapter behind an application interface.
2. Provide only Sprint 1 session endpoints: sign in/out, session refresh/check, and `GET /v1/me`; registration/verification may be stubbed only if the provider owns them and their contract is documented.
3. Use `HttpOnly`, `Secure` (production), appropriately scoped `SameSite` cookies, CSRF strategy, rotation/revocation, and session expiry behavior.
4. Create or link the local user record on first verified identity.
5. Ensure unauthenticated responses are contract-consistent and do not leak account existence.

**Tests:** Authenticated/unauthenticated `/me`; revoked/expired session; cookie attributes; CSRF behavior for state-changing route; no token/PII in logs.

**Definition of done:** A verified local development user can establish, resume, and revoke a browser session; the API has one tested way to obtain the current actor.

## PR 8 — Authorization and tenancy policy

**Objective:** Make ownership and role checks reusable before any user data is exposed.

**Files affected:**

- `packages/domain/src/authorization/**` (new)
- `apps/api/src/modules/organizations/**` (new)
- API authorization middleware/policies (new)
- Organization/membership OpenAPI schemas/routes (new)
- Audit-event helpers (new)

**Dependencies:** PR 6 and PR 7.

**Implementation steps:**

1. Implement a policy interface for actor, organization, course, role, and action.
2. Define and test roles needed now: student, course editor, organization admin; reserve higher roles without granting them.
3. Add organization creation for a first user and membership reads required by the course module.
4. Ensure resource lookups are organization-scoped before returning data.
5. Record audit events for organization and membership mutations.

**Tests:** Cross-tenant access returns non-disclosing failure; role matrix tests; policy unit tests; audit event tests.

**Definition of done:** No endpoint can fetch a tenant-owned resource using an ID alone; authorization is central, tested, and not duplicated in handlers.

## PR 9 — Course vertical slice

**Objective:** Deliver the first durable, authorized product object: a learner-owned course.

**Files affected:**

- `apps/api/src/modules/courses/**` (new)
- Course OpenAPI endpoints/schemas and generated client update
- Database migration only if additional course constraints are required
- API integration tests and domain validation tests

**Dependencies:** PR 4, PR 6, and PR 8.

**Implementation steps:**

1. Implement course create, list, read, update, and archive endpoints as specified in the contract.
2. Validate title, optional subject, exam date, timezone-aware dates, and lifecycle transitions.
3. Create course ownership/membership transactionally.
4. Enforce organization and course authorization on every operation.
5. Emit audited, structured course lifecycle events; do not add analytics pipeline yet.

**Tests:** Create/list/read/update/archive; validation errors; cross-tenant attempts; role matrix; archived-course behavior; transaction rollback when membership creation fails.

**Definition of done:** An authenticated learner can manage only their authorized courses through a documented API, with durable data and complete integration coverage.

## PR 10 — Web routing, authenticated shell, and typed API client

**Objective:** Replace prototype-only navigation with an accessible shell that can consume the Sprint 1 backend.

**Files affected:**

- `apps/web/src/routes/**` (new)
- `apps/web/src/lib/api/**` (new; generated client integration)
- `apps/web/src/providers/**` (new)
- Existing `App.tsx` and page components (refactor only)
- Auth/session and course-list UI components (new)
- Web tests (new)

**Dependencies:** PR 2, PR 4, PR 7, and PR 9.

**Implementation steps:**

1. Introduce React Router and route-level page boundaries while preserving public prototype presentation routes where useful.
2. Configure the generated API client and TanStack Query with authenticated cookie requests, safe retries, request-error mapping, and query invalidation.
3. Add a minimal accessible authenticated shell: session loading, signed-out state, sign-out, and course-list/create entry point.
4. Build course list/create UI from API data; do not start uploads or AI processing.
5. Add loading, empty, unauthorized, offline, and recoverable-error states.

**Tests:** Route/deep-link tests; session loading and expiration; typed mock/API integration tests; keyboard and accessible-name checks; course creation/list error recovery.

**Definition of done:** A signed-in learner reaches a real URL, sees only their server-backed courses, creates a course, refreshes the page, and sees the same data again.

## PR 11 — Observability, audit events, and HTTP security baseline

**Objective:** Ensure the foundation can be operated and investigated before document or AI workloads amplify failures.

**Files affected:**

- `apps/api/src/observability/**` (new)
- `apps/api/src/audit/**` (new or extended)
- Security middleware/configuration (new or updated)
- Metrics/tracing configuration (new)
- Runbook and threat-model starter documents (new)

**Dependencies:** PR 5, PR 7, PR 8, and PR 9.

**Implementation steps:**

1. Add structured logs with request/correlation IDs and redaction for cookies, tokens, email where unnecessary, and request bodies.
2. Emit traces/metrics for API route duration, errors, database queries, authentication outcomes, and course mutations.
3. Complete baseline HTTP headers, CORS allowlist, body size limits, trusted-proxy configuration, and rate-limit policy for auth and course mutation routes.
4. Persist immutable audit records for sign-in/out (subject to privacy policy), organization membership, and course mutations.
5. Write initial operational runbooks for API outage, authentication failure spike, unauthorized-access report, and rollback.

**Tests:** Header assertions; CORS policy; throttling tests; log-redaction tests; trace/metric emission tests; audit immutability/actor tests.

**Definition of done:** An operator can correlate a course mutation to an authenticated actor and request without exposing secrets; baseline web/API attack controls are tested.

## PR 12 — Sprint integration and release gate

**Objective:** Verify that the foundation functions together and record what is ready for Sprint 2.

**Files affected:**

- End-to-end test suite and fixtures (new)
- `docs/runbooks/local-development.md` (new or updated)
- `docs/SPRINT_01_EXIT_REPORT.md` (new)
- CI workflow updates if gaps are found

**Dependencies:** PRs 1–11.

**Implementation steps:**

1. Run the full clean-environment path: start dependencies, migrate, run API, start web, authenticate, create/list/archive course, sign out, and verify denied access.
2. Add a single E2E test that covers this critical path with synthetic data.
3. Perform an accessibility smoke test of sign-in/session/course states and record issues or approval.
4. Verify CI, migration instructions, rollback guidance, configuration documentation, and dependency security scanning.
5. Produce exit report: completed acceptance criteria, known risks, metrics baseline, Sprint 2 prerequisites, and explicit confirmation that upload/AI remain out of scope.

**Tests:** Full E2E critical path; clean install/build/type-check/lint/test; migration from empty database; manual keyboard-only smoke test.

**Definition of done:** Sprint 1 is reproducible from a clean checkout, all required checks pass in CI, core tenant isolation has E2E evidence, and the team has a signed-off Sprint 2 handoff.

## Sprint 1 non-goals

- File upload, malware scanning implementation, OCR, document extraction, queues/workers beyond placeholders.
- Embeddings, vector search, RAG, LLM calls, prompts, streaming chat, flashcards, quizzes, or planner algorithms.
- Payments, email/push delivery, teachers, SSO, LMS integrations, social features, and mobile native apps.
- Production infrastructure rollout; only local/developer foundations and deployment conventions are in scope.
- Redesigning the current visual prototype beyond routing and minimal authenticated/course states.

## Sprint risk controls

| Risk                                                | Control                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Workspace migration disrupts the existing prototype | PR 2 preserves and verifies the current web build before any feature work                         |
| Identity-provider choice delays development         | ADR decision is a hard prerequisite; no custom auth implementation begins before approval         |
| API and UI drift                                    | OpenAPI generation is established before API routes or web data integration                       |
| Tenant leakage                                      | Central policy, database constraints, negative authorization tests, and E2E proof precede uploads |
| Scope expands into AI/upload work                   | Explicit non-goals and PR boundaries; Sprint 2 cannot begin until PR 12 exit gate                 |
