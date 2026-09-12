import { describe, it, expect, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { AnnotationService } from "./annotation-service.js";
import {
  InMemoryLessonAnnotationStore,
  InMemoryContentReportStore,
} from "./annotation-store.js";
import type {
  LessonStore,
  ModuleStore,
  LessonRecord,
  ModuleRecord,
} from "../learning/learning-store.js";
import type { CourseStore, CourseRecord } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

// Mock stores
class MockLessonStore implements Partial<LessonStore> {
  private lessons: LessonRecord[] = [];

  add(lesson: LessonRecord) {
    this.lessons.push(lesson);
  }

  async findById(id: LessonId): Promise<LessonRecord | null> {
    return this.lessons.find((l) => l.id === id) || null;
  }

  async listByModule(moduleId: ModuleId): Promise<LessonRecord[]> {
    return this.lessons.filter((l) => l.moduleId === moduleId);
  }
}

class MockModuleStore implements Partial<ModuleStore> {
  private modules: ModuleRecord[] = [];

  add(mod: ModuleRecord) {
    this.modules.push(mod);
  }

  async findById(id: ModuleId): Promise<ModuleRecord | null> {
    return this.modules.find((m) => m.id === id) || null;
  }

  async listByCourse(courseId: CourseId): Promise<ModuleRecord[]> {
    return this.modules.filter((m) => m.courseId === courseId);
  }
}

class MockCourseStore implements Partial<CourseStore> {
  private courses: CourseRecord[] = [];

  add(course: CourseRecord) {
    this.courses.push(course);
  }

  async findById(id: CourseId): Promise<CourseRecord | null> {
    return this.courses.find((c) => c.id === id) || null;
  }

  async findByIdForUser(
    id: CourseId,
    _userId: UserId,
    _systemOrgId?: OrganizationId,
  ): Promise<CourseRecord | null> {
    return this.courses.find((c) => c.id === id) || null;
  }
}

class MockOrganizationStore implements Partial<OrganizationStore> {
  private members: Set<string> = new Set();

  addMember(orgId: OrganizationId, userId: UserId) {
    this.members.add(`${orgId}:${userId}`);
  }

  async findMembership(
    orgId: OrganizationId,
    userId: UserId,
  ): Promise<{ organizationId: OrganizationId; userId: UserId; role: "student" } | null> {
    if (this.members.has(`${orgId}:${userId}`)) {
      return { organizationId: orgId, userId, role: "student" };
    }
    return null;
  }
}

describe("AnnotationService (Highlights, Notes & Content Reports)", () => {
  const orgId = "org-1" as OrganizationId;
  const courseId = "course-1" as CourseId;
  const moduleId = "module-1" as ModuleId;
  const lessonId = "lesson-1" as LessonId;

  const userA: Actor = { userId: "user-a" as UserId, role: "student" };
  const userB: Actor = { userId: "user-b" as UserId, role: "student" };

  let annotationStore: InMemoryLessonAnnotationStore;
  let reportStore: InMemoryContentReportStore;
  let lessonStore: MockLessonStore;
  let moduleStore: MockModuleStore;
  let courseStore: MockCourseStore;
  let orgStore: MockOrganizationStore;
  let service: AnnotationService;

  beforeEach(() => {
    annotationStore = new InMemoryLessonAnnotationStore();
    reportStore = new InMemoryContentReportStore();
    lessonStore = new MockLessonStore();
    moduleStore = new MockModuleStore();
    courseStore = new MockCourseStore();
    orgStore = new MockOrganizationStore();

    orgStore.addMember(orgId, userA.userId);
    orgStore.addMember(orgId, userB.userId);

    courseStore.add({
      id: courseId,
      organizationId: orgId,
      name: "داروشناسی بالینی",
      code: "PHARM-101",
      description: "مبانی داروشناسی",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    moduleStore.add({
      id: moduleId,
      courseId,
      title: "فصل اول: آنتی‌بیوتیک‌ها",
      description: "",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    lessonStore.add({
      id: lessonId,
      moduleId,
      title: "پنی‌سیلین‌ها و بتالاکتام‌ها",
      contentType: "markdown",
      contentMarkdown: "# پنی‌سیلین‌ها\n\nاین داروها با مهار ساخت دیواره سلولی باکتری عمل می‌کنند.",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    service = new AnnotationService(
      annotationStore,
      reportStore,
      lessonStore,
      moduleStore,
      courseStore as CourseStore,
      orgStore as OrganizationStore,
    );
  });

  it("creates and retrieves a highlight for the authenticated user", async () => {
    const created = await service.createAnnotation(userA, lessonId, {
      type: "highlight",
      selectedText: "مهار ساخت دیواره سلولی",
      prefix: "این داروها با ",
      suffix: " باکتری عمل می‌کنند.",
      startOffset: 30,
      endOffset: 52,
      color: "default",
    });

    expect(created.id).toBeDefined();
    expect(created.type).toBe("highlight");
    expect(created.selectedText).toBe("مهار ساخت دیواره سلولی");
    expect(created.userId).toBe(userA.userId);

    const userAList = await service.listAnnotations(userA, lessonId);
    expect(userAList).toHaveLength(1);
    expect(userAList[0].id).toBe(created.id);

    // User B should have an isolated empty list
    const userBList = await service.listAnnotations(userB, lessonId);
    expect(userBList).toHaveLength(0);
  });

  it("creates, updates, and deletes a note", async () => {
    const note = await service.createAnnotation(userA, lessonId, {
      type: "note",
      selectedText: "پنی‌سیلین‌ها",
      noteText: "نکته مهم: واکنش‌های حساسیتی و شوک آنافیلاکسی",
      startOffset: 2,
      endOffset: 14,
    });

    expect(note.type).toBe("note");
    expect(note.noteText).toBe("نکته مهم: واکنش‌های حساسیتی و شوک آنافیلاکسی");

    const updated = await service.updateAnnotation(userA, note.id, {
      noteText: "نکته به‌روزشده: آلرژی در ۵٪ بیماران",
    });

    expect(updated.noteText).toBe("نکته به‌روزشده: آلرژی در ۵٪ بیماران");

    // Deletion
    const deleted = await service.deleteAnnotation(userA, note.id);
    expect(deleted).toBe(true);

    const afterList = await service.listAnnotations(userA, lessonId);
    expect(afterList).toHaveLength(0);
  });

  it("prevents IDOR: user B cannot edit or delete user A's annotation", async () => {
    const note = await service.createAnnotation(userA, lessonId, {
      type: "note",
      selectedText: "دیواره سلولی",
      noteText: "یادداشت کاربر الف",
    });

    await expect(
      service.updateAnnotation(userB, note.id, { noteText: "هک توسط ب" }),
    ).rejects.toThrow("Cannot update another user's annotation");

    await expect(service.deleteAnnotation(userB, note.id)).rejects.toThrow(
      "Cannot delete another user's annotation",
    );
  });

  it("validates input fields (empty selection, invalid type)", async () => {
    await expect(
      service.createAnnotation(userA, lessonId, {
        type: "highlight",
        selectedText: "   ",
      }),
    ).rejects.toThrow("Selected text cannot be empty");

    await expect(
      service.createAnnotation(userA, lessonId, {
        type: "invalid_type" as unknown as "highlight",
        selectedText: "متن نمونه",
      }),
    ).rejects.toThrow("Invalid annotation type");
  });

  it("submits a content report with selection context and category", async () => {
    const report = await service.createReport(userA, lessonId, {
      selectedText: "مهار ساخت دیواره سلولی",
      category: "scientific_error",
      comment: "نیاز به ذکر اثر باکتریوسیدی دارد.",
    });

    expect(report.id).toBeDefined();
    expect(report.status).toBe("pending");
    expect(report.message).toBe("گزارش شما ثبت شد.");

    const stored = await reportStore.findById(report.id);
    expect(stored).toBeDefined();
    expect(stored?.selectedText).toBe("مهار ساخت دیواره سلولی");
    expect(stored?.category).toBe("scientific_error");
    expect(stored?.comment).toBe("نیاز به ذکر اثر باکتریوسیدی دارد.");
  });

  it("validates report category and throws on empty selection", async () => {
    await expect(
      service.createReport(userA, lessonId, {
        selectedText: "",
        category: "scientific_error",
      }),
    ).rejects.toThrow("Selected text cannot be empty");

    await expect(
      service.createReport(userA, lessonId, {
        selectedText: "برخی متن‌ها",
        category: "unknown_category" as unknown as "scientific_error",
      }),
    ).rejects.toThrow("Invalid report category");
  });
});
