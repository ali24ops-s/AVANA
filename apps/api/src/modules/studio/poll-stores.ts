import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { DomainError, isUUID } from "@avana/domain";
import type { DbClient } from "@avana/database/client";
import {
  polls,
  pollQuestions,
  pollOptions,
  pollResponses,
  pollAnswers,
  pollAnswerOptions,
  type PollRecord,
  type PollQuestionRecord,
  type PollOptionRecord,
  type PollResponseRecord,
} from "@avana/database/schema";
import type {
  Poll,
  PollQuestion,
  PollOption,
  PollResponse,
  PollStatus,
  PollQuestionType,
} from "./poll-types.js";

export interface PollStore {
  create(poll: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll>;
  getById(id: string): Promise<Poll | null>;
  getBySlug(slug: string): Promise<Poll | null>;
  list(filters?: {
    organizationId?: string;
    organizationIds?: string[];
    status?: PollStatus;
    limit?: number;
    offset?: number;
  }): Promise<Poll[]>;
  update(id: string, patch: Partial<Poll>): Promise<Poll | null>;
  softDelete(id: string): Promise<boolean>;

  // Questions and Options
  addQuestion(
    question: Omit<PollQuestion, "id" | "createdAt" | "updatedAt">,
    options?: Array<{ optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion>;
  getQuestions(pollId: string): Promise<PollQuestion[]>;
  getQuestionById(id: string): Promise<PollQuestion | null>;
  updateQuestion(
    id: string,
    patch: Partial<PollQuestion>,
    options?: Array<{ id?: string; optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion | null>;
  deleteQuestion(id: string): Promise<boolean>;
  reorderQuestions(pollId: string, orderedQuestionIds: string[]): Promise<void>;
  getOptionsByQuestionId(questionId: string): Promise<PollOption[]>;
}

export interface PollAggregatedResults {
  totalResponses: number;
  questionStats: Map<
    string,
    {
      totalAnswers: number;
      optionCounts: Map<string, number>;
      textAnswers: string[];
    }
  >;
}

export interface PollResponseStore {
  createResponseWithAnswers(
    response: {
      pollId: string;
      participantId: string;
      userId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    },
    answers: Array<{
      questionId: string;
      textAnswer?: string | null;
      selectedOptionIds?: string[];
    }>,
  ): Promise<PollResponse>;
  hasParticipantVoted(pollId: string, participantId: string): Promise<boolean>;
  countByPoll(pollId: string): Promise<number>;
  getResults(pollId: string): Promise<PollAggregatedResults>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPoll(r: PollRecord, questions?: PollQuestion[], responsesCount = 0): Poll {
  return {
    id: r.id,
    organizationId: r.organizationId,
    slug: r.slug,
    title: r.title,
    description: r.description,
    coverImageUrl: r.coverImageUrl,
    status: r.status as PollStatus,
    startsAt: r.startsAt ? new Date(r.startsAt) : null,
    endsAt: r.endsAt ? new Date(r.endsAt) : null,
    settings: (r.settings as Record<string, unknown>) ?? {},
    createdBy: r.createdBy,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
    deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    questions,
    questionsCount: questions?.length ?? 0,
    responsesCount,
  };
}

function toQuestion(r: PollQuestionRecord, options?: PollOption[]): PollQuestion {
  return {
    id: r.id,
    pollId: r.pollId,
    questionText: r.questionText,
    description: r.description,
    questionType: r.questionType as PollQuestionType,
    isRequired: r.isRequired,
    sortOrder: r.sortOrder,
    minChoices: r.minChoices,
    maxChoices: r.maxChoices,
    options: options ?? [],
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

function toOption(r: PollOptionRecord): PollOption {
  return {
    id: r.id,
    questionId: r.questionId,
    optionText: r.optionText,
    sortOrder: r.sortOrder,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// In-Memory Implementations (For Fast, Isolated Unit Testing)
// ---------------------------------------------------------------------------

export class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export class PollLockManager {
  private locks = new Map<string, AsyncMutex>();

  getLock(pollId: string): AsyncMutex {
    let m = this.locks.get(pollId);
    if (!m) {
      m = new AsyncMutex();
      this.locks.set(pollId, m);
    }
    return m;
  }
}

const defaultInMemoryLockManager = new PollLockManager();

export class InMemoryPollStore implements PollStore {
  private polls: Map<string, Poll> = new Map();
  private questions: Map<string, PollQuestion> = new Map();
  private options: Map<string, PollOption> = new Map();
  private responseStore?: PollResponseStore;
  private lockManager: PollLockManager;

  constructor(lockManager?: PollLockManager) {
    this.lockManager = lockManager ?? defaultInMemoryLockManager;
  }

  setResponseStore(rs: PollResponseStore) {
    this.responseStore = rs;
  }

  setLockManager(lm: PollLockManager) {
    this.lockManager = lm;
  }

  async create(poll: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: Poll = {
      ...poll,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      questions: [],
      questionsCount: 0,
      responsesCount: 0,
    };
    this.polls.set(id, record);
    return record;
  }

  async getById(id: string): Promise<Poll | null> {
    const p = this.polls.get(id);
    if (!p || p.deletedAt) return null;
    const questions = await this.getQuestions(id);
    const count = this.responseStore ? await this.responseStore.countByPoll(id) : 0;
    return { ...p, questions, questionsCount: questions.length, responsesCount: count };
  }

  async getBySlug(slug: string): Promise<Poll | null> {
    for (const p of this.polls.values()) {
      if (p.slug === slug && !p.deletedAt) {
        const questions = await this.getQuestions(p.id);
        const count = this.responseStore ? await this.responseStore.countByPoll(p.id) : 0;
        return { ...p, questions, questionsCount: questions.length, responsesCount: count };
      }
    }
    return null;
  }

  async list(filters?: {
    organizationId?: string;
    organizationIds?: string[];
    status?: PollStatus;
    limit?: number;
    offset?: number;
  }): Promise<Poll[]> {
    let result = Array.from(this.polls.values()).filter((p) => !p.deletedAt);
    if (filters?.organizationId !== undefined) {
      if (!isUUID(filters.organizationId)) {
        return [];
      }
      result = result.filter((p) => p.organizationId === filters.organizationId);
    }
    if (filters?.organizationIds !== undefined) {
      const validOrgIds = filters.organizationIds.filter(
        (id) => typeof id === "string" && isUUID(id),
      );
      if (validOrgIds.length === 0) {
        return [];
      }
      const allowed = new Set(validOrgIds);
      result = result.filter((p) => p.organizationId && allowed.has(p.organizationId));
    }
    if (filters?.status) {
      result = result.filter((p) => p.status === filters.status);
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filters?.offset) {
      result = result.slice(filters.offset);
    }
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }
    return Promise.all(
      result.map(async (p) => {
        const questions = await this.getQuestions(p.id);
        const count = this.responseStore ? await this.responseStore.countByPoll(p.id) : 0;
        return { ...p, questions, questionsCount: questions.length, responsesCount: count };
      }),
    );
  }

  async update(id: string, patch: Partial<Poll>): Promise<Poll | null> {
    const release = await this.lockManager.getLock(id).acquire();
    try {
      const existing = this.polls.get(id);
      if (!existing || existing.deletedAt) return null;

      if (patch.slug !== undefined && patch.slug !== existing.slug) {
        if (existing.status === "published" || existing.status === "closed") {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد.",
          );
        }
        const count = this.responseStore ? await this.responseStore.countByPoll(id) : 0;
        if (count > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از ثبت مشارکت وجود ندارد.",
          );
        }
      }

      const updated: Poll = {
        ...existing,
        ...patch,
        updatedAt: new Date(),
      };
      this.polls.set(id, updated);
      return this.getById(id);
    } finally {
      release();
    }
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = this.polls.get(id);
    if (!existing || existing.deletedAt) return false;
    existing.deletedAt = new Date();
    existing.updatedAt = new Date();
    this.polls.set(id, existing);
    return true;
  }

  async addQuestion(
    question: Omit<PollQuestion, "id" | "createdAt" | "updatedAt">,
    options?: Array<{ optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion> {
    const release = await this.lockManager.getLock(question.pollId).acquire();
    try {
      if (this.responseStore) {
        const count = await this.responseStore.countByPoll(question.pollId);
        if (count > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
          );
        }
      }
      const id = crypto.randomUUID();
      const now = new Date();
      const createdQuestion: PollQuestion = {
        ...question,
        id,
        options: [],
        createdAt: now,
        updatedAt: now,
      };
      this.questions.set(id, createdQuestion);

      if (options && options.length > 0) {
        const createdOptions: PollOption[] = [];
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const optId = crypto.randomUUID();
          const optionRecord: PollOption = {
            id: optId,
            questionId: id,
            optionText: opt.optionText,
            sortOrder: opt.sortOrder ?? i,
            createdAt: now,
            updatedAt: now,
          };
          this.options.set(optId, optionRecord);
          createdOptions.push(optionRecord);
        }
        createdQuestion.options = createdOptions;
      }

      return createdQuestion;
    } finally {
      release();
    }
  }

  async getQuestions(pollId: string): Promise<PollQuestion[]> {
    const result: PollQuestion[] = [];
    for (const q of this.questions.values()) {
      if (q.pollId === pollId) {
        const opts = await this.getOptionsByQuestionId(q.id);
        result.push({ ...q, options: opts });
      }
    }
    result.sort((a, b) => a.sortOrder - b.sortOrder);
    return result;
  }

  async getQuestionById(id: string): Promise<PollQuestion | null> {
    const q = this.questions.get(id);
    if (!q) return null;
    const opts = await this.getOptionsByQuestionId(q.id);
    return { ...q, options: opts };
  }

  async updateQuestion(
    id: string,
    patch: Partial<PollQuestion>,
    options?: Array<{ id?: string; optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion | null> {
    const existing = this.questions.get(id);
    if (!existing) return null;

    const release = await this.lockManager.getLock(existing.pollId).acquire();
    try {
      if (this.responseStore) {
        const count = await this.responseStore.countByPoll(existing.pollId);
        if (count > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
          );
        }
      }

      const now = new Date();
      const updated: PollQuestion = {
        ...existing,
        ...patch,
        updatedAt: now,
      };
      this.questions.set(id, updated);

      if (options) {
        // Validate options ownership and UUID syntax
        const existingQuestionOptionIds = new Set(
          Array.from(this.options.values())
            .filter((o) => o.questionId === id)
            .map((o) => o.id),
        );

        for (const opt of options) {
          if (opt.id !== undefined && opt.id !== null && opt.id !== "") {
            if (!isUUID(opt.id)) {
              throw new DomainError("bad_request", "شناسه گزینه نامعتبر است.");
            }
            if (!existingQuestionOptionIds.has(opt.id)) {
              throw new DomainError("bad_request", "گزینه ارسالی متعلق به این سؤال نیست.");
            }
          }
        }

        // Remove options for this question that are no longer present
        const keptIds = new Set(
          options
            .map((o) => o.id)
            .filter((x): x is string => typeof x === "string" && isUUID(x)),
        );
        for (const [optId, opt] of this.options.entries()) {
          if (opt.questionId === id && !keptIds.has(optId)) {
            this.options.delete(optId);
          }
        }
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (opt.id && this.options.has(opt.id)) {
            const prev = this.options.get(opt.id)!;
            this.options.set(opt.id, {
              ...prev,
              optionText: opt.optionText,
              sortOrder: opt.sortOrder ?? i,
              updatedAt: now,
            });
          } else {
            const newOptId = opt.id ?? crypto.randomUUID();
            this.options.set(newOptId, {
              id: newOptId,
              questionId: id,
              optionText: opt.optionText,
              sortOrder: opt.sortOrder ?? i,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      return this.getQuestionById(id);
    } finally {
      release();
    }
  }

  async deleteQuestion(id: string): Promise<boolean> {
    const existing = this.questions.get(id);
    if (!existing) return false;

    const release = await this.lockManager.getLock(existing.pollId).acquire();
    try {
      if (this.responseStore) {
        const count = await this.responseStore.countByPoll(existing.pollId);
        if (count > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
          );
        }
      }

      this.questions.delete(id);
      for (const [optId, opt] of this.options.entries()) {
        if (opt.questionId === id) {
          this.options.delete(optId);
        }
      }
      return true;
    } finally {
      release();
    }
  }

  async reorderQuestions(pollId: string, orderedQuestionIds: string[]): Promise<void> {
    const release = await this.lockManager.getLock(pollId).acquire();
    try {
      if (this.responseStore) {
        const count = await this.responseStore.countByPoll(pollId);
        if (count > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
          );
        }
      }

      for (let i = 0; i < orderedQuestionIds.length; i++) {
        const q = this.questions.get(orderedQuestionIds[i]);
        if (q && q.pollId === pollId) {
          q.sortOrder = i;
          q.updatedAt = new Date();
        }
      }
    } finally {
      release();
    }
  }

  async getOptionsByQuestionId(questionId: string): Promise<PollOption[]> {
    const result: PollOption[] = [];
    for (const opt of this.options.values()) {
      if (opt.questionId === questionId) {
        result.push(opt);
      }
    }
    result.sort((a, b) => a.sortOrder - b.sortOrder);
    return result;
  }
}

export class InMemoryPollResponseStore implements PollResponseStore {
  private responses: Map<string, PollResponse> = new Map();
  private answers: Array<{
    id: string;
    responseId: string;
    questionId: string;
    textAnswer?: string | null;
    selectedOptionIds?: string[];
  }> = [];
  private lockManager: PollLockManager;

  constructor(lockManager?: PollLockManager) {
    this.lockManager = lockManager ?? defaultInMemoryLockManager;
  }

  setLockManager(lm: PollLockManager) {
    this.lockManager = lm;
  }

  async createResponseWithAnswers(
    response: {
      pollId: string;
      participantId: string;
      userId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    },
    answers: Array<{
      questionId: string;
      textAnswer?: string | null;
      selectedOptionIds?: string[];
    }>,
  ): Promise<PollResponse> {
    const release = await this.lockManager.getLock(response.pollId).acquire();
    try {
      // Unique participant per poll invariant (simulate unique constraint)
      for (const r of this.responses.values()) {
        if (r.pollId === response.pollId && r.participantId === response.participantId) {
          const err = new Error('duplicate key value violates unique constraint "uq_poll_responses_poll_participant"');
          (err as unknown as Record<string, unknown>).code = "23505";
          (err as unknown as Record<string, unknown>).constraint = "uq_poll_responses_poll_participant";
          throw err;
        }
      }

      const responseId = crypto.randomUUID();
      const now = new Date();
      const createdResponse: PollResponse = {
        id: responseId,
        pollId: response.pollId,
        participantId: response.participantId,
        userId: response.userId ?? null,
        ipHash: response.ipHash ?? null,
        userAgent: response.userAgent ?? null,
        completedAt: now,
        answers: [],
      };
      this.responses.set(responseId, createdResponse);

      for (const ans of answers) {
        const answerId = crypto.randomUUID();
        this.answers.push({
          id: answerId,
          responseId,
          questionId: ans.questionId,
          textAnswer: ans.textAnswer ?? null,
          selectedOptionIds: ans.selectedOptionIds ?? [],
        });
      }

      return createdResponse;
    } finally {
      release();
    }
  }

  async hasParticipantVoted(pollId: string, participantId: string): Promise<boolean> {
    for (const r of this.responses.values()) {
      if (r.pollId === pollId && r.participantId === participantId) {
        return true;
      }
    }
    return false;
  }

  async countByPoll(pollId: string): Promise<number> {
    let count = 0;
    for (const r of this.responses.values()) {
      if (r.pollId === pollId) count++;
    }
    return count;
  }

  async getResults(pollId: string): Promise<PollAggregatedResults> {
    const matchingResponseIds = new Set<string>();
    for (const r of this.responses.values()) {
      if (r.pollId === pollId) {
        matchingResponseIds.add(r.id);
      }
    }

    const questionStats = new Map<
      string,
      {
        totalAnswers: number;
        optionCounts: Map<string, number>;
        textAnswers: string[];
      }
    >();

    for (const ans of this.answers) {
      if (!matchingResponseIds.has(ans.responseId)) continue;
      if (!questionStats.has(ans.questionId)) {
        questionStats.set(ans.questionId, {
          totalAnswers: 0,
          optionCounts: new Map(),
          textAnswers: [],
        });
      }
      const stat = questionStats.get(ans.questionId)!;
      stat.totalAnswers++;

      if (ans.textAnswer && ans.textAnswer.trim().length > 0) {
        stat.textAnswers.push(ans.textAnswer.trim());
      }
      if (ans.selectedOptionIds && ans.selectedOptionIds.length > 0) {
        for (const optId of ans.selectedOptionIds) {
          stat.optionCounts.set(optId, (stat.optionCounts.get(optId) ?? 0) + 1);
        }
      }
    }

    return {
      totalResponses: matchingResponseIds.size,
      questionStats,
    };
  }
}

// ---------------------------------------------------------------------------
// Production Drizzle Implementation (PostgreSQL)
// ---------------------------------------------------------------------------

export class DrizzlePollStore implements PollStore {
  constructor(private readonly db: DbClient) {}

  async create(poll: Omit<Poll, "id" | "createdAt" | "updatedAt">): Promise<Poll> {
    const rows = await this.db
      .insert(polls)
      .values({
        organizationId: poll.organizationId,
        slug: poll.slug,
        title: poll.title,
        description: poll.description,
        coverImageUrl: poll.coverImageUrl,
        status: poll.status,
        startsAt: poll.startsAt,
        endsAt: poll.endsAt,
        settings: poll.settings,
        createdBy: poll.createdBy,
      })
      .returning();
    return toPoll(rows[0], []);
  }

  async getById(id: string): Promise<Poll | null> {
    if (!isUUID(id)) return null;
    const rows = await this.db
      .select()
      .from(polls)
      .where(and(eq(polls.id, id), sql`${polls.deletedAt} IS NULL`))
      .limit(1);
    if (!rows[0]) return null;

    const questions = await this.getQuestions(id);
    const countRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pollResponses)
      .where(eq(pollResponses.pollId, id));

    return toPoll(rows[0], questions, countRes[0]?.count ?? 0);
  }

  async getBySlug(slug: string): Promise<Poll | null> {
    const rows = await this.db
      .select()
      .from(polls)
      .where(and(eq(polls.slug, slug), sql`${polls.deletedAt} IS NULL`))
      .limit(1);
    if (!rows[0]) return null;

    const questions = await this.getQuestions(rows[0].id);
    const countRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pollResponses)
      .where(eq(pollResponses.pollId, rows[0].id));

    return toPoll(rows[0], questions, countRes[0]?.count ?? 0);
  }

  async list(filters?: {
    organizationId?: string;
    organizationIds?: string[];
    status?: PollStatus;
    limit?: number;
    offset?: number;
  }): Promise<Poll[]> {
    const conditions = [sql`${polls.deletedAt} IS NULL`];
    if (filters?.organizationId !== undefined) {
      if (!isUUID(filters.organizationId)) {
        return [];
      }
      conditions.push(eq(polls.organizationId, filters.organizationId));
    }
    if (filters?.organizationIds !== undefined) {
      const validOrgIds = filters.organizationIds.filter(
        (id): id is string => typeof id === "string" && isUUID(id),
      );
      if (validOrgIds.length === 0) {
        return [];
      }
      conditions.push(inArray(polls.organizationId, validOrgIds));
    }
    if (filters?.status) {
      conditions.push(eq(polls.status, filters.status));
    }

    const rows = await this.db
      .select()
      .from(polls)
      .where(and(...conditions))
      .orderBy(desc(polls.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);

    return Promise.all(
      rows.map(async (r) => {
        const questions = await this.getQuestions(r.id);
        const countRes = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, r.id));
        return toPoll(r, questions, countRes[0]?.count ?? 0);
      }),
    );
  }

  async update(id: string, patch: Partial<Poll>): Promise<Poll | null> {
    if (!isUUID(id)) return null;
    return await this.db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, id), sql`${polls.deletedAt} IS NULL`))
        .for("update");
      if (!lockedRows[0]) return null;

      if (patch.slug !== undefined && patch.slug !== lockedRows[0].slug) {
        if (lockedRows[0].status === "published" || lockedRows[0].status === "closed") {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد.",
          );
        }
        const countRes = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(pollResponses)
          .where(eq(pollResponses.pollId, id));
        if ((countRes[0]?.count ?? 0) > 0) {
          throw new DomainError(
            "bad_request",
            "امکان تغییر شناسه یکتای نظرسنجی (slug) پس از ثبت مشارکت وجود ندارد.",
          );
        }
      }

      const updateValues: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.title !== undefined) updateValues.title = patch.title;
      if (patch.slug !== undefined) updateValues.slug = patch.slug;
      if (patch.description !== undefined) updateValues.description = patch.description;
      if (patch.coverImageUrl !== undefined) updateValues.coverImageUrl = patch.coverImageUrl;
      if (patch.status !== undefined) updateValues.status = patch.status;
      if (patch.startsAt !== undefined) updateValues.startsAt = patch.startsAt;
      if (patch.endsAt !== undefined) updateValues.endsAt = patch.endsAt;
      if (patch.settings !== undefined) updateValues.settings = patch.settings;

      const rows = await tx
        .update(polls)
        .set(updateValues)
        .where(eq(polls.id, id))
        .returning();
      if (!rows[0]) return null;

      const qRows = await tx
        .select()
        .from(pollQuestions)
        .where(eq(pollQuestions.pollId, id))
        .orderBy(pollQuestions.sortOrder);
      const questions = await Promise.all(
        qRows.map(async (q) => {
          const opts = await tx
            .select()
            .from(pollOptions)
            .where(eq(pollOptions.questionId, q.id))
            .orderBy(pollOptions.sortOrder);
          return toQuestion(q, opts.map(toOption));
        }),
      );
      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, id));

      return toPoll(rows[0], questions, countRes[0]?.count ?? 0);
    });
  }

  async softDelete(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    const rows = await this.db
      .update(polls)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(polls.id, id))
      .returning();
    return rows.length > 0;
  }

  async addQuestion(
    question: Omit<PollQuestion, "id" | "createdAt" | "updatedAt">,
    options?: Array<{ optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion> {
    if (!isUUID(question.pollId)) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    return await this.db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, question.pollId), sql`${polls.deletedAt} IS NULL`))
        .for("update");
      if (!lockedRows[0]) {
        throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
      }

      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, question.pollId));
      if ((countRes[0]?.count ?? 0) > 0) {
        throw new DomainError(
          "bad_request",
          "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
        );
      }

      const qRows = await tx
        .insert(pollQuestions)
        .values({
          pollId: question.pollId,
          questionText: question.questionText,
          description: question.description,
          questionType: question.questionType,
          isRequired: question.isRequired,
          sortOrder: question.sortOrder,
          minChoices: question.minChoices,
          maxChoices: question.maxChoices,
        })
        .returning();

      const createdQ = qRows[0];
      const createdOptions: PollOption[] = [];

      if (options && options.length > 0) {
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const optRows = await tx
            .insert(pollOptions)
            .values({
              questionId: createdQ.id,
              optionText: opt.optionText,
              sortOrder: opt.sortOrder ?? i,
            })
            .returning();
          createdOptions.push(toOption(optRows[0]));
        }
      }

      return toQuestion(createdQ, createdOptions);
    });
  }

  async getQuestions(pollId: string): Promise<PollQuestion[]> {
    if (!isUUID(pollId)) return [];
    const qRows = await this.db
      .select()
      .from(pollQuestions)
      .where(eq(pollQuestions.pollId, pollId))
      .orderBy(pollQuestions.sortOrder);

    return Promise.all(
      qRows.map(async (q) => {
        const opts = await this.getOptionsByQuestionId(q.id);
        return toQuestion(q, opts);
      }),
    );
  }

  async getQuestionById(id: string): Promise<PollQuestion | null> {
    if (!isUUID(id)) return null;
    const qRows = await this.db
      .select()
      .from(pollQuestions)
      .where(eq(pollQuestions.id, id))
      .limit(1);
    if (!qRows[0]) return null;
    const opts = await this.getOptionsByQuestionId(id);
    return toQuestion(qRows[0], opts);
  }

  async updateQuestion(
    id: string,
    patch: Partial<PollQuestion>,
    options?: Array<{ id?: string; optionText: string; sortOrder?: number }>,
  ): Promise<PollQuestion | null> {
    if (!isUUID(id)) return null;
    return await this.db.transaction(async (tx) => {
      const existingQ = await tx
        .select()
        .from(pollQuestions)
        .where(eq(pollQuestions.id, id))
        .limit(1);
      if (!existingQ[0]) return null;

      const pollId = existingQ[0].pollId;
      const lockedRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, pollId), sql`${polls.deletedAt} IS NULL`))
        .for("update");
      if (!lockedRows[0]) return null;

      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, pollId));
      if ((countRes[0]?.count ?? 0) > 0) {
        throw new DomainError(
          "bad_request",
          "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
        );
      }

      const updateValues: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.questionText !== undefined) updateValues.questionText = patch.questionText;
      if (patch.description !== undefined) updateValues.description = patch.description;
      if (patch.questionType !== undefined) updateValues.questionType = patch.questionType;
      if (patch.isRequired !== undefined) updateValues.isRequired = patch.isRequired;
      if (patch.sortOrder !== undefined) updateValues.sortOrder = patch.sortOrder;
      if (patch.minChoices !== undefined) updateValues.minChoices = patch.minChoices;
      if (patch.maxChoices !== undefined) updateValues.maxChoices = patch.maxChoices;

      const qRows = await tx
        .update(pollQuestions)
        .set(updateValues)
        .where(eq(pollQuestions.id, id))
        .returning();
      if (!qRows[0]) return null;

      if (options) {
        // Reconcile options
        const existingOptions = await tx
          .select()
          .from(pollOptions)
          .where(eq(pollOptions.questionId, id));
        const existingOptionIds = new Set(existingOptions.map((o) => o.id));

        for (const opt of options) {
          if (opt.id !== undefined && opt.id !== null && opt.id !== "") {
            if (!isUUID(opt.id)) {
              throw new DomainError("bad_request", "شناسه گزینه نامعتبر است.");
            }
            if (!existingOptionIds.has(opt.id)) {
              throw new DomainError("bad_request", "گزینه ارسالی متعلق به این سؤال نیست.");
            }
          }
        }

        const incomingIds = new Set(
          options
            .map((o) => o.id)
            .filter((x): x is string => typeof x === "string" && isUUID(x)),
        );

        for (const ex of existingOptions) {
          if (!incomingIds.has(ex.id)) {
            await tx.delete(pollOptions).where(eq(pollOptions.id, ex.id));
          }
        }

        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          if (opt.id) {
            await tx
              .update(pollOptions)
              .set({
                optionText: opt.optionText,
                sortOrder: opt.sortOrder ?? i,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(pollOptions.id, opt.id),
                  eq(pollOptions.questionId, id),
                ),
              );
          } else {
            await tx.insert(pollOptions).values({
              questionId: id,
              optionText: opt.optionText,
              sortOrder: opt.sortOrder ?? i,
            });
          }
        }
      }

      const finalOpts = await tx
        .select()
        .from(pollOptions)
        .where(eq(pollOptions.questionId, id))
        .orderBy(pollOptions.sortOrder);

      return toQuestion(qRows[0], finalOpts.map(toOption));
    });
  }

  async deleteQuestion(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    return await this.db.transaction(async (tx) => {
      const existingQ = await tx
        .select()
        .from(pollQuestions)
        .where(eq(pollQuestions.id, id))
        .limit(1);
      if (!existingQ[0]) return false;

      const pollId = existingQ[0].pollId;
      const lockedRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, pollId), sql`${polls.deletedAt} IS NULL`))
        .for("update");
      if (!lockedRows[0]) return false;

      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, pollId));
      if ((countRes[0]?.count ?? 0) > 0) {
        throw new DomainError(
          "bad_request",
          "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
        );
      }

      const rows = await tx
        .delete(pollQuestions)
        .where(eq(pollQuestions.id, id))
        .returning();
      return rows.length > 0;
    });
  }

  async reorderQuestions(pollId: string, orderedQuestionIds: string[]): Promise<void> {
    if (!isUUID(pollId) || orderedQuestionIds.some((qid) => !isUUID(qid))) {
      throw new DomainError("bad_request", "لیست شناسه‌های سؤال نامعتبر است.");
    }
    await this.db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, pollId), sql`${polls.deletedAt} IS NULL`))
        .for("update");
      if (!lockedRows[0]) {
        throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
      }

      const countRes = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pollResponses)
        .where(eq(pollResponses.pollId, pollId));
      if ((countRes[0]?.count ?? 0) > 0) {
        throw new DomainError(
          "bad_request",
          "امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.",
        );
      }

      for (let i = 0; i < orderedQuestionIds.length; i++) {
        await tx
          .update(pollQuestions)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(
            and(
              eq(pollQuestions.id, orderedQuestionIds[i]),
              eq(pollQuestions.pollId, pollId),
            ),
          );
      }
    });
  }

  async getOptionsByQuestionId(questionId: string): Promise<PollOption[]> {
    if (!isUUID(questionId)) return [];
    const rows = await this.db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.questionId, questionId))
      .orderBy(pollOptions.sortOrder);
    return rows.map(toOption);
  }
}

