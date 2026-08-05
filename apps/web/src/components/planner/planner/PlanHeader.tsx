import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  Target,
  TrendingUp,
  Sparkles,
  Award,
} from "lucide-react";

interface PlanHeaderProps {
  data: {
    course: string;
    professor: string;
    examDate: Date;
    totalChapters: number;
    estimatedTotalTime: string;
    currentConfidence: number;
    predictedReadiness: number;
    daysRemaining: number;
  };
}

export function PlanHeader({ data }: PlanHeaderProps) {
  const examDateStr = data.examDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Title */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/50 dark:to-purple-950/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-4"
        >
          <Sparkles className="w-4 h-4" />
          AI-Powered Study Plan
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Your Personalized Study Plan
        </h1>
        <p className="text-lg text-[var(--color-text-muted)] max-w-xl mx-auto">
          We've analyzed your lecture and exam schedule. Here's the fastest path
          to success.
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] text-center"
        >
          <Calendar className="w-5 h-5 mx-auto mb-2 text-red-500" />
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            Exam Date
          </p>
          <p className="font-semibold text-sm">{examDateStr}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={`bg-${data.daysRemaining <= 7 ? "red" : "yellow"}-50 dark:bg-${data.daysRemaining <= 7 ? "red" : "yellow"}-950/30 rounded-2xl p-4 border border-[var(--color-border)] text-center`}
          style={{
            backgroundColor:
              data.daysRemaining <= 7 ? "rgba(254, 226, 226, 1)" : undefined,
          }}
        >
          <Clock
            className={`w-5 h-5 mx-auto mb-2 ${data.daysRemaining <= 7 ? "text-red-500" : "text-yellow-600"}`}
          />
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            Days Left
          </p>
          <p
            className={`font-semibold text-sm ${data.daysRemaining <= 7 ? "text-red-600" : ""}`}
          >
            {data.daysRemaining}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] text-center"
        >
          <Target className="w-5 h-5 mx-auto mb-2 text-blue-500" />
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            Study Time
          </p>
          <p className="font-semibold text-sm">{data.estimatedTotalTime}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] text-center"
        >
          <TrendingUp className="w-5 h-5 mx-auto mb-2 text-orange-500" />
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            Confidence
          </p>
          <p className="font-semibold text-sm">{data.currentConfidence}%</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="col-span-2 md:col-span-1 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-2xl p-4 border border-emerald-200/50 dark:border-emerald-800/30 text-center"
        >
          <Award className="w-5 h-5 mx-auto mb-2 text-emerald-500" />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-1">
            Predicted Readiness
          </p>
          <p className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
            {data.predictedReadiness}%
          </p>
        </motion.div>
      </div>

      {/* Motivational Message */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white"
      >
        <div className="flex items-start gap-4">
          <span className="text-3xl">🎯</span>
          <div>
            <h3 className="font-bold text-lg mb-1">
              Your Optimized Path to Success
            </h3>
            <p className="opacity-90 leading-relaxed">
              If you follow this plan consistently, you'll complete the entire
              curriculum
              <strong> one day before your exam</strong>, giving you buffer time
              for final review.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
