import crypto from "crypto";
import {
  DomainError,
  asUserId,
  asOrganizationId,
  isUUID,
  type Actor,
} from "@avana/domain";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type {
  Poll,
  PollQuestion,
  PollStatus,
  CreatePollInput,
  UpdatePollInput,
  CreatePollQuestionInput,
  UpdatePollQuestionInput,
  SubmitPollVoteInput,
  PollResults,
  PollQuestionResult,
  PollOptionResult,
  SubmitPollVoteAnswerInput,
} from "./poll-types.js";
import type { PollStore, PollResponseStore } from "./poll-stores.js";

export interface PollServiceDeps {
  pollStore: PollStore;
  responseStore: PollResponseStore;
  organizationStore?: OrganizationStore;
  hmacSecret?: string;
}

export class PollService {
  private readonly pollStore: PollStore;
  private readonly responseStore: PollResponseStore;
  private readonly organizationStore?: OrganizationStore;
  private readonly hmacSecret: string;

  constructor(deps: PollServiceDeps) {
    this.pollStore = deps.pollStore;
    this.responseStore = deps.responseStore;
    this.organizationStore = deps.organizationStore;
    this.hmacSecret = deps.hmacSecret || process.env.POLL_SALT_SECRET || "avana_default_poll_salt_secret_key_2026";
  }

  // ---------------------------------------------------------------------------
  // Security & Hashing Helpers
  // ---------------------------------------------------------------------------

  /**
   * Hashes the raw participant identifier using HMAC-SHA256 with a salt/secret.
   * Ensures raw device/cookie tokens are never stored in the database.
   */
  hashParticipantId(rawParticipantId: string): string {
    if (!rawParticipantId || typeof rawParticipantId !== "string" || !rawParticipantId.trim()) {
      throw new DomainError("bad_request", "شناسه شرکت‌کننده نامعتبر است.");
    }
    return crypto
      .createHmac("sha256", this.hmacSecret)
      .update(rawParticipantId.trim())
      .digest("hex");
  }

  /**
   * Generates a non-guessable, URL-safe random slug.
   * e.g. 16-character base64url string with high entropy.
   */
  generateSecureSlug(): string {
    return crypto.randomBytes(9).toString("base64url");
  }

