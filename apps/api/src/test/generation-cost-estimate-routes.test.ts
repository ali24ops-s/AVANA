import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Actor,
  CourseId,
  DocumentChunkId,
  DocumentId,
  OrgMembershipId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { generationRoutes } from "../modules/generation/generation-routes.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";

describe("Pre-Generation Cost Estimation API & Service", () => {
  let orgId: OrganizationId;
  let courseId: CourseId;
  let docId: DocumentId;
  let actor: Actor;

  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let gateway: MockModelGateway;
  let queue: InMemoryGenerationQueue;

  let app: ReturnType<typeof createApp>;
  let sessionCookie: string;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    const config = loadApiConfig();

    orgId = randomUUID() as OrganizationId;
    courseId = randomUUID() as CourseId;
    docId = randomUUID() as DocumentId;
    actor = {
      userId: randomUUID() as UserId,
      role: "course_editor",
    };

    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    generationJobStore = new InMemoryGenerationJobStore();
    orgStore = new InMemoryOrganizationStore();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    gateway = new MockModelGateway();
    queue = new InMemoryGenerationQueue(generationJobStore);

    // Create organization with user membership
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Test Org",
        slug: "test-org",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: `mem-${orgId}` as OrgMembershipId,
        organizationId: orgId,
        userId: actor.userId,
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Seed document with 5 chunks (~2500 tokens)
    const now = new Date().toISOString();
    await documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      originalName: "Pharmacology_Chapter_3.pdf",
      mimeType: "application/pdf",
      sizeBytes: 150000,
      pageCount: 5,
      chunkCount: 5,
      status: "extracted",
      storageKey: `orgs/${orgId}/docs/${docId}`,
      contentHash: "hash-doc-1",
      errorCode: null,
      errorMessage: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    for (let i = 0; i < 5; i++) {
      await chunkStore.insert({
        id: `chunk-${i + 1}` as DocumentChunkId,
        documentId: docId,
        organizationId: orgId,
        sequence: i,
        startPage: i + 1,
        endPage: i + 1,
        heading: `Section ${i + 1}`,
        content: `Detailed academic pharmacology text for chunk ${i + 1}... `.repeat(40),
        contentHash: `hash-ch-${i + 1}`,
        tokenEstimate: 500,
        createdAt: now,
      });
    }

    // Seed test user & session
    const testUser = await userStore.createUserWithPassword({
      email: "editor@avana.ai",
      passwordHash: "dummy-hash",
      name: "Course Editor",
      globalRole: "platform_admin",
    });
    actor.userId = testUser.id;

    const sessionService = new SessionService(sessionStore, config.session);
    const session = await sessionService.createSession(actor.userId);
    sessionCookie = session.sessionToken;

    app = createApp({ config });
    await app.register(generationRoutes, {
      sessionService,
      userStore,
      documentStore,
      documentChunkStore: chunkStore,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      queue,
      gateway,
      organizationStore: orgStore,
      courseStore: undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      systemOrganizationId: "org-system" as OrganizationId,
      pricingConfig: {
        inputPricePerMillionUsd: 0.14,
        outputPricePerMillionUsd: 0.28,
        usdToTomanRate: 100_000,
      },
    });
  });

  it("1. Deterministic Cost Estimation: Computes estimate without calling external model gateway", async () => {
    const completeSpy = vi.spyOn(gateway, "complete");

    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${sessionCookie}`,
      },
      payload: {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.estimated_price_toman).toBe(6200);
    expect(body.estimated_price_toman % 100).toBe(0);
    expect(body.formatted_price).toContain("۶,۲۰۰ تومان");
    expect(body.currency).toBe("toman");
    expect(body.disclaimer).toBe("هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.");

    // Zero AI calls made during estimation
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("2. Course-optional route `/v1/organizations/:organizationId/documents/:documentId/estimate-cost` works identically", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${sessionCookie}`,
      },
      payload: {
        types: ["lesson", "flashcard"],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.estimated_price_toman).toBeGreaterThan(0);
    expect(body.formatted_price).toBeDefined();
  });

  it("3. Accepts boolean selection flags in request body", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${sessionCookie}`,
      },
      payload: {
        lesson: true,
        flashcards: false,
        exam: false,
        review_summary: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.estimated_price_toman).toBeGreaterThanOrEqual(500);
  });

  it("4. Security: Returns 401 when unauthorized", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/estimate-cost`,
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("5. Response payload strictly excludes technical AI internals (tokens, USD, model names)", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${sessionCookie}`,
      },
      payload: {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      },
    });

    const body = JSON.parse(response.body);
    const keys = Object.keys(body);

    // Allowed user fields
    expect(keys.sort()).toEqual([
      "currency",
      "disclaimer",
      "estimated_price_toman",
      "formatted_price",
      "request_id",
      "stage_prices",
    ].sort());

    // Strict absence of leaked internals
    expect(body.inputTokens).toBeUndefined();
    expect(body.outputTokens).toBeUndefined();
    expect(body.model).toBeUndefined();
    expect(body.pricing).toBeUndefined();
    expect(body.usd).toBeUndefined();
  });

  it("6. Unextracted document (0 chunks) fails closed with 422 domain error", async () => {
    const unextractedDocId = randomUUID() as DocumentId;
    await documentStore.insert({
      id: unextractedDocId,
      organizationId: orgId,
      courseId,
      originalName: "empty.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      pageCount: 1,
      chunkCount: 0,
      status: "uploaded",
      storageKey: `orgs/${orgId}/docs/${unextractedDocId}`,
      contentHash: "hash-doc-empty",
      errorCode: null,
      errorMessage: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${unextractedDocId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${sessionCookie}`,
      },
      payload: {
        types: ["lesson", "flashcard"],
      },
    });

    expect(response.statusCode).toBe(422);
  });
});
