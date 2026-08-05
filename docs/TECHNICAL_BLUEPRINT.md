# AVANA Technical Blueprint

Status: approved pre-implementation target architecture. Owner: CTO and Engineering. Updated: 2026-07-18.

## Product contract

AVANA transforms student-owned source material into cited, personalized study actions. AI is assistive, editable, source-grounded, and never authoritative for access, billing, scores, or schedules.

Principles: source-grounded answers; deterministic learning records; tenant isolation; asynchronous expensive work; modular monolith first; observable and reversible operations; WCAG 2.2 AA; mobile-capable UX.

## Architecture

Clients use a CDN/WAF to reach a stateless API. The API owns authentication, authorization, transactions, and orchestration. PostgreSQL is the transactional source of truth. Private object storage holds originals and derived assets. Redis provides cache, queues, and rate limiting. Independent workers process documents, embeddings, AI generation, and notifications. A vector index supports authorized retrieval. A model gateway owns provider selection, policy, cost, and evaluation. OpenTelemetry correlates every request, job, and model call.

## Approved stack

| Concern       | Initial choice                                                  |
| ------------- | --------------------------------------------------------------- |
| Web           | React, TypeScript, Vite, React Router, Tailwind, TanStack Query |
| Forms         | React Hook Form and schema validation                           |
| API           | TypeScript on Node.js LTS; Fastify or NestJS selected by ADR    |
| Contract      | OpenAPI 3.1 with generated TypeScript client                    |
| Data          | PostgreSQL 16+, Prisma or Drizzle, SQL-reviewed migrations      |
| Queue/cache   | Redis and BullMQ                                                |
| Files         | private S3-compatible object storage with signed URLs           |
| Vector search | pgvector first; dedicated service only after measured need      |
| AI            | provider-agnostic model gateway                                 |
| Delivery      | containers, Terraform, managed compute/database/cache           |
| Observability | OpenTelemetry, error tracking, metrics platform                 |

Target repository: `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/ui`, `packages/config`, `infra`, and `docs`. UI cannot import database/cloud/model SDKs. API cannot import UI code.

## Backend modules

| Module         | Responsibility                                            |
| -------------- | --------------------------------------------------------- |
| Identity       | users, sessions, MFA, verification, recovery              |
| Organizations  | tenants, memberships, roles, invitations                  |
| Courses        | courses, memberships, topics, settings                    |
| Files          | upload intent, storage metadata, scans, lifecycle         |
| Documents      | extraction, pages, chunks, citations, job state           |
| Study          | plans, study sessions, goals, progress                    |
| Flashcards     | decks, cards, FSRS schedules and reviews                  |
| Quizzes        | questions, attempts, answers, results                     |
| AI             | conversations, messages, generations, citations, feedback |
| Notifications  | preferences, schedules, deliveries                        |
| Billing        | subscriptions, entitlements, payment events               |
| Analytics      | immutable events and aggregates                           |
| Administration | support, moderation, flags, audits                        |

Modules use transactional outbox events for side effects and idempotent consumers. Synchronous calls are only for immediate transactional answers.

## AI and RAG pipeline

1. Authorized browser requests an upload intent and uploads directly with a short-lived signed URL.
2. API verifies ownership, checksum, file size, MIME/magic bytes, and scan status.
3. Workers quarantine unsafe files; valid files are converted, text-extracted, and OCRed only when necessary.
4. Processing stores page metadata, OCR confidence, semantic chunks, headings, page ranges, language, and stable hashes.
5. Embedding workers index versioned chunks with organization/course/document metadata.
6. Generation workers propose editable outlines, topics, flashcards, quizzes, and plans, each linked to citations.
7. Quality gates validate schema, citation support, duplicates, answer validity, safety, and cost.
8. RAG filters by authorization before lexical/semantic retrieval and optional reranking. Course-specific answers cite sources; weak retrieval abstains.
9. Conversation memory is summarized and course-scoped. Raw history is not blindly placed into prompts.
10. Client sees real job states, errors, retries, and cancellation.

Only the model gateway may call a model provider. It records operation, model/version, prompt version, retrieval IDs, token count, cost, latency, safety result, and correlation ID. It supports streaming, cancellation, provider fallback, circuit breakers, budgets, semantic caching, and regression evaluation.

## Database schema

All IDs are UUIDs. Tenant records carry `organization_id` directly or through an enforced ownership path. Standard lifecycle fields are `id`, `created_at`, `updated_at`, and `deleted_at` where required.

| Area            | Tables                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| Identity        | `users`, `auth_identities`, `sessions`, `user_settings`                                    |
| Tenancy         | `organizations`, `organization_memberships`, `course_memberships`                          |
| Courses         | `courses`, `topics`, `topic_relationships`                                                 |
| Files/documents | `uploaded_files`, `documents`, `document_pages`, `document_chunks`, `source_citations`     |
| Study           | `study_plans`, `study_plan_days`, `study_sessions`                                         |
| Flashcards      | `flashcard_decks`, `flashcards`, `flashcard_reviews`, `flashcard_schedules`                |
| Quizzes         | `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers`                               |
| AI              | `ai_conversations`, `ai_messages`, `ai_message_citations`, `ai_generations`, `ai_feedback` |
| Operations      | `jobs`, `audit_logs`, `activity_events`, `notifications`, `feature_flags`                  |
| Commerce        | `subscriptions`, `payment_events`, `entitlements`                                          |