export class DrizzlePollResponseStore implements PollResponseStore {
  constructor(private readonly db: DbClient) {}

  async createResponseWithAnswers(
    response: {
      pollId: string;
      participantId: string;
      userId?: string | null;
      ipHash?: string | null;
      userAgent?: string | null;
    },
    answers: Array<{
      questionId: string;
      textAnswer?: string | null;
      selectedOptionIds?: string[];
    }>,
  ): Promise<PollResponse> {
    if (!isUUID(response.pollId)) {
      throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
    }
    if (response.userId && !isUUID(response.userId)) {
      throw new DomainError("bad_request", "شناسه کاربر نامعتبر است.");
    }
    return await this.db.transaction(async (tx) => {
      // 1. Lock the poll row FOR UPDATE
      const pollRows = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, response.pollId), sql`${polls.deletedAt} IS NULL`))
        .for("update");

      const poll = pollRows[0];
      if (!poll) {
        throw new DomainError("not_found", "نظرسنجی مورد نظر یافت نشد.");
      }

      // 2. Re-verify status and time window under lock inside transaction
      if (poll.status !== "published") {
        throw new DomainError(
          "bad_request",
          "این نظرسنجی در حال حاضر برای دریافت پاسخ فعال نیست.",
        );
      }
      const now = new Date();
      if (poll.startsAt && now < new Date(poll.startsAt)) {
        throw new DomainError("bad_request", "نظرسنجی هنوز آغاز نشده است.");
      }
      if (poll.endsAt && now > new Date(poll.endsAt)) {
        throw new DomainError("bad_request", "مهلت شرکت در این نظرسنجی به پایان رسیده است.");
      }

