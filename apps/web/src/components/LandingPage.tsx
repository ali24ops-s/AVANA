/**
 * Main Landing Page Container — AVANA Intelligent Learning Platform.
 *
 * Scoped under the `.landing-page` class for CSS variables.
 * Composes all narrative sections in an elevated storytelling flow:
 * 1. Hero Experience (Dynamic Knowledge Canvas & Live Dashboard Mockup)
 * 2. Problem Section (#features — Chaos to Structured Order)
 * 3. Core Benefits & Capabilities (#benefits — 5 Pillars with Metaphors)
 * 4. Product Experience (#experience — Interactive Flashcard, AI Demo, Hierarchy, Quiz)
 * 5. Knowledge Network (#knowledge-network — One Concept, One Learning Network)
 * 6. How It Works (#how-it-works — 4-Step Pipeline)
 * 7. Final Action (#final-cta — Crystalline Resolution)
 * 8. Footer
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, Menu, X } from "lucide-react";
import { HeroSection } from "./landing/HeroSection.js";
import { FeaturesSection } from "./landing/FeaturesSection.js";
import { FeatureCards } from "./landing/FeatureCards.js";
import { ProductExperienceSection } from "./landing/ProductExperienceSection.js";
import { HowItWorksSection } from "./landing/HowItWorksSection.js";
import { FinalCTASection } from "./landing/FinalCTASection.js";
import { Footer } from "./landing/Footer.js";
import {
  PresentationNavDots,
  HEADER_HEIGHT,
  PRESENTATION_SECTIONS,
} from "./landing/PresentationNavDots.js";
import { useAuth } from "../providers/AuthProvider.js";
import { BrandLogo } from "./brand/BrandLogo.js";

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");

  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  // Scroll Progress Bar
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Presentation Controller Refs
  const isAnimatingRef = useRef(false);
  const isLockedRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSectionIndexRef = useRef(0);
  const accumulatedDeltaRef = useRef(0);
  const deltaResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Exact target scroll position calculation with canonical HEADER_HEIGHT
  const getSectionTargetY = useCallback((id: string): number => {
    if (id === "hero") return 0;
    const el = document.getElementById(id);
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, rect.top + window.scrollY - HEADER_HEIGHT);
  }, []);

  const getFooterTargetY = useCallback((): number => {
    const footer = document.querySelector("footer");
    if (!footer) return document.documentElement.scrollHeight;
    const rect = footer.getBoundingClientRect();
    return Math.max(0, rect.top + window.scrollY - HEADER_HEIGHT);
  }, []);

  // Smooth cubic-bezier(0.22, 1, 0.36, 1) evaluator for presentation slide transitions
  const cubicBezierEase = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let u = t;
    for (let i = 0; i < 6; i++) {
      const currentX = u * (0.66 + u * (0.42 - 0.08 * u));
      const currentSlope = 0.66 + u * (0.84 - 0.24 * u);
      if (Math.abs(currentSlope) < 1e-7) break;
      const diff = currentX - t;
      u -= diff / currentSlope;
      if (Math.abs(diff) < 1e-5) break;
    }
    u = Math.max(0, Math.min(1, u));

    const oneMinusU = 1 - u;
    return 1 - oneMinusU * oneMinusU * oneMinusU;
  };

  // Robust RAF animation engine immune to browser smooth scroll cancellations
  const animateScrollTo = useCallback(
    (
      targetY: number,
      targetIndex: number,
      duration = 670,
      onComplete?: () => void
    ) => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const prefersReduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const startY = window.scrollY;
      const distance = targetY - startY;

      if (prefersReduced || Math.abs(distance) < 2 || duration <= 0) {
        window.scrollTo(0, targetY);
        currentSectionIndexRef.current = targetIndex;
        if (targetIndex < PRESENTATION_SECTIONS.length) {
          setActiveSection(PRESENTATION_SECTIONS[targetIndex].id);
        }
        isAnimatingRef.current = false;
        onComplete?.();
        return;
      }

      isAnimatingRef.current = true;
      const startTime = performance.now();

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = cubicBezierEase(progress);
        const currentY = Math.round(startY + distance * eased);

        window.scrollTo(0, currentY);

        if (progress < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          // Guarantee exact target settlement on final frame
          window.scrollTo(0, targetY);
          currentSectionIndexRef.current = targetIndex;
          if (targetIndex < PRESENTATION_SECTIONS.length) {
            setActiveSection(PRESENTATION_SECTIONS[targetIndex].id);
          }
          isAnimatingRef.current = false;
          rafIdRef.current = null;
          onComplete?.();
        }
      };

      rafIdRef.current = requestAnimationFrame(step);
    },
    []
  );

  const transitionToSection = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0) return;
      if (targetIndex > PRESENTATION_SECTIONS.length) return;

      isLockedRef.current = true;
      accumulatedDeltaRef.current = 0;
      if (deltaResetTimeoutRef.current) {
        clearTimeout(deltaResetTimeoutRef.current);
      }
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }

      const targetY =
        targetIndex === 0
          ? 0
          : targetIndex >= PRESENTATION_SECTIONS.length
          ? getFooterTargetY()
          : getSectionTargetY(PRESENTATION_SECTIONS[targetIndex].id);

      // 670ms cubic-bezier transition + 110ms inertia cooldown
      animateScrollTo(targetY, targetIndex, 670, () => {
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => {
          isLockedRef.current = false;
          accumulatedDeltaRef.current = 0;
        }, 110);
      });
    },
    [animateScrollTo, getFooterTargetY, getSectionTargetY]
  );

  const handleSelectSection = useCallback(
    (id: string) => {
      const idx = PRESENTATION_SECTIONS.findIndex((s) => s.id === id);
      if (idx !== -1) {
        transitionToSection(idx);
      } else {
        const targetY = getSectionTargetY(id);
        animateScrollTo(targetY, 0, 670);
      }
    },
    [animateScrollTo, getSectionTargetY, transitionToSection]
  );

  // SEO, Scroll detection, Section Observer, and Desktop Presentation Wheel Controller
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

      // Keep currentSectionIndexRef roughly in sync with manual scrolling if any
      if (!isAnimatingRef.current && !isLockedRef.current) {
        const currentScrollY = window.scrollY;
        const footerTargetY = getFooterTargetY();
        const finalCtaTargetY = getSectionTargetY("final-cta");

        if (currentScrollY >= finalCtaTargetY + Math.max(30, (footerTargetY - finalCtaTargetY) * 0.4)) {
          currentSectionIndexRef.current = PRESENTATION_SECTIONS.length; // Footer
        } else {
          let closest = 0;
          let minDiff = Infinity;
          PRESENTATION_SECTIONS.forEach((sec, idx) => {
            const targetY = sec.id === "hero" ? 0 : getSectionTargetY(sec.id);
            const diff = Math.abs(currentScrollY - targetY);
            if (diff < minDiff) {
              minDiff = diff;
              closest = idx;
            }
          });
          currentSectionIndexRef.current = closest;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Active Section IntersectionObserver for dots & indicators
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.target.id) {
              setActiveSection(entry.target.id);
            }
          });
        },
        {
          root: null,
          rootMargin: "-20% 0px -35% 0px",
          threshold: 0.15,
        }
      );

      PRESENTATION_SECTIONS.forEach((section) => {
        const el = document.getElementById(section.id);
        if (el) observer?.observe(el);
      });
    }

    // Desktop Wheel / Trackpad Presentation Controller
    const handleWheel = (e: WheelEvent) => {
      const isDesktopPresentation =
        window.innerWidth >= 1024 && window.innerHeight >= 720;
      if (!isDesktopPresentation || mobileMenuOpen) return;

      // When transition is actively animating or in post-transition inertia lock, discard events
      if (isAnimatingRef.current || isLockedRef.current) {
        e.preventDefault();
        return;
      }

      const currentIndex = currentSectionIndexRef.current;
      const isAtFooter = currentIndex >= PRESENTATION_SECTIONS.length;
      const footerTargetY = getFooterTargetY();

      // In Footer:
      if (isAtFooter) {
        // If scrolling DOWN: let user freely and naturally scroll the footer
        if (e.deltaY > 0) {
          return;
        }

        // If scrolling UP:
        // If user is scrolled deep in footer, let them naturally scroll up to footer top
        if (window.scrollY > footerTargetY + 25) {
          return;
        }

        // At footer top scrolling UP: intercept and transition back to final-cta (slide 5)
        e.preventDefault();
        accumulatedDeltaRef.current += e.deltaY;

        if (deltaResetTimeoutRef.current) clearTimeout(deltaResetTimeoutRef.current);
        deltaResetTimeoutRef.current = setTimeout(() => {
          accumulatedDeltaRef.current = 0;
        }, 120);

        if (accumulatedDeltaRef.current <= -30) {
          transitionToSection(PRESENTATION_SECTIONS.length - 1);
        }
        return;
      }

      // At Hero (index 0) and scrolling UP: allow native top bounce, don't lock
      if (currentIndex === 0 && e.deltaY < 0 && window.scrollY <= 5) {
        accumulatedDeltaRef.current = 0;
        return;
      }

      // Intercept wheel for presentation sections (0 to 5)
      e.preventDefault();

      // Reset accumulator on direction inversion
      if (
        (accumulatedDeltaRef.current > 0 && e.deltaY < 0) ||
        (accumulatedDeltaRef.current < 0 && e.deltaY > 0)
      ) {
        accumulatedDeltaRef.current = 0;
      }

      accumulatedDeltaRef.current += e.deltaY;

      if (deltaResetTimeoutRef.current) clearTimeout(deltaResetTimeoutRef.current);
      deltaResetTimeoutRef.current = setTimeout(() => {
        accumulatedDeltaRef.current = 0;
      }, 120);

      const THRESHOLD = 30;

      if (accumulatedDeltaRef.current >= THRESHOLD) {
        // NEXT Section
        if (currentIndex < PRESENTATION_SECTIONS.length - 1) {
          transitionToSection(currentIndex + 1);
        } else if (currentIndex === PRESENTATION_SECTIONS.length - 1) {
          transitionToSection(PRESENTATION_SECTIONS.length); // Enter Footer
        }
      } else if (accumulatedDeltaRef.current <= -THRESHOLD) {
        // PREVIOUS Section
        if (currentIndex > 0) {
          transitionToSection(currentIndex - 1);
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleWheel);
      observer?.disconnect();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      if (deltaResetTimeoutRef.current) clearTimeout(deltaResetTimeoutRef.current);
    };
  }, [
    mobileMenuOpen,
    getFooterTargetY,
    getSectionTargetY,
    transitionToSection,
  ]);

  const navLinks = [
    { label: "درباره ما", href: "/about", isInternalRoute: true },
    { label: "ویژگی‌ها", href: "#benefits", isInternalRoute: false },
    { label: "مسائل و مشکلات", href: "#features", isInternalRoute: false },
    { label: "تجربه محصول", href: "#experience", isInternalRoute: false },
    { label: "چطور کار می‌کند", href: "#how-it-works", isInternalRoute: false },
  ];

  const handleNavAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const id = href.slice(1);
      handleSelectSection(id);
    }
  };

  return (
    <div className="landing-page min-h-screen relative font-body bg-[#0b1120] text-slate-100 selection:bg-teal-500/30 selection:text-teal-200">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled
            ? "shadow-lg backdrop-blur-xl bg-[#0b1120]/90 border-b border-white/10"
            : "bg-[#0b1120]/65 backdrop-blur-md border-b border-white/5"
        }`}
        aria-label="ناوبری اصلی صفحه لندینگ"
      >
        {/* Subtle Scroll Progress Indicator */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-500 origin-right"
          style={{ scaleX }}
        />

        <div className="flex justify-between items-center px-6 max-w-[1280px] mx-auto h-20">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <BrandLogo
              linkTo="/"
              variant="logo-only"
              size="md"
              className="hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Desktop Links */}
          <ul className="hidden lg:flex items-center gap-7 text-sm font-medium">
            {navLinks.map((item) => (
              <li key={item.href}>
                {item.isInternalRoute ? (
                  <Link
                    to={item.href}
                    className="text-slate-300 hover:text-teal-300 transition-colors duration-200 font-medium"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={item.href}
                    onClick={(e) => handleNavAnchorClick(e, item.href)}
                    className="text-slate-300 hover:text-teal-300 transition-colors duration-200 font-medium"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          {/* CTA & Mobile Toggle */}
          <div className="flex items-center gap-4">
            <Link
              to={ctaHref}
              className="hidden md:inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-bold text-sm cursor-pointer active:scale-95 transition-all duration-300 bg-[#008080] hover:bg-[#005a5a] text-white shadow-[0_0_20px_rgba(0,128,128,0.3)] hover:shadow-[0_0_25px_rgba(45,212,191,0.4)] hover:-translate-y-0.5"
            >
              <span>شروع یادگیری</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <button
              aria-label={mobileMenuOpen ? "بستن منو" : "باز کردن منو"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 text-slate-200 hover:text-teal-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg"
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
            className="lg:hidden absolute top-20 left-0 w-full bg-[#0b1120]/95 backdrop-blur-2xl border-b border-white/10 shadow-2xl flex flex-col px-6 py-5 gap-3"
          >
            {navLinks.map((item) =>
              item.isInternalRoute ? (
                <Link
                  key={item.href}
                  to={item.href}
                  className="py-2.5 px-3 rounded-lg text-slate-200 hover:text-teal-300 hover:bg-white/5 transition-colors font-medium text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className="py-2.5 px-3 rounded-lg text-slate-200 hover:text-teal-300 hover:bg-white/5 transition-colors font-medium text-sm"
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
              className="w-full h-12 mt-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#005a5a] text-white shadow-md active:scale-95 transition-all"
            >
              <span>شروع یادگیری</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </nav>

      {/* Desktop Side Rail Presentation Dots */}
      <PresentationNavDots
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
      />

      {/* Main Narrative Journey */}
      <main className="relative z-10 pt-20">
        {/* 1. Hero Encounter */}
        <HeroSection />

        {/* 2. Problem Section (Chaos -> Organization) */}
        <FeaturesSection />

        {/* 3. Solution & Benefits (5 Core Pillars) */}
        <FeatureCards />

        {/* 4. Interactive Product Experience (Flashcards, AI Demo, Hierarchy, Quiz) */}
        <ProductExperienceSection />

        {/* 5. 4-Step Learning Pipeline */}
        <HowItWorksSection />

        {/* 6. Action & Crystalline Resolution */}
        <FinalCTASection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
