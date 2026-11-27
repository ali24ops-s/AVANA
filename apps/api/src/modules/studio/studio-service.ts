import crypto from "node:crypto";
import {
  DomainError,
  type Actor,
  asOrganizationId,
  asUserId,
  asQuizQuestionId,
  asQuestionPatternId,
  resolveCorrectChoiceText,
  normalizeQuestionText,
  distributeQuestionQuotas,
  splitQuotaIntoBatches,
  allocateQuestionPatterns,
  filterExecutableTasks,
  MIN_TOTAL_QUESTIONS,
  MAX_TOTAL_QUESTIONS,
  MAX_BATCH_SIZE,
  toPersianDigits,
  type ChapterQuotaAllocation,
  type StudioExamOperationStatus,
  type StudioExamPatternSnapshot,
} from "@avana/domain";
import type {
  MarketingQuizStore,
  MarketingQuestionBankStore,
  MarketingQuizAttemptStore,
} from "./studio-stores.js";
import type { QuizQuestionStore } from "../study/index.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  modules,
  lessons,
  quizzes,
  quizQuestions,
  marketingQuizzes,
  marketingQuizQuestions,
  marketingQuestionBank,
} from "@avana/database/schema";
import { eq, and, isNull, inArray, notInArray, ilike, or, desc, sql, asc } from "drizzle-orm";
import type {
  MarketingQuiz,
  MarketingQuizStatus,
  MarketingQuizQuestionSnapshot,
  MarketingQuestionBankItem,
  CreateMarketingQuizInput,
  UpdateMarketingQuizInput,
  SubmitAttemptInput,
  PublicQuizPayload,
  PublicAttemptResult,
  PublicAttemptReviewQuestion,
  PublicAttemptSolutionQuestion,
  PublicAttemptSolutionsResult,
  ClaimAttemptResult,
  QuizAnalyticsSummary,
  UnifiedQuestionBankItem,
  QuestionBankSourcesResponse,
  SearchQuestionBankFilters,
  BatchAddQuestionItemInput,
  MarketingQuizChoice,
  NormalizedCorrectAnswer,
  CreateExamGenerationInput,
  GetGeneratedQuestionsFilters,
} from "./types.js";
import {
  type StudioExamStore,
  DrizzleStudioExamStore,
  InMemoryStudioExamStore,
  type CreatedOperationDetails,
  type ActiveOperationSummary,
  type FullOperationDetails,
  type OperationProgressSummary,
  type StagingQuestionRecord,
  type StagingQuestionReviewDecision,
  type ReviewGeneratedQuestionsResult,
  type TransferGeneratedQuestionsResult,
  type ListOperationsByQuizIdResult,
  type CreateOperationTaskParams,
  type CreateOperationBatchParams,
} from "./studio-exam-store.js";
import {
  type StudioExamQueue,
  STUDIO_EXAM_BATCH_JOB_NAME,
} from "./studio-exam-queue.js";
import {
  type QuestionPatternStore,
  DrizzleQuestionPatternStore,
  InMemoryQuestionPatternStore,
} from "../generation/question-patterns-store.js";

export class StudioService {
  private readonly studioExamStoreInstance?: StudioExamStore;
  private readonly questionPatternStoreInstance?: QuestionPatternStore;

  constructor(
    private readonly quizStore: MarketingQuizStore,
    private readonly questionBankStore: MarketingQuestionBankStore,
    private readonly attemptStore: MarketingQuizAttemptStore,
    private readonly quizQuestionStore?: QuizQuestionStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly db?: DbClient,
    studioExamStore?: StudioExamStore,
    private readonly studioExamQueue?: StudioExamQueue,
    questionPatternStore?: QuestionPatternStore,
  ) {
    this.studioExamStoreInstance =
      studioExamStore ?? (db ? new DrizzleStudioExamStore(db) : undefined);
    if (this.studioExamStoreInstance instanceof InMemoryStudioExamStore) {
      this.studioExamStoreInstance.setQuizStore(this.quizStore);
    }
    this.questionPatternStoreInstance =
      questionPatternStore ??
      (db
        ? new DrizzleQuestionPatternStore(db)
        : this.studioExamStoreInstance instanceof InMemoryStudioExamStore
          ? new InMemoryQuestionPatternStore()
          : undefined);
  }

  private async loadActiveExamPatternSnapshots(): Promise<StudioExamPatternSnapshot[]> {
    if (!this.questionPatternStoreInstance) {
      throw new DomainError(
        "internal_error",
        "سرویس الگوهای سؤال برای تولید هوشمند آزمون در دسترس نیست.",
      );
    }

    const activePatterns = await this.questionPatternStoreInstance.listPatterns({
      activeOnly: true,
      category: "exam",
    });
    const examPatterns = activePatterns.filter((p) => p.category === "exam" && p.isActive);

    if (examPatterns.length === 0) {
      throw new DomainError(
        "bad_request",
        "هیچ الگوی امتحانی فعال و معتبری برای تولید سؤال آزمون در سیستم یافت نشد.",
      );
    }

    const definitions = (
      await this.questionPatternStoreInstance.findByIds(
        examPatterns.map((p) => asQuestionPatternId(p.id)),
      )
    ).filter((def) => def.category === "exam" && def.isActive);

    if (definitions.length === 0) {
      throw new DomainError(
        "bad_request",
        "جزئیات الگوهای امتحانی فعال در سیستم یافت نشد.",
      );
    }

    return definitions.map((def) => ({
      patternId: def.id,
      patternVersion: def.version,
      title: def.title,
      category: def.category ?? null,
      cognitiveLevel: def.cognitiveLevel ?? null,
      skills: def.skills ?? [],
      systemInstructions: def.systemInstructions,
      examples: (def.examples ?? []).map((ex) => ({
        question: ex.question,
        choices: ex.choices,
        correctAnswer: ex.correctAnswer,
        explanation: ex.explanation ?? null,
        clinicalContext: ex.clinicalContext ?? null,
      })),
    }));
  }

  private getExamStore(): StudioExamStore {
    if (!this.studioExamStoreInstance) {
      throw new DomainError(
        "internal_error",
        "سرویس تولید هوشمند آزمون به درستی پیکربندی نشده است (StudioExamStore در دسترس نیست).",
      );
    }
    return this.studioExamStoreInstance;
  }

  private readonly inFlightAttempts = new Map<string, Promise<PublicAttemptResult>>();

  /**
   * Generates a non-guessable, URL-safe random slug.
   * e.g. 16-character hex/base64url string with high entropy.
   */
  private generateSecureSlug(): string {
    return crypto.randomBytes(9).toString("base64url");
  }

  /**
   * Generates a secure, non-guessable attempt token.
   */
  private generateSecureAttemptToken(): string {
    return crypto.randomBytes(24).toString("base64url");
  }

