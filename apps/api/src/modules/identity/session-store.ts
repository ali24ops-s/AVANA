/**
 * Session store abstraction.
 *
 * Defined in the API layer so the SessionService does not depend
 * directly on the database package. A Drizzle-backed implementation
 * is provided, but could be replaced with Redis or another store
 * without changing business logic.
 */

import type { UserId } from "@avana/domain";

export interface SessionRecord {
  id: string;
  userId: UserId;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SessionStore {
  insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
  }): Promise<{ id: string }>;

  findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined>;

  updateLastUsed(id: string, lastUsedAt: string): Promise<void>;

  revoke(id: string, revokedAt: string): Promise<void>;

  revokeAllByUser(userId: UserId, revokedAt: string): Promise<void>;
}
