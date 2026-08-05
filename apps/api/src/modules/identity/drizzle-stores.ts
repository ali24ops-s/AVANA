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

import { eq } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import { users, sessions } from "@avana/database/schema";
import type { SessionRecord, SessionStore } from "./session-store.js";
import type { UserRecord, UserStore } from "./user-store.js";
import type { UserId, VerifiedIdentity } from "@avana/domain";
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
 * Map a database user row to the UserRecord domain shape.
 */
function toUserRecord(row: {
  id: string;
  email: string;
  name: string;
}): UserRecord {
  return {
    id: row.id as UserId,
    email: row.email,
    role: "student", // Default role; role column not yet in schema
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
    const row = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toUserRecord(row);
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const row = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toUserRecord(row);
  }

  async createFromVerifiedIdentity(
    identity: VerifiedIdentity,
  ): Promise<UserRecord> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: identity.email,
        name: identity.name,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    return toUserRecord(row);
  }
}
