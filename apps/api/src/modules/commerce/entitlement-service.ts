/**
 * EntitlementService — Centralized Access Resolution and Hierarchy Engine.
 *
 * Implements the single source of truth for all content paywalls and access checks:
 * 1. Creator & Platform Admin bypass
 * 2. Active Subscription check (user_entitlements & user_subscriptions)
 * 3. Direct Content (Lesson) Ownership check (Lifetime Ownership)
 * 4. Permanent Course Ownership check (Dynamic Runtime Hierarchy Resolution)
 * 5. Permanent Content Pack Ownership check (Lifetime Ownership)
 * 6. Free resource verification (Course, Content, Content Pack)
 * 7. Structured Paywall decisions with available purchase options (Subscription, Course, Content)
 */

import {
  type Actor,
  type CheckAccessInput,
  type ContentPackId,
  type CourseId,
  type ModuleId,
  type ProductRecord,
  type ResourceAccessResult,
  type UserId,
  asCourseId,
  asContentPackId,
} from "@avana/domain";
import type { CommerceStore } from "./commerce-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type {
  LessonStore,
  ModuleStore,
  DocumentStore,
} from "../learning/learning-store.js";
import type { FlashcardStore, QuizStore } from "../study/study-store.js";
import type { ContentPackStore } from "../library/library-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { PreviewResolver } from "./preview-resolver.js";

export interface EntitlementServiceDeps {
  commerceStore: CommerceStore;
  courseStore?: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  documentStore?: DocumentStore;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  contentPackStore?: ContentPackStore;
  organizationStore?: OrganizationStore;
  previewResolver?: PreviewResolver;
}

export class EntitlementService {
  private readonly previewResolver: PreviewResolver;

  constructor(private readonly deps: EntitlementServiceDeps) {
    this.previewResolver =
      deps.previewResolver ??
      new PreviewResolver({
        commerceStore: deps.commerceStore,
        lessonStore: deps.lessonStore,
        moduleStore: deps.moduleStore,
        quizStore: deps.quizStore,
        flashcardStore: deps.flashcardStore,
        courseStore: deps.courseStore,
      });
  }

  public getPreviewResolver(): PreviewResolver {
    return this.previewResolver;
  }

