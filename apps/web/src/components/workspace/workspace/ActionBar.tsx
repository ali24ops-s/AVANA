import { motion } from "framer-motion";
import { Layers, HelpCircle, Zap, BookOpen, ChevronUp } from "lucide-react";

interface ActionBarProps {
  flashcardOpen: boolean;
  onToggleFlashcards: () => void;
  onStartQuiz: () => void;
  onQuickReview: () => void;
}

export function ActionBar({
  flashcardOpen,
  onToggleFlashcards,
  onStartQuiz,
  onQuickReview,
}: ActionBarProps) {
  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="h-16 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center justify-center px-6 z-40"
    >
      {/* Left - Flashcards */}
      <motion.button
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={onToggleFlashcards}
        className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
          flashcardOpen
            ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-700"
            : "bg-[var(--color-background)] hover:bg-gray-100 dark:hover:bg-slate-800"
        }`}
      >
        <Layers className="w-4 h-4" />
        Review Flashcards
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
          5
        </span>
        {flashcardOpen && <ChevronUp className="w-3.5 h-3.5" />}
      </motion.button>

      {/* Center - Primary Action */}
      <motion.button
        whileHover={{
          scale: 1.02,
          boxShadow: "0 10px 30px -10px rgba(99, 102, 241, 0.4)",
        }}
        whileTap={{ scale: 0.98 }}
        onClick={onStartQuiz}
        className="ml-4 flex items-center gap-2.5 px-8 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-500/25"
      >
        <BookOpen className="w-4 h-4" />
        Continue Studying
      </motion.button>

      {/* Right - Secondary Actions */}
      <div className="ml-6 flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStartQuiz}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-background)] hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl font-medium text-sm transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          Take Quiz
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onQuickReview}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 hover:from-yellow-200 dark:hover:from-yellow-900/50 rounded-xl font-medium text-sm text-yellow-700 dark:text-yellow-400 transition-colors"
        >
          <Zap className="w-4 h-4" />
          10-min Review
        </motion.button>
      </div>
    </motion.div>
  );
}
