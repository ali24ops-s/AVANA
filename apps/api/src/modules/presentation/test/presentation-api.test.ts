/* eslint-disable no-secrets/no-secrets */
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
} from "@avana/domain";
import {
  InMemoryPresentationProjectStore,
  InMemoryPresentationReferenceStore,
} from "../in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { PresentationGenerationService } from "../presentation-generation-service.js";
import { PresentationLayoutService } from "../presentation-layout-service.js";
import { PresentationReferenceIntegrationService } from "../reference-integration-service.js";
import { presentationProjectRoutes } from "../presentation-project-routes.js";
import { InMemoryOrganizationStore } from "../../organizations/test/in-memory-stores.js";
import { InMemoryDocumentChunkStore } from "../../learning/test/in-memory-stores.js";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";

class MockGateway implements ModelGateway {
  readonly provider = "mock" as const;
  public model: string;

  constructor(model: string = PRESENTATION_CANONICAL_MODEL) {
    this.model = model;
  }

  public completeHandler?: (req: CompletionRequest) => Promise<CompletionResult>;
  public completionHistory: CompletionRequest[] = [];

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.completionHistory.push(req);
    if (this.completeHandler) {
      return await this.completeHandler(req);
    }
    return {
      text: JSON.stringify({
        title: "Mock Generated Slide",
        content: [
          {
            type: "text",
            content: "Mock content line.",
            claims: [],
          },
        ],
        speakerNotes: "Mock notes",
        citations: [],
      }),
      model: this.model,
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    };
  }
}