  /**
   * Evaluates resource access for a user and returns a structured decision.
   */
  async checkAccess(
    actor: Actor,
    input: CheckAccessInput,
  ): Promise<ResourceAccessResult> {
    const { commerceStore } = this.deps;
    const now = new Date();

    // -----------------------------------------------------------------------
    // 1. Resolve Hierarchy (Parent Course, Content Pack, Content ID, Creator)
    // -----------------------------------------------------------------------
    const hierarchy = await this.resolveHierarchy(input);
    const effectiveCourseId = input.courseId ?? hierarchy.courseId;
    const effectiveContentPackId =
      input.contentPackId ?? hierarchy.contentPackId;
    const effectiveLessonId =
      input.resourceType === "lesson" || input.resourceType === "content"
        ? input.resourceId
        : undefined;

    // -----------------------------------------------------------------------
    // 2. Creator & Platform Admin Bypass
    // -----------------------------------------------------------------------
    if (actor.role === "platform_admin") {
      return {
        granted: true,
        reason: "admin_grant",
        expiresAt: null,
        availablePurchaseOptions: [],
      };
    }

    if (hierarchy.creatorUserId && hierarchy.creatorUserId === actor.userId) {
      return {
        granted: true,
        reason: "creator_access",
        expiresAt: null,
        availablePurchaseOptions: [],
      };
    }

    // -----------------------------------------------------------------------
    // 3. Active Subscription Check
    // -----------------------------------------------------------------------
    const activeSubEntitlement = await commerceStore.findActiveEntitlement(
      actor.userId,
      "subscription",
      null,
      now,
    );

    if (activeSubEntitlement) {
      return {
        granted: true,
        reason: "subscription",
        expiresAt: activeSubEntitlement.expiresAt,
        availablePurchaseOptions: [],
      };
    }

    // Also verify user_subscriptions as secondary check if active
    const activeSub = await commerceStore.findActiveSubscription(
      actor.userId,
      now,
    );
    if (activeSub) {
      return {
        granted: true,
        reason: "subscription",
        expiresAt: activeSub.expiresAt,
        availablePurchaseOptions: [],
      };
    }

    // -----------------------------------------------------------------------
    // 4. Direct Resource Entitlements
    // -----------------------------------------------------------------------
    // 4.1 Direct Content / Lesson Entitlement
    if (effectiveLessonId) {
      let contentEntitlement = await commerceStore.findActiveEntitlement(
        actor.userId,
        "content",
        effectiveLessonId,
        now,
      );

      if (!contentEntitlement) {
        // Resolve across regenerations using exact Product Identity & lineage
        const product =
          (await commerceStore.findProductByCode(`content_${effectiveLessonId}`)) ||
          (await commerceStore.findProductByTarget("content", effectiveLessonId));

        if (product) {
          // Check prior lesson IDs in this exact Product's lineage
          const priorLessonIds: string[] = Array.isArray(product.metadata?.priorLessonIds)
            ? (product.metadata.priorLessonIds as string[])
            : [];

          for (const priorId of priorLessonIds) {
            const priorEntitlement = await commerceStore.findActiveEntitlement(
              actor.userId,
              "content",
              priorId,
              now,
            );
            if (priorEntitlement) {
              contentEntitlement = priorEntitlement;
              break;
            }
          }

          // Check if user has an active entitlement whose order was for this exact Product ID
          if (!contentEntitlement) {
            const activeEnts = await commerceStore.listActiveEntitlements(
              actor.userId,
              now,
            );
            const contentEnts = activeEnts.filter(
              (e) => e.resourceType === "content" && e.orderId,
            );
            for (const ent of contentEnts) {
              if (ent.orderId) {
                const order = await commerceStore.findOrderById(ent.orderId);
                if (order && order.productId === product.id) {
                  contentEntitlement = ent;
                  break;
                }
              }
            }
          }
        }

        // Secondary fallback for in-memory / soft-deleted prior lessons in the same sort slot
        if (!contentEntitlement && this.deps.lessonStore) {
          const lesson = await this.deps.lessonStore.findById(effectiveLessonId as any);
          if (lesson?.moduleId && this.deps.moduleStore) {
            const allModuleLessons = typeof (this.deps.lessonStore as any).getAll === "function"
              ? (this.deps.lessonStore as any).getAll().filter((l: any) => l.moduleId === lesson.moduleId)
              : [];
            for (const priorLes of allModuleLessons) {
              if (
                priorLes.id !== effectiveLessonId &&
                priorLes.deletedAt !== null &&
                priorLes.sortOrder === lesson.sortOrder
              ) {
                const priorEntitlement = await commerceStore.findActiveEntitlement(
                  actor.userId,
                  "content",
                  priorLes.id,
                  now,
                );
                if (priorEntitlement) {
                  contentEntitlement = priorEntitlement;
                  break;
                }
              }
            }
          }
        }
      }

      if (contentEntitlement) {
        return {
          granted: true,
          reason: "content_purchase",
          expiresAt: contentEntitlement.expiresAt,
          availablePurchaseOptions: [],
        };
      }
    }

    // 4.2 Direct Course Entitlement (or Parent Course Entitlement)
    if (effectiveCourseId) {
      const courseEntitlement = await commerceStore.findActiveEntitlement(
        actor.userId,
        "course",
        effectiveCourseId,
        now,
      );
      if (courseEntitlement) {
        return {
          granted: true,
          reason: "course_purchase",
          expiresAt: courseEntitlement.expiresAt,
          availablePurchaseOptions: [],
        };
      }
    }

    // 4.3 Direct Content Pack Entitlement (or Parent Pack Entitlement)
    if (effectiveContentPackId) {
      const packEntitlement = await commerceStore.findActiveEntitlement(
        actor.userId,
        "content_pack",
        effectiveContentPackId,
        now,
      );
      if (packEntitlement) {
        return {
          granted: true,
          reason: "content_pack_purchase",
          expiresAt: packEntitlement.expiresAt,
          availablePurchaseOptions: [],
        };
      }
    }

    // -----------------------------------------------------------------------
    // 5. Free Resource Evaluation (Fail-Closed: Explicit Admin Decision Only)
    // -----------------------------------------------------------------------
    // 5.1 If resource is Content Pack
    if (input.resourceType === "content_pack") {
      let isExplicitlyFree = false;
      if (effectiveContentPackId && this.deps.contentPackStore) {
        const pack = await this.deps.contentPackStore.findById(effectiveContentPackId);
        if (pack) {
          if (pack.status !== "published" || pack.deletedAt !== null) {
            return {
              granted: false,
              reason: "locked",
              expiresAt: null,
              availablePurchaseOptions: [],
            };
          }
          if (pack.metadata?.accessType === "free") {
            isExplicitlyFree = true;
          }
        }
      }

      const packProduct = effectiveContentPackId
        ? await commerceStore.findActiveProductByTarget("content_pack", effectiveContentPackId)
        : null;

      if (packProduct && packProduct.active) {
        if (packProduct.price === 0 && (packProduct.metadata as any)?.explicitlyFree === true) {
          isExplicitlyFree = true;
        } else if (packProduct.price > 0 || (packProduct.metadata as any)?.explicitlyFree !== true) {
          isExplicitlyFree = false;
        }
      }

      if (isExplicitlyFree) {
        return {
          granted: true,
          reason: "free",
          expiresAt: null,
          availablePurchaseOptions: [],
        };
      }
    }

    // 5.2 If resource is Course
    if (input.resourceType === "course") {
      const courseProduct = effectiveCourseId
        ? await commerceStore.findActiveProductByTarget("course", effectiveCourseId)
        : null;

      if (
        courseProduct &&
        courseProduct.active &&
        courseProduct.price === 0 &&
        (courseProduct.metadata as any)?.explicitlyFree === true
      ) {
        return {
          granted: true,
          reason: "free",
          expiresAt: null,
          availablePurchaseOptions: [],
        };
      }
      // Otherwise, Course is locked without subscription/course purchase
    }

    // 5.3 If resource is Content / Lesson (or child of Module, Document, Flashcard, Quiz, AI Assistant)
    let isExplicitlyFree = false;
    let isExplicitlyPaid = false;

    if (
      input.resourceType === "lesson" ||
      input.resourceType === "content" ||
      input.resourceType === "module" ||
      input.resourceType === "document" ||
      input.resourceType === "flashcard" ||
      input.resourceType === "quiz" ||
      input.resourceType === "ai_assistant"
    ) {
      // Check 1: Direct Lesson active product (ONLY explicitlyFree === true allows free)
      if (effectiveLessonId) {
        const lessonProduct = await commerceStore.findActiveProductByTarget(
          "content",
          effectiveLessonId,
        );
        if (lessonProduct && lessonProduct.active) {
          if (lessonProduct.price === 0 && (lessonProduct.metadata as any)?.explicitlyFree === true) {
            isExplicitlyFree = true;
          } else if (lessonProduct.price > 0) {
            isExplicitlyPaid = true;
          }
        }
      }

      // Check 1.5: Direct non-lesson resource active product (quiz, flashcard, etc.)
      if (!isExplicitlyFree && !isExplicitlyPaid && input.resourceId && input.resourceType !== "content" && input.resourceType !== "lesson") {
        const directProduct = await commerceStore.findActiveProductByTarget(
          input.resourceType as any,
          input.resourceId,
        );
        if (directProduct && directProduct.active) {
          if (directProduct.price === 0 && (directProduct.metadata as any)?.explicitlyFree === true) {
            isExplicitlyFree = true;
          } else if (directProduct.price > 0) {
            isExplicitlyPaid = true;
          }
        }
      }

      // Check 2: Parent Course active product (if lesson has no direct active product)
      if (!isExplicitlyFree && !isExplicitlyPaid && effectiveCourseId) {
        const courseProduct = await commerceStore.findActiveProductByTarget(
          "course",
          effectiveCourseId,
        );
        if (courseProduct && courseProduct.active) {
          if (courseProduct.price === 0 && (courseProduct.metadata as any)?.explicitlyFree === true) {
            isExplicitlyFree = true;
          } else if (courseProduct.price > 0) {
            isExplicitlyPaid = true;
          }
        }
      }

      // Check 3: Parent Content Pack (if associated with a content pack)
      if (!isExplicitlyFree && !isExplicitlyPaid && effectiveContentPackId && this.deps.contentPackStore) {
        const pack = await this.deps.contentPackStore.findById(effectiveContentPackId);
        if (pack) {
          if (pack.metadata?.accessType === "free") {
            isExplicitlyFree = true;
          } else if (pack.metadata?.accessType === "paid") {
            isExplicitlyPaid = true;
          }
        }
      }

      if (isExplicitlyFree) {
        return {
          granted: true,
          reason: "free",
          expiresAt: null,
          availablePurchaseOptions: [],
        };
      }
    }

    // -----------------------------------------------------------------------
    // 5.4 Controlled Free Preview Evaluation via PreviewResolver
    // Architecture: PreviewResolver -> EntitlementService -> Service/Route
    // Free Preview applies ONLY to commercial paid content/courses.
    // -----------------------------------------------------------------------
    if (this.previewResolver && isExplicitlyPaid) {
      if (
        (input.resourceType === "lesson" || input.resourceType === "content") &&
        effectiveLessonId
      ) {
        const isPreview = await this.previewResolver.isLessonPreview(
          effectiveLessonId,
          input.moduleId,
          effectiveCourseId,
          input.previewSessionId,
        );
        if (isPreview) {
          return {
            granted: true,
            reason: "free_preview",
            accessSource: "free_preview",
            expiresAt: null,
            availablePurchaseOptions: [],
          };
        }
      } else if (input.resourceType === "quiz" && input.resourceId) {
        const isPreview = await this.previewResolver.isQuizPreview(
          input.resourceId,
          effectiveCourseId,
        );
        if (isPreview) {
          return {
            granted: true,
            reason: "free_preview",
            accessSource: "free_preview",
            expiresAt: null,
            availablePurchaseOptions: [],
          };
        }
      } else if (input.resourceType === "flashcard" && input.resourceId) {
        const isPreview = await this.previewResolver.isFlashcardPreview(
          input.resourceId,
          effectiveCourseId,
        );
        if (isPreview) {
          return {
            granted: true,
            reason: "free_preview",
            accessSource: "free_preview",
            expiresAt: null,
            availablePurchaseOptions: [],
          };
        }
      }
    }

    // -----------------------------------------------------------------------
    // 6. Access Denied / Locked — Build Purchase Options
    // -----------------------------------------------------------------------
    const availablePurchaseOptions = await this.getPurchaseOptions({
      courseId: effectiveCourseId,
      contentPackId: effectiveContentPackId,
      lessonId: effectiveLessonId,
    });

    return {
      granted: false,
      reason: "locked",
      expiresAt: null,
      availablePurchaseOptions,
    };
  }

