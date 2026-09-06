import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Actor, CourseId, ModuleId, OrganizationId, UserId } from "@avana/domain";
import { LibraryService } from "../modules/library/library-service.js";
import { InMemoryContentPackStore, InMemoryContentPackUsageStore } from "../modules/library/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryModuleStore, InMemoryLessonStore, InMemoryProgressStore, InMemoryDocumentStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";

describe("Library Resources Service & Store Suite (Zero Duplication)", () => {
  let userStore: InMemoryUserStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let contentPackStore: InMemoryContentPackStore;
  let libraryService: LibraryService;

  const testUserId = randomUUID() as UserId;
  const testOrgId = randomUUID() as OrganizationId;
  const testActor: Actor = { userId: testUserId, role: "student" };

  let course1Id: CourseId;
  let course2Id: CourseId;
  let module1Id: ModuleId;
  let module2Id: ModuleId;

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    contentPackUsageStore = new InMemoryContentPackUsageStore();

    contentPackStore = new InMemoryContentPackStore(
      userStore,
      moduleStore,
      lessonStore,
      undefined,
      undefined,
      undefined,
      generatedContentStore,
      contentPackUsageStore,
      courseStore,
      progressStore,
    );

    libraryService = new LibraryService(
      contentPackStore,
      contentPackUsageStore,
      documentStore,
      generatedContentStore,
      undefined,
      userStore,
      courseStore,
    );

    // Seed Courses
    course1Id = randomUUID() as CourseId;
    course2Id = randomUUID() as CourseId;

    await courseStore.create({
      course: {
        id: course1Id,
        organizationId: testOrgId,
        name: "فارماکولوژی ۱",
        description: "مبانی فارماکولوژی و داروهای قلبی",
        subject: "فارماکولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: testOrgId,
        name: "فیزیولوژی اعصاب",
        description: "فیزیولوژی سیستم عصبی مرکزی و محیطی",
        subject: "فیزیولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: "2026-08-05T10:00:00.000Z",
        updatedAt: "2026-08-05T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Enroll test user in courses
    await courseStore.addUserCourse(testUserId, course1Id, "student");
    await courseStore.addUserCourse(testUserId, course2Id, "student");

    // Seed Modules
    module1Id = randomUUID() as ModuleId;
    module2Id = randomUUID() as ModuleId;

    await moduleStore.create({
      id: module1Id,
      courseId: course1Id,
      title: "فصل اول: سیستم خودمختار",
      description: "داروهای کولینرژیک و آدرنرژیک",
      sortOrder: 1,
      createdAt: "2026-08-01T11:00:00.000Z",
      updatedAt: "2026-08-01T11:00:00.000Z",
      deletedAt: null,
    });

    await moduleStore.create({
      id: module2Id,
      courseId: course2Id,
      title: "فصل اول: انتقال پیام عصبی",
      description: "سیناپس‌ها و پتانسیل عمل",
      sortOrder: 1,
      createdAt: "2026-08-05T11:00:00.000Z",
      updatedAt: "2026-08-05T11:00:00.000Z",
      deletedAt: null,
    });

    // Seed Lessons (Contents)
    const lesson1Id = randomUUID();
    const lesson2Id = randomUUID();
    const lesson3DraftId = randomUUID();

    await lessonStore.create({
      id: lesson1Id as any,
      moduleId: module1Id,
      title: "آگونیست‌های موسکارینی",
      contentType: "markdown",
      contentMarkdown: "# آگونیست‌های موسکارینی...",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
    });

    await lessonStore.create({
      id: lesson2Id as any,
      moduleId: module2Id,
      title: "پتانسیل عمل و کانال‌های یونی",
      contentType: "markdown",
      contentMarkdown: "# پتانسیل عمل...",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      deletedAt: null,
    });

    // Draft lesson should not be returned as published content
    await lessonStore.create({
      id: lesson3DraftId as any,
      moduleId: module1Id,
      title: "پیش‌نویس درس منتشرنشده",
      contentType: "markdown",
      contentMarkdown: "# پیش‌نویس...",
      sortOrder: 2,
      estimatedMinutes: 10,
      publicationStatus: "draft",
      createdAt: "2026-08-01T12:30:00.000Z",
      updatedAt: "2026-08-01T12:30:00.000Z",
      deletedAt: null,
    });

    // Progress: mark lesson 1 complete for user
    await progressStore.upsert({
      id: randomUUID() as any,
      userId: testUserId,
      lessonId: lesson1Id as any,
      completed: true,
      completedAt: "2026-08-02T10:00:00.000Z",
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    });
  });

  it("lists accessible courses and standalone contents for user with zero duplicates", async () => {
    const res = await libraryService.listResources(
      testActor,
      { type: "all" },
      "req-1",
    );

    expect(res.courses.length).toBe(2);
    expect(res.contents.length).toBe(2); // Only the 2 published lessons

    // Check course 1 progress calculation
    const pharmCourse = res.courses.find((c) => c.title === "فارماکولوژی ۱");
    expect(pharmCourse).toBeDefined();
    expect(pharmCourse?.module_count).toBe(1);
    expect(pharmCourse?.content_count).toBe(1); // 1 published lesson
    expect(pharmCourse?.progress?.completed_lessons).toBe(1);
    expect(pharmCourse?.progress?.percent).toBe(100);
    expect(pharmCourse?.href).toBe(`/courses/${course1Id}`);

    // Check content item properties and direct navigation href
    const muscarinicContent = res.contents.find((c) => c.title === "آگونیست‌های موسکارینی");
    expect(muscarinicContent).toBeDefined();
    expect(muscarinicContent?.course_id).toBe(course1Id);
    expect(muscarinicContent?.course_title).toBe("فارماکولوژی ۱");
    expect(muscarinicContent?.module_id).toBe(module1Id);
    expect(muscarinicContent?.module_title).toBe("فصل اول: سیستم خودمختار");
    expect(muscarinicContent?.estimated_minutes).toBe(15);
    expect(muscarinicContent?.completed).toBe(true);
    expect(muscarinicContent?.href).toBe(`/courses/${course1Id}?lessonId=${muscarinicContent?.id}`);
  });

  it("filters library resources by type = courses or type = contents", async () => {
    const courseRes = await libraryService.listResources(
      testActor,
      { type: "courses" },
      "req-courses",
    );
    expect(courseRes.courses.length).toBe(2);
    expect(courseRes.contents.length).toBe(0);

    const contentRes = await libraryService.listResources(
      testActor,
      { type: "contents" },
      "req-contents",
    );
    expect(contentRes.courses.length).toBe(0);
    expect(contentRes.contents.length).toBe(2);
  });

  it("filters resources by search keyword across course name, content title, and module title", async () => {
    const searchRes = await libraryService.listResources(
      testActor,
      { q: "موسکارینی" },
      "req-search",
    );
    expect(searchRes.contents.length).toBe(1);
    expect(searchRes.contents[0].title).toBe("آگونیست‌های موسکارینی");
  });

  it("filters resources by subject", async () => {
    const physioRes = await libraryService.listResources(
      testActor,
      { subject: "فیزیولوژی" },
      "req-subject",
    );
    expect(physioRes.courses.length).toBe(1);
    expect(physioRes.courses[0].title).toBe("فیزیولوژی اعصاب");
  });
});