Key relationships: Organization → Course → File → Document → Page/Chunk/Citation. Course → Topic → Study/Deck/Quiz. User plus Flashcard → Schedule and immutable Review history. Quiz → Questions → Attempt → Answers. Conversation → Messages → Citations. Use foreign keys, unique normalized email/membership/webhook constraints, explicit deletion semantics, and optional PostgreSQL RLS as defense in depth.

## API contracts

All APIs use `/v1`, HTTPS JSON, OpenAPI 3.1, UUIDs, UTC ISO timestamps, cursor pagination, safe error envelopes, and idempotency keys for replay-sensitive writes. Long-running work returns `202` and a job resource.

| Module          | Endpoint groups                                                        |
| --------------- | ---------------------------------------------------------------------- |
| Auth            | register, login, logout, refresh, password recovery, verification, MFA |
| User            | profile/settings, data export, account deletion                        |
| Organizations   | CRUD and membership management                                         |
| Courses         | CRUD, archive, dashboard, members                                      |
| Uploads         | initiate, complete, status, delete                                     |
| Documents       | document/page read, outline edit, reprocess, job status                |
| Study           | plans, session completion/skip, regeneration                           |
| Flashcards      | decks/cards, review queue, review submission                           |
| Quizzes         | quizzes, attempts, answers, submit, results                            |
| AI              | conversation CRUD, messages, SSE stream, feedback                      |
| Notifications   | feed and preference management                                         |
| Billing         | subscription, checkout, portal, verified webhook                       |
| Admin/analytics | role-protected support, operations, flags, aggregate metrics           |

## Security and privacy

Web sessions use `HttpOnly`, `Secure`, `SameSite` cookies with rotation, revocation, verified email, recovery, and optional MFA. Roles are `student`, `teacher`, `course_editor`, `organization_admin`, `support_agent`, and `platform_admin`; all grants are least privilege and organization/course scoped.

Files are private, signed, magic-byte verified, size-limited, scanned, and parsed in isolated resource-limited workers. Enforce TLS, HSTS, CSP, CSRF, strict CORS, output encoding, WAF, dependency/secret scanning, encryption at rest/in transit, managed secret storage, rate limits by IP/account/org/token/concurrency, immutable audits, encrypted tested backups, and incident runbooks.

Prompts minimize personal content. AVANA provides disclosure, consent/preferences, export, deletion, retention, and recovery workflows. Legal review covers GDPR, education-data obligations, age gates, and residency before expansion.

## Infrastructure and delivery

Use local, preview, staging, and isolated production environments. Production has CDN/WAF, autoscaled private API/workers, private database, encrypted storage, managed Redis, point-in-time database recovery, object lifecycle/versioning, and centralized telemetry. The database has no public ingress.

Pipeline: PR type/lint/test/contract/secret/dependency checks plus preview; main produces immutable attested artifacts; staging runs migration rehearsal, E2E/accessibility, and AI evaluations; production uses canary or blue/green rollout with automatic rollback. Migrations use expand → migrate → contract.

Initial objectives: 99.9% API availability; 95% normal API requests below 400ms excluding jobs; 99% valid uploads accepted inside 30 seconds; explicit processing targets by size. Monitor errors, queue age, dead letters, extraction, citation coverage, cost, DB saturation, delivery, activation, and retention.

## Scale strategy

At 10,000 users use the modular monolith, separate workers, managed PostgreSQL/Redis/storage/CDN, and pgvector. At 100,000 split ingestion and AI/RAG worker pools, add queue priorities/dead letters, read replicas, analytics warehouse, and dedicated vector search only if needed. At 1M users deploy regionally, partition high-volume review/event tables, use a warehouse/lakehouse, and independently scale model gateway, ingestion, notifications, billing, and search. OCR throughput, AI cost/latency, chat context, and analytics are expected first bottlenecks.

## Standards and phases

TypeScript is strict; all external input is schema validated; pure domain logic is unit tested; semantic HTML and WCAG criteria are mandatory; secrets/raw documents/PII never enter logs or commits; time is stored in UTC. Required testing: unit, integration, OpenAPI contract, E2E, security, accessibility, and AI retrieval/citation/JSON/safety/cost regression suites.

Phase 1: secure foundation and closed MVP—identity, courses, upload/scan/extraction, cited cards, FSRS, basic plan, audits, CI. Phase 2: private beta—grounded mentor, quizzes, editing, notifications, analytics, feedback, admin support, mobile polish. Phase 3: public production—billing, privacy controls, DR, load/security testing, SLO/on-call, feature flags. Phase 4: institutional scale—teacher tools, SSO/LMS, regional controls, advanced analytics.

No production release may retain simulated completion states, claim unvalidated readiness, market AI as guaranteed correct, expose collaboration before permissions/moderation, or add microservices without measured need. Architectural exceptions require an ADR in `docs/adr/`.
