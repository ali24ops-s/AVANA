import { eq, and, desc, sql, isNull, inArray, ilike, or } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  marketingQuizzes,
  marketingQuizQuestions,
  marketingQuestionBank,
  marketingQuizAttempts,
  type MarketingQuizRecord,
  type MarketingQuizQuestionRecord,
  type MarketingQuestionBankRecord,
  type MarketingQuizAttemptRecord,
} from "@avana/database/schema";
import type {
  MarketingQuiz,
  MarketingQuizQuestionSnapshot,
  MarketingQuestionBankItem,
  MarketingQuizAttempt,
  MarketingQuizStatus,
} from "./types.js";

export interface MarketingQuizStore {
  create(quiz: Omit<MarketingQuiz, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuiz>;
  getById(id: string): Promise<MarketingQuiz | null>;
  getBySlug(slug: string): Promise<MarketingQuiz | null>;
  list(filters?: { organizationId?: string; organizationIds?: string[]; status?: MarketingQuizStatus; limit?: number; offset?: number }): Promise<MarketingQuiz[]>;
  update(id: string, patch: Partial<MarketingQuiz>): Promise<MarketingQuiz | null>;
  softDelete(id: string): Promise<boolean>;

  // Question snapshot management
  addQuestion(question: Omit<MarketingQuizQuestionSnapshot, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuizQuestionSnapshot>;
  getQuestions(quizId: string): Promise<MarketingQuizQuestionSnapshot[]>;
  getQuestionById(id: string): Promise<MarketingQuizQuestionSnapshot | null>;
  updateQuestion(id: string, patch: Partial<MarketingQuizQuestionSnapshot>): Promise<MarketingQuizQuestionSnapshot | null>;
  deleteQuestion(id: string): Promise<boolean>;
  reorderQuestions(quizId: string, orderedQuestionIds: string[]): Promise<void>;
}

export interface MarketingQuestionBankStore {
  create(item: Omit<MarketingQuestionBankItem, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuestionBankItem>;
  getById(id: string): Promise<MarketingQuestionBankItem | null>;
  list(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string; limit?: number; offset?: number }): Promise<MarketingQuestionBankItem[]>;
  count(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string }): Promise<number>;
  update(id: string, patch: Partial<MarketingQuestionBankItem>): Promise<MarketingQuestionBankItem | null>;
  softDelete(id: string): Promise<boolean>;
}

import { DomainError } from "@avana/domain";

export interface MarketingQuizAttemptStore {
  create(attempt: Omit<MarketingQuizAttempt, "id" | "startedAt" | "completedAt">): Promise<MarketingQuizAttempt>;
  getById(id: string): Promise<MarketingQuizAttempt | null>;
  getByToken(token: string): Promise<MarketingQuizAttempt | null>;
  getByIdempotencyKey(quizId: string, key: string): Promise<MarketingQuizAttempt | null>;
  listByQuiz(quizId: string, limit?: number, offset?: number): Promise<MarketingQuizAttempt[]>;
  countByQuiz(quizId: string): Promise<number>;
  getAverageScore(quizId: string): Promise<number>;
  claimAttempt(token: string, userId: string): Promise<MarketingQuizAttempt | null>;
}

// ---------------------------------------------------------------------------
// In-Memory Implementation (For fast unit testing)
// ---------------------------------------------------------------------------

export class InMemoryMarketingQuizStore implements MarketingQuizStore {
  private quizzes: Map<string, MarketingQuiz> = new Map();
  private questions: Map<string, MarketingQuizQuestionSnapshot> = new Map();

  async create(quiz: Omit<MarketingQuiz, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuiz> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: MarketingQuiz = {
      ...quiz,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      questions: [],
    };
    this.quizzes.set(id, record);
    return record;
  }

  async getById(id: string): Promise<MarketingQuiz | null> {
    const q = this.quizzes.get(id);
    if (!q || q.deletedAt) return null;
    const questions = await this.getQuestions(id);
    return { ...q, questions, questionsCount: questions.length };
  }

  async getBySlug(slug: string): Promise<MarketingQuiz | null> {
    for (const q of this.quizzes.values()) {
      if (q.slug === slug && !q.deletedAt) {
        const questions = await this.getQuestions(q.id);
        return { ...q, questions, questionsCount: questions.length };
      }
    }
    return null;
  }

