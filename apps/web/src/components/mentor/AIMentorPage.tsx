import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Moon,
  Sun,
  ArrowLeft,
  Sparkles,
  Send,
  Lightbulb,
  GraduationCap,
  Brain,
  Stethoscope,
  BookOpen,
  AlertTriangle,
  Target,
  ChevronRight,
  Layers,
  HelpCircle,
  RotateCcw,
  Star,
  FileText,
  Zap,
} from "lucide-react";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";

// ─── Types ───────────────────────────────────────────────

type MentorMode = "teacher" | "exam" | "clinical" | "memory";

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  type?: "text" | "drug-card" | "comparison" | "clinical-case" | "concept-map";
  drugCard?: DrugCard;
  comparison?: ComparisonData;
  clinicalCase?: ClinicalCaseData;
  actions?: string[];
}

interface DrugCard {
  name: string;
  drugClass: string;
  mechanism: string;
  uses: string[];
  sideEffects: string[];
  contraindications: string[];
  memoryTip: string;
}

interface ComparisonData {
  drugA: string;
  drugB: string;
  rows: { label: string; valueA: string; valueB: string }[];
}

interface ClinicalCaseData {
  scenario: string;
  question: string;
  answer: string;
  keyLearning: string;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  topic: string;
}

// ─── Mentor Mode Config ──────────────────────────────────

const modeConfig: Record<
  MentorMode,
  {
    label: string;
    emoji: string;
    description: string;
    color: string;
    bg: string;
  }
> = {
  teacher: {
    label: "Teacher",
    emoji: "🎓",
    description: "Clear, step-by-step explanations",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/40",
  },
  exam: {
    label: "Exam Focus",
    emoji: "🎯",
    description: "High-yield info, common questions",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/40",
  },
  clinical: {
    label: "Clinical",
    emoji: "🏥",
    description: "Real patient connections",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
  },
  memory: {
    label: "Memory Coach",
    emoji: "🧠",
    description: "Mnemonics & recall tricks",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-900/40",
  },
};

// ─── Conversations ───────────────────────────────────────

const conversations: Conversation[] = [
  { id: "1", title: "Beta-Blockers MOA", date: "Today", topic: "Pharmacology" },
  {
    id: "2",
    title: "ACE vs ARB Comparison",
    date: "Today",
    topic: "Pharmacology",
  },
  {
    id: "3",
    title: "HTN Drug Classes",
    date: "Yesterday",
    topic: "Pharmacology",
  },
  {
    id: "4",
    title: "Drug Interactions Review",
    date: "2 days ago",
    topic: "Pharmacology",
  },
  {
    id: "5",
    title: "Clinical Cases - CHF",
    date: "3 days ago",
    topic: "Pathology",
  },
];

// ─── AI Response Generator ───────────────────────────────

