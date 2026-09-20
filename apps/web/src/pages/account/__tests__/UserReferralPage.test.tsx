import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserReferralPage } from "../UserReferralPage.js";
import * as useReferralHooks from "../../../hooks/useReferral.js";

vi.mock("../../../hooks/useReferral.js", () => ({
  useMyReferralSummary: vi.fn(),
  useMyReferralHistory: vi.fn(),
  useValidateReferralCode: vi.fn(),
  useAdminReferrals: vi.fn(),
  useRetryReferralRewards: vi.fn(),
  useReferralConfig: vi.fn(),
  useUpdateReferralConfig: vi.fn(),
}));

type MockSummaryReturn = ReturnType<typeof useReferralHooks.useMyReferralSummary>;
type MockHistoryReturn = ReturnType<typeof useReferralHooks.useMyReferralHistory>;

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe("UserReferralPage UI Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders referral code, invite url, and stats overview correctly", () => {
    vi.mocked(useReferralHooks.useMyReferralSummary).mockReturnValue({
      data: {
        code: "AVN7K4P2",
        invite_url: "https://aavana.ir/register?ref=AVN7K4P2",
        total_invites: 5,
        pending_invites: 3,
        successful_invites: 2,
        rewarded_days: 30,
        max_referrals: 4,
        max_reward_days: 60,
        is_limit_reached: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockSummaryReturn);

    vi.mocked(useReferralHooks.useMyReferralHistory).mockReturnValue({
      data: {
        referrals: [
          {
            id: "ref_1",
            invitee_display_name: "ع*** م***",
            status: "rewarded",
            reward_status: "completed",
            reward_amount: 15,
            created_at: new Date().toISOString(),
            qualified_at: new Date().toISOString(),
            rewarded_at: new Date().toISOString(),
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockHistoryReturn);

    renderWithProviders(<UserReferralPage />);

    expect(screen.getByText("دعوت از دوستان")).toBeInTheDocument();
    expect(screen.getByText("AVN7K4P2")).toBeInTheDocument();
    expect(screen.getByText("https://aavana.ir/register?ref=AVN7K4P2")).toBeInTheDocument();
    expect(screen.getByText("5 نفر")).toBeInTheDocument();
    expect(screen.getByText("3 نفر")).toBeInTheDocument();
    expect(screen.getByText("2 از ۴")).toBeInTheDocument();
    expect(screen.getByText("ع*** م***")).toBeInTheDocument();
    expect(screen.getByText("پاداش داده شد")).toBeInTheDocument();
    expect(screen.getByText("+15 روز")).toBeInTheDocument();
  });

  it("renders empty state when user has not invited anyone yet", () => {
    vi.mocked(useReferralHooks.useMyReferralSummary).mockReturnValue({
      data: {
        code: "AVNNEWUSER",
        invite_url: "https://aavana.ir/register?ref=AVNNEWUSER",
        total_invites: 0,
        pending_invites: 0,
        successful_invites: 0,
        rewarded_days: 0,
        max_referrals: 4,
        max_reward_days: 60,
        is_limit_reached: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockSummaryReturn);

    vi.mocked(useReferralHooks.useMyReferralHistory).mockReturnValue({
      data: {
        referrals: [],
        total: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockHistoryReturn);

    renderWithProviders(<UserReferralPage />);

    expect(screen.getByText("هنوز دعوتی ثبت نشده است")).toBeInTheDocument();
  });
});
