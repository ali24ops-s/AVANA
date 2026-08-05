/**
 * Auth domain module — Sprint 1 PR-7.
 *
 * Exports framework-independent authentication and session primitives.
 */

export type {
  VerifiedIdentity,
  AuthenticationCredentials,
  IdentityAdapter,
} from "./identity-adapter.js";

export type { Session, SessionToken, SessionConfig } from "./session.js";

export {
  DEFAULT_SESSION_CONFIG,
  PRODUCTION_SESSION_CONFIG,
} from "./session.js";

export type { CsrfConfig } from "./csrf.js";

export { DEFAULT_CSRF_CONFIG, PRODUCTION_CSRF_CONFIG } from "./csrf.js";
