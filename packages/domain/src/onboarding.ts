/**
 * Avana Onboarding Tour Domain Primitives.
 *
 * Defines status, payload, and response types for the dashboard
 * onboarding tour displayed to new users.
 */

import type { UserId } from "./ids.js";

export type OnboardingTourStatus = "unseen" | "skipped" | "completed";

export interface OnboardingTourRecord {
  id: string;
  userId: UserId;
  tourId: string;
  status: OnboardingTourStatus;
  step: number;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingTourStatusResponse {
  request_id?: string;
  eligible: boolean;
  status: OnboardingTourStatus;
  step?: number;
  completed_at?: string | null;
  dismissed_at?: string | null;
}

export interface OnboardingTourUpdateResponse {
  request_id?: string;
  success: boolean;
  status: OnboardingTourStatus;
  updated_at: string;
}
