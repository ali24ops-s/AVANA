# Sprint 6: AI Learning Engine — Architecture Proposal

---

**Status:** Proposal for review — no implementation authorized by this document  
**Owner:** CTO and Engineering  
**Baseline:** `docs/TECHNICAL_BLUEPRINT.md`, ADR 0003, Sprint 2 Learning Core, PR5-A content publication  
**Scope:** Design only. No application code, migrations, dependencies, or configuration changes.

---

## 1. Sprint Goal

Enable a **student to upload their own educational material** (PDF or lecture notes) and receive a **personalized, AI-generated study pack** built from that material.

### 1.1 Primary workflow

1. **Upload** — Student uploads a PDF or notes file through the web app.
2. **Analyze** — AVANA extracts text, structures it into chunks, and runs AI generation.
3. **Generate** — AI produces a structured set of learning resources:
   - **Lessons** — digestible, source-grounded explanations organized into modules/lessons.
   - **Flashcards** — active-recall cards with spaced-repetition scheduling.
   - **Quizzes** — practice questions with answers and explanations.
   - **Study recommendations** — prioritized topics, weak-area suggestions, and a study roadmap.

### 1.2 Design principles

- **Source-grounded** — every generated resource links to the source document chunks (citations). AI is assistive and editable, never authoritative.
- **Human-in-the-loop** — generated content enters as a _draft_ and is only visible to the student after **review/acceptance**.
- **Provider-agnostic** — no coupling to a specific AI vendor; a model gateway owns provider selection.
- **Asynchronous** — all expensive work runs in background workers; the API returns `202 + job` status.
- **Tenant-isolated** — every record is organization-scoped; students only ever see their own material.
- **Incremental** — delivered in reviewable PR-sized slices (see §8).

### 1.3 Non-goals

- No billing, no LMS/SSO integration, no institutional sharing, no public AI chat.
- No vector search/embeddings in this sprint unless measured need emerges (blueprint: pgvector later).
- No teacher/editor AI authoring tools; AI output is per-student study material.

---

## 2. Architecture Overview

### 2.1 Pipeline

```
Student uploads PDF/notes
        │
        ▼
┌────────────────────┐
│ 1. Document upload  │  Signed URL → private object storage; metadata row created
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 2. Storage         │  Private S3-compatible bucket; original retained & versioned
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 3. Text extraction │  Worker: parse PDF → extract text + page map (OCR only when needed)
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 4. Chunking        │  Split text into semantic chunks with headings/page ranges/hashes
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 5. AI processing   │  Model gateway → generation workers propose lessons/flashcards/
│                    │  quizzes/recommendations, each linked to source chunks
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 6. Review/accept   │  Student reviews drafts; accepts/edits/regenerates per item
└────────────────────┘
        │
        ▼
┌────────────────────┐
│ 7. Learning        │  Accepted content becomes live Lessons, Flashcards, Quizzes,
│ resources          │  and Study recommendations under the course
└────────────────────┘
```

### 2.2 Architectural roles

| Role              | Responsibility                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **API**           | Upload intent, ownership/authorization, job orchestration, review endpoints, reads       |
| **Storage**       | Private object storage for originals; signed upload/download URLs                        |
| **Workers**       | Extraction, chunking, AI generation; one job type per stage, idempotent consumers        |
| **Model gateway** | Sole caller of AI providers; provider selection, retries, cost/token accounting          |
| **Queue**         | Redis + BullMQ job queue; retries, dead-letter, priority                                 |
| **Database**      | Transactional source of truth for documents, chunks, generated content, learning records |

### 2.3 Data flow detail

