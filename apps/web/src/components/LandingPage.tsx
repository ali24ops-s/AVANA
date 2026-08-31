/**
 * Main Landing Page Container.
 *
 * Scoped under the `.landing-page` class for CSS variables.
 * Composes all landing sections and includes a sticky navigation bar.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { HeroSection } from "./landing/HeroSection";
import { FeatureCards } from "./landing/FeatureCards";
import { FeaturesSection } from "./landing/FeaturesSection";
import { HowItWorksSection } from "./landing/HowItWorksSection";
import { FinalCTASection } from "./landing/FinalCTASection";
import { Footer } from "./landing/Footer";
import { useAuth } from "../providers/AuthProvider.js";
import { isAuthEnabled } from "../config/authConfig.js";

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ctaHref = !isAuthEnabled() || isAuthenticated ? "/courses" : "/sign-in";

  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="landing-page min-h-screen relative font-body">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled
            ? "shadow-md backdrop-blur-md bg-[var(--lp-surface)]/95"
            : "bg-[var(--lp-surface)]/80 backdrop-blur-md"
        }`}
      >
        <div className="flex justify-between items-center px-6 max-w-[1280px] mx-auto h-20">
          {/* Brand */}
          <Link
            to="/"
            className="font-headline text-2xl font-bold shrink-0 hover:scale-105 transition-transform duration-300"
            style={{ color: "var(--lp-primary, #005c55)" }}
          >
            AVANA
          </Link>

          {/* Desktop Links */}
          <ul className="hidden md:flex items-center gap-8">
            <li>
              <a
                href="#benefits"
                className="transition-colors duration-300 font-medium"
                style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--lp-primary, #005c55)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--lp-on-surface-variant, #3e4947)";
                }}
              >
                ویژگی‌ها
              </a>
            </li>
            <li>
              <a
                href="#features"
                className="transition-colors duration-300 font-medium"
                style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--lp-primary, #005c55)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--lp-on-surface-variant, #3e4947)";
                }}
              >
                مسائل و مشکلات
              </a>
            </li>
            <li>
              <a
                href="#how-it-works"
                className="transition-colors duration-300 font-medium"
                style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--lp-primary, #005c55)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color =
                    "var(--lp-on-surface-variant, #3e4947)";
                }}
              >
                چطور کار می‌کند
              </a>
            </li>
          </ul>

          {/* CTA & Mobile Toggle */}
          <div className="flex items-center gap-4">
            <Link
              to={ctaHref}
              className="hidden md:inline-flex items-center justify-center h-12 px-6 rounded-lg font-semibold cursor-pointer active:scale-95 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              style={{
                backgroundColor: "var(--lp-primary-container, #0f766e)",
                color: "var(--lp-on-primary-container, #a3faef)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--lp-primary, #005c55)";
                e.currentTarget.style.color = "var(--lp-on-primary, #ffffff)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--lp-primary-container, #0f766e)";
                e.currentTarget.style.color =
                  "var(--lp-on-primary-container, #a3faef)";
              }}
            >
              شروع یادگیری
            </Link>
            <button
              aria-label="Toggle Menu"
              className="md:hidden p-2"
              style={{ color: "var(--lp-on-surface, #0b1c30)" }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="material-symbols-outlined text-3xl">
                {mobileMenuOpen ? "close" : "menu"}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden absolute top-20 left-0 w-full shadow-md flex flex-col px-6 py-4 border-t"
            style={{
              backgroundColor: "var(--lp-surface, #f8f9ff)",
              borderTopColor: "rgba(189, 201, 198, 0.2)",
            }}
          >
            <a
              href="#benefits"
              className="py-3 border-b"
              style={{
                color: "var(--lp-on-surface-variant, #3e4947)",
                borderBottomColor: "rgba(189, 201, 198, 0.1)",
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              ویژگی‌ها
            </a>
            <a
              href="#features"
              className="py-3 border-b"
              style={{
                color: "var(--lp-on-surface-variant, #3e4947)",
                borderBottomColor: "rgba(189, 201, 198, 0.1)",
              }}
              onClick={() => setMobileMenuOpen(false)}
            >
              مسائل و مشکلات
            </a>
            <a
              href="#how-it-works"
              className="py-3 mb-4"
              style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
              onClick={() => setMobileMenuOpen(false)}
            >
              چطور کار می‌کند
            </a>
            <Link
              to={ctaHref}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full h-12 rounded-lg font-semibold flex items-center justify-center cursor-pointer active:scale-95"
              style={{
                backgroundColor: "var(--lp-primary-container, #0f766e)",
                color: "var(--lp-on-primary-container, #a3faef)",
              }}
            >
              شروع یادگیری
            </Link>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main>
        <HeroSection />
        <FeatureCards />
        <FeaturesSection />
        <HowItWorksSection />
        <FinalCTASection />
      </main>

      <Footer />
    </div>
  );
}
