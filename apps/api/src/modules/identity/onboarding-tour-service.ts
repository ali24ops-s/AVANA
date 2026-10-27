/**
 * OnboardingTourService — Business logic for dashboard onboarding tour.
 *
 * Coordinates:
 * 1. Eligibility evaluation (isolated to genuine new registrations)
 * 2. Cutoff date enforcement (users created prior to activation are legacy and excluded)
 * 3. Status tracking across devices via backend store
 */

import type {
  UserId,
  OnboardingTourStatusResponse,
  OnboardingTourUpdateResponse,
} from "@avana/domain";
import type { OnboardingTourStore } from "./onboarding-tour-store.js";
import type { UserStore } from "./user-store.js";

export interface OnboardingTourServiceOptions {
  store: OnboardingTourStore;
  userStore: UserStore;
  /** ISO timestamp cutoff: Users created before this timestamp are legacy and excluded */
  featureActivationTimestamp?: string;
}

export class OnboardingTourService {
  private readonly store: OnboardingTourStore;
  private readonly userStore: UserStore;
  private readonly featureCutoffMs: number;

  constructor(opts: OnboardingTourServiceOptions) {
    this.store = opts.store;
    this.userStore = opts.userStore;
    // Default cutoff timestamp: 2026-10-25T00:00:00.000Z
    this.featureCutoffMs = opts.featureActivationTimestamp
      ? new Date(opts.featureActivationTimestamp).getTime()
      : new Date("2026-10-25T00:00:00.000Z").getTime();
  }

  /**
   * Retrieves the current user's onboarding tour status and eligibility.
   */
  async getStatus(userId: UserId): Promise<OnboardingTourStatusResponse> {
    const existing = await this.store.findByUserId(userId);
    if (existing) {
      return {
        eligible: existing.status === "unseen",
        status: existing.status,
        step: existing.step,
        completed_at: existing.completedAt,
        dismissed_at: existing.dismissedAt,
      };
    }

    // Check user registration creation time
    const user = await this.userStore.findById(userId);
    if (!user) {
      return {
        eligible: false,
        status: "completed",
      };
    }

    const typedUser = user as { createdAt?: string | Date };
    const userCreatedAt = typedUser.createdAt
      ? new Date(typedUser.createdAt).getTime()
      : null;

    // Legacy users with createdAt before cutoff are strictly excluded from the tour
    if (
      userCreatedAt === null ||
      isNaN(userCreatedAt) ||
      userCreatedAt < this.featureCutoffMs
    ) {
      return {
        eligible: false,
        status: "completed",
      };
    }

    // Newly registered user who has not interacted with the tour yet
    return {
      eligible: true,
      status: "unseen",
      step: 1,
    };
  }

  /**
   * Updates the onboarding tour status ('skipped' or 'completed').
   */
  async updateStatus(
    userId: UserId,
    action: "skip" | "complete",
    step: number = 1,
  ): Promise<OnboardingTourUpdateResponse> {
    const targetStatus = action === "skip" ? "skipped" : "completed";
    const updated = await this.store.upsertStatus(userId, targetStatus, step);

    return {
      success: true,
      status: updated.status,
      updated_at: updated.updatedAt,
    };
  }
}