1. Client requests an **upload intent** (`POST /documents/upload-intent`) → API authorizes ownership against the organization/course, returns a short-lived signed URL and a `document_id`.
2. Client uploads directly to storage with the signed URL; file metadata (name, size, sha256) is recorded.
3. API marks the document `pending_validation`; a worker downloads, verifies checksum/MIME/magic bytes, quarantines unsafe files.
4. Valid files move to `extracting`; the extraction worker parses text and stores page metadata + chunks.
5. When chunks are ready, the document moves to `generating`; generation workers call the model gateway to propose lessons, flashcards, quizzes, and recommendations — each item stored as a **draft** `generated_content` linked to citation chunks.
6. The document moves to `review_pending`; the student reviews drafts and accepts/edits/regenerates.
7. Accepted items become live learning resources (lessons in the Learning Core, flashcards, quizzes) and the document moves to `ready`.

---

## 3. Database Design Proposal

All tables follow AVANA conventions: UUID primary keys, UTC `timestamptz`, `organization_id` on tenant-bound records (or an enforced ownership path), `created_at`/`updated_at`/`deleted_at` lifecycle fields.

### 3.1 Existing AVANA tables used (no change)

| Table             | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `organizations`   | Tenant root; every new record scopes to an organization                  |
| `users`           | Actor identity                                                           |
| `courses`         | Container for study material and generated learning resources            |
| `modules`         | Learning Core grouping; generated lessons attach here                    |
| `lessons`         | Accepted lessons land here with `publication_status` (PR5-A)             |
| `lesson_progress` | Student completion of generated lessons                                  |
| `audit_logs`      | Immutable audit trail for uploads, generation, acceptance, and deletions |

### 3.2 Proposed new tables

#### 3.2.1 `documents`

The uploaded original and its lifecycle state.

| Field             | Type              | Notes                                   |
| ----------------- | ----------------- | --------------------------------------- |
| `id`              | uuid PK           |                                         |
| `organization_id` | uuid FK → orgs    | Tenant ownership (direct)               |
| `course_id`       | uuid FK → courses | Owning course (nullable until assigned) |
| `owner_user_id`   | uuid FK → users   | Uploader; file owner                    |
| `original_name`   | varchar(255)      | Client filename (sanitized)             |
| `mime_type`       | varchar(100)      | Validated MIME                          |
| `size_bytes`      | bigint            | Validated size                          |
| `sha256`          | char(64)          | Content hash for dedupe/integrity       |
| `storage_key`     | varchar(500)      | Private object-storage key              |
| `page_count`      | integer           | Populated after extraction              |
| `status`          | varchar(30)       | Lifecycle (see §4.5)                    |
| `error_code`      | varchar(100)      | Last failure code (nullable)            |
| `retry_count`     | integer           | Incremented on retry                    |
| `created_at`      | timestamptz       |                                         |
| `updated_at`      | timestamptz       |                                         |
| `deleted_at`      | timestamptz       | Soft delete                             |

**Indexes:**

- `UNIQUE (organization_id, sha256)` — duplicate-upload detection (soft-delete aware).
- `(organization_id, course_id)` — tenant/course listing.
- `(owner_user_id)` — "my uploads".
- `(status)` — worker polling queues.

#### 3.2.2 `document_chunks`

Semantic chunks produced by the chunking stage; the citation basis for all AI output.

| Field             | Type                | Notes                                            |
| ----------------- | ------------------- | ------------------------------------------------ |
| `id`              | uuid PK             |                                                  |
| `document_id`     | uuid FK → documents | Owning document (ON DELETE CASCADE)              |
| `organization_id` | uuid FK → orgs      | Tenant ownership (denormalized for scoped reads) |
| `sequence`        | integer             | Order within the document                        |
| `heading`         | varchar(500)        | Nearest heading (nullable)                       |
| `content`         | text                | Chunk text                                       |
| `start_page`      | integer             | Source page range                                |
| `end_page`        | integer             |                                                  |
| `token_estimate`  | integer             | For cost/limits                                  |
| `content_hash`    | char(64)            | Dedupe/chunk stability                           |
| `created_at`      | timestamptz         |                                                  |

**Indexes:**

- `UNIQUE (document_id, sequence)` — stable ordering.
- `(document_id)` — fetch all chunks for generation.
- `(organization_id, content_hash)` — dedupe across docs.

#### 3.2.3 `generated_contents`

