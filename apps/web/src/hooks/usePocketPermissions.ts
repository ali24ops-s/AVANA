/**
 * AVANA Pocket — Clinical Permission Integration Hook (Phase UI-2).
 *
 * Integrates useAuth() and usePocketReviewer() with resolvePocketPermissions():
 * - Derives authoritative clinical reviewer, verification, review, and publishing capabilities.
 * - Enforces fail-closed security: while reviewer status is loading or unauthenticated, canVerify is false.
 * - platform_admin alone CANNOT verify assertions unless holding an active, unexpired clinical credential.
 */

import { useMemo } from "react";
import { useAuth } from "../providers/AuthProvider.js";
import { usePocketReviewer } from "./usePocketReviewer.js";
import {
  resolvePocketPermissions,
  type PocketPermissions,
} from "../utils/pocketPermissions.js";

export interface UsePocketPermissionsResult extends PocketPermissions {
  /** True while the user's reviewer credential check is in-flight */
  isLoading: boolean;
}

export function usePocketPermissions(): UsePocketPermissionsResult {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { data: reviewerData, isLoading: isReviewerLoading } = usePocketReviewer();

  const isLoading = isAuthLoading || isReviewerLoading;

  const permissions = useMemo(() => {
    // If auth or reviewer query is loading, resolve permissions with null reviewer context (fail-closed)
    return resolvePocketPermissions(user, isLoading ? null : reviewerData);
  }, [user, reviewerData, isLoading]);

  return {
    ...permissions,
    isLoading,
  };
}
