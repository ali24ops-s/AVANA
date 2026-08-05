import { motion } from "framer-motion";
import { Layers, HelpCircle, Trophy, Target, Flame } from "lucide-react";

interface ProgressDashboardProps {
  completedSessions: Set<string>;
  planData: {
    totalChapters: number;
    estimatedTotalTime: string;
    currentConfidence: number;
  };
}

export function ProgressDashboard({
  completedSessions,
  planData,
}: ProgressDashboardProps) {
  // Calculate progress metrics
  const totalPossibleSessions = planData.totalChapters * 2;
  const sessionProgress = Math.min(
    100,
    Math.round((completedSessions.size / totalPossibleSessions) * 100),
  );
  const flashcardsMastered = Math.floor(completedSessions.size * 17);
  const averageQuizScore = 82 + completedSessions.size * 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6"
    >
      <h3 className="font-bold mb-5 flex items-center gap-2">
        <Target className="w-5 h-5 text-indigo-500" />
        Overall Progress
      </h3>

      {/* Circular Progress - Main */}
      <div className="relative w-40 h-40 mx-auto mb-6">
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="8"
          />

          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={264}
            initial={{ strokeDashoffset: 264 }}
            animate={{ strokeDashoffset: 264 - (264 * sessionProgress) / 100 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />

          <defs>
            <linearGradient
              id="progressGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold">{sessionProgress}%</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            Complete
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="space-y-3">
        {[
          {
            icon: Layers,
            label: "Flashcards Mastered",
            value: `${flashcardsMastered}`,
            color: "text-orange-500",
            bgColor: "bg-orange-100 dark:bg-orange-900/30",
          },
          {
            icon: HelpCircle,
            label: "Quiz Average",
            value: `${Math.min(averageQuizScore, 98)}%`,
            color: "text-purple-500",
            bgColor: "bg-purple-100 dark:bg-purple-900/30",
          },
          {
            icon: Trophy,
            label: "Topics Covered",
            value: `${Math.min(completedSessions.size * 2, planData.totalChapters)} / ${planData.totalChapters}`,
            color: "text-emerald-500",
            bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
          },
          {
            icon: Flame,
            label: "Study Streak",
            value: "7 days",
            color: "text-red-500",
            bgColor: "bg-red-100 dark:bg-red-900/30",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-background)]"
          >
            <div
              className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}
            >
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[var(--color-text-muted)]">
                {stat.label}
              </p>
              <p className="font-semibold text-sm">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
