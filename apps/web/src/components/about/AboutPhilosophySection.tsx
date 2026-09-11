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
          className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-7 flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[10px] bg-[#008080]/10 border border-[#008080]/25 text-[#008080] flex items-center justify-center">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-[#008080] font-bold tracking-wide">اصل اول</span>
                <h3 className="text-lg font-black text-[var(--color-text)]">یادگیری باید شخصی باشد.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6">
              هر دانشجو سرعت، نقاط قوت و زمان‌بندی منحصر‌به‌فرد خود را دارد. آوانا محتوا و آزمون‌ها را با مسیر واقعی شما تطبیق می‌دهد.
            </p>
          </div>

          {/* Micro Experience 1: Dynamic Path Switcher */}
          <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3 text-xs text-[var(--color-text-muted)]">
              <span>هدف فعلی شما:</span>
              <span className="text-[#008080] font-semibold">تنظیم خودکار نقشه راه</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[
                { id: "term" as const, label: "مطالعه ترمیک" },
                { id: "clinical" as const, label: "مرور بالینی" },
                { id: "comprehensive" as const, label: "آزمون ۱۸۰ واحدی" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStudyMode(tab.id)}
                  className={`py-2 px-2 rounded-[8px] text-xs font-bold transition-all ${
                    studyMode === tab.id
                      ? "bg-[#008080] text-white shadow-xs"
                      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Simulated Dynamic Plan Output */}
            <div className="p-3 rounded-[8px] bg-[#008080]/10 border border-[#008080]/25 text-xs text-[#008080] flex items-center justify-between">
              <div>
                <span className="font-bold block text-[var(--color-text)]">
                  {studyMode === "term" && "برنامه تعادلی: ۴ درس در هفته + خلاصه‌سازی مفهومی"}
                  {studyMode === "clinical" && "برنامه بالینی: تمرکز بر فارماکوتراپی و دوزاژ بالینی"}
                  {studyMode === "comprehensive" && "برنامه فشرده: آزمون‌های جامع شبیه‌سازی + مرور سریع"}
                </span>
                <span className="text-[10px] text-[#008080] mt-0.5 block">تطبیق خودکار با الگوریتم آوانا</span>
              </div>
              <TrendingUp className="w-4 h-4 text-[#008080] shrink-0" />
            </div>
          </div>
        </motion.div>

        {/* Pillar 2: Knowledge Transformation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-7 flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[10px] bg-cyan-500/10 border border-cyan-500/25 text-cyan-600 flex items-center justify-center">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-cyan-600 font-bold tracking-wide">اصل دوم</span>
                <h3 className="text-lg font-black text-[var(--color-text)]">اطلاعات باید به دانش تبدیل شوند.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6">
              محتوای خام به تنهایی مهارت نمی‌آفریند. در آوانا، داده‌های گسسته به خوشه‌های مفهومی و شبکه‌ای از بینش تبدیل می‌شوند.
            </p>
          </div>

          {/* Micro Experience 2: Cluster to Graph Interactive Toggle */}
          <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[var(--color-text-muted)]">حالت نمایش مفاهیم:</span>
              <button
                onClick={() => setIsSynthesized(!isSynthesized)}
                className="text-xs px-3 py-1 rounded-[8px] bg-cyan-50 border border-cyan-300 text-cyan-800 font-bold hover:bg-cyan-100 transition-colors"
              >
                {isSynthesized ? "مشاهده داده‌های گسسته" : "تبدیل به شبکه دانش"}
              </button>
            </div>

            <div className="h-28 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] p-3 flex items-center justify-center relative overflow-hidden">
              {isSynthesized ? (
                <div className="flex items-center justify-center gap-4 text-xs font-bold text-cyan-800">
                  <div className="p-2 rounded-[8px] bg-cyan-50 border border-cyan-300">
                    داده خام
                  </div>
                  <Sparkles className="w-4 h-4 text-cyan-600 animate-spin" />
                  <div className="p-2 rounded-[8px] bg-teal-50 border border-teal-300 text-teal-800">
                    ساختار هوشمند
                  </div>
                  <Sparkles className="w-4 h-4 text-[#008080] animate-spin" />
                  <div className="p-2 rounded-[8px] bg-purple-50 border border-purple-300 text-purple-800">
                    تسلط بالینی
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center items-center opacity-70">
                  <span className="px-2 py-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-[6px] text-[10px] text-[var(--color-text-muted)]">متن جزوه</span>
                  <span className="px-2 py-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-[6px] text-[10px] text-[var(--color-text-muted)]">اسلاید استاد</span>
                  <span className="px-2 py-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-[6px] text-[10px] text-[var(--color-text-muted)]">جدول عوارض</span>
                  <span className="px-2 py-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-[6px] text-[10px] text-[var(--color-text-muted)]">نام تجاری</span>
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
          className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-7 flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-600 flex items-center justify-center">
                <RotateCw className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-purple-600 font-bold tracking-wide">اصل سوم</span>
                <h3 className="text-lg font-black text-[var(--color-text)]">مرور باید هوشمند باشد.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6">
              شما نباید حدس بزنید چه چیزی را در آستانه فراموشی هستید. سیستم منحنی یادگیری شما را رصد کرده و مرورها را در زمان بهینه پیشنهاد می‌دهد.
            </p>
          </div>

          {/* Micro Experience 3: Spaced Repetition Timeline */}
          <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3 text-xs text-[var(--color-text-muted)]">
              <span>فاصله مرور بهینه:</span>
              <span className="text-purple-700 font-bold">روز {reviewDay}ام پس از یادگیری</span>
            </div>

            <div className="flex gap-2 mb-3">
              {[1, 3, 7, 14, 30].map((day) => (
                <button
                  key={day}
                  onClick={() => setReviewDay(day)}
                  className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-all ${
                    reviewDay === day
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  روز {day}
                </button>
              ))}
            </div>

            <div className="p-2.5 rounded-[8px] bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600 shrink-0" />
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
          className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-7 flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[10px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 flex items-center justify-center">
                <Milestone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-emerald-600 font-bold tracking-wide">اصل چهارم</span>
                <h3 className="text-lg font-black text-[var(--color-text)]">یادگیری یک مسیر است، نه مجموعه‌ای از صفحات.</h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed mb-6">
              یادگیری با ورق زدن پی‌درپی تمام نمی‌شود. این یک سفر پیوسته از شکل‌گیری سؤال تا درک عمیق، سنجش، تحلیل و اعتمادبه‌نفس حرفه‌ای است.
            </p>
          </div>

          {/* Micro Experience 4: Continuous Progress Road */}
          <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3 text-xs text-[var(--color-text-muted)]">
              <span>گام‌های پیوسته یادگیری در آوانا:</span>
              <span className="text-emerald-700 font-bold">۱۰۰٪ پیوسته</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="p-2 rounded-[8px] bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span className="text-[10px] text-[var(--color-text-muted)] block">گام ۱</span>
                <span className="text-xs font-bold">مطالعه درس</span>
              </div>
              <div className="p-2 rounded-[8px] bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span className="text-[10px] text-[var(--color-text-muted)] block">گام ۲</span>
                <span className="text-xs font-bold">فلش‌کارت</span>
              </div>
              <div className="p-2 rounded-[8px] bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span className="text-[10px] text-[var(--color-text-muted)] block">گام ۳</span>
                <span className="text-xs font-bold">آزمون‌ساز</span>
              </div>
              <div className="p-2 rounded-[8px] bg-[#008080] text-white shadow-xs">
                <span className="text-[10px] opacity-85 block">گام ۴</span>
                <span className="text-xs font-extrabold">تسلط بالینی</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
