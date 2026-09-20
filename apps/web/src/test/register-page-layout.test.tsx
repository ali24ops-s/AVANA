import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

function renderWithProviders(ui: React.ReactElement, initialEntries = ["/register"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RegisterPage Desktop Layout & Viewport Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the compact header and main registration card within 100vh layout hierarchy", () => {
    const { container } = renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    // Root wrapper has min-h-screen and flex-col
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("min-h-screen", "flex", "flex-col");

    // Header has shrink-0 and compact vertical padding
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass("shrink-0", "py-3", "sm:py-3.5");

    // Form container uses responsive flex-1 with compact padding and no overflowing vertical margins
    const formContainer = header?.nextElementSibling as HTMLElement;
    expect(formContainer).toHaveClass("flex-1", "flex", "items-center", "justify-center");
    expect(formContainer.className).not.toContain("my-4");

    // Card wrapper accommodates desktop 2-column layout (sm:max-w-xl)
    const motionWrapper = formContainer.querySelector(".w-full");
    expect(motionWrapper).toHaveClass("sm:max-w-xl");
  });

  it("renders 2-column paired layout for name, contact, and password fields on desktop (sm+)", () => {
    const { container } = renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    const form = container.querySelector("form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveClass("space-y-2.5", "sm:space-y-3");

    // 3 paired two-column grid containers (Name, Contact, Password)
    const gridRows = form?.querySelectorAll(".grid.grid-cols-1.sm\\:grid-cols-2");
    expect(gridRows?.length).toBe(3);

    // Row 1: First Name & Last Name
    const firstName = container.querySelector("#firstName");
    const lastName = container.querySelector("#lastName");
    expect(firstName).toBeInTheDocument();
    expect(lastName).toBeInTheDocument();

    // Row 2: Email & Phone Number
    const email = container.querySelector("#email");
    const phoneNumber = container.querySelector("#phoneNumber");
    expect(email).toBeInTheDocument();
    expect(phoneNumber).toBeInTheDocument();

    // Row 3: Password & Confirm Password
    const password = container.querySelector("#password");
    const confirmPassword = container.querySelector("#confirmPassword");
    expect(password).toBeInTheDocument();
    expect(confirmPassword).toBeInTheDocument();

    // Referral code input
    const referralCode = container.querySelector("#referralCode");
    expect(referralCode).toBeInTheDocument();

    // Submit button and legal link
    expect(screen.getByRole("button", { name: "ثبت‌نام" })).toBeInTheDocument();
    expect(screen.getByText("قوانین و مقررات استفاده")).toBeInTheDocument();
    expect(screen.getByText("ورود به حساب")).toBeInTheDocument();
  });

  it("successfully performs form validation and displays error message cleanly", async () => {
    const { container } = renderWithProviders(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );

    const firstNameInput = container.querySelector("#firstName") as HTMLInputElement;
    const lastNameInput = container.querySelector("#lastName") as HTMLInputElement;
    const emailInput = container.querySelector("#email") as HTMLInputElement;
    const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
    const passwordInput = container.querySelector("#password") as HTMLInputElement;
    const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

    fireEvent.change(firstNameInput, { target: { value: "سارا" } });
    fireEvent.change(lastNameInput, { target: { value: "احمدی" } });
    fireEvent.change(emailInput, { target: { value: "sara@example.com" } });
    fireEvent.change(phoneInput, { target: { value: "09121112233" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.change(confirmInput, { target: { value: "differentPassword" } });

    const submitBtn = screen.getByRole("button", { name: "ثبت‌نام" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("رمز عبور و تکرار آن یکسان نیستند.")).toBeInTheDocument();
    });
  });
});
