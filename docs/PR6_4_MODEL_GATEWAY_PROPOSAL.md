# PR6-4 — AI Model Gateway + Generated Content Pipeline

---

**Status:** Approved architecture proposal — no application code changes authorized by this document
**Owner:** CTO and Engineering
**Baseline:** `docs/SPRINT_06_AI_LEARNING_ENGINE_PROPOSAL.md`, PR6-1 (schema + domain primitives), PR6-3 (extraction + chunking)
**Scope:** Design only. Foundation for AI generation. No application code, migration, dependency, or frontend changes yet.

---

## 1. Goal

Build the AI generation foundation on top of the completed PR6-1 (schema) and PR6-3 (extraction/chunking):

```
document_chunks → ModelGateway abstraction → generated_contents persistence → review_pending state
```

This PR delivers the **ModelGateway abstraction**, a **mock/fake provider**, a **generation service**, a **generated-content store**, and **review-queue read endpoints**. Flashcards/quizzes/providers/workers/frontend are explicitly out of scope.

### 1.1 In-scope (PR6-4)

- `ModelGateway` interface + `MockModelGateway` (config-gated, no real provider).
- `GeneratedContentStore` + `GeneratedContentCitationStore` interfaces + in-memory + Drizzle implementations.
- `GenerationService` (worker-ready entry point, synchronous in this PR).
- Review-queue read endpoints (`generate`, list generated, get generated).
- OpenAPI contract + hand-authored generated types.
- Tests (domain, gateway, service, integration, schema).
- Optional additive idempotency migration (`0006`).

### 1.2 Out-of-scope (explicitly NOT implemented)

- Real AI providers (OpenAI/Anthropic/Azure/…).
- Flashcards / quiz UX and all flashcard/quiz consumption endpoints (PR6-6/PR6-7).
- Frontend.
- Spaced-repetition scheduling.
- Embeddings / vector database.
- BullMQ workers / job queues / `202` job responses.
- Accept / reject / regenerate review mutations (PR6-6).

---

## 2. Key finding: PR6-1 already provides the schema

PR6-1 created all target tables and domain primitives. PR6-3 added `document_chunks` and the extraction pipeline. Therefore PR6-4 is **additive and non-breaking**:

| Asset                                                                                                                      | Status after PR6-1/PR6-3 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `documents` (lifecycle)                                                                                                    | ✅ exists                |
| `document_chunks` (citation basis)                                                                                         | ✅ exists                |
| `generated_contents` (`type`, `status`, `payload`, `prompt_version`, `model`, `token_usage`, `accepted_at`, `accepted_by`) | ✅ exists                |
| `generated_content_citations` (join)                                                                                       | ✅ exists                |
| `GeneratedContentId` branded ID                                                                                            | ✅ exists                |
| `document:upload` / `document:read` policy actions                                                                         | ✅ exists                |
| `document.uploaded/processed/failed/deleted` audit helpers                                                                 | ✅ exists                |
| `DocumentStore`, `DocumentChunkStore` interfaces (in-memory + Drizzle)                                                     | ✅ exists                |

What is **missing** and delivered by PR6-4:

- `ModelGateway` abstraction + mock provider.
- `GeneratedContentStore` / `GeneratedContentCitationStore`.
- `GenerationService`.
- Review-queue read endpoints + contracts.
- Generation-related policy actions, audit helpers, domain payload/status types.
- Idempotency guard for worker-safe generation.

---

## 3. Database changes required

### 3.1 No changes to existing tables

`generated_contents`, `generated_content_citations`, `documents`, and `document_chunks` already carry everything PR6-4 needs. No column changes to existing tables.

### 3.2 Optional additive migration: `0006_generation_idempotency.ts`

**Decision:** Add a `generation_key` to `generated_contents` to make generation idempotent and worker-safe (important for the future BullMQ migration).

**Design — generality over narrow coupling.** The uniqueness constraint is **not** coupled to a single scenario (`document_id + type`). Instead, the design supports broader future use cases (course-level regeneration, per-request regeneration) by allowing the caller to compute a `generation_key` that encodes the scenario. The migration provides:

- `generation_key varchar(64)` — nullable, so existing rows (and drafts created without a key) are unaffected.
- A **partial unique index** on `(organization_id, generated_content_kind_scope)` where the scope is expressed by the caller-supplied key combined with the owning document/type. Concretely, the index is defined as:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_contents_dedup
  ON generated_contents (document_id, type, generation_key)
  WHERE generation_key IS NOT NULL;
