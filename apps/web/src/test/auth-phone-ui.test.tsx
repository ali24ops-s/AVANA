import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import type { ReactNode } from "react";

function renderWithProviders(ui: ReactNode, initialEntries = ["/"]) {
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

describe("Auth UI - Register & Login Flow Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("RegisterPage 4 Required Fields (First Name, Last Name, Email, Phone)", () => {
    it("renders first name, last name, email, phone, and password fields", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("نام")).toBeInTheDocument();
        expect(screen.getByText("نام خانوادگی")).toBeInTheDocument();
        expect(screen.getByText("نشانی ایمیل")).toBeInTheDocument();
        expect(screen.getByText("شماره موبایل")).toBeInTheDocument();
      });

      const firstNameInput = container.querySelector("#firstName") as HTMLInputElement;
      const lastNameInput = container.querySelector("#lastName") as HTMLInputElement;
      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;

      expect(firstNameInput).toBeInTheDocument();
      expect(lastNameInput).toBeInTheDocument();
      expect(phoneInput).toBeInTheDocument();
    });

    it("disables submit button when any required field (first name, last name, email, phone) is empty", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(container.querySelector("#email")).toBeInTheDocument();
      });

      const firstNameInput = container.querySelector("#firstName") as HTMLInputElement;
      const lastNameInput = container.querySelector("#lastName") as HTMLInputElement;
      const emailInput = container.querySelector("#email") as HTMLInputElement;
      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      const passwordInput = container.querySelector("#password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

      // Fill everything EXCEPT first name
      fireEvent.change(lastNameInput, { target: { value: "محمدی" } });
      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(phoneInput, { target: { value: "09123456789" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.change(confirmInput, { target: { value: "password123" } });

      const submitBtn = screen.getByRole("button", { name: /ثبت‌نام/ });
      expect(submitBtn).toBeDisabled();

      // Fill first name -> button becomes enabled
      fireEvent.change(firstNameInput, { target: { value: "علی" } });
      expect(submitBtn).not.toBeDisabled();
    });

    it("displays error when submitting with invalid Iranian phone format", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(container.querySelector("#email")).toBeInTheDocument();
      });

      const firstNameInput = container.querySelector("#firstName") as HTMLInputElement;
      const lastNameInput = container.querySelector("#lastName") as HTMLInputElement;
      const emailInput = container.querySelector("#email") as HTMLInputElement;
      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      const passwordInput = container.querySelector("#password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

      fireEvent.change(firstNameInput, { target: { value: "علی" } });
      fireEvent.change(lastNameInput, { target: { value: "محمدی" } });
      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(phoneInput, { target: { value: "08123456789" } }); // Invalid prefix 08
      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.change(confirmInput, { target: { value: "password123" } });

      const submitBtn = screen.getByRole("button", { name: /ثبت‌نام/ });
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/شماره موبایل معتبر نیست/)).toBeInTheDocument();
      });
    });
  });

  describe("SignInPage Dual Login Methods (Email vs Phone OTP)", () => {
    it("renders selector for «ورود با ایمیل» and «ورود با شماره موبایل»", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ورود با ایمیل")).toBeInTheDocument();
        expect(screen.getByText("ورود با شماره موبایل")).toBeInTheDocument();
      });
    });

    it("switches to Phone OTP login and renders phone number input", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ورود با شماره موبایل")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("ورود با شماره موبایل"));

      await waitFor(() => {
        expect(screen.getByText("دریافت کد ورود")).toBeInTheDocument();
      });

      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      expect(phoneInput).toBeInTheDocument();
      expect(phoneInput.placeholder).toBe("09123456789");
    });
  });

  describe("EmailVerificationPage Dual-Channel Selection", () => {
    it("renders channel selector with «تأیید با ایمیل» and «تأیید با پیامک» options", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            request_id: "test",
            user: {
              id: "user-unverified",
              email: "unverified@example.com",
              phoneNumber: "+989123456789",
              emailVerified: false,
              phoneVerified: false,
              isVerified: false,
              role: "student",
            },
          }),
      } as Response);

      renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
          </Routes>
        </AuthProvider>,
        ["/verify-email"],
      );

      await waitFor(() => {
        expect(screen.getByText("تأیید حساب کاربری")).toBeInTheDocument();
      });

      expect(screen.getByText("تأیید با پیامک")).toBeInTheDocument();
      expect(screen.getByText("تأیید با ایمیل")).toBeInTheDocument();
      expect(screen.getByText("ارسال کد تأیید و ادامه")).toBeInTheDocument();
    });
  });
});
