import { describe, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
} from "../modules/learning/test/in-memory-stores.js";
import { ContentService } from "../modules/learning/content-service.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { InMemoryProgressStore } from "../modules/learning/test/in-memory-stores.js";
import type {
  Actor,
  CourseId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

describe("Lesson Deletion Read-After-Write Verification", () => {
  test("creates a lesson, deletes it, verifies deletedAt in DB store, and confirms exclusion from course content and learning queries", async () => {
    const orgStore = new InMemoryOrganizationStore();
    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();

    const contentService = new ContentService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
    );

    const learningService = new LearningService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
      progressStore,
    );

    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const moduleId = randomUUID() as ModuleId;
    const userId = randomUUID() as UserId;

    const now = new Date().toISOString();
    const actor: Actor = {
      userId,
      role: "organization_admin",
    };

    // Seed org and membership
    orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Test Org",
        slug: "test-org",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "organization_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    // Seed course and module
    courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "Test Course",
        subject: null,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleStore.create({
      id: moduleId,
      courseId,
      title: "Test Module",
      description: "Desc",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 1. Create a lesson
    const createRes = await contentService.createLesson(
      actor,
      orgId,
      courseId,
      moduleId,
      "Lesson To Delete",
      "# Content",
      10,
    );

    const lessonId = createRes.lesson.id as LessonId;

    // Direct DB/store read before delete
    const lessonBefore = await lessonStore.findById(lessonId);
    expect(lessonBefore).toBeDefined();
    expect(lessonBefore?.deletedAt).toBeNull();

    // Verify it appears in course content before delete
    const contentBefore = await contentService.getCourseContent(
      actor,
      orgId,
      courseId,
      "req-1",
    );
    expect(
      contentBefore.modules[0].lessons.some((l) => l.id === lessonId),
    ).toBe(true);

    // 2. Perform deleteLesson
    await contentService.deleteLesson(
      actor,
      orgId,
      courseId,
      moduleId,
      lessonId,
    );

    // 3. Direct DB/store read after delete (Read-After-Write verification)
    const lessonAfter = await lessonStore.findById(lessonId);
    expect(lessonAfter).toBeDefined();
    expect(lessonAfter?.deletedAt).not.toBeNull();
    expect(typeof lessonAfter?.deletedAt).toBe("string");

    // 4. Verify getCourseContent query excludes the deleted lesson
    const contentAfter = await contentService.getCourseContent(
      actor,
      orgId,
      courseId,
      "req-2",
    );
    expect(
      contentAfter.modules.some((m) =>
        m.lessons.some((l) => l.id === lessonId),
      ),
    ).toBe(false);

    // 5. Verify getCourseLearning query excludes the deleted lesson
    const learnAfter = await learningService.getCourseLearning(
      actor,
      courseId,
      "req-3",
    );
    expect(
      learnAfter.modules.some((m) =>
        m.lessons.some((l) => l.id === lessonId),
      ),
    ).toBe(false);
  });
});