Every AI-produced draft item, regardless of type (lesson, flashcard batch, quiz, recommendation). One row per generated unit.

| Field             | Type                | Notes                                                 |
| ----------------- | ------------------- | ----------------------------------------------------- |
| `id`              | uuid PK             |                                                       |
| `organization_id` | uuid FK → orgs      | Tenant ownership                                      |
| `document_id`     | uuid FK → documents | Source document                                       |
| `course_id`       | uuid FK → courses   | Target course                                         |
| `type`            | varchar(30)         | `lesson` \| `flashcard` \| `quiz` \| `recommendation` |
| `status`          | varchar(30)         | `draft` \| `accepted` \| `rejected` \| `edited`       |
| `payload`         | jsonb               | Typed content payload (see below)                     |
| `prompt_version`  | varchar(50)         | For regeneration/cost analysis                        |
| `model`           | varchar(100)        | Model used (recorded by gateway)                      |
| `token_usage`     | jsonb               | Input/output tokens, cost estimate                    |
| `accepted_at`     | timestamptz         |                                                       |
| `accepted_by`     | uuid FK → users     | Actor who accepted                                    |
| `created_at`      | timestamptz         |                                                       |
| `updated_at`      | timestamptz         |                                                       |
| `deleted_at`      | timestamptz         |                                                       |

**Indexes:**

- `(organization_id, document_id, type)` — fetch drafts by document/type.
- `(organization_id, course_id, status)` — review queue.
- `(status)` — worker/queue processing.

**Citation linkage:** a join table `generated_content_citations (generated_content_id, document_chunk_id)` records which chunks support each generated item. This is the enforcement point for the **source-grounded** principle.

#### 3.2.4 `flashcards`

Accepted flashcards (projected from `generated_contents` where `type = 'flashcard'`, or materialized here at acceptance).

| Field                  | Type                         | Notes                                               |
| ---------------------- | ---------------------------- | --------------------------------------------------- |
| `id`                   | uuid PK                      |                                                     |
| `organization_id`      | uuid FK → orgs               | Tenant ownership                                    |
| `course_id`            | uuid FK → courses            | Owning course                                       |
| `document_id`          | uuid FK → documents          | Source document                                     |
| `generated_content_id` | uuid FK → generated_contents | Link to draft                                       |
| `question`             | text                         | Front                                               |
| `answer`               | text                         | Back                                                |
| `explanation`          | text                         | Optional rationale                                  |
| `card_type`            | varchar(30)                  | `definition` \| `mechanism` \| `clinical_case` \| … |
| `difficulty`           | varchar(10)                  | `easy` \| `medium` \| `hard`                        |
| `created_at`           | timestamptz                  |                                                     |
| `updated_at`           | timestamptz                  |                                                     |
| `deleted_at`           | timestamptz                  |                                                     |

**Indexes:**

- `(organization_id, course_id)` — deck listing.
- `(document_id)` — regeneration/cleanup.

#### 3.2.5 `flashcard_reviews`

Immutable spaced-repetition review history (FSRS-style).

| Field          | Type                 | Notes                                 |
| -------------- | -------------------- | ------------------------------------- |
| `id`           | uuid PK              |                                       |
| `flashcard_id` | uuid FK → flashcards | Card reviewed                         |
| `user_id`      | uuid FK → users      | Reviewer                              |
| `rating`       | varchar(10)          | `again` \| `hard` \| `good` \| `easy` |
| `reviewed_at`  | timestamptz          |                                       |
| `reaction_ms`  | integer              | Optional latency metric               |

**Indexes:**

- `(flashcard_id, user_id, reviewed_at)` — schedule computation.
- `(user_id, reviewed_at)` — analytics.

#### 3.2.6 `quizzes`

Accepted quizzes.

| Field             | Type                | Notes                  |
| ----------------- | ------------------- | ---------------------- |
| `id`              | uuid PK             |                        |
| `organization_id` | uuid FK → orgs      | Tenant ownership       |
| `course_id`       | uuid FK → courses   | Owning course          |
| `document_id`     | uuid FK → documents | Source document        |
| `title`           | varchar(255)        |                        |
| `status`          | varchar(20)         | `draft` \| `published` |
| `created_at`      | timestamptz         |                        |
| `updated_at`      | timestamptz         |                        |
| `deleted_at`      | timestamptz         |                        |

