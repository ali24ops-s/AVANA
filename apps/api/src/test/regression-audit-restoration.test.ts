import { describe, it, expect, vi } from "vitest";
import {
  getEstedadFontBase64,
  getVazirmatnFontBase64,
  getAvanaLogoBase64,
  renderLessonPdfHtml,
} from "../modules/admin/pdf-template.js";
import { DocumentProcessingService } from "../modules/documents/document-processing-service.js";
import { DocumentService } from "../modules/documents/document-service.js";
import {
  defaultPolicy,
  type DocumentRecord,
  type OrganizationRecord,
  type UserRecord,
  type CourseRecord,
  type Actor,
  DomainError,
} from "@avana/domain";
import { InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";

const mockStorage: StorageProvider = {
  save: vi.fn(async () => {}),
  read: vi.fn(async () => Buffer.from("Mock document content for test")),
  delete: vi.fn(async () => {}),
  exists: vi.fn(async () => true),
  getUrl: vi.fn(async (key: string) => `https://storage.local/${key}`),
};

describe("Production Regression Audit & Restoration Suite", () => {
  describe("1. PDF Font, Brand & Template Stability", () => {
    it("getEstedadFontBase64 returns font string or falls back gracefully without throwing", () => {
      expect(() => {
        const font = getEstedadFontBase64();
        expect(typeof font).toBe("string");
      }).not.toThrow();
    });

    it("getVazirmatnFontBase64 returns a string without throwing", () => {
      expect(() => {
        const font = getVazirmatnFontBase64();
        expect(typeof font).toBe("string");
      }).not.toThrow();
    });

    it("getAvanaLogoBase64 returns logo or empty fallback without throwing", () => {
      expect(() => {
        const logo = getAvanaLogoBase64();
        expect(typeof logo).toBe("string");
      }).not.toThrow();
    });

    it("renderLessonPdfHtml generates complete HTML with RTL and font-family", () => {
      const html = renderLessonPdfHtml({
        title: "درس فیزیولوژی سلولی",
        courseName: "زیست‌شناسی پایه",
        moduleTitle: "فصل اول",
        generationDate: "۱۴۰۳/۰۸/۲۴",
        contentMarkdown: "# مقدمه\nاین یک متن تستی برای راستی‌آزمایی خروجی PDF است.",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("dir=\"rtl\"");
      expect(html).toContain("درس فیزیولوژی سلولی");
      expect(html).toContain("زیست‌شناسی پایه");
      expect(html).toContain("font-family: 'Estedad'");
    });
  });

  describe("2. Document Extraction Authorization & Idempotency", () => {
    const orgId = "00000000-0000-0000-0000-000000000001" as any;
    const systemOrgId = "00000000-0000-0000-0000-000000000099" as any;
    const docId = "00000000-0000-0000-0000-000000000010" as any;

    it("allows platform_admin to authorize and process document even without tenant membership", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const orgStore = new InMemoryOrganizationStore();

      orgStore.addOrganization({
        id: orgId,
        name: "دانشگاه علوم پزشکی تهران",
        slug: "tums",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const docRecord: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId: null,
        ownerUserId: "00000000-0000-0000-0000-000000000050" as any,
        originalName: "syllabus.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
        sha256: "a".repeat(64),
        storageKey: "uploads/test.txt",
        pageCount: null,
        status: "uploaded",
        errorCode: null,
        retryCount: 0,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await docStore.create(docRecord);

      const processingService = new DocumentProcessingService(
        docStore,
        chunkStore,
        mockStorage,
        defaultPolicy,
        undefined,
        orgStore,
        undefined,
        undefined,
        undefined,
        systemOrgId,
      );

      const platformAdminActor: Actor = {
        userId: "00000000-0000-0000-0000-000000000099" as any,
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      const result = await processingService.processDocument(
        platformAdminActor,
        orgId,
        docId,
      );

      expect(result.status).toBe("extracted");
      expect(result.chunk_count).toBeGreaterThan(0);
    });

    it("prevents duplicate concurrent jobs when status is already extracting", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const orgStore = new InMemoryOrganizationStore();

      orgStore.addOrganization({
        id: orgId,
        name: "دانشگاه علوم پزشکی تهران",
        slug: "tums",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const docRecord: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId: null,
        ownerUserId: "00000000-0000-0000-0000-000000000050" as any,
        originalName: "syllabus.txt",
        mimeType: "text/plain",
        sizeBytes: 100,
        sha256: "b".repeat(64),
        storageKey: "uploads/test.txt",
        pageCount: null,
        status: "extracting",
        errorCode: null,
        retryCount: 0,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await docStore.create(docRecord);

      const processingService = new DocumentProcessingService(
        docStore,
        chunkStore,
        mockStorage,
        defaultPolicy,
        undefined,
        orgStore,
        undefined,
        undefined,
        undefined,
        systemOrgId,
      );

      const actor: Actor = {
        userId: "00000000-0000-0000-0000-000000000099" as any,
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      const result = await processingService.processDocument(actor, orgId, docId);
      // Status remains extracting without running new extraction or duplicate chunks
      expect(result.status).toBe("extracting");
    });
  });

  describe("3. Multi-Course Document Deduplication Isolation", () => {
    it("allows uploading the same file hash into Course A and Course B within same org", async () => {
      const docStore = new InMemoryDocumentStore();
      const orgStore = new InMemoryOrganizationStore();
      const courseStore = new InMemoryCourseStore();

      const orgId = "00000000-0000-0000-0000-000000000001" as any;
      const courseA = "00000000-0000-0000-0000-000000000101" as any;
      const courseB = "00000000-0000-0000-0000-000000000102" as any;
      const actorUserId = "00000000-0000-0000-0000-000000000020" as any;

      orgStore.addOrganization({
        id: orgId,
        name: "دانشگاه تهران",
        slug: "ut",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
      orgStore.addMembership({
        id: "00000000-0000-0000-0000-000000000088" as any,
        organizationId: orgId,
        userId: actorUserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await courseStore.create({
        course: {
          id: courseA,
          organizationId: orgId,
          name: "دوره الف",
          slug: "course-a",
          status: "published",
          isOfficial: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        } as any,
        auditEvents: [],
      });

      await courseStore.create({
        course: {
          id: courseB,
          organizationId: orgId,
          name: "دوره ب",
          slug: "course-b",
          status: "published",
          isOfficial: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        } as any,
        auditEvents: [],
      });

      const docService = new DocumentService(
        docStore,
        mockStorage,
        orgStore,
        defaultPolicy,
        undefined,
        new InMemoryDocumentChunkStore(),
        undefined,
        undefined,
        undefined,
        undefined,
        courseStore,
      );

      const actor: Actor = {
        userId: actorUserId,
        role: "organization_admin",
        memberships: [{ organizationId: orgId, role: "organization_admin" }],
      };

      const fileData = Buffer.from("Shared syllabus content across courses");

      // 1. Upload into Course A
      const resA = await docService.confirmUpload(actor, orgId, {
        originalName: "syllabus.txt",
        mimeType: "text/plain",
        sizeBytes: fileData.length,
        data: fileData,
        courseId: courseA,
      });

      expect(resA.duplicate).toBe(false);
      expect(resA.document.course_id).toBe(courseA);

      // 2. Upload identical file into Course B
      const resB = await docService.confirmUpload(actor, orgId, {
        originalName: "syllabus.txt",
        mimeType: "text/plain",
        sizeBytes: fileData.length,
        data: fileData,
        courseId: courseB,
      });

      // Course B gets its own document record attached to Course B!
      expect(resB.duplicate).toBe(false);
      expect(resB.document.course_id).toBe(courseB);
      expect(resB.document.id).not.toBe(resA.document.id);

      // 3. Re-uploading into Course A again detects genuine duplicate in Course A
      const resA2 = await docService.confirmUpload(actor, orgId, {
        originalName: "syllabus.txt",
        mimeType: "text/plain",
        sizeBytes: fileData.length,
        data: fileData,
        courseId: courseA,
      });

      expect(resA2.duplicate).toBe(true);
      expect(resA2.document.id).toBe(resA.document.id);
    });
  });

  describe("4. Role Security Matrix (platform_admin, course_editor, content_worker, student)", () => {
    const tenantOrgId = "00000000-0000-0000-0000-000000000001" as any;
    const systemOrgId = "00000000-0000-0000-0000-000000000099" as any;
    const docId = "00000000-0000-0000-0000-000000000010" as any;

    it("allows content_worker to process documents on system resources", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const orgStore = new InMemoryOrganizationStore();

      orgStore.addOrganization({
        id: systemOrgId,
        name: "سازمان رسمی آوانا",
        slug: "avana-system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await docStore.create({
        id: docId,
        organizationId: systemOrgId,
        courseId: null,
        ownerUserId: "00000000-0000-0000-0000-000000000050" as any,
        originalName: "system-text.txt",
        mimeType: "text/plain",
        sizeBytes: 50,
        sha256: "c".repeat(64),
        storageKey: "uploads/system.txt",
        pageCount: null,
        status: "uploaded",
        errorCode: null,
        retryCount: 0,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const processingService = new DocumentProcessingService(
        docStore,
        chunkStore,
        mockStorage,
        defaultPolicy,
        undefined,
        orgStore,
        undefined,
        undefined,
        undefined,
        systemOrgId,
      );

      const contentWorkerActor: Actor = {
        userId: "00000000-0000-0000-0000-000000000033" as any,
        role: "content_worker",
        globalRole: "content_worker",
      };

      const status = await processingService.processDocument(
        contentWorkerActor,
        systemOrgId,
        docId,
      );
      expect(status.status).toBe("extracted");
    });

    it("rejects regular student from processing document with 403 Forbidden", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const orgStore = new InMemoryOrganizationStore();

      orgStore.addOrganization({
        id: tenantOrgId,
        name: "دانشگاه صنعتی شریف",
        slug: "sharif",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await docStore.create({
        id: docId,
        organizationId: tenantOrgId,
        courseId: null,
        ownerUserId: "00000000-0000-0000-0000-000000000050" as any,
        originalName: "private.txt",
        mimeType: "text/plain",
        sizeBytes: 50,
        sha256: "d".repeat(64),
        storageKey: "uploads/private.txt",
        pageCount: null,
        status: "uploaded",
        errorCode: null,
        retryCount: 0,
        qualityScore: null,
        qualityLevel: null,
        qualityReport: null,
        qualityAnalyzedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const processingService = new DocumentProcessingService(
        docStore,
        chunkStore,
        mockStorage,
        defaultPolicy,
        undefined,
        orgStore,
        undefined,
        undefined,
        undefined,
        systemOrgId,
      );

      const studentActor: Actor = {
        userId: "00000000-0000-0000-0000-000000000077" as any,
        role: "student",
      };

      await expect(
        processingService.processDocument(studentActor, tenantOrgId, docId),
      ).rejects.toThrow(DomainError);
    });
  });
});