  /**
   * Resolves the designated preview lesson ID for a course.
   * Priority:
   * 1. courseProduct.metadata.previewLessonId (if configured)
   * 2. lessonProduct with metadata.isPreview === true or metadata.explicitlyFree === true
   * 3. Deterministic preview lesson from candidateLessons (fallback)
   */
  public async resolveCoursePreviewLessonId(
    courseId: CourseId,
    _candidateLessons?: Array<{ id: string; sortOrder: number; publicationStatus?: string }>,
  ): Promise<string | null> {
    if (this.previewResolver) {
      const lesson = await this.previewResolver.resolveCoursePreviewLesson(courseId);
      return lesson ? lesson.id : null;
    }
    return null;
  }

  /**
   * Resolves the actual runtime hierarchy for any educational entity.
   */
  public async resolveHierarchy(input: CheckAccessInput): Promise<{
    courseId?: CourseId;
    contentPackId?: ContentPackId;
    creatorUserId?: UserId;
  }> {
    const {
      lessonStore,
      moduleStore,
      flashcardStore,
      quizStore,
      contentPackStore,
      courseStore,
    } = this.deps;

    let courseId: CourseId | undefined = input.courseId;
    let contentPackId: ContentPackId | undefined = input.contentPackId;
    let creatorUserId: UserId | undefined;

    try {
      if (input.resourceType === "course") {
        courseId = asCourseId(input.resourceId as any);
        if (courseStore) {
          const c = await courseStore.findById(courseId);
          if (c) creatorUserId = (c as any).ownerUserId ?? undefined;
        }
      } else if (input.resourceType === "content_pack") {
        contentPackId = asContentPackId(input.resourceId as any);
        if (contentPackStore) {
          const pack = await contentPackStore.findById(contentPackId);
          if (pack && pack.creatorUserId) {
            creatorUserId = pack.creatorUserId;
          }
        }
      } else if (input.resourceType === "lesson" || input.resourceType === "content") {
        if (lessonStore) {
          const lesson = await lessonStore.findById(input.resourceId as any);
          if (lesson && moduleStore) {
            const mod = await moduleStore.findById(lesson.moduleId as ModuleId);
            if (mod) {
              courseId = mod.courseId;
              if (mod.documentId && contentPackStore) {
                const activePack = await contentPackStore.findActiveByDocument(
                  mod.documentId,
                );
                if (activePack) {
                  contentPackId = activePack.id;
                }
              }
            }
          }
        }
      } else if (input.resourceType === "module") {
        if (moduleStore) {
          const mod = await moduleStore.findById(input.resourceId as any);
          if (mod) {
            courseId = mod.courseId;
            if (mod.documentId && contentPackStore) {
              const activePack = await contentPackStore.findActiveByDocument(
                mod.documentId,
              );
              if (activePack) {
                contentPackId = activePack.id;
              }
            }
          }
        }
      } else if (input.resourceType === "flashcard") {
        if (flashcardStore) {
          let fc: any = typeof (flashcardStore as any).findById === "function"
            ? await (flashcardStore as any).findById(input.resourceId)
            : undefined;
          if (!fc && typeof (flashcardStore as any).findByIdForOrganization === "function") {
            fc = await (flashcardStore as any).findByIdForOrganization(input.resourceId);
          }
          if (!fc && (flashcardStore as any).flashcards instanceof Map) {
            fc = (flashcardStore as any).flashcards.get(input.resourceId);
          }
          if (fc) {
            courseId = fc.courseId as CourseId;
            if (fc.documentId && contentPackStore) {
              const activePack = await contentPackStore.findActiveByDocument(
                fc.documentId,
              );
              if (activePack) {
                contentPackId = activePack.id;
              }
            }
          }
        }
      } else if (input.resourceType === "quiz") {
        if (quizStore) {
          let qz: any = typeof (quizStore as any).findById === "function"
            ? await (quizStore as any).findById(input.resourceId)
            : undefined;
          if (!qz && typeof (quizStore as any).findByIdForOrganization === "function") {
            qz = await (quizStore as any).findByIdForOrganization(input.resourceId);
          }
          if (!qz && (quizStore as any).quizzes instanceof Map) {
            qz = (quizStore as any).quizzes.get(input.resourceId);
          }
          if (qz) {
            courseId = qz.courseId as CourseId;
            if (qz.documentId && contentPackStore) {
              const activePack = await contentPackStore.findActiveByDocument(
                qz.documentId,
              );
              if (activePack) {
                contentPackId = activePack.id;
              }
            }
          }
        }
      } else if (input.resourceType === "document") {
        if (this.deps.documentStore) {
          const doc = typeof (this.deps.documentStore as any).findById === "function"
            ? await (this.deps.documentStore as any).findById(input.resourceId)
            : undefined;
          if (doc) {
            creatorUserId = doc.ownerUserId as UserId;
            if (doc.courseId) {
              courseId = asCourseId(doc.courseId);
            }
            if (contentPackStore) {
              const activePack = await contentPackStore.findActiveByDocument(doc.id);
              if (activePack) {
                contentPackId = activePack.id;
              }
            }
          }
        }
      }

      if (courseId && !creatorUserId && courseStore) {
        const c = await courseStore.findById(courseId);
        if (c) creatorUserId = (c as any).ownerUserId ?? undefined;
      }
    } catch {
      // In case of parsing or resolution error, fallback gracefully
    }

    return {
      courseId,
      contentPackId,
      creatorUserId,
    };
  }

