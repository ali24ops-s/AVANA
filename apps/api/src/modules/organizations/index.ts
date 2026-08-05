/**
 * Organizations module — Public API.
 *
 * Exports the organization routes plugin and store types for use by
 * the application composition root.
 */

export { organizationRoutes } from "./organization-routes.js";
export type { OrganizationRouteOptions } from "./organization-routes.js";
export type {
  OrganizationRecord,
  MembershipRecord,
  OrganizationStore,
} from "./organization-store.js";
export { OrganizationService } from "./organization-service.js";
