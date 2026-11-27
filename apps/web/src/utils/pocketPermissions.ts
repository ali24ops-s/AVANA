/**
 * AVANA Pocket — Clinical Permission Resolution Utility (Phase UI-2).
 *
 * Implements frontend permission evaluation directly mirroring real backend authorization invariants:
 * 1. canReview: User must be authenticated and strictly not a student (teachers, editors, workers, admins).
 * 2. canVerify: User MUST possess an active, unsuspended, unexpired ClinicalReviewerCredential.
 *    - platform_admin role alone DOES NOT grant clinical verification authority.
 *    - Credential license expiration date (licenseExpiresAt) must be strictly in the future.
 * 3. canPublish: User MUST hold the platform_admin role.
 * 4. canManageReviewers: User MUST hold the platform_admin role (grant, suspend, revoke credentials).
 * 5. Fail-Closed: If credential or user state is unknown/loading/error, sensitive permissions default to false.
 *
 * NOTE: Frontend permissions are strictly for UX flow control and defense-in-depth;
 * they NEVER replace runtime backend transactional authorization.
 */

import type { UserResource } from "@avana/contracts";
import type { ClinicalReviewerCredential, ReviewerMeData } from "../lib/api/pocket.js";

export interface PocketUserContext {
  id?: string;
  role?: string;
  globalRole?: string | null;
  teacherStatus?: "pending" | "approved" | "rejected" | null;
}

export interface PocketPermissions {
  /** True if user is authorized to submit assertions for peer review, record review decisions, or withdraw */
  canReview: boolean;
  /** True if user has an active, valid, unexpired clinical reviewer credential */
  canVerify: boolean;
  /** True if user has platform_admin privileges to publish verified assertions */
  canPublish: boolean;
  /** True if user has platform_admin privileges to grant, suspend, or revoke reviewer credentials */
  canManageReviewers: boolean;
  /** True if user has platform_admin privileges to activate or clear safety overrides */
  canManageSafetyOverrides: boolean;
  /** True if the user is a clinical reviewer with active credential */
  isClinicalReviewer: boolean;
  /** The validated active reviewer credential, or null */
  activeCredential: ClinicalReviewerCredential | null;
}

/**
 * Validates whether a reviewer credential record is currently active, unsuspended, and unexpired.
 */
export function isCredentialValid(
  credential?: ClinicalReviewerCredential | null,
  now: Date = new Date(),
): boolean {
  if (!credential) return false;
  if (!credential.isActive) return false;
  if (credential.revokedAt !== null && credential.revokedAt !== undefined) return false;
  if (credential.suspendedAt !== null && credential.suspendedAt !== undefined) return false;
  if (credential.lifecycleStatus && credential.lifecycleStatus !== "active") return false;

  const expiresAt = new Date(credential.licenseExpiresAt);
  if (isNaN(expiresAt.getTime()) || expiresAt <= now) {
    return false;
  }

  return true;
}

/**
 * Evaluates full Pocket permissions for the authenticated user and reviewer credential context.
 */
export function resolvePocketPermissions(
  user?: PocketUserContext | UserResource | null,
  reviewerData?: ReviewerMeData | null,
  now: Date = new Date(),
): PocketPermissions {
  // Fail-closed default for unauthenticated or missing identity
  if (!user || !user.id) {
    return {
      canReview: false,
      canVerify: false,
      canPublish: false,
      canManageReviewers: false,
      canManageSafetyOverrides: false,
      isClinicalReviewer: false,
      activeCredential: null,
    };
  }

  const userRecord = user as unknown as Record<string, unknown>;
  const role = typeof userRecord["role"] === "string" ? userRecord["role"] : undefined;
  const globalRole = typeof userRecord["globalRole"] === "string" ? userRecord["globalRole"] : undefined;
  const teacherStatus = userRecord["teacherStatus"];

  // 1. platform_admin check (mirrors Backend: actor.globalRole === "platform_admin" || actor.role === "platform_admin")
  const isPlatformAdmin =
    globalRole === "platform_admin" || role === "platform_admin";

  // 2. Student check (mirrors Backend AssertionReviewService: (role === "student" || !role) && !globalRole && !teacherStatus)
  const isStudent =
    (role === "student" || !role) &&
    !globalRole &&
    !teacherStatus;

  const canReview = !isStudent;

  // 3. Clinical Verifier check: MUST possess valid active credential. platform_admin alone CANNOT verify!
  const credential = reviewerData?.credential ?? null;
  const hasValidCredential = Boolean(
    reviewerData?.isReviewer && isCredentialValid(credential, now),
  );

  const canVerify = hasValidCredential;
  const isClinicalReviewer = hasValidCredential;

  // 4. Publishing, Reviewer Governance & Safety Overrides strictly restricted to platform_admin
  const canPublish = isPlatformAdmin;
  const canManageReviewers = isPlatformAdmin;
  const canManageSafetyOverrides = isPlatformAdmin;

  return {
    canReview,
    canVerify,
    canPublish,
    canManageReviewers,
    canManageSafetyOverrides,
    isClinicalReviewer,
    activeCredential: hasValidCredential ? credential : null,
  };
}
