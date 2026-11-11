import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadContentExport,
  extractContentDispositionFilename,
  sanitizeDownloadedZipFilename,
  parseExportErrorMessage,
} from "../lib/api/admin";

describe("Admin Content Export Client Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("1. Filename extraction and sanitization", () => {
    it("extracts RFC 5987 UTF-8 filename with Persian, spaces, and half-spaces", () => {
      const persianName = "زیست‌شناسی جامع کنکور (فصل اول).zip";
      const encoded = encodeURIComponent(persianName);
      const header = 'attachment; filename="fallback.zip"; filename*=UTF-8\'\'' + encoded;

      const result = extractContentDispositionFilename(header, "default.zip");
      expect(result).toBe("زیست‌شناسی جامع کنکور (فصل اول).zip");
    });

    it("extracts standard quoted ASCII/English filename", () => {
      const header = 'attachment; filename="math-grade-10.zip"';
      const result = extractContentDispositionFilename(header, "default.zip");
      expect(result).toBe("math-grade-10.zip");
    });

    it("sanitizes dangerous filesystem characters and path traversal", () => {
      const dangerous = '../../../etc/passwd<script>:*?\"|';
      const sanitized = sanitizeDownloadedZipFilename(dangerous);
      expect(sanitized).not.toContain("../");
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      expect(sanitized).not.toContain(":");
      expect(sanitized.endsWith(".zip")).toBe(true);
    });

    it("falls back to default filename when header is missing or empty", () => {
      expect(extractContentDispositionFilename(null, "fallback.zip")).toBe("fallback.zip");
      expect(extractContentDispositionFilename("", "fallback.zip")).toBe("fallback.zip");
      expect(extractContentDispositionFilename("invalid-header", "fallback.zip")).toBe("fallback.zip");
    });
  });

  describe("2. Error response parsing", () => {
    it("parses error from standard ErrorEnvelope (error.message)", async () => {
      const response = new Response(
        JSON.stringify({
          request_id: "req-1",
          error: {
            code: "forbidden",
            message: "دسترسی شما به این سازمان محدود شده است.",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );

      const msg = await parseExportErrorMessage(response, "خطای عمومی");
      expect(msg).toBe("دسترسی شما به این سازمان محدود شده است.");
    });

    it("parses error from flat JSON ({ message: ... })", async () => {
      const response = new Response(
        JSON.stringify({
          code: "export_failed",
          message: "دوره فاقد جلسات فعال است.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

      const msg = await parseExportErrorMessage(response, "خطای عمومی");
      expect(msg).toBe("دوره فاقد جلسات فعال است.");
    });

    it("parses error from plain text non-JSON response", async () => {
      const response = new Response("Gateway timeout from upstream proxy", {
        status: 504,
        headers: { "Content-Type": "text/plain" },
      });

      const msg = await parseExportErrorMessage(response, "خطای عمومی");
      expect(msg).toBe("Gateway timeout from upstream proxy");
    });

    it("falls back to status code messages for empty responses", async () => {
      const response404 = new Response("", { status: 404 });
      const msg404 = await parseExportErrorMessage(response404, "خطای عمومی");
      expect(msg404).toBe("دوره یا محتوای مورد نظر جهت خروجی یافت نشد.");

      const response403 = new Response("", { status: 403 });
      const msg403 = await parseExportErrorMessage(response403, "خطای عمومی");
      expect(msg403).toBe("شما دسترسی لازم برای دریافت بسته خروجی این دوره را ندارید.");
    });

    it("hides internal stack traces from user", async () => {
      const response = new Response(
        JSON.stringify({
          error: {
            code: "internal_error",
            message: "Database connection failed at queryRunner.ts:145:12",
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );

      const msg = await parseExportErrorMessage(response, "خطای عمومی");
      expect(msg).not.toContain("queryRunner.ts");
      expect(msg).toBe("خطای داخلی در پردازش درخواست خروجی محتوا.");
    });
  });

  describe("3. downloadContentExport CSRF and request flow", () => {
    it("sends x-csrf-token and credentials: include on export request", async () => {
      Object.defineProperty(document, "cookie", {
        writable: true,
        value: "avana_csrf=bound-csrf-token-12345; avana_session=session-token-xyz",
      });

      let capturedRequest: RequestInit | undefined;
      let capturedUrl: string | undefined;

      const dummyZip = new Blob([new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])], {
        type: "application/zip",
      });

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedRequest = init;
        return new Response(dummyZip, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="export.zip"',
          },
        });
      });

      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-blob");
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      await downloadContentExport({
        courseId: "course-123",
      });

      expect(capturedUrl).toContain("/v1/admin/content/export");
      expect(capturedRequest?.method).toBe("POST");
      expect(capturedRequest?.credentials).toBe("include");

      const headers = capturedRequest?.headers as Record<string, string>;
      expect(headers["x-csrf-token"]).toBe("bound-csrf-token-12345");
      expect(headers["x-request-id"]).toBeDefined();
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });
});
