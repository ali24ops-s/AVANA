import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudioPollResultsPage } from "../pages/studio/StudioPollResultsPage.js";
import * as AuthModule from "../providers/AuthProvider.js";
import * as StudioPollsHookModule from "../hooks/useStudioPolls.js";

describe("StudioPollResultsPage (Step 4)", () => {
  const mockPoll = {
    id: "poll-200",
    title: "نظرسنجی کیفیت آموزش بالینی",
    slug: "clinical-training",
    status: "published" as const,
  };

  const mockResults = {
    pollId: "poll-200",
    pollTitle: "نظرسنجی کیفیت آموزش بالینی",
    totalResponses: 150,
    isAdmin: true,
    questions: [
      {
        questionId: "q-1",
        questionText: "میزان رضایت از حضور اساتید در بخش",
        questionType: "single_choice" as const,
        totalAnswers: 150,
        options: [
          { optionId: "opt-1", optionText: "بسیار زیاد", voteCount: 90, percentage: 60 },
          { optionId: "opt-2", optionText: "متوسط", voteCount: 45, percentage: 30 },
          { optionId: "opt-3", optionText: "کم", voteCount: 15, percentage: 10 },
        ],
      },
      {
        questionId: "q-2",
        questionText: "انتقادات و پیشنهادات درباره نحوه شیفت‌ها",
        questionType: "short_text" as const,
        totalAnswers: 2,
        textAnswers: [
          "تعداد کشیک‌ها در هفته گذشته زیاد بود.",
          "برنامه‌ریزی بخش اطفال بسیار منظم‌تر شده است.",
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(StudioPollsHookModule, "usePollDetails").mockReturnValue({
      data: mockPoll,
      isLoading: false,
    } as any);

    vi.spyOn(StudioPollsHookModule, "usePollResults").mockReturnValue({
      data: mockResults,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("renders results KPI metrics and question percentages", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-200/results"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/results" element={<StudioPollResultsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/نتایج و گزارش آماری/)).toBeInTheDocument();
    expect(screen.getByText("میزان رضایت از حضور اساتید در بخش")).toBeInTheDocument();
    expect(screen.getByText("بسیار زیاد")).toBeInTheDocument();
    expect(screen.getByText("۶۰٪")).toBeInTheDocument();

    // Check text answers
    expect(screen.getByText("تعداد کشیک‌ها در هفته گذشته زیاد بود.")).toBeInTheDocument();
    expect(screen.getByText("برنامه‌ریزی بخش اطفال بسیار منظم‌تر شده است.")).toBeInTheDocument();
  });

  it("shows CSV export button for platform_admin", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u1", role: "platform_admin" } as any,
      memberships: [],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-200/results"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/results" element={<StudioPollResultsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /خروجی CSV/ })).toBeInTheDocument();
  });

  it("restricts CSV export button for content_worker", () => {
    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: { id: "u2", role: "content_worker" } as any,
      memberships: [{ organizationId: "org-1", role: "content_worker" }],
      isLoading: false,
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/studio/polls/poll-200/results"]}>
        <Routes>
          <Route path="/studio/polls/:pollId/results" element={<StudioPollResultsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Verify CSV button is NOT accessible to content_worker
    expect(screen.queryByRole("button", { name: /خروجی CSV/ })).not.toBeInTheDocument();
    expect(screen.getByText(/خروجی CSV \(نیاز به دسترسی مدیر\)/)).toBeInTheDocument();
  });
});
