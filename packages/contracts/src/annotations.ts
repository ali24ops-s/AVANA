/**
 * Lesson Annotations (Highlights & Notes) and Content Report Contracts.
 */

export type LessonAnnotationType = "highlight" | "note";

export type ContentReportCategory =
  | "scientific_error"
  | "typo"
  | "rendering_issue"
  | "unclear_content"
  | "other";

export interface LessonAnnotationResource {
  id: string;
  userId: string;
  lessonId: string;
  type: LessonAnnotationType;
  selectedText: string;
  prefix?: string | null;
  suffix?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
  color: string;
  noteText?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationRequest {
  type: LessonAnnotationType;
  selectedText: string;
  prefix?: string | null;
  suffix?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
  color?: string;
  noteText?: string | null;
}

export interface UpdateAnnotationRequest {
  noteText?: string | null;
  color?: string;
}

export interface ListAnnotationsResponse {
  items: LessonAnnotationResource[];
}

export interface CreateContentReportRequest {
  selectedText: string;
  category: ContentReportCategory;
  comment?: string | null;
  courseId?: string | null;
}

export interface ContentReportResponse {
  id: string;
  lessonId: string;
  userId: string;
  status: string;
  message: string;
  createdAt: string;
}
