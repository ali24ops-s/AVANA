/**
 * In-memory implementation of AdminStore.
 * Used for local development (composeLocalDev) and testing.
 */

import type { UserId, Role } from "@avana/domain";
import type { UserStore, UserRecord } from "../identity/user-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { checkRedisHealth } from "./redis-health.js";
import type {
  AdminStore,
  DashboardStats,
  AdminUsersList,
  AdminGenerationJobRecord,
  DataIntegrityReport,
  AdminCourseRecord,
  AdminDocumentRecord,
  AdminSystemHealth,
  AdminStoreOptions,
  AdminLogRecord,
  AdminAuditRecord,
  AdminLessonRecord,
  AdminFlashcardRecord,
  AdminExamRecord,
  AdminGenerationDetail,
  AdminCourseHierarchy,
  AdminAnalytics,
  AdminAiAnalytics,
} from "./admin-store.js";

export class InMemoryAdminStore implements AdminStore {
  constructor(
    private readonly userStore?: UserStore & { insert?(user: UserRecord): void },
    private readonly organizationStore?: OrganizationStore & { listMembershipsByUserId?(userId: UserId): Promise<Array<{ role: Role; updatedAt: string }>> },
    private readonly options?: AdminStoreOptions,
  ) {}
  async getDashboardStats(): Promise<DashboardStats> {
    return {
      totalUsers: 0,
      newUsersToday: 0,
      totalCourses: 0,
      totalLessons: 0,
      totalFlashcards: 0,
      totalQuizzes: 0,
      totalDocuments: 0,
      generationSuccessRate: 100,
      generationsToday: 0,
    };
  }

  async listUsers(_params?: { page: number; pageSize: number; search?: string }): Promise<AdminUsersList> {
    return { users: [], totalCount: 0 };
  }

  async listGenerationJobs(_params?: { page: number; pageSize: number; status?: string }): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    return { jobs: [], totalCount: 0 };
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return {
      lessonsWithoutModule: 0,
      flashcardsWithoutLesson: 0,
      quizzesWithoutLesson: 0,
      documentsWithoutCourse: 0,
      failedGenerations: 0,
    };
  }

  async listCourses(_params?: { page: number; pageSize: number; search?: string }): Promise<{ courses: AdminCourseRecord[]; totalCount: number }> {
    return { courses: [], totalCount: 0 };
  }

  async listDocuments(_params?: { page: number; pageSize: number; search?: string; status?: string }): Promise<{ documents: AdminDocumentRecord[]; totalCount: number }> {
    return { documents: [], totalCount: 0 };
  }

  async getDocument(_id: string): Promise<AdminDocumentRecord | null> {
    return null;
  }

  async getSystemHealth(): Promise<AdminSystemHealth> {
    const redisResult = await checkRedisHealth(this.options?.redisUrl, 1000);
    let aiStatus: string = "healthy";
    let aiReason: string | null | undefined = null;
    let aiLatency: number | null | undefined = 0;

    if (this.options?.gateway?.checkHealth) {
      try {
        const aiCheck = await this.options.gateway.checkHealth();
        aiStatus = aiCheck.status;
        aiReason = aiCheck.reason;
        aiLatency = aiCheck.latencyMs;
      } catch (err: unknown) {
        aiStatus = "unhealthy";
        aiReason = err instanceof Error ? err.message : "AI health check failed";
      }
    }

    return {
      database: "healthy",
      redis: redisResult.status,
      ai: aiStatus,
      lastCheck: new Date().toISOString(),
      services: {
        database: { status: "healthy", latencyMs: 0 },
        redis: { status: redisResult.status, reason: redisResult.reason, latencyMs: redisResult.latencyMs },
        ai: { status: aiStatus, reason: aiReason, latencyMs: aiLatency },
      },
    };
  }

  async listLogs(_params?: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }> {
    return { logs: [], totalCount: 0 };
  }

  async listAuditLogs(_params?: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }> {
    return { logs: [], totalCount: 0 };
  }

  async listLessons(_params?: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }> {
    return { lessons: [], totalCount: 0 };
  }

  async listFlashcards(_params?: { page: number; pageSize: number; search?: string }): Promise<{ flashcards: AdminFlashcardRecord[]; totalCount: number }> {
    return { flashcards: [], totalCount: 0 };
  }

  async listExams(_params?: { page: number; pageSize: number; search?: string }): Promise<{ exams: AdminExamRecord[]; totalCount: number }> {
    return { exams: [], totalCount: 0 };
  }

  async getCourseHierarchy(_courseId: string): Promise<AdminCourseHierarchy | null> {
    return null;
  }

  async getGenerationJob(_id: string): Promise<AdminGenerationDetail | null> {
    return null;
  }

  async getAnalytics(): Promise<AdminAnalytics> {
    const emptyStats = {
      newUsers: 0,
      courses: 0,
      lessons: 0,
      flashcards: 0,
      quizzes: 0,
      aiJobs: 0,
      aiSuccess: 0,
      aiFailed: 0,
    };
    return {
      total: { totalUsers: 0, totalCourses: 0, totalLessons: 0, totalFlashcards: 0, totalQuizzes: 0 },
      today: emptyStats,
      last7Days: emptyStats,
      last30Days: emptyStats,
    };
  }

  async getAiAnalytics(): Promise<AdminAiAnalytics> {
    return {
      overview: {
        totalJobs: 0,
        successful: 0,
        failed: 0,
        processing: 0,
        successRate: 0,
        averageDurationMs: 0,
      },
      byType: {},
      tokens: {
        available: false,
        input: 0,
        output: 0,
        total: 0,
      },
    };
  }

  async updateUserRole(_adminId: string, targetUserId: string, newRole: string): Promise<void> {
    if (this.userStore) {
      const user = await this.userStore.findById(targetUserId as UserId);
      if (user) {
        if (newRole === "platform_admin") {
          user.globalRole = "platform_admin";
          user.role = "platform_admin";
        } else {
          user.globalRole = null;
          user.role = newRole as Role;
          if (this.organizationStore && typeof this.organizationStore.listMembershipsByUserId === "function") {
            const memberships = await this.organizationStore.listMembershipsByUserId(targetUserId as UserId);
            if (memberships.length === 1) {
              const mem = memberships[0];
              mem.role = newRole as Role;
              mem.updatedAt = new Date().toISOString();
            }
          }
        }
        if (typeof this.userStore.insert === "function") {
          this.userStore.insert({
            ...user,
            role: user.role,
            globalRole: user.globalRole,
          });
        }
      }
    }
  }

  async updateCourseMetadata(_adminId: string, _courseId: string, _payload: { name?: string; subject?: string }): Promise<void> {
    return;
  }

  async retryDocumentProcessing(_adminId: string, _documentId: string): Promise<void> {
    return;
  }

  async retryGenerationJob(_adminId: string, _jobId: string): Promise<void> {
    return;
  }
}
