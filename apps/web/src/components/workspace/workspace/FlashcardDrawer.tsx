import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

interface Flashcard {
  id: number;
  front: string;
  back: string;
  difficulty?: "easy" | "medium" | "hard" | null;
}

interface FlashcardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lessonTitle: string;
}

const flashcards: Flashcard[] = [
  {
    id: 1,
    front: "What is the primary mechanism of action of ACE inhibitors?",
    back: "ACE inhibitors block the angiotensin-converting enzyme (ACE), preventing conversion of Angiotensin I → Angiotensin II.\n\nThis leads to:\n• ↓ Vasoconstriction\n• ↓ Aldosterone → ↓ Na+/H2O retention\n• ↑ Bradykinin (vasodilator)",
  },
  {
    id: 2,
    front:
      "Name the '-pril' ending ACE inhibitor that does NOT require prodrug activation.",
    back: "**Lisinopril**\n\nUnlike enalapril or ramipril (prodrugs), lisinopril works directly and has:\n• Longer half-life (~12 hours)\n• No hepatic activation needed\n• Once-daily dosing",
  },
  {
    id: 3,
    front: "What is the most common adverse effect of ACE inhibitors?",
    back: "**Dry cough** occurs in 10-20% of patients.\n\n**Mechanism:** Accumulation of bradykinin in lungs (normally broken down by ACE)\n\n**Solution:** Switch to an ARB (does not affect bradykinin)",
  },
  {
    id: 4,
    front: "Why are ACE inhibitors contraindicated in pregnancy?",
    back: "**Category D - Contraindicated!**\n\nACE inhibitors cause fetal abnormalities including:\n• Oligohydramnios\n• Renal dysplasia\n• Pulmonary hypoplasia\n• Fetal skull hypoplasia\n\nRisk highest in 2nd & 3rd trimesters.",
  },
  {
    id: 5,
    front: "When should ramipril be used instead of other ACE inhibitors?",
    back: "**Post-Myocardial Infarction (HOPE Study)**\n\nRamipril specifically proven to reduce mortality in post-MI patients with evidence of heart failure.\n\nTypical dose: **Start 2.5mg BID**, titrate to 5mg BID",
  },
];