  async list(filters?: { organizationId?: string; organizationIds?: string[]; status?: MarketingQuizStatus; limit?: number; offset?: number }): Promise<MarketingQuiz[]> {
    let result = Array.from(this.quizzes.values()).filter((q) => !q.deletedAt);
    if (filters?.organizationId) {
      result = result.filter((q) => q.organizationId === filters.organizationId);
    } else if (filters?.organizationIds) {
      const allowed = new Set(filters.organizationIds);
      result = result.filter((q) => q.organizationId && allowed.has(q.organizationId));
    }
    if (filters?.status) {
      result = result.filter((q) => q.status === filters.status);
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    const sliced = result.slice(offset, offset + limit);
    return Promise.all(
      sliced.map(async (q) => {
        const questions = await this.getQuestions(q.id);
        return { ...q, questions, questionsCount: questions.length };
      }),
    );
  }

  async update(id: string, patch: Partial<MarketingQuiz>): Promise<MarketingQuiz | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: MarketingQuiz = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.quizzes.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = this.quizzes.get(id);
    if (!existing || existing.deletedAt) return false;
    existing.deletedAt = new Date();
    existing.updatedAt = new Date();
    return true;
  }

  async addQuestion(question: Omit<MarketingQuizQuestionSnapshot, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuizQuestionSnapshot> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: MarketingQuizQuestionSnapshot = {
      ...question,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.questions.set(id, record);
    return record;
  }

  async getQuestions(quizId: string): Promise<MarketingQuizQuestionSnapshot[]> {
    return Array.from(this.questions.values())
      .filter((q) => q.marketingQuizId === quizId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getQuestionById(id: string): Promise<MarketingQuizQuestionSnapshot | null> {
    return this.questions.get(id) ?? null;
  }

  async updateQuestion(id: string, patch: Partial<MarketingQuizQuestionSnapshot>): Promise<MarketingQuizQuestionSnapshot | null> {
    const existing = this.questions.get(id);
    if (!existing) return null;
    const updated: MarketingQuizQuestionSnapshot = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.questions.set(id, updated);
    return updated;
  }

  async deleteQuestion(id: string): Promise<boolean> {
    return this.questions.delete(id);
  }

  async reorderQuestions(quizId: string, orderedQuestionIds: string[]): Promise<void> {
    orderedQuestionIds.forEach((id, index) => {
      const q = this.questions.get(id);
      if (q && q.marketingQuizId === quizId) {
        q.sortOrder = index;
        q.updatedAt = new Date();
      }
    });
  }
}

export class InMemoryMarketingQuestionBankStore implements MarketingQuestionBankStore {
  private items: Map<string, MarketingQuestionBankItem> = new Map();

  async create(item: Omit<MarketingQuestionBankItem, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuestionBankItem> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: MarketingQuestionBankItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.items.set(id, record);
    return record;
  }

  async getById(id: string): Promise<MarketingQuestionBankItem | null> {
    const item = this.items.get(id);
    if (!item || item.deletedAt) return null;
    return item;
  }

  async list(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string; limit?: number; offset?: number }): Promise<MarketingQuestionBankItem[]> {
    let result = Array.from(this.items.values()).filter((i) => !i.deletedAt);
    if (filters?.organizationId) {
      result = result.filter((i) => i.organizationId === filters.organizationId);
    } else if (filters?.organizationIds) {
      const allowed = new Set(filters.organizationIds);
      result = result.filter((i) => i.organizationId && allowed.has(i.organizationId));
    }
    if (filters?.topic) {
      result = result.filter((i) => i.topic?.toLowerCase().includes(filters.topic!.toLowerCase()));
    }
    if (filters?.difficulty) {
      result = result.filter((i) => i.difficulty === filters.difficulty);
    }
    if (filters?.questionType) {
      result = result.filter((i) => i.questionType === filters.questionType);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter((i) => i.question.toLowerCase().includes(s) || i.topic?.toLowerCase().includes(s));
    }
    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return result.slice(offset, offset + limit);
  }

  async count(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string }): Promise<number> {
    let result = Array.from(this.items.values()).filter((i) => !i.deletedAt);
    if (filters?.organizationId) {
      result = result.filter((i) => i.organizationId === filters.organizationId);
    } else if (filters?.organizationIds) {
      const allowed = new Set(filters.organizationIds);
      result = result.filter((i) => i.organizationId && allowed.has(i.organizationId));
    }
    if (filters?.topic) {
      result = result.filter((i) => i.topic?.toLowerCase().includes(filters.topic!.toLowerCase()));
    }
    if (filters?.difficulty) {
      result = result.filter((i) => i.difficulty === filters.difficulty);
    }
    if (filters?.questionType) {
      result = result.filter((i) => i.questionType === filters.questionType);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter((i) => i.question.toLowerCase().includes(s) || i.topic?.toLowerCase().includes(s));
    }
    return result.length;
  }

  async update(id: string, patch: Partial<MarketingQuestionBankItem>): Promise<MarketingQuestionBankItem | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: MarketingQuestionBankItem = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<boolean> {
    const existing = this.items.get(id);
    if (!existing || existing.deletedAt) return false;
    existing.deletedAt = new Date();
    existing.updatedAt = new Date();
    return true;
  }
}

export class InMemoryMarketingQuizAttemptStore implements MarketingQuizAttemptStore {
  private attempts: Map<string, MarketingQuizAttempt> = new Map();

