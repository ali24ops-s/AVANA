import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";

import { Roles } from "@avana/domain";
import type { AdminStore, DashboardStats, AdminUsersList, AdminGenerationJobRecord, DataIntegrityReport } from "../modules/admin/admin-store.js";

// Mock AdminStore for tests
class MockAdminStore implements AdminStore {
  async getDashboardStats(): Promise<DashboardStats> {
    return {
      totalUsers: 1, newUsersToday: 0, totalCourses: 1, totalLessons: 1, totalFlashcards: 1, totalQuizzes: 1, totalDocuments: 1, generationsToday: 1, generationSuccessRate: 100
    };
  }
  async listUsers(): Promise<AdminUsersList> {
    return { users: [], totalCount: 0 };
  }
  async listGenerationJobs(): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    return { jobs: [], totalCount: 0 };
  }
  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return { lessonsWithoutModule: 0, flashcardsWithoutLesson: 0, quizzesWithoutLesson: 0, documentsWithoutCourse: 0, failedGenerations: 0 };
  }
  async listCourses(): Promise<any> { return { courses: [], totalCount: 0 }; }
  async listDocuments(): Promise<any> { return { documents: [], totalCount: 0 }; }
  async getDocument(): Promise<any> { return null; }
  async getSystemHealth(): Promise<any> { return { database: "healthy", redis: "unknown", ai: "unknown", lastCheck: "" }; }
  async listLogs(): Promise<any> { return { logs: [], totalCount: 0 }; }
  async listAuditLogs(): Promise<any> { return { logs: [], totalCount: 0 }; }
  async listLessons(): Promise<any> { return { lessons: [], totalCount: 0 }; }
  async listFlashcards(): Promise<any> { return { flashcards: [], totalCount: 0 }; }
  async listExams(_params: any) { return { exams: [], totalCount: 0 }; }
  async getGenerationJob(_id: string) { return null; }
  async getAnalytics() { return {}; }
  async getAiAnalytics() { return {}; }

  // Phase 4 Mutations
  async updateUserRole(_adminId: string, _targetUserId: string, _newRole: string) { return; }
  async updateCourseMetadata(_adminId: string, _courseId: string, _payload: any) { return; }
  async retryDocumentProcessing(_adminId: string, _documentId: string) { return; }
  async retryGenerationJob(_adminId: string, _jobId: string) { return; }
}

describe("Admin Authorization", () => {
  test("Denies access to normal users and allows access to platform_admin", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const adminStore = new MockAdminStore();
    
    // Create Normal User
    await userStore.createUserWithPassword({ email: "user@test.com", passwordHash: "x" });
    const normalUserRecord = await userStore.findByEmail("user@test.com");
    const normalUserId = normalUserRecord!.id;
    ((userStore as any).users.get(normalUserId)).role = Roles.student;

    // Create Admin User
    await userStore.createUserWithPassword({ email: "admin@test.com", passwordHash: "x" });
    const adminUserRecord = await userStore.findByEmail("admin@test.com");
    const adminUserId = adminUserRecord!.id;
    ((userStore as any).users.get(adminUserId)).role = Roles.platform_admin;

    const sessionService = new SessionService(sessionStore, config.session);
    
    const normalSession = await sessionService.createSession(normalUserId);
    const adminSession = await sessionService.createSession(adminUserId);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: {} as any,
    });

    const endpoints = [
      "/v1/admin/dashboard",
      "/v1/admin/users",
      "/v1/admin/courses",
      "/v1/admin/documents",
      "/v1/admin/content/lessons",
      "/v1/admin/content/flashcards",
      "/v1/admin/content/exams",
      "/v1/admin/documents/doc-123",
      "/v1/admin/generation",
      "/v1/admin/generation/providers",
      "/v1/admin/generation/prompts",
      "/v1/admin/generation/job-123",
      "/v1/admin/system/health",
      "/v1/admin/system/integrity",
      "/v1/admin/system/logs",
      "/v1/admin/system/audit",
      "/v1/admin/analytics",
      "/v1/admin/analytics/ai",
      "/v1/admin/settings",
      "/v1/admin/settings/features",
    ];

    const mutationEndpoints = [
      { method: "PATCH", url: "/v1/admin/users/user-123/role", payload: { role: "teacher" } },
      { method: "PATCH", url: "/v1/admin/courses/course-123", payload: { name: "test" } },
      { method: "POST", url: "/v1/admin/documents/doc-123/retry", payload: {} },
      { method: "POST", url: "/v1/admin/generation/job-123/retry", payload: {} },
    ];

    // 4. Verify 403 for student on all GET endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: normalSession.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep}`).toBe(403);
    }
    
    // 4.5. Verify 403 for student on all mutation endpoints
    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method as any,
        url: ep.url,
        payload: ep.payload,
        cookies: { avana_session: normalSession.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep.method} ${ep.url}`).toBe(403);
    }

    // 5. Verify 200/404 for platform_admin on all GET endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: adminSession.sessionToken },
      });
      expect([200, 404].includes(resp.statusCode)).toBe(true);
    }
    
    // 6. Verify mutations for platform_admin
    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method as any,
        url: ep.url,
        payload: ep.payload,
        cookies: { avana_session: adminSession.sessionToken },
      });
      // 501 Not Implemented because mock documentProcessingService and generationQueue are missing in route setup
      expect([200, 404, 501].includes(resp.statusCode)).toBe(true);
    }

    const adminRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: adminSession.sessionToken },
    });
    
    console.log("Admin payload:", adminRes.payload);
    expect(adminRes.statusCode).toBe(200);
    const payload = JSON.parse(adminRes.payload);
    expect(payload.totalUsers).toBe(1); // from MockAdminStore
  });
});
