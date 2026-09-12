import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LessonSelectionToolbar } from "../components/study/LessonSelectionToolbar.js";
import { LessonInteractiveContent } from "../components/study/LessonInteractiveContent.js";
import { AskAvanaSelectionDialog } from "../components/study/AskAvanaSelectionDialog.js";
import { ExplainSimplyDialog } from "../components/study/ExplainSimplyDialog.js";
import { LessonNoteDialog } from "../components/study/LessonNoteDialog.js";
import { ReportIssueDialog } from "../components/study/ReportIssueDialog.js";
import type { TextSelectionData } from "../hooks/useTextSelection.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

const mockSelection: TextSelectionData = {
  selectedText: "مهار ساخت دیواره سلولی باکتری",
  prefix: "این داروها با ",
  suffix: " موجب مرگ باکتری می‌شوند.",
  startOffset: 15,
  endOffset: 45,
  rect: {
    top: 200,
    bottom: 220,
    left: 100,
    right: 350,
    width: 250,
    height: 20,
    x: 100,
    y: 200,
    toJSON: () => {},
  },
};

describe("Lesson Text Interaction & Selection Feature Suite", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.restoreAllMocks();
  });

  describe("1. LessonSelectionToolbar Component", () => {
    it("renders all 5 exact context actions without emojis", () => {
      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={vi.fn()}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("از آوانا بپرس")).toBeInTheDocument();
      expect(screen.getByText("توضیح ساده")).toBeInTheDocument();
      expect(screen.getByText("هایلایت")).toBeInTheDocument();
      expect(screen.getByText("یادداشت")).toBeInTheDocument();
      expect(screen.getByText("گزارش مشکل")).toBeInTheDocument();
    });

    it("triggers callbacks when actions are clicked", () => {
      const onAskAvana = vi.fn();
      const onExplainSimply = vi.fn();
      const onHighlight = vi.fn();
      const onAddNote = vi.fn();
      const onReportIssue = vi.fn();

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={onAskAvana}
          onExplainSimply={onExplainSimply}
          onHighlight={onHighlight}
          onAddNote={onAddNote}
          onReportIssue={onReportIssue}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText("از آوانا بپرس"));
      expect(onAskAvana).toHaveBeenCalledWith(mockSelection);

      fireEvent.click(screen.getByText("توضیح ساده"));
      expect(onExplainSimply).toHaveBeenCalledWith(mockSelection);

      fireEvent.click(screen.getByText("هایلایت"));
      expect(onHighlight).toHaveBeenCalledWith(mockSelection);

      fireEvent.click(screen.getByText("یادداشت"));
      expect(onAddNote).toHaveBeenCalledWith(mockSelection);

      fireEvent.click(screen.getByText("گزارش مشکل"));
      expect(onReportIssue).toHaveBeenCalledWith(mockSelection);
    });

    it("renders mobile bottom action bar when viewport is small", () => {
      // Mock mobile innerWidth
      window.innerWidth = 400;
      window.dispatchEvent(new Event("resize"));

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={vi.fn()}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const toolbar = screen.getByRole("toolbar");
      expect(toolbar).toHaveClass("fixed");
      expect(toolbar).toHaveClass("bottom-4");
    });
  });

  describe("2. AskAvanaSelectionDialog Component", () => {
    it("displays the selected text context card and assistant header", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AskAvanaSelectionDialog
            isOpen={true}
            onClose={vi.fn()}
            selectionData={mockSelection}
            lessonId="lesson-1"
            lessonTitle="پنی‌سیلین‌ها"
          />
        </QueryClientProvider>,
      );

      expect(screen.getAllByText("از آوانا بپرس").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("متن انتخاب‌شده:")).toBeInTheDocument();
      expect(screen.getByText(mockSelection.selectedText)).toBeInTheDocument();
    });
  });

  describe("3. ExplainSimplyDialog Component", () => {
    it("fetches simple explanation and renders markdown answer", async () => {
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              answer: "پنی‌سیلین مثل یک خرابکار ساختمانی جلوی ساخت دیوار سلول باکتری را می‌گیرد تا بترکد.",
              conversationId: "conv-1",
            }),
          ),
      } as unknown as Response);

      render(
        <QueryClientProvider client={queryClient}>
          <ExplainSimplyDialog
            isOpen={true}
            onClose={vi.fn()}
            selectionData={mockSelection}
            lessonId="lesson-1"
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText("توضیح ساده و مفهومی")).toBeInTheDocument();
      expect(screen.getByText(mockSelection.selectedText)).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText(/پنی‌سیلین مثل یک خرابکار ساختمانی/),
        ).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/ai/ask"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("لطفاً این بخش از متن درس را به زبان فارسی ساده"),
        }),
      );
    });
  });

  describe("4. LessonNoteDialog Component", () => {
    it("allows user to enter, submit note, or delete existing note", async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onDelete = vi.fn().mockResolvedValue(undefined);

      const { rerender } = render(
        <LessonNoteDialog
          isOpen={true}
          onClose={vi.fn()}
          selectionData={mockSelection}
          onSave={onSave}
        />,
      );

      expect(screen.getByText("یادداشت روی متن")).toBeInTheDocument();
      expect(screen.getByText(mockSelection.selectedText)).toBeInTheDocument();

      const textarea = screen.getByPlaceholderText(
        /نکته، جمع‌بندی یا تحلیل خود درباره این بخش را بنویسید/,
      );
      fireEvent.change(textarea, { target: { value: "یادداشت من در مورد باکتری‌ها" } });

      fireEvent.click(screen.getByRole("button", { name: "ذخیره یادداشت" }));
      expect(onSave).toHaveBeenCalledWith("یادداشت من در مورد باکتری‌ها");

      // Rerender with existing note to test delete button
      rerender(
        <LessonNoteDialog
          isOpen={true}
          onClose={vi.fn()}
          existingNote={{
            id: "note-1",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "note",
            selectedText: mockSelection.selectedText,
            noteText: "یادداشت موجود",
            color: "default",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }}
          onSave={onSave}
          onDelete={onDelete}
        />,
      );

      expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
      const deleteBtn = screen.getByRole("button", { name: "حذف یادداشت" });
      expect(deleteBtn).toBeInTheDocument();
      fireEvent.click(deleteBtn);
      expect(onDelete).toHaveBeenCalled();
    });
  });

  describe("5. ReportIssueDialog Component", () => {
    it("allows selecting a category and submitting report with success state", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <ReportIssueDialog
          isOpen={true}
          onClose={vi.fn()}
          selectionData={mockSelection}
          onSubmit={onSubmit}
        />,
      );

      expect(screen.getByText("گزارش مشکل در متن")).toBeInTheDocument();
      expect(screen.getByText("اشتباه علمی / پزشکی")).toBeInTheDocument();
      expect(screen.getByText("غلط املایی / نگارشی")).toBeInTheDocument();

      // Select "غلط املایی / نگارشی"
      const typoRadio = screen.getByLabelText(/غلط املایی \/ نگارشی/);
      fireEvent.click(typoRadio);

      // Submit
      fireEvent.click(screen.getByRole("button", { name: "ارسال گزارش" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          category: "typo",
          comment: undefined,
        });
        expect(screen.getByText("گزارش شما ثبت شد.")).toBeInTheDocument();
      });
    });
  });

  describe("6. LessonInteractiveContent Integration & Restoration", () => {
    it("renders lesson markdown content and applies highlights", async () => {
      const mockAnnotations = {
        items: [
          {
            id: "ann-1",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            selectedText: "مهار ساخت دیواره سلولی",
            color: "default",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockAnnotations)),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const lessonMarkdown = "# پنی‌سیلین‌ها\n\nاین داروها با مهار ساخت دیواره سلولی باکتری عمل می‌کنند.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText("پنی‌سیلین‌ها")).toBeInTheDocument();

      // Verify highlighted mark element is restored
      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='ann-1']");
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveClass("avana-highlight");
        expect(mark?.textContent).toBe("مهار ساخت دیواره سلولی");
      });
    });

    it("restores notes with interactive badge and prefix/suffix fallback anchoring", async () => {
      const mockAnnotations = {
        items: [
          {
            id: "note-1",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "note",
            selectedText: "دیواره سلولی",
            prefix: "مهار ساخت ",
            suffix: " باکتری",
            startOffset: 25,
            endOffset: 37,
            noteText: "نکته فارماکولوژی: فقط روی باکتری‌های در حال رشد اثر دارد",
            color: "default",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockAnnotations)),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const lessonMarkdown = "# پنی‌سیلین‌ها\n\nاین داروها با مهار ساخت دیواره سلولی باکتری عمل می‌کنند.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            courseId="course-1"
            lessonTitle="پنی‌سیلین‌ها"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Verify restored note mark element
      await waitFor(() => {
        const noteMark = container.querySelector("mark[data-avana-annotation='note-1']");
        expect(noteMark).toBeInTheDocument();
        expect(noteMark).toHaveClass("avana-note");
        expect(noteMark?.textContent).toBe("دیواره سلولی");
      });

      // Clicking note mark opens note dialog with existing note content
      const noteMark = container.querySelector("mark[data-avana-annotation='note-1']");
      if (noteMark) {
        fireEvent.click(noteMark);
        await waitFor(() => {
          expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
          expect(
            screen.getByDisplayValue("نکته فارماکولوژی: فقط روی باکتری‌های در حال رشد اثر دارد"),
          ).toBeInTheDocument();
        });
      }
    });

    it("ensures opening dialog preserves selection context without anchor loss", () => {
      const onClose = vi.fn();
      render(
        <QueryClientProvider client={queryClient}>
          <AskAvanaSelectionDialog
            isOpen={true}
            onClose={onClose}
            selectionData={mockSelection}
            lessonId="lesson-1"
            lessonTitle="درس ۱"
          />
        </QueryClientProvider>,
      );

      // Context must be preserved
      expect(screen.getByText(mockSelection.selectedText)).toBeInTheDocument();

      // Press Escape or Close
      fireEvent.click(screen.getByRole("button", { name: "بستن پنجره" }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
