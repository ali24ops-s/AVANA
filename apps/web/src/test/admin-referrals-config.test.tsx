import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { AdminReferralsPage } from "../pages/admin/commerce/AdminReferralsPage.js";
import { createReferralApi } from "../lib/api/referral.js";

// Mock hooks
const mockUseAdminReferrals = vi.fn();
const mockUseRetryReferralRewards = vi.fn();
const mockUseReferralConfig = vi.fn();
const mockUseUpdateReferralConfig = vi.fn();

vi.mock("../hooks/useReferral.js", () => ({
  useAdminReferrals: () => mockUseAdminReferrals(),
  useRetryReferralRewards: () => mockUseRetryReferralRewards(),
  useReferralConfig: () => mockUseReferralConfig(),
  useUpdateReferralConfig: () => mockUseUpdateReferralConfig(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe("Admin Referral Settings (AdminReferralsPage)", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>;
  let mockRefetchConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAdminReferrals.mockReturnValue({
      data: { referrals: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    mockUseRetryReferralRewards.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockRefetchConfig = vi.fn();
    mockUseReferralConfig.mockReturnValue({
      data: {
        config: {
          enabled: true,
          rewardDays: 15,
          maxRewardedReferrals: 4,
        },
      },
      refetch: mockRefetchConfig,
    });

    mockMutateAsync = vi.fn().mockResolvedValue({
      config: {
        enabled: true,
        rewardDays: 30,
        maxRewardedReferrals: 4,
      },
    });

    mockUseUpdateReferralConfig.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  it("1. Renders initial rewardDays from configData", () => {
    render(<AdminReferralsPage />, { wrapper });

    const input = screen.getByLabelText("مدت اشتراک رایگان به ازای هر دعوت (روز)") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("15");
  });

  it("2. Updates rewardDays input and saves successfully, resetting draft state and refetching", async () => {
    render(<AdminReferralsPage />, { wrapper });

    const input = screen.getByLabelText("مدت اشتراک رایگان به ازای هر دعوت (روز)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    expect(input.value).toBe("30");

    const saveButton = screen.getByRole("button", { name: "ذخیره تنظیمات" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        enabled: true,
        rewardDays: 30,
        maxRewardedReferrals: 4,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("تنظیمات با موفقیت ذخیره شد.")).toBeInTheDocument();
    });

    expect(mockRefetchConfig).toHaveBeenCalled();
  });

  it("3. Supports boundary value 0 and sends it to the API", async () => {
    render(<AdminReferralsPage />, { wrapper });

    const input = screen.getByLabelText("مدت اشتراک رایگان به ازای هر دعوت (روز)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");

    const saveButton = screen.getByRole("button", { name: "ذخیره تنظیمات" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        enabled: true,
        rewardDays: 0,
        maxRewardedReferrals: 4,
      });
    });
  });

  it("4. Displays error alert when mutation fails and stops loading", async () => {
    const errorMsg = "مدت اشتراک رایگان باید عددی صحیح بین ۰ تا ۳۶۵ روز باشد";
    mockMutateAsync.mockRejectedValueOnce(new Error(errorMsg));

    render(<AdminReferralsPage />, { wrapper });

    const input = screen.getByLabelText("مدت اشتراک رایگان به ازای هر دعوت (روز)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });

    const saveButton = screen.getByRole("button", { name: "ذخیره تنظیمات" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    // Success alert should not be shown
    expect(screen.queryByText("تنظیمات با موفقیت ذخیره شد.")).not.toBeInTheDocument();
  });

  it("5. createReferralApi sends PUT to /v1/admin/commerce/referrals/config with proper payload", async () => {
    const mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn().mockResolvedValue({
        config: { enabled: true, rewardDays: 20 },
      }),
    };

    const api = createReferralApi(mockClient);
    await api.updateConfig({ enabled: true, rewardDays: 20 });

    expect(mockClient.put).toHaveBeenCalledWith(
      "/v1/admin/commerce/referrals/config",
      { enabled: true, rewardDays: 20 },
    );
  });

  it("6. createReferralApi sends GET to /v1/admin/commerce/referrals/config", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        config: { enabled: true, rewardDays: 15 },
      }),
      post: vi.fn(),
      put: vi.fn(),
    };

    const api = createReferralApi(mockClient);
    await api.getConfig();

    expect(mockClient.get).toHaveBeenCalledWith(
      "/v1/admin/commerce/referrals/config",
    );
  });
});
