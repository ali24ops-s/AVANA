/**
 * Final CTA Section
 *
 * Preserves 100% of existing content, headings, subtitles, and CTA buttons.
 * Enhanced with:
 * - Dynamic Crystalline Constellation Canvas in the background (structured knowledge resolution)
 * - Trust Badges
 * - Secondary Explore Link
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { LandingCrystallineCanvas } from "./canvas/LandingCrystallineCanvas.js";
import { Sparkles, BookOpen, CheckCircle2 } from "lucide-react";

export function FinalCTASection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      id="final-cta"
      className="relative py-24 md:py-32 px-6 max-w-[1280px] mx-auto overflow-hidden text-center"
      aria-label="بخش فراخوان نهایی و شروع یادگیری"
    >
      {/* Symmetrical Crystalline Background Canvas (The resolved state of knowledge) */}
      <div className="absolute inset-0 -z-10">
        <LandingCrystallineCanvas />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-teal-500/15 via-cyan-500/15 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-3xl mx-auto px-6 text-center relative z-10"
      >
        {/* Culmination Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-teal-950/70 text-teal-300 border-teal-400/40 shadow-[0_0_25px_rgba(45,212,191,0.25)]">
          <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" />
          <span>آماده‌ای یادگیری را جور دیگری تجربه کنی؟</span>
        </div>

        {/* Headline */}
        <h2
          className="font-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-6 text-white leading-tight"
        >
          یادگیری بهتر از{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 drop-shadow-[0_0_25px_rgba(45,212,191,0.3)]">
            همین‌جا
          </span>{" "}
          شروع می‌شود
        </h2>

        {/* Subtitle */}
        <p
          className="text-base sm:text-lg md:text-xl mb-10 text-slate-300 max-w-xl mx-auto leading-relaxed font-body"
        >
          به هزاران دانشجوی پزشکی بپیوندید که مسیر موفقیت خود را با آوانا هموار
          کرده‌اند.
        </p>

        {/* Dual CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-2xl mx-auto">
          <Link
            to={ctaHref}
            className="w-full sm:w-auto h-16 px-8 sm:px-10 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-[#008080] hover:bg-[#005a5a] text-white shadow-[0_0_30px_rgba(0,128,128,0.4)] hover:shadow-[0_0_40px_rgba(45,212,191,0.5)] hover:-translate-y-1.5"
          >
            <span>همین حالا شروع کنید</span>
            <span className="material-symbols-outlined rtl:-scale-x-100 text-xl">
              rocket_launch
            </span>
          </Link>

          <Link
            to="/library"
            className="w-full sm:w-auto h-16 px-8 sm:px-10 rounded-2xl font-bold text-base flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-white/20 hover:border-teal-500/50 hover:-translate-y-1 backdrop-blur-md"
          >
            <BookOpen className="w-4 h-4 text-teal-400" />
            <span>مشاهده دوره‌ها و منابع</span>
          </Link>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 pt-8 border-t border-white/10 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>منطبق با رفرنس‌های آزمون‌های جامع علوم پزشکی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>الگوریتم علمی مرور فاصله‌دار (Spaced Repetition)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>بیش از ۱۰,۰۰۰+ دانشجوی فعال</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
