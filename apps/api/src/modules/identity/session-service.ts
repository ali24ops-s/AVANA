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

export interface SessionValidationResult {
  valid: boolean;
  user?: AuthenticatedUser;
  revoked?: boolean;
  revocationReason?: string | null;
  session?: import("./session-store.js").SessionRecord;
}

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly config: SessionConfig,
  ) {}

  /** Create a new session for the given user. Returns the raw token + session ID. */
  async createSession(
    userId: UserId,
    deviceId?: string | null,
  ): Promise<{ sessionToken: string; sessionId: string }> {
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.config.maxAgeMs).toISOString();

    const { id } = await this.store.insert({
      userId,
      tokenHash,
      expiresAt,
      deviceId,
    });

    return { sessionToken, sessionId: id };
  }

  /**
   * Atomically revoke all active sessions for the user and create a new active session.
   * Enforces single active session per user.
   */
  async createSessionWithTakeover(
    userId: UserId,
    deviceId?: string | null,
    reason = "session_takeover",
  ): Promise<{ sessionToken: string; sessionId: string; revokedCount: number }> {
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.config.maxAgeMs).toISOString();

    const { id, revokedCount } = await this.store.createSessionWithTakeover({
      userId,
      tokenHash,
      expiresAt,
      deviceId,
      revocationReason: reason,
    });

    return { sessionToken, sessionId: id, revokedCount };
  }

  /**
   * Detailed session validation including revocation detection.
   */
  async validateSessionDetails(
    sessionToken: string,
  ): Promise<SessionValidationResult> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.store.findByTokenHash(tokenHash);

    if (!session) {
      return { valid: false, revoked: false };
    }

    if (session.revokedAt) {
      return {
        valid: false,
        revoked: true,
        revocationReason: session.revocationReason ?? "session_takeover",
        session,
      };
    }

    const now = Date.now();
    const expiresAt = new Date(session.expiresAt).getTime();
    if (expiresAt <= now) {
      return { valid: false, revoked: false, session };
    }

    // Update lastUsedAt asynchronously (non-blocking)
    void this.store.updateLastUsed(session.id, new Date().toISOString());

    return {
      valid: true,
      user: {
        userId: session.userId,
        email: "",
      },
      session,
    };
  }

  /** Validate a session token and return the authenticated user (backward-compatible). */
  async validateSession(
    sessionToken: string,
  ): Promise<AuthenticatedUser | undefined> {
    const details = await this.validateSessionDetails(sessionToken);
    return details.valid ? details.user : undefined;
  }

  /** Revoke a session (sign out). */
  async revokeSession(
    sessionToken: string,
    reason = "sign_out",
  ): Promise<void> {
    const tokenHash = hashToken(sessionToken);
    const session = await this.store.findByTokenHash(tokenHash);
    if (session) {
      await this.store.revoke(session.id, new Date().toISOString(), reason);
    }
  }

  /** Revoke all sessions for a user. */
  async revokeAllUserSessions(
    userId: UserId,
    reason = "admin_reset",
  ): Promise<void> {
    await this.store.revokeAllByUser(userId, new Date().toISOString(), reason);
  }

  /** Return the session config for cookie settings. */
  getConfig(): SessionConfig {
    return this.config;
  }

  getStore(): SessionStore {
    return this.store;
  }
}
