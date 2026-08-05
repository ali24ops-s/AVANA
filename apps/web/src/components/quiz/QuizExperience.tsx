import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Moon,
  Sun,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Target,
  Layers,
  Zap,
  Lightbulb,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Shield,
  MessageSquare,
  ChevronRight,
  Star,
  BarChart3,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

export type QuizMode = "tutor" | "exam";
export type QuestionType =
  | "mcq"
  | "true_false"
  | "fill_blank"
  | "match"
  | "clinical"
  | "image"
  | "classification"
  | "order"
  | "identify_mistake";
export type Confidence = "guessed" | "somewhat" | "confident";

export interface Question {
  id: string;
  type: QuestionType;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  whyOthersWrong: string[];
  clinicalRelevance: string;
  examTip: string;
  commonMistake: string;
  memoryTrick: string;
  imageDescription?: string;
  pairs?: { left: string; right: string }[];
  steps?: string[];
}

interface QuizResult {
  questionId: string;
  selected: number;
  correct: boolean;
  confidence: Confidence;
  timeMs: number;
  topic: string;
}

type Phase =
  "pre-quiz" | "question" | "feedback" | "confidence" | "mid-quiz" | "results";

// ─── Quiz Data ───────────────────────────────────────────

const questions: Question[] = [
  {
    id: "q1",
    type: "mcq",
    topic: "ACE Inhibitors",
    difficulty: "medium",
    question:
      "A 62-year-old man with heart failure (LVEF 35%) is started on lisinopril. What is the primary mechanism by which ACE inhibitors reduce mortality in heart failure?",
    options: [
      "Reducing afterload through vasodilation",
      "Increasing heart rate to improve cardiac output",
      "Blocking beta-adrenergic receptors",
      "Increasing aldosterone secretion",
    ],
    correctIndex: 0,
    explanation:
      "ACE inhibitors reduce mortality in HFrEF primarily by decreasing afterload through vasodilation (reducing Ang II-mediated vasoconstriction) and reducing preload (decreasing aldosterone-mediated fluid retention). This decreases cardiac workload and prevents remodeling.",
    whyOthersWrong: [
      "Increasing heart rate would be detrimental in HF — it increases myocardial oxygen demand. ACE inhibitors actually reduce sympathetic activity.",
      "Beta-adrenergic receptor blockade is the mechanism of beta-blockers, not ACE inhibitors. Both are used in HF but through different pathways.",
      "ACE inhibitors DECREASE aldosterone secretion, not increase it. This is a core mechanism of their action — reduced Ang II leads to reduced aldosterone.",
    ],
    clinicalRelevance:
      "This mechanism is why ACE inhibitors are first-line in HFrEF regardless of blood pressure — they provide mortality benefit beyond simple BP reduction.",
    examTip:
      'If asked about ACE inhibitor mortality benefit, the key words are: "reduce afterload" and "prevent cardiac remodeling."',
    commonMistake:
      'Students often select "decrease aldosterone" as the PRIMARY mechanism. While true, the question asks about mortality reduction — which is primarily through afterload reduction and remodeling prevention.',
    memoryTrick:
      'ACE in HF = "Afterload Correction Equals survival" — the key is afterload reduction + remodeling prevention.',
  },
  {
    id: "q2",
    type: "true_false",
    topic: "ACE Inhibitors",
    difficulty: "easy",
    question:
      "True or False: The dry cough associated with ACE inhibitors is mediated by histamine release.",
    options: ["True", "False"],
    correctIndex: 1,
    explanation:
      "The dry cough is mediated by BRADYKININ accumulation, not histamine. ACE normally breaks down bradykinin; when ACE is inhibited, bradykinin accumulates and stimulates sensory nerve fibers in the lungs.",
    whyOthersWrong: [
      "This is a common misconception. The cough is bradykinin-mediated, which is why antihistamines do NOT help with ACE inhibitor-induced cough.",
    ],
    clinicalRelevance:
      "This distinction is crucial because ACE inhibitor cough doesn't respond to antihistamines or cough suppressants. The solution is switching to an ARB.",
    examTip:
      "Any question about ACE inhibitor cough = bradykinin. Any question about treatment = switch to ARB.",
    commonMistake:
      "Students confuse bradykinin-mediated cough with histamine-mediated allergic reactions. They are completely different mechanisms.",
    memoryTrick: 'ACE cough = "B"radykinin (Not "H"istamine). B ≠ H. Simple.',
  },
  {
    id: "q3",
    type: "clinical",
    topic: "Drug Interactions",
    difficulty: "hard",
    question:
      "A 55-year-old woman on lisinopril 20mg daily presents with acute kidney injury (creatinine increased from 1.0 to 2.8 mg/dL) after starting a new medication one week ago. Which of the following medications most likely caused this?",
    options: [
      "Ibuprofen 400mg TID",
      "Metformin 500mg BID",
      "Omeprazole 20mg daily",
      "Atorvastatin 20mg daily",
    ],
    correctIndex: 0,
    explanation:
      'NSAIDs (like ibuprofen) inhibit prostaglandin synthesis, which normally vasodilates the afferent arteriole. ACE inhibitors dilate the efferent arteriole. The combination can critically reduce GFR, causing AKI — the "triple whammy" effect.',
    whyOthersWrong: [
      "Metformin is renally cleared but does NOT cause AKI. It's contraindicated IN AKI (eGFR <30) but doesn't cause it.",
      "Omeprazole can cause interstitial nephritis rarely, but the timeline and ACE inhibitor context point strongly to NSAIDs as the culprit.",
      "Atorvastatin does not cause AKI. Rhabdomyolysis from statins can cause AKI, but this is extremely rare and not the most likely cause here.",
    ],
    clinicalRelevance:
      'The "Triple Whammy" = ACE inhibitor + NSAID + diuretic → high risk of AKI. Always check renal function when these are combined.',
    examTip:
      "ACE inhibitor + NSAID = AKI risk. This is one of the most tested drug interactions in pharmacy exams.",
    commonMistake:
      "Students forget the NSAID-ACE inhibitor interaction. They focus on each drug individually instead of recognizing the synergistic effect on renal hemodynamics.",
    memoryTrick:
      'ACE + NSAID = "A Nasty Combination Exist" → both reduce renal blood flow through different mechanisms = GFR drops.',
  },
  {
    id: "q4",
    type: "classification",
    topic: "Drug Classification",
    difficulty: "medium",
    question:
      "Which of the following ACE inhibitors is a prodrug that requires hepatic activation?",
    options: ["Lisinopril", "Enalapril", "Captopril", "All of the above"],
    correctIndex: 1,
    explanation:
      "Enalapril is a prodrug that is hydrolyzed in the liver to its active form, enalaprilat. Lisinopril is NOT a prodrug — it is active as-is. Captopril is also not a prodrug and is the shortest-acting ACE inhibitor.",
    whyOthersWrong: [
      'Lisinopril is the exception — it does NOT require activation. "LISINopril = LIves IN its active form."',
      "Captopril is directly active and is actually the first ACE inhibitor developed. It requires TID dosing due to short half-life.",
      "Not all ACE inhibitors are prodrugs. Lisinopril and captopril are exceptions.",
    ],
    clinicalRelevance:
      "Prodrug status matters in liver disease — lisinopril may be preferred in hepatic impairment because it doesn't require hepatic activation.",
    examTip:
      'Know which "-prils" are prodrugs vs. directly active. Only lisinopril and captopril are directly active among common ACE inhibitors.',
    commonMistake:
      'Students assume ALL "-pril" drugs are the same. The prodrug distinction has real clinical implications.',
    memoryTrick:
      "Prodrug ACE inhibitors: Enalapril, Ramipril, Fosinopril, Quinapril, Benazepril. NON-prodrugs: Lisinopril, Captopril.",
  },
  {
    id: "q5",
    type: "fill_blank",
    topic: "Pharmacology",
    difficulty: "hard",
    question:
      "ACE inhibitor-induced angioedema is mediated by ________ (not histamine) and typically presents WITHOUT ________.",
    options: [
      "Bradykinin / urticaria (hives)",
      "Histamine / pruritus",
      "Serotonin / flushing",
      "Prostaglandin / pain",
    ],
    correctIndex: 0,
    explanation:
      "ACE inhibitor angioedema is bradykinin-mediated and presents WITHOUT urticaria (hives). This is a key distinguishing feature from allergic/histamine-mediated angioedema, which typically includes hives.",
    whyOthersWrong: [
      "Histamine-mediated angioedema IS associated with pruritus and hives. ACE inhibitor angioedema is NOT histamine-mediated.",
      "Serotonin is not involved in ACE inhibitor angioedema. This is a distractor.",
      "Prostaglandins are not the primary mediator in ACE inhibitor angioedema.",
    ],
    clinicalRelevance:
      "ACE inhibitor angioedema does NOT respond well to epinephrine/antihistamines because it's bradykinin-mediated. Icatibant (bradykinin B2 antagonist) is the targeted treatment.",
    examTip:
      "No hives + ACE inhibitor use = bradykinin-mediated angioedema. This is a guaranteed board question.",
    commonMistake:
      "Students try to treat ACE angioedema like anaphylaxis. The treatments are different because the mechanisms are different.",
    memoryTrick:
      "No Hives = Not Histamine = Not Allergic = Think Bradykinin = Think ACE inhibitor.",
  },
  {
    id: "q6",
    type: "mcq",
    topic: "Beta-Blockers",
    difficulty: "medium",
    question:
      "Which beta-blocker is preferred in heart failure with reduced ejection fraction due to its additional α1-blocking properties?",
    options: ["Atenolol", "Metoprolol succinate", "Carvedilol", "Propranolol"],
    correctIndex: 2,
    explanation:
      "Carvedilol is a non-selective beta-blocker with additional α1-blocking activity, causing vasodilation. This additional mechanism makes it particularly beneficial in HFrEF. It reduces afterload through α1 blockade while providing beta-blockade.",
    whyOthersWrong: [
      "Atenolol is a selective β1-blocker without α1 activity. It has NOT shown mortality benefit in HF and is generally avoided.",
      "Metoprolol succinate is cardioselective (β1 only) and IS used in HF, but lacks the α1-blocking vasodilatory benefit of carvedilol.",
      "Propranolol is non-selective but has NO α1-blocking activity. It is contraindicated in HF due to lack of evidence.",
    ],
    clinicalRelevance:
      "The three evidence-based beta-blockers in HFrEF are: carvedilol, metoprolol succinate, and bisoprolol. Atenolol and propranolol should NOT be used.",
    examTip:
      'Carvedilol = "CARVED" = Comprehensive AR and VErsatile Drug (blocks both β and α receptors).',
    commonMistake:
      "Students think all beta-blockers are the same in HF. Only carvedilol, metoprolol succinate, and bisoprolol have mortality evidence.",
    memoryTrick:
      'HF Beta-blockers: "CMB" = Carvedilol, Metoprolol succinate, Bisoprolol. Only these three!',
  },
  {
    id: "q7",
    type: "order",
    topic: "RAAS Pathway",
    difficulty: "easy",
    question:
      "Arrange the RAAS cascade in the correct sequence:\n\nA) Angiotensin II\nB) Aldosterone\nC) Renin\nD) Angiotensinogen\nE) Angiotensin I",
    options: [
      "D → C → E → A → B",
      "C → D → E → A → B",
      "D → E → C → A → B",
      "C → A → E → D → B",
    ],
    correctIndex: 0,
    explanation:
      "The correct sequence: Angiotensinogen (D, liver) → Renin (C, kidneys) cleaves it → Angiotensin I (E) → ACE converts to Angiotensin II (A) → stimulates Aldosterone (B, adrenals).",
    whyOthersWrong: [
      "Renin cannot act first — it needs angiotensinogen as its substrate.",
      "Angiotensin I comes after renin acts on angiotensinogen, not before renin.",
      "This sequence is completely disordered — angiotensinogen must be first as the substrate.",
    ],
    clinicalRelevance:
      "Understanding the RAAS cascade is essential because each step is a drug target: Direct renin inhibitors (aliskiren) at step 2, ACE inhibitors at step 4, ARBs at step 5.",
    examTip:
      "Draw the RAAS cascade from memory. Every pharmacy exam will test this in some form.",
    commonMistake:
      "Students forget that angiotensinogen is from the LIVER. They assume it's produced by the kidneys because renin is.",
    memoryTrick:
      '"Liver → Kidney → Lung → Adrenal" = source organs for each step. D-C-E-A-B = "Don\'t Call Emergency Always Be-prepared."',
  },
  {
    id: "q8",
    type: "identify_mistake",
    topic: "Clinical Errors",
    difficulty: "hard",
    question:
      'A resident writes: "Started ACE inhibitor for patient with bilateral renal artery stenosis and creatinine 1.8 mg/dL." What is the error?',
    options: [
      "No error — ACE inhibitors are appropriate here",
      "ACE inhibitors are contraindicated in bilateral renal artery stenosis",
      "Should have used an ARB instead",
      "Creatinine is too low to start ACE inhibitor",
    ],
    correctIndex: 1,
    explanation:
      "Bilateral renal artery stenosis is an ABSOLUTE contraindication for ACE inhibitors. In this condition, GFR is maintained by AT-II-mediated efferent arteriole constriction. Blocking AT-II removes this compensatory mechanism → acute renal failure.",
    whyOthersWrong: [
      "This is clearly wrong — bilateral RAS is a well-known contraindication.",
      "ARBs are ALSO contraindicated in bilateral RAS for the same reason — they also block the AT-II-mediated efferent arteriole constriction.",
      "The creatinine level is not the primary concern here — the bilateral RAS is the contraindication regardless of creatinine.",
    ],
    clinicalRelevance:
      "Always check for renal artery stenosis (especially bilateral) before starting ACE inhibitors/ARBs. A rise in creatinine >30% after starting should prompt evaluation.",
    examTip:
      "Bilateral RAS = contraindication for BOTH ACE inhibitors AND ARBs. Unilateral RAS = use with caution and monitor.",
    commonMistake:
      'Students think ARBs are safe in bilateral RAS because "they\'re not ACE inhibitors." Wrong — same contraindication, same mechanism.',
    memoryTrick:
      "PAB = Pregnancy, Angioedema, Bilateral RAS = absolute contraindications for ACE inhibitors.",
  },
];

