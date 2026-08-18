/**
 * Landing page hero section — Stitch design reference.
 *
 * Layout: two-column grid (text left, mockup right in RTL).
 * Features: badge, headline with gradient text, dual CTA buttons,
 * social proof row, hero mockup image with floating progress card.
 */

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section className="relative pt-12 pb-24 px-6 max-w-[1280px] mx-auto overflow-hidden">
      {/* Background Decoration */}
      <div
        className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-3xl -z-10 translate-x-1/4 -translate-y-1/4 pointer-events-none bg-gradient-animate"
        style={{
          background:
            "linear-gradient(to top right, var(--lp-surface-container-high, #dce9ff) 0%, rgba(15,118,110,0.2) 50%, rgba(132,85,239,0.1) 100%)",
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Text Content */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" as const }}
          className="flex flex-col gap-8 text-right order-2 lg:order-1 z-10"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-2 rounded-full w-max text-sm font-semibold tracking-wide border hover:shadow-md hover:-translate-y-1 transition-all duration-300"
            style={{
              backgroundColor: "var(--lp-surface-container-low, #eff4ff)",
              color: "var(--lp-primary, #005c55)",
              borderColor: "rgba(0, 92, 85, 0.1)",
            }}
          >
            پلتفرم نوین آموزش پزشکی
          </motion.div>

          {/* Headline */}
          <h1
            className="font-headline text-4xl md:text-5xl lg:text-6xl leading-tight font-bold"
            style={{ color: "var(--lp-on-surface, #0b1c30)" }}
          >
            درس بخون، مرور کن، <br />
            خودت رو بسنج؛ <br />
            <span
              className="text-gradient"
              style={{
                background:
                  "linear-gradient(to left, var(--lp-primary-container, #0f766e), var(--lp-secondary, #6b38d4))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              همه‌چیز با آوانا
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-base md:text-lg leading-relaxed max-w-xl"
            style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
          >
            تجربه‌ای متفاوت از یادگیری با خلاصه‌سازی هوشمند، فلش‌کارت‌های
            یکپارچه و سیستم آزمون‌ساز. مسیر موفقیت در تحصیلات پزشکی از اینجا
            آغاز می‌شود.
          </p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row-reverse gap-4 pt-4"
          >
            <Link
              to={ctaHref}
              className="h-14 px-8 rounded-xl font-semibold text-base flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1"
              style={{
                backgroundColor: "var(--lp-primary-container, #0f766e)",
                color: "var(--lp-on-primary-container, #a3faef)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--lp-primary, #005c55)";
                e.currentTarget.style.boxShadow =
                  "0 20px 40px -10px rgba(15,118,110,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--lp-primary-container, #0f766e)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              شروع یادگیری
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="bg-transparent h-14 px-8 rounded-xl font-semibold text-base flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all duration-300 hover:-translate-y-1"
              style={{
                border: "1px solid var(--lp-outline-variant, #bdc9c6)",
                color: "var(--lp-on-surface, #0b1c30)",
              }}
            >
              آوانا چطور کار می‌کند؟
            </a>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center gap-4 mt-4 pt-6"
            style={{
              borderTop: "1px solid rgba(189, 201, 198, 0.2)",
            }}
          >
            <div className="flex -space-x-4 rtl:space-x-reverse">
              {["آ", "م", "س"].map((initial, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-white text-sm font-bold hover:scale-110 hover:z-10 transition-transform duration-300"
                  style={{
                    borderColor: "var(--lp-surface, #f8f9ff)",
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
            <div
              className="text-sm"
              style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
            >
              <span
                className="font-bold block"
                style={{ color: "var(--lp-on-surface, #0b1c30)" }}
              >
                بیش از ۱۰,۰۰۰+
              </span>
              دانشجوی پزشکی
            </div>
          </motion.div>
        </motion.div>

        {/* Hero Image/Mockup */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="relative order-1 lg:order-2"
        >
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden soft-shadow animate-lp-float-slow transition-shadow duration-500 hover:shadow-2xl"
            style={{
              border: "1px solid rgba(189, 201, 198, 0.2)",
              backgroundColor: "var(--lp-surface, #0b1120)",
            }}
          >
            {/* HTML Mockup of AVANA Dashboard (Exact Replica of HomePage /home) */}
            <div className="absolute inset-0 flex flex-col bg-[#0b1120] text-right dir-rtl pointer-events-none select-none text-slate-100 p-3 overflow-hidden text-[10px]">
              {/* 1. Header Greeting */}
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-white/10">
                <div>
                  <h4 className="text-xs font-black text-white">سلام علی 👋</h4>
                  <p className="text-[9px] text-slate-400">امروز آماده‌ای ادامه بدی؟</p>
                </div>
                <div className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-white/10 text-[9px] text-slate-300 flex items-center gap-1">
                  <span className="text-purple-400 font-bold">📅 ۱۲ مهر ۱۴۰۳</span>
                </div>
              </div>

              {/* 2. Main Layout (Hero + Stats + Courses) */}
              <div className="grid grid-cols-12 gap-2 flex-1 overflow-hidden">
                {/* Left/Main Area (8 cols) */}
                <div className="col-span-8 flex flex-col gap-2">
                  {/* Hero Card */}
                  <div className="rounded-xl bg-slate-800/60 border border-white/10 p-2.5 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute -left-6 -top-6 w-16 h-16 bg-[#008080]/30 rounded-full blur-xl" />
                    <div className="space-y-1 z-10 w-3/4">
                      <span className="inline-block px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[8px] font-bold rounded-full border border-purple-500/30">فارماکولوژی پایه</span>
                      <h5 className="text-[11px] font-extrabold text-white">فصل ۴ — سیستم عصبی خودمختار</h5>
                      <p className="text-[8px] text-teal-400 font-bold">آوانا؛ همراه هوشمند یادگیری شما</p>
                      
                      {/* Progress bar */}
                      <div className="pt-1">
                        <div className="flex justify-between text-[8px] mb-0.5">
                          <span className="text-slate-300">پیشرفت</span>
                          <span className="text-teal-400 font-bold">۶۸٪</span>
                        </div>
                        <div className="h-1 w-full bg-slate-700/60 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-l from-teal-400 to-[#008080] rounded-full w-[68%]" />
                        </div>
                      </div>
                    </div>
                    {/* Glowing Brain */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-900/50 via-slate-800 to-purple-900/40 border border-teal-500/30 flex items-center justify-center text-teal-400 text-sm font-bold z-10">
                      🧠
                    </div>
                  </div>

                  {/* 4-Stats Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-lg bg-white/5 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">زمان مطالعه</p>
                      <p className="text-[10px] font-bold text-purple-400 mt-0.5">۱۲ ساعت</p>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">تکمیل شده</p>
                      <p className="text-[10px] font-bold text-teal-400 mt-0.5">۸ درس</p>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">آزمون‌ها</p>
                      <p className="text-[10px] font-bold text-cyan-400 mt-0.5">۳ آزمون</p>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-1.5">
                      <p className="text-[8px] text-slate-400">Streak</p>
                      <p className="text-[10px] font-bold text-amber-400 mt-0.5">۵ روز 🔥</p>
                    </div>
                  </div>

                  {/* My Courses */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="font-bold text-white">دوره‌های من</span>
                      <span className="text-teal-400 font-semibold">مشاهده همه</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-slate-800/40 border border-white/10 p-1.5 flex gap-1.5 items-center">
                        <div className="w-6 h-6 rounded bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-[10px] shrink-0">📖</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-bold text-white truncate">آناتومی قلبی</p>
                          <div className="h-1 w-full bg-slate-700/50 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-teal-500 w-[45%]" />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-800/40 border border-white/10 p-1.5 flex gap-1.5 items-center">
                        <div className="w-6 h-6 rounded bg-teal-950/60 border border-teal-500/30 flex items-center justify-center text-[10px] shrink-0">🎓</div>
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
                  <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border-t-2 border-t-purple-500 border-white/10 p-2 space-y-1 text-[8px]">
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300">🤖</span>
                      <span className="font-bold text-white text-[9px]">دستیار آوانا</span>
                    </div>
                    <p className="text-slate-300 text-[8px] line-clamp-2">سوالت رو بپرس تا با هم رفع اشکال کنیم.</p>
                    <div className="bg-purple-500/20 text-purple-300 text-[8px] py-0.5 rounded text-center font-bold">از آوانا بپرس</div>
                  </div>

                  {/* Today's Study Plan */}
                  <div className="rounded-xl bg-slate-800/40 border border-white/10 p-2 space-y-1 text-[8px] flex-1">
                    <p className="font-bold text-white text-[9px] mb-1">📅 برنامه امروز</p>
                    <div className="p-1 rounded bg-white/5 text-slate-200">مرور فلش‌کارت آناتومی</div>
                    <div className="p-1 rounded bg-teal-900/30 border border-teal-500/30 text-teal-300 font-bold">کوییز فیزیولوژی ✔</div>
                    <div className="p-1 rounded bg-white/5 text-slate-200">فصل ۵ فارماکولوژی</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Study Hours Card */}
          <div
            className="absolute -bottom-6 -left-6 z-30 p-4 rounded-xl shadow-2xl flex items-center gap-4 hover:scale-110 transition-all duration-300 backdrop-blur-xl border border-white/20 bg-[#0f172a]/90 text-right dir-rtl"
            style={{
              animation: "lp-float 4s ease-in-out infinite",
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-500/20 text-purple-400 border border-purple-500/30 shrink-0"
            >
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300">
                ساعت مطالعه این هفته
              </p>
              <p className="font-bold text-lg text-white">
                ۱۲.۵ ساعت
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
