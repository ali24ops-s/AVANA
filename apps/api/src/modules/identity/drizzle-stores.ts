/**
 * Drizzle-backed implementations of SessionStore and UserStore.
 *
 * These implement the store interfaces defined in session-store.ts and
 * user-store.ts. They are wired at the production composition root
 * (composeProduction.ts) and are NOT imported by services directly.
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import { users, sessions, emailVerificationCodes, auditLogs, organizationMemberships } from "@avana/database/schema";
import type { SessionRecord, SessionStore } from "./session-store.js";
import type { UserRecord, UserStore } from "./user-store.js";
import type {
  EmailVerificationCodeRecord,
  EmailVerificationStore,
} from "./email-verification-store.js";
import { resolveEffectiveRole, type Role, type UserId, type VerifiedIdentity } from "@avana/domain";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a database session row to the SessionRecord domain shape.
 * Converts Date objects to ISO strings for consistency with in-memory stores.
 */
function toSessionRecord(row: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}): SessionRecord {
  return {
    id: row.id,
    userId: row.userId as UserId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Map a database user row to the UserRecord domain shape with resolved effective role.
 */
function toUserRecord(
  row: {
    id: string;
    email: string;
    name: string;
    globalRole?: string | null;
    emailVerifiedAt?: Date | null;
  },
  effectiveRole: Role = "student",
): UserRecord {
  return {
    id: row.id as UserId,
    email: row.email,
    name: row.name,
    role: effectiveRole,
    globalRole: row.globalRole ?? null,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    emailVerified: row.emailVerifiedAt != null,
  };
}

// ---------------------------------------------------------------------------
// DrizzleSessionStore
// ---------------------------------------------------------------------------

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: DbClient) {}

  async insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: values.userId,
        tokenHash: values.tokenHash,
        expiresAt: new Date(values.expiresAt),
      })
      .returning({ id: sessions.id });

    return { id: row.id };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    const row = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toSessionRecord(row);
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastUsedAt: new Date(lastUsedAt) })
      .where(eq(sessions.id, id));
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(revokedAt) })
      .where(eq(sessions.id, id));
  }

  async revokeAllByUser(userId: UserId, revokedAt: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(revokedAt) })
      .where(eq(sessions.userId, userId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleUserStore
// ---------------------------------------------------------------------------

export class DrizzleUserStore implements UserStore {
  constructor(private readonly db: DbClient) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.email, normalizedEmail));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(roles);
    return toUserRecord(userRow, effectiveRole);
  }

  async findWithPasswordByEmail(
    email: string,
  ): Promise<(UserRecord & { passwordHash?: string | null }) | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.email, normalizedEmail));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(userRow.globalRole, roles);
    return {
      ...toUserRecord(userRow, effectiveRole),
      passwordHash: userRow.passwordHash ?? null,
    };
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.id, id));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(userRow.globalRole, roles);
    return toUserRecord(userRow, effectiveRole);
  }

  async createFromVerifiedIdentity(
    identity: VerifiedIdentity,
  ): Promise<UserRecord> {
    const normalizedEmail = identity.email.trim().toLowerCase();
    const [row] = await this.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalizedEmail,
        name: identity.name,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        globalRole: users.globalRole,
        emailVerifiedAt: users.emailVerifiedAt,
      });

    return toUserRecord(row);
  }

  async createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
    globalRole?: string | null;
  }): Promise<UserRecord> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const [row] = await this.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalizedEmail,
        passwordHash: params.passwordHash,
        name: params.name ?? normalizedEmail.split("@")[0],
        globalRole: params.globalRole ?? null,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        globalRole: users.globalRole,
        emailVerifiedAt: users.emailVerifiedAt,
      });

    const effectiveRole = resolveEffectiveRole(row.globalRole, []);
    return toUserRecord(row, effectiveRole);
  }

  async setEmailVerified(userId: UserId): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: UserId): Promise<void> {
    await this.db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await this.db.delete(users).where(eq(users.id, userId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleEmailVerificationStore
// ---------------------------------------------------------------------------

export class DrizzleEmailVerificationStore implements EmailVerificationStore {
  constructor(private readonly db: DbClient) {}

  async createCode(values: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationCodeRecord> {
    const [row] = await this.db
      .insert(emailVerificationCodes)
      .values({
        userId: values.userId,
        codeHash: values.codeHash,
        expiresAt: new Date(values.expiresAt),
      })
      .returning();

    return {
      id: row.id,
      userId: row.userId as UserId,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt.toISOString(),
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
    };
  }

  async findLatestActiveCode(
    userId: UserId,
  ): Promise<EmailVerificationCodeRecord | undefined> {
    const row = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId as UserId,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt.toISOString(),
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
    };
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
      .where(eq(emailVerificationCodes.id, id));
  }

  async markAsUsed(id: string): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationCodes.id, id));
  }

  async invalidateAllForUser(userId: UserId): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailVerificationCodes.userId, userId),
          sql`${emailVerificationCodes.usedAt} IS NULL`,
        ),
      );
  }
}