  /**
   * Enforces Role-Based Access Control for Studio Management.
   * Rules:
   * - platform_admin: full global access
   * - organization_admin: access strictly within organizations where they hold active membership
   * - content_worker: access strictly within organizations where they hold active membership
   * - other roles or cross-tenant access without valid membership: forbidden
   */
  async assertStudioAccess(actor: Actor, organizationId?: string | null): Promise<void> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return;
    }

    const validOrgs = await this.getValidStudioOrgIds(actor);
    if (validOrgs.length === 0) {
      throw new DomainError("forbidden", "دسترسی به بخش مدیریت نظرسنجی‌ها محدود است.");
    }

    if (organizationId) {
      if (this.organizationStore && typeof this.organizationStore.findById === "function") {
        const org = await this.organizationStore.findById(asOrganizationId(organizationId));
        if (!org) {
          throw new DomainError("forbidden", "سازمان مورد نظر غیرفعال یا حذف شده است.");
        }
      }

      if (!validOrgs.includes(String(organizationId))) {
        throw new DomainError("forbidden", "شما به این سازمان دسترسی ندارید.");
      }
    }
  }

  private async getValidStudioOrgIds(actor: Actor): Promise<string[]> {
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
   * Resolves the effective role of an actor in an organization or globally.
   */
  async getEffectiveOrgRole(
    actor: Actor,
    organizationId?: string | null,
  ): Promise<"platform_admin" | "organization_admin" | "content_worker" | "none"> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return "platform_admin";
    }

    if (!organizationId) {
      if (actor.globalRole === "content_worker" || actor.role === "content_worker") {
        return "content_worker";
      }
      return "none";
    }

    if (Array.isArray(actor.memberships)) {
      const inMem = actor.memberships.find(
        (m) => String(m.organizationId) === String(organizationId),
      );
      if (inMem) {
        if (inMem.role === "organization_admin") return "organization_admin";
        if (inMem.role === "content_worker") return "content_worker";
      }
    }

    if (this.organizationStore && typeof this.organizationStore.listMembershipsByUserId === "function") {
      try {
        const dbMems = await this.organizationStore.listMembershipsByUserId(asUserId(actor.userId));
        const dbMem = dbMems.find((m) => String(m.organizationId) === String(organizationId));
        if (dbMem) {
          if (dbMem.role === "organization_admin") return "organization_admin";
          if (dbMem.role === "content_worker") return "content_worker";
        }
      } catch {
        // non-fatal
      }
    }

    if (actor.globalRole === "content_worker" || actor.role === "content_worker") {
      return "content_worker";
    }

    return "none";
  }

  async assertCanMutateStatus(
    actor: Actor,
    poll: Poll,
    targetStatus?: PollStatus,
  ): Promise<void> {
    if (!targetStatus || targetStatus === poll.status) return;
    const role = await this.getEffectiveOrgRole(actor, poll.organizationId);
    if (role === "content_worker" || role === "none") {
      throw new DomainError(
        "forbidden",
        "فقط مدیران سازمان یا مدیران پلتفرم امکان تغییر وضعیت انتشار نظرسنجی را دارند.",
      );
    }
  }

  async assertCanDelete(actor: Actor, poll: Poll): Promise<void> {
    const role = await this.getEffectiveOrgRole(actor, poll.organizationId);
    if (role === "content_worker" || role === "none") {
      throw new DomainError(
        "forbidden",
        "فقط مدیران سازمان یا مدیران پلتفرم امکان حذف نظرسنجی را دارند.",
      );
    }
  }

  async assertCanExport(actor: Actor, poll: Poll): Promise<void> {
    const role = await this.getEffectiveOrgRole(actor, poll.organizationId);
    if (role === "content_worker" || role === "none") {
      throw new DomainError(
        "forbidden",
        "فقط مدیران سازمان یا مدیران پلتفرم امکان استخراج داده‌ها را دارند.",
      );
    }
  }

  async assertCanManageQuestions(actor: Actor, poll: Poll): Promise<void> {
    const role = await this.getEffectiveOrgRole(actor, poll.organizationId);
    if (role === "content_worker") {
      if (poll.status !== "draft") {
        throw new DomainError(
          "forbidden",
          "کارشناس محتوا فقط امکان مدیریت سؤالات نظرسنجی در وضعیت پیش‌نویس را دارد.",
        );
      }
    }
    await this.assertPollStructureNotLocked(poll);
  }

  /**
   * Asserts that a poll's question/option structure is NOT locked.
   * Invariant: Once a poll has received its first response, the structure
   * of questions and options cannot be modified, deleted, or reordered.
   */
  private async assertPollStructureNotLocked(poll: Poll): Promise<void> {
    const responsesCount = await this.responseStore.countByPoll(poll.id);
    if (responsesCount > 0) {
      throw new DomainError(
        "bad_request",
        "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Poll Management Operations
  // ---------------------------------------------------------------------------

  async createPoll(actor: Actor, input: CreatePollInput): Promise<Poll> {
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";

    let targetOrgId = input.organizationId ?? null;
    if (input.organizationId !== undefined && input.organizationId !== null) {
      const orgIdStr = String(input.organizationId).trim();
      if (!isUUID(orgIdStr)) {
        throw new DomainError("bad_request", "شناسه سازمان ارسالی نامعتبر است.");
      }
      targetOrgId = orgIdStr;
    }

    if (!targetOrgId && !isPlatformAdmin) {
      const validOrgs = await this.getValidStudioOrgIds(actor);
      if (validOrgs.length === 0) {
        throw new DomainError("forbidden", "دسترسی به بخش مدیریت نظرسنجی‌ها محدود است.");
      }
      targetOrgId = validOrgs[0];
    }

    await this.assertStudioAccess(actor, targetOrgId);

    const title = input.title?.trim();
    if (!title) {
      throw new DomainError("bad_request", "عنوان نظرسنجی الزامی است.");
    }

    const slug = input.slug?.trim() || this.generateSecureSlug();

    // Verify slug format and uniqueness
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(slug)) {
      throw new DomainError(
        "bad_request",
        "اسلاگ نظرسنجی باید بین ۳ تا ۶۴ کاراکتر و شامل حروف، اعداد، خط تیره یا زیرخط باشد.",
      );
    }

    const existing = await this.pollStore.getBySlug(slug);
    if (existing) {
      throw new DomainError("conflict", "اسلاگ انتخابی تکراری است. لطفاً اسلاگ دیگری انتخاب کنید.");
    }

    let startsAtDate: Date | null = null;
    if (input.startsAt !== undefined && input.startsAt !== null && input.startsAt !== "") {
      const d = new Date(input.startsAt);
      if (Number.isNaN(d.getTime())) {
        throw new DomainError("bad_request", "فرمت تاریخ شروع نامعتبر است.");
      }
      startsAtDate = d;
    }

    let endsAtDate: Date | null = null;
    if (input.endsAt !== undefined && input.endsAt !== null && input.endsAt !== "") {
      const d = new Date(input.endsAt);
      if (Number.isNaN(d.getTime())) {
        throw new DomainError("bad_request", "فرمت تاریخ پایان نامعتبر است.");
      }
      endsAtDate = d;
    }

    if (startsAtDate && endsAtDate && startsAtDate > endsAtDate) {
      throw new DomainError("bad_request", "تاریخ شروع نمی‌تواند پس از تاریخ پایان باشد.");
    }

    const poll = await this.pollStore.create({
      organizationId: targetOrgId,
      slug,
      title,
      description: input.description?.trim() || null,
      coverImageUrl: input.coverImageUrl?.trim() || null,
      status: "draft",
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      settings: input.settings ?? {
        allowAnonymous: true,
        showResultsAfterVote: true,
        requireAllQuestions: false,
      },
      createdBy: actor.userId,
      deletedAt: null,
    });

    return poll;
  }

  async getPollById(actor: Actor, pollId: string): Promise<Poll> {
    if (!pollId || typeof pollId !== "string" || !isUUID(pollId)) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    const poll = await this.pollStore.getById(pollId);
    if (!poll) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    await this.assertStudioAccess(actor, poll.organizationId);
    return poll;
  }

  async getPollBySlug(slug: string, actor?: Actor | null): Promise<Poll> {
    const poll = await this.pollStore.getBySlug(slug);
    if (!poll) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }

    // Public access rule: if draft or archived, only authorized actors can view
    if (poll.status !== "published" && poll.status !== "closed") {
      if (!actor) {
        throw new DomainError("not_found", "نظرسنجی مورد نظر در دسترس نیست.");
      }
      await this.assertStudioAccess(actor, poll.organizationId);
    }

    return poll;
  }

  async listPolls(
    actor: Actor,
    filters?: {
      organizationId?: string;
      status?: PollStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<Poll[]> {
    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return this.pollStore.list(filters);
    }
    const orgIds = await this.getValidStudioOrgIds(actor);
    if (orgIds.length === 0) {
      return [];
    }
    return this.pollStore.list({
      ...filters,
      organizationIds: orgIds,
    });
  }

  async updatePoll(actor: Actor, pollId: string, input: UpdatePollInput): Promise<Poll> {
    const poll = await this.getPollById(actor, pollId);

    const patch: Partial<Poll> = {};

    if (input.title !== undefined) {
      const trimmedTitle = input.title.trim();
      if (!trimmedTitle) {
        throw new DomainError("bad_request", "عنوان نظرسنجی نمی‌تواند خالی باشد.");
      }
      patch.title = trimmedTitle;
    }

    if (input.slug !== undefined) {
      const trimmedSlug = input.slug.trim();
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmedSlug)) {
        throw new DomainError(
          "bad_request",
          "اسلاگ نظرسنجی باید بین ۳ تا ۶۴ کاراکتر و شامل حروف، اعداد، خط تیره یا زیرخط باشد.",
        );
      }
      if (trimmedSlug !== poll.slug) {
        if (poll.status === "published" || poll.status === "closed") {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد.",
          );
        }
        const responsesCount = await this.responseStore.countByPoll(poll.id);
        if (responsesCount > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از ثبت مشارکت وجود ندارد.",
          );
        }
        const existing = await this.pollStore.getBySlug(trimmedSlug);
        if (existing) {
          throw new DomainError("conflict", "اسلاگ انتخابی تکراری است.");
        }
        patch.slug = trimmedSlug;
      }
    }

    if (input.description !== undefined) {
      patch.description = input.description ? input.description.trim() : null;
    }

    if (input.coverImageUrl !== undefined) {
      patch.coverImageUrl = input.coverImageUrl ? input.coverImageUrl.trim() : null;
    }

    if (input.startsAt !== undefined) {
      if (input.startsAt !== null && input.startsAt !== "") {
        const d = new Date(input.startsAt);
        if (Number.isNaN(d.getTime())) {
          throw new DomainError("bad_request", "فرمت تاریخ شروع نامعتبر است.");
        }
        patch.startsAt = d;
      } else {
        patch.startsAt = null;
      }
    }

    if (input.endsAt !== undefined) {
      if (input.endsAt !== null && input.endsAt !== "") {
        const d = new Date(input.endsAt);
        if (Number.isNaN(d.getTime())) {
          throw new DomainError("bad_request", "فرمت تاریخ پایان نامعتبر است.");
        }
        patch.endsAt = d;
      } else {
        patch.endsAt = null;
      }
    }

    const effectiveStartsAt = patch.startsAt !== undefined ? patch.startsAt : poll.startsAt;
    const effectiveEndsAt = patch.endsAt !== undefined ? patch.endsAt : poll.endsAt;
    if (effectiveStartsAt && effectiveEndsAt && effectiveStartsAt > effectiveEndsAt) {
      throw new DomainError("bad_request", "تاریخ شروع نمی‌تواند پس از تاریخ پایان باشد.");
    }

    if (input.settings !== undefined) {
      patch.settings = { ...poll.settings, ...input.settings };
    }

    if (input.status !== undefined && input.status !== poll.status) {
      await this.assertCanMutateStatus(actor, poll, input.status);
      if (input.status === "published") {
        await this.validatePollForPublication(pollId);
      }
      patch.status = input.status;
    }

    const updated = await this.pollStore.update(pollId, patch);
    if (!updated) {
      throw new DomainError("not_found", "نظرسنجی یافت نشد.");
    }
    return updated;
  }

  async publishPoll(actor: Actor, pollId: string): Promise<Poll> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanMutateStatus(actor, poll, "published");
    await this.validatePollForPublication(pollId);
    const updated = await this.pollStore.update(pollId, { status: "published" });
    if (!updated) throw new DomainError("not_found", "نظرسنجی یافت نشد.");
    return updated;
  }

  async closePoll(actor: Actor, pollId: string): Promise<Poll> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanMutateStatus(actor, poll, "closed");
    const updated = await this.pollStore.update(pollId, { status: "closed" });
    if (!updated) throw new DomainError("not_found", "نظرسنجی یافت نشد.");
    return updated;
  }

  async deletePoll(actor: Actor, pollId: string): Promise<boolean> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanDelete(actor, poll);
    return this.pollStore.softDelete(pollId);
  }

  private async validatePollForPublication(pollId: string): Promise<void> {
    const questions = await this.pollStore.getQuestions(pollId);
    if (!questions || questions.length === 0) {
      throw new DomainError("bad_request", "نظرسنجی برای انتشار باید حداقل یک سؤال داشته باشد.");
    }

    for (const q of questions) {
      if (q.questionType === "single_choice" || q.questionType === "multiple_choice") {
        if (!q.options || q.options.length < 2) {
          throw new DomainError(
            "bad_request",
            `سؤال «${q.questionText}» باید حداقل دارای ۲ گزینه معتبر باشد.`,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Question & Option Management
  // ---------------------------------------------------------------------------

  async createQuestion(
    actor: Actor,
    pollId: string,
    input: CreatePollQuestionInput,
  ): Promise<PollQuestion> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanManageQuestions(actor, poll);

    const questionText = input.questionText?.trim();
    if (!questionText) {
      throw new DomainError("bad_request", "متن سؤال الزامی است.");
    }

    if (input.questionType === "single_choice" || input.questionType === "multiple_choice") {
      if (!input.options || input.options.length < 2) {
        throw new DomainError("bad_request", "سؤالات گزینه‌ای باید حداقل دارای ۲ گزینه باشند.");
      }
      for (const opt of input.options) {
        if (!opt.optionText || !opt.optionText.trim()) {
          throw new DomainError("bad_request", "متن گزینه‌ها نمی‌تواند خالی باشد.");
        }
      }
    }

    if (input.questionType === "multiple_choice") {
      const optCount = input.options?.length ?? 0;
      if (
        input.minChoices !== undefined &&
        input.minChoices !== null &&
        input.maxChoices !== undefined &&
        input.maxChoices !== null &&
        input.minChoices > input.maxChoices
      ) {
        throw new DomainError("bad_request", "حداقل انتخاب نمی‌تواند بیشتر از حداکثر انتخاب باشد.");
      }
      if (input.minChoices !== undefined && input.minChoices !== null) {
        if (input.minChoices < 1 || input.minChoices > optCount) {
          throw new DomainError("bad_request", "حداقل تعداد انتخاب نامعتبر است.");
        }
      }
      if (input.maxChoices !== undefined && input.maxChoices !== null) {
        if (input.maxChoices < 1 || input.maxChoices > optCount) {
          throw new DomainError("bad_request", "حداکثر تعداد انتخاب نامعتبر است.");
        }
      }
    }

    const existingQuestions = await this.pollStore.getQuestions(pollId);
    const sortOrder = input.sortOrder ?? existingQuestions.length;

    const question = await this.pollStore.addQuestion(
      {
        pollId,
        questionText,
        description: input.description?.trim() || null,
        questionType: input.questionType,
        isRequired: input.isRequired ?? true,
        sortOrder,
        minChoices: input.minChoices ?? null,
        maxChoices: input.maxChoices ?? null,
      },
      input.options?.map((o, idx) => ({
        optionText: o.optionText.trim(),
        sortOrder: o.sortOrder ?? idx,
      })),
    );

    return question;
  }

  async updateQuestion(
    actor: Actor,
    pollId: string,
    questionId: string,
    input: UpdatePollQuestionInput,
  ): Promise<PollQuestion> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanManageQuestions(actor, poll);

    const question = await this.pollStore.getQuestionById(questionId);
    if (!question || question.pollId !== pollId) {
      throw new DomainError("not_found", "سؤال مورد نظر یافت نشد.");
    }

    const patch: Partial<PollQuestion> = {};

    if (input.questionText !== undefined) {
      const qt = input.questionText.trim();
      if (!qt) throw new DomainError("bad_request", "متن سؤال نمی‌تواند خالی باشد.");
      patch.questionText = qt;
    }

    if (input.description !== undefined) {
      patch.description = input.description ? input.description.trim() : null;
    }

    if (input.isRequired !== undefined) {
      patch.isRequired = input.isRequired;
    }

    if (input.sortOrder !== undefined) {
      patch.sortOrder = input.sortOrder;
    }

    const finalType = input.questionType ?? question.questionType;
    patch.questionType = finalType;

    if (input.options) {
      if (finalType === "single_choice" || finalType === "multiple_choice") {
        if (input.options.length < 2) {
          throw new DomainError("bad_request", "سؤالات گزینه‌ای باید حداقل دارای ۲ گزینه باشند.");
        }
        for (const opt of input.options) {
          if (!opt.optionText || !opt.optionText.trim()) {
            throw new DomainError("bad_request", "متن گزینه‌ها نمی‌تواند خالی باشد.");
          }
        }
      }

      const existingOptionIds = new Set((question.options ?? []).map((o) => o.id));
      for (const opt of input.options) {
        if (opt.id !== undefined && opt.id !== null && opt.id !== "") {
          if (!isUUID(opt.id)) {
            throw new DomainError("bad_request", "شناسه گزینه نامعتبر است.");
          }
          if (!existingOptionIds.has(opt.id)) {
            throw new DomainError("bad_request", "گزینه ارسالی متعلق به این سؤال نیست.");
          }
        }
      }
    }

    if (finalType === "multiple_choice") {
      const optCount = input.options ? input.options.length : (question.options?.length ?? 0);
      const minC = input.minChoices !== undefined ? input.minChoices : question.minChoices;
      const maxC = input.maxChoices !== undefined ? input.maxChoices : question.maxChoices;

      if (minC && maxC && minC > maxC) {
        throw new DomainError("bad_request", "حداقل انتخاب نمی‌تواند بیشتر از حداکثر انتخاب باشد.");
      }
      if (minC !== undefined && minC !== null && (minC < 1 || minC > optCount)) {
        throw new DomainError("bad_request", "حداقل تعداد انتخاب نامعتبر است.");
      }
      if (maxC !== undefined && maxC !== null && (maxC < 1 || maxC > optCount)) {
        throw new DomainError("bad_request", "حداکثر تعداد انتخاب نامعتبر است.");
      }
      patch.minChoices = minC ?? null;
      patch.maxChoices = maxC ?? null;
    } else {
      patch.minChoices = null;
      patch.maxChoices = null;
    }

    const updated = await this.pollStore.updateQuestion(
      questionId,
      patch,
      input.options?.map((o, idx) => ({
        id: o.id,
        optionText: o.optionText.trim(),
        sortOrder: o.sortOrder ?? idx,
      })),
    );

    if (!updated) throw new DomainError("not_found", "سؤال یافت نشد.");
    return updated;
  }

  async deleteQuestion(actor: Actor, pollId: string, questionId: string): Promise<boolean> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanManageQuestions(actor, poll);

    const question = await this.pollStore.getQuestionById(questionId);
    if (!question || question.pollId !== pollId) {
      throw new DomainError("not_found", "سؤال مورد نظر یافت نشد.");
    }

    return this.pollStore.deleteQuestion(questionId);
  }

  async reorderQuestions(
    actor: Actor,
    pollId: string,
    orderedQuestionIds: string[],
  ): Promise<void> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanManageQuestions(actor, poll);
    await this.pollStore.reorderQuestions(pollId, orderedQuestionIds);
  }

  // ---------------------------------------------------------------------------
  // Voting & Public Participation
  // ---------------------------------------------------------------------------

  async hasParticipantVoted(slug: string, rawParticipantId: string): Promise<boolean> {
    const poll = await this.pollStore.getBySlug(slug);
    if (!poll) return false;
    const hashedPid = this.hashParticipantId(rawParticipantId);
    return this.responseStore.hasParticipantVoted(poll.id, hashedPid);
  }

  async submitResponse(
    slug: string,
    input: SubmitPollVoteInput,
    rawParticipantId: string,
    context?: { userId?: string; ip?: string; userAgent?: string },
  ): Promise<{ responseId: string; results?: PollResults }> {
    const poll = await this.pollStore.getBySlug(slug);
    if (!poll || poll.deletedAt) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }

    if (poll.status !== "published") {
      throw new DomainError("bad_request", "این نظرسنجی در حال حاضر برای دریافت پاسخ فعال نیست.");
    }

    const now = new Date();
    if (poll.startsAt && now < poll.startsAt) {
      throw new DomainError("bad_request", "نظرسنجی هنوز آغاز نشده است.");
    }
    if (poll.endsAt && now > poll.endsAt) {
      throw new DomainError("bad_request", "مهلت شرکت در این نظرسنجی به پایان رسیده است.");
    }

    const hashedPid = this.hashParticipantId(rawParticipantId);

    // 1. Initial double-vote check
    const alreadyVoted = await this.responseStore.hasParticipantVoted(poll.id, hashedPid);
    if (alreadyVoted) {
      throw new DomainError("conflict", "شما قبلاً در این نظرسنجی شرکت کرده‌اید.");
    }

    // 2. Validate questions and answers
    const questions = await this.pollStore.getQuestions(poll.id);
    const questionsMap = new Map<string, PollQuestion>(questions.map((q) => [q.id, q]));

    // Check required questions
    for (const q of questions) {
      if (q.isRequired) {
        const rawAns = input.answers?.[q.id];
        const isEmpty =
          rawAns === undefined ||
          rawAns === null ||
          rawAns === "" ||
          (Array.isArray(rawAns) && rawAns.length === 0) ||
          (typeof rawAns === "object" &&
            !Array.isArray(rawAns) &&
            !rawAns.selectedOptionId &&
            (!rawAns.selectedOptionIds || rawAns.selectedOptionIds.length === 0) &&
            (!rawAns.textAnswer || !rawAns.textAnswer.trim()));

        if (isEmpty) {
          throw new DomainError("bad_request", `پاسخ به سؤال «${q.questionText}» الزامی است.`);
        }
      }
    }

    const normalizedAnswers: Array<{
      questionId: string;
      textAnswer?: string | null;
      selectedOptionIds?: string[];
    }> = [];

    if (input.answers && typeof input.answers === "object") {
      for (const [qId, rawVal] of Object.entries(input.answers)) {
        const question = questionsMap.get(qId);
        if (!question) {
          throw new DomainError("bad_request", "سؤال ارسالی متعلق به این نظرسنجی نیست.");
        }

        const validOptionIds = new Set((question.options ?? []).map((o) => o.id));

        if (question.questionType === "single_choice") {
          let chosenId: string | undefined;
          if (typeof rawVal === "string") {
            chosenId = rawVal;
          } else if (typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)) {
            const casted = rawVal as SubmitPollVoteAnswerInput;
            chosenId = casted.selectedOptionId;
          }
          if (chosenId) {
            if (!validOptionIds.has(chosenId)) {
              throw new DomainError("bad_request", "گزینه انتخابی نامعتبر است.");
            }
            normalizedAnswers.push({
              questionId: qId,
              selectedOptionIds: [chosenId],
            });
          }
        } else if (question.questionType === "multiple_choice") {
          let chosenIds: string[] = [];
          if (Array.isArray(rawVal)) {
            chosenIds = rawVal.filter((x): x is string => typeof x === "string");
          } else if (typeof rawVal === "object" && rawVal !== null) {
            const casted = rawVal as SubmitPollVoteAnswerInput;
            chosenIds = casted.selectedOptionIds ?? (casted.selectedOptionId ? [casted.selectedOptionId] : []);
          }
          // Validate min/max constraints
          if (chosenIds.length > 0) {
            for (const cId of chosenIds) {
              if (!validOptionIds.has(cId)) {
                throw new DomainError("bad_request", "یکی از گزینه‌های انتخابی نامعتبر است.");
              }
            }
            if (question.minChoices && chosenIds.length < question.minChoices) {
              throw new DomainError(
                "bad_request",
                `برای سؤال «${question.questionText}» حداقل ${question.minChoices} گزینه باید انتخاب شود.`,
              );
            }
            if (question.maxChoices && chosenIds.length > question.maxChoices) {
              throw new DomainError(
                "bad_request",
                `برای سؤال «${question.questionText}» حداکثر ${question.maxChoices} گزینه مجاز است.`,
              );
            }
            normalizedAnswers.push({
              questionId: qId,
              selectedOptionIds: chosenIds,
            });
          }
        } else if (question.questionType === "short_text") {
          let text: string | undefined;
          if (typeof rawVal === "string") {
            text = rawVal.trim();
          } else if (typeof rawVal === "object" && rawVal !== null && !Array.isArray(rawVal)) {
            const casted = rawVal as SubmitPollVoteAnswerInput;
            text = casted.textAnswer?.trim();
          }
          if (text) {
            if (text.length > 500) {
              throw new DomainError("bad_request", "پاسخ متنی نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.");
            }
            normalizedAnswers.push({
              questionId: qId,
              textAnswer: text,
            });
          }
        }
      }
    }

    // 3. Privacy & Identity Minimization
    const isAnonymous = poll.settings.allowAnonymous !== false;
    if (!isAnonymous && !context?.userId) {
      throw new DomainError("unauthorized", "برای شرکت در این نظرسنجی ورود به حساب کاربری الزامی است.");
    }

    if (context?.userId !== undefined && context?.userId !== null && context?.userId !== "") {
      if (!isUUID(context.userId)) {
        throw new DomainError("bad_request", "شناسه کاربر نامعتبر است.");
      }
    }

    const finalUserId = isAnonymous ? null : (context?.userId ?? null);
    // Never store IP hash or User-Agent for anonymous polls to strictly preserve privacy
    const finalIpHash = isAnonymous
      ? null
      : context?.ip
        ? crypto.createHmac("sha256", this.hmacSecret).update(context.ip).digest("hex")
        : null;
    const finalUserAgent = isAnonymous ? null : (context?.userAgent ?? null);

    try {
      const response = await this.responseStore.createResponseWithAnswers(
        {
          pollId: poll.id,
          participantId: hashedPid,
          userId: finalUserId,
          ipHash: finalIpHash,
          userAgent: finalUserAgent,
        },
        normalizedAnswers,
      );

      let results: PollResults | undefined;
      if (poll.settings.showResultsAfterVote !== false) {
        results = await this.buildPollResults(poll, true);
      }

      return {
        responseId: response.id,
        results,
      };
    } catch (err: unknown) {
      type DbErr = { code?: string; constraint?: string; message?: string };
      const e = err as DbErr;
      const is23505 = e?.code === "23505";
      const isUniqueParticipant =
        e?.constraint === "uq_poll_responses_poll_participant" ||
        e?.message?.includes("uq_poll_responses_poll_participant");

      if (is23505 || isUniqueParticipant) {
        throw new DomainError("conflict", "شما قبلاً در این نظرسنجی شرکت کرده‌اید.");
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Results & Analytics Calculation
  // ---------------------------------------------------------------------------

  async getPollResultsBySlug(
    slug: string,
    isPublic = true,
  ): Promise<PollResults> {
    if (!slug || typeof slug !== "string" || !slug.trim()) {
      throw new DomainError("bad_request", "اسلاگ نظرسنجی نامعتبر است.");
    }
    const poll = await this.pollStore.getBySlug(slug.trim());
    if (!poll || poll.deletedAt) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    if (poll.status !== "published" && poll.status !== "closed") {
      throw new DomainError("not_found", "نظرسنجی مورد نظر در دسترس نیست.");
    }
    if (isPublic && poll.settings.showResultsAfterVote === false) {
      throw new DomainError("forbidden", "مشاهده نتایج این نظرسنجی برای عموم مجاز نیست.");
    }
    return this.buildPollResults(poll, isPublic);
  }

  async getPollResultsById(
    pollId: string,
    actor: Actor,
  ): Promise<PollResults> {
    if (!pollId || typeof pollId !== "string" || !isUUID(pollId)) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    const poll = await this.pollStore.getById(pollId);
    if (!poll || poll.deletedAt) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    await this.assertStudioAccess(actor, poll.organizationId);
    return this.buildPollResults(poll, false);
  }

  async getPollResults(
    pollIdOrSlug: string,
    isPublic: boolean,
    actor?: Actor | null,
  ): Promise<PollResults> {
    if (isPublic) {
      return this.getPollResultsBySlug(pollIdOrSlug, true);
    }
    let poll: Poll | null = null;
    if (isUUID(pollIdOrSlug)) {
      poll = await this.pollStore.getById(pollIdOrSlug);
    } else {
      poll = await this.pollStore.getBySlug(pollIdOrSlug);
    }
    if (!poll || poll.deletedAt) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    if (!actor) {
      throw new DomainError("unauthorized", "احراز هویت الزامی است.");
    }
    await this.assertStudioAccess(actor, poll.organizationId);
    return this.buildPollResults(poll, false);
  }

  private async buildPollResults(poll: Poll, isPublic: boolean): Promise<PollResults> {
    const questions = await this.pollStore.getQuestions(poll.id);
    const agg = await this.responseStore.getResults(poll.id);

    const questionResults: PollQuestionResult[] = questions.map((q) => {
      const stat = agg.questionStats.get(q.id);
      const totalAnswers = stat?.totalAnswers ?? 0;

      let optionsResult: PollOptionResult[] | undefined;
      if (q.questionType === "single_choice" || q.questionType === "multiple_choice") {
        optionsResult = (q.options ?? []).map((opt) => {
          const voteCount = stat?.optionCounts.get(opt.id) ?? 0;
          const percentage =
            totalAnswers > 0
              ? Math.round((voteCount / totalAnswers) * 100 * 10) / 10
              : 0;
          return {
            optionId: opt.id,
            optionText: opt.optionText,
            voteCount,
            percentage,
          };
        });
      }

      return {
        questionId: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        totalAnswers,
        options: optionsResult,
        // Text answers are strictly stripped in public mode!
        textAnswers: isPublic ? undefined : stat?.textAnswers ?? [],
      };
    });

    return {
      pollId: poll.id,
      pollTitle: poll.title,
      totalResponses: agg.totalResponses,
      questions: questionResults,
      isAdmin: !isPublic,
    };
  }

  /**
   * Generates a CSV export of the poll results for studio admins.
   * Defends against CSV Formula Injection (CWE-1236) by prepending a single quote
   * to any cell starting with dangerous characters (=, +, -, @, \t, \r).
   * Prepends UTF-8 BOM (\uFEFF) for proper Persian/Arabic rendering in spreadsheet applications.
   */
  async exportPollResultsCsv(
    actor: Actor,
    pollId: string,
  ): Promise<{ filename: string; csvContent: string }> {
    const poll = await this.getPollById(actor, pollId);
    await this.assertCanExport(actor, poll);
    const results = await this.getPollResultsById(poll.id, actor);

    const escapeCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Defense against CSV Formula Injection (CWE-1236)
      // Checks if cell (including any leading whitespace/tabs/newlines) begins with formula characters: =, +, -, @, |, %
      if (/^[\s\t\r\n]*[=+\-@|%]/.test(str)) {
        str = "'" + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];

    // Header & Summary info
    lines.push([escapeCell("عنوان نظرسنجی"), escapeCell(poll.title)].join(","));
    lines.push([escapeCell("شناسه اسلاگ"), escapeCell(poll.slug)].join(","));
    lines.push([escapeCell("وضعیت"), escapeCell(poll.status)].join(","));
    lines.push(
      [escapeCell("تعداد کل پاسخ‌ها"), escapeCell(results.totalResponses)].join(","),
    );
    lines.push([escapeCell("تاریخ استخراج"), escapeCell(new Date().toISOString())].join(","));
    lines.push(""); // empty row separator

    // Questions Breakdown
    for (let i = 0; i < results.questions.length; i++) {
      const q = results.questions[i];
      const qNum = i + 1;
      lines.push(
        [
          escapeCell(`سؤال ${qNum}: ${q.questionText}`),
          escapeCell(`نوع: ${q.questionType}`),
          escapeCell(`تعداد پاسخ: ${q.totalAnswers}`),
        ].join(","),
      );

      if (q.options && q.options.length > 0) {
        lines.push(
          [
            escapeCell("ردیف"),
            escapeCell("گزینه"),
            escapeCell("تعداد آرا"),
            escapeCell("درصد"),
          ].join(","),
        );
        q.options.forEach((opt, optIdx) => {
          lines.push(
            [
              escapeCell(optIdx + 1),
              escapeCell(opt.optionText),
              escapeCell(opt.voteCount),
              escapeCell(`${opt.percentage}%`),
            ].join(","),
          );
        });
      }

      if (q.textAnswers && q.textAnswers.length > 0) {
        lines.push([escapeCell("ردیف"), escapeCell("متن پاسخ")].join(","));
        q.textAnswers.forEach((ans, ansIdx) => {
          lines.push([escapeCell(ansIdx + 1), escapeCell(ans)].join(","));
        });
      }

      lines.push(""); // empty row between questions
    }

    const utf8Bom = "\uFEFF";
    const csvContent = utf8Bom + lines.join("\r\n");
    const safeSlug = poll.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `poll_${safeSlug}_results.csv`;

    return { filename, csvContent };
  }
}
