import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PublicPollPage } from "../pages/poll/PublicPollPage.js";
import * as PublicPollHookModule from "../hooks/usePublicPoll.js";

describe("PublicPollPage (Step 5)", () => {
  const mockPublicPoll = {
    id: "pub-1",
    slug: "customer-feedback",
    title: "نظرسنجی بازخورد کاربران آوانا",
    description: "دیدگاه شما در بهبود خدمات ما بسیار مؤثر است.",
    coverImageUrl: "https://example.com/cover.jpg",
    status: "published" as const,
    userVoted: false,
    settings: {
      allowAnonymous: true,
      showResultsAfterVote: true,
      requireAllQuestions: false,
      ctaTitle: "مشاهده دوره‌های تخصصی",
      ctaUrl: "https://aavana.ir/courses",
      ctaButtonText: "مشاهده دوره‌ها",
    },
    questions: [
      {
        id: "q-single",
        questionText: "آیا از نحوه تدریس اساتید رضایت دارید؟",
        questionType: "single_choice" as const,
        isRequired: true,
        sortOrder: 1,
        options: [
          { id: "opt-yes", optionText: "بله، کاملاً", sortOrder: 1 },
          { id: "opt-no", optionText: "خیر، نیاز به بهبود دارد", sortOrder: 2 },
        ],
      },
      {
        id: "q-multi",
        questionText: "کدام مباحث برای شما اولویت دارد؟",
        questionType: "multiple_choice" as const,
        isRequired: false,
        sortOrder: 2,
        minChoices: 1,
        maxChoices: 2,
        options: [
          { id: "opt-pharm", optionText: "داروشناسی بالینی", sortOrder: 1 },
          { id: "opt-chem", optionText: "شیمی دارویی", sortOrder: 2 },
          { id: "opt-tox", optionText: "سم‌شناسی", sortOrder: 3 },
        ],
      },
      {
        id: "q-text",
        questionText: "هرگونه پیشنهاد یا انتقاد دیگری دارید بنویسید",
        questionType: "short_text" as const,
        isRequired: false,
        sortOrder: 3,
        options: [],
      },
    ],
  };

  const mockSubmitMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(PublicPollHookModule, "usePublicPoll").mockReturnValue({
      data: mockPublicPoll,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(PublicPollHookModule, "useSubmitVoteMutation").mockReturnValue(mockSubmitMutation as any);
  });

  it("renders public poll page without authentication barriers", () => {
    render(
      <MemoryRouter initialEntries={["/polls/customer-feedback"]}>
        <Routes>
          <Route path="/polls/:slug" element={<PublicPollPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("نظرسنجی بازخورد کاربران آوانا")).toBeInTheDocument();
    expect(screen.getByText("آیا از نحوه تدریس اساتید رضایت دارید؟")).toBeInTheDocument();
    expect(screen.getByText("کدام مباحث برای شما اولویت دارد؟")).toBeInTheDocument();
    expect(screen.getByText("هرگونه پیشنهاد یا انتقاد دیگری دارید بنویسید")).toBeInTheDocument();
    expect(screen.getByText(/نظرسنجی امن و محرمانه/)).toBeInTheDocument();
  });

  it("validates required questions before submitting", async () => {
    render(
      <MemoryRouter initialEntries={["/polls/customer-feedback"]}>
        <Routes>
          <Route path="/polls/:slug" element={<PublicPollPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const submitBtn = screen.getByRole("button", { name: /ثبت نهایی و ارسال پاسخ‌ها/ });
    fireEvent.click(submitBtn);

    // Question 1 was required, so submit should be blocked with error
    await waitFor(() => {
      expect(screen.getByText(/لطفاً به سؤالات اجباری مشخص‌شده پاسخ دهید/)).toBeInTheDocument();
      expect(mockSubmitMutation.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it("allows selecting answers and submits vote successfully", async () => {
    mockSubmitMutation.mutateAsync.mockResolvedValueOnce({
      success: true,
      responseId: "resp-10",
      results: {
        pollId: "pub-1",
        pollTitle: "نظرسنجی بازخورد کاربران آوانا",
        totalResponses: 1,
        questions: [
          {
            questionId: "q-single",
            questionText: "آیا از نحوه تدریس اساتید رضایت دارید؟",
            questionType: "single_choice" as const,
            totalAnswers: 1,
            options: [
              { optionId: "opt-yes", optionText: "بله، کاملاً", voteCount: 1, percentage: 100 },
              { optionId: "opt-no", optionText: "خیر، نیاز به بهبود دارد", voteCount: 0, percentage: 0 },
            ],
          },
        ],
        isAdmin: false,
      },
    });

    render(
      <MemoryRouter initialEntries={["/polls/customer-feedback"]}>
        <Routes>
          <Route path="/polls/:slug" element={<PublicPollPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Select Single Choice
    const singleOption = screen.getByText("بله، کاملاً");
    fireEvent.click(singleOption);

    // Select Multiple Choice
    const multiOption1 = screen.getByText("داروشناسی بالینی");
    fireEvent.click(multiOption1);

    // Enter text answer
    const textarea = screen.getByPlaceholderText(/پاسخ خود را در این قسمت بنویسید/);
    fireEvent.change(textarea, { target: { value: "برنامه‌ریزی عالی بود." } });

    // Click Submit
    const submitBtn = screen.getByRole("button", { name: /ثبت نهایی و ارسال پاسخ‌ها/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitMutation.mutateAsync).toHaveBeenCalledWith({
        answers: expect.objectContaining({
          "q-single": { questionId: "q-single", selectedOptionId: "opt-yes" },
          "q-multi": { questionId: "q-multi", selectedOptionIds: ["opt-pharm"] },
          "q-text": { questionId: "q-text", textAnswer: "برنامه‌ریزی عالی بود." },
        }),
      });
      expect(screen.getByText("پاسخ‌های شما با موفقیت ثبت شد!")).toBeInTheDocument();
      expect(screen.getByText("مشاهده دوره‌های تخصصی")).toBeInTheDocument();
    });
  });

  it("renders already voted state if userVoted is true", () => {
    vi.spyOn(PublicPollHookModule, "usePublicPoll").mockReturnValue({
      data: { ...mockPublicPoll, userVoted: true },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={["/polls/customer-feedback"]}>
        <Routes>
          <Route path="/polls/:slug" element={<PublicPollPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("شما قبلاً در این نظرسنجی شرکت کرده‌اید.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت نهایی و ارسال پاسخ‌ها/ })).not.toBeInTheDocument();
  });

  it("renders unavailable message if poll is closed", () => {
    vi.spyOn(PublicPollHookModule, "usePublicPoll").mockReturnValue({
      data: { ...mockPublicPoll, status: "closed" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={["/polls/customer-feedback"]}>
        <Routes>
          <Route path="/polls/:slug" element={<PublicPollPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("مهلت شرکت در این نظرسنجی به پایان رسیده است")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت نهایی و ارسال پاسخ‌ها/ })).not.toBeInTheDocument();
  });
});
