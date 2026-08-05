import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Target, BookOpen, Gauge } from "lucide-react";

interface StepCompleteProps {
  onNext: () => void;
}

export function StepComplete({ onNext }: StepCompleteProps) {
  return (
    <div className="space-y-8">
      {/* Celebration */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.8 }}
        className="text-center space-y-6"
      >
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-7xl"
        >
          ✨
        </motion.div>

        <div>
          <h2 className="text-3xl font-bold mb-3">Great!</h2>
          <p className="text-xl text-[var(--color-text-muted)]">
            We'll build a personalized study plan for you.
          </p>
        </div>
      </motion.div>

      {/* Preview Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-2xl p-6 text-white shadow-2xl shadow-purple-500/25"
      >
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">Your Study Plan</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4 bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Course</p>
              <p className="text-white/80 text-sm">
                Personalized study materials ready
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Goal</p>
              <p className="text-white/80 text-sm">
                Exam preparation optimized
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Confidence Level</p>
              <p className="text-white/80 text-sm">
                Adaptive learning path selected
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Continue Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        whileHover={{
          scale: 1.02,
          boxShadow: "0 20px 40px -15px rgba(99, 102, 241, 0.5)",
        }}
        whileTap={{ scale: 0.98 }}
        onClick={onNext}
        className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/25"
      >
        Let's Get Started
        <ArrowRight className="w-6 h-6" />
      </motion.button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Upload your first lecture to begin studying
      </p>
    </div>
  );
}
