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
  UUID,
  GenerationJobId,
} from "@avana/domain";
import { asUserId, asWalletId } from "@avana/domain";
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
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  processGenerationJob,
  type GenerationProcessorDeps,
} from "../modules/generation/generation-processor.js";
import { GenerationRecoveryService } from "../modules/generation/generation-recovery-service.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { refundGenerationJobDebit } from "../modules/generation/generation-refund-helper.js";
import { defaultPolicy } from "@avana/domain";

describe("Generation Cost Estimation & Billing (Phase 3)", () => {
  let orgId: OrganizationId;
  let courseId: CourseId;
  let docId: DocumentId;

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
  let walletStore: InMemoryWalletStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let walletService: WalletService;
  let gateway: MockModelGateway;
  let queue: InMemoryGenerationQueue;

  let app: ReturnType<typeof createApp>;
  let sessionService: SessionService;

  let studentUser: { id: UserId; email: string };
  let adminUser: { id: UserId; email: string };
  let studentSessionCookie: string;
  let adminSessionCookie: string;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    const config = loadApiConfig();

    orgId = randomUUID() as OrganizationId;
    courseId = randomUUID() as CourseId;
    docId = randomUUID() as DocumentId;

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
    walletStore = new InMemoryWalletStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    walletService = new WalletService(walletStore, auditService);
    gateway = new MockModelGateway();
    queue = new InMemoryGenerationQueue(generationJobStore);

    // Create student user
    studentUser = await userStore.createUserWithPassword({
      email: "student@avana.ai",
      passwordHash: "hash-student",
      name: "Student User",
      globalRole: "student",
    });

    // Create admin user
    adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ai",
      passwordHash: "hash-admin",
      name: "Platform Admin",
      globalRole: "platform_admin",
    });

    // Create Organization and memberships
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
        id: `mem-admin-${orgId}` as OrgMembershipId,
        organizationId: orgId,
        userId: adminUser.id,
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Add student membership
    await orgStore.addMembership({
      id: `mem-student-${orgId}` as OrgMembershipId,
      organizationId: orgId,
      userId: studentUser.id,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Seed document with 5 chunks (~2500 tokens)
    const now = new Date().toISOString();
    await documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      originalName: "Biology_101.pdf",
      mimeType: "application/pdf",
      sizeBytes: 150000,
      pageCount: 5,
      chunkCount: 5,
      status: "extracted",
      storageKey: `orgs/${orgId}/docs/${docId}`,
      contentHash: "hash-doc-biology",
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
        content: `Comprehensive academic content for chunk ${i + 1}... `.repeat(40),
        contentHash: `hash-ch-${i + 1}`,
        tokenEstimate: 500,
        createdAt: now,
      });
    }

    sessionService = new SessionService(sessionStore, config.session);
    const studentSession = await sessionService.createSession(studentUser.id);
    studentSessionCookie = studentSession.sessionToken;

    const adminSession = await sessionService.createSession(adminUser.id);
    adminSessionCookie = adminSession.sessionToken;

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
      walletService,
      walletStore,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Cost Estimation Check
  // -------------------------------------------------------------------------
  it("1. Public generation cost estimate returns reference-based user price in Tomans", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/estimate-cost`,
      headers: {
        authorization: `Bearer ${studentSessionCookie}`,
      },
      payload: {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.estimated_price_toman).toBe(6200);
    expect(body.currency).toBe("toman");
    expect(body.formatted_price).toContain("۶,۲۰۰ تومان");
  });

  // -------------------------------------------------------------------------
  // 2. Insufficient Funds (HTTP 402)
  // -------------------------------------------------------------------------
  it("2. Returns HTTP 402 Payment Required when student wallet balance is insufficient", async () => {
    // Initial balance is 0 Tomans, required is 6200 Tomans
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: {
        authorization: `Bearer ${studentSessionCookie}`,
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(402);
    const body = JSON.parse(response.body);
    expect(body.error?.code).toBe("INSUFFICIENT_FUNDS");

    // Document status must not be left stuck in pending_generation
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    expect(doc?.status).toBe("extracted");

    // No jobs enqueued
    expect(generationJobStore.getAll().length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Successful Generation Debit & Enqueue
  // -------------------------------------------------------------------------
  it("3. Successfully debits quoted reference price from student wallet and enqueues job", async () => {
    // Fund student wallet with 10,000 Tomans
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-1",
      idempotencyKey: "credit-seed-1",
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: {
        authorization: `Bearer ${studentSessionCookie}`,
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.job_id).toBeDefined();

    // Check document status is pending_generation
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    expect(doc?.status).toBe("pending_generation");

    // Check wallet balance was debited for lesson (1100 Tomans)
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(8_900); // 10000 - 1100

    // Check transaction record
    const debitTx = await walletStore.findTransactionByIdempotencyKey(
      `generation-debit:${body.job_id}`,
    );
    expect(debitTx).toBeDefined();
    expect(debitTx?.amount).toBe(1100);
    expect(debitTx?.type).toBe("debit");
    expect(debitTx?.source).toBe("content_generation");
  });

  // -------------------------------------------------------------------------
  // 4. Concurrency Guard: 409 Conflict with ZERO Debits
  // -------------------------------------------------------------------------
  it("4. Prevents concurrent generation requests with 409 and executes zero debits on collision", async () => {
    // Fund wallet
    await walletService.credit({
      userId: studentUser.id,
      amount: 20_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-2",
      idempotencyKey: "credit-seed-2",
    });

    // Mark doc as generating
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    await documentStore.update({ ...doc!, status: "generating" });

    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: {
        authorization: `Bearer ${studentSessionCookie}`,
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(409);
    // Balance remains exactly 20,000 Tomans (zero debits)
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(20_000);
  });

  // -------------------------------------------------------------------------
  // 5. Admin Generation is 100% Free (Zero Debits, No Wallet Required)
  // -------------------------------------------------------------------------
  it("5. Admin generation is 100% free and performs zero wallet mutations", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: {
        authorization: `Bearer ${adminSessionCookie}`,
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);

    // No debit transaction should exist for this job
    const debitTx = await walletStore.findTransactionByIdempotencyKey(
      `generation-debit:${body.job_id}`,
    );
    expect(debitTx).toBeNull();

    // Admin has no wallet or 0 balance
    const adminWallet = await walletStore.findWalletByUserId(adminUser.id);
    expect(adminWallet?.balance ?? 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. Enqueue Failure Compensation Refund
  // -------------------------------------------------------------------------
  it("6. Compensates wallet debit with immediate refund if enqueue fails", async () => {
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-3",
      idempotencyKey: "credit-seed-3",
    });

    // Force queue.enqueueGenerationJob to fail
    vi.spyOn(queue, "enqueueGenerationJob").mockRejectedValueOnce(
      new Error("Redis queue connection refused"),
    );

    const response = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: {
        authorization: `Bearer ${studentSessionCookie}`,
      },
      payload: {
        types: ["lesson"],
      },
    });

    expect(response.statusCode).toBe(500);

    // Balance was debited and refunded, net balance is back to 10,000 Tomans
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // Document status restored to extracted
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    expect(doc?.status).toBe("extracted");
  });

  // -------------------------------------------------------------------------
  // 7. Generation Processor Terminal Failure Refund
  // -------------------------------------------------------------------------
  it("7. Processor refunds exact original debit upon terminal job failure", async () => {
    const jobId = randomUUID() as GenerationJobId;

    // Seed student with 10,000 Tomans and debit 3100 Tomans for the job
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-4",
      idempotencyKey: "credit-seed-4",
    });
    await walletService.debit({
      userId: studentUser.id,
      amount: 3100,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    // Create job record in queued state before processor picks it up
    await generationJobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "queued",
      attempts: 0,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    });

    const userGenerationService = new GenerationService(
      generatedContentStore,
      citationStore,
      gateway,
      documentStore,
      chunkStore,
      defaultPolicy,
      auditService,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      undefined,
      "org-system" as OrganizationId,
      undefined,
      generationJobStore,
    );

    // Mock service to throw failure
    vi.spyOn(userGenerationService, "generateForDocument").mockRejectedValueOnce(
      new Error("OpenRouter rate limit exceeded"),
    );

    const deps: GenerationProcessorDeps = {
      generationService: userGenerationService,
      generationJobStore,
      walletService,
      walletStore,
    };

    const mockJob = {
      id: jobId,
      data: {
        actorUserId: studentUser.id,
        actorRole: "student",
        organizationId: orgId,
        documentId: docId,
        courseId,
        types: ["lesson"],
        generationContext: "public",
      },
    };

    await expect(processGenerationJob(mockJob as any, deps)).rejects.toThrow(
      "OpenRouter rate limit exceeded",
    );

    // Balance restored to 10,000 Tomans
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // Refund transaction exists
    const refundTx = await walletStore.findTransactionByIdempotencyKey(
      `generation-refund:${jobId}`,
    );
    expect(refundTx).toBeDefined();
    expect(refundTx?.amount).toBe(3100);
    expect(refundTx?.type).toBe("refund");
  });

  // -------------------------------------------------------------------------
  // 8. Generation Processor Clean Stop Refund
  // -------------------------------------------------------------------------
  it("8. Processor refunds exact original debit when user cleanly stops the job", async () => {
    const jobId = randomUUID() as GenerationJobId;

    // Credit and debit for job
    await walletService.credit({
      userId: studentUser.id,
      amount: 5000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-5",
      idempotencyKey: "credit-seed-5",
    });
    await walletService.debit({
      userId: studentUser.id,
      amount: 3100,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    // Mark existing job as stopped
    await generationJobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "stopped",
      attempts: 0,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    });

    const deps: GenerationProcessorDeps = {
      generationJobStore,
      walletService,
      walletStore,
      generationService: new GenerationService(
        generatedContentStore,
        citationStore,
        gateway,
        documentStore,
        chunkStore,
        defaultPolicy,
      ),
    };

    const mockJob = {
      id: jobId,
      data: {
        actorUserId: studentUser.id,
        actorRole: "student",
        organizationId: orgId,
        documentId: docId,
        courseId,
        types: ["lesson"],
        generationContext: "public",
      },
    };

    const result = await processGenerationJob(mockJob as any, deps);
    expect(result.status).toBe("stopped");

    // Balance fully refunded
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // 9. Stale Job Recovery Service Refund
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 9. Stale Job Recovery Service Refund
  // -------------------------------------------------------------------------
  it("9. GenerationRecoveryService refunds stale failed jobs upon reconciliation", async () => {
    const jobId = randomUUID() as GenerationJobId;

    // Credit and debit
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-6",
      idempotencyKey: "credit-seed-6",
    });
    await walletService.debit({
      userId: studentUser.id,
      amount: 3100,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    // Seed stale running job
    await generationJobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      attempts: 1,
      leaseExpiresAt: new Date(Date.now() - 3600_000).toISOString(), // expired 1 hour ago
      heartbeatAt: new Date(Date.now() - 3600_000).toISOString(),
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    // Mark doc as generating
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    await documentStore.update({ ...doc!, status: "generating" });

    const recoveryService = new GenerationRecoveryService(
      undefined as any,
      undefined as any,
      documentStore,
      generatedContentStore,
      chunkStore,
      generationJobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const recResult = await recoveryService.reconcileStaleDocument(orgId, docId, {
      maxAgeMs: 60_000,
    });
    expect(recResult.recovered).toBe(true);

    // Stale job transitioned to failed
    const job = await generationJobStore.findByIdForOrganization(jobId, orgId);
    expect(job?.status).toBe("failed");
    expect(job?.errorCode).toBe("STALE_LEASE_EXPIRED");

    // Debit refunded back to student
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);
  });

  // -------------------------------------------------------------------------
  // 10. Queued Public Generation Stop Immediately Refunds Wallet (P1 Fix 1)
  // -------------------------------------------------------------------------
  it("10. Queued public generation stop immediately refunds wallet without worker consumption", async () => {
    // Fund student wallet
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-10",
      idempotencyKey: "credit-seed-10",
    });

    // Start generation (enqueued in queued state)
    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
      payload: { types: ["lesson"] },
    });
    expect(genRes.statusCode).toBe(202);
    const { job_id: jobId } = JSON.parse(genRes.body);

    // Balance was debited by 1100
    let wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(8900);

    // Stop document generation while still queued
    const stopRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
    });
    expect(stopRes.statusCode).toBe(200);
    const stopBody = JSON.parse(stopRes.body);
    expect(stopBody.status).toBe("stopped");

    // Wallet is refunded immediately back to 10,000 Tomans
    wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // Document is restored to extracted
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    expect(doc?.status).toBe("extracted");

    // Job in store is marked stopped
    const job = await generationJobStore.findByIdForOrganization(jobId, orgId);
    expect(job?.status).toBe("stopped");
  });

  // -------------------------------------------------------------------------
  // 11. Queued Public Generation Stop is Idempotent
  // -------------------------------------------------------------------------
  it("11. Calling stop on an already-stopped queued generation is idempotent and does NOT refund twice", async () => {
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-11",
      idempotencyKey: "credit-seed-11",
    });

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
      payload: { types: ["lesson"] },
    });
    const { job_id: jobId } = JSON.parse(genRes.body);

    // First stop
    const stopRes1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
    });
    expect(stopRes1.statusCode).toBe(200);

    // Second stop via direct job stop endpoint
    const stopRes2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/generation/${jobId}/stop`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
    });
    expect(stopRes2.statusCode).toBe(200);

    // Wallet balance is exactly 10,000 Tomans (no double refund)
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);
  });

  // -------------------------------------------------------------------------
  // 12. Queued Admin Stop Causes Zero Wallet Mutation
  // -------------------------------------------------------------------------
  it("12. Queued admin generation stop causes zero wallet mutations", async () => {
    const genRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${adminSessionCookie}` },
      payload: { types: ["lesson"] },
    });
    expect(genRes.statusCode).toBe(202);
    const { job_id: jobId } = JSON.parse(genRes.body);

    const stopRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      headers: { authorization: `Bearer ${adminSessionCookie}` },
    });
    expect(stopRes.statusCode).toBe(200);

    // Admin has 0 balance and 0 transactions
    const adminWallet = await walletStore.findWalletByUserId(adminUser.id);
    expect(adminWallet?.balance ?? 0).toBe(0);

    const refundTx = await walletStore.findTransactionByIdempotencyKey(
      `generation-refund:${jobId}`,
    );
    expect(refundTx).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 13. Orphaned pending_generation Document Recovered After Stale Threshold (P1 Fix 2)
  // -------------------------------------------------------------------------
  it("13. Orphaned pending_generation document is safely recovered after stale threshold", async () => {
    // Put document into pending_generation with an old timestamp (exceeded 10 min threshold)
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    const oldTimestamp = new Date(Date.now() - 3600_000).toISOString();
    await documentStore.update({
      ...doc!,
      status: "pending_generation",
      updatedAt: oldTimestamp,
    });

    const recoveryService = new GenerationRecoveryService(
      undefined as any,
      undefined as any,
      documentStore,
      generatedContentStore,
      chunkStore,
      generationJobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const result = await recoveryService.reconcileStaleDocument(orgId, docId, {
      maxAgeMs: 600_000,
    });

    expect(result.recovered).toBe(true);
    expect(result.previousStatus).toBe("pending_generation");
    expect(result.newStatus).toBe("extracted");

    const updatedDoc = await documentStore.findByIdForOrganization(docId, orgId);
    expect(updatedDoc?.status).toBe("extracted");
  });

  // -------------------------------------------------------------------------
  // 14. Stale Pending Document With No Debit Recovered Without Mutation
  // -------------------------------------------------------------------------
  it("14. Stale pending document with no debit is recovered with zero wallet mutations", async () => {
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    await documentStore.update({
      ...doc!,
      status: "pending_generation",
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });

    const initialWallet = await walletStore.findWalletByUserId(studentUser.id);
    const initialBalance = initialWallet?.balance ?? 0;

    const recoveryService = new GenerationRecoveryService(
      undefined as any,
      undefined as any,
      documentStore,
      generatedContentStore,
      chunkStore,
      generationJobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const result = await recoveryService.reconcileStaleDocument(orgId, docId, {
      maxAgeMs: 600_000,
    });
    expect(result.recovered).toBe(true);

    const currentWallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(currentWallet?.balance ?? 0).toBe(initialBalance);
  });

  // -------------------------------------------------------------------------
  // 15. Stale Pending Document With Associated Debit is Refunded Exactly Once
  // -------------------------------------------------------------------------
  it("15. Stale pending document with associated debit is refunded exactly once upon recovery", async () => {
    const jobId = randomUUID() as GenerationJobId;

    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-15",
      idempotencyKey: "credit-seed-15",
    });
    await walletService.debit({
      userId: studentUser.id,
      amount: 2200,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    // Create stale job associated with this document
    await generationJobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "queued",
      attempts: 0,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
      startedAt: null,
      completedAt: null,
    });

    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    await documentStore.update({
      ...doc!,
      status: "pending_generation",
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });

    const recoveryService = new GenerationRecoveryService(
      undefined as any,
      undefined as any,
      documentStore,
      generatedContentStore,
      chunkStore,
      generationJobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const result = await recoveryService.reconcileStaleDocument(orgId, docId, {
      maxAgeMs: 600_000,
    });
    expect(result.recovered).toBe(true);

    // Balance restored to 10,000 Tomans
    const wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // Calling reconciliation a second time does NOT refund again
    await recoveryService.reconcileStaleDocument(orgId, docId, { maxAgeMs: 600_000 });
    const wallet2 = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet2?.balance).toBe(10_000);
  });

  // -------------------------------------------------------------------------
  // 16. Active / Non-stale pending_generation is NOT Recovered or Refunded
  // -------------------------------------------------------------------------
  it("16. Active / fresh pending_generation document is protected from premature recovery", async () => {
    const doc = await documentStore.findByIdForOrganization(docId, orgId);
    // Updated only 10 seconds ago (well within 600_000 ms lease)
    await documentStore.update({
      ...doc!,
      status: "pending_generation",
      updatedAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const recoveryService = new GenerationRecoveryService(
      undefined as any,
      undefined as any,
      documentStore,
      generatedContentStore,
      chunkStore,
      generationJobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const result = await recoveryService.reconcileStaleDocument(orgId, docId, {
      maxAgeMs: 600_000,
    });

    expect(result.recovered).toBe(false);
    expect(result.activelyRunning).toBe(true);

    // Document status remains pending_generation
    const docAfter = await documentStore.findByIdForOrganization(docId, orgId);
    expect(docAfter?.status).toBe("pending_generation");
  });

  // -------------------------------------------------------------------------
  // 17. Processor Consuming Already-Refunded Stopped Job Does Not Refund Again
  // -------------------------------------------------------------------------
  it("17. Processor consuming an already-refunded stopped job does not refund again", async () => {
    const jobId = randomUUID() as GenerationJobId;

    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-17",
      idempotencyKey: "credit-seed-17",
    });
    await walletService.debit({
      userId: studentUser.id,
      amount: 1100,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    // Immediate stop refund occurs at API route
    await refundGenerationJobDebit({
      walletService,
      walletStore,
      jobId,
      actorUserId: studentUser.id,
      documentId: docId,
      organizationId: orgId,
      reason: "user_stopped_generation",
    });

    // Wallet is back to 10,000
    let wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // Job record marked stopped
    await generationJobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "stopped",
      attempts: 0,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    });

    const deps: GenerationProcessorDeps = {
      generationJobStore,
      walletService,
      walletStore,
      generationService: new GenerationService(
        generatedContentStore,
        citationStore,
        gateway,
        documentStore,
        chunkStore,
        defaultPolicy,
      ),
    };

    const mockJob = {
      id: jobId,
      data: {
        actorUserId: studentUser.id,
        actorRole: "student",
        organizationId: orgId,
        documentId: docId,
        courseId,
        types: ["lesson"],
        generationContext: "public",
      },
    };

    // Worker picks up the job
    const procResult = await processGenerationJob(mockJob as any, deps);
    expect(procResult.status).toBe("stopped");

    // Balance remains exactly 10,000 Tomans (no double refund)
    wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);
  });

  // -------------------------------------------------------------------------
  // 18. Continue After Refunded Generation Creates New Job and Debit
  // -------------------------------------------------------------------------
  it("18. Subsequent generation request after refund creates a brand new job and debit", async () => {
    await walletService.credit({
      userId: studentUser.id,
      amount: 10_000,
      source: "subscription_bonus",
      referenceType: "subscription",
      referenceId: "sub-seed-18",
      idempotencyKey: "credit-seed-18",
    });

    // 1st request
    const genRes1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
      payload: { types: ["lesson"] },
    });
    const { job_id: jobId1 } = JSON.parse(genRes1.body);

    // Stop 1st request
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generation/stop`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
    });

    // Balance refunded back to 10,000
    let wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(10_000);

    // 2nd request succeeds cleanly with a new job and new debit
    const genRes2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionCookie}` },
      payload: { types: ["lesson"] },
    });
    expect(genRes2.statusCode).toBe(202);
    const { job_id: jobId2 } = JSON.parse(genRes2.body);

    expect(jobId2).not.toBe(jobId1);

    // Balance debited for 2nd request
    wallet = await walletStore.findWalletByUserId(studentUser.id);
    expect(wallet?.balance).toBe(8900);

    const debit2 = await walletStore.findTransactionByIdempotencyKey(`generation-debit:${jobId2}`);
    expect(debit2).toBeDefined();
    expect(debit2?.amount).toBe(1100);
  });
});
