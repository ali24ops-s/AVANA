# PR5-A: Lesson Publication and Minimal Content API

Status: approved for implementation.

## Scope

PR5-A adds a publication boundary around the existing Course → Module → Lesson model. It does not add an authoring UI, module CRUD, reordering, archive workflows, an advanced editor, or an admin dashboard.

### Included

- `lessons.publication_status` with `draft` and `published` values
- Existing lessons migrated to `published`; newly created lessons default to `draft`
- Learner APIs hide drafts and exclude them from progress
- Organization-scoped editor read API:
  - `GET /v1/organizations/:organizationId/courses/:courseId/content`
- Organization-scoped lesson mutation APIs:
  - `POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons`
  - `PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId`
  - `POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId/publish`
- Authorization for course editors and organization administrators
- Audit events for lesson creation, update, and publication
- Contracts, seed updates, and automated tests

## Domain and API rules

- New lessons are Markdown drafts and are appended to their existing module.
- Clients cannot set publication state, content type, or sort order directly.
- Publishing requires a non-empty title and Markdown body.
- Publishing is idempotent and does not emit duplicate audit events.
- Published lessons remain directly editable; successful edits are immediately learner-visible.
- Update audit records include changed field names and Markdown metadata (`length` and SHA-256 `hash`) when content changes, never the Markdown body.
- The content read endpoint includes drafts and publication state for authorized editors, while learner APIs remain publication-filtered.
- Every editor endpoint validates organization → course → module → lesson ancestry and uses non-disclosing not-found failures.

## Migration order

The migration must execute in this exact order:

1. Add nullable `publication_status`.
2. Backfill existing lessons to `published`.
3. Add a check constraint allowing only `draft` and `published`.
4. Set `publication_status` to `NOT NULL`.
5. Set its default to `draft`.

The down migration removes the constraint and column without deleting lesson data.

## Persistence decision

PR5-A uses the existing store abstractions and in-memory runtime. It establishes and verifies API behavior but is not durable across API restarts. PostgreSQL-backed stores and a database composition root should be implemented before a real authoring UI or production authoring workflow is built.

## Additional requirements (confirmed before implementation)

1. **Authoring read endpoint**: `GET /v1/organizations/:organizationId/courses/:courseId/content` is editor-only and separates authoring APIs from learner APIs.
2. **`publication_status`**: Kept exactly as proposed (`draft` | `published`).
3. **Update audit rules**: Updates to published lessons become visible immediately. Audit events record:
   - Changed field names
   - Content metadata only (length and SHA-256 hash)
   - Never the full markdown content
4. **Migration order** (exact):
   - Add nullable column
   - Backfill existing lessons as `published`
   - Add check constraint
   - Set `NOT NULL`
   - Set default `draft`

## Verification phases

1. Schema, migration, contracts, authorization, and audit primitives
2. Store and service behavior, including draft filtering and content hashing
3. HTTP routes, seed compatibility, and integration tests
4. Full repository type-check and test suite
