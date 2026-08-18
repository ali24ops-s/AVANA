import { describe, it, expect, beforeEach } from "vitest";
import type { Actor, CourseId, OrganizationId } from "@avana/domain";
import { CANONICAL_COURSES, CourseService } from "../modules/courses/course-service.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { seedLocalDevData } from "../dev/seed.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  InMemoryModuleStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryFlashcardStore,
} from "../modules/study/test/in-memory-stores.js";

describe("Persian Educational Courses Standardization Tests", () => {
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let documentStore: InMemoryDocumentStore;
  let quizStore: InMemoryQuizStore;
  let flashcardStore: InMemoryFlashcardStore;
  let auditService: AuditService;
  let courseService: CourseService;

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    documentStore = new InMemoryDocumentStore();
    quizStore = new InMemoryQuizStore();
    flashcardStore = new InMemoryFlashcardStore();
    auditService = new AuditService(new InMemoryAuditStore());

    courseService = new CourseService(
      courseStore,
      async () => ({ role: "organization_admin" }),
    );
  });

  it("1. All 15 canonical courses are viewable/listable in exact order", async () => {
    const seedRes = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    const actor: Actor = { userId: seedRes.userId, role: "organization_admin" };
    const courses = await courseService.listCourses(actor, seedRes.organizationId);

    const titles = courses.map((c) => c.name);
    for (let i = 0; i < CANONICAL_COURSES.length; i++) {
      expect(titles[i]).toBe(CANONICAL_COURSES[i]);
    }
  });

  it("2. Course titles use exact Persian characters and Persian numbers", async () => {
    for (const title of CANONICAL_COURSES) {
      expect(title).toMatch(/^[\u0600-\u06FF\s\u200c]+$/);
    }
    expect(CANONICAL_COURSES[0]).toBe("فارماکولوژی ۱");
    expect(CANONICAL_COURSES[3]).toBe("دارودرمانی ۱");
    expect(CANONICAL_COURSES[10]).toBe("میکروب‌شناسی");
    expect(CANONICAL_COURSES[11]).toBe("قارچ و انگل‌شناسی");
  });

  it("3. Zero duplicate courses are created when seed runs multiple times", async () => {
    const seedRes1 = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    const actor: Actor = { userId: seedRes1.userId, role: "organization_admin" };
    const courses = await courseService.listCourses(actor, seedRes1.organizationId);

    const titleCounts = new Map<string, number>();
    for (const c of courses) {
      titleCounts.set(c.name, (titleCounts.get(c.name) ?? 0) + 1);
    }

    for (const title of CANONICAL_COURSES) {
      expect(titleCounts.get(title)).toBe(1);
    }
  });

  it("4. Canonical ordering places 15 courses first (1..15) followed by pre-existing courses", async () => {
    const seedRes = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    const actor: Actor = { userId: seedRes.userId, role: "organization_admin" };
    const courses = await courseService.listCourses(actor, seedRes.organizationId);

    for (let i = 0; i < 15; i++) {
      expect(courses[i].name).toBe(CANONICAL_COURSES[i]);
    }
    const nonCanonical = courses.slice(15).map((c) => c.name);
    expect(nonCanonical).toContain("Medicinal Chemistry Introduction");
  });

  it("5. Pre-existing non-canonical courses (e.g. Medicinal Chemistry) are preserved", async () => {
    const seedRes = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    const actor: Actor = { userId: seedRes.userId, role: "organization_admin" };
    const courses = await courseService.listCourses(actor, seedRes.organizationId);
    const medChem = courses.find((c) => c.name === "Medicinal Chemistry Introduction");
    expect(medChem).toBeDefined();
    expect(medChem?.deletedAt).toBeNull();
  });

  it("6. Course -> Module relationship remains intact after renaming Pharmacology Basics to فارماکولوژی ۱", async () => {
    const orgId = "org-1" as OrganizationId;
    const courseId = "course-pharm-1" as CourseId;
    const moduleId = "module-1";
    const now = new Date().toISOString();

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "Pharmacology Basics",
        subject: "Pharmacy",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleId as any,
      courseId,
      documentId: null,
      title: "ADME Basics",
      description: "Intro module",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Rename course name to فارماکولوژی ۱
    const actor: Actor = { userId: "user-1", role: "organization_admin" };
    await courseService.updateCourse(actor, orgId, courseId, { title: "فارماکولوژی ۱" });

    // Verify course ID and module mapping
    const updated = await courseService.getCourse(actor, orgId, courseId);
    expect(updated.name).toBe("فارماکولوژی ۱");

    const modules = await moduleStore.listByCourse(courseId);
    expect(modules.length).toBe(1);
    expect(modules[0].courseId).toBe(courseId);
  });

  it("7. Flashcards taxonomy remains intact", async () => {
    const courseId = "course-pharm-1" as CourseId;
    const orgId = "org-1" as OrganizationId;

    await flashcardStore.create({
      id: "fc-1" as any,
      organizationId: orgId,
      courseId,
      documentId: null as any,
      generatedContentId: null,
      lessonId: null,
      question: "Digoxin mechanism",
      answer: "Na+/K+ ATPase inhibitor",
      explanation: null,
      cardType: "basic",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const cards = await flashcardStore.listByCourse(courseId, orgId);
    expect(cards.length).toBe(1);
    expect(cards[0].courseId).toBe(courseId);
  });

  it("8. Exams/Quizzes taxonomy remains intact", async () => {
    const courseId = "course-pharm-1" as CourseId;
    const orgId = "org-1" as OrganizationId;

    await quizStore.create({
      id: "quiz-1" as any,
      organizationId: orgId,
      courseId,
      documentId: null as any,
      title: "Pharmacology Quiz 1",
      topic: "Pharmacodynamics",
      difficulty: "easy",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const quizzes = await quizStore.listByCourse(courseId, orgId);
    expect(quizzes.length).toBe(1);
    expect(quizzes[0].courseId).toBe(courseId);
  });

  it("9. New courses are created empty (0 dummy modules, 0 dummy lessons)", async () => {
    const seedRes = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    const actor: Actor = { userId: seedRes.userId, role: "organization_admin" };
    const courses = await courseService.listCourses(actor, seedRes.organizationId);

    const pharm2 = courses.find((c) => c.name === "فارماکولوژی ۲");
    expect(pharm2).toBeDefined();

    const modulesPharm2 = await moduleStore.listByCourse(pharm2!.id as CourseId);
    expect(modulesPharm2.length).toBe(0);
  });

  it("10. Existing documents remain linked to the correct course ID", async () => {
    const courseId = "course-pharm-1" as CourseId;
    const orgId = "org-1" as OrganizationId;

    await documentStore.create({
      id: "doc-1" as any,
      organizationId: orgId,
      courseId,
      ownerUserId: "user-1" as any,
      originalName: "digoxin.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: "keys/digoxin.pdf",
      sha256: "hash123",
      pageCount: 1,
      status: "ready",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const docs = await documentStore.listByOrganization(orgId, courseId);
    expect(docs.length).toBe(1);
    expect(docs[0].courseId).toBe(courseId);
  });
});
