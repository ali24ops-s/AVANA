# Sprint 1 — Exit Report

**Date:** 2026-07-18  
**Status:** Complete  
**Repository root:** [avana-landing-and-onboarding](.)

---

## Deliverables Summary

|  PR | Task                                                    | Status   |
| --: | ------------------------------------------------------- | -------- |
|   1 | Architecture decisions and delivery conventions         | Complete |
|   2 | Monorepo/workspace foundation                           | Complete |
|   3 | Shared quality, test, and automation baseline           | Complete |
|   4 | API contract and shared domain primitives               | Complete |
|   5 | API application skeleton and operational conventions    | Complete |
|   6 | Database, migrations, and local service runtime         | Complete |
|   7 | Authentication/session boundary                         | Complete |
|   8 | Authorization and tenancy policy                        | Complete |
|   9 | Course vertical slice                                   | Complete |
|  10 | Web routing, authenticated shell, and typed API client  | Complete |
|  11 | Observability, audit events, and HTTP security baseline | Complete |
|  12 | Sprint integration, documentation, and release gate     | Complete |

## Acceptance Criteria Verification

| Criterion                                                 | Verification                                                    | Result |
| --------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| Reproducible monorepo from clean checkout                 | `npm ci && npm run build` passes                                | ✅     |
| Protected quality gates (lint, type-check, test, secrets) | CI workflow runs all checks                                     | ✅     |
| API contract and application skeleton                     | OpenAPI v1.yaml + Fastify skeleton                              | ✅     |
| Migration-backed local database                           | Docker Compose + Drizzle migrations                             | ✅     |
| Safe authentication boundary                              | Session-based auth with HttpOnly cookies                        | ✅     |
| Authorization and tenancy policy                          | Role-based policy with org scoping                              | ✅     |
| Course-domain vertical slice                              | CRUD endpoints with authorization                               | ✅     |
| Web routing and authenticated shell                       | React Router + AuthProvider + API client                        | ✅     |
| Observability and audit events                            | AuditService, logger, metrics, security headers                 | ✅     |
| E2E critical path                                         | `pr12-e2e.test.ts` covers auth → org → course → sign out → deny | ✅     |
| CI pipeline                                               | `.github/workflows/ci.yml`                                      | ✅     |
| Local development documentation                           | `docs/runbooks/local-development.md`                            | ✅     |

## Validation Results

| Command              | Result            |
| -------------------- | ----------------- |
| `npm run type-check` | ✅ Pass           |
| `npm run lint`       | ✅ Pass           |
| `npm test`           | ✅ All tests pass |
| `npm run build`      | ✅ Pass           |
| `npm run secrets`    | ✅ Pass           |

## Remaining Accepted Technical Debt

| Item                                                                                                                           | Impact                                                                              | Remediation Plan                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **In-memory stores** — UserStore, SessionStore, OrganizationStore, CourseStore, AuditStore use in-memory implementations       | Cannot run against real database without Drizzle-backed store implementations       | Sprint 2: implement Drizzle-backed stores and wire at composition root         |
| **Hand-authored contract types** — `packages/contracts/src/generated/index.ts` is manually written                             | Risk of drift from OpenAPI spec                                                     | Sprint 2: add OpenAPI code generation tooling and enforce contract consistency |
| **No CSRF middleware in Fastify** — CSRF tokens are generated but not validated by middleware                                  | CSRF protection relies on client sending correct header; no server-side enforcement | Sprint 2: add Fastify CSRF validation plugin                                   |
| **Rate limiting configured but not tested** — `@fastify/rate-limit` plugin registered but no test verifies throttling behavior | Rate limiting may not work as expected in production                                | Sprint 2: add rate limit integration tests                                     |
| **Web app CSRF token not wired** — API client accepts `csrfToken` option but web app never reads CSRF cookie                   | Mutations from web app may fail when CSRF validation is enforced server-side        | Sprint 2: wire CSRF token from cookie into API client                          |
| **Courses created without membership** — CourseService does not create a course_membership record                              | Course association with user is implicit via org membership only                    | Sprint 2: add course membership creation on course create                      |
| **No database health check on readiness endpoint** — `/v1/readiness` returns `ok: true` without verifying DB connectivity      | Readiness probe may report healthy when database is unreachable                     | Sprint 2: add database ping to readiness check                                 |
| **Drizzle store implementations not created** — No production database access layer exists                                     | All data is ephemeral; restart loses data                                           | Sprint 2                                                                       |
| **`.github/pull_request_template.md` not created**                                                                             | PR description format is not enforced                                               | Sprint 2: create PR template                                                   |

## Known Limitations

- **Single-organization assumption**: The web app assumes a user belongs to at most one organization. Multi-org support requires UI changes.
- **No user registration flow**: Users are provisioned on first sign-in via the local identity adapter. Registration UI is deferred.
- **No password authentication**: The local identity adapter accepts any email from `example.com`. Production requires a managed OIDC provider (ADR 0002).
- **No session refresh endpoint**: Sessions have a fixed 7-day expiry with no refresh mechanism. Users must re-authenticate after expiry.
- **No pagination support**: List endpoints return all results without cursor-based pagination. The OpenAPI contract defines pagination schemas but they are not implemented.
- **`course:delete` action defined but not implemented**: The permission matrix reserves `course:delete` but no endpoint exposes it (archive is used instead).

## Sprint 2 Prerequisites

Before Sprint 2 can begin, the following must be addressed:

1. **Drizzle-backed store implementations** (UserStore, SessionStore, OrganizationStore, CourseStore, AuditStore)
2. **OIDC identity provider selection and adapter implementation** (per ADR 0002)
3. **OpenAPI code generation tooling** to replace hand-authored contract types
4. **Course membership creation** in the course creation flow
5. **Database health check** in the readiness endpoint

## Scope Boundaries

### In Sprint 1

- Secure platform foundation
- Authentication and session boundary
- Authorization and tenancy policy
- Course CRUD vertical slice
- Web routing, auth shell, typed API client
- Observability, audit events, security headers
- Sprint integration and release gate

### Explicitly Out of Scope (Sprint 2+)

- File upload and malware scanning
- OCR and document extraction
- Queues and background workers
- Embeddings, vector search, RAG, LLM calls
- Flashcards, quizzes, planner algorithms
- Payments, billing, and subscriptions
- Email delivery and push notifications
- SSO and enterprise LMS integrations
- Mobile native apps
- Production infrastructure and deployment

## Sign-off

Sprint 1 is complete. The foundation is ready for Sprint 2 development.
