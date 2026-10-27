import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LessonInteractiveContent } from "../components/study/LessonInteractiveContent.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Lesson Reference Display Feature Suite", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.restoreAllMocks();
  });

  const renderContent = (reference?: string | null) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <LessonInteractiveContent
          lessonId="test-lesson-1"
          lessonTitle="آناتومی قلب"
          content="# مبحث آناتومی قلب\n\nتوضیحات مربوط به بطن‌ها و دهلیزها..."
          reference={reference}
        />
      </QueryClientProvider>,
    );
  };

  it("1. Displays reference section with title 'رفرنس' and content when reference is present", () => {
    renderContent("کتاب آناتومی گری، جلد ۲، ص ۱۱۵");

    const section = screen.getByTestId("lesson-reference-section");
    expect(section).toBeInTheDocument();

    const title = screen.getByText("رفرنس");
    expect(title).toBeInTheDocument();

    const text = screen.getByTestId("lesson-reference-text");
    expect(text).toHaveTextContent("کتاب آناتومی گری، جلد ۲، ص ۱۱۵");
  });

  it("2. Does NOT render reference section when reference is null", () => {
    renderContent(null);
    expect(screen.queryByTestId("lesson-reference-section")).not.toBeInTheDocument();
  });

  it("3. Does NOT render reference section when reference is undefined", () => {
    renderContent(undefined);
    expect(screen.queryByTestId("lesson-reference-section")).not.toBeInTheDocument();
  });

  it("4. Does NOT render reference section when reference is empty or whitespace-only", () => {
    renderContent("");
    expect(screen.queryByTestId("lesson-reference-section")).not.toBeInTheDocument();

    renderContent("    \n\t   ");
    expect(screen.queryByTestId("lesson-reference-section")).not.toBeInTheDocument();
  });

  it("5. Trims reference text cleanly when rendering", () => {
    renderContent("   جزوه فیزیولوژی کلیه - دکتر احمدی   ");

    const text = screen.getByTestId("lesson-reference-text");
    expect(text.textContent).toBe("جزوه فیزیولوژی کلیه - دکتر احمدی");
  });
});