  async create(attempt: Omit<MarketingQuizAttempt, "id" | "startedAt" | "completedAt">): Promise<MarketingQuizAttempt> {
    if (attempt.idempotencyKey) {
      for (const a of this.attempts.values()) {
        if (a.marketingQuizId === attempt.marketingQuizId && a.idempotencyKey === attempt.idempotencyKey) {
          return a;
        }
      }
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const record: MarketingQuizAttempt = {
      ...attempt,
      id,
      startedAt: now,
      completedAt: now,
    };
    this.attempts.set(id, record);
    return record;
  }

  async getById(id: string): Promise<MarketingQuizAttempt | null> {
    return this.attempts.get(id) ?? null;
  }

  async getByToken(token: string): Promise<MarketingQuizAttempt | null> {
    for (const a of this.attempts.values()) {
      if (a.attemptToken === token) {
        return a;
      }
    }
    return null;
  }

  async getByIdempotencyKey(quizId: string, key: string): Promise<MarketingQuizAttempt | null> {
    for (const a of this.attempts.values()) {
      if (a.marketingQuizId === quizId && a.idempotencyKey === key) {
        return a;
      }
    }
    return null;
  }

  async listByQuiz(quizId: string, limit = 100, offset = 0): Promise<MarketingQuizAttempt[]> {
    const result = Array.from(this.attempts.values())
      .filter((a) => a.marketingQuizId === quizId)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    return result.slice(offset, offset + limit);
  }

  async countByQuiz(quizId: string): Promise<number> {
    return Array.from(this.attempts.values()).filter((a) => a.marketingQuizId === quizId).length;
  }

  async getAverageScore(quizId: string): Promise<number> {
    const list = Array.from(this.attempts.values()).filter((a) => a.marketingQuizId === quizId);
    if (list.length === 0) return 0;
    const total = list.reduce((sum, a) => sum + Number(a.score), 0);
    return Math.round((total / list.length) * 100) / 100;
  }

  async claimAttempt(token: string, userId: string): Promise<MarketingQuizAttempt | null> {
    const attempt = await this.getByToken(token);
    if (!attempt) return null;
    if (attempt.userId === userId) {
      return attempt; // idempotent
    }
    if (attempt.userId && attempt.userId !== userId) {
      throw new DomainError("forbidden", "این آزمون متعلق به کاربر دیگری است.");
    }
    attempt.userId = userId;
    return attempt;
  }
}

// ---------------------------------------------------------------------------
// Drizzle DB Implementation
// ---------------------------------------------------------------------------

function toMarketingQuiz(r: MarketingQuizRecord): MarketingQuiz {
  return {
    id: r.id,
    organizationId: r.organizationId,
    slug: r.slug,
    title: r.title,
    description: r.description,
    coverImageUrl: r.coverImageUrl,
    status: r.status as MarketingQuizStatus,
    settings: (r.settings ?? {}) as Record<string, unknown>,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

function toQuestionSnapshot(r: MarketingQuizQuestionRecord): MarketingQuizQuestionSnapshot {
  return {
    id: r.id,
    marketingQuizId: r.marketingQuizId,
    sourceQuestionId: r.sourceQuestionId,
    sourceBankQuestionId: r.sourceBankQuestionId,
    question: r.question,
    choices: r.choices as Array<{ id: string; text: string }>,
    correctAnswer: r.correctAnswer as { choiceId: string } | string,
    explanation: r.explanation,
    difficulty: r.difficulty as "easy" | "medium" | "hard",
    topic: r.topic,
    questionType: r.questionType,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toQuestionBankItem(r: MarketingQuestionBankRecord): MarketingQuestionBankItem {
  return {
    id: r.id,
    organizationId: r.organizationId,
    sourceType: r.sourceType as "course" | "manual" | "ai",
    sourceQuestionId: r.sourceQuestionId,
    sourceCourseId: r.sourceCourseId,
    question: r.question,
    choices: r.choices as Array<{ id: string; text: string }>,
    correctAnswer: r.correctAnswer as { choiceId: string } | string,
    explanation: r.explanation,
    difficulty: r.difficulty as "easy" | "medium" | "hard",
    topic: r.topic,
    questionType: r.questionType,
    tags: r.tags ?? [],
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

function toAttempt(r: MarketingQuizAttemptRecord): MarketingQuizAttempt {
  return {
    id: r.id,
    marketingQuizId: r.marketingQuizId,
    attemptToken: r.attemptToken,
    idempotencyKey: r.idempotencyKey,
    userId: r.userId,
    status: r.status as "in_progress" | "completed",
    score: Number(r.score),
    correctCount: r.correctCount,
    wrongCount: r.wrongCount,
    totalQuestions: r.totalQuestions,
    answers: r.answers as Record<string, string>,
    questionSnapshots: r.questionSnapshots,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  };
}

export class DrizzleMarketingQuizStore implements MarketingQuizStore {
  constructor(private readonly db: DbClient) {}

  async create(quiz: Omit<MarketingQuiz, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuiz> {
    const rows = await this.db
      .insert(marketingQuizzes)
      .values({
        organizationId: quiz.organizationId,
        slug: quiz.slug,
        title: quiz.title,
        description: quiz.description,
        coverImageUrl: quiz.coverImageUrl,
        status: quiz.status,
        settings: quiz.settings,
        createdBy: quiz.createdBy,
      })
      .returning();
    return toMarketingQuiz(rows[0]);
  }

  async getById(id: string): Promise<MarketingQuiz | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizzes)
      .where(and(eq(marketingQuizzes.id, id), isNull(marketingQuizzes.deletedAt)))
      .limit(1);
    if (!rows[0]) return null;
    const quiz = toMarketingQuiz(rows[0]);
    const questions = await this.getQuestions(id);
    return { ...quiz, questions, questionsCount: questions.length };
  }

  async getBySlug(slug: string): Promise<MarketingQuiz | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizzes)
      .where(and(eq(marketingQuizzes.slug, slug), isNull(marketingQuizzes.deletedAt)))
      .limit(1);
    if (!rows[0]) return null;
    const quiz = toMarketingQuiz(rows[0]);
    const questions = await this.getQuestions(quiz.id);
    return { ...quiz, questions, questionsCount: questions.length };
  }

  async list(filters?: { organizationId?: string; organizationIds?: string[]; status?: MarketingQuizStatus; limit?: number; offset?: number }): Promise<MarketingQuiz[]> {
    const conditions = [isNull(marketingQuizzes.deletedAt)];
    if (filters?.organizationId) {
      conditions.push(eq(marketingQuizzes.organizationId, filters.organizationId));
    } else if (filters?.organizationIds) {
      if (filters.organizationIds.length > 0) {
        conditions.push(inArray(marketingQuizzes.organizationId, filters.organizationIds));
      } else {
        return [];
      }
    }
    if (filters?.status) {
      conditions.push(eq(marketingQuizzes.status, filters.status));
    }
    const rows = await this.db
      .select()
      .from(marketingQuizzes)
      .where(and(...conditions))
      .orderBy(desc(marketingQuizzes.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);

    return Promise.all(
      rows.map(async (r: MarketingQuizRecord) => {
        const q = toMarketingQuiz(r);
        const questions = await this.getQuestions(q.id);
        return { ...q, questions, questionsCount: questions.length };
      }),
    );
  }

  async update(id: string, patch: Partial<MarketingQuiz>): Promise<MarketingQuiz | null> {
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) updateValues.title = patch.title;
    if (patch.description !== undefined) updateValues.description = patch.description;
    if (patch.coverImageUrl !== undefined) updateValues.coverImageUrl = patch.coverImageUrl;
    if (patch.status !== undefined) updateValues.status = patch.status;
    if (patch.settings !== undefined) updateValues.settings = patch.settings;

    const rows = await this.db
      .update(marketingQuizzes)
      .set(updateValues)
      .where(eq(marketingQuizzes.id, id))
      .returning();
    if (!rows[0]) return null;
    return toMarketingQuiz(rows[0]);
  }

  async softDelete(id: string): Promise<boolean> {
    const rows = await this.db
      .update(marketingQuizzes)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(marketingQuizzes.id, id))
      .returning();
    return rows.length > 0;
  }

  async addQuestion(question: Omit<MarketingQuizQuestionSnapshot, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuizQuestionSnapshot> {
    const rows = await this.db
      .insert(marketingQuizQuestions)
      .values({
        marketingQuizId: question.marketingQuizId,
        sourceQuestionId: question.sourceQuestionId,
        sourceBankQuestionId: question.sourceBankQuestionId,
        question: question.question,
        choices: question.choices,
        correctAnswer: question.correctAnswer as { choiceId: string } | string,
        explanation: question.explanation,
        difficulty: question.difficulty,
        topic: question.topic,
        questionType: question.questionType,
        sortOrder: question.sortOrder,
      })
      .returning();
    return toQuestionSnapshot(rows[0]);
  }

  async getQuestions(quizId: string): Promise<MarketingQuizQuestionSnapshot[]> {
    const rows = await this.db
      .select()
      .from(marketingQuizQuestions)
      .where(eq(marketingQuizQuestions.marketingQuizId, quizId))
      .orderBy(marketingQuizQuestions.sortOrder);
    return rows.map(toQuestionSnapshot);
  }

  async getQuestionById(id: string): Promise<MarketingQuizQuestionSnapshot | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizQuestions)
      .where(eq(marketingQuizQuestions.id, id))
      .limit(1);
    return rows[0] ? toQuestionSnapshot(rows[0]) : null;
  }

  async updateQuestion(id: string, patch: Partial<MarketingQuizQuestionSnapshot>): Promise<MarketingQuizQuestionSnapshot | null> {
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.question !== undefined) updateValues.question = patch.question;
    if (patch.choices !== undefined) updateValues.choices = patch.choices;
    if (patch.correctAnswer !== undefined) updateValues.correctAnswer = patch.correctAnswer;
    if (patch.explanation !== undefined) updateValues.explanation = patch.explanation;
    if (patch.difficulty !== undefined) updateValues.difficulty = patch.difficulty;
    if (patch.topic !== undefined) updateValues.topic = patch.topic;
    if (patch.questionType !== undefined) updateValues.questionType = patch.questionType;
    if (patch.sortOrder !== undefined) updateValues.sortOrder = patch.sortOrder;

    const rows = await this.db
      .update(marketingQuizQuestions)
      .set(updateValues)
      .where(eq(marketingQuizQuestions.id, id))
      .returning();
    return rows[0] ? toQuestionSnapshot(rows[0]) : null;
  }

  async deleteQuestion(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(marketingQuizQuestions)
      .where(eq(marketingQuizQuestions.id, id))
      .returning();
    return rows.length > 0;
  }

  async reorderQuestions(quizId: string, orderedQuestionIds: string[]): Promise<void> {
    for (let i = 0; i < orderedQuestionIds.length; i++) {
      await this.db
        .update(marketingQuizQuestions)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(marketingQuizQuestions.id, orderedQuestionIds[i]),
            eq(marketingQuizQuestions.marketingQuizId, quizId),
          ),
        );
    }
  }
}

export class DrizzleMarketingQuestionBankStore implements MarketingQuestionBankStore {
  constructor(private readonly db: DbClient) {}

