import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GenerateContentModal } from "../components/documents/GenerateContentModal.js";
import type { DocumentContentStatus } from "../lib/api/generation.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("GenerateContentModal: Pre-Generation Cost Estimation UI", () => {
  const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const mockCourseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const mockDocId = "a2a8caed-5f6c-460a-8324-3802c176bf46";

  const emptyContentStatus = {
    lesson: { generated: false, count: 0 } as DocumentContentStatus,
    flashcards: { generated: false, count: 0 } as DocumentContentStatus,
    exam: { generated: false, count: 0 } as DocumentContentStatus,
    review_summary: { generated: false, count: 0 } as DocumentContentStatus,
    all_generated: false,
    can_generate: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Renders cost estimation box with formatted Toman price and disclaimer", async () => {
    let estimateCalled = false;
    global.fetch = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/estimate-cost")) {
        estimateCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-1",
            estimated_price_toman: 18500,
            formatted_price: "۱۸٬۵۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateContentModal
          isOpen={true}
          onClose={vi.fn()}
          documentName="Pathology_Chapter_1.pdf"
          documentId={mockDocId}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentStatus={emptyContentStatus}
          onConfirmGenerate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Initial label
    expect(screen.getByText("هزینه تقریبی تولید محتوا")).toBeInTheDocument();

    // Wait for cost estimate to resolve
    await waitFor(() => {
      expect(estimateCalled).toBe(true);
      expect(screen.getByTestId("estimated-cost-display")).toHaveTextContent("حدود ۱۸٬۵۰۰ تومان");
    });

    // Verify Persian disclaimer
    expect(
      screen.getByText("هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد."),
    ).toBeInTheDocument();

    // Verify NO internal technical terms are present
    expect(screen.queryByText(/tokens/i)).toBeNull();
    expect(screen.queryByText(/gemini/i)).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("2. Re-estimates cost when content type selection changes", async () => {
    const requestedBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/estimate-cost")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        requestedBodies.push(body);
        const typesCount = body.types?.length || 3;
        const price = typesCount * 6000;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-2",
            estimated_price_toman: price,
            formatted_price: `${price.toLocaleString("fa-IR")} تومان`,
            currency: "toman",
            disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateContentModal
          isOpen={true}
          onClose={vi.fn()}
          documentName="Pathology_Chapter_1.pdf"
          documentId={mockDocId}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentStatus={emptyContentStatus}
          onConfirmGenerate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(requestedBodies.length).toBeGreaterThanOrEqual(1);
    });

    // Uncheck flashcard and quiz
    const flashcardCheckbox = screen.getByLabelText("انتخاب فلش‌کارت");
    const examCheckbox = screen.getByLabelText("انتخاب آزمون");

    fireEvent.click(flashcardCheckbox);
    fireEvent.click(examCheckbox);

    await waitFor(() => {
      const lastCall = requestedBodies[requestedBodies.length - 1];
      expect(lastCall.types).toEqual(["lesson"]);
    });
  });

  it("3. Displays error state with retry button when estimation fails", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/estimate-cost")) {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: "Internal server error" } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-3",
            estimated_price_toman: 12000,
            formatted_price: "۱۲٬۰۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateContentModal
          isOpen={true}
          onClose={vi.fn()}
          documentName="Pathology_Chapter_1.pdf"
          documentId={mockDocId}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentStatus={emptyContentStatus}
          onConfirmGenerate={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Should show error state and retry button
    await waitFor(() => {
      expect(screen.getByText("خطا در برآورد")).toBeInTheDocument();
      expect(screen.getByText("تلاش مجدد")).toBeInTheDocument();
    });

    // Generate button MUST BE DISABLED during estimation failure
    const submitBtn = screen.getByRole("button", { name: /تولید محتوا/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Attempting to submit during failure must NOT trigger generation
    fireEvent.click(submitBtn);

    // Click retry
    fireEvent.click(screen.getByText("تلاش مجدد"));

    // After retry succeeds, displays price and enables submit button
    await waitFor(() => {
      expect(screen.getByTestId("estimated-cost-display")).toHaveTextContent("حدود ۱۲٬۰۰۰ تومان");
      expect(submitBtn.disabled).toBe(false);
    });
  });

  it("4. Confirm button triggers generation with selected content types", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/estimate-cost")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-4",
            estimated_price_toman: 15000,
            formatted_price: "۱۵٬۰۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const onConfirmGenerate = vi.fn();
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateContentModal
          isOpen={true}
          onClose={vi.fn()}
          documentName="Pathology_Chapter_1.pdf"
          documentId={mockDocId}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentStatus={emptyContentStatus}
          onConfirmGenerate={onConfirmGenerate}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("estimated-cost-display")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /تولید محتوا/i });
    fireEvent.click(submitBtn);

    expect(onConfirmGenerate).toHaveBeenCalledWith({
      lesson: true,
      flashcards: true,
      exam: true,
      review_summary: false,
    });
  });

  it("5. Completely suppresses cost estimate UI and query when hideCostEstimate={true}", async () => {
    let estimateCalled = false;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/estimate-cost")) {
        estimateCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-admin",
            estimated_price_toman: 18500,
            formatted_price: "۱۸٬۵۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const onConfirmGenerate = vi.fn();
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateContentModal
          isOpen={true}
          onClose={vi.fn()}
          documentName="Official_Pharmacology.pdf"
          documentId={mockDocId}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentStatus={emptyContentStatus}
          hideCostEstimate={true}
          onConfirmGenerate={onConfirmGenerate}
        />
      </QueryClientProvider>,
    );

    // Verify Cost Estimation Box is NOT rendered
    expect(screen.queryByTestId("cost-estimation-box")).toBeNull();
    expect(screen.queryByText("هزینه تقریبی تولید محتوا")).toBeNull();
    expect(screen.queryByTestId("estimated-cost-display")).toBeNull();

    // Verify /estimate-cost was NEVER fetched
    expect(estimateCalled).toBe(false);

    // Verify button is immediately active and clicking it triggers generation
    const submitBtn = screen.getByRole("button", { name: /تولید محتوا/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    expect(onConfirmGenerate).toHaveBeenCalledWith({
      lesson: true,
      flashcards: true,
      exam: true,
      review_summary: false,
    });
  });
});

