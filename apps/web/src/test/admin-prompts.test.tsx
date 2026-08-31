/**
 * Admin Prompt Inspector UI Component Tests.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { AdminPromptsPage } from "../pages/admin/AdminPromptsPage.js";
import { api } from "../lib/api/admin.js";

const mockPromptsData = {
  prompts: [
    {
      id: "content-planning",
      name: "Content Planning & Topic Decomposition",
      description: "آنالیز جامع ساختار سند و تدوین نقشه جلسات آموزشی.",
      category: "Content Planning",
      provider: "gemini",
      model: "gemini-3.6-flash",
      systemPrompt: "You produce structured JSON educational content plans.",
      userPrompt: "You are AVANA's Expert Educational AI Content Engine.\nTASK: COVERAGE-FIRST CONTENT PLANNING for {{documentTitle}}.",
      variables: ["documentTitle", "targetTopicCount", "chunkContext"],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.extractContentPlan",
      status: "active" as const,
    },
    {
      id: "lesson-generation",
      name: "Batched Educational Lesson Generation",
      description: "تولید محتوای درسنامه‌های ساختاریافته و جامع.",
      category: "Lesson Generation",
      provider: "gemini",
      model: "gemini-3.6-flash",
      systemPrompt: "You produce structured JSON educational lesson content.",
      userPrompt: "You are AVANA's Expert Educational AI Content Engine.\nTASK: GENERATE DEEP EDUCATIONAL LESSONS.",
      variables: ["documentTitle", "batchStart", "batchEnd"],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateBatchedLessons",
      status: "active" as const,
    },
    {
      id: "study-assistant-lesson",
      name: "Lesson AI Study Assistant",
      description: "دستیار آموزشی بلادرنگ در درسنامه.",
      category: "Study Assistant",
      provider: "cloudflare",
      model: "@cf/meta/llama-3.3-70b-instruct",
      systemPrompt: "شما دستیار هوشمند مطالعه آوانا هستید.",
      userPrompt: "پیام کاربر به همراه تاریخچه",
      variables: ["courseTitle", "lessonTitle", "userMessage"],
      sourceFile: "apps/api/src/modules/study/assistant-service.ts",
      sourceLocation: "StudyAssistant.buildPrompt",
      status: "active" as const,
    },
  ],
};

describe("AdminPromptsPage UI Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Prompt Inspector title, header count, and table with prompts", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mockPromptsData);

    render(<AdminPromptsPage />);

    // Check header
    expect(screen.getByText(/بازرس پرامپت‌ها \(Prompt Inspector\)/i)).toBeInTheDocument();

    // Wait for table to load
    await waitFor(() => {
      expect(screen.getByText("Content Planning & Topic Decomposition")).toBeInTheDocument();
      expect(screen.getByText("Batched Educational Lesson Generation")).toBeInTheDocument();
      expect(screen.getByText("Lesson AI Study Assistant")).toBeInTheDocument();
    });

    // Check count badge
    expect(screen.getByText(/تعداد پرامپت‌های فعال: 3/i)).toBeInTheDocument();
  });

  it("filters prompts by search keyword", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mockPromptsData);

    render(<AdminPromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Content Planning & Topic Decomposition")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/جستجوی پرامپت/i);
    fireEvent.change(searchInput, { target: { value: "Flashcard" } });

    expect(screen.getByText(/پرامپتی با فیلترهای انتخابی یافت نشد/i)).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Assistant" } });
    expect(screen.getByText("Lesson AI Study Assistant")).toBeInTheDocument();
    expect(screen.queryByText("Content Planning & Topic Decomposition")).not.toBeInTheDocument();
  });

  it("opens Inspector Drawer upon clicking a prompt row and allows copying", async () => {
    vi.spyOn(api, "get").mockResolvedValue(mockPromptsData);

    render(<AdminPromptsPage />);

    await waitFor(() => {
      expect(screen.getByText("Content Planning & Topic Decomposition")).toBeInTheDocument();
    });

    // Click row on first prompt
    fireEvent.click(screen.getByText("Content Planning & Topic Decomposition"));

    // Check Drawer content
    await waitFor(() => {
      const drawer = screen.getByTestId("prompt-inspector-drawer");
      expect(drawer).toBeInTheDocument();
      expect(within(drawer).getByText("Content Planning & Topic Decomposition")).toBeInTheDocument();
      expect(within(drawer).getByText(/You produce structured JSON educational content plans\./i)).toBeInTheDocument();
      expect(within(drawer).getByText(/GenerationService\.extractContentPlan/i)).toBeInTheDocument();
    });

    // Test Copy System Prompt
    const copySystemBtn = screen.getByText(/کپی System Prompt/i);
    fireEvent.click(copySystemBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "You produce structured JSON educational content plans."
    );

    // Test Close Drawer
    const closeBtn = screen.getByText("بستن پنجره");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("prompt-inspector-drawer")).not.toBeInTheDocument();
    });
  });

  it("handles API error state gracefully", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("خطای ارتباط با سرور"));

    render(<AdminPromptsPage />);

    await waitFor(() => {
      expect(screen.getByText(/خطای ارتباط با سرور/i)).toBeInTheDocument();
    });
  });
});
