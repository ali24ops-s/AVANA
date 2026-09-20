import { describe, expect, it, vi } from "vitest";
import {
  type Actor,
  type CourseId,
  type FlashcardId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type QuizId,
  type UserId,
  type DailyStudyPlan,
  type StudyTask,
  type StudyTaskStatus,
} from "@avana/domain";
import { StudyPlannerService } from "./study-planner-service.js";
import type {
  DailyStudyPlanStore,
  FlashcardStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  UserFlashcardScheduleRecord,
  QuizQuestionRecord,
} from "./study-store.js";
import type {
  LessonStore,
  ModuleStore,
  ProgressStore,
} from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";

// ---------------------------------------------------------------------------
// In-Memory Test Store Implementations
// ---------------------------------------------------------------------------

class InMemoryDailyStudyPlanStore implements DailyStudyPlanStore {
  public plans = new Map<string, DailyStudyPlan>();
  public tasks = new Map<string, StudyTask>();

  async findByUserAndDate(
    userId: UserId,
    planDate: string,
  ): Promise<DailyStudyPlan | undefined> {
    for (const p of this.plans.values()) {
      if (p.userId === userId && p.planDate === planDate) {
        return { ...p };
      }
    }
    return undefined;
  }

  async findById(id: string): Promise<DailyStudyPlan | undefined> {
    const p = this.plans.get(id);
    return p ? { ...p } : undefined;
  }

  async createPlanWithTasks(
    plan: Omit<DailyStudyPlan, "createdAt" | "updatedAt">,
    tasks: Array<Omit<StudyTask, "createdAt" | "updatedAt">>,
  ): Promise<{ plan: DailyStudyPlan; tasks: StudyTask[] }> {
    const existing = await this.findByUserAndDate(
      plan.userId as UserId,
      plan.planDate,
    );
    if (existing) {
      const existingTasks = await this.listTasksByPlan(existing.id);
      return { plan: existing, tasks: existingTasks };
    }

    const now = new Date().toISOString();
    const createdPlan: DailyStudyPlan = {
      ...plan,
      createdAt: now,
      updatedAt: now,
    };
    this.plans.set(createdPlan.id, createdPlan);

    const createdTasks: StudyTask[] = tasks.map((t) => ({
      ...t,
      createdAt: now,
      updatedAt: now,
    }));

    for (const t of createdTasks) {
      this.tasks.set(t.id, t);
    }

    return {
      plan: { ...createdPlan },
      tasks: createdTasks.map((t) => ({ ...t })),
    };
  }

  async listTasksByPlan(planId: string): Promise<StudyTask[]> {
    const res: StudyTask[] = [];
    for (const t of this.tasks.values()) {
      if (t.planId === planId) {
        res.push({ ...t });
      }
    }
    return res.sort((a, b) => a.priority - b.priority);
  }

  async listTasksByUserAndDate(
    userId: UserId,
    planDate: string,
  ): Promise<StudyTask[]> {
    const plan = await this.findByUserAndDate(userId, planDate);
    if (!plan) return [];
    return this.listTasksByPlan(plan.id);
  }

  async findTaskById(taskId: string): Promise<StudyTask | undefined> {
    const t = this.tasks.get(taskId);
    return t ? { ...t } : undefined;
  }

  async updatePlan(plan: DailyStudyPlan): Promise<DailyStudyPlan> {
    const updated: DailyStudyPlan = {
      ...plan,
      updatedAt: new Date().toISOString(),
    };
    this.plans.set(updated.id, updated);
    return { ...updated };
  }

