/**
 * API Client tests.
 *
 * Tests the typed API client's error handling, request formatting,
 * and response parsing behavior.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createApiClient } from "../lib/api/client.js";
import { ApiError } from "../lib/api/errors.js";

describe("API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("error handling", () => {
    it("throws ApiError on 401 unauthorized response", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            request_id: "test-request-id",
            error: {
              code: "unauthorized",
              message: "Not signed in",
            },
          }),
      } as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

      const client = createApiClient({ baseUrl: "" });
      await expect(client.get("/v1/me")).rejects.toThrow(ApiError);
    });

    it("throws ApiError with correct error code and message", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            request_id: "test-request-id",
            error: {
              code: "not_found",
              message: "Course not found",
            },
          }),
      } as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

      const client = createApiClient({ baseUrl: "" });
      try {
        await client.get("/v1/organizations/org/courses/course");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe("not_found");
        expect((err as ApiError).message).toBe("Course not found");
        expect((err as ApiError).requestId).toBe("test-request-id");
      }
    });

    it("throws ApiError on 500 internal error", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            request_id: "test-request-id",
            error: {
              code: "internal_error",
              message: "Internal error",
            },
          }),
      } as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

      const client = createApiClient({ baseUrl: "" });
      await expect(client.get("/v1/health")).rejects.toThrow(ApiError);
    });

    it("handles 204 no content responses", async () => {
      const mockResponse = {
        ok: true,
        status: 204,
        json: () => Promise.resolve(""),
      } as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

      const client = createApiClient({ baseUrl: "" });
      const result = await client.post<void>("/v1/auth/sign-out");
      expect(result).toBeUndefined();
    });

    it("includes credentials option for cookie-based auth", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_input: RequestInfo | URL) => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test",
                user: { id: "1", email: "test@example.com", role: "student" },
              }),
          } as Response);
        },
      );

      const client = createApiClient({ baseUrl: "http://localhost:3000" });
      await client.get("/v1/me");

      // Verify credentials option was passed
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "http://localhost:3000/v1/me",
        expect.objectContaining({
          credentials: "include",
        }),
      );
    });

    it("sends CSRF token for state-changing requests", async () => {
      let capturedInit: RequestInit | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation((_, init) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "test",
            }),
        } as Response);
      });

      const client = createApiClient({
        baseUrl: "",
        csrfToken: "test-csrf-token",
      });
      await client.post("/v1/auth/sign-out");

      // Verify CSRF header was sent
      expect(capturedInit?.headers).toEqual(
        expect.objectContaining({
          "x-csrf-token": "test-csrf-token",
        }),
      );
    });

    it("sends x-request-id header with every request", async () => {
      let capturedInit: RequestInit | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation((_, init) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "test",
            }),
        } as Response);
      });

      const client = createApiClient({ baseUrl: "" });
      await client.get("/v1/health");

      expect(capturedInit?.headers).toEqual(
        expect.objectContaining({
          "x-request-id": expect.any(String),
        }),
      );
    });
  });

  describe("response parsing", () => {
    it("returns parsed JSON on successful response", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            request_id: "test-request-id",
            user: {
              id: "user-1",
              email: "test@example.com",
              role: "student",
            },
          }),
      } as Response;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

      const client = createApiClient({ baseUrl: "" });
      const result = await client.get("/v1/me");
      expect(result).toEqual({
        request_id: "test-request-id",
        user: { id: "user-1", email: "test@example.com", role: "student" },
      });
    });
  });
});
