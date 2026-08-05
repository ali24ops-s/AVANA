/**
 * In-memory implementations of SessionStore and UserStore for testing.
 */

import type { UserId } from "@avana/domain";
import type { SessionRecord, SessionStore } from "../session-store.js";
import type { UserRecord, UserStore } from "../user-store.js";
import { randomUUID } from "node:crypto";

export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionRecord> = new Map();

  async insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.sessions.set(id, {
      id,
      userId: values.userId,
      tokenHash: values.tokenHash,
      expiresAt: values.expiresAt,
      revokedAt: null,
      lastUsedAt: now,
      createdAt: now,
    });
    return { id };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.lastUsedAt = lastUsedAt;
    }
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = revokedAt;
    }
  }

  async revokeAllByUser(userId: UserId, revokedAt: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.revokedAt = revokedAt;
      }
    }
  }

  setExpiresAt(id: string, expiresAt: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.expiresAt = expiresAt;
    }
  }
}

export class InMemoryUserStore implements UserStore {
  private users: Map<string, UserRecord> = new Map();

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return undefined;
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    return this.users.get(id);
  }

  async createFromVerifiedIdentity(identity: {
    email: string;
    name: string;
    provider: string;
    providerSubject: string;
  }): Promise<UserRecord> {
    const id = randomUUID() as UserId;
    const record: UserRecord = {
      id,
      email: identity.email,
      role: "student",
    };
    this.users.set(id, record);
    return record;
  }
}
