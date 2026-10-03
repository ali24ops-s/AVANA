import {
  DomainError,
  asUserId,
  asOrganizationId,
  defaultPolicy,
  detectExternalVideoProvider,
  validateCreateClassroomContentInput,
  validateUpdateClassroomContentInput,
  type Actor,
  type AuthorizationPolicy,
  type Classroom,
  type ClassroomContent,
} from "@avana/domain";
import type {
  ClassroomContentStore,
  ClassroomStore,
  ClassroomMemberStore,
} from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { UserStore } from "../../identity/user-store.js";
import type { StorageProvider } from "../../storage/index.js";

export class ClassroomContentService {
  constructor(
    private readonly contentStore: ClassroomContentStore,
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
    private readonly organizationStore: OrganizationStore,
    public readonly userStore?: UserStore,
    public readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly storageProvider?: StorageProvider,
  ) {}

  /**
   * Helper: extracts relative storage key from a content file URL or key string.
   */
  public extractStorageKey(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith("classroom-contents/")) return url;
    const match = url.match(/\/contents\/files\/(.+)$/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
    return null;
  }

  /**
   * Helper: checks if actor has teacher access to a specific classroom.
   * Enforces: platform_admin bypass OR org_admin in same tenant OR teacher owner.
   */
  async assertTeacherClassroomAccess(
    actor: Actor,
    classroomId: string,
  ): Promise<Classroom> {
    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return classroom;
    }

    // Teacher ownership check
    if (classroom.teacherId === actor.userId) {
      return classroom;
    }

