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

  /** Associated registered device identifier, if any. */
  deviceId?: string | null;

  /** Reason the session was revoked (e.g. 'session_takeover', 'admin_reset', 'sign_out'). */
  revocationReason?: string | null;
};

/** Device categorization: strictly mobile or desktop. */
export type DeviceType = "mobile" | "desktop";

/** Registered user device domain model. */
export type UserDevice = {
  id: string;
  userId: UserId;
  deviceId: string;
  deviceType: DeviceType;
  deviceName: string | null;
  userAgent: string | null;
  lastIp: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Authentication attempt log record. */
export type AuthenticationAttempt = {
  id: string;
  userId: UserId | null;
  email: string;
  deviceType: DeviceType;
  deviceId: string | null;
  userAgent: string | null;
  ip: string | null;
  result: "SUCCESS" | "DEVICE_LIMIT_REACHED" | "SESSION_REVOKED" | "INVALID_CREDENTIALS" | string;
  details: string | null;
  createdAt: string;
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
