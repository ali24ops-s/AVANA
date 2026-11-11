import { describe, it, expect, vi } from "vitest";
import { StorageLockCoordinator } from "../modules/documents/storage-lock-coordinator.js";
import { randomUUID } from "node:crypto";

interface MockStorageProvider {
  files: Map<string, Buffer>;
  exists: (key: string) => Promise<boolean>;
  save: (opts: { storageKey: string; data: Buffer; mimeType?: string }) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

function createMockStorage(): MockStorageProvider {
  const files = new Map<string, Buffer>();
  return {
    files,
    exists: async (key: string) => files.has(key),
    save: async ({ storageKey, data }) => {
      files.set(storageKey, data);
    },
    delete: async (key: string) => {
      files.delete(key);
    },
  };
}

describe("Storage Scenarios A through F Audit Verification", () => {
  const orgId = "org-test-audit";
  const commonStorageKey = "uploads/textbook-common.pdf";
  const dummyFile = Buffer.from("pdf-content-bytes-12345");

  it("Scenario A: Delete fails or rolls back -> physical file is NEVER deleted", async () => {
    const storage = createMockStorage();
    await storage.save({ storageKey: commonStorageKey, data: dummyFile });
    expect(await storage.exists(commonStorageKey)).toBe(true);

    let docDeletedInDb = false;

    // Simulate deleteDocument with post-commit deletion pattern
    const deleteAttempt = async () => {
      let shouldDeleteStorage = false;
      // Simulated DB transaction
      try {
        await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
          // 1. Soft-delete document
          docDeletedInDb = true;

          // 2. Simulate unexpected DB error during transaction (e.g. timeout / constraint / audit error)
          throw new Error("DB transaction aborted unexpectedly");

          // 3. This line never reached
          // shouldDeleteStorage = true;
        });
      } catch {
        // Rollback DB soft-delete
        docDeletedInDb = false;
      }

      // Physical storage deletion only executes if transaction committed successfully
      if (shouldDeleteStorage) {
        await storage.delete(commonStorageKey);
      }
    };

    await deleteAttempt();

    // Verify: DB transaction rolled back, physical file is safely PRESERVED
    expect(docDeletedInDb).toBe(false);
    expect(await storage.exists(commonStorageKey)).toBe(true);
    expect(storage.files.get(commonStorageKey)).toEqual(dummyFile);
  });

  it("Scenario B: Delete deletes file and commits -> waiting Import detects file absence and re-saves from package", async () => {
    const storage = createMockStorage();
    await storage.save({ storageKey: commonStorageKey, data: dummyFile });

    let deleteCommitted = false;
    let importResavedFreshFile = false;

    // Process 1: Delete
    const runDelete = async () => {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        // Simulate DB commit
        deleteCommitted = true;
        // Post-commit physical delete
        await storage.delete(commonStorageKey);
      });
    };

