import { describe, it, expect, vi } from "vitest";
import { composeWorker } from "./compose.js";
import { loadWorkerConfig } from "./config.js";

describe("Worker Composition Root (composeWorker)", () => {
  it("wires DrizzleGenerationProgressStore and GenerationProgressService into GenerationService", async () => {
    const mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as NonNullable<Parameters<typeof composeWorker>[1]>["db"];

    const workerConfig = loadWorkerConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://mock:5432/mock",
      GEMINI_API_KEY: "AIzaSy-test-key-worker",
    });

    const worker = await composeWorker(workerConfig, {
      db: mockDb,
      close: async () => {},
    });

    expect(worker.adminGenerationService).toBeDefined();
    expect(worker.userGenerationService).toBeDefined();
    expect(worker.generationProgressStore).toBeDefined();
    expect(worker.generationProgressService).toBeDefined();

    // Verify worker's GenerationService has the PostgreSQL-backed generationProgressService injected
    // rather than falling back to an in-memory generationProgressService
    const adminSvc = worker.adminGenerationService as unknown as { progressService: unknown };
    expect(adminSvc.progressService).toBe(worker.generationProgressService);

    const userSvc = worker.userGenerationService as unknown as { progressService: unknown };
    expect(userSvc.progressService).toBe(worker.generationProgressService);
  });
});
