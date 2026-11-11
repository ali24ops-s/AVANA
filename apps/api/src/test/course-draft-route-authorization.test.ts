import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  asCourseId,
  asModuleId,
  asLessonId,
  asCoursePublicationId,
  asCourseReleaseId,
} from "@avana/domain";
import {
  InMemoryCourseStore,
  InMemoryCoursePublicationStore,
} from "../modules/courses/test/in-memory-stores.js";
import type {
  CourseDraftSessionStore,
  CourseDraftChangeStore,
  CourseReleaseStore,
  CourseDraftSessionRecord,
  CourseDraftChangeRecord,
  CourseReleaseRecord,
} from "../modules/courses/course-draft-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { CourseDraftService } from "../modules/courses/course-draft-service.js";
import { LearningService } from "../modules/learning/learning-service.js";

describe("Course Draft & Release Endpoints: Real Fastify Route & Guard Authorization", () => {
  const config = loadApiConfig();
  config.session.maxAgeMs = 86400000;
  config.logging.level = "silent";
  const systemOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  config.systemOrganizationId = systemOrgId;

  let sessionStore: InMemorySessionStore;
  let orgStore: InMemoryOrganizationStore;
  let userStore: InMemoryUserStore;
  let adminStore: InMemoryAdminStore;
  let courseStore: InMemoryCourseStore;
  let publicationStore: InMemoryCoursePublicationStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;

  let draftSessionsMap: Map<string, CourseDraftSessionRecord>;
  let draftSessionStore: CourseDraftSessionStore;
  let draftChangesMap: Map<string, CourseDraftChangeRecord>;
  let draftChangeStore: CourseDraftChangeStore;
  let releasesMap: Map<string, CourseReleaseRecord>;
  let releaseStore: CourseReleaseStore;

  let draftService: CourseDraftService;
  let learningService: LearningService;
  let sessionService: SessionService;
  let app: ReturnType<typeof createApp>;

  // Users
  let communityCreator: { userId: UserId; token: string; orgId: OrganizationId };
  let strangerUser: { userId: UserId; token: string; orgId: OrganizationId };
  let studentUser: { userId: UserId; token: string; orgId: OrganizationId };
  let officialCreator: { userId: UserId; token: string; orgId: OrganizationId };
  let platformAdmin: { userId: UserId; token: string; orgId: OrganizationId };

  // Courses
  const communityCourseId = asCourseId(randomUUID() as any);
  const communityModuleId = asModuleId(randomUUID() as any);
  const communityLessonId = asLessonId(randomUUID() as any);

  const officialCourseId = asCourseId(randomUUID() as any);
  const officialModuleId = asModuleId(randomUUID() as any);
  const officialLessonId = asLessonId(randomUUID() as any);

  async function registerUser(email: string, role: Role, globalRole?: Role, orgId?: OrganizationId) {
    const user = await userStore.createUserWithPassword({ email, passwordHash: "secret" });
    if (globalRole) {
      user.globalRole = globalRole;
      user.role = globalRole;
      userStore.insert({ ...user });
    }
    const effectiveOrg = orgId ?? (randomUUID() as OrganizationId);
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: effectiveOrg,
      userId: user.id as UserId,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const session = await sessionService.createSession(user.id);
    return { userId: user.id as UserId, token: session.sessionToken, orgId: effectiveOrg };
  }

  beforeAll(async () => {
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    courseStore = new InMemoryCourseStore();
    publicationStore = new InMemoryCoursePublicationStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();

    (adminStore as any).learningStores = { courseStore, lessonStore, moduleStore };
    (adminStore as any).lessonStore = lessonStore;
    (adminStore as any).moduleStore = moduleStore;

    draftSessionsMap = new Map();
    draftSessionStore = {
      create: async (s) => {
        const rec = { ...s, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        draftSessionsMap.set(s.id, rec);
        return rec;
      },
      findById: async (id) => draftSessionsMap.get(id),
      findActiveByCourse: async (cId) =>
        Array.from(draftSessionsMap.values()).find(
          (s) => s.courseId === cId && ["draft", "validating", "ready"].includes(s.status),
        ),
      listByCourse: async (cId) =>
        Array.from(draftSessionsMap.values()).filter((s) => s.courseId === cId),
      updateStatus: async (id, status) => {
        const s = draftSessionsMap.get(id);
        if (s) {
          s.status = status;
          s.updatedAt = new Date().toISOString();
        }
      },
      update: async (s) => {
        draftSessionsMap.set(s.id, { ...s, updatedAt: new Date().toISOString() });
        return draftSessionsMap.get(s.id)!;
      },
    };

    draftChangesMap = new Map();
    draftChangeStore = {
      upsert: async (c) => {
        const existing = Array.from(draftChangesMap.values()).find(
          (x) => x.draftSessionId === c.draftSessionId && x.entityType === c.entityType && x.entityId === c.entityId,
        );
        const id = existing?.id ?? ((randomUUID() as any));
        const rec: CourseDraftChangeRecord = {
          id,
          draftSessionId: c.draftSessionId,
          courseId: c.courseId,
          entityType: c.entityType,
          entityId: c.entityId,
          action: c.action,
          parentId: c.parentId ?? null,
          sortOrder: c.sortOrder ?? null,
          payload: c.payload,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        draftChangesMap.set(id, rec);
        return rec;
      },
      delete: async (id) => { draftChangesMap.delete(id); },
      deleteBySessionAndEntity: async (sId, type, eId) => {
        for (const [k, v] of draftChangesMap.entries()) {
          if (v.draftSessionId === sId && v.entityType === type && v.entityId === eId) {
            draftChangesMap.delete(k);
          }
        }
      },
      findBySessionAndEntity: async (sId, type, eId) =>
        Array.from(draftChangesMap.values()).find(
          (x) => x.draftSessionId === sId && x.entityType === type && x.entityId === eId,
        ),
      listBySession: async (sId) =>
        Array.from(draftChangesMap.values()).filter((x) => x.draftSessionId === sId),
      listBySessionAndType: async (sId, type) =>
        Array.from(draftChangesMap.values()).filter((x) => x.draftSessionId === sId && x.entityType === type),
    };

    releasesMap = new Map();
    releaseStore = {
      create: async (r) => {
        const rec = { ...r, createdAt: new Date().toISOString() };
        releasesMap.set(r.id, rec);
        return rec;
      },
      findById: async (id) => releasesMap.get(id),
      findByCourseAndVersion: async (cId, ver) =>
        Array.from(releasesMap.values()).find((r) => r.courseId === cId && r.versionNumber === ver),
      findLatestByCourse: async (cId) => {
        const list = Array.from(releasesMap.values()).filter((r) => r.courseId === cId);
        if (list.length === 0) return undefined;
        return list.sort((a, b) => b.versionNumber - a.versionNumber)[0];
      },
      listByCourse: async (cId) =>
        Array.from(releasesMap.values()).filter((r) => r.courseId === cId),
    };

    sessionService = new SessionService(sessionStore, config.session);

    draftService = new CourseDraftService({
      courseStore,
      draftSessionStore,
      draftChangeStore,
      releaseStore,
      coursePublicationStore: publicationStore,
      systemOrganizationId: systemOrgId,
      moduleStore,
      lessonStore,
    });

    learningService = new LearningService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
      new InMemoryProgressStore(),
      undefined,
      undefined,
      systemOrgId,
      undefined,
      undefined,
      undefined,
      publicationStore,
    );

    // Setup Users
    communityCreator = await registerUser("creator@community.test", Roles.student);
    strangerUser = await registerUser("stranger@other.test", Roles.student);
    studentUser = await registerUser("student@learn.test", Roles.student);
    officialCreator = await registerUser("creator@official.test", Roles.course_editor, undefined, systemOrgId);
    platformAdmin = await registerUser("admin@platform.test", Roles.platform_admin, Roles.platform_admin);

    const now = new Date().toISOString();

    // 1. Seed Community Published Course (non-official)
    await courseStore.create({
      course: {
        id: communityCourseId,
        title: "دوره اجتماعی هوش مصنوعی",
        name: "دوره اجتماعی هوش مصنوعی",
        organizationId: communityCreator.orgId,
        creatorUserId: communityCreator.userId,
        isOfficial: false,
        status: "published",
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      creatorUserId: communityCreator.userId,
    });

    await moduleStore.create({
      id: communityModuleId,
      courseId: communityCourseId,
      title: "فصل ۱",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await lessonStore.create({
      id: communityLessonId,
      moduleId: communityModuleId,
      title: "جلسه ۱: پایتون",
      contentType: "markdown",
      contentMarkdown: "محتوای اولیه پایتون",
      sortOrder: 0,
      publicationStatus: "published",
      estimatedMinutes: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await releaseStore.create({
      id: asCourseReleaseId(randomUUID() as any),
      courseId: communityCourseId,
      versionNumber: 1,
      name: "نسخه اولیه",
      publishedBy: communityCreator.userId,
      manifest: [],
      createdAt: now,
    });

    await publicationStore.create({
      id: asCoursePublicationId(randomUUID() as any),
      courseId: communityCourseId,
      creatorUserId: communityCreator.userId,
      organizationId: communityCreator.orgId,
      title: "دوره اجتماعی هوش مصنوعی",
      version: 1,
      status: "published",
      publishedAt: now,
      metadata: {},
      snapshot: {
        courseId: communityCourseId,
        title: "دوره اجتماعی هوش مصنوعی",
        chapters: [
          {
            id: communityModuleId,
            title: "فصل ۱",
            sortOrder: 0,
            lessons: [
              {
                id: communityLessonId,
                title: "جلسه ۱: پایتون",
                contentMarkdown: "محتوای اولیه پایتون",
                sortOrder: 0,
              },
            ],
          },
        ],
        stats: { chapterCount: 1, lessonCount: 1, flashcardCount: 0, quizQuestionCount: 0, estimatedReadingMinutes: 10 },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Seed Official Course
    await courseStore.create({
      course: {
        id: officialCourseId,
        title: "زیست‌شناسی جامع رسمی",
        name: "زیست‌شناسی جامع رسمی",
        organizationId: systemOrgId,
        creatorUserId: officialCreator.userId,
        isOfficial: true,
        status: "published",
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      creatorUserId: officialCreator.userId,
    });

    await moduleStore.create({
      id: officialModuleId,
      courseId: officialCourseId,
      title: "فصل ۱: ژنتیک",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await lessonStore.create({
      id: officialLessonId,
      moduleId: officialModuleId,
      title: "جلسه ۱: مندل",
      contentType: "markdown",
      contentMarkdown: "محتوای زیست رسمی",
      sortOrder: 0,
      publicationStatus: "published",
      estimatedMinutes: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await releaseStore.create({
      id: asCourseReleaseId(randomUUID() as any),
      courseId: officialCourseId,
      versionNumber: 1,
      name: "نسخه اولیه رسمی",
      publishedBy: platformAdmin.userId,
      manifest: [],
      createdAt: now,
    });

    await publicationStore.create({
      id: asCoursePublicationId(randomUUID() as any),
      courseId: officialCourseId,
      creatorUserId: officialCreator.userId,
      organizationId: systemOrgId,
      title: "زیست‌شناسی جامع رسمی",
      version: 1,
      status: "published",
      publishedAt: now,
      metadata: {},
      snapshot: {
        courseId: officialCourseId,
        title: "زیست‌شناسی جامع رسمی",
        chapters: [
          {
            id: officialModuleId,
            title: "فصل ۱: ژنتیک",
            sortOrder: 0,
            lessons: [
              {
                id: officialLessonId,
                title: "جلسه ۱: مندل",
                contentMarkdown: "محتوای زیست رسمی",
                sortOrder: 0,
              },
            ],
          },
        ],
        stats: { chapterCount: 1, lessonCount: 1, flashcardCount: 0, quizQuestionCount: 0, estimatedReadingMinutes: 10 },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Enroll student in official course
    (courseStore as any).isUserEnrolled = async (uId: any, cId: any) =>
      uId === studentUser.userId && (cId === officialCourseId || cId === communityCourseId);

    // Bootstrap Fastify App
    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      courseStore,
      coursePublicationStore: publicationStore,
      moduleStore,
      lessonStore,
      progressStore,
      courseDraftService: draftService,
      learningService,
      systemOrganizationId: systemOrgId,
      officialContentService: { courseDraftService: draftService } as any,
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("1. Community Course Creator: Allowed to view draft, stage edit, preview, and publish", async () => {
    // A. View Drafts
    const draftRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/drafts`,
      cookies: { avana_session: communityCreator.token },
    });
    expect(draftRes.statusCode).toBe(200);
    const draftJson = draftRes.json();
    expect(draftJson.session).toBeDefined();

    // B. Stage Lesson Edit via PATCH /content/lessons/:id
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${communityLessonId}`,
      payload: {
        title: "جلسه ۱: پایتون پیشرفته",
        contentMarkdown: "محتوای به‌روزرسانی شده پایتون",
      },
      cookies: { avana_session: communityCreator.token },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().stagedInDraft).toBe(true);

    // C. Preview with Overlay
    const previewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/preview`,
      cookies: { avana_session: communityCreator.token },
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.json().modules[0].lessons[0].title).toBe("جلسه ۱: پایتون پیشرفته");

    // D. Publish Draft
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/publish-draft`,
      payload: {},
      cookies: { avana_session: communityCreator.token },
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().course.version).toBe(2);
  });

  it("2. Non-Owner (Stranger): Strictly DENIED (403 Forbidden) on all draft, edit, preview, and publish endpoints", async () => {
    // A. View Draft
    const draftRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/drafts`,
      cookies: { avana_session: strangerUser.token },
    });
    expect(draftRes.statusCode).toBe(403);

    // B. Edit Lesson
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${communityLessonId}`,
      payload: { title: "تلاش غیرمجاز" },
      cookies: { avana_session: strangerUser.token },
    });
    expect(patchRes.statusCode).toBe(403);

    // C. Preview
    const previewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/preview`,
      cookies: { avana_session: strangerUser.token },
    });
    expect(previewRes.statusCode).toBe(403);

    // D. Publish
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${communityCourseId}/publish-draft`,
      payload: {},
      cookies: { avana_session: strangerUser.token },
    });
    expect(pubRes.statusCode).toBe(403);
  });

  it("3. Official Course Creator (Non-Admin): Denied from publishing or rolling back official course releases", async () => {
    // Official course creator has course_editor role, but NOT platform_admin or org_admin
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/publish-draft`,
      payload: {},
      cookies: { avana_session: officialCreator.token },
    });
    expect(pubRes.statusCode).toBe(403);

    const rollbackRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/rollback`,
      payload: { targetVersion: 1 },
      cookies: { avana_session: officialCreator.token },
    });
    expect(rollbackRes.statusCode).toBe(403);
  });

  it("4. Authorized Platform Admin: Allowed to publish and rollback official courses", async () => {
    // Create draft change on official course
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${officialLessonId}`,
      payload: {
        title: "جلسه ۱: مندل و وراثت دقیق",
        contentMarkdown: "محتوای به‌روزشده زیست",
      },
      cookies: { avana_session: platformAdmin.token },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().stagedInDraft).toBe(true);

    // Publish
    const pubRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/publish-draft`,
      payload: {},
      cookies: { avana_session: platformAdmin.token },
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().course.version).toBe(2);

    // Rollback
    const rollbackRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/rollback`,
      payload: { targetVersion: 1, reason: "بازگردانی آزمایشی" },
      cookies: { avana_session: platformAdmin.token },
    });
    expect(rollbackRes.statusCode).toBe(200);
    expect(rollbackRes.json().course.version).toBe(3);
  });

  it("5. Student: Strictly denied access to Drafts and Preview endpoints", async () => {
    const draftRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/drafts`,
      cookies: { avana_session: studentUser.token },
    });
    expect(draftRes.statusCode).toBe(403);

    const previewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-studio/courses/${officialCourseId}/preview`,
      cookies: { avana_session: studentUser.token },
    });
    expect(previewRes.statusCode).toBe(403);
  });

  it("6. Learner Freshness & pending_review Isolation on GET /v1/courses/:id/learn", async () => {
    // Seed an unapproved publication in pending_review status with defective or unverified content
    await publicationStore.create({
      id: asCoursePublicationId(randomUUID() as any),
      courseId: officialCourseId,
      creatorUserId: officialCreator.userId,
      organizationId: systemOrgId,
      title: "زیست‌شناسی نسخه تاییدنشده",
      version: 99,
      status: "pending_review",
      publishedAt: new Date().toISOString(),
      metadata: {},
      snapshot: {
        courseId: officialCourseId,
        title: "زیست‌شناسی نسخه تاییدنشده",
        chapters: [
          {
            id: officialModuleId,
            title: "فصل آزمایشگاهی تایید نشده",
            sortOrder: 0,
            lessons: [
              {
                id: officialLessonId,
                title: "جلسه معیوب که نباید دانشجو ببیند",
                contentMarkdown: "محتوای غیرمجاز",
                sortOrder: 0,
              },
            ],
          },
        ],
        stats: { chapterCount: 1, lessonCount: 1, flashcardCount: 0, quizQuestionCount: 0, estimatedReadingMinutes: 10 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Enrolled student requests learning path
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${officialCourseId}/learn`,
      cookies: { avana_session: studentUser.token },
    });

    expect(learnRes.statusCode).toBe(200);

    // Verify Freshness Header: private, no-cache, must-revalidate
    expect(learnRes.headers["cache-control"]).toBe("private, no-cache, must-revalidate");

    // Verify Learner receives strictly the APPROVED published snapshot content, NEVER pending_review
    const body = learnRes.json();
    expect(body.modules[0].title).toBe("فصل ۱: ژنتیک");
    expect(body.modules[0].lessons[0].title).toBe("جلسه ۱: مندل");
    expect(body.modules[0].lessons[0].content_markdown).toBe("محتوای زیست رسمی");
  });
});