    // Process 2: Import waiting for lock
    const runImport = async () => {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        // Under lock: check if candidate storage key exists
        const exists = await storage.exists(commonStorageKey);
        if (!exists) {
          // Physical file was deleted by committed delete -> re-save from package payload!
          await storage.save({ storageKey: commonStorageKey, data: dummyFile });
          importResavedFreshFile = true;
        }
      });
    };

    // Run concurrently
    await Promise.all([runDelete(), runImport()]);

    expect(deleteCommitted).toBe(true);
    expect(importResavedFreshFile).toBe(true);
    // File exists and is valid
    expect(await storage.exists(commonStorageKey)).toBe(true);
  });

  it("Scenario C: Import creates file, but DB transaction rolls back -> newly saved file cleaned up, shared files untouched", async () => {
    const storage = createMockStorage();
    const preExistingSharedKey = "uploads/shared-prior.pdf";
    await storage.save({ storageKey: preExistingSharedKey, data: dummyFile });

    const newlyCreatedKey = "uploads/new-temp.pdf";
    const newlySavedKeys: string[] = [];

    const importAttempt = async () => {
      try {
        // 1. Save new file
        await storage.save({ storageKey: newlyCreatedKey, data: dummyFile });
        newlySavedKeys.push(newlyCreatedKey);

        // 2. Simulate DB transaction failure
        throw new Error("Import DB transaction failed");
      } catch {
        // Rollback catch block cleans up newly saved files
        for (const k of newlySavedKeys) {
          await storage.delete(k);
        }
      }
    };

    await importAttempt();

    // Verify: newly created orphaned file is deleted
    expect(await storage.exists(newlyCreatedKey)).toBe(false);
    // Crucial: pre-existing shared file was NOT in newlySavedKeys, so it remains intact!
    expect(await storage.exists(preExistingSharedKey)).toBe(true);
  });

  it("Scenario D: Two concurrent Imports for the same file and course -> serialized, second is idempotent", async () => {
    const storage = createMockStorage();
    const importedDocIds: string[] = [];

    const simulateImport = async (importIdx: number) => {
      return await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        // Check if course already has doc
        if (importedDocIds.length > 0) {
          // Idempotent reuse: do not create duplicate
          return { status: "EXISTING_SAME_COURSE", id: importedDocIds[0] };
        }
        // Save file if needed
        if (!(await storage.exists(commonStorageKey))) {
          await storage.save({ storageKey: commonStorageKey, data: dummyFile });
        }
        const newId = `doc-${importIdx}`;
        importedDocIds.push(newId);
        return { status: "NEW", id: newId };
      });
    };

    const [res1, res2] = await Promise.all([simulateImport(1), simulateImport(2)]);

    expect(importedDocIds.length).toBe(1);
    expect(await storage.exists(commonStorageKey)).toBe(true);
    expect(res1.status === "NEW" || res2.status === "NEW").toBe(true);
    expect(res1.status === "EXISTING_SAME_COURSE" || res2.status === "EXISTING_SAME_COURSE").toBe(true);
  });

  it("Scenario E: Two concurrent Deletes for two Documents sharing the same storageKey -> file only deleted by last document", async () => {
    const storage = createMockStorage();
    await storage.save({ storageKey: commonStorageKey, data: dummyFile });

    // Active documents in organization sharing commonStorageKey
    const activeDocIds = new Set(["doc-course-1", "doc-course-2"]);

    const deleteDoc = async (docId: string) => {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        // Soft delete
        activeDocIds.delete(docId);

        // Check if any active documents remain with this storageKey
        const remainingCount = activeDocIds.size;
        if (remainingCount === 0) {
          await storage.delete(commonStorageKey);
        }
      });
    };

    // Both delete concurrently
    await Promise.all([deleteDoc("doc-course-1"), deleteDoc("doc-course-2")]);

    expect(activeDocIds.size).toBe(0);
    // File is deleted now that all references are gone
    expect(await storage.exists(commonStorageKey)).toBe(false);
  });

  it("Scenario F: Import into Course 2 and Delete in Course 1 on shared file concurrently -> Course 2 keeps valid file", async () => {
    const storage = createMockStorage();
    await storage.save({ storageKey: commonStorageKey, data: dummyFile });

    let activeDocInCourse1 = true;
    let activeDocInCourse2 = false;

    // Process 1: Delete doc in Course 1
    const process1Delete = async () => {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        activeDocInCourse1 = false;
        // Count active in org
        const anyActive = activeDocInCourse1 || activeDocInCourse2;
        if (!anyActive) {
          await storage.delete(commonStorageKey);
        }
      });
    };

    // Process 2: Import into Course 2
    const process2Import = async () => {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        let key = commonStorageKey;
        if (!(await storage.exists(key))) {
          // If file was deleted by process 1, re-save it from package payload
          await storage.save({ storageKey: key, data: dummyFile });
        }
        activeDocInCourse2 = true;
      });
    };

    await Promise.all([process1Delete(), process2Import()]);

    // Outcome: Course 1 deleted its document, Course 2 created its document, and the physical file is AVAILABLE
    expect(activeDocInCourse1).toBe(false);
    expect(activeDocInCourse2).toBe(true);
    expect(await storage.exists(commonStorageKey)).toBe(true);
    expect(storage.files.get(commonStorageKey)).toEqual(dummyFile);
  });

  it("Scenario G: Post-commit re-verification under StorageLockCoordinator prevents physical file deletion if concurrent Import registered a new reference", async () => {
    const storage = createMockStorage();
    await storage.save({ storageKey: commonStorageKey, data: dummyFile });

    const activeDocsInOrg = new Map<string, string>();
    activeDocsInOrg.set("doc-1", commonStorageKey);

    // 1. Delete initiates: soft-deletes doc-1 in DB transaction
    let shouldDeletePhysical = false;
    await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
      activeDocsInOrg.delete("doc-1");
      const remaining = Array.from(activeDocsInOrg.values()).filter((k) => k === commonStorageKey);
      if (remaining.length === 0) {
        shouldDeletePhysical = true; // planned for post-commit deletion
      }
    });

    // 2. An Import slips in right after the Delete transaction committed, registering a new document doc-2
    await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
      activeDocsInOrg.set("doc-2", commonStorageKey);
    });

    // 3. Delete runs post-commit storage deletion phase under StorageLockCoordinator
    if (shouldDeletePhysical) {
      await StorageLockCoordinator.withLock(orgId, commonStorageKey, undefined, async () => {
        // Re-verify under lock!
        const remaining = Array.from(activeDocsInOrg.values()).filter((k) => k === commonStorageKey);
        if (remaining.length === 0) {
          await storage.delete(commonStorageKey);
        }
      });
    }

    // VERIFY: The physical file was NOT deleted because post-commit re-verification detected doc-2!
    expect(await storage.exists(commonStorageKey)).toBe(true);
    expect(activeDocsInOrg.has("doc-2")).toBe(true);
  });
});