  async updateTask(task: StudyTask): Promise<StudyTask> {
    const updated: StudyTask = {
      ...task,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(updated.id, updated);
    return { ...updated };
  }

  async updateTaskStatus(
    taskId: string,
    status: StudyTaskStatus,
    completedAt?: string | null,
  ): Promise<StudyTask | undefined> {
    const t = this.tasks.get(taskId);
    if (!t) return undefined;
    const updated: StudyTask = {
      ...t,
      status,
      completedAt: completedAt ?? (status === "completed" ? new Date().toISOString() : null),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return { ...updated };
  }

  async replaceTasksForPlan(
    planId: string,
    tasks: Array<Omit<StudyTask, "createdAt" | "updatedAt">>,
  ): Promise<StudyTask[]> {
    // Delete non-completed tasks
    for (const [id, t] of this.tasks.entries()) {
      if (t.planId === planId && t.status !== "completed") {
        this.tasks.delete(id);
      }
    }

    const now = new Date().toISOString();
    const created: StudyTask[] = tasks.map((t) => ({
      ...t,
      createdAt: now,
      updatedAt: now,
    }));

    for (const t of created) {
      this.tasks.set(t.id, t);
    }

    return this.listTasksByPlan(planId);
  }

  async deletePlan(id: string): Promise<void> {
    this.plans.delete(id);
    for (const [taskId, t] of this.tasks.entries()) {
      if (t.planId === id) {
        this.tasks.delete(taskId);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test Setup Helpers
// ---------------------------------------------------------------------------

const mockUserId = "11111111-1111-1111-1111-111111111111" as UserId;
const mockOrgId = "22222222-2222-2222-2222-222222222222" as OrganizationId;
const mockCourse1Id = "33333333-3333-3333-3333-333333333331" as CourseId;
const mockCourse2Id = "33333333-3333-3333-3333-333333333332" as CourseId;
const mockModule1Id = "44444444-4444-4444-4444-444444444441" as ModuleId;
const mockModule2Id = "44444444-4444-4444-4444-444444444442" as ModuleId;
const mockLesson1Id = "55555555-5555-5555-5555-555555555551" as LessonId;
const mockLesson2Id = "55555555-5555-5555-5555-555555555552" as LessonId;
const mockQuiz1Id = "66666666-6666-6666-6666-666666666661" as QuizId;

const actor: Actor = {
  userId: mockUserId,
  role: "student",
};

function createMockService() {
  const dailyPlanStore = new InMemoryDailyStudyPlanStore();

  const userFlashcardScheduleStore = {
    listByUser: vi.fn().mockResolvedValue([]),
    getByUserAndCard: vi.fn().mockResolvedValue(undefined),
    upsertSchedule: vi.fn(),
  } as unknown as UserFlashcardScheduleStore;

  const flashcardStore = {
    listByCourse: vi.fn().mockResolvedValue([]),
    listByOrganization: vi.fn().mockResolvedValue([]),
  } as unknown as FlashcardStore;

  const progressStore = {
    listByUserAndCourse: vi.fn().mockResolvedValue([]),
    findByUserAndLesson: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    countCompletedByUser: vi.fn().mockResolvedValue(0),
  } as unknown as ProgressStore;

  const lessonStore = {
    listByModules: vi.fn().mockResolvedValue([]),
    listByModule: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
  } as unknown as LessonStore;

  const moduleStore = {
    listByCourse: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
  } as unknown as ModuleStore;

  const courseStore = {
    listUserCourses: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
  } as unknown as CourseStore;

  const quizStore = {
    listByCourse: vi.fn().mockResolvedValue([]),
    listByOrganization: vi.fn().mockResolvedValue([]),
  } as unknown as QuizStore;

  const quizQuestionStore = {
    listByQuiz: vi.fn().mockResolvedValue([]),
    listByIds: vi.fn().mockResolvedValue([]),
    listByFilter: vi.fn().mockResolvedValue([]),
  } as unknown as QuizQuestionStore;

  const quizAttemptStore = {
    listByUser: vi.fn().mockResolvedValue([]),
    listByUserAndCourse: vi.fn().mockResolvedValue([]),
    listByUserAndQuiz: vi.fn().mockResolvedValue([]),
  } as unknown as QuizAttemptStore;

  const service = new StudyPlannerService({
    dailyPlanStore,
    userFlashcardScheduleStore,
    flashcardStore,
    progressStore,
    lessonStore,
    moduleStore,
    courseStore,
    quizStore,
    quizAttemptStore,
    quizQuestionStore,
  });

  return {
    service,
    dailyPlanStore,
    userFlashcardScheduleStore,
    flashcardStore,
    progressStore,
    lessonStore,
    moduleStore,
    courseStore,
    quizStore,
    quizQuestionStore,
    quizAttemptStore,
  };
}

// ---------------------------------------------------------------------------
// Unit & Integration Tests
// ---------------------------------------------------------------------------

describe("StudyPlannerService (Phase 2)", () => {
  it("1. Empty user: returns clean empty plan with status pending", async () => {
    const { service } = createMockService();

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(plan).toBeDefined();
    expect(plan.planDate).toBe("2026-09-18");
    expect(plan.userId).toBe(actor.userId);
    expect(plan.status).toBe("pending");
    expect(plan.targetDurationMinutes).toBe(120);
    expect(tasks).toHaveLength(0);
  });

  it("2. Due cards: creates REVIEW_FLASHCARDS candidate with correct metadata and priority", async () => {
    const { service, userFlashcardScheduleStore } = createMockService();

    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const mockSchedules: UserFlashcardScheduleRecord[] = Array.from({ length: 20 }).map(
      (_, i) => ({
        id: `sched-${i}`,
        userId: mockUserId,
        flashcardId: `card-${i}` as FlashcardId,
        dueAt: pastDate,
        intervalDays: 1,
        easeFactor: 2.5,
        lastReviewedAt: pastDate,
        reviewCount: 2,
        createdAt: pastDate,
        updatedAt: pastDate,
      }),
    );

    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue(mockSchedules);

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe("review_flashcards");
    expect(tasks[0].title).toBe("مرور فلش‌کارت‌های سررسیدشده");
    expect(tasks[0].estimatedMinutes).toBe(10); // 20 cards * 0.5 min = 10 min
    expect(tasks[0].metadata).toMatchObject({ dueCount: 20, category: "mandatory" });
    expect(plan.status).toBe("in_progress");
  });

  it("3. Incomplete lesson: selects uncompleted published lesson in correct module sequence", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      {
        id: mockModule1Id,
        courseId: mockCourse1Id,
        title: "فصل ۱: داروهای قلب",
        description: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      {
        id: mockLesson1Id,
        moduleId: mockModule1Id,
        title: "درس اول: آنتی‌آریتمی",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: mockLesson2Id,
        moduleId: mockModule1Id,
        title: "درس دوم: بتابلاکرها",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 2,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(2);
    expect(tasks[0].taskType).toBe("read_lesson");
    expect(tasks[0].lessonId).toBe(mockLesson1Id);
    expect(tasks[0].title).toBe("مطالعه درس: درس اول: آنتی‌آریتمی");
    expect(tasks[0].estimatedMinutes).toBe(20);

    expect(tasks[1].taskType).toBe("read_lesson");
    expect(tasks[1].lessonId).toBe(mockLesson2Id);
    expect(tasks[1].title).toBe("مطالعه درس: درس دوم: بتابلاکرها");
    expect(tasks[1].estimatedMinutes).toBe(20);
  });

  it("4. Completed lesson: does NOT suggest already completed lesson", async () => {
    const { service, courseStore, moduleStore, lessonStore, progressStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      {
        id: mockModule1Id,
        courseId: mockCourse1Id,
        title: "فصل ۱",
        description: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      {
        id: mockLesson1Id,
        moduleId: mockModule1Id,
        title: "درس ۱",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: mockLesson2Id,
        moduleId: mockModule1Id,
        title: "درس ۲",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 2,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    // Lesson 1 is completed
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      {
        id: "p1",
        userId: mockUserId,
        lessonId: mockLesson1Id,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].lessonId).toBe(mockLesson2Id);
    expect(tasks[0].title).toBe("مطالعه درس: درس ۲");
  });

  it("5. Weak quiz: generates REVIEW_WRONG_ANSWERS candidate with high priority", async () => {
    const { service, courseStore, quizStore, quizAttemptStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "قلب و عروق",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      {
        id: mockQuiz1Id,
        courseId: mockCourse1Id,
        organizationId: mockOrgId,
        documentId: null,
        title: "کوییز جامع قلب",
        status: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    // Last attempt score = 45% (< 70%)
    vi.mocked(quizAttemptStore.listByUser).mockResolvedValue([
      {
        id: "att-1",
        quizId: mockQuiz1Id,
        userId: mockUserId,
        score: 45,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe("review_wrong_answers");
    expect(tasks[0].quizId).toBe(mockQuiz1Id);
    expect(tasks[0].title).toBe("مرور و آزمون مجدد: کوییز جامع قلب");
    expect(tasks[0].metadata).toHaveProperty("lastScore", 45);
  });

  it("6. Cross-course: gathers and packs candidates from multiple active courses", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره ۱",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: mockCourse2Id,
        organizationId: mockOrgId,
        name: "دوره ۲",
        status: "published",
        subject: "داروسازی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockImplementation(async (cId) => [
      {
        id: `mod-${cId}` as ModuleId,
        courseId: cId,
        title: `فصل ${cId}`,
        description: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(lessonStore.listByModules).mockImplementation(async (modIds) => [
      {
        id: `les-${modIds[0]}` as LessonId,
        moduleId: modIds[0],
        title: `درس مربوط به ${modIds[0]}`,
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", {
      targetMinutes: 45,
    });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.courseId)).toEqual([mockCourse1Id, mockCourse2Id]);
    expect(tasks[0].estimatedMinutes + tasks[1].estimatedMinutes).toBe(40);
  });

  it("7. Entitlement: filters out non-entitled lessons", async () => {
    const { dailyPlanStore, userFlashcardScheduleStore, flashcardStore, progressStore, lessonStore, moduleStore, courseStore, quizStore, quizAttemptStore } = createMockService();

    const entitlementService = {
      checkAccess: vi.fn().mockResolvedValue({ granted: false, reason: "locked" }),
    } as unknown as EntitlementService;

    const service = new StudyPlannerService({
      dailyPlanStore,
      userFlashcardScheduleStore,
      flashcardStore,
      progressStore,
      lessonStore,
      moduleStore,
      courseStore,
      quizStore,
      quizAttemptStore,
      entitlementService,
    });

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره قفل شده",
        status: "published",
        subject: null,
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      {
        id: mockModule1Id,
        courseId: mockCourse1Id,
        title: "فصل ۱",
        description: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      {
        id: mockLesson1Id,
        moduleId: mockModule1Id,
        title: "درس پریمیوم",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(0);
  });

  it("8. Existing plan: returns existing plan and tasks without duplicate creation", async () => {
    const { service, userFlashcardScheduleStore } = createMockService();

    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue([
      {
        id: "s1",
        userId: mockUserId,
        flashcardId: "card-1" as FlashcardId,
        dueAt: pastDate,
        intervalDays: 1,
        easeFactor: 2.5,
        lastReviewedAt: pastDate,
        reviewCount: 1,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const firstResult = await service.getOrCreateDailyPlan(actor, "2026-09-18");
    expect(firstResult.tasks).toHaveLength(1);

    const secondResult = await service.getOrCreateDailyPlan(actor, "2026-09-18");
    expect(secondResult.plan.id).toBe(firstResult.plan.id);
    expect(secondResult.tasks).toHaveLength(1);
    expect(secondResult.tasks[0].id).toBe(firstResult.tasks[0].id);
  });

  it("9. Auto-synchronization: advances task to completed when underlying lesson is marked complete", async () => {
    const { service, courseStore, moduleStore, lessonStore, progressStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره",
        status: "published",
        subject: null,
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);
    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Initially lesson is not complete
    const { tasks: initialTasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");
    expect(initialTasks[0].status).toBe("pending");

    // Later, lesson is completed in progressStore
    vi.mocked(progressStore.findByUserAndLesson).mockResolvedValue({
      id: "prog-1",
      userId: mockUserId,
      lessonId: mockLesson1Id,
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: "",
      updatedAt: "",
    });

    const { plan, tasks: syncedTasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(syncedTasks[0].status).toBe("completed");
    expect(plan.status).toBe("completed");
    expect(plan.completedDurationMinutes).toBe(20);
  });

  it("10. Regeneration: preserves completed tasks and replaces pending tasks with fresh candidates", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره",
        status: "published",
        subject: null,
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);
    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: mockLesson2Id, moduleId: mockModule1Id, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 2, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 30 });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].lessonId).toBe(mockLesson1Id);

    // Manually complete task 1
    await service.updateTaskStatus(actor, tasks[0].id, "completed");

    // Now regenerate
    const regenerated = await service.regenerateDailyPlan(actor, "2026-09-18", { targetMinutes: 45 });

    expect(regenerated.tasks.length).toBeGreaterThanOrEqual(1);
    expect(regenerated.tasks[0].id).toBe(tasks[0].id);
    expect(regenerated.tasks[0].status).toBe("completed");
  });

  it("11. Determinism: produces exact identical plan and task order for identical inputs", async () => {
    const setup1 = createMockService();
    const setup2 = createMockService();

    const plan1 = await setup1.service.getOrCreateDailyPlan(actor, "2026-09-18");
    const plan2 = await setup2.service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(plan1.tasks.map((t) => t.title)).toEqual(plan2.tasks.map((t) => t.title));
    expect(plan1.plan.targetDurationMinutes).toBe(plan2.plan.targetDurationMinutes);
  });
});

function getFutureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("StudyPlannerService Phase 5: Exam-Aware Daily Study Planning", () => {
  it("1. Critical Exam (< 3 days): boosts in-scope tasks by +800, sets budget to 360m, tags category mandatory", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    // Exam in 2 days
    const examDate = getFutureDateString(2);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی قلب",
        status: "published",
        subject: "پزشکی",
        examDate,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      {
        id: mockModule1Id,
        courseId: mockCourse1Id,
        title: "فصل ۱: داروهای قلب",
        description: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      {
        id: mockLesson1Id,
        moduleId: mockModule1Id,
        title: "درس ۱: آریتمی",
        contentType: "markdown",
        contentMarkdown: "...",
        sortOrder: 1,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(plan.targetDurationMinutes).toBe(360); // Critical exam budget
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.isExamRelated).toBe(true);
    expect(tasks[0].metadata?.category).toBe("mandatory");
    expect(tasks[0].metadata?.examDaysRemaining).toBe(2);
  });

  it("2. Near Exam (3 <= days < 7): boosts in-scope tasks by +400, sets budget to 240m", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    // Exam in 4 days
    const examDate = getFutureDateString(4);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(plan.targetDurationMinutes).toBe(240); // Near exam budget
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.isExamRelated).toBe(true);
    expect(tasks[0].metadata?.examDaysRemaining).toBe(4);
  });

  it("3. Distant Exam (>= 7 days): boosts in-scope tasks by +150, normal budget 120m", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    // Exam in 10 days
    const examDate = getFutureDateString(10);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(plan.targetDurationMinutes).toBe(120); // Normal budget
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.isExamRelated).toBe(true);
    expect(tasks[0].metadata?.examDaysRemaining).toBe(10);
  });

  it("4. Multi-exam handling: boosts candidates according to their specific course's exam", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    const dateExamCourse1 = getFutureDateString(2); // in 2 days (+800)
    const dateExamCourse2 = getFutureDateString(5); // in 5 days (+400)

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره ۱",
        status: "published",
        subject: "پزشکی",
        examDate: dateExamCourse1,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: mockCourse2Id,
        organizationId: mockOrgId,
        name: "دوره ۲",
        status: "published",
        subject: "پزشکی",
        examDate: dateExamCourse2,
        examScope: { moduleIds: [mockModule2Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockImplementation(async (cId) => {
      if (cId === mockCourse1Id) {
        return [{ id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null }];
      }
      return [{ id: mockModule2Id, courseId: mockCourse2Id, title: "فصل ۲", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null }];
    });

    vi.mocked(lessonStore.listByModules).mockImplementation(async (modIds) => {
      if (modIds.includes(mockModule1Id)) {
        return [{ id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null }];
      }
      return [{ id: mockLesson2Id, moduleId: mockModule2Id, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null }];
    });

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    // Nearest exam is 2 days -> budget is 360m
    expect(plan.targetDurationMinutes).toBe(360);
    expect(tasks).toHaveLength(2);

    // Task 1 from Course 1 gets +800 (critical boost) -> ranked first (priority 1)
    expect(tasks[0].lessonId).toBe(mockLesson1Id);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.examDaysRemaining).toBe(2);

    // Task 2 from Course 2 gets +400 (near boost) -> ranked second (priority 2)
    expect(tasks[1].lessonId).toBe(mockLesson2Id);
    expect(tasks[1].priority).toBe(2);
    expect(tasks[1].metadata?.examDaysRemaining).toBe(5);
  });

  it("5. Multi-course mixed with non-exam course: non-exam course gets 0 boost", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    const dateExamCourse1 = getFutureDateString(2);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "دوره آزمون‌دار",
        status: "published",
        subject: "پزشکی",
        examDate: dateExamCourse1,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: mockCourse2Id,
        organizationId: mockOrgId,
        name: "دوره بدون آزمون",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        examScope: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockImplementation(async (cId) => {
      if (cId === mockCourse1Id) {
        return [{ id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null }];
      }
      return [{ id: mockModule2Id, courseId: mockCourse2Id, title: "فصل ۲", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null }];
    });

    vi.mocked(lessonStore.listByModules).mockImplementation(async (modIds) => {
      if (modIds.includes(mockModule1Id)) {
        return [{ id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null }];
      }
      return [{ id: mockLesson2Id, moduleId: mockModule2Id, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null }];
    });

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(2);
    expect(tasks[0].lessonId).toBe(mockLesson1Id);
    expect(tasks[0].metadata?.isExamRelated).toBe(true);

    expect(tasks[1].lessonId).toBe(mockLesson2Id);
    expect(tasks[1].metadata?.isExamRelated).toBe(false);
  });

  it("6. Course with past/expired exam date does not activate exam urgency", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    // Exam in past (3 days ago)
    const pastExamDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate: pastExamDate,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { plan, tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    // Falls back to standard budget (120m)
    expect(plan.targetDurationMinutes).toBe(120);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.isExamRelated).toBe(false);
  });

  it("7. Course with exam date but empty/null examScope does NOT boost candidates", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    const examDate = getFutureDateString(2);

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی بدون اسکوپ",
        status: "published",
        subject: "پزشکی",
        examDate,
        examScope: null, // No scope configured
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    expect(tasks).toHaveLength(1);
    expect(tasks[0].priority).toBe(1);
    expect(tasks[0].metadata?.isExamRelated).toBe(false);
  });

  it("8. targetMinutes floor: passing a lower targetMinutes (e.g. 45m) does not reduce active exam budget", async () => {
    const { service, courseStore, moduleStore, lessonStore } = createMockService();

    const dateExamCourse1 = getFutureDateString(1); // 1 day -> critical (360 min)

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی",
        status: "published",
        subject: "پزشکی",
        examDate: dateExamCourse1,
        examScope: { moduleIds: [mockModule1Id] },
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Request 45 minutes explicitly
    const { plan } = await service.getOrCreateDailyPlan(actor, "2026-09-18", {
      targetMinutes: 45,
    });

    // Enforces exam budget of 360 min
    expect(plan.targetDurationMinutes).toBe(360);
  });

  it("9. Flashcards chapter extraction: generates chapter-based titles on line 1 with full courseName metadata", async () => {
    const { service, courseStore, moduleStore, lessonStore, flashcardStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      {
        id: mockCourse1Id,
        organizationId: mockOrgId,
        name: "فارماکولوژی ۳",
        status: "published",
        subject: "پزشکی",
        examDate: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const mod1Id = "mod-101" as ModuleId;
    const mod2Id = "mod-102" as ModuleId;
    const mod3Id = "mod-103" as ModuleId;

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mod1Id, courseId: mockCourse1Id, title: "فصل ۱: مبانی فارماکولوژی", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
      { id: mod2Id, courseId: mockCourse1Id, title: "فصل ۲: فارماکوکینتیک", description: null, sortOrder: 2, createdAt: "", updatedAt: "", deletedAt: null },
      { id: mod3Id, courseId: mockCourse1Id, title: "فصل ۳: داروهای سیستم قلبی", description: null, sortOrder: 3, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const les1Id = "les-101" as LessonId;
    const les3Id = "les-103" as LessonId;

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: les1Id, moduleId: mod1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: les3Id, moduleId: mod3Id, title: "درس ۳", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const fc1 = "card-chap-1" as FlashcardId;
    const fc2 = "card-chap-3" as FlashcardId;

    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      {
        id: fc1,
        organizationId: mockOrgId,
        courseId: mockCourse1Id,
        lessonId: les1Id,
        question: "Q1",
        answer: "A1",
        explanation: null,
        cardType: "concept",
        difficulty: "easy",
        dueAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: fc2,
        organizationId: mockOrgId,
        courseId: mockCourse1Id,
        lessonId: les3Id,
        question: "Q2",
        answer: "A2",
        explanation: null,
        cardType: "concept",
        difficulty: "easy",
        dueAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);

    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue([
      {
        id: "sched-1",
        userId: mockUserId,
        flashcardId: fc1,
        dueAt: pastIso,
        intervalDays: 1,
        easeFactor: 2.5,
        lastReviewedAt: pastIso,
        reviewCount: 1,
        createdAt: pastIso,
        updatedAt: pastIso,
      },
      {
        id: "sched-2",
        userId: mockUserId,
        flashcardId: fc2,
        dueAt: pastIso,
        intervalDays: 1,
        easeFactor: 2.5,
        lastReviewedAt: pastIso,
        reviewCount: 1,
        createdAt: pastIso,
        updatedAt: pastIso,
      },
    ]);

    // Test multi-chapter flashcard candidate: chapters 1 and 3
    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18");

    const fcTask = tasks.find((t) => t.taskType === "review_flashcards");
    expect(fcTask).toBeDefined();
    expect(fcTask?.title).toBe("مرور فلش‌کارت‌های فصل ۱، ۳");
    expect(fcTask?.metadata?.courseName).toBe("فارماکولوژی ۳");
    expect(fcTask?.metadata?.chapterNumbers).toEqual([1, 3]);
  });
});

describe("StudyPlannerService Adaptive Learning Loop (12 Scenarios)", () => {
  it("Scenario 1 — Brand New User (0% progress, >= 6 lessons): consecutive lessons fill capacity, quizzes do NOT dominate", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "زیست‌شناسی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const mod1Id = "mod-1" as ModuleId;
    const mod2Id = "mod-2" as ModuleId;

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mod1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
      { id: mod2Id, courseId: mockCourse1Id, title: "فصل ۲", description: null, sortOrder: 2, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const sixLessons = Array.from({ length: 6 }).map((_, i) => ({
      id: `les-${i + 1}` as LessonId,
      moduleId: i < 3 ? mod1Id : mod2Id,
      title: `درس ${i + 1}`,
      contentType: "markdown",
      contentMarkdown: "...",
      sortOrder: (i % 3) + 1,
      estimatedMinutes: 20,
      publicationStatus: "published" as const,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    }));

    vi.mocked(lessonStore.listByModules).mockResolvedValue(sixLessons);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: "q1" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۱", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: "q2" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۲", topic: "فصل ۲", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: "q3" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز جامع", topic: null, status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 120 });

    expect(tasks).toHaveLength(6);
    expect(tasks.every((t) => t.taskType === "read_lesson")).toBe(true);
    expect(tasks.map((t) => t.lessonId)).toEqual([
      "les-1",
      "les-2",
      "les-3",
      "les-4",
      "les-5",
      "les-6",
    ]);
    expect(tasks.every((t) => t.metadata?.learningStage === "UNSEEN")).toBe(true);
    // Quizzes are strictly locked and not selected
    expect(tasks.some((t) => t.taskType === "take_quiz")).toBe(false);
  });

  it("Scenario 2 — Less than 6 lessons (e.g. 3 lessons): does not add unrelated locked quizzes to fill capacity", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "زیست", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const threeLessons = Array.from({ length: 3 }).map((_, i) => ({
      id: `les-${i + 1}` as LessonId,
      moduleId: mockModule1Id,
      title: `درس ${i + 1}`,
      contentType: "markdown",
      contentMarkdown: "...",
      sortOrder: i + 1,
      estimatedMinutes: 20,
      publicationStatus: "published" as const,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    }));

    vi.mocked(lessonStore.listByModules).mockResolvedValue(threeLessons);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: "q1" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز ۱", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: "q2" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز ۲", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Request 120 minutes, but only 3 lessons * 20 min = 60 min are available
    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 120 });

    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.lessonId)).toEqual(["les-1", "les-2", "les-3"]);
    expect(tasks.some((t) => t.taskType === "take_quiz")).toBe(false);
  });

  it("Scenario 3 — One chapter studied: only quiz/flashcard for that scope unlocked", async () => {
    const { service, courseStore, moduleStore, lessonStore, flashcardStore, progressStore, quizStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "فارماکولوژی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const mod1Id = "mod-1" as ModuleId;
    const mod2Id = "mod-2" as ModuleId;

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mod1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
      { id: mod2Id, courseId: mockCourse1Id, title: "فصل ۲", description: null, sortOrder: 2, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const les1Id = "les-1" as LessonId;
    const les2Id = "les-2" as LessonId;

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: les1Id, moduleId: mod1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: les2Id, moduleId: mod2Id, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Lesson 1 is completed
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: les1Id, completed: true, completedAt: new Date().toISOString(), createdAt: "", updatedAt: "" },
    ]);

    // Flashcards for Lesson 1 (unreviewed)
    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      { id: "fc-1" as FlashcardId, organizationId: mockOrgId, courseId: mockCourse1Id, lessonId: les1Id, question: "Q1", answer: "A1", explanation: null, cardType: "concept", difficulty: "easy", dueAt: "", intervalDays: 0, easeFactor: 2.5, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: "q1" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۱", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: "q2" as QuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۲", topic: "فصل ۲", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 60 });

    // Flashcards for Lesson 1 (new learning, priority 580) and Next Lesson 2 (priority 500)
    expect(tasks).toHaveLength(2);
    expect(tasks[0].taskType).toBe("review_flashcards");
    expect(tasks[0].lessonId).toBe(les1Id);
    expect(tasks[0].metadata?.learningStage).toBe("STUDIED_FLASHCARDS");

    expect(tasks[1].taskType).toBe("read_lesson");
    expect(tasks[1].lessonId).toBe(les2Id);

    // Quiz 1 is locked because flashcards are not yet reviewed; Quiz 2 is locked because Lesson 2 is not completed
    expect(tasks.some((t) => t.taskType === "take_quiz")).toBe(false);
  });

  it("Scenario 4 — Weak Quiz: targeted lesson review + flashcard review + retry with high priority", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, quizAttemptStore, flashcardStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "قلب", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱: فیزیولوژی قلب", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱: الکتروفیزیولوژی", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: mockLesson2Id, moduleId: mockModule1Id, title: "درس ۲: پمپاژ قلب", contentType: "markdown", contentMarkdown: "", sortOrder: 2, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      { id: "fc-1" as FlashcardId, organizationId: mockOrgId, courseId: mockCourse1Id, lessonId: mockLesson1Id, question: "Q1", answer: "A1", explanation: null, cardType: "concept", difficulty: "easy", dueAt: "", intervalDays: 0, easeFactor: 2.5, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: mockQuiz1Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۱", topic: "فصل ۱: فیزیولوژی قلب", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // User attempted Quiz 1 and scored 45% (< 70%)
    vi.mocked(quizAttemptStore.listByUser).mockResolvedValue([
      {
        id: "att-1",
        quizId: mockQuiz1Id,
        userId: mockUserId,
        score: 45,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 120 });

    // Expect: Targeted Lesson Review (855), Quiz Retake (805), Targeted Flashcards (780), Next Lesson (500)
    expect(tasks.length).toBeGreaterThanOrEqual(3);

    const targetedLessonTask = tasks.find((t) => t.taskType === "read_lesson" && t.metadata?.isTargetedReview);
    expect(targetedLessonTask).toBeDefined();
    expect(targetedLessonTask?.title).toContain("مرور نقاط ضعف: درس ۱: الکتروفیزیولوژی");
    expect(targetedLessonTask?.lessonId).toBe(mockLesson1Id);

    const retakeTask = tasks.find((t) => t.taskType === "review_wrong_answers");
    expect(retakeTask).toBeDefined();
    expect(retakeTask?.quizId).toBe(mockQuiz1Id);

    const weakFcTask = tasks.find((t) => t.taskType === "review_flashcards" && t.metadata?.isTargetedReview);
    expect(weakFcTask).toBeDefined();
    expect(weakFcTask?.lessonId).toBe(mockLesson1Id);

    // Priority ordering check: Targeted lesson review > Quiz retake > Unstudied next lesson
    const targetedLessonIndex = tasks.indexOf(targetedLessonTask!);
    const retakeIndex = tasks.indexOf(retakeTask!);
    expect(targetedLessonIndex).toBeLessThan(retakeIndex);
  });

  it("Scenario 5 — Good Quiz: progresses to next content without endless loop on same quiz", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, quizAttemptStore, progressStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "فارما", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: mockLesson2Id, moduleId: mockModule1Id, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 2, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Lesson 1 is completed
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: mockLesson1Id, completed: true, completedAt: new Date().toISOString(), createdAt: "", updatedAt: "" },
    ]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: mockQuiz1Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز درس ۱", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // User passed Quiz 1 with 85% (>= 70%)
    vi.mocked(quizAttemptStore.listByUser).mockResolvedValue([
      {
        id: "att-good",
        quizId: mockQuiz1Id,
        userId: mockUserId,
        score: 85,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 30 });

    // Should NOT propose Quiz 1 again; should advance to Lesson 2
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe("read_lesson");
    expect(tasks[0].lessonId).toBe(mockLesson2Id);
    expect(tasks.some((t) => t.quizId === mockQuiz1Id)).toBe(false);
  });

  it("Scenario 6 — Multi-chapter studied: combined/comprehensive quiz unlocks only when progression >= 50%", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, progressStore, flashcardStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "بیوشیمی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const m1 = "m-1" as ModuleId;
    const m2 = "m-2" as ModuleId;
    const m3 = "m-3" as ModuleId;
    const m4 = "m-4" as ModuleId;

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: m1, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
      { id: m2, courseId: mockCourse1Id, title: "فصل ۲", description: null, sortOrder: 2, createdAt: "", updatedAt: "", deletedAt: null },
      { id: m3, courseId: mockCourse1Id, title: "فصل ۳", description: null, sortOrder: 3, createdAt: "", updatedAt: "", deletedAt: null },
      { id: m4, courseId: mockCourse1Id, title: "فصل ۴", description: null, sortOrder: 4, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const l1 = "l-1" as LessonId;
    const l2 = "l-2" as LessonId;
    const l3 = "l-3" as LessonId;
    const l4 = "l-4" as LessonId;

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: l1, moduleId: m1, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: l2, moduleId: m2, title: "درس ۲", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: l3, moduleId: m3, title: "درس ۳", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: l4, moduleId: m4, title: "درس ۴", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const compQuizId = "quiz-comp" as QuizId;
    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: compQuizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "آزمون جامع نیم‌سال", topic: null, status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // 1. When only Lesson 1 is completed (25% progress < 50%): Comprehensive quiz is LOCKED
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: l1, completed: true, completedAt: "", createdAt: "", updatedAt: "" },
    ]);

    const plan25 = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 60 });
    expect(plan25.tasks.some((t) => t.quizId === compQuizId)).toBe(false);

