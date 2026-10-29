/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import type { DbClient } from "@avana/database/client";

describe("Admin Question Counts Logic (Backend DrizzleAdminStore)", () => {
  it("enrichCourseRecords: correctly distinguishes quiz container count from total quiz questions count", async () => {
    const courseId1 = "course-with-50-questions";
    const courseId2 = "course-with-2-quizzes-50-questions";
    const courseId3 = "course-empty";

    const mockCourses = [
      {
        id: courseId1,
        organizationId: "org-1",
        name: "فارماکولوژی",
        subject: "پزشکی",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
      {
        id: courseId2,
        organizationId: "org-1",
        name: "شیمی آلی",
        subject: "داروسازی",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
      {
        id: courseId3,
        organizationId: "org-1",
        name: "دوره خالی",
        subject: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
    ];

    let selectCallCount = 0;
    const mockDb = {
      select: vi.fn().mockImplementation((_fields?: any) => {
        return {
          from: vi.fn().mockImplementation(() => {
            selectCallCount++;
            const currentCall = selectCallCount;

            const chainable: any = {
              where: vi.fn().mockImplementation(() => chainable),
              innerJoin: vi.fn().mockImplementation(() => chainable),
              leftJoin: vi.fn().mockImplementation(() => chainable),
              groupBy: vi.fn().mockImplementation(() => chainable),
              orderBy: vi.fn().mockImplementation(() => chainable),
              limit: vi.fn().mockImplementation(() => chainable),
              then: (resolve: any) => {
                // In enrichCourseRecords, the queries executed in Promise.all are:
                // 1: modulesCounts
                // 2: lessonsCounts
                // 3: flashcardsCounts
                // 4: quizzesCounts
                // 5: quizQuestionsCounts
                // 6: classroomRows
                // 7: orgMemberRows
                // 8: auditRows
                // 9: productRows
                // 10: publicationRows
                switch (currentCall) {
                  case 1: // modules
                    return Promise.resolve([
                      { courseId: courseId1, count: 2 },
                      { courseId: courseId2, count: 3 },
                    ]).then(resolve);
                  case 2: // lessons
                    return Promise.resolve([
                      { courseId: courseId1, count: 5 },
                      { courseId: courseId2, count: 6 },
                    ]).then(resolve);
                  case 3: // flashcards
                    return Promise.resolve([
                      { courseId: courseId1, count: 20 },
                      { courseId: courseId2, count: 30 },
                    ]).then(resolve);
                  case 4: // quizzes (quiz container rows)
                    return Promise.resolve([
                      { courseId: courseId1, count: 1 }, // 1 quiz container
                      { courseId: courseId2, count: 2 }, // 2 quiz containers
                    ]).then(resolve);
                  case 5: // quizQuestions (actual test question rows)
                    return Promise.resolve([
                      { courseId: courseId1, count: 50 }, // 50 questions in that 1 quiz!
                      { courseId: courseId2, count: 50 }, // 50 questions across the 2 quizzes!
                    ]).then(resolve);
                  case 6: // classrooms
                    return Promise.resolve([]).then(resolve);
                  case 7: // orgMembers
                    return Promise.resolve([]).then(resolve);
                  case 8: // audits
                    return Promise.resolve([]).then(resolve);
                  case 9: // products
                    return Promise.resolve([]).then(resolve);
                  case 10: // publications
                    return Promise.resolve([]).then(resolve);
                  default:
                    return Promise.resolve([]).then(resolve);
                }
              },
            };
            return chainable;
          }),
        };
      }),
    } as unknown as DbClient;

    const store = new DrizzleAdminStore(mockDb);

    // Call private enrichCourseRecords via any cast
    const enriched = await (store as any).enrichCourseRecords(mockCourses);

    expect(enriched).toHaveLength(3);

    // Course 1: 1 quiz container, 50 questions
    const c1 = enriched.find((c: any) => c.id === courseId1);
    expect(c1).toBeDefined();
    expect(c1.counts.quizzes).toBe(1); // Old semantic preserved
    expect(c1.counts.quizQuestions).toBe(50); // New accurate count!
    expect(c1.counts.flashcards).toBe(20);
    expect(c1.counts.lessons).toBe(5);

    // Course 2: 2 quiz containers, 50 questions
    const c2 = enriched.find((c: any) => c.id === courseId2);
    expect(c2).toBeDefined();
    expect(c2.counts.quizzes).toBe(2);
    expect(c2.counts.quizQuestions).toBe(50);

    // Course 3: 0 quizzes, 0 questions
    const c3 = enriched.find((c: any) => c.id === courseId3);
    expect(c3).toBeDefined();
    expect(c3.counts.quizzes).toBe(0);
    expect(c3.counts.quizQuestions).toBe(0);
  });

  it("getCourseHierarchy: returns courseQuizCount, courseQuizQuestionCount, and totalQuizQuestionCount", async () => {
    const courseId = "course-hierarchy-test";

    let selectCall = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        return {
          from: vi.fn().mockImplementation(() => {
            selectCall++;
            const callIdx = selectCall;

            const chainable: any = {
              where: vi.fn().mockImplementation(() => chainable),
              innerJoin: vi.fn().mockImplementation(() => chainable),
              leftJoin: vi.fn().mockImplementation(() => chainable),
              orderBy: vi.fn().mockImplementation(() => chainable),
              limit: vi.fn().mockImplementation(() => chainable),
              then: (resolve: any) => {
                // Call 1: course lookup
                if (callIdx === 1) {
                  return Promise.resolve([
                    {
                      id: courseId,
                      name: "دوره جامع با آزمون‌های مستقل",
                      subject: "علوم پزشکی",
                    },
                  ]).then(resolve);
                }
                // Call 2: modules lookup
                if (callIdx === 2) {
                  return Promise.resolve([]).then(resolve);
                }
                // Call 3: subCourseGroups
                if (callIdx === 3) {
                  return Promise.resolve([]).then(resolve);
                }
                // Call 4: courseFcCount (flashcards where lessonId is null)
                if (callIdx === 4) {
                  return Promise.resolve([{ count: 12 }]).then(resolve);
                }
                // Call 5: courseQCount (quizzes count)
                if (callIdx === 5) {
                  return Promise.resolve([{ count: 2 }]).then(resolve);
                }
                // Call 6: unassignedQuestionsCount (quiz questions where lessonId is null)
                if (callIdx === 6) {
                  return Promise.resolve([{ count: 15 }]).then(resolve);
                }
                // Call 7: totalQuestionsCount (all quiz questions in course)
                if (callIdx === 7) {
                  return Promise.resolve([{ count: 65 }]).then(resolve);
                }
                return Promise.resolve([]).then(resolve);
              },
            };
            return chainable;
          }),
        };
      }),
    } as unknown as DbClient;

    const store = new DrizzleAdminStore(mockDb);
    const hierarchy = await store.getCourseHierarchy(courseId);

    expect(hierarchy).not.toBeNull();
    expect(hierarchy!.courseQuizCount).toBe(2);
    expect(hierarchy!.courseQuizQuestionCount).toBe(15);
    expect(hierarchy!.totalQuizQuestionCount).toBe(65);
    expect(hierarchy!.courseFlashcardCount).toBe(12);
  });

  it("getCourseHierarchy: unassigned questions (lessonId is null) are included in course totals but NOT assigned to any lesson", async () => {
    const courseId = "course-lesson-isolation-test";
    const moduleId = "mod-1";
    const lessonId = "les-1";

    let selectCall = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        return {
          from: vi.fn().mockImplementation(() => {
            selectCall++;
            const callIdx = selectCall;

            const chainable: any = {
              where: vi.fn().mockImplementation(() => chainable),
              innerJoin: vi.fn().mockImplementation(() => chainable),
              leftJoin: vi.fn().mockImplementation(() => chainable),
              orderBy: vi.fn().mockImplementation(() => chainable),
              groupBy: vi.fn().mockImplementation(() => chainable),
              limit: vi.fn().mockImplementation(() => chainable),
              then: (resolve: any) => {
                // Call 1: course lookup
                if (callIdx === 1) {
                  return Promise.resolve([
                    {
                      id: courseId,
                      name: "دوره تفکیک سؤالات درس و ریشه",
                      subject: "زیست",
                    },
                  ]).then(resolve);
                }
                // Call 2: courseModules
                if (callIdx === 2) {
                  return Promise.resolve([
                    { id: moduleId, courseId, title: "فصل اول", sortOrder: 0, subCourseGroupId: null },
                  ]).then(resolve);
                }
                // Call 3: dbLessons
                if (callIdx === 3) {
                  return Promise.resolve([
                    {
                      id: lessonId,
                      moduleId,
                      title: "درس اول",
                      publicationStatus: "published",
                      createdAt: new Date("2026-01-01T00:00:00Z"),
                      hasContent: true,
                    },
                  ]).then(resolve);
                }
                // Call 4: fcCounts (flashcards for lessonId)
                if (callIdx === 4) {
                  return Promise.resolve([{ lessonId, count: 5 }]).then(resolve);
                }
                // Call 5: qCounts (quiz questions strictly for lessonId)
                if (callIdx === 5) {
                  return Promise.resolve([{ lessonId, count: 8 }]).then(resolve);
                }
                // Call 6: subCourseGroups
                if (callIdx === 6) {
                  return Promise.resolve([]).then(resolve);
                }
                // Call 7: courseFcCount (unassigned flashcards)
                if (callIdx === 7) {
                  return Promise.resolve([{ count: 2 }]).then(resolve);
                }
                // Call 8: courseQCount (quizzes count)
                if (callIdx === 8) {
                  return Promise.resolve([{ count: 2 }]).then(resolve);
                }
                // Call 9: unassignedQuestionsCount (where lessonId is null)
                if (callIdx === 9) {
                  return Promise.resolve([{ count: 12 }]).then(resolve);
                }
                // Call 10: totalQuestionsCount (8 lesson questions + 12 unassigned = 20)
                if (callIdx === 10) {
                  return Promise.resolve([{ count: 20 }]).then(resolve);
                }
                return Promise.resolve([]).then(resolve);
              },
            };
            return chainable;
          }),
        };
      }),
    } as unknown as DbClient;

    const store = new DrizzleAdminStore(mockDb);
    const hierarchy = await store.getCourseHierarchy(courseId);

    expect(hierarchy).not.toBeNull();
    // Root level unassigned question count
    expect(hierarchy!.courseQuizQuestionCount).toBe(12);
    // Root level total question count
    expect(hierarchy!.totalQuizQuestionCount).toBe(20);

    // Lesson level question count ONLY includes the 8 questions assigned to lesson les-1
    const mod = hierarchy!.modules.find((m) => m.id === moduleId);
    expect(mod).toBeDefined();
    const les = mod!.lessons.find((l) => l.id === lessonId);
    expect(les).toBeDefined();
    expect(les!.quizCount).toBe(8); // Only the 8 lesson questions, NOT the 12 unassigned questions!
  });

  it("official and user courses have independent and isolated question counts", async () => {
    const officialCourseId = "official-course-id";
    const userCourseId = "user-course-id";

    const mockCourses = [
      {
        id: officialCourseId,
        organizationId: "system-org",
        name: "دوره رسمی",
        subject: "پزشکی",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
      {
        id: userCourseId,
        organizationId: "user-org",
        name: "دوره شخصی کاربر",
        subject: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
    ];

    let selectCall = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => {
        return {
          from: vi.fn().mockImplementation(() => {
            selectCall++;
            const callIdx = selectCall;

            const chainable: any = {
              where: vi.fn().mockImplementation(() => chainable),
              innerJoin: vi.fn().mockImplementation(() => chainable),
              leftJoin: vi.fn().mockImplementation(() => chainable),
              groupBy: vi.fn().mockImplementation(() => chainable),
              orderBy: vi.fn().mockImplementation(() => chainable),
              limit: vi.fn().mockImplementation(() => chainable),
              then: (resolve: any) => {
                switch (callIdx) {
                  case 1: // modules
                    return Promise.resolve([
                      { courseId: officialCourseId, count: 4 },
                      { courseId: userCourseId, count: 1 },
                    ]).then(resolve);
                  case 2: // lessons
                    return Promise.resolve([
                      { courseId: officialCourseId, count: 10 },
                      { courseId: userCourseId, count: 2 },
                    ]).then(resolve);
                  case 3: // flashcards
                    return Promise.resolve([
                      { courseId: officialCourseId, count: 100 },
                      { courseId: userCourseId, count: 10 },
                    ]).then(resolve);
                  case 4: // quizzes (quiz container counts)
                    return Promise.resolve([
                      { courseId: officialCourseId, count: 2 },
                      { courseId: userCourseId, count: 1 },
                    ]).then(resolve);
                  case 5: // quizQuestions (actual test question counts)
                    return Promise.resolve([
                      { courseId: officialCourseId, count: 80 },
                      { courseId: userCourseId, count: 5 },
                    ]).then(resolve);
                  default:
                    return Promise.resolve([]).then(resolve);
                }
              },
            };
            return chainable;
          }),
        };
      }),
    } as unknown as DbClient;

    const store = new DrizzleAdminStore(mockDb);
    const enriched = await (store as any).enrichCourseRecords(mockCourses);

    const officialEnriched = enriched.find((c: any) => c.id === officialCourseId);
    const userEnriched = enriched.find((c: any) => c.id === userCourseId);

    // Official course metrics
    expect(officialEnriched.counts.quizzes).toBe(2);
    expect(officialEnriched.counts.quizQuestions).toBe(80);

    // User course metrics
    expect(userEnriched.counts.quizzes).toBe(1);
    expect(userEnriched.counts.quizQuestions).toBe(5);

    // Total isolation: User course counts have not bled into official course counts
    expect(officialEnriched.counts.quizQuestions).not.toBe(85);
  });
});

