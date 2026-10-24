import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { DocumentProcessingService } from "../modules/documents/document-processing-service.js";
import { CourseService } from "../modules/courses/course-service.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore, InMemoryGeneratedContentCitationStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryQuizStore, InMemoryFlashcardStore, InMemoryQuizQuestionStore } from "../modules/study/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";
import type { ModelGateway } from "../modules/generation/model-gateway.js";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{ storageKey: string; uploadUrl: string | null; expiresAt: string }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: { storageKey: string; data: Buffer }): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async read(storageKey: string): Promise<Buffer> {
    return this.files.get(storageKey) ?? Buffer.from("dummy-pdf-content");
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }
}

const mockModelGateway: ModelGateway = {
  async execute() {
    return {
      text: JSON.stringify({ sessions: [{ title: "درس نمونه", contentMarkdown: "# محتوا" }] }),
      inputTokens: 100,
      outputTokens: 50,
    };
  },
} as unknown as ModelGateway;

describe("Cross-Course Document Isolation & Deduplication Tests", () => {
  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseAId = "11111111-1111-1111-1111-111111111111" as CourseId;
  const courseBId = "22222222-2222-2222-2222-222222222222" as CourseId;

  const adminActor: Actor = {
    userId: "admin-user",
    role: "organization_admin",
    globalRole: "platform_admin",
    organizationId: orgId,
    memberships: [{ organizationId: orgId, role: "organization_admin" }],
  };

  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let genCitationStore: InMemoryGeneratedContentCitationStore;
  let orgStore: InMemoryOrganizationStore;
  let userStore: InMemoryUserStore;
  let adminStore: InMemoryAdminStore;
  let storage: FakeStorageProvider;
  let docService: DocumentService;
  let courseService: CourseService;
  let genService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    genContentStore = new InMemoryGeneratedContentStore();
    genCitationStore = new InMemoryGeneratedContentCitationStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    storage = new FakeStorageProvider();

    // Seed org in orgStore
    orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Org A",
        slug: "org-a",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const processingService = new DocumentProcessingService(
      docStore,
      chunkStore,
      storage,
      defaultPolicy,
      undefined,
      orgStore,
    );

    docService = new DocumentService(
      docStore,
      storage,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      undefined,
      undefined,
      undefined,
      processingService,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    );

    courseService = new CourseService(
      courseStore,
      undefined,
      defaultPolicy,
      undefined,
      orgId,
      undefined,
      moduleStore,
      lessonStore,
      docStore,
      undefined,
      undefined,
      quizStore,
      flashcardStore,
      orgStore,
      userStore,
    );

    genService = new GenerationService(
      genContentStore,
      genCitationStore,
      mockModelGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    reviewService = new ReviewService(
      genContentStore,
      genCitationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      docStore,
      defaultPolicy,
    );

    officialContentService = new OfficialContentService(
      undefined,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      docStore,
      genContentStore,
      genService,
      reviewService,
      adminStore,
      orgId,
    );

    // Setup courses A and B
    await courseStore.create({
      course: {
        id: courseAId,
        organizationId: orgId,
        name: "دوره الف",
        description: null,
        subject: "پزشکی",
        targetAcademicFields: [],
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: courseBId,
        organizationId: orgId,
        name: "دوره ب",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });
  });

  describe("1. Deduplication Policy", () => {
    const fileBytes = Buffer.from("unique-lecture-notes-content-12345");
    const mimeType = "application/pdf";
    const filename = "lecture1.pdf";

    it("Upload in Course A succeeds and links document to Course A", async () => {
      const confirm = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: filename,
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: courseAId,
        },
      );

      expect(confirm.document.course_id).toBe(courseAId);
      expect(confirm.duplicate).toBe(false);
    });

    it("Re-upload identical SHA256 in the SAME course returns idempotent duplicate: true", async () => {
      // First upload
      const confirm1 = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: filename,
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: courseAId,
        },
      );
      expect(confirm1.duplicate).toBe(false);

      // Second upload in same course A
      const confirm2 = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: filename,
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: courseAId,
        },
      );

      expect(confirm2.duplicate).toBe(true);
      expect(confirm2.document.id).toBe(confirm1.document.id);
      expect(confirm2.document.course_id).toBe(courseAId);
    });

    it("Uploading identical SHA256 in DIFFERENT course (Course B) throws HTTP 409 conflict and preserves Course A record", async () => {
      // First upload to Course A
      const confirm1 = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: filename,
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: courseAId,
        },
      );

      // Second upload with same bytes to Course B -> Must be rejected with conflict (409)
      await expect(
        docService.confirmUpload(
          adminActor,
          orgId,
          {
            originalName: filename,
            mimeType,
            sizeBytes: fileBytes.length,
            data: fileBytes,
            courseId: courseBId,
          },
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("conflict");
        expect(domErr.message).toContain("دوره دیگری");
        return true;
      });

      // Verify original document in Course A remains completely unmodified
      const originalDoc = await docStore.findByIdForOrganization(
        confirm1.document.id,
        orgId,
      );
      expect(originalDoc?.courseId).toBe(courseAId);
    });

    it("Uploading identical SHA256 without course when already bound to Course A throws conflict", async () => {
      // Upload to Course A
      await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: filename,
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: courseAId,
        },
      );

      // Attempt upload to general library (no course)
      await expect(
        docService.confirmUpload(
          adminActor,
          orgId,
          {
            originalName: filename,
            mimeType,
            sizeBytes: fileBytes.length,
            data: fileBytes,
            courseId: undefined,
          },
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("conflict");
        return true;
      });
    });

    it("Uploading identical SHA256 without course when already in general library is idempotent", async () => {
      // Upload to library without course
      const confirm1 = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: "library-file.pdf",
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: undefined,
        },
      );
      expect(confirm1.document.course_id).toBeNull();
      expect(confirm1.duplicate).toBe(false);

      // Re-upload without course
      const confirm2 = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: "library-file.pdf",
          mimeType,
          sizeBytes: fileBytes.length,
          data: fileBytes,
          courseId: undefined,
        },
      );
      expect(confirm2.duplicate).toBe(true);
      expect(confirm2.document.id).toBe(confirm1.document.id);
      expect(confirm2.document.course_id).toBeNull();
    });
  });

  describe("2. Module Association Guards", () => {
    let docInCourseAId: DocumentId;

    beforeEach(async () => {
      const confirm = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: "course-a-syllabus.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          data: Buffer.from("course-a-syllabus-content"),
          courseId: courseAId,
        },
      );
      docInCourseAId = confirm.document.id;
    });

    it("createModule with documentId belonging to Course A inside Course B throws bad_request", async () => {
      await expect(
        courseService.createModule(adminActor, orgId, courseBId, {
          title: "ماژول غیرمجاز در دوره ب",
          documentId: docInCourseAId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("متعلق به این دوره نیست");
        return true;
      });
    });

    it("updateModule with documentId belonging to Course A inside Course B throws bad_request", async () => {
      // First create valid module in Course B without document
      const mod = await courseService.createModule(adminActor, orgId, courseBId, {
        title: "ماژول در دوره ب",
      });

      // Attempt to attach doc from Course A
      await expect(
        courseService.updateModule(adminActor, orgId, courseBId, mod.id, {
          documentId: docInCourseAId,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("متعلق به این دوره نیست");
        return true;
      });
    });

    it("createModule with documentId belonging to Course A inside Course A succeeds", async () => {
      const mod = await courseService.createModule(adminActor, orgId, courseAId, {
        title: "ماژول معتبر در دوره الف",
        documentId: docInCourseAId,
      });

      expect(mod.courseId).toBe(courseAId);
      expect(mod.documentId).toBe(docInCourseAId);
    });
  });

  describe("3. Generation Route & Service Guards", () => {
    let docInCourseAId: DocumentId;
    let unassignedDocId: DocumentId;

    beforeEach(async () => {
      const confirmA = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: "doc-a.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          data: Buffer.from("doc-a-content"),
          courseId: courseAId,
        },
      );
      docInCourseAId = confirmA.document.id;

      const confirmUnassigned = await docService.confirmUpload(
        adminActor,
        orgId,
        {
          originalName: "unassigned.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          data: Buffer.from("unassigned-content"),
          courseId: undefined,
        },
      );
      unassignedDocId = confirmUnassigned.document.id;
    });

    it("triggerOfficialGeneration rejects document belonging to another course", async () => {
      await expect(
        officialContentService.triggerOfficialGeneration(
          adminActor,
          courseBId,
          docInCourseAId,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند متعلق به دوره دیگری است");
        return true;
      });
    });

    it("triggerOfficialGeneration rejects document with no course assigned", async () => {
      await expect(
        officialContentService.triggerOfficialGeneration(
          adminActor,
          courseBId,
          unassignedDocId,
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("این سند به دوره‌ای اختصاص نیافته است");
        return true;
      });
    });

    it("generateForDocument rejects generation when doc.courseId does not match targetCourseId", async () => {
      await expect(
        genService.generateForDocument(
          adminActor,
          orgId,
          docInCourseAId,
          {
            types: ["lesson"],
            courseId: courseBId,
          },
        ),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(DomainError);
        const domErr = err as DomainError;
        expect(domErr.code).toBe("bad_request");
        expect(domErr.message).toContain("Document belongs to a different course");
        return true;
      });
    });
  });
});
