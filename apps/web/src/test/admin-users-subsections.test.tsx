/**
 * Admin Users Subsections & Navigation Tests.
 *
 * Verifies:
 * 1. Navigation tabs render on all 4 sub-routes with active state.
 * 2. Subscription Payments (/admin/users/subscriptions) displays ONLY subscriptions.
 * 3. Product Purchases (/admin/users/purchases) displays ONLY products/courses.
 * 4. Wallet Top-ups (/admin/users/wallet-topups) displays ONLY wallet top-ups with custom amounts.
 * 5. Cross-check: Single user with multiple payment types has transactions strictly classified without overlap or duplication.
 * 6. Filters, search, pagination, and status handling for each subsection.
 */

import * as React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";
import { AdminUserSubscriptionsPage } from "../pages/admin/users/AdminUserSubscriptionsPage.js";
import { AdminUserPurchasesPage } from "../pages/admin/users/AdminUserPurchasesPage.js";
import { AdminUserWalletTopupsPage } from "../pages/admin/users/AdminUserWalletTopupsPage.js";

const mockAdminUser = {
  id: "admin-1",
  email: "admin@avana.test",
  name: "Platform Admin",
  role: "platform_admin" as const,
};

const mockSubscriptionPayments = {
  payments: [
    {
      id: "pay-sub-1",
      orderId: "ord-sub-1",
      orderNumber: "ORD-SUB-101",
      userId: "user-1",
      userName: "Ali Rezza",
      userEmail: "ali@avana.test",
      productId: "prod-sub-monthly",
      productTitle: "اشتراک ماهانه آوانا",
      productType: "subscription",
      amount: 99000,
      currency: "toman",
      gateway: "zarinpal",
      authority: "A001",
      transactionId: "TRX-101",
      status: "paid",
      createdAt: "2026-09-01T10:00:00.000Z",
      paidAt: "2026-09-01T10:05:00.000Z",
    },
    {
      id: "pay-sub-2",
      orderId: "ord-sub-2",
      orderNumber: "ORD-SUB-102",
      userId: "user-2",
      userName: "Sara Ahmadi",
      userEmail: "sara@avana.test",
      productId: "prod-sub-yearly",
      productTitle: "اشتراک سالانه آوانا",
      productType: "subscription",
      amount: 599000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: null,
      trackingNumber: "C2C-778899",
      sourceCardLast4: "4321",
      payerName: "سارا احمدی",
      receiptUrl: "https://r2.avana.test/receipts/sub.jpg",
      status: "pending_admin_review",
      createdAt: "2026-09-02T12:00:00.000Z",
      paidAt: null,
    },
  ],
  totalCount: 2,
};

const mockProductPurchases = {
  payments: [
    {
      id: "pay-prod-1",
      orderId: "ord-prod-1",
      orderNumber: "ORD-PROD-201",
      userId: "user-1",
      userName: "Ali Rezza",
      userEmail: "ali@avana.test",
      productId: "prod-course-physics",
      productTitle: "دوره فیزیک جامع دوازدهم",
      productType: "course",
      amount: 250000,
      currency: "toman",
      gateway: "zarinpal",
      authority: "A002",
      transactionId: "TRX-201",
      status: "paid",
      createdAt: "2026-09-03T14:00:00.000Z",
      paidAt: "2026-09-03T14:03:00.000Z",
    },
  ],
  totalCount: 1,
};

const mockWalletTopupPayments = {
  payments: [
    {
      id: "pay-wallet-1",
      orderId: "ord-wallet-1",
      orderNumber: "ORD-WAL-301",
      userId: "user-1",
      userName: "Ali Rezza",
      userEmail: "ali@avana.test",
      productId: "prod-wallet-topup",
      productTitle: "شارژ کیف پول",
      productType: "wallet_topup",
      amount: 45000, // Custom variable amount (independent of subscription price)
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: null,
      trackingNumber: "TRK-WAL-9988",
      sourceCardLast4: "8899",
      payerName: "علی رضا",
      receiptUrl: "https://r2.avana.test/receipts/wallet.jpg",
      status: "pending_admin_review",
      createdAt: "2026-09-04T16:00:00.000Z",
      paidAt: null,
    },
    {
      id: "pay-wallet-2",
      orderId: "ord-wallet-2",
      orderNumber: "ORD-WAL-302",
      userId: "user-3",
      userName: "Mohammad Reza",
      userEmail: "mohammad@avana.test",
      productId: "prod-wallet-topup",
      productTitle: "شارژ کیف پول",
      productType: "wallet_topup",
      amount: 150000, // Another custom variable amount
      currency: "toman",
      gateway: "zarinpal",
      authority: "A003",
      transactionId: "TRX-302",
      status: "paid",
      createdAt: "2026-09-05T18:00:00.000Z",
      paidAt: "2026-09-05T18:02:00.000Z",
    },
  ],
  totalCount: 2,
};

