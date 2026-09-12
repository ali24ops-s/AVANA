import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { StudyAssistantChat } from "../components/ai/StudyAssistantChat.js";

describe("StudyAssistantChat Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders header, lesson badge, and quick suggestion prompts in lesson mode", () => {
    render(
      <StudyAssistantChat
        contextType="lesson"
        lessonId="lesson-123"
        lessonTitle="مکانیسم اثر بتابلاکرها"
        moduleTitle="فارماکولوژی قلب"
        courseTitle="فارماکولوژی ۱"
      />,
    );

    expect(screen.getByText("از آوانا بپرس")).toBeInTheDocument();
    expect(screen.getByText(/درس: مکانیسم اثر بتابلاکرها/)).toBeInTheDocument();
    expect(screen.getByText("مفاهیم کلیدی این درس چیه؟")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("سوال خود را در مورد این درس بنویسید..."),
    ).toBeInTheDocument();
  });

  it("renders in dashboard mode with general product and study prompt placeholders", () => {
    render(<StudyAssistantChat contextType="dashboard" />);

    expect(screen.getByText("از آوانا بپرس")).toBeInTheDocument();
    expect(screen.getByText("دستیار هوشمند و راهنمای یادگیری آوانا")).toBeInTheDocument();
    expect(screen.getByText("چطور از آوانا بهترین استفاده را داشته باشم؟")).toBeInTheDocument();
    expect(screen.getByText("چطور از PDF درس، فلش‌کارت و آزمون بسازم؟")).toBeInTheDocument();
    expect(screen.getByText("برای امتحان چطور با آوانا مطالعه کنم؟")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("سوال خود را درباره امکانات آوانا یا روش مطالعه بنویسید..."),
    ).toBeInTheDocument();
  });

  it("submits question to /v1/ai/ask and renders markdown response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-1",
            answer: "**پروپرانولول** گیرنده‌های بتا را مهار می‌کند.",
            conversationId: "conv-999",
            sources: {
              lessonTitle: "مکانیسم اثر بتابلاکرها",
            },
          }),
        ),
    } as Response);

    render(
      <StudyAssistantChat
        contextType="lesson"
        lessonId="lesson-123"
        lessonTitle="مکانیسم اثر بتابلاکرها"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "سوال خود را در مورد این درس بنویسید...",
    );
    fireEvent.change(textarea, { target: { value: "پروپرانولول چطور عمل میکنه؟" } });

    const submitBtn = screen.getByRole("button", { name: /ارسال/i });
    fireEvent.click(submitBtn);

    // Verify user message appears
    expect(
      screen.getByText("پروپرانولول چطور عمل میکنه؟"),
    ).toBeInTheDocument();

    // Verify loading indicator is displayed
    expect(
      screen.getByText(/آوانا در حال اندیشیدن/i),
    ).toBeInTheDocument();

    // Wait for AI response to render
    await waitFor(() => {
      expect(
        screen.getByText(/گیرنده‌های بتا را مهار می‌کند/),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("پاسخ مستند بر درس: مکانیسم اثر بتابلاکرها"),
    ).toBeInTheDocument();

    // Verify fetch call payload
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/ai/ask"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "پروپرانولول چطور عمل میکنه؟",
          context: {
            type: "lesson",
            lessonId: "lesson-123",
          },
        }),
      }),
    );
  });

  it("handles API errors gracefully and provides retry button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            error: {
              code: "internal_error",
              message: "سرویس هوش مصنوعی موقتاً در دسترس نیست.",
            },
          }),
        ),
    } as Response);

    render(
      <StudyAssistantChat
        contextType="lesson"
        lessonId="lesson-123"
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "سوال خود را در مورد این درس بنویسید...",
    );
    fireEvent.change(textarea, { target: { value: "تست خطا" } });

    const submitBtn = screen.getByRole("button", { name: /ارسال/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/سرویس هوش مصنوعی موقتاً در دسترس نیست/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("تلاش دوباره")).toBeInTheDocument();
  });

  it("send button is inside input, initially disabled/muted, and activates when user types", () => {
    render(<StudyAssistantChat contextType="dashboard" />);

    const textarea = screen.getByPlaceholderText(
      "سوال خود را درباره امکانات آوانا یا روش مطالعه بنویسید...",
    );
    const submitBtn = screen.getByRole("button", { name: /ارسال پیام/i });

    // Initially empty -> disabled & muted
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveClass("opacity-40");
    expect(submitBtn).toHaveClass("cursor-not-allowed");

    // User types text -> enabled & vibrant
    fireEvent.change(textarea, { target: { value: "چطور از فلش‌کارت‌ها استفاده کنم؟" } });
    expect(submitBtn).not.toBeDisabled();
    expect(submitBtn).toHaveClass("opacity-100");
    expect(submitBtn).toHaveClass("cursor-pointer");

    // User clears text -> disabled & muted again
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveClass("opacity-40");
  });

  it("submits question via Enter key and resets input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            answer: "پاسخ دستیار با اینتر",
            conversationId: "conv-123",
          }),
        ),
    } as Response);

    render(<StudyAssistantChat contextType="dashboard" />);

    const textarea = screen.getByPlaceholderText(
      "سوال خود را درباره امکانات آوانا یا روش مطالعه بنویسید...",
    );
    fireEvent.change(textarea, { target: { value: "سوال تستی با اینتر" } });

    // Press Enter
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("پاسخ دستیار با اینتر")).toBeInTheDocument();
    });

    // Textarea should be reset
    expect(textarea).toHaveValue("");
  });

  it("renders in exam_question mode with heading, topic, and keyPoint", () => {
    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-exam-1",
          questionNumber: 3,
          questionText: "مکانیسم اثر آملودیپین چیست؟",
          choices: ["بلوک کانال کلسیم", "مهار ACE", "بلوک بتا"],
          selectedChoice: "بلوک کانال کلسیم",
          topic: "فارماکولوژی قلب",
          keyPoint: "آملودیپین یک دی‌هیدروپیریدین با اثر انتخابی روی عروق است.",
        }}
        autoStartGuidance={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "تحلیل هوشمند آوانا", level: 2 })).toBeInTheDocument();
    // Verify the subtitle line under تحلیل هوشمند آوانا is completely removed
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();
    expect(screen.getByRole("heading", { name: /راهنمای مفهومی سوال/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByText("نکته کلیدی:")).toBeInTheDocument();
    expect(screen.getByText("آملودیپین یک دی‌هیدروپیریدین با اثر انتخابی روی عروق است.")).toBeInTheDocument();

    // Verify the unwanted static sentence was removed
    expect(
      screen.queryByText(/به تعاریف پایه، مکانیسم‌های دارویی\/پاتوفیزیولوژی و تفاوت‌های اختصاصی هر گزینه با سایرین دقت فرمایید/),
    ).toBeNull();
  });

  it("auto-starts guidance in exam_question mode with pedagogical prompt without leaking answer", async () => {
    let capturedBody: { message?: string; context?: { type?: string } } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      if (options?.body) {
        capturedBody = JSON.parse(options.body as string);
      }
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              answer: "به کانال‌های کلسیمی نوع L در عضلات صاف عروق توجه فرمایید.",
              conversationId: "conv-exam-1",
            }),
          ),
      } as Response;
    });

    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-exam-2",
          questionNumber: 2,
          questionText: "کدام دارو دیورتیک تیازیدی است؟",
          choices: ["هیدروکلروتیازید", "فوروزماید", "اسپیرونولاکتون"],
          selectedChoice: "هیدروکلروتیازید",
          topic: "کلیه و فشار خون",
        }}
        autoStartGuidance={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/به کانال‌های کلسیمی نوع L در عضلات صاف عروق توجه فرمایید/),
      ).toBeInTheDocument();
    });

    // Verify prompt content sent to API
    expect(capturedBody).toBeDefined();
    expect(capturedBody.message).toContain("کدام دارو دیورتیک تیازیدی است؟");
    expect(capturedBody.message).toContain("هیدروکلروتیازید");
    expect(capturedBody.message).toContain("کلیه و فشار خون");
    expect(capturedBody.message).toContain("هرگز و به هیچ وجه پاسخ صحیح را مستقیماً لو ندهید");
    expect(capturedBody.message).toContain("وضعیت منبع حقیقت (عدم وجود درسنامه متصل)");
    expect(capturedBody.message).toContain("هرگز وانمود نکنید که پاسخ بر اساس متن درس است");
    expect(capturedBody.message).toContain("[خارج از منبع درس]");
    expect(capturedBody.context.type).toBe("dashboard");
  });

  it("grounds guidance in lesson content and passes lessonId when question is linked to lesson", async () => {
    let capturedBody: { message?: string; context?: { type?: string; lessonId?: string } } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      capturedBody = options?.body ? JSON.parse(options.body as string) : null;
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              request_id: "req-exam-lesson",
              answer: "بر اساس محتوای درس، گیرنده‌های سمپاتیک بررسی می‌شوند.",
              conversationId: "conv-exam-lesson",
              sources: {
                lessonTitle: "فارماکولوژی اتونوم",
              },
            }),
          ),
      } as Response;
    });

    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-exam-lesson-1",
          questionNumber: 1,
          questionText: "کدام آگونیست انتخابی بتا-۲ است؟",
          choices: ["سالبوتامول", "پروپرانولول"],
          selectedChoice: "سالبوتامول",
          topic: "دستگاه تنفس",
          lessonId: "les-autonomic-99",
          lessonTitle: "فارماکولوژی اتونوم",
        }}
        autoStartGuidance={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/بر اساس محتوای درس، گیرنده‌های سمپاتیک بررسی می‌شوند/),
      ).toBeInTheDocument();
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.context.type).toBe("lesson");
    expect(capturedBody.context.lessonId).toBe("les-autonomic-99");
    expect(capturedBody.message).toContain("عنوان درس مرجع: فارماکولوژی اتونوم");
    expect(capturedBody.message).toContain("سلسله‌مراتب منبع حقیقت (Grounding Priority)");
    expect(capturedBody.message).toContain("محتوای آموزشی درس (که در پیام سیستمی قرار دارد) منبع اصلی و قطعی پاسخ است");
    expect(capturedBody.message).toContain("[بر اساس محتوای درس]");
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();
    expect(screen.getByText(/این سوال مربوط به درس/)).toBeInTheDocument();
    expect(screen.getAllByText("فارماکولوژی اتونوم").length).toBeGreaterThan(0);
    expect(screen.getByText(/پاسخ مستند بر درس: فارماکولوژی اتونوم/)).toBeInTheDocument();
  });

  it("resets conversation and state when exam questionId changes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const parsed = options?.body ? JSON.parse(options.body as string) : {};
      const isQ2 = parsed.message?.includes("سوال ۲");
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              answer: isQ2 ? "پاسخ راهنمایی برای سوال دوم" : "پاسخ راهنمایی برای سوال اول",
              conversationId: isQ2 ? "conv-q2" : "conv-q1",
            }),
          ),
      } as Response;
    });

    const { rerender } = render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-1",
          questionNumber: 1,
          questionText: "متن سوال ۱",
          choices: ["گزینه الف", "گزینه ب"],
        }}
        autoStartGuidance={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("پاسخ راهنمایی برای سوال اول")).toBeInTheDocument();
    });

    // Switch to Question 2
    rerender(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-2",
          questionNumber: 2,
          questionText: "متن سوال ۲",
          choices: ["گزینه ج", "گزینه د"],
        }}
        autoStartGuidance={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("پاسخ راهنمایی برای سوال دوم")).toBeInTheDocument();
    });

    // Ensure question 1's answer was cleared and does not leak
    expect(screen.queryByText("پاسخ راهنمایی برای سوال اول")).toBeNull();
  });

  it("renders only lesson in single-chapter exam mode and does not render chapter title or subtitle", () => {
    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-single-1",
          questionNumber: 1,
          questionText: "تست آزمون تک‌فصلی",
          lessonId: "les-single-1",
          lessonTitle: "جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید",
          chapterTitle: "فصل ۲: آنتی‌هیستامین‌ها",
          isMultiChapterExam: false,
        }}
        autoStartGuidance={false}
      />,
    );

    // Subtitle under header must NOT be rendered
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();

    // Must render only lesson title in conceptual section
    expect(
      screen.getByText("این سوال مربوط به", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید"),
    ).toBeInTheDocument();
    expect(screen.getByText(/مستند به محتوای آموزشی درسنامه/)).toBeInTheDocument();

    // Chapter title must NOT be rendered in single-chapter mode
    expect(screen.queryByText("فصل ۲: آنتی‌هیستامین‌ها")).toBeNull();
  });

  it("renders chapter and lesson in multi-chapter exam mode in compact format", () => {
    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-multi-1",
          questionNumber: 2,
          questionText: "تست آزمون چندفصلی",
          lessonId: "les-multi-1",
          lessonTitle: "جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید",
          chapterTitle: "فصل ۲: آنتی‌هیستامین‌ها",
          isMultiChapterExam: true,
        }}
        autoStartGuidance={false}
      />,
    );

    // Subtitle under header must NOT be rendered
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();

    // Must render chapter • lesson in conceptual section
    const guidanceP = screen.getByText(/این سوال مربوط به/);
    expect(guidanceP).toHaveTextContent(
      "این سوال مربوط به فصل ۲: آنتی‌هیستامین‌ها • درس: جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید (مستند به محتوای آموزشی درسنامه) است."
    );
    expect(screen.getByText("فصل ۲: آنتی‌هیستامین‌ها")).toBeInTheDocument();
    expect(screen.getByText(/• درس:/)).toBeInTheDocument();
    expect(
      screen.getByText("جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید"),
    ).toBeInTheDocument();
    expect(screen.getByText(/مستند به محتوای آموزشی درسنامه/)).toBeInTheDocument();
  });

  it("falls back to lesson only in multi-chapter exam when question chapter is undefined", () => {
    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-multi-no-chap",
          questionNumber: 1,
          questionText: "تست چندفصلی بدون فصل برای سوال",
          lessonId: "les-123",
          lessonTitle: "مکانیسم اثر بتابلاکرها",
          chapterTitle: null,
          isMultiChapterExam: true,
        }}
        autoStartGuidance={false}
      />,
    );

    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();
    expect(screen.getByText("مکانیسم اثر بتابلاکرها")).toBeInTheDocument();
    expect(screen.queryByText(/• درس:/)).toBeNull();
  });

  it("falls back to topic without claiming lesson documentation when lessonId is missing", () => {
    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-no-lesson",
          questionNumber: 4,
          questionText: "تست بدون درسنامه",
          topic: "فارماکولوژی عمومی",
          chapterTitle: "فصل ۱",
          isMultiChapterExam: true,
        }}
        autoStartGuidance={false}
      />,
    );

    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();
    expect(screen.getByText("فارماکولوژی عمومی")).toBeInTheDocument();
    expect(screen.getByText(/تحلیل مفهومی و تکمیلی/)).toBeInTheDocument();
    expect(screen.queryByText(/مستند به محتوای آموزشی درسنامه/)).toBeNull();
  });

  it("restores conversation from conversationState and skips autoStartGuidance", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-restored-1",
          questionNumber: 1,
          questionText: "تست بازگردانی پیام‌ها",
        }}
        autoStartGuidance={true}
        conversationState={{
          messages: [
            {
              id: "msg-user-1",
              role: "user",
              content: "راهنمایی برای سوال ۱",
              createdAt: new Date(),
            },
            {
              id: "msg-ai-1",
              role: "assistant",
              content: "این یک پاسخ از قبل بازگردانی‌شده است.",
              createdAt: new Date(),
            },
          ],
          conversationId: "conv-1",
          isLoading: false,
          error: null,
        }}
      />,
    );

    // Messages must be visible immediately
    expect(screen.getByText("راهنمایی برای سوال ۱")).toBeInTheDocument();
    expect(screen.getByText("این یک پاسخ از قبل بازگردانی‌شده است.")).toBeInTheDocument();

    // No fetch call should be triggered because state was already restored
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("notifies onConversationStateChange on follow-up user message and AI response", async () => {
    const handleStateChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            answer: "پاسخ جدید به سوال بعدی دانشجو",
            conversationId: "conv-followup",
          }),
        ),
    } as Response);

    render(
      <StudyAssistantChat
        contextType="exam_question"
        examQuestion={{
          questionId: "q-followup-1",
          questionNumber: 2,
          questionText: "تست پیام تکمیلی",
        }}
        autoStartGuidance={false}
        conversationState={{
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              content: "راهنمایی اولیه",
              createdAt: new Date(),
            },
          ],
          conversationId: "conv-init",
          isLoading: false,
          error: null,
        }}
        onConversationStateChange={handleStateChange}
      />,
    );

    const textarea = screen.getByPlaceholderText(/سوال یا ابهام خود را درباره این سوال بنویسید/i);
    fireEvent.change(textarea, { target: { value: "میشه بیشتر توضیح بدی؟" } });

    const sendBtn = screen.getByRole("button", { name: /ارسال/i });
    fireEvent.click(sendBtn);

    // Should notify state change when user message is added
    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoading: true,
      }),
      "q-followup-1",
    );

    await waitFor(() => {
      expect(screen.getByText("پاسخ جدید به سوال بعدی دانشجو")).toBeInTheDocument();
    });

    // Should notify state change when assistant responds
    expect(handleStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoading: false,
        conversationId: "conv-followup",
      }),
      "q-followup-1",
    );
  });
});

