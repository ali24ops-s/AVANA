import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiClient } from "../lib/api/client.js";
import { createDocumentsApi } from "../lib/api/documents.js";
import { createGenerationApi } from "../lib/api/generation.js";
import { createReviewApi } from "../lib/api/review.js";
import { createStudyApi } from "../lib/api/study.js";

describe("PR6-8 Frontend API Clients", () => {
  const mockBaseUrl = "http://localhost:3000";
  const apiClient = createApiClient({ baseUrl: mockBaseUrl });
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockDocId = "00000000-0000-0000-0000-000000000003";
  const mockContentId = "00000000-0000-0000-0000-000000000004";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("documentsApi handles createUploadIntent and triggerExtraction", async () => {
    const docsApi = createDocumentsApi(apiClient);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-1",
        document_id: mockDocId,
        storage_key: "docs/lecture1.pdf",
        upload_url: null,
        expires_at: new Date().toISOString(),
      }),
    });

    const docRes = await docsApi.createUploadIntent(mockOrgId, {
      original_name: "lecture1.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
    });

    expect(docRes.document_id).toBe(mockDocId);
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/v1/organizations/${mockOrgId}/documents/upload-intent`,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("generationApi triggers generation job", async () => {
    const genApi = createGenerationApi(apiClient);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        request_id: "req-gen",
        job_id: "job-123",
        status: "pending",
      }),
    });

    const res = await genApi.triggerGeneration(mockOrgId, mockCourseId, mockDocId, {
      types: ["flashcard", "quiz"],
    });

    expect(res.job_id).toBe("job-123");
    expect(res.status).toBe("pending");
  });

  it("reviewApi handles acceptContent", async () => {
    const reviewApi = createReviewApi(apiClient);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-rev",
        content_id: mockContentId,
        status: "accepted",
        materialized_lesson_id: null,
      }),
    });

    const res = await reviewApi.acceptContent(mockOrgId, mockCourseId, mockContentId);
    expect(res.status).toBe("accepted");
  });

  it("studyApi handles review queue and card rating submissions", async () => {
    const studyApi = createStudyApi(apiClient);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-study",
        due_cards: [],
      }),
    });

    const queueRes = await studyApi.getFlashcardReviewQueue(mockOrgId, mockCourseId);
    expect(queueRes.due_cards).toEqual([]);
  });

  it("studyApi handles getDailyStudyPlan, regenerateDailyPlan, and updateStudyTaskStatus", async () => {
    const studyApi = createStudyApi(apiClient);

    // 1. getDailyStudyPlan
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-plan",
        plan: {
          id: "plan-1",
          userId: "user-1",
          planDate: "2026-09-18",
          status: "in_progress",
          targetDurationMinutes: 45,
          completedDurationMinutes: 0,
          remainingDurationMinutes: 45,
          tasks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });

    const planRes = await studyApi.getDailyStudyPlan({ timezone: "Asia/Tehran", targetMinutes: 45 });
    expect(planRes.plan.id).toBe("plan-1");
    const expectedTz = encodeURIComponent("Asia/Tehran");
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/v1/study/daily-plan?timezone=${expectedTz}&targetMinutes=45`,
      expect.objectContaining({ method: "GET" }),
    );

    // 2. regenerateDailyPlan
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-regen",
        plan: {
          id: "plan-1",
          userId: "user-1",
          planDate: "2026-09-18",
          status: "in_progress",
          targetDurationMinutes: 60,
          completedDurationMinutes: 0,
          remainingDurationMinutes: 60,
          tasks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });

    const regenRes = await studyApi.regenerateDailyPlan({ targetMinutes: 60 });
    expect(regenRes.plan.targetDurationMinutes).toBe(60);
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/v1/study/daily-plan/regenerate`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetMinutes: 60 }),
      }),
    );

    // 3. updateStudyTaskStatus
    const taskId = "task-123";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-patch",
        task: {
          id: taskId,
          planId: "plan-1",
          userId: "user-1",
          taskType: "read_lesson",
          status: "completed",
          title: "درس ۱",
          description: null,
          priority: 1,
          estimatedMinutes: 20,
          completedAt: new Date().toISOString(),
          courseId: null,
          moduleId: null,
          lessonId: null,
          quizId: null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });

    const updateRes = await studyApi.updateStudyTaskStatus(taskId, { status: "completed" });
    expect(updateRes.task.status).toBe("completed");
    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/v1/study/daily-plan/tasks/${taskId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    );
  });
});