**Indexes:** `(organization_id, course_id)`.

#### 3.2.7 `quiz_questions`

Questions belonging to a quiz.

| Field                  | Type                         | Notes                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------- |
| `id`                   | uuid PK                      |                                                   |
| `quiz_id`              | uuid FK → quizzes            | Owning quiz (ON DELETE CASCADE)                   |
| `generated_content_id` | uuid FK → generated_contents | Link to draft                                     |
| `question`             | text                         |                                                   |
| `question_type`        | varchar(30)                  | `multiple_choice` \| `true_false` \| `fill_blank` |
| `choices`              | jsonb                        | Ordered choice array (nullable)                   |
| `correct_answer`       | jsonb                        | Correct answer(s) — server-held                   |
| `explanation`          | text                         | Rationale                                         |
| `sort_order`           | integer                      |                                                   |
| `created_at`           | timestamptz                  |                                                   |
| `updated_at`           | timestamptz                  |                                                   |

**Indexes:** `(quiz_id, sort_order)`.

#### 3.2.8 `quiz_attempts`

One row per student attempt at a quiz, plus per-question answers.

| Field          | Type              | Notes                              |
| -------------- | ----------------- | ---------------------------------- |
| `id`           | uuid PK           |                                    |
| `quiz_id`      | uuid FK → quizzes | Owning quiz                        |
| `user_id`      | uuid FK → users   | Student                            |
| `score`        | numeric(5,2)      | Percentage (0–100)                 |
| `answers`      | jsonb             | Question → selected answer mapping |
| `started_at`   | timestamptz       |                                    |
| `completed_at` | timestamptz       |                                    |

**Indexes:** `(quiz_id, user_id, completed_at)`; `(user_id, completed_at)` for analytics.

### 3.3 Relationship summary

```
Organization ── courses ── modules ── lessons
      │               │
      │               ├── documents ── document_chunks
      │               │        │
      │               │        └── generated_contents ── generated_content_citations
      │               │                     │ (type = flashcard/quiz/lesson/recommendation)
      │               │                     ├── flashcards ── flashcard_reviews ── user
      │               │                     └── quizzes ── quiz_questions ── quiz_attempts ── user
      │               └── (accepted lesson content) ── lessons ── lesson_progress ── user
      │
      └── audit_logs (uploads, generation, acceptance, edits, deletions)
```

### 3.4 Integration with the Learning Core

- **Lessons** reuse the existing `modules` + `lessons` tables. When a student accepts a generated lesson, a `lesson` row is created (or proposed into a module) with `publication_status = 'published'` **only for the owning student's scope**. Learner APIs already filter drafts; we extend scoping so generated lessons are visible to the owner student (and, later, to a course if the student shares it).
- **Progress** flows into `lesson_progress` unchanged.
- **Recommendations** can be represented as a `generated_content` of type `recommendation` and surfaced in study analytics; they may later map to `study_plans` from the blueprint without schema churn.
- **Audit** reuses `audit_logs`; new audit actions (`document.uploaded`, `document.processed`, `content.accepted`, `content.rejected`, `content.regenerated`, `flashcard.reviewed`, `quiz.attempted`) extend the domain audit helper set.
- All new tables are **additive** and independent of existing FK constraints except through `organization_id`, `course_id`, and the new document/generated-content graph, so they can be introduced without migrating existing rows.

### 3.5 Ownership rules

| Resource             | Owner                               | Tenant scope                               |
| -------------------- | ----------------------------------- | ------------------------------------------ |
| `documents`          | Uploading student (`owner_user_id`) | `organization_id` + `course_id` membership |
| `document_chunks`    | Inherited from document             | `organization_id` (denormalized)           |
| `generated_contents` | Owning student via document/course  | `organization_id`                          |
| `flashcards`         | Student (via course)                | `organization_id`                          |
| `quizzes`            | Student (via course)                | `organization_id`                          |
| reviews/attempts     | Individual student                  | `organization_id`                          |

