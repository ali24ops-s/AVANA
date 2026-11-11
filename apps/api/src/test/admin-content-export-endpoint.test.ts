import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import fastifyCookie from "@fastify/cookie";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/session-service.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { adminRoutes } from "../modules/admin/admin-routes.js";
import { generateBoundCsrfToken } from "../modules/identity/csrf.js";
import {
  Roles,
  type OrganizationId,
  type CourseId,
  type UserId,
} from "@avana/domain";
import { ContentExportService } from "../modules/admin/content-export-service.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";

class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }
}

class InMemoryMockDb {
  public tables: Record<string, any[]> = {
    courses: [],
    modules: [],
    lessons: [],
    documents: [],
    document_chunks: [],
    generated_contents: [],
    generated_content_citations: [],
    flashcards: [],
    quizzes: [],
    quiz_questions: [],
    content_import_batches: [],
    imported_entities: [],
    audit_logs: [],
  };

  getTableName(tableObj: any): string {
    return tableObj?.[Symbol.for("drizzle:Name")] || tableObj?._?.name || tableObj?.name || "unknown";
  }

  select(fields?: any) {
    const self = this;
    return {
      from(tableObj: any) {
        const tableName = self.getTableName(tableObj);
        return {
          where(condition?: any) {
            let rows = [...(self.tables[tableName] || [])];
            if (tableName === "courses" && condition) {
              let courseIdFilter: string | null = null;
              const traverse = (chunks: any[]) => {
                if (!Array.isArray(chunks)) return;
                for (let i = 0; i < chunks.length; i++) {
                  const c = chunks[i];
                  if (c && c.name === "id" && chunks[i + 1]?.value?.[0]?.includes("=")) {
                    courseIdFilter = chunks[i + 2]?.value ?? chunks[i + 2];
                  }
                  if (c && c.queryChunks) traverse(c.queryChunks);
                }
              };
              traverse(condition.queryChunks);
              if (courseIdFilter) {
                rows = rows.filter((r) => r.id === courseIdFilter);
              }
            }
            return {
              orderBy: () => Promise.resolve(rows),
              then: (resolve: (val: any) => void) => resolve(rows),
            };
          },
          orderBy: () => Promise.resolve([...(self.tables[tableName] || [])]),
          then: (resolve: (val: any) => void) => resolve([...(self.tables[tableName] || [])]),
        };
      },
    };
  }
}