      // 3. Double-vote check inside transaction under lock
      const existingVote = await tx
        .select({ id: pollResponses.id })
        .from(pollResponses)
        .where(
          and(
            eq(pollResponses.pollId, response.pollId),
            eq(pollResponses.participantId, response.participantId),
          ),
        )
        .limit(1);
      if (existingVote.length > 0) {
        throw new DomainError("conflict", "شما قبلاً در این نظرسنجی شرکت کرده‌اید.");
      }

      const respRows = await tx
        .insert(pollResponses)
        .values({
          pollId: response.pollId,
          participantId: response.participantId,
          userId: response.userId,
          ipHash: response.ipHash,
          userAgent: response.userAgent,
        })
        .returning();

      const createdResp: PollResponseRecord = respRows[0];

      for (const ans of answers) {
        const ansRows = await tx
          .insert(pollAnswers)
          .values({
            responseId: createdResp.id,
            questionId: ans.questionId,
            textAnswer: ans.textAnswer,
          })
          .returning();

        const createdAns = ansRows[0];

        if (ans.selectedOptionIds && ans.selectedOptionIds.length > 0) {
          for (const optId of ans.selectedOptionIds) {
            await tx.insert(pollAnswerOptions).values({
              answerId: createdAns.id,
              optionId: optId,
            });
          }
        }
      }