    // Tenant organization admin check
    const membership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );

    if (membership && membership.role === "organization_admin") {
      return classroom;
    }

    // IDOR protection: return not_found instead of forbidden for security
    throw new DomainError("not_found", "کلاس یافت نشد");
  }

  /**
   * Verifies if an actor is authorized to download or view an educational content file.
   * Allowed if:
   * 1. Platform admin.
   * 2. The teacher who created/owns the classroom (or tenant org admin).
   * 3. An active student enrolled in the classroom where the content is published.
   */
  async verifyContentFileAccess(
    actor: Actor,
    storageKey: string,
  ): Promise<void> {
    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return;
    }

    const content = await this.contentStore.findByFileUrl(storageKey);
    if (!content) {
      throw new DomainError(
        "forbidden",
        "شما اجازه دسترسی به این فایل آموزشی را ندارید.",
      );
    }

    // Teacher check
    const classroom = await this.classroomStore.getById(content.classroomId);
    if (!classroom) {
      throw new DomainError(
        "forbidden",
        "شما اجازه دسترسی به این فایل آموزشی را ندارید.",
      );
    }

    if (classroom.teacherId === actor.userId) {
      return;
    }

    const orgMembership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );
    if (orgMembership && orgMembership.role === "organization_admin") {
      return;
    }

    // Student check: must be active member and content must be published
    if (content.status !== "published") {
      throw new DomainError(
        "forbidden",
        "محتوای آموزشی هنوز منتشر نشده است.",
      );
    }

    const membership = await this.memberStore.getMembership(
      content.classroomId,
      actor.userId,
    );
    if (membership && membership.status === "active") {
      return;
    }

    throw new DomainError(
      "forbidden",
      "شما اجازه دسترسی به این فایل آموزشی را ندارید.",
    );
  }

  // -------------------------------------------------------------------------
  // Teacher Operations
  // -------------------------------------------------------------------------

  /**
   * Creates a new educational content item for a classroom.
   */
  async createContent(
    actor: Actor,
    classroomId: string,
    raw: unknown,
  ): Promise<ClassroomContent> {
    await this.assertTeacherClassroomAccess(actor, classroomId);

    const input = validateCreateClassroomContentInput({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      classroomId,
    });

    let videoProvider: "google_drive" | "generic" | null = null;
    let videoEmbedUrl: string | null = null;

    if (input.contentType === "video_external" && input.externalUrl) {
      const videoInfo = detectExternalVideoProvider(input.externalUrl);
      videoProvider = videoInfo.provider;
      videoEmbedUrl = videoInfo.embedUrl;
    }

    const now = new Date().toISOString();
    const content = await this.contentStore.create({
      id: crypto.randomUUID(),
      classroomId,
      teacherId: actor.userId,
      title: input.title,
      description: input.description ?? null,
      contentType: input.contentType,
      textContent: input.textContent ?? null,
      fileUrl: input.fileUrl ?? null,
      fileName: input.fileName ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      mimeType: input.mimeType ?? null,
      externalUrl: input.externalUrl ?? null,
      videoProvider,
      videoEmbedUrl,
      status: input.status ?? "draft",
      publishedAt: input.status === "published" ? now : null,
      archivedAt: null,
    });

    return content;
  }

  /**
   * Lists all contents in a classroom for the authorized teacher.
   */
  async listTeacherClassroomContents(
    actor: Actor,
    classroomId: string,
  ): Promise<ClassroomContent[]> {
    await this.assertTeacherClassroomAccess(actor, classroomId);
    return this.contentStore.listByClassroom(classroomId);
  }

  /**
   * Gets detail of a content item for teacher.
   */
  async getTeacherContentDetails(
    actor: Actor,
    contentId: string,
  ): Promise<ClassroomContent> {
    const content = await this.contentStore.getById(contentId);
    if (!content) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }
    await this.assertTeacherClassroomAccess(actor, content.classroomId);
    return content;
  }

  /**
   * Updates an existing content item.
   */
  async updateContent(
    actor: Actor,
    contentId: string,
    raw: unknown,
  ): Promise<ClassroomContent> {
    const existing = await this.contentStore.getById(contentId);
    if (!existing) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, existing.classroomId);

    const patch = validateUpdateClassroomContentInput(raw);

    let videoProvider: "google_drive" | "generic" | null | undefined = undefined;
    let videoEmbedUrl: string | null | undefined = undefined;

    if (patch.contentType === "video_external" || (!patch.contentType && existing.contentType === "video_external")) {
      const urlToCheck = patch.externalUrl !== undefined ? patch.externalUrl : existing.externalUrl;
      if (urlToCheck) {
        const videoInfo = detectExternalVideoProvider(urlToCheck);
        videoProvider = videoInfo.provider;
        videoEmbedUrl = videoInfo.embedUrl;
      }
    }

    // Cleanup old storage file if fileUrl was replaced
    if (
      existing.fileUrl &&
      patch.fileUrl !== undefined &&
      patch.fileUrl !== existing.fileUrl &&
      this.storageProvider
    ) {
      const oldStorageKey = this.extractStorageKey(existing.fileUrl);
      if (oldStorageKey) {
        try {
          await this.storageProvider.delete(oldStorageKey);
        } catch {
          // Non-blocking cleanup
        }
      }
    }

    const updated = await this.contentStore.update(contentId, {
      ...patch,
      ...(videoProvider !== undefined ? { videoProvider, videoEmbedUrl } : {}),
      publishedAt:
        patch.status === "published" && !existing.publishedAt
          ? new Date().toISOString()
          : undefined,
    });

    if (!updated) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    return updated;
  }

  /**
   * Publishes a content item.
   */
  async publishContent(
    actor: Actor,
    contentId: string,
  ): Promise<ClassroomContent> {
    const content = await this.contentStore.getById(contentId);
    if (!content) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, content.classroomId);

    const updated = await this.contentStore.update(contentId, {
      status: "published",
      publishedAt: content.publishedAt ?? new Date().toISOString(),
    });

    if (!updated) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    return updated;
  }

  /**
   * Unpublishes a content item (reverts to draft).
   */
  async unpublishContent(
    actor: Actor,
    contentId: string,
  ): Promise<ClassroomContent> {
    const content = await this.contentStore.getById(contentId);
    if (!content) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, content.classroomId);

    const updated = await this.contentStore.update(contentId, {
      status: "draft",
    });

    if (!updated) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    return updated;
  }

  /**
   * Archives a content item.
   */
  async archiveContent(
    actor: Actor,
    contentId: string,
  ): Promise<ClassroomContent> {
    const content = await this.contentStore.getById(contentId);
    if (!content) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, content.classroomId);

    const archived = await this.contentStore.archive(contentId);
    if (!archived) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    return archived;
  }

  /**
   * Hard-deletes a content item and removes any associated file from storage.
   */
  async deleteContent(actor: Actor, contentId: string): Promise<void> {
    const content = await this.contentStore.getById(contentId);
    if (!content) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    await this.assertTeacherClassroomAccess(actor, content.classroomId);

    // Delete associated file if present
    if (content.fileUrl && this.storageProvider) {
      const storageKey = this.extractStorageKey(content.fileUrl);
      if (storageKey) {
        try {
          await this.storageProvider.delete(storageKey);
        } catch {
          // Gracefully continue
        }
      }
    }

    const deleted = await this.contentStore.delete(contentId);
    if (!deleted) {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }
  }

  // -------------------------------------------------------------------------
  // Student Operations
  // -------------------------------------------------------------------------

  /**
   * Lists published content items accessible to a student in a classroom.
   */
  async listStudentClassroomContents(
    actor: Actor,
    classroomId: string,
  ): Promise<ClassroomContent[]> {
    const membership = await this.memberStore.getMembership(
      classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom || classroom.status === "archived") {
      throw new DomainError("not_found", "کلاس یافت نشد یا بایگانی شده است");
    }

    const contents = await this.contentStore.listByClassroom(
      classroomId,
      "published",
    );

    return contents;
  }

  /**
   * Gets details of a published content item for a student.
   */
  async getStudentContentDetails(
    actor: Actor,
    contentId: string,
  ): Promise<ClassroomContent> {
    const content = await this.contentStore.getById(contentId);
    if (!content || content.status !== "published") {
      throw new DomainError("not_found", "محتوای آموزشی یافت نشد");
    }

    const membership = await this.memberStore.getMembership(
      content.classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    return content;
  }
}
