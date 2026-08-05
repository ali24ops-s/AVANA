/**
 * Courses module — Public API.
 *
 * Exports the course routes plugin and store types for use by
 * the application composition root.
 */

export { courseRoutes } from "./course-routes.js";
export type { CourseRouteOptions } from "./course-routes.js";
export type { CourseRecord, CourseStore } from "./course-store.js";
export { CourseService } from "./course-service.js";
