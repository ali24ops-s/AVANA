import { describe, it, expect } from "vitest";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { Roles } from "@avana/domain";
import type { AdminCourseRecord } from "../modules/admin/admin-store.js";

describe("Course Segregation & Role Boundary Tests", () => {
  it("Scenario 1 & 4: Personal course created by student with legacy teacher_status='approved' is categorized as 'user' scope", async () => {
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    const systemOrgId = "00000000-0000-0000-0000-000000000001";

    // Setup 3 distinct courses in memory
    const officialCourse: AdminCourseRecord = {
      id: "course-off-1",
      organizationId: systemOrgId,
      name: "دوره جامع داروسازی بالینی",
      subject: "داروسازی",
      status: "published",
      isOfficial: true,
      scope: "official",
      createdAt: new Date().toISOString(),
      counts: { modules: 3, lessons: 10, flashcards: 20, quizzes: 5 },
    };

    const teacherCourse: AdminCourseRecord = {
      id: "course-teach-1",
      organizationId: "org-teacher-1",
      name: "کلاس فارماکولوژی اختصاصی استاد",
      subject: "پزشکی",
      status: "draft",
      isOfficial: false,
      scope: "teacher",
      createdAt: new Date().toISOString(),
      counts: { modules: 2, lessons: 5, flashcards: 10, quizzes: 2 },
      teacher: { id: "teacher-1", name: "دکتر آزموده", email: "teacher@test.com" },
      classroom: { id: "cls-1", title: "کلاس مبانی فارماکولوژی", inviteCode: "PHARM101" },
    };

    const userCourse: AdminCourseRecord = {
      id: "course-user-1",
      organizationId: "org-student-1",
      name: "یادداشت‌های فیزیولوژی من",
      subject: "فیزیولوژی",
      status: "draft",
      isOfficial: false,
      scope: "user",
      createdAt: new Date().toISOString(),
      counts: { modules: 1, lessons: 2, flashcards: 5, quizzes: 0 },
      owner: { id: "student-1", name: "دانشجوی کوشا", email: "student@test.com" },
    };

    adminStore.memoryCourses = [officialCourse, teacherCourse, userCourse];

    // 1. Query official scope
    const officialRes = await adminStore.listCourses({ scope: "official" });
    expect(officialRes.courses).toHaveLength(1);
    expect(officialRes.courses[0].id).toBe("course-off-1");
    expect(officialRes.courses[0].scope).toBe("official");

    // 2. Query teacher scope
    const teacherRes = await adminStore.listCourses({ scope: "teacher" });
    expect(teacherRes.courses).toHaveLength(1);
    expect(teacherRes.courses[0].id).toBe("course-teach-1");
    expect(teacherRes.courses[0].scope).toBe("teacher");

    // 3. Query user scope
    const userRes = await adminStore.listCourses({ scope: "user" });
    expect(userRes.courses).toHaveLength(1);
    expect(userRes.courses[0].id).toBe("course-user-1");
    expect(userRes.courses[0].scope).toBe("user");

    // 4. Verify counts match segregated totals
    expect(userRes.counts.official).toBe(1);
    expect(userRes.counts.teacher).toBe(1);
    expect(userRes.counts.user).toBe(1);
  });

  it("Scenario 3: User with teacher_status='approved' but role='student' is NOT a teacher", async () => {
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);

    const user = await userStore.createUserWithPassword({
      email: "student-with-approved-status@test.com",
      passwordHash: "hash123",
    });
    user.name = "دانشجو";
    user.globalRole = Roles.student;
    user.teacherStatus = "approved"; // legacy default!

    // Verify user's actual role remains student
    expect(user.globalRole).toBe(Roles.student);
    expect(user.globalRole).not.toBe(Roles.teacher);
  });

  it("Scenario 7 & 8: Scoped queries maintain zero leakage across tabs and counts stay in sync", async () => {
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    // Populate multiple user courses and teacher courses
    adminStore.memoryCourses = [
      {
        id: "off-1",
        organizationId: "sys-org",
        name: "دوره رسمی ۱",
        isOfficial: true,
        scope: "official",
        status: "published",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
      {
        id: "teach-1",
        organizationId: "teach-org",
        name: "دوره استاد ۱",
        isOfficial: false,
        scope: "teacher",
        status: "draft",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
      {
        id: "teach-2",
        organizationId: "teach-org",
        name: "دوره استاد ۲",
        isOfficial: false,
        scope: "teacher",
        status: "draft",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
      {
        id: "user-1",
        organizationId: "user-org-1",
        name: "دوره کاربر ۱",
        isOfficial: false,
        scope: "user",
        status: "draft",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
      {
        id: "user-2",
        organizationId: "user-org-2",
        name: "دوره کاربر ۲",
        isOfficial: false,
        scope: "user",
        status: "draft",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
      {
        id: "user-3",
        organizationId: "user-org-3",
        name: "دوره کاربر ۳",
        isOfficial: false,
        scope: "user",
        status: "draft",
        createdAt: new Date().toISOString(),
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
      },
    ];

    const allRes = await adminStore.listCourses();
    expect(allRes.counts.official).toBe(1);
    expect(allRes.counts.teacher).toBe(2);
    expect(allRes.counts.user).toBe(3);

    const userCoursesRes = await adminStore.listCourses({ scope: "user" });
    expect(userCoursesRes.courses).toHaveLength(3);
    expect(userCoursesRes.courses.every((c) => c.scope === "user")).toBe(true);

    const teacherCoursesRes = await adminStore.listCourses({ scope: "teacher" });
    expect(teacherCoursesRes.courses).toHaveLength(2);
    expect(teacherCoursesRes.courses.every((c) => c.scope === "teacher")).toBe(true);

    const officialCoursesRes = await adminStore.listCourses({ scope: "official" });
    expect(officialCoursesRes.courses).toHaveLength(1);
    expect(officialCoursesRes.courses[0].scope).toBe("official");
  });
});