  /**
   * Enforces Role-Based Access Control for Studio Management.
   * Rules:
   * - platform_admin: full access
   * - organization_admin: access within their organization
   * - content_worker: limited access (draft creation/editing only)
   * - other roles: forbidden
   */
  /**
   * Helper to retrieve all organization IDs where the actor holds a studio-eligible role
   * (organization_admin or content_worker).
   */
  async getValidStudioOrgIds(actor: Actor): Promise<string[]> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return [];
    }

    const orgIds = new Set<string>();

    if (Array.isArray(actor.memberships)) {
      for (const m of actor.memberships) {
        if (m.role === "organization_admin" || m.role === "content_worker") {
          orgIds.add(String(m.organizationId));
        }
      }
    }

    if (this.organizationStore && typeof this.organizationStore.listMembershipsByUserId === "function") {
      try {
        const dbMemberships = await this.organizationStore.listMembershipsByUserId(asUserId(actor.userId));
        for (const m of dbMemberships) {
          if (m.role === "organization_admin" || m.role === "content_worker") {
            orgIds.add(String(m.organizationId));
          }
        }
      } catch {
        // non-fatal
      }
    }

    const validOrgs: string[] = [];
    for (const orgId of orgIds) {
      if (this.organizationStore && typeof this.organizationStore.findById === "function") {
        const org = await this.organizationStore.findById(asOrganizationId(orgId));
        if (org) {
          validOrgs.push(orgId);
        }
      } else {
        validOrgs.push(orgId);
      }
    }

    return validOrgs;
  }

  /**
   * Enforces Role-Based Access Control for Studio Management.
   * Rules:
   * - platform_admin: full global access
   * - organization_admin: access strictly within organizations where they hold active membership
   * - content_worker: draft access strictly within organizations where they hold active membership
   * - other roles or cross-tenant access without valid membership: forbidden
   */
  async assertStudioAccess(
    actor: Actor,
    organizationId?: string | null,
  ): Promise<void> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return;
    }

    // When targeting a specific organization resource:
    if (organizationId) {
      // Reject if organization does not exist or has been soft-deleted
      if (this.organizationStore && typeof this.organizationStore.findById === "function") {
        const org = await this.organizationStore.findById(asOrganizationId(organizationId));
        if (!org) {
          throw new DomainError(
            "forbidden",
            "سازمان مورد نظر غیرفعال یا حذف شده است.",
          );
        }
      }

      const directMembership = actor.memberships?.find(
        (m) => String(m.organizationId) === String(organizationId),
      );
      if (directMembership?.role === "organization_admin" || directMembership?.role === "content_worker") {
        return;
      }

      if (this.organizationStore && typeof this.organizationStore.findMembership === "function") {
        const membership = await this.organizationStore.findMembership(
          asOrganizationId(organizationId),
          asUserId(actor.userId),
        );
        if (membership?.role === "organization_admin" || membership?.role === "content_worker") {
          return;
        }
      }

      throw new DomainError(
        "forbidden",
        "شما به این سازمان دسترسی ندارید.",
      );
    }

    // When no specific organization is requested (e.g. entering studio workspace):
    // Actor must hold at least one valid studio-eligible role in at least one organization.
    const validOrgs = await this.getValidStudioOrgIds(actor);
    if (validOrgs.length > 0) {
      return;
    }

    throw new DomainError(
      "forbidden",
      "شما دسترسی لازم به استودیو آوانا را ندارید.",
    );
  }

  /**
   * Enforces mutation permissions on quizzes:
   * content_worker is restricted to draft status ONLY.
   * They cannot publish, disable, or delete quizzes.
   */
  assertCanMutateStatus(actor: Actor, targetStatus: MarketingQuizStatus): void {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (isPlatformAdmin) return;

    const isContentWorker =
      actor.globalRole === "content_worker" || actor.role === "content_worker";

    if (isContentWorker && targetStatus !== "draft") {
      throw new DomainError(
        "forbidden",
        "تولیدکنندگان محتوا اجازه انتشار یا غیرفعال‌سازی آزمون را ندارند.",
      );
    }
  }

  assertCanDelete(actor: Actor): void {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (isPlatformAdmin) return;

    const isContentWorker =
      actor.globalRole === "content_worker" || actor.role === "content_worker";

    if (isContentWorker) {
      throw new DomainError(
        "forbidden",
        "تولیدکنندگان محتوا اجازه حذف آزمون را ندارند.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Marketing Quizzes CRUD (Management)
  // ---------------------------------------------------------------------------

  async createQuiz(
    actor: Actor,
    input: CreateMarketingQuizInput,
  ): Promise<MarketingQuiz> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    let targetOrgId = input.organizationId ?? null;
    if (!targetOrgId && !isPlatformAdmin) {
      const validOrgs = await this.getValidStudioOrgIds(actor);
      if (validOrgs.length === 0) {
        throw new DomainError("forbidden", "شما دسترسی لازم به استودیو آوانا را ندارید.");
      }
      targetOrgId = validOrgs[0];
    }

    await this.assertStudioAccess(actor, targetOrgId);

    const slug = this.generateSecureSlug();
    return this.quizStore.create({
      organizationId: targetOrgId,
      slug,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      coverImageUrl: input.coverImageUrl?.trim() ?? null,
      status: "draft",
      settings: input.settings ?? {},
      createdBy: actor.userId,
      deletedAt: null,
    });
  }

  async getQuizById(actor: Actor, id: string): Promise<MarketingQuiz> {
    const quiz = await this.quizStore.getById(id);
    if (!quiz) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }
    await this.assertStudioAccess(actor, quiz.organizationId);
    return quiz;
  }

  async listQuizzes(
    actor: Actor,
    filters?: {
      organizationId?: string;
      status?: MarketingQuizStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<MarketingQuiz[]> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    if (filters?.organizationId) {
      await this.assertStudioAccess(actor, filters.organizationId);
      return this.quizStore.list(filters);
    }

    if (isPlatformAdmin) {
      return this.quizStore.list(filters);
    }

    const validOrgs = await this.getValidStudioOrgIds(actor);
    if (validOrgs.length === 0) {
      throw new DomainError("forbidden", "شما دسترسی لازم به استودیو آوانا را ندارید.");
    }

    return this.quizStore.list({
      ...filters,
      organizationIds: validOrgs,
    });
  }

  async updateQuiz(
    actor: Actor,
    id: string,
    input: UpdateMarketingQuizInput,
  ): Promise<MarketingQuiz> {
    const existing = await this.quizStore.getById(id);
    if (!existing) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }
    await this.assertStudioAccess(actor, existing.organizationId);

    if (input.status && input.status !== existing.status) {
      this.assertCanMutateStatus(actor, input.status);
    }

    const updated = await this.quizStore.update(id, input);
    if (!updated) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }
    return updated;
  }

  async deleteQuiz(actor: Actor, id: string): Promise<void> {
    const existing = await this.quizStore.getById(id);
    if (!existing) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }
    await this.assertStudioAccess(actor, existing.organizationId);
    this.assertCanDelete(actor);

    await this.quizStore.softDelete(id);
  }

  // ---------------------------------------------------------------------------
  // Question Snapshots in Quizzes
  // ---------------------------------------------------------------------------

  /**
   * Adds a manual question directly to a marketing quiz as an independent snapshot.
   */
  async addManualQuestion(
    actor: Actor,
    quizId: string,
    questionData: {
      question: string;
      choices: Array<{ id: string; text: string }>;
      correctAnswer: { choiceId: string } | string;
      explanation?: string;
      difficulty?: "easy" | "medium" | "hard";
      topic?: string;
      questionType?: string;
      addToQuestionBank?: boolean;
    },
  ): Promise<MarketingQuizQuestionSnapshot> {
    const quiz = await this.getQuizById(actor, quizId);
    const existingQuestions = await this.quizStore.getQuestions(quizId);
    const sortOrder = existingQuestions.length;

    let bankId: string | null = null;
    if (questionData.addToQuestionBank) {
      const bankItem = await this.questionBankStore.create({
        organizationId: quiz.organizationId,
        sourceType: "manual",
        question: questionData.question,
        choices: questionData.choices,
        correctAnswer: questionData.correctAnswer,
        explanation: questionData.explanation ?? null,
        difficulty: questionData.difficulty ?? "medium",
        topic: questionData.topic ?? null,
        questionType: questionData.questionType ?? "multiple_choice",
        tags: [],
        createdBy: actor.userId,
        deletedAt: null,
      });
      bankId = bankItem.id;
    }

    return this.quizStore.addQuestion({
      marketingQuizId: quizId,
      sourceQuestionId: null,
      sourceBankQuestionId: bankId,
      question: questionData.question.trim(),
      choices: questionData.choices,
      correctAnswer: questionData.correctAnswer,
      explanation: questionData.explanation?.trim() ?? null,
      difficulty: questionData.difficulty ?? "medium",
      topic: questionData.topic?.trim() ?? null,
      questionType: questionData.questionType ?? "multiple_choice",
      sortOrder,
    });
  }

  /**
   * Imports a question from existing AVANA course questions into the marketing quiz.
   * Guarantees a 100% independent immutable Snapshot!
   */
  async addQuestionFromCourse(
    actor: Actor,
    quizId: string,
    sourceQuestionId: string,
  ): Promise<MarketingQuizQuestionSnapshot> {
    await this.getQuizById(actor, quizId);

    if (!this.quizQuestionStore) {
      throw new DomainError("bad_request", "سرویس سؤالات دوره در دسترس نیست");
    }

    const courseQuestions = await this.quizQuestionStore.listByIds([
      asQuizQuestionId(sourceQuestionId),
    ]);
    const courseQ = courseQuestions[0];
    if (!courseQ) {
      throw new DomainError("not_found", "سؤال دوره مورد نظر یافت نشد");
    }

    const existingQuestions = await this.quizStore.getQuestions(quizId);
    const sortOrder = existingQuestions.length;

    const rawChoices = courseQ.choices ?? [];
    const normalizedChoices: Array<{ id: string; text: string }> = Array.isArray(rawChoices)
      ? rawChoices.map((c: unknown, idx: number) => {
          if (typeof c === "object" && c !== null && "id" in c && "text" in c) {
            return {
              id: String((c as { id: unknown }).id),
              text: String((c as { text: unknown }).text),
            };
          }
          return { id: String(idx + 1), text: String(c) };
        })
      : [];

    const correctAnswer: { choiceId: string } | string =
      typeof courseQ.correctAnswer === "object" &&
      courseQ.correctAnswer !== null &&
      "choiceId" in courseQ.correctAnswer
        ? { choiceId: String((courseQ.correctAnswer as { choiceId: unknown }).choiceId) }
        : typeof courseQ.correctAnswer === "string"
        ? courseQ.correctAnswer
        : { choiceId: "1" };

    // Snapshot question content completely
    return this.quizStore.addQuestion({
      marketingQuizId: quizId,
      sourceQuestionId: courseQ.id,
      sourceBankQuestionId: null,
      question: courseQ.question,
      choices: normalizedChoices,
      correctAnswer,
      explanation: courseQ.explanation ?? null,
      difficulty: (courseQ.difficulty as "easy" | "medium" | "hard") || "medium",
      topic: courseQ.topic ?? null,
      questionType: courseQ.questionType || "multiple_choice",
      sortOrder,
    });
  }

  /**
   * Imports a question from the Marketing Question Bank into the quiz.
   * Snapshot guarantees changes in bank won't affect the published quiz.
   */
  async addQuestionFromBank(
    actor: Actor,
    quizId: string,
    bankQuestionId: string,
  ): Promise<MarketingQuizQuestionSnapshot> {
    const quiz = await this.getQuizById(actor, quizId);

    const bankItem = await this.questionBankStore.getById(bankQuestionId);
    if (!bankItem || bankItem.deletedAt) {
      throw new DomainError("not_found", "سؤال بانک یافت نشد");
    }

    if (bankItem.organizationId !== quiz.organizationId) {
      throw new DomainError(
        "forbidden",
        "امکان افزودن سؤال این بانک به این آزمون وجود ندارد.",
      );
    }

    const existingQuestions = await this.quizStore.getQuestions(quizId);
    const sortOrder = existingQuestions.length;

    return this.quizStore.addQuestion({
      marketingQuizId: quizId,
      sourceQuestionId: bankItem.sourceQuestionId ?? null,
      sourceBankQuestionId: bankItem.id,
      question: bankItem.question,
      choices: bankItem.choices,
      correctAnswer: bankItem.correctAnswer,
      explanation: bankItem.explanation ?? null,
      difficulty: bankItem.difficulty,
      topic: bankItem.topic ?? null,
      questionType: bankItem.questionType,
      sortOrder,
    });
  }

  async updateQuestionSnapshot(
    actor: Actor,
    quizId: string,
    questionId: string,
    patch: Partial<MarketingQuizQuestionSnapshot>,
  ): Promise<MarketingQuizQuestionSnapshot> {
    await this.getQuizById(actor, quizId);
    const updated = await this.quizStore.updateQuestion(questionId, patch);
    if (!updated) {
      throw new DomainError("not_found", "سؤال یافت نشد");
    }
    return updated;
  }

  async deleteQuestionSnapshot(
    actor: Actor,
    quizId: string,
    questionId: string,
  ): Promise<void> {
    await this.getQuizById(actor, quizId);
    await this.quizStore.deleteQuestion(questionId);
  }

  async reorderQuizQuestions(
    actor: Actor,
    quizId: string,
    orderedQuestionIds: string[],
  ): Promise<void> {
    await this.getQuizById(actor, quizId);
    await this.quizStore.reorderQuestions(quizId, orderedQuestionIds);
  }

  // ---------------------------------------------------------------------------
  // Question Bank Operations
  // ---------------------------------------------------------------------------

  async createQuestionBankItem(
    actor: Actor,
    input: Omit<MarketingQuestionBankItem, "id" | "createdAt" | "updatedAt" | "deletedAt">,
  ): Promise<MarketingQuestionBankItem> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    let targetOrgId = input.organizationId ?? null;
    if (!targetOrgId && !isPlatformAdmin) {
      const validOrgs = await this.getValidStudioOrgIds(actor);
      if (validOrgs.length === 0) {
        throw new DomainError("forbidden", "شما دسترسی لازم به استودیو آوانا را ندارید.");
      }
      targetOrgId = validOrgs[0];
    }

    await this.assertStudioAccess(actor, targetOrgId);
    return this.questionBankStore.create({
      ...input,
      organizationId: targetOrgId,
      createdBy: actor.userId,
      deletedAt: null,
    });
  }

  async listQuestionBank(
    actor: Actor,
    filters?: {
      organizationId?: string;
      topic?: string;
      difficulty?: string;
      questionType?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<MarketingQuestionBankItem[]> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    if (filters?.organizationId) {
      await this.assertStudioAccess(actor, filters.organizationId);
      return this.questionBankStore.list(filters);
    }

    if (isPlatformAdmin) {
      return this.questionBankStore.list(filters);
    }

    const validOrgs = await this.getValidStudioOrgIds(actor);
    if (validOrgs.length === 0) {
      throw new DomainError("forbidden", "شما دسترسی لازم به استودیو آوانا را ندارید.");
    }

    return this.questionBankStore.list({
      ...filters,
      organizationIds: validOrgs,
    });
  }

  async updateQuestionBankItem(
    actor: Actor,
    id: string,
    patch: Partial<MarketingQuestionBankItem>,
  ): Promise<MarketingQuestionBankItem> {
    const existing = await this.questionBankStore.getById(id);
    if (!existing) {
      throw new DomainError("not_found", "سؤال بانک یافت نشد");
    }
    await this.assertStudioAccess(actor, existing.organizationId);
    const updated = await this.questionBankStore.update(id, patch);
    if (!updated) {
      throw new DomainError("not_found", "سؤال بانک یافت نشد");
    }
    return updated;
  }

  async deleteQuestionBankItem(actor: Actor, id: string): Promise<void> {
    const existing = await this.questionBankStore.getById(id);
    if (!existing) {
      throw new DomainError("not_found", "سؤال بانک یافت نشد");
    }
    await this.assertStudioAccess(actor, existing.organizationId);
    this.assertCanDelete(actor);
    await this.questionBankStore.softDelete(id);
  }

  // ---------------------------------------------------------------------------
  // Public Quiz Taking & Attempt Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Retrieves public quiz payload by slug.
   * - Enforces status is 'published' for normal public access.
   * - If 'draft' and isPreview=true with an authorized studio actor, allows preview.
   * - If 'disabled', informs user that quiz is disabled.
   * - Strips all correctAnswer and explanation fields to prevent leaks!
   */
  async getPublicQuizBySlug(
    slug: string,
    actor?: Actor | null,
    isPreview?: boolean,
  ): Promise<PublicQuizPayload> {
    const quiz = await this.quizStore.getBySlug(slug);
    if (!quiz) {
      throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.");
    }

    if (quiz.status === "disabled") {
      throw new DomainError("bad_request", "این آزمون غیرفعال شده است.");
    }

    const isActualPreview = Boolean(isPreview && quiz.status === "draft");
    let canViewAnswerKey = false;
    if (quiz.status !== "published") {
      if (!isActualPreview || !actor) {
        throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.");
      }
      await this.assertStudioAccess(actor, quiz.organizationId);
      canViewAnswerKey = true;
    } else if (isPreview && actor) {
      try {
        await this.assertStudioAccess(actor, quiz.organizationId);
        canViewAnswerKey = true;
      } catch {
        canViewAnswerKey = false;
      }
    }

    const isStudioPreview = Boolean(isPreview && canViewAnswerKey);

    const questions = await this.quizStore.getQuestions(quiz.id);

    return {
      id: isStudioPreview ? quiz.id : undefined,
      isPreview: isStudioPreview ? true : undefined,
      canViewAnswerKey: isStudioPreview ? true : undefined,
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      coverImageUrl: quiz.coverImageUrl,
      settings: {
        ctaTitle: quiz.settings?.ctaTitle as string | undefined,
        ctaDescription: quiz.settings?.ctaDescription as string | undefined,
        ctaButtonText: quiz.settings?.ctaButtonText as string | undefined,
        ctaUrl: quiz.settings?.ctaUrl as string | undefined,
        passScorePercentage: quiz.settings?.passScorePercentage as number | undefined,
      },
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        choices: q.choices,
        difficulty: q.difficulty,
        topic: q.topic,
        questionType: q.questionType,
        sortOrder: q.sortOrder,
        ...(isStudioPreview
          ? {
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
            }
          : {}),
      })),
    };
  }

  /**
   * Submits answers for a marketing quiz attempt.
   * - Enforces status is 'published' for normal public access.
   * - If 'draft' and isPreview=true with an authorized studio actor, evaluates answers in-memory
   *   WITHOUT saving to attempt store or modifying quiz metrics.
   * - Idempotency: Returns existing result if idempotencyKey was already submitted.
   * - Evaluates answers strictly in Backend.
   * - Returns sanitized result: score, correctCount, wrongCount, attemptToken.
   * - NEVER reveals correct answers or explanations to the taker.
   */
  async submitQuizAttempt(
    slug: string,
    input: SubmitAttemptInput,
    userId?: string | null,
    actor?: Actor | null,
    isPreview?: boolean,
  ): Promise<PublicAttemptResult> {
    const quiz = await this.quizStore.getBySlug(slug);
    if (!quiz) {
      throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.");
    }

    const isPreviewAttempt = Boolean(isPreview && quiz.status === "draft");

    if (quiz.status !== "published") {
      if (!isPreviewAttempt || !actor) {
        throw new DomainError(
          "bad_request",
          "امکان ثبت پاسخ در این آزمون وجود ندارد (آزمون غیرفعال یا پیش‌نویس است).",
        );
      }
      await this.assertStudioAccess(actor, quiz.organizationId);
    }

    // Idempotency check for regular public attempts
    if (!isPreviewAttempt && input.idempotencyKey) {
      const inFlightKey = `${quiz.id}:${input.idempotencyKey}`;
      const inFlight = this.inFlightAttempts.get(inFlightKey);
      if (inFlight) {
        return inFlight;
      }
      const existing = await this.attemptStore.getByIdempotencyKey(
        quiz.id,
        input.idempotencyKey,
      );
      if (existing) {
        return {
          attemptToken: existing.attemptToken,
          quizTitle: quiz.title,
          score: existing.score,
          correctCount: existing.correctCount,
          wrongCount: existing.wrongCount,
          totalQuestions: existing.totalQuestions,
          completedAt: existing.completedAt,
          settings: quiz.settings,
        };
      }
    }

    const processSubmission = async (): Promise<PublicAttemptResult> => {
      const questions = await this.quizStore.getQuestions(quiz.id);
      const validQuestionMap = new Map(questions.map((q) => [q.id, q]));

      // Sanitize input.answers: Strictly retain only valid question IDs of this quiz
      // Extra or unrecognized keys are purged before scoring and saving
      const sanitizedAnswers: Record<string, string> = {};
      if (input.answers && typeof input.answers === "object") {
        for (const [qId, choiceId] of Object.entries(input.answers)) {
          if (validQuestionMap.has(qId) && typeof choiceId === "string" && choiceId.length <= 64) {
            sanitizedAnswers[qId] = choiceId;
          }
        }
      }

      let correctCount = 0;
      let wrongCount = 0;

      for (const q of questions) {
        const userChoiceId = sanitizedAnswers[q.id];
        if (!userChoiceId) {
          wrongCount++;
          continue;
        }

        const isCorrect = this.checkIsAnswerCorrect(userChoiceId, q.correctAnswer, q.choices);
        if (isCorrect) {
          correctCount++;
        } else {
          wrongCount++;
        }
      }

      const totalQuestions = questions.length;
      const score =
        totalQuestions > 0
          ? Math.round((correctCount / totalQuestions) * 100 * 100) / 100
          : 0;

      const questionReviews: PublicAttemptReviewQuestion[] = questions.map((q) => {
        const userChoiceId = sanitizedAnswers[q.id] ?? null;
        const isCorrect = Boolean(
          userChoiceId && this.checkIsAnswerCorrect(userChoiceId, q.correctAnswer, q.choices),
        );
        return {
          id: q.id,
          question: q.question,
          choices: q.choices,
          userAnswer: userChoiceId,
          isCorrect,
        };
      });

      if (isPreviewAttempt) {
        // PREVIEW MODE: Do not write to attemptStore, do not update totalAttempts or averageScore.
        // Return computed evaluation directly without database side-effects.
        return {
          attemptToken: `preview-${this.generateSecureAttemptToken()}`,
          quizTitle: quiz.title,
          score,
          correctCount,
          wrongCount,
          totalQuestions,
          completedAt: new Date(),
          settings: quiz.settings,
          isDraftPreview: true,
          questionReviews,
        };
      }

      const attemptToken = this.generateSecureAttemptToken();

      // Snapshot of questions with choices (without correct answers)
      const questionSnapshots = questions.map((q) => ({
        id: q.id,
        question: q.question,
        choices: q.choices,
      }));

      const attempt = await this.attemptStore.create({
        marketingQuizId: quiz.id,
        attemptToken,
        idempotencyKey: input.idempotencyKey ?? null,
        userId: userId ?? null,
        status: "completed",
        score,
        correctCount,
        wrongCount,
        totalQuestions,
        answers: sanitizedAnswers,
        questionSnapshots,
      });

      return {
        attemptToken: attempt.attemptToken,
        quizTitle: quiz.title,
        score: attempt.score,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        totalQuestions: attempt.totalQuestions,
        completedAt: attempt.completedAt,
        settings: quiz.settings,
        questionReviews,
      };
    };

    if (isPreviewAttempt || !input.idempotencyKey) {
      return processSubmission();
    }

    const inFlightKey = `${quiz.id}:${input.idempotencyKey}`;
    const task = processSubmission();
    this.inFlightAttempts.set(inFlightKey, task);
    try {
      return await task;
    } finally {
      this.inFlightAttempts.delete(inFlightKey);
    }
  }

  /**
   * Helper to check whether user choice matches correctAnswer.
   */
  private checkIsAnswerCorrect(
    userChoiceId: string,
    correctAnswer: unknown,
    choices: MarketingQuizChoice[] = [],
  ): boolean {
    if (!correctAnswer || !userChoiceId) return false;
    if (typeof correctAnswer === "object" && correctAnswer !== null) {
      const ansObj = correctAnswer as Record<string, unknown>;
      if (ansObj.choiceId) {
        return String(ansObj.choiceId) === userChoiceId;
      }
      if (Array.isArray(ansObj.choiceIds)) {
        return (ansObj.choiceIds as string[]).map(String).includes(userChoiceId);
      }
      if (typeof ansObj.booleanAnswer === "boolean") {
        const positiveWords = ["درست", "صحیح", "true"];
        const negativeWords = ["نادرست", "غلط", "false"];
        const targets = ansObj.booleanAnswer ? positiveWords : negativeWords;
        const userChoiceObj = choices.find((c) => c.id === userChoiceId);
        return Boolean(
          userChoiceObj && targets.some((w) => userChoiceObj.text.trim().toLowerCase().includes(w)),
        );
      }
    }
    const raw = String(correctAnswer).trim();
    if (userChoiceId === raw) return true;
    const userChoiceObj = choices.find((c) => c.id === userChoiceId);
    if (userChoiceObj && userChoiceObj.text.trim().toLowerCase() === raw.toLowerCase()) {
      return true;
    }
    return false;
  }

  /**
   * Retrieves sanitized attempt result by secure attemptToken.
   * Viewable even if the quiz is disabled later.
   * NEVER leaks correct answers or other participants' data!
   */
  async getAttemptResult(attemptToken: string): Promise<PublicAttemptResult> {
    const attempt = await this.attemptStore.getByToken(attemptToken);
    if (!attempt) {
      throw new DomainError("not_found", "نتیجه آزمون یافت نشد.");
    }

    const quiz = await this.quizStore.getById(attempt.marketingQuizId);
    const liveQuestions = await this.quizStore.getQuestions(attempt.marketingQuizId);
    const liveQuestionMap = new Map(liveQuestions.map((q) => [q.id, q]));

    const snapshots =
      attempt.questionSnapshots && attempt.questionSnapshots.length > 0
        ? attempt.questionSnapshots
        : liveQuestions.map((q) => ({ id: q.id, question: q.question, choices: q.choices }));

    const questionReviews: PublicAttemptReviewQuestion[] = snapshots.map((s) => {
      const liveQ = liveQuestionMap.get(s.id);
      const userChoiceId = attempt.answers[s.id] ?? null;
      const isCorrect = Boolean(
        liveQ &&
          userChoiceId &&
          this.checkIsAnswerCorrect(userChoiceId, liveQ.correctAnswer, liveQ.choices),
      );
      return {
        id: s.id,
        question: s.question,
        choices: s.choices,
        userAnswer: userChoiceId,
        isCorrect,
      };
    });

    return {
      attemptToken: attempt.attemptToken,
      quizTitle: quiz?.title || "آزمون بازاریابی",
      score: attempt.score,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      totalQuestions: attempt.totalQuestions,
      completedAt: attempt.completedAt,
      settings: quiz?.settings,
      questionReviews,
    };
  }

  /**
   * Claims an anonymous/guest attempt to the authenticated user account.
   * Atomic, idempotent, and rejects if already owned by another user.
   */
  async claimQuizAttempt(
    actor: Actor,
    attemptToken: string,
  ): Promise<ClaimAttemptResult> {
    const attempt = await this.attemptStore.getByToken(attemptToken);
    if (!attempt) {
      throw new DomainError("not_found", "نتیجه آزمون یافت نشد.");
    }

    if (attempt.userId === actor.userId) {
      return {
        success: true,
        attemptToken: attempt.attemptToken,
        userId: actor.userId,
        alreadyClaimed: true,
      };
    }

    if (attempt.userId && attempt.userId !== actor.userId) {
      throw new DomainError("forbidden", "این آزمون متعلق به کاربر دیگری است.");
    }

    const claimed = await this.attemptStore.claimAttempt(attemptToken, actor.userId);
    if (!claimed) {
      throw new DomainError("not_found", "نتیجه آزمون یافت نشد.");
    }

    return {
      success: true,
      attemptToken: claimed.attemptToken,
      userId: actor.userId,
      alreadyClaimed: false,
    };
  }

  /**
   * Retrieves full solutions and explanations for an attempt.
   * Strictly verifies ownership: only the authenticated owner can access!
   */
  async getAttemptSolutions(
    actor: Actor,
    attemptToken: string,
  ): Promise<PublicAttemptSolutionsResult> {
    const attempt = await this.attemptStore.getByToken(attemptToken);
    if (!attempt) {
      throw new DomainError("not_found", "نتیجه آزمون یافت نشد.");
    }

    // STRICT OWNER CHECK
    if (attempt.userId !== actor.userId) {
      throw new DomainError(
        "forbidden",
        "دسترسی به پاسخ‌های تشریحی این آزمون برای حساب کاربری شما مجاز نیست.",
      );
    }

    const quiz = await this.quizStore.getById(attempt.marketingQuizId);
    const liveQuestions = await this.quizStore.getQuestions(attempt.marketingQuizId);
    const liveQuestionMap = new Map(liveQuestions.map((q) => [q.id, q]));

    const snapshots =
      attempt.questionSnapshots && attempt.questionSnapshots.length > 0
        ? attempt.questionSnapshots
        : liveQuestions.map((q) => ({ id: q.id, question: q.question, choices: q.choices }));

    const questions: PublicAttemptSolutionQuestion[] = snapshots.map((s, idx) => {
      const liveQ = liveQuestionMap.get(s.id);
      const userAnswer = attempt.answers[s.id] ?? null;
      const isCorrect = Boolean(
        liveQ &&
          userAnswer &&
          this.checkIsAnswerCorrect(userAnswer, liveQ.correctAnswer, liveQ.choices),
      );

      return {
        id: s.id,
        question: s.question,
        choices: s.choices,
        difficulty: liveQ?.difficulty ?? "medium",
        topic: liveQ?.topic ?? null,
        questionType: liveQ?.questionType ?? "multiple_choice",
        sortOrder: liveQ?.sortOrder ?? idx,
        userAnswer,
        isCorrect,
        correctAnswer: liveQ?.correctAnswer ?? null,
        explanation: liveQ?.explanation ?? null,
      };
    });

    return {
      attemptToken: attempt.attemptToken,
      quizTitle: quiz?.title || "آزمون بازاریابی",
      score: attempt.score,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      totalQuestions: attempt.totalQuestions,
      completedAt: attempt.completedAt,
      questions,
    };
  }

  // ---------------------------------------------------------------------------
  // Analytics & Statistics
  // ---------------------------------------------------------------------------

  async getQuizAnalytics(
    actor: Actor,
    quizId: string,
  ): Promise<QuizAnalyticsSummary> {
    const quiz = await this.getQuizById(actor, quizId);
    const totalAttempts = await this.attemptStore.countByQuiz(quizId);
    const averageScore = await this.attemptStore.getAverageScore(quizId);
    const attempts = await this.attemptStore.listByQuiz(quizId, 1000);

    const scoreDistribution = {
      range0To20: 0,
      range21To40: 0,
      range41To60: 0,
      range61To80: 0,
      range81To100: 0,
    };

    const timelineMap = new Map<string, number>();

    for (const a of attempts) {
      const s = Number(a.score);
      if (s <= 20) scoreDistribution.range0To20++;
      else if (s <= 40) scoreDistribution.range21To40++;
      else if (s <= 60) scoreDistribution.range41To60++;
      else if (s <= 80) scoreDistribution.range61To80++;
      else scoreDistribution.range81To100++;

      const dateStr = a.completedAt.toISOString().split("T")[0];
      timelineMap.set(dateStr, (timelineMap.get(dateStr) ?? 0) + 1);
    }

    const participationTimeline = Array.from(timelineMap.entries())
      .map(([date, count]) => ({ date, attempts: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      totalAttempts,
      averageScore,
      scoreDistribution,
      participationTimeline,
    };
  }

  // ---------------------------------------------------------------------------
  // Unified Question Bank & Normalization
  // ---------------------------------------------------------------------------

  /**
   * Normalizes choices and correct answers across disparate question formats
   * (course quiz questions, bank items, studio quizzes).
   * Adheres strictly to non-guessing, provenance-preserving rules.
   */
  normalizeQuestionPayload(raw: {
    question: string;
    choices?: unknown;
    correctAnswer?: unknown;
    explanation?: string | null;
    difficulty?: string | null;
    topic?: string | null;
    questionType?: string | null;
  }): {
    question: string;
    choices: MarketingQuizChoice[];
    correctAnswer: NormalizedCorrectAnswer;
    explanation: string | null;
    difficulty: "easy" | "medium" | "hard";
    topic: string | null;
    questionType: string;
  } {
    const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
    let normalizedChoices: MarketingQuizChoice[] = rawChoices.map(
      (c: unknown, idx: number) => {
        if (typeof c === "object" && c !== null && "id" in c && "text" in c) {
          return {
            id: String((c as { id: unknown }).id),
            text: String((c as { text: unknown }).text).trim(),
          };
        }
        return { id: String(idx + 1), text: String(c).trim() };
      },
    );

    let questionType = raw.questionType || "multiple_choice";
    if (normalizedChoices.length === 0 && questionType === "true_false") {
      normalizedChoices = [
        { id: "1", text: "درست" },
        { id: "2", text: "نادرست" },
      ];
    }

    // Helper: Map boolean to matching choice ID
    const resolveBooleanChoiceId = (isTrue: boolean): string | null => {
      const trueTerms = ["درست", "صحیح", "true", "بله"];
      const falseTerms = ["نادرست", "غلط", "false", "خیر"];
      const targetTerms = isTrue ? trueTerms : falseTerms;
      for (const term of targetTerms) {
        const found = normalizedChoices.find((c) => c.text.trim().toLowerCase() === term);
        if (found) return found.id;
      }
      return null;
    };

    // Helper: Map letter strictly according to ACTUAL index of choices
    const getLetterChoiceIndex = (val: string): number | null => {
      const s = val.trim().toLowerCase();
      // Persian letters / labels (must correspond strictly to array positions 0..5)
      if (s === "الف" || s === "گزینه ۱" || s === "گزینه 1" || s === "گزینه اول") return 0;
      if (s === "ب" || s === "گزینه ۲" || s === "گزینه 2" || s === "گزینه دوم") return 1;
      if (s === "ج" || s === "گزینه ۳" || s === "گزینه 3" || s === "گزینه سوم") return 2;
      if (s === "د" || s === "گزینه ۴" || s === "گزینه 4" || s === "گزینه چهارم") return 3;
      if (s === "ه" || s === "هـ" || s === "گزینه ۵" || s === "گزینه 5" || s === "گزینه پنجم") return 4;
      if (s === "و" || s === "گزینه ۶" || s === "گزینه 6" || s === "گزینه ششم") return 5;
      // English letters
      if (s === "a" || s === "option a" || s === "option 1") return 0;
      if (s === "b" || s === "option b" || s === "option 2") return 1;
      if (s === "c" || s === "option c" || s === "option 3") return 2;
      if (s === "d" || s === "option d" || s === "option 4") return 3;
      if (s === "e" || s === "option e" || s === "option 5") return 4;
      if (s === "f" || s === "option f" || s === "option 6") return 5;
      return null;
    };

    // Helper: Resolve a single candidate token to a valid choice ID
    const resolveSingleChoiceId = (val: unknown): string | null => {
      if (val === null || val === undefined || val === "") return null;

      // 1. If val is an object with choiceId / choice_id / id
      if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        const candidateId = obj.choiceId ?? obj.choice_id ?? obj.id;
        if (candidateId !== undefined && candidateId !== null) {
          const strId = String(candidateId).trim();
          if (normalizedChoices.some((c) => c.id === strId)) {
            return strId;
          }
          // If candidateId was actually choice text
          const byText = normalizedChoices.find((c) => c.text.trim().toLowerCase() === strId.toLowerCase());
          if (byText) return byText.id;
        }
        if (typeof obj.booleanAnswer === "boolean") {
          return resolveBooleanChoiceId(obj.booleanAnswer);
        }
      }

      // 2. Direct Choice ID match
      if (typeof val === "string") {
        const trimmed = val.trim();
        const directMatch = normalizedChoices.find((c) => c.id === trimmed);
        if (directMatch) return directMatch.id;
      }

      // 3. Boolean match
      if (
        typeof val === "boolean" ||
        val === "true" ||
        val === "false" ||
        val === "درست" ||
        val === "نادرست" ||
        val === "صحیح" ||
        val === "غلط"
      ) {
        const isTrue = val === true || val === "true" || val === "درست" || val === "صحیح";
        const boolId = resolveBooleanChoiceId(isTrue);
        if (boolId) return boolId;
      }

      // 4. Exact & Normalized text matching
      if (typeof val === "string") {
        const trimmed = val.trim();
        // Exact match
        const exact = normalizedChoices.find(
          (c) => c.text.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        if (exact) return exact.id;

        // Normalized text match
        const normVal = normalizeQuestionText(trimmed);
        if (normVal) {
          const normMatch = normalizedChoices.find(
            (c) => normalizeQuestionText(c.text) === normVal,
          );
          if (normMatch) return normMatch.id;
        }

        // Letter matching strictly according to choice order
        const letterIdx = getLetterChoiceIndex(trimmed);
        if (letterIdx !== null && letterIdx >= 0 && letterIdx < normalizedChoices.length) {
          return normalizedChoices[letterIdx].id;
        }

        // Prefix match e.g. "الف) متفورمین" or "A. Metformin"
        const prefixStripped = trimmed.replace(
          /^(?:[a-fA-F1-6]|الف|ب|ج|د|هـ?|و)[\s).:\-–—]+\s*/iu,
          "",
        ).trim();
        if (prefixStripped && prefixStripped !== trimmed) {
          const prefixMatch = normalizedChoices.find(
            (c) =>
              c.text.trim().toLowerCase() === prefixStripped.toLowerCase() ||
              normalizeQuestionText(c.text) === normalizeQuestionText(prefixStripped),
          );
          if (prefixMatch) return prefixMatch.id;
        }

        // Canonical domain resolution fallback
        if (normalizedChoices.length > 0) {
          const resolvedText = resolveCorrectChoiceText(
            normalizedChoices.map((c) => c.text),
            trimmed,
            { strict: true },
          );
          if (resolvedText) {
            const domainMatch = normalizedChoices.find((c) => c.text === resolvedText);
            if (domainMatch) return domainMatch.id;
          }
        }
      }

      // 5. Numeric match (strictly non-guessing: matches choice ID or exact 0-index if 0)
      if (typeof val === "number" && Number.isInteger(val)) {
        const byId = normalizedChoices.find((c) => c.id === String(val));
        if (byId) return byId.id;
        if (val === 0 && normalizedChoices.length > 0) {
          return normalizedChoices[0].id;
        }
      }

      return null;
    };

    // Determine if multi-select
    const rawAns = raw.correctAnswer;
    const isMultiSelectInput =
      questionType === "multi_select" ||
      Array.isArray(rawAns) ||
      (typeof rawAns === "object" &&
        rawAns !== null &&
        Array.isArray((rawAns as Record<string, unknown>).choiceIds));

    let finalCorrectAnswer: NormalizedCorrectAnswer;

    if (isMultiSelectInput) {
      questionType = "multi_select";
      const items: unknown[] = Array.isArray(rawAns)
        ? rawAns
        : typeof rawAns === "object" && rawAns !== null && Array.isArray((rawAns as Record<string, unknown>).choiceIds)
        ? ((rawAns as Record<string, unknown>).choiceIds as unknown[])
        : rawAns !== undefined && rawAns !== null
        ? [rawAns]
        : [];

      const resolvedIds: string[] = [];
      for (const item of items) {
        const id = resolveSingleChoiceId(item);
        if (id && !resolvedIds.includes(id)) {
          resolvedIds.push(id);
        }
      }

      if (resolvedIds.length > 0) {
        finalCorrectAnswer = {
          choiceId: resolvedIds[0],
          choiceIds: resolvedIds,
        };
      } else {
        // Ambiguous / invalid multi-select: DO NOT assign to option 1!
        finalCorrectAnswer = {
          choiceId: null,
          choiceIds: [],
          ambiguous: true,
          raw: rawAns,
        };
      }
    } else {
      const resolvedId = resolveSingleChoiceId(rawAns);
      if (resolvedId !== null) {
        finalCorrectAnswer = {
          choiceId: resolvedId,
        };
        if (questionType === "true_false" || typeof rawAns === "boolean") {
          const isTrue =
            rawAns === true ||
            rawAns === "true" ||
            rawAns === "درست" ||
            rawAns === "صحیح";
          finalCorrectAnswer.booleanAnswer = isTrue;
        }
      } else {
        // Ambiguous / invalid answer: DO NOT assign to option 1!
        finalCorrectAnswer = {
          choiceId: null,
          ambiguous: true,
          raw: rawAns,
        };
      }
    }

    const diff = (raw.difficulty as "easy" | "medium" | "hard") || "medium";
    const difficulty: "easy" | "medium" | "hard" =
      diff === "easy" || diff === "hard" ? diff : "medium";

    return {
      question: raw.question.trim(),
      choices: normalizedChoices,
      correctAnswer: finalCorrectAnswer,
      explanation: raw.explanation?.trim() ?? null,
      difficulty,
      topic: raw.topic?.trim() ?? null,
      questionType,
    };
  }

  /**
   * Retrieves Course -> Module -> Lesson taxonomy tree available to the actor.
   */
  async getQuestionBankSources(
    actor: Actor,
  ): Promise<QuestionBankSourcesResponse> {
    await this.assertStudioAccess(actor);

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    const validOrgs = isPlatformAdmin ? [] : await this.getValidStudioOrgIds(actor);

    const questionTypes = [
      { id: "all", label: "همه انواع سؤالات" },
      { id: "multiple_choice", label: "چهارگزینه‌ای استاندارد" },
      { id: "conceptual", label: "مفهومی و اصول پایه" },
      { id: "mechanism_of_action", label: "مکانیسم اثر دارو" },
      { id: "clinical_pharmacology", label: "فارماکولوژی بالینی و کاربرد درمانی" },
      { id: "adverse_effects", label: "عوارض ناخواسته و سمیت دارویی" },
      { id: "drug_comparison", label: "مقایسه داروها و انتخاب بهینه" },
      { id: "drug_interactions", label: "تداخلات دارویی مهم" },
      { id: "dosage_calculations", label: "محاسبات دارویی و دوزینگ" },
      { id: "clinical_scenario", label: "سناریوی بالینی و کیس پزشکی" },
    ];

    if (!this.db) {
      return { courses: [], questionTypes, topics: [] };
    }

    const courseConditions = [isNull(courses.deletedAt)];
    if (!isPlatformAdmin) {
      if (validOrgs.length === 0) return { courses: [], questionTypes, topics: [] };
      courseConditions.push(inArray(courses.organizationId, validOrgs));
    }

    const courseRows = await this.db
      .select({ id: courses.id, title: courses.name })
      .from(courses)
      .where(and(...courseConditions))
      .orderBy(courses.name);

    if (courseRows.length === 0) {
      return { courses: [], questionTypes, topics: [] };
    }

    const courseIds = courseRows.map((c) => c.id);

    const moduleRows = await this.db
      .select({
        id: modules.id,
        courseId: modules.courseId,
        title: modules.title,
        sortOrder: modules.sortOrder,
      })
      .from(modules)
      .where(and(inArray(modules.courseId, courseIds), isNull(modules.deletedAt)))
      .orderBy(asc(modules.sortOrder));

    const moduleIds = moduleRows.map((m) => m.id);

    const lessonRows =
      moduleIds.length > 0
        ? await this.db
            .select({
              id: lessons.id,
              moduleId: lessons.moduleId,
              title: lessons.title,
              sortOrder: lessons.sortOrder,
            })
            .from(lessons)
            .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
            .orderBy(asc(lessons.sortOrder))
        : [];

    const lessonsByModule = new Map<
      string,
      Array<{ id: string; title: string }>
    >();
    for (const l of lessonRows) {
      const arr = lessonsByModule.get(l.moduleId) ?? [];
      arr.push({ id: l.id, title: l.title });
      lessonsByModule.set(l.moduleId, arr);
    }

    const modulesByCourse = new Map<
      string,
      Array<{
        id: string;
        title: string;
        lessons: Array<{ id: string; title: string }>;
      }>
    >();
    for (const m of moduleRows) {
      const arr = modulesByCourse.get(m.courseId) ?? [];
      arr.push({
        id: m.id,
        title: m.title,
        lessons: lessonsByModule.get(m.id) ?? [],
      });
      modulesByCourse.set(m.courseId, arr);
    }

    const coursesTree = courseRows.map((c) => ({
      id: c.id,
      title: c.title,
      modules: modulesByCourse.get(c.id) ?? [],
    }));

    // Collect distinct topics
    const topicRows = await this.db
      .selectDistinct({ topic: quizQuestions.topic })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .where(
        and(
          isNull(quizQuestions.deletedAt),
          isNull(quizzes.deletedAt),
          isPlatformAdmin ? undefined : inArray(quizzes.organizationId, validOrgs),
          sql`${quizQuestions.topic} IS NOT NULL`,
        ),
      )
      .limit(50);

    const topics = topicRows
      .map((r) => r.topic)
      .filter((t): t is string => typeof t === "string" && t.trim() !== "");

    return { courses: coursesTree, questionTypes, topics };
  }

  /**
   * Unified search across Course Questions, Marketing Question Bank, and Previous Studio Quizzes.
   * Guaranteed deduplication across sources.
   */
  async searchAvailableQuestions(
    actor: Actor,
    filters: SearchQuestionBankFilters,
  ): Promise<{ questions: UnifiedQuestionBankItem[]; total: number }> {
    await this.assertStudioAccess(actor);

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    const validOrgs = isPlatformAdmin ? [] : await this.getValidStudioOrgIds(actor);
    if (!isPlatformAdmin && validOrgs.length === 0) {
      throw new DomainError("forbidden", "شما به این بخش دسترسی ندارید.");
    }

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const offset = Math.max(filters.offset ?? 0, 0);
    const selectedSourceType = filters.sourceType ?? "all";

    // Build exclusion set if excludeQuizId provided
    const excludedSourceIds = new Set<string>();
    const excludedTexts = new Set<string>();
    if (filters.excludeQuizId) {
      try {
        const currentQuizQuestions = await this.quizStore.getQuestions(
          filters.excludeQuizId,
        );
        for (const q of currentQuizQuestions) {
          if (q.sourceQuestionId) excludedSourceIds.add(q.sourceQuestionId);
          if (q.sourceBankQuestionId) excludedSourceIds.add(q.sourceBankQuestionId);
          excludedTexts.add(q.question.trim().toLowerCase());
        }
      } catch {
        // Non-fatal
      }
    }

    if (this.db) {
      const isCourseActive =
        selectedSourceType === "all" || selectedSourceType === "course";
      const isBankActive =
        (selectedSourceType === "all" || selectedSourceType === "bank") &&
        !filters.moduleId &&
        !filters.lessonId;
      const isStudioQuizActive =
        (selectedSourceType === "all" || selectedSourceType === "studio_quiz") &&
        !filters.courseId &&
        !filters.moduleId &&
        !filters.lessonId;

      // 1. Course Questions Conditions
      const courseConds = [
        isNull(quizzes.deletedAt),
        isNull(quizQuestions.deletedAt),
      ];
      if (!isPlatformAdmin) {
        courseConds.push(inArray(quizzes.organizationId, validOrgs));
      }
      if (filters.courseId) {
        courseConds.push(eq(quizzes.courseId, filters.courseId));
      }
      if (filters.lessonId) {
        courseConds.push(eq(quizQuestions.lessonId, filters.lessonId));
      }
      if (filters.moduleId) {
        courseConds.push(eq(lessons.moduleId, filters.moduleId));
      }
      if (filters.difficulty && filters.difficulty !== "all") {
        courseConds.push(eq(quizQuestions.difficulty, filters.difficulty));
      }
      if (filters.questionType && filters.questionType !== "all") {
        courseConds.push(eq(quizQuestions.questionType, filters.questionType));
      }
      if (filters.search && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        courseConds.push(
          or(
            ilike(quizQuestions.question, term),
            ilike(quizQuestions.topic, term),
          )!,
        );
      }
      if (excludedSourceIds.size > 0) {
        courseConds.push(notInArray(quizQuestions.id, Array.from(excludedSourceIds)));
      }

      // 2. Marketing Question Bank Conditions
      const bankConds = [isNull(marketingQuestionBank.deletedAt)];
      if (!isPlatformAdmin) {
        bankConds.push(inArray(marketingQuestionBank.organizationId, validOrgs));
      }
      if (filters.courseId) {
        bankConds.push(eq(marketingQuestionBank.sourceCourseId, filters.courseId));
      }
      if (filters.difficulty && filters.difficulty !== "all") {
        bankConds.push(eq(marketingQuestionBank.difficulty, filters.difficulty));
      }
      if (filters.questionType && filters.questionType !== "all") {
        bankConds.push(
          eq(marketingQuestionBank.questionType, filters.questionType),
        );
      }
      if (filters.search && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        bankConds.push(
          or(
            ilike(marketingQuestionBank.question, term),
            ilike(marketingQuestionBank.topic, term),
          )!,
        );
      }
      if (excludedSourceIds.size > 0) {
        bankConds.push(notInArray(marketingQuestionBank.id, Array.from(excludedSourceIds)));
      }

      // 3. Previous Studio Quizzes Conditions
      const mqConds = [isNull(marketingQuizzes.deletedAt)];
      if (!isPlatformAdmin) {
        mqConds.push(inArray(marketingQuizzes.organizationId, validOrgs));
      }
      if (filters.excludeQuizId) {
        mqConds.push(
          sql`${marketingQuizQuestions.marketingQuizId} != ${filters.excludeQuizId}`,
        );
      }
      if (filters.difficulty && filters.difficulty !== "all") {
        mqConds.push(eq(marketingQuizQuestions.difficulty, filters.difficulty));
      }
      if (filters.questionType && filters.questionType !== "all") {
        mqConds.push(
          eq(marketingQuizQuestions.questionType, filters.questionType),
        );
      }
      if (filters.search && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        mqConds.push(
          or(
            ilike(marketingQuizQuestions.question, term),
            ilike(marketingQuizQuestions.topic, term),
          )!,
        );
      }

      // Execute SQL COUNT queries in parallel
      const [courseCountRes, bankCountRes, mqCountRes] = await Promise.all([
        isCourseActive
          ? this.db
              .select({ count: sql<number>`cast(count(*) as int)` })
              .from(quizQuestions)
              .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
              .leftJoin(lessons, eq(quizQuestions.lessonId, lessons.id))
              .leftJoin(modules, eq(lessons.moduleId, modules.id))
              .leftJoin(courses, eq(quizzes.courseId, courses.id))
              .where(and(...courseConds))
          : Promise.resolve([{ count: 0 }]),
        isBankActive
          ? this.db
              .select({ count: sql<number>`cast(count(*) as int)` })
              .from(marketingQuestionBank)
              .where(and(...bankConds))
          : Promise.resolve([{ count: 0 }]),
        isStudioQuizActive
          ? this.db
              .select({ count: sql<number>`cast(count(*) as int)` })
              .from(marketingQuizQuestions)
              .innerJoin(
                marketingQuizzes,
                eq(marketingQuizQuestions.marketingQuizId, marketingQuizzes.id),
              )
              .where(and(...mqConds))
          : Promise.resolve([{ count: 0 }]),
      ]);

      const courseTotal = Number(courseCountRes[0]?.count ?? 0);
      const bankTotal = Number(bankCountRes[0]?.count ?? 0);
      const mqTotal = Number(mqCountRes[0]?.count ?? 0);
      const total = courseTotal + bankTotal + mqTotal;

      let currentOffset = offset;
      let remainingLimit = limit;
      const questions: UnifiedQuestionBankItem[] = [];

      // 1. Fetch Course window slice directly via SQL LIMIT and OFFSET
      if (isCourseActive && currentOffset < courseTotal && remainingLimit > 0) {
        const fetchLimit = Math.min(remainingLimit, courseTotal - currentOffset);
        const rows = await this.db
          .select({
            id: quizQuestions.id,
            question: quizQuestions.question,
            choices: quizQuestions.choices,
            correctAnswer: quizQuestions.correctAnswer,
            explanation: quizQuestions.explanation,
            difficulty: quizQuestions.difficulty,
            topic: quizQuestions.topic,
            questionType: quizQuestions.questionType,
            createdAt: quizQuestions.createdAt,
            courseId: courses.id,
            courseTitle: courses.name,
            moduleId: modules.id,
            moduleTitle: modules.title,
            lessonId: lessons.id,
            lessonTitle: lessons.title,
            quizTitle: quizzes.title,
          })
          .from(quizQuestions)
          .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
          .leftJoin(lessons, eq(quizQuestions.lessonId, lessons.id))
          .leftJoin(modules, eq(lessons.moduleId, modules.id))
          .leftJoin(courses, eq(quizzes.courseId, courses.id))
          .where(and(...courseConds))
          .orderBy(desc(quizQuestions.createdAt))
          .limit(fetchLimit)
          .offset(currentOffset);

        for (const r of rows) {
          const norm = this.normalizeQuestionPayload(r);
          questions.push({
            id: r.id,
            sourceType: "course",
            sourceId: r.id,
            sourceCourseId: r.courseId,
            sourceCourseTitle: r.courseTitle,
            sourceModuleId: r.moduleId,
            sourceModuleTitle: r.moduleTitle,
            sourceLessonId: r.lessonId,
            sourceLessonTitle: r.lessonTitle,
            sourceQuizTitle: r.quizTitle,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            createdAt: r.createdAt,
          });
        }
        remainingLimit -= rows.length;
        currentOffset = 0;
      } else if (isCourseActive) {
        currentOffset = Math.max(0, currentOffset - courseTotal);
      }

      // 2. Fetch Bank window slice directly via SQL LIMIT and OFFSET
      if (isBankActive && currentOffset < bankTotal && remainingLimit > 0) {
        const fetchLimit = Math.min(remainingLimit, bankTotal - currentOffset);
        const bankRows = await this.db
          .select()
          .from(marketingQuestionBank)
          .where(and(...bankConds))
          .orderBy(desc(marketingQuestionBank.createdAt))
          .limit(fetchLimit)
          .offset(currentOffset);

        for (const r of bankRows) {
          const norm = this.normalizeQuestionPayload(r);
          questions.push({
            id: r.id,
            sourceType: "bank",
            sourceId: r.id,
            sourceCourseId: r.sourceCourseId,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            createdAt: r.createdAt,
          });
        }
        remainingLimit -= bankRows.length;
        currentOffset = 0;
      } else if (isBankActive) {
        currentOffset = Math.max(0, currentOffset - bankTotal);
      }

      // 3. Fetch Studio Quiz window slice directly via SQL LIMIT and OFFSET
      if (isStudioQuizActive && currentOffset < mqTotal && remainingLimit > 0) {
        const fetchLimit = Math.min(remainingLimit, mqTotal - currentOffset);
        const mqRows = await this.db
          .select({
            id: marketingQuizQuestions.id,
            question: marketingQuizQuestions.question,
            choices: marketingQuizQuestions.choices,
            correctAnswer: marketingQuizQuestions.correctAnswer,
            explanation: marketingQuizQuestions.explanation,
            difficulty: marketingQuizQuestions.difficulty,
            topic: marketingQuizQuestions.topic,
            questionType: marketingQuizQuestions.questionType,
            createdAt: marketingQuizQuestions.createdAt,
            quizTitle: marketingQuizzes.title,
          })
          .from(marketingQuizQuestions)
          .innerJoin(
            marketingQuizzes,
            eq(marketingQuizQuestions.marketingQuizId, marketingQuizzes.id),
          )
          .where(and(...mqConds))
          .orderBy(desc(marketingQuizQuestions.createdAt))
          .limit(fetchLimit)
          .offset(currentOffset);

        for (const r of mqRows) {
          const norm = this.normalizeQuestionPayload(r);
          questions.push({
            id: r.id,
            sourceType: "studio_quiz",
            sourceId: r.id,
            sourceQuizTitle: r.quizTitle,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            createdAt: r.createdAt,
          });
        }
      }

      return { questions, total };
    } else {
      // In-Memory Fallback for test environments without live DB
      const bankFilter = {
        organizationId: filters.organizationId,
        organizationIds: isPlatformAdmin ? undefined : validOrgs,
        search: filters.search,
        difficulty: filters.difficulty !== "all" ? filters.difficulty : undefined,
        questionType:
          filters.questionType !== "all" ? filters.questionType : undefined,
      };

      const allBankItems = await this.questionBankStore.list({
        ...bankFilter,
        limit: 100000,
        offset: 0,
      });

      let filteredItems = allBankItems;
      if (excludedSourceIds.size > 0 || excludedTexts.size > 0) {
        filteredItems = allBankItems.filter((b) => {
          if (excludedSourceIds.has(b.id)) return false;
          if (excludedTexts.has(b.question.trim().toLowerCase())) return false;
          return true;
        });
      }

      const total = filteredItems.length;
      const paginated = filteredItems.slice(offset, offset + limit);

      const questions: UnifiedQuestionBankItem[] = paginated.map((b) => {
        const norm = this.normalizeQuestionPayload(b);
        return {
          id: b.id,
          sourceType: "bank",
          sourceId: b.id,
          sourceCourseId: b.sourceCourseId,
          question: norm.question,
          choices: norm.choices,
          correctAnswer: norm.correctAnswer,
          explanation: norm.explanation,
          difficulty: norm.difficulty,
          topic: norm.topic,
          questionType: norm.questionType,
          createdAt: b.createdAt,
        };
      });

      return { questions, total };
    }
  }

  /**
   * Batch adds multiple questions into a quiz as independent immutable snapshots.
   */
  async addQuestionsBatch(
    actor: Actor,
    quizId: string,
    items: BatchAddQuestionItemInput[],
  ): Promise<{ questions: MarketingQuizQuestionSnapshot[]; addedCount: number }> {
    await this.getQuizById(actor, quizId);
    const existing = await this.quizStore.getQuestions(quizId);
    let sortOrder = existing.length;

    const added: MarketingQuizQuestionSnapshot[] = [];

    for (const item of items) {
      if (item.sourceType === "course" && item.sourceId) {
        let courseQ: {
          id: string;
          question: string;
          choices?: unknown;
          correctAnswer?: unknown;
          explanation?: string | null;
          difficulty?: string | null;
          topic?: string | null;
          questionType?: string | null;
        } | null = null;

        if (this.db) {
          const rows = await this.db
            .select()
            .from(quizQuestions)
            .where(
              and(eq(quizQuestions.id, item.sourceId), isNull(quizQuestions.deletedAt)),
            )
            .limit(1);
          courseQ = rows[0] ?? null;
        } else if (this.quizQuestionStore) {
          const list = await this.quizQuestionStore.listByIds([
            asQuizQuestionId(item.sourceId),
          ]);
          courseQ = list[0] ?? null;
        }

        if (courseQ) {
          const norm = this.normalizeQuestionPayload(courseQ);
          const snap = await this.quizStore.addQuestion({
            marketingQuizId: quizId,
            sourceQuestionId: courseQ.id,
            sourceBankQuestionId: null,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            sortOrder: sortOrder++,
          });
          added.push(snap);
          continue;
        }
      }

      if (item.sourceType === "bank" && item.sourceId) {
        const bankItem = await this.questionBankStore.getById(item.sourceId);
        if (bankItem && !bankItem.deletedAt) {
          const norm = this.normalizeQuestionPayload(bankItem);
          const snap = await this.quizStore.addQuestion({
            marketingQuizId: quizId,
            sourceQuestionId: bankItem.sourceQuestionId ?? null,
            sourceBankQuestionId: bankItem.id,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            sortOrder: sortOrder++,
          });
          added.push(snap);
          continue;
        }
      }

      if (item.sourceType === "studio_quiz" && item.sourceId) {
        const sourceSnap = await this.quizStore.getQuestionById(item.sourceId);
        if (sourceSnap) {
          const norm = this.normalizeQuestionPayload(sourceSnap);
          const snap = await this.quizStore.addQuestion({
            marketingQuizId: quizId,
            sourceQuestionId: sourceSnap.sourceQuestionId ?? null,
            sourceBankQuestionId: sourceSnap.sourceBankQuestionId ?? null,
            question: norm.question,
            choices: norm.choices,
            correctAnswer: norm.correctAnswer,
            explanation: norm.explanation,
            difficulty: norm.difficulty,
            topic: norm.topic,
            questionType: norm.questionType,
            sortOrder: sortOrder++,
          });
          added.push(snap);
          continue;
        }
      }

      // If full question payload provided manually:
      if (item.question && item.choices && item.choices.length >= 2) {
        const norm = this.normalizeQuestionPayload({
          question: item.question,
          choices: item.choices,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation,
          difficulty: item.difficulty,
          topic: item.topic,
          questionType: item.questionType,
        });
        const snap = await this.quizStore.addQuestion({
          marketingQuizId: quizId,
          sourceQuestionId: null,
          sourceBankQuestionId: null,
          question: norm.question,
          choices: norm.choices,
          correctAnswer: norm.correctAnswer,
          explanation: norm.explanation,
          difficulty: norm.difficulty,
          topic: norm.topic,
          questionType: norm.questionType,
          sortOrder: sortOrder++,
        });
        added.push(snap);
      }
    }

    const allQuestions = await this.quizStore.getQuestions(quizId);
    return { questions: allQuestions, addedCount: added.length };
  }

  // ---------------------------------------------------------------------------
  // Studio Exam Multi-Chapter AI Generation (Phase 3.2)
  // ---------------------------------------------------------------------------

  /**
   * Creates a multi-chapter smart exam generation operation with tasks and batches.
   * Performs authorization, quota validation/distribution, database transactional persistence,
   * and BullMQ job scheduling.
   */
  async createExamGenerationOperation(
    actor: Actor,
    quizId: string,
    input: CreateExamGenerationInput,
  ): Promise<CreatedOperationDetails> {
    const examStore = this.getExamStore();

    // 1. Verify Quiz & Access Control
    const quiz = await this.quizStore.getById(quizId);
    if (!quiz) {
      throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.", { quizId });
    }
    await this.assertStudioAccess(actor, quiz.organizationId);

    // 2. Validate totalQuestions bounds (1..100)
    const totalQuestions = input.totalQuestions;
    if (
      typeof totalQuestions !== "number" ||
      !Number.isInteger(totalQuestions) ||
      Number.isNaN(totalQuestions)
    ) {
      throw new DomainError("bad_request", "تعداد کل سؤالات باید یک عدد صحیح معتبر باشد.", {
        totalQuestions,
      });
    }
    if (totalQuestions < MIN_TOTAL_QUESTIONS) {
      throw new DomainError(
        "bad_request",
        `تعداد کل سؤالات نمی‌تواند کمتر از ${toPersianDigits(MIN_TOTAL_QUESTIONS)} باشد.`,
        { totalQuestions, min: MIN_TOTAL_QUESTIONS },
      );
    }
    if (totalQuestions > MAX_TOTAL_QUESTIONS) {
      throw new DomainError(
        "bad_request",
        `تعداد کل سؤالات نمی‌تواند بیشتر از ${toPersianDigits(MAX_TOTAL_QUESTIONS)} باشد.`,
        { totalQuestions, max: MAX_TOTAL_QUESTIONS },
      );
    }

    // 3. Resolve and validate chapter allocations
    let allocations: ChapterQuotaAllocation[] = [];
    if (Array.isArray(input.chapterAllocations) && input.chapterAllocations.length > 0) {
      // Validate user-provided custom allocations
      const seen = new Set<string>();
      let sum = 0;
      for (let i = 0; i < input.chapterAllocations.length; i++) {
        const item = input.chapterAllocations[i];
        if (!item.moduleId || typeof item.moduleId !== "string" || !item.moduleId.trim()) {
          throw new DomainError(
            "bad_request",
            `شناسه فصل در ردیف ${toPersianDigits(i + 1)} نامعتبر است.`,
            { index: i },
          );
        }
        const trimmed = item.moduleId.trim();
        if (seen.has(trimmed)) {
          throw new DomainError(
            "bad_request",
            `شناسه فصل تکراری در درخواست وجود دارد: ${trimmed}`,
            { duplicateModuleId: trimmed },
          );
        }
        seen.add(trimmed);

        if (
          typeof item.quota !== "number" ||
          !Number.isInteger(item.quota) ||
          item.quota < 1
        ) {
          throw new DomainError(
            "bad_request",
            `سهمیه سؤالات هر فصل باید یک عدد صحیح حداقل برابر ۱ باشد.`,
            { moduleId: trimmed, quota: item.quota },
          );
        }
        sum += item.quota;
        allocations.push({ moduleId: trimmed, quota: item.quota });
      }

      if (sum !== totalQuestions) {
        throw new DomainError(
          "bad_request",
          `مجموع سهمیه فصول (${toPersianDigits(sum)}) با تعداد کل سؤالات درخواستی (${toPersianDigits(totalQuestions)}) برابر نیست.`,
          { sum, totalQuestions },
        );
      }
    } else if (Array.isArray(input.moduleIds) && input.moduleIds.length > 0) {
      // Automatic balanced distribution using domain algorithm
      allocations = distributeQuestionQuotas(totalQuestions, input.moduleIds);
    } else {
      throw new DomainError(
        "bad_request",
        "حداقل باید یک فصل برای تولید سؤالات آزمون انتخاب شود.",
      );
    }

    // 4. Validate modules exist in DB and resolve courseId for each module
    const targetModuleIds = allocations.map((a) => a.moduleId);
    const moduleCourseMap = new Map<string, string>();

    if (this.db) {
      const foundModules = await this.db
        .select({ id: modules.id, courseId: modules.courseId })
        .from(modules)
        .where(inArray(modules.id, targetModuleIds));

      for (const m of foundModules) {
        moduleCourseMap.set(m.id, m.courseId);
      }

      for (const modId of targetModuleIds) {
        if (!moduleCourseMap.has(modId)) {
          throw new DomainError("not_found", `فصل با شناسه ${modId} در سیستم یافت نشد.`, {
            missingModuleId: modId,
          });
        }
      }
    } else {
      // Fallback for isolated in-memory testing when db client is not wired
      const defaultCourseId = input.courseId ?? "00000000-0000-0000-0000-000000000000";
      for (const modId of targetModuleIds) {
        moduleCourseMap.set(modId, defaultCourseId);
      }
    }

    // 5. Load active question pattern snapshots & build executable tasks and batches
    if (this.db && !this.studioExamQueue) {
      throw new DomainError(
        "internal_error",
        "صف پردازش آزمون (BullMQ) در سرور پیکربندی نشده است.",
      );
    }

    const patternSnapshots = await this.loadActiveExamPatternSnapshots();
    const executableAllocations = filterExecutableTasks(allocations);
    const taskParams: CreateOperationTaskParams[] = [];
    let globalPatternStartIndex = 0;

    for (const alloc of executableAllocations) {
      const courseId = moduleCourseMap.get(alloc.moduleId)!;
      const batchSizes = splitQuotaIntoBatches(alloc.quota, MAX_BATCH_SIZE);
      const batches: CreateOperationBatchParams[] = [];

      for (let i = 0; i < batchSizes.length; i++) {
        const batchSize = batchSizes[i];
        const patternAllocations = allocateQuestionPatterns({
          targetCount: batchSize,
          patternSnapshots,
          startIndex: globalPatternStartIndex,
        });
        globalPatternStartIndex += batchSize;
        batches.push({
          batchIndex: i + 1,
          targetCount: batchSize,
          patternAllocations,
        });
      }

      taskParams.push({
        courseId,
        moduleId: alloc.moduleId,
        targetQuestionCount: alloc.quota,
        batches,
      });
    }

    // 6. Persist operation, tasks, and batches in Store (inside atomic transaction with conflict check)
    const created = await examStore.createOperationWithTasksAndBatches({
      quizId,
      organizationId: quiz.organizationId,
      createdBy: actor.userId,
      totalRequestedQuestions: totalQuestions,
      config: {
        difficulty: input.difficulty ?? "medium",
        instructions: input.instructions ?? "",
        sampleQuestions: input.sampleQuestions ?? [],
        allChapterAllocations: allocations,
        idempotencyKey: input.idempotencyKey,
      },
      patternSnapshots,
      tasks: taskParams,
    });

    // 7. Enqueue batch jobs to BullMQ Queue (strictly lightweight payloads: entity IDs only)
    if (this.studioExamQueue) {
      try {
        for (const batch of created.batches) {
          await this.studioExamQueue.add(
            STUDIO_EXAM_BATCH_JOB_NAME,
            {
              operationId: created.operation.id,
              taskId: batch.taskId,
              batchId: batch.id,
            },
            {
              jobId: `batch_${batch.id}`,
            },
          );
        }
      } catch (queueErr) {
        // Enqueue failed! Auto-cancel the operation so the quiz is not stuck in pending
        await examStore.cancelOperation(created.operation.id, actor.userId).catch(() => {});
        throw new DomainError(
          "internal_error",
          "خطا در ثبت نوبت‌های پردازش در صف صف‌بندی (BullMQ). عملیات به صورت خودکار لغو شد.",
          {
            operationId: created.operation.id,
            cause: queueErr instanceof Error ? queueErr.message : String(queueErr),
          },
        );
      }
    }

    return created;
  }

  /**
   * Retrieves any active operation (pending or processing) for a given quiz.
   */
  async getActiveExamGenerationOperation(
    actor: Actor,
    quizId: string,
  ): Promise<ActiveOperationSummary | null> {
    const examStore = this.getExamStore();
    const quiz = await this.quizStore.getById(quizId);
    if (!quiz) {
      throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.", { quizId });
    }
    await this.assertStudioAccess(actor, quiz.organizationId);

    return await examStore.getActiveOperationByQuizId(quizId);
  }

  /**
   * Lists persistent exam generation operation history for a specific quiz with staging stats.
   * Strictly verifies quiz existence, non-deletion, and tenant/organization access before reading.
   */
  async listQuizExamGenerationOperations(
    actor: Actor,
    quizId: string,
    options?: {
      status?: StudioExamOperationStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<ListOperationsByQuizIdResult> {
    const examStore = this.getExamStore();
    const quiz = await this.quizStore.getById(quizId);
    if (!quiz || quiz.deletedAt) {
      throw new DomainError("not_found", "آزمون مورد نظر یافت نشد.", { quizId });
    }
    await this.assertStudioAccess(actor, quiz.organizationId);

    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError("bad_request", "تعداد آیتم در هر صفحه باید بین ۱ تا ۵۰ باشد.");
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new DomainError("bad_request", "مقدار offset نمی‌تواند منفی باشد.");
    }

    return await examStore.listOperationsByQuizId({
      quizId,
      organizationId: quiz.organizationId,
      status: options?.status,
      limit,
      offset,
    });
  }

  /**
   * Retrieves full details of an operation including chapters, tasks, and batches with sanitized error messages.
   */
  async getExamGenerationOperationDetails(
    actor: Actor,
    operationId: string,
  ): Promise<FullOperationDetails> {
    const examStore = this.getExamStore();
    const details = await examStore.getOperationById(operationId);
    if (!details) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", { operationId });
    }
    await this.assertStudioAccess(actor, details.operation.organizationId);

    return details;
  }

  /**
   * Lightweight progress summary contract for realtime polling.
   */
  async getExamGenerationProgress(
    actor: Actor,
    operationId: string,
  ): Promise<OperationProgressSummary> {
    const examStore = this.getExamStore();
    const progress = await examStore.getOperationProgress(operationId);
    if (!progress) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", { operationId });
    }
    await this.assertStudioAccess(actor, progress.organizationId);

    return progress;
  }

  /**
   * Retrieves staged questions generated for an operation with optional filtering.
   * Completely isolated from the live quiz questions bank.
   */
  async getExamGenerationQuestions(
    actor: Actor,
    operationId: string,
    options?: GetGeneratedQuestionsFilters,
  ): Promise<StagingQuestionRecord[]> {
    const examStore = this.getExamStore();
    const details = await examStore.getOperationById(operationId);
    if (!details) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", { operationId });
    }
    await this.assertStudioAccess(actor, details.operation.organizationId);

    return await examStore.getGeneratedQuestions({
      operationId,
      taskId: options?.taskId,
      batchId: options?.batchId,
      isAccepted: options?.isAccepted,
      reviewStatus: options?.reviewStatus,
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  private async assertOperationAndQuizAccess(
    actor: Actor,
    operationId: string,
  ): Promise<{ examStore: StudioExamStore; details: FullOperationDetails }> {
    const examStore = this.getExamStore();
    const details = await examStore.getOperationById(operationId);
    if (!details) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
        operationId,
      });
    }
    await this.assertStudioAccess(actor, details.operation.organizationId);

    const quiz = await this.quizStore.getById(details.operation.quizId);
    if (!quiz || quiz.deletedAt) {
      throw new DomainError("not_found", "آزمون مرتبط با این عملیات یافت نشد.", {
        quizId: details.operation.quizId,
      });
    }
    await this.assertStudioAccess(actor, quiz.organizationId);

    if (
      details.operation.organizationId &&
      quiz.organizationId &&
      String(details.operation.organizationId) !== String(quiz.organizationId)
    ) {
      throw new DomainError(
        "forbidden",
        "عدم تطابق مالکیت سازمانی عملیات و آزمون مقصد.",
      );
    }

    return { examStore, details };
  }

  /**
   * Batch-reviews staged questions (accept, reject, or reset to pending_review).
   * Enforces operation/organization ownership and preserves transferred questions.
   */
  async reviewExamGenerationQuestions(
    actor: Actor,
    operationId: string,
    params: {
      questionIds: string[];
      decision: StagingQuestionReviewDecision;
    },
  ): Promise<ReviewGeneratedQuestionsResult> {
    const { examStore } = await this.assertOperationAndQuizAccess(actor, operationId);

    if (!Array.isArray(params.questionIds) || params.questionIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید انتخاب شود.");
    }
    if (params.questionIds.length > MAX_TOTAL_QUESTIONS) {
      throw new DomainError(
        "bad_request",
        `حداکثر ${toPersianDigits(MAX_TOTAL_QUESTIONS)} سؤال در هر درخواست قابل بررسی است.`,
      );
    }
    if (
      params.decision !== "accepted" &&
      params.decision !== "rejected" &&
      params.decision !== "pending_review"
    ) {
      throw new DomainError("bad_request", "وضعیت بازبینی نامعتبر است.", {
        decision: params.decision,
      });
    }

    return await examStore.reviewGeneratedQuestions({
      operationId,
      questionIds: params.questionIds,
      decision: params.decision,
    });
  }

  /**
   * Atomically transfers accepted staged questions into the authoritative quiz from operation.quizId.
   * Rejects pending_review/rejected questions without implicit acceptance and guarantees idempotency.
   */
  async transferExamGenerationQuestions(
    actor: Actor,
    operationId: string,
    questionIds: string[],
  ): Promise<TransferGeneratedQuestionsResult> {
    const { examStore } = await this.assertOperationAndQuizAccess(actor, operationId);

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید برای انتقال انتخاب شود.");
    }
    if (questionIds.length > MAX_TOTAL_QUESTIONS) {
      throw new DomainError(
        "bad_request",
        `حداکثر ${toPersianDigits(MAX_TOTAL_QUESTIONS)} سؤال در هر درخواست قابل انتقال است.`,
      );
    }

    return await examStore.transferGeneratedQuestionsToQuiz({
      operationId,
      questionIds,
    });
  }

  /**
   * Safely cancels an in-flight operation, preserving any already-completed batches.
   */
  async cancelExamGenerationOperation(
    actor: Actor,
    operationId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    const examStore = this.getExamStore();
    const details = await examStore.getOperationById(operationId);
    if (!details) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", { operationId });
    }
    await this.assertStudioAccess(actor, details.operation.organizationId);

    const hasActiveBatches = details.batches.some(
      (b) => b.status === "pending" || b.status === "processing",
    );
    if (
      details.operation.status === "completed" ||
      details.operation.status === "failed" ||
      details.operation.status === "cancelled" ||
      (details.operation.status === "partial" && !hasActiveBatches)
    ) {
      throw new DomainError(
        "bad_request",
        "امکان لغو عملیاتی که به وضعیت نهایی رسیده است وجود ندارد.",
        { operationId, status: details.operation.status },
      );
    }

    const result = await examStore.cancelOperation(operationId, reason);
    if (!result.cancelled) {
      throw new DomainError(
        "bad_request",
        "امکان لغو این عملیات وجود ندارد.",
        { operationId, reason: result.reason },
      );
    }
    return result;
  }

  /**
   * Re-enqueues pending batches for an active operation that were missed due to queue/network failures.
   * Uses deterministic jobId (batch_${batch.id}) so it is completely idempotent.
   */
  async reenqueuePendingBatches(
    actor: Actor,
    operationId: string,
  ): Promise<{ reenqueuedCount: number; batchIds: string[] }> {
    const examStore = this.getExamStore();
    const op = await examStore.getOperationById(operationId);
    if (!op) {
      throw new DomainError("not_found", "عملیات مورد نظر یافت نشد.", { operationId });
    }
    await this.assertStudioAccess(actor, op.operation.organizationId);

    if (op.operation.status !== "pending" && op.operation.status !== "processing") {
      throw new DomainError(
        "bad_request",
        "تنها عملیات‌های فعال (pending یا processing) قابل زمان‌بندی مجدد هستند.",
        {
          operationId,
          status: op.operation.status,
        },
      );
    }

    if (!this.studioExamQueue) {
      throw new DomainError("internal_error", "صف پردازش آزمون در دسترس نیست.");
    }

    const pendingBatches = op.batches.filter((b) => b.status === "pending");
    const needsPatternRepair =
      op.operation.patternSnapshots.length === 0 ||
      pendingBatches.some((b) => b.patternAllocations.length === 0);

    if (needsPatternRepair && pendingBatches.length > 0) {
      const patternSnapshots = await this.loadActiveExamPatternSnapshots();
      await examStore.repairPendingOperationPatterns(operationId, patternSnapshots);
    }

    const reenqueued: string[] = [];

    for (const batch of pendingBatches) {
      await this.studioExamQueue.add(
        STUDIO_EXAM_BATCH_JOB_NAME,
        {
          operationId: op.operation.id,
          taskId: batch.taskId,
          batchId: batch.id,
        },
        {
          jobId: `batch_${batch.id}`,
        },
      );
      reenqueued.push(batch.id);
    }

    return {
      reenqueuedCount: reenqueued.length,
      batchIds: reenqueued,
    };
  }
}
