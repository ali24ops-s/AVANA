import { describe, it, expect, vi } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { LocalIdentityAdapter } from "../modules/identity/local-adapter.js";
import { hashPassword } from "../modules/identity/password-hasher.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Authentication Sign-In Regression & Password Isolation Test Suite", () => {
  const config = loadApiConfig();
  config.session.maxAgeMs = 86400000;
  config.logging.level = "silent";

  function setupAuthApp() {
    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    // Create spy on identityAdapter with strict allowedDomains (excluding gmail.com)
    const identityAdapter = new LocalIdentityAdapter(["example.com", "avana.dev"]);
    const verifyIdentitySpy = vi.spyOn(identityAdapter, "verifyIdentity");

    const app = createApp({ config });
    app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
    });

    return {
      app,
      userStore,
      orgStore,
      sessionStore,
      sessionService,
      identityAdapter,
      verifyIdentitySpy,
    };
  }

  // =========================================================================
  // TEST A: Existing user + valid password with non-whitelisted domain (@gmail.com)
  // =========================================================================
  it("TEST A: Existing user with @gmail.com + valid password logs in successfully without calling verifyIdentity", async () => {
    const { app, userStore, verifyIdentitySpy } = setupAuthApp();

    const password = "SuperSecretPassword123!";
    const passwordHash = await hashPassword(password);
    const user = await userStore.createUserWithPassword({
      email: "ali1383mohammadlo@gmail.com",
      passwordHash,
      name: "Ali",
      globalRole: "platform_admin",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "ali1383mohammadlo@gmail.com",
        password,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.user.id).toBe(user.id);
    expect(json.user.email).toBe("ali1383mohammadlo@gmail.com");
    expect(json.user.role).toBe("platform_admin");
    // CRITICAL: verifyIdentity must NOT have been called!
    expect(verifyIdentitySpy).not.toHaveBeenCalled();

    await app.close();
  });

  // =========================================================================
  // TEST B: Existing user + wrong password
  // =========================================================================
  it("TEST B: Existing user + wrong password returns 401 without calling verifyIdentity", async () => {
    const { app, userStore, verifyIdentitySpy } = setupAuthApp();

    const passwordHash = await hashPassword("CorrectPassword123!");
    await userStore.createUserWithPassword({
      email: "user_b@gmail.com",
      passwordHash,
      name: "User B",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "user_b@gmail.com",
        password: "WrongPassword!",
      },
    });

    expect(res.statusCode).toBe(401);
    const json = res.json();
    expect(json.error.code).toBe("unauthorized");
    expect(json.error.message).toBe("ایمیل یا رمز عبور نادرست است.");
    expect(verifyIdentitySpy).not.toHaveBeenCalled();

    await app.close();
  });

  // =========================================================================
  // TEST C: Non-existing user + password
  // =========================================================================
  it("TEST C: Non-existing user + password returns standard 401 without falling back to verifyIdentity domain check", async () => {
    const { app, verifyIdentitySpy } = setupAuthApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "non_existing_random_user@gmail.com",
        password: "SomePassword123!",
      },
    });

    expect(res.statusCode).toBe(401);
    const json = res.json();
    expect(json.error.code).toBe("unauthorized");
    // Must NOT be "دامنه ایمیل مجاز نیست."
    expect(json.error.message).toBe("ایمیل یا رمز عبور نادرست است.");
    expect(verifyIdentitySpy).not.toHaveBeenCalled();

    await app.close();
  });

  // =========================================================================
  // TEST D: Existing platform_admin + valid password
  // =========================================================================
  it("TEST D: Existing platform_admin + valid password resolves effectiveRole = platform_admin and returns 200", async () => {
    const { app, userStore, verifyIdentitySpy } = setupAuthApp();

    const password = "AdminPassword2026!";
    const passwordHash = await hashPassword(password);
    await userStore.createUserWithPassword({
      email: "platform_admin_d@custom-org.com",
      passwordHash,
      name: "Admin D",
      globalRole: "platform_admin",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "platform_admin_d@custom-org.com",
        password,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.user.role).toBe("platform_admin");
    expect(verifyIdentitySpy).not.toHaveBeenCalled();

    await app.close();
  });

  // =========================================================================
  // TEST E: Existing normal user + valid password
  // =========================================================================
  it("TEST E: Existing normal user resolves effectiveRole from globalRole + organization membership", async () => {
    const { app, userStore, orgStore, verifyIdentitySpy } = setupAuthApp();

    const password = "TeacherPassword123!";
    const passwordHash = await hashPassword(password);
    const teacher = await userStore.createUserWithPassword({
      email: "teacher_e@school.edu",
      passwordHash,
      name: "Teacher E",
      globalRole: null,
    });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: teacher.id as UserId,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "teacher_e@school.edu",
        password,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.user.role).toBe("teacher");
    expect(verifyIdentitySpy).not.toHaveBeenCalled();

    await app.close();
  });

  // =========================================================================
  // TEST F: Legacy passwordless / test double flow (when password is not provided)
  // =========================================================================
  it("TEST F: Legacy passwordless flow works for allowed domain and rejects disallowed domain", async () => {
    const { app } = setupAuthApp();

    // 1. Passwordless login with allowed domain (@example.com)
    const resAllowed = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "mock_user@example.com",
        name: "Mock User",
      },
    });
    expect(resAllowed.statusCode).toBe(200);
    expect(resAllowed.json().user.email).toBe("mock_user@example.com");

    // 2. Passwordless login with disallowed domain (@gmail.com) -> throws domain error
    const resDisallowed = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "mock_user@gmail.com",
        name: "Mock User",
      },
    });
    expect(resDisallowed.statusCode).toBe(401);
    expect(resDisallowed.json().error.message).toBe("دامنه ایمیل مجاز نیست.");

    await app.close();
  });
});
