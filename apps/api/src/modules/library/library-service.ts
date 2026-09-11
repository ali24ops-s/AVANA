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
  type ContentPackPricing,
  type ContentPackRecord,
  type ContentPackStatus,
  type CourseId,
  type DocumentId,
  type FlashcardPayload,
  type LessonPayload,
  type OrganizationId,
  type PublicContentPackDetailResource,
  type PublicContentPackItemSummary,
  type QuizPayload,
  type ReviewSummaryPayload,
  type ResourceAccessSummary,
  type ResourcePurchaseSummary,
  type CoursePackagesResponse,
  type CourseWithChapterPackages,
  calculateDefaultContentPrice,
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
import type { EntitlementService } from "../commerce/entitlement-service.js";
import type { CommerceStore } from "../commerce/commerce-store.js";

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
    status: ContentPackStatus;
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

export type LibraryResourcesResponse = {
  request_id: string;
  courses: Array<{
    id: string;
    title: string;
    description: string | null;
    subject: string | null;
    module_count: number;
    content_count: number;
    progress?: {
      completed_lessons: number;
      total_lessons: number;
      percent: number;
    };
    access: ResourceAccessSummary;
    purchase: ResourcePurchaseSummary;
    href: string;
    created_at: string;
    updated_at: string;
  }>;
  contents: Array<{
    id: string;
    title: string;
    type: "lesson" | "document" | "quiz" | "flashcard" | "review_summary";
    course_id: string;
    course_title: string;
    module_id?: string | null;
    module_title?: string | null;
    lesson_id?: string | null;
    estimated_minutes?: number | null;
    completed?: boolean;
    completed_at?: string | null;
    access: ResourceAccessSummary;
    purchase: ResourcePurchaseSummary;
    href: string;
    created_at: string;
    updated_at: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total_courses: number;
    total_contents: number;
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
    private readonly entitlementService?: EntitlementService,
    private readonly commerceStore?: CommerceStore,
    private readonly systemOrganizationId?: OrganizationId,
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
      status: "pending_review",
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
        status: createdPack.status,
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
   * Resolves pricing structure for a Content Pack according to metadata.accessType
   * and Commerce products (Single Source of Truth).
   */
  public async resolvePackPricing(pack: ContentPackRecord): Promise<ContentPackPricing> {
    const accessType = pack.metadata.accessType;
    if (accessType === "free") {
      return {
        is_free: true,
        price: 0,
        currency: "toman",
        product_id: null,
      };
    }

    if (accessType === "paid") {
      if (this.commerceStore) {
        const product = await this.commerceStore.findActiveProductByTarget(
          "content_pack",
          pack.id,
        );
        if (product && product.price > 0 && product.active) {
          return {
            is_free: false,
            price: product.price,
            currency: product.currency || "toman",
            product_id: product.id,
          };
        }
      }
    }

    // Fail-closed: If marked paid or unreviewed, do NOT assume free!
    return {
      is_free: false,
      price: 0,
      currency: "toman",
      product_id: null,
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
        const [creatorInfo, pricing] = await Promise.all([
          this.contentPackStore.getCreatorPublicInfo(pack.creatorUserId),
          this.resolvePackPricing(pack),
        ]);

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
          pricing,
          access_type: pack.metadata.accessType === "free" ? "free" : "paid",
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
   * List accessible courses and contents for public/authenticated library discovery.
   */
  async listResources(
    actor: Actor | null,
    options: {
      q?: string;
      type?: "all" | "courses" | "contents";
      subject?: string;
      sort?: "popular" | "newest";
      page?: number;
      limit?: number;
    },
    requestId: string,
  ): Promise<LibraryResourcesResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));

    if (typeof this.contentPackStore.listLibraryResources === "function") {
      const result = await this.contentPackStore.listLibraryResources({
        userId: actor?.userId,
        systemOrganizationId: this.systemOrganizationId,
        q: options.q,
        type: options.type,
        subject: options.subject,
        sort: options.sort,
        page,
        limit,
      });

      const coursesWithAccess = await Promise.all(
        result.courses.map(async (c: any) => {
          let isFree = true;
          let price = 0;
          let currency = "toman";
          let canPurchase = false;
          let productId: string | null = null;

          if (this.commerceStore) {
            const product = await this.commerceStore.findActiveProductByTarget(
              "course",
              c.id,
            );
            if (product && product.price > 0 && product.active) {
              isFree = false;
              price = product.price;
              currency = product.currency || "toman";
              canPurchase = true;
              productId = product.id;
            }
          }

          let hasAccess = isFree;
          let isPurchased = false;
          let accessSource: ResourceAccessSummary["accessSource"] = isFree
            ? "free"
            : null;

          if (actor && this.entitlementService) {
            const accessResult = await this.entitlementService.checkAccess(
              actor,
              {
                userId: actor.userId,
                resourceType: "course",
                resourceId: c.id,
              },
            );
            hasAccess = accessResult.granted;
            isPurchased = accessResult.reason === "course_purchase";
            accessSource = accessResult.granted
              ? (accessResult.reason as any)
              : null;
            if (hasAccess) {
              canPurchase = false;
            }
          }

          return {
            id: c.id,
            title: c.title,
            description: c.description,
            subject: c.subject,
            module_count: c.moduleCount,
            content_count: c.contentCount,
            progress: c.progress
              ? {
                  completed_lessons: c.progress.completedLessons,
                  total_lessons: c.progress.totalLessons,
                  percent: c.progress.percent,
                }
              : undefined,
            access: {
              isFree,
              isPurchased,
              hasAccess,
              accessSource,
            },
            purchase: {
              price,
              currency,
              canPurchase,
              productId,
            },
            href: c.href,
            created_at: c.createdAt,
            updated_at: c.updatedAt,
          };
        }),
      );

      const contentsWithAccess = await Promise.all(
        result.contents.map(async (cnt: any) => {
          const lessonId = cnt.lessonId || cnt.id;
          let isFree = true;
          let price = 0;
          let currency = "toman";
          let canPurchase = false;
          let productId: string | null = null;

          if (this.commerceStore) {
            const product = await this.commerceStore.findActiveProductByTarget(
              "content",
              lessonId,
            );
            if (product && product.price > 0 && product.active) {
              isFree = false;
              price = product.price;
              currency = product.currency || "toman";
              canPurchase = true;
              productId = product.id;
            } else {
              // Check if parent course is paid
              const courseProduct =
                await this.commerceStore.findActiveProductByTarget(
                  "course",
                  cnt.courseId,
                );
              if (
                courseProduct &&
                courseProduct.price > 0 &&
                courseProduct.active
              ) {
                isFree = false;
              }
            }
          }

          let hasAccess = isFree;
          let isPurchased = false;
          let accessSource: ResourceAccessSummary["accessSource"] = isFree
            ? "free"
            : null;

          let isPreview = false;
          if (actor && this.entitlementService) {
            const accessResult = await this.entitlementService.checkAccess(
              actor,
              {
                userId: actor.userId,
                resourceType: "lesson",
                resourceId: lessonId,
                moduleId: cnt.moduleId,
                courseId: cnt.courseId,
              },
            );
            hasAccess = accessResult.granted;
            isPurchased =
              accessResult.reason === "content_purchase" ||
              accessResult.reason === "course_purchase";
            isPreview = accessResult.reason === "free_preview";
            accessSource = accessResult.granted
              ? (accessResult.reason as any)
              : null;
            if (hasAccess) {
              canPurchase = false;
            }
          } else if (this.entitlementService) {
            isPreview = await this.entitlementService
              .getPreviewResolver()
              .isLessonPreview(lessonId, cnt.moduleId, cnt.courseId);
          }

          return {
            id: cnt.id,
            title: cnt.title,
            type: cnt.type,
            course_id: cnt.courseId,
            course_title: cnt.courseTitle,
            module_id: cnt.moduleId,
            module_title: cnt.moduleTitle,
            lesson_id: cnt.lessonId,
            estimated_minutes: cnt.estimatedMinutes,
            completed: cnt.completed,
            completed_at: cnt.completedAt,
            is_preview: isPreview,
            access: {
              isFree,
              isPurchased,
              hasAccess,
              accessSource,
            },
            purchase: {
              price,
              currency,
              canPurchase,
              productId,
            },
            href: cnt.href,
            created_at: cnt.createdAt,
            updated_at: cnt.updatedAt,
          };
        }),
      );

      return {
        request_id: requestId,
        courses: coursesWithAccess,
        contents: contentsWithAccess,
        pagination: {
          page,
          limit,
          total_courses: result.totalCourses,
          total_contents: result.totalContents,
        },
      };
    }

    return {
      request_id: requestId,
      courses: [],
      contents: [],
      pagination: {
        page,
        limit,
        total_courses: 0,
        total_contents: 0,
      },
    };
  }

  /**
   * List accessible courses with chapter packages for library discovery.
   *
   * Enforces:
   * - Strict Course + Chapter/Module package identity (no duplicates).
   * - Canonical pricing integration (explicit Product || suggested pricing formula).
   * - Entitlement evaluation per chapter package and course.
   */
  async listCoursePackages(
    actor: Actor | null,
    options: {
      courseId?: string;
      q?: string;
      subject?: string;
      sort?: "popular" | "newest";
      page?: number;
      limit?: number;
    },
    requestId: string,
  ): Promise<CoursePackagesResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));

    if (typeof this.contentPackStore.listCoursePackages !== "function") {
      return {
        request_id: requestId,
        courses: [],
        pagination: {
          page,
          limit,
          total_courses: 0,
          total_packages: 0,
        },
      };
    }

    const rawResult = await this.contentPackStore.listCoursePackages({
      userId: actor?.userId,
      systemOrganizationId: this.systemOrganizationId,
      courseId: (options.courseId || (options as any).course_id) as any,
      q: options.q,
      subject: options.subject,
      sort: options.sort,
      page,
      limit,
    });

    const coursesWithAccessAndPricing: CourseWithChapterPackages[] = await Promise.all(
      rawResult.courses.map(async (c) => {
        // 1. Resolve Course-level pricing and access
        let isCourseFree = false;
        let coursePrice = 0;
        let courseCurrency = "toman";
        let canPurchaseCourse = false;
        let courseProductId: string | null = null;

        if (this.commerceStore) {
          const courseProduct = await this.commerceStore.findActiveProductByTarget(
            "course",
            c.id,
          );
          if (courseProduct && courseProduct.price > 0 && courseProduct.active) {
            isCourseFree = false;
            coursePrice = courseProduct.price;
            courseCurrency = courseProduct.currency || "toman";
            canPurchaseCourse = true;
            courseProductId = courseProduct.id;
          } else if (courseProduct && courseProduct.price === 0 && (courseProduct.metadata as any)?.explicitlyFree === true) {
            isCourseFree = true;
            coursePrice = 0;
            canPurchaseCourse = false;
            courseProductId = courseProduct.id;
          }
        }

        let hasCourseAccess = isCourseFree;
        let isCoursePurchased = false;
        let courseAccessSource: ResourceAccessSummary["accessSource"] = isCourseFree
          ? "free"
          : null;

        if (actor && this.entitlementService) {
          const courseAccessRes = await this.entitlementService.checkAccess(actor, {
            userId: actor.userId,
            resourceType: "course",
            resourceId: c.id,
          });
          hasCourseAccess = courseAccessRes.granted;
          isCoursePurchased = courseAccessRes.reason === "course_purchase";
          courseAccessSource = courseAccessRes.granted
            ? (courseAccessRes.reason as any)
            : null;
          if (hasCourseAccess) {
            canPurchaseCourse = false;
          }
        }

        // 2. Resolve Chapter-level pricing and access
        const packagesWithAccess = await Promise.all(
          c.packages.map(async (pkg) => {
            let isPkgFree = isCourseFree;
            let pkgPrice = 0;
            let pkgCurrency = "toman";
            let canPurchasePkg = false;
            let pkgProductId: string | null = null;

            if (this.commerceStore) {
              let product: import("@avana/domain").ProductRecord | undefined | null;
              if (pkg.id) {
                product = await this.commerceStore.findActiveProductByTarget(
                  "content_pack",
                  pkg.id,
                );
              }
              if (!product && pkg.contentPackId) {
                product = await this.commerceStore.findActiveProductByTarget(
                  "content_pack",
                  pkg.contentPackId,
                );
              }
              if (!product && pkg.contents.lesson.lessonId) {
                product = await this.commerceStore.findActiveProductByTarget(
                  "content",
                  pkg.contents.lesson.lessonId,
                );
              }

              if (product && product.active) {
                if (product.price > 0) {
                  isPkgFree = false;
                  pkgPrice = product.price;
                  pkgCurrency = product.currency || "toman";
                  canPurchasePkg = true;
                  pkgProductId = product.id;
                } else if (product.price === 0 && (product.metadata as any)?.explicitlyFree === true) {
                  isPkgFree = true;
                  pkgPrice = 0;
                  canPurchasePkg = false;
                  pkgProductId = product.id;
                }
              } else {
                // Canonical suggested pricing for unpriced educational packages
                const suggested = calculateDefaultContentPrice({
                  lessonCount: pkg.stats.lessonCount,
                  flashcardCount: pkg.stats.flashcardCount,
                  questionCount: pkg.stats.quizQuestionCount,
                  hasReviewSummary: pkg.contents.summary.exists,
                });
                if (suggested > 0) {
                  isPkgFree = false;
                  pkgPrice = suggested;
                  pkgCurrency = "toman";
                  canPurchasePkg = true;
                  pkgProductId = null;
                }
              }
            } else {
              const suggested = calculateDefaultContentPrice({
                lessonCount: pkg.stats.lessonCount,
                flashcardCount: pkg.stats.flashcardCount,
                questionCount: pkg.stats.quizQuestionCount,
                hasReviewSummary: pkg.contents.summary.exists,
              });
              if (suggested > 0) {
                isPkgFree = false;
                pkgPrice = suggested;
                pkgCurrency = "toman";
                canPurchasePkg = true;
                pkgProductId = null;
              }
            }

            let hasPkgAccess = isPkgFree;
            let isPkgPurchased = false;
            let pkgAccessSource: ResourceAccessSummary["accessSource"] = isPkgFree
              ? "free"
              : null;

            if (hasCourseAccess) {
              hasPkgAccess = true;
              isPkgPurchased = isCoursePurchased;
              pkgAccessSource = courseAccessSource;
              canPurchasePkg = false;
            } else if (actor && this.entitlementService) {
              let accessRes: import("@avana/domain").ResourceAccessResult | undefined;
              if (pkg.contentPackId) {
                accessRes = await this.entitlementService.checkAccess(actor, {
                  userId: actor.userId,
                  resourceType: "content_pack",
                  resourceId: pkg.contentPackId,
                  courseId: c.id as any,
                });
              } else if (pkg.contents.lesson.lessonId) {
                accessRes = await this.entitlementService.checkAccess(actor, {
                  userId: actor.userId,
                  resourceType: "lesson",
                  resourceId: pkg.contents.lesson.lessonId,
                  courseId: c.id as any,
                });
              } else {
                accessRes = await this.entitlementService.checkAccess(actor, {
                  userId: actor.userId,
                  resourceType: "module",
                  resourceId: pkg.moduleId,
                  courseId: c.id as any,
                });
              }

              if (accessRes && accessRes.granted && accessRes.reason !== "free_preview") {
                hasPkgAccess = true;
                isPkgPurchased =
                  accessRes.reason === "content_pack_purchase" ||
                  accessRes.reason === "course_purchase" ||
                  accessRes.reason === "content_purchase";
                pkgAccessSource = accessRes.reason as any;
                canPurchasePkg = false;
              }
            }

            let previewMeta: import("@avana/domain").ContentPreviewMetadata | undefined;
            if (this.entitlementService) {
              previewMeta = await this.entitlementService
                .getPreviewResolver()
                .resolvePackagePreviewMetadata({
                  courseId: c.id,
                  moduleId: pkg.moduleId,
                  organizationId: this.systemOrganizationId,
                });
              if (pkg.contents.quiz.exists && previewMeta.quiz) {
                previewMeta.quiz.questionCount = pkg.stats.quizQuestionCount;
              }
            }

            return {
              ...pkg,
              access: {
                isFree: isPkgFree,
                isPurchased: isPkgPurchased,
                hasAccess: hasPkgAccess,
                accessSource: pkgAccessSource,
              },
              purchase: {
                price: pkgPrice,
                currency: pkgCurrency,
                canPurchase: canPurchasePkg,
                productId: pkgProductId,
              },
              preview: previewMeta,
            };
          }),
        );

        return {
          id: c.id,
          title: c.title,
          description: c.description,
          subject: c.subject,
          isOfficial: c.isOfficial,
          totalPackages: packagesWithAccess.length,
          packages: packagesWithAccess,
          access: {
            isFree: isCourseFree,
            isPurchased: isCoursePurchased,
            hasAccess: hasCourseAccess,
            accessSource: courseAccessSource,
          },
          purchase: {
            price: coursePrice,
            currency: courseCurrency,
            canPurchase: canPurchaseCourse,
            productId: courseProductId,
          },
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      }),
    );

    return {
      request_id: requestId,
      courses: coursesWithAccessAndPricing,
      pagination: {
        page,
        limit,
        total_courses: rawResult.totalCourses,
        total_packages: rawResult.totalPackages,
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
    if (
      !pack ||
      pack.status !== "published" ||
      pack.deletedAt !== null ||
      (pack.metadata?.accessType && pack.metadata?.accessType !== "free" && pack.metadata?.accessType !== "paid")
    ) {
      throw new DomainError("not_found", "بسته آموزشی یافت نشد یا در انتظار بازبینی است.");
    }

    const [items, creatorInfo, pricing] = await Promise.all([
      this.contentPackStore.findItemsByPackId(packId),
      this.contentPackStore.getCreatorPublicInfo(pack.creatorUserId),
      this.resolvePackPricing(pack),
    ]);
    const preview = buildContentPackPreview(items);

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
      pricing,
      access_type: pack.metadata.accessType === "free" ? "free" : "paid",
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
    if (!course || course.deletedAt !== null) {
      throw new DomainError("not_found", "دوره آموزشی یافت نشد.");
    }

    // 2. Authorize actor access to the course/organization
    const isSystemCourse =
      (this.systemOrganizationId &&
        course.organizationId === this.systemOrganizationId) ||
      course.isOfficial === true;

    // Unpublished official courses must not be accessible to students
    if (
      course.isOfficial === true &&
      course.status !== undefined &&
      course.status !== "published" &&
      actor.role !== "platform_admin"
    ) {
      throw new DomainError("not_found", "دوره آموزشی یافت نشد.");
    }

    // For private courses (non-system), actor must be a member of the owning organization (preventing cross-tenant IDOR)
    if (!isSystemCourse) {
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
    }

    // 3. Find pack and verify published & active with explicit accessType
    const pack = await this.contentPackStore.findById(packId);
    if (
      !pack ||
      pack.status !== "published" ||
      pack.deletedAt !== null ||
      (pack.metadata?.accessType && pack.metadata?.accessType !== "free" && pack.metadata?.accessType !== "paid")
    ) {
      throw new DomainError(
        "not_found",
        "بسته آموزشی یافت نشد یا منتشر نشده است.",
      );
    }

    // 4. Verify user entitlement to add/install this Content Pack
    if (this.entitlementService) {
      const access = await this.entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "content_pack",
        resourceId: packId,
        courseId,
      });

      if (!access.granted) {
        throw new DomainError(
          "forbidden",
          "برای افزودن این بسته به دوره خود، فعال‌سازی اشتراک آوانا پلاس یا خرید این بسته الزامی است.",
        );
      }
    }

    // 5. Check idempotency: if already installed in this specific course
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
