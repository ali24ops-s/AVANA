/**
 * Session management service.
 *
 * Handles session creation, validation, rotation, and revocation.
 * Uses SHA-256 hashing for session tokens so the raw token is never persisted.
 */

import { randomBytes, createHash } from "node:crypto";
import type { UserId } from "@avana/domain";
import type { SessionStore } from "./session-store.js";
import type { SessionConfig } from "../../config.js";
import type { AuthenticatedUser } from "../../http/types.js";

/** Generate a cryptographically random session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a session token using SHA-256. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly config: SessionConfig,
  ) {}

  /** Create a new session for the given user. Returns the raw token + session ID. */
  async createSession(
    userId: UserId,
  ): Promise<{ sessionToken: string; sessionId: string }> {
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.config.maxAgeMs).toISOString();

    const { id } = await this.store.insert({
      userId,
      tokenHash,
      expiresAt,
    });

    return { sessionToken, sessionId: id };
  }

  /** Validate a session token and return the authenticated user. */
  async validateSession(
    sessionToken: string,
  ): Promise<AuthenticatedUser | undefined> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.store.findByTokenHash(tokenHash);

    if (!session) return undefined;
    if (session.revokedAt) return undefined;

    const now = Date.now();
    const expiresAt = new Date(session.expiresAt).getTime();
    if (expiresAt <= now) return undefined;

    // Update lastUsedAt asynchronously (non-blocking)
    await this.store.updateLastUsed(session.id, new Date().toISOString());

    return {
      userId: session.userId,
      email: "", // email is resolved from user store in production
    };
  }

  /** Revoke a session (sign out). */
  async revokeSession(sessionToken: string): Promise<void> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.store.findByTokenHash(tokenHash);
    if (session) {
      await this.store.revoke(session.id, new Date().toISOString());
    }
  }

  /** Revoke all sessions for a user. */
  async revokeAllUserSessions(userId: UserId): Promise<void> {
    await this.store.revokeAllByUser(userId, new Date().toISOString());
  }

  /** Return the session config for cookie settings. */
  getConfig(): SessionConfig {
    return this.config;
  }
}
