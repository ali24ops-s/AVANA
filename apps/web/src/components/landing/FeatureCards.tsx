/**
 * "آوانا چیست؟" section — 5 Core Feature Cards.
 *
 * Preserves 100% of existing content, headings, subtitles, and all 5 feature cards.
 * Enhanced with:
 * - Specific visual metaphors for each capability
 * - Dark glassmorphic styling, ambient color glow, and micro-interactions.
 */

import type React from "react";
import { motion, type Variants } from "framer-motion";
import { Sparkles, BookOpen, FileText, Bot, RotateCcw, Award } from "lucide-react";
import { Badge } from "@avana/ui";

interface FeatureCard {
  icon: string;
  iconFill: boolean;
  title: string;
  description: string;
  metaphor: string;
  metaphorIcon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  borderColor: string;
  hoverGlow: string;
}

const features: FeatureCard[] = [
  {
    icon: "auto_stories",
    iconFill: true,
    title: "مطالعه عمیق",
    description:
      "دسترسی به منابع ساختاریافته، خلاصه‌های کاربردی و محیطی بدون حواس‌پرتی برای تمرکز حداکثری.",
    metaphor: "دوره ◄ فصل ◄ درسنامه ◄ نکات کنکوری",
    metaphorIcon: <BookOpen className="w-3.5 h-3.5 text-[#008080]" />,
    accentColor: "#008080",
    accentBg: "rgba(0, 128, 128, 0.08)",
    borderColor: "rgba(0, 128, 128, 0.2)",
    hoverGlow: "rgba(0, 128, 128, 0.12)",
  },
  {
    icon: "picture_as_pdf",
    iconFill: true,
    title: "پردازش هوشمند PDF",
    description:
      "بارگذاری فایل‌ها و جزوات درسی PDF و تبدیل هوشمند آن‌ها به فصل‌ها، خلاصه‌ها و کدهای یادگیری.",
    metaphor: "فایل خام PDF ◄ استخراج هوشمند ◄ فصول منظم",
    metaphorIcon: <FileText className="w-3.5 h-3.5 text-[#008080]" />,
    accentColor: "#008080",
    accentBg: "rgba(0, 128, 128, 0.08)",
    borderColor: "rgba(0, 128, 128, 0.2)",
    hoverGlow: "rgba(0, 128, 128, 0.12)",
  },
  {
    icon: "smart_toy",
    iconFill: true,
    title: "دستیار هوشمند آوانا",
    description:
      "دستیار مبتنی بر هوش مصنوعی برای پاسخگویی به سوالات درسی، رفع اشکال و تحلیل عمیق مفابیم پزشکی.",
    metaphor: "طرح سوال ◄ استدلال شناختی ◄ پاسخ بالینی",
    metaphorIcon: <Bot className="w-3.5 h-3.5 text-[#008080]" />,
    accentColor: "#008080",
    accentBg: "rgba(0, 128, 128, 0.08)",
    borderColor: "rgba(0, 128, 128, 0.2)",
    hoverGlow: "rgba(0, 128, 128, 0.12)",
  },
  {
    icon: "psychology",
    iconFill: true,
    title: "مرور هوشمند",
    description:
      "سیستم فلش‌کارت مبتنی بر تکرار با فاصله‌گذاری فضایی (Spaced Repetition) برای انتقال به حافظه بلندمدت.",
    metaphor: "تکرار ۱ روز ◄ ۳ روز ◄ ۷ روز ◄ انتقال به حافظه دائم",
    metaphorIcon: <RotateCcw className="w-3.5 h-3.5 text-[#008080]" />,
    accentColor: "#008080",
    accentBg: "rgba(0, 128, 128, 0.08)",
    borderColor: "rgba(0, 128, 128, 0.2)",
    hoverGlow: "rgba(0, 128, 128, 0.12)",
  },
  {
    icon: "quiz",
    iconFill: true,
    title: "سنجش دقیق",
    description:
      "آزمون‌های دوره‌ای و شبیه‌سازی شرایط واقعی برای ارزیابی میزان تسلط بر مباحث مختلف.",
    metaphor: "شبیه‌سازی کنکور ◄ کارنامه تحلیلی ◄ کشف نقاط ضعف",
    metaphorIcon: <Award className="w-3.5 h-3.5 text-[#008080]" />,
    accentColor: "#008080",
    accentBg: "rgba(0, 128, 128, 0.08)",
    borderColor: "rgba(0, 128, 128, 0.2)",
    hoverGlow: "rgba(0, 128, 128, 0.12)",
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export function FeatureCards() {
  return (
    <section
      id="benefits"
      className="snap-section relative py-10 lg:py-0 lg:h-[calc(100dvh-80px)] lg:min-h-[calc(100dvh-80px)] flex flex-col justify-center px-6 max-w-[1280px] mx-auto overflow-hidden text-right scroll-mt-20"
      aria-label="بخش معرفی ویژگی‌ها و قابلیت‌های اصلی آوانا"
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-4 lg:mb-5 max-w-3xl mx-auto"
      >
        <div className="mb-2 flex justify-center">
          <Badge
            variant="primary"
            size="md"
            icon={<Sparkles className="w-3.5 h-3.5 text-[#008080]" />}
            className="px-3 py-1 shadow-xs"
          >
            اکوسیستم یکپارچه آموزشی
          </Badge>
        </div>

        <h2
          className="font-headline text-2xl sm:text-3xl md:text-4xl font-black mb-1.5 text-[var(--avana-text-primary)] leading-tight"
        >
          آوانا چیست؟
        </h2>
        <p
          className="text-xs sm:text-sm md:text-base leading-relaxed text-[var(--avana-text-secondary)] max-w-2xl mx-auto"
        >
          یک اکوسیستم کامل برای مدیریت فرآیند یادگیری، مرور و سنجش
          دانش‌آموختگان علوم پزشکی.
        </p>
      </motion.div>

      {/* Cards Flex Grid Centered */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="flex flex-wrap justify-center gap-3 lg:gap-4"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={cardVariants}
            whileHover={{ y: -3 }}
            className="w-full md:w-[calc(50%-10px)] lg:w-[calc(33.333%-12px)] rounded-[16px] p-4 sm:p-5 bg-white border border-[var(--avana-border-default)] shadow-xs flex flex-col justify-between text-right group cursor-default transition-all duration-200 relative overflow-hidden hover:shadow-card hover:border-[#008080]/40"
          >
            {/* Top Accent Line */}
            <div
              className="absolute top-0 right-0 left-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: feature.accentColor }}
            />

            <div>
              {/* Icon */}
              <div
                className="w-11 h-11 rounded-[10px] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-300 border shadow-xs"
                style={{
                  backgroundColor: feature.accentBg,
                  borderColor: feature.borderColor,
                  color: feature.accentColor,
                }}
              >
                <span
                  className="material-symbols-outlined text-2xl"
                  style={{
                    fontVariationSettings: feature.iconFill
                      ? "'FILL' 1"
                      : "'FILL' 0",
                  }}
                >
                  {feature.icon}
                </span>
              </div>

              {/* Title */}
              <h3
                className="font-bold text-base sm:text-lg mb-1.5 text-[var(--avana-text-primary)] group-hover:text-[#008080] transition-colors"
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p
                className="leading-relaxed text-xs sm:text-sm text-[var(--avana-text-secondary)] mb-3"
              >
                {feature.description}
              </p>
            </div>

            {/* Visual Metaphor / Pipeline Badge */}
            <div className="pt-2.5 border-t border-[var(--avana-border-subtle)] flex items-center gap-2 text-[11px] font-semibold text-[var(--avana-text-muted)]">
              {feature.metaphorIcon}
              <span className="truncate">{feature.metaphor}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
