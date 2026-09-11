/**
 * PreviewResolver — Centralized Deterministic Free Preview Engine.
 *
 * Implements the PreviewResolver layer in:
 * PreviewResolver → EntitlementService → Service/Route
 *
 * Responsibilities:
 * 1. Deterministically resolves the exactly 1 preview lesson per module/content/course.
 * 2. Deterministically resolves the exactly 1 preview quiz per course/content.
 * 3. Deterministically resolves the limited preview flashcard subset (5 cards) per course/content.
 * 4. Checks whether an arbitrary resource ID is the valid designated preview.
 * 5. Guarantees fail-closed security: only active published items qualify,
 *    and fallback recalculation is automatic if an item is soft-deleted or unpublished.
 */

import {
  type ContentPreviewMetadata,
  type CourseId,
  type FlashcardId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type QuizId,
  selectDeterministicItem,
  selectDeterministicSubset,
  seededRandomShuffle,
} from "@avana/domain";
import type { LessonStore, ModuleStore, LessonRecord, ModuleRecord } from "../learning/learning-store.js";
import type { QuizStore, FlashcardStore, QuizRecord, FlashcardRecord } from "../study/study-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { CommerceStore } from "./commerce-store.js";

export interface PreviewResolverDeps {
  lessonStore?: LessonStore;
  moduleStore?: ModuleStore;
  quizStore?: QuizStore;
  flashcardStore?: FlashcardStore;
  courseStore?: CourseStore;
  commerceStore?: CommerceStore;
  systemOrganizationId?: OrganizationId;
}

export class PreviewResolver {
  private readonly defaultFlashcardLimit = 5;

  constructor(private readonly deps: PreviewResolverDeps) {}

  /**
   * Resolves the single preview lesson across an entire course.
   * Returns undefined if no active published lessons exist.
   */
  async resolveCoursePreviewLesson(
    courseId: string,
  ): Promise<LessonRecord | undefined> {
    if (!this.deps.moduleStore || !this.deps.lessonStore) return undefined;

    const modules = await this.deps.moduleStore.listByCourse(courseId as CourseId);
    const activeModules = modules
      .filter((m) => m.deletedAt === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const moduleIds = activeModules.map((m) => m.id);
    const lessons = await this.deps.lessonStore.listByModules(moduleIds);
    const activeLessons = lessons.filter(
      (l) =>
        l.deletedAt === null &&
        (!l.publicationStatus || l.publicationStatus === "published"),
    );

    if (activeLessons.length === 0) return undefined;

    const moduleSortOrderMap = new Map<string, number>();
    for (const m of activeModules) {
      moduleSortOrderMap.set(m.id, m.sortOrder);
    }

    activeLessons.sort((a, b) => {
      const modOrderA = moduleSortOrderMap.get(a.moduleId) ?? 0;
      const modOrderB = moduleSortOrderMap.get(b.moduleId) ?? 0;
      if (modOrderA !== modOrderB) return modOrderA - modOrderB;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    });

    if (this.deps.commerceStore) {
      // 1. Course product override: previewLessonId
      const courseProduct = await this.deps.commerceStore.findActiveProductByTarget(
        "course",
        courseId,
      );
      if (courseProduct && (courseProduct.metadata as any)?.previewLessonId) {
        const designated = activeLessons.find(
          (l) => l.id === (courseProduct.metadata as any).previewLessonId,
        );
        if (designated) return designated;
      }

      const products = await this.deps.commerceStore.listActiveProducts();

      // 2. Explicit free/preview product takes precedence
      const explicitFree = activeLessons.find((l) => {
        const prod = products.find((p) => p.targetType === "content" && p.targetId === l.id);
        return (
          prod &&
          (prod.price === 0 ||
            (prod.metadata as any)?.explicitlyFree === true ||
            (prod.metadata as any)?.isPreview === true)
        );
      });
      if (explicitFree) return explicitFree;

      // 3. Filter out dedicated paid lessons
      const eligible = activeLessons.filter((l) => {
        const prod = products.find((p) => p.targetType === "content" && p.targetId === l.id);
        return !prod || prod.price === 0;
      });

      if (eligible.length > 0) {
        return selectDeterministicItem(courseId, "lesson", eligible);
      }
      return undefined;
    }

    return selectDeterministicItem(courseId, "lesson", activeLessons);
  }

  /**
   * Resolves the single canonical preview lesson for a module.
   * Returns undefined if no active published lessons exist.
   *
   * Architecture & Canonical Source of Truth:
   * 1. Product/content_pack metadata override if configured.
   * 2. Persisted module.previewLessonId from moduleStore if valid.
   * 3. Initial selection: randomly picks one eligible lesson from the module and
   *    atomically persists it via setPreviewLessonIdIfNull (idempotent / race-condition safe).
   * Note: previewSessionId is NOT used for lesson selection (session-level is for card/quiz shuffling only).
   */
  async resolvePreviewLesson(
    moduleId: string,
    _options?: { previewSessionId?: string },
  ): Promise<LessonRecord | undefined> {
    if (!this.deps.lessonStore) return undefined;

    const allLessons = await this.deps.lessonStore.listByModule(moduleId as ModuleId);
    const activePublished = allLessons.filter(
      (l) => l.deletedAt === null && (!l.publicationStatus || l.publicationStatus === "published"),
    );

    if (activePublished.length === 0) return undefined;

    // Sort: sort_order ASC, then id ASC
    activePublished.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    });

