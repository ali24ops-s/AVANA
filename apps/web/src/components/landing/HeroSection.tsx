/**
 * Landing page hero section — AVANA Narrative & Interactive Experience.
 *
 * Preserves 100% of existing content, headlines, CTAs, social proof, and dashboard replica.
 * Enhanced with dynamic knowledge particle constellation canvas, floating concept badges,
 * and high-fidelity glassmorphism.
 */

import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { LandingHeroCanvas } from "./canvas/LandingHeroCanvas.js";

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      id="hero"
      className="relative pt-8 pb-20 md:pb-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش آغازین معرفی پلتفرم آوانا"
    >
      {/* Dynamic Background Constellation Canvas */}
      <div className="absolute inset-0 -z-10">
        <LandingHeroCanvas />
        {/* Soft Radial Ambient Lighting */}
        <div
          className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none -z-10"
          style={{
            background:
              "radial-gradient(circle, rgba(15,118,110,0.2) 0%, rgba(139,92,246,0.12) 50%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-10 left-10 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none -z-10"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.15) 0%, rgba(0,128,128,0.1) 60%, transparent 75%)",
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Text Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col gap-6 text-right order-2 lg:order-1 z-10"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full w-max text-xs sm:text-sm font-semibold tracking-wide border shadow-md backdrop-blur-md transition-all duration-300 bg-teal-950/60 text-teal-300 border-teal-500/40 hover:border-teal-400 hover:shadow-[0_0_20px_rgba(45,212,191,0.25)]"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
            <span>پلتفرم نوین آموزش پزشکی</span>
          </motion.div>

          {/* Headline */}
          <h1
            className="font-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.25] sm:leading-[1.3] font-black text-white tracking-tight"
          >
            درس بخون، مرور کن، <br />
            خودت رو بسنج؛ <br />
            <span
              className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 drop-shadow-[0_0_35px_rgba(45,212,191,0.3)]"
            >
              همه‌چیز با آوانا
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-sm sm:text-base md:text-lg leading-relaxed max-w-xl text-slate-300"
          >
            تجربه‌ای متفاوت از یادگیری با خلاصه‌سازی هوشمند، فلش‌کارت‌های
            یکپارچه و سیستم آزمون‌ساز. مسیر موفقیت در تحصیلات پزشکی از اینجا
            آغاز می‌شود.
          </p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row-reverse gap-4 pt-2"
          >
            <Link
              to={ctaHref}
              className="h-14 px-8 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 transition-all duration-300 bg-[#008080] hover:bg-[#005a5a] text-white shadow-[0_0_25px_rgba(0,128,128,0.4)] hover:shadow-[0_0_35px_rgba(45,212,191,0.5)] hover:-translate-y-1"
            >
              <span>شروع یادگیری</span>
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="h-14 px-7 rounded-xl font-bold text-base flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all duration-300 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-white/20 hover:border-teal-500/50 hover:-translate-y-1 backdrop-blur-md"
            >
              <span>آوانا چطور کار می‌کند؟</span>
            </a>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="flex items-center gap-4 mt-2 pt-6 border-t border-white/10"
          >
            <div className="flex -space-x-3 rtl:space-x-reverse">
              {["آ", "م", "س"].map((initial, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-full border-2 border-[#0b1120] flex items-center justify-center text-white text-xs font-bold shadow-md hover:scale-110 hover:z-10 transition-transform duration-300"
                  style={{
                    background: [
                      "linear-gradient(135deg, #0f766e, #005c55)",
                      "linear-gradient(135deg, #6b38d4, #8455ef)",
                      "linear-gradient(135deg, #007952, #005e3f)",
                    ][i],
                  }}
                >
                  {initial}
                </div>
              ))}
            </div>
            <div className="text-xs sm:text-sm text-slate-300">
              <span className="font-extrabold text-white block">
                بیش از ۱۰,۰۰۰+
              </span>
              دانشجوی پزشکی و داروسازی
            </div>
          </motion.div>
        </motion.div>

        {/* Hero Image / High Fidelity HTML Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="relative order-1 lg:order-2"
        >
          {/* Ambient Glow underneath mockup */}
          <div className="absolute -inset-2 bg-gradient-to-r from-teal-500/20 via-cyan-500/20 to-purple-500/20 rounded-3xl blur-2xl opacity-75 pointer-events-none" />

          <div
            className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,128,128,0.25)] border border-white/15 bg-[#0b1120]"
          >
            {/* HTML Mockup of AVANA Dashboard (Exact Replica of HomePage /home) */}
            <div className="absolute inset-0 flex flex-col bg-[#0b1120] text-right dir-rtl pointer-events-none select-none text-slate-100 p-3 sm:p-4 overflow-hidden text-[10px]">
              {/* 1. Header Greeting */}
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-white/10">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white">سلام علی 👋</h4>
                  <p className="text-[9px] sm:text-[10px] text-slate-400">امروز آماده‌ای ادامه بدی؟</p>
                </div>
                <div className="bg-slate-800/90 px-2.5 py-1 rounded-full border border-white/10 text-[9px] sm:text-[10px] text-slate-300 flex items-center gap-1">
                  <span className="text-purple-300 font-bold">📅 ۱۲ مهر ۱۴۰۳</span>
                </div>
              </div>

              {/* 2. Main Layout (Hero + Stats + Courses) */}
              <div className="grid grid-cols-12 gap-2 sm:gap-2.5 flex-1 overflow-hidden">
                {/* Left/Main Area (8 cols) */}
                <div className="col-span-8 flex flex-col gap-2">
                  {/* Hero Card */}
                  <div className="rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-teal-500/30 p-2.5 flex justify-between items-center relative overflow-hidden shadow-lg">
                    <div className="absolute -left-6 -top-6 w-16 h-16 bg-[#008080]/30 rounded-full blur-xl" />
                    <div className="space-y-1 z-10 w-3/4">
                      <span className="inline-block px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[8px] font-bold rounded-full border border-purple-500/30">
                        فارماکولوژی پایه
                      </span>
                      <h5 className="text-[11px] font-extrabold text-white">فصل ۴ — سیستم عصبی خودمختار</h5>
                      <p className="text-[8px] text-teal-300 font-bold">آوانا؛ همراه هوشمند یادگیری شما</p>

                      {/* Progress bar */}
                      <div className="pt-1">
                        <div className="flex justify-between text-[8px] mb-0.5">
                          <span className="text-slate-300">پیشرفت</span>
                          <span className="text-teal-400 font-bold">۶۸٪</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-700/60 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-l from-teal-400 to-[#008080] rounded-full w-[68%]" />
                        </div>
                      </div>
                    </div>
                    {/* Glowing Brain Icon */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-900/50 via-slate-800 to-purple-900/40 border border-teal-500/40 flex items-center justify-center text-teal-300 text-sm font-bold z-10 shadow-md">
                      🧠
                    </div>
                  </div>

                  {/* 4-Stats Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-lg bg-slate-800/60 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">زمان مطالعه</p>
                      <p className="text-[10px] font-bold text-purple-300 mt-0.5">۱۲ ساعت</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">تکمیل شده</p>
                      <p className="text-[10px] font-bold text-teal-300 mt-0.5">۸ درس</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">آزمون‌ها</p>
                      <p className="text-[10px] font-bold text-cyan-300 mt-0.5">۳ آزمون</p>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">Streak</p>
                      <p className="text-[10px] font-bold text-amber-300 mt-0.5">۵ روز 🔥</p>
                    </div>
                  </div>

                  {/* My Courses */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="font-bold text-white">دوره‌های من</span>
                      <span className="text-teal-400 font-semibold">مشاهده همه</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-slate-800/50 border border-white/10 p-1.5 flex gap-1.5 items-center">
                        <div className="w-6 h-6 rounded bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-[10px] shrink-0">
                          📖
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold text-white truncate">آناتومی قلبی</p>
                          <div className="h-1 w-full bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-teal-500 w-[45%]" />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-800/50 border border-white/10 p-1.5 flex gap-1.5 items-center">
                        <div className="w-6 h-6 rounded bg-teal-950/60 border border-teal-500/30 flex items-center justify-center text-[10px] shrink-0">
                          🎓
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold text-white truncate">فیزیولوژی سلولی</p>
                          <div className="h-1 w-full bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-teal-400 w-[90%]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side Cards (4 cols) */}
                <div className="col-span-4 flex flex-col gap-2">
                  {/* AI Mentor Card */}
                  <div className="rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900 border-t-2 border-t-purple-500 border-white/10 p-2 space-y-1 text-[8px] shadow-sm">
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300">
                        🤖
                      </span>
                      <span className="font-bold text-white text-[9px]">دستیار آوانا</span>
                    </div>
                    <p className="text-slate-300 text-[8px] line-clamp-2">
                      سوالت رو بپرس تا با هم رفع اشکال کنیم.
                    </p>
                    <div className="bg-purple-500/20 text-purple-300 text-[8px] py-0.5 rounded text-center font-bold border border-purple-500/30">
                      از آوانا بپرس
                    </div>
                  </div>

                  {/* Today's Study Plan */}
                  <div className="rounded-xl bg-slate-800/50 border border-white/10 p-2 space-y-1 text-[8px] flex-1">
                    <p className="font-bold text-white text-[9px] mb-1">📅 برنامه امروز</p>
                    <div className="p-1 rounded bg-white/5 text-slate-200 truncate">مرور فلش‌کارت آناتومی</div>
                    <div className="p-1 rounded bg-teal-900/30 border border-teal-500/30 text-teal-300 font-bold truncate">
                      کوییز فیزیولوژی ✔
                    </div>
                    <div className="p-1 rounded bg-white/5 text-slate-200 truncate">فصل ۵ فارماکولوژی</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Study Hours Card */}
          <div
            className="absolute -bottom-5 -left-4 z-20 p-3.5 sm:p-4 rounded-2xl shadow-2xl flex items-center gap-3 sm:gap-4 backdrop-blur-xl border border-teal-500/30 bg-slate-900/90 text-right dir-rtl hover:scale-105 transition-all duration-300"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0 shadow-inner">
              <span className="material-symbols-outlined text-xl sm:text-2xl">schedule</span>
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-semibold text-slate-300">
                ساعت مطالعه این هفته
              </p>
              <p className="font-extrabold text-base sm:text-lg text-white">
                ۱۲.۵ ساعت
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
