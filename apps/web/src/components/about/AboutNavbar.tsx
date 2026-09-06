import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { motion, useScroll, useSpring } from "framer-motion";
import { ArrowLeft, Menu, X } from "lucide-react";

export const AboutNavbar: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "صفحه اصلی", href: "/" },
    { label: "وبلاگ", href: "/blog" },
    { label: "مشکل اطلاعات", href: "#problem-section" },
    { label: "زنجیره یادگیری", href: "#turning-point" },
    { label: "فلسفه ما", href: "#philosophy" },
    { label: "اکوسیستم آوانا", href: "#ecosystem" },
  ];

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? "shadow-lg backdrop-blur-xl bg-[#0b1120]/90 border-b border-white/10"
          : "bg-[#0b1120]/60 backdrop-blur-md border-b border-white/5"
      }`}
      aria-label="ناوبری اصلی درباره ما"
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
          <span className="hidden sm:inline-block text-xs text-teal-400 font-semibold px-2 py-0.5 rounded-full bg-teal-950/60 border border-teal-500/30">
            داستان آوانا
          </span>
        </div>

        {/* Desktop Links */}
        <ul className="hidden lg:flex items-center gap-7 text-sm font-medium">
          {navLinks.map((item) => (
            <li key={item.href}>
              {item.href.startsWith("/") ? (
                <Link
                  to={item.href}
                  className="text-slate-300 hover:text-teal-300 transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  href={item.href}
                  className="text-slate-300 hover:text-teal-300 transition-colors duration-200"
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
          {navLinks.map((item) => (
            item.href.startsWith("/") ? (
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
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            )
          ))}
          <Link
            to={ctaHref}
            onClick={() => setMobileMenuOpen(false)}
            className="w-full h-12 mt-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#005a5a] text-white shadow-md active:scale-95 transition-all"
          >
            <span>شروع یادگیری با آوانا</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </motion.div>
      )}
    </nav>
  );
};
