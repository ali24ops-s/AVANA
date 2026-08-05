import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, CalendarDays, Zap, ArrowRight, Sparkles } from "lucide-react";

interface StepWelcomeProps {
  data: { examTiming: string };
  onUpdate: (key: "examTiming", value: string) => void;
  onNext: () => void;
}

const options = [
  {
    id: "tomorrow",
    icon: Zap,
    label: "Tomorrow",
    description: "Let's focus on what matters most",
    emoji: "⚡",
  },
  {
    id: "this_week",
    icon: CalendarDays,
    label: "This Week",
    description: "Plenty of time for a solid plan",
    emoji: "📅",
  },
  {
    id: "more_than_one_week",
    icon: Clock,
    label: "More than One Week",
    description: "Perfect! We can build a deep study plan",
    emoji: "🎯",
  },
];

export function StepWelcome({ data, onUpdate, onNext }: StepWelcomeProps) {
  const [selected, setSelected] = useState(data.examTiming);

  const handleSelect = (id: string) => {
    setSelected(id);
    onUpdate("examTiming", id);

    // Auto advance after selection with slight delay
    setTimeout(() => {
      onNext();
    }, 400);
  };

  return (
    <div className="space-y-8">
      {/* Welcome Message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="text-5xl mb-4"
        >
          👋
        </motion.div>
        <h2 className="text-3xl font-bold">Hello!</h2>
        <p className="text-xl text-[var(--color-text-muted)]">
          Welcome to AVANA.
        </p>
        <p className="text-lg text-[var(--color-text-muted)]">
          I'll help you prepare for your exam.
        </p>
      </motion.div>

      {/* Question */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-border)]"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <span className="font-semibold text-lg">When is your exam?</span>
        </div>

        <div className="grid gap-3">
          {options.map((option) => (
            <motion.button
              key={option.id}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleSelect(option.id)}
              className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
                selected === option.id
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-transparent"
              }`}
            >
              <div
                className={`text-3xl ${selected === option.id ? "" : "opacity-60"}`}
              >
                {option.emoji}
              </div>
              <div className="flex-1">
                <p
                  className={`font-semibold ${selected === option.id ? "text-indigo-600 dark:text-indigo-400" : ""}`}
                >
                  {option.label}
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {option.description}
                </p>
              </div>
              {selected === option.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center"
                >
                  <ArrowRight className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
