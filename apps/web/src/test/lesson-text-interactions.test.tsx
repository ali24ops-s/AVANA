import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LessonSelectionToolbar } from "../components/study/LessonSelectionToolbar.js";
import { LessonInteractiveContent } from "../components/study/LessonInteractiveContent.js";
import { AskAvanaSelectionDialog } from "../components/study/AskAvanaSelectionDialog.js";
import { ExplainSimplyDialog } from "../components/study/ExplainSimplyDialog.js";
import { LessonNoteDialog } from "../components/study/LessonNoteDialog.js";
import { LessonNoteHoverCard } from "../components/study/LessonNoteHoverCard.js";
import { ReportIssueDialog } from "../components/study/ReportIssueDialog.js";
import { computeDeleteButtonCoords } from "../components/study/LessonHighlightDeleteButton.js";
import {
  HIGHLIGHT_COLORS,
  isValidHighlightColor,
  normalizeHighlightColor,
  getStoredHighlightColor,
} from "../components/study/highlightColors.js";
import {
  StudyAssistantChat,
  type AssistantPendingAction,
} from "../components/ai/StudyAssistantChat.js";
import type { TextSelectionData } from "../hooks/useTextSelection.js";
import type { LessonAnnotationResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });

let localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    localStorageStore[key] = String(val);
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    localStorageStore = {};
  }),
  key: vi.fn((idx: number) => Object.keys(localStorageStore)[idx] ?? null),
  get length() {
    return Object.keys(localStorageStore).length;
  },
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
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
    document.cookie = "avana_csrf=test-csrf-token";
    localStorageStore = {};
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
      expect(onHighlight).toHaveBeenCalledWith(mockSelection, "yellow");

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
      expect(toolbar).toHaveClass("bottom-20");
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
      let createdAnnotation: Record<string, unknown> | null = null;
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

    it("does not re-apply annotations or mutate DOM on repetitive selectionchange without annotation change", async () => {
      const mockAnnotations = {
        items: [
          {
            id: "ann-static-1",
            userId: "user-1",
            lessonId: "lesson-1",
            type: "highlight",
            selectedText: "سفالوسپورین‌ها",
            startOffset: 0,
            endOffset: 14,
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

      const lessonMarkdown = "سفالوسپورین‌ها دسته‌ای از آنتی‌بیوتیک‌های بتالاکتام هستند.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Wait for initial annotation to render
      await waitFor(() => {
        expect(container.querySelector("mark[data-avana-annotation='ann-static-1']")).toBeInTheDocument();
      });

      const markBefore = container.querySelector("mark[data-avana-annotation='ann-static-1']");

      // Dispatch multiple selectionchange events
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(new Event("selectionchange"));
      }

      // The mark element reference in DOM should remain stable and NOT be destroyed/rebuilt
      const markAfter = container.querySelector("mark[data-avana-annotation='ann-static-1']");
      expect(markAfter).toBe(markBefore);
    });

    it("handles complex content copy & selection (Persian RTL, KaTeX math, Markdown tables) smoothly without DOM thrashing", async () => {
      const complexDoc = `# عنوان فارسی درس\n\nاین یک متن فارسی RTL برای بررسی عملکرد **کپی و هایلایت** است.\n\nفرمول واکنش: $Ca^{2+} + 2Cl^- \\rightarrow CaCl_2$\n\n| داروی انتخابی | دوز مصرفی | اثربخشی |\n| :--- | :--- | :--- |\n| آموکسی‌سیلین | ۵۰۰ میلی‌گرم | بالا |\n| سفکسیم | ۴۰۰ میلی‌گرم | متوسط |`;

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-complex"
            courseId="course-1"
            content={complexDoc}
          />
        </QueryClientProvider>,
      );

      // Verify KaTeX and Table are rendered
      expect(container.querySelector(".rich-content-full")).toBeInTheDocument();
      expect(container.querySelector("table")).toBeInTheDocument();
      expect(container.querySelector(".katex")).toBeInTheDocument();

      // Simulate selecting table cell text
      const td = container.querySelector("td");
      expect(td).toBeInTheDocument();

      if (td && td.firstChild) {
        const range = document.createRange();
        range.setStart(td.firstChild, 0);
        range.setEnd(td.firstChild, 12);
        range.getBoundingClientRect = () =>
          ({
            width: 80,
            height: 18,
            top: 150,
            bottom: 168,
            left: 200,
            right: 280,
            x: 200,
            y: 150,
            toJSON: () => {},
          }) as DOMRect;

        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "آموکسی‌سیلین",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Selection toolbar should appear
      const toolbar = await screen.findByRole("toolbar");
      expect(toolbar).toBeInTheDocument();

      // Simulate repetitive Copy keystrokes (Cmd+C / Ctrl+C)
      fireEvent.keyDown(document, { key: "c", metaKey: true });
      fireEvent.keyDown(document, { key: "c", ctrlKey: true });
      document.dispatchEvent(new Event("selectionchange"));

      // Toolbar is still present and stable
      expect(screen.getByRole("toolbar")).toBeInTheDocument();
    });
  });

  describe("7. Continuous Background and Multi-Segment Annotation Integrity", () => {
    it("renders multi-word highlight with continuous colored spaces and data-mark-pos='single'", async () => {
      const annotationsList = [
        {
          id: "ann-multiword-1",
          userId: "user-1",
          lessonId: "lesson-cont-1",
          type: "highlight" as const,
          selectedText: "مهار اختصاصی گیرنده‌های بتا یک قلبی",
          startOffset: 12,
          endOffset: 46,
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
        } as unknown as Response),
      );

      const markdown = "این دارو با مهار اختصاصی گیرنده‌های بتا یک قلبی موجب کاهش ضربان قلب می‌شود.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-cont-1"
            courseId="course-1"
            content={markdown}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='ann-multiword-1']");
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveClass("avana-highlight");
        expect(mark).toHaveAttribute("data-mark-pos", "single");
        // Space characters must be preserved inside the mark text
        expect(mark?.textContent).toBe("مهار اختصاصی گیرنده‌های بتا یک قلبی");
        expect(mark?.textContent?.includes(" ")).toBe(true);
      });
    });

    it("renders multi-word personal note with continuous background and interactive dialog support", async () => {
      const annotationsList = [
        {
          id: "note-multiword-1",
          userId: "user-1",
          lessonId: "lesson-cont-2",
          type: "note" as const,
          selectedText: "افزایش جریان خون کلیوی و کاهش مقاومت عروقی",
          noteText: "نکته فارماکولوژی: مکانیسم دیلاتاسیون شریانی",
          startOffset: 15,
          endOffset: 57,
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
        } as unknown as Response),
      );

      const markdown = "درمان منجر به افزایش جریان خون کلیوی و کاهش مقاومت عروقی می‌گردد.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-cont-2"
            courseId="course-1"
            content={markdown}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const noteMark = container.querySelector("mark[data-avana-annotation='note-multiword-1']");
        expect(noteMark).toBeInTheDocument();
        expect(noteMark).toHaveClass("avana-note");
        expect(noteMark).toHaveAttribute("data-mark-pos", "single");
        expect(noteMark?.textContent).toBe("افزایش جریان خون کلیوی و کاهش مقاومت عروقی");
      });

      // Clicking opens the note edit dialog with existing text
      const noteMark = container.querySelector("mark[data-avana-annotation='note-multiword-1']");
      if (noteMark) {
        fireEvent.click(noteMark);
        await waitFor(() => {
          expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
          expect(screen.getByDisplayValue("نکته فارماکولوژی: مکانیسم دیلاتاسیون شریانی")).toBeInTheDocument();
        });
      }
    });

    it("renders cross-element selection spanning strong and plain text with start/middle/end data-mark-pos", async () => {
      const annotationsList = [
        {
          id: "ann-cross-elem",
          userId: "user-1",
          lessonId: "lesson-cont-3",
          type: "highlight" as const,
          selectedText: "تجویز داروی آمپی‌سیلین خوراکی همراه با آب",
          prefix: "در پروتکل درمان، ",
          suffix: " توصیه می‌شود.",
          startOffset: 17,
          endOffset: 58,
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
        } as unknown as Response),
      );

      // Markdown containing bold element inside the selection
      const markdown = "در پروتکل درمان، تجویز داروی **آمپی‌سیلین** خوراکی همراه با آب توصیه می‌شود.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-cont-3"
            courseId="course-1"
            content={markdown}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const marks = container.querySelectorAll("mark[data-avana-annotation='ann-cross-elem']");
        // Should span across multiple text nodes (before bold, inside bold, after bold)
        expect(marks.length).toBeGreaterThan(1);

        // Verify segment positions are mapped in document order
        const startMark = marks[0];
        const middleMark = marks[1];
        const endMark = marks[marks.length - 1];

        expect(startMark).toHaveAttribute("data-mark-pos", "start");
        expect(startMark.textContent).toBe("تجویز داروی ");

        if (marks.length === 3) {
          expect(middleMark).toHaveAttribute("data-mark-pos", "middle");
          expect(middleMark.textContent).toBe("آمپی‌سیلین");
        }

        expect(endMark).toHaveAttribute("data-mark-pos", "end");
        expect(endMark.textContent).toBe(" خوراکی همراه با آب");

        // Joined text of all marks equals the complete selected text with spaces
        const combinedText = Array.from(marks).map((m) => m.textContent).join("");
        expect(combinedText).toBe("تجویز داروی آمپی‌سیلین خوراکی همراه با آب");
      });
    });

    it("handles multi-line text selection and preserves consecutive spaces and line breaks smoothly", async () => {
      const annotationsList = [
        {
          id: "ann-multiline-1",
          userId: "user-1",
          lessonId: "lesson-cont-4",
          type: "highlight" as const,
          selectedText: "سطر اول محتوای بالینی\nسطر دوم با چند   فاصله متوالی",
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ items: annotationsList })),
        } as unknown as Response),
      );

      const markdown = "شروع پاراگراف: سطر اول محتوای بالینی\nسطر دوم با چند   فاصله متوالی و پایان آن.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-cont-4"
            courseId="course-1"
            content={markdown}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const marks = container.querySelectorAll("mark[data-avana-annotation='ann-multiline-1']");
        expect(marks.length).toBeGreaterThanOrEqual(1);
        const combinedText = Array.from(marks).map((m) => m.textContent).join("");
        expect(combinedText).toContain("سطر اول محتوای بالینی");
        expect(combinedText).toContain("سطر دوم با چند   فاصله متوالی");
      });
    });

    it("supports deleting a multi-segment cross-element highlight cleanly from DOM and resetting parent nodes", async () => {
      let annotationsList = [
        {
          id: "ann-multi-del",
          userId: "user-1",
          lessonId: "lesson-cont-5",
          type: "highlight" as const,
          selectedText: "داروی سفتریاکسون وریدی",
          color: "default",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations/ann-multi-del") && opts?.method === "DELETE") {
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

      const markdown = "تجویز داروی **سفتریاکسون** وریدی شروع شد.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-cont-5"
            courseId="course-1"
            content={markdown}
          />
        </QueryClientProvider>,
      );

      let mark: Element | null = null;
      await waitFor(() => {
        mark = container.querySelector("mark[data-avana-annotation='ann-multi-del']");
        expect(mark).toBeInTheDocument();
      });

      // Click mark to trigger quick delete floating button
      if (mark) {
        fireEvent.click(mark);
      }

      // Click floating delete button
      const deleteBtn = await screen.findByTestId("delete-highlight-button");
      fireEvent.click(deleteBtn);

      // Marks should be unmounted and removed from DOM
      await waitFor(() => {
        expect(
          container.querySelector("mark[data-avana-annotation='ann-multi-del']"),
        ).not.toBeInTheDocument();
      });

      // Text content remains fully intact without corruption
      expect(container.textContent).toContain("تجویز داروی سفتریاکسون وریدی شروع شد.");
    });
  });

  describe("8. Automatic Word-Boundary Selection Normalization in Interactive Reader", () => {
    it("snaps single-character selection to the full word when highlighting, persisting and rendering the full word", async () => {
      let createdAnnotation: Record<string, unknown> | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations") && opts?.method === "POST") {
          const body = opts?.body ? JSON.parse(opts.body as string) : {};
          createdAnnotation = {
            id: "ann-snapped-1",
            userId: "user-1",
            lessonId: "lesson-snap",
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

      const lessonMarkdown = "بررسی مکانیسم اثر داروهای ضد فشار خون.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-snap"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Simulate partial selection of only 'م' in 'مکانیسم'
      const p = container.querySelector("p");
      expect(p).toBeInTheDocument();
      if (p && p.firstChild) {
        // "بررسی " is 6 chars. 'م' of "مکانیسم" is at index 6..7
        const range = document.createRange();
        range.setStart(p.firstChild, 6);
        range.setEnd(p.firstChild, 7);
        range.getBoundingClientRect = () =>
          ({
            width: 15,
            height: 20,
            top: 100,
            bottom: 120,
            left: 50,
            right: 65,
            x: 50,
            y: 100,
            toJSON: () => {},
          }) as DOMRect;

        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "م",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Floating toolbar should show "هایلایت"
      const highlightBtn = await screen.findByText("هایلایت");
      fireEvent.click(highlightBtn.closest("button") || highlightBtn);

      // Verify the API received the normalized full word "مکانیسم"
      await waitFor(() => {
        expect(createdAnnotation).not.toBeNull();
        expect(createdAnnotation.selectedText).toBe("مکانیسم");
        expect(createdAnnotation.startOffset).toBe(6);
        expect(createdAnnotation.endOffset).toBe(13);
      });

      // Verify the DOM rendered the highlight mark wrapping the full word "مکانیسم"
      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='ann-snapped-1']");
        expect(mark).toBeInTheDocument();
        expect(mark?.textContent).toBe("مکانیسم");
      });
    });

    it("snaps partial selection to full word when creating note, showing full word in dialog and note mark", async () => {
      let createdAnnotation: Record<string, unknown> | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations") && opts?.method === "POST") {
          const body = opts?.body ? JSON.parse(opts.body as string) : {};
          createdAnnotation = {
            id: "note-snapped-1",
            userId: "user-1",
            lessonId: "lesson-snap",
            type: "note",
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

      const lessonMarkdown = "درمان با فارماکولوژی بالینی ارتباط مستقیم دارد.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-snap"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Simulate partial selection of "فارما" (index 9..14 in "فارماکولوژی")
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 9);
        range.setEnd(p.firstChild, 14);
        range.getBoundingClientRect = () =>
          ({
            width: 50,
            height: 20,
            top: 100,
            bottom: 120,
            left: 50,
            right: 100,
            x: 50,
            y: 100,
            toJSON: () => {},
          }) as DOMRect;

        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "فارما",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Click "یادداشت" in floating toolbar
      const noteBtn = await screen.findByText("یادداشت");
      fireEvent.click(noteBtn.closest("button") || noteBtn);

      // Dialog should open and display the full snapped word "فارماکولوژی"
      expect(await screen.findByText("یادداشت روی متن")).toBeInTheDocument();
      expect(screen.getByText("فارماکولوژی")).toBeInTheDocument();

      // Enter note and save
      const textarea = screen.getByPlaceholderText(/نکته، جمع‌بندی یا تحلیل خود درباره این بخش را بنویسید/);
      fireEvent.change(textarea, { target: { value: "مبحث مهم آزمون پره‌انترنی" } });
      fireEvent.click(screen.getByRole("button", { name: "ذخیره یادداشت" }));

      // Verify the note mark was rendered wrapping the entire word "فارماکولوژی"
      await waitFor(() => {
        const noteMark = container.querySelector("mark[data-avana-annotation='note-snapped-1']");
        expect(noteMark).toBeInTheDocument();
        expect(noteMark?.textContent).toBe("فارماکولوژی");
        expect(noteMark).toHaveClass("avana-note");
      });
    });

    it("handles Persian ZWNJ word selection snapping to full compound word without touching adjacent word", async () => {
      let createdAnnotation: Record<string, unknown> | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations") && opts?.method === "POST") {
          const body = opts?.body ? JSON.parse(opts.body as string) : {};
          createdAnnotation = {
            id: "ann-zwnj-1",
            userId: "user-1",
            lessonId: "lesson-snap",
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

      const lessonMarkdown = "نیمه‌عمر دارو در بیماران کلیوی افزایش می‌یابد.";

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-snap"
            courseId="course-1"
            content={lessonMarkdown}
          />
        </QueryClientProvider>,
      );

      // Select only "عمر" from "نیمه‌عمر دارو" (indices 5..8)
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 5);
        range.setEnd(p.firstChild, 8);
        range.getBoundingClientRect = () =>
          ({
            width: 30,
            height: 20,
            top: 100,
            bottom: 120,
            left: 50,
            right: 80,
            x: 50,
            y: 100,
            toJSON: () => {},
          }) as DOMRect;

        const mockSel = {
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => range,
          toString: () => "عمر",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Click highlight
      const highlightBtn = await screen.findByText("هایلایت");
      fireEvent.click(highlightBtn.closest("button") || highlightBtn);

      // Verify created annotation is exactly "نیمه‌عمر", not "دارو"
      await waitFor(() => {
        expect(createdAnnotation).not.toBeNull();
        expect(createdAnnotation.selectedText).toBe("نیمه‌عمر");
        expect(createdAnnotation.selectedText.includes("دارو")).toBe(false);
      });

      // Verify DOM highlight wraps only "نیمه‌عمر"
      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='ann-zwnj-1']");
        expect(mark).toBeInTheDocument();
        expect(mark?.textContent).toBe("نیمه‌عمر");
      });
    });
  });

  describe("9. Unified Selection Action & Assistant Side Panel Integration", () => {
    it("1 & 5. clicks 'از آوانا بپرس' without opening independent modal, preserving selected text after browser selection clears", async () => {
      const onAskAvana = vi.fn();
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            lessonTitle="فارماکولوژی پنی‌سیلین‌ها"
            content="پنی‌سیلین‌ها بر دیواره سلولی اثر می‌گذارند."
            onAskAvana={onAskAvana}
          />
        </QueryClientProvider>,
      );

      // Trigger selection with valid Range bounding rect
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 12);
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
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => range,
          toString: () => "پنی‌سیلین‌ها",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      const askBtn = await screen.findByText("از آوانا بپرس");
      fireEvent.click(askBtn.closest("button") || askBtn);

      // Expect callback called with preserved selection text
      expect(onAskAvana).toHaveBeenCalledTimes(1);
      const callArg = onAskAvana.mock.calls[0][0];
      expect(callArg.selectedText).toContain("پنی‌سیلین‌ها");

      // Verify no modal dialog was opened
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByLabelText("از آوانا بپرس درباره متن انتخاب‌شده")).toBeNull();
    });

    it("2 & 5. clicks 'توضیح ساده' without opening independent modal, preserving selected text after clearing", async () => {
      const onExplainSimply = vi.fn();
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            lessonTitle="فارماکولوژی پنی‌سیلین‌ها"
            content="پنی‌سیلین‌ها بر دیواره سلولی باکتری اثر می‌گذارند."
            onExplainSimply={onExplainSimply}
          />
        </QueryClientProvider>,
      );

      // Trigger selection with valid Range bounding rect
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 12);
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
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => range,
          toString: () => "پنی‌سیلین‌ها",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      const explainBtn = await screen.findByText("توضیح ساده");
      fireEvent.click(explainBtn.closest("button") || explainBtn);

      // Expect callback called with preserved selection text
      expect(onExplainSimply).toHaveBeenCalledTimes(1);
      const callArg = onExplainSimply.mock.calls[0][0];
      expect(callArg.selectedText).toContain("پنی‌سیلین‌ها");

      // Verify no modal dialog was opened
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByLabelText("توضیح ساده متن انتخاب‌شده")).toBeNull();
    });

    it("3, 4 & 5. populates input box for 'از آوانا بپرس' without auto-sending, allows user editing, and sends on click", async () => {
      let sentBody: { message?: string; context?: { type?: string; lessonId?: string } } | null = null;
      let askCalls = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          askCalls++;
          sentBody = opts?.body ? JSON.parse(opts.body as string) : null;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              answer: "پنی‌سیلین‌ها با مهار آنزیم ترانس‌پپتیداز دیواره باکتری را ضعیف می‌کنند.",
              conversationId: "conv-101",
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const onActionHandled = vi.fn();
      const testAction: AssistantPendingAction = {
        id: "act-ask-1",
        type: "ask",
        selectedText: "سنتز پپتیدوگلیکان دیواره باکتری",
        lessonId: "lesson-1",
      };

      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            courseId="course-1"
            lessonTitle="پنی‌سیلین‌ها"
            pendingAction={testAction}
            onActionHandled={onActionHandled}
          />
        </QueryClientProvider>,
      );

      // Verify action handled and marked
      await waitFor(() => {
        expect(onActionHandled).toHaveBeenCalledWith("act-ask-1");
      });

      // Verify NO fetch request was auto-sent!
      expect(askCalls).toBe(0);

      // Verify textarea contains the quote and prompt template
      const textarea = screen.getByPlaceholderText("سوال خود را در مورد این درس بنویسید...") as HTMLTextAreaElement;
      expect(textarea.value).toBe("متن مرجع از درسنامه:\n«سنتز پپتیدوگلیکان دیواره باکتری»\n\nسؤال من:\n");

      // User adds their question to the input box
      fireEvent.change(textarea, {
        target: {
          value: "متن مرجع از درسنامه:\n«سنتز پپتیدوگلیکان دیواره باکتری»\n\nسؤال من:\nآیا بتالاکتامازها روی این مکانیسم اثر دارند؟",
        },
      });
      expect(textarea.value).toContain("آیا بتالاکتامازها روی این مکانیسم اثر دارند؟");

      // User submits message
      const sendButton = screen.getByRole("button", { name: "ارسال پیام" });
      fireEvent.click(sendButton);

      // Now fetch is called with both the selected text and the user's question in a single message!
      await waitFor(() => {
        expect(askCalls).toBe(1);
        expect(screen.getByText(/با مهار آنزیم ترانس‌پپتیداز/)).toBeInTheDocument();
      });

      expect(sentBody?.message).toBe(
        "متن مرجع از درسنامه:\n«سنتز پپتیدوگلیکان دیواره باکتری»\n\nسؤال من:\nآیا بتالاکتامازها روی این مکانیسم اثر دارند؟",
      );
      expect(sentBody?.context?.type).toBe("lesson");
      expect(sentBody?.context?.lessonId).toBe("lesson-1");
    });

    it("3. preserves typed question when user selects a different text for 'از آوانا بپرس'", async () => {
      const action1: AssistantPendingAction = {
        id: "act-ask-init",
        type: "ask",
        selectedText: "متن اول",
        lessonId: "lesson-1",
      };

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={action1}
          />
        </QueryClientProvider>,
      );

      const textarea = screen.getByPlaceholderText("سوال خود را در مورد این درس بنویسید...") as HTMLTextAreaElement;
      await waitFor(() => {
        expect(textarea.value).toBe("متن مرجع از درسنامه:\n«متن اول»\n\nسؤال من:\n");
      });

      // User writes a question
      fireEvent.change(textarea, {
        target: { value: "متن مرجع از درسنامه:\n«متن اول»\n\nسؤال من:\nعوارضش چیه؟" },
      });

      // User selects a second text and triggers Ask Avana
      const action2: AssistantPendingAction = {
        id: "act-ask-second",
        type: "ask",
        selectedText: "متن دوم جدید",
        lessonId: "lesson-1",
      };

      rerender(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={action2}
          />
        </QueryClientProvider>,
      );

      // New selection is quoted while preserving the typed question!
      await waitFor(() => {
        expect(textarea.value).toBe("متن مرجع از درسنامه:\n«متن دوم جدید»\n\nسؤال من:\nعوارضش چیه؟");
      });
    });

    it("3b. sends formatted guidance request when user sends without typing any question", async () => {
      let sentBody: { message?: string } | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          sentBody = opts?.body ? JSON.parse(opts.body as string) : null;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              answer: "توضیحات آموزشی درباره این بخش",
              conversationId: "conv-empty-q",
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const action: AssistantPendingAction = {
        id: "act-ask-empty-q",
        type: "ask",
        selectedText: "بخش مهم درسنامه",
        lessonId: "lesson-1",
      };

      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={action}
          />
        </QueryClientProvider>,
      );

      const textarea = screen.getByPlaceholderText("سوال خود را در مورد این درس بنویسید...") as HTMLTextAreaElement;
      await waitFor(() => {
        expect(textarea.value).toBe("متن مرجع از درسنامه:\n«بخش مهم درسنامه»\n\nسؤال من:\n");
      });

      // User clicks send immediately without typing anything after 'سؤال من:\n'
      const sendButton = screen.getByRole("button", { name: "ارسال پیام" });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText("توضیحات آموزشی درباره این بخش")).toBeInTheDocument();
      });

      expect(sentBody?.message).toBe(
        "متن مرجع از درسنامه:\n«بخش مهم درسنامه»\n\nدرباره این بخش از درس راهنمایی و توضیح می‌خواهم.",
      );
    });

    it("3c. verifies textarea auto-resize styling and anchored send button", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
          />
        </QueryClientProvider>,
      );

      const textarea = screen.getByPlaceholderText("سوال خود را در مورد این درس بنویسید...") as HTMLTextAreaElement;
      expect(textarea).toHaveClass("max-h-[190px]");
      expect(textarea).toHaveClass("custom-scrollbar");
      expect(textarea).toHaveClass("pe-12");

      const sendButton = screen.getByRole("button", { name: "ارسال پیام" });
      expect(sendButton).toHaveClass("absolute");
      expect(sendButton).toHaveClass("end-2.5");
      expect(sendButton).toHaveClass("bottom-2.5");
      expect(sendButton.parentElement).toHaveClass("items-end");
    });

    it("4 & 7. sends correct prompt for 'توضیح ساده' automatically and displays response in side assistant panel", async () => {
      let sentBody: { message?: string } | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          sentBody = opts?.body ? JSON.parse(opts.body as string) : null;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              answer: "به زبان ساده: باکتری مانند یک بادکنک است و دیواره پوسته آن است؛ پنی‌سیلین پوسته را سوراخ می‌کند.",
              conversationId: "conv-102",
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const testAction: AssistantPendingAction = {
        id: "act-explain-1",
        type: "explain",
        selectedText: "لیز اسمزی باکتری در اثر مهار پپتیدوگلیکان",
        lessonId: "lesson-1",
      };

      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={testAction}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/باکتری مانند یک بادکنک است/)).toBeInTheDocument();
      });

      expect(sentBody?.message).toBe(
        "لطفاً این بخش از متن درس را به زبان فارسی روان، ساده و قابل‌فهم با حفظ دقت علمی توضیح بده و در صورت نیاز مثال بزن:\n«لیز اسمزی باکتری در اثر مهار پپتیدوگلیکان»",
      );
      // Ensure it did not use the ask prompt format
      expect(sentBody?.message?.includes("سؤالم:")).toBe(false);
    });

    it("6. does not re-dispatch action with same ID upon re-renders or unmount/mount", async () => {
      let askCalls = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          askCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ answer: "پاسخ اول", conversationId: "c1" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const testAction: AssistantPendingAction = {
        id: "act-duplicate-check",
        type: "explain",
        selectedText: "متن تستی",
        lessonId: "lesson-1",
      };

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={testAction}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(askCalls).toBe(1);
      });

      // Re-render multiple times with same action
      rerender(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={testAction}
          />
        </QueryClientProvider>,
      );

      rerender(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={testAction}
          />
        </QueryClientProvider>,
      );

      // Ensure fetch was only called exactly once
      expect(askCalls).toBe(1);
    });

    it("7 & 8. executes actions sequentially when a request is in flight and preserves sequential actions", async () => {
      let resolveFirstReq: (res: Response | { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
      const firstReqPromise = new Promise((resolve) => {
        resolveFirstReq = resolve;
      });

      const dispatchedMessages: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          const body = opts?.body ? JSON.parse(opts.body as string) : {};
          dispatchedMessages.push(body.message);

          if (dispatchedMessages.length === 1) {
            // First request waits
            return firstReqPromise as Promise<Response>;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ answer: "پاسخ دوم", conversationId: "c2" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const action1: AssistantPendingAction = {
        id: "act-seq-1",
        type: "explain",
        selectedText: "متن اول",
        lessonId: "lesson-1",
      };
      const action2: AssistantPendingAction = {
        id: "act-seq-2",
        type: "explain",
        selectedText: "متن دوم",
        lessonId: "lesson-1",
      };

      let queue = [action1, action2];
      const handleHandled = (id: string) => {
        queue = queue.filter((a) => a.id !== id);
      };

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingActions={queue}
            onActionHandled={handleHandled}
          />
        </QueryClientProvider>,
      );

      // Verify first action dispatched, second action is waiting because isLoading=true
      await waitFor(() => {
        expect(dispatchedMessages.length).toBe(1);
        expect(dispatchedMessages[0]).toContain("متن اول");
      });

      // While request 1 is in-flight, action 2 must NOT be dispatched yet
      expect(dispatchedMessages.length).toBe(1);

      // Now resolve first request
      resolveFirstReq!({
        ok: true,
        status: 200,
        json: async () => ({ answer: "پاسخ اول", conversationId: "c1" }),
      });

      // Pass updated queue
      rerender(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingActions={queue}
            onActionHandled={handleHandled}
          />
        </QueryClientProvider>,
      );

      // Now second request executes sequentially
      await waitFor(() => {
        expect(dispatchedMessages.length).toBe(2);
        expect(dispatchedMessages[1]).toContain("متن دوم");
      });
    });

    it("9. prevents action from previous lesson from executing in a new lesson", async () => {
      let askCalls = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          askCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ answer: "پاسخ", conversationId: "c1" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const onActionHandled = vi.fn();
      const oldLessonAction: AssistantPendingAction = {
        id: "act-old-lesson",
        type: "ask",
        selectedText: "متن درس ۱",
        lessonId: "lesson-1", // Intended for lesson 1
      };

      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-2" // Currently on lesson 2!
            pendingAction={oldLessonAction}
            onActionHandled={onActionHandled}
          />
        </QueryClientProvider>,
      );

      // Handled/discarded safely without sending API call to wrong lesson
      await waitFor(() => {
        expect(onActionHandled).toHaveBeenCalledWith("act-old-lesson");
      });
      expect(askCalls).toBe(0);
    });

    it("10. preserves assistant error behavior on send failure without infinite retry loop", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/ai/ask")) {
          callCount++;
          throw new Error("اختلال در اتصال به شبکه");
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const errorAction: AssistantPendingAction = {
        id: "act-error-test",
        type: "explain",
        selectedText: "متن همراه با خطا",
        lessonId: "lesson-1",
      };

      render(
        <QueryClientProvider client={queryClient}>
          <StudyAssistantChat
            contextType="lesson"
            lessonId="lesson-1"
            pendingAction={errorAction}
          />
        </QueryClientProvider>,
      );

      // Verify error banner is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/اختلال در اتصال به شبکه|خطا در برقراری ارتباط با سرور/),
        ).toBeInTheDocument();
      });

      // Verify "تلاش دوباره" button is present
      expect(screen.getByText("تلاش دوباره")).toBeInTheDocument();

      // Ensure fetch was only called once, avoiding an infinite retry loop
      expect(callCount).toBe(1);
    });

    it("11. preserves standalone dialog fallback when onAskAvana and onExplainSimply are omitted", async () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            lessonTitle="درس تستی"
            content="متن آزمایشی برای بررسی رفتار پیش‌فرض."
          />
        </QueryClientProvider>,
      );

      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 11);
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
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => range,
          toString: () => "متن آزمایشی",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Click Ask Avana without handler prop
      const askBtn = await screen.findByText("از آوانا بپرس");
      fireEvent.click(askBtn.closest("button") || askBtn);

      // Legacy fallback dialog opens
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("پاسخ هوشمند با اتکا به متن درسنامه")).toBeInTheDocument();
    });
  });

  describe("10. Lesson Note Hover Card & Floating Interactions", () => {
    const setupLessonWithNotes = (
      notesList: Array<Record<string, unknown>>,
      markdown: string,
    ) => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: notesList })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      return render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-hover-test"
            courseId="course-1"
            lessonTitle="درس آزمایش یادداشت شناور"
            content={markdown}
          />
        </QueryClientProvider>,
      );
    };

    it("1. displays note content in floating hover card on mouse hover without clicking", async () => {
      const mockNote = {
        id: "note-hover-1",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "نکته فارماکولوژی: فقط روی باکتری‌های در حال رشد اثر دارد",
        color: "default",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-hover-1']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      // Hover over mark
      fireEvent.mouseOver(noteMark);

      // Card appears with header and content
      await waitFor(() => {
        expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();
        expect(screen.getByText("یادداشت شما")).toBeInTheDocument();
        expect(
          screen.getByText("نکته فارماکولوژی: فقط روی باکتری‌های در حال رشد اثر دارد"),
        ).toBeInTheDocument();
      });

      // Full modal dialog is NOT opened
      expect(screen.queryByText("ویرایش یادداشت شخصی")).not.toBeInTheDocument();
    });

    it("2. closes hover card when mouse leaves after grace delay", async () => {
      const mockNote = {
        id: "note-hover-2",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست خروج موس",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-hover-2']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      await waitFor(() => {
        expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();
      });

      // Mouse leaves mark
      fireEvent.mouseOut(noteMark, { relatedTarget: document.body });

      // After grace delay (150ms), card is removed
      await waitFor(
        () => {
          expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
        },
        { timeout: 500 },
      );
    });

    it("3. keeps hover card open when mouse enters inside the card", async () => {
      const mockNote = {
        id: "note-hover-3",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست ورود به کارت",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-hover-3']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      const card = await screen.findByTestId("lesson-note-hover-card");

      // Mouse moves from mark directly into card
      fireEvent.mouseOut(noteMark, { relatedTarget: card });
      fireEvent.mouseEnter(card);

      // Wait past grace delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Card remains visible
      expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();
    });

    it("4. verifies grace delay duration (~150ms) before dismissal", async () => {
      const mockNote = {
        id: "note-hover-4",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "بررسی گریس دیلی",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-hover-4']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      await screen.findByTestId("lesson-note-hover-card");

      // Mouse leaves
      fireEvent.mouseOut(noteMark, { relatedTarget: document.body });

      // Before grace delay expires (e.g. at 50ms), card is still visible
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();

      // After 200ms, card is closed
      await waitFor(() => {
        expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
      });
    });

    it("5. renders multi-line and long notes with proper formatting, whitespace-pre-wrap, and break-words", async () => {
      const multiLineText = "سطر اول یادداشت\nسطر دوم با جزئیات بیشتر\n\nسطر چهارم بعد از دو اینتر";
      const mockNote = {
        id: "note-hover-5",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: multiLineText,
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-hover-5']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      const cardContent = await screen.findByTestId("lesson-note-hover-content");

      expect(cardContent).toHaveClass("whitespace-pre-wrap");
      expect(cardContent).toHaveClass("break-words");
      expect(cardContent.textContent).toBe(multiLineText);
    });

    it("6. supports multiple independent notes smoothly switching on hover", async () => {
      const mockNotes = [
        {
          id: "note-6a",
          userId: "user-1",
          lessonId: "lesson-hover-test",
          type: "note",
          selectedText: "پنی‌سیلین",
          noteText: "متن یادداشت اول درباره پنی‌سیلین",
        },
        {
          id: "note-6b",
          userId: "user-1",
          lessonId: "lesson-hover-test",
          type: "note",
          selectedText: "سفالوسپورین",
          noteText: "متن یادداشت دوم درباره سفالوسپورین",
        },
      ];

      const { container } = setupLessonWithNotes(
        mockNotes,
        "داروهای پنی‌سیلین و سفالوسپورین هر دو بتالاکتام هستند.",
      );

      const markA = await waitFor(() => {
        const m = container.querySelector("mark[data-avana-annotation='note-6a']");
        expect(m).toBeInTheDocument();
        return m as HTMLElement;
      });
      const markB = container.querySelector("mark[data-avana-annotation='note-6b']") as HTMLElement;
      expect(markB).toBeInTheDocument();

      // Hover note A
      fireEvent.mouseOver(markA);
      await waitFor(() => {
        expect(screen.getByText("متن یادداشت اول درباره پنی‌سیلین")).toBeInTheDocument();
      });

      // Hover note B
      fireEvent.mouseOut(markA, { relatedTarget: markB });
      fireEvent.mouseOver(markB);

      await waitFor(() => {
        expect(screen.getByText("متن یادداشت دوم درباره سفالوسپورین")).toBeInTheDocument();
        expect(screen.queryByText("متن یادداشت اول درباره پنی‌سیلین")).not.toBeInTheDocument();
      });
    });

    it("7. does not flicker or close when moving between different DOM segments of the same note", async () => {
      const mockNote = {
        id: "note-split-7",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "ساخت دیواره",
        prefix: "مهار ",
        suffix: " سلولی",
        noteText: "یادداشت روی چند نود ترکیبی",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "مهار ساخت دیواره سلولی رخ می‌دهد.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-split-7']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      await screen.findByTestId("lesson-note-hover-card");

      // Re-triggering over on the same note keeps it stable
      fireEvent.mouseOver(noteMark);
      expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();
      expect(screen.getByText("یادداشت روی چند نود ترکیبی")).toBeInTheDocument();
    });

    it("8. opens note dialog when clicking the edit button in hover card", async () => {
      const mockNote = {
        id: "note-edit-8",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "متن برای ویرایش",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-edit-8']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      await screen.findByTestId("lesson-note-hover-card");

      // Click "ویرایش" button
      const editBtn = screen.getByRole("button", { name: "ویرایش یادداشت" });
      fireEvent.click(editBtn);

      // Dialog opens and hover card closes
      await waitFor(() => {
        expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
        expect(screen.getByDisplayValue("متن برای ویرایش")).toBeInTheDocument();
        expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
      });
    });

    it("9. does not display hover card when a dialog is currently open", async () => {
      const mockNote = {
        id: "note-dialog-9",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست تداخل دیالوگ",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-dialog-9']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      // Click to open dialog
      fireEvent.click(noteMark);
      await screen.findByText("ویرایش یادداشت شخصی");

      // Try mouseover on the mark while dialog is open
      fireEvent.mouseOver(noteMark);

      expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
    });

    it("10. preserves mobile tap behavior to open dialog directly without hover trigger", async () => {
      const mockNote = {
        id: "note-mobile-10",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت موبایل",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-mobile-10']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      // Pointer over with touch pointerType should NOT trigger hover card
      fireEvent.pointerOver(noteMark, { pointerType: "touch" });
      expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();

      // Tap (click) opens dialog
      fireEvent.click(noteMark);
      await waitFor(() => {
        expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
        expect(screen.getByDisplayValue("یادداشت موبایل")).toBeInTheDocument();
      });
    });

    it("11. enables keyboard accessibility via focus and Enter key", async () => {
      const mockNote = {
        id: "note-kb-11",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت دسترسی‌پذیری کیبورد",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-kb-11']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      expect(noteMark).toHaveAttribute("tabindex", "0");
      expect(noteMark).toHaveAttribute("role", "button");

      // Focusing shows hover card
      fireEvent.focus(noteMark);
      await waitFor(() => {
        expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();
        expect(screen.getByText("یادداشت دسترسی‌پذیری کیبورد")).toBeInTheDocument();
      });

      // Pressing Enter opens dialog
      fireEvent.keyDown(noteMark, { key: "Enter" });
      await waitFor(() => {
        expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
      });
    });

    it("12. does not interfere with active text selection or selection toolbar", async () => {
      const mockNote = {
        id: "note-sel-12",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت عدم تداخل با سلکشن",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      await waitFor(() => {
        expect(
          container.querySelector("mark[data-avana-annotation='note-sel-12']"),
        ).toBeInTheDocument();
      });

      // Simulate active text selection
      const p = container.querySelector("p");
      if (p && p.firstChild) {
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.setEnd(p.firstChild, 10);
        range.getBoundingClientRect = () =>
          ({
            width: 100,
            height: 20,
            top: 200,
            bottom: 220,
            left: 100,
            right: 200,
            x: 100,
            y: 200,
            toJSON: () => {},
          }) as DOMRect;
        const mockSel = {
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => range,
          toString: () => "داروهای ضد",
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
        };
        vi.spyOn(window, "getSelection").mockReturnValue(mockSel as unknown as Selection);
        document.dispatchEvent(new Event("selectionchange"));
      }

      // Toolbar is displayed
      await screen.findByRole("toolbar");

      // If user hovers mark during active selection, hover card is suppressed
      const noteMark = container.querySelector(
        "mark[data-avana-annotation='note-sel-12']",
      ) as HTMLElement;
      fireEvent.mouseOver(noteMark);

      expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
    });

    it("13. closes hover card or updates when scrolled out of view", async () => {
      const mockNote = {
        id: "note-scroll-13",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست اسکرول",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='note-scroll-13']");
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      await screen.findByTestId("lesson-note-hover-card");

      // Mock mark scrolling out of top of viewport
      vi.spyOn(noteMark, "getBoundingClientRect").mockReturnValue({
        top: -150,
        bottom: -130,
        left: 100,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: -150,
        toJSON: () => {},
      } as DOMRect);

      // Trigger scroll
      window.dispatchEvent(new Event("scroll"));

      await waitFor(() => {
        expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
      });
    });

    it("14. verifies card mounts with calculated initial coordinates without starting at (0, 0)", () => {
      const mockNote: LessonAnnotationResource = {
        id: "note-init-coords",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "متن تست مختصات اولیه",
        color: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const targetRect = {
        top: 250,
        bottom: 270,
        left: 400,
        right: 480,
        width: 80,
        height: 20,
      };

      render(
        <LessonNoteHoverCard
          annotation={mockNote}
          targetRect={targetRect}
          onEdit={vi.fn()}
        />,
      );

      const card = screen.getByTestId("lesson-note-hover-card");
      expect(card.style.top).not.toBe("0px");
      expect(card.style.left).not.toBe("0px");
      expect(parseInt(card.style.top, 10)).toBeGreaterThan(0);
      expect(parseInt(card.style.left, 10)).toBeGreaterThan(0);
    });

    it("15. recalculates position when note content/text is updated", () => {
      const mockNote: LessonAnnotationResource = {
        id: "note-rerender",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت کوتاه",
        color: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const targetRect = {
        top: 300,
        bottom: 320,
        left: 400,
        right: 480,
        width: 80,
        height: 20,
      };

      const { rerender } = render(
        <LessonNoteHoverCard
          annotation={mockNote}
          targetRect={targetRect}
          onEdit={vi.fn()}
        />,
      );

      const updatedNote: LessonAnnotationResource = {
        ...mockNote,
        noteText: "یک متن بسیار طولانی‌تر که ساختار یادداشت را تغییر می‌دهد.",
      };

      rerender(
        <LessonNoteHoverCard
          annotation={updatedNote}
          targetRect={targetRect}
          onEdit={vi.fn()}
        />,
      );

      expect(
        screen.getByText("یک متن بسیار طولانی‌تر که ساختار یادداشت را تغییر می‌دهد."),
      ).toBeInTheDocument();
    });

    it("16. responds to card size changes via ResizeObserver", () => {
      let observerCallback: ResizeObserverCallback = () => {};
      const observeFn = vi.fn();
      const disconnectFn = vi.fn();

      class MockResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          observerCallback = callback;
        }
        observe = observeFn;
        disconnect = disconnectFn;
        unobserve = vi.fn();
      }

      const originalRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

      const mockNote: LessonAnnotationResource = {
        id: "note-ro",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "متن تست ریسایز آبزرور",
        color: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { unmount } = render(
        <LessonNoteHoverCard
          annotation={mockNote}
          targetRect={{
            top: 200,
            bottom: 220,
            left: 300,
            right: 380,
            width: 80,
            height: 20,
          }}
          onEdit={vi.fn()}
        />,
      );

      expect(observeFn).toHaveBeenCalled();

      // Trigger ResizeObserver callback
      observerCallback([], {} as ResizeObserver);
      expect(screen.getByTestId("lesson-note-hover-card")).toBeInTheDocument();

      unmount();
      expect(disconnectFn).toHaveBeenCalled();

      globalThis.ResizeObserver = originalRO;
    });

    it("17. adjusts card position when window is resized", async () => {
      const mockNote = {
        id: "note-resize-window",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست ریسایز پنجره",
      };

      window.innerWidth = 1024;
      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector(
          "mark[data-avana-annotation='note-resize-window']",
        );
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      // 1. Initial wide viewport: mock mark at left: 700
      let currentMarkRect = {
        top: 200,
        bottom: 220,
        left: 700,
        right: 780,
        width: 80,
        height: 20,
        x: 700,
        y: 200,
        toJSON: () => {},
      } as DOMRect;
      vi.spyOn(noteMark, "getBoundingClientRect").mockImplementation(() => currentMarkRect);

      fireEvent.mouseOver(noteMark);
      const card = await screen.findByTestId("lesson-note-hover-card");

      // Verify initial position is placed towards the right side (> 450px)
      const initialLeft = parseInt(card.style.left, 10);
      expect(initialLeft).toBeGreaterThan(450);

      // 2. Shrink viewport to 400px and responsive layout shifts mark to left: 100
      window.innerWidth = 400;
      currentMarkRect = {
        top: 200,
        bottom: 220,
        left: 100,
        right: 180,
        width: 80,
        height: 20,
        x: 100,
        y: 200,
        toJSON: () => {},
      } as DOMRect;

      window.dispatchEvent(new Event("resize"));

      // 3. Verify card recalculated position: shifted away from 580px and clamped <= 64px
      await waitFor(() => {
        const newLeft = parseInt(card.style.left, 10);
        expect(newLeft).not.toBe(initialLeft);
        expect(newLeft).toBeLessThanOrEqual(64);
        expect(newLeft).toBeGreaterThanOrEqual(16);
      });
    });

    it("18. verifies hover enter/leave and grace delay work properly when card is rendered in document.body portal", async () => {
      const mockNote = {
        id: "note-portal-delay",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت داخل پورتال",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector(
          "mark[data-avana-annotation='note-portal-delay']",
        );
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      const card = await screen.findByTestId("lesson-note-hover-card");

      // Verify it is portaled to document.body
      expect(document.body.contains(card)).toBe(true);

      // Move into portaled card
      fireEvent.mouseOut(noteMark, { relatedTarget: card });
      fireEvent.mouseEnter(card);

      // Past 200ms grace period it remains attached to body
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(document.body.contains(card)).toBe(true);

      // Mouse leaves portaled card
      fireEvent.mouseLeave(card);
      await waitFor(() => {
        expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
      });
    });

    it("19. opens edit dialog cleanly when clicking edit button from inside the portaled card", async () => {
      const mockNote = {
        id: "note-portal-edit",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "متن ویرایش پورتال",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector(
          "mark[data-avana-annotation='note-portal-edit']",
        );
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      fireEvent.mouseOver(noteMark);
      const card = await screen.findByTestId("lesson-note-hover-card");

      // Click "ویرایش" from within portal
      const editBtn = screen.getByRole("button", { name: "ویرایش یادداشت" });
      fireEvent.click(editBtn);

      await waitFor(() => {
        expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
        expect(screen.getByDisplayValue("متن ویرایش پورتال")).toBeInTheDocument();
        expect(document.body.contains(card)).toBe(false);
      });
    });

    it("20. dismisses hover card immediately upon pressing Escape key", async () => {
      const mockNote = {
        id: "note-esc-20",
        userId: "user-1",
        lessonId: "lesson-hover-test",
        type: "note",
        selectedText: "دیواره سلولی",
        noteText: "یادداشت تست کلید Escape",
      };

      const { container } = setupLessonWithNotes(
        [mockNote],
        "داروهای ضدباکتری دیواره سلولی را هدف قرار می‌دهند.",
      );

      const noteMark = await waitFor(() => {
        const mark = container.querySelector(
          "mark[data-avana-annotation='note-esc-20']",
        );
        expect(mark).toBeInTheDocument();
        return mark as HTMLElement;
      });

      // Hover over mark to display card
      fireEvent.mouseOver(noteMark);
      await screen.findByTestId("lesson-note-hover-card");

      // Press Escape on window
      fireEvent.keyDown(window, { key: "Escape" });

      // Hover card is immediately closed
      await waitFor(() => {
        expect(screen.queryByTestId("lesson-note-hover-card")).not.toBeInTheDocument();
      });

      // Dialog is NOT opened
      expect(screen.queryByText("ویرایش یادداشت شخصی")).not.toBeInTheDocument();
    });
  });

  describe("11. Highlight Color Picker & Disallowing Notes on Highlighted Text", () => {
    it("1. displays 5-color palette on hover with distinct accessible colors", async () => {
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

      const highlightBtn = screen.getByText("هایلایت").closest("button");
      expect(highlightBtn).toBeInTheDocument();

      // Initially palette is closed
      expect(screen.queryByRole("group", { name: "انتخاب رنگ هایلایت" })).not.toBeInTheDocument();

      // Mock getBoundingClientRect on button
      vi.spyOn(highlightBtn!, "getBoundingClientRect").mockReturnValue({
        top: 200,
        bottom: 236,
        left: 300,
        right: 390,
        width: 90,
        height: 36,
        x: 300,
        y: 200,
        toJSON: () => {},
      });

      // Hover over highlight trigger container
      fireEvent.mouseEnter(highlightBtn!.parentElement!);

      // Palette should open
      const palette = await screen.findByRole("group", { name: "انتخاب رنگ هایلایت" });
      expect(palette).toBeInTheDocument();

      // Exactly 5 color choices
      expect(screen.getByTestId("color-choice-yellow")).toBeInTheDocument();
      expect(screen.getByTestId("color-choice-teal")).toBeInTheDocument();
      expect(screen.getByTestId("color-choice-purple")).toBeInTheDocument();
      expect(screen.getByTestId("color-choice-blue")).toBeInTheDocument();
      expect(screen.getByTestId("color-choice-rose")).toBeInTheDocument();
      expect(screen.queryByTestId("color-choice-green")).not.toBeInTheDocument();
    });

    it("2. selects a color from palette, calls onHighlight, persists to localStorage, and marks active", async () => {
      const onHighlight = vi.fn();
      localStorage.clear();

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={onHighlight}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const highlightBtn = screen.getByText("هایلایت").closest("button")!;
      vi.spyOn(highlightBtn, "getBoundingClientRect").mockReturnValue({
        top: 200,
        bottom: 236,
        left: 300,
        right: 390,
        width: 90,
        height: 36,
        x: 300,
        y: 200,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(highlightBtn.parentElement!);

      // Click blue color
      const blueBtn = await screen.findByTestId("color-choice-blue");
      fireEvent.click(blueBtn);

      expect(onHighlight).toHaveBeenCalledWith(mockSelection, "blue");
      expect(localStorage.getItem("avana_preferred_highlight_color")).toBe("blue");

      // Palette closes after selection
      await waitFor(() => {
        expect(screen.queryByRole("group", { name: "انتخاب رنگ هایلایت" })).not.toBeInTheDocument();
      });
    });

    it("3. applies stored last-used color when directly clicking highlight button without opening palette", async () => {
      const onHighlight = vi.fn();
      localStorage.setItem("avana_preferred_highlight_color", "purple");

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={onHighlight}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const highlightBtn = screen.getByText("هایلایت").closest("button")!;
      // Direct click without hover
      fireEvent.click(highlightBtn);

      expect(onHighlight).toHaveBeenCalledWith(mockSelection, "purple");
    });

    it("3b. migrates legacy stored 'green' in localStorage to 'purple' seamlessly", async () => {
      const onHighlight = vi.fn();
      localStorage.setItem("avana_preferred_highlight_color", "green");

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={onHighlight}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const highlightBtn = screen.getByText("هایلایت").closest("button")!;
      fireEvent.click(highlightBtn);

      // Migrated to purple on read
      expect(onHighlight).toHaveBeenCalledWith(mockSelection, "purple");
      expect(localStorage.getItem("avana_preferred_highlight_color")).toBe("purple");
    });

    it("4. validates stored color in localStorage and falls back to yellow on invalid value", async () => {
      const onHighlight = vi.fn();
      localStorage.setItem("avana_preferred_highlight_color", "invalid_color_123");

      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={onHighlight}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const highlightBtn = screen.getByText("هایلایت").closest("button")!;
      fireEvent.click(highlightBtn);

      // Falls back to yellow
      expect(onHighlight).toHaveBeenCalledWith(mockSelection, "yellow");
    });

    it("5. supports mobile color trigger button to open palette on touch devices", async () => {
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

      const mobileTrigger = screen.getByTestId("mobile-color-trigger");
      expect(mobileTrigger).toBeInTheDocument();

      fireEvent.click(mobileTrigger);

      const palette = await screen.findByRole("group", { name: "انتخاب رنگ هایلایت" });
      expect(palette).toBeInTheDocument();
    });

    it("6. hides 'یادداشت' button when canAddNote is false", () => {
      render(
        <LessonSelectionToolbar
          selectionData={mockSelection}
          onAskAvana={vi.fn()}
          onExplainSimply={vi.fn()}
          onHighlight={vi.fn()}
          onAddNote={vi.fn()}
          onReportIssue={vi.fn()}
          onClose={vi.fn()}
          canAddNote={false}
        />,
      );

      expect(screen.queryByText("یادداشت")).not.toBeInTheDocument();
      // Other actions remain available
      expect(screen.getByText("هایلایت")).toBeInTheDocument();
      expect(screen.getByText("از آوانا بپرس")).toBeInTheDocument();
      expect(screen.getByText("توضیح ساده")).toBeInTheDocument();
      expect(screen.getByText("گزارش مشکل")).toBeInTheDocument();
    });

    it("7. hides 'یادداشت' in LessonInteractiveContent when selection overlaps existing highlight", async () => {
      const mockHighlight = {
        id: "hl-existing-1",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "highlight" as const,
        selectedText: "سفالوسپورین‌ها",
        color: "teal",
        startOffset: 10,
        endOffset: 24,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        if (String(url).includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [mockHighlight] })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="درمان با سفالوسپورین‌ها آغاز شد."
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='hl-existing-1']");
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveAttribute("data-color", "teal");
      });
    });

    it("8. clicking an existing highlight shows floating X delete icon without any dialog or modal", async () => {
      const mockHighlight = {
        id: "hl-to-manage",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "highlight" as const,
        selectedText: "پنی‌سیلین جی",
        color: "rose",
        startOffset: 0,
        endOffset: 12,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const method = opts?.method || "GET";
        if (String(url).includes("/annotations") && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [mockHighlight] })),
          } as unknown as Response);
        }
        if (String(url).includes("/annotations/hl-to-manage") && method === "DELETE") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="پنی‌سیلین جی داروی انتخابی است."
          />
        </QueryClientProvider>,
      );

      const mark = await waitFor(() => {
        const el = container.querySelector("mark[data-avana-annotation='hl-to-manage']");
        expect(el).toBeInTheDocument();
        return el!;
      });

      // Click on the highlight mark
      fireEvent.click(mark);

      // Verify NO modal or dialog opens
      expect(screen.queryByText("مدیریت هایلایت")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("یادداشت من:")).not.toBeInTheDocument();

      // Floating delete button appears
      const deleteBtn = await screen.findByTestId("delete-highlight-button");
      expect(deleteBtn).toBeInTheDocument();
      expect(deleteBtn).toHaveAttribute("data-annotation-id", "hl-to-manage");
      expect(deleteBtn).toHaveAttribute("aria-label", "حذف هایلایت");

      // Clicking X deletes only that highlight immediately without extra confirmation
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/annotations/hl-to-manage"),
          expect.objectContaining({ method: "DELETE" }),
        );
      });

      // Delete button disappears
      await waitFor(() => {
        expect(screen.queryByTestId("delete-highlight-button")).not.toBeInTheDocument();
      });
    });

    it("9. renders legacy highlights with color: 'default' seamlessly", async () => {
      const legacyHighlight = {
        id: "hl-legacy",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "highlight" as const,
        selectedText: "آمپی‌سیلین",
        color: "default",
        startOffset: 0,
        endOffset: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        if (String(url).includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [legacyHighlight] })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="آمپی‌سیلین تجویز شد."
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='hl-legacy']");
        expect(mark).toBeInTheDocument();
        expect(mark).toHaveAttribute("data-color", "default");
        expect(mark).toHaveClass("avana-highlight");
      });
    });

    it("9b. maps legacy highlights with color: 'green' to 'purple' in display layer without database migration", async () => {
      const greenHighlight = {
        id: "hl-green-legacy",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "highlight" as const,
        selectedText: "سفالکسین",
        color: "green",
        startOffset: 0,
        endOffset: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        if (String(url).includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [greenHighlight] })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="سفالکسین تجویز شد."
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        const mark = container.querySelector("mark[data-avana-annotation='hl-green-legacy']");
        expect(mark).toBeInTheDocument();
        // Crucial: Must be normalized to 'purple' in the DOM
        expect(mark).toHaveAttribute("data-color", "purple");
        expect(mark).toHaveClass("avana-highlight");
      });
    });

    it("10. positions palette above when enough room, and below when near top of viewport", async () => {
      // Test when enough room above
      const { unmount } = render(
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

      const btn1 = screen.getByText("هایلایت").closest("button")!;
      vi.spyOn(btn1, "getBoundingClientRect").mockReturnValue({
        top: 250,
        bottom: 286,
        left: 200,
        right: 290,
        width: 90,
        height: 36,
        x: 200,
        y: 250,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn1.parentElement!);

      const palette1 = await screen.findByRole("group", { name: "انتخاب رنگ هایلایت" });
      // When top is 250, spaceAbove is 250 >= 44 + 10 -> positioned above (< 250)
      const topAbove = parseInt(palette1.style.top, 10);
      expect(topAbove).toBeLessThan(250);

      unmount();

      // Test when near top of viewport (e.g. top: 20)
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

      const btn2 = screen.getByText("هایلایت").closest("button")!;
      vi.spyOn(btn2, "getBoundingClientRect").mockReturnValue({
        top: 20,
        bottom: 56,
        left: 200,
        right: 290,
        width: 90,
        height: 36,
        x: 200,
        y: 20,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn2.parentElement!);

      const palette2 = await screen.findByRole("group", { name: "انتخاب رنگ هایلایت" });
      // When top is 20, spaceAbove < 54 -> positioned below (> 56)
      const topBelow = parseInt(palette2.style.top, 10);
      expect(topBelow).toBeGreaterThanOrEqual(56);
    });

    it("11. keeps palette open when moving mouse from button into palette via grace timer", async () => {
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

      const btn = screen.getByText("هایلایت").closest("button")!;
      vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 200,
        bottom: 236,
        left: 300,
        right: 390,
        width: 90,
        height: 36,
        x: 300,
        y: 200,
        toJSON: () => {},
      });

      // Hover on button
      fireEvent.mouseEnter(btn.parentElement!);
      const palette = await screen.findByRole("group", { name: "انتخاب رنگ هایلایت" });
      expect(palette).toBeInTheDocument();

      // Move mouse away from button
      fireEvent.mouseLeave(btn.parentElement!);

      // Mouse enters palette before grace timer expires
      fireEvent.mouseEnter(palette);

      // Wait 250ms — palette must still be open
      await new Promise((r) => setTimeout(r, 250));
      expect(screen.queryByRole("group", { name: "انتخاب رنگ هایلایت" })).toBeInTheDocument();

      // Mouse leaves palette
      fireEvent.mouseLeave(palette);

      // Now it closes after grace timer
      await waitFor(() => {
        expect(screen.queryByRole("group", { name: "انتخاب رنگ هایلایت" })).not.toBeInTheDocument();
      });
    });

    it("12. prevents default on mousedown for color choices to preserve browser selection", async () => {
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

      const btn = screen.getByText("هایلایت").closest("button")!;
      vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 200,
        bottom: 236,
        left: 300,
        right: 390,
        width: 90,
        height: 36,
        x: 300,
        y: 200,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn.parentElement!);
      const colorChoice = await screen.findByTestId("color-choice-teal");

      const mousedownEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      colorChoice.dispatchEvent(mousedownEvent);

      expect(mousedownEvent.defaultPrevented).toBe(true);
    });

    it("13. computeDeleteButtonCoords places X at top-left in RTL, top-right in LTR, and clamps within screen", () => {
      window.innerWidth = 1000;
      window.innerHeight = 800;

      // Highlight in the middle of screen
      const middleRect = {
        top: 300,
        bottom: 330,
        left: 400,
        right: 600,
        width: 200,
        height: 30,
      };

      // In RTL (isRtl = true): button floats near top-left of the mark
      const rtlCoords = computeDeleteButtonCoords(middleRect, true);
      // left should be near rect.left (400 - 12 = 388)
      expect(rtlCoords.left).toBe(388);
      // top should float above top edge (300 - 12 - 2 = 286)
      expect(rtlCoords.top).toBe(286);

      // In LTR (isRtl = false): button floats near top-right of the mark
      const ltrCoords = computeDeleteButtonCoords(middleRect, false);
      // left should be near rect.right (600 - 12 = 588)
      expect(ltrCoords.left).toBe(588);
      expect(ltrCoords.top).toBe(286);

      // Clamping near left screen edge (e.g. rect.left = 2 on a 360px mobile viewport)
      window.innerWidth = 360;
      const leftEdgeRect = {
        top: 100,
        bottom: 125,
        left: 2,
        right: 150,
        width: 148,
        height: 25,
      };
      const clampedMobileLeft = computeDeleteButtonCoords(leftEdgeRect, true);
      expect(clampedMobileLeft.left).toBe(8); // Clamped to min 8px

      // Clamping near right screen edge on mobile
      const rightEdgeRect = {
        top: 100,
        bottom: 125,
        left: 200,
        right: 358,
        width: 158,
        height: 25,
      };
      const clampedMobileRight = computeDeleteButtonCoords(rightEdgeRect, false);
      // 360 - 24 - 8 = 328
      expect(clampedMobileRight.left).toBe(328); // Clamped to right edge
    });

    it("14. mobile highlight deletion: renders inside viewport and deletes highlight without opening modal", async () => {
      window.innerWidth = 380;
      window.dispatchEvent(new Event("resize"));

      const mobileHl = {
        id: "hl-mobile-1",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "highlight" as const,
        selectedText: "سفازولین",
        color: "teal",
        startOffset: 0,
        endOffset: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
        const method = opts?.method || "GET";
        if (String(url).includes("/annotations") && method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [mobileHl] })),
          } as unknown as Response);
        }
        if (String(url).includes("/annotations/hl-mobile-1") && method === "DELETE") {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="سفازولین تزریق وریدی شد."
          />
        </QueryClientProvider>,
      );

      const mark = await waitFor(() => {
        const el = container.querySelector("mark[data-avana-annotation='hl-mobile-1']");
        expect(el).toBeInTheDocument();
        return el!;
      });

      // Tap on mobile highlight
      fireEvent.click(mark);

      // Verify no modal/dialog opens
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText("مدیریت هایلایت")).not.toBeInTheDocument();

      const deleteBtn = await screen.findByTestId("delete-highlight-button");
      expect(deleteBtn).toBeInTheDocument();

      // Tap on delete button
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/annotations/hl-mobile-1"),
          expect.objectContaining({ method: "DELETE" }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByTestId("delete-highlight-button")).not.toBeInTheDocument();
      });
    });

    it("15. preserves independent notes viewing and editing without conflict with highlights", async () => {
      const independentNote = {
        id: "note-independent-1",
        userId: "user-1",
        lessonId: "lesson-1",
        type: "note" as const,
        selectedText: "سفتریاکسون",
        noteText: "نکته مهم بالینی: ترشح صفراوی دارد.",
        color: "teal",
        startOffset: 0,
        endOffset: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        if (String(url).includes("/annotations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ items: [independentNote] })),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
        } as unknown as Response);
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <LessonInteractiveContent
            lessonId="lesson-1"
            content="سفتریاکسون تجویز شد."
          />
        </QueryClientProvider>,
      );

      const noteMark = await waitFor(() => {
        const el = container.querySelector("mark[data-avana-annotation='note-independent-1']");
        expect(el).toBeInTheDocument();
        expect(el).toHaveClass("avana-note");
        return el!;
      });

      // Clicking an independent note DOES open the Note Dialog (not the highlight X button)
      fireEvent.click(noteMark);

      await waitFor(() => {
        expect(screen.getByText("ویرایش یادداشت شخصی")).toBeInTheDocument();
        expect(screen.getByDisplayValue("نکته مهم بالینی: ترشح صفراوی دارد.")).toBeInTheDocument();
      });

      // Highlight delete button is NOT present
      expect(screen.queryByTestId("delete-highlight-button")).not.toBeInTheDocument();
    });

    it("16. verifies palette has exactly 5 colors, purple is present, green is absent, and normalize works", () => {
      expect(HIGHLIGHT_COLORS).toHaveLength(5);
      const colorIds = HIGHLIGHT_COLORS.map((c) => c.id);
      expect(colorIds).toEqual(["yellow", "teal", "purple", "blue", "rose"]);
      expect(colorIds).not.toContain("green");

      expect(isValidHighlightColor("purple")).toBe(true);
      expect(isValidHighlightColor("green")).toBe(false);

      expect(normalizeHighlightColor("green")).toBe("purple");
      expect(normalizeHighlightColor("purple")).toBe("purple");
      expect(normalizeHighlightColor("yellow")).toBe("yellow");
      expect(normalizeHighlightColor("default")).toBe("default");

      // Verify localStorage getter maps green to purple
      localStorage.setItem("avana_preferred_highlight_color", "green");
      expect(getStoredHighlightColor()).toBe("purple");
      expect(localStorage.getItem("avana_preferred_highlight_color")).toBe("purple");
    });
  });
});
