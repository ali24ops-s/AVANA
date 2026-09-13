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
      queries: { retry: false, gcTime: 60_000 },
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
    window.innerWidth = 1024;
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

    it("creates highlight immediately and renders mark without requiring page reload", async () => {
      let createdAnnotation: any = null;
      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations") && opts?.method === "POST") {
          const body = opts?.body ? JSON.parse(opts.body as string) : {};
          createdAnnotation = {
            id: "ann-new-123",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            color: "default",
            ...body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(createdAnnotation)),
          } as unknown as Response);
        }
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ items: createdAnnotation ? [createdAnnotation] : [] }),
              ),
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

      // Simulate text selection in jsdom
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 14);
        range.setEnd(p.firstChild, 36);
        range.getBoundingClientRect = () =>
          ({
            width: 150,
            height: 20,
            top: 100,
            bottom: 120,
            left: 50,
            right: 200,
            x: 50,
            y: 100,
            toJSON: () => {},
          }) as DOMRect;
        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "مهار ساخت دیواره سلولی",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Find Toolbar button and click
      const toolbarHighlightSpan = await screen.findByText("هایلایت");
      const button = toolbarHighlightSpan.closest("button") || toolbarHighlightSpan;
      fireEvent.click(button);

      // Verify highlight is immediately applied in DOM
      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='ann-new-123']");
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveClass("avana-highlight");
        expect(mark?.textContent).toBe("مهار ساخت دیواره سلولی");
      });
    });

    it("restores multiple highlights on complex text (headings, bold, lists) simultaneously", async () => {
      const mockAnnotations = {
        items: [
          {
            id: "ann-heading",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            selectedText: "داروشناسی بالینی",
            startOffset: 0,
            endOffset: 16,
            color: "default",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "ann-bold",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            selectedText: "آمپی‌سیلین",
            prefix: "داروی ",
            suffix: " خوراکی است",
            startOffset: 25,
            endOffset: 35,
            color: "default",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "ann-list",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            selectedText: "حساسیت شدید",
            prefix: "عوارض: ",
            suffix: " و راش پوستی",
            startOffset: 50,
            endOffset: 61,
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

      const complexMarkdown = `# داروشناسی بالینی\n\nداروی **آمپی‌سیلین** خوراکی است.\n\n* عوارض: حساسیت شدید و راش پوستی`;

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            courseId="course-1"
            content={complexMarkdown}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          container.querySelector("mark[data-avana-annotation='ann-heading']"),
        ).toBeInTheDocument();
        expect(
          container.querySelector("mark[data-avana-annotation='ann-bold']"),
        ).toBeInTheDocument();
        expect(
          container.querySelector("mark[data-avana-annotation='ann-list']"),
        ).toBeInTheDocument();
      });
    });

    it("supports clicking highlight and deleting it from DOM", async () => {
      let annotationsList = [
        {
          id: "ann-to-delete",
          userId: "user-1",
          lessonId: "lesson-1",
          type: "highlight" as const,
          selectedText: "سفالوسپورین‌ها",
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations/ann-to-delete") && opts?.method === "DELETE") {
          annotationsList = [];
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ok: true })),
          } as unknown as Response);
        }
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const lessonMarkdown = "درمان با سفالوسپورین‌ها آغاز شد.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Verify highlight is rendered
      let mark: Element | null = null;
      await waitFor(() => {
        mark = container.querySelector("mark[data-avana-annotation='ann-to-delete']");
        expect(mark).toBeInTheDocument();
      });

      // Click on highlight to open modal
      fireEvent.click(mark!);

      // Modal should show delete button for highlight
      const deleteBtn = await screen.findByRole("button", { name: /حذف/ });
      expect(deleteBtn).toBeInTheDocument();

      // Click delete
      fireEvent.click(deleteBtn);

      // Verify mark is removed from DOM
      await waitFor(() => {
        expect(
          container.querySelector("mark[data-avana-annotation='ann-to-delete']"),
        ).toBeNull();
      });
    });

    it("creates personal note via selection toolbar, submits note text, and renders note mark without 500 error", async () => {
      let annotationsList: Array<Record<string, unknown>> = [];

      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations") && opts?.method === "POST") {
          const body = JSON.parse(String(opts.body));
          const newNote = {
            id: "note-new-123",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "note",
            color: "default",
            selectedText: body.selectedText,
            prefix: body.prefix,
            suffix: body.suffix,
            startOffset: body.startOffset,
            endOffset: body.endOffset,
            noteText: body.noteText,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          annotationsList = [newNote];
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(newNote)),
          } as unknown as Response);
        }
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
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

      // Simulate text selection inside lesson container
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 14);
        range.setEnd(p.firstChild, 36);
        range.getBoundingClientRect = () =>
          ({
            width: 150,
            height: 20,
            top: 100,
            bottom: 120,
            left: 50,
            right: 200,
            x: 50,
            y: 100,
            toJSON: () => {},
          }) as DOMRect;
        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "مهار ساخت دیواره سلولی",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Click "یادداشت" in selection toolbar
      const noteButton = await screen.findByText("یادداشت");
      const button = noteButton.closest("button") || noteButton;
      fireEvent.click(button);

      // Verify LessonNoteDialog opens
      expect(await screen.findByText("یادداشت روی متن")).toBeInTheDocument();

      // Enter note text
      const textarea = screen.getByPlaceholderText(/نکته، جمع‌بندی یا تحلیل خود درباره این بخش را بنویسید/);
      fireEvent.change(textarea, {
        target: { value: "نکته فارماکولوژی: تداخل دارویی با آمینوگلیکوزیدها" },
      });

      // Submit note
      const saveButton = screen.getByRole("button", { name: "ذخیره یادداشت" });
      fireEvent.click(saveButton);

      // Verify mark is created in DOM with note styling
      await waitFor(() => {
        const noteMark = container.querySelector("mark[data-avana-annotation='note-new-123']");
        expect(noteMark).toBeInTheDocument();
        expect(noteMark).toHaveClass("avana-note");
        expect(noteMark?.getAttribute("data-annotation-type")).toBe("note");
      });
    });
  });
});
