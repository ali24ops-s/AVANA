import { useState } from "react";
import { motion } from "framer-motion";
import { Sliders, ArrowRight } from "lucide-react";

interface StepConfidenceProps {
  data: { confidence: number };
  onUpdate: (key: "confidence", value: number) => void;
  onNext: () => void;
}

export function StepConfidence({
  data,
  onUpdate,
  onNext,
}: StepConfidenceProps) {
  const [value, setValue] = useState(data.confidence);

  const getCurrentEmoji = () => {
    if (value <= 33) return { emoji: "😰", label: "Very Nervous" };
    if (value <= 66) return { emoji: "😐", label: "Neutral" };
    return { emoji: "🎉", label: "Very Confident" };
  };

  const current = getCurrentEmoji();

  const handleContinue = () => {
    onUpdate("confidence", value);
    onNext();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <h2 className="text-3xl font-bold">How confident do you feel?</h2>
        <p className="text-lg text-[var(--color-text-muted)]">
          This helps us tailor your study plan to your needs.
        </p>
      </motion.div>

      {/* Slider */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[var(--color-surface)] rounded-2xl p-8 border border-[var(--color-border)]"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-indigo-600" />
          </div>
          <span className="font-semibold text-lg">
            Adjust your confidence level
          </span>
        </div>

        {/* Emoji Display */}
        <motion.div
          key={current.emoji}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center mb-8"
        >
          <span className="text-7xl block mb-3">{current.emoji}</span>
          <span
            className={`text-xl font-semibold ${value <= 33 ? "text-red-500" : value <= 66 ? "text-yellow-500" : "text-green-500"}`}
          >
            {current.label}
          </span>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {value}% Confidence
          </p>
        </motion.div>

        {/* Slider Track */}
        <div className="relative mb-6">
          {/* Background track */}
          <div className="h-3 rounded-full bg-[var(--color-background)] overflow-hidden">
            {/* Filled portion with gradient */}
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400"
              style={{ width: `${value}%` }}
              transition={{ duration: 0.15 }}
            />
          </div>

          {/* Input slider - invisible but functional */}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer"
          />

          {/* Custom thumb indicator */}
          <motion.div
            style={{ left: `calc(${value}% - 12px)` }}
            className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-4 border-indigo-500 shadow-lg pointer-events-none"
            animate={{ left: `calc(${value}% - 12px)` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Labels */}
        <div className="flex justify-between text-sm text-[var(--color-text-muted)]">
          <span>Very Nervous</span>
          <span>Neutral</span>
          <span>Very Confident</span>
        </div>

        {/* Continue Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleContinue}
          className="mt-8 w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25"
        >
          Continue
          <ArrowRight className="w-5 h-5" />
        </motion.button>
      </motion.div>
    </div>
  );
}
