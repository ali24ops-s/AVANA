import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "../components/landing/Footer.js";
import { AVANA_SOCIAL_LINKS } from "../config/social.js";

describe("Footer Social & Contact Links", () => {
  it("renders canonical Telegram link with safe external attributes and accessible label", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const telegramLink = screen.getByRole("link", {
      name: AVANA_SOCIAL_LINKS.telegram.label,
    });
    expect(telegramLink).toBeInTheDocument();
    expect(telegramLink).toHaveAttribute("href", "https://t.me/AavanaClub");
    expect(telegramLink).toHaveAttribute("target", "_blank");
    expect(telegramLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders canonical Instagram link with clean URL (no utm parameters)", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const instagramLink = screen.getByRole("link", {
      name: AVANA_SOCIAL_LINKS.instagram.label,
    });
    expect(instagramLink).toBeInTheDocument();
    expect(instagramLink).toHaveAttribute("href", "https://www.instagram.com/aavana.ir");
    expect(instagramLink).toHaveAttribute("target", "_blank");
    expect(instagramLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders support and info mailto links properly", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const supportLink = screen.getByRole("link", { name: "پشتیبانی" });
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveAttribute("href", "mailto:support@avana.ir");

    const infoMailLink = screen.getByRole("link", {
      name: AVANA_SOCIAL_LINKS.infoEmail.label,
    });
    expect(infoMailLink).toBeInTheDocument();
    expect(infoMailLink).toHaveAttribute("href", "mailto:info@avana.ir");
  });

  it("renders privacy settings button and triggers open privacy settings event", () => {
    let eventFired = false;
    const listener = () => {
      eventFired = true;
    };
    window.addEventListener("avana:open-privacy-settings", listener);

    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const privacyBtn = screen.getByRole("button", { name: "تنظیمات حریم خصوصی" });
    expect(privacyBtn).toBeInTheDocument();

    privacyBtn.click();
    expect(eventFired).toBe(true);

    window.removeEventListener("avana:open-privacy-settings", listener);
  });
});
