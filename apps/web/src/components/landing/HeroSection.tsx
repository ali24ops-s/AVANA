import { motion } from "framer-motion";
import { Play, ArrowRight, Sparkles } from "lucide-react";

interface HeroSectionProps {
  onStartStudying: () => void;
}

export function HeroSection({ onStartStudying }: HeroSectionProps) {
  return (
    <section className="pt-32 pb-20 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-8"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" />
              AI-Powered Study Mentor
            </motion.div>

            {/* Headline */}
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              Study Smarter.
              <br />
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 bg-clip-text text-transparent">
                Stress Less.
              </span>
              <br />
              Ace Your Pharmacy Exams.
            </h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl text-[var(--color-text-muted)] leading-relaxed max-w-lg"
            >
              Upload your lecture slides once. Get AI explanations, flashcards,
              quizzes, summaries and a complete study workspace automatically.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-4"
            >
              <motion.button
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 20px 40px -15px rgba(99, 102, 241, 0.5)",
                }}
                whileTap={{ scale: 0.98 }}
                onClick={onStartStudying}
                className="group px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-lg flex items-center gap-3 shadow-xl shadow-indigo-500/25"
              >
                Start Studying
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl font-semibold text-lg flex items-center gap-3 hover:border-[var(--color-text-muted)] transition-colors"
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </motion.button>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-4 pt-4"
            >
              <div className="flex -space-x-3">
                {["Sarah", "Mike", "Emma", "David"].map((name) => (
                  <div
                    key={name}
                    className="w-10 h-10 rounded-full border-2 border-[var(--color-background)] overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold"
                  >
                    {name[0]}
                  </div>
                ))}
              </div>
              <div className="text-sm">
                <p className="font-semibold">2,847+ pharmacy students</p>
                <p className="text-[var(--color-text-muted)]">
                  already studying smarter
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right - Illustration / Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="relative"
          >
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-500/20 rounded-3xl blur-3xl" />

            {/* Main Card */}
            <div className="relative bg-[var(--color-surface)] rounded-3xl shadow-2xl shadow-black/10 border border-[var(--color-border)] p-6 space-y-5">
              {/* Header bar */}
              <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">
                      Pharmacology - Week 12
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Cardiovascular Drugs
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                  Exam Ready ✓
                </div>
              </div>

              {/* Progress Overview */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    label: "Lessons",
                    value: "24",
                    color: "from-blue-500 to-cyan-500",
                  },
                  {
                    label: "Flashcards",
                    value: "156",
                    color: "from-orange-500 to-yellow-500",
                  },
                  {
                    label: "Quizzes",
                    value: "8",
                    color: "from-purple-500 to-pink-500",
                  },
                  {
                    label: "Progress",
                    value: "78%",
                    color: "from-green-500 to-emerald-500",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-[var(--color-background)] rounded-xl p-3 text-center"
                  >
                    <p
                      className={`text-lg font-bold bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}
                    >
                      {item.value}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* AI Lesson Preview */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <span className="font-medium text-sm">
                    AI-Generated Summary
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  <strong className="text-[var(--color-text)]">
                    Beta-blockers
                  </strong>{" "}
                  reduce heart rate and cardiac output by blocking β-adrenergic
                  receptors. Used for hypertension, angina, and arrhythmias...
                </p>
              </div>

              {/* Flashcard Preview */}
              <div className="bg-[var(--color-background)] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-sm">Quick Flashcard</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    42 of 156
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
                  <p className="text-sm font-medium mb-2">
                    What is the mechanism of action of ACE inhibitors?
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Inhibit conversion of Angiotensin I → II → ↓
                    vasoconstriction, ↓ aldosterone
                  </p>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">Quiz Complete!</p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    92% Score
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1,
              }}
              className="absolute -bottom-4 -left-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <span className="text-white text-lg">🔥</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">7 Day Streak!</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Keep it up!
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
