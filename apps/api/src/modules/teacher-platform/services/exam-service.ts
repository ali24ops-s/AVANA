import {
  DomainError,
  asUserId,
  asOrganizationId,
  type Actor,
  type TeacherExam,
  type TeacherExamQuestion,
  type Classroom,
  type RuntimeExamState,
  calculateRuntimeExamState,
  assertQuestionMutationAllowed,
  validateCreateExamInput,
  validateUpdateExamInput,
  validateTeacherQuestionInput,
  validateReorderQuestionsInput,
} from "@avana/domain";
import type {
  TeacherExamStore,
  TeacherExamQuestionStore,
  ClassroomStore,
} from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

export interface TeacherExamWithDetails extends TeacherExam {
  runtimeState: RuntimeExamState;
  questionsCount: number;
}

export class TeacherExamService {
  constructor(
    private readonly examStore: TeacherExamStore,
    private readonly questionStore: TeacherExamQuestionStore,
    private readonly classroomStore: ClassroomStore,
    private readonly organizationStore: OrganizationStore,
  ) {}

  /**
   * Helper: asserts teacher access to a classroom.
   */
  private async assertTeacherClassroomAccess(
    actor: Actor,
    classroomId: string,
  ): Promise<Classroom> {
    const classroom = await this.classroomStore.getById(classroomId);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return classroom;
    }

    if (classroom.teacherId === actor.userId) {
      return classroom;
    }