  async create(item: Omit<MarketingQuestionBankItem, "id" | "createdAt" | "updatedAt">): Promise<MarketingQuestionBankItem> {
    const rows = await this.db
      .insert(marketingQuestionBank)
      .values({
        organizationId: item.organizationId,
        sourceType: item.sourceType,
        sourceQuestionId: item.sourceQuestionId,
        sourceCourseId: item.sourceCourseId,
        question: item.question,
        choices: item.choices,
        correctAnswer: item.correctAnswer,
        explanation: item.explanation,
        difficulty: item.difficulty,
        topic: item.topic,
        questionType: item.questionType,
        tags: item.tags,
        createdBy: item.createdBy,
      })
      .returning();
    return toQuestionBankItem(rows[0]);
  }

  async getById(id: string): Promise<MarketingQuestionBankItem | null> {
    const rows = await this.db
      .select()
      .from(marketingQuestionBank)
      .where(and(eq(marketingQuestionBank.id, id), isNull(marketingQuestionBank.deletedAt)))
      .limit(1);
    return rows[0] ? toQuestionBankItem(rows[0]) : null;
  }

  async list(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string; limit?: number; offset?: number }): Promise<MarketingQuestionBankItem[]> {
    const conditions = [isNull(marketingQuestionBank.deletedAt)];
    if (filters?.organizationId) {
      conditions.push(eq(marketingQuestionBank.organizationId, filters.organizationId));
    } else if (filters?.organizationIds) {
      if (filters.organizationIds.length > 0) {
        conditions.push(inArray(marketingQuestionBank.organizationId, filters.organizationIds));
      } else {
        return [];
      }
    }
    if (filters?.difficulty) {
      conditions.push(eq(marketingQuestionBank.difficulty, filters.difficulty));
    }
    if (filters?.questionType) {
      conditions.push(eq(marketingQuestionBank.questionType, filters.questionType));
    }
    if (filters?.topic) {
      conditions.push(eq(marketingQuestionBank.topic, filters.topic));
    }
    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(marketingQuestionBank.question, term),
          ilike(marketingQuestionBank.topic, term),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(marketingQuestionBank)
      .where(and(...conditions))
      .orderBy(desc(marketingQuestionBank.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);

    return rows.map(toQuestionBankItem);
  }

  async count(filters?: { organizationId?: string; organizationIds?: string[]; topic?: string; difficulty?: string; questionType?: string; search?: string }): Promise<number> {
    const conditions = [isNull(marketingQuestionBank.deletedAt)];
    if (filters?.organizationId) {
      conditions.push(eq(marketingQuestionBank.organizationId, filters.organizationId));
    } else if (filters?.organizationIds) {
      if (filters.organizationIds.length > 0) {
        conditions.push(inArray(marketingQuestionBank.organizationId, filters.organizationIds));
      } else {
        return 0;
      }
    }
    if (filters?.difficulty) {
      conditions.push(eq(marketingQuestionBank.difficulty, filters.difficulty));
    }
    if (filters?.questionType) {
      conditions.push(eq(marketingQuestionBank.questionType, filters.questionType));
    }
    if (filters?.topic) {
      conditions.push(eq(marketingQuestionBank.topic, filters.topic));
    }
    if (filters?.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(marketingQuestionBank.question, term),
          ilike(marketingQuestionBank.topic, term),
        )!,
      );
    }

