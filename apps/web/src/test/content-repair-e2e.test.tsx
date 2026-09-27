import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { LessonFormEditor } from "../components/review/editors/LessonFormEditor.js";
import { ContentRepairModal } from "../components/admin/repair/ContentRepairModal.js";
import { RichContent } from "../components/markdown/MarkdownRenderer.js";
import * as adminApi from "../lib/api/admin.js";
import {
  ContentRepairEngine,
  splitMarkdownDocument,
  computeContentHash,
} from "@avana/domain";

vi.mock("../lib/api/admin.js", async () => {
  const actual = await vi.importActual("../lib/api/admin.js");
  return {
    ...actual,
    applyContentRepair: vi.fn(),
    previewContentRepair: vi.fn(),
  };
});

describe("Content Repair Engine — End-to-End Verification (UI, MarkdownRenderer, Render-After-Reload)", () => {
  // 10-Block Production-like Lesson Fixture
  const block1 = "# مقدمه درس شیمی دارویی و سنتز مواد";
  const block2 = "این مبحث به بررسی واکنش‌های هیدرولیز استیلیدها و ترمودینامیک تعادلی ترکیبات می‌پردازد.";
  const block3 = "## ساختار و ترکیبات هدف";
  const block4 = "کلسیم کاربید ماده اولیه کلیدی در تولید گاز استیلن با خلوص آزمایشگاهی است.";
  const block5 = "| ماده اولیه | فرمول | وزن مولکولی |\n|---|---|---|\n| آب مقطر | H2O | 18 |\n| استیلن | C2H2 | 26 |";
  const corruptedBlock6 = "فرمول واکنش اصلی به صورت textCaC_2 + 2textH 2O است.";
  const block7 = "> **هشدار ایمنی:** از تماس مستقیم با رطوبت محیط اجتناب گردد.";
  const block8 = "- گام اول: افزودن آب به کلسیم کاربید\n- گام دوم: هدایت گاز به محفظه خنک‌کننده\n- گام سوم: تیتراسیون و سنجش خلوص";
  const block9 = "$$\n\\Delta H = -127 \\text{ kJ/mol}\n$$";
  const block10 = "برای اطلاعات بیشتر به دستورالعمل ثبت‌شده در فارماکوپه مراجعه نمایید.";

  const corruptedLessonContent = [
    block1,
    block2,
    block3,
    block4,
    block5,
    corruptedBlock6,
    block7,
    block8,
    block9,
    block10,
  ].join("\n\n");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. UI Workflow: Button visibility -> Modal diff & confidence -> Cancel (no mutation) -> Apply -> Repaired state", async () => {
    // Component wrapper simulating Lesson Editor host with state
    function TestLessonHost() {
      const [lesson, setLesson] = useState({
        title: "جلسه ۱ شیمی دارویی",
        contentMarkdown: corruptedLessonContent,
      });

      return (
        <div>
          <LessonFormEditor
            data={lesson}
            onChange={(updated) => setLesson((prev) => ({ ...prev, ...updated }))}
          />
          <div data-testid="current-markdown">{lesson.contentMarkdown}</div>
        </div>
      );
    }

    render(<TestLessonHost />);

    // Step A: Assert Repair button appears because block 6 is corrupted
    const repairBtn = screen.getByRole("button", { name: /اصلاح خودکار بخش/i });
    expect(repairBtn).toBeDefined();

    // Step B: Mock API preview & apply responses
    const preview = ContentRepairEngine.preview(corruptedLessonContent);
    (adminApi.previewContentRepair as any).mockResolvedValue(preview);
    (adminApi.applyContentRepair as any).mockImplementation(async (req) => {
      const applyRes = ContentRepairEngine.apply(req.content, {
        content: req.content,
        originalHash: req.originalHash,
        appliedRuleIds: req.appliedRuleIds,
        appliedBlockIndices: req.appliedBlockIndices,
      });
      return {
        success: true,
        originalContent: req.content,
        repairedContent: applyRes.repairedContent,
        contentHash: applyRes.contentHash,
        appliedCandidates: applyRes.appliedCandidates,
        repairedBlockCount: applyRes.repairedBlockCount,
        validation: applyRes.validation,
      };
    });

    // Step C: Click repair button to open Modal
    fireEvent.click(repairBtn);

    await waitFor(() => {
      expect(screen.getByText("اصلاح هوشمند و ساختاری محتوا")).toBeDefined();
    });

    // Assert modal details
    expect(screen.getByText(/خرابی دستور فرمول \/ شیمی/i)).toBeDefined();
    expect(screen.getByText(/ضریب اطمینان: ۹۶٪/i)).toBeDefined();
    expect(screen.getAllByText(/textCaC_2/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\\text{CaC}_2/).length).toBeGreaterThanOrEqual(1);

    // Step D: Test Cancel button - content must remain unchanged
    const cancelBtn = screen.getByRole("button", { name: /انصراف/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText("اصلاح هوشمند و ساختاری محتوا")).toBeNull();
    });
    expect(screen.getByTestId("current-markdown").textContent).toBe(corruptedLessonContent);

    // Step E: Reopen modal and click Apply
    const reopenBtn = screen.getByRole("button", { name: /اصلاح خودکار بخش/i });
    fireEvent.click(reopenBtn);

    await waitFor(() => {
      expect(screen.getByText("اصلاح هوشمند و ساختاری محتوا")).toBeDefined();
    });

    const applyConfirmBtn = screen.getByRole("button", { name: /اعمال اصلاحات/i });
    fireEvent.click(applyConfirmBtn);

    // Step F: Wait for apply completion
    await waitFor(() => {
      expect(screen.queryByText("اصلاح هوشمند و ساختاری محتوا")).toBeNull();
    });

    // Step G: Assert repaired state in editor
    const updatedContent = screen.getByTestId("current-markdown").textContent!;
    expect(updatedContent).not.toContain("textCaC_2");
    expect(updatedContent).toContain("\\text{CaC}_2 + 2\\text{H}_2\\text{O}");

    // Assert block-level isolation in updated content
    const updatedBlocks = splitMarkdownDocument(updatedContent).blocks;
    expect(updatedBlocks[0].raw).toBe(block1);
    expect(updatedBlocks[1].raw).toBe(block2);
    expect(updatedBlocks[2].raw).toBe(block3);
    expect(updatedBlocks[3].raw).toBe(block4);
    expect(updatedBlocks[4].raw).toBe(block5);
    expect(updatedBlocks[5].raw).toBe(
      "فرمول واکنش اصلی به صورت \\text{CaC}_2 + 2\\text{H}_2\\text{O} است.",
    );
    expect(updatedBlocks[6].raw).toBe(block7);
    expect(updatedBlocks[7].raw).toBe(block8);
    expect(updatedBlocks[8].raw).toBe(block9);
    expect(updatedBlocks[9].raw).toBe(block10);

    // Step H: Repair button disappears now that content is healthy (Zero False Positive)
    expect(screen.queryByRole("button", { name: /اصلاح خودکار بخش/i })).toBeNull();
  });

  it("2. Rendering verification: Reloaded repaired Markdown in RichContent/MarkdownRenderer", () => {
    // 1. Repair the corrupted lesson
    const applyRes = ContentRepairEngine.apply(corruptedLessonContent, {
      content: corruptedLessonContent,
      originalHash: computeContentHash(corruptedLessonContent),
    });

    expect(applyRes.success).toBe(true);
    const reloadedMarkdown = applyRes.repairedContent;

    // 2. Render reloaded lesson in MarkdownRenderer / RichContent
    const { container } = render(<RichContent content={reloadedMarkdown} />);

    // Assert: No raw JSON string
    expect(container.textContent).not.toContain('"contentMarkdown":');
    expect(container.textContent).not.toContain('{"kind":');

    // Assert: No textCaC or corrupted vertical letters
    expect(container.textContent).not.toContain("textCaC_2");
    expect(container.textContent).not.toContain("textH");

    // Assert: LaTeX formulas are rendered via KaTeX
    const katexSpans = container.querySelectorAll(".katex");
    expect(katexSpans.length).toBeGreaterThanOrEqual(1);

    // Assert: No trailing UUID citation metadata
    expect(container.textContent).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);

    // Assert: Healthy blocks rendered correctly (headings, tables, blockquote, lists)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "مقدمه درس شیمی دارویی و سنتز مواد",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "ساختار و ترکیبات هدف",
    );
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("blockquote")).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
  });

  it("3. Regression: User modifies content and immediately clicks Auto Fix — draft ID & orgId are preserved", async () => {
    let currentLesson = {
      title: "درس فارماکولوژی",
      contentMarkdown: "محتوای اولیه سالم",
    };

    function TestHost() {
      const [lesson, setLesson] = useState(currentLesson);
      return (
        <div>
          <LessonFormEditor
            data={lesson}
            onChange={(u) => {
              setLesson(u);
              currentLesson = u;
            }}
            generatedContentId="gen-content-999"
            lessonId="lesson-888"
            organizationId="org-777"
          />
          <div data-testid="live-content">{lesson.contentMarkdown}</div>
        </div>
      );
    }

    render(<TestHost />);

    // Modify textarea content to have corrupted text
    const textarea = screen.getByPlaceholderText(/محتوای کامل درسنامه را در قالب Markdown/i);
    fireEvent.change(textarea, {
      target: { value: "محتوای جدید با واکنش textCaC_2 و خرابی" },
    });

    // Auto fix button should appear for newly typed content
    const fixButton = await screen.findByRole("button", { name: /اصلاح خودکار بخش/i });
    expect(fixButton).toBeInTheDocument();

    (adminApi.applyContentRepair as any).mockResolvedValueOnce({
      success: true,
      originalContent: "محتوای جدید با واکنش textCaC_2 و خرابی",
      repairedContent: "محتوای جدید با واکنش \\text{CaC}_2 و خرابی",
      contentHash: "hash-123",
      appliedCandidates: [],
      repairedBlockCount: 1,
      validation: { valid: true, errors: [], warnings: [] },
    });

    fireEvent.click(fixButton);

    const applyBtn = await screen.findByRole("button", { name: /اعمال اصلاحات/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(adminApi.applyContentRepair).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedContentId: "gen-content-999",
          lessonId: "lesson-888",
          organizationId: "org-777",
          content: "محتوای جدید با واکنش textCaC_2 و خرابی",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("live-content").textContent).toBe(
        "محتوای جدید با واکنش \\text{CaC}_2 و خرابی",
      );
    });
  });

  it("4. Regression: Rapid repeated clicks on Apply button do not cause duplicate in-flight requests", async () => {
    let resolveApply: (value: any) => void;
    const applyPromise = new Promise((resolve) => {
      resolveApply = resolve;
    });

    (adminApi.applyContentRepair as any).mockReturnValue(applyPromise);

    render(
      <ContentRepairModal
        isOpen={true}
        onClose={vi.fn()}
        previewData={ContentRepairEngine.preview(corruptedLessonContent)}
        generatedContentId="gen-content-100"
        onApplySuccess={vi.fn()}
      />,
    );

    const applyBtn = screen.getByRole("button", { name: /اعمال اصلاحات/i });

    // Click multiple times rapidly
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);

    expect(adminApi.applyContentRepair).toHaveBeenCalledTimes(1);

    // Resolve promise
    resolveApply!({
      success: true,
      repairedContent: "repaired",
      validation: { valid: true, errors: [] },
    });
  });
});
