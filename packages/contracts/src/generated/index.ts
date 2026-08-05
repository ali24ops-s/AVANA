/*
 * NOTE: Sprint 1 PR 4 requires OpenAPI-backed generated exports.
 *
 * This repository snapshot does not run an OpenAPI generator yet.
 * To keep PR-4 buildable while preserving the contract boundary,
 * we provide minimal hand-authored types that mirror the OpenAPI
 * contract shapes.
 *
 * Once the generator tooling is added in a later PR, these exports
 * should be replaced by generated output.
 */

export type UUID = string;

export type HealthResponse = {
  ok: true;
  request_id: string;
};

export type ErrorEnvelope = {
  request_id: string;
  error: {
    code:
      | "bad_request"
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "unprocessable"
      | "internal_error";
    message: string;
    details?: Record<string, string | number | boolean | null | undefined>;
  };
};

export type Pagination = {
  limit: number;
  next_cursor: string | null;
};

export type Role =
  | "student"
  | "teacher"
  | "course_editor"
  | "organization_admin"
  | "support_agent"
  | "platform_admin";

export type UserResource = {
  id: UUID;
  email: string;
  role: Role;
};

export type MeResponse = {
  request_id: string;
  user: UserResource;
};

export type OrganizationResource = {
  id: UUID;
  name: string;
};

export type CreateOrganizationRequest = {
  name: string;
};

export type OrganizationResponse = {
  request_id: string;
  organization: OrganizationResource;
};

export type OrganizationMembershipResource = {
  id: UUID;
  user_id: UUID;
  role: "student" | "course_editor" | "organization_admin";
};

export type MembershipListResponse = {
  request_id: string;
  items: OrganizationMembershipResource[];
  pagination: Pagination;
};

export type OrganizationListResponse = {
  request_id: string;
  items: OrganizationResource[];
  pagination: Pagination;
};

export type CourseResource = {
  id: UUID;
  title: string;
  subject: string | null;
  exam_at: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
};

export type CourseResponse = {
  request_id: string;
  course: CourseResource;
};

export type CourseListResponse = {
  request_id: string;
  items: CourseResource[];
  pagination: Pagination;
};

export type CreateCourseRequest = {
  title: string;
  subject: string | null;
  exam_at: string | null;
};

export type UpdateCourseRequest = {
  title?: string;
  subject?: string | null;
  exam_at?: string | null;
};

// ---------------------------------------------------------------------------
// PR-7 Auth contract types
// ---------------------------------------------------------------------------

export type SignInRequest = {
  email: string;
};

export type SignInResponse = {
  request_id: string;
  user: UserResource;
};

// ---------------------------------------------------------------------------
// PR-3 Learning contract types
// ---------------------------------------------------------------------------

export type LessonResource = {
  id: UUID;
  module_id: UUID;
  title: string;
  content_type: string;
  content_markdown: string;
  sort_order: number;
  estimated_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
};

export type ModuleResource = {
  id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: LessonResource[];
};

export type CourseLearnProgress = {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
};

export type CourseLearnResponse = {
  request_id: string;
  course: {
    id: UUID;
    title: string;
    subject: string | null;
    exam_at: string | null;
  };
  modules: ModuleResource[];
  progress: CourseLearnProgress;
};

// ---------------------------------------------------------------------------
// PR-4 Learning Progress contract types
// ---------------------------------------------------------------------------

export type CompleteLessonRequest = {
  completed: true;
};

export type LessonProgressResponse = {
  lesson_id: UUID;
  completed: boolean;
  completed_at: string | null;
};

export type CourseProgressResponse = {
  course_id: UUID;
  total_lessons: number;
  completed_lessons: number;
  percentage: number;
};

// ---------------------------------------------------------------------------
// PR5-A Content authoring contract types
// ---------------------------------------------------------------------------

export type LessonPublicationStatus = "draft" | "published";

export type ContentLessonResource = {
  id: UUID;
  module_id: UUID;
  title: string;
  content_type: "markdown";
  content_markdown: string;
  sort_order: number;
  estimated_minutes: number | null;
  publication_status: LessonPublicationStatus;
  created_at: string;
  updated_at: string;
};

export type ContentModuleResource = {
  id: UUID;
  course_id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: ContentLessonResource[];
};

export type CourseContentResponse = {
  request_id: string;
  course: {
    id: UUID;
    title: string;
    subject: string | null;
  };
  modules: ContentModuleResource[];
};

export type CreateContentLessonRequest = {
  title: string;
  content_markdown?: string;
  estimated_minutes?: number | null;
};

export type UpdateContentLessonRequest = {
  title?: string;
  content_markdown?: string;
  estimated_minutes?: number | null;
};

export type ContentLessonResponse = {
  request_id: string;
  lesson: ContentLessonResource;
};
