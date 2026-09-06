import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "./shared/SectionHeading.js";
import { AlertCircle, Layers, Shuffle, Sparkles, BookOpen, Brain, Zap } from "lucide-react";

export const AboutProblemSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"overload" | "organized">("organized");

  const floatingSubjects = [
    { name: "فارماکولوژی", en: "Pharmacology", color: "from-teal-500/20 to-teal-700/20", border: "border-teal-500/30" },
    { name: "شیمی دارویی", en: "Medicinal Chemistry", color: "from-blue-500/20 to-blue-700/20", border: "border-blue-500/30" },
    { name: "فیزیولوژی", en: "Physiology", color: "from-purple-500/20 to-purple-700/20", border: "border-purple-500/30" },
    { name: "فارماکوگنوزی", en: "Pharmacognosy", color: "from-emerald-500/20 to-emerald-700/20", border: "border-emerald-500/30" },
    { name: "میکروبیولوژی", en: "Microbiology", color: "from-amber-500/20 to-amber-700/20", border: "border-amber-500/30" },
    { name: "فارماسیوتیکس", en: "Pharmaceutics", color: "from-rose-500/20 to-rose-700/20", border: "border-rose-500/30" },
    { name: "فارماکوتراپی", en: "Pharmacotherapy", color: "from-cyan-500/20 to-cyan-700/20", border: "border-cyan-500/30" },
    { name: "سم‌شناسی", en: "Toxicology", color: "from-indigo-500/20 to-indigo-700/20", border: "border-indigo-500/30" },
  ];

  return (
    <section
      id="problem-section"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش بررسی مشکل حجم اطلاعات در داروسازی"
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-teal-900/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2" />
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl pointer-events-none translate-x-1/2" />

      {/* Heading */}
      <SectionHeading
        badge="چالش واقعی دانشجو"
        badgeIcon={<AlertCircle className="w-4 h-4 text-amber-400" />}
        title="مشکل دانشجو کمبود اطلاعات نیست؛"
        highlightText="گم شدن در اقیانوس داده‌هاست."
        subtitle="هزاران صفحه رفرنس، صدها دسته‌بندی دارویی و تداخلات بی‌پایان. مطالعه به روش سنتی انرژی را تحلیل می‌برد بدون آنکه تسلط واقعی ایجاد کند."
      />

      {/* Floating Knowledge Stream Grid */}
      <div className="relative mb-14">
        <p className="text-center text-xs font-semibold text-slate-400 mb-4 tracking-wider">
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
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r ${sub.color} border ${sub.border} backdrop-blur-md shadow-sm select-none cursor-default`}
            >
              <span className="text-xs sm:text-sm font-bold text-slate-100">{sub.name}</span>
              <span className="text-[10px] text-slate-400 font-sans tracking-wide">({sub.en})</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Interactive Transformation Stage (Chaos vs Structure) */}
      <div className="max-w-4xl mx-auto rounded-2xl bg-slate-900/70 border border-white/10 p-4 sm:p-6 md:p-8 backdrop-blur-xl shadow-2xl">
        {/* Toggle Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/10 pb-5 mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-400" />
              <span>تحول در شیوه مطالعه: از آشفتگی تا وضوح</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              تفاوت مطالعه سنتی منفصل را با رویکرد ساختاریافته آوانا مقایسه کنید.
            </p>
          </div>

          <div
            className="inline-flex p-1 rounded-xl bg-slate-800/80 border border-white/10 text-xs font-semibold"
            role="tablist"
            aria-label="انتخاب وضعیت مطالعه"
          >
            <button
              role="tab"
              aria-selected={activeTab === "overload"}
              onClick={() => setActiveTab("overload")}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "overload"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>مطالعه سنتی (سردرگمی)</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "organized"}
              onClick={() => setActiveTab("organized")}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "organized"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
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
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>انباشت جزوه‌ها و PDFها</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  صدها اسلاید بدون شاخص‌گذاری و دسته‌بندی؛ کاربر مجبور است برای هر مبحث ده‌ها فایل سنگین را از نو ورق بزند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>حفظ کورکورانه اسامی</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  حفظ کردن اسامی داروها بدون درک مکانیسم و گیرنده باعث می‌شود در شرایط بالینی یا سوالات تحلیلی فراموش شوند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-rose-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>فراموشی سریع و تکراری</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
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
              <div className="p-4 rounded-xl bg-teal-950/30 border border-teal-500/30 flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-teal-300 text-sm font-bold">
                  <BookOpen className="w-4 h-4 shrink-0 text-teal-400" />
                  <span>ساختار درختی و طبقه‌بندی</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  مفاهیم به صورت بخش‌بندی‌های منسجم، خلاصه‌سازی‌های استاندارد و نکات کلیدی تفکیک می‌شوند.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-teal-950/30 border border-teal-500/30 flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-teal-300 text-sm font-bold">
                  <Brain className="w-4 h-4 shrink-0 text-cyan-400" />
                  <span>اتصال مکانیسم به بالین</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  هر دارو به گیرنده، اثر فیزیولوژیک و کاربرد بالینی متصل می‌شود تا یادگیری به صورت شبکه‌ای تثبیت شود.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-teal-950/30 border border-teal-500/30 flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center gap-2 text-teal-300 text-sm font-bold">
                  <Zap className="w-4 h-4 shrink-0 text-purple-400" />
                  <span>مرور هوشمند فاصله‌دار</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
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
