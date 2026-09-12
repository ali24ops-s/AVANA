/**
 * Lesson Annotations & Content Reports Typed Client API.
 */

import type { ApiClient } from "./client.js";
import type {
  LessonAnnotationResource,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  ListAnnotationsResponse,
  CreateContentReportRequest,
  ContentReportResponse,
} from "@avana/contracts";

export interface LessonAnnotationsApi {
  listAnnotations(lessonId: string): Promise<ListAnnotationsResponse>;
  createAnnotation(
    lessonId: string,
    request: CreateAnnotationRequest,
  ): Promise<LessonAnnotationResource>;
  updateAnnotation(
    annotationId: string,
    request: UpdateAnnotationRequest,
  ): Promise<LessonAnnotationResource>;
  deleteAnnotation(annotationId: string): Promise<{ ok: boolean }>;
  createReport(
    lessonId: string,
    request: CreateContentReportRequest,
  ): Promise<ContentReportResponse>;
}

export function createLessonAnnotationsApi(client: ApiClient): LessonAnnotationsApi {
  return {
    async listAnnotations(lessonId: string): Promise<ListAnnotationsResponse> {
      return client.get<ListAnnotationsResponse>(
        `/v1/lessons/${encodeURIComponent(lessonId)}/annotations`,
      );
    },

    async createAnnotation(
      lessonId: string,
      request: CreateAnnotationRequest,
    ): Promise<LessonAnnotationResource> {
      return client.post<LessonAnnotationResource>(
        `/v1/lessons/${encodeURIComponent(lessonId)}/annotations`,
        request,
      );
    },

    async updateAnnotation(
      annotationId: string,
      request: UpdateAnnotationRequest,
    ): Promise<LessonAnnotationResource> {
      return client.patch<LessonAnnotationResource>(
        `/v1/lessons/annotations/${encodeURIComponent(annotationId)}`,
        request,
      );
    },

    async deleteAnnotation(annotationId: string): Promise<{ ok: boolean }> {
      return client.delete<{ ok: boolean }>(
        `/v1/lessons/annotations/${encodeURIComponent(annotationId)}`,
      );
    },

    async createReport(
      lessonId: string,
      request: CreateContentReportRequest,
    ): Promise<ContentReportResponse> {
      return client.post<ContentReportResponse>(
        `/v1/lessons/${encodeURIComponent(lessonId)}/reports`,
        request,
      );
    },
  };
}
