import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Target,
  Award,
  BookOpen,
  Brain,
  Sparkles,
  ChevronRight,
} from "lucide-react";

interface Lesson {
  id: number;
  title: string;
  status: "completed" | "current" | "upcoming";
  duration: string;
}

interface LessonContentProps {
  lesson: Lesson;
  totalLessons: number;
  onPrevLesson: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  onCompleteLesson: (id: number) => void;
}

// Pharmacy content for ACE Inhibitors
const lessonContent = {
  title: "ACE Inhibitors & ARBs",
  subtitle:
    "Angiotensin-Converting Enzyme Inhibitors and Angiotensin Receptor Blockers",
  introduction: `ACE inhibitors represent one of the most important drug classes in cardiovascular pharmacology. These medications fundamentally changed how we treat hypertension and heart failure, earning their place among the top prescribed drugs worldwide.`,

  objectives: [
    "Understand the mechanism of action of ACE inhibitors and ARBs",
    "Identify key pharmacokinetic properties of common agents",
    "Recognize clinical indications for both drug classes",
    "Differentiate between first-line and second-generation agents",
    "Anticipate and manage common adverse effects",
  ],

  sections: [
    {
      type: "explanation",
      title: "Mechanism of Action",
      content: `ACE inhibitors work by blocking the angiotensin-converting enzyme (ACE), which normally converts Angiotensin I to Angiotensin II. This leads to:

**Primary Effects:**
- Decreased peripheral vascular resistance (vasodilation)
- Reduced aldosterone secretion → decreased Na⁺/H₂O retention
- Decreased sympathetic nervous system activity

**The RAAS Cascade Breakdown:**
1. Renin converts Angiotensinogen → Angiotensin I
2. **ACE converts Angiotensin I → Angiotensin II** ← THIS IS BLOCKED
3. Angiotensin II causes vasoconstriction & aldosterone release`,
      highlight: {
        icon: "🔬",
        text: "Key Point: ACE inhibitors also prevent breakdown of bradykinin, a vasodilator that contributes to some side effects like cough.",
      },
    },
    {
      type: "diagram",
      title: "RAAS Pathway Visual",
      content: null,
      diagramType: "rass",
    },
    {
      type: "explanation",
      title: "Clinical Indications",
      content: `ACE inhibitors are considered **first-line therapy** for multiple conditions:

| Condition | Evidence Level | Notes |
|-----------|---------------|-------|
| Hypertension | A (Strong) | Especially with comorbidities |
| Heart Failure (HFrEF) | A (Strong) | Reduces mortality |
| Post-MI | A (Strong) | Within 24 hours if stable |
| Diabetic Nephropathy | A (Strong) | Albuminuria reduction |
| CKD (non-diabetic) | B (Moderate) | Proteinuric kidney disease |

**ARBs** are used when ACE inhibitors are not tolerated (cough, angioedema).`,
    },
    {
      type: "clinical",
      title: "Clinical Pearl 💎",
      content: `"When choosing between an ACE inhibitor and ARB in heart failure, always try ACE inhibitor first unless contraindicated. The mortality benefit is more robust with ACE inhibitors due to bradykinin potentiation." — ACC/AHA Guidelines 2024`,
    },
    {
      type: "mistake",
      title: "Common Exam Mistakes",
      items: [
        "Confusing ACE inhibitors with beta-blockers (they have completely different mechanisms)",
        "Thinking ARBs cause dry cough (they don't!)",
        "Forgetting that both classes require renal function monitoring",
        "Not knowing that lisinopril doesn't need prodrug activation",
        "Missing that ACE inhibitors are teratogenic (pregnancy category D)",
      ],
    },
    {
      type: "examTip",
      title: "Exam Tips 📝",
      tips: [
        '"If a patient develops cough on enalapril → Switch to losartan (an ARB)"',
        '"ACE + NSAID = Increased AKI risk (both reduce renal blood flow)"',
        '"First-dose hypotension is more likely if volume-depleted"',
        '"Bilateral renal artery stenosis = Contraindication"',
      ],
    },
    {
      type: "memoryTrick",
      title: "Memory Trick: The PRIL Names",
      trick: `**"PRIL" stands for "Pressure Reduction Is Logical"**

All ACE inhibitors end in "-pril":
• Captopril (first one, short-acting)
• Enalapril (prodrug)
• Lisinapril → No! It's **Lisinopril**
• Ramipril (first choice for post-MI)`,
    },
  ],
};

