/**
 * Adaptive Learning Concept (Experimental / Future Product Concept)
 *
 * Evolution & Lineage:
 * TurningPointConcept (سابق در صفحه درباره ما) → AdaptiveLearningConcept (مفهوم محصول آینده)
 *
 * NOTE:
 * This component is not rendered in the live production UI of Landing or About,
 * as AVANA does not currently feature a standalone real-time adaptive learning engine in MVP.
 * It has been cleanly transitioned and preserved here as a foundational building block for future
 * development once real student telemetry, mastery algorithms, and dynamic study sequencing are ready.
 *
 * Core Product Concept:
 * «یادگیری که خودش را با وضعیت، رفتار و پیشرفت دانشجو هماهنگ می‌کند.»
 *
 * Required Backend Signals & Capabilities for Future Production Implementation:
 * 1. Learning Progress Tracking (پایش مستمر مسیر و پیشرفت تحصیلی دانشجو)
 * 2. Study History & Session Duration (تحلیل بازه‌ها و تاریخچه جلسات مطالعه)
 * 3. Flashcard Review History (داده‌های مرور فاصله‌دار SRS و نرخ یادآوری)
 * 4. Exam Performance Metrics (نتایج آزمون‌ها و سنجش تشخیصی نقاط ضعف)
 * 5. Difficulty / Mastery Signals (سیگنال‌های هوشمند تسلط و رتبه‌بندی سختی مفاهیم)
 * 6. Learning Recommendations Engine (موتور توصیه محتوای متناسب با سطح دانشجو)
 * 7. Adaptive Review Scheduling (زمان‌بندی هوشمند مرورها بر پایه منحنی فراموشی)
 * 8. Personalized Learning Path (نقشه راه اختصاصی یادگیری بر اساس اهداف حرفه‌ای)
 *
 * How to Re-enable in the Future:
 * 1. Import `AdaptiveLearningConcept` into the target feature or page (e.g., `AboutPage.tsx` or `StudySession`).
 * 2. Add `<AdaptiveLearningConcept />` into the component tree.
 * 3. Connect real student analytics and pharmacology ontology nodes from the backend API.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "../about/shared/SectionHeading.js";
import {
  Sparkles,
  Pill,
  Cog,
  Target,
  Activity,
  Stethoscope,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";
import { toPersianDigits, formatPersianOf } from "@avana/domain";

export interface ChainNode {
  step: number;
  label: string;
  enLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export interface DrugChainData {
  id: string;
  name: string;
  enName: string;
  category: string;
  summary: string;
  steps: {
    title: string;
    description: string;
    details: string;
  }[];
}

export const CHAIN_STAGES: ChainNode[] = [
  { step: 1, label: "دارو", enLabel: "Drug Molecule", icon: Pill, color: "teal" },
  { step: 2, label: "مکانیسم اثر", enLabel: "Mechanism of Action", icon: Cog, color: "cyan" },
  { step: 3, label: "گیرنده هدف", enLabel: "Target Receptor", icon: Target, color: "blue" },
  { step: 4, label: "اثر فیزیولوژیک", enLabel: "Physiologic Effect", icon: Activity, color: "purple" },
  { step: 5, label: "کاربرد بالینی", enLabel: "Clinical Indication", icon: Stethoscope, color: "emerald" },
  { step: 6, label: "عوارض جانبی", enLabel: "Adverse Effects", icon: AlertTriangle, color: "amber" },
];

export const DRUGS_DATA: DrugChainData[] = [
  {
    id: "propranolol",
    name: "پروپرانولول",
    enName: "Propranolol",
    category: "بتا بلاکر غیرانتخابی (Non-selective β-blocker)",
    summary: "داروی مرجع برای مهار گیرنده‌های سمپاتیک در سیستم قلبی-عروقی و عروق مغزی.",
    steps: [
      {
        title: "مولکول پروپرانولول",
        description: "یک آنتاگونیست بتا آدرنرژیک با ماهیت چربی‌دوست (Lipophilic) بالا.",
        details: "به راحتی از سد خونی-مغزی (BBB) عبور کرده و علاوه بر اثرات محیطی، اثرات مرکزی نیز اعمال می‌کند.",
      },
      {
        title: "مهار رقابتی کاتکول‌آمین‌ها",
        description: "جایگزینی در جایگاه اتصال اپی‌نفرین و نوراپی‌نفرین بر روی گیرنده‌ها.",
        details: "بدون ایجاد فعالیت سمپاتومیمتیک ذاتی (ISA)، پاسخ‌های تحریکی آدرنرژیک را سرکوب می‌نماید.",
      },
      {
        title: "آنتاگونیست گیرنده‌های β1 و β2",
        description: "اتصال با تمایل یکسان به گیرنده‌های قلبی (β1) و تنفسی/عروقی (β2).",
        details: "اثر بر گیرنده β1 در گره SA/AV و میوکارد، و اثر بر β2 در عضلات صاف برونش و عروق خونی.",
      },
      {
        title: "کاهش بار کاری و ضربان قلب",
        description: "کاهش ضربان (Negative Chronotropy) و کاهش قدرت انقباضی قلب (Negative Inotropy).",
        details: "مهار ترشح رنین از سلول‌های ژوکستاگلومرولار کلیه و ایجاد برونکواسپاسم نسبی در راه‌های هوایی.",
      },
      {
        title: "کنترل فشار خون، آنژین و میگرن",
        description: "کاهش فشار خون شریانی، تسکین حملات آنژین صدری و پیشگیری از حملات میگرن.",
        details: "همچنین در کنترل تاکی‌کاردی ناشی از پرکاری تیروئید و اضطراب کارایی بالینی دارد.",
      },
      {
        title: "برادی‌کاردی و برونکواسپاسم",
        description: "افت شدید ضربان قلب و تشدید حملات آسم در بیماران تنفسی.",
        details: "می‌تواند علائم افت قند خون (مانند تپش قلب و لرزش) را در بیماران دیابتی بپوشاند.",
      },
    ],
  },
  {
    id: "metformin",
    name: "متفورمین",
    enName: "Metformin",
    category: "بیگوانید ضددیابت (Biguanide Antidiabetic)",
    summary: "خط اول درمان دارویی در دیابت نوع ۲ با تکیه بر کاهش مقاومت به انسولین.",
    steps: [
      {
        title: "مولکول متفورمین هیدروکلراید",
        description: "مشتق دارویی بیگوانید با بار مثبت و حلالیت بالا در آب.",
        details: "جذب روده‌ای از طریق ناقل‌های کاتیون آلی (OCT1/OCT2) بدون متابولیسم کبدی.",
      },
      {
        title: "فعال‌سازی مسیر کیناز AMPK",
        description: "مهار کمپلکس I زنجیره تنفسی میتوکندری و تحریک آنزیم AMP-activated protein kinase.",
        details: "تغییر نسبت AMP به ATP در سلول‌های هپاتوسیت و تنظیم بیان ژن‌های متابولیک گلوکز.",
      },
      {
        title: "مهار آنزیم‌های کلیدی گلوکونئوژنز",
        description: "مهار پیرووات کربوکسیلاز و فروکتوز-۱و۶-بیس‌فسفاتاز در کبد.",
        details: "جلوگیری از ساخت قند جدید توسط بافت کبد و تحریک انتقال‌دهنده گلوکز GLUT4 در عضلات.",
      },
      {
        title: "کاهش قند خون ناشتا و افزایش حساسیت",
        description: "کاهش محسوس خروجی گلوکز کبد و بهبود پاسخ بافت محیطی به انسولین.",
        details: "کاهش هموگلوبین A1c بدون ایجاد افزایش وزن و بدون تحریک مستقیم ترشح انسولین.",
      },
      {
        title: "مدیریت دیابت نوع ۲ و تخمدان پلی‌کیستیک",
        description: "داروی استاندارد طلایی در درمان دیابت نوع ۲ و بهبود تخمک‌گذاری در PCOS.",
        details: "دارای مزایای اثبات‌شده محافظت قلبی-عروقی در بیماران مبتلا به اضافه وزن و سندرم متابولیک.",
      },
      {
        title: "ناراحتی‌های گوارشی و افت ویتامین B12",
        description: "شایع‌ترین عارضه: تهوع، نفخ و اسهال وابسته به دوز که با مصرف همراه غذا کم می‌شود.",
        details: "اسیدوز لاکتیک عارضه بسیار نادر اما خطیری است که نیازمند پایش عملکرد کلیوی (eGFR) است.",
      },
    ],
  },
  {
    id: "atropine",
    name: "آتروپین",
    enName: "Atropine",
    category: "آنتی‌کولینرژیک / آنتاگونیست موسکارینی",
    summary: "داروی اورژانس احیا برای درمان برادی‌کاردی و پادزهر مسمومیت‌های حشره‌کش.",
    steps: [
      {
        title: "آلکالوئید طبیعی بلادونا",
        description: "یک آمین سوم استخراج شده از گیاه آتروپا بلادونا با ساختار استری.",
        details: "با دسترسی سریع بافتی و امکان نفوذ به بافت‌های عصبی، چشم و اندام‌های احشایی.",
      },
      {
        title: "مهار رقابتی استیل‌کولین",
        description: "اشغال جایگاه فعال گیرنده‌های پاراسمپاتیک و جلوگیری از عملکرد استیل‌کولین.",
        details: "خنثی‌سازی کامل پاسخ‌های تحریکی عصب واگ بر قلب و غدد ترشحی بدن.",
      },
      {
        title: "آنتاگونیست گیرنده‌های موسکارینی M1 تا M5",
        description: "اتصال غیرانتخابی اما پرقدرت به تمامی زیرنوع‌های گیرنده موسکارینی.",
        details: "به ویژه اثر بر گیرنده‌های M2 در بافت قلبی و M3 در عضلات صاف احشایی و غدد بزاقی.",
      },
      {
        title: "افزایش هدایت قلبی و کاهش ترشحات",
        description: "افزایش سرعت هدایت در گره دهلیزی-بطنی (AV Node) و خشکی مخاطات و گشادی مردمک.",
        details: "شل شدن عضلات صاف لوله گوارش، مجاری ادراری و کیسه صفرا.",
      },
      {
        title: "احیای برادی‌کاردی حاد و پادزهر ارگانوفسفره",
        description: "درمان اورژانسی شوک ناشی از کندی ضربان قلب و درمان مسمومیت با سموم کشاورزی.",
        details: "کاربرد تشخیصی در چشم‌پزشکی جهت معاینه ته چشم و ایجاد میدریاز پایدار.",
      },
      {
        title: "خشکی شدید دهان، تاری دید و احتباس ادرار",
        description: "عوارض کلاسیک آنتی‌کولینرژیک به دلیل مهار عمومی سیستم پاراسمپاتیک.",
        details: "در سالمندان ممکن است سبب گیجی، بی‌قراری، گرگرفتگی پوستی و تاکی‌کاردی افراطی شود.",
      },
    ],
  },
];

export const AdaptiveLearningConcept: React.FC = () => {
  const [selectedDrugId, setSelectedDrugId] = useState<string>("propranolol");
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  const currentDrug = DRUGS_DATA.find((d) => d.id === selectedDrugId) || DRUGS_DATA[0];
  const activeStage = CHAIN_STAGES[activeStepIndex];
  const activeStepData = currentDrug.steps[activeStepIndex];

  return (
    <section
      id="turning-point"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش تعاملی زنجیره مفاهیم داروسازی"
    >
      {/* Ambient Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Heading */}
      <SectionHeading
        badge="لحظه تغییر و کشف ارتباط"
        badgeIcon={<Sparkles className="w-4 h-4 text-teal-300" />}
        title="اگر یادگیری می‌توانست خودش را"
        highlightText="با تو هماهنگ کند چه؟"
        subtitle="در آوانا، یادگیری حفظ کردن داده‌های جزیره‌ای نیست؛ بلکه پیوند زدن مولکول به گیرنده، اثر و بالین است. داروی مورد نظرتان را انتخاب کنید و گام‌به‌گام ارتباطات را کشف نمایید."
      />

      {/* Drug Selection Chips */}
      <div className="flex flex-wrap justify-center items-center gap-3 mb-10" role="tablist" aria-label="انتخاب داروی نمونه">
        {DRUGS_DATA.map((drug) => {
          const isSelected = drug.id === selectedDrugId;
          return (
            <button
              key={drug.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setSelectedDrugId(drug.id);
                setActiveStepIndex(0);
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center gap-2 border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                isSelected
                  ? "bg-teal-500/20 text-teal-200 border-teal-400/50 shadow-[0_0_20px_rgba(45,212,191,0.25)] scale-105"
                  : "bg-slate-900/60 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20"
              }`}
            >
              <Pill className={`w-4 h-4 ${isSelected ? "text-teal-300" : "text-slate-500"}`} />
              <span>{drug.name}</span>
              <span className="text-[10px] font-sans opacity-70">({drug.enName})</span>
            </button>
          );
        })}
      </div>

      {/* Selected Drug Header Info */}
      <div className="max-w-4xl mx-auto mb-6 p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-white">{currentDrug.name}</span>
            <span className="text-xs text-teal-400 font-mono">[{currentDrug.enName}]</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/10">
              {currentDrug.category}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{currentDrug.summary}</p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-teal-300 bg-teal-950/60 border border-teal-500/30 px-3 py-1.5 rounded-lg shrink-0">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>{formatPersianOf(activeStepIndex + 1, CHAIN_STAGES.length, { prefix: "مرحله" })}</span>
        </div>
      </div>

      {/* Interactive Chain Visualizer (6 Steps Linked by SVG Path) */}
      <div className="max-w-4xl mx-auto rounded-2xl bg-slate-900/90 border border-white/15 p-4 sm:p-6 md:p-8 backdrop-blur-2xl shadow-2xl">
        {/* Node Stepper Bar */}
        <div className="relative mb-8 pb-4">
          {/* Connecting Line between nodes */}
          <div className="hidden md:block absolute top-1/2 left-6 right-6 h-1 bg-slate-800 -translate-y-1/2 z-0" />
          <motion.div
            className="hidden md:block absolute top-1/2 right-6 h-1 bg-gradient-to-l from-teal-400 to-cyan-400 -translate-y-1/2 z-0 origin-right transition-all duration-500"
            style={{
              width: `${(activeStepIndex / (CHAIN_STAGES.length - 1)) * 92}%`,
            }}
          />

          {/* Stepper Nodes */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 relative z-10">
            {CHAIN_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = idx === activeStepIndex;
              const isPast = idx < activeStepIndex;

              return (
                <button
                  key={stage.step}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    isActive
                      ? "bg-teal-950/80 border-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.3)] scale-105"
                      : isPast
                      ? "bg-slate-800/90 border-teal-500/40 text-teal-300"
                      : "bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                  }`}
                  aria-label={`${stage.label} (${stage.enLabel})`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-teal-500 text-slate-950 font-bold shadow-lg shadow-teal-500/30 scale-110"
                        : isPast
                        ? "bg-teal-950 text-teal-300 border border-teal-500/50"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span
                    className={`text-[11px] sm:text-xs font-bold leading-tight text-center ${
                      isActive ? "text-teal-200" : isPast ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="hidden sm:inline-block text-[9px] text-slate-500 font-sans text-center truncate max-w-[70px]">
                    {stage.enLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detailed Concept Exploration Card for Active Step */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedDrugId}-${activeStepIndex}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="rounded-[16px] bg-[#142124] border border-[#1e3235] p-5 sm:p-7 relative overflow-hidden"
          >
            {/* Ambient Background Watermark Icon */}
            <div className="absolute left-4 -bottom-6 opacity-5 pointer-events-none">
              <activeStage.icon className="w-44 h-44 text-teal-400" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-bold">
                  <activeStage.icon className="w-3.5 h-3.5" />
                  <span>
                    گام {toPersianDigits(activeStage.step)}: {activeStage.label}
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-sans">{activeStage.enLabel}</span>
              </div>

              <h4 className="text-lg sm:text-xl font-black text-white mb-2">
                {activeStepData.title}
              </h4>

              <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-4">
                {activeStepData.description}
              </p>

              <div className="p-3.5 rounded-lg bg-teal-950/40 border border-teal-500/20 text-xs sm:text-sm text-teal-200/90 leading-relaxed">
                <strong className="text-teal-400 font-bold ml-1.5">ارتباط شناختی در آوانا:</strong>
                {activeStepData.details}
              </div>

              {/* Step Navigation Controls */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                <button
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className={`px-4 py-2 rounded-[10px] text-xs font-bold transition-all ${
                    activeStepIndex === 0
                      ? "opacity-30 cursor-not-allowed text-slate-500"
                      : "text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
                  }`}
                >
                  گام قبلی
                </button>

                <div className="text-xs text-slate-400 font-medium">
                  {activeStepIndex === CHAIN_STAGES.length - 1 ? (
                    <span className="text-teal-300 font-bold">زنجیره ارتباطی کامل شد ✔</span>
                  ) : (
                    <span>برای گام بعدی روی مرحله بعدی کلیک کنید</span>
                  )}
                </div>

                <button
                  disabled={activeStepIndex === CHAIN_STAGES.length - 1}
                  onClick={() =>
                    setActiveStepIndex((prev) => Math.min(CHAIN_STAGES.length - 1, prev + 1))
                  }
                  className={`px-4 py-2 rounded-[10px] text-xs font-bold flex items-center gap-1.5 transition-all ${
                    activeStepIndex === CHAIN_STAGES.length - 1
                      ? "opacity-30 cursor-not-allowed text-slate-500"
                      : "bg-[#008080] hover:bg-[#007575] text-white shadow-md"
                  }`}
                >
                  <span>گام بعدی</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

// Backward-compatible alias
export const AboutTurningPointSection = AdaptiveLearningConcept;
export default AdaptiveLearningConcept;
