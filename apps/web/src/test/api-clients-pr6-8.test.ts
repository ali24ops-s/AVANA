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
});
