import {
  DomainError,
  asQuestionPatternId,
  asQuestionPatternExampleId,
  normalizeCognitiveLevel,
  mapLegacyCognitiveLevelToSkill,
  type UUID,
  type QuestionPatternId,
  type QuestionPatternExampleId,
  type QuestionPatternRecord,
  type QuestionPatternExampleRecord,
  type QuestionPatternDefinition,
  type CognitiveLevel,
} from "@avana/domain";
import type { DbClient } from "@avana/database/client";
import {
  questionPatterns,
  questionPatternExamples,
  type QuestionPatternDbRecord,
  type QuestionPatternExampleDbRecord,
} from "@avana/database/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export interface CreateQuestionPatternInput {
  title: string;
  description?: string | null;
  cognitiveLevel?: string;
  skills?: string[];
  systemInstructions: string;
  isActive?: boolean;
}

export interface UpdateQuestionPatternInput {
  title?: string;
  description?: string | null;
  cognitiveLevel?: string;
  skills?: string[];
  systemInstructions?: string;
  isActive?: boolean;
}

export interface CreateQuestionPatternExampleInput {
  sourceQuizQuestionId?: string | null;
  question: string;
  choices: string[];
  correctAnswer: unknown;
  explanation?: string | null;
  clinicalContext?: string | null;
  sortOrder?: number;
}

export interface QuestionPatternStore {
  listPatterns(options?: { activeOnly?: boolean }): Promise<Array<QuestionPatternRecord & { examplesCount: number }>>;
  findById(id: QuestionPatternId, version?: number): Promise<QuestionPatternDefinition | null>;
  create(input: CreateQuestionPatternInput): Promise<QuestionPatternRecord>;
  update(id: QuestionPatternId, input: UpdateQuestionPatternInput): Promise<QuestionPatternRecord>;
  softDelete(id: QuestionPatternId): Promise<boolean>;
  addExample(patternId: QuestionPatternId, input: CreateQuestionPatternExampleInput): Promise<QuestionPatternExampleRecord>;
  deleteExample(patternId: QuestionPatternId, exampleId: QuestionPatternExampleId): Promise<boolean>;
  listExamples(patternId: QuestionPatternId): Promise<QuestionPatternExampleRecord[]>;
}

export class InMemoryQuestionPatternStore implements QuestionPatternStore {
  private patterns = new Map<string, QuestionPatternRecord>();
  private examples = new Map<string, QuestionPatternExampleRecord>();

