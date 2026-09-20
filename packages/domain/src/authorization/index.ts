/**
 * Authorization domain module — Sprint 1 PR-8.
 *
 * Exports framework-independent authorization primitives:
 * - AuthorizationPolicy interface and RoleBasedPolicy implementation
 * - Actor and AuthContext types
 * - Audit event helpers for organization and membership mutations
 */

export type {
  AuthorizationPolicy,
  AuthAction,
  Actor,
  AuthContext,
} from "./policy.js";

export { RoleBasedPolicy, defaultPolicy } from "./policy.js";

export * from "./audit.js";
