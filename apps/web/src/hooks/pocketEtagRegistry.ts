/**
 * AVANA Pocket — ETag Registry & Cache Lifecycle Management.
 *
 * Tracks authoritative ETags for clinical aggregate consumption.
 * Isolated in a standalone module to prevent circular dependencies
 * with AuthProvider and other consumption hooks.
 */

export const consumptionEtagRegistry = new Map<string, string>();
export const versionEtagRegistry = new Map<string, string>();

/**
 * Resets all recorded ETags.
 * Called automatically during user logout, account switching,
 * or cache purge to prevent stale cross-user ETag reuse.
 */
export function resetPocketEtagRegistry(): void {
  consumptionEtagRegistry.clear();
  versionEtagRegistry.clear();
}
