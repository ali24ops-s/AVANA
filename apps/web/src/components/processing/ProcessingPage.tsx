import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Moon,
  Sun,
  Sparkles,
  BookOpen,
  Layers,
  Brain,
  CheckCircle2,
  HelpCircle,
  FileText,
  Target,
  Zap,
  ArrowRight,
  Trophy,
  BarChart3,
  Star,
  Clock,
} from "lucide-react";

interface ProcessingPageProps {
  isDark: boolean;
  onToggleDark: () => void;
  onStartWorkspace?: () => void;
}

const processingSteps = [
  { id: 1, text: "Reading your lecture", icon: BookOpen },
  { id: 2, text: "Extracting chapters", icon: FileText },
  { id: 3, text: "Understanding concepts", icon: Brain },
  { id: 4, text: "Building study roadmap", icon: Target },
  { id: 5, text: "Generating explanations", icon: Sparkles },
  { id: 6, text: "Creating flashcards", icon: Layers },
  { id: 7, text: "Creating quizzes", icon: HelpCircle },
  { id: 8, text: "Building exam summary", icon: BarChart3 },
  { id: 9, text: "Preparing your study workspace", icon: Zap },
];

const motivationalMessages = [
  "Almost done...",
  "We're organizing your lecture.",
  "Your flashcards are ready!",
  "Preparing your personal study mentor...",
  "Making sure everything is perfect...",
  "Just a few more seconds...",
];

const liveStats = {
  course: "Pharmacology",
  detectedChapters: 15,
  estimatedStudyTime: "5h 30m",
  flashcards: 214,
  quizQuestions: 68,
  keyConcepts: 92,
  difficulty: 4 as const,
};