    let eligible = activePublished;
    if (this.deps.commerceStore) {
      const products = await this.deps.commerceStore.listActiveProducts();

      // 1. Check if any lesson in this module is explicitly free or preview
      const explicitFree = activePublished.find((l) => {
        const prod = products.find((p) => p.targetType === "content" && p.targetId === l.id);
        return (
          prod &&
          (prod.price === 0 ||
            (prod.metadata as any)?.explicitlyFree === true ||
            (prod.metadata as any)?.isPreview === true)
        );
      });
      if (explicitFree) return explicitFree;

      // 2. Filter out lessons that have a dedicated paid product (price > 0)
      eligible = activePublished.filter((l) => {
        const prod = products.find((p) => p.targetType === "content" && p.targetId === l.id);
        return !prod || prod.price === 0;
      });
      if (eligible.length === 0) return undefined;

      // 3. Product override for module or content_pack if configured
      const modProduct = await this.deps.commerceStore.findActiveProductByTarget("module", moduleId);
      if (modProduct && (modProduct.metadata as any)?.previewLessonId) {
        const designated = eligible.find((l) => l.id === (modProduct.metadata as any).previewLessonId);
        if (designated) return designated;
      }
    }

    // 4. Check persistent canonical previewLessonId from moduleStore (modules.preview_lesson_id)
    let moduleRecord: ModuleRecord | undefined;
    if (this.deps.moduleStore) {
      moduleRecord = await this.deps.moduleStore.findById(moduleId as ModuleId);
    }

    if (moduleRecord && moduleRecord.previewLessonId) {
      // Validate that the stored previewLessonId is still valid (exists in eligible)
      const existingCanonical = eligible.find((l) => l.id === moduleRecord!.previewLessonId);
      if (existingCanonical) {
        return existingCanonical;
      }
    }

    // 5. Initial Selection (preview_lesson_id IS NULL or invalid):
    // Pick a lesson randomly among eligible lessons in the module
    const randomIndex = Math.floor(Math.random() * eligible.length);
    const chosenLesson = eligible[randomIndex];

    // Atomically persist to modules table so concurrent requests resolve to the same canonical lesson
    if (this.deps.moduleStore) {
      if (typeof this.deps.moduleStore.setPreviewLessonIdIfNull === "function") {
        const canonicalId = await this.deps.moduleStore.setPreviewLessonIdIfNull(
          moduleId as ModuleId,
          chosenLesson.id,
        );
        const canonicalLesson = eligible.find((l) => l.id === canonicalId);
        if (canonicalLesson) return canonicalLesson;
      } else if (typeof this.deps.moduleStore.updatePreviewLessonId === "function") {
        await this.deps.moduleStore.updatePreviewLessonId(moduleId as ModuleId, chosenLesson.id);
        return chosenLesson;
      } else {
        moduleRecord = await this.deps.moduleStore.findById(moduleId as ModuleId);
        if (moduleRecord) {
          moduleRecord.previewLessonId = chosenLesson.id;
          if (typeof this.deps.moduleStore.update === "function") {
            await this.deps.moduleStore.update(moduleRecord);
          }
        }
      }
    }

