import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import fastify from "fastify";
import type {
  Actor,
  CompletionRequest,
  CompletionResult,
  ModelGateway,
  OrganizationId,
  UserId,
} from "@avana/domain";
import {
  asPresentationProjectId,
  asPresentationSlideId,
  PRESENTATION_CANONICAL_MODEL,
  PRESENTATION_SLIDE_COST_TOMAN,
} from "@avana/domain";
import {
  InMemoryPresentationProjectStore,
  InMemoryPresentationReferenceStore,
} from "../modules/presentation/in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../modules/presentation/in-memory-presentation-slide-store.js";
import { InMemoryPresentationGenerationOperationStore } from "../modules/presentation/presentation-generation-operation-store.js";
import { PresentationGenerationService } from "../modules/presentation/presentation-generation-service.js";
import { PresentationLayoutService } from "../modules/presentation/presentation-layout-service.js";
import { PresentationReferenceIntegrationService } from "../modules/presentation/reference-integration-service.js";
import { presentationProjectRoutes } from "../modules/presentation/presentation-project-routes.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import { errorHandlerPlugin } from "../http/errorHandler.js";

class MockGateway implements ModelGateway {
  readonly provider = "mock" as const;
  public model: string;
  public shouldFail = false;
  public delayMs = 0;

  constructor(model: string = PRESENTATION_CANONICAL_MODEL) {
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.shouldFail) {
      throw new Error("Gemini quota exceeded or network timeout");
    }
    return {
      text: JSON.stringify({
        title: "Generated Slide Title",
        content: [
          {
            type: "text",
            content: "این متن علمی برای اسلاید است.",
            claims: [],
          },
        ],
        speakerNotes: "این متن سخنرانی علمی و دانشگاهی برای این اسلاید است که توسط هوش مصنوعی تولید شده است.",
        citations: [],
      }),
      model: this.model,
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    };
  }
}