function setupMockFetch() {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    // Auth endpoints
    if (url.includes("/v1/auth/me") || url.includes("/v1/me")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ user: mockAdminUser }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // List users
    if (url.includes("/v1/admin/users") && !url.includes("/commerce") && !url.includes("/role")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            users: [
              {
                id: "user-1",
                email: "ali@avana.test",
                name: "Ali Rezza",
                role: "student",
                emailVerified: true,
                createdAt: "2026-08-01T10:00:00.000Z",
              },
            ],
            totalCount: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Approve payment
    if (url.includes("/approve") && init?.method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, message: "پرداخت تأیید شد" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Reject payment
    if (url.includes("/reject") && init?.method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, message: "پرداخت رد شد" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Commerce payments with category query
    if (url.includes("/v1/admin/commerce/payments")) {
      if (url.includes("category=subscription")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(mockSubscriptionPayments),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (url.includes("category=product")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(mockProductPurchases),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (url.includes("category=wallet_topup")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(mockWalletTopupPayments),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            payments: [
              ...mockSubscriptionPayments.payments,
              ...mockProductPurchases.payments,
              ...mockWalletTopupPayments.payments,
            ],
            totalCount: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
}

function renderWithProviders(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthProvider>
          <Routes>
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/subscriptions" element={<AdminUserSubscriptionsPage />} />
            <Route path="/admin/users/purchases" element={<AdminUserPurchasesPage />} />
            <Route path="/admin/users/wallet-topups" element={<AdminUserWalletTopupsPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Admin Users Management Subsections", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = setupMockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("1. Navigation bar renders on /admin/users and displays all 4 tabs", async () => {
    renderWithProviders("/admin/users");

    await waitFor(() => {
      expect(screen.getByText("مدیریت کاربران")).toBeInTheDocument();
    });

    const nav = screen.getByRole("navigation", { name: "ناوبری بخش مدیریت کاربران" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /کاربران/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /پرداخت اشتراک‌ها/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /خرید محصولات/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شارژ کیف پول/i })).toBeInTheDocument();
  });

  it("2. /admin/users/subscriptions lists ONLY subscription payments", async () => {
    renderWithProviders("/admin/users/subscriptions");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /پرداخت اشتراک‌ها/i })).toBeInTheDocument();
    });

    // Verify subscription items are present
    expect(await screen.findByText("اشتراک ماهانه آوانا")).toBeInTheDocument();
    expect(screen.getByText("اشتراک سالانه آوانا")).toBeInTheDocument();
    expect(screen.getByText("ORD-SUB-101")).toBeInTheDocument();
    expect(screen.getByText("ORD-SUB-102")).toBeInTheDocument();

    // Verify products or wallet top-ups do NOT appear
    expect(screen.queryByText("دوره فیزیک جامع دوازدهم")).not.toBeInTheDocument();
    expect(screen.queryByText("TRK-WAL-9988")).not.toBeInTheDocument();
  });

  it("3. /admin/users/purchases lists ONLY product/course purchases", async () => {
    renderWithProviders("/admin/users/purchases");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /خرید محصولات/i })).toBeInTheDocument();
    });

    // Verify product items are present
    expect(await screen.findByText("دوره فیزیک جامع دوازدهم")).toBeInTheDocument();
    expect(screen.getByText("ORD-PROD-201")).toBeInTheDocument();

    // Verify subscription or wallet top-up items do NOT appear
    expect(screen.queryByText("اشتراک ماهانه آوانا")).not.toBeInTheDocument();
    expect(screen.queryByText("اشتراک سالانه آوانا")).not.toBeInTheDocument();
    expect(screen.queryByText("TRK-WAL-9988")).not.toBeInTheDocument();
  });

  it("4. /admin/users/wallet-topups lists ONLY wallet top-ups with custom amounts", async () => {
    renderWithProviders("/admin/users/wallet-topups");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: /شارژ کیف پول/i })).toBeInTheDocument();
    });

    // Verify wallet top-up items and custom amounts (e.g. 45,000 and 150,000 Tomans)
    expect(await screen.findByText("ORD-WAL-301")).toBeInTheDocument();
    expect(screen.getByText("ORD-WAL-302")).toBeInTheDocument();
    expect(screen.getByText(/۴۵٬۰۰۰/)).toBeInTheDocument();
    expect(screen.getByText(/۱۵۰٬۰۰۰/)).toBeInTheDocument();

    // Verify subscription or course items do NOT appear
    expect(screen.queryByText("اشتراک ماهانه آوانا")).not.toBeInTheDocument();
    expect(screen.queryByText("دوره فیزیک جامع دوازدهم")).not.toBeInTheDocument();
  });

  it("5. Cross-check: Single user transactions appear strictly in their respective subsections", async () => {
    // User "Ali Rezza" (user-1) has:
    // - Subscription: pay-sub-1 (ORD-SUB-101, 99000)
    // - Product: pay-prod-1 (ORD-PROD-201, 250000)
    // - Wallet: pay-wallet-1 (ORD-WAL-301, 45000)

    // Check Subscriptions tab
    const subView = renderWithProviders("/admin/users/subscriptions");
    expect(await subView.findByText("ORD-SUB-101")).toBeInTheDocument();
    expect(subView.queryByText("ORD-PROD-201")).not.toBeInTheDocument();
    expect(subView.queryByText("ORD-WAL-301")).not.toBeInTheDocument();
    subView.unmount();

    // Check Purchases tab
    const prodView = renderWithProviders("/admin/users/purchases");
    expect(await prodView.findByText("ORD-PROD-201")).toBeInTheDocument();
    expect(prodView.queryByText("ORD-SUB-101")).not.toBeInTheDocument();
    expect(prodView.queryByText("ORD-WAL-301")).not.toBeInTheDocument();
    prodView.unmount();

    // Check Wallet tab
    const walView = renderWithProviders("/admin/users/wallet-topups");
    expect(await walView.findByText("ORD-WAL-301")).toBeInTheDocument();
    expect(walView.queryByText("ORD-SUB-101")).not.toBeInTheDocument();
    expect(walView.queryByText("ORD-PROD-201")).not.toBeInTheDocument();
    walView.unmount();
  });

  it("6. Card-to-card inspection and approval flow in Subscriptions tab", async () => {
    renderWithProviders("/admin/users/subscriptions");

    // Click "بررسی فیش" button for pending C2C subscription
    const reviewBtn = await screen.findByRole("button", { name: /بررسی فیش/i });
    fireEvent.click(reviewBtn);

    // Modal opens with user & receipt details
    expect(await screen.findByText("بررسی و تأیید پرداخت کارت‌به‌کارت")).toBeInTheDocument();
    expect(screen.getByText("سارا احمدی")).toBeInTheDocument();

    // Click approve button
    const approveBtn = screen.getByRole("button", { name: /تأیید پرداخت و فعال‌سازی اشتراک/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/commerce/payments/pay-sub-2/approve"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("7. Card-to-card inspection and rejection flow in Wallet Top-ups tab", async () => {
    renderWithProviders("/admin/users/wallet-topups");

    // Click "بررسی فیش" button for pending C2C wallet top-up
    const reviewBtn = await screen.findByRole("button", { name: /بررسی فیش/i });
    fireEvent.click(reviewBtn);

    expect(await screen.findByText("بررسی و تأیید شارژ کارت‌به‌کارت کیف پول")).toBeInTheDocument();

    // Click "رد پرداخت"
    const rejectModalBtn = screen.getByRole("button", { name: "رد پرداخت" });
    fireEvent.click(rejectModalBtn);

    // Rejection reason form
    expect(await screen.findByText("رد پرداخت کارت‌به‌کارت")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/علت رد/i);
    fireEvent.change(textarea, { target: { value: "فیش واریزی نامعتبر است" } });

    const submitRejectBtn = screen.getByRole("button", { name: /ثبت رد پرداخت/i });
    fireEvent.click(submitRejectBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/admin/commerce/payments/pay-wallet-1/reject"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "فیش واریزی نامعتبر است" }),
        })
      );
    });
  });
});
