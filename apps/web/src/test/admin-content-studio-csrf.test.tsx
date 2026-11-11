/**
 * AVANA Content Studio CSRF & Central API Client Regression Tests
 *
 * Verifies that:
 * 1. x-csrf-token header is automatically attached to all Content Studio POST/PUT/DELETE requests.
 * 2. credentials: "include" is always preserved.
 * 3. triggerOfficialGeneration passes the exact expected payload.
 * 4. 403 / CSRF Token Missing errors are handled via typed ApiError without app crash.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApiClient } from "../lib/api/client.js";
import { createAdminApi } from "../lib/api/admin.js";
import { ApiError } from "../lib/api/errors.js";

describe("Content Studio CSRF & Central API Client Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches x-csrf-token and credentials: 'include' to triggerOfficialGeneration", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | URL | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, jobId: "job-999" }),
      } as Response);
    });

    const client = createApiClient({
      baseUrl: "",
      csrfToken: "mock-csrf-token-xyz",
    });
    const adminApi = createAdminApi(client);

    const payload = {
      documentId: "doc-abc",
      lesson: true,
      flashcards: true,
      exam: true,
      review_summary: false,
      force: false,
      questionPatternId: "pat-123",
      questionPatternVersion: 1,
      questionPatternIds: ["pat-123"],
    };

    const res = await adminApi.officialContentStudio.triggerOfficialGeneration(
      "course-456",
      payload,
    );

    expect(res).toEqual({ success: true, jobId: "job-999" });
    expect(capturedUrl).toBe("/v1/admin/content-studio/courses/course-456/generate");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({
        "x-csrf-token": "mock-csrf-token-xyz",
        "Content-Type": "application/json",
      }),
    );
    expect(JSON.parse(capturedInit?.body as string)).toEqual(payload);
  });

  it("attaches x-csrf-token and credentials: 'include' to approveOfficialCourse", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | URL | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            materialized: { modules: 2, lessons: 6, flashcards: 20, questions: 10 },
          }),
      } as Response);
    });

    const client = createApiClient({
      baseUrl: "",
      csrfToken: "csrf-token-approve",
    });
    const adminApi = createAdminApi(client);

    const res = await adminApi.officialContentStudio.approveOfficialCourse("course-123");

    expect(res.success).toBe(true);
    expect(capturedUrl).toBe("/v1/admin/content-studio/courses/course-123/approve");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({
        "x-csrf-token": "csrf-token-approve",
      }),
    );
  });

  it("attaches x-csrf-token and credentials: 'include' to publication action endpoints (pricing, publish, unpublish, archive)", async () => {
    const capturedRequests: { url: string | URL; init?: RequestInit }[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      capturedRequests.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);
    });

    const client = createApiClient({
      baseUrl: "",
      csrfToken: "csrf-studio-actions",
    });
    const adminApi = createAdminApi(client);

    // 1. Pricing
    await adminApi.officialContentStudio.setOfficialCoursePricing("c1", { price: 350000 });
    // 2. Publish
    await adminApi.officialContentStudio.publishOfficialCourse("c1");
    // 3. Unpublish
    await adminApi.officialContentStudio.unpublishOfficialCourse("c1");
    // 4. Archive
    await adminApi.officialContentStudio.archiveOfficialCourse("c1");

    expect(capturedRequests).toHaveLength(4);

    for (const req of capturedRequests) {
      expect(req.init?.credentials).toBe("include");
      expect(req.init?.headers).toEqual(
        expect.objectContaining({
          "x-csrf-token": "csrf-studio-actions",
        }),
      );
    }

    expect(capturedRequests[0].url).toBe("/v1/admin/content-studio/courses/c1/pricing");
    expect(JSON.parse(capturedRequests[0].init?.body as string)).toEqual({ price: 350000 });
    expect(capturedRequests[1].url).toBe("/v1/admin/content-studio/courses/c1/publish");
    expect(capturedRequests[2].url).toBe("/v1/admin/content-studio/courses/c1/unpublish");
    expect(capturedRequests[3].url).toBe("/v1/admin/content-studio/courses/c1/archive");
  });

  it("gracefully catches 403 CSRF token missing errors as ApiError without unhandled exception", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          request_id: "req-err-403",
          error: {
            code: "forbidden",
            message: "CSRF token missing",
          },
        }),
    } as Response);

    const client = createApiClient({
      baseUrl: "",
      csrfToken: "",
    });
    const adminApi = createAdminApi(client);

    try {
      await adminApi.officialContentStudio.approveOfficialCourse("course-fail");
      expect.fail("Should have thrown ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("forbidden");
      expect(apiErr.message).toBe("CSRF token missing");
      expect(apiErr.requestId).toBe("req-err-403");
      expect(apiErr.getUserMessage()).toBeDefined();
    }
  });
});
