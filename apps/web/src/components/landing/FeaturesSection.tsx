/**
 * Problem section — "چرا روش‌های سنتی پاسخگو نیستند؟"
 *
 * Full-width 100% edge-to-edge ambient background with centered responsive content.
 * Highlights the 4 core challenges in traditional medical studies with glassmorphic cards.
 */

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@avana/ui";

interface ProblemCard {
  icon: string;
  title: string;
  description: string;
}

const problems: ProblemCard[] = [
  {
    icon: "library_books",
    title: "حجم وحشتناک مطالب",
    description: "گم شدن در میان صدها صفحه جزوه و کتاب بدون ساختار.",
  },
  {
    icon: "memory",
    title: "فراموشی سریع",
    description: "منحنی فراموشی ابینگهاوس و از دست رفتن تلاش‌ها.",
  },
  {
    icon: "schedule",
    title: "ندانستن زمان مرور",
    description: "مرورهای بی‌برنامه و غیربهینه که زمان زیادی می‌گیرد.",
  },
  {
    icon: "monitoring",
    title: "عدم تحلیل پیشرفت",
    description: "نداشتن دید واضح نسبت به نقاط ضعف و قوت.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="snap-section relative w-full py-10 lg:py-0 lg:h-[calc(100dvh-80px)] lg:min-h-[calc(100dvh-80px)] flex flex-col justify-center overflow-hidden text-right border-y border-[var(--avana-border-default)] bg-white scroll-mt-20"
      aria-label="بخش بررسی چالش‌های روش‌های سنتی مطالعه"
    >
      {/* Centered Content Container */}
      <div className="max-w-[1280px] w-full mx-auto px-6">
        {/* Section Header & 4 Cards Grid */}
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          {/* Text Block */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:w-1/3"
          >
            <div className="mb-4 w-max">
              <Badge
                variant="error"
                size="md"
                icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                className="px-3.5 py-1.5 shadow-xs"
              >
                چالش واقعی دانشجو
              </Badge>
            </div>

            <h2 className="font-headline text-3xl sm:text-4xl font-black mb-4 text-[var(--avana-text-primary)] leading-tight">
              چرا روش‌های سنتی <br />
              <span className="text-rose-600">
                پاسخگو نیستند؟
              </span>
            </h2>

            <p className="text-sm sm:text-base leading-relaxed text-[var(--avana-text-secondary)]">
              حجم بالای مطالب پزشکی نیازمند رویکردی سیستماتیک است که روش‌های سنتی فاقد آن هستند.
            </p>
          </motion.div>

          {/* 4 Problem Cards Grid */}
          <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full">
            {problems.map((problem, i) => (
              <motion.div
                key={problem.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -2 }}
                className="flex items-start gap-4 p-5 sm:p-6 rounded-[16px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] shadow-xs transition-all duration-200 cursor-default hover:bg-white hover:border-rose-300 hover:shadow-card"
              >
                <div className="w-12 h-12 rounded-[10px] bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0 text-rose-600 shadow-xs">
                  <span className="material-symbols-outlined text-2xl">{problem.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg mb-1.5 text-[var(--avana-text-primary)]">{problem.title}</h3>
                  <p className="text-xs sm:text-sm text-[var(--avana-text-secondary)] leading-relaxed">{problem.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
