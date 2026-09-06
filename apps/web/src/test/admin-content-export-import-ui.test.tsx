import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AdminContentPage } from "../pages/admin/AdminContentPage";
import { ContentImportModal } from "../components/admin/content/ContentImportModal";
import * as adminApi from "../lib/api/admin";

vi.mock("../lib/api/admin", async () => {
  const actual = await vi.importActual<typeof import("../lib/api/admin")>("../lib/api/admin");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
    },
    downloadContentExport: vi.fn(),
    validateContentImport: vi.fn(),
    executeContentImport: vi.fn(),
  };
});

describe("Admin Content Export & Import UI Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/dashboard") {
        return { totalCourses: 5, totalModules: 20, totalLessons: 50 };
      }
      if (url.startsWith("/admin/courses")) {
        return {
          courses: [
            { id: "c1", name: "داروشناسی پایه", counts: { modules: 2, lessons: 5 } },
          ],
        };
      }
      return {};
    });
  });

  it("1. Renders Export and Import buttons on AdminContentPage", async () => {
    render(<AdminContentPage />);

    await waitFor(() => {
      expect(screen.getByText("خروجی محتوا (Export)")).toBeInTheDocument();
      expect(screen.getByText("ورود محتوا (Import)")).toBeInTheDocument();
    });
  });

  it("2. Opens ContentExportModal, displays course selector and scope checkboxes, triggers export", async () => {
    render(<AdminContentPage />);

    await waitFor(() => {
      expect(screen.getByText("خروجی محتوا (Export)")).toBeInTheDocument();
    });

    // Click Export Button
    fireEvent.click(screen.getByText("خروجی محتوا (Export)"));

    // Modal title visible
    expect(screen.getByText("خروجی محتوا (Export Package)")).toBeInTheDocument();
    expect(screen.getByText("موجودیت‌های شامل در بسته")).toBeInTheDocument();

    // Click trigger export
    const exportSubmitBtn = screen.getByRole("button", { name: /دریافت خروجی/i });
    fireEvent.click(exportSubmitBtn);

    await waitFor(() => {
      expect(adminApi.downloadContentExport).toHaveBeenCalled();
    });
  });

  it("3. Opens ContentImportModal, validates package and executes import flow", async () => {
    vi.mocked(adminApi.validateContentImport).mockResolvedValue({
      planId: "plan-test-uuid",
      packageChecksum: "chk123",
      actorId: "actor-1",
      organizationId: "org-1",
      formatVersion: 1,
      source: "local-a",
      exportedAt: "2026-09-04T00:00:00Z",
      summary: {
        courses: { new: 1, existing: 0, updated: 0, conflict: 0 },
        modules: { new: 3, existing: 0, updated: 0, conflict: 0 },
        lessons: { new: 10, existing: 2, updated: 0, conflict: 0 },
        documents: { new: 0, existing: 0, updated: 0, conflict: 0 },
        generatedContents: { new: 0, existing: 0, updated: 0, conflict: 0 },
        flashcards: { new: 25, existing: 0, updated: 0, conflict: 0 },
        quizzes: { new: 2, existing: 0, updated: 0, conflict: 0 },
        questions: { new: 10, existing: 0, updated: 0, conflict: 0 },
        files: { new: 0, existing: 0 },
        totalConflicts: 0,
      },
      conflicts: [],
      expiresAt: Date.now() + 1800000,
    });

    vi.mocked(adminApi.executeContentImport).mockResolvedValue({
      batchId: "batch-1",
      success: true,
      counts: { created: 51, skipped: 2, conflicts: 0 },
      summary: {} as any,
      durationMs: 120,
    });

    const onSuccessMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <ContentImportModal
        isOpen={true}
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
      />
    );

    expect(screen.getByText("ورود محتوا (Import Content Package)")).toBeInTheDocument();

    // Simulate choosing file
    const file = new File(["dummy zip bytes"], "content.zip", { type: "application/zip" });
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: true,
    });
    fireEvent.change(fileInput);

    // Validate Package
    const validateBtn = screen.getByRole("button", { name: /بررسی و اعتبارسنجی/i });
    fireEvent.click(validateBtn);

    // Should transition to preview step
    await waitFor(() => {
      expect(screen.getByText("بسته معتبر است و ساختار اطلاعات بررسی گردید.")).toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument(); // 1 new course
      expect(screen.getByText("+3")).toBeInTheDocument(); // 3 new modules
      expect(screen.getAllByText("+10").length).toBe(2); // 10 new lessons and 10 new questions
    });

    // Execute Import
    const startImportBtn = screen.getByRole("button", { name: /شروع ورود محتوا/i });
    fireEvent.click(startImportBtn);

    // Should transition to success step
    await waitFor(() => {
      expect(
        screen.getByText("عملیات ورود محتوا با موفقیت انجام شد"),
      ).toBeInTheDocument();
      expect(screen.getByText("51")).toBeInTheDocument(); // created count
    });
  });
});
