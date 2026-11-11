import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type PresentationProjectId,
  type SlideReferenceContextSnapshot,
  type UUID,
  asPresentationProjectId,
  asPresentationReferenceId,
  DomainError,
  REFERENCE_CONTEXT_SNAPSHOT_KEY,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";

describe("PresentationSlideStore (Phase 2A-2.3b)", () => {
  let store: InMemoryPresentationSlideStore;
  let testProjectId: PresentationProjectId;

  beforeEach(() => {
    store = new InMemoryPresentationSlideStore();
    testProjectId = asPresentationProjectId(randomUUID() as UUID);
  });

  // 1. Slide CRUD Operations
  describe("Slide CRUD Operations", () => {
    it("creates and retrieves a slide by ID and slideIndex", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: "Introduction to Clinical Pharmacokinetics",
        rawText: "Pharmacokinetics governs absorption, distribution, metabolism, and excretion.",
        speakerNotes: "Emphasize ADME processes.",
        hasVisuals: true,
        visualSummary: "Diagram of ADME organs",
        mediaStorageKeys: ["media/adme_chart.png"],
        extractionMetadata: { originalLayout: "title_and_content" },
      });

      expect(slide.id).toBeDefined();
      expect(slide.projectId).toBe(testProjectId);
      expect(slide.slideIndex).toBe(1);
      expect(slide.title).toBe("Introduction to Clinical Pharmacokinetics");
      expect(slide.hasVisuals).toBe(true);
      expect(slide.extractionMetadata).toEqual({ originalLayout: "title_and_content" });

      // Retrieve by ID
      const retrievedById = await store.findById(slide.id, testProjectId);
      expect(retrievedById).toBeDefined();
      expect(retrievedById?.id).toBe(slide.id);

      // Retrieve by SlideIndex
      const retrievedByIndex = await store.findBySlideIndex(testProjectId, 1);
      expect(retrievedByIndex).toBeDefined();
      expect(retrievedByIndex?.id).toBe(slide.id);
    });

    it("rejects invalid slide index (<= 0 or non-integer)", async () => {
      await expect(
        store.createSlide({
          projectId: testProjectId,
          slideIndex: 0,
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        store.createSlide({
          projectId: testProjectId,
          slideIndex: -1,
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        store.createSlide({
          projectId: testProjectId,
          slideIndex: 1.5,
        }),
      ).rejects.toThrow(DomainError);
    });

    it("enforces unique constraint on (projectId, slideIndex)", async () => {
      await store.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: "First Slide",
      });

      await expect(
        store.createSlide({
          projectId: testProjectId,
          slideIndex: 1,
          title: "Duplicate Slide Index",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("returns slides ordered by slideIndex ascending", async () => {
      await store.createSlide({ projectId: testProjectId, slideIndex: 3, title: "Slide 3" });
      await store.createSlide({ projectId: testProjectId, slideIndex: 1, title: "Slide 1" });
      await store.createSlide({ projectId: testProjectId, slideIndex: 2, title: "Slide 2" });

      const slides = await store.findByProjectId(testProjectId);
      expect(slides).toHaveLength(3);
      expect(slides.map((s) => s.slideIndex)).toEqual([1, 2, 3]);
    });

    it("isolates slides across different presentation projects", async () => {
      const otherProjectId = asPresentationProjectId(randomUUID() as UUID);

      const slideA = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: "Project A Slide",
      });

      const slideB = await store.createSlide({
        projectId: otherProjectId,
        slideIndex: 1,
        title: "Project B Slide",
      });

      // Cross-project query should return null
      expect(await store.findById(slideA.id, otherProjectId)).toBeNull();
      expect(await store.findById(slideB.id, testProjectId)).toBeNull();

      expect(await store.countByProjectId(testProjectId)).toBe(1);
      expect(await store.countByProjectId(otherProjectId)).toBe(1);
    });

    it("deletes a slide cleanly and decrements project count", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: "To be deleted",
      });

      expect(await store.countByProjectId(testProjectId)).toBe(1);

      const deleted = await store.deleteSlide(slide.id, testProjectId);
      expect(deleted).toBe(true);

      expect(await store.findById(slide.id, testProjectId)).toBeNull();
      expect(await store.countByProjectId(testProjectId)).toBe(0);
    });
  });

  // 2. Reference Context Snapshot Persistence & Controlled Merge
  describe("Reference Context Snapshot Persistence", () => {
    it("saves and retrieves historical reference context snapshot", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 1,
        title: "Warfarin Monitoring",
      });

      const refId = asPresentationReferenceId(randomUUID() as UUID);
      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 1,
        totalSelectedTokens: 180,
        chunks: [
          {
            chunkId: "chk-warfarin-01",
            referenceId: refId,
            sourceType: "pdf",
            sourceTitle: "Antithrombotic Therapy Guidelines",
            citationLabel: "[1] ACCP (2024)",
            sourceLocation: {
              startPage: 12,
              endPage: 13,
              slideIndex: null,
              confidence: "exact",
            },
            contentHash: "hash-warfarin-123",
            content: "Warfarin requires routine INR monitoring with target range 2.0-3.0.",
            selectionScore: 0.85,
            selectionReasons: ["Matched title and keypoint keywords"],
            rank: 1,
          },
        ],
      };

      const updatedSlide = await store.saveReferenceSnapshot(slide.id, testProjectId, snapshot);
      expect(updatedSlide.extractionMetadata[REFERENCE_CONTEXT_SNAPSHOT_KEY]).toBeDefined();

      const retrievedSnapshot = await store.getReferenceSnapshot(slide.id, testProjectId);
      expect(retrievedSnapshot).toBeDefined();
      expect(retrievedSnapshot?.generationRunId).toBe(snapshot.generationRunId);
      expect(retrievedSnapshot?.chunks).toHaveLength(1);
      expect(retrievedSnapshot?.chunks[0].chunkId).toBe("chk-warfarin-01");
      expect(retrievedSnapshot?.chunks[0].content).toBe(
        "Warfarin requires routine INR monitoring with target range 2.0-3.0.",
      );
    });

    it("preserves other extraction_metadata keys when saving snapshot (Controlled Merge)", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 2,
        title: "Slide with Existing Metadata",
        extractionMetadata: {
          originalLayout: "two_columns",
          detectedColors: ["#003366", "#ffffff"],
          fontFamily: "Calibri",
        },
      });

      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 2,
        totalSelectedTokens: 90,
        chunks: [],
      };

      await store.saveReferenceSnapshot(slide.id, testProjectId, snapshot);

      const refreshed = await store.findById(slide.id, testProjectId);
      expect(refreshed).toBeDefined();

      // Original metadata keys MUST still be intact
      expect(refreshed?.extractionMetadata.originalLayout).toBe("two_columns");
      expect(refreshed?.extractionMetadata.fontFamily).toBe("Calibri");
      expect(refreshed?.extractionMetadata.detectedColors).toEqual(["#003366", "#ffffff"]);

      // Snapshot MUST also be present
      expect(refreshed?.extractionMetadata[REFERENCE_CONTEXT_SNAPSHOT_KEY]).toBeDefined();
    });

    it("prevents unintended deletion or overwrite of snapshot during regular slide update", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 3,
        title: "Initial Title",
        extractionMetadata: { initialKey: "initialVal" },
      });

      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 3,
        totalSelectedTokens: 100,
        chunks: [],
      };

      await store.saveReferenceSnapshot(slide.id, testProjectId, snapshot);

      // Perform regular slide title & text update with additional metadata
      await store.updateSlide(slide.id, testProjectId, {
        title: "Updated Title",
        rawText: "Updated raw text content",
        extractionMetadata: { newKey: "newVal" },
      });

      const refreshed = await store.findById(slide.id, testProjectId);
      expect(refreshed?.title).toBe("Updated Title");
      expect(refreshed?.extractionMetadata.initialKey).toBe("initialVal");
      expect(refreshed?.extractionMetadata.newKey).toBe("newVal");

      // Verify referenceContextSnapshot was NOT blown away!
      const retainedSnapshot = await store.getReferenceSnapshot(slide.id, testProjectId);
      expect(retainedSnapshot).toBeDefined();
      expect(retainedSnapshot?.generationRunId).toBe(snapshot.generationRunId);
    });

    it("rejects snapshot when snapshot project ID or slide index does not match target slide", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 4,
        title: "Slide 4",
      });

      const mismatchProjectSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: asPresentationProjectId(randomUUID() as UUID), // Mismatch!
        slideIndex: 4,
        totalSelectedTokens: 50,
        chunks: [],
      };

      await expect(
        store.saveReferenceSnapshot(slide.id, testProjectId, mismatchProjectSnapshot),
      ).rejects.toThrow(DomainError);

      const mismatchIndexSnapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId: testProjectId,
        slideIndex: 99, // Mismatch with slide 4!
        totalSelectedTokens: 50,
        chunks: [],
      };

      await expect(
        store.saveReferenceSnapshot(slide.id, testProjectId, mismatchIndexSnapshot),
      ).rejects.toThrow(DomainError);
    });
  });

  // 3. Concurrency Behavior
  describe("Concurrency Behavior in Store Operations", () => {
    it("handles concurrent slide updates and snapshot writes without race conditions", async () => {
      const slide = await store.createSlide({
        projectId: testProjectId,
        slideIndex: 5,
        title: "Concurrent Slide",
        extractionMetadata: { initialKey: "safe" },
      });

      const concurrentTasks = Array.from({ length: 10 }, (_, i) => {
        if (i % 2 === 0) {
          return store.updateSlide(slide.id, testProjectId, {
            speakerNotes: `Updated notes step ${i}`,
            extractionMetadata: { [`worker_${i}`]: `data_${i}` },
          });
        }
        const snapshot: SlideReferenceContextSnapshot = {
          schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
          generationRunId: `run-${i}`,
          selectorVersion: "heuristic-lexical-v1",
          selectedAt: new Date().toISOString(),
          projectId: testProjectId,
          slideIndex: 5,
          totalSelectedTokens: i * 10,
          chunks: [],
        };
        return store.saveReferenceSnapshot(slide.id, testProjectId, snapshot);
      });

      await Promise.all(concurrentTasks);

      const finalSlide = await store.findById(slide.id, testProjectId);
      expect(finalSlide).toBeDefined();
      expect(finalSlide?.extractionMetadata.initialKey).toBe("safe");

      const finalSnapshot = await store.getReferenceSnapshot(slide.id, testProjectId);
      expect(finalSnapshot).toBeDefined();
    });
  });
});
