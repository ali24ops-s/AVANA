import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditProfileModal } from "../components/shell/EditProfileModal.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { AuthProvider, useAuth } from "../providers/AuthProvider.js";
import { useState } from "react";
import type { ReactNode } from "react";

function TestProfileWrapper() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div data-testid="current-user-name">{user?.name ?? "no-name"}</div>
      <div data-testid="current-user-email">{user?.email ?? "no-email"}</div>
      <div data-testid="current-user-phone">{user?.phoneNumber ?? "no-phone"}</div>
      <div data-testid="current-user-email-verified">{user?.emailVerified ? "verified" : "unverified"}</div>
      <div data-testid="current-user-phone-verified">{user?.phoneVerified ? "verified" : "unverified"}</div>
      <EditProfileModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}

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

describe("Unified Contact Verification & Phone+Password UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = "avana_csrf=test-csrf-token";
    window.sessionStorage?.setItem("avana_worker_logged_out", "true");
  });

  describe("EditProfileModal Verification Badges & Flows", () => {
    it("renders green 'تأییدشده' badges when email and phone are already verified", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-1",
              email: "verified@example.com",
              phoneNumber: "09121111111",
              name: "سارا حسینی",
              role: "student",
              emailVerified: true,
              emailVerifiedAt: "2026-01-01T00:00:00.000Z",
              phoneVerified: true,
              phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("سارا")).toBeInTheDocument();
      });

      // Both email and phone should show "تأییدشده"
      const verifiedBadges = screen.getAllByText("تأییدشده");
      expect(verifiedBadges.length).toBe(2);

      // Verify buttons should NOT be present when verified
      expect(screen.queryByText("تأیید ایمیل")).not.toBeInTheDocument();
      expect(screen.queryByText("تأیید شماره موبایل")).not.toBeInTheDocument();
    });

    it("renders amber 'تأیید نشده' badges and triggers email verification with OTP modal", async () => {
      // 1. Initial /v1/me
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-2",
                email: "unverified@example.com",
                phoneNumber: "09122222222",
                name: "امیر علی",
                role: "student",
                emailVerified: false,
                emailVerifiedAt: null,
                phoneVerified: false,
                phoneVerifiedAt: null,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. POST /v1/auth/verification/send-code
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "sent",
              cooldownSeconds: 60,
              message: "کد تأیید به ایمیل ارسال شد.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 3. POST /v1/auth/verification/verify
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "verified",
              type: "email",
              user: {
                id: "u-2",
                email: "unverified@example.com",
                phoneNumber: "09122222222",
                name: "امیر علی",
                role: "student",
                emailVerified: true,
                emailVerifiedAt: new Date().toISOString(),
                phoneVerified: false,
                phoneVerifiedAt: null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("امیر")).toBeInTheDocument();
      });

      // Both should show "تأیید نشده"
      const unverifiedBadges = screen.getAllByText("تأیید نشده");
      expect(unverifiedBadges.length).toBe(2);

      // Both verification action buttons exist
      const verifyEmailBtn = screen.getByRole("button", { name: "تأیید ایمیل" });
      const verifyPhoneBtn = screen.getByRole("button", { name: "تأیید شماره موبایل" });
      expect(verifyEmailBtn).toBeInTheDocument();
      expect(verifyPhoneBtn).toBeInTheDocument();

      // Click "تأیید ایمیل"
      fireEvent.click(verifyEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("ورود کد تأیید ایمیل‌شده")).toBeInTheDocument();
      });

      // Check request sent to send
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/verification/send"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ channel: "email" }),
        }),
      );

      // Enter OTP code and verify
      const codeInput = screen.getByPlaceholderText("123456");
      fireEvent.change(codeInput, { target: { value: "123456" } });

      const confirmBtn = screen.getByRole("button", { name: "ثبت کد تأیید" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        // Modal closes, success banner shows, and email badge is now "تأییدشده"
        expect(screen.getByText("نشانی ایمیل شما با موفقیت تأیید شد.")).toBeInTheDocument();
        expect(screen.getByTestId("current-user-email-verified")).toHaveTextContent("verified");
      });
    });

    it("triggers mobile phone verification and updates phoneVerified status without reload", async () => {
      // 1. Initial /v1/me
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-3",
                email: "test@example.com",
                phoneNumber: "09123333333",
                name: "مریم رضایی",
                role: "student",
                emailVerified: true,
                emailVerifiedAt: "2026-01-01T00:00:00.000Z",
                phoneVerified: false,
                phoneVerifiedAt: null,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. POST /v1/auth/verification/send
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "sent",
              cooldownSeconds: 60,
              message: "کد تأیید از طریق پیامک ارسال شد.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 3. POST /v1/auth/verification/verify
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "verified",
              type: "phone",
              user: {
                id: "u-3",
                email: "test@example.com",
                phoneNumber: "09123333333",
                name: "مریم رضایی",
                role: "student",
                emailVerified: true,
                emailVerifiedAt: "2026-01-01T00:00:00.000Z",
                phoneVerified: true,
                phoneVerifiedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("مریم")).toBeInTheDocument();
      });

      const verifyPhoneBtn = screen.getByRole("button", { name: "تأیید شماره موبایل" });
      fireEvent.click(verifyPhoneBtn);

      await waitFor(() => {
        expect(screen.getByText("ورود کد تأیید پیامک‌شده")).toBeInTheDocument();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/verification/send"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ channel: "phone" }),
        }),
      );

      const codeInput = screen.getByPlaceholderText("123456");
      fireEvent.change(codeInput, { target: { value: "654321" } });

      const confirmBtn = screen.getByRole("button", { name: "ثبت کد تأیید" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText("شماره موبایل شما با موفقیت تأیید شد.")).toBeInTheDocument();
        expect(screen.getByTestId("current-user-phone-verified")).toHaveTextContent("verified");
      });
    });

    it("displays warning banner when user changes verified phone number or email", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-4",
              email: "old@example.com",
              phoneNumber: "09124444444",
              name: "حسین احمدی",
              role: "student",
              emailVerified: true,
              emailVerifiedAt: "2026-01-01T00:00:00.000Z",
              phoneVerified: true,
              phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("09124444444")).toBeInTheDocument();
      });

      // Initially no warning banner
      expect(screen.queryByText(/با ویرایش ایمیل یا شماره موبایل تأییدشده/)).not.toBeInTheDocument();

      // Change phone number
      const phoneInput = screen.getByLabelText(/شماره موبایل/i);
      fireEvent.change(phoneInput, { target: { value: "09125555555" } });

      // Warning banner must now appear
      await waitFor(() => {
        expect(screen.getByText(/با ویرایش ایمیل یا شماره موبایل تأییدشده/)).toBeInTheDocument();
      });
    });

    it("renders modal dialog with widened desktop class 'sm:max-w-[640px]'", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-desktop",
              email: "desktop@example.com",
              name: "کاربر دسکتاپ",
              role: "student",
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("کاربر")).toBeInTheDocument();
      });

      const dialogPanel = document.querySelector(".sm\\:max-w-\\[640px\\]");
      expect(dialogPanel).toBeInTheDocument();
      expect(dialogPanel).toHaveClass("max-w-2xl");
    });

    it("has exactly one close button and no nested dialog or inner card container", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-structure",
              email: "structure@example.com",
              name: "علی رضایی",
              role: "student",
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("علی")).toBeInTheDocument();
      });

      // 1. Only ONE dialog element in document
      const dialogs = document.querySelectorAll('[role="dialog"]');
      expect(dialogs.length).toBe(1);

      // 2. Exactly ONE close button in modal
      const closeButtons = document.querySelectorAll('button[aria-label="بستن پنجره"]');
      expect(closeButtons.length).toBe(1);

      // 3. No nested card with separate rounded-card class in modal body
      const innerCards = document.querySelectorAll(".rounded-card");
      expect(innerCards.length).toBe(0);

      // 4. Form content is directly in modal body
      const form = document.querySelector("form");
      expect(form).toBeInTheDocument();
      expect(form).toHaveClass("flex-1", "flex", "flex-col");
    });

    it("keeps modal open after email registration/update, immediately shows 'تأیید ایمیل', and allows inline verification", async () => {
      // 1. Initial /v1/me with unverified email
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-email-flow",
                email: "initial@example.com",
                name: "سارا حسینی",
                role: "student",
                emailVerified: true,
                emailVerifiedAt: "2026-01-01T00:00:00.000Z",
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. PATCH /v1/auth/profile
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-email-flow",
                email: "newemail@example.com",
                name: "سارا حسینی",
                role: "student",
                emailVerified: false,
                emailVerifiedAt: null,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 3. POST /v1/auth/verification/send
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "sent",
              cooldownSeconds: 60,
              message: "کد تأیید به نشانی ایمیل شما ارسال شد.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 4. POST /v1/auth/verification/verify
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "verified",
              type: "email",
              user: {
                id: "u-email-flow",
                email: "newemail@example.com",
                name: "سارا حسینی",
                role: "student",
                emailVerified: true,
                emailVerifiedAt: new Date().toISOString(),
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("initial@example.com")).toBeInTheDocument();
      });

      // Update email
      const emailInput = screen.getByLabelText(/نشانی ایمیل/i);
      fireEvent.change(emailInput, { target: { value: "newemail@example.com" } });

      const saveBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
      fireEvent.click(saveBtn);

      // Modal must remain open and display success message + "تأیید ایمیل" CTA button
      await waitFor(() => {
        expect(screen.getByText("اطلاعات تماس با موفقیت ذخیره شد. اکنون می‌توانید آن را تأیید کنید.")).toBeInTheDocument();
      });

      const verifyEmailBtn = screen.getByRole("button", { name: "تأیید ایمیل" });
      expect(verifyEmailBtn).toBeInTheDocument();

      // Trigger inline verification
      fireEvent.click(verifyEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("ورود کد تأیید ایمیل‌شده")).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText("123456");
      fireEvent.change(codeInput, { target: { value: "112233" } });

      const confirmBtn = screen.getByRole("button", { name: "ثبت کد تأیید" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText("نشانی ایمیل شما با موفقیت تأیید شد.")).toBeInTheDocument();
        expect(screen.getByTestId("current-user-email-verified")).toHaveTextContent("verified");
      });
    });

    it("keeps modal open after initial phone registration, immediately shows 'تأیید شماره موبایل', and verifies inline", async () => {
      // 1. Initial /v1/me with no phone number
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-newphone",
                email: "initial@example.com",
                phoneNumber: null,
                name: "سارا حسینی",
                role: "student",
                emailVerified: true,
                phoneVerified: false,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. PATCH /v1/auth/profile
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-newphone",
                email: "initial@example.com",
                phoneNumber: "+989127777777",
                name: "سارا حسینی",
                role: "student",
                emailVerified: true,
                phoneVerified: false,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 3. POST /v1/auth/verification/send
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "sent",
              cooldownSeconds: 60,
              message: "کد تأیید ارسال شد.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 4. POST /v1/auth/verification/verify
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "verified",
              type: "phone",
              user: {
                id: "u-newphone",
                email: "initial@example.com",
                phoneNumber: "+989127777777",
                name: "سارا حسینی",
                role: "student",
                emailVerified: true,
                phoneVerified: true,
                phoneVerifiedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("سارا")).toBeInTheDocument();
      });

      // Enter new phone number
      const phoneInput = screen.getByLabelText(/شماره موبایل/i);
      fireEvent.change(phoneInput, { target: { value: "09127777777" } });

      // Click "ذخیره تغییرات"
      const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
      fireEvent.click(submitBtn);

      // Verify that modal stays open, success message appears, and "تأیید شماره موبایل" is immediately available
      await waitFor(() => {
        expect(screen.getByText("اطلاعات تماس با موفقیت ذخیره شد. اکنون می‌توانید آن را تأیید کنید.")).toBeInTheDocument();
      });

      const verifyPhoneBtn = screen.getByRole("button", { name: "تأیید شماره موبایل" });
      expect(verifyPhoneBtn).toBeInTheDocument();

      // Click "تأیید شماره موبایل"
      fireEvent.click(verifyPhoneBtn);

      await waitFor(() => {
        expect(screen.getByText("ورود کد تأیید پیامک‌شده")).toBeInTheDocument();
      });

      // Enter 6-digit OTP code and submit
      const codeInput = screen.getByPlaceholderText("123456");
      fireEvent.change(codeInput, { target: { value: "777888" } });

      const confirmBtn = screen.getByRole("button", { name: "ثبت کد تأیید" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText("شماره موبایل شما با موفقیت تأیید شد.")).toBeInTheDocument();
        expect(screen.getByTestId("current-user-phone-verified")).toHaveTextContent("verified");
      });
    });

    it("closes modal automatically when only name is updated and no contact info changed", async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(globalThis, "fetch")
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                user: {
                  id: "u-nameonly",
                  email: "user@example.com",
                  phoneNumber: "09121111111",
                  name: "علی احمدی",
                  role: "student",
                  emailVerified: true,
                  phoneVerified: true,
                },
                memberships: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                user: {
                  id: "u-nameonly",
                  email: "user@example.com",
                  phoneNumber: "09121111111",
                  name: "علی رضایی",
                  role: "student",
                  emailVerified: true,
                  phoneVerified: true,
                },
                memberships: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );

        renderWithProviders(
          <AuthProvider>
            <TestProfileWrapper />
          </AuthProvider>,
        );

        await vi.waitFor(() => {
          expect(screen.getByDisplayValue("علی")).toBeInTheDocument();
        });

        const lastNameInput = screen.getByLabelText(/نام خانوادگی/i);
        fireEvent.change(lastNameInput, { target: { value: "رضایی" } });

        const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
        fireEvent.click(submitBtn);

        await vi.waitFor(() => {
          expect(screen.getByText("اطلاعات پروفایل شما با موفقیت به‌روزرسانی شد.")).toBeInTheDocument();
        });

        // Fast-forward 700ms timer
        vi.advanceTimersByTime(750);

        // Modal dialog should close
        await vi.waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("SignInPage Unified Identifier & Password Login", () => {
    it("renders input labeled 'ایمیل یا شماره موبایل' and sends identifier with password", async () => {
      // 1. Initial /v1/me (unauthenticated)
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: "unauthorized" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. POST /v1/auth/sign-in
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              user: {
                id: "u-5",
                email: "phone.user@example.com",
                phoneNumber: "+989126666666",
                name: "کاربر تستی",
                role: "student",
                phoneVerified: true,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ایمیل یا شماره موبایل")).toBeInTheDocument();
      });

      const identifierInput = screen.getByPlaceholderText("ایمیل یا شماره موبایل");
      const passwordInput = screen.getByLabelText("رمز عبور");

      fireEvent.change(identifierInput, { target: { value: "09126666666" } });
      fireEvent.change(passwordInput, { target: { value: "Secret123!" } });

      const submitBtn = screen.getByRole("button", { name: "ورود به سیستم" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/v1/auth/sign-in"),
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              identifier: "09126666666",
              email: "09126666666",
              password: "Secret123!",
            }),
          }),
        );
      });
    });

    it("displays Persian guidance error message when logging in with unverified phone number (403)", async () => {
      // 1. Initial /v1/me (unauthenticated)
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: "unauthorized" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        )
        // 2. POST /v1/auth/sign-in returns 403 Forbidden
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                code: "forbidden",
                message: "شماره موبایل شما تأیید نشده است. لطفاً ابتدا از طریق ایمیل وارد شده و شماره موبایل خود را در بخش ویرایش مشخصات تأیید کنید، یا با کد یکبار مصرف پیامکی وارد شوید.",
              },
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          ),
        );

      renderWithProviders(
        <AuthProvider>
          <SignInPage />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText("ایمیل یا شماره موبایل")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText("ایمیل یا شماره موبایل"), {
        target: { value: "09129999999" },
      });
      fireEvent.change(screen.getByLabelText("رمز عبور"), {
        target: { value: "Secret123!" },
      });

      fireEvent.click(screen.getByRole("button", { name: "ورود به سیستم" }));

      await waitFor(() => {
        expect(
          screen.getByText(/شماره موبایل شما تأیید نشده است/),
        ).toBeInTheDocument();
      });
    });
  });
});