    const rows = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(marketingQuestionBank)
      .where(and(...conditions));

    return Number(rows[0]?.count ?? 0);
  }

  async update(id: string, patch: Partial<MarketingQuestionBankItem>): Promise<MarketingQuestionBankItem | null> {
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.question !== undefined) updateValues.question = patch.question;
    if (patch.choices !== undefined) updateValues.choices = patch.choices;
    if (patch.correctAnswer !== undefined) updateValues.correctAnswer = patch.correctAnswer;
    if (patch.explanation !== undefined) updateValues.explanation = patch.explanation;
    if (patch.difficulty !== undefined) updateValues.difficulty = patch.difficulty;
    if (patch.topic !== undefined) updateValues.topic = patch.topic;
    if (patch.questionType !== undefined) updateValues.questionType = patch.questionType;
    if (patch.tags !== undefined) updateValues.tags = patch.tags;

    const rows = await this.db
      .update(marketingQuestionBank)
      .set(updateValues)
      .where(eq(marketingQuestionBank.id, id))
      .returning();
    return rows[0] ? toQuestionBankItem(rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const rows = await this.db
      .update(marketingQuestionBank)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(marketingQuestionBank.id, id))
      .returning();
    return rows.length > 0;
  }
}

export class DrizzleMarketingQuizAttemptStore implements MarketingQuizAttemptStore {
  constructor(private readonly db: DbClient) {}

