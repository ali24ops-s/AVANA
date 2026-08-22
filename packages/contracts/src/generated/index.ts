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
  name?: string;
  role: Role;
  emailVerified?: boolean;
};

/**
 * A single organization membership with its role, exposed in authenticated
 * auth responses so the frontend can resolve per-organization permissions.
 */
export type UserMembership = {
  organization_id: UUID;
  role: Role;
};

export type MeResponse = {
  request_id: string;
  user: UserResource;
  memberships: UserMembership[];
};

export type VerifyEmailRequest = {
  code: string;
};

export type VerifyEmailResponse = {
  request_id: string;
  user: UserResource;
  memberships: UserMembership[];
};

export type ResendVerificationRequest = {
  email?: string;
};

export type ResendVerificationResponse = {
  request_id: string;
  message: string;
  cooldown_seconds?: number;
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
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  name?: string;
};

export type SignInResponse = {
  request_id: string;
  user: UserResource;
  memberships: UserMembership[];
};

export type RegisterResponse = SignInResponse;


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

// ---------------------------------------------------------------------------
// PR5-D4 Module CRUD contract types
// ---------------------------------------------------------------------------

export type ContentModuleSummary = {
  id: UUID;
  course_id: UUID;
  title: string;
  description: string | null;
  sort_order: number;
};

export type CreateContentModuleRequest = {
  title: string;
  description?: string | null;
};

export type UpdateContentModuleRequest = {
  title?: string;
  description?: string | null;
};

export type ContentModuleResponse = {
  request_id: string;
  module: ContentModuleSummary;
};

// ---------------------------------------------------------------------------
// PR6-2 Document upload pipeline contract types
// ---------------------------------------------------------------------------

export type DocumentStatus =
  | "uploaded"
  | "pending_validation"
  | "validating"
  | "pending_extraction"
  | "extracting"
  | "pending_chunking"
  | "chunking"
  | "extracted"
  | "pending_generation"
  | "generating"
  | "review_pending"
  | "ready"
  | "failed";

