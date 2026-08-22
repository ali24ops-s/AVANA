/**
 * AI Study Assistant Conversation Store.
 *
 * Provides persistence abstractions for multi-turn assistant conversations
 * and message history. Includes both production Drizzle implementation
 * and in-memory test/dev implementation.
 */

import { randomUUID } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  studyConversations,
  studyConversationMessages,
} from "@avana/database/schema";

export interface AssistantConversation {
  id: string;
  userId: string;
  organizationId?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  } | null;
  createdAt: Date;
}

export interface CreateConversationInput {
  organizationId?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  title?: string | null;
}

export interface AddMessageInput {
  role: "user" | "assistant" | "system";
  content: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
  } | null;
}

export interface AssistantConversationStore {
  getConversation(
    conversationId: string,
    userId: string,
  ): Promise<AssistantConversation | null>;
  createConversation(
    userId: string,
    input?: CreateConversationInput,
  ): Promise<AssistantConversation>;
  addMessage(
    conversationId: string,
    input: AddMessageInput,
  ): Promise<AssistantMessage>;
  getRecentMessages(
    conversationId: string,
    limit?: number,
  ): Promise<AssistantMessage[]>;
  deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-Memory Implementation (for testing & mock dev environments)
// ---------------------------------------------------------------------------

export class InMemoryAssistantConversationStore
  implements AssistantConversationStore
{
  private conversations: Map<string, AssistantConversation> = new Map();
  private messages: Map<string, AssistantMessage[]> = new Map();

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<AssistantConversation | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      return null;
    }
    return { ...conv };
  }

  async createConversation(
    userId: string,
    input?: CreateConversationInput,
  ): Promise<AssistantConversation> {
    const now = new Date();
    const id = randomUUID();
    const conv: AssistantConversation = {
      id,
      userId,
      organizationId: input?.organizationId ?? null,
      courseId: input?.courseId ?? null,
      lessonId: input?.lessonId ?? null,
      title: input?.title ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conv);
    this.messages.set(id, []);
    return { ...conv };
  }

  async addMessage(
    conversationId: string,
    input: AddMessageInput,
  ): Promise<AssistantMessage> {
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    const now = new Date();
    const message: AssistantMessage = {
      id: randomUUID(),
      conversationId,
      role: input.role,
      content: input.content,
      tokenUsage: input.tokenUsage ?? null,
      createdAt: now,
    };

    const list = this.messages.get(conversationId) ?? [];
    list.push(message);
    this.messages.set(conversationId, list);

    conv.updatedAt = now;
    return { ...message };
  }

  async getRecentMessages(
    conversationId: string,
    limit: number = 10,
  ): Promise<AssistantMessage[]> {
    const list = this.messages.get(conversationId) ?? [];
    return list.slice(-limit).map((m) => ({ ...m }));
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.userId !== userId) {
      return false;
    }
    this.conversations.delete(conversationId);
    this.messages.delete(conversationId);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Drizzle Postgres Implementation (Production)
// ---------------------------------------------------------------------------

export class DrizzleAssistantConversationStore
  implements AssistantConversationStore
{
  constructor(private readonly db: DbClient) {}

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<AssistantConversation | null> {
    const rows = await this.db
      .select()
      .from(studyConversations)
      .where(
        and(
          eq(studyConversations.id, conversationId),
          eq(studyConversations.userId, userId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      courseId: row.courseId,
      lessonId: row.lessonId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async createConversation(
    userId: string,
    input?: CreateConversationInput,
  ): Promise<AssistantConversation> {
    const now = new Date();
    const id = randomUUID();

    const [inserted] = await this.db
      .insert(studyConversations)
      .values({
        id,
        userId,
        organizationId: input?.organizationId || null,
        courseId: input?.courseId || null,
        lessonId: input?.lessonId || null,
        title: input?.title || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return {
      id: inserted.id,
      userId: inserted.userId,
      organizationId: inserted.organizationId,
      courseId: inserted.courseId,
      lessonId: inserted.lessonId,
      title: inserted.title,
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    };
  }

  async addMessage(
    conversationId: string,
    input: AddMessageInput,
  ): Promise<AssistantMessage> {
    const now = new Date();
    const id = randomUUID();

    const [inserted] = await this.db
      .insert(studyConversationMessages)
      .values({
        id,
        conversationId,
        role: input.role,
        content: input.content,
        tokenUsage: input.tokenUsage ?? null,
        createdAt: now,
      })
      .returning();

    // Update conversation updatedAt
    await this.db
      .update(studyConversations)
      .set({ updatedAt: now })
      .where(eq(studyConversations.id, conversationId));

    return {
      id: inserted.id,
      conversationId: inserted.conversationId,
      role: inserted.role as AssistantMessage["role"],
      content: inserted.content,
      tokenUsage: inserted.tokenUsage as AssistantMessage["tokenUsage"],
      createdAt: inserted.createdAt,
    };
  }

  async getRecentMessages(
    conversationId: string,
    limit: number = 10,
  ): Promise<AssistantMessage[]> {
    const rows = await this.db
      .select()
      .from(studyConversationMessages)
      .where(eq(studyConversationMessages.conversationId, conversationId))
      .orderBy(desc(studyConversationMessages.createdAt))
      .limit(limit);

    // Order chronologically (oldest to newest)
    rows.reverse();

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      role: row.role as AssistantMessage["role"],
      content: row.content,
      tokenUsage: row.tokenUsage as AssistantMessage["tokenUsage"],
      createdAt: row.createdAt,
    }));
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const existing = await this.getConversation(conversationId, userId);
    if (!existing) {
      return false;
    }

    await this.db
      .delete(studyConversations)
      .where(
        and(
          eq(studyConversations.id, conversationId),
          eq(studyConversations.userId, userId),
        ),
      );

    return true;
  }
}
