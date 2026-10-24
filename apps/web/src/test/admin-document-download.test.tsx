import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAdminApi } from "../lib/api/admin.js";

describe("Admin API Client - downloadDocument (RFC 6266 / UTF-8 & Errors)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully downloads file and decodes Persian UTF-8 filename from Content-Disposition header", async () => {
    const rawClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const adminApi = createAdminApi(rawClient);

    const persianFilename = "جزوه_آناتومی_و_فیزیولوژی.pdf";
    const encoded = encodeURIComponent(persianFilename);
    const mockBlob = new Blob(["fake pdf content"], { type: "application/pdf" });

    const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-uuid");
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    const createElementSpy = vi.spyOn(window.document, "createElement").mockReturnValue(mockAnchor as any);
    const appendChildSpy = vi.spyOn(window.document.body, "appendChild").mockImplementation(() => mockAnchor as any);
    const removeChildSpy = vi.spyOn(window.document.body, "removeChild").mockImplementation(() => mockAnchor as any);

    const globalFetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encoded}`,
      }),
      blob: vi.fn().mockResolvedValue(mockBlob),
    } as unknown as Response);

    await adminApi.downloadDocument("doc-123", "fallback.pdf");

    expect(globalFetchSpy).toHaveBeenCalledTimes(1);
    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(mockAnchor.download).toBe(persianFilename);
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-uuid");

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("throws Persian error message when download fails with 404", async () => {
    const rawClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const adminApi = createAdminApi(rawClient);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockResolvedValue({ code: "not_found", message: "فایل مورد نظر در سرور ذخیره‌سازی یافت نشد." }),
    } as unknown as Response);

    await expect(adminApi.downloadDocument("doc-404")).rejects.toThrow(
      "فایل مورد نظر در سرور ذخیره‌سازی یافت نشد."
    );
  });

  it("throws forbidden error message when user lacks permission", async () => {
    const rawClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const adminApi = createAdminApi(rawClient);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockResolvedValue({ code: "forbidden", message: "شما دسترسی لازم برای دانلود این فایل را ندارید." }),
    } as unknown as Response);

    await expect(adminApi.downloadDocument("doc-403")).rejects.toThrow(
      "شما دسترسی لازم برای دانلود این فایل را ندارید."
    );
  });
});