export function LessonContent({
  lesson,
  totalLessons,
  onPrevLesson,
  canGoPrev,
  canGoNext,
  onCompleteLesson,
}: LessonContentProps) {
  const [showSummary, setShowSummary] = useState(false);

  const handleCompleteAndContinue = () => {
    setShowSummary(true);
    setTimeout(() => {
      onCompleteLesson(lesson.id);
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-6">
        <span>Cardiovascular Pharmacology</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[var(--color-text)] font-medium">
          Lesson {lesson.id}
        </span>
      </nav>

      {/* Title Section */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        {/* Lesson Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-4">
          <BookOpen className="w-4 h-4" />
          Lesson {lesson.id} of {totalLessons}
          <span className="text-indigo-500">•</span>
          {lesson.duration}
        </div>

        <h1 className="text-4xl font-bold leading-tight mb-3">
          {lessonContent.title}
        </h1>
        <p className="text-xl text-[var(--color-text-muted)]">
          {lessonContent.subtitle}
        </p>

        {/* Reading Progress */}
        <div className="mt-6 flex items-center gap-4">
          <div className="flex-1 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div className="w-2/5 h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            ~{Math.round((2 / 5) * 100)}% complete
          </span>
        </div>
      </motion.header>

      {/* Introduction */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="prose prose-lg dark:prose-invert max-w-none mb-10"
      >
        <p className="text-lg leading-relaxed">{lessonContent.introduction}</p>
      </motion.section>

      {/* Learning Objectives */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-2xl p-6 mb-10 border border-emerald-200/50 dark:border-emerald-800/30"
      >
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
            Learning Objectives
          </h2>
        </div>
        <ul className="space-y-2">
          {lessonContent.objectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </motion.section>

      {/* Content Sections */}
      <div className="space-y-8">
        {lessonContent.sections.map((section, index) => (
          <motion.section
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.08 }}
            className={`rounded-2xl border p-6 ${
              section.type === "clinical"
                ? "bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200/50 dark:border-blue-800/30"
                : section.type === "mistake"
                  ? "bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border-red-200/50 dark:border-red-800/30"
                  : section.type === "examTip"
                    ? "bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200/50 dark:border-purple-800/30"
                    : section.type === "memoryTrick"
                      ? "bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200/50 dark:border-yellow-800/30"
                      : "bg-[var(--color-surface)] border-[var(--color-border)]"
            }`}
          >
            {/* Section Header */}
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              {section.type === "clinical" && (
                <Award className="w-5 h-5 text-blue-500" />
              )}
              {section.type === "mistake" && (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              )}
              {section.type === "examTip" && (
                <Lightbulb className="w-5 h-5 text-purple-500" />
              )}
              {section.type === "memoryTrick" && (
                <Brain className="w-5 h-5 text-amber-500" />
              )}
              {section.title}
            </h3>

            {/* Section Content */}
            {section.content && (
              <div className="prose prose-gray dark:prose-invert max-w-none space-y-4">
                {section.content.split("\n\n").map((paragraph, pIndex) => {
                  // Check if it's a table-like section
                  if (paragraph.includes("|")) {
                    return (
                      <div key={pIndex} className="my-4 overflow-x-auto rounded-2xl border-2 border-[var(--color-border)] shadow-xs bg-[var(--color-surface)]">
                        <table className="w-full text-sm border-collapse text-right" dir="rtl">
                          <thead className="bg-[var(--color-surface-warm)] border-b-2 border-[var(--color-border)]">
                            <tr>
                              {paragraph
                                .split("\n")[0]
                                .split("|")
                                .filter(Boolean)
                                .map((cell, cIndex) => (
                                  <th
                                    key={cIndex}
                                    className="py-3 px-4 text-right font-extrabold text-[var(--color-text)]"
                                  >
                                    {cell.trim()}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--color-border)]">
                            {paragraph
                              .split("\n")
                              .slice(2)
                              .filter((row) => row.includes("|"))
                              .map((row, rIndex) => (
                                <tr
                                  key={rIndex}
                                  className="hover:bg-[var(--color-surface-warm)] transition-colors"
                                >
                                  {row
                                    .split("|")
                                    .filter(Boolean)
                                    .map((cell, cIndex) => (
                                      <td key={cIndex} className="py-3 px-4 text-right text-[var(--color-text)] border-b border-[var(--color-border)]">
                                        {cell.trim()}
                                      </td>
                                    ))}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  return (
                    <p key={pIndex} className="leading-relaxed">
                      {paragraph
                        .split("**")
                        .map((part, i) =>
                          i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
                        )}
                    </p>
                  );
                })}
              </div>
            )}

            {/* List Items (for mistakes/tips) */}
            {section.items && (
              <ul className="space-y-3 mt-4">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 bg-white/50 dark:bg-black/20 rounded-lg p-3"
                  >
                    <span
                      className={`font-bold ${section.type === "mistake" ? "text-red-500" : "text-purple-500"}`}
                    >
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Tips Array */}
            {section.tips && (
              <ul className="space-y-3 mt-4">
                {section.tips.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 bg-white/50 dark:bg-black/20 rounded-lg p-3"
                  >
                    <Sparkles className="w-4 h-4 text-purple-500 mt-1 flex-shrink-0" />
                    <span className="italic">{tip}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Memory Trick Special */}
            {section.trick && (
              <div className="mt-4 bg-amber-100/60 dark:bg-amber-900/30 rounded-xl p-4 border border-amber-300/50 dark:border-amber-700/50">
                <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed">
                  {section.trick}
                </pre>
              </div>
            )}

            {/* Highlight Box */}
            {section.highlight && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                whileHover={{ scale: 1.01 }}
                className="mt-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-4 border-l-4 border-indigo-500"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{section.highlight.icon}</span>
                  <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                    {section.highlight.text}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Diagram placeholder for RAAS pathway */}
            {section.diagramType === "rass" && (
              <div className="mt-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center text-center text-sm">
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg font-semibold">
                    Renin
                  </div>
                  <ArrowRight className="w-5 h-5 mx-auto" />
                  <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-lg font-semibold">
                    ATG-I
                  </div>
                  <div className="relative">
                    <ArrowRight className="w-5 h-5 mx-auto" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg font-bold scale-75 origin-center">
                        ACE ✓
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-lg font-semibold line-through opacity-50">
                    AT-II
                  </div>
                  <div className="col-span-full my-2 text-xs text-[var(--color-text-muted)]">
                    ✓ Blocked by ACE Inhibitor
                  </div>

                  <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-lg col-span-3 md:col-span-2">
                    <p className="font-semibold text-blue-800 dark:text-blue-200">
                      ↓ Aldosterone
                    </p>
                    <p className="text-xs mt-1">↓ Na⁺ reabsorption</p>
                  </div>
                  <ArrowRight className="w-5 h-5 rotate-90 md:rotate-0 hidden md:block" />
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg col-span-3 md:col-span-2">
                    <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                      ↑ Bradykinin
                    </p>
                    <p className="text-xs mt-1">Vasodilation</p>
                  </div>
                  <ArrowRight className="w-5 h-5 rotate-90 md:rotate-0 hidden md:block" />
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-lg col-span-3 md:col-span-2">
                    <p className="font-semibold text-purple-800 dark:text-purple-200">
                      ↓ Blood Pressure
                    </p>
                    <p className="text-xs mt-1">⬇️ BP effect</p>
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        ))}
      </div>

      {/* Mini Summary */}
      <AnimatePresence>
        {showSummary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 text-white mt-8">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-8 h-8" />
                <h3 className="text-xl font-bold">Lesson Complete!</h3>
              </div>
              <p className="opacity-90 mb-4">
                Great progress! You've learned about ACE inhibitors mechanism,
                clinical uses, and important adverse effects.
              </p>
              <div className="flex gap-4 text-sm">
                <span>📚 Key Concepts: 12</span>
                <span>🎯 Ready for Quiz</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-between mt-10 pt-6 border-t border-[var(--color-border)]"
      >
        <motion.button
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.98 }}
          onClick={onPrevLesson}
          disabled={!canGoPrev}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
            canGoPrev
              ? "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
              : "opacity-40 cursor-not-allowed bg-transparent"
          }`}
        >
          <ArrowLeft className="w-5 h-5" />
          Previous Lesson
        </motion.button>

        <motion.button
          whileHover={{ x: 3 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCompleteAndContinue}
          disabled={!canGoNext}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold shadow-lg transition-all ${
            canGoNext
              ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:shadow-indigo-500/25"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white cursor-default"
          }`}
        >
          {canGoNext ? (
            <>
              Complete & Continue
              <ArrowRight className="w-5 h-5" />
            </>
          ) : (
            <>
              Complete Lesson
              <CheckCircle2 className="w-5 h-5" />
            </>
          )}
        </motion.button>
      </motion.div>

      {/* Spacer for bottom bar */}
      <div className="h-20" />
    </div>
  );
}
