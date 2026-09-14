/**
 * Centralized feature flags configuration for AVANA Web.
 *
 * All feature toggles are defined here with safe defaults.
 * Variables can be overridden via Vite environment variables (prefixed with VITE_).
 */

/**
 * Feature: Files & Resource Management (/files)
 *
 * Controls user-facing visibility and direct routing for the Files section.
 * - Default: false (temporarily disabled for users)
 * - Can be re-enabled by setting VITE_FEATURE_FILES=true in the environment.
 */
export const FILES_ENABLED: boolean =
  import.meta.env.VITE_FEATURE_FILES === "true";

/**
 * Feature: User Content Generation
 *
 * Controls user-facing content generation flow for regular users.
 * - Default: false (temporarily in "Coming Soon" / به‌زودی state for regular users)
 * - Can be re-enabled by setting VITE_FEATURE_CONTENT_GENERATION=true in the environment.
 * - Administrative and content manager roles always retain access.
 */
export const CONTENT_GENERATION_ENABLED: boolean =
  import.meta.env.VITE_FEATURE_CONTENT_GENERATION === "true";

/**
 * Feature: Local Worker Mode
 *
 * Controls visibility of the local worker quick login button.
 * - Default: false (hidden in production and standard environments)
 * - Enabled strictly when VITE_WORKER_MODE=true is provided.
 */
export const WORKER_MODE_ENABLED: boolean =
  import.meta.env.VITE_WORKER_MODE === "true";

