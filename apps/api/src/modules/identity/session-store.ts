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
  deviceId?: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason?: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SessionStore {
  insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
  }): Promise<{ id: string }>;

  /**
   * Atomically revoke all currently active sessions for the user with the specified reason,
   * and create a new active session. Guarantees single active session per user.
   */
  createSessionWithTakeover(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
    revocationReason?: string;
  }): Promise<{ id: string; revokedCount: number }>;

  findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined>;

  updateLastUsed(id: string, lastUsedAt: string): Promise<void>;

  revoke(id: string, revokedAt: string, reason?: string): Promise<void>;

  revokeAllByUser(userId: UserId, revokedAt: string, reason?: string): Promise<void>;
}
