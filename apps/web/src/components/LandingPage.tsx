/**
 * Main Landing Page Container — AVANA Intelligent Learning Platform.
 *
 * Light-first, continuous scroll-based architecture matching Reference Design.
 * Narrative Journey (10-Section Storytelling Flow):
 * 1. Header (Brand logo, nav links, CTA 'شروع با آوانا')
 * 2. Hero Section ("جزوهات را بده به آوانا. یادگیریش با آوانا.")
 * 3. Problem Section ("منابع زیادند. وقت کم است.")
 * 4. Transformation Section ("آوانا، این پراکندگی را تبدیل به مسیر یادگیری می‌کند.")
 * 5. Living Textbook Section ("جزوه فقط برای خواندن نیست. با آوانا، تبدیل به یادگیری می‌شود.")
 * 6. Learning Pipeline Section ("از یک منبع تا یادگیری کامل")
 * 7. Quiz Experience Section ("فقط نخوان؛ خودت را امتحان کن")
 * 8. Review Summary Section ("وقتی وقت کم است، دقیق مرور کن")
 * 9. Complete AVANA Loop Section ("چرخه یکپارچه یادگیری آوانا")
 * 10. Final CTA Section ("منبعت را بده به آوانا. از همین‌جا شروع کن.")
 * 11. Footer
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, Menu, X } from "lucide-react";
import { HeroSection } from "./landing/HeroSection.js";
import { ProblemSection } from "./landing/ProblemSection.js";
import { TransformationSection } from "./landing/TransformationSection.js";
import { LivingTextbookSection } from "./landing/LivingTextbookSection.js";
import { LearningPipelineSection } from "./landing/LearningPipelineSection.js";
import { QuizExperienceSection } from "./landing/QuizExperienceSection.js";
import { ReviewSummarySection } from "./landing/ReviewSummarySection.js";
import { CompleteLoopSection } from "./landing/CompleteLoopSection.js";
import { FinalCTASection } from "./landing/FinalCTASection.js";
import { Footer } from "./landing/Footer.js";
import { useAuth } from "../providers/AuthProvider.js";
import { BrandLogo } from "./brand/BrandLogo.js";

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  // Scroll Progress Bar
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Smooth scroll handler for anchor links
  const handleNavAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (href.startsWith("#")) {
        e.preventDefault();
        const targetId = href.slice(1);
        const element = document.getElementById(targetId);
        if (element) {
          const headerOffset = 80;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      }
    },
    []
  );

  // SEO & Scroll detection
  useEffect(() => {
    document.title = "آوانا | پلتفرم نوین آموزش و یادگیری هوشمند پزشکی و داروسازی";

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      "content",
      "آوانا پلتفرم جامع یادگیری، خلاصه‌سازی هوشمند، فلش‌کارت‌های فعال بر پایه تکرار فاصله‌دار (SRS) و آزمون‌ساز تخصصی برای دانشجویان و داوطلبان آزمون‌های جامع پزشکی و داروسازی است."
    );

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const navLinks = [
    { label: "خانه", href: "#hero", isInternalRoute: false },
    { label: "امکانات", href: "#living-textbook", isInternalRoute: false },
    { label: "مسیر یادگیری", href: "#learning-pipeline", isInternalRoute: false },
    { label: "قیمت‌گذاری", href: "/pricing", isInternalRoute: true },
    { label: "درباره ما", href: "/about", isInternalRoute: true },
  ];

  return (
    <div className="landing-page min-h-screen relative font-body bg-[#F7F9FA] text-[#1a2226]">
      {/* 1. Navigation Header */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled
            ? "shadow-xs bg-white/95 backdrop-blur-md border-b border-[#E2E7EA]"
            : "bg-white/85 backdrop-blur-sm border-b border-[#E2E7EA]/70"
        }`}
        aria-label="ناوبری اصلی صفحه لندینگ"
      >
        {/* Subtle Scroll Progress Indicator */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-600 via-teal-500 to-teal-700 origin-right"
          style={{ scaleX }}
        />

        <div className="flex justify-between items-center px-4 sm:px-6 max-w-[1280px] mx-auto h-20">
          {/* Brand Logo (Right side in RTL) */}
          <div className="flex items-center gap-3">
            <BrandLogo
              linkTo="/"
              variant="logo-only"
              size="lg"
              className="hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Desktop Links (Center) */}
          <ul className="hidden lg:flex items-center gap-8 text-sm font-medium">
            {navLinks.map((item) => (
              <li key={item.label}>
                {item.isInternalRoute ? (
                  <Link
                    to={item.href}
                    className="text-[#3d4f55] hover:text-[#008080] transition-colors duration-200 font-medium"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={item.href}
                    onClick={(e) => handleNavAnchorClick(e, item.href)}
                    className="text-[#3d4f55] hover:text-[#008080] transition-colors duration-200 font-medium"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          {/* CTA & Mobile Toggle (Left side in RTL) */}
          <div className="flex items-center gap-3">
            <Link
              to={ctaHref}
              className="hidden md:inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl font-bold text-sm cursor-pointer active:scale-[0.98] transition-all duration-150 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm shadow-[#008080]/20 hover:-translate-y-0.5"
            >
              <span>شروع با آوانا</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <button
              aria-label={mobileMenuOpen ? "بستن منو" : "باز کردن منو"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 text-[#3d4f55] hover:text-[#008080] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] rounded-xl"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="lg:hidden absolute top-20 left-0 w-full bg-white border-b border-[#E2E7EA] shadow-elevated flex flex-col px-6 py-5 gap-3"
          >
            {navLinks.map((item) =>
              item.isInternalRoute ? (
                <Link
                  key={item.label}
                  to={item.href}
                  className="py-2.5 px-3 rounded-xl text-[#3d4f55] hover:text-[#008080] hover:bg-[#F7F9FA] transition-colors font-medium text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="py-2.5 px-3 rounded-xl text-[#3d4f55] hover:text-[#008080] hover:bg-[#F7F9FA] transition-colors font-medium text-sm"
                  onClick={(e) => {
                    setMobileMenuOpen(false);
                    handleNavAnchorClick(e, item.href);
                  }}
                >
                  {item.label}
                </a>
              )
            )}

            <Link
              to={ctaHref}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full h-11 mt-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm active:scale-[0.98] transition-all"
            >
              <span>شروع با آوانا</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </nav>

      {/* Main Narrative Journey */}
      <main className="relative z-10 pt-20">
        {/* 1. Hero Section */}
        <HeroSection />

        {/* 2. Problem Section ("منابع زیادند. وقت کم است.") */}
        <ProblemSection />

        {/* 3. Transformation Section ("آوانا، این پراکندگی را تبدیل به مسیر یادگیری می‌کند.") */}
        <TransformationSection />

        {/* 4. Living Textbook ("جزوه فقط برای خواندن نیست. با آوانا، تبدیل به یادگیری می‌شود.") */}
        <LivingTextbookSection />

        {/* 5. Learning Pipeline ("از یک منبع تا یادگیری کامل") */}
        <LearningPipelineSection />

        {/* 6. Quiz Experience ("فقط نخوان؛ خودت را امتحان کن") */}
        <QuizExperienceSection />

        {/* 7. Review Summary ("وقتی وقت کم است، دقیق مرور کن") */}
        <ReviewSummarySection />

        {/* 8. Complete AVANA Loop ("چرخه یکپارچه یادگیری آوانا") */}
        <CompleteLoopSection />

        {/* 9. Final CTA ("منبعت را بده به آوانا. از همین‌جا شروع کن.") */}
        <FinalCTASection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
