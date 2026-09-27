import { describe, it, expect, vi, beforeEach } from "vitest";
import { CourseDraftService } from "./course-draft-service.js";
import {
  asCourseId,
  asCourseDraftSessionId,
  asCourseDraftChangeId,
  asUserId,
  asOrganizationId,
  parseUUID,
} from "@avana/domain";
import type { Actor, CourseDraftSessionRecord, CourseDraftChangeRecord } from "@avana/domain";
import type { CourseStore } from "./course-store.js";
import type {
  CourseDraftSessionStore,
  CourseDraftChangeStore,
  CourseReleaseStore,
} from "./course-draft-store.js";

describe("CourseDraftService", () => {
  const courseId = asCourseId(parseUUID("11111111-1111-4111-8111-111111111111"));
  const orgId = asOrganizationId(parseUUID("22222222-2222-4222-8222-222222222222"));
  const userId = asUserId(parseUUID("33333333-3333-4333-8333-333333333333"));
  const sessionId = asCourseDraftSessionId(parseUUID("44444444-4444-4444-8444-444444444444"));
  const changeId = asCourseDraftChangeId(parseUUID("55555555-5555-4555-8555-555555555555"));

  const adminActor: Actor = {
    userId,
    role: "platform_admin",
  };

  let mockCourseStore: CourseStore;
  let mockDraftSessionStore: CourseDraftSessionStore;
  let mockDraftChangeStore: CourseDraftChangeStore;
  let mockReleaseStore: CourseReleaseStore;
  let service: CourseDraftService;

  beforeEach(() => {
    mockCourseStore = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: courseId,
        organizationId: orgId,
        name: "Official Biology",
        subject: "Biology",
        version: 1,
        isOfficial: true,
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      }),
      findByIdForUser: vi.fn(),
      listByOrganization: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as CourseStore;

    mockDraftSessionStore = {
      create: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
      findById: vi.fn().mockResolvedValue({
        id: sessionId,
        courseId,
        baseCourseVersion: 1,
        source: "manual",
        status: "draft",
        title: "Test Draft",
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      findActiveByCourse: vi.fn().mockResolvedValue(undefined),
      listByCourse: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockDraftChangeStore = {
      upsert: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, id: changeId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteBySessionAndEntity: vi.fn().mockResolvedValue(undefined),
      findBySessionAndEntity: vi.fn().mockResolvedValue(undefined),
      listBySession: vi.fn().mockResolvedValue([]),
      deleteBySession: vi.fn().mockResolvedValue(undefined),
    };

    mockReleaseStore = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCourseAndVersion: vi.fn(),
      listByCourse: vi.fn(),
      findLatestByCourse: vi.fn(),
    };

    service = new CourseDraftService({
      courseStore: mockCourseStore,
      draftSessionStore: mockDraftSessionStore,
      draftChangeStore: mockDraftChangeStore,
      releaseStore: mockReleaseStore,
    });
  });

  it("1. getOrCreateActiveSession: creates new session if none active", async () => {
    const session = await service.getOrCreateActiveSession(adminActor, courseId, {
      title: "New Edits",
    });

    expect(mockDraftSessionStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId,
        baseCourseVersion: 1,
        status: "draft",
        title: "New Edits",
      }),
    );
    expect(session.baseCourseVersion).toBe(1);
  });

  it("2. getOrCreateActiveSession: returns existing active session if one exists", async () => {
    const existing: CourseDraftSessionRecord = {
      id: sessionId,
      courseId,
      baseCourseVersion: 1,
      source: "manual",
      status: "draft",
      title: "Existing Active",
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(mockDraftSessionStore.findActiveByCourse).mockResolvedValue(existing);

    const session = await service.getOrCreateActiveSession(adminActor, courseId);
    expect(session.id).toBe(sessionId);
    expect(mockDraftSessionStore.create).not.toHaveBeenCalled();
  });

  it("3. recordChange: upserts new change into draft", async () => {
    const res = await service.recordChange(adminActor, sessionId, {
      entityType: "lesson",
      entityId: "lesson-1",
      action: "create",
      parentId: "module-1",
      sortOrder: 0,
      payload: {
        before: null,
        after: { title: "Lesson 1" },
      },
    });

    expect(mockDraftChangeStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "lesson-1",
        action: "create",
      }),
    );
    expect(res).toBeDefined();
  });

  it("4. recordChange: removes change if create -> delete", async () => {
    const existingChange: CourseDraftChangeRecord = {
      id: changeId,
      draftSessionId: sessionId,
      courseId,
      entityType: "lesson",
      entityId: "lesson-1",
      action: "create",
      parentId: "module-1",
      sortOrder: 0,
      payload: { before: null, after: { title: "Lesson 1" } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(mockDraftChangeStore.findBySessionAndEntity).mockResolvedValue(existingChange);

    const res = await service.recordChange(adminActor, sessionId, {
      entityType: "lesson",
      entityId: "lesson-1",
      action: "delete",
      payload: { before: null, after: null },
    });

    expect(mockDraftChangeStore.delete).toHaveBeenCalledWith(changeId);
    expect(res).toBeNull();
  });

  it("5. discardSession: updates status to discarded", async () => {
    await service.discardSession(adminActor, sessionId);
    expect(mockDraftSessionStore.updateStatus).toHaveBeenCalledWith(sessionId, "discarded");
  });

  it("6. validateSession: fails if course version has moved ahead", async () => {
    vi.mocked(mockCourseStore.findById).mockResolvedValue({
      id: courseId,
      organizationId: orgId,
      name: "Official Biology",
      subject: "Biology",
      version: 2, // version bumped from 1 to 2!
      isOfficial: true,
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const report = await service.validateSession(adminActor, sessionId);
    expect(report.valid).toBe(false);
    expect(report.errors[0]).toContain("تضاد نسخه");
    expect(mockDraftSessionStore.updateStatus).toHaveBeenCalledWith(sessionId, "draft");
  });

  it("7. validateSession: fails if child references parent marked for deletion", async () => {
    vi.mocked(mockDraftChangeStore.listBySession).mockResolvedValue([
      {
        id: changeId,
        draftSessionId: sessionId,
        courseId,
        entityType: "module",
        entityId: "module-to-delete",
        action: "delete",
        parentId: null,
        sortOrder: 0,
        payload: { before: { title: "Old Module" }, after: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: asCourseDraftChangeId(parseUUID("66666666-6666-4666-8666-666666666666")),
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "lesson-orphan",
        action: "update",
        parentId: "module-to-delete",
        sortOrder: 0,
        payload: { before: { title: "Old Lesson" }, after: { title: "Updated Lesson" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const report = await service.validateSession(adminActor, sessionId);
    expect(report.valid).toBe(false);
    expect(report.hasParentChildConflict).toBe(true);
    expect(report.errors[0]).toContain("در فصلی قرار دارد که برای حذف علامت‌گذاری شده است");
  });

  it("8. validateSession: succeeds and transitions to ready when clean", async () => {
    vi.mocked(mockDraftChangeStore.listBySession).mockResolvedValue([
      {
        id: changeId,
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "lesson-valid",
        action: "update",
        parentId: "module-active",
        sortOrder: 0,
        payload: { before: { title: "Old Lesson" }, after: { title: "Valid Lesson" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const report = await service.validateSession(adminActor, sessionId);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(mockDraftSessionStore.updateStatus).toHaveBeenCalledWith(sessionId, "ready");
  });

  it("9. getPreviewHierarchy: renders live hierarchy with draft changes overlay", async () => {
    const mockAdminStore = {
      getCourseHierarchy: vi.fn().mockResolvedValue({
        id: courseId,
        name: "Official Biology",
        subject: "Biology",
        modules: [
          {
            id: "mod-1",
            title: "Live Chapter 1",
            sortOrder: 0,
            subCourseGroupId: null,
            lessons: [
              {
                id: "les-1",
                title: "Live Lesson 1",
                publicationStatus: "published",
                flashcardCount: 5,
                quizCount: 2,
                hasContent: true,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
      }),
    };

    const previewService = new CourseDraftService({
      courseStore: mockCourseStore,
      draftSessionStore: mockDraftSessionStore,
      draftChangeStore: mockDraftChangeStore,
      releaseStore: mockReleaseStore,
      adminStore: mockAdminStore as any,
    });

    vi.mocked(mockDraftSessionStore.findActiveByCourse).mockResolvedValue({
      id: sessionId,
      courseId,
      baseCourseVersion: 1,
      source: "manual",
      status: "draft",
      title: "Preview Test Draft",
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(mockDraftChangeStore.listBySession).mockResolvedValue([
      {
        id: changeId,
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "les-1",
        action: "update",
        parentId: "mod-1",
        sortOrder: 0,
        payload: { before: { title: "Live Lesson 1" }, after: { title: "Updated Draft Lesson 1" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: asCourseDraftChangeId(parseUUID("77777777-7777-4777-8777-777777777777")),
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "les-2-new",
        action: "create",
        parentId: "mod-1",
        sortOrder: 1,
        payload: { before: null, after: { title: "Brand New Lesson 2", contentMarkdown: "# Content" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const preview = await previewService.getPreviewHierarchy(adminActor, courseId);
    expect(preview.isDraftPreview).toBe(true);
    expect(preview.pendingChangesCount).toBe(2);
    expect(preview.modules).toHaveLength(1);
    expect(preview.modules[0].lessons).toHaveLength(2);

    const updatedLes = preview.modules[0].lessons.find((l) => l.id === "les-1");
    expect(updatedLes?.title).toBe("Updated Draft Lesson 1");
    expect(updatedLes?.draftAction).toBe("update");

    const newLes = preview.modules[0].lessons.find((l) => l.id === "les-2-new");
    expect(newLes?.title).toBe("Brand New Lesson 2");
    expect(newLes?.draftAction).toBe("create");
  });

  it("10. publishDraftSession: atomically increments version and creates release manifest", async () => {
    vi.mocked(mockDraftChangeStore.listBySession).mockResolvedValue([
      {
        id: changeId,
        draftSessionId: sessionId,
        courseId,
        entityType: "lesson",
        entityId: "les-1",
        action: "update",
        parentId: "mod-1",
        sortOrder: 0,
        payload: { before: { title: "Live Lesson 1" }, after: { title: "Published Lesson 1" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    vi.mocked(mockReleaseStore.create).mockImplementation((record) =>
      Promise.resolve({
        ...record,
        publishedAt: new Date().toISOString(),
      }),
    );

    const result = await service.publishDraftSession(adminActor, sessionId);

    // Version bumped monotonically from 1 to 2
    expect(result.course.version).toBe(2);
    expect(mockCourseStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2 }),
    );

    // Release recorded
    expect(mockReleaseStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId,
        versionNumber: 2,
        baseVersion: 1,
        draftSessionId: sessionId,
        changesSummary: expect.objectContaining({
          lessonsUpdated: 1,
          totalOperations: 1,
        }),
      }),
    );

    // Draft session marked as published
    expect(mockDraftSessionStore.updateStatus).toHaveBeenCalledWith(sessionId, "published");
  });

  it("11. publishDraftSession: throws conflict if live course version moved ahead", async () => {
    vi.mocked(mockCourseStore.findById).mockResolvedValue({
      id: courseId,
      organizationId: orgId,
      name: "Official Biology",
      subject: "Biology",
      version: 5, // live is ahead of draft base version (1)
      isOfficial: true,
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(service.publishDraftSession(adminActor, sessionId)).rejects.toThrow(
      /امکان انتشار پیش‌نویس وجود ندارد|تضاد نسخه/,
    );
  });

  it("12. rollbackRelease: restores content to prior version and increments version monotonically", async () => {
    vi.mocked(mockReleaseStore.findByCourseAndVersion).mockResolvedValue({
      id: asCourseDraftChangeId(parseUUID("88888888-8888-4888-8888-888888888888")) as any,
      courseId,
      versionNumber: 1,
      baseVersion: 1,
      draftSessionId: null,
      changesSummary: { totalOperations: 1 },
      manifest: [
        {
          entityType: "lesson",
          entityId: "les-1",
          action: "update",
          identityOperation: "updated",
          parentId: "mod-1",
          sortOrderBefore: 0,
          sortOrderAfter: 0,
          before: null,
          after: { title: "Restored V1 Lesson", contentMarkdown: "# V1" },
        },
      ],
      publishedBy: userId,
      publishedAt: new Date().toISOString(),
    });

    vi.mocked(mockReleaseStore.create).mockImplementation((record) =>
      Promise.resolve({
        ...record,
        publishedAt: new Date().toISOString(),
      }),
    );

    // Current course is at version 2
    vi.mocked(mockCourseStore.findById).mockResolvedValue({
      id: courseId,
      organizationId: orgId,
      name: "Official Biology",
      subject: "Biology",
      version: 2,
      isOfficial: true,
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const result = await service.rollbackRelease(adminActor, courseId, 1, "Testing rollback");

    // Monotonically increments version (2 -> 3), never decrements!
    expect(result.course.version).toBe(3);
    expect(mockCourseStore.update).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 }),
    );

    expect(mockReleaseStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId,
        versionNumber: 3,
        baseVersion: 2,
        changesSummary: expect.objectContaining({
          type: "rollback",
          targetVersion: 1,
        }),
      }),
    );
  });
});