---

## 4. AI Processing Architecture

### 4.1 Extraction layer

A dedicated worker module with a small interface so parsers are swappable:

```ts
interface TextExtractor {
  canHandle(mimeType: string): boolean;
  extract(input: { storageKey: string }): Promise<ExtractionResult>;
}
type ExtractionResult = {
  pages: Array<{ pageNumber: number; text: string; confidence?: number }>;
  metadata?: { title?: string; language?: string };
};
```

- PDF parsing first; PPT/DOC support behind the same interface.
- **OCR only when necessary** (scanned/image pages) and isolated in resource-limited workers.
- Extraction output is stored as page metadata + chunks; raw text never enters logs.

### 4.2 Chunking strategy

- **Semantic, not fixed-size only**: split on headings/paragraph boundaries where possible, with a target size (e.g. ~1,000–1,500 tokens) and overlap to preserve context.
- Each chunk records `heading`, `start_page`/`end_page`, and a `content_hash` for stability and dedupe.
- Chunk count/size feeds token-cost budgeting and determines generation batching.
- Deterministic and re-runnable: the same document produces the same chunks (stable hash), enabling idempotent regeneration.

### 4.3 AI provider abstraction (model gateway)

To **avoid coupling to a specific AI provider**, all model calls go through a gateway interface:

```ts
interface ModelGateway {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
type CompletionRequest = {
  promptVersion: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: unknown; // structured output contract
  correlationId: string;
};
type CompletionResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
};
```

Responsibilities of the gateway:

- **Provider selection** (e.g. primary/fallback) based on policy, not hardcoded vendor.
- **Retries & circuit breakers** — transient failures retry with backoff; persistent failures trip a breaker and fail fast.
- **Budget/cost control** — per-org/per-document token budgets; refuse over-budget generation.
- **Structured output validation** — validate JSON against a schema before persistence.
- **Observability** — record model, version, prompt version, token usage, cost, latency, and correlation ID for every call.
- **Semantic caching** — identical chunk+prompt hashes can skip redundant calls.

Generation workers depend on `ModelGateway`, never on a vendor SDK directly.

### 4.4 Worker / job processing flow

Jobs are queued on **Redis + BullMQ**; consumers live in `apps/worker`.

```
Job: document_validate     → verify checksum/MIME/scan, quarantine on failure
Job: document_extract      → text extraction → store chunks → enqueue generate
Job: content_generate      → per type (lessons, flashcards, quizzes, recommendations)
Job: content_finalize      → mark document ready, notify client (polling/webhook-ready)
```

Rules:

- **Idempotent consumers** — each job records a claimed state; re-delivery does not double-create rows (unique keys + `status` guards).
- **Transactional outbox** — state changes and queue enqueues are atomic via the outbox pattern from the blueprint.
- **Per-job concurrency limits** and per-organization rate limits to protect cost and throughput.
- Dead-letter queue for jobs exceeding max retries; an operator queue for inspection.

### 4.5 Status lifecycle

Document lifecycle:

```
uploaded → pending_validation → validating → pending_extraction → extracting
        → pending_chunking → chunking → pending_generation → generating
        → review_pending → ready
        → failed (with error_code, retry_count, last error, quarantine if unsafe)
```

Generated-content item lifecycle:

```
draft → accepted  → (materialized as lesson/flashcard/quiz)
     → rejected
     → edited → accepted
     → regenerating (on student request) → draft
```

### 4.6 Retry / failure handling

| Failure                          | Handling                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| Transient extraction/network     | Automatic retry with exponential backoff (max N attempts)           |
| AI provider timeout / 5xx        | Gateway retry on fallback provider; circuit breaker after threshold |
| Malformed AI JSON                | Schema validation + up to one regeneration with corrective prompt   |
| Unsafe / invalid upload          | Quarantine, mark document `failed`, audit event, no AI run          |
| Over-budget generation           | Fail fast to `review_pending` with a "budget exceeded" notice       |
| Duplicate document (same sha256) | Reuse existing document/chunks or prompt user, do not re-process    |

