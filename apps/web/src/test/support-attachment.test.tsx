import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  resolveAttachmentUrl,
  downloadAttachment,
} from "../lib/api/support.js";
import { SupportAttachmentAction } from "../components/support/SupportAttachmentAction.js";

describe("Support Attachment Utilities & Components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveAttachmentUrl", () => {
    it("handles relative paths with and without leading slash", () => {
      expect(resolveAttachmentUrl("/v1/support/attachments/test.pdf")).toBe(
        "/v1/support/attachments/test.pdf",
      );
      expect(resolveAttachmentUrl("v1/support/attachments/test.pdf")).toBe(
        "/v1/support/attachments/test.pdf",
      );
    });

    it("leaves same-origin absolute URLs intact to avoid duplicate domains", () => {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const fullUrl = `${origin}/v1/support/attachments/photo.png`;
      expect(resolveAttachmentUrl(fullUrl)).toBe(fullUrl);
    });

    it("rejects untrusted external domains to prevent credential leakage", () => {
      expect(() =>
        resolveAttachmentUrl("https://evil-attacker.com/v1/support/attachments/photo.png"),
      ).toThrow("دامنه فایل ضمیمه نامعتبر است.");
    });

    it("rejects path traversal attempts", () => {
      expect(() =>
        resolveAttachmentUrl("/v1/support/attachments/../../../etc/passwd"),
      ).toThrow("مسیر فایل ضمیمه نامعتبر است.");
    });

    it("leaves blob and data URLs intact", () => {
      expect(resolveAttachmentUrl("blob:http://localhost/uuid")).toBe("blob:http://localhost/uuid");
      expect(resolveAttachmentUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    });
  });

  describe("downloadAttachment", () => {
    it("fetches with credentials: include, x-request-id and parses UTF-8 filename", async () => {
      const persianFilename = "تصویر_خطای_سیستم.png";
      const encoded = encodeURIComponent(persianFilename);
      const mockBlob = new Blob(["image data"], { type: "image/png" });

      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/img-uuid");
      window.URL.createObjectURL = mockCreateObjectURL;

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "image/png",
          "content-disposition": `inline; filename="photo.png"; filename*=UTF-8''${encoded}`,
        }),
        blob: vi.fn().mockResolvedValue(mockBlob),
      } as unknown as Response);

      const result = await downloadAttachment("/v1/support/attachments/photo.png");

      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/support/attachments/photo.png",
        expect.objectContaining({
          credentials: "include",
          headers: expect.objectContaining({
            "x-request-id": expect.any(String),
          }),
        }),
      );
      expect(result.filename).toBe(persianFilename);
      expect(result.mimeType).toBe("image/png");
      expect(result.objectUrl).toBe("blob:http://localhost/img-uuid");
    });

    it("throws Persian error on 404 (both backend message and fallback)", async () => {
      // Backend JSON error response
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValue({ error: { message: "فایل ضمیمه یافت نشد." } }),
      } as unknown as Response);

      await expect(
        downloadAttachment("/v1/support/attachments/missing.png"),
      ).rejects.toThrow("فایل ضمیمه یافت نشد.");

      // Gateway/proxy non-JSON 404
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "text/html" }),
      } as unknown as Response);

      await expect(
        downloadAttachment("/v1/support/attachments/missing.png"),
      ).rejects.toThrow("فایل ضمیمه مورد نظر در سرور یافت نشد یا حذف شده است.");
    });

    it("throws Persian error on 403", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      await expect(
        downloadAttachment("/v1/support/attachments/secret.png"),
      ).rejects.toThrow("شما دسترسی لازم برای مشاهده یا دانلود این فایل ضمیمه را ندارید.");
    });

    it("throws Persian error on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));

      await expect(
        downloadAttachment("/v1/support/attachments/photo.png"),
      ).rejects.toThrow("خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.");
    });
  });

  describe("SupportAttachmentAction Component", () => {
    it("renders image attachment button and opens preview modal on click", async () => {
      const mockBlob = new Blob(["fake png"], { type: "image/png" });
      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-img");
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "image/png",
          "content-disposition": `inline; filename="screenshot.png"`,
        }),
        blob: vi.fn().mockResolvedValue(mockBlob),
      } as unknown as Response);

      render(
        <SupportAttachmentAction
          attachmentUrl="/v1/support/attachments/screenshot.png"
          variant="support"
        />,
      );

      const button = screen.getByRole("button", { name: "مشاهده تصویر ضمیمه" });
      expect(button).toBeDefined();

      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("screenshot.png")).toBeDefined();
      });

      // Close the modal
      const closeBtn = screen.getByRole("button", { name: "بستن" });
      fireEvent.click(closeBtn);

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-img");
    });

    it("renders PDF attachment button and triggers safe direct download", async () => {
      const mockBlob = new Blob(["fake pdf"], { type: "application/pdf" });
      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-pdf");
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="guide.pdf"`,
        }),
        blob: vi.fn().mockResolvedValue(mockBlob),
      } as unknown as Response);

      render(
        <SupportAttachmentAction
          attachmentUrl="/v1/support/attachments/guide.pdf"
          variant="user"
        />,
      );

      const button = screen.getByRole("button", { name: "دانلود فایل PDF ضمیمه" });
      expect(button).toBeDefined();

      fireEvent.click(button);

      await waitFor(() => {
        expect(clickSpy).toHaveBeenCalledTimes(1);
      });

      clickSpy.mockRestore();
    });

    it("displays Persian error message on failure without navigating or crashing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const onErrorMock = vi.fn();

      render(
        <SupportAttachmentAction
          attachmentUrl="/v1/support/attachments/deleted.png"
          onError={onErrorMock}
        />,
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      await waitFor(() => {
        expect(
          screen.getByText("فایل ضمیمه مورد نظر در سرور یافت نشد یا حذف شده است."),
        ).toBeDefined();
      });

      expect(onErrorMock).toHaveBeenCalledWith(
        "فایل ضمیمه مورد نظر در سرور یافت نشد یا حذف شده است.",
      );
    });
  });
});
