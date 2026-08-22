/**
 * In-memory implementations of study stores for testing (PR6-7).
 *
 * Follows the existing in-memory store pattern (learning/test/in-memory-stores).
 * Supports pre-loading seed data for integration tests.
 */

import type {
  CourseId,
  DocumentId,
  FlashcardId,
  GeneratedContentId,
  OrganizationId,
  QuizAttemptId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";
import type {
  FlashcardRecord,
  FlashcardReviewRecord,
  FlashcardScheduleUpdate,
  UserFlashcardScheduleRecord,
  QuizRecord,
  QuizQuestionRecord,
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  StudySessionStore,
  FlashcardStudySessionStore,
} from "../study-store.js";
import type {
  QuizAttemptRecord,
  StudySessionRecord,
  FlashcardStudySessionRecord,
  FlashcardStudySessionCardRecord,
  FlashcardSessionStatus,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// InMemoryFlashcardStore
// ---------------------------------------------------------------------------

export class InMemoryFlashcardStore implements FlashcardStore {
  private flashcards: Map<string, FlashcardRecord> = new Map();

  async findByIdForOrganization(
    id: FlashcardId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord | undefined> {
    const record = this.flashcards.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt !== null
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord[]> {
    return Array.from(this.flashcards.values())
      .filter(
        (f) =>
          f.courseId === courseId &&
          f.organizationId === organizationId &&
          f.deletedAt === null,
      )
      .map((f) => ({ ...f }));
  }

  async listByOrganization(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<FlashcardRecord[]> {
    return Array.from(this.flashcards.values())
      .filter(
        (f) =>
          (f.organizationId === organizationId ||
            (systemOrganizationId && f.organizationId === systemOrganizationId)) &&
          f.deletedAt === null,
      )
      .map((f) => ({ ...f }));
  }

  async create(record: FlashcardRecord): Promise<FlashcardRecord> {
    this.flashcards.set(record.id, { ...record });
    return { ...record };
  }

  async createMany(records: FlashcardRecord[]): Promise<FlashcardRecord[]> {
    for (const r of records) {
      this.flashcards.set(r.id, { ...r });
    }
    return records.map((r) => ({ ...r }));
  }

  async updateSchedule(
    id: FlashcardId,
    schedule: FlashcardScheduleUpdate,
  ): Promise<void> {
    const existing = this.flashcards.get(id);
    if (existing) {
      this.flashcards.set(id, {
        ...existing,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
        updatedAt: schedule.updatedAt,
      });
    }
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<FlashcardRecord | undefined> {
    for (const f of this.flashcards.values()) {
      if (f.generatedContentId === generatedContentId && f.deletedAt === null) {
        return { ...f };
      }
    }
    return undefined;
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, f] of this.flashcards) {
      if (
        f.documentId === documentId &&
        f.organizationId === organizationId &&
        f.deletedAt === null
      ) {
        this.flashcards.set(id, {
          ...f,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Directly insert a record (used for seeding). */
  insert(record: FlashcardRecord): void {
    this.flashcards.set(record.id, { ...record });
  }

  /** Get all stored records (for test assertions). */
  getAll(): FlashcardRecord[] {
    return Array.from(this.flashcards.values()).map((f) => ({ ...f }));
  }

  /** Clear all records (for test isolation). */
  clear(): void {
    this.flashcards.clear();
  }
}

// ---------------------------------------------------------------------------
// In-Memory Flashcard Review Store
// ---------------------------------------------------------------------------

export class InMemoryFlashcardReviewStore implements FlashcardReviewStore {
  private reviews: FlashcardReviewRecord[] = [];

  async create(record: FlashcardReviewRecord): Promise<FlashcardReviewRecord> {
    this.reviews.push({ ...record });
    return { ...record };
  }

  async listByUserAndFlashcard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<FlashcardReviewRecord[]> {
    return this.reviews
      .filter((r) => r.userId === userId && r.flashcardId === flashcardId)
      .map((r) => ({ ...r }));
  }

  async listByUser(userId: UserId): Promise<FlashcardReviewRecord[]> {
    return this.reviews
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }

  async countByUser(userId: UserId): Promise<number> {
    return this.reviews.filter((r) => r.userId === userId).length;
  }

  /** Directly insert a review (used for seeding). */
  insert(record: FlashcardReviewRecord): void {
    this.reviews.push({ ...record });
  }

  /** Get all stored reviews (for test assertions). */
  getAll(): FlashcardReviewRecord[] {
    return this.reviews.map((r) => ({ ...r }));
  }

  /** Clear all reviews (for test isolation). */
  clear(): void {
    this.reviews = [];
  }
}

// ---------------------------------------------------------------------------
// In-Memory User Flashcard Schedule Store
// ---------------------------------------------------------------------------

export class InMemoryUserFlashcardScheduleStore
  implements UserFlashcardScheduleStore
{
  private schedules: Map<string, UserFlashcardScheduleRecord> = new Map();

  private key(userId: string, flashcardId: string): string {
    return `${userId}:${flashcardId}`;
  }

  async getByUserAndCard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<UserFlashcardScheduleRecord | undefined> {
    const record = this.schedules.get(this.key(userId, flashcardId));
    return record ? { ...record } : undefined;
  }

  async listByUser(userId: UserId): Promise<UserFlashcardScheduleRecord[]> {
    return Array.from(this.schedules.values())
      .filter((s) => s.userId === userId)
      .map((s) => ({ ...s }));
  }

  async upsertSchedule(
    record: Omit<UserFlashcardScheduleRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserFlashcardScheduleRecord> {
    const k = this.key(record.userId, record.flashcardId);
    const existing = this.schedules.get(k);
    const now = new Date().toISOString();
    const fullRecord: UserFlashcardScheduleRecord = {
      id: existing?.id ?? `sched-${k}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...record,
      reviewCount: existing ? existing.reviewCount + 1 : (record.reviewCount ?? 1),
    };
    this.schedules.set(k, fullRecord);
    return { ...fullRecord };
  }

  clear(): void {
    this.schedules.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizStore
// ---------------------------------------------------------------------------

export class InMemoryQuizStore implements QuizStore {
  private quizzes: Map<string, QuizRecord> = new Map();
  private questionsByQuiz: Map<string, QuizQuestionRecord[]> = new Map();

  async findByIdForOrganization(
    id: QuizId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord | undefined> {
    const record = this.quizzes.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt !== null
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord[]> {
    return Array.from(this.quizzes.values())
      .filter(
        (q) =>
          q.courseId === courseId &&
          q.organizationId === organizationId &&
          q.deletedAt === null,
      )
      .map((q) => ({ ...q }));
  }

  async listByOrganization(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<QuizRecord[]> {
    return Array.from(this.quizzes.values())
      .filter(
        (q) =>
          (q.organizationId === organizationId ||
            (systemOrganizationId && q.organizationId === systemOrganizationId)) &&
          q.deletedAt === null,
      )
      .map((q) => ({ ...q }));
  }

  async create(record: QuizRecord): Promise<QuizRecord> {
    this.quizzes.set(record.id, { ...record });
    return { ...record };
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<QuizRecord | undefined> {
    // Look up question by generatedContentId to find the parent quiz
    for (const [quizId, questions] of this.questionsByQuiz.entries()) {
      if (questions.some((q) => q.generatedContentId === generatedContentId)) {
        return this.quizzes.get(quizId);
      }
    }
    return undefined;
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, q] of this.quizzes) {
      if (
        q.documentId === documentId &&
        q.organizationId === organizationId &&
        q.deletedAt === null
      ) {
        this.quizzes.set(id, {
          ...q,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Helper to link questions for findByGeneratedContent */
  setQuestionsForQuiz(quizId: string, questions: QuizQuestionRecord[]): void {
    this.questionsByQuiz.set(quizId, questions);
  }

  /** Directly insert a record (used for seeding). */
  insert(record: QuizRecord): void {
    this.quizzes.set(record.id, { ...record });
  }

  /** Get all stored records (for test assertions). */
  getAll(): QuizRecord[] {
    return Array.from(this.quizzes.values()).map((q) => ({ ...q }));
  }

  /** Clear all records (for test isolation). */
  clear(): void {
    this.quizzes.clear();
    this.questionsByQuiz.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizQuestionStore
// ---------------------------------------------------------------------------

export class InMemoryQuizQuestionStore implements QuizQuestionStore {
  private questions: QuizQuestionRecord[] = [];

  constructor(private readonly quizStore?: InMemoryQuizStore) {}

  async listByQuiz(quizId: QuizId): Promise<QuizQuestionRecord[]> {
    return this.questions
      .filter((q) => q.quizId === quizId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => ({ ...q }));
  }

  async listByIds(ids: QuizQuestionId[]): Promise<QuizQuestionRecord[]> {
    const idSet = new Set(ids);
    const foundMap = new Map(
      this.questions.filter((q) => idSet.has(q.id)).map((q) => [q.id, q]),
    );
    const ordered: QuizQuestionRecord[] = [];
    for (const id of ids) {
      const q = foundMap.get(id);
      if (q) ordered.push({ ...q });
    }
    return ordered;
  }

  async listByFilter(filter: {
    organizationId?: OrganizationId;
    systemOrganizationId?: OrganizationId;
    topics?: string[];
    difficulty?: string;
  }): Promise<QuizQuestionRecord[]> {
    return this.questions
      .filter((q) => {
        if (filter.organizationId && this.quizStore) {
          const quiz = this.quizStore.getAll().find((qz) => qz.id === q.quizId);
          if (
            quiz &&
            quiz.organizationId !== filter.organizationId &&
            (!filter.systemOrganizationId || quiz.organizationId !== filter.systemOrganizationId)
          ) {
            return false;
          }
        }
        if (filter.difficulty && filter.difficulty !== "all") {
          if ((q.difficulty || "medium") !== filter.difficulty) {
            return false;
          }
        }
        if (filter.topics && filter.topics.length > 0) {
          const matchTopic = filter.topics.some(
            (t) =>
              q.topic === t ||
              q.question.toLowerCase().includes(t.toLowerCase()),
          );
          if (!matchTopic) return false;
        }
        return true;
      })
      .map((q) => ({ ...q }));
  }

  async countByTopicAndDifficulty(
    _organizationId?: OrganizationId,
  ): Promise<Array<{ topic: string; difficulty: string; questionCount: number }>> {
    const map = new Map<string, number>();
    for (const q of this.questions) {
      const topic = q.topic || "عمومی";
      const difficulty = q.difficulty || "medium";
      const key = `${topic}:::${difficulty}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const result: Array<{ topic: string; difficulty: string; questionCount: number }> = [];
    for (const [key, count] of map.entries()) {
      const [topic, difficulty] = key.split(":::");
      result.push({ topic, difficulty, questionCount: count });
    }
    return result;
  }

  async createMany(
    records: QuizQuestionRecord[],
  ): Promise<QuizQuestionRecord[]> {
    for (const r of records) {
      this.questions.push({ ...r });
    }
    if (this.quizStore && records.length > 0) {
      const quizId = records[0].quizId;
      const quizQuestions = this.questions.filter((q) => q.quizId === quizId);
      this.quizStore.setQuestionsForQuiz(quizId, quizQuestions);
    }
    return records.map((r) => ({ ...r }));
  }

  /** Directly insert questions (used for seeding). */
  insert(record: QuizQuestionRecord): void {
    this.questions.push({ ...record });
  }

  /** Get all stored questions (for test assertions). */
  getAll(): QuizQuestionRecord[] {
    return this.questions.map((q) => ({ ...q }));
  }

  /** Clear all questions (for test isolation). */
  clear(): void {
    this.questions = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizAttemptStore
// ---------------------------------------------------------------------------

export class InMemoryQuizAttemptStore implements QuizAttemptStore {
  private attempts: Map<string, QuizAttemptRecord> = new Map();
  private quizStore?: InMemoryQuizStore;

  constructor(quizStore?: InMemoryQuizStore) {
    this.quizStore = quizStore;
  }

  setQuizStore(quizStore: InMemoryQuizStore): void {
    this.quizStore = quizStore;
  }

  async findById(id: QuizAttemptId): Promise<QuizAttemptRecord | undefined> {
    const record = this.attempts.get(id);
    return record ? { ...record } : undefined;
  }

  async listByUserAndQuiz(
    userId: UserId,
    quizId: QuizId,
  ): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.userId === userId && a.quizId === quizId)
      .map((a) => ({ ...a }));
  }

  async listByUser(userId: UserId): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.userId === userId)
      .map((a) => ({ ...a }));
  }

  async countCompletedByUser(userId: UserId): Promise<number> {
    return Array.from(this.attempts.values()).filter(
      (a) => a.userId === userId && (a.status === "completed" || a.completedAt !== null),
    ).length;
  }

  async listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => {
        if (a.userId !== userId) return false;
        if (!this.quizStore) return true;
        const allQuizzes = this.quizStore.getAll();
        const quiz = allQuizzes.find((q) => q.id === a.quizId);
        return quiz?.courseId === courseId;
      })
      .map((a) => ({ ...a }));
  }

  async create(record: QuizAttemptRecord): Promise<QuizAttemptRecord> {
    this.attempts.set(record.id, { ...record });
    return { ...record };
  }

  async update(record: QuizAttemptRecord): Promise<QuizAttemptRecord> {
    const existing = this.attempts.get(record.id);
    const updated: QuizAttemptRecord = {
      ...existing,
      ...record,
    };
    this.attempts.set(record.id, updated);
    return { ...updated };
  }

  /** Directly insert an attempt (used for seeding). */
  insert(record: QuizAttemptRecord): void {
    this.attempts.set(record.id, { ...record });
  }

  /** Get all stored attempts (for test assertions). */
  getAll(): QuizAttemptRecord[] {
    return Array.from(this.attempts.values()).map((a) => ({ ...a }));
  }

  /** Clear all attempts (for test isolation). */
  clear(): void {
    this.attempts.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryStudySessionStore
// ---------------------------------------------------------------------------

export class InMemoryStudySessionStore implements StudySessionStore {
  private sessions: Map<string, StudySessionRecord> = new Map();

  async create(
    record: Omit<StudySessionRecord, "createdAt" | "updatedAt">,
  ): Promise<StudySessionRecord> {
    const now = new Date().toISOString();
    const fullRecord: StudySessionRecord = {
      ...record,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(record.id, { ...fullRecord });
    return { ...fullRecord };
  }

  async findById(id: string): Promise<StudySessionRecord | undefined> {
    const s = this.sessions.get(id);
    return s ? { ...s } : undefined;
  }

  async findActiveByUser(userId: UserId): Promise<StudySessionRecord | undefined> {
    const active = Array.from(this.sessions.values())
      .filter((s) => s.userId === userId && (!s.endedAt || s.endedAt === null))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return active[0] ? { ...active[0] } : undefined;
  }

  async update(record: StudySessionRecord): Promise<StudySessionRecord> {
    const existing = this.sessions.get(record.id);
    const updated: StudySessionRecord = {
      ...existing,
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString(),
    };
    this.sessions.set(record.id, { ...updated });
    return { ...updated };
  }

  async closeActiveSessionsForUser(
    userId: UserId,
    endedAt: string,
  ): Promise<void> {
    for (const [id, s] of this.sessions) {
      if (s.userId === userId && (!s.endedAt || s.endedAt === null)) {
        this.sessions.set(id, {
          ...s,
          endedAt,
          updatedAt: endedAt,
        });
      }
    }
  }

  async listByUser(userId: UserId): Promise<StudySessionRecord[]> {
    return Array.from(this.sessions.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map((s) => ({ ...s }));
  }

  async listByUserAndDateRange(
    userId: UserId,
    fromDate: string,
    toDate: string,
  ): Promise<StudySessionRecord[]> {
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();

    return Array.from(this.sessions.values())
      .filter((s) => {
        if (s.userId !== userId) return false;
        const start = new Date(s.startedAt).getTime();
        return start >= from && start <= to;
      })
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map((s) => ({ ...s }));
  }

  insert(record: StudySessionRecord): void {
    this.sessions.set(record.id, { ...record });
  }

  getAll(): StudySessionRecord[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  clear(): void {
    this.sessions.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryFlashcardStudySessionStore
// ---------------------------------------------------------------------------

export class InMemoryFlashcardStudySessionStore
  implements FlashcardStudySessionStore
{
  private sessions: Map<string, FlashcardStudySessionRecord> = new Map();
  private sessionCards: Map<string, FlashcardStudySessionCardRecord[]> = new Map();

  async createSessionWithCards(
    session: Omit<FlashcardStudySessionRecord, "createdAt" | "updatedAt">,
    cards: Array<{ flashcardId: string; sortOrder: number }>,
  ): Promise<FlashcardStudySessionRecord> {
    const now = new Date().toISOString();
    const fullSession: FlashcardStudySessionRecord = {
      ...session,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, { ...fullSession });

    const cardRecords: FlashcardStudySessionCardRecord[] = cards.map((c, idx) => ({
      id: `fssc-${session.id}-${idx}`,
      sessionId: session.id,
      flashcardId: c.flashcardId,
      sortOrder: c.sortOrder,
      status: "unseen",
      rating: null,
      reactionMs: null,
      reviewedAt: null,
      createdAt: now,
    }));
    this.sessionCards.set(session.id, cardRecords);

    return { ...fullSession };
  }

  async findById(id: string): Promise<FlashcardStudySessionRecord | undefined> {
    const s = this.sessions.get(id);
    return s ? { ...s } : undefined;
  }

  async listActiveByUser(
    userId: UserId,
    organizationId?: OrganizationId,
  ): Promise<FlashcardStudySessionRecord[]> {
    return Array.from(this.sessions.values())
      .filter((s) => {
        if (s.userId !== userId) return false;
        if (s.status !== "in_progress") return false;
        if (organizationId && s.organizationId !== organizationId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      .map((s) => ({ ...s }));
  }

  async listSessionCards(
    sessionId: string,
  ): Promise<FlashcardStudySessionCardRecord[]> {
    const cards = this.sessionCards.get(sessionId) || [];
    return [...cards].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ ...c }));
  }

  async updateProgress(
    sessionId: string,
    data: {
      currentIndex: number;
      completedCards: number;
      currentCardId?: string | null;
      lastActivityAt: string;
      cardUpdate?: {
        flashcardId: string;
        status: "reviewed";
        rating?: string | null;
        reactionMs?: number | null;
        reviewedAt: string;
      };
    },
  ): Promise<FlashcardStudySessionRecord | undefined> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;

    if (data.cardUpdate) {
      const cards = this.sessionCards.get(sessionId) || [];
      const card = cards.find((c) => c.flashcardId === data.cardUpdate!.flashcardId);
      if (card) {
        card.status = data.cardUpdate.status;
        card.rating = data.cardUpdate.rating ?? null;
        card.reactionMs = data.cardUpdate.reactionMs ?? null;
        card.reviewedAt = data.cardUpdate.reviewedAt;
      }
    }

    const updated: FlashcardStudySessionRecord = {
      ...existing,
      currentIndex: data.currentIndex,
      completedCards: data.completedCards,
      currentCardId: data.currentCardId ?? null,
      lastActivityAt: data.lastActivityAt,
      updatedAt: data.lastActivityAt,
    };
    this.sessions.set(sessionId, updated);
    return { ...updated };
  }

  async updateStatus(
    sessionId: string,
    status: FlashcardSessionStatus,
    completedAt?: string | null,
    lastActivityAt?: string,
  ): Promise<FlashcardStudySessionRecord | undefined> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;

    const now = lastActivityAt || new Date().toISOString();
    const updated: FlashcardStudySessionRecord = {
      ...existing,
      status,
      completedAt: completedAt ? completedAt : null,
      lastActivityAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, updated);
    return { ...updated };
  }

  insert(record: FlashcardStudySessionRecord): void {
    this.sessions.set(record.id, { ...record });
  }

  clear(): void {
    this.sessions.clear();
    this.sessionCards.clear();
  }
}


