/**
 * PR-8 Integration tests: Authorization and tenancy policy.
 *
 * Covers all acceptance criteria:
 * 1. Policy interface + tested roles (domain tests in authorization.test.ts)
 * 2. Organization creation (first user becomes admin)
 * 3. Membership read operations
 * 4. Organization-scoped resource resolution
 * 5. Audit-event helpers for org/membership mutations
 * 6. Negative/role-matrix tests (cross-tenant isolation)
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
import {
  auditOrgCreated,
  auditMembershipCreated,
  auditMembershipRoleChanged,
  auditMembershipRemoved,
} from "@avana/domain";
import type { UserId } from "@avana/domain";

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

describe("PR-8: Authorization and tenancy policy", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
  });

  async function registerModules(app: ReturnType<typeof createApp>) {
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
    });
  }

  async function signIn(app: ReturnType<typeof createApp>, email: string) {
    await registerModules(app);

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

  describe("1. Organization creation", () => {
    it("creates an organization and makes the creator an admin", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "admin@example.com");

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "Test Org" },
      });
      expect(res.statusCode).toBe(201);
      expect(orgStore.getAuditEvents().map((event) => event.action)).toEqual([
        "org.created",
        "membership.created",
      ]);
      await app.close();
    });

    it("rejects empty organization name", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "user@example.com");

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects duplicate organization name", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "dup@example.com");

      const res1 = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "Duplicate Org" },
      });
      expect(res1.statusCode).toBe(201);

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "Duplicate Org" },
      });
      expect(res2.statusCode).toBe(409);
      await app.close();
    });

    it("rejects unauthenticated request", async () => {
      const app = createApp({ config });
      await registerModules(app);

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        payload: { name: "Unauthenticated Org" },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("2. Organization list", () => {
    it("lists organizations the user is a member of", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "member@example.com");

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "My Org" },
      });
      expect(createRes.statusCode).toBe(201);

      const listRes = await app.inject({
        method: "GET",
        url: "/v1/organizations",
        cookies: { avana_session: token },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body) as {
        items: Array<{ id: string; name: string }>;
      };
      expect(body.items.length).toBe(1);
      expect(body.items[0].name).toBe("My Org");
      await app.close();
    });

    it("returns empty list when user has no orgs", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "lonely@example.com");

      const listRes = await app.inject({
        method: "GET",
        url: "/v1/organizations",
        cookies: { avana_session: token },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body) as {
        items: Array<unknown>;
      };
      expect(body.items.length).toBe(0);
      await app.close();
    });
  });

  describe("3. Organization-scoped resource resolution", () => {
    it("allows org member to read the org", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "scoped@example.com");

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "Scoped Org" },
      });
      const created = JSON.parse(createRes.body) as {
        organization: { id: string; name: string };
      };

      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${created.organization.id}`,
        cookies: { avana_session: token },
      });
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body) as {
        organization: { id: string; name: string };
      };
      expect(body.organization.name).toBe("Scoped Org");
      await app.close();
    });

    it("rejects invalid org UUID", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "baduuid@example.com");

      const res = await app.inject({
        method: "GET",
        url: "/v1/organizations/not-a-uuid",
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("4. Membership read operations", () => {
    it("allows org admin to list members", async () => {
      const app = createApp({ config });
      const { token } = await signIn(app, "admin-list@example.com");

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: token },
        payload: { name: "Membership Test Org" },
      });
      const created = JSON.parse(createRes.body) as {
        organization: { id: string; name: string };
      };

      const membersRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${created.organization.id}/members`,
        cookies: { avana_session: token },
      });
      expect(membersRes.statusCode).toBe(200);
      const body = JSON.parse(membersRes.body) as {
        items: Array<{ id: string; user_id: string; role: string }>;
      };
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0].role).toBe("organization_admin");
      await app.close();
    });

    it("returns a non-disclosing failure for a cross-tenant read", async () => {
      const app = createApp({ config });
      const { token: adminToken } = await signIn(
        app,
        "admin-nonadmin@example.com",
      );

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: adminToken },
        payload: { name: "Blocked Members Org" },
      });
      const created = JSON.parse(createRes.body) as {
        organization: { id: string; name: string };
      };

      const app2 = createApp({ config });
      const { token: userToken } = await signIn(app2, "student@example.com");

      const membersRes = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${created.organization.id}/members`,
        cookies: { avana_session: userToken },
      });
      expect(membersRes.statusCode).toBe(404);
      await app.close();
      await app2.close();
    });
  });

  describe("5. Audit-event helpers (domain-level unit tests)", () => {
    it("produces correct audit event for org creation", () => {
      const event = auditOrgCreated(
        "u1" as UserId,
        "o1" as UserId as never,
        "Test Org",
      );
      expect(event.action).toBe("org.created");
      expect(event.entityType).toBe("organization");
      expect(event.actorId).toBe("u1" as UserId);
      expect(event.details?.name).toBe("Test Org");
    });

    it("produces correct audit event for membership creation", () => {
      const event = auditMembershipCreated(
        "u1" as UserId,
        "o1" as UserId as never,
        "m1",
        "u2",
        "student",
      );
      expect(event.action).toBe("membership.created");
      expect(event.entityType).toBe("organization_membership");
      expect(event.details?.targetUserId).toBe("u2");
      expect(event.details?.role).toBe("student");
    });

    it("produces correct audit event for role change", () => {
      const event = auditMembershipRoleChanged(
        "u1" as UserId,
        "o1" as UserId as never,
        "m1",
        "student",
        "course_editor",
      );
      expect(event.action).toBe("membership.role_changed");
      expect(event.details?.previousRole).toBe("student");
      expect(event.details?.newRole).toBe("course_editor");
    });

    it("produces correct audit event for membership removal", () => {
      const event = auditMembershipRemoved(
        "u1" as UserId,
        "o1" as UserId as never,
        "m1",
        "u2",
      );
      expect(event.action).toBe("membership.removed");
      expect(event.entityType).toBe("organization_membership");
      expect(event.details?.targetUserId).toBe("u2");
    });
  });
});