  async create(attempt: Omit<MarketingQuizAttempt, "id" | "startedAt" | "completedAt">): Promise<MarketingQuizAttempt> {
    if (attempt.idempotencyKey) {
      const existing = await this.getByIdempotencyKey(attempt.marketingQuizId, attempt.idempotencyKey);
      if (existing) {
        return existing;
      }
    }
    try {
      const rows = await this.db
        .insert(marketingQuizAttempts)
        .values({
          marketingQuizId: attempt.marketingQuizId,
          attemptToken: attempt.attemptToken,
          idempotencyKey: attempt.idempotencyKey,
          userId: attempt.userId,
          status: attempt.status,
          score: String(attempt.score),
          correctCount: attempt.correctCount,
          wrongCount: attempt.wrongCount,
          totalQuestions: attempt.totalQuestions,
          answers: attempt.answers,
          questionSnapshots: attempt.questionSnapshots,
        })
        .returning();
      return toAttempt(rows[0]);
    } catch (err: unknown) {
      type PgDatabaseError = {
        code?: string;
        constraint?: string;
        detail?: string;
        message?: string;
        cause?: PgDatabaseError;
      };

      const e = err as PgDatabaseError;
      const is23505 = e?.code === "23505" || e?.cause?.code === "23505";
      const constraint = e?.constraint ?? e?.cause?.constraint;
      const message = e?.message ?? e?.cause?.message ?? "";
      const detail = e?.detail ?? e?.cause?.detail ?? "";

      const isIdempotencyViolation =
        constraint === "uq_marketing_quiz_attempts_quiz_idempotency" ||
        message.includes("uq_marketing_quiz_attempts_quiz_idempotency") ||
        detail.includes("uq_marketing_quiz_attempts_quiz_idempotency");

      if (is23505 && isIdempotencyViolation && attempt.idempotencyKey) {
        const existing = await this.getByIdempotencyKey(attempt.marketingQuizId, attempt.idempotencyKey);
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  async getById(id: string): Promise<MarketingQuizAttempt | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizAttempts)
      .where(eq(marketingQuizAttempts.id, id))
      .limit(1);
    return rows[0] ? toAttempt(rows[0]) : null;
  }

  async getByToken(token: string): Promise<MarketingQuizAttempt | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizAttempts)
      .where(eq(marketingQuizAttempts.attemptToken, token))
      .limit(1);
    return rows[0] ? toAttempt(rows[0]) : null;
  }

  async getByIdempotencyKey(quizId: string, key: string): Promise<MarketingQuizAttempt | null> {
    const rows = await this.db
      .select()
      .from(marketingQuizAttempts)
      .where(
        and(
          eq(marketingQuizAttempts.marketingQuizId, quizId),
          eq(marketingQuizAttempts.idempotencyKey, key),
        ),
      )
      .limit(1);
    return rows[0] ? toAttempt(rows[0]) : null;
  }

  async listByQuiz(quizId: string, limit = 100, offset = 0): Promise<MarketingQuizAttempt[]> {
    const rows = await this.db
      .select()
      .from(marketingQuizAttempts)
      .where(eq(marketingQuizAttempts.marketingQuizId, quizId))
      .orderBy(desc(marketingQuizAttempts.completedAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toAttempt);
  }

  async countByQuiz(quizId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketingQuizAttempts)
      .where(eq(marketingQuizAttempts.marketingQuizId, quizId));
    return rows[0]?.count ?? 0;
  }

  async getAverageScore(quizId: string): Promise<number> {
    const rows = await this.db
      .select({ avg: sql<number>`coalesce(avg(score::numeric), 0)::float` })
      .from(marketingQuizAttempts)
      .where(eq(marketingQuizAttempts.marketingQuizId, quizId));
    return Math.round((rows[0]?.avg ?? 0) * 100) / 100;
  }

  async claimAttempt(token: string, userId: string): Promise<MarketingQuizAttempt | null> {
    const existing = await this.getByToken(token);
    if (!existing) return null;
    if (existing.userId === userId) {
      return existing; // idempotent
    }
    if (existing.userId && existing.userId !== userId) {
      throw new DomainError("forbidden", "این آزمون متعلق به کاربر دیگری است.");
    }

    // Atomic claim: only update if userId IS NULL
    const updated = await this.db
      .update(marketingQuizAttempts)
      .set({ userId })
      .where(
        and(
          eq(marketingQuizAttempts.attemptToken, token),
          isNull(marketingQuizAttempts.userId),
        ),
      )
      .returning();

    if (updated[0]) {
      return toAttempt(updated[0]);
    }

    // Concurrent check in case of simultaneous requests
    const reloaded = await this.getByToken(token);
    if (reloaded?.userId === userId) {
      return reloaded;
    }
    throw new DomainError("forbidden", "این آزمون متعلق به کاربر دیگری است.");
  }
}
