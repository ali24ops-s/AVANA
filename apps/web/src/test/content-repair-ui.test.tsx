import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { LessonFormEditor } from "../components/review/editors/LessonFormEditor.js";
import { ContentRepairModal } from "../components/admin/repair/ContentRepairModal.js";
import * as adminApi from "../lib/api/admin.js";
import { ContentRepairEngine } from "@avana/domain";

vi.mock("../lib/api/admin.js", async () => {
  const actual = await vi.importActual("../lib/api/admin.js");
  return {
    ...actual,
    applyContentRepair: vi.fn(),
    previewContentRepair: vi.fn(),
  };
});

describe("Admin Content Repair UI & Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Does NOT render repair button when content is completely healthy (Zero False-Positive UI)", () => {
    const healthyLesson = {
      title: "درسنامه سالم فیزیولوژی",
      contentMarkdown: "# مقدمه فیزیولوژی سلولی\n\nاین یک متن آموزشی کاملاً استاندارد و سالم است.",
    };

    render(
      <LessonFormEditor
        data={healthyLesson}
        onChange={vi.fn()}
      />,
    );

    // Assert repair button is NOT shown
    const repairButton = screen.queryByRole("button", { name: /اصلاح خودکار/i });
    expect(repairButton).toBeNull();
  });

  it("2. Automatically displays repair button when corruption is detected in single-lesson editor", () => {
    const brokenLesson = {
      title: "درسنامه شیمی دارویی",
      contentMarkdown: "# واکنش هیدرولیز\n\nفرمول واکنش: textCaC_2 + 2textH 2O",
    };

    render(
      <LessonFormEditor
        data={brokenLesson}
        onChange={vi.fn()}
      />,
    );

    // Assert repair button is shown
    const repairButton = screen.getByRole("button", { name: /اصلاح خودکار/i });
    expect(repairButton).toBeDefined();
    expect(repairButton.textContent).toContain("اصلاح خودکار بخش");
  });

  it("3. Displays ContentRepairModal with diff, confidence percentage, Persian reason, and apply action", async () => {
    const brokenContent = "فرمول واکنش: textCaC_2 + 2textH 2O";
    const preview = ContentRepairEngine.preview(brokenContent);

    const onApplySuccess = vi.fn();
    const onClose = vi.fn();

    (adminApi.applyContentRepair as any).mockResolvedValueOnce({
      success: true,
      originalContent: brokenContent,
      repairedContent: "فرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}",
      contentHash: "hash_123",
      appliedCandidates: preview.candidates,
      repairedBlockCount: 1,
      validation: { valid: true, errors: [] },
    });

    render(
      <ContentRepairModal
        isOpen={true}
        onClose={onClose}
        previewData={preview}
        onApplySuccess={onApplySuccess}
      />,
    );

    // Assert modal title
    expect(screen.getByText("اصلاح هوشمند و ساختاری محتوا")).toBeDefined();

    // Assert rule label & Persian reason
    expect(screen.getByText(/خرابی دستور فرمول \/ شیمی/i)).toBeDefined();
    expect(screen.getByText(/الگوی شناخته‌شده خرابی دستورات/i)).toBeDefined();

    // Assert confidence badge
    expect(screen.getByText(/ضریب اطمینان: ۹۶٪/i)).toBeDefined();

    // Assert before and after sections
    expect(screen.getByText("قبل از اصلاح:")).toBeDefined();
    expect(screen.getByText("بعد از اصلاح:")).toBeDefined();
    expect(screen.getByText(/textCaC_2/)).toBeDefined();
    expect(screen.getByText(/\\text{CaC}_2/)).toBeDefined();

    // Click Apply
    const applyButton = screen.getByRole("button", { name: /اعمال اصلاحات/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(adminApi.applyContentRepair).toHaveBeenCalledTimes(1);
      expect(onApplySuccess).toHaveBeenCalledWith("فرمول واکنش: \\text{CaC}_2 + 2\\text{H}_2\\text{O}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("4. Interactively repairs active session in multi-session lesson editor", async () => {
    const multiSessionData = {
      title: "دوره جامع فارماکولوژی",
      contentMarkdown: "",
      sessions: [
        {
          sessionIndex: 0,
          title: "جلسه اول",
          contentMarkdown: "متن کاملاً سالم جلسه اول.",
        },
        {
          sessionIndex: 1,
          title: "جلسه دوم",
          contentMarkdown: "متن جلسه دوم همراه با نشت متادیتا:\n\n\"6945baa6-20b8-4ea3-89f8-8ba26f731440\",\n\"5de9a319-ed47-40c0-b2e8-c1fa7238faf3\"",
        },
      ],
    };

    const handleChange = vi.fn();

    const { rerender } = render(
      <LessonFormEditor
        data={multiSessionData}
        onChange={handleChange}
      />,
    );

    // On session 0 (healthy), no repair button
    expect(screen.queryByRole("button", { name: /اصلاح خودکار/i })).toBeNull();

    // Switch to session 1
    const session2Tab = screen.getByRole("button", { name: /جلسه دوم/i });
    fireEvent.click(session2Tab);

    // Now repair button should appear for session 1
    const repairButton = screen.getByRole("button", { name: /اصلاح خودکار/i });
    expect(repairButton).toBeDefined();
  });

  it("5. Displays descriptive Persian error message in modal when apply fails with DomainError / unpersisted target", async () => {
    const brokenContent = "فرمول واکنش: textCaC_2 + 2textH 2O";
    const preview = ContentRepairEngine.preview(brokenContent);

    (adminApi.applyContentRepair as any).mockRejectedValueOnce(
      new Error("درس برای ذخیره اصلاحات پیدا نشد. ابتدا درس را ذخیره کنید."),
    );

    render(
      <ContentRepairModal
        isOpen={true}
        onClose={vi.fn()}
        previewData={preview}
        onApplySuccess={vi.fn()}
      />,
    );

    const applyButton = screen.getByRole("button", { name: /اعمال اصلاحات/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(
        screen.getByText("درس برای ذخیره اصلاحات پیدا نشد. ابتدا درس را ذخیره کنید."),
      ).toBeDefined();
    });
  });
});