function generateAIResponse(input: string, mode: MentorMode): ChatMessage {
  const lower = input.toLowerCase();

  // Beta blockers mechanism
  if (
    lower.includes("beta blocker") &&
    (lower.includes("mechanism") ||
      lower.includes("how") ||
      lower.includes("work"))
  ) {
    if (mode === "memory") {
      return {
        id: Date.now().toString(),
        role: "ai",
        content: "",
        type: "drug-card",
        drugCard: {
          name: "Beta-Blockers",
          drugClass: "Antiadrenergic (β-receptor antagonists)",
          mechanism:
            "Competitively block β-adrenergic receptors → ↓ cAMP → ↓ HR, ↓ contractility, ↓ renin release",
          uses: [
            "Hypertension",
            "Heart failure (HFrEF)",
            "Post-MI",
            "Arrhythmias",
            "Migraine prophylaxis",
            "Glaucoma (topical)",
          ],
          sideEffects: [
            "Bradycardia",
            "Hypotension",
            "Fatigue",
            "Bronchoconstriction (non-selective)",
            "Sexual dysfunction",
            "Masking hypoglycemia",
          ],
          contraindications: [
            "Asthma/COPD (non-selective)",
            "Severe bradycardia",
            "2nd/3rd degree heart block",
            "Cardiogenic shock",
          ],
          memoryTip:
            '"BETA" = Blocks Epinephrine Through Adrenoceptors. Non-selective hit both β1 ❤️ and β2 🫁 → asthma risk! Cardioselective = "SAFER" = Selective Affecting Functional End-organ Receptors.',
        },
        actions: ["Create Flashcards", "Compare Drugs", "Take Quiz"],
      };
    }
    return {
      id: Date.now().toString(),
      role: "ai",
      content: `Great question! Let me break down how beta-blockers work:\n\n**The Simple Version:**\nBeta-blockers are like putting a "Do Not Disturb" sign on your body's stress receptors. They block adrenaline (epinephrine) from binding to beta-receptors on your heart and blood vessels.\n\n**Step-by-Step Mechanism:**\n1. Normally, adrenaline binds to **β₁-receptors** on the heart → ↑ heart rate & contractility\n2. Beta-blockers **compete** with adrenaline for these receptors\n3. When blocked → **↓ heart rate**, **↓ contractility**, **↓ cardiac output**\n4. Also block **β₁ on kidneys** → **↓ renin release** → ↓ angiotensin II\n5. Net result: **↓ blood pressure** and **↓ cardiac workload**\n\n**The Key Distinction:**\n- **β₁ (cardioselective)** = heart & kidneys → "what you WANT to block"\n- **β₂ (non-selective)** = lungs & blood vessels → "what you DON'T want to block"\n\nThat's why **metoprolol** (selective β₁) is safer than **propranolol** (non-selective) in asthmatic patients.`,
      actions: [
        "Explain Simpler",
        "Create Mnemonic",
        "Compare Drugs",
        "Clinical Application",
      ],
    };
  }

  // Comparison
  if (
    (lower.includes("propranolol") && lower.includes("atenolol")) ||
    (lower.includes("difference") && lower.includes("beta"))
  ) {
    return {
      id: Date.now().toString(),
      role: "ai",
      content: "",
      type: "comparison",
      comparison: {
        drugA: "Propranolol",
        drugB: "Atenolol",
        rows: [
          {
            label: "Selectivity",
            valueA: "Non-selective (β₁ + β₂)",
            valueB: "Cardioselective (β₁)",
          },
          {
            label: "Lipid Solubility",
            valueA: "High (crosses BBB → CNS effects)",
            valueB: "Low (does NOT cross BBB)",
          },
          {
            label: "Half-life",
            valueA: "3-5 hours (short)",
            valueB: "6-7 hours (longer)",
          },
          {
            label: "Asthma Risk",
            valueA: "⚠️ HIGH — blocks β₂ in lungs",
            valueB: "✅ LOW — selective for β₁",
          },
          {
            label: "CNS Side Effects",
            valueA: "Nightmares, depression",
            valueB: "Minimal CNS effects",
          },
          {
            label: "HF Approved",
            valueA: "❌ Not approved",
            valueB: "❌ Not approved",
          },
          {
            label: "Uses",
            valueA: "Migraine, anxiety, portal HTN",
            valueB: "Hypertension, angina",
          },
          {
            label: "Memory Tip",
            valueA: '"PRO" = PROmiscuous (binds everything)',
            valueB: '"ATEN" = ATENtion on heart only',
          },
        ],
      },
      actions: ["Create Flashcards", "Clinical Application", "Take Quiz"],
    };
  }

  // Don't understand / simplify
  if (
    lower.includes("don't understand") ||
    lower.includes("simplify") ||
    lower.includes("confused") ||
    lower.includes("explain like") ||
    lower.includes("beginner")
  ) {
    return {
      id: Date.now().toString(),
      role: "ai",
      content: `No worries — let me make it super simple! 🎯\n\n**Think of it like a light switch:**\n\nYour heart has **switches** (receptors) that adrenaline presses to make the heart beat faster.\n\n🟢 **When adrenaline hits the switch:** Heart beats faster, pumps harder, blood pressure goes UP\n\n🔴 **Beta-blockers:** Put a cover over the switch so adrenaline can't press it → Heart slows down → Blood pressure goes DOWN\n\n**Two types of switches:**\n- **β₁ switches** = on the HEART ❤️ (what we usually want to block)\n- **β₂ switches** = on the LUNGS 🫁 (we usually DON'T want to block these — that's why some beta-blockers cause breathing problems)\n\n**Smart beta-blockers** (like metoprolol) only cover the heart switches → safer!\n**Old beta-blockers** (like propranolol) cover ALL switches → can cause breathing problems\n\nThat's really the core concept! Want me to go deeper or try a different angle?`,
      actions: [
        "Give Example",
        "Create Mnemonic",
        "Take Quiz",
        "Clinical Application",
      ],
    };
  }

  // Remember / mnemonic
  if (
    lower.includes("remember") ||
    lower.includes("mnemonic") ||
    lower.includes("memorize") ||
    lower.includes("memory trick")
  ) {
    return {
      id: Date.now().toString(),
      role: "ai",
      content: `Here are my best memory tricks for cardiovascular drugs! 🧠\n\n**1. Beta-Blocker Names (-olol):**\n>All beta-blockers end in **"-olol"** → "Oh Lol, my heart rate dropped!"\n\n**2. Which are cardioselective?**\n>**"ABCM"** = **A**tenolol, **B**isoprolol, **C**arvedilol*⚠️, **M**etoprolol\n>(*Carvedilol is actually non-selective + α₁ blocker, but starts with C to help you remember!)\n\n**3. Propranolol side effects:**\n>**"PRO"** = **P**robable **R**eally **O**bvious side effects:\n>- **P**rolonged bronchospasm (asthma)\n>- **R**ecurring nightmares (CNS)\n>- **O**rthostatic hypotension\n\n**4. ACE Inhibitor Cough:**\n>ACE = **"A**lways **C**auses **E**xpectoration" (dry cough, 20% of patients)\n\n**5. RAAS Pathway:**\n>**"L-K-L-A"** = **L**iver (angiotensinogen) → **K**idney (renin) → **L**ung (ACE) → **A**drenal (aldosterone)\n\n**6. PAB Contraindications for ACE:**\n>**P**regnancy, **A**ngioedema, **B**ilateral renal artery stenosis`,
      actions: [
        "Create Flashcards",
        "More Mnemonics",
        "Take Quiz",
        "Review Topic",
      ],
    };
  }

  // Clinical application
  if (
    lower.includes("clinical") ||
    lower.includes("patient") ||
    lower.includes("real") ||
    lower.includes("case")
  ) {
    return {
      id: Date.now().toString(),
      role: "ai",
      content: "",
      type: "clinical-case",
      clinicalCase: {
        scenario:
          "A 65-year-old man with a history of hypertension and type 2 diabetes presents to the ER with acute shortness of breath. His BP is 170/100 mmHg, HR 96, and he has bilateral crackles on auscultation. BNP is elevated at 800 pg/mL. He is currently taking hydrochlorothiazide 25mg daily.",
        question:
          "What is the most appropriate addition to his medication regimen?",
        answer:
          "Add an ACE inhibitor (e.g., lisinopril). This patient has acute decompensated heart failure with preserved EF likely, and uncontrolled hypertension with diabetes. ACE inhibitors are first-line because they: 1) Reduce afterload and preload, 2) Provide renal protection in diabetes, 3) Reduce mortality in HF, 4) Treat his uncontrolled hypertension.",
        keyLearning:
          'ACE inhibitors are the "Swiss Army knife" of cardiac drugs — they treat HTN + HF + diabetic nephropathy simultaneously. When a diabetic patient has ANY cardiac indication, think ACE inhibitor first.',
      },
      actions: ["More Cases", "Explain Simpler", "Create Flashcards"],
    };
  }

  // Exam focus
  if (
    lower.includes("exam") ||
    lower.includes("important") ||
    lower.includes("high yield") ||
    lower.includes("board")
  ) {
    return {
      id: Date.now().toString(),
      role: "ai",
      content: `🎯 **Top 5 Exam-Tested Concepts for CV Pharmacology:**\n\n**1. ACE Inhibitor Cough** → Bradykinin (NOT histamine) → Switch to ARB\n**2. Beta-blockers in HF** → Only carvedilol, metoprolol succinate, bisoprolol have mortality benefit\n**3. PAB Contraindications** → Pregnancy, Angioedema, Bilateral RAS for ACE inhibitors\n**4. NSAID + ACE inhibitor** → AKI risk ("Triple Whammy" with diuretic)\n**5. Propranolol in asthma** → ABSOLUTELY CONTRAINDICATED (non-selective → bronchospasm)\n\n**Board "Buzz Words" to Know:**\n- "Dry cough on enalapril" → Switch to losartan\n- "Bilateral crackles + diabetes" → ACE inhibitor\n- "Asthma + HTN" → Avoid propranolol, use metoprolol or atenolol\n- "ACE inhibitor + K+ 5.8" → Stop ACE, treat hyperkalemia\n- "First-dose hypotension" → Start low, go slow with ACE inhibitors\n\n**These appear on virtually every pharmacy board exam.** Master these first!`,
      actions: ["Take Quiz", "Review Weak Topics", "Create Flashcards"],
    };
  }

  // Default response
  return {
    id: Date.now().toString(),
    role: "ai",
    content: `That's a great question about **${input.slice(0, 50)}**!\n\nLet me help you understand this better. Based on your current lesson on **Adrenergic Drugs**, here's what you need to know:\n\nThis concept connects directly to the autonomic nervous system, which controls involuntary body functions like heart rate, blood pressure, and bronchial muscle tone.\n\n**Key Points:**\n• The sympathetic nervous system uses **adrenaline (epinephrine)** as its primary neurotransmitter\n• Adrenergic drugs either **stimulate** (agonists) or **block** (antagonists) these receptors\n• There are two main receptor types: **α (alpha)** and **β (beta)**\n\nWould you like me to:\n- Explain a specific concept in more detail?\n- Compare two drugs?\n- Give you a clinical example?\n- Create memory tricks to help you remember?`,
    actions: [
      "Explain Simpler",
      "Give Example",
      "Create Mnemonic",
      "Clinical Application",
    ],
  };
}