```

The intent is **not** "document+type+key forever." It is a **minimal, reversible start** that:

1. Prevents duplicate drafts on worker redelivery for the same document/type/scenario.
2. Is additive and nullable — no migration of existing rows.
3. Can be broadened later (e.g., to `course_id`-scoped or regeneration-batch keys) by dropping and re-creating the partial index as generation scenarios formalize.

**Rollback:** down migration drops the index and column. Safe and reversible.

**Why this matters:** PR6-5 generation workers will call the same generation logic; without a dedupe key, a redelivered BullMQ job could double-create drafts. Adding the guard now (additive, nullable) keeps the async-ready contract intact.

---

## 4. Domain primitives

Add to `packages/domain/src` — **pure, framework-independent** types and functions only. No infrastructure/network/observability concerns here.

### 4.1 `generation.ts`

```ts
// Extensible union — new types (e.g. "summary", "mnemonic") can be added later.
export type GeneratedContentType =
  "lesson" | "flashcard" | "quiz" | "recommendation";

// AI artifact lifecycle (separate from document processing lifecycle).
export type GeneratedContentStatus =
  "draft" | "accepted" | "rejected" | "edited" | "regenerating";

export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed";

// Extensible — future "openai" | "anthropic" | "azure" added behind the gateway.
export type ModelProvider = "mock";
```

**Payload types — intentionally not over-designed.** The user instruction is to keep schemas close to the generation workflows because lesson/flashcard/quiz schemas will evolve. PR6-4 defines **minimal** discriminated payload unions:

```ts
export type FlashcardPayload = {
  kind: "flashcard";
  question: string;
  answer: string;
  explanation?: string;
  cardType?: string;
  difficulty?: "easy" | "medium" | "hard";
  citationChunkIds: string[]; // must map to document_chunks
};

export type QuizPayload = {
  kind: "quiz";
  title: string;
  questions: Array<{
    question: string;
    questionType: "multiple_choice" | "true_false" | "fill_blank";
    choices?: string[];
    correctAnswer: unknown;
    explanation?: string;
  }>;
  citationChunkIds: string[];
};

export type LessonPayload = {
  kind: "lesson";
  title: string;
  contentMarkdown: string;
  citationChunkIds: string[];
};

export type RecommendationPayload = {
  kind: "recommendation";
  summary: string;
  topics: string[];
  citationChunkIds: string[];
};

export type GeneratedContentPayload =
  FlashcardPayload | QuizPayload | LessonPayload | RecommendationPayload;
```

### 4.2 `ids.ts`

`GeneratedContentId`, `DocumentChunkId`, `DocumentId`, `CourseId`, `OrganizationId` already exist — **no change needed**.

### 4.3 Authorization (`policy.ts` + `audit.ts`)

Add policy actions:

```ts
| "content:generate"
| "content:review"
| "content:accept"
| "content:reject"
| "content:regenerate"
```

Role matrix (following the existing pattern — students act on their own content; editors/admins broader):

| Action               | student | course_editor | organization_admin | support_agent / platform_admin |
| -------------------- | ------- | ------------- | ------------------ | ------------------------------ |
| `content:generate`   | ✓ (own) | ✓             | ✓                  | —                              |
| `content:review`     | ✓ (own) | ✓             | ✓                  | —                              |
| `content:accept`     | ✓ (own) | ✓             | ✓                  | —                              |
| `content:reject`     | ✓ (own) | ✓             | ✓                  | —                              |
| `content:regenerate` | ✓ (own) | ✓             | ✓                  | —                              |

(Ownership scoping is enforced at the service layer, matching the existing `findByIdForOwner` pattern.)

Add `generated_content` to `AuditEntityType` and new audit helpers:

- `auditContentGenerated(actorId, orgId, contentId, { documentId, type, model, promptVersion, sourceChunkCount })`
- `auditContentAccepted(actorId, orgId, contentId, { documentId, type })`
- `auditContentRejected(actorId, orgId, contentId, { documentId, type })`
- `auditContentRegenerated(actorId, orgId, contentId, { documentId, type, generationKey })`
- `auditGenerationFailed(actorId, orgId, documentId, { type, errorCode, retryCount })`

Wire the new actions/helpers into `authorization/index.ts`.

---

## 5. ModelGateway interface (in the generation module)

**Decision:** Place `ModelGateway` in `apps/api/src/modules/generation/gateway/` for PR6-4.

**Reason:** The current implementation is API-layer infrastructure. Providers, configuration, token accounting, observability, retries, and network concerns do not belong in `packages/domain`. Domain stays limited to pure business primitives and types. (Future extraction into a shared package is possible if multiple applications need it.)

### 5.1 `gateway/types.ts`

```ts
export type ModelProvider = "mock";

