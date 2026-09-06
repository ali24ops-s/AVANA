import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AboutPage } from "../pages/AboutPage.js";

let mockAuth = {
  user: null,
  isAuthenticated: false,
};

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => mockAuth,
}));

const renderAboutPage = () => {
  return render(
    <MemoryRouter initialEntries={["/about"]}>
      <Routes>
        <Route path="/about" element={<AboutPage />} />
        <Route path="/sign-in" element={<div>Sign In Page</div>} />
        <Route path="/courses" element={<div>Courses Page</div>} />
        <Route path="/library" element={<div>Library Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("AboutPage (صفحه درباره ما) Complete Narrative Experience Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      user: null,
      isAuthenticated: false,
    };
    window.scrollTo = vi.fn();
  });

  it("1. Renders SEO document title, meta tags, and the primary H1 headline", () => {
    renderAboutPage();

    expect(document.title).toContain("درباره آوانا");
    expect(document.title).toContain("یادگیری هوشمند برای دانشجویان داروسازی");

    // Single Main H1 Heading in Hero
    const mainHeading = screen.getByRole("heading", { level: 1 });
    expect(mainHeading).toBeInTheDocument();
    expect(mainHeading).toHaveTextContent("داروسازی فقط حفظ کردن نیست");
  });

  it("2. Verifies all 7 core narrative sections are rendered in sequence and archives turning point concept", () => {
    renderAboutPage();

    // Section 1: Hero Experience
    expect(screen.getByText("داروسازی فقط حفظ کردن نیست.")).toBeInTheDocument();
    expect(screen.getByText("یادگیری یعنی ساختن ارتباط بین مفاهیم.")).toBeInTheDocument();

    // Section 2: Real Problem
    expect(
      screen.getByText("مشکل دانشجو کمبود اطلاعات نیست؛")
    ).toBeInTheDocument();
    expect(screen.getByText("گم شدن در اقیانوس داده‌هاست.")).toBeInTheDocument();

    // Turning Point Concept is archived to Future Concept and MUST NOT render in AboutPage
    expect(
      screen.queryByText("اگر یادگیری می‌توانست خودش را")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("با تو هماهنگ کند چه؟")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("بخش تعاملی زنجیره مفاهیم داروسازی")).not.toBeInTheDocument();

    // Section 3: Philosophy
    expect(
      screen.getByText("ما به یادگیری متفاوتی")
    ).toBeInTheDocument();
    expect(screen.getByText("باور داریم.")).toBeInTheDocument();

    // Section 4: How AVANA Thinks / Ecosystem
    expect(screen.getByText("آوانا چگونه فکر می‌کند؟")).toBeInTheDocument();

    // Section 5: Future Story
    expect(
      screen.getByText("ما تازه در ابتدای مسیر هستیم؛")
    ).toBeInTheDocument();

    // Section 6: Human Message
    expect(screen.getByText(/برای دانشجو ساخته شده/)).toBeInTheDocument();
    expect(
      screen.getByText(/ما قرار نیست مسیر را به جای تو طی کنیم/)
    ).toBeInTheDocument();

    // Section 7: Final CTA
    expect(
      screen.getByText("مسیر یادگیری تو می‌تواند")
    ).toBeInTheDocument();
    expect(screen.getByText("متفاوت باشد.")).toBeInTheDocument();
  });

  it("3. Section 2: Toggles between Traditional Overload vs AVANA Structured Taxonomy", async () => {
    renderAboutPage();

    // Default tab is 'رویکرد آوانا'
    expect(screen.getByText("ساختار درختی و طبقه‌بندی")).toBeInTheDocument();
    expect(screen.getByText("اتصال مکانیسم به بالین")).toBeInTheDocument();

    // Switch to Traditional Overload tab
    const overloadTab = screen.getByRole("tab", { name: /مطالعه سنتی/ });
    fireEvent.click(overloadTab);

    await waitFor(() => {
      expect(screen.getByText("انباشت جزوه‌ها و PDFها")).toBeInTheDocument();
      expect(screen.getByText("حفظ کورکورانه اسامی")).toBeInTheDocument();
    });
  });

  it("4. Ensures archived Adaptive Learning Concept elements do not leak into active About page", () => {
    renderAboutPage();

    // Verify no drug selection chips or step controls from the concept appear in AboutPage
    expect(screen.queryByRole("tab", { name: /پروپرانولول/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /متفورمین/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /آتروپین/ })).not.toBeInTheDocument();
    expect(screen.queryByText("لحظه تغییر و کشف ارتباط")).not.toBeInTheDocument();
  });

  it("5. Section 4: Philosophy micro-experiences function correctly", () => {
    renderAboutPage();

    // Pillar 1: Switch study mode
    const clinicalBtn = screen.getByRole("button", { name: "مرور بالینی" });
    fireEvent.click(clinicalBtn);
    expect(screen.getByText(/برنامه بالینی: تمرکز بر فارماکوتراپی/)).toBeInTheDocument();

    // Pillar 2: Toggle cluster to graph
    const toggleSynthesisBtn = screen.getByRole("button", { name: /مشاهده داده‌های گسسته/ });
    fireEvent.click(toggleSynthesisBtn);
    expect(screen.getByText("متن جزوه")).toBeInTheDocument();

    // Pillar 3: Spaced Repetition interval selection
    const day7Btn = screen.getByRole("button", { name: "روز 7" });
    fireEvent.click(day7Btn);
    expect(screen.getByText(/تثبیت میان‌مدت/)).toBeInTheDocument();
  });

  it("6. Section 5: Ecosystem Nodes selection and interconnection highlight", async () => {
    renderAboutPage();

    // Select AI Assistant node
    const aiNode = screen.getByRole("tab", { name: /دستیار هوشمند تحصیلی/ });
    fireEvent.click(aiNode);

    await waitFor(() => {
      expect(screen.getByText(/لایه هوش مصنوعی برای توضیح تداخلات/)).toBeInTheDocument();
    });

    // Select Spaced Review node
    const reviewNode = screen.getByRole("tab", { name: /مرور تطبیقی/ });
    fireEvent.click(reviewNode);

    await waitFor(() => {
      expect(screen.getByText(/پیشنهاد زمان‌بندی مرور درست قبل از فراموشی/)).toBeInTheDocument();
    });
  });

  it("7. Section 8: Final CTA links appropriately based on authentication state", () => {
    // Unauthenticated user -> Links to /sign-in
    mockAuth = { user: null, isAuthenticated: false };
    const { unmount } = renderAboutPage();
    const ctaLinks = screen.getAllByRole("link", { name: /شروع با آوانا/ });
    expect(ctaLinks[0]).toHaveAttribute("href", "/sign-in");
    unmount();

    // Authenticated user -> Links to /courses
    mockAuth = { user: { id: "123", email: "test@example.com" } as any, isAuthenticated: true };
    renderAboutPage();
    const authCtaLinks = screen.getAllByRole("link", { name: /شروع با آوانا/ });
    expect(authCtaLinks[0]).toHaveAttribute("href", "/courses");
  });
});