export function FlashcardDrawer({
  isOpen,
  onClose,
  lessonTitle,
}: FlashcardDrawerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCards, setReviewedCards] = useState<
    Record<number, "easy" | "medium" | "hard">
  >({});

  const currentCard = flashcards[currentIndex];
  const progress =
    (Object.keys(reviewedCards).length / flashcards.length) * 100;

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const handleNext = () => {
    if (!isFlipped) return; // Must flip first
    setIsFlipped(false);
    setCurrentIndex((prev) => Math.min(flashcards.length - 1, prev + 1));
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleRate = (difficulty: "easy" | "medium" | "hard") => {
    setReviewedCards((prev) => ({ ...prev, [currentCard.id]: difficulty }));
    // Auto advance after rating
    setTimeout(() => {
      if (currentIndex < flashcards.length - 1) {
        setIsFlipped(false);
        setCurrentIndex((prev) => Math.min(flashcards.length - 1, prev + 1));
      }
    }, 300);
  };

  // Keyboard shortcuts are active only while the drawer is open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handleFlip();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "ArrowLeft":
          handlePrev();
          break;
        case "1":
          handleRate("easy");
          break;
        case "2":
          handleRate("medium");
          break;
        case "3":
          handleRate("hard");
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, currentCard.id, currentIndex, isFlipped]);

  const isCardRated = reviewedCards[currentCard.id];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-h-[85vh] bg-[var(--color-surface)] rounded-t-3xl shadow-2xl flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
            </div>

            {/* Header */}
            <div className="px-6 pb-4 flex items-center justify-between border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">Flashcards</h3>
                <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                  {lessonTitle.split(":")[0].trim()}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Progress */}
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                  <span>{Math.round(progress)}%</span>
                  <div className="w-20 h-1.5 bg-[var(--color-background)] rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full"
                    />
                  </div>
                  <span className="text-xs">
                    {Object.keys(reviewedCards).length}/{flashcards.length}
                  </span>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-background)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Card Counter */}
            <div className="px-6 py-3 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
              <span>
                Card {currentIndex + 1} of {flashcards.length}
              </span>
              <span className="flex gap-3">
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-[var(--color-background)] rounded text-xs font-mono">
                  Space
                </kbd>{" "}
                to flip
              </span>
            </div>

            {/* Flashcard Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div
                className="max-w-xl mx-auto cursor-pointer perspective-1000"
                onClick={handleFlip}
              >
                <motion.div
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="relative min-h-[280px]"
                >
                  {/* Front */}
                  <div
                    style={{ backfaceVisibility: "hidden" }}
                    className={`absolute inset-0 rounded-2xl p-8 border-2 ${
                      isFlipped
                        ? ""
                        : "bg-white dark:bg-slate-800 border-[var(--color-border)] shadow-lg"
                    }`}
                  >
                    <div className="h-full flex flex-col justify-center items-center text-center">
                      <p className="text-2xl font-bold leading-relaxed">
                        {currentCard.front}
                      </p>
                      <motion.p
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="mt-8 text-sm text-[var(--color-text-muted)]"
                      >
                        Click to reveal answer ↓
                      </motion.p>
                    </div>
                  </div>

                  {/* Back */}
                  <div
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                    className={`absolute inset-0 rounded-2xl p-8 border-2 ${
                      isFlipped
                        ? "bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 border-indigo-300 dark:border-indigo-700 shadow-lg"
                        : ""
                    }`}
                  >
                    <div className="h-full flex flex-col">
                      <div className="flex-1">
                        <p className="text-base leading-relaxed whitespace-pre-wrap">
                          {currentCard.back}
                        </p>
                      </div>

                      {/* Spaced Repetition Indicator */}
                      <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
                        <p className="text-xs text-[var(--color-text-muted)] mb-3">
                          How well did you know this?
                        </p>

                        <AnimatePresence mode="wait">
                          {!isCardRated ? (
                            <motion.div
                              key="rating-buttons"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="grid grid-cols-3 gap-2"
                            >
                              {[
                                {
                                  label: "Easy",
                                  color: "emerald",
                                  emoji: "😊",
                                },
                                {
                                  label: "Medium",
                                  color: "yellow",
                                  emoji: "🤔",
                                },
                                { label: "Hard", color: "red", emoji: "😓" },
                              ].map((option) => (
                                <button
                                  key={option.label}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRate(
                                      option.color as
                                        "easy" | "medium" | "hard",
                                    );
                                  }}
                                  className={`py-3 rounded-xl font-medium text-sm transition-colors hover:scale-105 ${
                                    option.color === "emerald"
                                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                      : option.color === "yellow"
                                        ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400"
                                        : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                                  }`}
                                >
                                  {option.emoji} {option.label}
                                </button>
                              ))}
                            </motion.div>
                          ) : (
                            <motion.div
                              key="rated"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`p-3 rounded-xl text-center font-medium ${
                                reviewedCards[currentCard.id] === "easy"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600"
                                  : reviewedCards[currentCard.id] === "medium"
                                    ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600"
                                    : "bg-red-100 dark:bg-red-900/40 text-red-600"
                              }`}
                            >
                              Marked as {reviewedCards[currentCard.id]}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Navigation Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  currentIndex === 0
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-[var(--color-background)]"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </motion.button>

              <div className="flex items-center gap-2">
                {flashcards.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentIndex
                        ? "bg-indigo-500 scale-125"
                        : reviewedCards[flashcards[i].id]
                          ? reviewedCards[flashcards[i].id] === "easy"
                            ? "bg-emerald-400"
                            : reviewedCards[flashcards[i].id] === "medium"
                              ? "bg-yellow-400"
                              : "bg-red-400"
                          : "bg-[var(--color-border)]"
                    }`}
                  />
                ))}
              </div>

              <motion.button
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNext}
                disabled={currentIndex === flashcards.length - 1 || !isFlipped}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  currentIndex === flashcards.length - 1 || !isFlipped
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-[var(--color-background)]"
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Completion Banner */}
            {Object.keys(reviewedCards).length === flashcards.length && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-6 mb-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
              >
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="font-semibold">All cards reviewed!</span>
                  <span className="text-white/80 text-sm">
                    → Review again tomorrow
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
