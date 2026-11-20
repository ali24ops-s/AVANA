import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudioPollEditorPage } from "../pages/studio/StudioPollEditorPage.js";
import * as AuthModule from "../providers/AuthProvider.js";
import * as StudioPollsHookModule from "../hooks/useStudioPolls.js";

describe("StudioPollEditorPage (Step 3)", () => {
  const mockPoll = {
    id: "poll-100",
    title: "نظرسنجی رضایت از خدمات آزمایشگاه",
    slug: "lab-satisfaction",
    description: "فرم نظرسنجی و ارزیابی کیفیت تجهیزات",
    status: "draft" as const,
    coverImageUrl: "https://example.com/cover.jpg",
    startsAt: "2026-11-01T08:00:00Z",
    endsAt: "2026-12-01T20:00:00Z",
    settings: {
      allowAnonymous: true,
      showResultsAfterVote: true,
      requireAllQuestions: true,
      ctaTitle: "عضویت در کانال",
      ctaUrl: "https://t.me/avana_ir",
      ctaButtonText: "عضویت",
    },
    questions: [
      {
        id: "q-1",
        pollId: "poll-100",
        questionText: "کیفیت دستگاه اسپکتروفتومتر چگونه بود؟",
        description: "امتیاز از ۱ تا ۵",
        questionType: "single_choice" as const,
        isRequired: true,
        sortOrder: 1,
        options: [
          { id: "opt-1", questionId: "q-1", optionText: "عالی", sortOrder: 1 },
          { id: "opt-2", questionId: "q-1", optionText: "متوسط", sortOrder: 2 },
          { id: "opt-3", questionId: "q-1", optionText: "ضعیف", sortOrder: 3 },
        ],
      },
      {
        id: "q-2",
        pollId: "poll-100",
        questionText: "پیشنهادات تکمیلی خود را بنویسید",
        questionType: "short_text" as const,
        isRequired: false,
        sortOrder: 2,
        options: [],
      },
    ],
  };

  const mockMutations = {
    updatePollMutation: { mutateAsync: vi.fn(), isPending: false },
    publishMutation: { mutateAsync: vi.fn(), isPending: false },
    closeMutation: { mutateAsync: vi.fn(), isPending: false },
    createQuestionMutation: { mutateAsync: vi.fn(), isPending: false },
    updateQuestionMutation: { mutateAsync: vi.fn(), isPending: false },
    deleteQuestionMutation: { mutateAsync: vi.fn(), isPending: false },
    reorderQuestionsMutation: { mutateAsync: vi.fn(), isPending: false },
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(StudioPollsHookModule, "usePollDetails").mockReturnValue({
      data: mockPoll,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(StudioPollsHookModule, "useUpdatePollMutation").mockReturnValue(mockMutations.updatePollMutation as any);
    vi.spyOn(StudioPollsHookModule, "usePublishPollMutation").mockReturnValue(mockMutations.publishMutation as any);
    vi.spyOn(StudioPollsHookModule, "useClosePollMutation").mockReturnValue(mockMutations.closeMutation as any);
    vi.spyOn(StudioPollsHookModule, "useCreateQuestionMutation").mockReturnValue(mockMutations.createQuestionMutation as any);
    vi.spyOn(StudioPollsHookModule, "useUpdateQuestionMutation").mockReturnValue(mockMutations.updateQuestionMutation as any);
    vi.spyOn(StudioPollsHookModule, "useDeleteQuestionMutation").mockReturnValue(mockMutations.deleteQuestionMutation as any);
    vi.spyOn(StudioPollsHookModule, "useReorderQuestionsMutation").mockReturnValue(mockMutations.reorderQuestionsMutation as any);
  });

  it("renders poll editor header, questions tab, and questions list", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-100/edit"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/edit" element={<StudioPollEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("نظرسنجی رضایت از خدمات آزمایشگاه")).toBeInTheDocument();
    expect(screen.getByText("کیفیت دستگاه اسپکتروفتومتر چگونه بود؟")).toBeInTheDocument();
    expect(screen.getByText("پیشنهادات تکمیلی خود را بنویسید")).toBeInTheDocument();
    expect(screen.getByText("عالی")).toBeInTheDocument();
  });

  it("opens live preview modal when clicking preview button", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-100/edit"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/edit" element={<StudioPollEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const previewBtn = screen.getByRole("button", { name: /پیش‌نمایش/ });
    fireEvent.click(previewBtn);

    expect(screen.getByText("پیش‌نمایش نظرسنجی")).toBeInTheDocument();
    expect(screen.getByText("موبایل (Mobile)")).toBeInTheDocument();
    expect(screen.getByText("رایانه (Desktop)")).toBeInTheDocument();
  });

  it("switches to settings tab and updates metadata", async () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    mockMutations.updatePollMutation.mutateAsync.mockResolvedValueOnce({
      poll: { ...mockPoll, title: "عنوان به‌روزرسانی‌شده" },
    });

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-100/edit"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/edit" element={<StudioPollEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const settingsTabBtn = screen.getByRole("button", { name: /مشخصات و تنظیمات/ });
    fireEvent.click(settingsTabBtn);

    expect(screen.getByText("مشخصات عمومی نظرسنجی")).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("نظرسنجی رضایت از خدمات آزمایشگاه");
    fireEvent.change(titleInput, { target: { value: "عنوان به‌روزرسانی‌شده" } });

    const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات مشخصات/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockMutations.updatePollMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "poll-100",
          data: expect.objectContaining({ title: "عنوان به‌روزرسانی‌شده" }),
        }),
      );
    });
  });

  it("prevents content_worker from modifying questions on published polls", () => {
    vi.spyOn(StudioPollsHookModule, "usePollDetails").mockReturnValue({
      data: { ...mockPoll, status: "published" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u2", role: "content_worker" } as any,
      memberships: [{ organizationId: "org-1", role: "content_worker" }],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-100/edit"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/edit" element={<StudioPollEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Verify warning banner
    expect(screen.getByText(/تغییر سؤالات نظرسنجی منتشرشده تنها توسط مدیر سازمان یا مدیر کل امکان‌پذیر است/)).toBeInTheDocument();

    // Verify add question button is disabled
    const addBtn = screen.getByRole("button", { name: /افزودن سؤال جدید/ });
    expect(addBtn).toBeDisabled();
  });
});
