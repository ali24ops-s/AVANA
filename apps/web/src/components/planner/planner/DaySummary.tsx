import { motion } from "framer-motion";
import {
  X,
  Trophy,
  Target,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Flame,
} from "lucide-react";

interface DaySummaryProps {
  onClose: () => void;
  planData: {
    course: string;
    predictedReadiness: number;
  };
  sessionsCompleted: number;
}

export function DaySummary({
  onClose,
  planData,
  sessionsCompleted,
}: DaySummaryProps) {
  const tomorrowGoals = [
    "Complete Chapter 5 learning session",
    "Review 30 flashcards",
    "Take a quick quiz",
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[var(--color-surface)] rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-[var(--color-border)]"
      >
        {/* Header */}
        <div className="h-3 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--color-background)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {/* Celebration */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.1, stiffness: 200 }}
            className="text-center mb-6"
          >
            <span className="text-6xl block mb-4">🎉</span>
            <h2 className="text-2xl font-bold mb-2">Amazing Work Today!</h2>
            <p className="text-[var(--color-text-muted)]">
              You completed all your study sessions for today in{" "}
              {planData.course}.
            </p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20"
            >
              <Flame className="w-6 h-6 mx-auto text-orange-500 mb-2" />
              <p className="text-2xl font-bold">{sessionsCompleted}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Sessions Done
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20"
            >
              <ClockIcon className="w-6 h-6 mx-auto text-blue-500 mb-2" />
              <p className="text-2xl font-bold">70m</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Time Studied
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20"
            >
              <TrendingUp className="w-6 h-6 mx-auto text-purple-500 mb-2" />
              <p className="text-2xl font-bold">+8%</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Readiness Gain
              </p>
            </motion.div>
          </div>

          {/* Readiness Comparison */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50 rounded-xl p-4 mb-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Predicted Exam Score</span>
              <Trophy className="w-4 h-4 text-yellow-500" />
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm text-[var(--color-text-muted)]">
                    Yesterday
                  </span>
                  <span className="text-lg font-semibold">48%</span>
                </div>
                <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden w-24">
                  <div
                    className="h-full bg-orange-400 rounded-full"
                    style={{ width: "48%" }}
                  />
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-emerald-500 mb-4" />

              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Today
                  </span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    61%
                  </span>
                </div>
                <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                    style={{ width: "61%" }}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-[var(--color-text-muted)] text-center">
              🎯 Keep this pace to reach <strong>85%+</strong> exam readiness!
            </p>
          </motion.div>

          {/* Tomorrow's Goals */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-3 mb-6"
          >
            <p className="font-medium text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Tomorrow's Goals (AI Recommended)
            </p>

            {tomorrowGoals.map((goal, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-background)]"
              >
                <Target
                  className={`w-5 h-5 ${i === 0 ? "text-indigo-500" : i === 1 ? "text-orange-500" : "text-purple-500"}`}
                />
                <span className="text-sm flex-1">{goal}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-medium">
                  {i === 0 ? "25 min" : i === 1 ? "15 min" : "10 min"}
                </span>
              </div>
            ))}
          </motion.div>

          {/* CTA Button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onClose}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            Continue to Study Plan
            <ArrowRight className="w-5 h-5" />
          </motion.button>

          <p className="text-center text-xs text-[var(--color-text-muted)] mt-3">
            💡 Your AI mentor will adjust tomorrow's plan based on today's
            performance.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Helper icon component
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
