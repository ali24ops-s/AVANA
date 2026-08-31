/**
 * PR6-5 Integration tests: AI generation API (async).
 *
 * The generate endpoint is now asynchronous (BullMQ worker). This test covers
 * the PR6-5 acceptance criteria:
 * 1. POST .../documents/:id/generate returns 202 + job_id + status queued
 * 2. GET  .../documents/:id/generate/jobs/:jobId returns job lifecycle
 * 3. GET  .../documents/:id/generated lists drafts + citations (after worker)
 * 4. GET  .../documents/:id/generated/:contentId returns a single draft
 * 5. Unauthenticated requests rejected (401)
 * 6. Cross-tenant access is non-disclosing (404)
 * 7. A non-extracted document is accepted for async generation (the status
 *    guard runs in the worker), and the job is persisted as queued.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
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
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { GenerationService } from "../modules/generation/index.js";
import { createModelGateway } from "../modules/generation/index.js";
import { defaultPolicy } from "@avana/domain";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { Actor, OrganizationId, UserId } from "@avana/domain";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

function buildMultipartBody(options: {
  filename: string;
  contentType: string;
  data: Buffer;
}): { body: Buffer; contentType: string } {
  const boundary = "----avana-test-boundary";
  const chunks: Buffer[] = [];
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename}"\r\nContent-Type: ${options.contentType}\r\n\r\n`,
    ),
    options.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function validPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< >>
stream
BT
(Hello from AVANA generation) Tj
ET
endstream
endobj
%%EOF`,
    "latin1",
  );
}

describe("PR6-5: AI generation API (async)", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-gen-test-"));
    storageProvider = new LocalStorageProvider(storageDir);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      gateway: createModelGateway("mock"),
      auditService,
    });
    return app;
  }

  /**
   * Simulate the worker processing a queued job by invoking the existing
   * GenerationService synchronously (the same service the worker calls).
   */
  async function runWorkerForLastJob(
    actor: Actor,
  ): Promise<{ jobId: string; documentId: string }> {
    const jobs = generationJobStore.getAll();
    const job = jobs[jobs.length - 1];
    if (!job) throw new Error("No queued job");

    const service = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      createModelGateway("mock"),
      documentStore,
      documentChunkStore,
      defaultPolicy,
      auditService,
    );

    await service.generateForDocument(
      actor,
      job.organizationId as OrganizationId,
      job.documentId,
      {
        types: (job.type.split(",") as never[]) ?? ["lesson"],
        promptVersion: undefined,
        generationKey: job.generationKey ?? undefined,
      },
    );

    return { jobId: job.id, documentId: job.documentId };
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
      userId: body.user.id as UserId,
      email: body.user.email,
    };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ): Promise<OrganizationId> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { organization: { id: string } };
    const orgId = body.organization.id as OrganizationId;
    try {
      await courseStore.create({
        course: {
          id: courseId,
          organizationId: orgId,
          name: "Test Course",
          subject: "Pharmacology",
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });
    } catch {
      // Ignore if already seeded
    }
    return orgId;
  }

  async function uploadAndExtract(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    organizationId: string,
  ): Promise<{ id: string }> {
    // Upload.
    const multipart = buildMultipartBody({
      filename: "notes.pdf",
      contentType: "application/pdf",
      data: validPdf(),
    });
    const upload = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/documents`,
      cookies: { avana_session: token },
      headers: { "content-type": multipart.contentType },
      payload: multipart.body,
    });
    expect(upload.statusCode).toBe(201);
    const uploadBody = JSON.parse(upload.body) as {
      document: { id: string };
    };

    // Extract → chunks.
    const extract = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/documents/${uploadBody.document.id}/extract`,
      cookies: { avana_session: token },
    });
    expect(extract.statusCode).toBe(200);
    const extractBody = JSON.parse(extract.body) as {
      status: { status: string };
    };
    expect(extractBody.status.status).toBe("extracted");

    return { id: uploadBody.document.id };
  }

  const courseId = "11111111-1111-4111-8111-111111111111";

  describe("POST .../documents/:documentId/generate (async)", () => {
    it("returns 202 with a queued job id", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen@example.com");
      const organizationId = await createOrg(app, token, "Gen Org");

      const doc = await uploadAndExtract(app, token, organizationId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body) as {
        job_id: string;
        status: string;
      };
      expect(body.status).toBe("queued");
      expect(body.job_id).toBeTruthy();

      // A generation_jobs row is persisted as queued.
      const jobs = generationJobStore.getAll();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].documentId).toBe(doc.id);
      expect(jobs[0].status).toBe("queued");
      await app.close();
    });

    it("accepts a non-extracted document for async generation (status guard runs in worker)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen2@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 2");

      // Upload only — no extraction.
      const multipart = buildMultipartBody({
        filename: "notes.pdf",
        contentType: "application/pdf",
        data: validPdf(),
      });
      const upload = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/documents`,
        cookies: { avana_session: token },
        headers: { "content-type": multipart.contentType },
        payload: multipart.body,
      });
      const uploadBody = JSON.parse(upload.body) as {
        document: { id: string };
      };

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${uploadBody.document.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });
      // The route enqueues regardless of document status; the worker guards it.
      expect(res.statusCode).toBe(202);
      await app.close();
    });

    it("rejects an unauthenticated generate request with 401", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/00000000-0000-0000-0000-000000000000/courses/${courseId}/documents/00000000-0000-0000-0000-000000000001/generate`,
        payload: {},
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("returns 404 for a document in another organization (non-disclosing)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen3@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 3");
      const doc = await uploadAndExtract(app, token, organizationId);

      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "gen4@example.com");
      const org2 = await createOrg(app2, token2, "Gen Org 4");

      const res = await app2.inject({
        method: "POST",
        url: `/v1/organizations/${org2}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token2 },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("GET .../documents/:documentId/generate/jobs/:jobId", () => {
    it("returns the persisted job lifecycle after enqueue", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen5@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 5");

      const doc = await uploadAndExtract(app, token, organizationId);

      const gen = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });
      const genBody = JSON.parse(gen.body) as { job_id: string };

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate/jobs/${genBody.job_id}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        job: { id: string; status: string; document_id: string };
      };
      expect(body.job.id).toBe(genBody.job_id);
      expect(body.job.document_id).toBe(doc.id);
      expect(["queued", "running", "succeeded", "failed"]).toContain(
        body.job.status,
      );
      await app.close();
    });

    it("returns 404 for a job in another document (non-disclosing)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen5b@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 5b");

      const doc = await uploadAndExtract(app, token, organizationId);
      const gen = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });
      const genBody = JSON.parse(gen.body) as { job_id: string };

      const otherDocId = "22222222-2222-4222-8222-222222222222";
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${otherDocId}/generate/jobs/${genBody.job_id}`,
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("GET .../documents/:documentId/generated (after worker)", () => {
    it("lists generated drafts for a document once the worker has run", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "gen6@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 6");
      const actor: Actor = { userId, role: "student" };

      const doc = await uploadAndExtract(app, token, organizationId);

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });

      // Simulate the worker producing the draft.
      await runWorkerForLastJob(actor);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generated`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        contents: Array<{ type: string; citations: unknown[] }>;
      };
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].type).toBe("lesson");
      expect(body.contents[0].citations.length).toBeGreaterThan(0);
      await app.close();
    });
  });

  describe("GET .../documents/:documentId/generated/:contentId (after worker)", () => {
    it("returns a single generated content with citations", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "gen7@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 7");
      const actor: Actor = { userId, role: "student" };

      const doc = await uploadAndExtract(app, token, organizationId);

      const gen = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: {},
      });
      expect(gen.statusCode).toBe(202);

      await runWorkerForLastJob(actor);

      const contents = generatedContentStore.getAll();
      expect(contents).toHaveLength(1);
      const contentId = contents[0].id;

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generated/${contentId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        content: { id: string; citations: unknown[] };
      };
      expect(body.content.id).toBe(contentId);
      expect(body.content.citations.length).toBeGreaterThan(0);
      await app.close();
    });

    it("returns 404 for an unknown content id", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "gen8@example.com");
      const organizationId = await createOrg(app, token, "Gen Org 8");

      const doc = await uploadAndExtract(app, token, organizationId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generated/99999999-9999-4999-8999-999999999999`,
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
