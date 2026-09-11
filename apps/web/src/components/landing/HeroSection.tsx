/**
 * Hero Section — AVANA Reference Design Redesign.
 *
 * Core Narrative:
 * "جزوهات را بده به آوانا. یادگیریش با آوانا."
 * "آوانا منابع درسی‌ات را به درسنامه، فلش‌کارت، آزمون و مرور سریع تبدیل می‌کند."
 *
 * Visual Transformation:
 * Raw sources (PDF/جزوه) -> AVANA Core -> [درسنامه, فلش‌کارت, آزمون, مرور]
 * Fully responsive: elegant horizontal layout on desktop, stacked vertical flow on mobile.
 */

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  BookOpen,
  Layers,
  FileCheck2,
  Clock,
  FileText,
  Heart,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";

const outputCards = [
  {
    id: "lecture",
    title: "درسنامه",
    desc: "خلاصه مفهومی و ساختاریافته",
    icon: BookOpen,
    accent: "#008080",
    bg: "bg-teal-50/80",
    border: "border-teal-200/80",
  },
  {
    id: "flashcard",
    title: "فلش‌کارت",
    desc: "مرور فاصله‌دار هوشمند",
    icon: Layers,
    accent: "#0284c7",
    bg: "bg-sky-50/80",
    border: "border-sky-200/80",
  },
  {
    id: "quiz",
    title: "آزمون",
    desc: "سنجش و تثبیت آموخته‌ها",
    icon: FileCheck2,
    accent: "#0f766e",
    bg: "bg-emerald-50/80",
    border: "border-emerald-200/80",
  },
  {
    id: "review",
    title: "مرور",
    desc: "جمع‌بندی نکات کلیدی آزمونی",
    icon: Clock,
    accent: "#0d9488",
    bg: "bg-teal-50/80",
    border: "border-teal-200/80",
  },
];

