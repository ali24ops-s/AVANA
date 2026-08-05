import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Brain,
  Lightbulb,
  Target,
  Wand2,
  Send,
  User,
} from "lucide-react";

interface AIMentorProps {
  lessonTitle: string;
}

interface ChatMessage {
  id: number;
  type: "ai" | "user";
  content: string;
}

const quickActions = [
  {
    icon: Lightbulb,
    label: "Explain Simpler",
    prompt: "Explain this concept in simpler terms",
  },
  {
    icon: Target,
    label: "Give Example",
    prompt: "Give me a clinical example of this",
  },
  {
    icon: Brain,
    label: "Clinical Application",
    prompt: "How would this be used clinically?",
  },
  {
    icon: Wand2,
    label: "Memory Trick",
    prompt: "Create a memory trick for this topic",
  },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    type: "ai",
    content: `Hi! I'm your AI study mentor. I've already analyzed your lecture on **${"ACE Inhibitors & ARBs"}**. I can help you understand concepts, give examples, or create mnemonics. What would you like to explore?`,
  },
];

const aiResponses: Record<string, string[]> = {
  "Explain this concept in simpler terms": [
    "**ACE inhibitors** are like opening a water valve that was stuck closed. Imagine your blood vessels are garden hoses:\n\n• **High BP** = hose is squeezed tight\n• **ACE inhibitors** relax the squeeze\n• **Result** = easier blood flow + less heart strain",
    'Think of ACE as a **"pressure builder enzyme"**: It makes your body hold onto salt and water (like a dam). ACE inhibitors put holes in the dam → more fluid flows out → lower pressure.',
    'Simple analogy: **ACE inhibitors** unlock the "tight door" in your blood vessels, letting them open wider. This means:\n\n✅ Blood flows easier\n✅ Heart works less hard\n✅ Blood pressure drops',
  ],
  "Give me a clinical example of this": [
    "📋 **Clinical Case Example:**\n\n*Patient:* Sarah, 58-year-old with hypertension and diabetes.\n\n*Prescription:* Lisinopril 10mg daily\n\n*Why?*\n1. First-line for HTN ✓\n2. **Renoprotective** - protects diabetic kidneys ✓\n3. Reduces cardiovascular risk ✓\n\n*Outcome after 6 weeks:* BP 158/92 → 132/84, albuminuria decreased by 35%",
    "**Real-world Scenario:**\n\nA 65-year-old man presents with post-MI heart failure (LVEF 32%). \n\n**Action:** Start lisinopril (or ramipril) within 24 hours if stable.\n\n**Why not other drugs first?**\n- Only ACEi/ARB have mortality benefit in HFrEF\n- Beta-blockers added second\n- MRAs added third (if still symptomatic)",
  ],
  "How would this be used clinically?": [
    "## Clinical Applications of ACE Inhibitors\n\n### 1️⃣ **Hypertension (First-line)**\n• Monotherapy in stage 1 HTN\n• Combined with CCB or thiazide in stage 2\n• Preferred in patients with diabetes or CKD\n\n### 2️⃣ **Heart Failure with Reduced EF**\n• Class I recommendation (ACC/AHA)\n• Reduces hospitalization risk by ~30%\n• Improves survival (mortality reduction)\n\n### 3️⃣ **Post-Myocardial Infarction**\n• Start within 24 hours if stable\n• Proven to reduce remodeling\n\n### 4️⃣ **Diabetic Nephropathy**\n• Reduces proteinuria even at subtherapeutic doses\n• Slows CKD progression",
  ],
  "Create a memory trick for this topic": [
    '## 🧠 Memory Trick: The PRIL Family Tree\n\n```\n                    CAPTOPRIL (The Patriarch)\n                           │\n          ┌──────────────┼──────────────┐\n          │              │              │\n        ENALA        LISINOPRIL      RAMIPRIL\n         ▲              ▲              ▲\n         │              │              │\n     (needs          (no prodrug)   (best for\n    activation)                   post-MI)\n```\n\n**Remember:**\n- **CAPtopril** = Shortest acting, needs frequent dosing\n- **LISINopril** = No "prodrug", works directly\n- **RAMIpril** = Post-MI RAM (Rescue After MI)',
    "**Mnemonic: A.C.E. = All Can Eat? No! → Adverse Effects Checklist**\n\n☁️ **C**ough (due to bradykinin)\n💨 **E**dema (angioedema - rare but serious)\n🔬 **Hyperkalemia** (don't combine with K+ sparing diuretics)\n\n**The \"Don'ts\":**\n❌ Don't use in **Pregnancy** Category D\n❌ Don't use in **Bilateral Renal Artery Stenosis**\n❌ Be careful with **NSAIDs** (reduces efficacy)",
  ],
};

