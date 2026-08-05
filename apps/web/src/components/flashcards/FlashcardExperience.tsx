import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Moon,
  Sun,
  ArrowLeft,
  Sparkles,
  Layers,
  Brain,
  Clock,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Lightbulb,
  Award,
  MessageSquare,
  Wand2,
  BookOpen,
  Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

export type CardType =
  | "definition"
  | "mechanism"
  | "clinical_case"
  | "image_recognition"
  | "classification"
  | "fill_blank"
  | "compare"
  | "mnemonic"
  | "true_false"
  | "sequence";

export type Difficulty = "again" | "hard" | "good" | "easy";
export type Confidence = "low" | "medium" | "high";

export interface Flashcard {
  id: string;
  type: CardType;
  question: string;
  answer: string;
  explanation: string;
  clinicalPearl: string;
  memoryTrick: string;
  commonConfusion: string;
  nextReview: string;
  subject: string;
  difficulty?: "easy" | "medium" | "hard";
}

interface SessionState {
  currentIndex: number;
  isFlipped: boolean;
  results: {
    cardId: string;
    difficulty: Difficulty;
    confidence: Confidence;
    reactionMs: number;
  }[];
  showConfidence: boolean;
  showInsights: boolean;
  showSummary: boolean;
  showMilestone: string | null;
  flipTimestamp: number;
  totalMastered: number;
  pendingDifficulty?: Difficulty;
}

// ─── Realistic Pharmacy Flashcards ───────────────────────

