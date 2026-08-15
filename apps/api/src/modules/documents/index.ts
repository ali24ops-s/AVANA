/**
 * Documents module — Public API.
 *
 * Exposes the DocumentService, the DocumentProcessingService, and the route
 * plugin for the upload + extraction pipeline.
 */

export { DocumentService } from "./document-service.js";
export type {
  DocumentResource,
  UploadIntentResponse,
} from "./document-service.js";
export { DocumentProcessingService } from "./document-processing-service.js";
export type { DocumentExtractionStatus } from "./document-processing-service.js";
export { documentRoutes } from "./document-routes.js";
export type { DocumentRouteOptions } from "./document-routes.js";
export * from "./extraction/index.js";
