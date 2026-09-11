/**
 * 4-Step Product Walkthrough ("آوانا را در ۴ مرحله یاد بگیر")
 *
 * Preserves 100% of existing section headline, subtitles, 4 step titles,
 * descriptions, and highlight bullets.
 *
 * Upgraded with realistic miniature product UI screens modeled directly on
 * AVANA's actual components (CourseListPage, LearningPage, FlashcardExperience, ExamTakingView).
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  GraduationCap,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  HelpCircle,
  BarChart3,
  Layers,
  UploadCloud,
  Bot,
  Clock,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@avana/ui";

interface Step {
  id: number;
  title: string;
  shortTitle: string;
  description: string;
  highlights: string[];
  imageAlt: string;
  imageSrc: string;
  color: string;
  shadowColor: string;
  reverse?: boolean;
}

const steps: Step[] = [
  {
    id: 1,
    title: "انتخاب دوره، سرفصل و بارگذاری منابع",
    shortTitle: "انتخاب دوره و منابع",
    description:
      "شما می‌توانید جزوات درسی و فایل‌های PDF خود را بارگذاری کنید یا کورس‌های تخصصی علوم پزشکی را انتخاب نمایید. آوانا به صورت هوشمند ساختار آموزشی فصول، درس‌ها و منابع شما را سازمان‌دهی کرده و داشبوردی کامل از روند پیشرفت در اختیارتان قرار می‌دهد.",
    highlights: [
      "بارگذاری مستقیم فایل‌های PDF و استخراج هوشمند فصل‌ها",
      "دسته‌بندی منظم کورس‌ها بر اساس موضوعات علوم پایه و بالینی",
      "نمایش دقیق آمار و پیشرفت درسی در داشبورد اختصاصی",
    ],
    imageAlt: "داشبورد انتخاب درس",
    imageSrc: "",
    color: "#008080",
    shadowColor: "rgba(0,128,128,0.4)",
  },
  {
    id: 2,
    title: "مطالعه ساختاریافته و منسجم محتوا",
    shortTitle: "مطالعه منسجم محتوا",
    description:
      "وارد محیط اختصاصی مطالعه شوید؛ متن درس‌ها همراه با خلاصه‌های کاربردی، نکات کلیدی کنکوری و هایلایت‌های مهم در قالبی عاری از حواس‌پرتی ارائه می‌شوند. سیستم هوشمند آوانا امکان ثبت تیک مطالعه و انتقال گام‌به‌گام بین مباحث را فراهم می‌کند.",
    highlights: [
      "باکس‌های هوشمند نکات کنکوری و خلاصه‌های جامع",
      "رابط کاربری تیره (Dark Mode) و بدون حواس‌پرتی برای تمرکز بالا",
      "ثبت تیک تکمیل درس و ناوبری آسان بین سرفصل‌ها",
    ],
    imageAlt: "محیط مطالعه درس",
    imageSrc: "",
    color: "#6b38d4",
    shadowColor: "rgba(107,56,212,0.4)",
    reverse: true,
  },
  {
    id: 3,
    title: "تثبیت عمیق و مرور با فلش‌کارت SRS",
    shortTitle: "مرور با فلش‌کارت SRS",
    description:
      "پس از مطالعه هر مبحث، فلش‌کارت‌های استاندارد مرتبط فعال می‌شوند. الگوریتم هوشمند مرور فاصله‌دار (Spaced Repetition) با برچسب‌گذاری میزان سختی هر کارت، زمان دقیق یادآوری و مرور بعدی را پیش‌بینی می‌کند تا مطالب به حافظه بلندمدت منتقل شوند.",
    highlights: [
      "الگوریتم علمی مرور فاصله‌دار (SRS) جهت جلوگیری از فراموشی",
      "دکمه‌های ۴ گانه تعیین میزان درجه سختی هر کارت (مجدداً، سخت، خوب، آسان)",
      "ثبت وضعیت یادگیری و زمان‌بندی دقیق دور بعدی مرور",
    ],
    imageAlt: "مرور فلش‌کارت",
    imageSrc: "",
    color: "#007952",
    shadowColor: "rgba(0,121,82,0.4)",
  },
  {
    id: 4,
    title: "سنجش هوشمند با آزمون‌های شبیه‌سازی‌شده",
    shortTitle: "سنجش هوشمند با آزمون",
    description:
      "با تنظیم تعداد سوالات، انتخاب مباحث دلخواه و فعال‌سازی حالت شب امتحان، میزان تسلط خود را بسنجید. آوانا کارنامه تحلیلی دقیق، نمره ارزیابی و گزارش جامعی از نقاط ضعف و قوت شما ارائه می‌دهد تا با آمادگی کامل وارد امتحانات اصلی شوید.",
    highlights: [
      "تنظیم سفارشی تعداد سوالات، مباحث و حالت شب امتحان",
      "شبیه‌سازی دقیق شرایط امتحانات سراسری و آزمون‌های دانشگاهی",
      "گزارش تحلیلی نقاط ضعف و سنجش میزان آمادگی",
    ],
    imageAlt: "تنظیمات آزمون",
    imageSrc: "",
    color: "#005c55",
    shadowColor: "rgba(0,92,85,0.4)",
    reverse: true,
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const currentStep = steps.find((s) => s.id === activeStep) || steps[0];

  return (
    <section
      id="how-it-works"
      className="snap-section relative py-10 lg:py-0 lg:h-[calc(100dvh-80px)] lg:min-h-[calc(100dvh-80px)] flex flex-col justify-center px-6 max-w-[1280px] mx-auto overflow-hidden text-right scroll-mt-20"
      aria-label="بخش راهنمای مراحل یادگیری با آوانا"
    >
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-3 lg:mb-4 max-w-3xl mx-auto"
      >
        <div className="mb-2 flex justify-center">
          <Badge
            variant="primary"
            size="md"
            icon={<Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />}
            className="px-3 py-1 shadow-sm"
          >
            فرایند یادگیری
          </Badge>
        </div>

        <h2 className="font-headline text-2xl sm:text-3xl md:text-4xl font-black text-[var(--avana-text-primary)] leading-tight">
          آوانا را در ۴ مرحله یاد بگیر
        </h2>
      </motion.div>

      {/* Interactive 4-Step Tab Bar */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3 max-w-4xl mx-auto w-full p-1 bg-white border border-[var(--avana-border-default)] rounded-[10px]"
        role="tablist"
        aria-label="مراحل ۴ گانه یادگیری با آوانا"
      >
        {steps.map((step) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`step-panel-${step.id}`}
              onClick={() => setActiveStep(step.id)}
              className={`py-2 px-2.5 rounded-[8px] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? "bg-[#008080] text-white shadow-xs font-bold"
                  : "text-[var(--avana-text-muted)] hover:text-[var(--avana-text-primary)] hover:bg-[var(--avana-surface-2)]"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                isActive ? "bg-white text-[#008080]" : "bg-[var(--avana-bg-default)] text-[var(--avana-text-muted)]"
              }`}>
                ۰{step.id}
              </span>
              <span className="truncate">{step.shortTitle}</span>
            </button>
          );
        })}
      </div>

      {/* Active Step Presentation Stage */}
      <div className="max-w-5xl mx-auto w-full bg-white border border-[var(--avana-border-default)] rounded-[16px] p-3.5 sm:p-5 md:p-6 shadow-card">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          {/* Text Area */}
          <div className="lg:w-1/2 text-right w-full flex flex-col justify-between">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] font-black text-lg text-white bg-[#008080] shadow-xs shrink-0">
                    {currentStep.id}
                  </div>
                  <h3 className="font-headline text-xl sm:text-2xl font-extrabold text-[var(--avana-text-primary)] leading-tight">
                    {currentStep.title}
                  </h3>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed text-[var(--avana-text-secondary)] font-body">
                  {currentStep.description}
                </p>

                {/* Highlights List */}
                <ul className="space-y-2 pt-1">
                  {currentStep.highlights.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-xs sm:text-sm font-medium text-[var(--avana-text-primary)]"
                    >
                      <span className="w-4 h-4 rounded-full bg-[#008080]/10 border border-[#008080]/20 text-[#008080] flex items-center justify-center text-[10px] shrink-0 mt-0.5 shadow-xs font-bold">
                        ✓
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>

            {/* Stepper Navigation Controls */}
            <div className="flex items-center justify-between pt-5 mt-5 border-t border-[var(--avana-border-default)]">
              <button
                onClick={() => setActiveStep((prev) => (prev > 1 ? prev - 1 : 4))}
                className="px-3.5 py-2 rounded-[10px] bg-white hover:bg-[var(--avana-surface-2)] text-[var(--avana-text-secondary)] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-[var(--avana-border-default)] shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
                <span>گام قبلی</span>
              </button>

              <div className="flex items-center gap-1.5">
                {steps.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStep(s.id)}
                    aria-label={`رفتن به گام ${s.id}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      activeStep === s.id
                        ? "w-6 bg-[#008080]"
                        : "w-2 bg-[var(--avana-border-default)] hover:bg-[var(--avana-text-muted)]"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => setActiveStep((prev) => (prev < 4 ? prev + 1 : 1))}
                className="px-3.5 py-2 rounded-[10px] bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-transparent shadow-xs"
              >
                <span>گام بعدی</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Miniature Product Mockup Area */}
          <div className="lg:w-1/2 w-full">
            <div className="rounded-[16px] overflow-hidden shadow-card relative aspect-[4/3] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  {currentStep.id === 1 && <CourseSelectionMiniature />}
                  {currentStep.id === 2 && <LessonStudyMiniature />}
                  {currentStep.id === 3 && <FlashcardSRSMiniature />}
                  {currentStep.id === 4 && <ExamTakingMiniature />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Accessible semantic fallback containing inactive steps for SEO, Screen Readers, and test accessibility */}
      <div className="sr-only">
        {steps
          .filter((s) => s.id !== activeStep)
          .map((s) => (
            <div key={s.id} id={`step-panel-${s.id}`}>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              <ul>
                {s.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Miniature 1: Modern Course Selection & Roadmap
// ---------------------------------------------------------------------------
function CourseSelectionMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[var(--avana-bg-default)] text-[var(--avana-text-primary)] text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Chrome Header */}
      <div className="flex items-center justify-between border-b border-[var(--avana-border-default)] pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[8px] bg-[#008080]/10 border border-[#008080]/20 text-[#008080] flex items-center justify-center shadow-xs">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-[var(--avana-text-primary)]">دوره‌های من</h4>
            <p className="text-[8px] sm:text-[9px] text-[var(--avana-text-muted)]">سازمان یادگیری آوانا</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] sm:text-[9px] font-bold text-[#008080] bg-[#008080]/10 border border-[#008080]/20 px-2 py-0.5 rounded-full">
            ۳ دوره فعال
          </span>
          <div className="px-2 py-1 rounded-[8px] bg-[#008080] text-white font-bold text-[8px] flex items-center gap-1 shadow-xs">
            <Plus className="w-3 h-3" />
            <span>افزودن دوره</span>
          </div>
        </div>
      </div>

      {/* Courses Cards Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 flex-1 overflow-hidden">
        {/* Card 1: Pharmacology (Active & Highlighted) */}
        <div className="rounded-[12px] bg-white border border-[#008080]/40 p-2.5 flex flex-col justify-between shadow-xs relative overflow-hidden group">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-1.5 py-0.5 rounded-[6px] text-[8px] font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
                داروشناسی تخصصی
              </span>
              <span className="text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded-[4px] font-bold">خریداری شده</span>
            </div>
            <h5 className="font-extrabold text-[var(--avana-text-primary)] text-[10px] sm:text-[11px] leading-tight line-clamp-1">
              فارماکولوژی پایه و سیستم عصبی
            </h5>
            <p className="text-[8px] text-[var(--avana-text-muted)] mt-0.5">فصل ۴: گیرنده‌های خودمختار</p>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-[var(--avana-text-muted)]">پیشرفت مطالعه</span>
              <span className="font-bold text-[#008080]">۶۸٪</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--avana-border-subtle)] rounded-full overflow-hidden border border-[var(--avana-border-default)]">
              <motion.div
                initial={{ width: "0%" }}
                whileInView={{ width: "68%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-[#008080] rounded-full"
              />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[var(--avana-border-subtle)] text-[8px]">
              <span className="text-[var(--avana-text-muted)]">۱۲ درس</span>
              <span className="text-[#008080] font-bold flex items-center gap-0.5">
                <span>ورود به دوره</span>
                <ChevronLeft className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Cellular Physiology */}
        <div className="rounded-[12px] bg-white border border-[var(--avana-border-default)] p-2.5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-1.5 py-0.5 rounded-[6px] text-[8px] font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
                فیزیولوژی پزشکی
              </span>
              <span className="text-[8px] text-[#008080] font-semibold">اشتراک فعال</span>
            </div>
            <h5 className="font-extrabold text-[var(--avana-text-primary)] text-[10px] sm:text-[11px] leading-tight line-clamp-1">
              فیزیولوژی سلولی و غدد
            </h5>
            <p className="text-[8px] text-[var(--avana-text-muted)] mt-0.5">پتانسیل غشا و پیام‌رسانی</p>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-[var(--avana-text-muted)]">پیشرفت مطالعه</span>
              <span className="font-bold text-[#008080]">۴۵٪</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--avana-border-subtle)] rounded-full overflow-hidden border border-[var(--avana-border-default)]">
              <motion.div
                initial={{ width: "0%" }}
                whileInView={{ width: "45%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-[#008080] rounded-full"
              />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-[var(--avana-border-subtle)] text-[8px]">
              <span className="text-[var(--avana-text-muted)]">۱۸ درس</span>
              <span className="text-[#008080] font-bold flex items-center gap-0.5">
                <span>ورود</span>
                <ChevronLeft className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Source Upload Banner */}
      <div className="mt-2 p-2 rounded-[8px] bg-white border border-[var(--avana-border-default)] flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <UploadCloud className="w-3.5 h-3.5 text-[#008080]" />
          <span className="text-[8px] sm:text-[9px] text-[var(--avana-text-secondary)]">
            بارگذاری منابع درسی PDF • استخراج خودکار سرفصل‌ها
          </span>
        </div>
        <span className="text-[8px] font-bold text-[#008080]">آماده یادگیری ✔</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Miniature Product Screen 2: Structured Lesson & Content Reader (LearningPage Replica)
// ---------------------------------------------------------------------------
function LessonStudyMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-2.5 sm:p-3.5 bg-[var(--avana-bg-default)] text-[var(--avana-text-primary)] text-right dir-rtl pointer-events-none select-none overflow-hidden text-[8px] sm:text-[9px]">
      {/* Top Breadcrumb & Course Header */}
      <div className="border-b border-[var(--avana-border-default)] pb-2 mb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-[8px] text-[var(--avana-text-muted)] font-semibold">
            <span>دوره‌های من</span>
            <span>/</span>
            <span className="text-[#008080] font-bold">فارماکولوژی عمومی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-[#008080] font-bold">۶۸٪ تکمیل شده</span>
            <div className="w-12 h-1 bg-[var(--avana-border-subtle)] rounded-full overflow-hidden">
              <div className="h-full bg-[#008080] w-[68%]" />
            </div>
          </div>
        </div>

        {/* Study Navigation Tabs */}
        <div className="flex items-center gap-1 text-[8px]">
          <span className="px-2 py-0.5 rounded-t-[6px] bg-[#008080] text-white font-bold flex items-center gap-1 shadow-xs">
            <BookOpen className="w-2.5 h-2.5" />
            <span>درس‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-[var(--avana-text-muted)] flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span>فلش‌کارت‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-[var(--avana-text-muted)] flex items-center gap-1">
            <HelpCircle className="w-2.5 h-2.5" />
            <span>آزمون‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-[var(--avana-text-muted)] flex items-center gap-1">
            <BarChart3 className="w-2.5 h-2.5" />
            <span>تحلیل</span>
          </span>
        </div>
      </div>

      {/* 2-Column Split: Curriculum Sidebar + Lesson Content */}
      <div className="flex flex-1 gap-2 overflow-hidden">
        {/* Right Sidebar: Chapters & Lessons */}
        <div className="w-[36%] border-l border-[var(--avana-border-default)] bg-white rounded-[8px] p-1.5 flex flex-col gap-1 overflow-hidden shadow-xs">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--avana-border-default)] text-[8px] font-bold text-[var(--avana-text-muted)]">
            <span>سرفصل‌های دوره</span>
            <span className="text-[#008080]">۱۴ درس</span>
          </div>

          {/* Module 1 */}
          <div className="space-y-0.5 mt-0.5">
            <div className="p-1 rounded-[4px] bg-[var(--avana-bg-default)] text-[var(--avana-text-secondary)] flex justify-between items-center text-[7.5px] font-bold">
              <span className="truncate">فصل ۱: کلیات فارماکوکینتیک</span>
              <span className="text-[#008080]">✓</span>
            </div>
            <div className="p-1 rounded-[4px] bg-[#008080]/10 border border-[#008080]/30 text-[#008080] font-bold flex justify-between items-center text-[7.5px] shadow-xs">
              <span className="truncate">▶ ۱.۲: متابولیسم کبدی (CYP450)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#008080] animate-pulse" />
            </div>
            <div className="p-1 rounded-[4px] bg-[var(--avana-bg-default)] text-[var(--avana-text-muted)] truncate text-[7.5px]">
              ○ ۱.۳: کلیرانس و دفع کلیوی
            </div>
            <div className="p-1 rounded-[4px] bg-[var(--avana-bg-default)] text-[var(--avana-text-muted)] truncate text-[7.5px]">
              ○ ۱.۴: فارماکودینامیک و گیرنده‌ها
            </div>
          </div>
        </div>

        {/* Left Reader Panel: Rich Lesson Content */}
        <div className="flex-1 bg-white rounded-[8px] p-2 sm:p-2.5 flex flex-col justify-between border border-[var(--avana-border-default)] overflow-hidden shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between border-b border-[var(--avana-border-default)] pb-1">
              <h5 className="font-black text-[var(--avana-text-primary)] text-[9px] sm:text-[10px]">
                درس ۱.۲: متابولیسم کبدی و سیستم آنزیمی P450
              </h5>
              <span className="px-1.5 py-0.5 rounded-[4px] text-[7px] font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
                در حال مطالعه
              </span>
            </div>

            <p className="text-[7.5px] sm:text-[8px] text-[var(--avana-text-secondary)] leading-relaxed line-clamp-2">
              واکنش‌های فاز I بیوترانسفورماسیون توسط ایزوآنزیم‌های خانواده CYP3A4 و CYP2D6 هدایت شده و قطبیت مولکول را جهت دفع کلیوی افزایش می‌دهند.
            </p>

            {/* Important Exam Tip Callout Box */}
            <div className="rounded-[8px] bg-purple-50 border border-purple-200 p-1.5 flex items-start gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-purple-900 block text-[7.5px] sm:text-[8px]">
                  نکته کلیدی کنکور جامع:
                </span>
                <span className="text-[7px] sm:text-[7.5px] text-purple-800 leading-tight block">
                  داروهای مهارکننده سیتوکروم مانند اریترومایسین و سایمتیدین باعث افزایش غلظت پلاسمایی داروهای هم‌زمان می‌شوند.
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="flex items-center justify-between border-t border-[var(--avana-border-default)] pt-1.5 text-[7.5px] sm:text-[8px] text-[var(--avana-text-muted)]">
            <span className="flex items-center gap-0.5">
              <ArrowRight className="w-2.5 h-2.5" />
              <span>درس قبلی</span>
            </span>
            <span className="px-2 py-0.5 rounded-[4px] bg-[#008080]/10 text-[#008080] border border-[#008080]/20 font-bold">
              تیک تکمیل درس ✓
            </span>
            <span className="text-[#008080] font-bold flex items-center gap-0.5">
              <span>درس بعدی</span>
              <ArrowLeft className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Miniature Product Screen 3: SRS Active Flashcards (FlashcardExperience Replica)
// ---------------------------------------------------------------------------
function FlashcardSRSMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[var(--avana-bg-default)] text-[var(--avana-text-primary)] text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Session Header */}
      <div className="flex items-center justify-between border-b border-[var(--avana-border-default)] pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[var(--avana-text-primary)] text-[10px]">فارماکولوژی قلب و عروق</span>
          <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#008080]/10 text-[#008080] border border-[#008080]/20 font-semibold">
            الگوریتم هوشمند SRS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-[var(--avana-text-muted)]">کارت ۱۲ از ۴۵</span>
          <div className="w-10 h-1.5 bg-[var(--avana-border-subtle)] rounded-full overflow-hidden border border-[var(--avana-border-default)]">
            <div className="h-full bg-[#008080] w-[27%]" />
          </div>
        </div>
      </div>

      {/* Realistic Double-Sided Flashcard Container */}
      <div className="flex-1 flex flex-col justify-between max-w-sm mx-auto w-full rounded-[16px] bg-white border border-[var(--avana-border-default)] p-3 sm:p-3.5 shadow-card relative overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-[var(--avana-border-default)] pb-1.5">
          <span className="text-[8px] font-bold text-[#008080] bg-[#008080]/10 px-2 py-0.5 rounded-[4px] border border-[#008080]/20">
            ❓ سوال فلش‌کارت
          </span>
          <span className="text-[8px] text-[var(--avana-text-muted)] font-mono">بتابلاکرهای غیرانتخابی (β1/β2)</span>
        </div>

        {/* Question Prompt */}
        <div className="my-auto py-1">
          <p className="text-[9.5px] sm:text-[10.5px] font-extrabold text-[var(--avana-text-primary)] leading-relaxed text-center">
            چرا پروپرانولول در بیماران مبتلا به آسم و COPD منع مصرف مطلق دارد؟
          </p>

          {/* Answer Reveal Area */}
          <div className="mt-2 p-2 rounded-[8px] bg-[#008080]/8 border border-[#008080]/20 text-center">
            <span className="text-[8px] font-bold text-[#008080] block mb-0.5">پاسخ علمی:</span>
            <p className="text-[8.5px] sm:text-[9px] text-[var(--avana-text-secondary)] leading-snug">
              به دلیل مهار گیرنده‌های β2 در عضلات صاف برونش و تحریک برونکواسپاسم شدید.
            </p>
          </div>
        </div>

        {/* 4-Button SRS Rating Bar (Spaced Repetition Exact Reproduction) */}
        <div className="pt-1.5 border-t border-[var(--avana-border-default)]">
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5 text-center">
            <div className="p-1 rounded-[6px] bg-rose-50 border border-rose-200 text-rose-700">
              <span className="font-bold text-[8px] block">مجدداً</span>
              <span className="text-[7px] opacity-75 font-mono">&lt; ۱۰ دقیقه</span>
            </div>
            <div className="p-1 rounded-[6px] bg-amber-50 border border-amber-200 text-amber-700">
              <span className="font-bold text-[8px] block">سخت</span>
              <span className="text-[7px] opacity-75 font-mono">۱ روز</span>
            </div>
            <div className="p-1 rounded-[6px] bg-teal-50 border border-[#008080] text-teal-900 font-extrabold ring-1 ring-[#008080]/30 shadow-xs">
              <span className="text-[8px] block">خوب ✓</span>
              <span className="text-[7px] opacity-90 font-mono">۳ روز</span>
            </div>
            <div className="p-1 rounded-[6px] bg-sky-50 border border-sky-200 text-sky-700">
              <span className="font-bold text-[8px] block">آسان</span>
              <span className="text-[7px] opacity-75 font-mono">۷ روز</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Miniature Product Screen 4: Standardized Adaptive Exam (ExamTakingView Replica)
// ---------------------------------------------------------------------------
function ExamTakingMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[var(--avana-bg-default)] text-[var(--avana-text-primary)] text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Top Exam Header */}
      <div className="flex items-center justify-between border-b border-[var(--avana-border-default)] pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-[var(--avana-text-primary)] text-[10px]">آزمون جامع فارماکولوژی بالینی</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-[6px] border border-[var(--avana-border-default)] text-[#008080] font-mono text-[8px] shadow-xs">
            <Clock className="w-2.5 h-2.5" />
            <span>۱۲:۴۵</span>
          </div>
          <span className="text-[8px] font-bold text-[var(--avana-text-muted)]">سوال ۵ از ۲۰</span>
          <span className="px-2 py-0.5 rounded-[6px] bg-[#008080]/10 border border-[#008080]/20 text-[#008080] font-bold text-[8px]">
            پایان آزمون
          </span>
        </div>
      </div>

      {/* Question Card & 4 Options */}
      <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full rounded-[16px] bg-white border border-[var(--avana-border-default)] p-2.5 sm:p-3 shadow-card overflow-hidden">
        <div>
          {/* Question Tag */}
          <div className="flex items-center justify-between mb-1 text-[8px] text-[var(--avana-text-muted)]">
            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#008080]/10 text-[#008080] border border-[#008080]/20 font-bold">
              سوال ۵ • تک‌انتخابی (علوم پایه)
            </span>
            <span>ضریب: ۲</span>
          </div>

          {/* Question Text */}
          <p className="font-extrabold text-[var(--avana-text-primary)] text-[9px] sm:text-[10px] leading-tight mb-2">
            کدام‌یک از داروهای زیر بتابلاکر غیراختصاصی با خاصیت چربی‌دوست (Lipophilic) بالا بوده و از سد خونی-مغزی (BBB) عبور می‌کند؟
          </p>

          {/* 4 Choices */}
          <div className="space-y-1 text-[8px] sm:text-[8.5px]">
            <div className="p-1.5 rounded-[6px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] flex items-center justify-between text-[var(--avana-text-secondary)]">
              <span>الف) آتنولول (Atenolol)</span>
              <span className="w-3 h-3 rounded-full border border-[var(--avana-border-default)]" />
            </div>
            {/* Selected Option */}
            <div className="p-1.5 rounded-[6px] bg-teal-50 border border-[#008080] text-teal-950 font-bold flex items-center justify-between shadow-xs ring-1 ring-[#008080]/30">
              <span>ب) پروپرانولول (Propranolol)</span>
              <span className="w-3 h-3 rounded-full bg-[#008080] text-white flex items-center justify-center text-[7px] font-black">
                ✓
              </span>
            </div>
            <div className="p-1.5 rounded-[6px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] flex items-center justify-between text-[var(--avana-text-secondary)]">
              <span>ج) اسمولول (Esmolol)</span>
              <span className="w-3 h-3 rounded-full border border-[var(--avana-border-default)]" />
            </div>
            <div className="p-1.5 rounded-[6px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] flex items-center justify-between text-[var(--avana-text-secondary)]">
              <span>د) متوپرولول (Metoprolol)</span>
              <span className="w-3 h-3 rounded-full border border-[var(--avana-border-default)]" />
            </div>
          </div>
        </div>

        {/* Bottom Exam Toolbar */}
        <div className="flex items-center justify-between border-t border-[var(--avana-border-default)] pt-1.5 mt-1.5 text-[8px]">
          <span className="text-[var(--avana-text-muted)] flex items-center gap-0.5">
            <ArrowRight className="w-2.5 h-2.5" />
            <span>سوال قبلی</span>
          </span>

          <div className="flex items-center gap-1 text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-[6px] font-bold">
            <Bot className="w-2.5 h-2.5" />
            <span>راهنمایی هوش مصنوعی</span>
          </div>

          <span className="px-2.5 py-0.5 rounded-[6px] bg-[#008080] text-white font-bold flex items-center gap-0.5 shadow-xs">
            <span>سوال بعدی</span>
            <ArrowLeft className="w-2.5 h-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
