import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalStorageExamStore,
  MemoryExamStore,
} from "../lib/storage/exam-offline-store.js";

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockStorage,
  writable: true,
});

describe("ExamOfflineStore (Memory & LocalStorage implementations)", () => {
  let memoryStore: MemoryExamStore;
  let localStore: LocalStorageExamStore;

  beforeEach(() => {
    mockStorage.clear();
    memoryStore = new MemoryExamStore();
    localStore = new LocalStorageExamStore();
  });

  describe("MemoryExamStore", () => {
    it("saves answer with initial monotonic revision = 1 and synced = false", async () => {
      const rec = await memoryStore.saveAnswer("att-1", "q-1", "option-A");
      expect(rec.attemptId).toBe("att-1");
      expect(rec.questionId).toBe("q-1");
      expect(rec.answer).toBe("option-A");
      expect(rec.revision).toBe(1);
      expect(rec.synced).toBe(false);
      expect(rec.updatedAt).toBeDefined();
    });

    it("increments monotonic revision for consecutive updates on the same question", async () => {
      await memoryStore.saveAnswer("att-1", "q-1", "option-A");
      const rec2 = await memoryStore.saveAnswer("att-1", "q-1", "option-B");
      expect(rec2.revision).toBe(2);
      expect(rec2.answer).toBe("option-B");

      const rec3 = await memoryStore.saveAnswer("att-1", "q-1", "option-C");
      expect(rec3.revision).toBe(3);
      expect(rec3.answer).toBe("option-C");
    });

    it("tracks independent revisions for different questions", async () => {
      await memoryStore.saveAnswer("att-1", "q-1", "A");
      await memoryStore.saveAnswer("att-1", "q-1", "B");
      const q2Rec = await memoryStore.saveAnswer("att-1", "q-2", "X");

      expect(q2Rec.questionId).toBe("q-2");
      expect(q2Rec.revision).toBe(1);

      const all = await memoryStore.getAllAnswers("att-1");
      expect(all).toEqual({
        "q-1": "B",
        "q-2": "X",
      });
    });

    it("returns only pending (unsynced) answers in getPendingAnswers", async () => {
      await memoryStore.saveAnswer("att-1", "q-1", "A");
      await memoryStore.saveAnswer("att-1", "q-2", "B");

      const pendingBefore = await memoryStore.getPendingAnswers("att-1");
      expect(pendingBefore).toHaveLength(2);

      // Acknowledge q-1
      await memoryStore.markAnswersAsSynced("att-1", [{ questionId: "q-1", revision: 1 }]);

      const pendingAfter = await memoryStore.getPendingAnswers("att-1");
      expect(pendingAfter).toHaveLength(1);
      expect(pendingAfter[0].questionId).toBe("q-2");
    });

    it("retains newer local edits as pending if a previous in-flight revision is acknowledged", async () => {
      // 1. User answers with revision 1
      const r1 = await memoryStore.saveAnswer("att-1", "q-1", "A");
      expect(r1.revision).toBe(1);

      // 2. User quickly changes to revision 2 while revision 1 was in flight
      const r2 = await memoryStore.saveAnswer("att-1", "q-1", "B");
      expect(r2.revision).toBe(2);

      // 3. Server acknowledges revision 1
      await memoryStore.markAnswersAsSynced("att-1", [{ questionId: "q-1", revision: 1 }]);

      // 4. Stored answer MUST still be pending because local revision 2 > server ack 1
      const pending = await memoryStore.getPendingAnswers("att-1");
      expect(pending).toHaveLength(1);
      expect(pending[0].questionId).toBe("q-1");
      expect(pending[0].revision).toBe(2);
      expect(pending[0].synced).toBe(false);
      expect(pending[0].answer).toBe("B");
    });

    it("clears attempt data completely upon clearAttempt", async () => {
      await memoryStore.saveAnswer("att-1", "q-1", "A");
      await memoryStore.saveAnswer("att-2", "q-1", "Z");

      await memoryStore.clearAttempt("att-1");

      const att1Answers = await memoryStore.getAllAnswers("att-1");
      expect(att1Answers).toEqual({});

      // Other attempt remains intact
      const att2Answers = await memoryStore.getAllAnswers("att-2");
      expect(att2Answers).toEqual({ "q-1": "Z" });
    });
  });

  describe("LocalStorageExamStore", () => {
    it("persists answers, tracks revisions, and survives across fresh store instances", async () => {
      const rec = await localStore.saveAnswer("att-local-1", "q-1", "choice-1");
      expect(rec.revision).toBe(1);

      // Create a brand new store instance pointing to same localStorage
      const freshStore = new LocalStorageExamStore();
      const all = await freshStore.getAllAnswers("att-local-1");
      expect(all).toEqual({ "q-1": "choice-1" });

      const rec2 = await freshStore.saveAnswer("att-local-1", "q-1", "choice-2");
      expect(rec2.revision).toBe(2);

      await freshStore.markAnswersAsSynced("att-local-1", [{ questionId: "q-1", revision: 2 }]);
      const pending = await freshStore.getPendingAnswers("att-local-1");
      expect(pending).toHaveLength(0);

      await freshStore.clearAttempt("att-local-1");
      const afterClear = await freshStore.getAllAnswers("att-local-1");
      expect(afterClear).toEqual({});
    });
  });
});
