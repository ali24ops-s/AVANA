# Sprint 2: Learning Core — Architecture Proposal

---

## 1. Executive Summary

**What we're building:** Transform `Course` from a flat entity into a hierarchical learning structure: **Course → Module → Lesson → Content**.

**Why this design?** The current Course model is just a named container with metadata (subject, exam date). Users sign up for courses to _learn_, but there's nothing to learn yet. This sprint adds the simplest possible structure to support sequential learning — not a full LMS, just enough to let a student open a course, see modules/lessons, and view content.

**Design principles (MVP, not LMS):**

- Flat is better than nested — only 1 level of modules, 1 level of lessons
- Content is single-type initially (we'll use `markdown` as the MVP content type)
- Ordering is explicit (`sort_order` integer), not implied by dates
- Progress tracking is minimal (boolean `completed` per lesson per user)
- No branching, no prerequisites, no scheduling, no versioning

---

## 2. Domain Model

### 2.1 New Tables

```sql
-- A module is a major topic within a course
-- e.g. "Pharmacology Basics" → "Drug Classifications"
CREATE TABLE modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_modules_course ON modules (course_id, sort_order);

-- A lesson is a single learning unit inside a module
CREATE TABLE lessons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  content_type varchar(50) NOT NULL DEFAULT 'markdown',
  content_markdown text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  estimated_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_lessons_module ON lessons (module_id, sort_order);

-- Track which lessons a user has completed
CREATE TABLE lesson_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX idx_lesson_progress_user ON lesson_progress (user_id);
CREATE INDEX idx_lesson_progress_lesson ON lesson_progress (lesson_id);
```

### 2.2 What is MVP vs Future

| Feature            | Sprint 2 (MVP)                               | Future                                  |
| ------------------ | -------------------------------------------- | --------------------------------------- |
| Content type       | `markdown` only via `content_markdown` field | `content_video`, `content_quiz` columns |
| Progress           | `completed: boolean`                         | `progress: 0-100`, time-spent tracking  |
| Ordering           | Fixed `sort_order` per module/lesson         | Drag-reorder, prerequisites             |
| Content versioning | None                                         | Version history per lesson              |
| Auto-progress      | None                                         | Auto-advance, spaced repetition         |
| Nested modules     | 1 level (module → lesson)                    | Sub-modules, parallel tracks            |

### 2.3 Relationship Summary

```
Course (exists)
  └── Module (new)
       └── Lesson (new)
            └── Content Markdown (new field: content_markdown)

User ── lesson_progress ── Lesson
```

---

## 3. API Design (MVP — Learning Consumption Only)

Per product decision: **no CRUD APIs for modules/lessons in Sprint 2**. Only student-facing read + progress endpoints.

### 3.1 Endpoints

All endpoints follow existing AVANA patterns:

- Scoped to `/:organizationId` — never by ID alone
- Protected by `requireAuth` middleware
- Authorization via domain policy layer
- Audit events on writes

```
GET    /v1/organizations/:orgId/courses/:courseId/learn
       → Full learning structure: course + modules + lessons + user progress
       → Response: CourseLearnResponse

GET    /v1/organizations/:orgId/courses/:courseId/modules/:modId/lessons/:lessonId
       → Single lesson content (markdown rendered server-side if needed)
       → Response: LessonResource

POST   /v1/organizations/:orgId/courses/:courseId/modules/:modId/lessons/:lessonId/progress
       → Toggle lesson completion for current user
       → Request: { completed: boolean }
       → Response: { lesson_id, completed, completed_at }

GET    /v1/organizations/:orgId/courses/:courseId/progress
       → Course-level progress summary
       → Response: CourseProgressResource
```

### 3.2 Authorization Rules (MVP)

| Action           | student       | course_editor | org_admin     |
| ---------------- | ------------- | ------------- | ------------- |
| `learning:read`  | ✓             | ✓             | ✓             |
| `progress:write` | ✓ (self only) | ✓ (self only) | ✓ (self only) |
| `progress:read`  | ✓ (self only) | ✓ (self only) | ✓ (self only) |

### 3.3 Contract Types

```ts
export type ModuleLearnResource = {
  id: UUID;
  course_id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: LessonLearnResource[];
};

export type LessonLearnResource = {
  id: UUID;
  module_id: UUID;
  title: string;
  content_type: string;
  content_markdown: string;
  sort_order: number;
  estimated_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
};

export type CourseProgressResource = {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
};

export type CourseLearnResponse = {
  request_id: string;
  course: CourseResource;
  modules: ModuleLearnResource[];
  progress: CourseProgressResource;
};
```

### 3.4 Request/Response Examples

**GET /v1/organizations/:orgId/courses/:courseId/learn**

```json
// Response 200
{
  "request_id": "uuid",
  "course": {
    "id": "uuid",
    "title": "Pharmacology Basics",
    "subject": "Pharmacy",
    "exam_at": null
  },
  "modules": [
    {
      "id": "uuid",
      "course_id": "uuid",
      "title": "Drug Classifications",
      "description": "Understanding how drugs are categorized",
      "sort_order": 1,
      "lessons": [
        {
          "id": "uuid",
          "module_id": "uuid",
          "title": "Introduction to Drug Classes",
          "content_type": "markdown",
          "content_markdown": "# Drug Classes\n\nDrugs are substances that...",
          "sort_order": 1,
          "estimated_minutes": 10,
          "completed": false,
          "completed_at": null
        }
      ]
    }
  ],
  "progress": {
    "total_lessons": 9,
    "completed_lessons": 0,
    "progress_percent": 0
  }
}
```

**POST .../lessons/:lessonId/progress**

```json
// Request
{ "completed": true }
// Response 200
{ "lesson_id": "uuid", "completed": true, "completed_at": "2025-01-15T10:30:00Z" }
```

---

## 4. Frontend Design

### 4.1 Pages & Components

| Page                       | Route                | Purpose                                               |
| -------------------------- | -------------------- | ----------------------------------------------------- |
| CourseDetailPage (rewrite) | `/courses/:courseId` | Shows course with module/lesson tree + content viewer |

**Component tree:**

```
CourseDetailPage (rewritten)
  ├── CourseHeader (existing, enhanced with progress badge)
  ├── ProgressBar (new) — shows course-wide progress %
  ├── LearningLayout (new) — two-column layout
  │    ├── Left Panel: ModuleList (new)
  │    │    ├── ModuleCard (new) — expandable/collapsible accordion
  │    │    │    ├── ModuleHeader (title, lesson count, expand toggle)
  │    │    │    └── (for each lesson) LessonItem (new)
  │    │    │         ├── Checkbox (completed/not)
  │    │    │         └── Lesson title (clickable — selects lesson)
  │    │    └── (repeated for each module)
  │    └── Right Panel: LessonContent (new)
  │         ├── LessonHeader (title, estimated time, completion status)
  │         ├── MarkdownRenderer (new)
  │         │    └── Renders content_markdown as styled HTML
  │         └── CompleteButton (new)
  │              ├── "Mark as complete" (when not completed)
  │              └── "Completed ✓" (when completed)
```

### 4.2 User Flow (MVP)

1. User clicks a course on CourseListPage → navigates to `/courses/:courseId`
2. CourseDetailPage loads: fetches `GET /learn` — one call returns course + modules + lessons + progress
3. Left panel: accordion of modules. First module is expanded by default
4. First incomplete lesson is auto-selected in the right panel
5. Right panel: renders lesson `content_markdown` as styled markdown
6. User reads content, clicks **"Mark as complete"** at the bottom
7. Optimistic UI update: checkbox checks, progress bar fills
8. Next incomplete lesson auto-selects

### 4.3 Data Fetching Strategy

```ts
// apps/web/src/lib/api/learning.ts
export function createLearningApi(client: ApiClient) {
  return {
    getCourseLearn(
      orgId: string,
      courseId: string,
    ): Promise<CourseLearnResponse> {
      return client.get(`/v1/organizations/${orgId}/courses/${courseId}/learn`);
    },
    getLesson(
      orgId: string,
      courseId: string,
      modId: string,
      lessonId: string,
    ): Promise<LessonResource> {
      return client.get(
        `/v1/organizations/${orgId}/courses/${courseId}/modules/${modId}/lessons/${lessonId}`,
      );
    },
    markLessonComplete(
      orgId: string,
      courseId: string,
      modId: string,
      lessonId: string,
      completed: boolean,
    ): Promise<void> {
      return client.post(
        `/v1/organizations/${orgId}/courses/${courseId}/modules/${modId}/lessons/${lessonId}/progress`,
        { completed },
      );
    },
    getCourseProgress(
      orgId: string,
      courseId: string,
    ): Promise<CourseProgressResponse> {
      return client.get(
        `/v1/organizations/${orgId}/courses/${courseId}/progress`,
      );
    },
  };
}
```

---

## 5. Implementation Phases (PR-sized tasks)

### Phase 1: Database Schema + Domain Primitives ← **START HERE**

**Scope:** Schema definitions, migration, domain types, audit events, policy actions.

**Files:**

- `database/schema/index.ts` — add `modules`, `lessons`, `lesson_progress` table definitions
- `database/migrations/0003_learning_core.ts` — new migration file (up/down)
- `packages/domain/src/ids.ts` — add `ModuleId`, `LessonId` branded types
- `packages/domain/src/authorization/audit.ts` — add learning audit event helpers
- `packages/domain/src/authorization/policy.ts` — add `learning:read`, `progress:write`, `progress:read` actions
- `packages/domain/src/index.ts` — re-export new types

**Verification:** `npm run test` passes in `packages/domain`, migration SQL is valid and idempotent.

**After Phase 1: STOP and wait for review.**

### Phase 2: API — Learning Consumption Endpoints

**Scope:** In-memory stores, learn service, progress routes, contract types.

**Files:**

- `apps/api/src/modules/learning/` — new module directory
- `apps/api/src/modules/learning/learn-store.ts` — store interfaces (ModuleStore, LessonStore, ProgressStore)
- `apps/api/src/modules/learning/learn-service.ts` — assembles course + modules + lessons + progress
- `apps/api/src/modules/learning/learn-routes.ts` — HTTP layer with 4 endpoints
- `apps/api/src/modules/learning/progress-service.ts` — progress business logic
- `apps/api/src/modules/learning/test/in-memory-stores.ts` — test stores
- `apps/api/src/modules/learning/index.ts` — barrel export
- `apps/api/src/routes/v1.ts` — register learning routes
- `apps/api/src/server/composeLocalDev.ts` — wire learning stores
- `packages/contracts/src/generated/index.ts` — add MVP contract types

### Phase 3: Seed Data — Realistic Pharmacy Content

**Scope:** Rich educational content for the demo.

**Files:**

- `apps/api/src/dev/seed.ts` — add 1 complete pharmacy course:
  - **Pharmacology Basics** (3 modules, 9 lessons)
  - Each lesson has real educational markdown content
  - Lessons cover: Drug Classifications, Pharmacokinetics (ADME), Pharmacodynamics

### Phase 4: Frontend — Course Learning UI

**Scope:** Rewrite CourseDetailPage, new learning components.

**Files:**

- `apps/web/src/pages/CourseDetailPage.tsx` — REWRITE
- `apps/web/src/components/learning/ProgressBar.tsx` — NEW
- `apps/web/src/components/learning/ModuleList.tsx` — NEW
- `apps/web/src/components/learning/ModuleCard.tsx` — NEW
- `apps/web/src/components/learning/LessonItem.tsx` — NEW
- `apps/web/src/components/learning/LessonContent.tsx` — NEW
- `apps/web/src/components/learning/MarkdownRenderer.tsx` — NEW
- `apps/web/src/lib/api/learning.ts` — NEW API client

### Phase 5: Integration Tests

**Scope:** Full integration test coverage.

**Files:**

- `apps/api/src/test/pr14-learning-core.test.ts` — NEW

---

## 6. Intentional Postponements (Anti-Patterns to Avoid)

| Feature                                 | Why We're Not Doing It Now                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Rich content types (video, interactive) | Markdown + `content_markdown` field is sufficient. Adding `content_video` etc. later is purely additive. |
| Module/Lesson CRUD APIs                 | Not needed until we build an authoring UI. For MVP, content is seeded and managed via DB migrations.     |
| Drag-and-drop reordering                | The `sort_order` integer is the data foundation. Drag UI is a separate feature.                          |
| Prerequisites / branching               | Over-engineered for MVP. Linear learning (module 1 → 2 → 3) is sufficient.                               |
| Content versioning                      | Unnecessary until multiple people edit concurrently.                                                     |
| File attachments / inline images        | Markdown can reference external URLs. Local file uploads require storage infrastructure (S3, etc.)       |
| Sub-modules / multi-level nesting       | 1 level is cleaner for MVP content. Don't over-abstract with recursive tree model.                       |
| Rich text editor (WYSIWYG)              | MVP editors write markdown directly.                                                                     |
| Time tracking / analytics               | `estimated_minutes` is stored but not used by UX yet.                                                    |

---

## 7. Risks & Tradeoffs

| Risk                                                               | Likelihood | Impact | Mitigation                                                                        |
| ------------------------------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------- |
| N+1 queries when rendering course tree                             | High       | High   | Use composite `GET /learn` endpoint — one query returns everything.               |
| Progress data inconsistency (lesson deleted but progress orphaned) | Low        | Low    | `ON DELETE CASCADE` on foreign keys cleans up automatically.                      |
| Over-building progress tracking                                    | Medium     | Medium | MVP is a single `boolean` per user/lesson. Don't add time_spent, attempts, score. |
| Frontend becomes complex                                           | Low        | Medium | Keep it simple: CourseDetailPage owns the entire tree. No nested router outlets.  |
| Content migration from Sprint 1 courses                            | Low        | Low    | Sprint 1 courses have zero content. No-op.                                        |

---

## 8. Files Aff
