/**
 * Admin API Client.
 */

export interface DashboardStats {
  totalUsers: number;
  newUsersToday: number;
  totalCourses: number;
  totalLessons: number;
  totalFlashcards: number;
  totalQuizzes: number;
  totalDocuments: number;
  generationSuccessRate: number;
  generationsToday: number;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name?: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AdminUsersList {
  users: AdminUserRecord[];
  totalCount: number;
}

export interface CourseCounts {
  modules: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
}

export interface AdminCourseRecord {
  id: string;
  name: string;
  subject: string | null;
  createdAt: string;
  counts: CourseCounts;
}

export interface AdminCoursesList {
  courses: AdminCourseRecord[];
  totalCount: number;
}

export interface AdminGenerationJobRecord {
  id: string;
  type: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  documentName?: string;
  userEmail?: string;
}

export interface DataIntegrityReport {
  lessonsWithoutModule: number;
  flashcardsWithoutLesson: number;
  quizzesWithoutLesson: number;
  documentsWithoutCourse: number;
  failedGenerations: number;
}

export interface AdminSystemHealth {
  database: "healthy" | "error";
  redis: "healthy" | "error" | "unknown";
  ai: "healthy" | "warning" | "error" | "unknown";
  lastCheck: string;
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

export interface AdminAuditList {
  logs: AdminAuditRecord[];
  totalCount: number;
}

export function createAdminApi(client: {
  get: <T>(path: string, options?: any) => Promise<T>;
  post: <T>(path: string, data?: any, options?: any) => Promise<T>;
  patch: <T>(path: string, data?: any, options?: any) => Promise<T>;
}) {
  return {
    async getDashboardStats(): Promise<DashboardStats> {
      return client.get<DashboardStats>("/v1/admin/dashboard");
    },

    async getSystemHealth(): Promise<AdminSystemHealth> {
      return client.get<AdminSystemHealth>("/v1/admin/system/health");
    },

    async listAuditLogs(page = 1, pageSize = 5): Promise<AdminAuditList> {
      return client.get<AdminAuditList>(`/v1/admin/system/audit?page=${page}&pageSize=${pageSize}`);
    },
    
    async listUsers(page = 1, pageSize = 20, search?: string, role?: string, status?: string): Promise<AdminUsersList> {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const roleParam = role ? `&role=${encodeURIComponent(role)}` : "";
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
      return client.get<AdminUsersList>(`/v1/admin/users?page=${page}&pageSize=${pageSize}${searchParam}${roleParam}${statusParam}`);
    },

    async listCourses(page = 1, pageSize = 20, search?: string): Promise<AdminCoursesList> {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      return client.get<AdminCoursesList>(`/v1/admin/courses?page=${page}&pageSize=${pageSize}${searchParam}`);
    },

    async listGenerationJobs(page = 1, pageSize = 20, status?: string): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
      return client.get<{ jobs: AdminGenerationJobRecord[]; totalCount: number }>(`/v1/admin/generation?page=${page}&pageSize=${pageSize}${statusParam}`);
    },

    async getDataIntegrityReport(): Promise<DataIntegrityReport> {
      return client.get<DataIntegrityReport>("/v1/admin/system/integrity");
    },
    
    // Phase 4 Mutations
    async updateUserRole(userId: string, role: string): Promise<{ success: boolean }> {
      return client.patch<{ success: boolean }>(`/v1/admin/users/${userId}/role`, { role });
    },
    async updateCourseMetadata(courseId: string, payload: { name?: string; subject?: string }): Promise<{ success: boolean }> {
      return client.patch<{ success: boolean }>(`/v1/admin/courses/${courseId}`, payload);
    },
    async retryDocument(documentId: string): Promise<{ success: boolean }> {
      return client.post<{ success: boolean }>(`/v1/admin/documents/${documentId}/retry`);
    },
    async retryGenerationJob(jobId: string): Promise<{ success: boolean }> {
      return client.post<{ success: boolean }>(`/v1/admin/generation/${jobId}/retry`);
    },
  };
}

import { createApiClient, getApiBaseUrl } from "./client.js";
const rawClient = createApiClient({ baseUrl: getApiBaseUrl() });

export const api = {
  get: <T>(path: string, options?: any) => rawClient.get<T>(`/v1${path}`, options),
  post: <T>(path: string, data?: any, options?: any) => rawClient.post<T>(`/v1${path}`, data, options),
};
