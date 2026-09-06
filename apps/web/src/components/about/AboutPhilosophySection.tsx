import React, { useState } from "react";
import { motion } from "framer-motion";
import { SectionHeading } from "./shared/SectionHeading.js";
import {
  Compass,
  Network,
  RotateCw,
  Milestone,
  Sparkles,
  Zap,
  TrendingUp,
} from "lucide-react";

export const AboutPhilosophySection: React.FC = () => {
  // Micro-experience 1: Personal Path Mode
  const [studyMode, setStudyMode] = useState<"comprehensive" | "clinical" | "term">("clinical");

  // Micro-experience 2: Knowledge Synthesis Level
  const [isSynthesized, setIsSynthesized] = useState<boolean>(true);

  // Micro-experience 3: Review Spaced Stage
  const [reviewDay, setReviewDay] = useState<number>(3);

  return (
    <section
      id="philosophy"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش اصول فلسفی آوانا در آموزش"
    >
      {/* Background Accent */}
      <div className="absolute top-1/4 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Heading */}
      <SectionHeading
        badge="فلسفه آموزشی آوانا"
        badgeIcon={<Compass className="w-4 h-4 text-teal-300" />}
        title="ما به یادگیری متفاوتی"
        highlightText="باور داریم."
        subtitle="چهار اصل بنیادین که تمامی اجزا، الگوریتم‌ها و طراحی تجربه کاربری آوانا بر پایه آن‌ها مهندسی شده است."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* Pillar 1: Personalization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl bg-slate-900/80 border border-teal-500/25 p-6 sm:p-7 backdrop-blur-xl flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-teal-400 font-bold tracking-wide">اصل اول</span>
                <h3 className="text-lg font-black text-white">یادگیری باید شخصی باشد.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              هر دانشجو سرعت، نقاط قوت و زمان‌بندی منحصر‌به‌فرد خود را دارد. آوانا محتوا و آزمون‌ها را با مسیر واقعی شما تطبیق می‌دهد.
            </p>
          </div>

          {/* Micro Experience 1: Dynamic Path Switcher */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>هدف فعلی شما:</span>
              <span className="text-teal-300 font-semibold">تنظیم خودکار نقشه راه</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[
                { id: "term", label: "مطالعه ترمیک" },
                { id: "clinical", label: "مرور بالینی" },
                { id: "comprehensive", label: "آزمون ۱۸۰ واحدی" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStudyMode(tab.id as any)}
                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                    studyMode === tab.id
                      ? "bg-teal-500 text-slate-950 shadow-md"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Simulated Dynamic Plan Output */}
            <div className="p-3 rounded-lg bg-teal-950/30 border border-teal-500/20 text-xs text-teal-200 flex items-center justify-between">
              <div>
                <span className="font-bold block text-white">
                  {studyMode === "term" && "برنامه تعادلی: ۴ درس در هفته + خلاصه‌سازی مفهومی"}
                  {studyMode === "clinical" && "برنامه بالینی: تمرکز بر فارماکوتراپی و دوزاژ بالینی"}
                  {studyMode === "comprehensive" && "برنامه فشرده: آزمون‌های جامع شبیه‌سازی + مرور سریع"}
                </span>
                <span className="text-[10px] text-teal-400 mt-0.5 block">تطبیق خودکار با الگوریتم آوانا</span>
              </div>
              <TrendingUp className="w-4 h-4 text-teal-400 shrink-0" />
            </div>
          </div>
        </motion.div>

        {/* Pillar 2: Knowledge Transformation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl bg-slate-900/80 border border-cyan-500/25 p-6 sm:p-7 backdrop-blur-xl flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-cyan-400 font-bold tracking-wide">اصل دوم</span>
                <h3 className="text-lg font-black text-white">اطلاعات باید به دانش تبدیل شوند.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              محتوای خام به تنهایی مهارت نمی‌آفریند. در آوانا، داده‌های گسسته به خوشه‌های مفهومی و شبکه‌ای از بینش تبدیل می‌شوند.
            </p>
          </div>

          {/* Micro Experience 2: Cluster to Graph Interactive Toggle */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400">حالت نمایش مفاهیم:</span>
              <button
                onClick={() => setIsSynthesized(!isSynthesized)}
                className="text-xs px-3 py-1 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold hover:bg-cyan-900/50 transition-colors"
              >
                {isSynthesized ? "مشاهده داده‌های گسسته" : "تبدیل به شبکه دانش"}
              </button>
            </div>

            <div className="h-28 rounded-lg bg-slate-900/90 border border-white/10 p-3 flex items-center justify-center relative overflow-hidden">
              {isSynthesized ? (
                <div className="flex items-center justify-center gap-4 text-xs font-bold text-cyan-300">
                  <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                    داده خام
                  </div>
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
                  <div className="p-2 rounded-lg bg-teal-950/80 border border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.3)]">
                    ساختار هوشمند
                  </div>
                  <Sparkles className="w-4 h-4 text-teal-400 animate-spin" />
                  <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    تسلط بالینی
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center items-center opacity-60">
                  <span className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300">متن جزوه</span>
                  <span className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300">اسلاید استاد</span>
                  <span className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300">جدول عوارض</span>
                  <span className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300">نام تجاری</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Pillar 3: Smart Spaced Review */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="rounded-2xl bg-slate-900/80 border border-purple-500/25 p-6 sm:p-7 backdrop-blur-xl flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center justify-center">
                <RotateCw className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-purple-400 font-bold tracking-wide">اصل سوم</span>
                <h3 className="text-lg font-black text-white">مرور باید هوشمند باشد.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              شما نباید حدس بزنید چه چیزی را در آستانه فراموشی هستید. سیستم منحنی یادگیری شما را رصد کرده و مرورها را در زمان بهینه پیشنهاد می‌دهد.
            </p>
          </div>

          {/* Micro Experience 3: Spaced Repetition Timeline */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>فاصله مرور بهینه:</span>
              <span className="text-purple-300 font-bold">روز {reviewDay}ام پس از یادگیری</span>
            </div>

            <div className="flex gap-2 mb-3">
              {[1, 3, 7, 14, 30].map((day) => (
                <button
                  key={day}
                  onClick={() => setReviewDay(day)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    reviewDay === day
                      ? "bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  روز {day}
                </button>
              ))}
            </div>

            <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                {reviewDay === 1 && "تثبیت اولیه: مرور نکات کلیدی و فلش‌کارت‌های سریع"}
                {reviewDay === 3 && "مقابله با شیب تند فراموشی: سنجش با کوییز ۵ سوالی"}
                {reviewDay === 7 && "تثبیت میان‌مدت: حل تست‌های تداخلات و کاربرد بالینی"}
                {reviewDay === 14 && "انتقال به حافظه بلندمدت: مرور تطبیقی موارد دشوار"}
                {reviewDay === 30 && "تسلط پایدار: آماده برای هرگونه امتحان و چالش بالینی"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Pillar 4: Continuous Learning Journey */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-2xl bg-slate-900/80 border border-emerald-500/25 p-6 sm:p-7 backdrop-blur-xl flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center">
                <Milestone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-emerald-400 font-bold tracking-wide">اصل چهارم</span>
                <h3 className="text-lg font-black text-white">یادگیری یک مسیر است، نه مجموعه‌ای از صفحات.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
              یادگیری با ورق زدن پی‌درپی تمام نمی‌شود. این یک سفر پیوسته از شکل‌گیری سؤال تا درک عمیق، سنجش، تحلیل و اعتمادبه‌نفس حرفه‌ای است.
            </p>
          </div>

          {/* Micro Experience 4: Continuous Progress Road */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>گام‌های پیوسته یادگیری در آوانا:</span>
              <span className="text-emerald-300 font-bold">۱۰۰٪ پیوسته</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                <span className="text-[10px] text-slate-400 block">گام ۱</span>
                <span className="text-xs font-bold">مطالعه درس</span>
              </div>
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                <span className="text-[10px] text-slate-400 block">گام ۲</span>
                <span className="text-xs font-bold">فلش‌کارت</span>
              </div>
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                <span className="text-[10px] text-slate-400 block">گام ۳</span>
                <span className="text-xs font-bold">آزمون‌ساز</span>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500 text-slate-950 shadow-md">
                <span className="text-[10px] opacity-80 block">گام ۴</span>
                <span className="text-xs font-extrabold">تسلط بالینی</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