      return {
        id: createdResp.id,
        pollId: createdResp.pollId,
        participantId: createdResp.participantId,
        userId: createdResp.userId,
        ipHash: createdResp.ipHash,
        userAgent: createdResp.userAgent,
        completedAt: new Date(createdResp.completedAt),
      };
    });
  }

  async hasParticipantVoted(pollId: string, participantId: string): Promise<boolean> {
    if (!isUUID(pollId)) return false;
    const rows = await this.db
      .select({ id: pollResponses.id })
      .from(pollResponses)
      .where(
        and(
          eq(pollResponses.pollId, pollId),
          eq(pollResponses.participantId, participantId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async countByPoll(pollId: string): Promise<number> {
    if (!isUUID(pollId)) return 0;
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pollResponses)
      .where(eq(pollResponses.pollId, pollId));
    return rows[0]?.count ?? 0;
  }

  async getResults(pollId: string): Promise<PollAggregatedResults> {
    if (!isUUID(pollId)) {
      return { totalResponses: 0, questionStats: new Map() };
    }
    const totalResponsesRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pollResponses)
      .where(eq(pollResponses.pollId, pollId));

    const totalResponses = totalResponsesRes[0]?.count ?? 0;

    // 1. Aggregate choice votes
    const choiceRows = await this.db
      .select({
        questionId: pollAnswers.questionId,
        optionId: pollAnswerOptions.optionId,
        count: sql<number>`count(*)::int`,
      })
      .from(pollAnswerOptions)
      .innerJoin(pollAnswers, eq(pollAnswerOptions.answerId, pollAnswers.id))
      .innerJoin(pollResponses, eq(pollAnswers.responseId, pollResponses.id))
      .where(eq(pollResponses.pollId, pollId))
      .groupBy(pollAnswers.questionId, pollAnswerOptions.optionId);

    // 2. Fetch text answers
    const textRows = await this.db
      .select({
        questionId: pollAnswers.questionId,
        textAnswer: pollAnswers.textAnswer,
      })
      .from(pollAnswers)
      .innerJoin(pollResponses, eq(pollAnswers.responseId, pollResponses.id))
      .where(
        and(
          eq(pollResponses.pollId, pollId),
          sql`${pollAnswers.textAnswer} IS NOT NULL AND trim(${pollAnswers.textAnswer}) <> ''`,
        ),
      );

    // 3. Question answer totals
    const totalAnswersByQ = await this.db
      .select({
        questionId: pollAnswers.questionId,
        count: sql<number>`count(*)::int`,
      })
      .from(pollAnswers)
      .innerJoin(pollResponses, eq(pollAnswers.responseId, pollResponses.id))
      .where(eq(pollResponses.pollId, pollId))
      .groupBy(pollAnswers.questionId);

    const questionStats = new Map<
      string,
      {
        totalAnswers: number;
        optionCounts: Map<string, number>;
        textAnswers: string[];
      }
    >();

    for (const row of totalAnswersByQ) {
      questionStats.set(row.questionId, {
        totalAnswers: row.count,
        optionCounts: new Map(),
        textAnswers: [],
      });
    }

    for (const c of choiceRows) {
      if (!questionStats.has(c.questionId)) {
        questionStats.set(c.questionId, {
          totalAnswers: 0,
          optionCounts: new Map(),
          textAnswers: [],
        });
      }
      questionStats.get(c.questionId)!.optionCounts.set(c.optionId, c.count);
    }

    for (const t of textRows) {
      if (t.textAnswer) {
        if (!questionStats.has(t.questionId)) {
          questionStats.set(t.questionId, {
            totalAnswers: 0,
            optionCounts: new Map(),
            textAnswers: [],
          });
        }
        questionStats.get(t.questionId)!.textAnswers.push(t.textAnswer);
      }
    }

    return {
      totalResponses,
      questionStats,
    };
  }
}
