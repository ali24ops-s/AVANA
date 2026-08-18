/**
 * "آوانا چیست؟" section — 3 feature cards.
 *
 * Cards: مطالعه عمیق (Deep Study), مرور هوشمند (Smart Review),
 * سنجش دقیق (Precise Assessment).
 * Matches Stitch design with icon, title, description, hover effects.
 */

import { motion } from "framer-motion";

interface FeatureCard {
  icon: string;
  iconFill: boolean;
  title: string;
  description: string;
  accentColor: string;
  accentBg: string;
  hoverBorder: string;
}

const features: FeatureCard[] = [
  {
    icon: "auto_stories",
    iconFill: true,
    title: "مطالعه عمیق",
    description:
      "دسترسی به منابع ساختاریافته، خلاصه‌های کاربردی و محیطی بدون حواس‌پرتی برای تمرکز حداکثری.",
    accentColor: "var(--lp-primary-container, #0f766e)",
    accentBg: "rgba(15, 118, 110, 0.1)",
    hoverBorder: "rgba(15, 118, 110, 0.3)",
  },
  {
    icon: "picture_as_pdf",
    iconFill: true,
    title: "پردازش هوشمند PDF",
    description:
      "بارگذاری فایل‌ها و جزوات درسی PDF و تبدیل هوشمند آن‌ها به فصل‌ها، خلاصه‌ها و کدهای یادگیری.",
    accentColor: "var(--lp-tertiary-container, #007952)",
    accentBg: "rgba(0, 121, 82, 0.1)",
    hoverBorder: "rgba(0, 121, 82, 0.3)",
  },
  {
    icon: "smart_toy",
    iconFill: true,
    title: "دستیار هوشمند آوانا",
    description:
      "دستیار مبتنی بر هوش مصنوعی برای پاسخگویی به سوالات درسی، رفع اشکال و تحلیل عمیق مفاهیم پزشکی.",
    accentColor: "var(--lp-secondary, #6b38d4)",
    accentBg: "rgba(107, 56, 212, 0.1)",
    hoverBorder: "rgba(107, 56, 212, 0.3)",
  },
  {
    icon: "psychology",
    iconFill: true,
    title: "مرور هوشمند",
    description:
      "سیستم فلش‌کارت مبتنی بر تکرار با فاصله‌گذاری فضایی (Spaced Repetition) برای انتقال به حافظه بلندمدت.",
    accentColor: "var(--lp-secondary, #8b5cf6)",
    accentBg: "rgba(139, 92, 246, 0.1)",
    hoverBorder: "rgba(139, 92, 246, 0.3)",
  },
  {
    icon: "quiz",
    iconFill: true,
    title: "سنجش دقیق",
    description:
      "آزمون‌های دوره‌ای و شبیه‌سازی شرایط واقعی برای ارزیابی میزان تسلط بر مباحث مختلف.",
    accentColor: "var(--lp-tertiary, #005e3f)",
    accentBg: "rgba(0, 94, 63, 0.1)",
    hoverBorder: "rgba(0, 94, 63, 0.3)",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export function FeatureCards() {
  return (
    <section
      id="benefits"
      className="py-24"
      style={{ backgroundColor: "var(--lp-surface-bright, #f8f9ff)" }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2
            className="font-headline text-3xl md:text-4xl font-bold mb-4"
            style={{ color: "var(--lp-on-surface, #0b1c30)" }}
          >
            آوانا چیست؟
          </h2>
          <p
            className="text-base md:text-lg max-w-2xl mx-auto"
            style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
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
          viewport={{ once: true, margin: "-80px" }}
          className="flex flex-wrap justify-center gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              whileHover={{
                y: -8,
                boxShadow: "0px 12px 32px rgba(15, 118, 110, 0.08)",
              }}
              className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] rounded-2xl p-8 soft-shadow flex flex-col items-start text-right group cursor-default transition-all duration-300"
              style={{
                backgroundColor: "var(--lp-surface, #f8f9ff)",
                border: "1px solid rgba(189, 201, 198, 0.2)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = feature.hoverBorder;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor =
                  "rgba(189, 201, 198, 0.2)";
              }}
            >
              {/* Icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-300"
                style={{
                  backgroundColor: feature.accentBg,
                  color: feature.accentColor,
                }}
              >
                <span
                  className="material-symbols-outlined text-3xl"
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
                className="font-semibold text-lg mb-3 transition-colors"
                style={{ color: "var(--lp-on-surface, #0b1c30)" }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p
                className="leading-relaxed text-sm"
                style={{
                  color: "var(--lp-on-surface-variant, #3e4947)",
                }}
              >
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
