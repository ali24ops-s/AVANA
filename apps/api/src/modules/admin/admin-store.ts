/**
 * Admin store abstractions.
 *
 * Provides aggregated queries and platform-wide data access for the admin panel.
 */

export type DashboardStats = {
  totalUsers: number;
  newUsersToday: number;
  totalCourses: number;
  totalLessons: number;
  totalFlashcards: number;
  totalQuizzes: number;
  totalDocuments: number;
  generationSuccessRate: number; // percentage
  generationsToday: number;
};

export type AdminUserRecord = {
  id: string;
  email: string;
  name?: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt?: string;
};

export type AdminUsersList = {
  users: AdminUserRecord[];
  totalCount: number;
};

export type AdminGenerationJobRecord = {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  documentName?: string;
  userEmail?: string;
};

export type DataIntegrityReport = {
  lessonsWithoutModule: number;
  flashcardsWithoutLesson: number;
  quizzesWithoutLesson: number;
  documentsWithoutCourse: number;
  failedGenerations: number;
};

export interface AdminCourseRecord {
  id: string;
  name: string;
  subject: string | null;
  createdAt: string;
  counts: {
    modules: number;
    lessons: number;
    flashcards: number;
    quizzes: number;
  };
}

export interface AdminDocumentRecord {
  id: string;
  organizationId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
}

export interface AdminSystemHealth {
  database: "healthy" | "error";
  redis: "healthy" | "error" | "unknown";
  ai: "healthy" | "warning" | "error" | "unknown";
  lastCheck: string;
}

export interface AdminLogRecord {
  id: string;
  timestamp: string;
  level: "INFO" | "WARNING" | "ERROR";
  service: string;
  message: string;
  requestId?: string;
  userId?: string;
}

export interface AdminAuditRecord {
  id: string;
  adminEmail: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  metadata: any;
}

export interface AdminLessonRecord {
  id: string;
  title: string;
  courseName?: string;
  moduleTitle?: string;
  publicationStatus: string;
  createdAt: string;
}

export interface AdminFlashcardRecord {
  id: string;
  front: string;
  back: string;
  lessonTitle?: string;
  createdAt: string;
}

export interface AdminExamRecord {
  id: string;
  title: string;
  passingScore: number;
  questionCount: number;
  createdAt: string;
}

export interface AdminGenerationDetail extends AdminGenerationJobRecord {
  provider?: string;
  model?: string;
  startedAt?: string;
  durationMs?: number;
  retryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorType?: string;
  httpStatus?: number;
  payload?: unknown;
}

export interface AdminStore {
  // Phase 1
  getDashboardStats(): Promise<DashboardStats>;
  listUsers(params: { page: number; pageSize: number; search?: string }): Promise<AdminUsersList>;
  listGenerationJobs(params: { page: number; pageSize: number; status?: string }): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }>;
  getDataIntegrityReport(): Promise<DataIntegrityReport>;

  // Phase 2
  listCourses(params: { page: number; pageSize: number; search?: string }): Promise<{ courses: AdminCourseRecord[]; totalCount: number }>;
  listDocuments(params: { page: number; pageSize: number; search?: string; status?: string }): Promise<{ documents: AdminDocumentRecord[]; totalCount: number }>;
  getDocument(id: string): Promise<AdminDocumentRecord | null>;
  getSystemHealth(): Promise<AdminSystemHealth>;
  listLogs(params: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }>;
  listAuditLogs(params: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }>;
  
  // Content Phase 2
  listLessons(params: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }>;
  listFlashcards(params: { page: number; pageSize: number; search?: string }): Promise<{ flashcards: AdminFlashcardRecord[]; totalCount: number }>;
  listExams(params: { page: number; pageSize: number; search?: string }): Promise<{ exams: AdminExamRecord[]; totalCount: number }>;
  getGenerationJob(id: string): Promise<AdminGenerationDetail | null>;

  // Phase 3 Analytics
  getAnalytics(): Promise<any>;
  getAiAnalytics(): Promise<any>;

  // Phase 4: Mutations
  updateUserRole(adminId: string, targetUserId: string, newRole: string): Promise<void>;
  updateCourseMetadata(adminId: string, courseId: string, payload: { name?: string; subject?: string }): Promise<void>;
  retryDocumentProcessing(adminId: string, documentId: string): Promise<void>;
  retryGenerationJob(adminId: string, jobId: string): Promise<void>;
}
