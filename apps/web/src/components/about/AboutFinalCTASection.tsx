import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { CrystallineConstellationCanvas } from "./canvas/CrystallineConstellationCanvas.js";
import { ArrowLeft, BookOpen, Sparkles, CheckCircle2 } from "lucide-react";

export const AboutFinalCTASection: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      id="final-cta"
      className="relative py-24 md:py-32 px-6 max-w-[1280px] mx-auto overflow-hidden text-center"
      aria-label="بخش فراخوان نهایی و آغاز یادگیری با آوانا"
    >
      {/* Symmetrical Crystalline Background Canvas */}
      <div className="absolute inset-0 -z-10">
        <CrystallineConstellationCanvas />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-teal-500/10 via-cyan-500/10 to-purple-500/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="max-w-3xl mx-auto flex flex-col items-center relative z-10">
        {/* Culmination Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-[#008080]/10 text-[#008080] border-[#008080]/25 shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-[#008080] animate-pulse" />
          <span>پایان سردرگمی، آغاز تسلط</span>
        </motion.div>

        {/* Powerful Resonant Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[var(--color-text)] leading-tight mb-4"
        >
          مسیر یادگیری تو می‌تواند{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#008080] to-[#005f5f]">
            متفاوت باشد.
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-[var(--color-text-muted)] mb-10 max-w-xl leading-relaxed"
        >
          از همین‌جا شروع کن و تفاوت مطالعه هوشمند، متصل و شخصی‌سازی‌شده را تجربه نما.
        </motion.p>

        {/* Dual CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-2xl"
        >
          <Link
            to={primaryHref}
            className="w-full sm:w-auto h-12 sm:h-14 px-8 sm:px-9 rounded-[10px] font-bold text-base flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-xs hover:-translate-y-0.5"
          >
            <span>شروع با آوانا</span>
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <Link
            to="/library"
            className="w-full sm:w-auto h-12 sm:h-14 px-8 sm:px-9 rounded-[10px] font-bold text-base flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[#008080] hover:-translate-y-0.5 shadow-xs"
          >
            <BookOpen className="w-4 h-4 text-[#008080]" />
            <span>کاوش در محتوای آموزشی</span>
          </Link>
        </motion.div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 pt-8 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#008080]" />
            <span>محتوای منطبق با رفرنس‌های ملی داروسازی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#008080]" />
            <span>طراحی‌شده برای دانشجویان و اساتید</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#008080]" />
            <span>پشتیبانی علمی و فنی پیوسته</span>
          </div>
        </div>
      </div>
    </section>
  );
};
