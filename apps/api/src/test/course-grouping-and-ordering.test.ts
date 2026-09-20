import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemorySubCourseGroupStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  asCourseId,
  asLessonId,
  asModuleId,
  asSubCourseGroupId,
  asOrganizationId,
  asUserId,
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Course Grouping (Sub-Course Groups) and Chapter Ordering", () => {
  let config: ReturnType<typeof makeTestConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let adminStore: InMemoryAdminStore;

  let platformAdminCookie: string;
  let studentCookie: string;
  let orgId: OrganizationId;
  let courseId: string;
  let otherCourseId: string;

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      subCourseGroupStore,
      lessonStore,
      progressStore,
      adminStore,
    });
    return app;
  }

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    subCourseGroupStore.setModuleStore(moduleStore);
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    adminStore = new InMemoryAdminStore(userStore, organizationStore);
    adminStore.setLearningStores({
      courseStore,
      moduleStore,
      subCourseGroupStore,
      lessonStore,
    });

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "hash",
        name: email.split("@")[0],
      });
      if (role === Roles.platform_admin || role === Roles.content_worker) {
        user.globalRole = role;
        user.role = role;
        userStore.insert({ ...user });
      }
      const uOrgId = randomUUID() as OrganizationId;
      organizationStore.addMembership({
        id: randomUUID(),
        organizationId: uOrgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken, orgId: uOrgId };
    }

    const admin = await createUserWithRole("admin@avana.ai", Roles.platform_admin);
    platformAdminCookie = `avana_session=${admin.sessionToken}`;
    orgId = admin.orgId;

    const student = await createUserWithRole("student@avana.ai", Roles.student);
    studentCookie = `avana_session=${student.sessionToken}`;

    // Add student membership in course organization
    organizationStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: student.user.id as UserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create a course in courseStore
    const c1Id = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: c1Id,
        organizationId: orgId,
        name: "زیست‌شناسی جامع",
        description: "دوره آزمایشی",
        subject: "زیست",
        examDate: null,
        status: "published",
        isOfficial: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
    courseId = c1Id;

    // Enroll student in course
    await courseStore.addUserCourse(student.user.id as UserId, c1Id);

    // Create a second course for isolation checks
    const c2Id = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: c2Id,
        organizationId: orgId,
        name: "شیمی دوازدهم",
        description: "دوره دوم",
        subject: "شیمی",
        examDate: null,
        status: "published",
        isOfficial: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
    otherCourseId = c2Id;
  });

  async function createTestGroup(cId: string, title: string, sortOrder: number) {
    const now = new Date().toISOString();
    return subCourseGroupStore.create({
      id: asSubCourseGroupId(randomUUID() as unknown as import("@avana/domain").UUID),
      courseId: asCourseId(cId),
      title,
      sortOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  async function createTestModule(cId: string, title: string, sortOrder: number, subCourseGroupId: string | null = null) {
    const now = new Date().toISOString();
    return moduleStore.create({
      id: asModuleId(randomUUID() as unknown as import("@avana/domain").UUID),
      courseId: asCourseId(cId),
      title,
      description: null,
      sortOrder,
      subCourseGroupId: subCourseGroupId ? asSubCourseGroupId(subCourseGroupId) : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  describe("SubCourseGroups CRUD & Reordering", () => {
    it("allows admin to create groups with sequential sort orders", async () => {
      const app = await buildTestApp();

      const res1 = await app.inject({
        method: "POST",
        url: `/v1/admin/content/courses/${courseId}/groups`,
        headers: { cookie: platformAdminCookie },
        payload: { title: "بخش اول: مبانی زیست‌شناسی" },
      });

      expect(res1.statusCode).toBe(201);
      const data1 = JSON.parse(res1.body);
      expect(data1.success).toBe(true);
      expect(data1.group.title).toBe("بخش اول: مبانی زیست‌شناسی");
      expect(data1.group.sortOrder).toBe(0);

      const res2 = await app.inject({
        method: "POST",
        url: `/v1/admin/content/courses/${courseId}/groups`,
        headers: { cookie: platformAdminCookie },
        payload: { title: "بخش دوم: ژنتیک" },
      });

      expect(res2.statusCode).toBe(201);
      const data2 = JSON.parse(res2.body);
      expect(data2.group.title).toBe("بخش دوم: ژنتیک");
      expect(data2.group.sortOrder).toBe(1);
    });

    it("allows admin to update group title", async () => {
      const app = await buildTestApp();

      const created = await createTestGroup(courseId, "عنوان اولیه", 0);

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content/courses/${courseId}/groups/${created.id}`,
        headers: { cookie: platformAdminCookie },
        payload: { title: "عنوان ویرایش‌شده" },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.group.title).toBe("عنوان ویرایش‌شده");

      const fetched = await subCourseGroupStore.findById(created.id);
      expect(fetched?.title).toBe("عنوان ویرایش‌شده");
    });

    it("allows admin to reorder groups", async () => {
      const app = await buildTestApp();

      const g1 = await createTestGroup(courseId, "گروه ۱", 0);
      const g2 = await createTestGroup(courseId, "گروه ۲", 1);

      const res = await app.inject({
        method: "PUT",
        url: `/v1/admin/content/courses/${courseId}/groups/reorder`,
        headers: { cookie: platformAdminCookie },
        payload: { groupIds: [g2.id, g1.id] },
      });

      expect(res.statusCode).toBe(200);

      const groups = await subCourseGroupStore.listByCourse(asCourseId(courseId));
      expect(groups[0].id).toBe(g2.id);
      expect(groups[0].sortOrder).toBe(0);
      expect(groups[1].id).toBe(g1.id);
      expect(groups[1].sortOrder).toBe(1);
    });

    it("deleting a group unlinks chapters without deleting them (ON DELETE SET NULL)", async () => {
      const app = await buildTestApp();

      const group = await createTestGroup(courseId, "گروه آزمایشی", 0);
      const mod = await createTestModule(courseId, "فصل اول: سلول", 0, group.id);

      // Verify module is in group
      let fetchedMod = await moduleStore.findById(mod.id);
      expect(fetchedMod?.subCourseGroupId).toBe(group.id);

      // Delete group
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/content/courses/${courseId}/groups/${group.id}`,
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);

      // Group should be deleted
      const fetchedGroup = await subCourseGroupStore.findById(group.id);
      expect(fetchedGroup).toBeUndefined();

      // Module MUST still exist, but with subCourseGroupId = null
      fetchedMod = await moduleStore.findById(mod.id);
      expect(fetchedMod).toBeDefined();
      expect(fetchedMod?.id).toBe(mod.id);
      expect(fetchedMod?.subCourseGroupId).toBeNull();
    });
  });

  describe("Module Reordering & Group Assignment", () => {
    it("allows reordering modules and assigning them to groups", async () => {
      const app = await buildTestApp();

      const group = await createTestGroup(courseId, "بخش ژنتیک", 0);
      const m1 = await createTestModule(courseId, "فصل ۱", 0);
      const m2 = await createTestModule(courseId, "فصل ۲", 1);

      const res = await app.inject({
        method: "PUT",
        url: `/v1/admin/content/courses/${courseId}/modules/reorder`,
        headers: { cookie: platformAdminCookie },
        payload: {
          items: [
            { id: m2.id, sortOrder: 0, subCourseGroupId: group.id },
            { id: m1.id, sortOrder: 1, subCourseGroupId: null },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      const modules = await moduleStore.listByCourse(asCourseId(courseId));
      expect(modules[0].id).toBe(m2.id);
      expect(modules[0].sortOrder).toBe(0);
      expect(modules[0].subCourseGroupId).toBe(group.id);

      expect(modules[1].id).toBe(m1.id);
      expect(modules[1].sortOrder).toBe(1);
      expect(modules[1].subCourseGroupId).toBeNull();
    });

    it("strictly rejects assigning a module to a group from another course (Course Isolation)", async () => {
      const app = await buildTestApp();

      const foreignGroup = await createTestGroup(otherCourseId, "گروه دوره دیگر", 0);
      const m1 = await createTestModule(courseId, "فصل ۱", 0);

      const res = await app.inject({
        method: "PUT",
        url: `/v1/admin/content/courses/${courseId}/modules/reorder`,
        headers: { cookie: platformAdminCookie },
        payload: {
          items: [
            { id: m1.id, sortOrder: 0, subCourseGroupId: foreignGroup.id },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.message).toContain("متعلق به این دوره نیست");
    });
  });

  describe("Read APIs: Learning & Hierarchy with Groups", () => {
    it("GET /courses/:id/learn returns groups and modules with sub_course_group_id", async () => {
      const app = await buildTestApp();

      const group = await createTestGroup(courseId, "بخش مبانی", 0);
      const mod = await createTestModule(courseId, "فصل اول", 0, group.id);

      const now = new Date().toISOString();
      await lessonStore.create({
        id: asLessonId(randomUUID() as unknown as import("@avana/domain").UUID),
        moduleId: mod.id,
        title: "درس ۱",
        contentType: "markdown",
        contentMarkdown: "محتوای تست",
        sortOrder: 0,
        estimatedMinutes: 5,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        headers: { cookie: studentCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.groups).toHaveLength(1);
      expect(data.groups[0].id).toBe(group.id);
      expect(data.groups[0].title).toBe("بخش مبانی");

      expect(data.modules).toHaveLength(1);
      expect(data.modules[0].id).toBe(mod.id);
      expect(data.modules[0].sub_course_group_id).toBe(group.id);
    });

    it("GET /admin/content/courses/:id/hierarchy returns groups and modules with sortOrder", async () => {
      const app = await buildTestApp();

      const group = await createTestGroup(courseId, "بخش دوم", 0);
      const mod = await createTestModule(courseId, "فصل دوم", 0, group.id);

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/courses/${courseId}/hierarchy`,
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.groups).toHaveLength(1);
      expect(data.groups[0].id).toBe(group.id);
      expect(data.modules).toHaveLength(1);
      expect(data.modules[0].id).toBe(mod.id);
      expect(data.modules[0].subCourseGroupId).toBe(group.id);
    });
  });
});