---

## 5. API Proposal (future endpoints — not implemented in this sprint)

All endpoints follow AVANA conventions: `/v1`, organization-scoped, `requireAuth`, domain policy authorization, audit on writes, `202 + job` for long-running work. **These are proposals only.**

### 5.1 Document upload

```
POST /v1/organizations/:organizationId/courses/:courseId/documents/upload-intent
  → 200 { document_id, upload_url, expires_at }          // signed upload URL

POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/complete
  → 200 { document_id, status }                          // verify checksum, enqueue validate/extract

GET  /v1/organizations/:organizationId/courses/:courseId/documents
  → 200 { documents: [...] }                             // list my uploads (student-owned)
```

### 5.2 Document status

```
GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId
  → 200 { document_id, status, error_code, page_count, chunk_count, timestamps }

GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/status
  → 200 { status, progress_stage, failed, retry_count }  // lightweight polling
```

### 5.3 Generated content review

```
GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated
  → 200 { contents: [{ id, type, status, payload, citations }] }

PATCH /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId
  → 200 { content }                                      // edit payload before acceptance

POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId/accept
  → 200 { content, resource }                            // materialize lesson/flashcard/quiz

POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId/reject

POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId/regenerate
  → 202 { job_id }                                       // async regeneration
```

### 5.4 Flashcards

```
GET  /v1/organizations/:organizationId/courses/:courseId/flashcards
  → 200 { flashcards, next_review_count }

GET  /v1/organizations/:organizationId/courses/:courseId/flashcards/review-queue
  → 200 { due_cards }

POST /v1/organizations/:organizationId/courses/:courseId/flashcards/:flashcardId/review
  → 200 { next_review_at }                               // rating → schedule
```

### 5.5 Quizzes

```
GET  /v1/organizations/:organizationId/courses/:courseId/quizzes
GET  /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId
POST /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts   // submit answers
GET  /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts/:attemptId
```

### 5.6 Study analytics

```
GET /v1/organizations/:organizationId/courses/:courseId/study/analytics
  → 200 { mastery_by_topic, weak_areas, recommended_next_steps }

GET /v1/organizations/:organizationId/courses/:courseId/study/recommendations
  → 200 { recommendations }                             // from accepted type=recommendation content
```

---

## 6. Frontend Flow (UX)

The frontend reuses and wires the existing prototype screens (`UploadPage`, `ProcessingPage`, `FlashcardExperience`, `QuizExperience`, learning pages) to real API data.

### 6.1 Student journey

```
┌──────────┐     ┌────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Upload   │ ──► │ Processing │ ──► │ Review AI Study  │ ──► │ Learn / Flashcards  │
│ file     │     │ (async     │     │ Pack (drafts)    │     │ / Quiz / Recommendations
│          │     │  status)   │     │ accept · edit ·  │     │
│ PDF/notes│     │            │     │ reject · regen   │     │
└──────────┘     └────────────┘     └──────────────────┘     └─────────────────────┘
```

1. **Upload** — Student selects a file; the app requests an upload intent, uploads directly via signed URL, then shows the file preview with estimated resource counts (existing `UploadPage`).
2. **Processing** — App polls `GET .../documents/:id/status`; the existing `ProcessingPage` checklist maps to real stage names (validate → extract → chunk → generate → finalize) with live progress and error/retry states.
3. **Review AI study pack** — When status = `review_pending`, show grouped drafts (Lessons, Flashcards, Quizzes, Recommendations). Each item shows source citations; student can **accept**, **edit**, **reject**, or **regenerate** per item. This is the human-in-the-loop acceptance gate.
4. **Learn / Flashcards / Quiz** — Accepted resources appear under the course:
   - Lessons render through the existing Learning Core reader with progress tracking.
   - Flashcards run the existing spaced-repetition experience against real cards + review submission.
   - Quizzes use the existing quiz experience, submitting attempts and viewing scores.
   - Study analytics/recommendations surface weak areas and next steps.