export function AIMentor({ lessonTitle }: AIMentorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleQuickAction = async (action: (typeof quickActions)[0]) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now(),
      type: "user",
      content: action.label,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Simulate AI thinking
    setIsTyping(true);

    setTimeout(
      () => {
        // Get response from pool
        const responses =
          aiResponses[action.label] ||
          aiResponses["Explain this concept in simpler terms"];
        const randomResponse =
          responses[Math.floor(Math.random() * responses.length)];

        const aiMessage: ChatMessage = {
          id: Date.now() + 1,
          type: "ai",
          content: randomResponse,
        };

        setMessages((prev) => [...prev, aiMessage]);
        setIsTyping(false);
      },
      1200 + Math.random() * 800,
    );
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      type: "user",
      content: inputValue,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    // Generate contextual response based on input
    setIsTyping(true);
    setTimeout(() => {
      let response = `Great question! Based on the lecture about **${lessonTitle}**, here's what I can tell you:\n\n`;

      if (
        inputValue.toLowerCase().includes("side effect") ||
        inputValue.toLowerCase().includes("adverse")
      ) {
        response += `**Common Side Effects:** Dry cough (up to 20% of patients), dizziness, hyperkalemia, hypotension.\n\n**Serious but Rare:** Angioedema (<1%), anaphylaxis, agranulocytosis.`;
      } else if (
        inputValue.toLowerCase().includes("compare") ||
        inputValue.toLowerCase().includes("difference")
      ) {
        response += `**ACE vs ARB Comparison:**\n\n| Feature | ACE | ARB |\n|---------|-----|-----|\n| Mechanism | Block ACE | Block AT₁ receptor |\n| Bradykinin ↑ | Yes | No |\n| Cough | Common | Rare |\n| Angioedema | Slightly higher | Slightly lower |\n| Mortality benefit | Strong | Good (but not equal) |`;
      } else {
        response += `This is a key concept that appears frequently on pharmacy board exams. Would you like me to:\n\n1. Give you a **clinical example**?\n2. Create a **memory trick**?\n3. Show **exam tips** for this topic?`;
      }

      const aiMessage: ChatMessage = {
        id: Date.now() + 1,
        type: "ai",
        content: response,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <aside className="w-[340px] flex-shrink-0 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Mentor</h3>
            <p className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Online • Analyzed lecture
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-muted)] mb-2 px-1">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map((action) => (
            <motion.button
              key={action.label}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleQuickAction(action)}
              disabled={isTyping}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-colors ${
                isTyping
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600"
              }`}
            >
              <action.icon className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span className="text-xs font-medium truncate">
                {action.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${message.type === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  message.type === "ai"
                    ? "bg-gradient-to-br from-indigo-500 to-purple-500"
                    : "bg-[var(--color-background)]"
                }`}
              >
                {message.type === "ai" ? (
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                ) : (
                  <User className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] rounded-xl p-3 ${
                  message.type === "ai"
                    ? "bg-[var(--color-background)]"
                    : "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                }`}
              >
                <div
                  className={`text-sm leading-relaxed whitespace-pre-wrap ${
                    message.type === "ai"
                      ? "prose prose-sm prose-slate dark:prose-invert max-w-none"
                      : ""
                  }`}
                >
                  {message.content
                    .split("**")
                    .map((part, i) =>
                      i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
                    )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-2"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-[var(--color-background)] rounded-xl p-3">
                <div className="flex gap-1.5">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{
                        duration: 0.6,
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

      {/* Input Area */}
      <div className="p-3 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Ask anything..."
            className="flex-1 py-2.5 px-4 bg-[var(--color-background)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-shadow"
            disabled={isTyping}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)] text-center">
          AI knows your lecture context. Ask specific questions.
        </p>
      </div>
    </aside>
  );
}