describe("Admin Content Export End-to-End Suite", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const courseStore = new InMemoryCourseStore(orgStore);
    const sessionService = new SessionService(sessionStore, config.session);
    const storageProvider = new InMemoryStorageProvider();
    const mockDb = new InMemoryMockDb();
    const contentExportService = new ContentExportService(mockDb as any, storageProvider);

    // 1. Platform admin user
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.test",
      passwordHash: "x",
    });
    adminUser.globalRole = Roles.platform_admin;
    adminUser.role = Roles.platform_admin;
    userStore.insert({ ...adminUser });

    const platformAdminOrgId = randomUUID() as OrganizationId;
    const foreignOrgId = randomUUID() as OrganizationId;

    await orgStore.createWithAdminMembership({
      organization: {
        id: platformAdminOrgId,
        name: "سازمان مرکزی اوانا",
        slug: "avana-main",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
      membership: {
        id: randomUUID(),
        organizationId: platformAdminOrgId,
        userId: adminUser.id,
        role: Roles.platform_admin,
        createdAt: new Date().toISOString(),
      },
    });

    await orgStore.createWithAdminMembership({
      organization: {
        id: foreignOrgId,
        name: "سازمان مستقل دیگر",
        slug: "foreign-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
      membership: {
        id: randomUUID(),
        organizationId: foreignOrgId,
        userId: randomUUID() as UserId,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
      },
    });

    const adminSession = await sessionService.createSession(adminUser.id);
    const adminCsrfToken = generateBoundCsrfToken(adminSession.sessionToken);

    // 2. Tenant editor user belonging ONLY to platformAdminOrgId
    const editorUser = await userStore.createUserWithPassword({
      email: "editor@avana.test",
      passwordHash: "x",
    });
    editorUser.role = Roles.course_editor;
    userStore.insert({ ...editorUser });
    await orgStore.addMembership({
      organizationId: platformAdminOrgId,
      userId: editorUser.id,
      role: Roles.course_editor,
      createdAt: new Date().toISOString(),
    });
    const editorSession = await sessionService.createSession(editorUser.id);
    const editorCsrfToken = generateBoundCsrfToken(editorSession.sessionToken);

    // Seed test course with Persian name, zero-width non-joiner, modules, lessons, flashcards, quizzes, documents
    const testCourseId = randomUUID() as CourseId;
    const persianCourseName = "زیست‌شناسی جامع کنکور (فصل اول)";
    await courseStore.create({
      course: {
        id: testCourseId,
        organizationId: platformAdminOrgId,
        name: persianCourseName,
        description: "توضیحات آزمایشی دوره با کاراکترهای نیم‌فاصله و فارسی",
        status: "published",
        subject: "زیست",
        deletedAt: null,
      },
      auditEvents: [],
    });

    mockDb.tables.courses.push({
      id: testCourseId,
      organizationId: platformAdminOrgId,
      name: persianCourseName,
      description: "توضیحات دوره",
      subject: "زیست",
      status: "published",
      isOfficial: true,
      deletedAt: null,
    });

    const docId = randomUUID();
    const docSha = "a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef";
    const attachmentContent = Buffer.from("%PDF-1.4 sample course syllabus attachment");
    await storageProvider.save({
      storageKey: `documents/${docId}.pdf`,
      data: attachmentContent,
      mimeType: "application/pdf",
    });

    mockDb.tables.documents.push({
      id: docId,
      courseId: testCourseId,
      organizationId: platformAdminOrgId,
      storageKey: `documents/${docId}.pdf`,
      originalName: "طرح‌درس زیست.pdf",
      mimeType: "application/pdf",
      sizeBytes: attachmentContent.length,
      sha256: docSha,
      pageCount: 1,
      qualityScore: 95,
      qualityLevel: "high",
      deletedAt: null,
    });

    const modId = randomUUID();
    mockDb.tables.modules.push({
      id: modId,
      courseId: testCourseId,
      title: "فصل ۱: مولکول‌های اطلاعاتی",
      description: "بررسی ساختار DNA و RNA",
      sortOrder: 1,
      documentId: docId,
      deletedAt: null,
    });

    const lessonId = randomUUID();
    mockDb.tables.lessons.push({
      id: lessonId,
      moduleId: modId,
      title: "درس اول: همانندسازی DNA",
      contentType: "markdown",
      contentMarkdown: "# همانندسازی دنا\nاین فرایند به صورت نیمه‌حفاظت‌شده انجام می‌شود.",
      sortOrder: 1,
      estimatedMinutes: 25,
      publicationStatus: "published",
      deletedAt: null,
    });

    const cardId = randomUUID();
    mockDb.tables.flashcards.push({
      id: cardId,
      organizationId: platformAdminOrgId,
      courseId: testCourseId,
      lessonId,
      documentId: docId,
      question: "آنزیم اصلی همانندسازی دنا چیست؟",
      answer: "دنا بسپاراز (DNA Polymerase)",
      difficulty: "easy",
      cardType: "standard",
      intervalDays: 1,
      easeFactor: 2.5,
      deletedAt: null,
    });

    const quizId = randomUUID();
    mockDb.tables.quizzes.push({
      id: quizId,
      organizationId: platformAdminOrgId,
      courseId: testCourseId,
      documentId: docId,
      title: "آزمونک فصل ۱",
      topic: "ژنتیک مولکولی",
      difficulty: "medium",
      status: "published",
      deletedAt: null,
    });

    mockDb.tables.quiz_questions.push({
      id: randomUUID(),
      quizId,
      lessonId,
      question: "جهت سنتز رشته جدید دنا چگونه است؟",
      topic: "ژنتیک",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["۵ به ۳", "۳ به ۵", "هر دو جهت"],
      correctAnswer: "۵ به ۳",
      sortOrder: 1,
    });

    // Foreign course belonging to foreignOrgId
    const foreignCourseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: foreignCourseId,
        organizationId: foreignOrgId,
        name: "دوره سازمان دیگر",
        status: "published",
        subject: "عمومی",
        deletedAt: null,
      },
      auditEvents: [],
    });
    mockDb.tables.courses.push({
      id: foreignCourseId,
      organizationId: foreignOrgId,
      name: "دوره سازمان دیگر",
      status: "published",
      deletedAt: null,
    });

    const app = createApp({ config });
    await app.register(fastifyCookie);
    await app.register(adminRoutes, {
      prefix: "/v1/admin",
      sessionService,
      userStore,
      adminStore,
      organizationStore: orgStore,
      courseStore,
      contentExportService,
      systemOrganizationId: platformAdminOrgId,
    });
    await app.ready();

    return {
      app,
      adminSession,
      adminCsrfToken,
      editorSession,
      editorCsrfToken,
      testCourseId,
      persianCourseName,
      foreignCourseId,
      platformAdminOrgId,
      foreignOrgId,
    };
  }

  it("1. Request with valid session and valid CSRF token -> 200 OK with application/zip", async () => {
    const ctx = await setupTestApp();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      headers: {
        "x-csrf-token": ctx.adminCsrfToken,
      },
      cookies: {
        avana_session: ctx.adminSession.sessionToken,
        avana_csrf: ctx.adminCsrfToken,
      },
      payload: {
        courseId: ctx.testCourseId,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toBeDefined();
    expect(res.headers["content-disposition"]).toContain("attachment;");
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });

  it("2. Request without x-csrf-token header when avana_csrf cookie is present -> 403 Forbidden", async () => {
    const ctx = await setupTestApp();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      cookies: {
        avana_session: ctx.adminSession.sessionToken,
        avana_csrf: ctx.adminCsrfToken,
      },
      payload: {
        courseId: ctx.testCourseId,
      },
    });

    expect(res.statusCode).toBe(403);
    const json = res.json();
    expect(json.error?.code || json.code).toBe("forbidden");
    expect(json.error?.message || json.message).toContain("CSRF");
  });

  it("3. Validates and inspects full ZIP archive content (sessions, flashcards, quizzes, files)", async () => {
    const ctx = await setupTestApp();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      headers: {
        "x-csrf-token": ctx.adminCsrfToken,
      },
      cookies: {
        avana_session: ctx.adminSession.sessionToken,
        avana_csrf: ctx.adminCsrfToken,
      },
      payload: {
        courseId: ctx.testCourseId,
      },
    });

    expect(res.statusCode).toBe(200);
    const zipBuffer = res.rawPayload;
    const zip = await JSZip.loadAsync(zipBuffer);

    // Verify all JSON entries exist
    expect(zip.file("manifest.json")).not.toBeNull();
    expect(zip.file("courses.json")).not.toBeNull();
    expect(zip.file("modules.json")).not.toBeNull();
    expect(zip.file("lessons.json")).not.toBeNull();
    expect(zip.file("documents.json")).not.toBeNull();
    expect(zip.file("flashcards.json")).not.toBeNull();
    expect(zip.file("quizzes.json")).not.toBeNull();
    expect(zip.file("questions.json")).not.toBeNull();

    // Verify manifest
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.counts.courses).toBe(1);
    expect(manifest.counts.modules).toBe(1);
    expect(manifest.counts.lessons).toBe(1);
    expect(manifest.counts.flashcards).toBe(1);
    expect(manifest.counts.quizzes).toBe(1);
    expect(manifest.counts.files).toBe(1);

    // Verify Persian lesson markdown preserved
    const lessonsJson = JSON.parse(await zip.file("lessons.json")!.async("string"));
    expect(lessonsJson[0].contentMarkdown).toContain("همانندسازی دنا");

    // Verify physical file attachment inside ZIP
    const filesInZip = Object.keys(zip.files).filter((f) => f.startsWith("files/") && !zip.files[f].dir);
    expect(filesInZip.length).toBe(1);
    const fileContent = await zip.file(filesInZip[0])!.async("string");
    expect(fileContent).toContain("%PDF-1.4 sample course syllabus attachment");
  });

  it("4. Content-Disposition contains properly encoded RFC 5987 Persian filename", async () => {
    const ctx = await setupTestApp();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      headers: {
        "x-csrf-token": ctx.adminCsrfToken,
      },
      cookies: {
        avana_session: ctx.adminSession.sessionToken,
        avana_csrf: ctx.adminCsrfToken,
      },
      payload: {
        courseId: ctx.testCourseId,
      },
    });

    expect(res.statusCode).toBe(200);
    const disposition = res.headers["content-disposition"] as string;
    expect(disposition).toContain("filename=");
    expect(disposition).toContain("filename*=UTF-8");

    const match = disposition.match(/filename\*=(?:UTF-8|utf-8)([^;]+)/i);
    expect(match).not.toBeNull();
    const decodedFilename = decodeURIComponent(match![1]);
    expect(decodedFilename).toContain("زیست‌شناسی جامع کنکور");
    expect(decodedFilename.endsWith(".zip")).toBe(true);
  });

  it("5. Non-existent courseId returns standard 404 with Persian message", async () => {
    const ctx = await setupTestApp();
    const missingId = randomUUID();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      headers: {
        "x-csrf-token": ctx.adminCsrfToken,
      },
      cookies: {
        avana_session: ctx.adminSession.sessionToken,
        avana_csrf: ctx.adminCsrfToken,
      },
      payload: {
        courseId: missingId,
      },
    });

    expect(res.statusCode).toBe(404);
    const json = res.json();
    expect(json.code).toBe("not_found");
    expect(json.message).toBe("دوره مورد نظر جهت خروجی یافت نشد.");
  });

  it("6. Tenant isolation: editor user cannot export course belonging to foreign organization -> 403 Forbidden", async () => {
    const ctx = await setupTestApp();

    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      headers: {
        "x-csrf-token": ctx.editorCsrfToken,
      },
      cookies: {
        avana_session: ctx.editorSession.sessionToken,
        avana_csrf: ctx.editorCsrfToken,
      },
      payload: {
        courseId: ctx.foreignCourseId,
      },
    });

    expect(res.statusCode).toBe(403);
    const json = res.json();
    expect(json.code).toBe("forbidden");
  });
});