export type DocumentResource = {
  id: UUID;
  organization_id: UUID;
  course_id: UUID | null;
  owner_user_id: UUID;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: DocumentStatus;
  error_code: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

export type UploadIntentRequest = {
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

export type UploadIntentResponse = {
  request_id: string;
  document_id: UUID;
  storage_key: string;
  upload_url: string | null;
  expires_at: string;
};

export type ConfirmUploadResponse = {
  request_id: string;
  duplicate: boolean;
  document: DocumentResource;
};

export type DocumentListPagination = {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  next_cursor: string | null;
};

export type DocumentListResponse = {
  request_id: string;
  items: DocumentResource[];
  pagination: DocumentListPagination;
};

export type DocumentGetResponse = {
  request_id: string;
  document: DocumentResource;
};

export type DocumentStatsResource = {
  total_count: number;
  total_size_bytes: number;
  status_counts: Record<string, number>;
  used_count: number;
  unused_count: number;
};

export type DocumentStatsResponse = {
  request_id: string;
  stats: DocumentStatsResource;
};

export type UpdateDocumentRequest = {
  original_name?: string;
  course_id?: string | null;
};

export type DocumentUsageDetails = {
  course: { id: UUID; name: string } | null;
  modules: Array<{ id: UUID; title: string }>;
  lessons_count: number;
  flashcards_count: number;
  quizzes_count: number;
  chunks_count: number;
  generated_contents_count?: number;
};

export type DocumentDetailResource = DocumentResource & {
  storage_key?: string;
  page_count?: number | null;
  usage?: DocumentUsageDetails;
};

export type DocumentDetailResponse = {
  request_id: string;
  document: DocumentDetailResource;
};

export type BulkOperationItemResult = {
  document_id: UUID;
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
};

export type BulkOperationResponse = {
  request_id: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkOperationItemResult[];
};

export type BulkDeleteRequest = {
  document_ids: UUID[];
};

export type BulkReprocessRequest = {
  document_ids: UUID[];
};

export type BulkAttachCourseRequest = {
  document_ids: UUID[];
  course_id: UUID | null;
};

// ---------------------------------------------------------------------------
// PR6-3 Document text extraction contract types
// ---------------------------------------------------------------------------

export type DocumentStatusResource = {
  document_id: UUID;
  organization_id: UUID;
  status: DocumentStatus;
  page_count: number | null;
  chunk_count: number | null;
  error_code: string | null;
  retry_count: number;
  updated_at: string;
};

export type DocumentStatusResponse = {
  request_id: string;
  status: DocumentStatusResource;
};

// ---------------------------------------------------------------------------
// PR6-4 AI Model Gateway + Generated Content contract types
// ---------------------------------------------------------------------------

/**
 * Extensible union of AI-generated content types. Only "lesson" is enabled in
 * PR6-4; flashcard/quiz/recommendation are activated in later PRs.
 */
export type GeneratedContentType =
  "lesson" | "flashcard" | "quiz" | "recommendation";

/**
 * AI artifact lifecycle (separate from the document processing lifecycle).
 */
export type GeneratedContentStatus =
  "draft" | "accepted" | "rejected" | "edited" | "regenerating";

export type CitationResource = {
  document_chunk_id: UUID;
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type GeneratedContentResource = {
  id: UUID;
  document_id: UUID;
  course_id: UUID;
  type: GeneratedContentType;
  status: GeneratedContentStatus;
  payload: Record<string, unknown>;
  prompt_version: string | null;
  model: string | null;
  token_usage: TokenUsage;
  citations: CitationResource[];
  created_at: string;
  updated_at: string;
};

export type GenerateContentRequest = {
  types?: GeneratedContentType[];
  prompt_version?: string;
};

export type GenerateContentResponse = {
  request_id: string;
  contents: GeneratedContentResource[];
  document_status: DocumentStatus;
};

export type GeneratedContentListResponse = {
  request_id: string;
  contents: GeneratedContentResource[];
};

export type GeneratedContentResponse = {
  request_id: string;
  content: GeneratedContentResource;
};

// ---------------------------------------------------------------------------
// PR6-6 Human review & acceptance contract types
// ---------------------------------------------------------------------------

export type ReviewQueueResource = {
  id: UUID;
  document_id: UUID;
  course_id: UUID;
  type: GeneratedContentType;
  status: GeneratedContentStatus;
  title: string;
  updated_at: string;
};

export type ReviewQueueResponse = {
  request_id: string;
  pending: ReviewQueueResource[];
};

export type SourceChunkResource = {
  id: UUID;
  sequence: number;
  heading: string | null;
  content: string;
  start_page: number;
  end_page: number;
};

export type GenerationInfoResource = {
  model: string | null;
  prompt_version: string | null;
  token_usage: TokenUsage;
};

export type GeneratedContentReviewResource = {
  request_id: string;
  content: GeneratedContentResource;
  source_chunks: SourceChunkResource[];
  generation: GenerationInfoResource;
};

export type GeneratedContentReviewResponse = {
  request_id: string;
  content: GeneratedContentResource;
  source_chunks: SourceChunkResource[];
  generation: GenerationInfoResource;
};

export type EditGeneratedContentRequest = {
  payload: Record<string, unknown>;
};

export type AcceptContentResponse = {
  request_id: string;
  content_id: UUID;
  status: "accepted";
  materialized_lesson_id: UUID | null;
};

export type RejectContentRequest = {
  reason: string;
};

export type RejectContentResponse = {
  request_id: string;
  content_id: UUID;
  status: "rejected";
};

export type RegenerateContentResponse = {
  request_id: string;
  content_id: UUID;
  job_id: string;
  status: "regenerating";
};

// ---------------------------------------------------------------------------
// PR6-7 Study consumption & analytics contract types
// ---------------------------------------------------------------------------

export type FlashcardRating = "again" | "hard" | "good" | "easy";

export type FlashcardResource = {
  id: UUID;
  organization_id: UUID;
  course_id: UUID;
  document_id: UUID;
  generated_content_id: UUID | null;
  question: string;
  answer: string;
  explanation: string | null;
  card_type: string;
  difficulty: string;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  created_at: string;
  updated_at: string;
};

export type FlashcardListResponse = {
  request_id: string;
  flashcards: FlashcardResource[];
  next_review_count: number;
};

export type FlashcardCourseSummary = {
  course_id: UUID;
  title: string;
  total_cards: number;
  due_cards: number;
  new_cards: number;
  learning_cards: number;
  overdue_cards: number;
};

export type FlashcardSummaryResponse = {
  request_id: string;
  courses: FlashcardCourseSummary[];
  total_due: number;
  total_overdue: number;
  total_new: number;
  total_learning: number;
  total_cards: number;
};

export type FlashcardReviewQueueResponse = {
  request_id: string;
  due_cards: FlashcardResource[];
};

export type SubmitFlashcardReviewRequest = {
  rating: FlashcardRating;
  reaction_ms?: number;
  is_exam_mode?: boolean;
};

export type SubmitFlashcardReviewResponse = {
  request_id: string;
  success: boolean;
};

export type QuizQuestionResource = {
  id: UUID;
  quiz_id: UUID;
  generated_content_id: UUID | null;
  question: string;
  question_type: string;
  choices: string[] | null;
  correct_answer?: unknown;
  explanation: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QuizResource = {
  id: UUID;
  organization_id: UUID;
  course_id: UUID;
  document_id: UUID;
  title: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

export type QuizDetailResource = QuizResource & {
  questions: QuizQuestionResource[];
};

export type QuizListResponse = {
  request_id: string;
  quizzes: QuizResource[];
};

export type QuizResponse = {
  request_id: string;
  quiz: QuizDetailResource;
};

export type QuizQuestionAnswerInput = {
  questionId: UUID;
  answer: unknown;
};

export type SubmitQuizAttemptRequest = {
  answers: QuizQuestionAnswerInput[];
};

export type QuizAttemptResult = {
  attemptId: UUID;
  quizId: UUID;
  score: number;
  correct: number;
  total: number;
  answers: Record<string, unknown>;
  completedAt: string;
};

export type SubmitQuizAttemptResponse = {
  request_id: string;
  attempt: QuizAttemptResult;
};

export type QuizAttemptResource = {
  id: UUID;
  quizId: UUID;
  userId: UUID;
  score: number;
  answers: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
};

export type QuizAttemptResponse = {
  request_id: string;
  attempt: QuizAttemptResource;
};

export type StudyAnalytics = {
  total_lessons: number;
  completed_lessons: number;
  lesson_progress_percent: number;
  total_flashcards: number;
  reviewed_flashcards: number;
  flashcard_mastery_percent: number;
  total_quizzes: number;
  attempts_taken: number;
  average_quiz_score: number;
  weak_areas: string[];
  recommended_next_steps: string[];
};

export type StudyAnalyticsResponse = {
  request_id: string;
  analytics: StudyAnalytics;
};

export type StudyRecommendationResource = {
  id: string;
  summary: string;
  topics: string[];
  source:
    | "accepted_lesson"
    | "flashcard_review"
    | "quiz_attempt"
    | "recommendation";
};

export type StudyRecommendationsResponse = {
  request_id: string;
  recommendations: StudyRecommendationResource[];
};

// ---------------------------------------------------------------------------
// AI Study Assistant Contracts
// ---------------------------------------------------------------------------

export type AskAiAssistantContext = {
  type: "lesson" | "dashboard";
  lessonId?: UUID;
  courseId?: UUID;
};

export type AskAiAssistantRequest = {
  message: string;
  context?: AskAiAssistantContext;
  conversationId?: UUID;
};

export type AskAiAssistantResponse = {
  request_id: string;
  answer: string;
  conversationId: UUID;
  sources?: {
    courseTitle?: string;
    moduleTitle?: string;
    lessonTitle?: string;
  };
};

export type AiMessageResource = {
  id: UUID;
  conversationId: UUID;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type AiConversationDetailResponse = {
  request_id: string;
  conversationId: UUID;
  messages: AiMessageResource[];
};

// ---------------------------------------------------------------------------
// Flashcard Study Session Contracts
// ---------------------------------------------------------------------------

export type CreateFlashcardStudySessionRequest = {
  courseId?: UUID;
  courseIds?: UUID[];
  moduleIds?: UUID[];
  lessonIds?: UUID[];
  documentIds?: UUID[];
  mode?: "daily" | "exam" | "custom" | "normal";
  customMode?: "weak" | "forgotten" | "overdue" | "review_ahead" | "new";
  limit?: number;
  aheadDays?: number;
  title?: string;
};

export type FlashcardStudySessionSummary = {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  course_id: UUID | null;
  title: string;
  mode: string;
  custom_mode: string | null;
  status: "in_progress" | "completed" | "cancelled";
  total_cards: number;
  completed_cards: number;
  current_index: number;
  current_card_id: UUID | null;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
};

export type CreateFlashcardStudySessionResponse = {
  request_id: string;
  session: FlashcardStudySessionSummary;
};

export type FlashcardStudySessionsListResponse = {
  request_id: string;
  sessions: FlashcardStudySessionSummary[];
};

export type FlashcardStudySessionDetailResponse = {
  request_id: string;
  session: FlashcardStudySessionSummary;
  cards: FlashcardResource[];
  session_cards: Array<{
    id: UUID;
    session_id: UUID;
    flashcard_id: UUID | null;
    sort_order: number;
    status: "unseen" | "reviewed";
    rating: string | null;
    reviewed_at: string | null;
  }>;
};

export type UpdateFlashcardStudySessionProgressRequest = {
  current_index: number;
  completed_cards?: number;
  current_card_id?: UUID;
  card_id?: UUID;
  rating?: FlashcardRating;
  reaction_ms?: number;
};

export type UpdateFlashcardStudySessionProgressResponse = {
  request_id: string;
  session: FlashcardStudySessionSummary;
};