const flashcards: Flashcard[] = [
  {
    id: "ace-1",
    type: "mechanism",
    question: "What is the primary mechanism of action of ACE inhibitors?",
    answer:
      "ACE inhibitors block the angiotensin-converting enzyme (ACE), preventing conversion of Angiotensin I → Angiotensin II, leading to vasodilation and reduced aldosterone secretion.",
    explanation:
      "By blocking ACE, these drugs reduce vasoconstriction and sodium/water retention, effectively lowering blood pressure and reducing afterload on the heart.",
    clinicalPearl:
      "ACE inhibitors also prevent bradykinin breakdown, which contributes to their antihypertensive effect but also causes the common side effect of dry cough.",
    memoryTrick:
      'ACE = "Angiotensin Conversion Eliminated" — the enzyme that converts AT-I to AT-II is eliminated.',
    commonConfusion:
      "Students often confuse ACE inhibitors with ARBs. ACE inhibitors block the enzyme; ARBs block the receptor. Different mechanisms, similar outcomes.",
    nextReview: "Tomorrow",
    subject: "Pharmacology",
    difficulty: "medium",
  },
  {
    id: "ace-2",
    type: "clinical_case",
    question:
      "A 58-year-old diabetic woman presents with blood pressure of 158/92 mmHg and microalbuminuria. Which class of antihypertensive is most appropriate as first-line therapy?",
    answer: "ACE inhibitor (e.g., lisinopril)",
    explanation:
      "ACE inhibitors are first-line in diabetic patients with hypertension because they provide renal protection by reducing intraglomerular pressure and decreasing proteinuria.",
    clinicalPearl:
      "The renal protective effect of ACE inhibitors is independent of their blood pressure-lowering effect — they reduce proteinuria even at sub-antihypertensive doses.",
    memoryTrick:
      'Diabetes + HTN = "A"CE (Always Choose ACE first) for kidney protection.',
    commonConfusion:
      "While ARBs are an alternative, ACE inhibitors have stronger evidence for mortality benefit in diabetic nephropathy (CAPPP, HOPE trials).",
    nextReview: "3 Days",
    subject: "Pharmacology",
    difficulty: "hard",
  },
  {
    id: "ace-3",
    type: "fill_blank",
    question:
      "The most common adverse effect of ACE inhibitors is a persistent dry ______, occurring in up to 20% of patients due to accumulation of ________.",
    answer: "cough / bradykinin",
    explanation:
      "ACE normally breaks down bradykinin. When ACE is inhibited, bradykinin accumulates in the lungs, stimulating sensory nerve fibers and causing a dry, persistent cough.",
    clinicalPearl:
      "If a patient develops cough on an ACE inhibitor, switch to an ARB — they do not affect bradykinin metabolism.",
    memoryTrick:
      'Bradykinin = "Brady Kinin" = the cough that makes you sound like Brady (hoarse). No ACE = No bradykinin breakdown = Cough.',
    commonConfusion:
      "Students think ARBs also cause cough — they do NOT. ARBs block the AT1 receptor without affecting bradykinin.",
    nextReview: "Tomorrow",
    subject: "Pharmacology",
    difficulty: "easy",
  },
  {
    id: "ace-4",
    type: "true_false",
    question: "True or False: ACE inhibitors are safe to use during pregnancy.",
    answer: "FALSE — ACE inhibitors are Pregnancy Category D (contraindicated)",
    explanation:
      "ACE inhibitors can cause fetal renal dysplasia, oligohydramnios, pulmonary hypoplasia, and skull hypoplasia. They are absolutely contraindicated in pregnancy.",
    clinicalPearl:
      "If a woman of childbearing age needs an ACE inhibitor, ensure reliable contraception. If she becomes pregnant, discontinue immediately and switch to methyldopa or labetalol.",
    memoryTrick:
      'ACE = "Absolutely Contraindicated Expecting" — never give ACE inhibitors to pregnant patients.',
    commonConfusion:
      "Students sometimes confuse Category D (evidence of risk, but benefits may outweigh) with Category X (absolutely contraindicated). ACE inhibitors are Category D — still very dangerous in pregnancy.",
    nextReview: "7 Days",
    subject: "Pharmacology",
    difficulty: "easy",
  },
  {
    id: "ace-5",
    type: "compare",
    question:
      "Compare ACE inhibitors vs. ARBs: How do their mechanisms differ?",
    answer:
      "ACE inhibitors block the enzyme that converts AT-I → AT-II (reducing AT-II production). ARBs block the AT₁ receptor directly (preventing AT-II from binding), regardless of how it was produced.",
    explanation:
      "ACE inhibitors reduce AT-II production AND increase bradykinin. ARBs block AT-II action at the receptor level but do NOT affect bradykinin. This is why ARBs don't cause cough.",
    clinicalPearl:
      "ACE inhibitors have stronger evidence for mortality reduction in heart failure. ARBs are used when ACE inhibitors are not tolerated (cough, angioedema).",
    memoryTrick:
      'ACE = "Block the Factory" (stop production). ARB = "Block the Door" (stop reception). Factory vs Door.',
    commonConfusion:
      "Both drugs ultimately reduce AT-II effects, but through different mechanisms. The bradykinin difference is the key distinguishing factor.",
    nextReview: "3 Days",
    subject: "Pharmacology",
    difficulty: "hard",
  },
  {
    id: "ace-6",
    type: "classification",
    question:
      "Which of these ACE inhibitors does NOT require prodrug activation?\n\nA) Enalapril\nB) Ramipril\nC) Lisinopril\nD) Fosinopril",
    answer:
      "C) Lisinopril — it is the only ACE inhibitor that does not require hepatic conversion to an active metabolite.",
    explanation:
      "Most ACE inhibitors are prodrugs (e.g., enalapril → enalaprilat) that require hepatic activation. Lisinopril works directly, making it preferable in patients with hepatic impairment.",
    clinicalPearl:
      "Because lisinopril doesn't need activation, it has a more predictable onset and can be used in patients with liver disease where prodrug activation might be impaired.",
    memoryTrick:
      '"LISINopril = LIves IN its active form" — it doesn\'t need conversion.',
    commonConfusion:
      'Students often think all "-pril" drugs are the same. The prodrug vs. direct-acting distinction matters clinically, especially in liver disease.',
    nextReview: "7 Days",
    subject: "Pharmacology",
    difficulty: "medium",
  },
  {
    id: "ace-7",
    type: "definition",
    question: 'Define "angioedema" in the context of ACE inhibitor therapy.',
    answer:
      "Angioedema is acute swelling of the deeper dermis, subcutaneous tissue, mucosa, and submucosa — a rare but potentially life-threatening adverse effect of ACE inhibitors.",
    explanation:
      "ACE inhibitor-induced angioedema is mediated by bradykinin (not histamine). It typically affects the face, lips, tongue, and airway. It can occur at any time during treatment, even after years of use.",
    clinicalPearl:
      "ACE inhibitor angioedema does NOT respond to epinephrine/antihistamines because it's bradykinin-mediated, not IgE-mediated. Treatment is supportive + icatibant (bradykinin B2 receptor antagonist).",
    memoryTrick:
      'Angioedema from ACE = "Bradykinin Bomb" — too much bradykinin causes vessels to leak → swelling.',
    commonConfusion:
      "Students often try to treat ACE-induced angioedema with epinephrine. This doesn't work well because the mechanism is bradykinin, not histamine.",
    nextReview: "14 Days",
    subject: "Pharmacology",
    difficulty: "hard",
  },
  {
    id: "ace-8",
    type: "mnemonic",
    question: "What mnemonic helps remember ACE inhibitor contraindications?",
    answer:
      '"PAB" — Pregnancy, Angioedema history, Bilateral Renal Artery Stenosis',
    explanation:
      "These are the three absolute contraindications for ACE inhibitors. Each can lead to serious harm: teratogenicity, life-threatening airway swelling, or acute renal failure respectively.",
    clinicalPearl:
      "Bilateral renal artery stenosis is a contraindication because ACE inhibitors remove the AT-II-mediated efferent arteriole constriction that maintains GFR in kidneys supplied by stenosed arteries.",
    memoryTrick:
      'PAB = "Pregnant Always Beware" — avoid ACE inhibitors in these three scenarios.',
    commonConfusion:
      "UNILATERAL renal artery stenosis is NOT an absolute contraindication — only bilateral. But monitor renal function closely.",
    nextReview: "14 Days",
    subject: "Pharmacology",
    difficulty: "medium",
  },
  {
    id: "ace-9",
    type: "sequence",
    question:
      "Arrange the RAAS pathway in the correct order:\n\n1. Aldosterone release\n2. Renin release\n3. Angiotensin II\n4. Angiotensin I\n5. Angiotensinogen",
    answer:
      "5 → 2 → 4 → 3 → 1\n(Angiotensinogen → Renin → Angiotensin I → Angiotensin II → Aldosterone)",
    explanation:
      "The liver produces angiotensinogen. The kidneys release renin which cleaves it to AT-I. ACE in the lungs converts AT-I to AT-II. AT-II then stimulates aldosterone release from the adrenal cortex.",
    clinicalPearl:
      "ACE inhibitors act at step 4→3 (preventing AT-I → AT-II conversion). Direct renin inhibitors (aliskiren) act at step 5→2. ARBs act at the AT₁ receptor (step 3).",
    memoryTrick:
      'RAAS = "Really Awesome Algorithm: Substrate → Enzyme → Product → Effect" — each step feeds the next.',
    commonConfusion:
      "Students often forget that angiotensinogen is produced by the LIVER, not the kidneys. Renin is from the kidneys.",
    nextReview: "7 Days",
    subject: "Pharmacology",
    difficulty: "medium",
  },
  {
    id: "ace-10",
    type: "image_recognition",
    question:
      "A patient on an ACE inhibitor presents with this swelling pattern: swelling of the lips, tongue, and face without urticaria (no hives). What is the diagnosis and mechanism?",
    answer:
      "ACE inhibitor-induced angioedema — bradykinin-mediated vascular permeability leading to deep tissue swelling without hives.",
    explanation:
      "The absence of urticaria (hives) distinguishes this from allergic/histamine-mediated angioedema. The bradykinin accumulation from ACE inhibition causes selective deep tissue swelling.",
    clinicalPearl:
      "Key diagnostic clue: No hives + ACE inhibitor use = bradykinin-mediated angioedema until proven otherwise. Onset can be delayed (months to years after starting).",
    memoryTrick:
      "No hives = Not Histamine = Not allergic = Think Bradykinin = Think ACE inhibitor.",
    commonConfusion:
      "Students see facial swelling and immediately think anaphylaxis. The absence of hives and hypotension should point you toward bradykinin-mediated angioedema instead.",
    nextReview: "30 Days",
    subject: "Pharmacology",
    difficulty: "hard",
  },
];

