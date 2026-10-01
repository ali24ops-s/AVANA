import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignInPage } from "../components/shell/SignInPage.js";
import { ForgotPasswordPage } from "../components/shell/ForgotPasswordPage.js";
import { ResetPasswordPage } from "../components/shell/ResetPasswordPage.js";
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

describe("Auth UI - Forgot Password & Reset Password Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("SignInPage Forgot Password Link", () => {
    it("renders link pointing to /forgot-password", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
        ["/sign-in"],
      );

      await waitFor(() => {
        expect(container.querySelector("#email")).toBeInTheDocument();
      });

      const forgotLink = screen.getByText("رمز عبورتان را فراموش کرده‌اید؟");
      expect(forgotLink).toBeInTheDocument();
      expect(forgotLink.closest("a")).toHaveAttribute("href", "/forgot-password");
    });
  });

  describe("ForgotPasswordPage", () => {
    it("renders header, email input, and submit button", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>,
        ["/forgot-password"],
      );

      await waitFor(() => {
        expect(screen.getByText("بازیابی رمز عبور")).toBeInTheDocument();
      });

      const emailInput = container.querySelector("#forgot-email");
      expect(emailInput).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ارسال لینک بازیابی/i })).toBeInTheDocument();
      expect(screen.getByText("بازگشت به ورود")).toBeInTheDocument();
    });

    it("displays validation error when submitting empty or invalid email", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>,
        ["/forgot-password"],
      );

      await waitFor(() => {
        expect(container.querySelector("#forgot-email")).toBeInTheDocument();
      });

      const form = container.querySelector("form");
      expect(form).toBeInTheDocument();

      // Submit empty
      fireEvent.submit(form!);
      await waitFor(() => {
        expect(screen.getByText("لطفاً نشانی ایمیل خود را وارد کنید.")).toBeInTheDocument();
      });

      // Enter invalid email format
      const emailInput = container.querySelector("#forgot-email") as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: "invalid-email" } });
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByText("لطفاً یک نشانی ایمیل معتبر وارد کنید.")).toBeInTheDocument();
      });
    });

    it("sends forgot-password request, displays success message, and activates cooldown timer", async () => {
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          } as Response);
        }
        if (url.includes("/v1/auth/forgot-password")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-123",
                message: "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد.",
                cooldown_seconds: 60,
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled url: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

      const { container } = renderWithProviders(
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>,
        ["/forgot-password"],
      );

      await waitFor(() => {
        expect(container.querySelector("#forgot-email")).toBeInTheDocument();
      });

      const emailInput = container.querySelector("#forgot-email") as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: "student@example.com" } });

      const form = container.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(
          screen.getByText("اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی ارسال شد."),
        ).toBeInTheDocument();
      });

      // Submit button should be disabled and reflect cooldown
      const submitBtn = screen.getByRole("button");
      expect(submitBtn).toBeDisabled();
      expect(submitBtn.textContent).toContain("ارسال مجدد تا (60 ثانیه)");

      // Verify POST body
      const forgotPasswordCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/v1/auth/forgot-password"),
      );
      expect(forgotPasswordCall).toBeDefined();
      const body = JSON.parse(forgotPasswordCall![1]?.body as string);
      expect(body).toEqual({ email: "student@example.com" });
    });

    it("displays error message if the API returns an error", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          } as Response);
        }
        if (url.includes("/v1/auth/forgot-password")) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: () =>
              Promise.resolve({
                error: {
                  code: "rate_limit_exceeded",
                  message: "تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.",
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled url: ${url}`));
      });

      const { container } = renderWithProviders(
        <AuthProvider>
          <ForgotPasswordPage />
        </AuthProvider>,
        ["/forgot-password"],
      );

      await waitFor(() => {
        expect(container.querySelector("#forgot-email")).toBeInTheDocument();
      });

      const emailInput = container.querySelector("#forgot-email") as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: "student@example.com" } });
      fireEvent.submit(container.querySelector("form")!);

      await waitFor(() => {
        expect(
          screen.getByText("تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید."),
        ).toBeInTheDocument();
      });
    });
  });

  describe("ResetPasswordPage", () => {
    it("displays alert when token is absent in URL query string", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      renderWithProviders(
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>,
        ["/reset-password"],
      );

      await waitFor(() => {
        expect(
          screen.getByText("لینک بازیابی رمز عبور فاقد شناسه امنیتی لازم است یا منقضی شده است."),
        ).toBeInTheDocument();
        expect(screen.getByText("درخواست مجدد لینک بازیابی")).toBeInTheDocument();
      });
    });

    it("sanitizes token from browser history using history.replaceState", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const replaceStateSpy = vi.spyOn(window.history, "replaceState");

      const { container } = renderWithProviders(
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>,
        ["/reset-password?token=top-secret-token-12345"],
      );

      await waitFor(() => {
        expect(container.querySelector("#new-password")).toBeInTheDocument();
      });

      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/reset-password");
    });

    it("validates password length (min 8 chars) and password confirmation match", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);

      const { container } = renderWithProviders(
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>,
        ["/reset-password?token=valid-token-abc"],
      );

      await waitFor(() => {
        expect(container.querySelector("#new-password")).toBeInTheDocument();
      });

      const passwordInput = container.querySelector("#new-password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirm-new-password") as HTMLInputElement;
      const form = container.querySelector("form")!;

      // Short password (< 8 chars)
      fireEvent.change(passwordInput, { target: { value: "pass1" } });
      fireEvent.change(confirmInput, { target: { value: "pass1" } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText("رمز عبور باید حداقل ۸ کاراکتر باشد.")).toBeInTheDocument();
      });

      // Mismatched passwords
      fireEvent.change(passwordInput, { target: { value: "new-secret-password-123" } });
      fireEvent.change(confirmInput, { target: { value: "different-password-123" } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText("رمز عبور و تکرار آن یکسان نیستند.")).toBeInTheDocument();
      });
    });

    it("submits valid reset-password request and shows success screen", async () => {
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          } as Response);
        }
        if (url.includes("/v1/auth/reset-password")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-reset-456",
                message: "رمز عبور شما با موفقیت به روز شد. لطفاً دوباره وارد شوید.",
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled url: ${url}`));
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

      const { container } = renderWithProviders(
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>,
        ["/reset-password?token=valid-token-abc"],
      );

      await waitFor(() => {
        expect(container.querySelector("#new-password")).toBeInTheDocument();
      });

      const passwordInput = container.querySelector("#new-password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirm-new-password") as HTMLInputElement;

      fireEvent.change(passwordInput, { target: { value: "password-12345" } });
      fireEvent.change(confirmInput, { target: { value: "password-12345" } });
      fireEvent.submit(container.querySelector("form")!);

      await waitFor(() => {
        expect(screen.getByText("رمز عبور شما با موفقیت تغییر کرد.")).toBeInTheDocument();
        expect(screen.getByText("ورود با رمز جدید")).toBeInTheDocument();
      });

      const resetCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes("/v1/auth/reset-password"),
      );
      expect(resetCall).toBeDefined();
      const body = JSON.parse(resetCall![1]?.body as string);
      expect(body).toEqual({
        token: "valid-token-abc",
        password: "password-12345",
      });
    });

    it("displays error message and retry prompt if reset token is invalid or expired", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/me")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { code: "unauthorized" } }),
          } as Response);
        }
        if (url.includes("/v1/auth/reset-password")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () =>
              Promise.resolve({
                error: {
                  code: "invalid_or_expired_token",
                  message: "لینک بازیابی نامعتبر است یا منقضی شده است.",
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled url: ${url}`));
      });

      const { container } = renderWithProviders(
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>,
        ["/reset-password?token=expired-token-xyz"],
      );

      await waitFor(() => {
        expect(container.querySelector("#new-password")).toBeInTheDocument();
      });

      const passwordInput = container.querySelector("#new-password") as HTMLInputElement;
      const confirmInput = container.querySelector("#confirm-new-password") as HTMLInputElement;

      fireEvent.change(passwordInput, { target: { value: "someValidPassword123" } });
      fireEvent.change(confirmInput, { target: { value: "someValidPassword123" } });
      fireEvent.submit(container.querySelector("form")!);

      await waitFor(() => {
        expect(
          screen.getByText("لینک بازیابی نامعتبر است یا منقضی شده است."),
        ).toBeInTheDocument();
        expect(screen.getByText("درخواست لینک بازیابی جدید")).toBeInTheDocument();
      });
    });
  });
});
