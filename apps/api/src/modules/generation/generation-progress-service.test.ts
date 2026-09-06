import { describe, it, expect, beforeEach } from "vitest";
import type { DocumentId, OrganizationId } from "@avana/domain";
import { InMemoryGenerationProgressStore } from "./generation-progress-store.js";
import { GenerationProgressService } from "./generation-progress-service.js";

describe("GenerationProgressService & InMemoryGenerationProgressStore", () => {
  let store: InMemoryGenerationProgressStore;
  let service: GenerationProgressService;
  const docId = "doc-test-123" as DocumentId;
  const orgId = "org-test-456" as OrganizationId;

  beforeEach(() => {
    store = new InMemoryGenerationProgressStore();
    service = new GenerationProgressService(store);
  });

  it("should queue a document and set status to queued", async () => {
    const record = await service.queue(docId, orgId);
    expect(record.documentId).toBe(docId);
    expect(record.organizationId).toBe(orgId);
    expect(record.status).toBe("queued");
    expect(record.stage).toBeNull();
    expect(record.progressCurrent).toBe(0);
    expect(record.progressTotal).toBe(1);
    expect(record.version).toBe(1);

    const resource = service.toResource(record);
    expect(resource.status).toBe("queued");
    expect(resource.stage).toBeNull();
    expect(resource.stageLabel).toBeNull();
  });

  it("should start a stage and update progress correctly", async () => {
    const startRecord = await service.startStage(docId, orgId, "lesson", 5);
    expect(startRecord.status).toBe("generating");
    expect(startRecord.stage).toBe("lesson");
    expect(startRecord.progressCurrent).toBe(0);
    expect(startRecord.progressTotal).toBe(5);
    expect(startRecord.stageStartedAt).toBeDefined();
    expect(startRecord.lastActivityAt).toBeDefined();

    const resource1 = service.toResource(startRecord);
    expect(resource1.stage).toBe("lesson");
    expect(resource1.stageLabel).toBe("تولید درسنامه");
    expect(resource1.progress?.percentage).toBe(0);

    // Update progress to session 2
    const update1 = await service.updateProgress(docId, orgId, "lesson", 2, 5);
    expect(update1.progressCurrent).toBe(2);
    expect(update1.progressTotal).toBe(5);
    expect(update1.version).toBe(2);

    const resource2 = service.toResource(update1);
    expect(resource2.progress?.percentage).toBe(40);
  });

  it("should enforce monotonic progressCurrent within the same stage", async () => {
    await service.startStage(docId, orgId, "flashcard", 4);
    await service.updateProgress(docId, orgId, "flashcard", 3, 4);

    // Attempt to regress progress to 1
    const regressed = await service.updateProgress(docId, orgId, "flashcard", 1, 4);
    // Must remain 3 due to Math.max monotonic guarantee
    expect(regressed.progressCurrent).toBe(3);
  });

  it("should complete a stage and set progressCurrent = progressTotal", async () => {
    await service.startStage(docId, orgId, "quiz", 3);
    const completed = await service.completeStage(docId, orgId, "quiz");
    expect(completed.progressCurrent).toBe(3);
    expect(completed.progressTotal).toBe(3);
    expect(completed.status).toBe("generating");

    const resource = service.toResource(completed);
    expect(resource.progress?.percentage).toBe(100);
  });

  it("should fail generation and record errorMessage", async () => {
    await service.startStage(docId, orgId, "summary", 1);
    const failed = await service.fail(docId, orgId, "Gemini API Quota Exceeded");
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("Gemini API Quota Exceeded");

    const resource = service.toResource(failed);
    expect(resource.status).toBe("failed");
    expect(resource.error).toBe("Gemini API Quota Exceeded");
  });

  it("should mark generation as complete", async () => {
    await service.startStage(docId, orgId, "review", 1);
    const done = await service.complete(docId, orgId);
    expect(done.status).toBe("completed");
    expect(done.stage).toBe("publishing");
    expect(done.progressCurrent).toBe(1);
    expect(done.progressTotal).toBe(1);

    const resource = service.toResource(done);
    expect(resource.status).toBe("completed");
  });

  it("should reset generation progress to idle", async () => {
    await service.startStage(docId, orgId, "lesson", 5);
    const reset = await service.reset(docId, orgId);
    expect(reset.status).toBe("idle");
    expect(reset.stage).toBeNull();
    expect(reset.progressCurrent).toBe(0);
    expect(reset.progressTotal).toBe(1);
    expect(reset.errorMessage).toBeNull();
  });
});