// ─── Question Type Config ────────────────────────────────

const qTypeConfig: Record<
  QuestionType,
  { label: string; emoji: string; color: string }
> = {
  mcq: {
    label: "Multiple Choice",
    emoji: "📝",
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  },
  true_false: {
    label: "True / False",
    emoji: "✅",
    color:
      "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  },
  fill_blank: {
    label: "Fill in the Blank",
    emoji: "✏️",
    color: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  },
  match: {
    label: "Match",
    emoji: "🔗",
    color:
      "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  },
  clinical: {
    label: "Clinical Case",
    emoji: "🏥",
    color:
      "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  },
  image: {
    label: "Image-based",
    emoji: "🔬",
    color: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300",
  },
  classification: {
    label: "Classification",
    emoji: "🏷️",
    color:
      "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  },
  order: {
    label: "Order Steps",
    emoji: "🔢",
    color: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
  },
  identify_mistake: {
    label: "Identify the Mistake",
    emoji: "🔍",
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  },
};

// ─── Main Component ──────────────────────────────────────

interface QuizExperienceProps {
  isDark: boolean;
  onToggleDark: () => void;
  onBack: () => void;
}

export function QuizExperience({
  isDark,
  onToggleDark,
  onBack,
}: QuizExperienceProps) {
  const [phase, setPhase] = useState<Phase>("pre-quiz");
  const [mode, setMode] = useState<QuizMode>("tutor");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Timer
  useEffect(() => {
    if (phase !== "question" && phase !== "feedback" && phase !== "confidence")
      return;
    if (isPaused) return;
    const interval = setInterval(
      () => setTimerSeconds((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [phase, isPaused]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const currentQuestion = questions[currentIndex];
  const progress = Math.round((currentIndex / questions.length) * 100);
  const isAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === currentQuestion?.correctIndex;

  const handleStartQuiz = (quizMode: QuizMode) => {
    setMode(quizMode);
    setPhase("question");
    setCurrentIndex(0);
    setResults([]);
    setTimerSeconds(0);
    setQuestionStartTime(Date.now());
  };

  const handleSelectAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
  };

  const handleConfidence = (conf: Confidence) => {
    const result: QuizResult = {
      questionId: currentQuestion.id,
      selected: selectedAnswer!,
      correct: isCorrect,
      confidence: conf,
      timeMs: Date.now() - questionStartTime,
      topic: currentQuestion.topic,
    };
    setResults((prev) => [...prev, result]);
    // Confidence is stored in the result

    setTimeout(() => {
      if (currentIndex + 1 >= questions.length) {
        setPhase("results");
      } else {
        setCurrentIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setPhase("question");
        setQuestionStartTime(Date.now());
      }
    }, 300);
  };

  const handleNextFromFeedback = () => {
    if (mode === "exam") {
      // In exam mode, go directly to next question
      if (currentIndex + 1 >= questions.length) {
        setPhase("results");
      } else {
        setCurrentIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setQuestionStartTime(Date.now());
        setPhase("question");
      }
    } else {
      setPhase("confidence");
    }
  };

  // Compute results stats
  const correctCount = results.filter((r) => r.correct).length;
  const accuracy =
    results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const avgTime =
    results.length > 0
      ? Math.round(
          results.reduce((a, r) => a + r.timeMs, 0) / results.length / 1000,
        )
      : 0;

  // Topic analysis
  const topicStats: Record<string, { correct: number; total: number }> = {};
  results.forEach((r) => {
    if (!topicStats[r.topic]) topicStats[r.topic] = { correct: 0, total: 0 };
    topicStats[r.topic].total++;
    if (r.correct) topicStats[r.topic].correct++;
  });

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <AnimatePresence mode="wait">
        {/* ═══ PRE-QUIZ SCREEN ═══ */}
        {phase === "pre-quiz" && (
          <motion.div
            key="pre-quiz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="max-w-lg w-full space-y-8">
              {/* Illustration */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="text-center"
              >
                <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-pink-950/50 flex items-center justify-center shadow-xl mb-6">
                  <Target className="w-12 h-12 text-indigo-500" />
                </div>
                <h1 className="text-3xl font-bold mb-2">
                  Ready to test your knowledge?
                </h1>
                <p className="text-[var(--color-text-muted)]">
                  This isn't just a quiz — it's your personal tutor identifying
                  exactly where to improve.
                </p>
              </motion.div>

              {/* Quiz Info Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg">ACE Inhibitors & ARBs</h2>
                  <span className="text-xs px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
                    Pharmacology
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      icon: HelpCircle,
                      label: "Questions",
                      value: questions.length,
                    },
                    { icon: Clock, label: "Est. Time", value: "~12 min" },
                    { icon: BarChart3, label: "Difficulty", value: "Mixed" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="text-center p-3 rounded-xl bg-[var(--color-background)]"
                    >
                      <stat.icon className="w-5 h-5 mx-auto text-[var(--color-text-muted)] mb-1" />
                      <p className="font-semibold text-sm">{stat.value}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Learning Objectives */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Learning Objectives</p>
                  <ul className="space-y-1.5">
                    {[
                      "Identify ACE inhibitor mechanisms and clinical applications",
                      "Recognize contraindications and drug interactions",
                      "Differentiate ACE inhibitors from ARBs",
                    ].map((obj, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weak Topics Banner */}
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      Focus Areas Detected
                    </span>
                  </div>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    Drug interactions & clinical errors are your weakest topics
                    based on recent performance.
                  </p>
                </div>
              </motion.div>

              {/* Mode Selection */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <motion.button
                  whileHover={{
                    scale: 1.01,
                    boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.35)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleStartQuiz("tutor")}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/25"
                >
                  <Sparkles className="w-5 h-5" />
                  Start Tutor Mode
                  <span className="text-sm font-normal opacity-80">
                    — Learn as you go
                  </span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleStartQuiz("exam")}
                  className="w-full py-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl font-semibold text-lg flex items-center justify-center gap-3"
                >
                  <Shield className="w-5 h-5 text-amber-500" />
                  Exam Simulator
                  <span className="text-sm font-normal text-[var(--color-text-muted)]">
                    — Real exam conditions
                  </span>
                </motion.button>
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={onBack}
                className="w-full py-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-sm"
              >
                ← Back to lesson
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ═══ QUIZ SESSION ═══ */}
        {(phase === "question" ||
          phase === "feedback" ||
          phase === "confidence") &&
          currentQuestion && (
            <motion.div
              key={`quiz-${currentIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-screen flex flex-col"
            >
              {/* Top Bar */}
              <header className="flex items-center justify-between px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <div className="flex items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onBack}
                    className="p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </motion.button>
                  <div>
                    <p className="font-semibold text-sm">
                      {mode === "tutor" ? "📚 Tutor Mode" : "🎓 Exam Mode"}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Question {currentIndex + 1} of {questions.length}
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

                  {/* Timer */}
                  <div className="flex items-center gap-1.5 text-sm tabular-nums">
                    <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
                    {formatTime(timerSeconds)}
                  </div>

                  {mode === "tutor" && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsPaused(!isPaused)}
                      className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
                    >
                      {isPaused ? (
                        <Play className="w-4 h-4" />
                      ) : (
                        <Pause className="w-4 h-4" />
                      )}
                    </motion.button>
                  )}

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

              {/* Question Area */}
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
                  {/* Question Type Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${qTypeConfig[currentQuestion.type].color}`}
                  >
                    <span>{qTypeConfig[currentQuestion.type].emoji}</span>
                    {qTypeConfig[currentQuestion.type].label}
                    <span className="opacity-50">•</span>
                    <span>{currentQuestion.topic}</span>
                  </motion.div>

                  {/* Question */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h2 className="text-2xl md:text-3xl font-bold leading-relaxed whitespace-pre-line">
                      {currentQuestion.question}
                    </h2>
                  </motion.div>

                  {/* Answer Options */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                  >
                    {currentQuestion.options.map((option, index) => {
                      const isSelected = selectedAnswer === index;
                      const isCorrectOption =
                        index === currentQuestion.correctIndex;
                      const showResult =
                        isAnswered &&
                        (mode === "tutor" || (phase as string) === "results");

                      let optionStyle =
                        "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer";
                      if (showResult) {
                        if (isCorrectOption) {
                          optionStyle =
                            "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700";
                        } else if (isSelected && !isCorrectOption) {
                          optionStyle =
                            "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700";
                        } else {
                          optionStyle =
                            "bg-[var(--color-surface)] border-[var(--color-border)] opacity-50";
                        }
                      } else if (isSelected) {
                        optionStyle =
                          "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/30";
                      }

                      return (
                        <motion.button
                          key={index}
                          whileHover={!isAnswered ? { scale: 1.01, x: 4 } : {}}
                          whileTap={!isAnswered ? { scale: 0.99 } : {}}
                          onClick={() => handleSelectAnswer(index)}
                          disabled={isAnswered}
                          className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${optionStyle}`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                              showResult && isCorrectOption
                                ? "bg-emerald-500 text-white"
                                : showResult && isSelected && !isCorrectOption
                                  ? "bg-red-500 text-white"
                                  : isSelected
                                    ? "bg-indigo-500 text-white"
                                    : "bg-[var(--color-background)] text-[var(--color-text-muted)]"
                            }`}
                          >
                            {showResult && isCorrectOption ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : showResult && isSelected && !isCorrectOption ? (
                              <XCircle className="w-5 h-5" />
                            ) : (
                              String.fromCharCode(65 + index)
                            )}
                          </div>
                          <span className="text-base leading-relaxed pt-1">
                            {option}
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>

                  {/* Submit / Next Button */}
                  {!isAnswered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-end"
                    >
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={selectedAnswer === null}
                        onClick={() => {
                          if (mode === "exam") {
                            // In exam mode, store result and move on
                            const result: QuizResult = {
                              questionId: currentQuestion.id,
                              selected: selectedAnswer ?? 0,
                              correct: isCorrect,
                              confidence: "somewhat",
                              timeMs: Date.now() - questionStartTime,
                              topic: currentQuestion.topic,
                            };
                            setResults((prev) => [...prev, result]);
                            if (currentIndex + 1 >= questions.length) {
                              setPhase("results");
                            } else {
                              setCurrentIndex((prev) => prev + 1);
                              setSelectedAnswer(null);
                              setQuestionStartTime(Date.now());
                            }
                          } else {
                            setPhase("feedback");
                          }
                        }}
                        className={`px-8 py-3 rounded-xl font-semibold flex items-center gap-2 ${
                          selectedAnswer !== null
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                            : "bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
                        }`}
                      >
                        {mode === "exam" ? "Next Question" : "Check Answer"}
                        <ArrowRight className="w-4 h-4" />
                      </motion.button>
                    </motion.div>
                  )}

                  {/* ═══ FEEDBACK (Tutor Mode Only) ═══ */}
                  {phase === "feedback" && isAnswered && mode === "tutor" && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Correct/Incorrect Banner */}
                      <div
                        className={`p-4 rounded-xl border ${
                          isCorrect
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          {isCorrect ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-500" />
                          )}
                          <span
                            className={`text-lg font-bold ${isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}
                          >
                            {isCorrect ? "Correct!" : "Not quite right"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">
                          {currentQuestion.explanation}
                        </p>
                      </div>

                      {/* Why Others Are Wrong */}
                      {!isCorrect &&
                        currentQuestion.whyOthersWrong.length > 0 && (
                          <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200/50 dark:border-orange-800/30">
                            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300 mb-2">
                              Why other options are wrong:
                            </p>
                            <ul className="space-y-2">
                              {currentQuestion.whyOthersWrong.map(
                                (reason, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-[var(--color-text-muted)] leading-relaxed flex items-start gap-2"
                                  >
                                    <XCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                    {reason}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}

                      {/* Clinical Relevance */}
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">🏥</span>
                          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                            Clinical Relevance
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                          {currentQuestion.clinicalRelevance}
                        </p>
                      </div>

                      {/* Exam Tip + Memory Trick */}
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200/50 dark:border-purple-800/30">
                          <div className="flex items-center gap-2 mb-1">
                            <Lightbulb className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                              Exam Tip
                            </span>
                          </div>
                          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                            {currentQuestion.examTip}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                              Memory Trick
                            </span>
                          </div>
                          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed italic">
                            {currentQuestion.memoryTrick}
                          </p>
                        </div>
                      </div>

                      {/* Common Mistake */}
                      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/30">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">⚠️</span>
                          <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                            Common Mistake
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                          {currentQuestion.commonMistake}
                        </p>
                      </div>

                      {/* Next Button */}
                      <motion.button
                        whileHover={{
                          scale: 1.01,
                          boxShadow:
                            "0 20px 40px -15px rgba(99, 102, 241, 0.4)",
                        }}
                        whileTap={{ scale: 0.99 }}
                        onClick={handleNextFromFeedback}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
                      >
                        {currentIndex + 1 >= questions.length
                          ? "See Results"
                          : "Next Question"}
                        <ArrowRight className="w-5 h-5" />
                      </motion.button>
                    </motion.div>
                  )}

                  {/* ═══ CONFIDENCE CHECK ═══ */}
                  {phase === "confidence" && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <p className="text-center text-lg font-medium text-[var(--color-text-muted)]">
                        How confident were you in your answer?
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            key: "guessed" as Confidence,
                            label: "I guessed",
                            emoji: "🎲",
                            color:
                              "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
                          },
                          {
                            key: "somewhat" as Confidence,
                            label: "Somewhat",
                            emoji: "🤔",
                            color:
                              "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
                          },
                          {
                            key: "confident" as Confidence,
                            label: "Very confident",
                            emoji: "💪",
                            color:
                              "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
                          },
                        ].map((opt) => (
                          <motion.button
                            key={opt.key}
                            whileHover={{ scale: 1.04, y: -2 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handleConfidence(opt.key)}
                            className={`py-5 rounded-xl font-medium border flex flex-col items-center gap-2 transition-all ${opt.color}`}
                          >
                            <span className="text-3xl">{opt.emoji}</span>
                            <span className="text-sm">{opt.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        {/* ═══ RESULTS ═══ */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <motion.span
                  className="text-6xl block mb-4"
                  animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 1.5 }}
                >
                  {accuracy >= 80 ? "🏆" : accuracy >= 60 ? "👍" : "📚"}
                </motion.span>
                <h1 className="text-3xl font-bold mb-2">
                  {accuracy >= 80
                    ? "Outstanding Performance!"
                    : accuracy >= 60
                      ? "Good Progress!"
                      : "Keep Practicing!"}
                </h1>
                <p className="text-[var(--color-text-muted)]">
                  {accuracy >= 80
                    ? "You've demonstrated strong understanding of this material."
                    : accuracy >= 60
                      ? "You're on the right track. A few topics need more attention."
                      : "This is a learning opportunity. Let's identify where to focus."}
                </p>
              </motion.div>

              {/* Score Circle */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="relative w-48 h-48 mx-auto"
              >
                <svg
                  viewBox="0 0 100 100"
                  className="w-full transform -rotate-90"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth="8"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke={
                      accuracy >= 80
                        ? "#22c55e"
                        : accuracy >= 60
                          ? "#f59e0b"
                          : "#ef4444"
                    }
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={264}
                    initial={{ strokeDashoffset: 264 }}
                    animate={{ strokeDashoffset: 264 - (264 * accuracy) / 100 }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold">{accuracy}%</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Accuracy
                  </span>
                </div>
              </motion.div>

              {/* Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
              >
                {[
                  {
                    label: "Correct",
                    value: `${correctCount}/${results.length}`,
                    icon: CheckCircle2,
                    color: "text-emerald-500",
                  },
                  {
                    label: "Avg. Time",
                    value: `${avgTime}s/q`,
                    icon: Clock,
                    color: "text-blue-500",
                  },
                  {
                    label: "Confidence",
                    value:
                      results.filter((r) => r.confidence === "confident")
                        .length >=
                      results.length / 2
                        ? "High"
                        : "Medium",
                    icon: Star,
                    color: "text-amber-500",
                  },
                  {
                    label: "Time Spent",
                    value: formatTime(timerSeconds),
                    icon: Zap,
                    color: "text-purple-500",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] text-center"
                  >
                    <stat.icon
                      className={`w-5 h-5 mx-auto ${stat.color} mb-2`}
                    />
                    <p className="text-xl font-bold">{stat.value}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </motion.div>

              {/* Topic Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6"
              >
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  Topic Breakdown
                </h3>
                <div className="space-y-4">
                  {Object.entries(topicStats).map(([topic, stats]) => {
                    const pct = Math.round((stats.correct / stats.total) * 100);
                    return (
                      <div key={topic}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium">{topic}</span>
                          <span
                            className={`text-sm font-semibold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-yellow-600" : "text-red-600"}`}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.6 }}
                            className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* AI Analysis */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="font-bold">AI Analysis</h3>
                </div>
                <p className="opacity-95 leading-relaxed mb-4">
                  You understand <strong>ACE inhibitor mechanisms</strong> well.
                  However, <strong>drug interactions</strong> and{" "}
                  <strong>clinical errors</strong> remain your weakest topics.
                  We recommend reviewing <strong>Lesson 4</strong> and
                  completing <strong>25 additional flashcards</strong>.
                </p>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-medium">
                    📈 Predicted Readiness: +12%
                  </div>
                  <div className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-medium">
                    🎯 Focus: Drug Interactions
                  </div>
                </div>
              </motion.div>

              {/* Recommended Actions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="space-y-3"
              >
                <h3 className="font-bold">What's Next?</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    {
                      icon: Target,
                      label: "Review Weak Topics",
                      desc: "Focus on drug interactions",
                      gradient: true,
                    },
                    {
                      icon: Layers,
                      label: "Review Flashcards",
                      desc: "25 cards recommended",
                      gradient: false,
                    },
                    {
                      icon: RotateCcw,
                      label: "Generate New Quiz",
                      desc: "Adaptive difficulty",
                      gradient: false,
                    },
                    {
                      icon: Zap,
                      label: "10-min Exam Review",
                      desc: "Quick high-yield review",
                      gradient: false,
                    },
                  ].map((action) => (
                    <motion.button
                      key={action.label}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onBack}
                      className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                        action.gradient
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-lg shadow-indigo-500/25"
                          : "bg-[var(--color-surface)] border-[var(--color-border)]"
                      }`}
                    >
                      <action.icon
                        className={`w-5 h-5 flex-shrink-0 ${action.gradient ? "" : "text-indigo-500"}`}
                      />
                      <div>
                        <p className="font-medium text-sm">{action.label}</p>
                        <p
                          className={`text-xs ${action.gradient ? "opacity-80" : "text-[var(--color-text-muted)]"}`}
                        >
                          {action.desc}
                        </p>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 ml-auto ${action.gradient ? "" : "text-[var(--color-text-muted)]"}`}
                      />
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Ask AI Mentor */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex justify-center"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onBack}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-medium hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                  Ask AI Mentor about your results
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
