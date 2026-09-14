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

export type ContentReportStatus =
  | "pending"
  | "in_review"
  | "resolved"
  | "dismissed";

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

export interface AdminContentReportItem {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  lessonId: string;
  lessonTitle?: string | null;
  moduleId?: string | null;
  moduleTitle?: string | null;
  courseId?: string | null;
  courseName?: string | null;
  selectedText: string;
  category: ContentReportCategory;
  comment?: string | null;
  status: ContentReportStatus;
  createdAt: string;
}

export interface ListAdminContentReportsResponse {
  items: AdminContentReportItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UpdateContentReportStatusRequest {
  status: ContentReportStatus;
}