export interface ModelGateway {
  readonly provider: ModelProvider;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export type CompletionRequest = {
  promptVersion: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: unknown; // structured-output contract
  correlationId: string; // tied to request_id / job_id
  organizationId: OrganizationId;
  documentId: DocumentId;
};

export type CompletionResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
};
```

### 5.2 `gateway/mock.ts` — `MockModelGateway`

- Config-gated fake provider (selected when `AI_PROVIDER` is unset or `"mock"`).
- Given a `jsonSchema` + prompt, returns a **deterministic, schema-valid** JSON payload for each supported type (canned but realistic flashcard/quiz/lesson/recommendation respecting the `type` in the prompt).
- Records fake `usage` (`inputTokens`/`outputTokens`), `model: "mock-1"`, `correlationId`. No network.
- Throws `DomainError("unprocessable")` if a **real** provider is configured but unimplemented (safe cliff so we never silently fall back in production).

### 5.3 `gateway/index.ts` — `createModelGateway(config)`

- Factory selecting `mock` when `AI_PROVIDER` is unset/`mock`.
- Future providers behind the same `ModelGateway` interface.
- **Retry / circuit-breaker are deferred to PR6-5 workers** (documented TODO). The `ModelGateway` shape is designed so a decorator can wrap it later without changing callers.

### 5.4 Observability

- The gateway returns `usage`/`model`/`correlationId`; a generation logger hook records token counts and latency — **never raw chunk text**.
- Consistent with the PR6-1 audit principle: audit payloads contain only IDs, statuses, counts, and metadata.

---

## 6. Generation service

New `apps/api/src/modules/generation/generation-service.ts` (mirrors `DocumentProcessingService` — worker-ready, no request context).

### 6.1 Constructor deps

```ts
new GenerationService(
  generatedContentStore,     // GeneratedContentStore
  citationStore,             // GeneratedContentCitationStore
  gateway,                   // ModelGateway
  documentStore,             // DocumentStore
  chunkStore,                // DocumentChunkStore
  policy,                    // AuthorizationPolicy
  auditService?,             // AuditService
)
```

### 6.2 `generateForDocument(actor, orgId, documentId, { types?, promptVersion, generationKey })`

The single worker-ready entry point. A BullMQ worker will call it unchanged later; the route currently calls it synchronously.

1. **Authorize** `content:generate`.
2. **Resolve doc** via `documentStore.findByIdForOrganization` (org-scoped, non-disclosing `not_found`).
3. **Guard**: require the document to be in `extracted` (chunks present); otherwise throw `DomainError("conflict")`.
4. **Load chunks** via `chunkStore.listByDocument`.
5. **For each requested type**:
   - Build prompt (chunks context + `jsonSchema`).
   - Call `gateway.complete`.
   - Validate returned JSON against the schema.
   - Persist a `draft` `generated_content` with `prompt_version`, `model`, `token_usage`, `generation_key`.
6. **Write citations** (join `generated_content_citations`) using the `citationChunkIds` in the payload. **Every generated artifact must be traceable to `document_chunks`** — no citations is rejected unless explicitly documented as a future exception.
7. **Transition document status** `extracted → generating → review_pending` (idempotent; skip if already `review_pending`).
8. **Emit audit events**.

Returns `{ contents, document_status }`.

### 6.3 Status separation (explicit design rule)

- **Document status** = processing lifecycle (`extracted → generating → review_pending → ready`).
- **Generated content status** = AI artifact lifecycle (`draft → accepted/rejected/edited/regenerating`).

These are **separate** axes. A document can be `review_pending` while individual contents are `draft`/`accepted`/`rejected`. This separation is enforced in the service and reflected in the API responses.

### 6.4 Idempotency

- `generation_key` + partial unique index prevent duplicate drafts on redelivery.
- Re-running generation with the same `generation_key` for the same document/type returns the existing draft (no duplicate).

### 6.5 `reviewQueue(actor, orgId, courseId)`

- Lists `draft`/`edited` contents for a course — the `review_pending` read path.
- No accept/reject/regenerate mutations here (PR6-6).

### 6.6 Worker-ready design

- The method takes actor/org/documentId params, not a Fastify request — no request coupling.
- `generateForDocument` is the seam a later BullMQ consumer invokes; the async migration only replaces route orchestration, **not** the generation logic.

---

## 7. API endpoints

New `apps/api/src/modules/generation/generation-routes.ts` (Fastify plugin; same auth/param-helper pattern as `document-routes.ts`).

### 7.1 `POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate`

- **200** `{ request_id, contents: [...], document_status }`.
- Synchronous in PR6-4 via `MockModelGateway`. **No `202`/job yet** (BullMQ deferred).
- Body: `{ types?: GeneratedContentType[], prompt_version?: string }`.
- Authorization: `content:generate`.

### 7.2 `GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated`

- **200** `{ request_id, contents: [...] }` — list drafts + citations for a document.
- Authorization: `content:review`.

### 7.3 `GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId`

- **200** `{ request_id, content }` — single generated content with citations.
- Authorization: `content:review`.

### 7.4 Wiring

- Register in `v1.ts` behind availability of `GeneratedContentStore` + `ModelGateway` (same conditional pattern as other routes).
- Compose `GeneratedContentStore`/`CitationStore` in `composeLocalDev.ts` and `composeProduction.ts`.
- Add `generation` config block to `config.ts` (`AI_PROVIDER`; default `mock`).

---

## 8. Contracts

- Extend `packages/contracts/openapi/v1.yaml` with the three endpoints + schemas:
  - `GeneratedContentResource` (id, document_id, course_id, type, status, payload, prompt_version, model, token_usage, citations, created_at/updated_at)
  - `GeneratedContentListResponse`, `GeneratedContentResponse`
  - `GenerateContentRequest` / `GenerateContentResponse`
  - `GenerationStatus`, `CitationResource`
- Mirror hand-authored types in `packages/contracts/src/generated/index.ts` (existing pattern — no generator).
- Add contract-example assertions in `contractExamples.test.ts`.

---

## 9. Tests

### 9.1 Domain — `pr6-4-generation.test.ts`

- Payload/status type shapes.
- New policy actions (`content:generate/review/accept/reject/regenerate`) for each role.
- New audit helpers produce serializable events.

### 9.2 Gateway unit — `mock-gateway.test.ts`

- Returns schema-valid JSON for each type (lesson/flashcard/quiz/recommendation).
- Records `usage`/`model`/`correlationId`.
- Throws `unprocessable` when a real provider is configured but unavailable.

### 9.3 Service unit — `generation-service.test.ts`

Uses `InMemoryGeneratedContentStore` + `InMemoryGeneratedContentCitationStore` + `InMemoryDocumentChunkStore` + `MockModelGateway`.

- Happy path: `extracted → generating → review_pending`, drafts persisted with citations.
- Conflict guard: non-`extracted` document rejected.
- Citation writes: every generated content has `citationChunkIds` mapped to real chunks; no-citation content rejected.
- **Idempotency/regeneration required test:** two identical generation calls with the same `generation_key` must **not** create duplicate `generated_contents`.
- Audit events emitted.
- Non-disclosing `not_found` for missing/cross-org documents.

### 9.4 Integration — `pr18-generation-api.test.ts`

- Sign-in → org → course → upload → extract → generate → list generated.
- Asserts 200 + draft contents + document `review_pending`.
- 401 / 404 / 403 cases.

### 9.5 Schema — extend `database/tests/schema.test.ts`

- `generated_contents` has `generation_key` column (if migration added).

---

## 10. Migration strategy

- **No breaking change**; reuses PR6-1 tables.
- Add `database/migrations/0006_generation_idempotency.ts` (additive, `IF NOT EXISTS`, reversible) before PR6-5 workers rely on it.
- Feature-gate the new generate/review routes behind availability of `GeneratedContentStore` + `ModelGateway` in `v1.ts`.
- **PR6-4** delivers the foundation.
- **PR6-5** adds real per-type generation workers + BullMQ (replaces only route orchestration).
- **PR6-6** adds accept/reject/regenerate mutations and materialization.

---

## 11. Scope guard (recap)

- ✅ No frontend, no flashcard/quiz UX.
- ✅ No real AI provider — only the mock provider for tests.
- ✅ Follows AVANA store/service/policy architecture.
- ✅ Organization scoping + non-disclosing 404.
- ✅ Audit events on all mutations.
- ✅ OpenAPI contracts + hand-authored generated types.
- ✅ Async-ready: worker entry points with no request coupling; no BullMQ yet.
- ✅ Citations required for every generated artifact.
- ✅ Document lifecycle and generated-content lifecycle kept separate.

---

## 12. Risks

| Risk                                               | Mitigation                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mock provider diverges from real provider behavior | `ModelGateway` interface is the contract; mock is schema-faithful; real providers added behind the same interface |
| Double draft creation on worker redelivery         | `generation_key` + partial unique index; idempotency test                                                         |
| Content without source grounding                   | Citation enforcement at service layer; reject no-citation artifacts                                               |
| Status conflation (document vs content)            | Explicit separation of document lifecycle and generated-content lifecycle                                         |
| Real provider accidentally used before ready       | `createModelGateway` throws `unprocessable` for unimplemented real providers                                      |
