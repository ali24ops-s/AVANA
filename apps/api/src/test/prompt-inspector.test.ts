/**
 * Tests for AVANA Prompt Inspector & Prompt Registry (Single Source of Truth).
 */

import { describe, it, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  getPromptRegistry,
  CONTENT_PLANNING_SYSTEM_PROMPT,
  LESSON_GENERATION_SYSTEM_PROMPT,
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  QUIZ_GENERATION_SYSTEM_PROMPT,
  RECOMMENDATION_SYSTEM_PROMPT,
  DASHBOARD_ASSISTANT_SYSTEM_PROMPT,
} from "../modules/generation/prompt-registry.js";

describe("Prompt Registry & Single Source of Truth", () => {
  it("returns all real production prompts with complete structured metadata", () => {
    const registry = getPromptRegistry();

    expect(registry.length).toBeGreaterThanOrEqual(7);

    const ids = registry.map((p) => p.id);
    expect(ids).toContain("content-planning");
    expect(ids).toContain("lesson-generation");
    expect(ids).toContain("flashcard-generation");
    expect(ids).toContain("quiz-generation");
    expect(ids).toContain("recommendations-generation");
    expect(ids).toContain("study-assistant-lesson");
    expect(ids).toContain("study-assistant-dashboard");

    // Verify each prompt definition structure
    registry.forEach((prompt) => {
      expect(prompt.id).toBeTruthy();
      expect(prompt.name).toBeTruthy();
      expect(prompt.description).toBeTruthy();
      expect(prompt.category).toBeTruthy();
      expect(prompt.provider).toBeTruthy();
      expect(prompt.model).toBeTruthy();
      expect(prompt.systemPrompt).toBeTruthy();
      expect(prompt.userPrompt).toBeTruthy();
      expect(Array.isArray(prompt.variables)).toBe(true);
      expect(prompt.variables.length).toBeGreaterThan(0);
      expect(prompt.sourceFile).toBeTruthy();
      expect(prompt.sourceLocation).toBeTruthy();
      expect(prompt.status).toBe("active");
    });
  });

  it("ensures prompt constants match registry definitions exactly (Single Source of Truth)", () => {
    const registry = getPromptRegistry();

    const planning = registry.find((p) => p.id === "content-planning");
    expect(planning?.systemPrompt).toBe(CONTENT_PLANNING_SYSTEM_PROMPT);

    const lesson = registry.find((p) => p.id === "lesson-generation");
    expect(lesson?.systemPrompt).toBe(LESSON_GENERATION_SYSTEM_PROMPT);

    const flashcard = registry.find((p) => p.id === "flashcard-generation");
    expect(flashcard?.systemPrompt).toBe(FLASHCARD_GENERATION_SYSTEM_PROMPT);

    const quiz = registry.find((p) => p.id === "quiz-generation");
    expect(quiz?.systemPrompt).toBe(QUIZ_GENERATION_SYSTEM_PROMPT);

    const rec = registry.find((p) => p.id === "recommendations-generation");
    expect(rec?.systemPrompt).toBe(RECOMMENDATION_SYSTEM_PROMPT);

    const dashboardAssistant = registry.find(
      (p) => p.id === "study-assistant-dashboard",
    );
    expect(dashboardAssistant?.systemPrompt).toBe(
      DASHBOARD_ASSISTANT_SYSTEM_PROMPT,
    );
  });

  it("does not include mock or test prompts in production registry", () => {
    const registry = getPromptRegistry();
    const allSystemPrompts = registry.map((p) => p.systemPrompt);

    // Test helper string from test files should never appear
    expect(
      allSystemPrompts.includes("You produce structured JSON study content."),
    ).toBe(false);
  });

  it("treats provider and model as runtime metadata without altering prompt identities", () => {
    const defaultRegistry = getPromptRegistry();
    const cloudflareRegistry = getPromptRegistry({
      provider: "cloudflare",
      model: "@cf/meta/llama-3.3-70b-instruct",
    });

    expect(cloudflareRegistry.length).toBe(defaultRegistry.length);
    expect(cloudflareRegistry.map((p) => p.id)).toEqual(
      defaultRegistry.map((p) => p.id),
    );

    cloudflareRegistry.forEach((p) => {
      expect(p.provider).toBe("cloudflare");
      expect(p.model).toBe("@cf/meta/llama-3.3-70b-instruct");
    });
  });
});

describe("Prompt Inspector Admin API Endpoint", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const isGlobal = role === Roles.platform_admin;
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "x",
        globalRole: isGlobal ? Roles.platform_admin : null,
      });
      if (!isGlobal) {
        const orgId = randomUUID() as OrganizationId;
        orgStore.addMembership({
          id: randomUUID(),
          organizationId: orgId,
          userId: user.id as UserId,
          role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const platformAdmin = await createUserWithRole(
      "admin@avana.test",
      Roles.platform_admin,
    );
    const student = await createUserWithRole(
      "student@avana.test",
      Roles.student,
    );
    const orgAdmin = await createUserWithRole(
      "orgadmin@avana.test",
      Roles.organization_admin,
    );

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
    });

    return { app, platformAdmin, student, orgAdmin };
  }

  it("denies access to unauthenticated requests (401)", async () => {
    const { app } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/prompts",
    });

    expect(res.statusCode).toBe(401);
  });

  it("denies access to non-platform_admin users (403)", async () => {
    const { app, student, orgAdmin } = await setupTestApp();

    const studentRes = await app.inject({
      method: "GET",
      url: "/v1/admin/prompts",
      cookies: { avana_session: student.sessionToken },
    });
    expect(studentRes.statusCode).toBe(403);

    const orgAdminRes = await app.inject({
      method: "GET",
      url: "/v1/admin/prompts",
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(orgAdminRes.statusCode).toBe(403);
  });

  it("allows platform_admin to inspect all real prompts via /v1/admin/prompts", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/prompts",
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.prompts).toBeDefined();
    expect(Array.isArray(data.prompts)).toBe(true);
    expect(data.prompts.length).toBeGreaterThanOrEqual(7);

    const firstPrompt = data.prompts[0];
    expect(firstPrompt.id).toBeDefined();
    expect(firstPrompt.name).toBeDefined();
    expect(firstPrompt.systemPrompt).toBeDefined();
    expect(firstPrompt.userPrompt).toBeDefined();
    expect(firstPrompt.variables).toBeDefined();
    expect(firstPrompt.sourceFile).toBeDefined();
  });

  it("also supports legacy /v1/admin/generation/prompts path seamlessly", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/prompts",
      cookies: { avana_session: platformAdmin.sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.prompts.length).toBeGreaterThanOrEqual(7);
  });

  it("does not expose mutation endpoints for prompts (Read-Only enforcement)", async () => {
    const { app, platformAdmin } = await setupTestApp();

    const postRes = await app.inject({
      method: "POST",
      url: "/v1/admin/prompts",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { name: "Fake Prompt" },
    });
    expect(postRes.statusCode).toBe(404);

    const putRes = await app.inject({
      method: "PUT",
      url: "/v1/admin/prompts/content-planning",
      cookies: { avana_session: platformAdmin.sessionToken },
      payload: { systemPrompt: "Hacked" },
    });
    expect(putRes.statusCode).toBe(404);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/v1/admin/prompts/content-planning",
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(deleteRes.statusCode).toBe(404);
  });
});