// ─── Card type labels ────────────────────────────────────

const cardTypeConfig: Record<
  CardType,
  { label: string; color: string; bgColor: string; emoji: string }
> = {
  definition: {
    label: "Definition",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    emoji: "📖",
  },
  mechanism: {
    label: "Drug Mechanism",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/40",
    emoji: "⚙️",
  },
  clinical_case: {
    label: "Clinical Case",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    emoji: "🏥",
  },
  image_recognition: {
    label: "Image Recognition",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/40",
    emoji: "🔬",
  },
  classification: {
    label: "Drug Classification",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/40",
    emoji: "🏷️",
  },
  fill_blank: {
    label: "Fill in the Blank",
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-100 dark:bg-pink-900/40",
    emoji: "✏️",
  },
  compare: {
    label: "Compare Drugs",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/40",
    emoji: "⚖️",
  },
  mnemonic: {
    label: "Mnemonic",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/40",
    emoji: "🧠",
  },
  true_false: {
    label: "True or False",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    emoji: "✅",
  },
  sequence: {
    label: "Sequence",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-100 dark:bg-teal-900/40",
    emoji: "🔢",
  },
};

const difficultyConfig: Record<
  Difficulty,
  {
    label: string;
    nextReview: string;
    color: string;
    bgColor: string;
    key: string;
  }