// ─── Initial Messages ────────────────────────────────────

const initialMessages: ChatMessage[] = [
  {
    id: "init-1",
    role: "ai",
    content: `Hi! 👋 I'm your AI study mentor.\n\nI already know you're studying **Pharmacology** — specifically **Adrenergic Drugs**. Your exam is in **7 days**.\n\nI've noticed you've been doing well with **drug mechanisms**, but **drug interactions** and **clinical applications** could use some review.\n\nAsk me anything — or try one of the quick actions below! 💡`,
  },
];

// ─── Main Component ──────────────────────────────────────

interface AIMentorPageProps {
  isDark: boolean;
  onToggleDark: () => void;
  onBack: () => void;
}

export function AIMentorPage({
  isDark,
  onToggleDark,
  onBack,
}: AIMentorPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<MentorMode>("teacher");
  const [showHistory, setShowHistory] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track active educational study time for AI mentor sessions
  useStudySessionTracker({
    activityType: "ai_tutor",
    enabled: true,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (text?: string) => {
    const msgText = text || inputValue;
    if (!msgText.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: msgText,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response
    const delay = 800 + Math.random() * 1200;
    setTimeout(() => {
      const aiMsg = generateAIResponse(msgText, mode);
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, delay);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
      {/* ─── HEADER ─── */}
      <header className="h-14 flex items-center justify-between px-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight">AI Mentor</h1>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Knows your lecture • Personalized
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Course Badge */}
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[var(--color-background)] text-xs">
            <span className="font-medium">📚 Pharmacology</span>
            <span className="text-[var(--color-text-muted)]">•</span>
            <span className="text-[var(--color-text-muted)]">
              Adrenergic Drugs
            </span>
            <span className="text-[var(--color-text-muted)]">•</span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              7 days to exam
            </span>
          </div>
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

      {/* ─── MAIN AREA ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT: History ─── */}
        {showHistory && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            className="hidden lg:flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0"
          >
            <div className="p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
                Conversations
              </h3>
              <motion.button
                whileHover={{ x: 2 }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium"
              >
                <Sparkles className="w-4 h-4" /> Current Session
              </motion.button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[var(--color-background)] transition-colors group"
                >
                  <p className="text-sm font-medium truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {conv.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {conv.topic} • {conv.date}
                  </p>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-[var(--color-border)]">
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                ← Hide sidebar
              </button>
            </div>
          </motion.aside>
        )}

        {!showHistory && (
          <button
            onClick={() => setShowHistory(true)}
            className="hidden lg:flex items-center px-2 border-r border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        )}

        {/* ─── CENTER: Chat ─── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mode Selector */}
          <div className="px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center gap-2 overflow-x-auto flex-shrink-0">
            {(
              Object.entries(modeConfig) as [
                MentorMode,
                (typeof modeConfig)[MentorMode],
              ][]
            ).map(([key, config]) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  mode === key
                    ? `${config.bg} ${config.color} ring-1 ring-current/20`
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-background)]"
                }`}
              >
                <span>{config.emoji}</span>
                {config.label}
              </motion.button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-6">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        msg.role === "ai"
                          ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                          : "bg-[var(--color-background)] border border-[var(--color-border)]"
                      }`}
                    >
                      {msg.role === "ai" ? (
                        <Sparkles className="w-4 h-4 text-white" />
                      ) : (
                        <span className="text-xs font-bold">SP</span>
                      )}
                    </div>

                    {/* Content */}
                    <div
                      className={`flex-1 min-w-0 ${msg.role === "user" ? "flex justify-end" : ""}`}
                    >
                      {msg.role === "user" ? (
                        <div className="inline-block max-w-[80%] px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl rounded-tr-sm">
                          <p className="text-sm leading-relaxed">
                            {msg.content}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Text Content */}
                          {msg.content && (
                            <div className="bg-[var(--color-surface)] rounded-2xl rounded-tl-sm border border-[var(--color-border)] p-5">
                              <div className="text-sm leading-relaxed prose-sm">
                                {msg.content.split("\n").map((line, i) => (
                                  <p key={i} className="mb-2 last:mb-0">
                                    {line.split("**").map((part, j) =>
                                      j % 2 === 1 ? (
                                        <strong
                                          key={j}
                                          className="font-semibold"
                                        >
                                          {part}
                                        </strong>
                                      ) : (
                                        part
                                      ),
                                    )}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Drug Card */}
                          {msg.type === "drug-card" && msg.drugCard && (
                            <DrugCardComponent card={msg.drugCard} />
                          )}

                          {/* Comparison Table */}
                          {msg.type === "comparison" && msg.comparison && (
                            <ComparisonTableComponent data={msg.comparison} />
                          )}

                          {/* Clinical Case */}
                          {msg.type === "clinical-case" && msg.clinicalCase && (
                            <ClinicalCaseComponent
                              caseData={msg.clinicalCase}
                            />
                          )}

                          {/* Actions */}
                          {msg.actions && msg.actions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.actions.map((action) => (
                                <motion.button
                                  key={action}
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => handleSend(action)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                                >
                                  {action === "Create Flashcards" && (
                                    <Layers className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Take Quiz" && (
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Compare Drugs" && (
                                    <Zap className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Clinical Application" && (
                                    <Stethoscope className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Explain Simpler" && (
                                    <Lightbulb className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Create Mnemonic" && (
                                    <Brain className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Give Example" && (
                                    <BookOpen className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Review Topic" && (
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  )}
                                  {action === "More Mnemonics" && (
                                    <Brain className="w-3.5 h-3.5" />
                                  )}
                                  {action === "More Cases" && (
                                    <Stethoscope className="w-3.5 h-3.5" />
                                  )}
                                  {action === "Review Weak Topics" && (
                                    <Target className="w-3.5 h-3.5" />
                                  )}
                                  {action}
                                </motion.button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing Indicator */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-2xl rounded-tl-sm border border-[var(--color-border)] px-5 py-4">
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ y: [0, -5, 0] }}
                            transition={{
                              duration: 0.5,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                            className="w-2 h-2 rounded-full bg-indigo-400"
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ─── INPUT AREA ─── */}
          <div className="flex-shrink-0 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
            {/* Quick Actions */}
            <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto pb-2">
              {[
                { icon: Lightbulb, label: "Explain Simpler" },
                { icon: BookOpen, label: "Give Example" },
                { icon: Brain, label: "Create Mnemonic" },
                { icon: Zap, label: "Compare Drugs" },
                { icon: Stethoscope, label: "Clinical Application" },
                { icon: Target, label: "Important for Exam?" },
                { icon: HelpCircle, label: "Generate Questions" },
                { icon: FileText, label: "Summarize This" },
                { icon: GraduationCap, label: "Explain Like I'm a Beginner" },
              ].map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleSend(action.label)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-background)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)] hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all whitespace-nowrap"
                >
                  <action.icon className="w-3.5 h-3.5" />
                  {action.label}
                </motion.button>
              ))}
            </div>

            {/* Input Row */}
            <div className="px-4 pb-4 flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask your ${modeConfig[mode].label} anything...`}
                  disabled={isTyping}
                  className="w-full py-3.5 pl-4 pr-12 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: Context Panel ─── */}
        {showContext && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            className="hidden lg:flex flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0 overflow-y-auto"
          >
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                  Context
                </h3>
                <button
                  onClick={() => setShowContext(false)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  Hide →
                </button>
              </div>

              {/* Current Lesson */}
              <ContextCard
                title="Current Lesson"
                icon={BookOpen}
                color="text-blue-500"
              >
                <p className="font-medium text-sm">Adrenergic Drugs</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Chapter 4 • Pharmacology
                </p>
                <div className="mt-2 h-1.5 bg-[var(--color-background)] rounded-full overflow-hidden">
                  <div className="h-full w-3/5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full" />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  60% complete
                </p>
              </ContextCard>

              {/* Related Concepts */}
              <ContextCard
                title="Related Concepts"
                icon={Sparkles}
                color="text-purple-500"
              >
                {[
                  "Sympathetic NS",
                  "α-Receptors",
                  "β-Receptors",
                  "Catecholamines",
                  "VASO",
                ].map((c) => (
                  <span
                    key={c}
                    className="inline-block px-2 py-1 rounded-lg bg-[var(--color-background)] text-xs mr-1 mb-1"
                  >
                    {c}
                  </span>
                ))}
              </ContextCard>

              {/* Weak Areas */}
              <ContextCard
                title="Weak Areas"
                icon={AlertTriangle}
                color="text-amber-500"
              >
                <div className="space-y-2">
                  {[
                    { topic: "Drug Interactions", accuracy: "45%" },
                    { topic: "Clinical Applications", accuracy: "58%" },
                    { topic: "Adverse Effects", accuracy: "62%" },
                  ].map((w) => (
                    <div
                      key={w.topic}
                      className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-background)]"
                    >
                      <span className="text-xs">{w.topic}</span>
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        {w.accuracy}
                      </span>
                    </div>
                  ))}
                </div>
              </ContextCard>

              {/* Recent Mistakes */}
              <ContextCard
                title="Recent Mistakes"
                icon={XCircleIcon}
                color="text-red-500"
              >
                <div className="space-y-2 text-xs text-[var(--color-text-muted)]">
                  <p>• Confused propranolol selectivity</p>
                  <p>• Missed ACE-NSAID interaction</p>
                  <p>• Incorrect PAB contraindication</p>
                </div>
              </ContextCard>

              {/* Recommended */}
              <ContextCard
                title="Recommended"
                icon={Star}
                color="text-emerald-500"
              >
                <div className="space-y-2">
                  {[
                    { label: "Review: Drug Interactions", icon: FileText },
                    { label: "25 Flashcards on β-Blockers", icon: Layers },
                    { label: "Quick Quiz: Chapter 4", icon: HelpCircle },
                  ].map((r) => (
                    <button
                      key={r.label}
                      className="w-full flex items-center gap-2 p-2 rounded-lg bg-[var(--color-background)] text-xs text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors group"
                    >
                      <r.icon className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-indigo-500" />
                      <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                        {r.label}
                      </span>
                    </button>
                  ))}
                </div>
              </ContextCard>
            </div>
          </motion.aside>
        )}

        {!showContext && (
          <button
            onClick={() => setShowContext(true)}
            className="hidden lg:flex items-center px-2 border-l border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] rotate-180" />
          </button>
        )}
      </div>

      {/* Proactive AI Suggestion Banner */}
      <ProactiveSuggestion onAction={handleSend} />
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────

function ContextCard({
  title,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function XCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function DrugCardComponent({ card }: { card: DrugCard }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <h4 className="font-bold text-lg">{card.name}</h4>
        <p className="text-sm opacity-90">{card.drugClass}</p>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Mechanism
          </p>
          <p className="text-sm leading-relaxed">{card.mechanism}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Uses
          </p>
          <div className="flex flex-wrap gap-1">
            {card.uses.map((u) => (
              <span
                key={u}
                className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs"
              >
                {u}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
        >
          {expanded ? "Show less ↑" : "Show side effects & contraindications ↓"}
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                  Side Effects
                </p>
                <ul className="space-y-1">
                  {card.sideEffects.map((s) => (
                    <li
                      key={s}
                      className="text-sm text-[var(--color-text-muted)] flex items-start gap-2"
                    >
                      <span className="text-red-400">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                  Contraindications
                </p>
                <ul className="space-y-1">
                  {card.contraindications.map((c) => (
                    <li
                      key={c}
                      className="text-sm text-[var(--color-text-muted)] flex items-start gap-2"
                    >
                      <span className="text-red-500">⛔</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Memory Tip
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] italic">
            {card.memoryTip}
          </p>
        </div>
      </div>
    </div>
  );
}

function ComparisonTableComponent({ data }: { data: ComparisonData }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <div className="grid grid-cols-3 text-xs font-semibold bg-[var(--color-background)]">
        <div className="p-3 border-b border-r border-[var(--color-border)]">
          Property
        </div>
        <div className="p-3 border-b border-r border-[var(--color-border)] text-indigo-600 dark:text-indigo-400">
          {data.drugA}
        </div>
        <div className="p-3 border-b border-[var(--color-border)] text-purple-600 dark:text-purple-400">
          {data.drugB}
        </div>
      </div>
      {data.rows.map((row, i) => (
        <div
          key={row.label}
          className={`grid grid-cols-3 text-sm ${i % 2 === 0 ? "" : "bg-[var(--color-background)]"}`}
        >
          <div className="p-3 border-b border-r border-[var(--color-border)] font-medium text-xs text-[var(--color-text-muted)]">
            {row.label}
          </div>
          <div className="p-3 border-b border-r border-[var(--color-border)]">
            {row.valueA}
          </div>
          <div className="p-3 border-b border-[var(--color-border)]">
            {row.valueB}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClinicalCaseComponent({ caseData }: { caseData: ClinicalCaseData }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Stethoscope className="w-4 h-4" />
          <span className="font-semibold text-sm">Clinical Case</span>
        </div>
        <p className="text-sm opacity-95 leading-relaxed">
          {caseData.scenario}
        </p>
      </div>
      <div className="p-4">
        <p className="font-semibold text-sm mb-3">{caseData.question}</p>
        {!revealed ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setRevealed(true)}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium text-sm"
          >
            Reveal Answer
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                ✅ Answer
              </p>
              <p className="text-sm leading-relaxed">{caseData.answer}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
                💡 Key Learning
              </p>
              <p className="text-sm leading-relaxed">{caseData.keyLearning}</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ProactiveSuggestion({
  onAction,
}: {
  onAction: (text: string) => void;
}) {
  const messages = [
    {
      text: "You seem to confuse beta blockers and calcium channel blockers. Want a comparison?",
      action: "Compare beta blockers and calcium channel blockers",
    },
    {
      text: "You've been studying for 45 minutes. Want a quick 5-question review?",
      action: "Generate Questions on adrenergic drugs",
    },
    {
      text: "Your exam is in 7 days. I recommend focusing on drug interactions today.",
      action: "Review Drug Interactions",
    },
  ];
  const [idx, setIdx] = useState(0);
  const msg = messages[idx];

  useEffect(() => {
    const interval = setInterval(
      () => setIdx((prev) => (prev + 1) % messages.length),
      15000,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 2 }}
      className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-pink-950/30 border-t border-[var(--color-border)]"
    >
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <p className="text-xs text-[var(--color-text-muted)] flex-1">
          💡{" "}
          <strong className="text-[var(--color-text)]">AI Suggestion:</strong>{" "}
          {msg.text}
        </p>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction(msg.action)}
          className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-[var(--color-border)] hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors whitespace-nowrap"
        >
          Yes, please
        </motion.button>
        <button
          onClick={() => setIdx((prev) => (prev + 1) % messages.length)}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
