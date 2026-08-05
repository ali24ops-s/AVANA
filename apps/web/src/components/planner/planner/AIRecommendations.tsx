import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";

const recommendations = [
  {
    type: "warning",
    icon: AlertTriangle,
    title: "Focus Area Identified",
    message:
      "Drug classifications is your weakest topic (62% accuracy). I've added extra review sessions on Day 5 and Day 9.",
    color: "text-amber-500",
    bgColor:
      "bg-amber-50 dark:bg-amber-900/20 border-amber-200/50 dark:border-amber-800/30",
  },
  {
    type: "suggestion",
    icon: Lightbulb,
    title: "Smart Suggestion",
    message:
      "Spend 10 extra minutes on autonomic nervous system drugs before continuing to Chapter 4.",
    color: "text-blue-500",
    bgColor:
      "bg-blue-50 dark:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/30",
  },
  {
    type: "tip",
    icon: Sparkles,
    title: "Study Hack",
    message:
      "Review flashcards within 24 hours of learning a topic for 90% better retention (spaced repetition).",
    color: "text-purple-500",
    bgColor:
      "bg-purple-50 dark:bg-purple-900/20 border-purple-200/50 dark:border-purple-800/30",
  },
  {
    type: "prediction",
    icon: TrendingUp,
    title: "Your Path Forward",
    message:
      "Based on your pace, you're ahead by 0.5 days. Keep it up! Buffer time for final review is secured.",
    color: "text-emerald-500",
    bgColor:
      "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30",
  },
];

export function AIRecommendations() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6"
    >
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        AI Recommendations
      </h3>

      <div className="space-y-3">
        {recommendations.map((rec, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className={`p-4 rounded-xl border ${rec.bgColor}`}
          >
            <div className="flex items-start gap-3">
              <rec.icon
                className={`w-5 h-5 mt-0.5 flex-shrink-0 ${rec.color}`}
              />
              <div>
                <p className="font-medium text-sm mb-1">{rec.title}</p>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {rec.message}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Message */}
      <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-pink-950/30">
        <p className="text-xs text-center italic text-[var(--color-text-muted)]">
          💡 Your AI mentor is analyzing patterns to optimize your study plan
          continuously.
        </p>
      </div>
    </motion.div>
  );
}
