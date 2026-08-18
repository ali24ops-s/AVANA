/**
 * In-memory implementations of SessionStore and UserStore for testing.
 */

import type { UserId } from "@avana/domain";
import type { SessionRecord, SessionStore } from "../session-store.js";
import type { UserRecord, UserStore } from "../user-store.js";
import { randomUUID } from "node:crypto";

import type {
  EmailVerificationCodeRecord,
  EmailVerificationStore,
} from "../email-verification-store.js";

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
  private users: Map<string, UserRecord & { passwordHash?: string | null }> = new Map();

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) {
        const { passwordHash: _, ...rest } = user;
        return rest;
      }
    }
    return undefined;
  }

  async findWithPasswordByEmail(
    email: string,
  ): Promise<(UserRecord & { passwordHash?: string | null }) | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) return { ...user };
    }
    return undefined;
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async createFromVerifiedIdentity(identity: {
    email: string;
    name: string;
    provider: string;
    providerSubject: string;
  }): Promise<UserRecord> {
    const id = randomUUID() as UserId;
    const normEmail = identity.email.trim().toLowerCase();
    const record: UserRecord = {
      id,
      email: normEmail,
      role: "student",
      emailVerifiedAt: new Date().toISOString(),
      emailVerified: true,
    };
    this.users.set(id, record);
    return record;
  }

  async createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
  }): Promise<UserRecord> {
    const id = randomUUID() as UserId;
    const normEmail = params.email.trim().toLowerCase();
    const userWithHash = {
      id,
      email: normEmail,
      name: params.name,
      role: "student",
      passwordHash: params.passwordHash,
      emailVerifiedAt: null,
      emailVerified: false,
    };
    this.users.set(id, userWithHash);
    return {
      id,
      email: normEmail,
      name: params.name,
      role: "student",
      emailVerifiedAt: null,
      emailVerified: false,
    };
  }

  async setEmailVerified(userId: UserId): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const iso = new Date().toISOString();
      user.emailVerifiedAt = iso;
      user.emailVerified = true;
    }
  }

  async deleteUser(userId: UserId): Promise<void> {
    this.users.delete(userId);
  }

  /** Directly insert a user record (used for seeding editor/admin roles in tests). */
  insert(record: UserRecord & { passwordHash?: string | null }): void {
    const emailVerified = record.emailVerified ?? (record.emailVerifiedAt != null);
    this.users.set(record.id, { ...record, emailVerified });
  }
}

export class InMemoryEmailVerificationStore implements EmailVerificationStore {
  private codes: Map<string, EmailVerificationCodeRecord> = new Map();

  async createCode(values: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationCodeRecord> {
    const id = randomUUID();
    const record: EmailVerificationCodeRecord = {
      id,
      userId: values.userId,
      codeHash: values.codeHash,
      expiresAt: values.expiresAt,
      attempts: 0,
      createdAt: new Date().toISOString(),
      usedAt: null,
    };
    this.codes.set(id, record);
    return record;
  }

  async findLatestActiveCode(
    userId: UserId,
  ): Promise<EmailVerificationCodeRecord | undefined> {
    const userCodes = Array.from(this.codes.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return userCodes[0];
  }

  async incrementAttempts(id: string): Promise<void> {
    const code = this.codes.get(id);
    if (code) {
      code.attempts += 1;
    }
  }

  async markAsUsed(id: string): Promise<void> {
    const code = this.codes.get(id);
    if (code) {
      code.usedAt = new Date().toISOString();
    }
  }

  async invalidateAllForUser(userId: UserId): Promise<void> {
    const now = new Date().toISOString();
    for (const code of this.codes.values()) {
      if (code.userId === userId && !code.usedAt) {
        code.usedAt = now;
      }
    }
  }
}

