import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
  type LessonId,
  type ModuleId,
  type SubCourseGroupId,
  type GeneratedContentId,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { CourseService } from "../modules/courses/course-service.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { GenerationQueryService } from "../modules/generation/services/generation-query-service.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemorySubCourseGroupStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore, InMemoryCoursePublicationStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationProgressStore } from "../modules/generation/generation-progress-store.js";
import { InMemoryQuizStore, InMemoryFlashcardStore, InMemoryQuizQuestionStore } from "../modules/study/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";
import type { GenerationQueue } from "../modules/generation/generation-queue.js";

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

class FakeGenerationQueue implements GenerationQueue {
  public jobs: any[] = [];
  async enqueue(item: any): Promise<string> {
    const jobId = `job_${randomUUID()}`;
    this.jobs.push({ id: jobId, ...item });
    return jobId;
  }
}

describe("Content Admin & Super Admin Access Matrix Audit (Scenarios A through H)", () => {
  const systemOrgId = randomUUID() as OrganizationId;
  const otherOrgId = randomUUID() as OrganizationId;

  const superAdminUserId = randomUUID();
  const contentWorkerUserId = randomUUID();
  const teacherUserId = randomUUID();
  const studentUserId = randomUUID();

  const superAdminActor: Actor = {
    userId: superAdminUserId,
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const contentWorkerActor: Actor = {
    userId: contentWorkerUserId,
    role: "content_worker",
    globalRole: "content_worker",
  };

  const teacherActor: Actor = {
    userId: teacherUserId,
    role: "teacher",
    globalRole: null,
  };

  const studentActor: Actor = {
    userId: studentUserId,
    role: "student",
    globalRole: null,
  };

  let orgStore: InMemoryOrganizationStore;
  let userStore: InMemoryUserStore;
  let courseStore: InMemoryCourseStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let docChunkStore: InMemoryDocumentChunkStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let genCitationStore: InMemoryGeneratedContentCitationStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let adminStore: InMemoryAdminStore;
  let storageProvider: FakeStorageProvider;
  let queue: FakeGenerationQueue;

  let documentService: DocumentService;
  let courseService: CourseService;
  let learningService: LearningService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let queryService: GenerationQueryService;

  beforeEach(async () => {
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore();
    courseStore = new InMemoryCourseStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    docChunkStore = new InMemoryDocumentChunkStore();
    genContentStore = new InMemoryGeneratedContentStore();
    genCitationStore = new InMemoryGeneratedContentCitationStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    adminStore = new InMemoryAdminStore();
    storageProvider = new FakeStorageProvider();
    queue = new FakeGenerationQueue();

    // Create system organization with super admin
    await orgStore.createWithAdminMembership({
      organization: {
        id: systemOrgId,
        name: "AVANA Canonical System",
        slug: "system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: superAdminUserId,
        role: "platform_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Create an unrelated organization
    await orgStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "Other School Org",
        slug: "other-school",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: otherOrgId,
        userId: teacherUserId,
        role: "teacher",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Memberships on system org
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: contentWorkerUserId,
      role: "content_worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: teacherUserId,
      role: "teacher",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: studentUserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const commerceStore = new InMemoryCommerceStore();
    const entitlementService = new EntitlementService({
      commerceStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
    });

    // Setup services
    documentService = new DocumentService(
      documentStore,
      storageProvider,
      orgStore,
      defaultPolicy,
      undefined,
      docChunkStore,
      genContentStore,
      undefined,
      flashcardStore,
      quizStore,
      courseStore,
      moduleStore,
      lessonStore,
      entitlementService,
      systemOrgId,
    );

    courseService = new CourseService(
      courseStore,
      async (actor, organizationId) => {
        if (actor.role === "platform_admin" || actor.globalRole === "platform_admin") {
          return { role: "platform_admin" };
        }
        if (organizationId === systemOrgId && actor.globalRole === "content_worker") {
          return { role: "content_worker" };
        }
        const m = await orgStore.findMembership(organizationId, actor.userId);
        if (!m) throw new DomainError("not_found", "Organization not found");
        return m;
      },
      defaultPolicy,
      undefined,
      systemOrgId,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      documentStore,
      genContentStore,
      new InMemoryCoursePublicationStore(),
      quizStore,
      flashcardStore,
      orgStore,
      userStore,
    );

    learningService = new LearningService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
      new InMemoryProgressStore(),
      defaultPolicy,
      undefined,
      systemOrgId,
      entitlementService,
    );

    const progressService = new GenerationProgressService(new InMemoryGenerationProgressStore());

    queryService = new GenerationQueryService(
      documentStore,
      new InMemoryGenerationChunkStore(),
      progressService,
      undefined,
      orgStore,
      defaultPolicy,
      systemOrgId,
    );

    reviewService = new ReviewService(
      genContentStore,
      genCitationStore,
      documentStore,
      docChunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      queue,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      orgStore,
      undefined,
      undefined,
      undefined,
      systemOrgId,
    );

    officialContentService = new OfficialContentService(
      undefined as any,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      genContentStore,
      undefined as any,
      reviewService,
      adminStore,
      systemOrgId,
    );
  });

  function createCourse(course: any) {
    return courseStore.create({ course, auditEvents: [] });
  }

  // -------------------------------------------------------------------------
  // Scenario A: Super Admin creates content; Content Admin views & lists all
  // -------------------------------------------------------------------------
  it("Scenario A: Content Admin can list, view, and inspect courses, chapters, documents, and lessons created by Super Admin while preserving creator attribution", async () => {
    // 1. Super Admin creates course
    const course = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Super Admin Created Course",
      description: "Official comprehensive guide",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Super admin creates sub course group & module
    const group = await subCourseGroupStore.create({
      id: randomUUID() as SubCourseGroupId,
      courseId: course.id,
      title: "Module Group 1",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const mod = await moduleStore.create({
      id: randomUUID() as ModuleId,
      courseId: course.id,
      subCourseGroupId: group.id,
      title: "Chapter 1",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 3. Super admin uploads document
    const doc = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: systemOrgId,
      courseId: course.id,
      ownerUserId: superAdminUserId,
      filename: "super_admin_curriculum.pdf",
      originalName: "Super Admin Curriculum.pdf",
      mimeType: "application/pdf",
      byteSize: 10240,
      storageKey: `docs/${systemOrgId}/curriculum.pdf`,
      status: "ready",
      parsedText: "Document text content for AI generation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 4. Super admin creates draft lesson
    const lesson = await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId: mod.id,
      title: "Lesson 1: Introduction",
      sortOrder: 1,
      publicationStatus: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 5. Generated AI draft item for review
    const genContent = await genContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: systemOrgId,
      documentId: doc.id,
      courseId: course.id,
      type: "flashcards",
      status: "draft",
      title: "Generated Chapter 1 Flashcards",
      data: { cards: [{ front: "Q1", back: "A1" }] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Now Content Admin enters the course
    // Verification A1: Content Admin lists documents - MUST see doc created by Super Admin!
    const docList = await documentService.listDocuments(contentWorkerActor, systemOrgId, { courseId: course.id });
    expect(docList.items).toHaveLength(1);
    expect(docList.items[0].id).toBe(doc.id);
    expect(docList.items[0].owner_user_id).toBe(superAdminUserId); // Ownership field preserved!

    // Verification A2: Content Admin gets document stats
    const stats = await documentService.getDocumentStats(contentWorkerActor, systemOrgId);
    expect(stats.total_count).toBe(1);
    expect(stats.status_counts["ready"]).toBe(1);

    // Verification A3: Content Admin downloads/inspects document (no paywall error)
    const download = await documentService.downloadDocument(contentWorkerActor, systemOrgId, doc.id);
    expect(download.originalName).toBe("Super Admin Curriculum.pdf");

    // Verification A4: Content Admin views course details
    const courseDetail = await courseService.getCourse(contentWorkerActor, systemOrgId, course.id);
    expect(courseDetail.id).toBe(course.id);
    expect(courseDetail.name).toBe("Super Admin Created Course");

    // Verification A5: Content Admin gets course structure (sees chapters & lessons)
    const structure = await courseService.getCourseStructure(contentWorkerActor, systemOrgId, course.id);
    expect(structure.chapters).toHaveLength(1);
    expect(structure.chapters[0].modules).toHaveLength(1);
    expect(structure.chapters[0].modules[0].lessons).toHaveLength(1);
    expect(structure.chapters[0].modules[0].lessons[0].id).toBe(lesson.id);

    // Verification A6: Content Admin accesses learning hierarchy and sees draft lessons
    const learningHierarchy = await learningService.getCourseLearning(
      contentWorkerActor,
      course.id,
      "req-1",
    );
    expect(learningHierarchy.modules).toHaveLength(1);
    expect(learningHierarchy.modules[0].lessons).toHaveLength(1);
    expect(learningHierarchy.modules[0].lessons[0].id).toBe(lesson.id);

    // Verification A7: Content Admin reviews AI generated draft in Review Queue
    const queueItems = await reviewService.reviewQueue(contentWorkerActor, systemOrgId, course.id, "req-queue");
    expect(queueItems.pending).toHaveLength(1);
    expect(queueItems.pending[0].id).toBe(genContent.id);

    // Verification A8: Content Admin views document progress
    const progress = await queryService.getDocumentGenerationProgress(contentWorkerActor, systemOrgId, doc.id);
    expect(progress.documentId).toBe(doc.id);
  });

  // -------------------------------------------------------------------------
  // Scenario B: Permissions Boundaries — Content Admin cannot publish or set pricing
  // -------------------------------------------------------------------------
  it("Scenario B: Content Admin has edit/structure permissions but cannot publish or set pricing", async () => {
    const course = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Biology 101",
      description: "Official biology course",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker can update metadata/structure
    const updated = await courseService.updateCourse(contentWorkerActor, systemOrgId, course.id, {
      title: "Biology 101 - Updated Title",
    });
    expect(updated.name).toBe("Biology 101 - Updated Title");

    // Content worker CANNOT publish the official course (requires requireAdmin)
    await expect(
      officialContentService.publishOfficialCourse(contentWorkerActor, course.id),
    ).rejects.toThrowError(/دسترسی مدیریت/);

    // Content worker CANNOT update pricing (requires requireAdmin)
    await expect(
      officialContentService.setProductPricing(contentWorkerActor, course.id, {
        price: 250000,
      }),
    ).rejects.toThrowError(/دسترسی مدیریت/);
  });

  // -------------------------------------------------------------------------
  // Scenario C: Multi-tenant boundary isolation
  // -------------------------------------------------------------------------
  it("Scenario C: Content Admin cannot view documents, courses, or structures of another unauthorized organization", async () => {
    // Super admin creates a course and document in otherOrgId
    const foreignCourse = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: otherOrgId,
      name: "Private School Math",
      description: "Non-system course",
      isOfficial: false,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const foreignDoc = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: otherOrgId,
      courseId: foreignCourse.id,
      ownerUserId: superAdminUserId,
      filename: "foreign_private.pdf",
      originalName: "Foreign Private.pdf",
      mimeType: "application/pdf",
      byteSize: 5000,
      storageKey: `docs/${otherOrgId}/private.pdf`,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker is NOT a member of otherOrgId
    // Attempting to list documents in otherOrgId throws not_found
    await expect(
      documentService.listDocuments(contentWorkerActor, otherOrgId),
    ).rejects.toThrowError(/Organization not found/);

    // Attempting to download foreign document throws not_found
    await expect(
      documentService.downloadDocument(contentWorkerActor, otherOrgId, foreignDoc.id),
    ).rejects.toThrowError(/Organization not found/);

    // Attempting to get foreign course details throws not_found
    await expect(
      courseService.getCourse(contentWorkerActor, otherOrgId, foreignCourse.id),
    ).rejects.toThrowError(/Organization not found|Course not found/);
  });

  // -------------------------------------------------------------------------
  // Scenario D: Student and Teacher access must NOT be inflated
  // -------------------------------------------------------------------------
  it("Scenario D: Students and teachers cannot see unpublished official courses or admin document lists", async () => {
    const draftOfficialCourse = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Secret Draft Course",
      description: "Under preparation",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const adminDoc = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: systemOrgId,
      courseId: draftOfficialCourse.id,
      ownerUserId: superAdminUserId,
      filename: "exam_source.pdf",
      originalName: "Exam Source.pdf",
      mimeType: "application/pdf",
      byteSize: 3000,
      storageKey: `docs/${systemOrgId}/exam.pdf`,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Student cannot access draft official course structure
    await expect(
      courseService.getCourseStructure(studentActor, systemOrgId, draftOfficialCourse.id),
    ).rejects.toThrowError(/Course not found/);

    // Student cannot access learning hierarchy of draft official course
    await expect(
      learningService.getCourseLearning(studentActor, draftOfficialCourse.id, "req-s"),
    ).rejects.toThrowError(/Course not found/);

    // Student listing documents receives only their own documents (0 here)
    const studentDocList = await documentService.listDocuments(
      studentActor,
      systemOrgId,
      { courseId: draftOfficialCourse.id },
    );
    expect(studentDocList.items).toHaveLength(0);

    // Teacher cannot access draft official course
    await expect(
      courseService.getCourse(teacherActor, systemOrgId, draftOfficialCourse.id),
    ).rejects.toThrowError(/Course not found/);

    // Teacher cannot download admin document
    await expect(
      documentService.downloadDocument(teacherActor, systemOrgId, adminDoc.id),
    ).rejects.toThrowError(/برای دانلود و مشاهده این سند/);
  });

  // -------------------------------------------------------------------------
  // Scenario E: Legacy resources with null createdBy or other admins
  // -------------------------------------------------------------------------
  it("Scenario E: Resources with null createdBy or created by other admins are accessible to content workers", async () => {
    const anotherAdminId = randomUUID();

    const legacyCourse = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Legacy Course",
      description: "Created in v1 without explicit creatorUserId",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: null as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const legacyDoc = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: systemOrgId,
      courseId: legacyCourse.id,
      ownerUserId: anotherAdminId,
      filename: "legacy_content.pdf",
      originalName: "Legacy Content.pdf",
      mimeType: "application/pdf",
      byteSize: 4000,
      storageKey: `docs/${systemOrgId}/legacy.pdf`,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker can view and list legacy course and document
    const courseRes = await courseService.getCourse(contentWorkerActor, systemOrgId, legacyCourse.id);
    expect(courseRes.id).toBe(legacyCourse.id);

    const docs = await documentService.listDocuments(contentWorkerActor, systemOrgId, { courseId: legacyCourse.id });
    expect(docs.items).toHaveLength(1);
    expect(docs.items[0].id).toBe(legacyDoc.id);
    expect(docs.items[0].owner_user_id).toBe(anotherAdminId);
  });

  // -------------------------------------------------------------------------
  // Scenario F: Delete, Publish, and User Management remain restricted
  // -------------------------------------------------------------------------
  it("Scenario F: Content Admin cannot permanently delete courses (requireAdmin enforced)", async () => {
    const officialCourse = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Course To Delete",
      description: "Attempting deletion by content worker",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker deletion attempt MUST fail with 403 forbidden
    await expect(
      officialContentService.deleteOfficialCourse(contentWorkerActor, officialCourse.id, {
        confirmationName: "Course To Delete",
      }),
    ).rejects.toThrowError(/دسترسی مدیریت به استودیوی محتوای رسمی لازم است/);

    // Super Admin CAN delete the official course
    const deleteResult = await officialContentService.deleteOfficialCourse(
      superAdminActor,
      officialCourse.id,
      {
        confirmationName: "Course To Delete",
      },
    );
    expect(deleteResult.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario G: Consistency across list, detail, and hierarchy endpoints
  // -------------------------------------------------------------------------
  it("Scenario G: Consistent visibility across listDocuments, getDocumentStats, getCourse, and getCourseStructure", async () => {
    const course = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Consistency Check Course",
      description: "Validating parity across endpoints",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const doc1 = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: systemOrgId,
      courseId: course.id,
      ownerUserId: superAdminUserId,
      filename: "doc1.pdf",
      originalName: "Doc 1.pdf",
      mimeType: "application/pdf",
      byteSize: 1000,
      storageKey: `docs/${systemOrgId}/doc1.pdf`,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const doc2 = await documentStore.create({
      id: randomUUID() as DocumentId,
      organizationId: systemOrgId,
      courseId: course.id,
      ownerUserId: superAdminUserId,
      filename: "doc2.pdf",
      originalName: "Doc 2.pdf",
      mimeType: "application/pdf",
      byteSize: 2000,
      storageKey: `docs/${systemOrgId}/doc2.pdf`,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const listRes = await documentService.listDocuments(contentWorkerActor, systemOrgId, { courseId: course.id });
    const statsRes = await documentService.getDocumentStats(contentWorkerActor, systemOrgId);

    expect(listRes.items.map((d) => d.id).sort()).toEqual([doc1.id, doc2.id].sort());
    expect(statsRes.total_count).toBe(2);
    expect(statsRes.status_counts["ready"]).toBe(2);

    const courseRes = await courseService.getCourse(contentWorkerActor, systemOrgId, course.id);
    const structRes = await courseService.getCourseStructure(contentWorkerActor, systemOrgId, course.id);

    expect(courseRes.id).toBe(course.id);
    expect(structRes.course.id).toBe(course.id);
  });

  // -------------------------------------------------------------------------
  // Scenario H: Membership revocation restricts access immediately
  // -------------------------------------------------------------------------
  it("Scenario H: Membership revocation or role loss immediately denies content worker access", async () => {
    const course = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Revocation Test Course",
      description: "Testing access revocation",
      isOfficial: true,
      status: "draft",
      visibility: "draft",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Content worker currently has access
    const courseBefore = await courseService.getCourse(contentWorkerActor, systemOrgId, course.id);
    expect(courseBefore.id).toBe(course.id);

    // Revoke content worker's membership from systemOrgId
    orgStore.clearMembershipsForUser(contentWorkerUserId);

    // Actor object without system membership or with revoked role
    const revokedActor: Actor = {
      userId: contentWorkerUserId,
      role: "student",
      globalRole: null,
    };

    // Immediately rejected with 404 / access denied on draft official course
    await expect(
      courseService.getCourse(revokedActor, systemOrgId, course.id),
    ).rejects.toThrowError(/Organization not found|Course not found/);
  });

  // -------------------------------------------------------------------------
  // Scenario I: Official Course Archiving Permissions (Positive & Negative)
  // -------------------------------------------------------------------------
  it("Scenario I: archiveOfficialCourse requires admin; content_worker is blocked while platform_admin succeeds", async () => {
    const course = await createCourse({
      id: randomUUID() as CourseId,
      organizationId: systemOrgId,
      name: "Course for Archiving Test",
      description: "Testing archiving permission boundaries",
      isOfficial: true,
      status: "published",
      visibility: "public",
      creatorUserId: superAdminUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Negative: content_worker, student, and teacher CANNOT archive official course (requires requireAdmin)
    await expect(
      officialContentService.archiveOfficialCourse(contentWorkerActor, course.id),
    ).rejects.toThrowError(/دسترسی مدیریت به استودیوی محتوای رسمی لازم است/);

    await expect(
      officialContentService.archiveOfficialCourse(studentActor, course.id),
    ).rejects.toThrowError(/دسترسی مدیریت به استودیوی محتوای رسمی لازم است/);

    await expect(
      officialContentService.archiveOfficialCourse(teacherActor, course.id),
    ).rejects.toThrowError(/دسترسی مدیریت به استودیوی محتوای رسمی لازم است/);

    // Positive: platform_admin CAN archive official course
    const archiveResult = await officialContentService.archiveOfficialCourse(superAdminActor, course.id);
    expect(archiveResult.success).toBe(true);
    expect(archiveResult.course.status).toBe("archived");
  });

  // -------------------------------------------------------------------------
  // Scenario J: Detailed 6-State Matrix of Membership and GlobalRole
  // -------------------------------------------------------------------------
  describe("Scenario J: 6-State Matrix of Membership and GlobalRole", () => {
    let testDoc: any;
    let testCourse: any;

    beforeEach(async () => {
      testCourse = await createCourse({
        id: randomUUID() as CourseId,
        organizationId: systemOrgId,
        name: "Matrix Official Course",
        isOfficial: true,
        status: "draft",
        visibility: "draft",
        creatorUserId: superAdminUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      testDoc = await documentStore.create({
        id: randomUUID() as DocumentId,
        organizationId: systemOrgId,
        courseId: testCourse.id,
        ownerUserId: superAdminUserId,
        filename: "matrix_doc.pdf",
        originalName: "Matrix Doc.pdf",
        mimeType: "application/pdf",
        byteSize: 1024,
        storageKey: `docs/${systemOrgId}/matrix.pdf`,
        status: "ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    });

    it("State 1: content_worker with valid system org membership -> has access", async () => {
      const actor: Actor = {
        userId: contentWorkerUserId,
        role: "content_worker",
        globalRole: "content_worker",
      };
      const docs = await documentService.listDocuments(actor, systemOrgId, { courseId: testCourse.id });
      expect(docs.items).toHaveLength(1);
      expect(docs.items[0].id).toBe(testDoc.id);
    });

    it("State 2: Org membership removed while globalRole remains content_worker -> retains content_worker on system org per globalRole policy", async () => {
      // Remove explicit membership record from systemOrgId
      orgStore.clearMembershipsForUser(contentWorkerUserId);

      const actor: Actor = {
        userId: contentWorkerUserId,
        role: "student",
        globalRole: "content_worker",
      };

      // By AVANA policy: globalRole="content_worker" evaluates against systemOrganizationId
      // as isSystemResource=true, so getMembershipRole returns "content_worker" and listDocuments succeeds!
      const docs = await documentService.listDocuments(actor, systemOrgId, { courseId: testCourse.id });
      expect(docs.items).toHaveLength(1);
      expect(docs.items[0].id).toBe(testDoc.id);
    });

    it("State 3: globalRole revoked while no org membership exists -> strictly drops to student view with 0 admin docs", async () => {
      orgStore.clearMembershipsForUser(contentWorkerUserId);

      const actor: Actor = {
        userId: contentWorkerUserId,
        role: "student",
        globalRole: null,
      };

      // Actor is now a pure unprivileged student without membership.
      // In DocumentService: getMembershipRole returns null (not isPrivileged).
      // Fallback query is listByOwner(systemOrgId, actor.userId).
      // Super admin's document is NOT returned!
      const docs = await documentService.listDocuments(actor, systemOrgId);
      expect(docs.items).toHaveLength(0);

      // And attempting to get unpublished official course structure throws DomainError
      await expect(
        courseService.getCourseStructure(actor, systemOrgId, testCourse.id),
      ).rejects.toThrowError(/Course not found|Organization not found/);
    });

    it("State 4: content_worker attempting access to non-system org without membership -> denied", async () => {
      const actor: Actor = {
        userId: contentWorkerUserId,
        role: "content_worker",
        globalRole: "content_worker",
      };

      // Accessing otherOrgId where user has NO membership
      await expect(
        documentService.listDocuments(actor, otherOrgId),
      ).rejects.toThrowError(/Organization not found/);
    });

    it("State 5: Valid membership in non-system org with appropriate org role -> granted within that org only", async () => {
      const nonSystemUserId = randomUUID();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: otherOrgId,
        userId: nonSystemUserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const foreignActor: Actor = {
        userId: nonSystemUserId,
        role: "organization_admin",
        globalRole: null,
      };

      // Allowed in otherOrgId
      const otherDocs = await documentService.listDocuments(foreignActor, otherOrgId);
      expect(Array.isArray(otherDocs.items)).toBe(true);

      // In systemOrgId, user has no membership and no globalRole -> drops to student view with 0 admin docs
      const systemDocs = await documentService.listDocuments(foreignActor, systemOrgId);
      expect(systemDocs.items).toHaveLength(0);

      // And accessing draft official course in systemOrgId is denied
      await expect(
        courseService.getCourse(foreignActor, systemOrgId, testCourse.id),
      ).rejects.toThrowError(/Course not found|Organization not found/);
    });

    it("State 6: Direct ID lookup to resource belonging to another org throws not_found", async () => {
      const foreignCourse = await createCourse({
        id: randomUUID() as CourseId,
        organizationId: otherOrgId,
        name: "Foreign Math",
        isOfficial: false,
        status: "draft",
        visibility: "draft",
        creatorUserId: teacherUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const foreignDoc = await documentStore.create({
        id: randomUUID() as DocumentId,
        organizationId: otherOrgId,
        courseId: foreignCourse.id,
        ownerUserId: teacherUserId,
        filename: "foreign.pdf",
        originalName: "Foreign.pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        storageKey: `docs/${otherOrgId}/foreign.pdf`,
        status: "ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Attempting to access foreignDoc directly with systemOrgId or otherOrgId
      await expect(
        documentService.getDocument(contentWorkerActor, systemOrgId, foreignDoc.id),
      ).rejects.toThrowError(/Document not found/);

      await expect(
        documentService.getDocument(contentWorkerActor, otherOrgId, foreignDoc.id),
      ).rejects.toThrowError(/Organization not found|Document not found/);
    });
  });
});