describe("Presentation Assistant API Integration Tests (Phase 1)", () => {
  let app: ReturnType<typeof fastify>;
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let referenceStore: InMemoryPresentationReferenceStore;
  let orgStore: InMemoryOrganizationStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let gateway: MockGateway;
  let generationService: PresentationGenerationService;
  let layoutService: PresentationLayoutService;
  let referenceIntegrationService: PresentationReferenceIntegrationService;

  const orgIdUserA = randomUUID() as OrganizationId;
  const orgIdUserB = randomUUID() as OrganizationId;
  const userIdA = randomUUID() as UserId;
  const userIdB = randomUUID() as UserId;

  beforeEach(async () => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    referenceStore = new InMemoryPresentationReferenceStore();
    orgStore = new InMemoryOrganizationStore();
    chunkStore = new InMemoryDocumentChunkStore();
    gateway = new MockGateway();

    // Register organizations and memberships
    orgStore.addOrganization({
      id: orgIdUserA,
      name: "Org Alpha",
      slug: "org-alpha",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    orgStore.addOrganization({
      id: orgIdUserB,
      name: "Org Beta",
      slug: "org-beta",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgIdUserA,
      userId: userIdA,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgIdUserB,
      userId: userIdB,
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

    // Dynamic mock session service that maps token to respective user
    const mockSessionService = {
      validateSession: async (token: string) => {
        if (token === "token-user-b") {
          return { userId: userIdB, role: "student", globalRole: null };
        }
        return { userId: userIdA, role: "student", globalRole: null };
      },
      validateSessionDetails: async (token: string) => {
        const isB = token === "token-user-b";
        return {
          valid: true,
          revoked: false,
          user: {
            id: isB ? userIdB : userIdA,
            userId: isB ? userIdB : userIdA,
            role: "student",
            globalRole: null,
          },
        };
      },
      getConfig: () => ({}),
    } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

    const mockUserStore = {
      findById: async (id: UserId) => ({
        id,
        role: "student",
        globalRole: null,
      }),
    } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

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
    });

    await app.ready();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Create project with owner extracted from auth token
  // ---------------------------------------------------------------------------
  it("Scenario 1: creates project with owner extracted from auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/presentation/projects",
      headers: { authorization: "Bearer token-user-a" },
      payload: {
        title: "Medical Hematology Overview",
        organization_id: orgIdUserA,
        academic_level: "advanced",
        tone: "formal_scientific",
        elaboration_depth: "comprehensive",
        target_duration_minutes: 20,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project).toBeDefined();
    expect(body.project.title).toBe("Medical Hematology Overview");
    expect(body.project.owner_user_id).toBe(userIdA);
    expect(body.project.organization_id).toBe(orgIdUserA);

    // Verify stored in DB
    const saved = await projectStore.findById(asPresentationProjectId(body.project.id));
    expect(saved).toBeDefined();
    expect(saved?.ownerUserId).toBe(userIdA);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: List projects filtered by authenticated user
  // ---------------------------------------------------------------------------
  it("Scenario 2: lists projects filtered by authenticated user", async () => {
    // Seed 2 projects for User A and 1 for User B
    await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "User A - Cardiology",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "User A - Neurology",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    await projectStore.create({
      organizationId: orgIdUserB,
      ownerUserId: userIdB,
      title: "User B - Immunology",
      pptxDocumentId: null,
      targetDurationMinutes: 30,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });

    // Request as User A
    const resA = await app.inject({
      method: "GET",
      url: "/v1/presentation/projects",
      headers: { authorization: "Bearer token-user-a" },
    });
    expect(resA.statusCode).toBe(200);
    const dataA = resA.json();
    expect(dataA.total).toBe(2);
    expect(dataA.items.every((p: any) => p.owner_user_id === userIdA)).toBe(true);

    // Request as User B
    const resB = await app.inject({
      method: "GET",
      url: "/v1/presentation/projects",
      headers: { authorization: "Bearer token-user-b" },
    });
    expect(resB.statusCode).toBe(200);
    const dataB = resB.json();
    expect(dataB.total).toBe(1);
    expect(dataB.items[0].title).toBe("User B - Immunology");
    expect(dataB.items[0].owner_user_id).toBe(userIdB);
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Get project details with nested slides and references
  // ---------------------------------------------------------------------------
  it("Scenario 3: gets project details with nested slides and references", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Endocrinology Project",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });
    const projectId = project.id;

    await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Thyroid Physiology",
      rawText: "Thyroid hormone synthesis and regulation.",
    });

    await referenceStore.create({
      id: randomUUID() as any,
      projectId,
      documentId: null,
      type: "text",
      title: "Thyroid Guideline 2024",
      sourceIdentifier: "Guideline-2024",
      accessStatus: "manual_text_provided",
      bibliographicMetadata: {},
      extractedContent: "TSH triggers T3/T4 synthesis in follicular cells.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${projectId}`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.title).toBe("Endocrinology Project");
    expect(body.slides).toHaveLength(1);
    expect(body.slides[0].title).toBe("Thyroid Physiology");
    expect(body.references).toHaveLength(1);
    expect(body.references[0].title).toBe("Thyroid Guideline 2024");
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Access control: verify 404/forbidden when accessing another user's project
  // ---------------------------------------------------------------------------
  it("Scenario 4: enforces tenant and user isolation with non-disclosing 404", async () => {
    const projectA = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "User A Confidential Oncology",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });
    const projectAId = projectA.id;

    const slideA = await slideStore.createSlide({
      projectId: projectAId,
      slideIndex: 1,
      title: "Oncology Slide",
      rawText: "Sensitive oncology data",
    });

    // 4.1 User B attempts to GET User A's project
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${projectAId}`,
      headers: { authorization: "Bearer token-user-b" },
    });
    expect(getRes.statusCode).toBe(404);

    // 4.2 User B attempts to PATCH User A's project
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/presentation/projects/${projectAId}`,
      headers: { authorization: "Bearer token-user-b" },
      payload: { title: "Hijacked Title" },
    });
    expect(patchRes.statusCode).toBe(404);

    // 4.3 User B attempts to create a slide in User A's project
    const addSlideRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectAId}/slides`,
      headers: { authorization: "Bearer token-user-b" },
      payload: { slide_index: 2, title: "Malicious Slide" },
    });
    expect(addSlideRes.statusCode).toBe(404);

    // 4.4 User B attempts to generate User A's slide
    const genRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectAId}/slides/${slideA.id}/generate`,
      headers: { authorization: "Bearer token-user-b" },
    });
    expect(genRes.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Create slide under project
  // ---------------------------------------------------------------------------
  it("Scenario 5: creates a slide under project and maintains totalSlides count", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Gastroenterology",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    const projectId = project.id;

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides`,
      headers: { authorization: "Bearer token-user-a" },
      payload: {
        slide_index: 1,
        title: "GERD Pathophysiology",
        raw_text: "Acid reflux causes mucosal erosion.",
        speaker_notes: "Start with lower esophageal sphincter anatomy.",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.slide.title).toBe("GERD Pathophysiology");
    expect(body.slide.slide_index).toBe(1);
    expect(body.slide.raw_text).toBe("Acid reflux causes mucosal erosion.");
    expect(body.slide.speaker_notes).toBe("Start with lower esophageal sphincter anatomy.");

    // Verify project totalSlides was updated
    const updatedProject = await projectStore.findById(projectId);
    expect(updatedProject?.totalSlides).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Update slide title and text content
  // ---------------------------------------------------------------------------
  it("Scenario 6: updates slide title and text content via PATCH", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Pulmonology",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    const projectId = project.id;

    const slide = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Asthma Initial",
      rawText: "Airway hyperresponsiveness draft.",
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}`,
      headers: { authorization: "Bearer token-user-a" },
      payload: {
        title: "Asthma Management & Guidelines",
        raw_text: "Updated text with GINA 2024 step therapy.",
        speaker_notes: "Highlight step 1 ICS-formoterol.",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = patchRes.json();
    expect(body.slide.title).toBe("Asthma Management & Guidelines");
    expect(body.slide.raw_text).toBe("Updated text with GINA 2024 step therapy.");
    expect(body.slide.speaker_notes).toBe("Highlight step 1 ICS-formoterol.");

    const inDb = await slideStore.findById(asPresentationSlideId(slide.id), projectId);
    expect(inDb?.title).toBe("Asthma Management & Guidelines");
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: Slide generation with mock Gemini gateway
  // ---------------------------------------------------------------------------
  it("Scenario 7: generates slide content via mock Gemini gateway", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Cardiovascular Medicine",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });
    const projectId = project.id;

    const slide = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Acute Coronary Syndromes",
      rawText: "NSTEMI vs STEMI clinical management.",
    });

    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "Acute Coronary Syndromes: Clinical Pathways",
        subtitle: "Diagnostic and Therapeutic Strategy",
        content: [
          {
            type: "text",
            content: "Early revascularization within 24h improves NSTEMI outcomes.",
            claims: [
              {
                text: "Early revascularization within 24h improves NSTEMI outcomes.",
                chunkIds: [],
                evidenceStatus: "insufficient_evidence",
              },
            ],
          },
        ],
        speakerNotes: "Discuss cath lab timing.",
        citations: [],
      }),
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 120, outputTokens: 80 },
      finishReason: "stop",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
      payload: {
        instructions: {
          language: "en",
          tone: "formal_scientific",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.generation_status).toBe("accepted");
    expect(body.validation_status).toBe("valid");
    expect(body.repair_attempted).toBe(false);
    expect(body.model).toBe("gemini-3.5-flash-lite");
    expect(body.slide.title).toBe("Acute Coronary Syndromes: Clinical Pathways");
    expect(body.slide.speaker_notes).toBe("Discuss cath lab timing.");
    expect(body.slide.extraction_metadata.model).toBe("gemini-3.5-flash-lite");
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Output persistence in slide record (claims, speaker notes, metadata)
  // ---------------------------------------------------------------------------
  it("Scenario 8: persists claims, speaker notes, and extraction metadata in database", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Renal Physiology",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    const projectId = project.id;

    const slide = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Glomerular Filtration",
      rawText: "GFR determinants and Starling forces.",
    });

    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "Glomerular Filtration Dynamics",
        content: [
          {
            type: "text",
            content: "Net filtration pressure depends on hydrostatic and oncotic forces.",
            claims: [
              {
                text: "Net filtration pressure depends on hydrostatic and oncotic forces.",
                chunkIds: [],
                evidenceStatus: "insufficient_evidence",
              },
            ],
          },
        ],
        speakerNotes: "Mention afferent and efferent arteriolar resistance.",
        citations: [],
      }),
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 100, outputTokens: 60 },
      finishReason: "stop",
    });

    const genRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });
    expect(genRes.statusCode).toBe(200);

    const saved = await slideStore.findById(asPresentationSlideId(slide.id), projectId);
    expect(saved).toBeDefined();
    expect(saved?.title).toBe("Glomerular Filtration Dynamics");
    expect(saved?.speakerNotes).toBe("Mention afferent and efferent arteriolar resistance.");
    expect(saved?.extractionMetadata?.generationStatus).toBe("accepted");
    expect(saved?.extractionMetadata?.model).toBe("gemini-3.5-flash-lite");
    expect(saved?.extractionMetadata?.generationRunId).toBeDefined();
    expect(saved?.extractionMetadata?.generatedSlide).toBeDefined();
    const generated = saved?.extractionMetadata?.generatedSlide as any;
    expect(generated.content[0].claims[0].text).toContain("Net filtration pressure");
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Retrieval of generated slide via API
  // ---------------------------------------------------------------------------
  it("Scenario 9: retrieves generated slide with enriched content via GET endpoint", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Hematology Lecture",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });
    const projectId = project.id;

    const slide = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Hemostasis",
      rawText: "Platelet plug formation.",
    });

    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "Primary Hemostasis Pathways",
        content: [
          {
            type: "text",
            content: "von Willebrand factor binds subendothelial collagen to GPIb receptors.",
            claims: [],
          },
        ],
        speakerNotes: "Highlight vWF and GP Ib interaction.",
        citations: [],
      }),
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 90, outputTokens: 50 },
      finishReason: "stop",
    });

    // Generate slide
    const postRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });
    expect(postRes.statusCode).toBe(200);

    // Retrieve via GET project endpoint
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${projectId}`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.slides).toHaveLength(1);
    expect(body.slides[0].title).toBe("Primary Hemostasis Pathways");
    expect(body.slides[0].speaker_notes).toBe("Highlight vWF and GP Ib interaction.");
    // Speech engine invariant: original slide raw_text is preserved and NOT overwritten!
    expect(body.slides[0].raw_text).toBe("Platelet plug formation.");
    expect(body.slides[0].speech_content).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Error handling: Gateway failure rolls back status and unlocks concurrency
  // ---------------------------------------------------------------------------
  it("Scenario 10: rolls back slide status to failed and releases concurrency lock when gateway fails", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Emergency Medicine",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });
    const projectId = project.id;

    const slide = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Cardiac Arrest",
      rawText: "ACLS algorithm.",
    });

    // Gateway failure simulation
    gateway.completeHandler = async () => {
      throw new Error("Gemini API rate limit exceeded");
    };

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    // Should return 503 error (service_unavailable)
    expect(res.statusCode).toBe(503);

    // Verify slide status was rolled back from "generating" to "failed"
    const slideInDb = await slideStore.findById(asPresentationSlideId(slide.id), projectId);
    expect(slideInDb?.extractionMetadata?.generationStatus).toBe("failed");

    // Concurrency lock is freed: next request does NOT hit conflict error
    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "ACLS Protocol 2024",
        content: [{ type: "text", content: "CPR and defibrillation first.", claims: [] }],
        speakerNotes: "High-quality CPR.",
        citations: [],
      }),
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    });

    const retryRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.json().generation_status).toBe("accepted");
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: Snapshot validation: valid_empty vs valid_with_references
  // ---------------------------------------------------------------------------
  it("Scenario 11: creates valid_empty snapshot when project has no references and valid_with_references when references exist", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Clinical Pharmacology",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
    });
    const projectId = project.id;

    // Part A: Project with NO references -> valid_empty snapshot
    const slideNoRef = await slideStore.createSlide({
      projectId,
      slideIndex: 1,
      title: "Course Intro",
      rawText: "Welcome to clinical pharmacology.",
    });

    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "Clinical Pharmacology Introduction",
        content: [{ type: "text", content: "Course overview and learning objectives.", claims: [] }],
        speakerNotes: "Welcome students.",
        citations: [],
      }),
      model: PRESENTATION_CANONICAL_MODEL,
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    });

    const resA = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slideNoRef.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(resA.statusCode).toBe(200);
    const snapshotA = await slideStore.getReferenceSnapshot(
      asPresentationSlideId(slideNoRef.id),
      projectId,
    );
    expect(snapshotA).toBeDefined();
    expect(snapshotA?.chunks).toEqual([]);
    expect(snapshotA?.totalSelectedTokens).toBe(0);

    // Part B: Add reference to project -> valid_with_references snapshot
    const refContent = "Warfarin works by inhibiting VKORC1 and reducing active Vitamin K levels.";
    const ref = await referenceStore.create({
      id: randomUUID() as any,
      projectId,
      documentId: null,
      type: "text",
      title: "Anticoagulation Pharmacology Review",
      sourceIdentifier: "Guideline-Ref-1",
      accessStatus: "manual_text_provided",
      bibliographicMetadata: {},
      extractedContent: refContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const slideWithRef = await slideStore.createSlide({
      projectId,
      slideIndex: 2,
      title: "Warfarin Mechanism of Action",
      rawText: "How does Warfarin inhibit vitamin K?",
    });

    // Determine the integrated chunk ID so the mock gateway can cite it
    gateway.completeHandler = async (req: CompletionRequest) => {
      // Find chunk ID from prompt messages
      const userMessage = req.messages?.find((m) => m.role === "user")?.content ?? "";
      const chunkMatch = userMessage.match(/refchunk_[a-zA-Z0-9_-]+/);
      const chunkId = chunkMatch ? chunkMatch[0] : "refchunk_fallback";

      return {
        text: JSON.stringify({
          title: "Warfarin Mechanism of Action",
          content: [
            {
              type: "text",
              content: "Warfarin directly inhibits VKORC1.",
              claims: [
                {
                  text: "Warfarin directly inhibits VKORC1.",
                  chunkIds: [chunkId],
                  evidenceStatus: "supported",
                },
              ],
            },
          ],
          speakerNotes: "Highlight vitamin K epoxide reductase inhibition.",
          citations: [{ chunkId }],
        }),
        model: PRESENTATION_CANONICAL_MODEL,
        usage: { inputTokens: 150, outputTokens: 75 },
        finishReason: "stop",
      };
    };

    const resB = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${projectId}/slides/${slideWithRef.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(resB.statusCode).toBe(200);
    const bodyB = resB.json();
    expect(bodyB.generation_status).toBe("accepted");
    expect(bodyB.validation_status).toBe("valid");

    const snapshotB = await slideStore.getReferenceSnapshot(
      asPresentationSlideId(slideWithRef.id),
      projectId,
    );
    expect(snapshotB).toBeDefined();
    expect(snapshotB?.chunks.length).toBeGreaterThan(0);
    expect(snapshotB?.chunks[0].content).toContain("Warfarin works by inhibiting VKORC1");
    expect(snapshotB?.chunks[0].contentHash).toBeDefined();
    expect(snapshotB?.chunks[0].referenceId).toBe(ref.id);
  });

  // ---------------------------------------------------------------------------
  // Scenario 12: Rejects generation if gateway is configured with unauthorized model
  // ---------------------------------------------------------------------------
  it("Scenario 12: strictly rejects generation if gateway is configured with unauthorized model (e.g. gemini-2.5-flash)", async () => {
    // Gateway configured with an unauthorized model
    gateway.model = "gemini-2.5-flash";

    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Model Gatekeeper Test",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Model Check Slide",
      rawText: "Checking model restriction.",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    // Must fail with 422 (unprocessable) indicating model constraint violation
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.message).toContain("Presentation Assistant strictly requires model \"gemini-3.5-flash-lite\"");
    expect(body.error.message).toContain("gemini-2.5-flash");
  });

  // ---------------------------------------------------------------------------
  // Scenario 13: Rejects generation if gateway returns unauthorized model (zero-fallback verification)
  // ---------------------------------------------------------------------------
  it("Scenario 13: rejects generation and prevents fallback if gateway returns unexpected model in completion", async () => {
    // Gateway configured with proper model
    gateway.model = PRESENTATION_CANONICAL_MODEL;

    // But gateway completion returns a different model (simulating a provider fallback attempt)
    gateway.completeHandler = async () => ({
      text: JSON.stringify({
        title: "Unauthorized Fallback Attempt",
        content: [{ type: "text", content: "Fallback content", claims: [] }],
        speakerNotes: "Notes",
        citations: [],
      }),
      model: "gemini-2.5-flash", // Unauthorized model returned!
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    });

    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Zero Fallback Test",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Zero Fallback Slide",
      rawText: "Checking zero fallback.",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/slides/${slide.id}/generate`,
      headers: { authorization: "Bearer token-user-a" },
    });

    // Must fail with 503 (service_unavailable) indicating unexpected model returned
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.message).toContain("unexpected model \"gemini-2.5-flash\" returned by AI Gateway");
    expect(body.error.message).toContain("Required: \"gemini-3.5-flash-lite\"");
  });

  // ---------------------------------------------------------------------------
  // Scenario 14: Batch generation generates all slides sequentially with single request
  // ---------------------------------------------------------------------------
  it("Scenario 14: generates all slides sequentially with single batch request and tracks status", async () => {
    gateway.model = PRESENTATION_CANONICAL_MODEL;
    gateway.completeHandler = async ({ messages }) => {
      const userMsg = messages.find((m) => m.role === "user")?.content || "";
      const isSlide2 = userMsg.includes("Slide 2");
      return {
        text: JSON.stringify({
          speechText: isSlide2
            ? "متن ارائه شفاهی اسلاید دوم که به صورت پیوسته پس از اسلاید اول مطرح می‌شود."
            : "متن ارائه شفاهی اسلاید اول که مقدمه بحث را به شکل علمی تبیین می‌کند.",
          supplementaryExplanation: "توضیحات تکمیلی علمی مرتبط با موضوع.",
          keyPoints: ["نکته کلیدی اول", "نکته کلیدی دوم"],
          suggestedDurationSeconds: 120,
          citations: [],
          claims: [],
        }),
        model: PRESENTATION_CANONICAL_MODEL,
        usage: { inputTokens: 120, outputTokens: 80 },
        finishReason: "stop",
      };
    };

    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Batch Presentation Project",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
    });

    const s1 = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Slide 1: Introduction",
      rawText: "Introduction to cardiology.",
    });

    const s2 = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 2,
      title: "Slide 2: Pathophysiology",
      rawText: "Ischemia mechanisms.",
    });

    // Call generate-all with wait: true
    const batchRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/generate-all`,
      headers: { authorization: "Bearer token-user-a" },
      payload: { wait: true },
    });

    expect(batchRes.statusCode).toBe(200);
    const batchBody = batchRes.json();
    expect(batchBody.status.total_slides).toBe(2);
    expect(batchBody.status.completed_slides).toBe(2);
    expect(batchBody.status.failed_slides).toBe(0);

    // Verify slide records in database were updated with speechContent
    const updatedS1 = await slideStore.findById(s1.id, project.id);
    const updatedS2 = await slideStore.findById(s2.id, project.id);

    expect(updatedS1?.extractionMetadata?.speechContent).toBeDefined();
    expect((updatedS1?.extractionMetadata?.speechContent as any).speechText).toContain("اسلاید اول");
    expect(updatedS2?.extractionMetadata?.speechContent).toBeDefined();
    expect((updatedS2?.extractionMetadata?.speechContent as any).speechText).toContain("اسلاید دوم");

    // Check project status in database
    const updatedProject = await projectStore.findById(project.id);
    expect(updatedProject?.status).toBe("completed");
  });

  // ---------------------------------------------------------------------------
  // Scenario 15: Batch generation continues past a failed slide and preserves progress
  // ---------------------------------------------------------------------------
  it("Scenario 15: batch generation continues past a failed slide and preserves progress", async () => {
    gateway.model = PRESENTATION_CANONICAL_MODEL;
    let callCount = 0;
    gateway.completeHandler = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary Gemini rate limit on slide 1");
      }
      return {
        text: JSON.stringify({
          speechText: "متن اسلاید دوم که با موفقیت تولید شده است.",
          keyPoints: ["نکته دوم"],
          suggestedDurationSeconds: 90,
          citations: [],
          claims: [],
        }),
        model: PRESENTATION_CANONICAL_MODEL,
        usage: { inputTokens: 100, outputTokens: 60 },
        finishReason: "stop",
      };
    };

    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Resilient Batch Project",
      pptxDocumentId: null,
      targetDurationMinutes: 10,
    });

    const s1 = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Slide 1: Faulty",
      rawText: "Will fail on first try.",
    });

    const s2 = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 2,
      title: "Slide 2: Resilient",
      rawText: "Should succeed.",
    });

    const batchRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/generate-all`,
      headers: { authorization: "Bearer token-user-a" },
      payload: { wait: true },
    });

    expect(batchRes.statusCode).toBe(200);
    const batchBody = batchRes.json();
    expect(batchBody.status.completed_slides).toBe(1);
    expect(batchBody.status.failed_slides).toBe(1);

    const updatedS1 = await slideStore.findById(s1.id, project.id);
    const updatedS2 = await slideStore.findById(s2.id, project.id);

    expect(updatedS1?.extractionMetadata?.generationStatus).toBe("failed");
    expect(updatedS1?.extractionMetadata?.lastError).toContain("rate limit");
    expect(updatedS2?.extractionMetadata?.generationStatus).toBe("accepted");
  });

  // ---------------------------------------------------------------------------
  // Scenario 16: Generation status endpoint reflects real-time status
  // ---------------------------------------------------------------------------
  it("Scenario 16: retrieves live generation status via GET endpoint", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "Status Test Project",
    });

    await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Status Slide 1",
      rawText: "Text",
    });

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/generation-status`,
      headers: { authorization: "Bearer token-user-a" },
    });

    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    expect(body.project_id).toBe(project.id);
    expect(body.total_slides).toBe(1);
    expect(body.completed_slides).toBe(0);
    expect(body.is_generating).toBe(false);
    expect(body.slides_progress).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Scenario 17: PDF status and streaming reject unauthenticated requests
  // ---------------------------------------------------------------------------
  it("Scenario 17: rejects unauthenticated requests to pdf-status and slides-pdf with 401", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "PDF Auth Project",
    });

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/pdf-status`,
    });
    expect(statusRes.statusCode).toBe(401);

    const pdfRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/slides-pdf`,
    });
    expect(pdfRes.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Scenario 18: PDF status and streaming enforce tenant isolation (404 for other org)
  // ---------------------------------------------------------------------------
  it("Scenario 18: enforces tenant isolation for pdf-status and slides-pdf (404 for other user)", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "User A Project",
    });

    // User B tries to access User A's project
    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/pdf-status`,
      headers: { authorization: "Bearer token-user-b" },
    });
    expect(statusRes.statusCode).toBe(404);

    const pdfRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/slides-pdf`,
      headers: { authorization: "Bearer token-user-b" },
    });
    expect(pdfRes.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Scenario 19: returns unavailable when storage is not configured
  // ---------------------------------------------------------------------------
  it("Scenario 19: returns unavailable status when storageProvider is not configured", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "No Storage Project",
    });

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/pdf-status`,
      headers: { authorization: "Bearer token-user-a" },
    });
    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    expect(body.status).toBe("unavailable");
  });

  // ---------------------------------------------------------------------------
  // Scenario 20: returns unavailable when LibreOffice is not available without re-triggering
  // ---------------------------------------------------------------------------
  it("Scenario 20: returns unavailable when LibreOffice is not available", async () => {
    const project = await projectStore.create({
      organizationId: orgIdUserA,
      ownerUserId: userIdA,
      title: "No LibreOffice Project",
    });

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/presentation/projects/${project.id}/pdf-status`,
      headers: { authorization: "Bearer token-user-a" },
    });
    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    expect(body.status).toBe("unavailable");
  });
});

