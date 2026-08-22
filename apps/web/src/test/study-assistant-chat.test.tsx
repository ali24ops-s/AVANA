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
});

