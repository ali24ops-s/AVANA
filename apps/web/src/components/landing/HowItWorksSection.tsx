/**
 * 4-Step Product Walkthrough ("آوانا را در ۴ مرحله یاد بگیر")
 *
 * Preserves 100% of existing section headline, subtitles, 4 step titles,
 * descriptions, and highlight bullets.
 *
 * Upgraded with realistic miniature product UI screens modeled directly on
 * AVANA's actual components (CourseListPage, LearningPage, FlashcardExperience, ExamTakingView).
 */

import { motion } from "framer-motion";
import {
  Sparkles,
  GraduationCap,
  BookOpen,
  ChevronLeft,
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

interface Step {
  id: number;
  title: string;
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
  return (
    <section
      id="how-it-works"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden text-right"
      aria-label="بخش راهنمای مراحل یادگیری با آوانا"
    >
      {/* Background Glow */}
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-teal-900/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20 max-w-3xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border mb-4 bg-teal-950/60 text-teal-300 border-teal-500/40 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
          <span>فرایند یادگیری</span>
        </div>

        <h2 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight">
          آوانا را در ۴ مرحله یاد بگیر
        </h2>
      </motion.div>

      {/* Steps List */}
      <div className="space-y-24 sm:space-y-32">
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 35 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className={`flex flex-col lg:flex-row items-center gap-10 lg:gap-16 ${
              step.reverse ? "lg:flex-row-reverse" : ""
            }`}
          >
            {/* Text Area */}
            <div className="lg:w-1/2 text-right">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-2xl font-black text-xl mb-6 text-white shadow-lg border border-white/20"
                style={{
                  backgroundColor: step.color,
                  boxShadow: `0 0 20px ${step.shadowColor}`,
                }}
              >
                {step.id}
              </div>

              <h3 className="font-headline text-2xl sm:text-3xl font-extrabold mb-4 text-white leading-tight">
                {step.title}
              </h3>

              <p className="text-sm sm:text-base mb-6 leading-relaxed text-slate-300 font-body">
                {step.description}
              </p>

              {/* Highlights List */}
              <ul className="space-y-2.5 mb-6">
                {step.highlights.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs sm:text-sm font-medium text-slate-200"
                  >
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-sm">
                      ✓
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Image / Realistic Miniature Product Mockup Area */}
            <div className="lg:w-1/2 w-full">
              <div className="rounded-2xl overflow-hidden shadow-2xl relative group hover:shadow-[0_20px_50px_rgba(0,128,128,0.25)] transition-all duration-500 aspect-[4/3] bg-[#0b1120] border border-white/15">
                {/* 1. Step 1 Mockup: Course Selection & Management */}
                {step.id === 1 && <CourseSelectionMiniature />}

                {/* 2. Step 2 Mockup: Structured Lesson & Content Reader */}
                {step.id === 2 && <LessonStudyMiniature />}

                {/* 3. Step 3 Mockup: SRS Active Flashcards Experience */}
                {step.id === 3 && <FlashcardSRSMiniature />}

                {/* 4. Step 4 Mockup: Standardized Exam & Self Assessment */}
                {step.id === 4 && <ExamTakingMiniature />}

                {/* Ambient Bottom Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1120]/30 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Miniature Product Screen 1: Course Selection & Roadmap (CourseListPage Replica)
// ---------------------------------------------------------------------------
function CourseSelectionMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[#0b1120] text-slate-100 text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Chrome Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-teal-950/70 border border-teal-500/40 text-teal-300 flex items-center justify-center">
            <GraduationCap className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white">دوره‌های من</h4>
            <p className="text-[8px] sm:text-[9px] text-slate-400">سازمان یادگیری آوانا</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] sm:text-[9px] font-bold text-teal-300 bg-teal-950/70 border border-teal-500/30 px-2 py-0.5 rounded-full">
            ۳ دوره فعال
          </span>
          <div className="px-2 py-1 rounded-lg bg-[#008080] text-white font-bold text-[8px] flex items-center gap-1 shadow-sm">
            <Plus className="w-3 h-3" />
            <span>افزودن دوره</span>
          </div>
        </div>
      </div>

      {/* Courses Cards Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 flex-1 overflow-hidden">
        {/* Card 1: Pharmacology (Active & Highlighted) */}
        <div className="rounded-xl bg-gradient-to-br from-slate-800/90 via-slate-900 to-slate-900/90 border border-teal-500/40 p-2.5 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-teal-950 text-teal-300 border border-teal-500/30">
                داروشناسی تخصصی
              </span>
              <span className="text-[8px] text-emerald-400 font-bold">خریداری شده</span>
            </div>
            <h5 className="font-extrabold text-white text-[10px] sm:text-[11px] leading-tight line-clamp-1">
              فارماکولوژی پایه و سیستم عصبی
            </h5>
            <p className="text-[8px] text-slate-400 mt-0.5">فصل ۴: گیرنده‌های خودمختار</p>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-slate-400">پیشرفت مطالعه</span>
              <span className="font-bold text-teal-400">۶۸٪</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: "0%" }}
                whileInView={{ width: "68%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-gradient-to-l from-teal-400 to-[#008080] rounded-full"
              />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[8px]">
              <span className="text-slate-400">۱۲ درس</span>
              <span className="text-teal-300 font-bold flex items-center gap-0.5">
                <span>ورود به دوره</span>
                <ChevronLeft className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Cellular Physiology */}
        <div className="rounded-xl bg-slate-800/60 border border-white/10 p-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-950 text-purple-300 border border-purple-500/30">
                فیزیولوژی پزشکی
              </span>
              <span className="text-[8px] text-teal-400 font-semibold">اشتراک فعال</span>
            </div>
            <h5 className="font-extrabold text-white text-[10px] sm:text-[11px] leading-tight line-clamp-1">
              فیزیولوژی سلولی و غدد
            </h5>
            <p className="text-[8px] text-slate-400 mt-0.5">پتانسیل غشا و پیام‌رسانی</p>
          </div>

          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-slate-400">پیشرفت مطالعه</span>
              <span className="font-bold text-purple-300">۴۵٪</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: "0%" }}
                whileInView={{ width: "45%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full bg-gradient-to-l from-purple-400 to-purple-600 rounded-full"
              />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[8px]">
              <span className="text-slate-400">۱۸ درس</span>
              <span className="text-purple-300 font-bold flex items-center gap-0.5">
                <span>ورود</span>
                <ChevronLeft className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Source Upload Banner */}
      <div className="mt-2 p-2 rounded-lg bg-teal-950/30 border border-teal-500/20 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <UploadCloud className="w-3.5 h-3.5 text-teal-400" />
          <span className="text-[8px] sm:text-[9px] text-slate-300">
            بارگذاری منابع درسی PDF • استخراج خودکار سرفصل‌ها
          </span>
        </div>
        <span className="text-[8px] font-bold text-teal-400">آماده یادگیری ✔</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Miniature Product Screen 2: Structured Lesson & Content Reader (LearningPage Replica)
// ---------------------------------------------------------------------------
function LessonStudyMiniature() {
  return (
    <div className="absolute inset-0 flex flex-col p-2.5 sm:p-3.5 bg-[#0b1120] text-slate-100 text-right dir-rtl pointer-events-none select-none overflow-hidden text-[8px] sm:text-[9px]">
      {/* Top Breadcrumb & Course Header */}
      <div className="border-b border-white/10 pb-2 mb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-[8px] text-slate-400 font-semibold">
            <span>دوره‌های من</span>
            <span>/</span>
            <span className="text-teal-300 font-bold">فارماکولوژی عمومی</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-teal-300 font-bold">۶۸٪ تکمیل شده</span>
            <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-teal-400 w-[68%]" />
            </div>
          </div>
        </div>

        {/* Study Navigation Tabs */}
        <div className="flex items-center gap-1 text-[8px]">
          <span className="px-2 py-0.5 rounded-t bg-[#008080] text-white font-bold flex items-center gap-1 shadow-sm">
            <BookOpen className="w-2.5 h-2.5" />
            <span>درس‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-slate-400 flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span>فلش‌کارت‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-slate-400 flex items-center gap-1">
            <HelpCircle className="w-2.5 h-2.5" />
            <span>آزمون‌ها</span>
          </span>
          <span className="px-2 py-0.5 text-slate-400 flex items-center gap-1">
            <BarChart3 className="w-2.5 h-2.5" />
            <span>تحلیل</span>
          </span>
        </div>
      </div>

      {/* 2-Column Split: Curriculum Sidebar + Lesson Content */}
      <div className="flex flex-1 gap-2 overflow-hidden">
        {/* Right Sidebar: Chapters & Lessons */}
        <div className="w-[36%] border-l border-white/10 bg-[#0f172a]/70 rounded-lg p-1.5 flex flex-col gap-1 overflow-hidden">
          <div className="flex items-center justify-between pb-1 border-b border-white/10 text-[8px] font-bold text-slate-400">
            <span>سرفصل‌های دوره</span>
            <span className="text-teal-400">۱۴ درس</span>
          </div>

          {/* Module 1 */}
          <div className="space-y-0.5 mt-0.5">
            <div className="p-1 rounded bg-white/5 text-slate-300 flex justify-between items-center text-[7.5px] font-bold">
              <span className="truncate">فصل ۱: کلیات فارماکوکینتیک</span>
              <span className="text-teal-400">✓</span>
            </div>
            <div className="p-1 rounded bg-[#008080]/20 border border-teal-500/40 text-teal-300 font-bold flex justify-between items-center text-[7.5px] shadow-sm">
              <span className="truncate">▶ ۱.۲: متابولیسم کبدی (CYP450)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            </div>
            <div className="p-1 rounded bg-white/5 text-slate-400 truncate text-[7.5px]">
              ○ ۱.۳: کلیرانس و دفع کلیوی
            </div>
            <div className="p-1 rounded bg-white/5 text-slate-400 truncate text-[7.5px]">
              ○ ۱.۴: فارماکودینامیک و گیرنده‌ها
            </div>
          </div>
        </div>

        {/* Left Reader Panel: Rich Lesson Content */}
        <div className="flex-1 bg-slate-900/70 rounded-lg p-2 sm:p-2.5 flex flex-col justify-between border border-white/5 overflow-hidden">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-1">
              <h5 className="font-black text-white text-[9px] sm:text-[10px]">
                درس ۱.۲: متابولیسم کبدی و سیستم آنزیمی P450
              </h5>
              <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-teal-950 text-teal-300 border border-teal-500/30">
                در حال مطالعه
              </span>
            </div>

            <p className="text-[7.5px] sm:text-[8px] text-slate-300 leading-relaxed line-clamp-2">
              واکنش‌های فاز I بیوترانسفورماسیون توسط ایزوآنزیم‌های خانواده CYP3A4 و CYP2D6 هدایت شده و قطبیت مولکول را جهت دفع کلیوی افزایش می‌دهند.
            </p>

            {/* Important Exam Tip Callout Box */}
            <div className="rounded-lg bg-purple-950/40 border border-purple-500/30 p-1.5 flex items-start gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-purple-200 block text-[7.5px] sm:text-[8px]">
                  نکته کلیدی کنکور جامع:
                </span>
                <span className="text-[7px] sm:text-[7.5px] text-purple-300/90 leading-tight block">
                  داروهای مهارکننده سیتوکروم مانند اریترومایسین و سایمتیدین باعث افزایش غلظت پلاسمایی داروهای هم‌زمان می‌شوند.
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[7.5px] sm:text-[8px] text-slate-400">
            <span className="flex items-center gap-0.5">
              <ArrowRight className="w-2.5 h-2.5" />
              <span>درس قبلی</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-500/30 font-bold">
              تیک تکمیل درس ✓
            </span>
            <span className="text-teal-400 font-bold flex items-center gap-0.5">
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
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[radial-gradient(ellipse_at_center,_rgba(0,121,82,0.18),_#0b1120)] text-slate-100 text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Session Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-white text-[10px]">فارماکولوژی قلب و عروق</span>
          <span className="text-[8px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
            الگوریتم هوشمند SRS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-slate-300">کارت ۱۲ از ۴۵</span>
          <div className="w-10 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-teal-400 w-[27%]" />
          </div>
        </div>
      </div>

      {/* Realistic Double-Sided Flashcard Container */}
      <div className="flex-1 flex flex-col justify-between max-w-sm mx-auto w-full rounded-2xl bg-gradient-to-br from-slate-800/95 via-slate-900 to-[#0f172a] border border-teal-500/30 p-3 sm:p-3.5 shadow-2xl relative overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="text-[8px] font-bold text-teal-300 bg-teal-950/80 px-2 py-0.5 rounded-md border border-teal-500/30">
            ❓ سوال فلش‌کارت
          </span>
          <span className="text-[8px] text-slate-400 font-mono">بتابلاکرهای غیرانتخابی (β1/β2)</span>
        </div>

        {/* Question Prompt */}
        <div className="my-auto py-1">
          <p className="text-[9.5px] sm:text-[10.5px] font-extrabold text-white leading-relaxed text-center">
            چرا پروپرانولول در بیماران مبتلا به آسم و COPD منع مصرف مطلق دارد؟
          </p>

          {/* Answer Reveal Area */}
          <div className="mt-2 p-2 rounded-xl bg-teal-950/40 border border-teal-500/30 text-center">
            <span className="text-[8px] font-bold text-teal-400 block mb-0.5">پاسخ علمی:</span>
            <p className="text-[8.5px] sm:text-[9px] text-teal-200 leading-snug">
              به دلیل مهار گیرنده‌های β2 در عضلات صاف برونش و تحریک برونکواسپاسم شدید.
            </p>
          </div>
        </div>

        {/* 4-Button SRS Rating Bar (Spaced Repetition Exact Reproduction) */}
        <div className="pt-1.5 border-t border-white/10">
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5 text-center">
            <div className="p-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300">
              <span className="font-bold text-[8px] block">مجدداً</span>
              <span className="text-[7px] opacity-75 font-mono">&lt; ۱۰ دقیقه</span>
            </div>
            <div className="p-1 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300">
              <span className="font-bold text-[8px] block">سخت</span>
              <span className="text-[7px] opacity-75 font-mono">۱ روز</span>
            </div>
            <div className="p-1 rounded-lg bg-teal-500/30 border border-teal-400 text-teal-200 font-extrabold ring-1 ring-teal-400/50 shadow-sm">
              <span className="text-[8px] block">خوب ✓</span>
              <span className="text-[7px] opacity-90 font-mono">۳ روز</span>
            </div>
            <div className="p-1 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300">
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
    <div className="absolute inset-0 flex flex-col p-3 sm:p-4 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(0,92,85,0.2),_#0b1120)] text-slate-100 text-right dir-rtl pointer-events-none select-none overflow-hidden text-[9px] sm:text-[10px]">
      {/* Top Exam Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-white text-[10px]">آزمون جامع فارماکولوژی بالینی</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800/90 px-2 py-0.5 rounded-lg border border-white/10 text-teal-300 font-mono text-[8px]">
            <Clock className="w-2.5 h-2.5" />
            <span>۱۲:۴۵</span>
          </div>
          <span className="text-[8px] font-bold text-slate-300">سوال ۵ از ۲۰</span>
          <span className="px-2 py-0.5 rounded-lg bg-teal-900/60 border border-teal-500/40 text-teal-300 font-bold text-[8px]">
            پایان آزمون
          </span>
        </div>
      </div>

      {/* Question Card & 4 Options */}
      <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full rounded-2xl bg-slate-900/90 border border-white/15 p-2.5 sm:p-3 shadow-2xl overflow-hidden">
        <div>
          {/* Question Tag */}
          <div className="flex items-center justify-between mb-1 text-[8px] text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-500/30 font-bold">
              سوال ۵ • تک‌انتخابی (علوم پایه)
            </span>
            <span>ضریب: ۲</span>
          </div>

          {/* Question Text */}
          <p className="font-extrabold text-white text-[9px] sm:text-[10px] leading-tight mb-2">
            کدام‌یک از داروهای زیر بتابلاکر غیراختصاصی با خاصیت چربی‌دوست (Lipophilic) بالا بوده و از سد خونی-مغزی (BBB) عبور می‌کند؟
          </p>

          {/* 4 Choices */}
          <div className="space-y-1 text-[8px] sm:text-[8.5px]">
            <div className="p-1.5 rounded-lg bg-slate-800/60 border border-white/10 flex items-center justify-between text-slate-300">
              <span>الف) آتنولول (Atenolol)</span>
              <span className="w-3 h-3 rounded-full border border-slate-600" />
            </div>
            {/* Selected Option */}
            <div className="p-1.5 rounded-lg bg-teal-950/80 border border-teal-400 text-teal-200 font-bold flex items-center justify-between shadow-sm">
              <span>ب) پروپرانولول (Propranolol)</span>
              <span className="w-3 h-3 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center text-[7px] font-black">
                ✓
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-800/60 border border-white/10 flex items-center justify-between text-slate-300">
              <span>ج) اسمولول (Esmolol)</span>
              <span className="w-3 h-3 rounded-full border border-slate-600" />
            </div>
            <div className="p-1.5 rounded-lg bg-slate-800/60 border border-white/10 flex items-center justify-between text-slate-300">
              <span>د) متوپرولول (Metoprolol)</span>
              <span className="w-3 h-3 rounded-full border border-slate-600" />
            </div>
          </div>
        </div>

        {/* Bottom Exam Toolbar */}
        <div className="flex items-center justify-between border-t border-white/10 pt-1.5 mt-1.5 text-[8px]">
          <span className="text-slate-400 flex items-center gap-0.5">
            <ArrowRight className="w-2.5 h-2.5" />
            <span>سوال قبلی</span>
          </span>

          <div className="flex items-center gap-1 text-purple-300 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-lg font-bold">
            <Bot className="w-2.5 h-2.5" />
            <span>راهنمایی هوش مصنوعی</span>
          </div>

          <span className="px-2.5 py-0.5 rounded-lg bg-[#008080] text-white font-bold flex items-center gap-0.5 shadow-sm">
            <span>سوال بعدی</span>
            <ArrowLeft className="w-2.5 h-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
