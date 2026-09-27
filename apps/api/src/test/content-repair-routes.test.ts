import { describe, it, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryLessonStore, InMemoryModuleStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type ModuleId,
  type LessonId,
  computeContentHash,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Content Repair Admin Endpoints (Integration)", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const lessonStore = new InMemoryLessonStore();
    const moduleStore = new InMemoryModuleStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();

    adminStore.setLearningStores({
      lessonStore,
      moduleStore,
    });

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUser(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken, orgId };
    }

    const admin = await createUser("admin@avana.test", Roles.platform_admin);
    const student = await createUser("student@avana.test", Roles.student);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      lessonStore,
      moduleStore,
      generatedContentStore,
    });
    await app.ready();

    return { app, admin, student, lessonStore, moduleStore, generatedContentStore };
  }

  it("1. Denies non-admin users from accessing content repair preview and apply", async () => {
    const { app, student } = await setupTestApp();

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${student.sessionToken}`,
      },
      payload: {
        content: "واکنش textCaC_2",
      },
    });

    expect(previewRes.statusCode).toBe(403);

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${student.sessionToken}`,
      },
      payload: {
        content: "واکنش textCaC_2",
        originalHash: "dummy",
      },
    });

    expect(applyRes.statusCode).toBe(403);
  });

  it("2. Full end-to-end integration: broken lesson -> preview -> apply -> persist -> read", async () => {
    const { app, admin, lessonStore } = await setupTestApp();

    const brokenLesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: randomUUID() as ModuleId,
      title: "درس فارماکولوژی آلکین‌ها",
      contentType: "markdown",
      contentMarkdown:
        "# درس آلکین‌ها\n\nواکنش کلسیم کاربید: textCaC_2 + 2textH 2O\n\n" +
        '"6945baa6-20b8-4ea3-89f8-8ba26f731440",\n' +
        '"5de9a319-ed47-40c0-b2e8-c1fa7238faf3"',
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Step A: Preview
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: brokenLesson.id,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const previewData = JSON.parse(previewRes.body);
    expect(previewData.hasRepairs).toBe(true);
    expect(previewData.candidates.length).toBeGreaterThan(0);
    expect(previewData.repairedContent).toContain("\\text{CaC}_2");
    expect(previewData.repairedContent).toContain("\\text{H}_2\\text{O}");
    expect(previewData.repairedContent).not.toContain("6945baa6-20b8-4ea3-89f8-8ba26f731440");

    // Step B: Apply with matching hash
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: brokenLesson.id,
        originalHash: previewData.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyData = JSON.parse(applyRes.body);
    expect(applyData.success).toBe(true);

    // Step C: Verify persisted in store
    const persisted = await lessonStore.findById(brokenLesson.id);
    expect(persisted).toBeDefined();
    expect(persisted?.contentMarkdown).toBe(previewData.repairedContent);
  });

  it("3. Enforces optimistic concurrency on /apply", async () => {
    const { app, admin, lessonStore } = await setupTestApp();

    const initialContent = "متن: textCaC_2";
    const lesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: randomUUID() as ModuleId,
      title: "درس تستی",
      contentType: "markdown",
      contentMarkdown: initialContent,
      sortOrder: 0,
      estimatedMinutes: 5,
      publicationStatus: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        originalHash: "outdated_hash_99999",
      },
    });

    expect(applyRes.statusCode).toBe(409);
    const errorBody = JSON.parse(applyRes.body);
    const msg = errorBody.error?.message || errorBody.message;
    expect(msg).toContain("Repair rejected: content changed since preview");

    // Verify DB was NOT mutated
    const dbLesson = await lessonStore.findById(lesson.id);
    expect(dbLesson?.contentMarkdown).toBe(initialContent);
  });

  it("4. Scenario B: Unsaved/Draft lesson - Preview succeeds (200), Apply returns clear 404 DomainError without DB mutation", async () => {
    const { app, admin, lessonStore } = await setupTestApp();

    const unpersistedLessonId = randomUUID();
    const brokenContent = "فرمول واکنش: textCaC_2 + 2textH 2O";

    // 1. Preview with unpersisted lessonId + active editor content => 200
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        content: brokenContent,
        lessonId: unpersistedLessonId,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const previewData = JSON.parse(previewRes.body);
    expect(previewData.hasRepairs).toBe(true);
    expect(previewData.repairedContent).toBe("فرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");

    // 2. Apply with unpersisted lessonId => 404 with clear message
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        content: brokenContent,
        lessonId: unpersistedLessonId,
        originalHash: previewData.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(404);
    const errorBody = JSON.parse(applyRes.body);
    expect(errorBody.error.code).toBe("not_found");
    expect(errorBody.error.message).toBe("درس برای ذخیره اصلاحات پیدا نشد. ابتدا درس را ذخیره کنید.");

    // 3. Verify store is still clean
    const dbLesson = await lessonStore.findById(unpersistedLessonId as LessonId);
    expect(dbLesson).toBeUndefined();
  });

  it("5. Scenario A & Manual E2E: Stored Lesson -> Editor loads -> textCaC_2 + 2textH 2O -> Preview -> Apply -> DB updated -> Reload matches", async () => {
    const { app, admin, lessonStore } = await setupTestApp();

    // 1. Stored lesson exists in DB
    const lesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: randomUUID() as ModuleId,
      title: "درس واکنش‌های آلی شیمی",
      contentType: "markdown",
      contentMarkdown: "مقدمه بر هیدروکربن‌ها",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. User introduces textCaC_2 + 2textH 2O in Editor
    const editorBrokenContent = "## بخش دوم: واکنش استیلن\nفرمول واکنش: textCaC_2 + 2textH 2O\nتوضیحات تکمیلی واکنش.";

    // 3. Preview from Editor (sends content + lessonId)
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        content: editorBrokenContent,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);
    expect(preview.hasRepairs).toBe(true);
    expect(preview.repairedContent).toContain("\\text{CaC}_2 + 2\\text{H}_2\\text{O}");

    // 4. Apply from Modal (sends content + lessonId + originalHash)
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        content: editorBrokenContent,
        originalHash: preview.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyResult = JSON.parse(applyRes.body);
    expect(applyResult.success).toBe(true);
    expect(applyResult.repairedContent).toBe("## بخش دوم: واکنش استیلن\nفرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}\nتوضیحات تکمیلی واکنش.");

    // 5. Reload lesson from Database / Store
    const reloaded = await lessonStore.findById(lesson.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.contentMarkdown).toBe("## بخش دوم: واکنش استیلن\nفرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}\nتوضیحات تکمیلی واکنش.");
  });

  it("6. CRUCIAL REGRESSION: saved Lesson + valid lessonId + stale/nonexistent generatedContentId + valid content + valid originalHash -> Apply = 200 -> Lesson updated", async () => {
    const { app, admin, lessonStore } = await setupTestApp();

    const lesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: randomUUID() as ModuleId,
      title: "درس فارماکولوژی بالینی",
      contentType: "markdown",
      contentMarkdown: "متن اولیه",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const activeContent = "فرمول واکنش: textCaC_2 + 2textH 2O";
    const staleGeneratedContentId = randomUUID(); // Stale/nonexistent draft ID

    // 1. Preview
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        generatedContentId: staleGeneratedContentId,
        content: activeContent,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);

    // 2. Apply with both IDs (valid lessonId + stale generatedContentId)
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        generatedContentId: staleGeneratedContentId,
        content: activeContent,
        originalHash: preview.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyResult = JSON.parse(applyRes.body);
    expect(applyResult.success).toBe(true);
    expect(applyResult.repairedContent).toBe("فرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");

    // 3. Verify lesson in DB was updated
    const dbLesson = await lessonStore.findById(lesson.id);
    expect(dbLesson?.contentMarkdown).toBe("فرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");
  });

  it("7. Only generatedContentId -> updates Generated Content in store", async () => {
    const { app, admin, generatedContentStore } = await setupTestApp();

    const gen = await generatedContentStore.create({
      id: randomUUID(),
      jobId: randomUUID(),
      organizationId: randomUUID(),
      userId: admin.user.id,
      type: "lesson",
      status: "pending_review",
      qualityScore: 90,
      payload: {
        title: "پیش‌نویس درسنامه",
        contentMarkdown: "واکنش: textCaC_2 + 2textH 2O",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const activeContent = "واکنش: textCaC_2 + 2textH 2O";

    // 1. Preview
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        generatedContentId: gen.id,
        content: activeContent,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);

    // 2. Apply
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        generatedContentId: gen.id,
        content: activeContent,
        originalHash: preview.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);

    // 3. Verify GeneratedContent was updated
    const updatedGen = generatedContentStore.getAll().find((r) => r.id === gen.id);
    expect((updatedGen?.payload as any)?.contentMarkdown).toBe("واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");
  });

  it("8. Both valid lessonId and valid generatedContentId -> updates Lesson as primary and updates Generated Content", async () => {
    const { app, admin, lessonStore, generatedContentStore } = await setupTestApp();

    const lesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: randomUUID() as ModuleId,
      title: "درس همزمان",
      contentType: "markdown",
      contentMarkdown: "قدیمی",
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const gen = await generatedContentStore.create({
      id: randomUUID(),
      jobId: randomUUID(),
      organizationId: randomUUID(),
      userId: admin.user.id,
      type: "lesson",
      status: "pending_review",
      qualityScore: 90,
      payload: {
        title: "پیش‌نویس درسنامه",
        contentMarkdown: "قدیمی",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const activeContent = "واکنش: textCaC_2 + 2textH 2O";

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        generatedContentId: gen.id,
        content: activeContent,
      },
    });
    const preview = JSON.parse(previewRes.body);

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: lesson.id,
        generatedContentId: gen.id,
        content: activeContent,
        originalHash: preview.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);

    // Assert Lesson updated
    const dbLesson = await lessonStore.findById(lesson.id);
    expect(dbLesson?.contentMarkdown).toBe("واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");

    // Assert Generated Content also updated
    const dbGen = generatedContentStore.getAll().find((r) => r.id === gen.id);
    expect((dbGen?.payload as any)?.contentMarkdown).toBe("واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");
  });

  it("9. Neither target exists -> returns clear 404 DomainError", async () => {
    const { app, admin } = await setupTestApp();

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId: randomUUID(),
        generatedContentId: randomUUID(),
        content: "واکنش: textCaC_2",
        originalHash: "dummy",
      },
    });

    expect(applyRes.statusCode).toBe(404);
    const body = JSON.parse(applyRes.body);
    expect(body.error.message).toBe("درس برای ذخیره اصلاحات پیدا نشد. ابتدا درس را ذخیره کنید.");
  });

  it("10. Regression: Resolves draft belonging to non-default organization without 404", async () => {
    const { app, admin, generatedContentStore } = await setupTestApp();

    const customOrgId = "99999999-9999-9999-9999-999999999999" as OrganizationId;
    const gen = await generatedContentStore.create({
      id: randomUUID(),
      jobId: randomUUID(),
      organizationId: customOrgId,
      userId: admin.user.id,
      type: "lesson",
      status: "pending_review",
      qualityScore: 90,
      payload: {
        title: "درس سازمانی سفارشی",
        contentMarkdown: "فرمول textCaC_2 خراب است.",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const activeContent = "فرمول textCaC_2 خراب است.";

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        generatedContentId: gen.id,
        organizationId: customOrgId,
        content: activeContent,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        generatedContentId: gen.id,
        organizationId: customOrgId,
        content: activeContent,
        originalHash: preview.originalHash,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const updated = await generatedContentStore.findById(gen.id);
    expect((updated?.payload as any)?.contentMarkdown).toBe("فرمول \\text{CaC}_2 خراب است.");
  });
});

