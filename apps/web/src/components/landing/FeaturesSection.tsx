import { motion } from "framer-motion";
import {
  BookOpen,
  Layers,
  HelpCircle,
  FileText,
  TrendingUp,
  MessageCircle,
} from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "AI Lessons",
    description:
      "Complex pharmacy concepts explained in simple, memorable language with visual aids.",
    color: "from-indigo-500 to-blue-500",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  {
    icon: Layers,
    title: "Smart Flashcards",
    description:
      "AI-generated flashcards with spaced repetition for optimal memorization.",
    color: "from-orange-500 to-yellow-500",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    icon: HelpCircle,
    title: "Adaptive Quizzes",
    description:
      "Tests that adapt to your knowledge level and focus on weak areas.",
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    icon: FileText,
    title: "Exam Summaries",
    description: "Concise, exam-focused summaries of entire lecture decks.",
    color: "from-cyan-500 to-teal-500",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  {
    icon: TrendingUp,
    title: "Progress Tracking",
    description:
      "Visual dashboards showing mastery across all topics and subjects.",
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
  },
  {
    icon: MessageCircle,
    title: "AI Mentor Chat",
    description:
      "Ask questions and get instant, accurate pharmacy-specific answers.",
    color: "from-rose-500 to-red-500",
    bgColor: "bg-rose-50 dark:bg-rose-950/30",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-4">
            Everything You Need to Excel
          </h2>
          <p className="text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto">
            A complete study toolkit built specifically for pharmacy students.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{
                scale: 1.02,
                boxShadow: "0 20px 40px -15px rgba(99, 102, 241, 0.15)",
              }}
              className={`group bg-[var(--color-surface)] rounded-2xl p-8 border border-[var(--color-border)] hover:border-transparent transition-all duration-300 cursor-pointer`}
            >
              <div
                className={`w-14 h-14 rounded-2xl ${feature.bgColor} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon
                  className={`w-7 h-7`}
                  style={{
                    color: feature.color.includes("indigo")
                      ? "#6366f1"
                      : feature.color.includes("orange")
                        ? "#f97316"
                        : feature.color.includes("purple")
                          ? "#a855f7"
                          : feature.color.includes("cyan")
                            ? "#06b6d4"
                            : feature.color.includes("green")
                              ? "#22c55e"
                              : "#f43f5e",
                  }}
                />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-[var(--color-text-muted)] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