describe("Presentation Assistant Billing & Batch Generation Integration", () => {
  let app: ReturnType<typeof fastify>;
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let referenceStore: InMemoryPresentationReferenceStore;
  let orgStore: InMemoryOrganizationStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let gateway: MockGateway;
  let generationService: PresentationGenerationService;
  let layoutService: PresentationLayoutService;
  let referenceIntegrationService: PresentationReferenceIntegrationService;
  let operationStore: InMemoryPresentationGenerationOperationStore;

  const orgId = randomUUID() as OrganizationId;
  const userId = randomUUID() as UserId;

  beforeEach(async () => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    referenceStore = new InMemoryPresentationReferenceStore();
    orgStore = new InMemoryOrganizationStore();
    chunkStore = new InMemoryDocumentChunkStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    operationStore = new InMemoryPresentationGenerationOperationStore();
    gateway = new MockGateway();

    // Give user initial balance of 5,000 Toman
    await walletService.credit({
      userId,
      amount: 5000,
      source: "gift",
      referenceType: "topup",
      referenceId: randomUUID(),
    });

    orgStore.addOrganization({
      id: orgId,
      name: "Org Alpha",
      slug: "org-alpha",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    generationService = new PresentationGenerationService({
      projectStore,
      slideStore,
      organizationStore: orgStore,
      gateway,
    });

    layoutService = new PresentationLayoutService({
      projectStore,
      slideStore,
      organizationStore: orgStore,
    });

    referenceIntegrationService = new PresentationReferenceIntegrationService({
      referenceStore,
      projectStore,
      organizationStore: orgStore,
      chunkStore,
    });

    app = fastify();
    await app.register(errorHandlerPlugin);

    const mockSessionService = {
      validateSession: async () => ({ userId, role: "student", globalRole: null }),
      validateSessionDetails: async () => ({
        valid: true,
        revoked: false,
        user: { id: userId, userId, role: "student", globalRole: null },
      }),
      getConfig: () => ({}),
    } as any;

    const mockUserStore = {
      findById: async (id: UserId) => ({ id, role: "student", globalRole: null }),
    } as any;

    await app.register(presentationProjectRoutes, {
      projectStore,
      slideStore,
      referenceStore,
      generationService,
      layoutService,
      referenceIntegrationService,
      organizationStore: orgStore,
      sessionService: mockSessionService,
      userStore: mockUserStore,
      walletService,
      operationStore,
    });

    await app.ready();
  });

  async function createTestProjectWithSlides(slideCount: number) {
    const project = await projectStore.create({
      ownerUserId: userId,
      organizationId: orgId,
      title: "Test Presentation",
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "created",
    });

    const slides = [];
    for (let i = 1; i <= slideCount; i++) {
      const slide = await slideStore.createSlide({
        projectId: project.id,
        slideIndex: i,
        title: `Slide ${i}`,
        rawText: `Content for slide ${i}`,
      });
      slides.push(slide);
    }

    return { project, slides };
  }

  it("GET /batch-cost-preview calculates unpaid slides and verifies wallet balance", async () => {
    const { project, slides } = await createTestProjectWithSlides(3);

    // Mark slide 1 as already paid
    await slideStore.updateSlide(slides[0].id, project.id, {
      paymentTransactionId: randomUUID(),
      paidAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/batch-cost-preview`,
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.total_slides).toBe(3);
    expect(body.previously_paid_slides).toBe(1);
    expect(body.unpaid_slides).toBe(2);
    expect(body.cost_per_slide_toman).toBe(1500);
    expect(body.total_cost_toman).toBe(3000); // 2 unpaid * 1500
    expect(body.wallet_balance_toman).toBe(5000);
    expect(body.has_sufficient_balance).toBe(true);
  });

  it("single slide generation debits 1,500 Toman and marks payment fields", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    const initialWallet = await walletService.getUserWallet(userId);
    expect(initialWallet.balance).toBe(5000);

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
      payload: {
        instructions: {
          language: "fa",
          tone: "formal_scientific",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slide.is_paid).toBe(true);
    expect(body.slide.payment_transaction_id).toBeDefined();
    expect(body.slide.paid_at).toBeDefined();

    // Verify wallet debit
    const newWallet = await walletService.getUserWallet(userId);
    expect(newWallet.balance).toBe(5000 - PRESENTATION_SLIDE_COST_TOMAN);
  });

  it("single slide regeneration is free after initial payment (costs 0, no debit)", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    // 1st generation (paid)
    await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
      payload: {
        instructions: { language: "fa", tone: "formal_scientific" },
      },
    });

    const balanceAfterFirst = await walletService.getUserWallet(userId);
    expect(balanceAfterFirst.balance).toBe(3500);

    // 2nd generation (regeneration with custom instructions)
    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
      payload: {
        instructions: {
          language: "fa",
          custom_instructions: "لطفاً توضیحات بیشتری اضافه شود",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.slide.is_paid).toBe(true);

    // Balance must be unchanged
    const balanceAfterSecond = await walletService.getUserWallet(userId);
    expect(balanceAfterSecond.balance).toBe(3500);
  });

  it("single slide generation failure triggers automatic 1,500 Toman refund", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    // Configure gateway to fail
    gateway.shouldFail = true;

    const balanceBefore = await walletService.getUserWallet(userId);
    expect(balanceBefore.balance).toBe(5000);

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
      payload: {
        instructions: { language: "fa" },
      },
    });

    // Mapped error is 503 or 500
    expect([500, 503]).toContain(res.statusCode);

    // Balance must be fully restored (debit 1500 then refund 1500 = 5000)
    const balanceAfter = await walletService.getUserWallet(userId);
    expect(balanceAfter.balance).toBe(5000);

    // Slide must NOT be marked paid
    const updatedSlide = await slideStore.findById(slide.id, project.id);
    expect(updatedSlide?.paymentTransactionId).toBeNull();
    expect(updatedSlide?.paidAt).toBeNull();
  });

  it("batch generation blocks with 400 when user has insufficient balance", async () => {
    // 5 slides = 7,500 Toman needed, but user has only 5,000 Toman
    const { project } = await createTestProjectWithSlides(5);

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/generate-all`,
      headers: { authorization: "Bearer token" },
      payload: { only_unprocessed: false },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message || body.message).toContain("کافی نیست");

    // No debit made
    const bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(5000);
  });

  it("batch generation executes successfully and debits only unpaid slides", async () => {
    // 3 slides: 1 already paid, 2 unpaid = 3,000 Toman needed. User has 5,000.
    const { project, slides } = await createTestProjectWithSlides(3);

    // Mark slide 1 as paid
    await slideStore.updateSlide(slides[0].id, project.id, {
      paymentTransactionId: randomUUID(),
      paidAt: new Date().toISOString(),
      speakerNotes: "Existing notes",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/generate-all`,
      headers: { authorization: "Bearer token" },
      payload: { only_unprocessed: true },
    });

    expect(res.statusCode).toBe(202);

    // Wait briefly for background batch to finish
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Slides 2 and 3 should be paid (total debited: 3000 Toman)
    const finalBal = await walletService.getUserWallet(userId);
    expect(finalBal.balance).toBe(2000);

    const updatedSlide2 = await slideStore.findById(slides[1].id, project.id);
    const updatedSlide3 = await slideStore.findById(slides[2].id, project.id);
    expect(updatedSlide2?.paymentTransactionId).toBeDefined();
    expect(updatedSlide3?.paymentTransactionId).toBeDefined();
  });

  it("Crash after Debit: recovery automatically issues 1,500 Toman refund to user wallet", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    // User starts with 5,000 Toman
    const balInitial = await walletService.getUserWallet(userId);
    expect(balInitial.balance).toBe(5000);

    // Simulate crash scenario: Debit 1500 succeeded, operation marked 'debited', but server died before Gemini finished
    const debitRes = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slide.id,
      idempotencyKey: `debit_op_test_crash_1`,
    });

    const balAfterDebit = await walletService.getUserWallet(userId);
    expect(balAfterDebit.balance).toBe(3500);

    // Create stale operation record (started 10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const op = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slide.id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "test_crash_op_1",
    });

    await operationStore.updateStatus(op.id, {
      status: "debited",
      debitTransactionId: debitRes.transaction.id,
    });
    // Set startedAt to 10 minutes ago
    (operationStore as any).operations.get(op.id).startedAt = tenMinutesAgo;

    await slideStore.updateSlide(slide.id, project.id, {
      extractionMetadata: { generationStatus: "generating" },
    });

    // Trigger recovery via generation-status endpoint
    const res = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);

    // 1. Balance must be fully restored to 5,000 Toman
    const balRestored = await walletService.getUserWallet(userId);
    expect(balRestored.balance).toBe(5000);

    // 2. Operation must be marked refunded
    const updatedOp = await operationStore.findById(op.id);
    expect(updatedOp?.status).toBe("refunded");
    expect(updatedOp?.refundTransactionId).toBeDefined();

    // 3. Slide must be marked failed
    const recoveredSlide = await slideStore.findById(slide.id, project.id);
    expect(recoveredSlide?.extractionMetadata?.generationStatus).toBe("failed");
    expect(recoveredSlide?.paymentTransactionId).toBeNull();
    expect(recoveredSlide?.paidAt).toBeNull();
  });

  it("Crash after DB save: recovery detects valid saved content and does NOT issue a refund", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    // Debit 1500
    const debitRes = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slide.id,
      idempotencyKey: `debit_op_test_saved_1`,
    });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const op = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slide.id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "test_saved_op_1",
    });

    await operationStore.updateStatus(op.id, {
      status: "generating",
      debitTransactionId: debitRes.transaction.id,
    });
    (operationStore as any).operations.get(op.id).startedAt = tenMinutesAgo;

    // Simulate that slide actually got saved before server process died
    await slideStore.updateSlide(slide.id, project.id, {
      paymentTransactionId: debitRes.transaction.id,
      paidAt: tenMinutesAgo,
      speakerNotes: "Successfully generated speech text that was saved to database",
      extractionMetadata: {
        generationStatus: "accepted",
      },
    });

    // Run recovery
    const res = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);

    // Balance must REMAIN 3,500 (NO REFUND because content is saved)
    const balFinal = await walletService.getUserWallet(userId);
    expect(balFinal.balance).toBe(3500);

    // Operation must be transitioned to completed
    const updatedOp = await operationStore.findById(op.id);
    expect(updatedOp?.status).toBe("completed");

    // Slide retains paid status
    const verifiedSlide = await slideStore.findById(slide.id, project.id);
    expect(verifiedSlide?.paidAt).toBeDefined();
    expect(verifiedSlide?.paymentTransactionId).toBe(debitRes.transaction.id);
  });

  it("Idempotent recovery: re-running recovery does not cause duplicate refunds", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    const debitRes = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slide.id,
      idempotencyKey: `debit_op_test_idemp_1`,
    });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const op = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slide.id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "test_idemp_op_1",
    });

    await operationStore.updateStatus(op.id, {
      status: "debited",
      debitTransactionId: debitRes.transaction.id,
    });
    (operationStore as any).operations.get(op.id).startedAt = tenMinutesAgo;

    // 1st Recovery run -> refunds 1500 (balance becomes 5000)
    await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token" },
    });

    const balAfterFirstRecovery = await walletService.getUserWallet(userId);
    expect(balAfterFirstRecovery.balance).toBe(5000);

    // 2nd Recovery run -> MUST NOT REFUND AGAIN
    await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token" },
    });

    const balAfterSecondRecovery = await walletService.getUserWallet(userId);
    expect(balAfterSecondRecovery.balance).toBe(5000);
  });

  it("Atomic Concurrency: two simultaneous generation requests for the same slide result in exactly one debit and one 409 conflict", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    const balBefore = await walletService.getUserWallet(userId);
    expect(balBefore.balance).toBe(5000);

    // Simulate realistic asynchronous Gemini generation time
    gateway.delayMs = 60;

    // Fire two simultaneous generation requests
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
        headers: { authorization: "Bearer token" },
        payload: { instructions: { language: "fa" } },
      }),
      app.inject({
        method: "POST",
        url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
        headers: { authorization: "Bearer token" },
        payload: { instructions: { language: "fa" } },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // One must be 200 (success), and one must be 409 (conflict)
    expect(statuses).toEqual([200, 409]);

    // EXACTLY 1 debit of 1,500 Toman must have occurred
    const balAfter = await walletService.getUserWallet(userId);
    expect(balAfter.balance).toBe(5000 - PRESENTATION_SLIDE_COST_TOMAN);
  });

  it("Batch restart mid-run: refunds in-flight failed slide, keeps completed slides, and successfully resumes", async () => {
    // 3 slides: User has 5,000 Toman
    const { project, slides } = await createTestProjectWithSlides(3);

    // Simulate: Slide 1 completed previously
    await slideStore.updateSlide(slides[0].id, project.id, {
      paymentTransactionId: randomUUID(),
      paidAt: new Date().toISOString(),
      speakerNotes: "Slide 1 speaker notes already completed",
      extractionMetadata: { generationStatus: "accepted", speechContent: { speechText: "done" } },
    });

    // Simulate: Slide 2 was debited in a crashed batch and left stale
    const debitRes2 = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slides[1].id,
      idempotencyKey: "debit_slide_2_crashed",
    });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const op2 = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slides[1].id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "op_slide_2_crashed",
    });

    await operationStore.updateStatus(op2.id, {
      status: "debited",
      debitTransactionId: debitRes2.transaction.id,
    });
    (operationStore as any).operations.get(op2.id).startedAt = tenMinutesAgo;
    await slideStore.updateSlide(slides[1].id, project.id, {
      extractionMetadata: { generationStatus: "generating" },
    });

    // Before recovery: balance is 5000 - 1500 = 3500
    let bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(3500);

    // 1. Recover crashed batch -> Slide 2 is refunded (+1500), balance becomes 5000
    await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token" },
    });

    bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(5000);

    // 2. Resume batch with only_unprocessed: true
    // Slide 1 (completed) costs 0.
    // Slide 2 & Slide 3 will be processed and debited (2 * 1500 = 3000 Toman).
    const resumeRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/generate-all`,
      headers: { authorization: "Bearer token" },
      payload: { only_unprocessed: true },
    });

    expect(resumeRes.statusCode).toBe(202);

    // Wait for batch to complete
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Balance must be 5000 - 3000 = 2000
    bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(2000);

    // All 3 slides must now be completed
    const finalSlides = await slideStore.findByProjectId(project.id);
    for (const s of finalSlides) {
      expect(s.paymentTransactionId).toBeDefined();
      expect(s.paidAt).toBeDefined();
    }
  });

  it("New attempt after refund debits freshly (1,500 Toman) and succeeds", async () => {
    const { project, slides } = await createTestProjectWithSlides(1);
    const slide = slides[0];

    // 1st attempt: Gateway fails -> debited 1500 then refunded 1500
    gateway.shouldFail = true;
    await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
    });

    let bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(5000);

    // 2nd attempt: Gateway succeeds -> fresh debit of 1500
    gateway.shouldFail = false;
    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    bal = await walletService.getUserWallet(userId);
    expect(bal.balance).toBe(3500);

    const s = await slideStore.findById(slide.id, project.id);
    expect(s?.paidAt).toBeDefined();
    expect(s?.paymentTransactionId).toBeDefined();
  });
});

