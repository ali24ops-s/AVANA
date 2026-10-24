import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeGiftModal } from "../components/welcome/WelcomeGiftModal.js";
import { createWelcomeGiftApi } from "../lib/api/welcome-gift.js";

describe("WelcomeGiftModal UI Component", () => {
  it("renders when isOpen is true with Persian texts, cards, and CTA button", () => {
    const handleClose = vi.fn();

    render(
      <WelcomeGiftModal
        isOpen={true}
        onClose={handleClose}
        walletAmount={20000}
        subscriptionDays={7}
      />
    );

    // Title & Subtitle (without 🎉 sticker)
    expect(screen.getByText("به خانواده آوانا خوش اومدی!")).toBeInTheDocument();
    expect(
      screen.getByText("برای شروع مسیر یادگیریت، دو هدیه ویژه برات در نظر گرفتیم.")
    ).toBeInTheDocument();

    // Avana dedicated character (Avani)
    expect(screen.getByLabelText("آوانی - کاراکتر اختصاصی آوانا")).toBeInTheDocument();

    // Card 1: Wallet credit
    expect(screen.getByText("شارژ هدیه کیف پول")).toBeInTheDocument();
    expect(screen.getByText("برای استفاده از امکانات آوانا")).toBeInTheDocument();
    expect(screen.getByText(/۲۰٬۰۰۰ تومان/)).toBeInTheDocument();

    // Card 2: Subscription
    expect(screen.getByText("اشتراک رایگان آوانا")).toBeInTheDocument();
    expect(
      screen.getByText("برای اینکه با خیال راحت امکانات آوانا رو تجربه کنی")
    ).toBeInTheDocument();
    expect(screen.getByText(/۷ روز/)).toBeInTheDocument();

    // Footer note
    expect(
      screen.getByText("امیدواریم آوانا همراه خوبی در مسیر یادگیریت باشه.")
    ).toBeInTheDocument();

    // CTA button
    const ctaButton = screen.getByRole("button", { name: "بزن بریم!" });
    expect(ctaButton).toBeInTheDocument();

    fireEvent.click(ctaButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not render contents when isOpen is false", () => {
    render(
      <WelcomeGiftModal
        isOpen={false}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("به خانواده آوانا خوش اومدی!")).not.toBeInTheDocument();
  });

  it("shows loading state and disables CTA when isAcknowledging is true", () => {
    render(
      <WelcomeGiftModal
        isOpen={true}
        onClose={vi.fn()}
        isAcknowledging={true}
      />
    );

    const button = screen.getByRole("button", { name: "در حال دریافت..." });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});

describe("WelcomeGift API Client", () => {
  it("calls getStatus and acknowledge endpoints with expected paths", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        eligible: true,
        granted: true,
        popup_seen: false,
        gift: {
          wallet_amount: 20000,
          currency: "toman",
          subscription_days: 7,
          granted_at: "2026-10-21T00:00:00.000Z",
        },
      }),
      post: vi.fn().mockResolvedValue({
        success: true,
        popup_seen_at: "2026-10-21T00:00:00.000Z",
      }),
    };

    const api = createWelcomeGiftApi(mockClient);

    const status = await api.getStatus();
    expect(mockClient.get).toHaveBeenCalledWith("/v1/welcome-gift/status");
    expect(status.eligible).toBe(true);
    expect(status.gift?.wallet_amount).toBe(20000);

    const ack = await api.acknowledge();
    expect(mockClient.post).toHaveBeenCalledWith("/v1/welcome-gift/acknowledge");
    expect(ack.success).toBe(true);
  });
});
