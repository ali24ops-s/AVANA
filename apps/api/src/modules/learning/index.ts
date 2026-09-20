/**
 * Learning module — Public API.
 *
 * Exports the learning routes plugin and store types for use by
 * the application composition root.
 */

export { learningRoutes } from "./learning-routes.js";
export type { LearningRouteOptions } from "./learning-routes.js";
export type {
  ModuleRecord,
  LessonRecord,
  LessonProgressRecord,
  SubCourseGroupRecord,
  ModuleStore,
  LessonStore,
  ProgressStore,
  SubCourseGroupStore,
} from "./learning-store.js";
export { LearningService } from "./learning-service.js";
export type {
  CourseLearnResponse,
  LessonProgressResponse,
  CourseProgressResponse,
} from "./learning-service.js";
