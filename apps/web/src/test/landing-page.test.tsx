import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LandingPage } from "../components/LandingPage.js";
import { FutureKnowledgeNetwork } from "../components/future/FutureKnowledgeNetwork.js";

let mockAuth = {
  user: null,
  isAuthenticated: false,
};

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => mockAuth,
}));

const renderLandingPage = () => {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<div>About Page</div>} />
        <Route path="/sign-in" element={<div>Sign In Page</div>} />
        <Route path="/courses" element={<div>Courses Page</div>} />
        <Route path="/library" element={<div>Library Page</div>} />
        <Route path="/terms" element={<div>Terms Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("LandingPage (صفحه اصلی آوانا) Complete Experience & Content Preservation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      user: null,
      isAuthenticated: false,
    };
    window.scrollTo = vi.fn();
  });

  it("1. Renders SEO document title, meta tags, and the primary H1 headline", () => {
    renderLandingPage();

    expect(document.title).toContain("آوانا");
    expect(document.title).toContain("پلتفرم نوین آموزش و یادگیری هوشمند پزشکی و داروسازی");

    const mainHeading = screen.getByRole("heading", { level: 1 });
    expect(mainHeading).toBeInTheDocument();
    expect(mainHeading).toHaveTextContent("درس بخون، مرور کن،");
    expect(mainHeading).toHaveTextContent("همه‌چیز با آوانا");
  });

  it("2. Verifies 100% preservation of all existing Hero section contents and dashboard mockup", () => {
    renderLandingPage();

    // Badge
    expect(screen.getByText("پلتفرم نوین آموزش پزشکی")).toBeInTheDocument();

    // Subtitle
    expect(
      screen.getByText(/تجربه‌ای متفاوت از یادگیری با خلاصه‌سازی هوشمند/)
    ).toBeInTheDocument();

    // Social Proof
    expect(screen.getByText("بیش از ۱۰,۰۰۰+")).toBeInTheDocument();
    expect(screen.getByText(/دانشجوی پزشکی و داروسازی/)).toBeInTheDocument();

    // Dashboard Mockup elements
    expect(screen.getByText("سلام علی 👋")).toBeInTheDocument();
    expect(screen.getByText("۱۲ ساعت")).toBeInTheDocument();
    expect(screen.getByText("۸ درس")).toBeInTheDocument();
    expect(screen.getByText("ساعت مطالعه این هفته")).toBeInTheDocument();
    expect(screen.getByText("۱۲.۵ ساعت")).toBeInTheDocument();
  });

  it("3. Verifies 100% preservation of all 4 Problem Section cards and contents", () => {
    renderLandingPage();

    expect(screen.getByText("چرا روش‌های سنتی")).toBeInTheDocument();
    expect(screen.getByText("پاسخگو نیستند؟")).toBeInTheDocument();
    expect(
      screen.getByText(/حجم بالای مطالب پزشکی نیازمند رویکردی سیستماتیک است/)
    ).toBeInTheDocument();

    // 4 Problem cards
    expect(screen.getByText("حجم وحشتناک مطالب")).toBeInTheDocument();
    expect(screen.getByText("گم شدن در میان صدها صفحه جزوه و کتاب بدون ساختار.")).toBeInTheDocument();

    expect(screen.getByText("فراموشی سریع")).toBeInTheDocument();
    expect(screen.getByText("منحنی فراموشی ابینگهاوس و از دست رفتن تلاش‌ها.")).toBeInTheDocument();

    expect(screen.getByText("ندانستن زمان مرور")).toBeInTheDocument();
    expect(screen.getByText("مرورهای بی‌برنامه و غیربهینه که زمان زیادی می‌گیرد.")).toBeInTheDocument();

    expect(screen.getByText("عدم تحلیل پیشرفت")).toBeInTheDocument();
    expect(screen.getByText("نداشتن دید واضح نسبت به نقاط ضعف و قوت.")).toBeInTheDocument();
  });

  it("4. Verifies 100% preservation of all 5 Feature/Benefit cards in 'آوانا چیست؟'", () => {
    renderLandingPage();

    expect(screen.getByText("آوانا چیست؟")).toBeInTheDocument();
    expect(
      screen.getByText(/یک اکوسیستم کامل برای مدیریت فرآیند یادگیری، مرور و سنجش/)
    ).toBeInTheDocument();

    // 5 Feature cards
    expect(screen.getByText("مطالعه عمیق")).toBeInTheDocument();
    expect(screen.getByText(/دسترسی به منابع ساختاریافته، خلاصه‌های کاربردی/)).toBeInTheDocument();

    expect(screen.getByText("پردازش هوشمند PDF")).toBeInTheDocument();
    expect(screen.getByText(/بارگذاری فایل‌ها و جزوات درسی PDF/)).toBeInTheDocument();

    expect(screen.getByText("دستیار هوشمند آوانا")).toBeInTheDocument();
    expect(screen.getByText(/دستیار مبتنی بر هوش مصنوعی برای پاسخگویی/)).toBeInTheDocument();

    expect(screen.getByText("مرور هوشمند")).toBeInTheDocument();
    expect(screen.getByText(/سیستم فلش‌کارت مبتنی بر تکرار با فاصله‌گذاری/)).toBeInTheDocument();

    expect(screen.getByText("سنجش دقیق")).toBeInTheDocument();
    expect(screen.getByText(/آزمون‌های دوره‌ای و شبیه‌سازی شرایط واقعی/)).toBeInTheDocument();
  });

  it("5. Verifies 100% preservation of all 4 'چطور کار می‌کند' steps and highlights", () => {
    renderLandingPage();

    expect(screen.getByText("آوانا را در ۴ مرحله یاد بگیر")).toBeInTheDocument();

    // Step 1
    expect(screen.getByText("انتخاب دوره، سرفصل و بارگذاری منابع")).toBeInTheDocument();
    expect(screen.getByText("بارگذاری مستقیم فایل‌های PDF و استخراج هوشمند فصل‌ها")).toBeInTheDocument();

    // Step 2
    expect(screen.getByText("مطالعه ساختاریافته و منسجم محتوا")).toBeInTheDocument();
    expect(screen.getByText("رابط کاربری تیره (Dark Mode) و بدون حواس‌پرتی برای تمرکز بالا")).toBeInTheDocument();

    // Step 3
    expect(screen.getByText("تثبیت عمیق و مرور با فلش‌کارت SRS")).toBeInTheDocument();
    expect(screen.getByText("الگوریتم علمی مرور فاصله‌دار (SRS) جهت جلوگیری از فراموشی")).toBeInTheDocument();

    // Step 4
    expect(screen.getByText("سنجش هوشمند با آزمون‌های شبیه‌سازی‌شده")).toBeInTheDocument();
    expect(screen.getByText("شبیه‌سازی دقیق شرایط امتحانات سراسری و آزمون‌های دانشگاهی")).toBeInTheDocument();
  });

  it("6. Verifies 100% preservation of Final CTA and Footer links", () => {
    renderLandingPage();

    // Final CTA
    const finalHeading = screen.getByRole("heading", { name: /یادگیری بهتر از/ });
    expect(finalHeading).toBeInTheDocument();
    expect(finalHeading).toHaveTextContent("یادگیری بهتر از همین‌جا شروع می‌شود");
    expect(
      screen.getByText(/به هزاران دانشجوی پزشکی بپیوندید که مسیر موفقیت خود را/)
    ).toBeInTheDocument();
    expect(screen.getByText("همین حالا شروع کنید")).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/© ۲۰۲۶ آوانا. تمامی حقوق برای پلتفرم آموزشی آوانا محفوظ است/)).toBeInTheDocument();
  });

  it("7. Interactive Product Experience: Flips flashcard and schedules SRS interval", async () => {
    renderLandingPage();

    expect(screen.getByText("آوانا را تجربه کن")).toBeInTheDocument();

    // Question visible on front
    expect(screen.getByText(/گیرنده اصلی استیل‌کولین در صفحه محرکه عضلانی چیست/)).toBeInTheDocument();

    // Click to flip
    const flashcard = screen.getByRole("button", { name: "ورق زدن فلش کارت" });
    fireEvent.click(flashcard);

    // Answer visible on back
    expect(screen.getByText(/گیرنده نیکوتینی نوع عضلانی \(Nm\)/)).toBeInTheDocument();

    // Click rating 'خوب'
    const goodRatingBtn = screen.getByRole("button", { name: /خوب/ });
    fireEvent.click(goodRatingBtn);

    await waitFor(() => {
      expect(screen.getByText(/در نوبت یادآوری هوشمند قرار گرفت/)).toBeInTheDocument();
    });
  });

  it("8. Interactive Product Experience: AI Assistant Demo switches questions and shows reasoning", async () => {
    renderLandingPage();

    // Switch to AI Assistant tab
    const aiTab = screen.getByRole("tab", { name: /دستیار هوشمند/ });
    fireEvent.click(aiTab);

    await waitFor(() => {
      expect(screen.getByText(/مراحل استدلال شناختی دستیار هوشمند/)).toBeInTheDocument();
    });

    // Select second question
    const question2Btn = screen.getByText(/تفاوت فارماکوکینتیک و فارماکودینامیک/);
    fireEvent.click(question2Btn);

    await waitFor(() => {
      expect(screen.getByText(/فارماکوکینتیک مسیر سرنوشت دارو در بدن/)).toBeInTheDocument();
    });
  });

  it("9. Knowledge Network is hidden from Landing UI, while FutureKnowledgeNetwork component remains fully functional", async () => {
    const { unmount } = renderLandingPage();

    // Verify it is completely hidden from LandingPage
    expect(screen.queryByText("یک مفهوم، یک شبکه یادگیری")).not.toBeInTheDocument();
    expect(screen.queryByText("معماری شبکه دانش")).not.toBeInTheDocument();

    unmount();

    // Verify FutureKnowledgeNetwork component works when rendered independently
    render(<FutureKnowledgeNetwork />);
    expect(screen.getByText("یک مفهوم، یک شبکه یادگیری")).toBeInTheDocument();

    // Default drug Propranolol
    expect(screen.getByText("بتا بلاکر غیرانتخابی (Non-selective β-blocker)")).toBeInTheDocument();

    // Switch to Metformin
    const metforminBtn = screen.getByRole("tab", { name: /متفورمین/ });
    fireEvent.click(metforminBtn);

    await waitFor(() => {
      expect(screen.getByText("بیگوانید ضددیابت (Biguanide Antidiabetic)")).toBeInTheDocument();
    });

    // Click 'کاربرد بالینی' node
    const clinicalNodeBtn = screen.getByRole("tab", { name: /کاربرد بالینی/ });
    fireEvent.click(clinicalNodeBtn);

    await waitFor(() => {
      expect(screen.getByText(/دیابت نوع ۲ و سندرم تخمدان پلی‌کیستیک/)).toBeInTheDocument();
    });
  });

  it("10. Auth State checks: unauthenticated user links to /sign-in, authenticated links to /courses", () => {
    const { unmount } = renderLandingPage();

    // Unauthenticated: CTA links point to /sign-in
    const ctaLinks = screen.getAllByRole("link", { name: /شروع یادگیری/ });
    expect(ctaLinks[0]).toHaveAttribute("href", "/sign-in");

    unmount();

    // Authenticated user
    mockAuth = {
      user: { id: "user-1", email: "test@avana.ir" } as any,
      isAuthenticated: true,
    };

    renderLandingPage();
    const authCtaLinks = screen.getAllByRole("link", { name: /شروع یادگیری/ });
    expect(authCtaLinks[0]).toHaveAttribute("href", "/courses");
  });
});
