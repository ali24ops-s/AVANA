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
        <Route path="/pricing" element={<div>Pricing Page</div>} />
        <Route path="/terms" element={<div>Terms Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe("LandingPage (صفحه اصلی آوانا) Reference Design Complete Suite", () => {
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
    expect(mainHeading).toHaveTextContent("جزوهات را بده به آوانا.");
    expect(mainHeading).toHaveTextContent("یادگیریش با آوانا.");
  });

  it("2. Verifies Hero section contents, supporting text, and transformation outputs", () => {
    renderLandingPage();

    // Subtitle
    expect(
      screen.getByText(/آوانا منابع درسی‌ات را به درسنامه، فلش‌کارت، آزمون و مرور سریع تبدیل می‌کند/)
    ).toBeInTheDocument();

    // Secondary CTA
    expect(screen.getByText("آوانا چطور کار می‌کند؟")).toBeInTheDocument();

    // Output Cards
    expect(screen.getAllByText("درسنامه").length).toBeGreaterThan(0);
    expect(screen.getAllByText("فلش‌کارت").length).toBeGreaterThan(0);
    expect(screen.getAllByText("آزمون").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مرور").length).toBeGreaterThan(0);

    // Source Label
    expect(screen.getByText("جزوه + PDF + عکس + نمونه سؤال")).toBeInTheDocument();
  });

  it("3. Verifies Problem Section: 'منابع زیادند. وقت کم است.' and scattered desk items", () => {
    renderLandingPage();

    expect(screen.getByText("چالش اصلی دانشجو")).toBeInTheDocument();
    expect(screen.getByText("منابع زیادند.")).toBeInTheDocument();
    expect(screen.getByText("وقت کم است.")).toBeInTheDocument();
    expect(
      screen.getByText(/جزوه، PDF، عکس‌ها، فایل‌ها و منابع مختلف در جاهای مختلف پراکنده‌اند/)
    ).toBeInTheDocument();

    // Scattered cards
    expect(screen.getByText("PDF رفرنس")).toBeInTheDocument();
    expect(screen.getByText("کانال تلگرام")).toBeInTheDocument();
    expect(screen.getByText("عکس تخته")).toBeInTheDocument();
    expect(screen.getByText("فایل ورد")).toBeInTheDocument();
    expect(screen.getByText("گوگل درایو")).toBeInTheDocument();
    expect(screen.getByText("نمونه سؤال")).toBeInTheDocument();
  });

  it("4. Verifies Transformation Section: 'آوانا، این پراکندگی را تبدیل به مسیر یادگیری می‌کند.'", () => {
    renderLandingPage();

    expect(screen.getByText("فرآیند تبدیل هوشمند")).toBeInTheDocument();
    expect(
      screen.getByText(/آوانا، این پراکندگی را تبدیل به/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/مسیر یادگیری/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/منابع درسی‌ات را یک‌جا جمع می‌کند و آن‌ها را به یک مسیر هوشمند/)
    ).toBeInTheDocument();

    // 3 Step elements
    expect(screen.getAllByText("منابع پراکنده").length).toBeGreaterThan(0);
    expect(screen.getAllByText("یک مسیر منظم یادگیری").length).toBeGreaterThan(0);
  });

  it("5. Verifies Living Textbook Section: authentic Persian medical content & contextual actions", async () => {
    renderLandingPage();

    expect(
      screen.getByText(/جزوه فقط برای خواندن نیست./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/با آوانا، تبدیل به یادگیری می‌شود./)
    ).toBeInTheDocument();

    // Checkbook content
    expect(screen.getByText("مکانیسم اثر داروهای بتا بلاکر")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /توضیح ساده‌تر/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ساخت فلش‌کارت/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /سؤال امتحانی/ })
    ).toBeInTheDocument();

    // Interactive switch to 'توضیح ساده‌تر'
    const explainBtn = screen.getByRole("button", { name: /توضیح ساده‌تر/ });
    fireEvent.click(explainBtn);
    await waitFor(() => {
      expect(screen.getByText(/توضیح ساده و کاربردی آوانا:/)).toBeInTheDocument();
    });

    // Interactive switch to 'ساخت فلش‌کارت'
    const flashcardBtn = screen.getByRole("button", { name: /ساخت فلش‌کارت/ });
    fireEvent.click(flashcardBtn);
    await waitFor(() => {
      expect(screen.getByText(/فلش‌کارت آماده مطالعه \(SRS\)/)).toBeInTheDocument();
    });
  });

  it("6. Verifies Learning Pipeline Section: 5 connected stages from source to mastery", () => {
    renderLandingPage();

    expect(screen.getByText(/از یک منبع تا/)).toBeInTheDocument();
    expect(screen.getByText("یادگیری کامل")).toBeInTheDocument();
    expect(screen.getByText("یک منبع خام")).toBeInTheDocument();
    expect(screen.getByText("درسنامه مفهومی")).toBeInTheDocument();
    expect(screen.getByText("فلش‌کارت SRS")).toBeInTheDocument();
    expect(screen.getByText("آزمون شبیه‌ساز")).toBeInTheDocument();
    expect(screen.getByText("مرور هوشمند")).toBeInTheDocument();
  });

  it("7. Verifies Quiz Experience Section: interactive choice selection and instant rationale", async () => {
    renderLandingPage();

    expect(screen.getByText(/فقط نخوان؛/)).toBeInTheDocument();
    expect(screen.getByText("خودت را امتحان کن.")).toBeInTheDocument();

    // Question
    expect(
      screen.getByText(/کدام‌یک از داروهای زیر یک بتابلاکر غیرانتخابی/)
    ).toBeInTheDocument();

    // Select option B (Propranolol)
    const optionB = screen.getByRole("button", { name: /پروپرانولول/ });
    fireEvent.click(optionB);

    // Verified correct response and detailed rationale appears
    await waitFor(() => {
      expect(screen.getByText(/آفرین! پاسخ کاملاً صحیح است/)).toBeInTheDocument();
      expect(screen.getByText(/نکته طلایی امتحانی:/)).toBeInTheDocument();
    });
  });

  it("8. Verifies Review Summary Section: key concepts, rapid revision, and exam traps", () => {
    renderLandingPage();

    expect(screen.getByText("وقتی وقت کم است،")).toBeInTheDocument();
    expect(screen.getByText("دقیق مرور کن.")).toBeInTheDocument();
    expect(
      screen.getByText(/خلاصه مرور • مهارکننده‌های بتا-آدرنرژیک/)
    ).toBeInTheDocument();
    expect(screen.getByText("دام‌های پرتکرار آزمون‌های جامع:")).toBeInTheDocument();
    expect(screen.getByText(/منع مصرف در آسم:/)).toBeInTheDocument();
    expect(screen.getByText("شروع مرور سریع")).toBeInTheDocument();
  });

  it("9. Verifies Complete AVANA Loop Section: 4 orbital nodes and center brand mark", () => {
    renderLandingPage();

    expect(screen.getByText("چرخه یکپارچه")).toBeInTheDocument();
    expect(screen.getByText("یادگیری آوانا")).toBeInTheDocument();
    expect(screen.getByText("۱. منبع درسی")).toBeInTheDocument();
    expect(screen.getByText("۲. یادگیری عمیق")).toBeInTheDocument();
    expect(screen.getByText("۳. تمرین و آزمون")).toBeInTheDocument();
    expect(screen.getByText("۴. مرور هوشمند")).toBeInTheDocument();
  });

  it("10. Verifies Final CTA and Footer links", () => {
    renderLandingPage();

    // Final CTA
    expect(screen.getByText("منبعت را بده به آوانا.")).toBeInTheDocument();
    expect(screen.getByText("از همین‌جا شروع کن.")).toBeInTheDocument();
    expect(screen.getByText("✨ موفقیت در انتظار توست...")).toBeInTheDocument();

    // Footer Slogan and Copyright
    expect(screen.getByText("هر مسیری برای یادگیری، یک همراه خوب میخواد :)")).toBeInTheDocument();
    expect(
      screen.getByText(/© ۲۰۲۶ آوانا. تمامی حقوق برای پلتفرم آموزشی آوانا محفوظ است/)
    ).toBeInTheDocument();
  });

  it("11. Auth State checks: unauthenticated user links to /sign-in, authenticated links to /courses", () => {
    const { unmount } = renderLandingPage();

    // Unauthenticated: CTA links point to /sign-in
    const ctaLinks = screen.getAllByRole("link", { name: /شروع با آوانا/ });
    expect(ctaLinks[0]).toHaveAttribute("href", "/sign-in");

    unmount();

    // Authenticated user
    mockAuth = {
      user: { id: "user-1", email: "test@avana.ir" } as any,
      isAuthenticated: true,
    };

    renderLandingPage();
    const authCtaLinks = screen.getAllByRole("link", { name: /شروع با آوانا/ });
    expect(authCtaLinks[0]).toHaveAttribute("href", "/courses");
  });

  it("12. Knowledge Network is hidden from Landing UI, while FutureKnowledgeNetwork component remains fully functional", async () => {
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
  });

  it("13. Mobile Drawer Menu: opens and closes cleanly", async () => {
    renderLandingPage();

    // Hamburger button
    const menuBtn = screen.getByRole("button", { name: "باز کردن منو" });
    expect(menuBtn).toBeInTheDocument();
    fireEvent.click(menuBtn);

    // Close button appears
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "بستن منو" })).toBeInTheDocument();
    });

    // Click close
    const closeBtn = screen.getByRole("button", { name: "بستن منو" });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "باز کردن منو" })).toBeInTheDocument();
    });
  });
});
