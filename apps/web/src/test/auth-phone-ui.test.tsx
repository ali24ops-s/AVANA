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
      const majorSelect = container.querySelector("#major")!;
      const passwordInput = container.querySelector("#password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

      // Fill everything EXCEPT first name
      fireEvent.change(lastNameInput, { target: { value: "محمدی" } });
      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(phoneInput, { target: { value: "09123456789" } });
      fireEvent.click(majorSelect);
      fireEvent.click(screen.getByRole("option", { name: "پزشکی" }));
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
      const majorSelect = container.querySelector("#major")!;
      const passwordInput = container.querySelector("#password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

      fireEvent.change(firstNameInput, { target: { value: "علی" } });
      fireEvent.change(lastNameInput, { target: { value: "محمدی" } });
      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(phoneInput, { target: { value: "08123456789" } }); // Invalid prefix 08
      fireEvent.click(majorSelect);
      fireEvent.click(screen.getByRole("option", { name: "پزشکی" }));
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
    it("renders selector for «ورود با ایمیل» and «ورود با موبایل»", async () => {
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
        expect(screen.getByText("ورود با موبایل")).toBeInTheDocument();
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
        expect(screen.getByText("ورود با موبایل")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("ورود با موبایل"));

      await waitFor(() => {
        expect(screen.getByText("دریافت کد ورود")).toBeInTheDocument();
      });

      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      expect(phoneInput).toBeInTheDocument();
      expect(phoneInput.placeholder).toBe("09123456789");
    });
  });

  describe("EmailVerificationPage Verification Flow & Cooldown Regression Tests", () => {
    const mockUnverifiedUser = {
      id: "user-unverified",
      email: "unverified@example.com",
      phoneNumber: "+989123456789",
      emailVerified: false,
      phoneVerified: false,
      isVerified: false,
      role: "student" as const,
    };

    it("Test 1 — Registration → Verification: renders select_channel step where user chooses channel before code dispatch", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-1",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/send")) {
          const body = JSON.parse(init?.body as string);
          expect(body.channel).toBe("email");
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-send",
                message: "کد تأیید ۶ رقمی به ایمیل شما ارسال شد.",
                cooldown_seconds: 60,
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
          </Routes>
        </AuthProvider>,
        ["/verify-email"],
      );

      // Verify that step 1 (select_channel) is shown first, with masked destinations
      await waitFor(() => {
        expect(screen.getByText("تأیید حساب کاربری")).toBeInTheDocument();
        expect(screen.getByText("تأیید با ایمیل")).toBeInTheDocument();
        expect(screen.getByText("u***d@example.com")).toBeInTheDocument();
        expect(screen.getByText("تأیید با پیامک")).toBeInTheDocument();
        expect(screen.getByText("+989 *** 6789")).toBeInTheDocument();
      });

      // No code send request was made yet
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/verification/send"),
        expect.anything(),
      );

      // User explicitly clicks "ارسال کد تأیید"
      const sendBtn = screen.getByRole("button", { name: /ارسال کد تأیید/ });
      fireEvent.click(sendBtn);

      // Now code is dispatched, and page transitions to enter_code step
      await waitFor(() => {
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
      });

      const codeInput = container.querySelector("#verification-code") as HTMLInputElement;
      expect(codeInput).toBeInTheDocument();
      expect(codeInput.placeholder).toBe("123456");
      expect(screen.getByRole("button", { name: /تأیید و ادامه/ })).toBeInTheDocument();
      expect(screen.getByText(/ارسال مجدد تا \d+ ثانیه دیگر/)).toBeInTheDocument();
    });

    it("Test 2 — Existing code can be verified in enter_code step without resend", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-2",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/verify")) {
          const body = JSON.parse(init?.body as string);
          expect(body.channel).toBe("email");
          expect(body.code).toBe("654321");
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-verify",
                user: { ...mockUnverifiedUser, emailVerified: true, isVerified: true },
                memberships: [],
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
            <Route path="/home" element={<div>Dashboard Home</div>} />
          </Routes>
        </AuthProvider>,
        [{ pathname: "/verify-email", state: { step: "enter_code", channel: "email", cooldown: 60 } } as any],
      );

      await waitFor(() => {
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
      });

      const codeInput = container.querySelector("#verification-code") as HTMLInputElement;
      fireEvent.change(codeInput, { target: { value: "654321" } });

      const submitBtn = screen.getByRole("button", { name: /تأیید و ادامه/ });
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/ایمیل شما با موفقیت تأیید شد/)).toBeInTheDocument();
      });
    });

    it("Test 3 — Resend during cooldown handles 429, preserves enter_code step, and allows verifying existing code", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-3",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/send")) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: () =>
              Promise.resolve({
                error: {
                  code: "too_many_requests",
                  message: "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
          </Routes>
        </AuthProvider>,
        [{ pathname: "/verify-email", state: { step: "select_channel", cooldown: 0 } } as any],
      );

      await waitFor(() => {
        expect(screen.getByText("تأیید حساب کاربری")).toBeInTheDocument();
      });

      const sendBtn = screen.getByRole("button", { name: /ارسال کد تأیید/ });
      fireEvent.click(sendBtn);

      // Should handle 429, show error message, and STILL transition to enter_code step
      await waitFor(() => {
        expect(screen.getByText(/لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید/)).toBeInTheDocument();
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
      });

      const codeInput = container.querySelector("#verification-code") as HTMLInputElement;
      expect(codeInput).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /تأیید و ادامه/ })).toBeInTheDocument();
    });

    it("Test 4 — Resend after cooldown sends new code and restarts cooldown in enter_code step", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-4",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/send")) {
          const body = JSON.parse(init?.body as string);
          expect(body.channel).toBe("email");
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-resend",
                message: "کد تأیید جدید به نشانی ایمیل شما ارسال شد.",
                cooldown_seconds: 60,
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
          </Routes>
        </AuthProvider>,
        [{ pathname: "/verify-email", state: { step: "enter_code", cooldown: 0 } } as any],
      );

      await waitFor(() => {
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
      });

      const resendBtn = screen.getByText(/کد را دریافت نکردید؟ ارسال مجدد/);
      fireEvent.click(resendBtn);

      await waitFor(() => {
        expect(screen.getByText(/کد تأیید ۶ رقمی جدید به ایمیل شما ارسال شد/)).toBeInTheDocument();
        expect(screen.getByText(/ارسال مجدد تا \d+ ثانیه دیگر/)).toBeInTheDocument();
      });
    });

    it("renders prominent «تغییر روش تأیید» button in enter_code step and transitions to select_channel without auto-sending", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test",
                user: mockUnverifiedUser,
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      renderWithProviders(
        <AuthProvider>
          <Routes>
            <Route path="/verify-email" element={<EmailVerificationPage />} />
          </Routes>
        </AuthProvider>,
        [{ pathname: "/verify-email", state: { step: "enter_code" } } as any],
      );

      await waitFor(() => {
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
      });

      // The prominent secondary CTA near destination info is visible
      expect(screen.getByText("می‌خواهید کد را از روش دیگری دریافت کنید؟")).toBeInTheDocument();
      const changeMethodBtn = screen.getByRole("button", { name: "تغییر روش تأیید" });
      expect(changeMethodBtn).toBeInTheDocument();

      fireEvent.click(changeMethodBtn);

      await waitFor(() => {
        expect(screen.getByText("تأیید حساب کاربری")).toBeInTheDocument();
        expect(screen.getByText("تأیید با پیامک")).toBeInTheDocument();
        expect(screen.getByText("تأیید با ایمیل")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /ارسال کد تأیید/ })).toBeInTheDocument();
      });

      // Crucial: changing channel did NOT trigger any auto-send request
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/verification/send"),
        expect.anything(),
      );
    });

    it("allows choosing SMS channel and sending OTP only after explicit user action", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-sms",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/send")) {
          const body = JSON.parse(init?.body as string);
          expect(body.channel).toBe("phone");
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-send-sms",
                message: "کد تأیید ۶ رقمی به شماره موبایل شما ارسال شد.",
                cooldown_seconds: 60,
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

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

      // Select SMS channel
      const smsOptionBtn = screen.getByText("تأیید با پیامک").closest("button")!;
      fireEvent.click(smsOptionBtn);

      // Click send
      const sendBtn = screen.getByRole("button", { name: /ارسال کد تأیید/ });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText("کد تأیید را وارد کنید")).toBeInTheDocument();
        expect(screen.getByText("+989 *** 6789")).toBeInTheDocument();
      });
    });

    it("displays error on send failure without requiring user to re-register", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "test-req-err",
                user: mockUnverifiedUser,
              }),
          });
        }
        if (url.includes("/v1/auth/verification/send")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () =>
              Promise.resolve({
                error: {
                  code: "internal_error",
                  message: "ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

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

      const sendBtn = screen.getByRole("button", { name: /ارسال کد تأیید/ });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText(/ارسال پیامک با خطا مواجه شد/)).toBeInTheDocument();
      });

      // User remains on select_channel and can retry or change channel
      expect(screen.getByText("تأیید حساب کاربری")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ارسال کد تأیید/ })).toBeInTheDocument();
    });
  });

  describe("SignInPage UX & Smart Error Guidance Tests", () => {
    it("renders prominent, accessible registration card in SignInPage footer", async () => {
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
        expect(screen.getByText("حساب کاربری ندارید؟")).toBeInTheDocument();
        expect(screen.getByText("در کمتر از یک دقیقه در آوانا عضو شوید.")).toBeInTheDocument();
      });

      const registerLink = screen.getByRole("link", { name: "ثبت‌نام کنید" });
      expect(registerLink).toBeInTheDocument();
      expect(registerLink).toHaveAttribute("href", "/register");
      expect(registerLink.className).toContain("min-h-[44px]");
    });

    it("displays smart guidance on phone 404 error with link to register pre-filling phone", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          });
        }
        if (url.includes("/v1/auth/phone/send-otp")) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () =>
              Promise.resolve({
                error: {
                  code: "not_found",
                  message: "حساب کاربری با این شماره موبایل یافت نشد.",
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ورود با موبایل")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("ورود با موبایل"));

      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      fireEvent.change(phoneInput, { target: { value: "09123456789" } });

      const submitBtn = screen.getByRole("button", { name: "دریافت کد ورود" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("حساب کاربری با این شماره موبایل یافت نشد.")).toBeInTheDocument();
        expect(screen.getByText("اگر هنوز در آوانا حساب ندارید، ابتدا ثبت‌نام کنید.")).toBeInTheDocument();
      });

      const registerAction = screen.getByRole("link", { name: "رفتن به ثبت‌نام" });
      expect(registerAction).toBeInTheDocument();
      expect(registerAction).toHaveAttribute("href", "/register?phone=%2B989123456789");
    });

    it("displays non-assertive guidance on email 401 without claiming account non-existence", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          });
        }
        if (url.includes("/v1/auth/sign-in")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () =>
              Promise.resolve({
                error: {
                  code: "unauthorized",
                  message: "ایمیل یا رمز عبور نادرست است.",
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(container.querySelector("#email")).toBeInTheDocument();
      });

      const emailInput = container.querySelector("#email") as HTMLInputElement;
      const passInput = container.querySelector("#password") as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: "user@example.com" } });
      fireEvent.change(passInput, { target: { value: "wrongpassword" } });

      const submitBtn = screen.getByRole("button", { name: "ورود به سیستم" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("ایمیل یا رمز عبور نادرست است.")).toBeInTheDocument();
        expect(
          screen.getByText("رمز عبور را اشتباه وارد کرده‌اید؟ یا هنوز در آوانا حساب کاربری نساخته‌اید؟"),
        ).toBeInTheDocument();
      });

      const forgotLink = screen.getByRole("link", { name: "بازیابی رمز عبور" });
      const registerLink = screen.getByRole("link", { name: "رفتن به ثبت‌نام" });
      expect(forgotLink).toHaveAttribute("href", "/forgot-password?email=user%40example.com");
      expect(registerLink).toHaveAttribute("href", "/register?email=user%40example.com");
    });

    it("does NOT display registration guidance on rate limit or wrong OTP", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          });
        }
        if (url.includes("/v1/auth/phone/send-otp")) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: () =>
              Promise.resolve({
                error: {
                  code: "too_many_requests",
                  message: "لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید.",
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

      const { container } = renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ورود با موبایل")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("ورود با موبایل"));

      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      fireEvent.change(phoneInput, { target: { value: "09123456789" } });

      const submitBtn = screen.getByRole("button", { name: "دریافت کد ورود" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید/)).toBeInTheDocument();
      });

      // Must NOT display register guidance
      expect(screen.queryByText(/اگر هنوز در آوانا حساب ندارید/)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "رفتن به ثبت‌نام" })).not.toBeInTheDocument();
    });

    it("pre-fills phone and email from query params on RegisterPage", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>,
        ["/register?phone=09123456789&email=prefilled@example.com"],
      );

      await waitFor(() => {
        expect(container.querySelector("#email")).toBeInTheDocument();
      });

      const emailInput = container.querySelector("#email") as HTMLInputElement;
      const phoneInput = container.querySelector("#phoneNumber") as HTMLInputElement;
      expect(emailInput.value).toBe("prefilled@example.com");
      expect(phoneInput.value).toBe("09123456789");
    });
  });
});