### 6.2 Component mapping

| Prototype component   | Sprint 6 role                                         |
| --------------------- | ----------------------------------------------------- |
| `UploadPage`          | Upload intent + signed-URL upload flow                |
| `ProcessingPage`      | Real-time job status with stage/progress/error UI     |
| `ReviewStudyPackPage` | **New** — draft review, accept/edit/reject/regenerate |
| `FlashcardExperience` | Real flashcards + review submission                   |
| `QuizExperience`      | Real quizzes + attempt submission                     |
| `LearningPage`        | Study pack hub (lessons, decks, quizzes, analytics)   |

### 6.3 Data fetching

TanStack Query with:

- Polling on the document/job status endpoint during processing (interval, backoff, cancel).
- Optimistic acceptance/edits in the review screen.
- Query invalidation on accept/reject/regenerate and on review/attempt submission.

---

## 7. Security Considerations

### 7.1 File ownership

- `documents.owner_user_id` defines the owner; all reads/writes require the actor to be that owner **or** have a course membership granting access.
- Signed upload/download URLs are short-lived, single-purpose, and scoped to one object key.

### 7.2 Organization isolation

- Every new table carries `organization_id`; queries are always organization-scoped first (never by ID alone), matching the existing `findByIdForUser`/membership resolution pattern.
- Cross-tenant access returns a non-disclosing `not_found`.
- Optional PostgreSQL RLS is defense-in-depth (blueprint) once rows are populated.

### 7.3 Permissions (role matrix)

| Action                        | student (owner) | course_editor | org_admin | platform_admin |
| ----------------------------- | --------------- | ------------- | --------- | -------------- |
| Upload document               | ✓ (own course)  | ✓             | ✓         | support only   |
| View own uploads/status       | ✓ (own only)    | ✓             | ✓         | —              |
| Review/accept generated items | ✓ (own only)    | ✓             | ✓         | —              |
| Use flashcards/quizzes        | ✓ (own only)    | ✓             | ✓         | —              |
| Delete document/content       | ✓ (own only)    | ✓ (course)    | ✓         | ✓ support      |

New policy actions added to the domain authorization module: `document:upload`, `document:read`, `content:review`, `content:accept`, `content:reject`, `content:regenerate`, `flashcard:review`, `quiz:attempt`.

### 7.4 Audit events

New audit actions recorded for: upload intent, upload complete, validation failure/quarantine, extraction start/finish, generation start/finish, content accept/reject/edit/regenerate, flashcard review, quiz attempt, and document delete. Audit payloads never include file contents, chunk text, or AI payload bodies — only IDs, statuses, counts, and metadata.

### 7.5 Uploaded file validation

- **Type allowlist**: PDF, PPT/PPTX, DOC/DOCX; reject everything else.
- **Size limit** (e.g. 50 MB) enforced client-side and server-side.
- **Magic-byte/MIME verification** on the server; extension alone is never trusted.
- **Checksum (sha256)** verified after upload and stored for integrity + duplicate detection.
- **Malware scanning** in isolated workers; unsafe files are quarantined and never extracted or sent to AI.
- Uploaded files are private; signed URLs are the only access path.

---

## 8. Migration Strategy (incremental, PR6-N)

Implemented as reviewable PR slices. Each PR is independently buildable and testable; no PR ships application code ahead of its schema/contract.

