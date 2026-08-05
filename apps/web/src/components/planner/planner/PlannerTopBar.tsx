import { motion } from "framer-motion";
import { Moon, Sun, ArrowLeft, Timer, Maximize2 } from "lucide-react";

interface PlannerTopBarProps {
  isDark: boolean;
  onToggleDark: () => void;
  onBack: () => void;
  studyPlan: {
    course: string;
    examDate: Date;
    daysRemaining: number;
    currentConfidence: number;
  };
  onStartTimer: () => void;
  onFocusMode: () => void;
}

export function PlannerTopBar({
  isDark,
  onToggleDark,
  onBack,
  studyPlan,
  onStartTimer,
  onFocusMode,
}: PlannerTopBarProps) {
  return (
    <header className="h-14 flex items-center justify-between px-4 lg:px-6 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      {/* Left */}
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>

        <div className="hidden sm:flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <span className="font-semibold">{studyPlan.course}</span>
        </div>
      </div>

      {/* Center - Mobile only title */}
      <div className="sm:hidden font-medium text-sm truncate max-w-[150px]">
        Study Plan
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStartTimer}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
          title="Study Timer"
        >
          <Timer className="w-5 h-5 text-[var(--text-muted)]" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onFocusMode}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
          title="Focus Mode"
        >
          <Maximize2 className="w-5 h-5 text-[var(--text-muted)]" />
        </motion.button>

        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
