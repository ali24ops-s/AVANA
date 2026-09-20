import { describe, test, expect } from "vitest";
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
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type UUID,
  type DocumentChunkId,
  asDocumentId,
  REFERENCE_DOCUMENT_ID,
  REFERENCE_DOCUMENT_METRICS,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

describe("Admin Content Generation Reference Pricing Routes", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const gateway = new MockModelGateway();
    const queue = new InMemoryGenerationQueue();

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "hash_pass_123",
      });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      } else if (role === Roles.content_worker) {
        user.globalRole = "content_worker";
        user.role = "content_worker";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      await orgStore.createWithAdminMembership({
        organization: {
          id: orgId,
          name: "Test Org",
          slug: `test-org-${user.id}`,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: randomUUID() as unknown as UUID,
          organizationId: orgId,
          userId: user.id as UserId,
          role: "admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken, orgId };
    }

    const student = await createUserWithRole("student@test.com", Roles.student);
    const teacher = await createUserWithRole("teacher@test.com", Roles.teacher);
    const worker = await createUserWithRole("worker@test.com", Roles.content_worker);
    const platformAdmin = await createUserWithRole("admin@test.com", Roles.platform_admin);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore: citationStore,
      generationJobStore,
      gateway,
      queue,
    });

    return {
      app,
      adminStore,
      documentStore,
      documentChunkStore,
      student,
      teacher,
      worker,
      platformAdmin,
    };
  }

  describe("1. Security & Authorization", () => {
    test("Unauthenticated requests to /commerce/content-pricing return 401", async () => {
      const { app } = await setupTestApp();

      const getRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/content-pricing",
      });
      expect(getRes.statusCode).toBe(401);

      const putRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        payload: { lessonBaselinePriceToman: 20000 },
      });
      expect(putRes.statusCode).toBe(401);
    });

    test("Non-admin roles (student, teacher, content_worker) return 403 Forbidden", async () => {
      const { app, student, teacher, worker } = await setupTestApp();

      for (const nonAdmin of [student, teacher, worker]) {
        const getRes = await app.inject({
          method: "GET",
          url: "/v1/admin/commerce/content-pricing",
          headers: { authorization: `Bearer ${nonAdmin.sessionToken}` },
        });
        expect(getRes.statusCode).toBe(403);

        const putRes = await app.inject({
          method: "PUT",
          url: "/v1/admin/commerce/content-pricing",
          headers: { authorization: `Bearer ${nonAdmin.sessionToken}` },
          payload: { lessonBaselinePriceToman: 20000 },
        });
        expect(putRes.statusCode).toBe(403);
      }
    });

    test("Platform Admin can access GET and PUT /commerce/content-pricing", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const getRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
      });
      expect(getRes.statusCode).toBe(200);
    });
  });

  describe("2. Default Configuration & Baseline Invariants", () => {
    test("GET /commerce/content-pricing returns canonical default reference baseline", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);

      expect(data.referenceDocumentId).toBe(REFERENCE_DOCUMENT_ID);
      expect(data.referenceFileName).toBe(REFERENCE_DOCUMENT_METRICS.originalName);
      expect(data.referenceUsableTokens).toBe(35_572);
      expect(data.lessonBaselinePriceToman).toBe(15_000);
      expect(data.flashcardBaselinePriceToman).toBe(7_000);
      expect(data.examBaselinePriceToman).toBe(9_000);
      expect(data.summaryFixedPriceToman).toBe(4_000);
    });
  });

  describe("3. Validation & Error Handling", () => {
    test("Rejects empty payload with 400", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.code).toBe("invalid_input");
    });

    test("Rejects negative price with 400", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: { lessonBaselinePriceToman: -500 },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.code).toBe("invalid_input");
    });

    test("Rejects non-integer or float price with 400", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: { flashcardBaselinePriceToman: 7000.5 },
      });

      expect(res.statusCode).toBe(400);
    });

    test("Rejects string non-numeric value with 400", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const res = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: { examBaselinePriceToman: "invalid" as unknown as number },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("4. Updating Reference Pricing & Persistence", () => {
    test("Admin can update Lesson baseline price and change persists across calls", async () => {
      const { app, platformAdmin } = await setupTestApp();

      // 1. Update lesson price to 20,000
      const putRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: { lessonBaselinePriceToman: 20000 },
      });

      expect(putRes.statusCode).toBe(200);
      const putData = JSON.parse(putRes.payload);
      expect(putData.success).toBe(true);
      expect(putData.pricing.lessonBaselinePriceToman).toBe(20000);
      expect(putData.pricing.flashcardBaselinePriceToman).toBe(7000); // untouched
      expect(putData.pricing.examBaselinePriceToman).toBe(9000); // untouched
      expect(putData.pricing.summaryFixedPriceToman).toBe(4000); // untouched

      // 2. Subsequent GET confirms persisted state
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const getData = JSON.parse(getRes.payload);
      expect(getData.lessonBaselinePriceToman).toBe(20000);
      expect(getData.flashcardBaselinePriceToman).toBe(7000);
      expect(getData.examBaselinePriceToman).toBe(9000);
      expect(getData.summaryFixedPriceToman).toBe(4000);
    });

    test("Admin can update all 4 stage prices simultaneously", async () => {
      const { app, platformAdmin } = await setupTestApp();

      const putRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: {
          lessonBaselinePriceToman: 25000,
          flashcardBaselinePriceToman: 10000,
          examBaselinePriceToman: 15000,
          summaryFixedPriceToman: 6000,
        },
      });

      expect(putRes.statusCode).toBe(200);
      const data = JSON.parse(putRes.payload);
      expect(data.pricing.lessonBaselinePriceToman).toBe(25000);
      expect(data.pricing.flashcardBaselinePriceToman).toBe(10000);
      expect(data.pricing.examBaselinePriceToman).toBe(15000);
      expect(data.pricing.summaryFixedPriceToman).toBe(6000);
    });
  });

  describe("5. End-to-End Dynamic Integration with /estimate-cost", () => {
    test("/estimate-cost dynamically reflects newly configured baseline prices", async () => {
      const {
        app,
        platformAdmin,
        documentStore,
        documentChunkStore,
      } = await setupTestApp();

      // Create a test document with exactly 35,572 tokens
      const docId = asDocumentId(randomUUID());
      const orgId = platformAdmin.orgId;
      const now = new Date().toISOString();

      await documentStore.insert({
        id: docId,
        organizationId: orgId,
        originalName: "test-lecture.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024 * 1024,
        storageKey: "raw/test-lecture.pdf",
        pageCount: 20,
        chunkCount: 1,
        status: "extracted",
        contentHash: "hash-doc-1",
        errorCode: null,
        errorMessage: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      await documentChunkStore.insert({
        id: randomUUID() as unknown as DocumentChunkId,
        documentId: docId,
        chunkIndex: 0,
        content: "Sample biomedical text content",
        tokenEstimate: 35572,
        pageNumber: 1,
        charCount: 100,
        createdAt: now,
        updatedAt: now,
      });

      // 1. Estimate cost with default baseline
      const initialEstimateRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/estimate-cost`,
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: {
          types: ["lesson", "flashcard", "quiz", "review_summary"],
        },
      });

      expect(initialEstimateRes.statusCode).toBe(200);
      const initialEstimate = JSON.parse(initialEstimateRes.payload);
      expect(initialEstimate.stage_prices.lesson).toBe(15000);
      expect(initialEstimate.stage_prices.flashcard).toBe(7000);
      expect(initialEstimate.stage_prices.quiz).toBe(9000);
      expect(initialEstimate.stage_prices.review_summary).toBe(4000);
      expect(initialEstimate.estimated_price_toman).toBe(35000);

      // 2. Admin updates Lesson to 20,000 and Flashcard to 8,000
      await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/content-pricing",
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: {
          lessonBaselinePriceToman: 20000,
          flashcardBaselinePriceToman: 8000,
        },
      });

      // 3. Estimate cost again — should immediately use new baseline!
      const updatedEstimateRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/documents/${docId}/estimate-cost`,
        headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
        payload: {
          types: ["lesson", "flashcard", "quiz", "review_summary"],
        },
      });

      expect(updatedEstimateRes.statusCode).toBe(200);
      const updatedEstimate = JSON.parse(updatedEstimateRes.payload);
      expect(updatedEstimate.stage_prices.lesson).toBe(20000);
      expect(updatedEstimate.stage_prices.flashcard).toBe(8000);
      expect(updatedEstimate.stage_prices.quiz).toBe(9000);
      expect(updatedEstimate.stage_prices.review_summary).toBe(4000);
      expect(updatedEstimate.estimated_price_toman).toBe(41000);
    });
  });
});