  /**
   * Retrieves active purchasing options for paywalls.
   */
  private async getPurchaseOptions(params: {
    courseId?: CourseId;
    contentPackId?: ContentPackId;
    lessonId?: string;
  }): Promise<ResourceAccessResult["availablePurchaseOptions"]> {
    const { commerceStore } = this.deps;
    const activeProducts = await commerceStore.listActiveProducts();
    const options: ResourceAccessResult["availablePurchaseOptions"] = [];

    // 1. Always include subscription products
    for (const p of activeProducts) {
      if (p.type === "subscription") {
        options.push(this.mapProductToOption(p));
      }
    }

    // 2. Include Content (Lesson) product if explicitly defined and active
    if (params.lessonId) {
      const lessonProduct = await commerceStore.findActiveProductByTarget(
        "content",
        params.lessonId,
      );
      if (lessonProduct && lessonProduct.price > 0 && lessonProduct.active) {
        options.push(this.mapProductToOption(lessonProduct));
      }
    }

    // 3. Include Course product if explicitly defined and active
    if (params.courseId) {
      const courseProduct = await commerceStore.findActiveProductByTarget(
        "course",
        params.courseId,
      );
      if (courseProduct && courseProduct.price > 0 && courseProduct.active) {
        options.push(this.mapProductToOption(courseProduct));
      }
    }

    // 4. Include Content Pack product if explicitly defined and active
    if (params.contentPackId) {
      const packProduct = await commerceStore.findActiveProductByTarget(
        "content_pack",
        params.contentPackId,
      );
      if (packProduct && packProduct.price > 0 && packProduct.active) {
        options.push(this.mapProductToOption(packProduct));
      }
    }

    return options;
  }

  private mapProductToOption(
    p: ProductRecord,
  ): ResourceAccessResult["availablePurchaseOptions"][0] {
    return {
      type: p.type,
      productId: p.id,
      code: p.code,
      title: p.title,
      price: p.price,
      currency: p.currency,
      durationDays: p.durationDays,
    };
  }
}