| PR        | Scope                                                                                                                                                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PR6-1** | **Schema + domain primitives** — new tables (`documents`, `document_chunks`, `generated_contents`, `flashcards`, `flashcard_reviews`, `quizzes`, `quiz_questions`, `quiz_attempts`), Drizzle migration (additive, no existing-row migration), domain IDs/audit-action types, policy actions. **No application code.** |
| **PR6-2** | **Upload pipeline** — upload-intent/complete endpoints, signed-URL storage abstraction (in-memory/local for dev), file validation, `documents` store/service, worker placeholder for validate.                                                                                                                        |
| **PR6-3** | **Extraction + chunking** — `TextExtractor` interface + PDF parser, chunking strategy, `document_chunks` store, worker job, status transitions, idempotent consumers.                                                                                                                                                 |
| **PR6-4** | **Model gateway** — `ModelGateway` interface, provider adapter (config-gated, no hardcoded vendor), structured-output validation, token/cost accounting, retry/circuit-breaker, observability hooks.                                                                                                                  |
| **PR6-5** | **Generation workers** — lesson/flashcard/quiz/recommendation generation jobs, citation linkage (`generated_content_citations`), draft persistence, budget guardrails.                                                                                                                                                |
| **PR6-6** | **Review/acceptance API** — generated-content read/edit/accept/reject/regenerate endpoints, materialization of accepted content into `lessons`, `flashcards`, `quizzes`.                                                                                                                                              |
| **PR6-7** | **Study consumption + analytics** — flashcards review scheduling, quiz attempts, study analytics/recommendations endpoints, audit events.                                                                                                                                                                             |
| **PR6-8** | **Frontend integration** — wire `UploadPage` → real processing status → new ReviewStudyPackPage → Flashcards/Quiz/Learning pages with TanStack Query.                                                                                                                                                                 |
| **PR6-9** | **Sprint integration & exit gate** — E2E student journey, accessibility smoke, cost/quality regression harness, runbook updates, Sprint 6 exit report.                                                                                                                                                                |

Dependencies: PR6-1 → PR6-2 → PR6-3 → (PR6-4, PR6-5) → PR6-6 → PR6-7 → PR6-8 → PR6-9. PR6-4 and PR6-5 may be reviewed in parallel once PR6-3 lands.

**Rollback posture:** migrations are additive; down migrations drop only the new tables. Feature flags gate upload/generation routes until each PR is verified.

---

## 9. Risks

| Risk                                                              | Likelihood | Impact | Mitigation                                                                                                                                      |
| ----------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Large PDFs** (slow extraction/generation, timeouts)             | High       | Medium | Size/page limits, chunk-level processing, async jobs with status polling, concurrency caps, per-doc budgets                                     |
| **AI hallucination** (incorrect facts presented as study content) | High       | High   | Source-grounded citations on every item, structured-output schema validation, human review gate before acceptance, "AI is assistive" disclosure |
| **Token cost** (unbounded generation)                             | High       | Medium | Per-doc/per-org token budgets, semantic caching by chunk hash, cost accounting in gateway, model selection policy                               |
| **Duplicate generation** (same upload reprocessed)                | Medium     | Medium | `UNIQUE (organization_id, sha256)` dedupe, idempotent jobs, stable chunk hashes, "reuse existing" prompt                                        |
| **Content quality control** (low-quality or off-topic output)     | Medium     | High   | Quality gates (schema, citation coverage, answer validity, safety), review/acceptance, regenerate-with-feedback, regression eval suite          |

### 9.1 Additional operational risks

| Risk                     | Mitigation                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Provider outage          | Multi-provider fallback via gateway, circuit breakers, queue retention                               |
| PII in uploaded material | Prompts minimize personal content; no raw text in logs; private storage; retention/deletion controls |
| Review gate abandonment  | Clear status UX, notifications when review is pending, no auto-acceptance                            |
| Job queue backpressure   | Priority queues, concurrency limits, dead-letter inspection, alerts                                  |

---

## 10. Summary

Sprint 6 introduces AVANA's AI Learning Engine as a **source-grounded, student-owned, human-reviewed generation pipeline**. It builds directly on the existing Learning Core (modules/lessons/progress), the PR5-A publication boundary, the organization-scoped store/service/policy pattern, and the blueprint's target architecture (private storage → workers → model gateway). The design is **provider-agnostic**, **async-first**, and **incrementally deliverable** via PR6-1 through PR6-9. No code, migrations, or dependencies are introduced by this document.