    const membership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );

    if (membership && membership.role === "organization_admin") {
      return classroom;
    }

    throw new DomainError("not_found", "کلاس یافت نشد");
  }

  /**
   * Helper: asserts teacher access to an exam via its owning classroom.
   */
  async assertTeacherExamAccess(
    actor: Actor,
    examId: string,
  ): Promise<{ exam: TeacherExam; classroom: Classroom }> {
    const exam = await this.examStore.getById(examId);
    if (!exam) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const classroom = await this.assertTeacherClassroomAccess(
      actor,
      exam.classroomId,
    );
    return { exam, classroom };
  }

  /**
   * Creates a new exam under a classroom in 'draft' status.
   */
  async createExam(
    actor: Actor,
    classroomId: string,
    raw: unknown,
  ): Promise<TeacherExamWithDetails> {
    const classroom = await this.assertTeacherClassroomAccess(actor, classroomId);
    if (classroom.status === "archived") {
      throw new DomainError(
        "bad_request",
        "امکان تعریف آزمون در کلاس بایگانی‌شده وجود ندارد",
      );
    }

    const input = validateCreateExamInput(raw);

    const exam = await this.examStore.create({
      id: crypto.randomUUID(),
      classroomId,
      title: input.title,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      passingScorePercentage: input.passingScorePercentage ?? null,
      shuffleQuestions: input.shuffleQuestions ?? true,
      shuffleOptions: input.shuffleOptions ?? true,
      showResultsImmediately: input.showResultsImmediately ?? false,
      allowBackNavigation: input.allowBackNavigation ?? true,
      perQuestionTimeSeconds: input.perQuestionTimeSeconds ?? null,
      status: "draft",
      closedAt: null,
      resultsReleasedAt: null,
      archivedAt: null,
    });

    return {
      ...exam,
      runtimeState: calculateRuntimeExamState(exam),
      questionsCount: 0,
    };
  }

  /**
   * Gets exam details for teacher view.
   */
  async getExam(actor: Actor, examId: string): Promise<TeacherExamWithDetails> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    const questions = await this.questionStore.listByExam(examId);

    return {
      ...exam,
      runtimeState: calculateRuntimeExamState(exam),
      questionsCount: questions.length,
    };
  }

  /**
   * Lists all exams for a classroom.
   */
  async listExamsByClassroom(
    actor: Actor,
    classroomId: string,
  ): Promise<TeacherExamWithDetails[]> {
    await this.assertTeacherClassroomAccess(actor, classroomId);
    const exams = await this.examStore.listByClassroom(classroomId);

    const results: TeacherExamWithDetails[] = [];
    for (const exam of exams) {
      const questions = await this.questionStore.listByExam(exam.id);
      results.push({
        ...exam,
        runtimeState: calculateRuntimeExamState(exam),
        questionsCount: questions.length,
      });
    }

    return results;
  }

  /**
   * Updates an exam. Only allowed in 'draft' status.
   */
  async updateExam(
    actor: Actor,
    examId: string,
    raw: unknown,
  ): Promise<TeacherExamWithDetails> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    if (exam.status !== "draft") {
      throw new DomainError(
        "bad_request",
        `امکان ویرایش آزمون در وضعیت '${exam.status}' وجود ندارد. ویرایش فقط در وضعیت پیش‌نویس مجاز است.`,
      );
    }

    const patch = validateUpdateExamInput(raw);

    const mergedTiming =
      patch.perQuestionTimeSeconds !== undefined
        ? patch.perQuestionTimeSeconds
        : exam.perQuestionTimeSeconds;
    const mergedAllowBack =
      patch.allowBackNavigation !== undefined
        ? patch.allowBackNavigation
        : exam.allowBackNavigation;
    if (mergedTiming && mergedTiming > 0 && mergedAllowBack === true) {
      throw new DomainError(
        "bad_request",
        "در آزمون زمان‌دار، پس از پایان هر سؤال امکان بازگشت به سؤال قبلی وجود ندارد",
      );
    }

    const updated = await this.examStore.update(examId, patch);
    if (!updated) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const questions = await this.questionStore.listByExam(examId);
    return {
      ...updated,
      runtimeState: calculateRuntimeExamState(updated),
      questionsCount: questions.length,
    };
  }

  /**
   * Publishes an exam after thorough validation of questions, options, and timing.
   * Once published, questions become strictly immutable.
   */
  async publishExam(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamWithDetails> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    if (exam.status !== "draft") {
      throw new DomainError(
        "bad_request",
        `آزمون هم‌اکنون در وضعیت '${exam.status}' است و امکان انتشار مجدد وجود ندارد`,
      );
    }

    // 1. Validate questions existence
    const questions = await this.questionStore.listByExam(examId);
    if (questions.length === 0) {
      throw new DomainError(
        "bad_request",
        "آزمون باید حداقل دارای یک سوال باشد تا بتواند منتشر شود",
      );
    }

    // 2. Validate question contents and option invariants
    for (const q of questions) {
      if (!q.prompt || q.prompt.trim().length === 0) {
        throw new DomainError("bad_request", `صورت سوال ${q.id} نمی‌تواند خالی باشد`);
      }
      if (q.points <= 0) {
        throw new DomainError("bad_request", `بارم سوال "${q.prompt.slice(0, 30)}" باید بیشتر از صفر باشد`);
      }
      if (q.questionType !== "descriptive") {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          throw new DomainError("bad_request", `سوال ${q.prompt.slice(0, 30)} باید حداقل دارای ۲ گزینه باشد`);
        }
        const optionIds = new Set(q.options.map((o) => o.id));
        if (!q.correctOptionId || !optionIds.has(q.correctOptionId)) {
          throw new DomainError(
            "bad_request",
            `کلید صحیح سوال "${q.prompt.slice(0, 30)}" در گزینه‌های آن سوال یافت نشد`,
          );
        }
      }
    }

    // 3. Validate timing
    if (new Date(exam.startsAt).getTime() >= new Date(exam.endsAt).getTime()) {
      throw new DomainError("bad_request", "زمان شروع آزمون باید قبل از زمان پایان باشد");
    }

    const published = await this.examStore.publish(examId);
    if (!published) {
      throw new DomainError("internal_error", "خطا در انتشار آزمون");
    }

    return {
      ...published,
      runtimeState: calculateRuntimeExamState(published),
      questionsCount: questions.length,
    };
  }

  /**
   * Unpublishes an exam back to 'draft', only if NO attempts exist.
   */
  async unpublishExam(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamWithDetails> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    if (exam.status !== "published") {
      throw new DomainError(
        "bad_request",
        "تنها آزمون‌های در وضعیت منتشر شده امکان برگشت به پیش‌نویس دارند",
      );
    }

    const hasAttempts = await this.examStore.hasAttempts(examId);
    if (hasAttempts) {
      throw new DomainError(
        "conflict",
        "آزمون دارای شرکت‌کننده است و امکان برگشت به پیش‌نویس وجود ندارد",
      );
    }

    const unpublished = await this.examStore.unpublish(examId);
    if (!unpublished) {
      throw new DomainError("conflict", "امکان برگشت به پیش‌نویس وجود ندارد");
    }

    const questions = await this.questionStore.listByExam(examId);
    return {
      ...unpublished,
      runtimeState: calculateRuntimeExamState(unpublished),
      questionsCount: questions.length,
    };
  }

  /**
   * Archives an exam.
   */
  async archiveExam(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamWithDetails> {
    await this.assertTeacherExamAccess(actor, examId);
    const archived = await this.examStore.archive(examId);
    if (!archived) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const questions = await this.questionStore.listByExam(examId);
    return {
      ...archived,
      runtimeState: calculateRuntimeExamState(archived),
      questionsCount: questions.length,
    };
  }

  /**
   * Manually closes an active/published exam.
   */
  async closeExamManually(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamWithDetails> {
    await this.assertTeacherExamAccess(actor, examId);
    const closed = await this.examStore.close(examId, new Date().toISOString());
    if (!closed) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const questions = await this.questionStore.listByExam(examId);
    return {
      ...closed,
      runtimeState: calculateRuntimeExamState(closed),
      questionsCount: questions.length,
    };
  }

  /**
   * Releases results to students.
   */
  async releaseResults(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamWithDetails> {
    await this.assertTeacherExamAccess(actor, examId);
    const released = await this.examStore.releaseResults(
      examId,
      new Date().toISOString(),
    );
    if (!released) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const questions = await this.questionStore.listByExam(examId);
    return {
      ...released,
      runtimeState: calculateRuntimeExamState(released),
      questionsCount: questions.length,
    };
  }

  // -------------------------------------------------------------------------
  // Question Operations (Draft Only!)
  // -------------------------------------------------------------------------

  /**
   * Adds a question to an exam. Enforces draft immutability.
   */
  async createQuestion(
    actor: Actor,
    examId: string,
    raw: unknown,
  ): Promise<TeacherExamQuestion> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    assertQuestionMutationAllowed(exam.status);

    const input = validateTeacherQuestionInput(raw);
    const existing = await this.questionStore.listByExam(examId);
    const orderIndex = input.orderIndex ?? existing.length;

    return this.questionStore.create({
      id: crypto.randomUUID(),
      examId,
      orderIndex,
      questionType: input.questionType ?? "single_choice",
      prompt: input.prompt,
      options: input.options,
      correctOptionId: input.correctOptionId,
      points: input.points ?? 1,
      explanation: input.explanation ?? null,
    });
  }

  /**
   * Updates an existing question. Enforces draft immutability.
   */
  async updateQuestion(
    actor: Actor,
    examId: string,
    questionId: string,
    raw: unknown,
  ): Promise<TeacherExamQuestion> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    assertQuestionMutationAllowed(exam.status);

    const existing = await this.questionStore.getById(questionId);
    if (!existing || existing.examId !== examId) {
      throw new DomainError("not_found", "سوال در این آزمون یافت نشد");
    }

    const input = validateTeacherQuestionInput(raw);
    const updated = await this.questionStore.update(questionId, {
      questionType: input.questionType ?? existing.questionType,
      prompt: input.prompt,
      options: input.options,
      correctOptionId: input.correctOptionId,
      points: input.points ?? existing.points,
      explanation: input.explanation,
      orderIndex: input.orderIndex ?? existing.orderIndex,
    });

    if (!updated) {
      throw new DomainError("not_found", "سوال یافت نشد");
    }
    return updated;
  }

  /**
   * Deletes a question. Enforces draft immutability.
   */
  async deleteQuestion(
    actor: Actor,
    examId: string,
    questionId: string,
  ): Promise<void> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    assertQuestionMutationAllowed(exam.status);

    const existing = await this.questionStore.getById(questionId);
    if (!existing || existing.examId !== examId) {
      throw new DomainError("not_found", "سوال در این آزمون یافت نشد");
    }

    const deleted = await this.questionStore.delete(questionId);
    if (!deleted) {
      throw new DomainError("not_found", "سوال یافت نشد");
    }
  }

  /**
   * Reorders questions within an exam. Enforces draft immutability.
   */
  async reorderQuestions(
    actor: Actor,
    examId: string,
    raw: unknown,
  ): Promise<void> {
    const { exam } = await this.assertTeacherExamAccess(actor, examId);
    assertQuestionMutationAllowed(exam.status);

    const questionIds = validateReorderQuestionsInput(raw);
    const existing = await this.questionStore.listByExam(examId);
    const existingIds = new Set(existing.map((q) => q.id));

    if (
      questionIds.length !== existing.length ||
      !questionIds.every((id) => existingIds.has(id))
    ) {
      throw new DomainError(
        "bad_request",
        "لیست شناسه‌های سوالات برای مرتب‌سازی ناقص یا نامعتبر است",
      );
    }

    await this.questionStore.reorder(examId, questionIds);
  }

  /**
   * Lists all questions for teacher authoring view (includes correctOptionId & explanation).
   */
  async listQuestions(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamQuestion[]> {
    await this.assertTeacherExamAccess(actor, examId);
    return this.questionStore.listByExam(examId);
  }
}
