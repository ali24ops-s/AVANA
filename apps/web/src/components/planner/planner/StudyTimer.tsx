import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, RotateCcw, Coffee } from "lucide-react";

interface StudyTimerProps {
  onClose: () => void;
}

const breakMessages = [
  "☕ Time for a quick stretch!",
  "💪 You're making great progress!",
  "🧠 Your brain needs this rest.",
  "🎯 Ready to tackle the next session?",
];

export function StudyTimer({ onClose }: StudyTimerProps) {
  const [mode, setMode] = useState<"work" | "break">("work");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);
  const [breakMessage, setBreakMessage] = useState(breakMessages[0]);

  useEffect(() => {
    if (!isRunning || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0) {
      setIsRunning(false);

      setTimeout(() => {
        if (mode === "work") {
          setCompletedPomodoros((prev) => prev + 1);
          setMode("break");
          setTimeLeft(
            completedPomodoros > 0 && (completedPomodoros + 1) % 4 === 0
              ? 15 * 60
              : 5 * 60,
          );
          setBreakMessage(
            breakMessages[Math.floor(Math.random() * breakMessages.length)],
          );
        } else {
          setMode("work");
          setTimeLeft(25 * 60);
        }
      }, 1000);
    }
  }, [timeLeft, mode, completedPomodoros]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const reset = () => {
    setIsRunning(false);
    setMode("work");
    setTimeLeft(25 * 60);
  };

  const workTime = 25 * 60;
  const breakTime = 5 * 60;
  const currentTotal = mode === "work" ? workTime : breakTime;
  const progressPercent = ((currentTotal - timeLeft) / currentTotal) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center p-8"
    >
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
      >
        <X className="w-6 h-6" />
      </motion.button>

      <div className="text-center max-w-md w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8 ${
              mode === "work"
                ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {mode === "work" ? (
              <>
                <Play className="w-4 h-4" />
                Focus Session
              </>
            ) : (
              <>
                <Coffee className="w-4 h-4" />
                Break Time
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Timer */}
        <div className="relative w-64 h-64 mx-auto mb-10">
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full transform -rotate-90"
          >
            <circle
              cx="100"
              cy="100"
              r="85"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="12"
            />

            <motion.circle
              cx="100"
              cy="100"
              r="85"
              fill="none"
              stroke={mode === "work" ? "#6366f1" : "#22c55e"}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={534}
              style={{ strokeDashoffset: 534 - (534 * progressPercent) / 100 }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`font-mono text-6xl font-bold ${
                mode === "work"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {formatTime(timeLeft)}
            </span>
            <span className="text-sm text-[var(--color-text-muted)] mt-2">
              {mode === "work" ? "Focus Time" : "Break"}
            </span>
          </div>
        </div>

        {mode === "break" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-lg text-emerald-600 dark:text-emerald-400 mb-8 italic"
          >
            {breakMessage}
          </motion.p>
        )}

        <div className="flex items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={reset}
            className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            <RotateCcw className="w-6 h-6" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsRunning(!isRunning)}
            className={`p-6 rounded-2xl font-semibold text-white shadow-lg ${
              isRunning
                ? "bg-orange-500 hover:bg-orange-400 shadow-orange-500/25"
                : mode === "work"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-xl hover:shadow-indigo-500/30"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-xl hover:shadow-emerald-500/30"
            }`}
          >
            {isRunning ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </motion.button>

          {completedPomodoros > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-4 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <p className="text-sm">
                <span className="font-bold text-indigo-600">
                  {completedPomodoros}
                </span>{" "}
                done
              </p>
            </motion.div>
          )}
        </div>

        {/* Pomodoro dots */}
        <div className="flex items-center gap-2 mt-8">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i < completedPomodoros
                  ? mode === "work" && i === completedPomodoros % 4 && isRunning
                    ? "bg-indigo-500 animate-pulse"
                    : "bg-indigo-500"
                  : "bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          {completedPomodoros >= 4
            ? "🌟 Take a long break! (15 min)"
            : `4 pomodoros = long break`}
        </p>
      </div>
    </motion.div>
  );
}
