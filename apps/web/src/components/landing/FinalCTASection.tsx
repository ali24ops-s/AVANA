/**
 * Final CTA Section — "منبعت را بده به آوانا. از همین‌جا شروع کن."
 *
 * Light-first, clean, warm editorial finish matching Reference Design.
 * Includes:
 * - Direct motivational headline
 * - Primary auth-aware CTA button ("شروع با آوانا")
 * - Aesthetic stack of medical books with sticky note: "موفقیت در انتظار توست..."
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { ArrowLeft, Sparkles, BookOpen } from "lucide-react";

export function FinalCTASection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      id="final-cta"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش فراخوان نهایی و شروع مطالعه با آوانا"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Call to Action Text */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-7 flex flex-col gap-5 z-10"
        >
          {/* Badge */}
          <div className="w-max">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>شروع یک تجربه متفاوت</span>
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-headline text-3xl sm:text-4xl lg:text-[46px] leading-[1.22] font-black text-[#1a2226] tracking-tight">
            منبعت را بده به آوانا.
            <br />
            <span className="text-[#008080]">از همین‌جا شروع کن.</span>
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55] max-w-xl">
            آوانا همیشه کنار توست؛ از مطالعه خط‌به‌خط جزوات تا قبولی با بالاترین نمره در امتحانات جامع و آزمون‌های تخصصی.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <Link
              to={ctaHref}
              className="h-12 px-8 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] transition-all duration-200 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-md shadow-[#008080]/20 hover:-translate-y-0.5"
            >
              <span>شروع با آوانا</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <Link
              to="/library"
              className="h-12 px-6 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 bg-white border border-[#E2E7EA] hover:border-[#008080]/40 text-[#3d4f55] shadow-xs"
            >
              <BookOpen className="w-4 h-4 text-[#008080]" />
              <span>مشاهده دوره‌ها و منابع</span>
            </Link>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): Book Stack & Motivational Sticky Note */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="lg:col-span-5 flex justify-center relative"
        >
          <div className="relative w-full max-w-sm flex flex-col items-center">
            {/* Ambient warm glow */}
            <div className="absolute inset-0 bg-[#F0E6D2]/40 rounded-full blur-2xl pointer-events-none" />

            {/* Motivational Sticky Note */}
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-20 mb-[-12px] rotate-[-4deg] p-3 rounded-xl bg-amber-100 border border-amber-300 shadow-card text-center text-xs font-bold text-amber-900"
            >
              <span>✨ موفقیت در انتظار توست...</span>
            </motion.div>

            {/* Stack of Academic Books (Pharmacology, Medicine) */}
            <div className="relative z-10 w-64 sm:w-72 flex flex-col gap-1.5">
              {/* Top Book: Pharmacology */}
              <div className="h-12 rounded-xl bg-gradient-to-r from-teal-700 to-teal-800 text-white p-3 flex items-center justify-between border-b-2 border-teal-950 shadow-card">
                <span className="text-xs font-black tracking-wider">PHARMACOLOGY</span>
                <span className="text-[10px] text-teal-200 font-mono">جلد اول</span>
              </div>

              {/* Middle Book: Internal Medicine */}
              <div className="h-12 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-white p-3 flex items-center justify-between border-b-2 border-slate-950 shadow-card">
                <span className="text-xs font-black tracking-wider">INTERNAL MEDICINE</span>
                <span className="text-[10px] text-slate-300 font-mono">هاریسون</span>
              </div>

              {/* Bottom Book: Physiology */}
              <div className="h-14 rounded-xl bg-gradient-to-r from-teal-900 to-[#004d40] text-white p-3 flex items-center justify-between border-b-2 border-black shadow-lg">
                <span className="text-xs font-black tracking-wider">HUMAN PHYSIOLOGY</span>
                <span className="text-[10px] text-teal-300 font-mono">گایتون</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
