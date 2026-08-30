/**
 * In-memory implementations of SessionStore and UserStore for testing.
 */

import { resolveEffectiveRole, type UserId } from "@avana/domain";
import type { SessionRecord, SessionStore } from "../session-store.js";
import type { UserRecord, UserStore } from "../user-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
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
  private organizationStore?: OrganizationStore;

  constructor(organizationStore?: OrganizationStore) {
    this.organizationStore = organizationStore;
  }

  setOrganizationStore(orgStore: OrganizationStore): void {
    this.organizationStore = orgStore;
  }

  private async resolveRole(userId: UserId, fallbackRole: string): Promise<string> {
    if (this.organizationStore) {
      const memberships = await this.organizationStore.listMembershipsByUserId(userId);
      if (memberships.length > 0) {
        const roles = memberships.map((m) => m.role);
        return resolveEffectiveRole([...roles as any[], fallbackRole]);
      }
    }
    return fallbackRole;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) {
        const { passwordHash: _, ...rest } = user;
        const role = await this.resolveRole(user.id, rest.role);
        return { ...rest, role };
      }
    }
    return undefined;
  }

  async findWithPasswordByEmail(
    email: string,
  ): Promise<(UserRecord & { passwordHash?: string | null }) | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) {
        const role = await this.resolveRole(user.id, user.role);
        return { ...user, role };
      }
    }
    return undefined;
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const { passwordHash: _, ...rest } = user;
    const role = await this.resolveRole(user.id, rest.role);
    return { ...rest, role };
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
      name: identity.name,
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

