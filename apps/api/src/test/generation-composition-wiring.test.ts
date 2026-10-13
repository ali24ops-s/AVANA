import { describe, it, expect } from "vitest";
import { loadApiConfig } from "../config.js";
import { composeLocalDev } from "../server/composeLocalDev.js";
import type {
  DocumentId,
  OrganizationId,
  GenerationJobId,
  GenerationJobRecord,
} from "@avana/domain";
import { GenerationStoppedError } from "../modules/generation/generation-service.js";

describe("composeLocalDev Generation Wiring Tests", () => {
  it("composeLocalDev wires generationJobStore, generationChunkStore, and generationProgressService", async () => {
    process.env.NODE_ENV = "test";
    const config = loadApiConfig();
    const { v1Options } = await composeLocalDev(config);

    // Verify all required stores and services are defined in v1Options
    expect(v1Options.generationJobStore).toBeDefined();
    expect(v1Options.generationChunkStore).toBeDefined();
    expect(v1Options.generationProgressStore).toBeDefined();
    expect(v1Options.generationProgressService).toBeDefined();

    const jobStore = v1Options.generationJobStore!;
    const progressStore = v1Options.generationProgressStore!;
    const progressService = v1Options.generationProgressService!;

    const orgId = "org-local-1" as OrganizationId;
    const docId = "doc-local-1" as DocumentId;
    const jobId = "job-local-stopping" as GenerationJobId;

    // Simulate a job being stopped
    const job: GenerationJobRecord = {
      id: jobId,
      documentId: docId,
      organizationId: orgId,
      status: "stopping",
      targetTypes: ["lesson"],
      priority: 1,
      attempts: 1,
      maxAttempts: 3,
      payload: {},
      leaseExpiresAt: null,
      heartbeatAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    await jobStore.create(job);

    await progressStore.upsert({
      documentId: docId,
      organizationId: orgId,
      status: "stopping",
      stage: null,
      progressCurrent: 1,
      progressTotal: 5,
      stageStartedAt: null,
      lastActivityAt: null,
      errorMessage: null,
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Access adminGenerationService from queue
    const queue = v1Options.queue as unknown as { adminGenerationService: { checkCancellation: (jobId: GenerationJobId, orgId: OrganizationId, docId: DocumentId) => Promise<void> } };
    expect(queue).toBeDefined();
    const service = queue.adminGenerationService;
    expect(service).toBeDefined();

    // Verify checkCancellation properly transitions to stopped
    await expect(
      service.checkCancellation(jobId, orgId, docId),
    ).rejects.toThrow(GenerationStoppedError);

    const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(updatedJob?.status).toBe("stopped");

    const updatedProgress = await progressService.findByDocument(docId, orgId);
    expect(updatedProgress?.status).toBe("stopped");
  });
});
