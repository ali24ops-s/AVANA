import { motion } from "framer-motion";
import { Upload, Sparkles, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Upload your lecture",
    description: "Drag & drop your PDF slides. We support all common formats.",
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    icon: Sparkles,
    title: "AI builds everything",
    description:
      "Lessons, flashcards, quizzes, and summaries — created automatically.",
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    icon: ShieldCheck,
    title: "Study with confidence",
    description: "Track progress, get AI mentoring, and feel exam-ready.",
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export function FeatureCards() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid md:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              whileHover={{
                y: -5,
                boxShadow: "0 20px 40px -20px rgba(0,0,0,0.1)",
              }}
              className="group bg-[var(--color-surface)] rounded-2xl p-8 border border-[var(--color-border)] hover:border-transparent transition-all duration-300"
            >
              <div
                className={`w-14 h-14 rounded-2xl ${feature.bgColor} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon
                  className={`w-7 h-7 bg-gradient-to-r ${feature.color} bg-clip-text`}
                  style={{
                    color: feature.color.includes("blue")
                      ? "#3b82f6"
                      : feature.color.includes("purple")
                        ? "#a855f7"
                        : "#22c55e",
                  }}
                />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
