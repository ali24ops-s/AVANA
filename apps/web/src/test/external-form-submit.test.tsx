import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeedbackFormModal } from "../components/support/FeedbackFormModal.js";
import { SupportTicketFormModal } from "../components/support/SupportTicketFormModal.js";

describe("External Form Submit in Dialog Footers", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/v1/feedback")) {
        return new Response(
          JSON.stringify({
            feedback: {
              id: "fb-123",
              title: "پیشنهاد حالت شب",
              status: "submitted",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/v1/support/tickets")) {
        return new Response(
          JSON.stringify({
            ticket: {
              id: "tkt-123",
              title: "مشکل در آزمون",
              status: "open",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it("FeedbackFormModal: external footer submit button triggers internal form submission and validations", async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <FeedbackFormModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </QueryClientProvider>
    );

    // 1. Verify external footer button attributes
    const submitBtn = screen.getByRole("button", { name: "ثبت و ارسال بازخورد" });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn.getAttribute("type")).toBe("submit");
    expect(submitBtn.getAttribute("form")).toBe("feedback-form");

    const titleInput = screen.getByPlaceholderText("مثلاً: اضافه شدن حالت شب به صفحه آزمون‌ها");
    const descInput = screen.getByPlaceholderText(
      "لطفاً جزئیات پیشنهاد، انتقاد یا مشکل مدنظرتان را به طور دقیق بنویسید..."
    );

    // 2. Input satisfying HTML required but failing JS min-length (2 characters)
    fireEvent.change(titleInput, { target: { value: "پی" } });
    fireEvent.change(descInput, { target: { value: "توضیح آزمایشی کامل برای تست" } });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("لطفاً عنوان بازخورد را وارد کنید (حداقل ۳ کاراکتر).")
    ).toBeInTheDocument();

    // 3. Fix title, but input description failing JS min-length (< 10 characters)
    fireEvent.change(titleInput, { target: { value: "پیشنهاد حالت شب" } });
    fireEvent.change(descInput, { target: { value: "کوتاه" } });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("لطفاً متن توضیحات را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).")
    ).toBeInTheDocument();

    // 4. Fill valid description and click external submit button
    fireEvent.change(descInput, {
      target: { value: "لطفاً تم تاریک را به صفحه آزمون‌ها اضافه کنید." },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText("بازخورد شما با موفقیت ثبت شد و توسط تیم آوانا بررسی خواهد شد.")
      ).toBeInTheDocument();
    });
  });

  it("SupportTicketFormModal: external footer submit button triggers internal form submission and validations", async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <SupportTicketFormModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </QueryClientProvider>
    );

    // 1. Verify external footer button attributes
    const submitBtn = screen.getByRole("button", { name: "ایجاد تیکت پشتیبانی" });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn.getAttribute("type")).toBe("submit");
    expect(submitBtn.getAttribute("form")).toBe("ticket-form");

    const titleInput = screen.getByPlaceholderText("مثلاً: عدم دسترسی به آزمون پس از پرداخت موفق");
    const descInput = screen.getByPlaceholderText(
      "لطفاً توضیح دهید چه اتفاقی افتاده و در صورت داشتن شماره سفارش یا اطلاعات دیگر، آن را بنویسید..."
    );

    // 2. Input satisfying HTML required but failing JS min-length (2 characters)
    fireEvent.change(titleInput, { target: { value: "خط" } });
    fireEvent.change(descInput, { target: { value: "توضیحات آزمایشی کامل برای ثبت تیکت پشتیبانی" } });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("لطفاً عنوان تیکت را وارد کنید (حداقل ۳ کاراکتر).")
    ).toBeInTheDocument();

    // 3. Fix title, but input description failing JS min-length (< 10 characters)
    fireEvent.change(titleInput, { target: { value: "مشکل در آزمون" } });
    fireEvent.change(descInput, { target: { value: "کوتاه" } });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("لطفاً شرح درخواست را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).")
    ).toBeInTheDocument();

    // 4. Fill valid description and click external submit button
    fireEvent.change(descInput, {
      target: { value: "پس از پرداخت موفقیت‌آمیز، آزمون برای من باز نشد." },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("درخواست پشتیبانی شما با موفقیت ثبت شد.")).toBeInTheDocument();
    });
  });
});
