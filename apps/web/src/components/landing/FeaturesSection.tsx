/**
 * Problem section — "چرا روش‌های سنتی پاسخگو نیستند؟"
 *
 * Full-width 100% edge-to-edge ambient background with centered responsive content.
 * Highlights the 4 core challenges in traditional medical studies with glassmorphic cards.
 */

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

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
      className="snap-section relative w-full py-10 lg:py-0 lg:h-[calc(100dvh-80px)] lg:min-h-[calc(100dvh-80px)] flex flex-col justify-center overflow-hidden text-right border-y border-white/5 bg-[#0d1527]/60 backdrop-blur-md scroll-mt-20"
      aria-label="بخش بررسی چالش‌های روش‌های سنتی مطالعه"
    >
      {/* 100% Full-Width Atmospheric Ambient Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.08),_transparent_70%)] pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-rose-900/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -z-10" />
      <div className="absolute bottom-10 right-0 w-[500px] h-[500px] bg-teal-900/15 rounded-full blur-3xl pointer-events-none translate-x-1/2 -z-10" />

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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border mb-4 bg-rose-950/50 text-rose-300 border-rose-500/30 shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>چالش واقعی دانشجو</span>
            </div>

            <h2 className="font-headline text-3xl sm:text-4xl font-black mb-4 text-white leading-tight">
              چرا روش‌های سنتی <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-rose-400 via-amber-300 to-rose-300">
                پاسخگو نیستند؟
              </span>
            </h2>

            <p className="text-sm sm:text-base leading-relaxed text-slate-300">
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
                whileHover={{ y: -4, borderColor: "rgba(244, 63, 94, 0.4)" }}
                className="flex items-start gap-4 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-rose-950/30 border border-rose-500/20 backdrop-blur-md shadow-lg transition-all duration-300 cursor-default hover:shadow-rose-950/20"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400 shadow-inner">
                  <span className="material-symbols-outlined text-2xl">{problem.icon}</span>
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg mb-1.5 text-white">{problem.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{problem.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