    // 2. When Lessons 1 and 2 are completed (50% progress >= 50%): Comprehensive quiz is UNLOCKED
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: l1, completed: true, completedAt: "", createdAt: "", updatedAt: "" },
      { id: "p2", userId: mockUserId, lessonId: l2, completed: true, completedAt: "", createdAt: "", updatedAt: "" },
    ]);

    const candidates = await service.collectCandidates(actor);
    const compCandidate = candidates.find((c) => c.quizId === compQuizId);
    expect(compCandidate).toBeDefined();
    expect(compCandidate?.metadata?.learningStage).toBe("COMPREHENSIVE_QUIZ");
  });

  it("Scenario 7 — 100% completion: reviews and quizzes form main part of plan", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, progressStore, flashcardStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "ایمونولوژی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // 100% completed
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: mockLesson1Id, completed: true, completedAt: "", createdAt: "", updatedAt: "" },
    ]);

    const fc1 = "fc-imm-1" as FlashcardId;
    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      { id: fc1, organizationId: mockOrgId, courseId: mockCourse1Id, lessonId: mockLesson1Id, question: "Q", answer: "A", explanation: null, cardType: "concept", difficulty: "easy", dueAt: "", intervalDays: 1, easeFactor: 2.5, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Flashcard is due
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue([
      { id: "s1", userId: mockUserId, flashcardId: fc1, dueAt: pastDate, intervalDays: 1, easeFactor: 2.5, lastReviewedAt: pastDate, reviewCount: 2, createdAt: "", updatedAt: "" },
    ]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: mockQuiz1Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "آزمون تثبیتی ایمونولوژی", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 60 });

    expect(tasks).toHaveLength(2);
    expect(tasks.some((t) => t.taskType === "review_flashcards")).toBe(true);
    expect(tasks.some((t) => t.taskType === "take_quiz")).toBe(true);
    // No new reading lessons generated since all are complete
    expect(tasks.some((t) => t.taskType === "read_lesson" && !t.metadata?.isTargetedReview)).toBe(false);
  });

  it("Scenario 8 — Due Flashcards: cards with review history and dueAt <= now generate review task", async () => {
    const { service, userFlashcardScheduleStore } = createMockService();

    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue([
      {
        id: "s1",
        userId: mockUserId,
        flashcardId: "card-due-1" as FlashcardId,
        dueAt: pastDate,
        intervalDays: 2,
        easeFactor: 2.5,
        lastReviewedAt: pastDate,
        reviewCount: 3,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const candidates = await service.collectCandidates(actor);
    const dueCandidate = candidates.find((c) => c.type === "review_flashcards");

    expect(dueCandidate).toBeDefined();
    expect(dueCandidate?.priority).toBeGreaterThanOrEqual(1000);
    expect(dueCandidate?.metadata?.dueCount).toBe(1);
    expect(dueCandidate?.metadata?.learningStage).toBe("SRS_DUE");
  });

  it("Scenario 9 — New Flashcards: unstudied lesson flashcards are NOT proposed as review tasks", async () => {
    const { service, courseStore, moduleStore, lessonStore, flashcardStore, progressStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "ژنتیک", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mockModule1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: mockLesson1Id, moduleId: mockModule1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Lesson 1 is UNSTUDIED (progress is empty)
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([]);

    // Flashcards exist for Lesson 1 with reviewCount = 0 (unreviewed)
    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      { id: "fc-unstudied" as FlashcardId, organizationId: mockOrgId, courseId: mockCourse1Id, lessonId: mockLesson1Id, question: "Q", answer: "A", explanation: null, cardType: "concept", difficulty: "easy", dueAt: "", intervalDays: 0, easeFactor: 2.5, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const candidates = await service.collectCandidates(actor);

    // Lesson 1 read_lesson is generated, but NO flashcard review candidate is generated before studying the lesson
    expect(candidates.some((c) => c.type === "read_lesson" && c.lessonId === mockLesson1Id)).toBe(true);
    expect(candidates.some((c) => c.type === "review_flashcards")).toBe(false);
  });

  it("Scenario 10 — Quiz-only Course: proposes quizzes normally when course has no lessons", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "بانک تست جامع کنکور", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // 0 modules & 0 lessons
    vi.mocked(moduleStore.listByCourse).mockResolvedValue([]);
    vi.mocked(lessonStore.listByModules).mockResolvedValue([]);

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: mockQuiz1Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "آزمون مبحثی شماره ۱", topic: null, status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const { tasks } = await service.getOrCreateDailyPlan(actor, "2026-09-18", { targetMinutes: 30 });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe("take_quiz");
    expect(tasks[0].quizId).toBe(mockQuiz1Id);
    expect(tasks[0].title).toBe("حل آزمون: آزمون مبحثی شماره ۱");
  });

  it("Scenario 11 — Scope Isolation: studying Chapter 1 does not unlock Chapter 4 quiz", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, progressStore, flashcardStore, userFlashcardScheduleStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "آناتومی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const mod1Id = "m-chap-1" as ModuleId;
    const mod4Id = "m-chap-4" as ModuleId;

    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mod1Id, courseId: mockCourse1Id, title: "فصل ۱: اندام فوقانی", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
      { id: mod4Id, courseId: mockCourse1Id, title: "فصل ۴: سیستم عصبی", description: null, sortOrder: 4, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const les1Id = "les-chap-1" as LessonId;
    const les4Id = "les-chap-4" as LessonId;

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: les1Id, moduleId: mod1Id, title: "درس ۱", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: les4Id, moduleId: mod4Id, title: "درس ۴", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Only Lesson 1 is completed
    vi.mocked(progressStore.listByUserAndCourse).mockResolvedValue([
      { id: "p1", userId: mockUserId, lessonId: les1Id, completed: true, completedAt: "", createdAt: "", updatedAt: "" },
    ]);

    const fc1 = "fc-chap-1" as FlashcardId;
    vi.mocked(flashcardStore.listByCourse).mockResolvedValue([
      { id: fc1, organizationId: mockOrgId, courseId: mockCourse1Id, lessonId: les1Id, question: "Q", answer: "A", explanation: null, cardType: "concept", difficulty: "easy", dueAt: "", intervalDays: 1, easeFactor: 2.5, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Flashcards for Lesson 1 were reviewed
    vi.mocked(userFlashcardScheduleStore.listByUser).mockResolvedValue([
      { id: "s1", userId: mockUserId, flashcardId: fc1, dueAt: new Date(Date.now() + 86400000).toISOString(), intervalDays: 1, easeFactor: 2.5, lastReviewedAt: new Date().toISOString(), reviewCount: 1, createdAt: "", updatedAt: "" },
    ]);

    const quiz1Id = "quiz-chap-1" as QuizId;
    const quiz4Id = "quiz-chap-4" as QuizId;

    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: quiz1Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۱", topic: "فصل ۱: اندام فوقانی", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: quiz4Id, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز فصل ۴", topic: "فصل ۴: سیستم عصبی", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const candidates = await service.collectCandidates(actor);

    // Quiz 1 is unlocked because Lesson 1 studied + Flashcard 1 reviewed
    expect(candidates.some((c) => c.quizId === quiz1Id)).toBe(true);

    // Quiz 4 MUST be strictly locked because Module 4 / Lesson 4 is unstudied
    expect(candidates.some((c) => c.quizId === quiz4Id)).toBe(false);
  });

  it("Scenario 12 — Weak Question Mapping: wrong questions map to specific weak lesson for targeted review", async () => {
    const { service, courseStore, moduleStore, lessonStore, quizStore, quizQuestionStore, quizAttemptStore } = createMockService();

    vi.mocked(courseStore.listUserCourses).mockResolvedValue([
      { id: mockCourse1Id, organizationId: mockOrgId, name: "فیزیولوژی", status: "published", subject: "پزشکی", examDate: null, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const mod1Id = "m-1" as ModuleId;
    vi.mocked(moduleStore.listByCourse).mockResolvedValue([
      { id: mod1Id, courseId: mockCourse1Id, title: "فصل ۱", description: null, sortOrder: 1, createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const les1Id = "les-cardio-1" as LessonId;
    const les4Id = "les-cardio-4" as LessonId;

    vi.mocked(lessonStore.listByModules).mockResolvedValue([
      { id: les1Id, moduleId: mod1Id, title: "درس ۱: گره سینوسی", contentType: "markdown", contentMarkdown: "", sortOrder: 1, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
      { id: les4Id, moduleId: mod1Id, title: "درس ۴: پتانسیل عمل بطنی", contentType: "markdown", contentMarkdown: "", sortOrder: 4, estimatedMinutes: 20, publicationStatus: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    const quizId = "quiz-cardio" as QuizId;
    vi.mocked(quizStore.listByCourse).mockResolvedValue([
      { id: quizId, organizationId: mockOrgId, courseId: mockCourse1Id, documentId: null, title: "کوییز جامع فیزیولوژی قلب", topic: "فصل ۱", status: "published", createdAt: "", updatedAt: "", deletedAt: null },
    ]);

    // Questions mapped to Lesson 1 and Lesson 4
    vi.mocked(quizQuestionStore.listByQuiz).mockResolvedValue([
      {
        id: "q-1" as any,
        quizId,
        generatedContentId: null,
        lessonId: les1Id,
        question: "Q1",
        questionType: "multiple_choice",
        choices: ["A", "B"],
        correctAnswer: "A",
        explanation: null,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "q-2" as any,
        quizId,
        generatedContentId: null,
        lessonId: les4Id,
        question: "Q2",
        questionType: "multiple_choice",
        choices: ["A", "B"],
        correctAnswer: "B",
        explanation: null,
        sortOrder: 2,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    // User answered Q1 correctly ('A'), but answered Q2 incorrectly ('A' instead of 'B'). Score = 50% (< 70%)
    vi.mocked(quizAttemptStore.listByUser).mockResolvedValue([
      {
        id: "att-mapping-test",
        quizId,
        userId: mockUserId,
        score: 50,
        answers: { "q-1": "A", "q-2": "A" },
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);

    const candidates = await service.collectCandidates(actor);

    // Targeted lesson review MUST specifically target Lesson 4 (les4Id) and NOT Lesson 1!
    const targetedTasks = candidates.filter((c) => c.type === "read_lesson" && c.metadata?.isTargetedReview);
    expect(targetedTasks).toHaveLength(1);
    expect(targetedTasks[0].lessonId).toBe(les4Id);
    expect(targetedTasks[0].title).toBe("مرور نقاط ضعف: درس ۴: پتانسیل عمل بطنی");
    expect(targetedTasks[0].metadata?.lastScore).toBe(50);
  });
});

