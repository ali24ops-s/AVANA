/**
 * Integration tests for "Popular Avana Courses" (محبوب‌ترین دوره‌های آوانا).
 *
 * Verifies:
 * 1. Test 1 — Popularity ordering (Course with higher score ranks above lower score).
 * 2. Test 2 — Global scope (User 1 sees Course B which is popular across User 2/3).
 * 3. Test 3 — Maximum 8 courses returned when more than 8 exist.
 * 4. Test 4 — Empty state (returns items: [] and 200 when no courses exist).
 * 5. Test 5 — Visibility & Soft-delete (archived/deleted courses are excluded).
 * 6. Test 6 — Tie breaking (deterministic sorting when scores are equal).
 * 7. Test 7 — Authorization (unauthenticated requests rejected with 401).
 * 8. Test 8 — Multi-tenant isolation (private courses of Org B are not exposed in Org A).
 */

import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import type { CourseId, OrganizationId, UserId } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Popular Avana Courses (محبوب‌ترین دوره‌ها) Integration Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, password: "password123", name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id,
      email: body.user.email,
    };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      organization: { id: string; name: string };
    };
    return body.organization;
  }

  async function createCourse(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    orgId: string,
    title: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
      payload: { title, subject: "Medical" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      course: { id: string; title: string };
    };
    return body.course;
  }

  it("Test 1: Popularity ordering ranks course with higher user additions & engagement higher", async () => {
    const app = await buildApp();
    const student1 = await signIn(app, "student1@example.com");
    const student2 = await signIn(app, "student2@example.com");
    const student3 = await signIn(app, "student3@example.com");

    const org = await createOrg(app, student1.token, "Avana University");

    // Add student 2 and student 3 to organization
    orgStore.addMembership({
      id: "mem-2",
      organizationId: org.id as OrganizationId,
      userId: student2.userId as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: "mem-3",
      organizationId: org.id as OrganizationId,
      userId: student3.userId as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const courseA = await createCourse(app, student1.token, org.id, "Course A (Medium)");
    const courseB = await createCourse(app, student1.token, org.id, "Course B (Highest)");
    const courseC = await createCourse(app, student1.token, org.id, "Course C (Lowest)");

    // Course B added by 3 users
    await courseStore.addUserCourse(student1.userId as UserId, courseB.id as CourseId);
    await courseStore.addUserCourse(student2.userId as UserId, courseB.id as CourseId);
    await courseStore.addUserCourse(student3.userId as UserId, courseB.id as CourseId);

    // Course A added by 2 users
    await courseStore.addUserCourse(student1.userId as UserId, courseA.id as CourseId);
    await courseStore.addUserCourse(student2.userId as UserId, courseA.id as CourseId);

    // Course C added by 1 user
    await courseStore.addUserCourse(student1.userId as UserId, courseC.id as CourseId);

    const popularRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: student1.token },
    });

    expect(popularRes.statusCode).toBe(200);
    const body = JSON.parse(popularRes.body) as { items: Array<{ id: string; title: string }> };

    expect(body.items.length).toBe(3);
    expect(body.items[0].id).toBe(courseB.id);
    expect(body.items[1].id).toBe(courseA.id);
    expect(body.items[2].id).toBe(courseC.id);

    await app.close();
  });

  it("Test 2: Global scope — current user only has Course A, but sees Course B popular across other users", async () => {
    const app = await buildApp();
    const userA = await signIn(app, "userA@example.com");
    const userB = await signIn(app, "userB@example.com");
    const userC = await signIn(app, "userC@example.com");

    const org = await createOrg(app, userA.token, "Shared Medical Org");

    orgStore.addMembership({
      id: "mem-b",
      organizationId: org.id as OrganizationId,
      userId: userB.userId as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: "mem-c",
      organizationId: org.id as OrganizationId,
      userId: userC.userId as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const courseA = await createCourse(app, userA.token, org.id, "Course A (UserA Only)");
    const courseB = await createCourse(app, userA.token, org.id, "Course B (UserB + UserC)");

    // User A has Course A only
    await courseStore.addUserCourse(userA.userId as UserId, courseA.id as CourseId);

    // User B and C have Course B
    await courseStore.addUserCourse(userB.userId as UserId, courseB.id as CourseId);
    await courseStore.addUserCourse(userC.userId as UserId, courseB.id as CourseId);

    // User A requests popular courses
    const popularRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: userA.token },
    });

    expect(popularRes.statusCode).toBe(200);
    const body = JSON.parse(popularRes.body) as { items: Array<{ id: string; title: string }> };

    // Course B is top rank even though User A didn't add it!
    expect(body.items[0].id).toBe(courseB.id);
    expect(body.items[1].id).toBe(courseA.id);

    await app.close();
  });

  it("Test 3: Maximum 8 courses returned when 12 courses exist", async () => {
    const app = await buildApp();
    const admin = await signIn(app, "admin@example.com");
    const org = await createOrg(app, admin.token, "Large Catalog Org");

    for (let i = 1; i <= 12; i++) {
      await createCourse(app, admin.token, org.id, `Course ${i.toString().padStart(2, "0")}`);
    }

    const popularRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: admin.token },
    });

    expect(popularRes.statusCode).toBe(200);
    const body = JSON.parse(popularRes.body) as { items: Array<{ id: string; title: string }> };

    expect(body.items.length).toBe(8);

    await app.close();
  });

  it("Test 4: Empty state returns items: [] and 200 OK without 500 error", async () => {
    const app = await buildApp();
    const user = await signIn(app, "empty@example.com");
    const org = await createOrg(app, user.token, "Empty Org");

    const popularRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: user.token },
    });

    expect(popularRes.statusCode).toBe(200);
    const body = JSON.parse(popularRes.body) as { items: unknown[] };
    expect(body.items).toEqual([]);

    await app.close();
  });

  it("Test 5: Visibility — archived and soft-deleted courses are excluded from popular ranking", async () => {
    const app = await buildApp();
    const user = await signIn(app, "archive_user@example.com");
    const org = await createOrg(app, user.token, "Archive Org");

    const course1 = await createCourse(app, user.token, org.id, "Active Course");
    const course2 = await createCourse(app, user.token, org.id, "Archived Course");

    // Add many users to Course 2
    await courseStore.addUserCourse(user.userId as UserId, course2.id as CourseId);
    await courseStore.addUserCourse("u2" as UserId, course2.id as CourseId);
    await courseStore.addUserCourse("u3" as UserId, course2.id as CourseId);

    // Archive Course 2
    const foundCourse2 = await courseStore.findById(course2.id as CourseId);
    if (foundCourse2) {
      foundCourse2.deletedAt = new Date().toISOString();
      await courseStore.update(foundCourse2);
    }

    const popularRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: user.token },
    });

    expect(popularRes.statusCode).toBe(200);
    const body = JSON.parse(popularRes.body) as { items: Array<{ id: string }> };

    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe(course1.id);

    await app.close();
  });

  it("Test 6: Tie-breaking is deterministic when popularity scores are identical", async () => {
    const app = await buildApp();
    const user = await signIn(app, "tie@example.com");
    const org = await createOrg(app, user.token, "Tie Org");

    await createCourse(app, user.token, org.id, "Beta Course");
    await createCourse(app, user.token, org.id, "Alpha Course");

    // Request twice to verify identical deterministic order
    const res1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: user.token },
    });
    const res2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: user.token },
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const body1 = JSON.parse(res1.body) as { items: Array<{ id: string }> };
    const body2 = JSON.parse(res2.body) as { items: Array<{ id: string }> };

    expect(body1.items.map((c) => c.id)).toEqual(body2.items.map((c) => c.id));

    await app.close();
  });

  it("Test 7: Authorization — unauthenticated request returns 401", async () => {
    const app = await buildApp();
    const orgId = "00000000-0000-4000-8000-000000000001";

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/popular`,
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("Test 8: Multi-tenant isolation — private course of Org B is never returned in Org A", async () => {
    const app = await buildApp();
    const userA = await signIn(app, "tenant_a@example.com");
    const userB = await signIn(app, "tenant_b@example.com");

    const orgA = await createOrg(app, userA.token, "Organization A");
    const orgB = await createOrg(app, userB.token, "Organization B");

    await createCourse(app, userA.token, orgA.id, "Org A Course");
    const courseB = await createCourse(app, userB.token, orgB.id, "Org B Secret Course");

    // Org B course is very popular in Org B
    await courseStore.addUserCourse(userB.userId as UserId, courseB.id as CourseId);
    await courseStore.addUserCourse("other1" as UserId, courseB.id as CourseId);
    await courseStore.addUserCourse("other2" as UserId, courseB.id as CourseId);

    // User A queries popular courses for Org A
    const resA = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA.id}/courses/popular`,
      cookies: { avana_session: userA.token },
    });

    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body) as { items: Array<{ id: string; title: string }> };

    expect(bodyA.items.length).toBe(1);
    expect(bodyA.items[0].title).toBe("Org A Course");
    expect(bodyA.items.some((c) => c.id === courseB.id)).toBe(false);

    await app.close();
  });

  describe("Alignment with Main Library Listing (Popular Courses ⊂ All Library Courses)", () => {
    function makeCourse(name: string, orgId: string, subject = "Medical") {
      const id = randomUUID() as CourseId;
      const record = {
        id,
        organizationId: orgId as OrganizationId,
        name,
        subject,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      return courseStore.create({ course: record, auditEvents: [] });
    }

    it("Scenario 1 & 2: System course added by other users appears in /courses/popular AND in /courses", async () => {
      const app = await buildApp();
      const user1 = await signIn(app, "user1@example.com");
      const user2 = await signIn(app, "user2@example.com");
      const user3 = await signIn(app, "user3@example.com");

      const org1 = await createOrg(app, user1.token, "Org 1");

      // Create a shared system course
      const systemCourse = await makeCourse(
        "فارماکولوژی عمومی",
        config.systemOrganizationId,
        "داروسازی",
      );

      // User 2 and User 3 add the course to their list
      await courseStore.addUserCourse(user2.userId as UserId, systemCourse.id);
      await courseStore.addUserCourse(user3.userId as UserId, systemCourse.id);

      // User 1 queries /courses/popular
      const popRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses/popular`,
        cookies: { avana_session: user1.token },
      });
      expect(popRes.statusCode).toBe(200);
      const popData = JSON.parse(popRes.body) as { items: Array<{ id: string; title: string }> };
      expect(popData.items.some((c) => c.id === systemCourse.id)).toBe(true);

      // User 1 queries /courses (All Library Courses)
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: user1.token },
      });
      expect(allRes.statusCode).toBe(200);
      const allData = JSON.parse(allRes.body) as { items: Array<{ id: string; title: string }> };
      expect(allData.items.some((c) => c.id === systemCourse.id)).toBe(true);

      await app.close();
    });

    it("Scenario 3: Private course of another organization is absent in both /courses/popular and /courses", async () => {
      const app = await buildApp();
      const user1 = await signIn(app, "user_one@example.com");
      const user2 = await signIn(app, "user_two@example.com");

      const org1 = await createOrg(app, user1.token, "Org 1");
      const org2 = await createOrg(app, user2.token, "Org 2");

      const privateCourseOrg2 = await makeCourse(
        "دوره خصوصی دانشگاه دیگر",
        org2.id,
        "پزشکی",
      );

      // Course is popular inside org2
      await courseStore.addUserCourse(user2.userId as UserId, privateCourseOrg2.id);

      // User 1 from Org 1 queries both endpoints
      const popRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses/popular`,
        cookies: { avana_session: user1.token },
      });
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: user1.token },
      });

      const popData = JSON.parse(popRes.body) as { items: Array<{ id: string }> };
      const allData = JSON.parse(allRes.body) as { items: Array<{ id: string }> };

      expect(popData.items.some((c) => c.id === privateCourseOrg2.id)).toBe(false);
      expect(allData.items.some((c) => c.id === privateCourseOrg2.id)).toBe(false);

      await app.close();
    });

    it("Scenario 4: Popular courses use the EXACT same course.id without duplication", async () => {
      const app = await buildApp();
      const user1 = await signIn(app, "user_dedup@example.com");
      const org1 = await createOrg(app, user1.token, "Org Dedup");

      const sysCourse = await makeCourse(
        "فیزیولوژی اعصاب",
        config.systemOrganizationId,
        "فیزیولوژی",
      );

      await courseStore.addUserCourse(user1.userId as UserId, sysCourse.id);

      const popRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses/popular`,
        cookies: { avana_session: user1.token },
      });
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: user1.token },
      });

      const popData = JSON.parse(popRes.body) as { items: Array<{ id: string; title: string }> };
      const allData = JSON.parse(allRes.body) as { items: Array<{ id: string; title: string }> };

      const popMatch = popData.items.find((c) => c.id === sysCourse.id);
      const allMatch = allData.items.find((c) => c.id === sysCourse.id);

      expect(popMatch).toBeDefined();
      expect(allMatch).toBeDefined();
      expect(popMatch!.id).toBe(allMatch!.id);
      expect(popMatch!.title).toBe(allMatch!.title);

      // Verify no duplicate IDs in all courses list
      const allIds = allData.items.map((c) => c.id);
      const uniqueIds = new Set(allIds);
      expect(allIds.length).toBe(uniqueIds.size);

      await app.close();
    });

    it("Scenario 5: Current user has not enrolled in course, but it still appears in All Courses", async () => {
      const app = await buildApp();
      const user1 = await signIn(app, "not_enrolled@example.com");
      const user2 = await signIn(app, "enrolled_other@example.com");
      const org1 = await createOrg(app, user1.token, "Org Test");

      const publicCourse = await makeCourse(
        "انگل‌شناسی بالینی",
        config.systemOrganizationId,
        "انگل‌شناسی",
      );

      // User 2 enrolled, User 1 did NOT enroll
      await courseStore.addUserCourse(user2.userId as UserId, publicCourse.id);

      // User 1 calls /courses (All Library Courses)
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: user1.token },
      });
      const allData = JSON.parse(allRes.body) as { items: Array<{ id: string; title: string }> };

      expect(allData.items.some((c) => c.id === publicCourse.id)).toBe(true);

      // But in /courses/my (User's personal enrolled list), it is NOT present
      const myRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1.id}/courses/my`,
        cookies: { avana_session: user1.token },
      });
      const myData = JSON.parse(myRes.body) as { items: Array<{ id: string }> };
      expect(myData.items.some((c) => c.id === publicCourse.id)).toBe(false);

      await app.close();
    });

    it("Scenario 6: Popularity ranking applies to /courses/popular without disturbing canonical order of /courses", async () => {
      const app = await buildApp();
      const user = await signIn(app, "order_test@example.com");
      const org = await createOrg(app, user.token, "Org Order");

      // Create courses
      const c1 = await makeCourse(
        "فارماکولوژی ۱", // Canonical index 0
        config.systemOrganizationId,
        "داروسازی",
      );
      const c2 = await makeCourse(
        "فیزیولوژی ۱", // Canonical index 13
        config.systemOrganizationId,
        "فیزیولوژی",
      );

      // Give c2 a higher popularity score
      await courseStore.addUserCourse("u1" as UserId, c2.id);
      await courseStore.addUserCourse("u2" as UserId, c2.id);
      await courseStore.addUserCourse("u3" as UserId, c2.id);

      // Give c1 lower popularity score
      await courseStore.addUserCourse("u1" as UserId, c1.id);

      // /courses/popular ranks c2 first because of higher popularity score
      const popRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses/popular`,
        cookies: { avana_session: user.token },
      });
      const popData = JSON.parse(popRes.body) as { items: Array<{ id: string }> };
      expect(popData.items[0].id).toBe(c2.id);

      // /courses maintains canonical curriculum ordering (فارماکولوژی ۱ before فیزیولوژی ۱)
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: user.token },
      });
      const allData = JSON.parse(allRes.body) as { items: Array<{ id: string }> };
      const idxC1 = allData.items.findIndex((c) => c.id === c1.id);
      const idxC2 = allData.items.findIndex((c) => c.id === c2.id);
      expect(idxC1).toBeLessThan(idxC2);

      await app.close();
    });
  });
});