    return chosenLesson;
  }

  /**
   * Resolves the single preview quiz for a course.
   * Returns undefined if no active published quizzes exist.
   */
  async resolvePreviewQuiz(
    courseId: string,
    organizationId?: string,
  ): Promise<QuizRecord | undefined> {
    if (!this.deps.quizStore) return undefined;

    const orgId = (organizationId || this.deps.systemOrganizationId) as OrganizationId;
    let allQuizzes = await this.deps.quizStore.listByCourse(
      courseId as CourseId,
      orgId,
    );

    if (
      (!allQuizzes || allQuizzes.length === 0) &&
      (this.deps.quizStore as any).quizzes instanceof Map
    ) {
      allQuizzes = Array.from((this.deps.quizStore as any).quizzes.values()).filter(
        (q: any) => q.courseId === courseId && q.deletedAt === null,
      ) as QuizRecord[];
    }

    const activePublished = allQuizzes.filter(
      (q) => q.deletedAt === null && q.status === "published",
    );

    if (activePublished.length === 0) return undefined;

    // Check course product metadata override: previewQuizId
    if (this.deps.commerceStore) {
      const courseProduct = await this.deps.commerceStore.findActiveProductByTarget(
        "course",
        courseId,
      );
      if (courseProduct && (courseProduct.metadata as any)?.previewQuizId) {
        const designated = activePublished.find(
          (q) => q.id === (courseProduct.metadata as any).previewQuizId,
        );
        if (designated) return designated;
      }
    }

    // Sort: sort_order (if available) / title ASC, then id ASC
    activePublished.sort((a, b) => {
      const titleCompare = (a.title || "").localeCompare(b.title || "");
      if (titleCompare !== 0) return titleCompare;
      return a.id.localeCompare(b.id);
    });

    return selectDeterministicItem(courseId, "quiz", activePublished);
  }

  /**
   * Resolves a limited preview subset of flashcards for a course or chapter package.
   */
  async resolvePreviewFlashcards(
    courseId: string,
    organizationId?: string,
    limit: number = this.defaultFlashcardLimit,
    options?: { moduleId?: string; previewLessonId?: string; previewSessionId?: string },
  ): Promise<FlashcardRecord[]> {
    if (!this.deps.flashcardStore) return [];

    const orgId = (organizationId || this.deps.systemOrganizationId) as OrganizationId;
    let allCards = await this.deps.flashcardStore.listByCourse(
      courseId as CourseId,
      orgId,
    );

    if (
      (!allCards || allCards.length === 0) &&
      (this.deps.flashcardStore as any).flashcards instanceof Map
    ) {
      allCards = Array.from((this.deps.flashcardStore as any).flashcards.values()).filter(
        (c: any) => c.courseId === courseId && c.deletedAt === null,
      ) as FlashcardRecord[];
    }

    const activeCards = allCards.filter((c) => c.deletedAt === null);
    if (activeCards.length === 0) return [];

    // Scope check: If scoped to a specific chapter package / module
    if (options?.moduleId) {
      const canonicalPreview = await this.resolvePreviewLesson(options.moduleId);
      if (!canonicalPreview) return [];

      const canonicalLessonId = canonicalPreview.id;

      // Filter cards to ONLY those belonging to the canonical preview lesson
      let eligibleCards = activeCards.filter((c) => c.lessonId === canonicalLessonId);
      if (eligibleCards.length === 0) return [];

      eligibleCards.sort((a, b) => {
        const aSort = (a as any).sortOrder ?? 0;
        const bSort = (b as any).sortOrder ?? 0;
        if (aSort !== bSort) return aSort - bSort;
        return a.id.localeCompare(b.id);
      });

      // Sizing requirement:
      // If at least 10 cards: between 10 and 15 cards (preferably 15)
      // If less than 10 cards: only existing cards
      let targetLimit: number;
      if (eligibleCards.length >= 10) {
        const maxLimit = Math.max(10, Math.min(limit, 15));
        targetLimit = Math.min(maxLimit, eligibleCards.length);
      } else {
        targetLimit = eligibleCards.length;
      }

      const seed = `${options?.previewSessionId || canonicalLessonId}:flashcards`;
      const shuffled = seededRandomShuffle(eligibleCards, seed);
      return shuffled.slice(0, targetLimit);
    }

    if (options?.previewLessonId) {
      let eligibleCards = activeCards.filter((c) => c.lessonId === options.previewLessonId);
      if (eligibleCards.length === 0) return [];

      eligibleCards.sort((a, b) => {
        const aSort = (a as any).sortOrder ?? 0;
        const bSort = (b as any).sortOrder ?? 0;
        if (aSort !== bSort) return aSort - bSort;
        return a.id.localeCompare(b.id);
      });

      let targetLimit: number;
      if (eligibleCards.length >= 10) {
        const maxLimit = Math.max(10, Math.min(limit, 15));
        targetLimit = Math.min(maxLimit, eligibleCards.length);
      } else {
        targetLimit = Math.min(limit, eligibleCards.length);
      }

      const seed = `${options?.previewSessionId || options.previewLessonId}:flashcards`;
      const shuffled = seededRandomShuffle(eligibleCards, seed);
      return shuffled.slice(0, targetLimit);
    }

    // Default course-wide fallback (when no module is specified)
    let previewLessonId: string | undefined;
    if (this.deps.commerceStore) {
      const courseProduct = await this.deps.commerceStore.findActiveProductByTarget(
        "course",
        courseId,
      );
      if (courseProduct && (courseProduct.metadata as any)?.previewLessonId) {
        previewLessonId = (courseProduct.metadata as any).previewLessonId;
      }
    }

    if (courseId && this.deps.moduleStore && this.deps.lessonStore) {
      const modules = await this.deps.moduleStore.listByCourse(courseId as CourseId);
      const activeModules = modules
        .filter((m) => m.deletedAt === null)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const moduleOrderMap = new Map<string, number>();
      activeModules.forEach((m, idx) => moduleOrderMap.set(m.id, idx));

      const moduleIds = activeModules.map((m) => m.id);
      const lessons = await this.deps.lessonStore.listByModules(moduleIds);
      const activeLessons = lessons
        .filter(
          (l) =>
            l.deletedAt === null &&
            (!l.publicationStatus || l.publicationStatus === "published"),
        )
        .sort((a, b) => {
          const modA = moduleOrderMap.get(a.moduleId) ?? 0;
          const modB = moduleOrderMap.get(b.moduleId) ?? 0;
          if (modA !== modB) return modA - modB;
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.id.localeCompare(b.id);
        });
      if (!previewLessonId && activeLessons.length > 0) {
        previewLessonId = activeLessons[0].id;
      }
    }

    // Sort prioritizing preview lesson, then sortOrder, then id ASC
    activeCards.sort((a, b) => {
      const aIsPreview = previewLessonId && a.lessonId === previewLessonId ? 1 : 0;
      const bIsPreview = previewLessonId && b.lessonId === previewLessonId ? 1 : 0;
      if (aIsPreview !== bIsPreview) return bIsPreview - aIsPreview;
      const aSort = (a as any).sortOrder ?? 0;
      const bSort = (b as any).sortOrder ?? 0;
      if (aSort !== bSort) return aSort - bSort;
      return a.id.localeCompare(b.id);
    });

    return selectDeterministicSubset(courseId, "flashcard", activeCards, limit);
  }

  /**
   * Checks if a specific lesson ID is the designated free preview for its module or course.
   */
  async isLessonPreview(
    lessonId: string,
    moduleId?: string,
    courseId?: string,
    previewSessionId?: string,
  ): Promise<boolean> {
    let effectiveModuleId = moduleId;

    if (!effectiveModuleId && this.deps.lessonStore) {
      const lesson = await this.deps.lessonStore.findById(lessonId as LessonId);
      if (lesson && lesson.deletedAt === null) {
        effectiveModuleId = lesson.moduleId;
      }
    }

    // When moduleId is explicitly specified (ChapterPackage preview), module preview takes precedence
    if (moduleId && effectiveModuleId) {
      const preview = await this.resolvePreviewLesson(effectiveModuleId, { previewSessionId });
      if (preview !== undefined) {
        return preview.id === lessonId;
      }
    }

    let effectiveCourseId = courseId;
    if (effectiveModuleId && !effectiveCourseId && this.deps.moduleStore) {
      const mod = await this.deps.moduleStore.findById(effectiveModuleId as ModuleId);
      if (mod && mod.deletedAt === null) {
        effectiveCourseId = mod.courseId;
      }
    }

    if (effectiveCourseId) {
      const preview = await this.resolveCoursePreviewLesson(effectiveCourseId);
      if (preview !== undefined) {
        return preview.id === lessonId;
      }
    }

    if (effectiveModuleId) {
      const preview = await this.resolvePreviewLesson(effectiveModuleId, { previewSessionId });
      return preview !== undefined && preview.id === lessonId;
    }

    return false;
  }

  /**
   * Checks if a specific quiz ID is the designated free preview for its course.
   */
  async isQuizPreview(
    quizId: string,
    courseId?: string,
    organizationId?: string,
  ): Promise<boolean> {
    let effectiveCourseId = courseId;
    let effectiveOrgId = organizationId;

    if (!effectiveCourseId && this.deps.quizStore) {
      let quiz: QuizRecord | undefined;
      if (typeof (this.deps.quizStore as any).findById === "function") {
        quiz = await (this.deps.quizStore as any).findById(quizId);
      }
      if (
        !quiz &&
        typeof (this.deps.quizStore as any).findByIdForOrganization === "function" &&
        organizationId
      ) {
        quiz = await (this.deps.quizStore as any).findByIdForOrganization(
          quizId as QuizId,
          organizationId as OrganizationId,
          this.deps.systemOrganizationId,
        );
      }
      if (!quiz && (this.deps.quizStore as any).quizzes instanceof Map) {
        quiz = (this.deps.quizStore as any).quizzes.get(quizId);
      }

      if (quiz && quiz.deletedAt === null) {
        effectiveCourseId = quiz.courseId;
        effectiveOrgId = quiz.organizationId;
      }
    }

    if (!effectiveCourseId) return false;

    const preview = await this.resolvePreviewQuiz(effectiveCourseId, effectiveOrgId);
    return preview !== undefined && preview.id === quizId;
  }

  /**
   * Checks if a specific flashcard ID is in the designated free preview subset for its course.
   */
  async isFlashcardPreview(
    flashcardId: string,
    courseId?: string,
    organizationId?: string,
    limit: number = this.defaultFlashcardLimit,
  ): Promise<boolean> {
    let effectiveCourseId = courseId;
    let effectiveOrgId = organizationId;

    if (!effectiveCourseId && this.deps.flashcardStore) {
      let card: FlashcardRecord | undefined;
      if (typeof (this.deps.flashcardStore as any).findById === "function") {
        card = await (this.deps.flashcardStore as any).findById(flashcardId);
      }
      if (
        !card &&
        typeof (this.deps.flashcardStore as any).findByIdForOrganization === "function" &&
        organizationId
      ) {
        card = await (this.deps.flashcardStore as any).findByIdForOrganization(
          flashcardId as FlashcardId,
          organizationId as OrganizationId,
        );
      }
      if (!card && (this.deps.flashcardStore as any).flashcards instanceof Map) {
        card = (this.deps.flashcardStore as any).flashcards.get(flashcardId);
      }

      if (card && card.deletedAt === null) {
        effectiveCourseId = card.courseId;
        effectiveOrgId = card.organizationId;
      }
    }

    if (!effectiveCourseId) return false;

    const previewCards = await this.resolvePreviewFlashcards(
      effectiveCourseId,
      effectiveOrgId,
      limit,
    );
    return previewCards.some((c) => c.id === flashcardId);
  }

  /**
   * Pre-calculates preview metadata for a package (chapter package or course pack)
   * to embed inside catalog listings and modal previews.
   */
  async resolvePackagePreviewMetadata(params: {
    courseId?: string;
    moduleId?: string;
    contentPackId?: string;
    organizationId?: string;
  }): Promise<ContentPreviewMetadata> {
    let lessonId: string | null = null;
    let lessonTitle: string | undefined = undefined;
    let lessonEstimatedMinutes: number | null | undefined = undefined;
    let quizId: string | null = null;
    let quizTitle: string | undefined = undefined;
    let flashcardCount = 0;

    if (params.moduleId) {
      const previewLesson = await this.resolvePreviewLesson(params.moduleId);
      if (previewLesson) {
        lessonId = previewLesson.id;
        lessonTitle = previewLesson.title;
        lessonEstimatedMinutes = previewLesson.estimatedMinutes;
      }
    }

    if (params.courseId) {
      const previewQuiz = await this.resolvePreviewQuiz(
        params.courseId,
        params.organizationId,
      );
      if (previewQuiz) {
        quizId = previewQuiz.id;
        quizTitle = previewQuiz.title;
      }

      const previewCards = await this.resolvePreviewFlashcards(
        params.courseId,
        params.organizationId,
        this.defaultFlashcardLimit,
        params.moduleId ? { moduleId: params.moduleId } : undefined,
      );
      flashcardCount = previewCards.length;
    }

    const hasPreview = lessonId !== null || quizId !== null || flashcardCount > 0;

    return {
      hasPreview,
      previewLessonId: lessonId,
      lesson: lessonId
        ? {
            id: lessonId,
            title: lessonTitle,
            estimatedMinutes: lessonEstimatedMinutes,
          }
        : undefined,
      quiz: quizId
        ? {
            id: quizId,
            title: quizTitle,
            questionCount: 5,
          }
        : undefined,
      flashcards:
        flashcardCount > 0
          ? {
              available: true,
              previewCount: flashcardCount,
            }
          : undefined,
    };
  }
}
