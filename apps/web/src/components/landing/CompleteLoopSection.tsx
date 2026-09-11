/**
 * Complete AVANA Loop Section — Signature Brand Visual.
 *
 * Core Cycle:
 * منبع -> یادگیری -> تمرین -> مرور -> آوانا (در مرکز)
 *
 * Clean, memorable, orbital composition with smooth SVG connecting curves.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  BookOpen,
  FileCheck2,
  Clock,
  Sparkles,
} from "lucide-react";

interface LoopNode {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  icon: typeof FileText;
  positionClass: string;
  color: string;
  bgLight: string;
  borderLight: string;
}

const loopNodes: LoopNode[] = [
  {
    id: "source",
    title: "۱. منبع درسی",
    subtitle: "PDF، جزوه، اسلاید",
    desc: "دریافت و استخراج خودکار نکات و ساختار علمی از انواع منابع",
    icon: FileText,
    positionClass: "top-2 sm:top-4 inset-x-auto",
    color: "text-rose-600",
    bgLight: "bg-rose-50",
    borderLight: "border-rose-200",
  },
  {
    id: "learning",
    title: "۲. یادگیری عمیق",
    subtitle: "درسنامه ساختاریافته",
    desc: "تبدیل سرفصل‌های پیچیده به درسنامه‌های روان با نمودار و تشریح مفهومی",
    icon: BookOpen,
    positionClass: "left-2 sm:left-4 top-1/2 -translate-y-1/2",
    color: "text-[#008080]",
    bgLight: "bg-teal-50",
    borderLight: "border-teal-200",
  },
  {
    id: "practice",
    title: "۳. تمرین و آزمون",
    subtitle: "شبیه‌سازی قطبی",
    desc: "تست‌های چندگزینه‌ای هدفمند برای سنجش تسلط و شناسایی نقاط ضعف",
    icon: FileCheck2,
    positionClass: "bottom-2 sm:bottom-4 inset-x-auto",
    color: "text-emerald-600",
    bgLight: "bg-emerald-50",
    borderLight: "border-emerald-200",
  },
  {
    id: "review",
    title: "۴. مرور هوشمند",
    subtitle: "الگوریتم فاصله‌دار",
    desc: "تکرار زمان‌بندی‌شده بر مبنای منحنی فراموشی تا انتقال به حافظه بلندمدت",
    icon: Clock,
    positionClass: "right-2 sm:right-4 top-1/2 -translate-y-1/2",
    color: "text-amber-600",
    bgLight: "bg-amber-50",
    borderLight: "border-amber-200",
  },
];

export function CompleteLoopSection() {
  const [activeNodeId, setActiveNodeId] = useState<string>("learning");
  const activeNode = loopNodes.find((n) => n.id === activeNodeId) ?? loopNodes[1];

  return (
    <section
      id="avana-loop"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش چرخه یکپارچه یادگیری آوانا"
    >
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#A7D0E6]/20 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold mb-4 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>امضای یادگیری هوشمند</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-headline text-3xl sm:text-4xl lg:text-[40px] leading-[1.25] font-black text-[#1a2226]"
        >
          چرخه یکپارچه <span className="text-[#008080]">یادگیری آوانا</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-3 text-base sm:text-lg text-[#3d4f55]"
        >
          یک مدار کامل و پیوسته: منبع خام وارد می‌شود، به یادگیری عمیق بدل می‌گردد، با تمرین سنجیده می‌شود و با مرور فاصله‌دار هرگز فراموش نخواهد شد.
        </motion.p>
      </div>

      {/* Signature Circular Orbital Composition */}
      <div className="relative max-w-2xl mx-auto flex items-center justify-center min-h-[420px] sm:min-h-[480px]">
        {/* Orbital Circles (SVG) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 500 500"
          fill="none"
        >
          {/* Main Orbit Ring */}
          <circle
            cx="250"
            cy="250"
            r="160"
            stroke="#008080"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            className="opacity-30"
          />

          {/* Secondary Outer Orbit Ring */}
          <circle
            cx="250"
            cy="250"
            r="215"
            stroke="#E2E7EA"
            strokeWidth="1"
            className="opacity-70"
          />
        </svg>

        {/* Central Core: AVANA */}
        <motion.div
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-[#008080] to-[#006060] text-white shadow-xl shadow-[#008080]/30 flex flex-col items-center justify-center z-20 border-4 border-white cursor-pointer select-none"
        >
          <span className="text-3xl sm:text-4xl font-black">A</span>
          <span className="text-[10px] font-bold text-teal-100 mt-0.5 tracking-wider">
            AVANA
          </span>
        </motion.div>

        {/* 4 Orbit Nodes */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {loopNodes.map((node) => {
            const Icon = node.icon;
            const isSelected = activeNodeId === node.id;
            return (
              <motion.div
                key={node.id}
                whileHover={{ scale: 1.05 }}
                onClick={() => setActiveNodeId(node.id)}
                className={`absolute ${node.positionClass} pointer-events-auto p-3 sm:p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-card ${
                  isSelected
                    ? "border-[#008080] ring-2 ring-[#008080]/20 shadow-elevated"
                    : "border-[#E2E7EA] hover:border-[#008080]/50"
                } flex items-center gap-2.5`}
              >
                <div
                  className={`w-8 h-8 rounded-lg ${node.bgLight} ${node.borderLight} border flex items-center justify-center ${node.color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-[#1a2226]">{node.title}</p>
                  <p className="text-[10px] text-[#5B6268]">{node.subtitle}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Active Stage Details Card */}
      <div className="max-w-md mx-auto mt-6 p-4 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs text-center">
        <p className="text-xs font-bold text-[#008080] mb-1">
          {activeNode.title} • {activeNode.subtitle}
        </p>
        <p className="text-xs text-[#3d4f55] leading-relaxed">
          {activeNode.desc}
        </p>
      </div>
    </section>
  );
}
