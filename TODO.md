# PR5-D2 — Fix Role Resolution for Content Management

## Plan Steps

- [x] 0. Audit auth flow (identity module, /v1/me, sessions, org memberships, web auth context)
- [x] 1. Update OpenAPI contract (add `memberships` to MeResponse/SignInResponse, add `UserMembership`)
- [x] 2. Update TypeScript generated contracts (add `UserMembership`, `memberships` on responses)
- [x] 3. Update backend `/v1/me` + `/v1/auth/sign-in` to expose membership roles (keep `user.role` unchanged)
- [x] 4. Update frontend auth types/state (AuthProvider exposes `memberships`)
- [x] 5. Update `coursePermissions` to derive permission from membership roles (reuse helpers)
- [x] 6. Update `ManageContentLink`, `RequireCourseManager`, `LearningPage` to use memberships
- [x] 7. Update backend test `pr5d2-role-resolution.test.ts` to assert memberships
- [x] 8. Update frontend tests (coursePermissions, ManageContentLink, RequireCourseManager)
- [x] 9. Run `npm run type-check`, `npm run lint`, `npm test`, `npm run build`

---

# PR5-D4 — Module CRUD (authoring workflow)

## Scope delivered

- Backend module CRUD via content routes/service/store:
  - `POST /v1/organizations/:orgId/courses/:courseId/modules` — create module
  - `PATCH /v1/organizations/:orgId/courses/:courseId/modules/:moduleId` — update (rename/description)
  - `DELETE /v1/organizations/:orgId/courses/:courseId/modules/:moduleId` — soft-delete (archive)
  - Validation (required title, max length 255, description nullable)
  - Audit events: `module.created`, `module.updated`, `module.deleted`
  - Authorization via existing content permissions (`content:write`)
- Frontend module management on `CourseContentPage`:
  - New Module dialog (`NewModuleDialog.tsx`)
  - Rename module (inline edit form)
  - Delete module with confirmation (soft-delete)
  - Content tree refresh after mutations (React Query invalidation)
  - Loading and error states (isPending, serverError)
- Excluded (per scope): drag-and-drop, reordering, nested modules, autosave

## Files changed

- `packages/domain/src/authorization/audit.ts` — `auditModuleCreated/Updated/Deleted`
- `packages/domain/src/authorization/index.ts` — re-export module audit helpers
- `packages/contracts/openapi/v1.yaml` — module paths + `ContentModuleSummary`, `CreateContentModuleRequest`, `UpdateContentModuleRequest`, `ContentModuleResponse`
- `packages/contracts/src/generated/index.ts` — module contract types
- `apps/api/src/modules/learning/learning-store.ts` — `ModuleStore.create/update/delete`
- `apps/api/src/modules/learning/drizzle-stores.ts` — Drizzle module store CRUD
- `apps/api/src/modules/learning/test/in-memory-stores.ts` — in-memory module store CRUD
- `apps/api/src/modules/learning/content-service.ts` — `createModule`, `updateModule`, `deleteModule`
- `apps/api/src/modules/learning/content-routes.ts` — module route handlers
- `apps/web/src/lib/api/content.ts` — `createModule`, `updateModule`, `deleteModule`
- `apps/web/src/components/content/NewModuleDialog.tsx` — create module dialog
- `apps/web/src/pages/CourseContentPage.tsx` — module accordion edit/delete + dialogs
- `apps/api/src/test/pr15-content.test.ts` — integration tests (module + lesson)

## Verification

### PR15 end-to-end (live API)

- Signed in as `alice@example.com`
- Org: `b4a0b464-16db-4087-92b7-163a1e6f6776`
- Course: `5a767d70-a58b-469b-b6f0-2192ffe92ce7`
- Module: `b9f19eab-68d4-43c5-be5a-efcdb3bea71f`

1. **Content tree refresh after mutation** — `GET /v1/organizations/:orgId/courses/:courseId/content`
   - `module_found: true`
   - `module_title: "PR5-D4 Renamed Module"` (rename reflected)
   - `module_lessons: 1`
   - `lesson_status: draft` (before publish)
2. **Lesson publish** — `POST .../lessons/:lessonId/publish`
   - Response `publication_status: "published"`
   - Note: must not send `Content-Type: application/json` with an empty body — Fastify returns `FST_ERR_CTP_EMPTY_JSON_BODY` (mapped to 500 `internal_error`). The endpoint takes no body.
3. **Learner visibility** — `GET /v1/courses/:courseId/learn`
   - Verification Lesson (`fbe34f0d-5516-4e17-856c-e99da4e41f65`) now visible to learners
   - `progress.total_lessons: 7` (6 seeded published + 1 newly published)

### Automated tests

- `pr15-content.test.ts` — 21 tests passing (content read, create/update/publish lesson, draft filtering, audit events)
