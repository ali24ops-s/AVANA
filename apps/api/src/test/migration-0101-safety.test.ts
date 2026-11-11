import { describe, it, expect } from "vitest";

interface DocumentRow {
  id: string;
  organization_id: string;
  course_id: string | null;
  sha256: string;
  deleted_at: Date | null;
}

interface ModuleRow {
  id: string;
  course_id: string;
  document_id: string | null;
  title: string;
  deleted_at: Date | null;
}

interface LessonRow {
  id: string;
  module_id: string;
  title: string;
  deleted_at: Date | null;
}

interface FlashcardRow {
  id: string;
  organization_id: string;
  course_id: string;
  document_id: string | null;
  question: string;
  deleted_at: Date | null;
}

interface QuizRow {
  id: string;
  organization_id: string;
  course_id: string;
  document_id: string | null;
  title: string;
  deleted_at: Date | null;
}

interface DocumentChunkRow {
  id: string;
  document_id: string;
  sequence: number;
  content: string;
}

interface GeneratedContentRow {
  id: string;
  organization_id: string;
  course_id: string;
  document_id: string | null;
  type: string;
  deleted_at: Date | null;
}

describe("Migration 0101 Safety Review: Unique Constraints & Full Educational Data Preservation", () => {
  it("Scenario 1: Two active documents with same (org_id, course_id, sha256) where BOTH have active modules with independent lessons", () => {
    // 1. Initial State
    const orgId = "org-1";
    const courseId = "course-1";
    const commonHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    const documents: DocumentRow[] = [
      { id: "doc-1", organization_id: orgId, course_id: courseId, sha256: commonHash, deleted_at: null },
      { id: "doc-2", organization_id: orgId, course_id: courseId, sha256: commonHash, deleted_at: null },
    ];

    const modules: ModuleRow[] = [
      { id: "mod-1", course_id: courseId, document_id: "doc-1", title: "Chapter 1: Foundations", deleted_at: null },
      { id: "mod-2", course_id: courseId, document_id: "doc-2", title: "Chapter 2: Advanced Mechanics", deleted_at: null },
    ];

    const lessons: LessonRow[] = [
      { id: "les-1", module_id: "mod-1", title: "Lesson 1.1 Intro", deleted_at: null },
      { id: "les-2", module_id: "mod-1", title: "Lesson 1.2 Basics", deleted_at: null },
      { id: "les-3", module_id: "mod-2", title: "Lesson 2.1 Deep Dive", deleted_at: null },
      { id: "les-4", module_id: "mod-2", title: "Lesson 2.2 Applications", deleted_at: null },
    ];

    const flashcards: FlashcardRow[] = [
      { id: "fc-1", organization_id: orgId, course_id: courseId, document_id: "doc-1", question: "Q1", deleted_at: null },
      { id: "fc-2", organization_id: orgId, course_id: courseId, document_id: "doc-2", question: "Q2", deleted_at: null },
    ];

    const quizzes: QuizRow[] = [
      { id: "qz-1", organization_id: orgId, course_id: courseId, document_id: "doc-1", title: "Quiz 1", deleted_at: null },
      { id: "qz-2", organization_id: orgId, course_id: courseId, document_id: "doc-2", title: "Quiz 2", deleted_at: null },
    ];

    const documentChunks: DocumentChunkRow[] = [
      { id: "chk-1-0", document_id: "doc-1", sequence: 0, content: "Chunk 1-0" },
      { id: "chk-1-1", document_id: "doc-1", sequence: 1, content: "Chunk 1-1" },
      { id: "chk-2-0", document_id: "doc-2", sequence: 0, content: "Chunk 2-0" },
      { id: "chk-2-1", document_id: "doc-2", sequence: 1, content: "Chunk 2-1" },
    ];

    const generatedContents: GeneratedContentRow[] = [
      { id: "gc-1", organization_id: orgId, course_id: courseId, document_id: "doc-1", type: "flashcards", deleted_at: null },
      { id: "gc-2", organization_id: orgId, course_id: courseId, document_id: "doc-2", type: "flashcards", deleted_at: null },
    ];

    // 2. Execute Proposed Migration Deduplication Logic
    // Find duplicates within (orgId, courseId, sha256)
    const dupsMap = new Map<string, DocumentRow[]>();
    for (const doc of documents.filter((d) => d.course_id !== null && d.deleted_at === null)) {
      const key = `${doc.organization_id}:${doc.course_id}:${doc.sha256}`;
      const group = dupsMap.get(key) ?? [];
      group.push(doc);
      dupsMap.set(key, group);
    }

    for (const [, group] of dupsMap.entries()) {
      if (group.length <= 1) continue;

      // Select authoritative doc
      const authDoc = group[0]; // doc-1
      const secondaryDocs = group.slice(1); // [doc-2]

      for (const dupDoc of secondaryDocs) {
        // Check if both authDoc and dupDoc have active modules in the course
        const authHasModule = modules.some(
          (m) => m.course_id === dupDoc.course_id && m.document_id === authDoc.id && m.deleted_at === null,
        );
        const dupHasModule = modules.some(
          (m) => m.course_id === dupDoc.course_id && m.document_id === dupDoc.id && m.deleted_at === null,
        );

        if (authHasModule && dupHasModule) {
          // Educational duplicate: Both documents back distinct active modules!
          // PRESERVE AUTHENTIC SHA256: Do NOT alter sha256.
          // PRESERVE MODULE & LESSONS: mod-2 is NOT deleted and NOT soft-deleted.
          // To respect idx_modules_course_document_unique (only one module per document_id in course),
          // decouple dupDoc's module so it remains fully active with document_id = null.
          for (const m of modules.filter((m) => m.document_id === dupDoc.id)) {
            m.document_id = null;
          }
        } else {
          // No module collision: safe to remap modules to authDoc
          for (const m of modules.filter((m) => m.document_id === dupDoc.id)) {
            m.document_id = authDoc.id;
          }
        }

        // Remap educational content (flashcards, quizzes, generated content) to authDoc
        for (const f of flashcards.filter((f) => f.document_id === dupDoc.id)) {
          f.document_id = authDoc.id;
        }
        for (const q of quizzes.filter((q) => q.document_id === dupDoc.id)) {
          q.document_id = authDoc.id;
        }
        for (const gc of generatedContents.filter((gc) => gc.document_id === dupDoc.id)) {
          gc.document_id = authDoc.id;
        }

        // Soft-delete the redundant document record while keeping its real, authentic SHA256 intact
        dupDoc.deleted_at = new Date();
      }
    }

    // 3. Verify INVARIANTS & CONSTRAINTS

    // Invariant 1: Genuine, authentic SHA256 is preserved on all documents (NO artificial suffixes!)
    expect(documents.find((d) => d.id === "doc-1")?.sha256).toBe(commonHash);
    expect(documents.find((d) => d.id === "doc-2")?.sha256).toBe(commonHash);

    // Invariant 2: No modules or lessons deleted or soft-deleted (100% educational preservation)
    const activeModules = modules.filter((m) => m.deleted_at === null);
    expect(activeModules.length).toBe(2);
    expect(activeModules.map((m) => m.id)).toEqual(["mod-1", "mod-2"]);
    expect(modules.find((m) => m.id === "mod-1")?.document_id).toBe("doc-1");
    expect(modules.find((m) => m.id === "mod-2")?.document_id).toBeNull(); // Preserved active without colliding

    const activeLessons = lessons.filter((l) => l.deleted_at === null);
    expect(activeLessons.length).toBe(4);
    expect(activeLessons.map((l) => l.id)).toEqual(["les-1", "les-2", "les-3", "les-4"]);

    // Invariant 3: idx_modules_course_document_unique is respected (no two active modules share same non-null document_id)
    const moduleDocMap = new Map<string, string>();
    for (const mod of activeModules) {
      if (mod.document_id) {
        const key = `${mod.course_id}:${mod.document_id}`;
        expect(moduleDocMap.has(key)).toBe(false);
        moduleDocMap.set(key, mod.id);
      }
    }

    // Invariant 4: idx_documents_org_course_hash is respected (only one active document with commonHash)
    const docHashMap = new Set<string>();
    for (const doc of documents.filter((d) => d.course_id !== null && d.deleted_at === null)) {
      const key = `${doc.organization_id}:${doc.course_id}:${doc.sha256}`;
      expect(docHashMap.has(key)).toBe(false);
      docHashMap.add(key);
    }
    expect(docHashMap.size).toBe(1); // exactly one active document with this hash in this course

    // Invariant 4: idx_document_chunks_doc_sequence is NOT violated because doc-2 chunks remained on doc-2
    const chunkMap = new Set<string>();
    for (const chk of documentChunks) {
      const key = `${chk.document_id}:${chk.sequence}`;
      expect(chunkMap.has(key)).toBe(false);
      chunkMap.add(key);
    }

    // Invariant 5: doc-1 is active primary, doc-2 is soft-deleted, and all educational structures remain active
    expect(documents.find((d) => d.id === "doc-1")?.deleted_at).toBeNull();
    expect(documents.find((d) => d.id === "doc-2")?.deleted_at).not.toBeNull();
    expect(flashcards.filter((f) => f.deleted_at === null).length).toBe(2);
    expect(quizzes.filter((q) => q.deleted_at === null).length).toBe(2);
  });

  it("Scenario 2: Duplicate active document WITHOUT active module is safely merged and soft-deleted", () => {
    const orgId = "org-1";
    const courseId = "course-1";
    const commonHash = "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890";

    const documents: DocumentRow[] = [
      { id: "doc-primary", organization_id: orgId, course_id: courseId, sha256: commonHash, deleted_at: null },
      { id: "doc-orphan", organization_id: orgId, course_id: courseId, sha256: commonHash, deleted_at: null },
    ];

    const modules: ModuleRow[] = [
      { id: "mod-1", course_id: courseId, document_id: "doc-primary", title: "Only Module", deleted_at: null },
    ];

    const flashcards: FlashcardRow[] = [
      { id: "fc-orphan", organization_id: orgId, course_id: courseId, document_id: "doc-orphan", question: "Orphan Card", deleted_at: null },
    ];

    // Execute deduplication
    const authDoc = documents[0];
    const dupDoc = documents[1];

    const authHasModule = modules.some(
      (m) => m.course_id === dupDoc.course_id && m.document_id === authDoc.id && m.deleted_at === null,
    );
    const dupHasModule = modules.some(
      (m) => m.course_id === dupDoc.course_id && m.document_id === dupDoc.id && m.deleted_at === null,
    );

    expect(authHasModule).toBe(true);
    expect(dupHasModule).toBe(false);

    // Because dupDoc has no module, remapping flashcard to authDoc does NOT violate any constraint
    for (const fc of flashcards.filter((f) => f.document_id === dupDoc.id)) {
      fc.document_id = authDoc.id;
    }
    dupDoc.deleted_at = new Date();

    expect(dupDoc.deleted_at).not.toBeNull();
    expect(flashcards[0].document_id).toBe("doc-primary");
    expect(flashcards[0].deleted_at).toBeNull();
  });
});
