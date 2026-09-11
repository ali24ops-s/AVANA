/**
 * Learning Pipeline Section — "از یک منبع تا یادگیری کامل"
 *
 * Narrative:
 * Takes a single raw study file through a complete learning lifecycle:
 * یک منبع -> درسنامه -> فلش‌کارت -> آزمون -> مرور
 *
 * Uses an editorial connected timeline composition with progress milestones,
 * distinct card geometries, and clear micro-metaphors.
 */

import { motion } from "framer-motion";
import {
  FileText,
  BookOpen,
  Layers,
  FileCheck2,
  Clock,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { formatPersianOf } from "@avana/domain";

const pipelineStages = [
  {
    step: "۰۱",
    title: "یک منبع خام",
    caption: "PDF / جزوه / کتاب / عکس تخته",
    detail: "فایل جزوه کلاسی یا رفرنس قطبی را بارگذاری می‌کنید.",
    icon: FileText,
    badgeColor: "bg-rose-50 text-rose-600 border-rose-200",
    iconBg: "bg-rose-50 text-rose-600",
  },
  {
    step: "۰۲",
    title: "درسنامه مفهومی",
    caption: "توضیح ساده با نکات کلیدی",
    detail: "متن به بخش‌های استاندارد با زبان روان و هایلایت تبدیل می‌شود.",
    icon: BookOpen,
    badgeColor: "bg-teal-50 text-[#008080] border-teal-200",
    iconBg: "bg-teal-50 text-[#008080]",
  },
  {
    step: "۰۳",
    title: "فلش‌کارت SRS",
    caption: "مرور سریع و فاصله‌دار",
    detail: "نکات مهم به فلش‌کارت‌های فعال با الگوریتم فاصله‌گذاری فضایی تبدیل می‌شوند.",
    icon: Layers,
    badgeColor: "bg-sky-50 text-sky-600 border-sky-200",
    iconBg: "bg-sky-50 text-sky-600",
  },
  {
    step: "۰۴",
    title: "آزمون شبیه‌ساز",
    caption: "سؤالات استاندارد و تحلیلی",
    detail: "تست‌های چندگزینه‌ای همراه با تحلیل چرایی درستی یا نادرستی هر گزینه.",
    icon: FileCheck2,
    badgeColor: "bg-emerald-50 text-emerald-600 border-emerald-200",
    iconBg: "bg-emerald-50 text-emerald-600",
  },
  {
    step: "۰۵",
    title: "مرور هوشمند",
    caption: "تثبیت دائم در حافظه",
    detail: "یادآوری نکات در موعدهای دقیق علمی پیش از آزمون جامع و پایان‌ترم.",
    icon: Clock,
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    iconBg: "bg-amber-50 text-amber-700",
  },
];

export function LearningPipelineSection() {
  return (
    <section
      id="learning-pipeline"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش مسیر کامل یادگیری آوانا"
    >
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold mb-4 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>چرخه کامل یادگیری</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-headline text-3xl sm:text-4xl lg:text-[40px] leading-[1.25] font-black text-[#1a2226]"
        >
          از یک منبع تا <span className="text-[#008080]">یادگیری کامل</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-3 text-base sm:text-lg text-[#3d4f55]"
        >
          هر منبع درسی، یک مسیر کامل یادگیری است. از خواندن و درک تا آزمون و تسلط همیشگی.
        </motion.p>
      </div>

      {/* Progressive Connected Pipeline Composition */}
      <div className="relative">
        {/* Continuous Connecting Line for Desktop (aligned with step badge / icon center at 38px) */}
        <div className="hidden lg:block absolute top-[38px] left-12 right-12 h-0.5 bg-gradient-to-r from-teal-200 via-teal-400 to-teal-600 z-0 opacity-40" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
          {pipelineStages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <motion.div
                key={stage.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -4 }}
                className="p-5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card hover:border-[#008080]/40 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Step number badge & icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-md border ${stage.badgeColor}`}
                    >
                      {stage.step}
                    </span>
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${stage.iconBg} border border-current/20 shadow-xs`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Title & Caption */}
                  <h3 className="font-bold text-base text-[#1a2226] mb-1">
                    {stage.title}
                  </h3>
                  <p className="text-xs font-semibold text-[#008080] mb-2">
                    {stage.caption}
                  </p>

                  {/* Detail */}
                  <p className="text-xs text-[#5B6268] leading-relaxed">
                    {stage.detail}
                  </p>
                </div>

                {/* Bottom connector indicator for desktop */}
                <div className="mt-4 pt-3 border-t border-[#EEF1F3] flex items-center justify-between text-[11px] text-[#5B6268]">
                  <span>{formatPersianOf(idx + 1, pipelineStages.length, { prefix: "مرحله" })}</span>
                  {idx < pipelineStages.length - 1 && (
                    <ArrowLeft className="w-3.5 h-3.5 text-[#008080] lg:block hidden" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
