import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  type Actor,
  type CompletionRequest,
  type CompletionResult,
  type GeneratedPresentationSlide,
  type ModelGateway,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationReferenceId,
  type PresentationSlideId,
  type SlideReferenceContextSnapshot,
  type UUID,
  asOrganizationId,
  asPresentationProjectId,
  asPresentationReferenceId,
  asUserId,
  DomainError,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { InMemoryPresentationProjectStore } from "../in-memory-presentation-store.js";
import { ServerCitationValidator } from "../server-citation-validator.js";
import { PresentationPromptBuilder } from "../presentation-prompt-builder.js";
import {
  validateGeneratedSlideSchema,
  extractAllSlideChunkIds,
} from "../presentation-generation-schema.js";
import { PresentationGenerationService } from "../presentation-generation-service.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

class MockGateway implements ModelGateway {
  readonly provider = "mock" as const;
  readonly model = "gemini-3.5-flash-lite";

  public completeHandler?: (req: CompletionRequest) => Promise<CompletionResult>;
  public completionHistory: CompletionRequest[] = [];

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.completionHistory.push(req);
    if (this.completeHandler) {
      return await this.completeHandler(req);
    }
    return {
      text: "{}",
      model: this.model,
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    };
  }
}

describe("Presentation Slide Generation & Gemini Citation Grounding (Phase 2A-2.3c)", () => {
  let slideStore: InMemoryPresentationSlideStore;
  let projectStore: InMemoryPresentationProjectStore;
  let orgStore: OrganizationStore;
  let gateway: MockGateway;
  let service: PresentationGenerationService;

  let testOrgId: OrganizationId;
  let testUserId: Actor["userId"];
  let testActor: Actor;
  let testProjectId: PresentationProjectId;
  let testSlideId: PresentationSlideId;
  let testRefId: PresentationReferenceId;

  const validChunk1Id = "refchunk_ref1_0_abcd1234";
  const validChunk1Content = "Warfarin is an anticoagulant that inhibits vitamin K epoxide reductase.";
  const validChunk1Hash = createHash("sha256").update(validChunk1Content, "utf8").digest("hex");

  const validChunk2Id = "refchunk_ref1_1_efgh5678";
  const validChunk2Content = "Target INR for non-valvular atrial fibrillation is generally 2.0 to 3.0.";
  const validChunk2Hash = createHash("sha256").update(validChunk2Content, "utf8").digest("hex");

  beforeEach(async () => {
    slideStore = new InMemoryPresentationSlideStore();
    projectStore = new InMemoryPresentationProjectStore();
    gateway = new MockGateway();

    testOrgId = asOrganizationId(randomUUID() as UUID);
    testUserId = asUserId(randomUUID() as UUID);
    testActor = {
      userId: testUserId,
      role: "organization_admin",
      globalRole: null,
    };

    orgStore = {
      listMembershipsByUserId: vi.fn().mockResolvedValue([
        { organizationId: testOrgId, role: "organization_admin" },
      ]),
      findMembership: vi.fn(),
      findById: vi.fn(),
      findRoleInOrganization: vi.fn(),
      getBillingPlan: vi.fn(),
    } as unknown as OrganizationStore;

    testProjectId = asPresentationProjectId(randomUUID() as UUID);
    projectStore.seed({
      id: testProjectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Clinical Anticoagulation Guidelines",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "advanced",
      tone: "formal_scientific",
      elaborationDepth: "comprehensive",
      status: "created",
      currentStage: null,
      totalSlides: 10,
      overallIntroduction: null,
      overallConclusion: null,
      totalEstimatedSeconds: 900,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    testRefId = asPresentationReferenceId(randomUUID() as UUID);

    const slide = await slideStore.createSlide({
      projectId: testProjectId,
      slideIndex: 1,
      title: "Warfarin Mechanism and Dosing",
      rawText: "Initial draft text on Warfarin.",
      speakerNotes: "Explain VKORC1 inhibition.",
    });
    testSlideId = slide.id;

    service = new PresentationGenerationService({
      projectStore,
      slideStore,
      organizationStore: orgStore,
      gateway,
    });
  });

  // Helper to attach snapshot
  async function attachSnapshot(chunks: Array<{ chunkId: string; content: string; contentHash: string }>) {
    const snapshot: SlideReferenceContextSnapshot = {
      schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
      generationRunId: randomUUID(),
      selectorVersion: "heuristic-lexical-v1",
      selectedAt: new Date().toISOString(),
      projectId: testProjectId,
      slideIndex: 1,
      totalSelectedTokens: 120,
      chunks: chunks.map((c, i) => ({
        chunkId: c.chunkId,
        referenceId: testRefId,
        sourceType: "pdf",
        sourceTitle: "Chest 2024 Antithrombotic Guidelines",
        citationLabel: `[${i + 1}] Chest (2024)`,
        sourceLocation: {
          startPage: 10 + i,
          endPage: 11 + i,
          slideIndex: null,
          confidence: "exact",
        },
        contentHash: c.contentHash,
        content: c.content,
        selectionScore: 0.9,
        selectionReasons: ["Key match"],
        rank: i + 1,
      })),
    };
    await slideStore.saveReferenceSnapshot(testSlideId, testProjectId, snapshot);
    return snapshot;
  }

  // -------------------------------------------------------------------------
  // 1. Generation Prompt Builder Tests
  // -------------------------------------------------------------------------
  describe("1. Generation Prompt Builder", () => {
    it("builds structured prompt with multiple approved reference chunks", async () => {
      const snapshot = await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
        { chunkId: validChunk2Id, content: validChunk2Content, contentHash: validChunk2Hash },
      ]);
      const project = (await projectStore.findById(testProjectId))!;
      const slide = (await slideStore.findById(testSlideId, testProjectId))!;

      const result = PresentationPromptBuilder.buildSlidePrompt({
        project,
        slide,
        snapshot,
        instructions: { language: "fa" },
      });

      expect(result.promptVersion).toBe("2026-11-presentation-v1");
      expect(result.userPrompt).toContain(validChunk1Id);
      expect(result.userPrompt).toContain(validChunk2Id);
      expect(result.userPrompt).toContain("Warfarin Mechanism and Dosing");
      expect(result.userPrompt).toContain(validChunk1Content);
      expect(result.userPrompt).toContain("=== STRICT CITATION & GROUNDING RULES ===");
      expect(result.userPrompt).toContain("فارسی");
    });

    it("builds clean zero-source prompt for intro/conclusion slides with empty snapshot", async () => {
      const snapshot = await attachSnapshot([]);
      const project = (await projectStore.findById(testProjectId))!;
      const slide = (await slideStore.findById(testSlideId, testProjectId))!;

      const result = PresentationPromptBuilder.buildSlidePrompt({
        project,
        slide,
        snapshot,
        instructions: { language: "en" },
      });

      expect(result.userPrompt).toContain("[NO EXTERNAL REFERENCE CHUNKS SELECTED FOR THIS SLIDE]");
      expect(result.userPrompt).toContain("Citations array must be empty []");
      expect(result.userPrompt).toContain("All text, title, claims, and speaker notes must be in clear academic English.");
    });

    it("builds targeted repair prompt listing specific invalid citations and explicit allowlist", async () => {
      const snapshot = await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      const faultySlide: GeneratedPresentationSlide = {
        title: "Faulty Slide",
        content: [
          {
            type: "text",
            content: "Claim with fake chunk.",
            claims: [
              {
                text: "Fake claim",
                chunkIds: ["fake-chunk-999"],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "Notes",
        citations: [{ chunkId: "fake-chunk-999" }],
      };

      const repairPrompt = PresentationPromptBuilder.buildRepairPrompt({
        slide: faultySlide,
        snapshot,
        validation: {
          valid: false,
          status: "chunk_not_in_slide_context",
          slideIndex: 1,
          projectId: testProjectId,
          evaluatedCitations: [
            {
              chunkId: "fake-chunk-999",
              status: "chunk_not_in_slide_context",
              detail: "Chunk fake-chunk-999 not in snapshot.",
            },
          ],
          validCount: 0,
          invalidCount: 1,
        },
        language: "fa",
      });

      expect(repairPrompt.promptVersion).toBe("2026-11-presentation-repair-v1");
      expect(repairPrompt.userPrompt).toContain("STRICT ALLOWLIST OF VALID CHUNK IDS");
      expect(repairPrompt.userPrompt).toContain(validChunk1Id);
      expect(repairPrompt.userPrompt).toContain("fake-chunk-999");
      expect(repairPrompt.userPrompt).toContain("DO NOT silently delete claims");
      expect(repairPrompt.userPrompt).toContain("insufficient_evidence");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Structured Output Schema Validation Tests
  // -------------------------------------------------------------------------
  describe("2. Structured Output Schema Validation", () => {
    it("parses and validates standard JSON conforming to GeneratedPresentationSlide", () => {
      const rawJson = JSON.stringify({
        title: "Mechanism of Action",
        subtitle: "Pharmacological Basis",
        content: [
          {
            type: "text",
            content: "Warfarin inhibits vitamin K epoxide reductase complex 1 (VKORC1).",
            claims: [
              {
                text: "Warfarin inhibits VKORC1.",
                chunkIds: [validChunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "Highlight competitive inhibition of VKORC1.",
        citations: [{ chunkId: validChunk1Id }],
      });

      const parsed = validateGeneratedSlideSchema(rawJson);
      expect(parsed.title).toBe("Mechanism of Action");
      expect(parsed.content).toHaveLength(1);
      expect(parsed.content[0].claims[0].chunkIds).toEqual([validChunk1Id]);
      expect(parsed.citations).toEqual([{ chunkId: validChunk1Id, referenceId: undefined }]);
    });

    it("strips markdown code fences if model wraps JSON response", () => {
      const fenced = "```json\n" + JSON.stringify({
        title: "Fenced Slide",
        content: [{ type: "text", content: "Body", claims: [] }],
        speakerNotes: "Notes",
        citations: [],
      }) + "\n```";

      const parsed = validateGeneratedSlideSchema(fenced);
      expect(parsed.title).toBe("Fenced Slide");
    });

    it("rejects incomplete output missing title or content", () => {
      expect(() =>
        validateGeneratedSlideSchema({ content: [], speakerNotes: "Notes", citations: [] }),
      ).toThrow(DomainError);

      expect(() =>
        validateGeneratedSlideSchema({ title: "No content", content: [], speakerNotes: "Notes", citations: [] }),
      ).toThrow(DomainError);
    });

    it("rejects invalid evidenceStatus or malformed claim objects", () => {
      expect(() =>
        validateGeneratedSlideSchema({
          title: "Invalid Evidence Status",
          content: [
            {
              type: "text",
              content: "Text",
              claims: [
                {
                  text: "Invalid",
                  chunkIds: [],
                  evidenceStatus: "unknown_status",
                },
              ],
            },
          ],
          speakerNotes: "Notes",
          citations: [],
        }),
      ).toThrow(DomainError);
    });

    it("extracts all unique chunkIds across claims and citations", () => {
      const slide: GeneratedPresentationSlide = {
        title: "Title",
        content: [
          {
            type: "text",
            content: "Text",
            claims: [
              { text: "C1", chunkIds: ["chunk-a", "chunk-b"], evidenceStatus: "supported" },
              { text: "C2", chunkIds: ["chunk-b"], evidenceStatus: "supported" },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: "chunk-a" }, { chunkId: "chunk-c" }],
      };

      const extracted = extractAllSlideChunkIds(slide);
      expect(extracted.claimChunkIds).toEqual(["chunk-a", "chunk-b", "chunk-b"]);
      expect(extracted.citationChunkIds).toEqual(["chunk-a", "chunk-c"]);
      expect(extracted.allUniqueChunkIds.sort()).toEqual(["chunk-a", "chunk-b", "chunk-c"].sort());
    });
  });

  // -------------------------------------------------------------------------
  // 3. Citation Integrity & Server Validation Tests
  // -------------------------------------------------------------------------
  describe("3. Citation Integrity & Server Validation", () => {
    it("validates legitimate citation and injects authoritative referenceId from snapshot", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      const slide: GeneratedPresentationSlide = {
        title: "Anticoagulation",
        content: [
          {
            type: "text",
            content: "Warfarin acts via VKORC1.",
            claims: [
              {
                text: "Warfarin acts via VKORC1.",
                chunkIds: [validChunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "Speaker notes.",
        citations: [{ chunkId: validChunk1Id, referenceId: "fake-model-ref-id" }],
      };

      const validator = new ServerCitationValidator({ slideStore, projectStore });
      const result = await validator.validateFullGeneratedSlide({
        projectId: testProjectId,
        slideId: testSlideId,
        slide,
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      // Must overwrite model's fake referenceId with authoritative referenceId from snapshot!
      expect(result.authoritativeSlide?.citations[0].referenceId).toBe(testRefId);
    });

    it("rejects claim marked supported without citation (unsupported_claim_missing_citation)", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      const slide: GeneratedPresentationSlide = {
        title: "Unsupported Claim",
        content: [
          {
            type: "text",
            content: "Claim claiming support without chunkId.",
            claims: [
              {
                text: "Unsupported assertion",
                chunkIds: [],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [],
      };

      const validator = new ServerCitationValidator({ slideStore, projectStore });
      const result = await validator.validateFullGeneratedSlide({
        projectId: testProjectId,
        slideId: testSlideId,
        slide,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("unsupported_claim_missing_citation");
    });

    it("rejects extra unused citations in citations array (unused_extra_citation)", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
        { chunkId: validChunk2Id, content: validChunk2Content, contentHash: validChunk2Hash },
      ]);

      const slide: GeneratedPresentationSlide = {
        title: "Extra Citation Slide",
        content: [
          {
            type: "text",
            content: "Only chunk 1 is used.",
            claims: [
              {
                text: "Claim referencing chunk 1",
                chunkIds: [validChunk1Id],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [
          { chunkId: validChunk1Id },
          { chunkId: validChunk2Id }, // Extra unused citation!
        ],
      };

      const validator = new ServerCitationValidator({ slideStore, projectStore });
      const result = await validator.validateFullGeneratedSlide({
        projectId: testProjectId,
        slideId: testSlideId,
        slide,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("unused_extra_citation");
    });

    it("rejects hallucinated chunkId outside of snapshot (chunk_not_in_slide_context)", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      const slide: GeneratedPresentationSlide = {
        title: "Hallucinated Chunk",
        content: [
          {
            type: "text",
            content: "Hallucinated assertion.",
            claims: [
              {
                text: "Claim",
                chunkIds: ["refchunk_foreign_99_00000000"],
                evidenceStatus: "supported",
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: "refchunk_foreign_99_00000000" }],
      };

      const validator = new ServerCitationValidator({ slideStore, projectStore });
      const result = await validator.validateFullGeneratedSlide({
        projectId: testProjectId,
        slideId: testSlideId,
        slide,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("chunk_not_in_slide_context");
    });

    it("rejects claim with insufficient_evidence that includes chunk citations (claim_citation_mismatch)", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      const slide: GeneratedPresentationSlide = {
        title: "Contradictory Claim",
        content: [
          {
            type: "text",
            content: "Contradictory claim text.",
            claims: [
              {
                text: "Contradictory claim",
                chunkIds: [validChunk1Id],
                evidenceStatus: "insufficient_evidence", // Contradiction: insufficient_evidence with chunkIds
              },
            ],
          },
        ],
        speakerNotes: "",
        citations: [{ chunkId: validChunk1Id }],
      };

      const validator = new ServerCitationValidator({ slideStore, projectStore });
      const result = await validator.validateFullGeneratedSlide({
        projectId: testProjectId,
        slideId: testSlideId,
        slide,
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("claim_citation_mismatch");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Snapshot State Pre-condition Tests
  // -------------------------------------------------------------------------
  describe("4. Snapshot State Validation (4 States)", () => {
    it("distinguishes all 4 snapshot states cleanly", () => {
      // 1. Missing snapshot
      expect(ServerCitationValidator.evaluateSnapshotState(null).state).toBe("missing_snapshot");

      // 2. Corrupted snapshot (schema version mismatch or hash tampering)
      const corruptedSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: "invalid_ver" as unknown as typeof SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: "run1",
        selectorVersion: "v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 50,
        chunks: [],
      };
      expect(ServerCitationValidator.evaluateSnapshotState(corruptedSnapshot).state).toBe("corrupted_snapshot");

      // Tampered chunk
      const tamperedSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: "run1",
        selectorVersion: "v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 50,
        chunks: [
          {
            chunkId: "c1",
            referenceId: testRefId,
            sourceType: "pdf",
            sourceTitle: "T",
            citationLabel: "[1]",
            sourceLocation: { startPage: 1, endPage: 1, slideIndex: null, confidence: "exact" },
            contentHash: "tampered_fake_hash",
            content: "Real content",
            selectionScore: 1,
            selectionReasons: [],
            rank: 1,
          },
        ],
      };
      expect(ServerCitationValidator.evaluateSnapshotState(tamperedSnapshot).state).toBe("corrupted_snapshot");

      // 3. Valid empty snapshot
      const emptySnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: "run1",
        selectorVersion: "v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 0,
        chunks: [],
      };
      expect(ServerCitationValidator.evaluateSnapshotState(emptySnapshot).state).toBe("valid_empty");

      // 4. Valid with references
      const validSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: "run1",
        selectorVersion: "v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 50,
        chunks: [
          {
            chunkId: "c1",
            referenceId: testRefId,
            sourceType: "pdf",
            sourceTitle: "T",
            citationLabel: "[1]",
            sourceLocation: { startPage: 1, endPage: 1, slideIndex: null, confidence: "exact" },
            contentHash: createHash("sha256").update("Real content", "utf8").digest("hex"),
            content: "Real content",
            selectionScore: 1,
            selectionReasons: [],
            rank: 1,
          },
        ],
      };
      expect(ServerCitationValidator.evaluateSnapshotState(validSnapshot).state).toBe("valid_with_references");
    });

    it("stops BEFORE calling Gemini if snapshot is missing", async () => {
      // testSlideId has no snapshot attached
      await expect(
        service.generateSlide({
          actor: testActor,
          projectId: testProjectId,
          slideId: testSlideId,
        }),
      ).rejects.toThrow(DomainError);

      expect(gateway.completionHistory).toHaveLength(0);
    });

    it("stops BEFORE calling Gemini if snapshot hash is tampered", async () => {
      const tampered: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 50,
        chunks: [
          {
            chunkId: validChunk1Id,
            referenceId: testRefId,
            sourceType: "pdf",
            sourceTitle: "Guidelines",
            citationLabel: "[1]",
            sourceLocation: { startPage: 1, endPage: 1, slideIndex: null, confidence: "exact" },
            contentHash: "tampered_hash_value_1234",
            content: validChunk1Content,
            selectionScore: 0.9,
            selectionReasons: [],
            rank: 1,
          },
        ],
      };
      await slideStore.saveReferenceSnapshot(testSlideId, testProjectId, tampered);

      await expect(
        service.generateSlide({
          actor: testActor,
          projectId: testProjectId,
          slideId: testSlideId,
        }),
      ).rejects.toThrow(DomainError);

      expect(gateway.completionHistory).toHaveLength(0);
    });

    it("allows valid empty snapshot for introductory slides without citations", async () => {
      await attachSnapshot([]);

      gateway.completeHandler = async () => ({
        text: JSON.stringify({
          title: "Introduction to Clinical Cardiology",
          subtitle: "Course Overview",
          content: [
            {
              type: "text",
              content: "Welcome to this specialized cardiology module.",
              claims: [
                {
                  text: "General introductory statement.",
                  chunkIds: [],
                  evidenceStatus: "insufficient_evidence",
                },
              ],
            },
          ],
          speakerNotes: "Welcome students.",
          citations: [],
        }),
        model: "gemini-3.5-flash-lite",
        usage: { inputTokens: 50, outputTokens: 50 },
        finishReason: "stop",
      });

      const result = await service.generateSlide({
        actor: testActor,
        projectId: testProjectId,
        slideId: testSlideId,
      });

      expect(result.status).toBe("accepted");
      expect(result.snapshotState).toBe("valid_empty");
      expect(result.slide.citations).toEqual([]);
      expect(gateway.completionHistory).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Controlled Repair Flow Tests
  // -------------------------------------------------------------------------
  describe("5. Controlled Repair Flow", () => {
    it("successfully repairs slide on second attempt when model fixes invalid citation", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      let callCount = 0;
      gateway.completeHandler = async () => {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: Returns a hallucinated chunk
          return {
            text: JSON.stringify({
              title: "Warfarin Kinetics",
              content: [
                {
                  type: "text",
                  content: "Warfarin acts via VKORC1.",
                  claims: [
                    {
                      text: "Warfarin inhibits VKORC1.",
                      chunkIds: ["hallucinated-chunk-888"],
                      evidenceStatus: "supported",
                    },
                  ],
                },
              ],
              speakerNotes: "Notes",
              citations: [{ chunkId: "hallucinated-chunk-888" }],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 60, outputTokens: 60 },
            finishReason: "stop",
          };
        } else {
          // Attempt 2 (Repair): Model maps claim to valid allowlist chunk!
          return {
            text: JSON.stringify({
              title: "Warfarin Kinetics",
              content: [
                {
                  type: "text",
                  content: "Warfarin acts via VKORC1.",
                  claims: [
                    {
                      text: "Warfarin inhibits VKORC1.",
                      chunkIds: [validChunk1Id],
                      evidenceStatus: "supported",
                    },
                  ],
                },
              ],
              speakerNotes: "Notes",
              citations: [{ chunkId: validChunk1Id }],
            }),
            model: "gemini-3.5-flash-lite",
            usage: { inputTokens: 80, outputTokens: 80 },
            finishReason: "stop",
          };
        }
      };

      const result = await service.generateSlide({
        actor: testActor,
        projectId: testProjectId,
        slideId: testSlideId,
      });

      expect(callCount).toBe(2);
      expect(result.repairAttempted).toBe(true);
      expect(result.status).toBe("accepted");
      expect(result.slide.citations[0].chunkId).toBe(validChunk1Id);
      expect(result.slide.citations[0].referenceId).toBe(testRefId);
    });

    it("marks slide as needs_review and preserves previous content when repair fails on second attempt", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      // Set initial accepted content on slide
      const initialRawText = "Original approved content from previous successful run.";
      await slideStore.updateSlide(testSlideId, testProjectId, {
        title: "Previous Approved Title",
        rawText: initialRawText,
        speakerNotes: "Previous notes.",
      });

      let callCount = 0;
      gateway.completeHandler = async () => {
        callCount++;
        // Model persistently returns invalid chunk in both attempts
        return {
          text: JSON.stringify({
            title: "Corrupted New Title",
            content: [
              {
                type: "text",
                content: "Persistent invalid claim.",
                claims: [
                  {
                    text: "Persistent ungrounded claim",
                    chunkIds: ["persistent-bad-chunk"],
                    evidenceStatus: "supported",
                  },
                ],
              },
            ],
            speakerNotes: "New bad notes",
            citations: [{ chunkId: "persistent-bad-chunk" }],
          }),
          model: "gemini-3.5-flash-lite",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      };

      const result = await service.generateSlide({
        actor: testActor,
        projectId: testProjectId,
        slideId: testSlideId,
      });

      // Strict enforcement: Exactly 2 calls (Initial + 1 Repair). NO 3rd call!
      expect(callCount).toBe(2);
      expect(result.repairAttempted).toBe(true);
      expect(result.status).toBe("needs_review");

      // Invariant: The previously accepted title, rawText, and speakerNotes MUST be preserved!
      const currentSlide = (await slideStore.findById(testSlideId, testProjectId))!;
      expect(currentSlide.title).toBe("Previous Approved Title");
      expect(currentSlide.rawText).toBe(initialRawText);
      expect(currentSlide.speakerNotes).toBe("Previous notes.");
      expect(currentSlide.extractionMetadata.generationStatus).toBe("needs_review");
      expect(currentSlide.extractionMetadata.lastFailedGeneration).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Optimistic Concurrency & Security Tests
  // -------------------------------------------------------------------------
  describe("6. Optimistic Concurrency & Security", () => {
    it("aborts generation persistence if slide was concurrently modified during model call", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      gateway.completeHandler = async () => {
        // Simulate concurrent edit during model processing:
        await slideStore.updateSlide(testSlideId, testProjectId, {
          title: "Concurrent Human Edit",
        });

        return {
          text: JSON.stringify({
            title: "Model Output",
            content: [
              {
                type: "text",
                content: "Content",
                claims: [
                  {
                    text: "Claim",
                    chunkIds: [validChunk1Id],
                    evidenceStatus: "supported",
                  },
                ],
              },
            ],
            speakerNotes: "",
            citations: [{ chunkId: validChunk1Id }],
          }),
          model: "gemini-3.5-flash-lite",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      };

      await expect(
        service.generateSlide({
          actor: testActor,
          projectId: testProjectId,
          slideId: testSlideId,
        }),
      ).rejects.toThrow(DomainError);

      const refreshed = (await slideStore.findById(testSlideId, testProjectId))!;
      expect(refreshed.title).toBe("Concurrent Human Edit");
    });

    it("enforces multi-tenant project isolation (rejecting foreign project access)", async () => {
      const foreignActor: Actor = {
        userId: asUserId(randomUUID() as UUID),
        role: "student",
        globalRole: null,
      };

      await expect(
        service.generateSlide({
          actor: foreignActor,
          projectId: testProjectId,
          slideId: testSlideId,
        }),
      ).rejects.toThrow(DomainError);
    });

    it("handles AI gateway timeout / network failure gracefully", async () => {
      await attachSnapshot([
        { chunkId: validChunk1Id, content: validChunk1Content, contentHash: validChunk1Hash },
      ]);

      gateway.completeHandler = async () => {
        throw new Error("Gemini Gateway 503 Service Unavailable");
      };

      await expect(
        service.generateSlide({
          actor: testActor,
          projectId: testProjectId,
          slideId: testSlideId,
        }),
      ).rejects.toThrow(DomainError);
    });
  });
});
