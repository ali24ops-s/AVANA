# PR6-7 — Study Consumption + Analytics

**Status:** Complete

## Implementation Steps

### Phase 1 — Domain + schema + policy + audit

- [x] Add `packages/domain/src/study.ts` — `FlashcardRating` (`again|hard|good|easy`), `FlashcardReviewInput`, `QuizAnswerInput`, `QuizAttemptResult`, `StudyAnalytics`, `StudyRecommendation`, and pure `nextReviewInterval(rating, previousInterval, easeFactor)` (FSRS-inspired/minimal scheduling function)
- [x] Add policy actions `flashcard:review`, `quiz:attempt`, `study:read` to `packages/domain/src/authorization/policy.ts` (student + editor + org_admin; not support/platform)
- [x] Add audit actions `flashcard.reviewed`, `quiz.attempted` + `auditFlashcardReviewed()` / `auditQuizAttempted()` helpers to `packages/domain/src/authorization/audit.ts`; extend `AuditEntityType` with `flashcard`, `flashcard_review`, `quiz`, `quiz_attempt`
- [x] Export new helpers in `authorization/index.ts`; export `study.ts` in `packages/domain/src/index.ts`
- [x] Add `due_at` (+ `interval_days`, `ease_factor`) columns to `flashcards` in `database/schema/index.ts`
- [x] Create `database/migrations/0009_study_consumption.ts` (additive, reversible)
- [x] Extend `database/tests/schema.test.ts` with new column assertions
- [x] Create `packages/domain/src/test/pr6-7-study.test.ts` (policy, audit, scheduling)

### Phase 2 — Flashcard/quiz stores + persistence

- [x] Create `apps/api/src/modules/study/study-store.ts` — `FlashcardRecord`, `FlashcardReviewRecord`, `FlashcardStore`, `FlashcardReviewStore`, `QuizRecord`, `QuizQuestionRecord`, `QuizAttemptRecord`, `QuizStore`, `QuizQuestionStore`, `QuizAttemptStore`
- [x] Create `apps/api/src/modules/study/drizzle-stores.ts` (Drizzle implementations)
- [x] Create `apps/api/src/modules/study/test/in-memory-stores.ts` (in-memory implementations)
- [x] Create `apps/api/src/modules/study/index.ts` exports

### Phase 3 — ReviewService materialization + generation enablement

- [x] Extend `ENABLED_GENERATION_TYPES` in `packages/domain/src/generation.ts` to `lesson | flashcard | quiz` (recommendation stays disabled)
- [x] Extend `MockModelGateway` in `apps/api/src/modules/generation/gateway/mock.ts` to produce deterministic, schema-valid flashcard + quiz payloads with citationChunkIds
- [x] Extend `ReviewService.acceptContent` in `apps/api/src/modules/generation/review-service.ts` to materialize accepted `flashcard` and `quiz` content (idempotent via `generated_content_id` FK; rejected/regenerating never materialized)
- [x] Extend `review-service.test.ts` with flashcard/quiz materialization + idempotency tests
- [x] Extend `pr19-review-api.test.ts` with flashcard/quiz accept materialization integration assertions

### Phase 4 — Study services

- [x] Create `apps/api/src/modules/study/study-service.ts`:
  - Flashcard review (synchronous, uses `nextReviewInterval`, updates `due_at`, emits audit)
  - Review queue (list due cards for a user in a course)
  - Quiz attempts (percentage score, immutable, multiple attempts, emits audit)
  - Study analytics/recommendations (derived from accepted lessons + flashcard reviews + quiz attempts + progress; no dependency on recommendation generation)
- [x] Create `apps/api/src/modules/study/study-service.test.ts`

### Phase 5 — Routes + contracts + composition/wiring

- [x] Create `apps/api/src/modules/study/study-routes.ts` (flashcards list/review-queue/review, quizzes list/get/attempts, study analytics/recommendations)
- [x] Wire `studyRoutes` in `apps/api/src/routes/v1.ts` behind store guard
- [x] Compose study stores in `apps/api/src/server/composeLocalDev.ts` and `composeProduction.ts`
- [x] Update `packages/contracts/openapi/v1.yaml` (PR6-7 section: FlashcardResource, QuizResource, StudyAnalyticsResponse, etc.)
- [x] Update `packages/contracts/src/generated/index.ts` (hand-authored types)

### Phase 6 — Integration tests + verification

- [x] Create `apps/api/src/test/pr20-study-api.test.ts` — full pipeline (happy + negative cases)
- [x] Run `npm run type-check`
- [x] Run `npm run lint`
- [x] Run `npm test`
- [x] Run `npm run build`
- [x] Run `npm run validate:openapi --workspace @avana/contracts`

---

## Architectural & Documentation Notes

- **Flashcard Mastery Estimation**: The current `flashcard_mastery_percent` calculation in `StudyService` (based on `due_at > now + 7 days`) is a lightweight operational heuristic to identify well-spaced flashcards, not a formal cognitive mastery model.
- **Spaced Repetition Scheduling**: The algorithm implemented in `packages/domain/src/study.ts` (`nextReviewInterval`, `nextDueAt`) is intentionally an **FSRS-inspired** deterministic approximation (leveraging interval multiplication, ease factors, and rating scales `again | hard | good | easy`) rather than a full 17-parameter FSRS statistical/neural model.
- **Materialization Invariant**: AI-generated flashcards and quizzes remain non-learner-facing drafts until accepted by a `course_editor` or `organization_admin` via `ReviewService.acceptContent`. Materialization is idempotent via `generated_content_id`.

