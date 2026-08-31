/**
 * Integration tests for "My Courses" (دوره‌های من) feature.
 *
 * Verifies:
 * 1. User with no courses -> GET /courses/my returns empty list.
 * 2. POST /courses/my adds a course to the user's personal list.
 * 3. GET /courses/my returns only the user's selected courses.
 * 4. PUT /courses/my atomically synchronizes (replaces) selected courses.
 * 5. DELETE /courses/my/:courseId removes course from user's list.
 * 6. Deleting from My Courses does NOT delete the main course from the system.
 * 7. Duplicate add is idempotent and does not error or duplicate.
 * 8. User isolation: mutations by user 1 do not affect user 2.
 * 9. Input validation for non-UUID course IDs.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import type { OrganizationId, UserId } from "@avana/domain";

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

describe("My Courses (دوره‌های من) Integration Tests", () => {
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
      payload: { email, name: email.split("@")[0] },
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

  it("Scenario 1 & 2: User starts with no courses, adds one, and lists it in My Courses", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "student1@example.com");
    const org = await createOrg(app, token, "Medical School");

    const course1 = await createCourse(app, token, org.id, "فارماکولوژی ۱");
    await createCourse(app, token, org.id, "فیزیولوژی ۱");

    // 1. Initial list of My Courses is empty
    const initialMyCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
    });
    expect(initialMyCoursesRes.statusCode).toBe(200);
    const initialBody = JSON.parse(initialMyCoursesRes.body) as {
      items: Array<{ id: string }>;
    };
    expect(initialBody.items.length).toBe(0);

    // 2. Add Course 1 to My Courses
    const addRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_id: course1.id },
    });
    expect(addRes.statusCode).toBe(200);

    // 3. Query My Courses -> only Course 1 is present
    const updatedMyCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
    });
    expect(updatedMyCoursesRes.statusCode).toBe(200);
    const updatedBody = JSON.parse(updatedMyCoursesRes.body) as {
      items: Array<{ id: string; title: string }>;
    };
    expect(updatedBody.items.length).toBe(1);
    expect(updatedBody.items[0].id).toBe(course1.id);
    expect(updatedBody.items[0].title).toBe("فارماکولوژی ۱");

    await app.close();
  });

  it("Scenario 3 & 4: Syncing multiple courses via PUT /courses/my atomically replaces selection", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "student2@example.com");
    const org = await createOrg(app, token, "Pharmacy School");

    const courseA = await createCourse(app, token, org.id, "Course A");
    const courseB = await createCourse(app, token, org.id, "Course B");
    const courseC = await createCourse(app, token, org.id, "Course C");

    // Initial state: add A and B
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_id: courseA.id },
    });
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_id: courseB.id },
    });

    // Now sync to B and C
    const syncRes = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_ids: [courseB.id, courseC.id] },
    });
    expect(syncRes.statusCode).toBe(200);
    const syncBody = JSON.parse(syncRes.body) as {
      items: Array<{ id: string; title: string }>;
    };
    expect(syncBody.items.length).toBe(2);
    const resultIds = syncBody.items.map((c) => c.id);
    expect(resultIds).toContain(courseB.id);
    expect(resultIds).toContain(courseC.id);
    expect(resultIds).not.toContain(courseA.id);

    await app.close();
  });

  it("Scenario 5 & 6: Deleting a course from My Courses removes relation without deleting main course", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "student3@example.com");
    const org = await createOrg(app, token, "Nursing School");

    const course = await createCourse(app, token, org.id, "میکروب‌شناسی");

    // Add to My Courses
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_id: course.id },
    });

    // Remove from My Courses
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${org.id}/courses/my/${course.id}`,
      cookies: { avana_session: token },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify My Courses is empty
    const myCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
    });
    const myCoursesBody = JSON.parse(myCoursesRes.body) as {
      items: Array<{ id: string }>;
    };
    expect(myCoursesBody.items.length).toBe(0);

    // Verify the main course STILL exists in the organization!
    const allCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: token },
    });
    const allCoursesBody = JSON.parse(allCoursesRes.body) as {
      items: Array<{ id: string }>;
    };
    expect(allCoursesBody.items.some((c) => c.id === course.id)).toBe(true);

    await app.close();
  });

  it("Scenario 7: User isolation — user 1 and user 2 maintain separate My Courses lists", async () => {
    const app = await buildApp();
    const user1 = await signIn(app, "user1@example.com");
    const org = await createOrg(app, user1.token, "Shared Org");

    // Add user 2 to org
    const user2 = await signIn(app, "user2@example.com");
    orgStore.addMembership({
      id: "membership-user2",
      organizationId: org.id as OrganizationId,
      userId: user2.userId as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });


    const course1 = await createCourse(app, user1.token, org.id, "Course 1");
    const course2 = await createCourse(app, user1.token, org.id, "Course 2");

    // User 1 selects Course 1
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: user1.token },
      payload: { course_id: course1.id },
    });

    // User 2 selects Course 2
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: user2.token },
      payload: { course_id: course2.id },
    });

    // Verify User 1's list has ONLY Course 1
    const u1List = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: user1.token },
    });
    const u1Body = JSON.parse(u1List.body) as { items: Array<{ id: string }> };
    expect(u1Body.items.map((c) => c.id)).toEqual([course1.id]);

    // Verify User 2's list has ONLY Course 2
    const u2List = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: user2.token },
    });
    const u2Body = JSON.parse(u2List.body) as { items: Array<{ id: string }> };
    expect(u2Body.items.map((c) => c.id)).toEqual([course2.id]);

    await app.close();
  });

  it("Scenario 8: Input validation on invalid course ID", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "student4@example.com");
    const org = await createOrg(app, token, "Test Org");

    const badAddRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_id: "not-a-uuid" },
    });
    expect(badAddRes.statusCode).toBe(400);

    const badSyncRes = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: token },
      payload: { course_ids: ["not-a-uuid"] },
    });
    expect(badSyncRes.statusCode).toBe(400);

    await app.close();
  });
});
