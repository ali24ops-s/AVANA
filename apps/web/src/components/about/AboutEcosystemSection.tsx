import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "./shared/SectionHeading.js";
import {
  Layers,
  BookOpen,
  Brain,
  CreditCard,
  RotateCw,
  FileCheck2,
  LineChart,
  Bot,
  Sparkles,
  Link as LinkIcon,
} from "lucide-react";

interface EcosystemNode {
  id: string;
  title: string;
  enTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  accentClass: string;
  connectedTo: string[]; // IDs of related nodes in the systemic pipeline
  roleInSystem: string;
  description: string;
}

const ECOSYSTEM_NODES: EcosystemNode[] = [
  {
    id: "content",
    title: "محتوای ساختاریافته",
    enTitle: "Content Repository",
    icon: BookOpen,
    color: "#38bdf8",
    accentClass: "border-sky-500/40 bg-sky-950/40 text-sky-300",
    connectedTo: ["learning", "ai_assistant"],
    roleInSystem: "ورودی دانش: تبدیل رفرنس‌های حجیم به فصول و درسنامه‌های تفکیک‌شده.",
    description: "هر مبحث داروسازی از فارماکولوژی تا شیمی دارویی به صورت منظم و استاندارد پایه‌ریزی می‌شود تا یادگیری روی پایه‌های استوار بنا شود.",
  },
  {
    id: "learning",
    title: "یادگیری عمیق",
    enTitle: "Deep Learning Hub",
    icon: Brain,
    color: "#2dd4bf",
    accentClass: "border-teal-500/40 bg-teal-950/40 text-teal-300",
    connectedTo: ["content", "flashcards", "ai_assistant"],
    roleInSystem: "پردازش شناختی: مطالعه متن، نکات تفسیری و مکانیسم‌های بالینی.",
    description: "مطالعه مفهومی بدون حواشی اضافی با محیط مطالعه تاریک و فونت استاندارد که تمرکز ذهنی دانشجو را به حداکثر می‌رساند.",
  },
  {
    id: "flashcards",
    title: "فلش‌کارت‌های فعال",
    enTitle: "Active Recall Cards",
    icon: CreditCard,
    color: "#a855f7",
    accentClass: "border-purple-500/40 bg-purple-950/40 text-purple-300",
    connectedTo: ["learning", "smart_review"],
    roleInSystem: "استخراج حافظه: تبدیل مفاهیم مطالعه‌شده به پرسش‌وپاسخ‌های سریع.",
    description: "برای جلوگیری از توهم یادگیری (Illusion of Competence)، دانشجو آموخته‌های خود را در قالب کارت‌های دورو می‌سنجد.",
  },
  {
    id: "smart_review",
    title: "مرور تطبیقی",
    enTitle: "Spaced Repetition",
    icon: RotateCw,
    color: "#ec4899",
    accentClass: "border-pink-500/40 bg-pink-950/40 text-pink-300",
    connectedTo: ["flashcards", "exams", "analytics"],
    roleInSystem: "تثبیت ماندگار: پیشنهاد زمان‌بندی مرور درست قبل از فراموشی.",
    description: "الگوریتم هوشمند با توجه به سطح دشواری هر کارت، بازه‌های مرور ۲۴ ساعت، ۳ روز، ۱ هفته و ۱ ماه را به طور خودکار تنظیم می‌کند.",
  },
  {
    id: "exams",
    title: "آزمون‌ساز استاندارد",
    enTitle: "Adaptive Exams",
    icon: FileCheck2,
    color: "#eab308",
    accentClass: "border-amber-500/40 bg-amber-950/40 text-amber-300",
    connectedTo: ["smart_review", "analytics", "ai_assistant"],
    roleInSystem: "سنجش عملکرد: شبیه‌سازی آزمون‌های کلاسی و جامع با تحلیل گزینه‌ها.",
    description: "آزمون‌های زمان‌دار و استاندارد برای سنجش آمادگی امتحانات با پاسخنامه تشریحی و تفکیک مبحثی.",
  },
  {
    id: "analytics",
    title: "تحلیل مسیر و پیشرفت",
    enTitle: "Study Analytics",
    icon: LineChart,
    color: "#10b981",
    accentClass: "border-emerald-500/40 bg-emerald-950/40 text-emerald-300",
    connectedTo: ["exams", "learning"],
    roleInSystem: "بازخورد هوشمند: نمایش نقاط قوت، فصول نیازمند مرور و ساعات مطالعه.",
    description: "داشبورد تحلیلی به دانشجو نشان می‌دهد در کدام فارماکولوژی یا فیزیولوژی مسلط است و در کدام مبحث نیاز به تقویت دارد.",
  },
  {
    id: "ai_assistant",
    title: "دستیار هوشمند تحصیلی",
    enTitle: "AI Copilot Layer",
    icon: Bot,
    color: "#6366f1",
    accentClass: "border-indigo-500/40 bg-indigo-950/40 text-indigo-300",
    connectedTo: ["content", "learning", "exams"],
    roleInSystem: "همراه همیشگی: لایه هوش مصنوعی برای توضیح تداخلات و پاسخ به سوالات.",
    description: "در هر بخش از درس اگر با مبحثی چالش داشتید، دستیار هوشمند آوانا بلافاصله با مثال‌های بالینی و ساده به رفع ابهام می‌پردازد.",
  },
];