export function ProcessingPage({
  isDark,
  onToggleDark,
  onStartWorkspace,
}: ProcessingPageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  // Animate through processing steps
  useEffect(() => {
    if (isComplete) return;

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= processingSteps.length - 1) {
          clearInterval(stepInterval);
          setTimeout(() => setIsComplete(true), 500);
          return prev;
        }
        return prev + 1;
      });
    }, 800); // Each step takes ~800ms

    return () => clearInterval(stepInterval);
  }, [isComplete]);

  // Rotate motivational messages
  useEffect(() => {
    if (isComplete) return;

    const messageInterval = setInterval(() => {
      setCurrentMessageIndex(
        (prev) => (prev + 1) % motivationalMessages.length,
      );
    }, 2500);

    return () => clearInterval(messageInterval);
  }, [isComplete]);

  const progressPercent = Math.round(
    ((currentStep + (isComplete ? 0 : 0.5)) / processingSteps.length) * 100,
  );

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold">AVANA</span>

          {/* Progress badge */}
          <div
            className={`ml-4 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
              isComplete
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
            }`}
          >
            {isComplete ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Complete
              </>
            ) : (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                />
                Processing...
              </>
            )}
          </div>
        </div>

        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </motion.header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {!isComplete ? (
          /* Processing State */
          <AnimatePresence mode="wait">
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid lg:grid-cols-5 gap-8 items-start"
            >
              {/* Left Column - Progress Checklist (3 cols) */}
              <div className="lg:col-span-3 space-y-6">
                {/* Progress Header */}
                <div className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">
                      AI is working its magic
                    </h2>
                    <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {progressPercent}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-3 bg-[var(--color-background)] rounded-full overflow-hidden mb-6">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>

                  {/* Motivational message */}
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentMessageIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-sm text-[var(--color-text-muted)] italic"
                    >
                      ✨ {motivationalMessages[currentMessageIndex]}
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* Checklist */}
                <div className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-border)] space-y-1">
                  {processingSteps.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{
                        opacity: index <= currentStep ? 1 : 0.4,
                        x: 0,
                      }}
                      transition={{
                        delay: Math.max(0, (index - currentStep) * 0.1),
                        duration: 0.3,
                      }}
                      className={`flex items-center gap-4 py-3 px-4 rounded-xl transition-colors ${
                        index === currentStep && !isComplete
                          ? "bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800"
                          : index < currentStep
                            ? ""
                            : ""
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          index < currentStep
                            ? "bg-gradient-to-br from-green-400 to-emerald-500"
                            : index === currentStep
                              ? "bg-gradient-to-br from-indigo-500 to-purple-500"
                              : "bg-[var(--color-background)]"
                        }`}
                      >
                        {index < currentStep ? (
                          <CheckCircle2
                            className="w-5 h-5 text-white"
                            strokeWidth={2.5}
                          />
                        ) : index === currentStep ? (
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                              rotate: [0, 180, 360],
                            }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <step.icon className="w-5 h-5 text-white" />
                          </motion.div>
                        ) : (
                          <step.icon className="w-5 h-5 text-[var(--color-text-muted)]" />
                        )}
                      </div>

                      <span
                        className={`font-medium ${
                          index <= currentStep
                            ? "text-[var(--color-text)]"
                            : "text-[var(--color-text-muted)]"
                        }`}
                      >
                        {step.text}
                      </span>

                      {index < currentStep && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium"
                        >
                          Done
                        </motion.span>
                      )}

                      {index === currentStep && !isComplete && (
                        <motion.div
                          className="ml-auto flex gap-1"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          {[...Array(3)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{
                                duration: 0.6,
                                repeat: Infinity,
                                delay: i * 0.15,
                              }}
                              className="w-1.5 h-1.5 rounded-full bg-indigo-500"
                            />
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Estimated time remaining */}
                <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
                  <Clock className="w-4 h-4" />
                  <span>
                    Estimated time remaining: ~
                    {Math.max(10, processingSteps.length - currentStep)} seconds
                  </span>
                </div>
              </div>

              {/* Right Column - Live Preview (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Live Stats Card */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 rounded-2xl p-6 text-white shadow-2xl shadow-indigo-900/20"
                >
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-medium text-white/80">
                      Live Preview
                    </span>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        label: "Course",
                        value: liveStats.course,
                        icon: BookOpen,
                      },
                      {
                        label: "Detected Chapters",
                        value: `${liveStats.detectedChapters}`,
                        icon: FileText,
                      },
                      {
                        label: "Study Time Estimate",
                        value: liveStats.estimatedStudyTime,
                        icon: Clock,
                      },
                      {
                        label: "Flashcards Created",
                        value: `${Math.min(liveStats.flashcards, Math.floor((currentStep / processingSteps.length) * liveStats.flashcards * 1.2))}`,
                        icon: Layers,
                      },
                      {
                        label: "Quiz Questions Ready",
                        value: `${Math.min(liveStats.quizQuestions, Math.ceil((currentStep / processingSteps.length) * liveStats.quizQuestions * 1.1))}`,
                        icon: HelpCircle,
                      },
                      {
                        label: "Key Concepts Found",
                        value: `${Math.min(liveStats.keyConcepts, Math.floor((currentStep / processingSteps.length) * liveStats.keyConcepts * 1.15))}`,
                        icon: Brain,
                      },
                    ].map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + index * 0.08 }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <stat.icon className="w-4 h-4 text-white/60" />
                          <span className="text-sm text-white/70">
                            {stat.label}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {stat.value}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Difficulty Rating */}
                  <div className="mt-6 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">
                        Difficulty Level
                      </span>
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${i < liveStats.difficulty ? "fill-yellow-400 text-yellow-400" : "text-white/20"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Mini Activity Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-border)]"
                >
                  <p className="text-sm font-medium mb-3">Current Activity</p>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center">
                          {(() => {
                            const Icon =
                              processingSteps[currentStep]?.icon || Sparkles;
                            return (
                              <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            );
                          })()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {processingSteps[currentStep]?.text}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Processing...
                          </p>
                        </div>
                      </div>

                      {/* Mini progress for current task */}
                      <div className="h-1.5 bg-[var(--color-background)] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                          animate={{ width: ["30%", "70%", "90%", "30%"] }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          /* Completion State */
          <AnimatePresence mode="wait">
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto text-center space-y-8"
            >
              {/* Celebration Animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="relative inline-block"
              >
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 rounded-full blur-3xl opacity-30 animate-pulse" />

                <motion.div
                  animate={{
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative w-28 h-28 mx-auto rounded-3xl bg-gradient-to-br from-yellow-400 via-orange-400 to-pink-400 flex items-center justify-center shadow-2xl shadow-orange-400/30"
                >
                  <Trophy className="w-14 h-14 text-white drop-shadow-lg" />
                </motion.div>
              </motion.div>

              {/* Success Message */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-3"
              >
                <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                  Your Study Workspace is{" "}
                  <span className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                    Ready!
                  </span>
                </h1>
                <p className="text-xl text-[var(--color-text-muted)] max-w-md mx-auto">
                  We've created {liveStats.flashcards} flashcards,{" "}
                  {liveStats.quizQuestions} quizzes, and identified{" "}
                  {liveStats.keyConcepts} key concepts.
                </p>
              </motion.div>

              {/* Stats Summary */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-3 gap-4 max-w-lg mx-auto"
              >
                {[
                  {
                    label: "Flashcards",
                    value: liveStats.flashcards,
                    color: "from-orange-400 to-yellow-400",
                  },
                  {
                    label: "Quizzes",
                    value: liveStats.quizQuestions,
                    color: "from-purple-400 to-pink-400",
                  },
                  {
                    label: "Key Concepts",
                    value: liveStats.keyConcepts,
                    color: "from-cyan-400 to-teal-400",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)]"
                  >
                    <p
                      className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}
                    >
                      {stat.value}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4 pt-4"
              >
                <motion.button
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.4)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onStartWorkspace}
                  className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25"
                >
                  <Sparkles className="w-5 h-5" />
                  Start Studying
                  <ArrowRight className="w-5 h-5" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 hover:border-[var(--color-text-muted)] transition-colors"
                >
                  View Dashboard
                </motion.button>
              </motion.div>

              {/* Helpful tip */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-sm text-[var(--color-text-muted)]"
              >
                💡 Tip: Upload more lectures to build your complete study
                library
              </motion.p>
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Floating particles celebration when complete */}
      <AnimatePresence>
        {isComplete && (
          <>
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  opacity: 1,
                  scale: 0,
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                }}
                animate={{
                  opacity: [1, 0],
                  scale: [0, 1, 0.5],
                  x: window.innerWidth / 2 + (Math.random() - 0.5) * 800,
                  y: window.innerHeight / 2 + (Math.random() - 0.5) * 800,
                }}
                transition={{
                  duration: 1.5 + Math.random(),
                  delay: i * 0.05,
                  ease: "easeOut",
                }}
                className="fixed w-3 h-3 rounded-full pointer-events-none z-50"
                style={{
                  backgroundColor: [
                    "#f59e0b",
                    "#ec4899",
                    "#8b5cf6",
                    "#06b6d4",
                    "#22c55e",
                  ][i % 5],
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
