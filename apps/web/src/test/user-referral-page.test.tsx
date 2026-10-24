import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { UserReferralPage } from "../pages/account/UserReferralPage.js";

const mockUseMyReferralSummary = vi.fn();
const mockUseMyReferralHistory = vi.fn();

vi.mock("../hooks/useReferral.js", () => ({
  useMyReferralSummary: () => mockUseMyReferralSummary(),
  useMyReferralHistory: () => mockUseMyReferralHistory(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

const renderReferralPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserReferralPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("UserReferralPage Persian Numerals & Subscription Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all zero values with Persian numerals (۰) and links to /account/subscription", () => {
    mockUseMyReferralSummary.mockReturnValue({
      data: {
        code: "REF1234X",
        invite_url: "https://avana.app/register?ref=REF1234X",
        total_invites: 0,
        pending_invites: 0,
        successful_invites: 0,
        rewarded_days: 0,
        is_limit_reached: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseMyReferralHistory.mockReturnValue({
      data: { referrals: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderReferralPage();

    // Zero rewarded days must render as Persian ۰
    expect(screen.getByText("۰")).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();

    // Stats cards with 0 must render Persian ۰ نفر
    expect(screen.getAllByText("۰ نفر")).toHaveLength(2); // total and pending

    // Successful invites must render ۰ از ۴
    expect(screen.getByText("۰ از ۴")).toBeInTheDocument();

    // Technical code and URL must remain untouched (LTR)
    expect(screen.getByText("REF1234X")).toBeInTheDocument();
    expect(
      screen.getByText("https://avana.app/register?ref=REF1234X"),
    ).toBeInTheDocument();

    // Both subscription action links must point to /account/subscription
    const subscriptionLinks = screen.getAllByRole("link", {
      name: /مشاهده.*اشتراک/i,
    });
    expect(subscriptionLinks.length).toBeGreaterThanOrEqual(2);
    subscriptionLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/account/subscription");
    });
  });

  it("renders non-zero values and history table rewards with Persian digits", () => {
    mockUseMyReferralSummary.mockReturnValue({
      data: {
        code: "AVN9988Z",
        invite_url: "https://avana.app/register?ref=AVN9988Z",
        total_invites: 3,
        pending_invites: 1,
        successful_invites: 2,
        rewarded_days: 30,
        is_limit_reached: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseMyReferralHistory.mockReturnValue({
      data: {
        referrals: [
          {
            id: "ref-1",
            invitee_display_name: "دانشجوی اول",
            status: "rewarded",
            reward_status: "completed",
            reward_amount: 15,
            created_at: "2026-09-01T10:00:00Z",
            rewarded_at: "2026-09-01T10:05:00Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderReferralPage();

    // 30 days rendered in Persian digits: ۳۰
    expect(screen.getByText("۳۰")).toBeInTheDocument();

    // 3 total invites: ۳ نفر
    expect(screen.getByText("۳ نفر")).toBeInTheDocument();

    // 1 pending invite: ۱ نفر
    expect(screen.getByText("۱ نفر")).toBeInTheDocument();

    // 2 of 4 invites: ۲ از ۴
    expect(screen.getByText("۲ از ۴")).toBeInTheDocument();

    // Table reward amount: +۱۵ روز
    expect(screen.getAllByText("+۱۵ روز").length).toBeGreaterThanOrEqual(1);

    // Referral count in history title: ۱ مورد ثبت‌شده
    expect(screen.getByText("۱ مورد ثبت‌شده")).toBeInTheDocument();
  });
});
