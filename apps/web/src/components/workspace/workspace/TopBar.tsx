import { motion } from "framer-motion";
import { Moon, Sun, Bell, Search, Flame, Clock, Settings } from "lucide-react";

interface TopBarProps {
  isDark: boolean;
  onToggleDark: () => void;
  courseData: {
    examDate: string;
    remainingDays: number;
    studyStreak: number;
    totalLessons: number;
    completedLessons: number;
  };
}

export function TopBar({ isDark, onToggleDark, courseData }: TopBarProps) {
  const progressPercent = Math.round(
    (courseData.completedLessons / courseData.totalLessons) * 100,
  );

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-50">
      {/* Left - Progress Info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30"
          >
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
              {courseData.studyStreak} day streak
            </span>
          </motion.div>

          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Clock className="w-4 h-4" />
            <span>{courseData.remainingDays} days until exam</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-muted)]">
            Progress
          </span>
          <div className="w-32 h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
            />
          </div>
          <span className="text-sm font-medium">{progressPercent}%</span>
        </div>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors relative">
          <Search className="w-5 h-5 text-[var(--text-muted)]" />
        </button>

        <button className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors relative">
          <Bell className="w-5 h-5 text-[var(--text-muted)]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        </button>

        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <button className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors">
          <Settings className="w-5 h-5 text-[var(--text-muted)]" />
        </button>

        {/* User Avatar */}
        <button className="ml-2 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
          SP
        </button>
      </div>
    </header>
  );
}
