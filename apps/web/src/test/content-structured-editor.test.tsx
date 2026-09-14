import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditContentDialog } from "../components/review/EditContentDialog.js";
import type { GeneratedContentResource } from "@avana/contracts";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("Structured Content Editor (No Raw JSON)", () => {
  let queryClient: QueryClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-1",
            content: {
              id: "c-1",
              status: "draft",
              payload: {},
            },
          }),
        ),
    } as unknown as Response);
  });

  // ---------------------------------------------------------------------------
  // 1. LESSON EDITOR
  // ---------------------------------------------------------------------------
  describe("Lesson Form Editor", () => {
    const lessonContent: GeneratedContentResource = {
      id: "lesson-1",
      document_id: "doc-1",
      course_id: "course-1",
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فارماکودینامیک مقدماتی",
        contentMarkdown: "این یک درسنامه آموزشی در رابطه با گیرنده‌ها است.",
        citationChunkIds: ["chunk-1"],
      },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("renders structured fields and does not show raw JSON", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={lessonContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      // Verify no raw JSON textarea exists
      expect(screen.queryByText(/داده‌های JSON/i)).not.toBeInTheDocument();

      // Verify clean lesson fields
      expect(screen.getByLabelText(/عنوان درسنامه/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue("فارماکودینامیک مقدماتی")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("این یک درسنامه آموزشی در رابطه با گیرنده‌ها است."),
      ).toBeInTheDocument();
    });

    it("allows editing title and markdown content, and sends updated domain payload", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={lessonContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      const titleInput = screen.getByLabelText(/عنوان درسنامه/i);
      fireEvent.change(titleInput, { target: { value: "فارماکودینامیک پیشرفته" } });

      const contentTextarea = screen.getByDisplayValue(
        "این یک درسنامه آموزشی در رابطه با گیرنده‌ها است.",
      );
      fireEvent.change(contentTextarea, {
        target: { value: "متن ویرایش‌شده درسنامه با نکات جدید." },
      });

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
        const patchCall = fetchSpy.mock.calls.find(
          ([url, init]) =>
            url.toString().includes("/generated/lesson-1") &&
            init?.method === "PATCH",
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall![1]!.body as string);
        expect(body.payload.title).toBe("فارماکودینامیک پیشرفته");
        expect(body.payload.contentMarkdown).toBe(
          "متن ویرایش‌شده درسنامه با نکات جدید.",
        );
        expect(body.payload.kind).toBe("lesson");
      });
    });

    it("supports multi-session lesson editing and session tab switching", async () => {
      const multiSessionLesson: GeneratedContentResource = {
        ...lessonContent,
        payload: {
          kind: "lesson",
          title: "دوره جامع فارماکولوژی",
          sessions: [
            {
              sessionIndex: 0,
              title: "جلسه اول: آشنایی",
              contentMarkdown: "محتوای جلسه اول",
            },
            {
              sessionIndex: 1,
              title: "جلسه دوم: فارماکوکینتیک",
              contentMarkdown: "محتوای جلسه دوم",
            },
          ],
        },
      };

      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={multiSessionLesson}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText("جلسه اول: آشنایی")).toBeInTheDocument();
      expect(screen.getByText("جلسه دوم: فارماکوکینتیک")).toBeInTheDocument();
      expect(screen.getByDisplayValue("محتوای جلسه اول")).toBeInTheDocument();

      // Switch to session 2
      fireEvent.click(screen.getByText("جلسه دوم: فارماکوکینتیک"));
      expect(screen.getByDisplayValue("محتوای جلسه دوم")).toBeInTheDocument();

      // Edit session 2 content
      fireEvent.change(screen.getByDisplayValue("محتوای جلسه دوم"), {
        target: { value: "محتوای به‌روزشده جلسه دوم" },
      });

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(([url]) =>
          url.toString().includes("/generated/lesson-1"),
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall![1]!.body as string);
        expect(body.payload.sessions).toHaveLength(2);
        expect(body.payload.sessions[1].contentMarkdown).toBe(
          "محتوای به‌روزشده جلسه دوم",
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. FLASHCARD EDITOR
  // ---------------------------------------------------------------------------
  describe("Flashcard Form Editor", () => {
    const flashcardContent: GeneratedContentResource = {
      id: "fc-1",
      document_id: "doc-1",
      course_id: "course-1",
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: [
          {
            question: "آگونیست بتا-۲ انتخابی چیست؟",
            answer: "سالبوتامول (Salbutamol)",
            explanation: "در درمان برونکواسپاسم استفاده می‌شود.",
            difficulty: "easy",
          },
        ],
      },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("renders front, back, and explanation without any raw JSON", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={flashcardContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      // Verify no raw JSON exists
      expect(screen.queryByText(/داده‌های JSON/i)).not.toBeInTheDocument();

      expect(
        screen.getByDisplayValue("آگونیست بتا-۲ انتخابی چیست؟"),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("سالبوتامول (Salbutamol)"),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("در درمان برونکواسپاسم استفاده می‌شود."),
      ).toBeInTheDocument();
    });

    it("allows editing front and back and adding a new card", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={flashcardContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      // Edit first card
      const frontInput = screen.getByDisplayValue("آگونیست بتا-۲ انتخابی چیست؟");
      fireEvent.change(frontInput, {
        target: { value: "آگونیست بتا-۲ انتخابی در حمله آسم چیست؟" },
      });

      // Add second card
      const addCardBtn = screen.getByRole("button", {
        name: /افزودن فلش‌کارت جدید/i,
      });
      fireEvent.click(addCardBtn);

      // Should now have 2 cards
      // Find the new card's front & back textareas using placeholders and fill them
      const frontInputs = screen.getAllByPlaceholderText(/سؤال، واژه یا مفهوم روی کارت/i);
      const answerInputs = screen.getAllByPlaceholderText(/پاسخ مستقیم و کوتاه پشت کارت/i);
      fireEvent.change(frontInputs[1], { target: { value: "آنتاگونیست بتا-۱ چیست؟" } });
      fireEvent.change(answerInputs[1], { target: { value: "متوپرولول" } });

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(([url]) =>
          url.toString().includes("/generated/fc-1"),
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall![1]!.body as string);
        expect(body.payload.cards).toHaveLength(2);
        expect(body.payload.cards[0].question).toBe(
          "آگونیست بتا-۲ انتخابی در حمله آسم چیست؟",
        );
        expect(body.payload.cards[1].question).toBe("آنتاگونیست بتا-۱ چیست؟");
        expect(body.payload.cards[1].answer).toBe("متوپرولول");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. EXAM / MCQ EDITOR
  // ---------------------------------------------------------------------------
  describe("Exam / MCQ Form Editor", () => {
    const examContent: GeneratedContentResource = {
      id: "quiz-1",
      document_id: "doc-1",
      course_id: "course-1",
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون فارماکولوژی بالینی",
        questions: [
          {
            question: "کدام دارو مهارکننده اختصاصی آنزیم ACE است؟",
            choices: ["کاپتوپریل", "لوزارتان", "آملودیپین", "آتنولول"],
            correctAnswer: "کاپتوپریل",
            explanation: "کاپتوپریل مهارکننده آنژیووتانسین کانورتینگ آنزیم است.",
            difficulty: "medium",
          },
        ],
      },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("renders question text, choices, correct answer selection, and explanation without JSON", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={examContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      expect(screen.queryByText(/داده‌های JSON/i)).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("آزمون فارماکولوژی بالینی")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("کدام دارو مهارکننده اختصاصی آنزیم ACE است؟"),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("کاپتوپریل")).toBeInTheDocument();
      expect(screen.getByDisplayValue("لوزارتان")).toBeInTheDocument();
      expect(screen.getByText("پاسخ صحیح")).toBeInTheDocument();
    });

    it("allows editing question text, changing choices, selecting new correct answer, and saving", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={examContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      // Change question text
      const qTextarea = screen.getByDisplayValue(
        "کدام دارو مهارکننده اختصاصی آنزیم ACE است؟",
      );
      fireEvent.change(qTextarea, {
        target: { value: "کدام دارو مهارکننده آنزیم ACE با گروه سولفیدریل است؟" },
      });

      // Change choice 2 to correct answer by clicking its toggle button
      const choiceToggles = screen.getAllByTitle("انتخاب به عنوان پاسخ صحیح");
      fireEvent.click(choiceToggles[0]);

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(([url]) =>
          url.toString().includes("/generated/quiz-1"),
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall![1]!.body as string);
        expect(body.payload.questions).toHaveLength(1);
        expect(body.payload.questions[0].question).toBe(
          "کدام دارو مهارکننده آنزیم ACE با گروه سولفیدریل است؟",
        );
        expect(body.payload.questions[0].correctAnswer).toBe("لوزارتان");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ACCEPTED CONTENT EDITING
  // ---------------------------------------------------------------------------
  describe("Editing Accepted Content", () => {
    const acceptedLesson: GeneratedContentResource = {
      id: "accepted-lesson-1",
      document_id: "doc-1",
      course_id: "course-1",
      type: "lesson",
      status: "accepted",
      payload: {
        kind: "lesson",
        title: "درسنامه تأیید شده",
        contentMarkdown: "محتوای تأیید شده اولیه",
      },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("renders with accepted badge and header title 'ویرایش محتوای منتشرشده'", () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={acceptedLesson}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText("ویرایش محتوای منتشرشده")).toBeInTheDocument();
      expect(screen.getByText("تایید و منتشر شده")).toBeInTheDocument();
    });

    it("saves edits on accepted content without downgrading", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={acceptedLesson}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );

      const titleInput = screen.getByDisplayValue("درسنامه تأیید شده");
      fireEvent.change(titleInput, { target: { value: "درسنامه تأیید شده (ویرایش ۲)" } });

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const patchCall = fetchSpy.mock.calls.find(([url]) =>
          url.toString().includes("/generated/accepted-lesson-1"),
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall![1]!.body as string);
        expect(body.payload.title).toBe("درسنامه تأیید شده (ویرایش ۲)");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. DIRTY TRACKING & UNSAVED CHANGES CONFIRMATION
  // ---------------------------------------------------------------------------
  describe("Dirty Tracking & Discard Alert", () => {
    const lessonContent: GeneratedContentResource = {
      id: "lesson-dirty",
      document_id: "doc-1",
      course_id: "course-1",
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "درس اولیه",
        contentMarkdown: "محتوا",
      },
      prompt_version: null,
      model: null,
      token_usage: { input_tokens: 10, output_tokens: 20 },
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("shows discard confirmation when user modified form and clicks cancel", async () => {
      const onCloseSpy = vi.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <EditContentDialog
            content={lessonContent}
            organizationId="org-1"
            courseId="course-1"
            isOpen={true}
            onClose={onCloseSpy}
          />
        </QueryClientProvider>,
      );

      // Modify form
      const titleInput = screen.getByDisplayValue("درس اولیه");
      fireEvent.change(titleInput, { target: { value: "درس دستکاری شده" } });

      // Click cancel
      const cancelBtn = screen.getByRole("button", { name: "انصراف" });
      fireEvent.click(cancelBtn);

      // Expect discard confirmation modal
      expect(screen.getByText("تغییرات ذخیره‌نشده")).toBeInTheDocument();
      expect(onCloseSpy).not.toHaveBeenCalled();

      // Click continue editing
      const continueBtn = screen.getByRole("button", { name: "ادامه ویرایش" });
      fireEvent.click(continueBtn);
      expect(screen.queryByText("تغییرات ذخیره‌نشده")).not.toBeInTheDocument();
      expect(onCloseSpy).not.toHaveBeenCalled();

      // Click cancel again, then confirm discard
      fireEvent.click(cancelBtn);
      const discardBtn = screen.getByRole("button", {
        name: "لغو تغییرات و خروج",
      });
      fireEvent.click(discardBtn);
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });
  });
});