> = {
  again: {
    label: "Again",
    nextReview: "10 min",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500 hover:bg-red-600",
    key: "1",
  },
  hard: {
    label: "Hard",
    nextReview: "Tomorrow",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500 hover:bg-orange-600",
    key: "2",
  },
  good: {
    label: "Good",
    nextReview: "3 Days",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500 hover:bg-emerald-600",
    key: "3",
  },
  easy: {
    label: "Easy",
    nextReview: "7 Days",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500 hover:bg-blue-600",
    key: "4",
  },
};

// ─── Main Component ──────────────────────────────────────

interface FlashcardExperienceProps {
  isDark: boolean;
  onToggleDark: () => void;
  onBack: () => void;
}

export function FlashcardExperience({
  isDark,
  onToggleDark,
  onBack,
}: FlashcardExperienceProps) {
  const [phase, setPhase] = useState<"entry" | "session" | "summary">("entry");
  const [session, setSession] = useState<SessionState>({
    currentIndex: 0,
    isFlipped: false,
    results: [],
    showConfidence: false,
    showInsights: false,
    showSummary: false,
    showMilestone: null,
    flipTimestamp: 0,
    totalMastered: 47,
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (phase !== "session") return;
    const handler = (e: KeyboardEvent) => {
      if (session.showConfidence) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          handleFlip();
          break;
        case "1":
          handleDifficulty("again");
          break;
        case "2":
          handleDifficulty("hard");
          break;
        case "3":
          handleDifficulty("good");
          break;
        case "4":
          handleDifficulty("easy");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, session.isFlipped, session.showConfidence, session.currentIndex]);

  const handleFlip = useCallback(() => {
    if (session.isFlipped) return;
    setSession((prev) => ({
      ...prev,
      isFlipped: true,
      flipTimestamp: Date.now(),
    }));
  }, [session.isFlipped]);

  const handleDifficulty = useCallback(
    (_diff: Difficulty) => {
      void _diff;
      if (!session.isFlipped || session.showConfidence) return;
      setSession((prev) => ({ ...prev, showConfidence: true }));
    },
    [session.isFlipped, session.showConfidence],
  );

  const handleConfidence = useCallback(
    (conf: Confidence) => {
      const reactionMs = Date.now() - session.flipTimestamp;
      const card = flashcards[session.currentIndex];

      setSession((prev) => {
        const newResults = [
          ...prev.results,
          {
            cardId: card.id,
            difficulty: prev.pendingDifficulty || "good",
            confidence: conf,
            reactionMs,
          },
        ];

        const nextIndex = prev.currentIndex + 1;
        const isComplete = nextIndex >= flashcards.length;
        const mastered = prev.totalMastered + (conf !== "low" ? 1 : 0);

        // Check milestones
        let milestone: string | null = null;
        if (mastered >= 50 && prev.totalMastered < 50) milestone = "50";
        if (mastered >= 100 && prev.totalMastered < 100) milestone = "100";

        // Show insights every 10 cards
        const showInsights =
          newResults.length % 5 === 0 && newResults.length > 0 && !isComplete;

        return {
          ...prev,
          currentIndex: isComplete ? prev.currentIndex : nextIndex,
          isFlipped: false,
          results: newResults,
          showConfidence: false,
          showInsights,
          showSummary: isComplete,
          showMilestone: milestone,
          totalMastered: mastered,
          pendingDifficulty: undefined,
        };
      });
    },
    [session.currentIndex, session.flipTimestamp, session.showConfidence],
  );

  const handleDifficultyClick = useCallback(
    (diff: Difficulty) => {
      if (!session.isFlipped || session.showConfidence) return;
      setSession((prev) => ({
        ...prev,
        showConfidence: true,
        pendingDifficulty: diff,
      }));
    },
    [session.isFlipped, session.showConfidence],
  );

  const currentCard = flashcards[session.currentIndex];
  const progress = Math.round(
    (session.results.length / flashcards.length) * 100,
  );
  const typeConfig = currentCard ? cardTypeConfig[currentCard.type] : null;

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <AnimatePresence mode="wait">
        {/* ─── ENTRY SCREEN ──────────────────────────── */}
        {phase === "entry" && (
          <motion.div
            key="entry"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full text-center space-y-8">
              {/* Illustration */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="relative inline-block"
              >
                <div className="w-32 h-32 mx-auto rounded-3xl bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-pink-950/50 flex items-center justify-center shadow-xl">
                  <Brain className="w-16 h-16 text-indigo-500" />
                </div>
                <motion.div
                  animate={{ y: [0, -6, 0], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute -top-3 -right-3 text-3xl"
                >
                  ✨
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <h1 className="text-3xl font-bold">
                  Let's make sure this stays in your memory.
                </h1>
                <p className="text-lg text-[var(--color-text-muted)] max-w-md mx-auto">
                  Active recall and spaced repetition are the most effective
                  ways to retain what you've learned.
                </p>
              </motion.div>

              {/* Stats Preview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-3 gap-4"
              >
                {[
                  {
                    label: "Cards Ready",
                    value: flashcards.length,
                    emoji: "🃏",
                  },
                  { label: "Est. Time", value: "~15 min", emoji: "⏱️" },
                  { label: "Mastered", value: "47", emoji: "🏆" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)]"
                  >
                    <span className="text-2xl">{stat.emoji}</span>
                    <p className="text-xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </motion.div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-3"
              >
                <motion.button
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.4)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPhase("session")}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25"
                >
                  <Layers className="w-5 h-5" />
                  Start Flashcards
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 bg-[var(--color-surface)] rounded text-xs font-mono border border-[var(--color-border)]">
                    Space
                  </kbd>{" "}
                  to flip cards
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ─── SESSION SCREEN ────────────────────────── */}
        {phase === "session" && !session.showSummary && (
          <motion.div
            key="session"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col"
          >
            {/* Top Bar */}
            <header className="flex items-center justify-between px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBack}
                  className="p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
                <div>
                  <h2 className="font-semibold text-sm">
                    ACE Inhibitors & ARBs
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Card {session.currentIndex + 1} of {flashcards.length}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Progress */}
                <div className="hidden sm:flex items-center gap-3">
                  <div className="w-32 h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    />
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {progress}%
                  </span>
                </div>

                <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <Clock className="w-3.5 h-3.5" />~
                  {Math.max(
                    1,
                    Math.ceil(
                      (flashcards.length - session.results.length) * 1.5,
                    ),
                  )}
                  m left
                </span>

                <button
                  onClick={onToggleDark}
                  className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
                >
                  {isDark ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </header>

            {/* Main Card Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              {/* Card Type Badge */}
              {typeConfig && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-6 ${typeConfig.bgColor} ${typeConfig.color}`}
                >
                  <span>{typeConfig.emoji}</span>
                  {typeConfig.label}
                </motion.div>
              )}

              {/* Flashcard */}
              <div
                className="w-full max-w-2xl"
                style={{ perspective: "1200px" }}
              >
                <motion.div
                  animate={{ rotateY: session.isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="relative min-h-[380px]"
                >
                  {/* ─── FRONT ─── */}
                  <div
                    style={{ backfaceVisibility: "hidden" }}
                    className={`absolute inset-0 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-xl p-8 md:p-10 flex flex-col ${session.isFlipped ? "pointer-events-none" : "cursor-pointer"}`}
                    onClick={handleFlip}
                  >
                    {/* Question */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <h2 className="text-2xl md:text-3xl font-bold leading-relaxed whitespace-pre-line">
                        {currentCard?.question}
                      </h2>
                    </div>

                    {/* Reveal hint */}
                    <motion.div
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-center text-sm text-[var(--color-text-muted)] mt-6"
                    >
                      Tap or press{" "}
                      <kbd className="px-1.5 py-0.5 bg-[var(--color-background)] rounded text-xs font-mono border border-[var(--color-border)]">
                        Space
                      </kbd>{" "}
                      to reveal
                    </motion.div>
                  </div>

                  {/* ─── BACK ─── */}
                  <div
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                    className={`absolute inset-0 bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-xl p-8 md:p-10 overflow-y-auto ${session.isFlipped ? "" : "pointer-events-none"}`}
                  >
                    {/* Answer */}
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          Answer
                        </span>
                      </div>
                      <p className="text-xl font-bold leading-relaxed">
                        {currentCard?.answer}
                      </p>
                    </div>

                    {/* Explanation */}
                    <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30">
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {currentCard?.explanation}
                      </p>
                    </div>

                    {/* Clinical Pearl */}
                    <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">💎</span>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Clinical Pearl
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {currentCard?.clinicalPearl}
                      </p>
                    </div>

                    {/* Memory Trick */}
                    <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Brain className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Memory Trick
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed italic">
                        {currentCard?.memoryTrick}
                      </p>
                    </div>

                    {/* Common Confusion */}
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">⚠️</span>
                        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                          Common Confusion
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {currentCard?.commonConfusion}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Rating / Confidence Area */}
              <div className="w-full max-w-2xl mt-8">
                <AnimatePresence mode="wait">
                  {/* Difficulty Rating */}
                  {!session.isFlipped && (
                    <motion.div
                      key="flip-prompt"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center text-sm text-[var(--color-text-muted)]"
                    >
                      Reveal the answer to rate your recall
                    </motion.div>
                  )}

                  {/* Difficulty Buttons */}
                  {session.isFlipped && !session.showConfidence && (
                    <motion.div
                      key="difficulty"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-3"
                    >
                      <p className="text-center text-sm text-[var(--color-text-muted)] mb-4">
                        How well did you know this?
                      </p>
                      <div className="grid grid-cols-4 gap-3">
                        {(
                          Object.entries(difficultyConfig) as [
                            Difficulty,
                            (typeof difficultyConfig)[Difficulty],
                          ][]
                        ).map(([key, config]) => (
                          <motion.button
                            key={key}
                            whileHover={{ scale: 1.03, y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleDifficultyClick(key)}
                            className={`${config.bgColor} text-white rounded-xl py-3 px-2 font-medium text-sm transition-colors relative group`}
                          >
                            <span className="block">{config.label}</span>
                            <span className="block text-xs opacity-80 mt-0.5">
                              {config.nextReview}
                            </span>
                            <span className="absolute top-1.5 right-2 text-[10px] opacity-50 font-mono">
                              {config.key}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Confidence Tracking */}
                  {session.isFlipped && session.showConfidence && (
                    <motion.div
                      key="confidence"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-4"
                    >
                      <p className="text-center text-sm text-[var(--color-text-muted)]">
                        How confident were you?
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            key: "low" as Confidence,
                            label: "Low",
                            emoji: "😰",
                            color:
                              "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                          },
                          {
                            key: "medium" as Confidence,
                            label: "Medium",
                            emoji: "🤔",
                            color:
                              "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
                          },
                          {
                            key: "high" as Confidence,
                            label: "High",
                            emoji: "😊",
                            color:
                              "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
                          },
                        ].map((opt) => (
                          <motion.button
                            key={opt.key}
                            whileHover={{ scale: 1.04, y: -2 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handleConfidence(opt.key)}
                            className={`py-4 rounded-xl font-medium text-sm border ${opt.color} transition-all flex flex-col items-center gap-1.5`}
                          >
                            <span className="text-2xl">{opt.emoji}</span>
                            <span>{opt.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* AI Quick Actions */}
              <div className="flex items-center gap-2 mt-6">
                {[
                  { icon: Wand2, label: "Simplify" },
                  { icon: Lightbulb, label: "Mnemonic" },
                  { icon: MessageSquare, label: "Explain" },
                  { icon: Sparkles, label: "More Cards" },
                ].map((action) => (
                  <motion.button
                    key={action.label}
                    whileHover={{ scale: 1.05, y: -1 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                  >
                    <action.icon className="w-3.5 h-3.5" />
                    {action.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── INSIGHTS OVERLAY ──────────────────────── */}
        {phase === "session" && session.showInsights && (
          <motion.div
            key="insights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm"
            onClick={() =>
              setSession((prev) => ({ ...prev, showInsights: false }))
            }
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--color-surface)] rounded-3xl p-8 max-w-md w-full border border-[var(--color-border)] shadow-2xl"
            >
              <div className="text-center mb-6">
                <span className="text-4xl">🧠</span>
                <h3 className="text-xl font-bold mt-3">Learning Insights</h3>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Based on your last {session.results.length} cards
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    icon: "✅",
                    text: "You remember drug mechanisms very well.",
                    color: "bg-emerald-50 dark:bg-emerald-900/20",
                  },
                  {
                    icon: "⚠️",
                    text: "You frequently confuse beta blockers with ACE inhibitors.",
                    color: "bg-amber-50 dark:bg-amber-900/20",
                  },
                  {
                    icon: "💡",
                    text: "Spend more time reviewing pharmacokinetics.",
                    color: "bg-blue-50 dark:bg-blue-900/20",
                  },
                ].map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`flex items-start gap-3 p-3 rounded-xl ${insight.color}`}
                  >
                    <span className="text-lg">{insight.icon}</span>
                    <p className="text-sm leading-relaxed">{insight.text}</p>
                  </motion.div>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() =>
                  setSession((prev) => ({ ...prev, showInsights: false }))
                }
                className="w-full mt-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold"
              >
                Continue Studying
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ─── MILESTONE OVERLAY ─────────────────────── */}
        {phase === "session" && session.showMilestone && (
          <motion.div
            key="milestone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/30 backdrop-blur-sm"
            onClick={() =>
              setSession((prev) => ({ ...prev, showMilestone: null }))
            }
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--color-surface)] rounded-3xl p-8 max-w-sm w-full border border-[var(--color-border)] shadow-2xl text-center"
            >
              <motion.span
                className="text-6xl block mb-4"
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6 }}
              >
                🏆
              </motion.span>
              <h3 className="text-2xl font-bold mb-2">
                {session.showMilestone} Cards Mastered!
              </h3>
              <p className="text-[var(--color-text-muted)] mb-6">
                You're building incredible knowledge. Keep going!
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() =>
                  setSession((prev) => ({ ...prev, showMilestone: null }))
                }
                className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold shadow-lg"
              >
                Continue 🎉
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ─── SESSION SUMMARY ───────────────────────── */}
        {phase === "session" && session.showSummary && (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <SessionSummary
              results={session.results}
              totalMastered={session.totalMastered}
              onBack={onBack}
              onRestart={() => {
                setSession({
                  currentIndex: 0,
                  isFlipped: false,
                  results: [],
                  showConfidence: false,
                  showInsights: false,
                  showSummary: false,
                  showMilestone: null,
                  flipTimestamp: 0,
                  totalMastered: session.totalMastered,
                });
                setPhase("session");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Session Summary Component ───────────────────────────

function SessionSummary({
  results,
  totalMastered,
  onBack,
  onRestart,
}: {
  results: { difficulty: Difficulty; confidence: Confidence }[];
  totalMastered: number;
  onBack: () => void;
  onRestart: () => void;
}) {
  const correctCount = results.filter(
    (r) => r.difficulty === "good" || r.difficulty === "easy",
  ).length;
  const correctPct = Math.round((correctCount / results.length) * 100);
  const highConf = results.filter((r) => r.confidence === "high").length;
  const medConf = results.filter((r) => r.confidence === "medium").length;
  const lowConf = results.filter((r) => r.confidence === "low").length;
  const avgConfLabel =
    highConf >= medConf && highConf >= lowConf
      ? "High"
      : medConf >= lowConf
        ? "Medium"
        : "Low";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg w-full space-y-6"
    >
      {/* Celebration */}
      <div className="text-center">
        <motion.span
          className="text-6xl block mb-4"
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          🎉
        </motion.span>
        <h1 className="text-3xl font-bold mb-2">Session Complete!</h1>
        <p className="text-[var(--color-text-muted)]">
          Great work! Every card you review strengthens your memory.
        </p>
      </div>

      {/* Main Stats */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6">
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: "Cards Reviewed",
              value: results.length,
              icon: Layers,
              color: "text-indigo-500",
            },
            {
              label: "Correct %",
              value: `${correctPct}%`,
              icon: CheckCircle2,
              color: "text-emerald-500",
            },
            {
              label: "Avg Confidence",
              value: avgConfLabel,
              icon: Star,
              color: "text-amber-500",
            },
            {
              label: "Total Mastered",
              value: totalMastered,
              icon: Award,
              color: "text-purple-500",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-background)]"
            >
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {stat.label}
                </p>
                <p className="font-bold">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weak / Strong Topics */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-500" />
          Learning Analysis
        </h3>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
            <span className="text-lg">💪</span>
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Strong Topic
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Drug mechanisms — you recalled {correctPct}% correctly
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <span className="text-lg">📚</span>
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Needs Review
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Drug classifications — schedule review for tomorrow
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Retention & Readiness */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold">Retention Prediction</span>
          <span className="text-2xl font-bold">
            {Math.min(95, correctPct + 12)}%
          </span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(95, correctPct + 12)}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-white rounded-full"
          />
        </div>
        <p className="text-sm opacity-90">
          Estimated exam readiness improved by <strong>+8%</strong> this session
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onRestart}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" />
          Study Again
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onBack}
          className="w-full py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl font-semibold flex items-center justify-center gap-2"
        >
          <BookOpen className="w-5 h-5" />
          Back to Lesson
        </motion.button>
      </div>
    </motion.div>
  );
}
