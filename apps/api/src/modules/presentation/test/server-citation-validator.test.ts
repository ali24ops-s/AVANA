import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import {
  type PresentationProjectId,
  type PresentationReferenceId,
  type PresentationSlideId,
  type SlideReferenceContextSnapshot,
  type UUID,
  asPresentationProjectId,
  asPresentationReferenceId,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { InMemoryPresentationReferenceStore } from "../in-memory-presentation-store.js";
import { ServerCitationValidator } from "../server-citation-validator.js";

function computeSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("ServerCitationValidator (Phase 2A-2.3b)", () => {
  let slideStore: InMemoryPresentationSlideStore;
  let referenceStore: InMemoryPresentationReferenceStore;
  let validator: ServerCitationValidator;

  let testProjectId: PresentationProjectId;
  let testSlideId: PresentationSlideId;
  let testRefId: PresentationReferenceId;

  const validContent1 = "وارفارین با مهار ساخت فاکتورهای انعقادی وابسته به ویتامین K عمل می‌کند.";
  const validHash1 = computeSha256(validContent1);

  const validContent2 = "پایش منظم شاخص INR و تنظیم دوز دارو برای پیشگیری از خونریزی الزامی است.";
  const validHash2 = computeSha256(validContent2);

  beforeEach(async () => {
    slideStore = new InMemoryPresentationSlideStore();
    referenceStore = new InMemoryPresentationReferenceStore();
    validator = new ServerCitationValidator({
      slideStore,
      referenceStore,
    });

    testProjectId = asPresentationProjectId(randomUUID() as UUID);
    testRefId = asPresentationReferenceId(randomUUID() as UUID);

    // Create a slide
    const slide = await slideStore.createSlide({
      projectId: testProjectId,
      slideIndex: 1,
      title: "مکانیسم و پایش وارفارین",
    });
    testSlideId = slide.id;

    // Attach reference context snapshot to slide
    const snapshot: SlideReferenceContextSnapshot = {
      schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
      generationRunId: randomUUID(),
      selectorVersion: "heuristic-lexical-v1",
      selectedAt: new Date().toISOString(),
      projectId: testProjectId,
      slideIndex: 1,
      totalSelectedTokens: 140,
      chunks: [
        {
          chunkId: "chk:warfarin:001",
          referenceId: testRefId,
          sourceType: "pdf",
          sourceTitle: "کتاب جامع فارماکولوژی بالینی",
          citationLabel: "[1] گودمن و گیلمن (۲۰۲۳)",
          sourceLocation: {
            startPage: 45,
            endPage: 46,
            slideIndex: null,
            confidence: "exact",
          },
          contentHash: validHash1,
          content: validContent1,
          selectionScore: 0.92,
          selectionReasons: ["Matched title and keypoints"],
          rank: 1,
        },
        {
          chunkId: "chk:warfarin:002",
          referenceId: testRefId,
          sourceType: "pdf",
          sourceTitle: "کتاب جامع فارماکولوژی بالینی",
          citationLabel: "[1] گودمن و گیلمن (۲۰۲۳)",
          sourceLocation: {
            startPage: 48,
            endPage: 48,
            slideIndex: null,
            confidence: "exact",
          },
          contentHash: validHash2,
          content: validContent2,
          selectionScore: 0.84,
          selectionReasons: ["Matched INR monitoring keywords"],
          rank: 2,
        },
      ],
    };

    await slideStore.saveReferenceSnapshot(testSlideId, testProjectId, snapshot);
  });

  // 1. Valid Citation Flow
  describe("Valid Citation Flow", () => {
    it("successfully validates citations present in slide snapshot", async () => {
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [
          { chunkId: "chk:warfarin:001", referenceId: testRefId },
          { chunkId: "chk:warfarin:002" },
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
      expect(result.evaluatedCitations[0].matchedChunk?.chunkId).toBe("chk:warfarin:001");
      expect(result.evaluatedCitations[0].matchedChunk?.citationLabel).toBe("[1] گودمن و گیلمن (۲۰۲۳)");
    });

    it("handles empty claims array cleanly without error", async () => {
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [],
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.evaluatedCitations).toHaveLength(0);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
    });
  });

  // 2. Slide Context & Chunk Validation
  describe("Slide Context Validation", () => {
    it("rejects chunkId not in slide's selected context snapshot (chunk_not_in_slide_context)", async () => {
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [{ chunkId: "chk:aspirin:999" }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("chunk_not_in_slide_context");
      expect(result.invalidCount).toBe(1);
      expect(result.evaluatedCitations[0].status).toBe("chunk_not_in_slide_context");
      expect(result.evaluatedCitations[0].detail).toContain("was not selected");
    });

    it("rejects malformed citation claims with empty or missing chunkId (malformed_citation)", async () => {
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [{ chunkId: "" }, { chunkId: "   " }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("malformed_citation");
      expect(result.evaluatedCitations[0].status).toBe("malformed_citation");
    });

    it("rejects syntactically invalid chunkId format (invalid_chunk_id)", async () => {
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [
          { chunkId: "bad chunk id with spaces!" },
          { chunkId: "tiny" }, // length < 5
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("invalid_chunk_id");
      expect(result.evaluatedCitations[0].status).toBe("invalid_chunk_id");
    });

    it("rejects citation when slide has no recorded snapshot (unknown_snapshot)", async () => {
      const bareSlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 2,
        title: "Slide without snapshot",
      });

      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: bareSlide.id,
        claims: [{ chunkId: "chk:warfarin:001" }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("unknown_snapshot");
      expect(result.evaluatedCitations[0].status).toBe("unknown_snapshot");
    });
  });

  // 3. Project & Reference Integrity Validation
  describe("Project & Reference Integrity Validation", () => {
    it("rejects citation when claimed referenceId does not match chunk's snapshot referenceId (reference_mismatch)", async () => {
      const otherRefId = asPresentationReferenceId(randomUUID() as UUID);

      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [
          {
            chunkId: "chk:warfarin:001",
            referenceId: otherRefId, // Mismatched referenceId
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("reference_mismatch");
      expect(result.evaluatedCitations[0].status).toBe("reference_mismatch");
      expect(result.evaluatedCitations[0].detail).toContain("does not match snapshot referenceId");
    });

    it("rejects validation when snapshot project ID does not match request project (project_mismatch)", async () => {
      const foreignProjectId = asPresentationProjectId(randomUUID() as UUID);

      const foreignSlide = await slideStore.createSlide({
        projectId: foreignProjectId,
        slideIndex: 1,
        title: "Foreign Slide",
      });

      // Craft snapshot with mismatching project ID
      const spoofedSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId, // Points to original testProjectId, not foreignProjectId
        slideIndex: 1,
        totalSelectedTokens: 50,
        chunks: [],
      };

      // Manually force snapshot with project mismatch
      await slideStore.updateSlide(foreignSlide.id, foreignProjectId, {
        extractionMetadata: { referenceContextSnapshot: spoofedSnapshot },
      });

      const result = await validator.validateSlideCitations({
        projectId: foreignProjectId,
        slideId: foreignSlide.id,
        claims: [{ chunkId: "chk:any:001" }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("project_mismatch");
      expect(result.evaluatedCitations[0].status).toBe("project_mismatch");
    });
  });

  // 4. Snapshot Tampering & Cryptographic Integrity
  describe("Snapshot Cryptographic Integrity & Tamper Detection", () => {
    it("detects tampered chunk content via SHA-256 mismatch (snapshot_integrity_failure)", async () => {
      const tamperedSlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 3,
        title: "Tampered Slide",
      });

      const originalText = "Original verified medical text.";
      const originalHash = computeSha256(originalText);

      // Maliciously alter text while leaving hash unchanged
      const tamperedSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 3,
        totalSelectedTokens: 50,
        chunks: [
          {
            chunkId: "chk:tampered:001",
            referenceId: testRefId,
            sourceType: "pdf",
            sourceTitle: "Sample",
            citationLabel: "[1]",
            sourceLocation: { startPage: 1, endPage: 1, slideIndex: null, confidence: "exact" },
            contentHash: originalHash,
            content: "MALICIOUSLY ALTERED CONTENT THAT DOES NOT MATCH HASH!",
            selectionScore: 0.9,
            selectionReasons: [],
            rank: 1,
          },
        ],
      };

      await slideStore.saveReferenceSnapshot(tamperedSlide.id, testProjectId, tamperedSnapshot);

      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: tamperedSlide.id,
        claims: [{ chunkId: "chk:tampered:001" }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("snapshot_integrity_failure");
      expect(result.evaluatedCitations[0].detail).toContain("Cryptographic integrity failure");
    });

    it("rejects snapshot with unsupported or corrupted schemaVersion (snapshot_integrity_failure)", async () => {
      const corruptSlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 4,
        title: "Corrupt Schema Slide",
      });

      const invalidVersionSnapshot = {
        schemaVersion: "99.0.0", // Unsupported future or malformed version
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 4,
        totalSelectedTokens: 50,
        chunks: [],
      };

      await slideStore.updateSlide(corruptSlide.id, testProjectId, {
        extractionMetadata: { referenceContextSnapshot: invalidVersionSnapshot },
      });

      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: corruptSlide.id,
        claims: [{ chunkId: "chk:warfarin:001" }],
      });

      expect(result.valid).toBe(false);
      expect(result.status).toBe("snapshot_integrity_failure");
      expect(result.evaluatedCitations[0].detail).toContain("Unsupported snapshot schemaVersion");
    });
  });

  // 5. Historical Reproducibility Invariant
  describe("Historical Reproducibility Invariant", () => {
    it("maintains citation validity even if reference is subsequently deleted from project store", async () => {
      // 1. Create reference in reference store
      const createdRef = await referenceStore.create({
        projectId: testProjectId,
        type: "pdf",
        title: "Guideline to be deleted",
        sourceIdentifier: "doi:10.1000/deleted",
      });

      // 2. Create slide with snapshot containing this reference
      const histSlide = await slideStore.createSlide({
        projectId: testProjectId,
        slideIndex: 5,
        title: "Historical Slide",
      });

      const chunkContent = "Text from reference that will be deleted.";
      const chunkHash = computeSha256(chunkContent);

      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 5,
        totalSelectedTokens: 60,
        chunks: [
          {
            chunkId: "chk:hist:001",
            referenceId: createdRef.id,
            sourceType: "pdf",
            sourceTitle: "Guideline to be deleted",
            citationLabel: "[2] Historical (2024)",
            sourceLocation: { startPage: 5, endPage: 5, slideIndex: null, confidence: "exact" },
            contentHash: chunkHash,
            content: chunkContent,
            selectionScore: 0.95,
            selectionReasons: ["Historical selection"],
            rank: 1,
          },
        ],
      };

      await slideStore.saveReferenceSnapshot(histSlide.id, testProjectId, snapshot);

      // 3. Now DELETE the reference from the reference store!
      await referenceStore.delete(createdRef.id, testProjectId);
      expect(await referenceStore.findById(createdRef.id, testProjectId)).toBeNull();

      // 4. Validate citation: Historical validity MUST STILL PASS!
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: histSlide.id,
        claims: [{ chunkId: "chk:hist:001", referenceId: createdRef.id }],
      });

      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.evaluatedCitations[0].matchedChunk?.content).toBe(chunkContent);
      expect(result.evaluatedCitations[0].matchedChunk?.citationLabel).toBe("[2] Historical (2024)");
    });

    it("preserves exact generation-time chunk content even if original document content changes", async () => {
      // The snapshot preserves the verbatim text in `content` at selection time.
      const snapshot = await slideStore.getReferenceSnapshot(testSlideId, testProjectId);
      expect(snapshot?.chunks[0].content).toBe(validContent1);
      expect(snapshot?.chunks[0].contentHash).toBe(validHash1);

      // Re-validating citation uses self-contained snapshot content
      const result = await validator.validateSlideCitations({
        projectId: testProjectId,
        slideId: testSlideId,
        claims: [{ chunkId: "chk:warfarin:001" }],
      });

      expect(result.valid).toBe(true);
      expect(result.evaluatedCitations[0].matchedChunk?.content).toBe(validContent1);
    });
  });
});