export const AboutEcosystemSection: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("learning");

  const activeNode =
    ECOSYSTEM_NODES.find((n) => n.id === selectedNodeId) || ECOSYSTEM_NODES[0];

  return (
    <section
      id="ecosystem"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش اکوسیستم سیستم یادگیری یکپارچه آوانا"
    >
      {/* Background Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Heading */}
      <SectionHeading
        badge="اکوسیستم شناختی"
        badgeIcon={<Layers className="w-4 h-4 text-teal-300" />}
        title="آوانا چگونه فکر می‌کند؟"
        highlightText="یک سیستم یادگیری یکپارچه"
        subtitle="قابلیت‌های آوانا ابزارهای پراکنده نیستند؛ بلکه زنجیره‌ای به هم‌پیوسته از ساختار دانش، یادگیری فعال، مرور هوشمند و سنجش عملکرد هستند."
      />

      {/* System Flow Diagram & Interactive Orbit Map */}
      <div className="max-w-5xl mx-auto rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 sm:p-8 shadow-xs">
        {/* Pipeline Navigation Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-6 pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#008080]" />
            <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
              روی هر بخش کلیک کنید تا ارتباط آن را با کل اکوسیستم ببینید:
            </span>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            {activeNode.connectedTo.length} اتصال فعال سیستمی
          </span>
        </div>

        {/* Nodes Grid / Neural Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-8" role="tablist" aria-label="اجزای اکوسیستم آوانا">
          {ECOSYSTEM_NODES.map((node) => {
            const Icon = node.icon;
            const isSelected = node.id === selectedNodeId;
            const isConnected = activeNode.connectedTo.includes(node.id);

            return (
              <button
                key={node.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedNodeId(node.id)}
                className={`p-3 rounded-[12px] border flex flex-col items-center gap-2 text-center transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] ${
                  isSelected
                    ? "bg-[#008080]/15 border-[#008080] shadow-xs scale-105 z-10"
                    : isConnected
                    ? "bg-teal-50 border-teal-300 text-teal-800"
                    : "bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[#008080]/40 hover:text-[var(--color-text)]"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-[8px] flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-[#008080] text-white font-bold shadow-xs"
                      : isConnected
                      ? "bg-[#008080]/15 text-[#008080] border border-[#008080]/30"
                      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-bold leading-tight ${
                    isSelected ? "text-[#008080]" : isConnected ? "text-teal-800" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {node.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Detail Card for Active System Node */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeNode.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="rounded-[16px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-6 sm:p-8 relative overflow-hidden shadow-xs"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-[10px] bg-[#008080]/10 border border-[#008080]/25 text-[#008080] flex items-center justify-center shrink-0 shadow-xs">
                  <activeNode.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[var(--color-text)]">{activeNode.title}</h3>
                  <span className="text-xs text-[#008080] font-sans">{activeNode.enTitle}</span>
                </div>
              </div>

              {/* Interconnection Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-[#008080]" />
                  <span>متصل به:</span>
                </span>
                {activeNode.connectedTo.map((targetId) => {
                  const target = ECOSYSTEM_NODES.find((n) => n.id === targetId);
                  if (!target) return null;
                  return (
                    <span
                      key={targetId}
                      className="px-2.5 py-1 rounded-[6px] text-xs font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/25"
                    >
                      {target.title}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-[10px] bg-[#008080]/10 border border-[#008080]/20 text-xs sm:text-sm text-[#008080]">
                <strong className="text-[var(--color-text)] font-bold ml-1.5">نقش در سیستم آوانا:</strong>
                {activeNode.roleInSystem}
              </div>

              <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed">
                {activeNode.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};