  async listPatterns(options?: { activeOnly?: boolean }): Promise<Array<QuestionPatternRecord & { examplesCount: number }>> {
    const results: Array<QuestionPatternRecord & { examplesCount: number }> = [];
    for (const p of this.patterns.values()) {
      if (p.deletedAt) continue;
      if (options?.activeOnly && !p.isActive) continue;
      const exCount = Array.from(this.examples.values()).filter(
        (e) => e.questionPatternId === p.id,
      ).length;
      results.push({ ...p, examplesCount: exCount });
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: QuestionPatternId, version?: number): Promise<QuestionPatternDefinition | null> {
    const p = this.patterns.get(id);
    if (!p || p.deletedAt) return null;
    if (typeof version === "number" && p.version !== version) {
      // In-memory returns current if matches or null if version mismatch
      return null;
    }
    const exs = Array.from(this.examples.values())
      .filter((e) => e.questionPatternId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...p, examples: exs };
  }

  async create(input: CreateQuestionPatternInput): Promise<QuestionPatternRecord> {
    const id = asQuestionPatternId(randomUUID() as UUID);
    const now = new Date().toISOString();
    const legacy = mapLegacyCognitiveLevelToSkill(input.cognitiveLevel);
    const cognitiveLevel: CognitiveLevel = input.cognitiveLevel
      ? normalizeCognitiveLevel(input.cognitiveLevel)
      : legacy.cognitiveLevel;
    const skills: string[] =
      input.skills && input.skills.length > 0
        ? input.skills
        : legacy.skills;

    const record: QuestionPatternRecord = {
      id,
      title: input.title,
      description: input.description ?? null,
      cognitiveLevel,
      skills,
      systemInstructions: input.systemInstructions,
      isActive: input.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.patterns.set(id, record);
    return record;
  }

  async update(id: QuestionPatternId, input: UpdateQuestionPatternInput): Promise<QuestionPatternRecord> {
    const existing = this.patterns.get(id);
    if (!existing || existing.deletedAt) {
      throw new DomainError("not_found", "الگوی سؤال یافت نشد.");
    }
    const now = new Date().toISOString();
    const skillsChanged =
      input.skills !== undefined &&
      JSON.stringify(input.skills) !== JSON.stringify(existing.skills);
    const targetCog = input.cognitiveLevel
      ? normalizeCognitiveLevel(input.cognitiveLevel)
      : existing.cognitiveLevel;
    const cogChanged =
      input.cognitiveLevel !== undefined && targetCog !== existing.cognitiveLevel;

    const willBumpVersion =
      (input.systemInstructions !== undefined && input.systemInstructions !== existing.systemInstructions) ||
      cogChanged ||
      skillsChanged;

    const updated: QuestionPatternRecord = {
      ...existing,
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      cognitiveLevel: targetCog,
      skills: input.skills !== undefined ? input.skills : existing.skills,
      systemInstructions: input.systemInstructions ?? existing.systemInstructions,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      version: willBumpVersion ? existing.version + 1 : existing.version,
      updatedAt: now,
    };
    this.patterns.set(id, updated);
    return updated;
  }

  async softDelete(id: QuestionPatternId): Promise<boolean> {
    const existing = this.patterns.get(id);
    if (!existing || existing.deletedAt) return false;
    existing.deletedAt = new Date().toISOString();
    existing.updatedAt = existing.deletedAt;
    return true;
  }

  async addExample(patternId: QuestionPatternId, input: CreateQuestionPatternExampleInput): Promise<QuestionPatternExampleRecord> {
    const pattern = this.patterns.get(patternId);
    if (!pattern || pattern.deletedAt) {
      throw new DomainError("not_found", "الگوی سؤال یافت نشد.");
    }
    const now = new Date().toISOString();
    const exId = asQuestionPatternExampleId(randomUUID() as UUID);
    const example: QuestionPatternExampleRecord = {
      id: exId,
      questionPatternId: patternId,
      sourceQuizQuestionId: input.sourceQuizQuestionId ?? null,
      question: input.question,
      choices: input.choices,
      correctAnswer: input.correctAnswer,
      explanation: input.explanation ?? null,
      clinicalContext: input.clinicalContext ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
    };
    this.examples.set(exId, example);

    // Bump pattern version on example addition
    pattern.version += 1;
    pattern.updatedAt = now;

    return example;
  }

  async deleteExample(patternId: QuestionPatternId, exampleId: QuestionPatternExampleId): Promise<boolean> {
    const pattern = this.patterns.get(patternId);
    if (!pattern || pattern.deletedAt) return false;
    const example = this.examples.get(exampleId);
    if (!example || example.questionPatternId !== patternId) return false;

    this.examples.delete(exampleId);
    // Bump pattern version on example deletion
    pattern.version += 1;
    pattern.updatedAt = new Date().toISOString();
    return true;
  }

  async listExamples(patternId: QuestionPatternId): Promise<QuestionPatternExampleRecord[]> {
    return Array.from(this.examples.values())
      .filter((e) => e.questionPatternId === patternId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

export class DrizzleQuestionPatternStore implements QuestionPatternStore {
  constructor(private readonly db: DbClient) {}

  async listPatterns(options?: { activeOnly?: boolean }): Promise<Array<QuestionPatternRecord & { examplesCount: number }>> {
    const rows = await this.db
      .select({
        pattern: questionPatterns,
        examplesCount: sql<number>`count(${questionPatternExamples.id})::int`,
      })
      .from(questionPatterns)
      .leftJoin(
        questionPatternExamples,
        eq(questionPatterns.id, questionPatternExamples.questionPatternId),
      )
      .where(
        and(
          isNull(questionPatterns.deletedAt),
          options?.activeOnly ? eq(questionPatterns.isActive, true) : undefined,
        ),
      )
      .groupBy(questionPatterns.id)
      .orderBy(desc(questionPatterns.createdAt));

    return rows.map((r) => ({
      ...this.toDomainPattern(r.pattern),
      examplesCount: r.examplesCount || 0,
    }));
  }

  async findById(id: QuestionPatternId, version?: number): Promise<QuestionPatternDefinition | null> {
    const [p] = await this.db
      .select()
      .from(questionPatterns)
      .where(
        and(
          eq(questionPatterns.id, id),
          isNull(questionPatterns.deletedAt),
          typeof version === "number" ? eq(questionPatterns.version, version) : undefined,
        ),
      )
      .limit(1);

    if (!p) return null;

    const examples = await this.listExamples(id);
    return {
      ...this.toDomainPattern(p),
      examples,
    };
  }

  async create(input: CreateQuestionPatternInput): Promise<QuestionPatternRecord> {
    const legacy = mapLegacyCognitiveLevelToSkill(input.cognitiveLevel);
    const cognitiveLevel = input.cognitiveLevel
      ? normalizeCognitiveLevel(input.cognitiveLevel)
      : legacy.cognitiveLevel;
    const skills =
      input.skills && input.skills.length > 0 ? input.skills : legacy.skills;

    const [p] = await this.db
      .insert(questionPatterns)
      .values({
        title: input.title,
        description: input.description ?? null,
        cognitiveLevel,
        skills,
        systemInstructions: input.systemInstructions,
        isActive: input.isActive ?? true,
        version: 1,
      })
      .returning();

    return this.toDomainPattern(p);
  }

  async update(id: QuestionPatternId, input: UpdateQuestionPatternInput): Promise<QuestionPatternRecord> {
    const [existing] = await this.db
      .select()
      .from(questionPatterns)
      .where(and(eq(questionPatterns.id, id), isNull(questionPatterns.deletedAt)))
      .limit(1);

    if (!existing) {
      throw new DomainError("not_found", "الگوی سؤال یافت نشد.");
    }

    const existingSkills = Array.isArray(existing.skills)
      ? (existing.skills as string[])
      : [];
    const skillsChanged =
      input.skills !== undefined &&
      JSON.stringify(input.skills) !== JSON.stringify(existingSkills);
    const existingCog = normalizeCognitiveLevel(existing.cognitiveLevel);
    const targetCog = input.cognitiveLevel
      ? normalizeCognitiveLevel(input.cognitiveLevel)
      : existingCog;
    const cogChanged =
      input.cognitiveLevel !== undefined && targetCog !== existingCog;

    const willBumpVersion =
      (input.systemInstructions !== undefined && input.systemInstructions !== existing.systemInstructions) ||
      cogChanged ||
      skillsChanged;

    const [updated] = await this.db
      .update(questionPatterns)
      .set({
        title: input.title ?? existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        cognitiveLevel: targetCog,
        skills: input.skills !== undefined ? input.skills : existingSkills,
        systemInstructions: input.systemInstructions ?? existing.systemInstructions,
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
        version: willBumpVersion ? existing.version + 1 : existing.version,
        updatedAt: new Date(),
      })
      .where(eq(questionPatterns.id, id))
      .returning();

    return this.toDomainPattern(updated);
  }

  async softDelete(id: QuestionPatternId): Promise<boolean> {
    const res = await this.db
      .update(questionPatterns)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(questionPatterns.id, id), isNull(questionPatterns.deletedAt)))
      .returning({ id: questionPatterns.id });

    return res.length > 0;
  }

  async addExample(patternId: QuestionPatternId, input: CreateQuestionPatternExampleInput): Promise<QuestionPatternExampleRecord> {
    const [pattern] = await this.db
      .select()
      .from(questionPatterns)
      .where(and(eq(questionPatterns.id, patternId), isNull(questionPatterns.deletedAt)))
      .limit(1);

    if (!pattern) {
      throw new DomainError("not_found", "الگوی سؤال یافت نشد.");
    }

    const [ex] = await this.db
      .insert(questionPatternExamples)
      .values({
        questionPatternId: patternId,
        sourceQuizQuestionId: input.sourceQuizQuestionId ?? null,
        question: input.question,
        choices: input.choices,
        correctAnswer: input.correctAnswer,
        explanation: input.explanation ?? null,
        clinicalContext: input.clinicalContext ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    // Bump version on pattern
    await this.db
      .update(questionPatterns)
      .set({
        version: pattern.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(questionPatterns.id, patternId));

    return this.toDomainExample(ex);
  }

  async deleteExample(patternId: QuestionPatternId, exampleId: QuestionPatternExampleId): Promise<boolean> {
    const deleted = await this.db
      .delete(questionPatternExamples)
      .where(
        and(
          eq(questionPatternExamples.id, exampleId),
          eq(questionPatternExamples.questionPatternId, patternId),
        ),
      )
      .returning({ id: questionPatternExamples.id });

    if (deleted.length === 0) return false;

    // Bump version on pattern
    await this.db
      .update(questionPatterns)
      .set({
        version: sql`${questionPatterns.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(questionPatterns.id, patternId));

    return true;
  }

  async listExamples(patternId: QuestionPatternId): Promise<QuestionPatternExampleRecord[]> {
    const rows = await this.db
      .select()
      .from(questionPatternExamples)
      .where(eq(questionPatternExamples.questionPatternId, patternId))
      .orderBy(questionPatternExamples.sortOrder);

    return rows.map((r) => this.toDomainExample(r));
  }

  private toDomainPattern(p: QuestionPatternDbRecord): QuestionPatternRecord {
    const legacy = mapLegacyCognitiveLevelToSkill(p.cognitiveLevel);
    const rawSkills = Array.isArray(p.skills) ? (p.skills as string[]) : [];
    const skills = rawSkills.length > 0 ? rawSkills : legacy.skills;
    const cognitiveLevel = normalizeCognitiveLevel(p.cognitiveLevel || legacy.cognitiveLevel);

    return {
      id: asQuestionPatternId(p.id as UUID),
      title: p.title,
      description: p.description,
      cognitiveLevel,
      skills,
      systemInstructions: p.systemInstructions,
      isActive: p.isActive,
      version: p.version,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
      deletedAt: p.deletedAt instanceof Date ? p.deletedAt.toISOString() : p.deletedAt ? String(p.deletedAt) : null,
    };
  }

  private toDomainExample(e: QuestionPatternExampleDbRecord): QuestionPatternExampleRecord {
    return {
      id: asQuestionPatternExampleId(e.id as UUID),
      questionPatternId: asQuestionPatternId(e.questionPatternId as UUID),
      sourceQuizQuestionId: e.sourceQuizQuestionId,
      question: e.question,
      choices: (e.choices as string[]) || [],
      correctAnswer: e.correctAnswer,
      explanation: e.explanation,
      clinicalContext: e.clinicalContext,
      sortOrder: e.sortOrder,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    };
  }
}
