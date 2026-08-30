/**
 * LibraryService — Content Pack Publishing and Public Discovery.
 *
 * Implements the core business logic for Content Packs:
 * 1. Validating that all 4 generated contents (lesson, flashcard, quiz, review_summary)
 *    exist and are in 'accepted' status before publication.
 * 2. Creating an immutable snapshot of all 4 payloads in content_pack_items.
 * 3. Enforcing single active publication per document.
 * 4. Serving privacy-safe public library search and detail endpoints.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type ContentPackContentType,
  type ContentPackId,
  type ContentPackItemRecord,
  type ContentPackRecord,
  type CourseId,
  type DocumentId,
  type FlashcardPayload,
  type LessonPayload,
  type OrganizationId,
  type PublicContentPackDetailResource,
  type PublicContentPackItemSummary,
  type QuizPayload,
  type ReviewSummaryPayload,
  DomainError,
  asContentPackId,
  asContentPackItemId,
  buildContentPackPreview,
  computeContentPackMetadata,
  defaultPolicy,
} from "@avana/domain";
import type {
  ContentPackStore,
  ContentPackUsageStore,
  ListPublishedPacksOptions,
} from "./library-store.js";
import type { DocumentStore, DocumentRecord } from "../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { UserStore } from "../identity/user-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { AuditService } from "../../observability/audit-service.js";

// ---------------------------------------------------------------------------
// Request/Response contract types
// ---------------------------------------------------------------------------

export type PublishContentPackInput = {
  title?: string;
  description?: string | null;
  subject?: string | null;
};

export type PublishContentPackResponse = {
  request_id: string;
  pack: {
    id: ContentPackId;
    title: string;
    description: string | null;
    subject: string | null;
    status: "published";
    usage_count: number;
    stats: {
      session_count: number;
      flashcard_count: number;
      quiz_question_count: number;
      estimated_reading_minutes: number;
    };
    published_at: string;
    items_count: number;
  };
};

export type PublicLibraryListResponse = {
  request_id: string;
  items: PublicContentPackItemSummary[];
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
  };
};

export type PublicLibraryDetailResponse = {
  request_id: string;
  pack: PublicContentPackDetailResource;
};

export type AddPackToCourseResponse = {
  request_id: string;
  success: boolean;
  already_installed: boolean;
  materialized: {
    module_id: string;
    module_title: string;
    lessons_created: number;
    flashcards_created: number;
    quizzes_created: number;
    quiz_questions_created: number;
    review_summary_created: boolean;
  };
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LibraryService {
  constructor(
    private readonly contentPackStore: ContentPackStore,
    _contentPackUsageStore: ContentPackUsageStore,
    private readonly documentStore: DocumentStore,
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly organizationStore?: OrganizationStore,
    _userStore?: UserStore,
    private readonly courseStore?: CourseStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    _auditService?: AuditService,
  ) {}

  /**
   * Authorize a library action within an organization (role-based).
   */
  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<void> {
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Organization not found");
      }
      const scopedActor = { ...actor, role: membership.role as Actor["role"] };
      const context: AuthContext = { organizationId };
      this.policy.require("content:publish", scopedActor, context);
      return;
    }
    const context: AuthContext = { organizationId };
    this.policy.require("content:publish", actor, context);
  }

  /**
   * Authorize publishing a Content Pack for a given document.
   *
   * Rules:
   * 1. User must be an active member of the organization.
   * 2. Either the user's role has 'content:publish' permission (course_editor, org_admin, platform_admin),
   *    OR the user is the owner of the document (doc.ownerUserId === actor.userId).
   */
  async authorizePublish(
    actor: Actor,
    organizationId: OrganizationId,
    doc: DocumentRecord,
  ): Promise<void> {
    let scopedActor = actor;
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership && actor.role !== "platform_admin") {
        throw new DomainError("not_found", "Organization not found");
      }
      const role =
        actor.role === "platform_admin"
          ? "platform_admin"
          : (membership?.role as Actor["role"] ?? actor.role);
      scopedActor = { ...actor, role };
    }

    const context: AuthContext = { organizationId };
    const hasRolePermission = this.policy.check(
      "content:publish",
      scopedActor,
      context,
    );
    const isOwner = doc.ownerUserId === actor.userId;

    if (!hasRolePermission && !isOwner) {
      throw new DomainError(
        "forbidden",
        `Action 'content:publish' not permitted for role '${scopedActor.role}' on document not owned by user`,
      );
    }
  }

  /**
   * Publish a Content Pack for a given document.
   *
   * Rules:
   * 1. Requires content:publish permission in the document's organization OR document ownership.
   * 2. Document must exist and belong to the organization.
   * 3. No active published pack can already exist for this document.
   * 4. At least one generated content type must exist in 'accepted' status.
   * 5. Creates immutable payload snapshots in content_pack_items in a single atomic transaction.
   */
  async publishContentPack(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    input: PublishContentPackInput,
    requestId: string,
  ): Promise<PublishContentPackResponse> {
    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }

    await this.authorizePublish(actor, organizationId, doc);

    // 1. Guard against duplicate published pack for this document
    const existingActivePack =
      await this.contentPackStore.findActiveByDocument(
        documentId,
        organizationId,
      );
    if (existingActivePack) {
      throw new DomainError(
        "conflict",
        "یک بسته آموزشی فعال و منتشرشده برای این سند از قبل وجود دارد.",
      );
    }

    // 2. Fetch all generated contents for this document
    const contents = await this.generatedContentStore.listByDocument(
      documentId,
      organizationId,
    );
    const activeContents = contents.filter((c) => c.deletedAt === null);

    // 3. Locate all accepted contents for supported content pack types
    const lessonItem = activeContents.find(
      (c) => c.type === "lesson" && c.status === "accepted",
    );
    const flashcardItem = activeContents.find(
      (c) => c.type === "flashcard" && c.status === "accepted",
    );
    const quizItem = activeContents.find(
      (c) => c.type === "quiz" && c.status === "accepted",
    );
    const reviewSummaryItem = activeContents.find(
      (c) => c.type === "review_summary" && c.status === "accepted",
    );

    const acceptedEntries: Array<{
      type: ContentPackContentType;
      item: (typeof activeContents)[0];
    }> = [];
    if (lessonItem) acceptedEntries.push({ type: "lesson", item: lessonItem });
    if (flashcardItem) acceptedEntries.push({ type: "flashcard", item: flashcardItem });
    if (quizItem) acceptedEntries.push({ type: "quiz", item: quizItem });
    if (reviewSummaryItem) acceptedEntries.push({ type: "review_summary", item: reviewSummaryItem });

    // 4. Invariant: At least one accepted content item is required to publish
    if (acceptedEntries.length === 0) {
      throw new DomainError(
        "bad_request",
        "این محتوا هنوز برای انتشار آماده نیست.",
      );
    }

    // 5. Compute statistics metadata from available accepted items
    const metadata = computeContentPackMetadata({
      lesson: lessonItem ? (lessonItem.payload as LessonPayload) : undefined,
      flashcard: flashcardItem ? (flashcardItem.payload as FlashcardPayload) : undefined,
      quiz: quizItem ? (quizItem.payload as QuizPayload) : undefined,
      review_summary: reviewSummaryItem ? (reviewSummaryItem.payload as ReviewSummaryPayload) : undefined,
    });

    const now = new Date().toISOString();
    const packId = asContentPackId(randomUUID());

    const title =
      input.title && input.title.trim().length > 0
        ? input.title.trim()
        : (lessonItem?.payload as { title?: string } | undefined)?.title ||
          (quizItem?.payload as { title?: string } | undefined)?.title ||
          (reviewSummaryItem?.payload as { title?: string } | undefined)?.title ||
          (flashcardItem?.payload as { title?: string } | undefined)?.title ||
          doc.originalName ||
          "بسته آموزشی جامع";

    const packRecord: ContentPackRecord = {
      id: packId,
      creatorUserId: actor.userId,
      organizationId,
      sourceDocumentId: documentId,
      title,
      description: input.description?.trim() || null,
      subject: input.subject?.trim() || null,
      status: "published",
      publishedAt: now,
      usageCount: 0,
      metadata,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // 6. Prepare immutable payload snapshots for existing accepted items only
    const itemsToCreate: ContentPackItemRecord[] = acceptedEntries.map(
      (entry, index) => ({
        id: asContentPackItemId(randomUUID()),
        contentPackId: packId,
        contentType: entry.type,
        sourceGeneratedContentId: entry.item.id,
        payloadSnapshot: JSON.parse(JSON.stringify(entry.item.payload)),
        sortOrder: index,
        createdAt: now,
      }),
    );

    // 7. Atomically persist pack and items
    const createdPack = await this.contentPackStore.create(
      packRecord,
      itemsToCreate,
    );

    return {
      request_id: requestId,
      pack: {
        id: createdPack.id,
        title: createdPack.title,
        description: createdPack.description,
        subject: createdPack.subject,
        status: "published",
        usage_count: createdPack.usageCount,
        stats: {
          session_count: metadata.sessionCount ?? 0,
          flashcard_count: metadata.flashcardCount ?? 0,
          quiz_question_count: metadata.quizQuestionCount ?? 0,
          estimated_reading_minutes: metadata.estimatedReadingMinutes ?? 12,
        },
        published_at: createdPack.publishedAt,
        items_count: itemsToCreate.length,
      },
    };
  }

  /**
   * List published content packs for the public library.
   *
   * Guarantees:
   * - Only returns status === 'published' and deletedAt === null.
   * - Never exposes private document IDs, raw file storage keys, or creator email.
   */
  async listPublishedPacks(
    options: ListPublishedPacksOptions,
    requestId: string,
  ): Promise<PublicLibraryListResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));

    const { items, totalCount } = await this.contentPackStore.listPublished({
      q: options.q,
      subject: options.subject,
      sort: options.sort,
      page,
      limit,
    });

    const summaries: PublicContentPackItemSummary[] = await Promise.all(
      items.map(async (pack) => {
        const creatorInfo = await this.contentPackStore.getCreatorPublicInfo(
          pack.creatorUserId,
        );

        return {
          id: pack.id,
          title: pack.title,
          description: pack.description,
          subject: pack.subject,
          creator: {
            id: creatorInfo?.id ?? (pack.creatorUserId as string) ?? "",
            name: creatorInfo?.name ?? "کاربر آوانا",
          },
          usage_count: pack.usageCount,
          stats: {
            session_count: pack.metadata.sessionCount ?? 0,
            flashcard_count: pack.metadata.flashcardCount ?? 0,
            quiz_question_count: pack.metadata.quizQuestionCount ?? 0,
            estimated_reading_minutes:
              pack.metadata.estimatedReadingMinutes ?? 12,
          },
          published_at: pack.publishedAt,
        };
      }),
    );

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      request_id: requestId,
      items: summaries,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
      },
    };
  }

  /**
   * Get detailed preview of a single published Content Pack.
   *
   * Preview and stats are derived exclusively from content_pack_items.payload_snapshot.
   * NEVER queries generated_contents or storage keys.
   */
  async getPackDetail(
    packId: ContentPackId,
    requestId: string,
  ): Promise<PublicLibraryDetailResponse> {
    const pack = await this.contentPackStore.findById(packId);
    if (!pack || pack.status !== "published" || pack.deletedAt !== null) {
      throw new DomainError("not_found", "بسته آموزشی یافت نشد.");
    }

    const items = await this.contentPackStore.findItemsByPackId(packId);
    const preview = buildContentPackPreview(items);
    const creatorInfo = await this.contentPackStore.getCreatorPublicInfo(
      pack.creatorUserId,
    );

    const detailResource: PublicContentPackDetailResource = {
      id: pack.id,
      title: pack.title,
      description: pack.description,
      subject: pack.subject,
      creator: {
        id: creatorInfo?.id ?? (pack.creatorUserId as string) ?? "",
        name: creatorInfo?.name ?? "کاربر آوانا",
      },
      usage_count: pack.usageCount,
      stats: {
        session_count: pack.metadata.sessionCount ?? 0,
        flashcard_count: pack.metadata.flashcardCount ?? 0,
        quiz_question_count: pack.metadata.quizQuestionCount ?? 0,
        estimated_reading_minutes:
          pack.metadata.estimatedReadingMinutes ?? 12,
      },
      published_at: pack.publishedAt,
      preview,
    };

    return {
      request_id: requestId,
      pack: detailResource,
    };
  }

  /**
   * Add a published Content Pack to a target User Course (Materialization).
   *
   * Invariants & Guarantees:
   * 1. Zero LLM calls — pure deterministic materialization from payload snapshots.
   * 2. DB transaction atomicity — all assets (Module, Lessons, Flashcards, Quiz, Review Summary)
   *    or nothing.
   * 3. Complete independence from original Document or creator's generated_contents.
   * 4. User learning state isolation — zero copied schedules, reviews, progress, or quiz attempts.
   * 5. Idempotency — safe retry on network double-clicks without duplicating entities or incrementing usage.
   * 6. Usage count reflects unique users across the platform.
   */
  async addPackToCourse(
    actor: Actor,
    packId: ContentPackId,
    courseId: CourseId,
    requestId: string,
  ): Promise<AddPackToCourseResponse> {
    // 1. Validate course existence
    if (!this.courseStore) {
      throw new DomainError("bad_request", "Course store not configured");
    }

    const course = await this.courseStore.findById(courseId);
    if (!course) {
      throw new DomainError("not_found", "دوره آموزشی یافت نشد.");
    }

    // 2. Authorize actor access to the course/organization
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        course.organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("forbidden", "شما به این دوره دسترسی ندارید.");
      }
    }

    // 3. Find pack and verify published & active
    const pack = await this.contentPackStore.findById(packId);
    if (!pack || pack.status !== "published" || pack.deletedAt !== null) {
      throw new DomainError(
        "not_found",
        "بسته آموزشی یافت نشد یا منتشر نشده است.",
      );
    }

    // 4. Check idempotency: if already installed in this specific course
    const existingUsage = await this.contentPackStore.findUsage(
      packId,
      actor.userId,
      courseId,
    );
    if (existingUsage) {
      return {
        request_id: requestId,
        success: true,
        already_installed: true,
        materialized: {
          module_id: existingUsage.targetModuleId || "",
          module_title: pack.title,
          lessons_created: 0,
          flashcards_created: 0,
          quizzes_created: 0,
          quiz_questions_created: 0,
          review_summary_created: false,
        },
      };
    }

    // 5. Verify pack has at least one content item
    const items = await this.contentPackStore.findItemsByPackId(packId);
    if (!items || items.length === 0) {
      throw new DomainError(
        "bad_request",
        "بسته آموزشی فاقد محتوا است و امکان اضافه کردن آن به دوره وجود ندارد.",
      );
    }

    // 6. Materialize atomically in DB transaction
    const result = await this.contentPackStore.materializeToCourse({
      pack,
      items,
      userId: actor.userId,
      organizationId: course.organizationId,
      targetCourseId: course.id,
    });

    return {
      request_id: requestId,
      success: true,
      already_installed: result.alreadyInstalled,
      materialized: {
        module_id: result.moduleId,
        module_title: result.moduleTitle,
        lessons_created: result.lessonsCreated,
        flashcards_created: result.flashcardsCreated,
        quizzes_created: result.quizzesCreated,
        quiz_questions_created: result.quizQuestionsCreated,
        review_summary_created: result.reviewSummaryCreated,
      },
    };
  }
}
