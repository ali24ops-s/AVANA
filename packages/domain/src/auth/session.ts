/**
 * Framework-independent session domain types.
 *
 * Defines the session boundary that AVANA owns per ADR 0002.
 * Browser session state is server-controlled and auditable.
 */

import type { UtcIsoDateTimeString } from "../time.js";
import type { UserId } from "../ids.js";

/**
 * Session token string.
 * This is the opaque value stored in the HttpOnly cookie.
 */
export type SessionToken = string;

/**
 * Session domain model.
 * Represents an authenticated browser session.
 */
export type Session = {
  /** Unique session identifier (internal). */
  id: string;

  /** The user this session belongs to. */
  userId: UserId;

  /** Hashed session token stored in the database. */
  tokenHash: string;

  /** When the session was created. */
  createdAt: UtcIsoDateTimeString;

  /** When the session expires. */
  expiresAt: UtcIsoDateTimeString;

  /** When the session was last used. */
  lastUsedAt: UtcIsoDateTimeString;

  /** When the session was revoked, if applicable. */
  revokedAt: UtcIsoDateTimeString | null;
};

/**
 * Session configuration.
 */
export type SessionConfig = {
  /** Cookie name for the session token. */
  cookieName: string;

  /** Session TTL in milliseconds. */
  maxAgeMs: number;

  /** Whether the cookie should have the Secure flag. */
  secure: boolean;

  /** SameSite policy. */
  sameSite: "lax" | "strict" | "none";

  /** Cookie path. */
  path: string;
};

/**
 * Default session configuration for local development.
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  cookieName: "avana_session",
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: false, // disabled for local dev; enabled in production
  sameSite: "lax",
  path: "/",
};

/**
 * Production session configuration.
 */
export const PRODUCTION_SESSION_CONFIG: SessionConfig = {
  cookieName: "avana_session",
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: true,
  sameSite: "lax",
  path: "/",
};
