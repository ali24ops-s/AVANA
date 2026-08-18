/**
 * Problem section — "چرا روش‌های سنتی پاسخگو نیستند؟"
 *
 * Stitch design: text block on right, 2×2 grid of error-themed problem
 * cards on left. Each card highlights a pain point of traditional study.
 */

import { motion } from "framer-motion";

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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-24"
      style={{ backgroundColor: "var(--lp-surface, #f8f9ff)" }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          {/* Text Block */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:w-1/3 text-right"
          >
            <h2
              className="font-headline text-3xl md:text-4xl font-bold mb-4"
              style={{ color: "var(--lp-on-surface, #0b1c30)" }}
            >
              چرا روش‌های سنتی پاسخگو نیستند؟
            </h2>
            <p
              className="text-base md:text-lg mb-8"
              style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
            >
              حجم بالای مطالب پزشکی نیازمند رویکردی سیستماتیک است که روش‌های
              سنتی فاقد آن هستند.
            </p>
          </motion.div>

          {/* Problem Cards Grid */}
          <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
            {problems.map((problem, i) => (
              <motion.div
                key={problem.title}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                whileHover={{ y: -4, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}
                className="flex items-start gap-4 p-6 rounded-xl transition-all duration-300 cursor-default"
                style={{
                  backgroundColor: "rgba(255, 218, 214, 0.2)",
                  border: "1px solid rgba(186, 26, 26, 0.1)",
                }}
              >
                <div
                  className="mt-1 shrink-0"
                  style={{ color: "var(--lp-error, #ba1a1a)" }}
                >
                  <span className="material-symbols-outlined">
                    {problem.icon}
                  </span>
                </div>
                <div>
                  <h4
                    className="font-semibold mb-1"
                    style={{ color: "var(--lp-on-surface, #0b1c30)" }}
                  >
                    {problem.title}
                  </h4>
                  <p
                    className="text-sm"
                    style={{
                      color: "var(--lp-on-surface-variant, #3e4947)",
                    }}
                  >
                    {problem.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
