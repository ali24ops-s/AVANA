import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "./shared/SectionHeading.js";
import { AlertCircle, Layers, Shuffle, Sparkles, BookOpen, Brain, Zap } from "lucide-react";

export const AboutProblemSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overload" | "organized">("organized");

  const floatingSubjects = [
    { name: "فارماکولوژی", en: "Pharmacology", color: "from-teal-50 to-teal-100/60", border: "border-teal-200", text: "text-teal-900" },
    { name: "شیمی دارویی", en: "Medicinal Chemistry", color: "from-sky-50 to-sky-100/60", border: "border-sky-200", text: "text-sky-900" },
    { name: "فیزیولوژی", en: "Physiology", color: "from-purple-50 to-purple-100/60", border: "border-purple-200", text: "text-purple-900" },
    { name: "فارماکوگنوزی", en: "Pharmacognosy", color: "from-emerald-50 to-emerald-100/60", border: "border-emerald-200", text: "text-emerald-900" },
    { name: "میکروبیولوژی", en: "Microbiology", color: "from-amber-50 to-amber-100/60", border: "border-amber-200", text: "text-amber-900" },
    { name: "فارماسیوتیکس", en: "Pharmaceutics", color: "from-rose-50 to-rose-100/60", border: "border-rose-200", text: "text-rose-900" },
    { name: "فارماکوتراپی", en: "Pharmacotherapy", color: "from-cyan-50 to-cyan-100/60", border: "border-cyan-200", text: "text-cyan-900" },
    { name: "سم‌شناسی", en: "Toxicology", color: "from-indigo-50 to-indigo-100/60", border: "border-indigo-200", text: "text-indigo-900" },
  ];

  return (
    <section
      id="problem-section"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش بررسی مشکل حجم اطلاعات در داروسازی"
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none -translate-x-1/2" />
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none translate-x-1/2" />

      {/* Heading */}
      <SectionHeading
        badge="چالش واقعی دانشجو"
        badgeIcon={<AlertCircle className="w-4 h-4 text-amber-500" />}
        title="مشکل دانشجو کمبود اطلاعات نیست؛"
        highlightText="گم شدن در اقیانوس داده‌هاست."
        subtitle="هزاران صفحه رفرنس، صدها دسته‌بندی دارویی و تداخلات بی‌پایان. مطالعه به روش سنتی انرژی را تحلیل می‌برد بدون آنکه تسلط واقعی ایجاد کند."
      />

      {/* Floating Knowledge Stream Grid */}
      <div className="relative mb-14">
        <p className="text-center text-xs font-semibold text-[var(--color-text-muted)] mb-4 tracking-wider">
          اقیانوس دروس و مباحث داروسازی
        </p>
        <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3.5 max-w-4xl mx-auto">
          {floatingSubjects.map((sub, i) => (
            <motion.div
              key={sub.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              whileHover={{ scale: 1.05, y: -2 }}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r ${sub.color} border ${sub.border} shadow-xs select-none cursor-default`}
            >
              <span className={`text-xs sm:text-sm font-bold ${sub.text}`}>{sub.name}</span>
              <span className="text-[10px] text-slate-500 font-sans tracking-wide">({sub.en})</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Interactive Transformation Stage (Chaos vs Structure) */}
      <div className="max-w-4xl mx-auto rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 sm:p-6 md:p-8 shadow-xs">
        {/* Toggle Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--color-border)] pb-5 mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#008080]" />
              <span>تحول در شیوه مطالعه: از آشفتگی تا وضوح</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              تفاوت مطالعه سنتی منفصل را با رویکرد ساختاریافته آوانا مقایسه کنید.
            </p>
          </div>

          <div
            className="inline-flex p-1 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs font-semibold"
            role="tablist"
            aria-label="انتخاب وضعیت مطالعه"
          >
            <button
              role="tab"
              aria-selected={activeTab === "overload"}
              onClick={() => setActiveTab("overload")}
              className={`px-3.5 py-1.5 rounded-[8px] transition-all flex items-center gap-1.5 ${
                activeTab === "overload"
                  ? "bg-rose-100 text-rose-800 border border-rose-300 shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>مطالعه سنتی (سردرگمی)</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "organized"}
              onClick={() => setActiveTab("organized")}
              className={`px-3.5 py-1.5 rounded-[8px] transition-all flex items-center gap-1.5 ${
                activeTab === "organized"
                  ? "bg-[#008080]/15 text-[#008080] border border-[#008080]/30 shadow-xs font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#008080]" />
              <span>رویکرد آوانا (نظم شناختی)</span>
            </button>
          </div>
        </div>

        {/* Tab Content Cards */}
        <AnimatePresence mode="wait">
          {activeTab === "overload" ? (
            <motion.div
              key="overload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="p-4 rounded-[12px] bg-rose-50/70 border border-rose-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-700 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>انباشت جزوه‌ها و PDFها</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  صدها اسلاید بدون شاخص‌گذاری و دسته‌بندی؛ کاربر مجبور است برای هر مبحث ده‌ها فایل سنگین را از نو ورق بزند.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-rose-50/70 border border-rose-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-700 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>حفظ کورکورانه اسامی</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  حفظ کردن اسامی داروها بدون درک مکانیسم و گیرنده باعث می‌شود در شرایط بالینی یا سوالات تحلیلی فراموش شوند.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-rose-50/70 border border-rose-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-700 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>فراموشی سریع و تکراری</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  نبود سیستم زمان‌بندی مرور منجر به افت شدید یادآوری پس از گذشت چند روز از اتمام هر فصل می‌شود.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="organized"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#008080]/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-[#008080] text-sm font-bold">
                  <BookOpen className="w-4 h-4 shrink-0 text-[#008080]" />
                  <span>ساختار درختی و طبقه‌بندی</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  مفاهیم به صورت بخش‌بندی‌های منسجم، خلاصه‌سازی‌های استاندارد و نکات کلیدی تفکیک می‌شوند.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-[#008080] text-sm font-bold">
                  <Brain className="w-4 h-4 shrink-0 text-cyan-600" />
                  <span>اتصال مکانیسم به بالین</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  هر دارو به گیرنده، اثر فیزیولوژیک و کاربرد بالینی متصل می‌شود تا یادگیری به صورت شبکه‌ای تثبیت شود.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-[#008080] text-sm font-bold">
                  <Zap className="w-4 h-4 shrink-0 text-purple-600" />
                  <span>مرور هوشمند فاصله‌دار</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  سیستم هوشمند فلش‌کارت‌ها درست قبل از آغاز فراموشی، نکته را برای مرور به دانشجو پیشنهاد می‌دهد.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
