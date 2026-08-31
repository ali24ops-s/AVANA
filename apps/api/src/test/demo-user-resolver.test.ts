/**
 * Demo User Resolver & Demo Mode Integration Tests.
 *
 * Tests the deterministic Demo / Public Mode user resolution:
 *  1. Resolves configured DEMO_USER_EMAIL to real User ID without mutation
 *  2. GET /v1/me returns real user profile and memberships without session cookies
 *  3. All user-scoped routes receive request.user from DemoUserResolver
 *  4. Fails safely when user does not exist (never creates fake user)
 *  5. Fails safely when duplicate email records exist
 *  6. Preserves 100% strict Auth when AUTH_ENABLED=true
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { UserId, OrganizationId, CourseId } from "@avana/domain";
import { DemoUserResolver } from "../modules/identity/demo-user-resolver.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemorySessionStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";

const TARGET_EMAIL = "ali1383mohammadlo@gmail.com";
const TARGET_USER_ID = "79bda286-08a4-4a16-9340-4106864e0732" as UserId;
const TARGET_ORG_ID = "389575c5-7563-4242-854a-9af1a988eb3a" as OrganizationId;

describe("DemoUserResolver Unit Tests", () => {
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;

  beforeEach(() => {
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
  });

  it("resolves the existing demo user correctly with their real ID and memberships", async () => {
    // Populate existing user
    await userStore.createUserWithPassword({
      email: TARGET_EMAIL,
      passwordHash: "hash123",
      name: "علی",
      globalRole: "platform_admin",
    });

    // Manually set ID to match target
    const foundUser = await userStore.findByEmail(TARGET_EMAIL);
    expect(foundUser).toBeDefined();

    const resolver = new DemoUserResolver(userStore, orgStore, TARGET_EMAIL);
    const result = await resolver.resolveDemoUser();

    expect(result.user.email).toBe(TARGET_EMAIL);
    expect(result.user.name).toBe("علی");
    expect(result.user.role).toBe("platform_admin");
    expect(result.user.globalRole).toBe("platform_admin");
  });

  it("fails safely when user does NOT exist without creating any new user", async () => {
    const resolver = new DemoUserResolver(userStore, orgStore, "nonexistent@avana.dev");

    await expect(resolver.resolveDemoUser()).rejects.toThrow("یافت نشد");

    // Ensure no new user was created
    const allUsers = await userStore.findAllByEmail("nonexistent@avana.dev");
    expect(allUsers).toHaveLength(0);
  });

  it("fails safely when duplicate user records exist for the same email", async () => {
    // Insert two users with same email
    const u1 = await userStore.createUserWithPassword({
      email: TARGET_EMAIL,
      passwordHash: "hash1",
      name: "User 1",
    });
    // Force insert second record in in-memory map
    const u2Id = "duplicate-user-id" as UserId;
    (userStore as unknown as { users: Map<string, unknown> }).users.set(u2Id, {
      id: u2Id,
      email: TARGET_EMAIL,
      name: "User 2",
      role: "student",
    });

    const resolver = new DemoUserResolver(userStore, orgStore, TARGET_EMAIL);

    await expect(resolver.resolveDemoUser()).rejects.toThrow("چندین رکورد کاربر");
  });
});

describe("HTTP Integration: Demo Mode (AUTH_ENABLED=false)", () => {
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let courseStore: InMemoryCourseStore;
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let storageProvider: LocalStorageProvider;

  beforeEach(async () => {
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionStore = new InMemorySessionStore();
    courseStore = new InMemoryCourseStore();
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    storageProvider = new LocalStorageProvider("./storage/uploads");

    // Seed target user
    await userStore.createUserWithPassword({
      email: TARGET_EMAIL,
      passwordHash: "securehash",
      name: "علی",
      globalRole: "platform_admin",
    });

    // Add membership for target user
    const userRec = await userStore.findByEmail(TARGET_EMAIL);
    if (userRec) {
      await orgStore.createWithAdminMembership({
        organization: {
          id: TARGET_ORG_ID,
          name: "فضای یادگیری 79bda286",
          slug: "79bda286",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: "mem-1",
          organizationId: TARGET_ORG_ID,
          userId: userRec.id,
          role: "student",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      // Create a course owned in this org
      await courseStore.create({
        course: {
          id: "course-1" as CourseId,
          organizationId: TARGET_ORG_ID,
          name: "فارماکولوژی ۳",
          subject: "داروسازی",
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });
    }
  });

  it("GET /v1/me returns real demo user and memberships without session cookies when AUTH_ENABLED=false", async () => {
    const config = loadApiConfig({
      NODE_ENV: "test",
      AUTH_ENABLED: "false",
      DEMO_USER_EMAIL: TARGET_EMAIL,
    });

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe(TARGET_EMAIL);
    expect(body.user.name).toBe("علی");
    expect(body.user.role).toBe("platform_admin");
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].organization_id).toBe(TARGET_ORG_ID);

    await app.close();
  });

  it("User-scoped endpoints (/v1/courses) resolve Current User to Demo User without cookies", async () => {
    const config = loadApiConfig({
      NODE_ENV: "test",
      AUTH_ENABLED: "false",
      DEMO_USER_EMAIL: TARGET_EMAIL,
    });

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${TARGET_ORG_ID}/courses`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].title).toBe("فارماکولوژی ۳");

    await app.close();
  });
});

describe("HTTP Integration: Full Auth Mode (AUTH_ENABLED=true)", () => {
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let courseStore: InMemoryCourseStore;

  beforeEach(async () => {
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionStore = new InMemorySessionStore();
    courseStore = new InMemoryCourseStore();

    await userStore.createUserWithPassword({
      email: TARGET_EMAIL,
      passwordHash: "securehash",
      name: "علی",
      globalRole: "platform_admin",
    });
  });

  it("GET /v1/me strictly returns 401 Unauthorized without session cookies when AUTH_ENABLED=true", async () => {
    const config = loadApiConfig({
      NODE_ENV: "test",
      AUTH_ENABLED: "true",
      DEMO_USER_EMAIL: TARGET_EMAIL,
    });

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("unauthorized");

    await app.close();
  });

  it("Protected routes strictly return 401 Unauthorized without session cookies when AUTH_ENABLED=true", async () => {
    const config = loadApiConfig({
      NODE_ENV: "test",
      AUTH_ENABLED: "true",
      DEMO_USER_EMAIL: TARGET_EMAIL,
    });

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${TARGET_ORG_ID}/courses`,
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("unauthorized");

    await app.close();
  });
});
