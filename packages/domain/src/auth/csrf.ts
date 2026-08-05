/**
 * Framework-independent CSRF domain types.
 *
 * Per the Technical Blueprint, AVANA uses CSRF protection for mutations.
 * This module defines the double-submit cookie pattern configuration.
 */

/**
 * CSRF protection configuration.
 */
export type CsrfConfig = {
  /** Cookie name for the CSRF token. */
  cookieName: string;

  /** Header name for the CSRF token. */
  headerName: string;

  /** CSRF token expiry in milliseconds. */
  tokenExpiryMs: number;

  /** Whether the CSRF cookie should have the Secure flag. */
  secure: boolean;

  /** SameSite policy for the CSRF cookie. */
  sameSite: "lax" | "strict" | "none";

  /** Cookie path. */
  path: string;
};

/**
 * Default CSRF configuration for local development.
 */
export const DEFAULT_CSRF_CONFIG: CsrfConfig = {
  cookieName: "avana_csrf",
  headerName: "x-csrf-token",
  tokenExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  secure: false, // disabled for local dev; enabled in production
  sameSite: "strict",
  path: "/",
};

/**
 * Production CSRF configuration.
 */
export const PRODUCTION_CSRF_CONFIG: CsrfConfig = {
  cookieName: "avana_csrf",
  headerName: "x-csrf-token",
  tokenExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: "strict",
  path: "/",
};
