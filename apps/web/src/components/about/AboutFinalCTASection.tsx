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
      {/* Symmetrical Crystalline Background Canvas (The resolved, structured state of the Hero's initial chaos) */}
      <div className="absolute inset-0 -z-10">
        <CrystallineConstellationCanvas />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-teal-500/15 via-cyan-500/15 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="max-w-3xl mx-auto flex flex-col items-center relative z-10">
        {/* Culmination Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-teal-950/70 text-teal-300 border-teal-400/30 shadow-[0_0_25px_rgba(45,212,191,0.25)]"
        >
          <Sparkles className="w-4 h-4 text-teal-300 animate-pulse" />
          <span>پایان سردرگمی، آغاز تسلط</span>
        </motion.div>

        {/* Powerful Resonant Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-4"
        >
          مسیر یادگیری تو می‌تواند{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 drop-shadow-[0_0_25px_rgba(45,212,191,0.3)]">
            متفاوت باشد.
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-slate-300 mb-10 max-w-xl leading-relaxed"
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
            className="w-full sm:w-auto h-14 px-8 sm:px-9 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-[#008080] hover:bg-[#005a5a] text-white shadow-[0_0_30px_rgba(0,128,128,0.4)] hover:shadow-[0_0_40px_rgba(45,212,191,0.5)] hover:-translate-y-1"
          >
            <span>شروع با آوانا</span>
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <Link
            to="/library"
            className="w-full sm:w-auto h-14 px-8 sm:px-9 rounded-xl font-bold text-base flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-95 transition-all duration-300 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-white/20 hover:border-teal-500/50 hover:-translate-y-1"
          >
            <BookOpen className="w-4 h-4 text-teal-400" />
            <span>کاوش در محتوای آموزشی</span>
          </Link>
        </motion.div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 pt-8 border-t border-white/10 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>محتوای منطبق با رفرنس‌های ملی داروسازی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>طراحی‌شده برای دانشجویان و اساتید</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>پشتیبانی علمی و فنی پیوسته</span>
          </div>
        </div>
      </div>
    </section>
  );
};