export function HeroSection() {
  const { isAuthenticated } = useAuth();
  const ctaHref = isAuthenticated ? "/courses" : "/sign-in";

  return (
    <section
      id="hero"
      className="relative pt-12 pb-16 lg:pt-16 lg:pb-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right"
      aria-label="بخش آغازین معرفی پلتفرم آوانا"
    >
      {/* Subtle background ambient glow (Warm ivory & Pale blue, Light-first) */}
      <div className="absolute top-10 right-1/4 w-96 h-96 bg-[#A7D0E6]/20 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-20 left-10 w-80 h-80 bg-[#F0E6D2]/35 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Headline, Subtitle, CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 flex flex-col gap-6 z-10"
        >
          {/* Headline */}
          <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl lg:text-[50px] leading-[1.22] font-black text-[#1a2226] tracking-tight">
            جزوهات را بده به آوانا.
            <br />
            <span className="text-[#008080]">یادگیریش با آوانا.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55] max-w-xl font-normal">
            آوانا منابع درسی‌ات را به درسنامه، فلش‌کارت، آزمون و مرور سریع تبدیل می‌کند.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <Link
              to={ctaHref}
              className="h-12 px-7 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] transition-all duration-200 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-md shadow-[#008080]/20 hover:-translate-y-0.5"
            >
              <span>شروع با آوانا</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <a
              href="#transformation"
              className="h-12 px-5 rounded-xl font-medium text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 text-[#3d4f55] hover:text-[#008080]"
            >
              <div className="w-7 h-7 rounded-full bg-white border border-[#E2E7EA] flex items-center justify-center shadow-xs text-[#008080]">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
              <span>آوانا چطور کار می‌کند؟</span>
            </a>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): Transformation Visual (Raw Sources -> AVANA Core -> 4 Outputs) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 relative flex items-center justify-center"
        >
          {/* DESKTOP/TABLET COMPOSITION (LTR flow: Raw Sources (Left) -> AVANA Core (Center) -> 4 Outputs (Right)) */}
          <div
            dir="ltr"
            className="hidden sm:flex items-center justify-between w-full max-w-[720px] relative py-8 px-2"
          >
            {/* SVG Connecting Flow Lines (Left to Right) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              viewBox="0 0 720 360"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="hero-flow-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#008080" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#008080" stopOpacity="0.75" />
                </linearGradient>
                <linearGradient id="hero-flow-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#008080" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#008080" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Flow 1: From Source Stack (approx x:200, y:180) to AVANA Core (x:320, y:180) */}
              <path
                d="M 200 180 C 245 180, 275 180, 320 180"
                stroke="url(#hero-flow-grad-1)"
                strokeWidth="2.5"
                strokeDasharray="5 5"
                className="opacity-60"
              />

              {/* Flow 2: From AVANA Core (x:400, y:180) to 4 Pillars (x:520) */}
              {/* Curve to Lesson (y:60) */}
              <path
                d="M 400 160 C 445 140, 475 75, 520 60"
                stroke="url(#hero-flow-grad-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-50"
              />
              {/* Curve to Flashcard (y:140) */}
              <path
                d="M 400 170 C 445 165, 475 145, 520 140"
                stroke="url(#hero-flow-grad-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-50"
              />
              {/* Curve to Quiz (y:220) */}
              <path
                d="M 400 190 C 445 195, 475 215, 520 220"
                stroke="url(#hero-flow-grad-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-50"
              />
              {/* Curve to Review (y:300) */}
              <path
                d="M 400 200 C 445 220, 475 285, 520 300"
                stroke="url(#hero-flow-grad-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-50"
              />
            </svg>

            {/* 1. Raw Source Material Stack (Left side of visual) */}
            <div dir="rtl" className="relative z-10 flex flex-col items-center">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* Background tilted card (Notebook/Handwritten page) */}
                <div className="absolute -inset-1.5 bg-[#F0E6D2] rounded-2xl rotate-[-5deg] border border-[#E2E7EA] shadow-xs" />

                {/* Secondary card (Lecture slide) */}
                <div className="absolute -inset-0.5 bg-white rounded-2xl rotate-[3deg] border border-[#E2E7EA] shadow-xs" />

                {/* Main Foreground Document (Pharmacology Lecture PDF) */}
                <div className="relative w-44 sm:w-48 bg-white rounded-2xl p-4 border border-[#E2E7EA] shadow-card">
                  {/* Document Header */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EEF1F3]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 text-[9px] font-bold">
                        PDF
                      </span>
                      <span className="text-[11px] font-bold text-[#1a2226]">
                        فارماکولوژی ۱
                      </span>
                    </div>
                    <FileText className="w-3.5 h-3.5 text-[#5B6268]" />
                  </div>

                  {/* Document Body preview */}
                  <div className="space-y-1.5">
                    <div className="h-2 bg-[#EEF1F3] rounded-full w-4/5" />
                    <div className="h-2 bg-teal-100 rounded-full w-full" />
                    <div className="h-2 bg-[#EEF1F3] rounded-full w-3/4" />

                    {/* Miniature anatomical illustration */}
                    <div className="h-14 my-2 rounded-lg bg-teal-50/60 border border-teal-100 flex items-center justify-center p-1">
                      <div className="flex items-center gap-2">
                        <Heart className="w-5 h-5 text-rose-500 fill-rose-100" />
                        <div className="text-right">
                          <p className="text-[8px] font-bold text-[#008080]">گیرنده‌های β1</p>
                          <p className="text-[7px] text-[#5B6268]">گره سینوسی قلب</p>
                        </div>
                      </div>
                    </div>

                    <div className="h-2 bg-[#EEF1F3] rounded-full w-5/6" />
                    <div className="h-2 bg-amber-100 rounded-full w-2/3" />
                  </div>
                </div>
              </motion.div>

              {/* Source Label */}
              <span className="mt-3 text-[11px] font-semibold text-[#5B6268] bg-white/90 px-2.5 py-1 rounded-full border border-[#E2E7EA] shadow-xs">
                جزوه + PDF + عکس + نمونه سؤال
              </span>
            </div>

            {/* 2. Central AVANA Transformation Engine (Center) */}
            <div dir="rtl" className="relative z-10 flex flex-col items-center mx-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#008080] to-[#006060] flex items-center justify-center text-white shadow-lg shadow-[#008080]/30 border-2 border-white relative cursor-pointer"
              >
                <div className="text-2xl sm:text-3xl font-black tracking-tight select-none">
                  A
                </div>
                {/* Subtle pulse ring */}
                <div className="absolute -inset-1 rounded-2xl border-2 border-[#008080]/30 animate-ping pointer-events-none opacity-40" />
              </motion.div>
              <span className="mt-2 text-[10px] font-bold text-[#008080] bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                موتور هوشمند
              </span>
            </div>

            {/* 3. Output 4-Pillars (Right side of visual) */}
            <div dir="rtl" className="relative z-10 flex flex-col gap-3">
              {outputCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                    whileHover={{ x: 4 }}
                    className="flex items-center gap-3 py-2 px-3.5 rounded-xl bg-white border border-[#E2E7EA] shadow-card hover:border-[#008080]/40 transition-all duration-200 w-44 sm:w-48"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg ${card.bg} ${card.border} border flex items-center justify-center shrink-0`}
                    >
                      <Icon className="w-4 h-4 text-[#008080]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1a2226] truncate">
                        {card.title}
                      </p>
                      <p className="text-[10px] text-[#5B6268] truncate">
                        {card.desc}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* MOBILE COMPOSITION (Graceful Vertical Flow / Timeline) */}
          <div className="sm:hidden flex flex-col items-center gap-5 w-full max-w-sm py-4">
            {/* 1. Source preview on mobile */}
            <div className="w-full bg-white rounded-2xl p-4 border border-[#E2E7EA] shadow-card">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EEF1F3]">
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 text-[10px] font-bold">
                  PDF جزوه پزشکی
                </span>
                <span className="text-xs text-[#5B6268]">ورودی خام</span>
              </div>
              <p className="text-xs font-semibold text-[#1a2226] mb-1">
                فارماکولوژی — سیستم اتونومیک و بتا بلاکرها
              </p>
              <p className="text-[11px] text-[#5B6268]">
                شامل متن، تصاویر بافت‌شناسی، فرمول‌ها و نکات استاد
              </p>
            </div>

            {/* 2. Arrow to AVANA */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-xl bg-[#008080] text-white flex items-center justify-center font-black text-xl shadow-md shadow-[#008080]/20">
                A
              </div>
              <span className="text-[10px] font-bold text-[#008080]">تبدیل هوشمند آوانا</span>
            </div>

            {/* 3. Outputs in a 2x2 grid on mobile */}
            <div className="grid grid-cols-2 gap-2.5 w-full">
              {outputCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.id}
                    className="p-3 rounded-xl bg-white border border-[#E2E7EA] shadow-xs flex flex-col gap-1.5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-[#1a2226]">{card.title}</span>
                    <span className="text-[10px] text-[#5B6268]">{card.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
