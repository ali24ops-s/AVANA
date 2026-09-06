/**
 * Product Experience Section — "آوانا را تجربه کن"
 *
 * Interactive Test-Drive of AVANA's Core Features:
 * 1. Flashcard Flip & SRS Interval Scheduling Demo
 * 2. AI Study Assistant Reasoning & Answer Demo
 * 3. Structured Learning Hierarchy Path
 * 4. Adaptive Mini Quiz with Real-Time Rationale
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Bot,
  Layers,
  Award,
  Sparkles,
  RotateCw,
  CheckCircle2,
  ArrowLeft,
  BookOpen,
  Brain,
} from "lucide-react";

type ExperienceTab = "flashcard" | "ai" | "hierarchy" | "quiz";

export function ProductExperienceSection() {
  const [activeTab, setActiveTab] = useState<ExperienceTab>("flashcard");

  // Flashcard Demo State
  const [isFlipped, setIsFlipped] = useState(false);
  const [srsScheduledDays, setSrsScheduledDays] = useState<number | null>(null);

  // AI Assistant Demo State
  const [selectedAiQuestion, setSelectedAiQuestion] = useState(0);

  // Quiz Demo State
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);

  const aiQuestions = [
    {
      q: "چرا بتابلاکرها ضربان قلب را کاهش می‌دهند؟",
      steps: [
        "شناسایی گیرنده هدف: گیرنده‌های بتا-۱ آدرنرژیک در گره SA و بافت میوکارد قلب.",
        "مکانیسم سلولی: مهار رقابتی کاتکول‌آمین‌ها و کاهش سطح cAMP درون‌سلولی.",
        "پاسخ فیزیولوژیک: کاهش ضربان (Negative Chronotropy) و کاهش قدرت انقباضی.",
      ],
      answer:
        "بتابلاکرها (مانند پروپرانولول و متوپرولول) با اتصال به گیرنده‌های β1 در گره سینوسی-دهلیزی، اثر تحریکی سمپاتیک را مهار کرده و سرعت هدایت الکتریکی و ضربان قلب را کم می‌کنند.",
      examTip: "نکته کنکوری: بتابلاکرهای غیرانتخابی در بیماران مبتلا به آسم به علت مهار β2 در برونش‌ها منع مصرف دارند.",
    },
    {
      q: "تفاوت فارماکوکینتیک و فارماکودینامیک چیست؟",
      steps: [
        "فارماکوکینتیک (PK): کاری که بدن با دارو می‌کند (جذب، توزیع، متابولیسم، دفع - ADME).",
        "فارماکودینامیک (PD): کاری که دارو با بدن می‌کند (اتصال به گیرنده، اثرات بیوشیمیایی).",
        "پیوند مفهومی: دوز دارو تعیین‌کننده غلظت در پلاسما (PK) و غلظت تعیین‌کننده شدت اثر (PD) است.",
      ],
      answer:
        "فارماکوکینتیک مسیر سرنوشت دارو در بدن (ADME) را بررسی می‌کند و فارماکودینامیک پاسخ فیزیولوژیک و فارماکولوژیک سلول به حضور مولکول دارو را توضیح می‌دهد.",
      examTip: "نکته کلیدی: اثر عبور اول کبدی (First-pass metabolism) یک متغیر اختصاصی فارماکوکینتیک است.",
    },
    {
      q: "مکانیسم عملکرد متفورمین در کاهش قند خون چیست؟",
      steps: [
        "مهار کمپلکس I زنجیره تنفسی میتوکندری در هپاتوسیت‌های کبد.",
        "فعال‌سازی آنزیم کیناز سنسور انرژی AMPK در سطح سلولی.",
        "مهار آنزیم‌های کلیدی گلوکونئوژنز و افزایش حساسیت عضلات به انسولین.",
      ],
      answer:
        "متفورمین از طریق تحریک آنزیم AMPK، تولید قند نو توسط کبد (Gluconeogenesis) را متوقف ساخته و بازجذب گلوکز توسط عضلات اسکلتی را بهبود می‌بخشد.",
      examTip: "نکته بالینی: متفورمین ترشح انسولین را تحریک نمی‌کند؛ بنابراین ایجاد هیپوگلیسمی با آن نادر است.",
    },
  ];

  const quizQuestion = {
    text: "کدام‌یک از داروهای زیر یک بتابلاکر غیرانتخابی (Non-selective) با ویژگی چربی‌دوست (Lipophilic) بالا است که از سد خونی-مغزی عبور می‌کند؟",
    options: [
      { id: 1, label: "الف) آتنولول (Atenolol)", correct: false },
      { id: 2, label: "ب) پروپرانولول (Propranolol)", correct: true },
      { id: 3, label: "ج) اسمولول (Esmolol)", correct: false },
      { id: 4, label: "د) متوپرولول (Metoprolol)", correct: false },
    ],
    explanation:
      "پاسخ صحیح گزینه (ب) است. پروپرانولول به دلیل انحلال‌پذیری بالا در چربی به راحتی از سد خونی-مغزی (BBB) عبور کرده و علاوه بر بیماری‌های قلبی، در پیشگیری از حملات میگرن و اضطراب عملکردی نیز کاربرد دارد.",
  };

  return (
    <section
      id="experience"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden text-right"
      aria-label="بخش تجربه تعاملی امکانات آوانا"
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[550px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border mb-4 bg-teal-950/60 text-teal-300 border-teal-500/40 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
          <span>تست درایو و تجربه زنده</span>
        </div>

        <h2 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black mb-4 text-white leading-tight">
          آوانا را تجربه کن
        </h2>
        <p className="text-sm sm:text-base md:text-lg leading-relaxed text-slate-300">
          قبل از شروع، بخشی از سیستم را همین‌جا لمس کن و تفاوت یادگیری هوشمند را ببین.
        </p>
      </div>

      {/* Main Experience Container */}
      <div className="max-w-4xl mx-auto rounded-3xl bg-slate-900/85 border border-teal-500/30 p-4 sm:p-7 md:p-8 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,128,128,0.15)]">
        {/* Navigation Tabs Bar */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8 p-1.5 bg-slate-950/70 border border-white/10 rounded-2xl"
          role="tablist"
          aria-label="انتخاب تجربه زنده محصول"
        >
          <button
            role="tab"
            aria-selected={activeTab === "flashcard"}
            onClick={() => setActiveTab("flashcard")}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "flashcard"
                ? "bg-teal-500 text-slate-950 shadow-lg font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>فلش‌کارت SRS</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "ai"}
            onClick={() => setActiveTab("ai")}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "ai"
                ? "bg-teal-500 text-slate-950 shadow-lg font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>دستیار هوشمند AI</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "hierarchy"}
            onClick={() => setActiveTab("hierarchy")}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "hierarchy"
                ? "bg-teal-500 text-slate-950 shadow-lg font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>مسیر یادگیری</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "quiz"}
            onClick={() => setActiveTab("quiz")}
            className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "quiz"
                ? "bg-teal-500 text-slate-950 shadow-lg font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>آزمون خودسنجی</span>
          </button>
        </div>

        {/* Dynamic Interactive Stage */}
        <AnimatePresence mode="wait">
          {/* 1. Flashcard & Spaced Repetition Demo */}
          {activeTab === "flashcard" && (
            <motion.div
              key="flashcard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              {/* Header explanation */}
              <div className="w-full flex items-center justify-between flex-wrap gap-2 mb-6 pb-3 border-b border-white/10 text-xs">
                <span className="text-teal-300 font-bold flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5" />
                  روی کارت کلیک کنید تا پاسخ ظاهر شود؛ سپس میزان تسلط را انتخاب نمایید:
                </span>
                <span className="text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-white/10">
                  پیش‌نمایش تعاملی (Demo)
                </span>
              </div>

              {/* 3D Flippable Flashcard Container */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                role="button"
                tabIndex={0}
                aria-label="ورق زدن فلش کارت"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setIsFlipped(!isFlipped);
                  }
                }}
                className="w-full max-w-md h-52 sm:h-56 cursor-pointer perspective-1000 select-none group"
              >
                <div
                  className={`relative w-full h-full rounded-2xl transition-transform duration-500 transform-style-3d border shadow-2xl ${
                    isFlipped
                      ? "rotate-y-180 bg-gradient-to-br from-teal-950/90 via-slate-900 to-slate-950 border-teal-500/50"
                      : "bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900 border-white/15 group-hover:border-teal-400/40"
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front: Question */}
                  <div
                    className="absolute inset-0 p-6 flex flex-col justify-between items-center text-center backface-hidden"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <div className="w-full flex justify-between items-center text-xs text-slate-400">
                      <span className="text-teal-400 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-500/30">
                        فارماکولوژی سیستم عصبی
                      </span>
                      <span>روی کارت کلیک کنید 👆</span>
                    </div>

                    <p className="text-sm sm:text-base font-bold text-white leading-relaxed my-auto">
                      گیرنده اصلی استیل‌کولین در صفحه محرکه عضلانی چیست و توسط چه کلاسی از داروها مهار می‌شود؟
                    </p>

                    <div className="text-[11px] text-teal-300 font-semibold flex items-center gap-1">
                      <span>مشاهده پاسخ</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Back: Answer (rotated 180) */}
                  <div
                    className="absolute inset-0 p-6 flex flex-col justify-between items-center text-center rotate-y-180 backface-hidden"
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <div className="w-full flex justify-between items-center text-xs text-teal-300">
                      <span className="font-bold bg-teal-950 px-2 py-0.5 rounded border border-teal-500/30">
                        پاسخ علمی و بالینی
                      </span>
                      <span>بازگشت به سوال ↩</span>
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-slate-100 leading-relaxed my-auto">
                      گیرنده نیکوتینی نوع عضلانی (Nm). توسط داروهای بلاک‌کننده عصبی-عضلانی (مانند آتراکوریوم و سوکسینیل‌کولین) مهار یا فلج می‌شود.
                    </p>

                    <div className="text-[11px] text-teal-400 font-mono">
                      [مبحث: اتصالات نوروماسکولار]
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 SRS Action Buttons */}
              <div className="w-full max-w-md mt-6">
                <p className="text-xs text-slate-400 text-center mb-3">
                  درجه سختی این کارت را مشخص کنید تا هوش مصنوعی زمان مرور بعدی را تنظیم نماید:
                </p>
                <div className="grid grid-cols-4 gap-2 text-xs font-bold text-center">
                  <button
                    onClick={() => setSrsScheduledDays(1)}
                    className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 transition-colors active:scale-95"
                  >
                    <span>مجدداً</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۱ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(3)}
                    className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors active:scale-95"
                  >
                    <span>سخت</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۳ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(7)}
                    className="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-300 hover:bg-teal-500/25 transition-colors active:scale-95"
                  >
                    <span>خوب</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۷ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(14)}
                    className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 hover:bg-blue-500/25 transition-colors active:scale-95"
                  >
                    <span>آسان</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۱۴ روز بعد</span>
                  </button>
                </div>
              </div>

              {/* Scheduled Status Toast */}
              {srsScheduledDays && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 p-3 rounded-xl bg-teal-950/80 border border-teal-500/40 text-teal-200 text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>
                    الگوریتم مرور فاصله‌دار (SRS): این کارت برای <strong>{srsScheduledDays} روز دیگر</strong> در نوبت یادآوری هوشمند قرار گرفت.
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* 2. AI Copilot Demo */}
          {activeTab === "ai" && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10 text-xs">
                <span className="text-teal-300 font-bold flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-purple-400" />
                  یک سوال نمونه انتخاب کنید تا فرآیند استدلال هوش مصنوعی آوانا را مشاهده نمایید:
                </span>
                <span className="text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-white/10">
                  شبیه‌ساز هوش مصنوعی (Demo)
                </span>
              </div>

              {/* Sample Question Chips */}
              <div className="flex flex-wrap gap-2.5">
                {aiQuestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedAiQuestion(idx);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-right border ${
                      selectedAiQuestion === idx
                        ? "bg-purple-500/20 text-purple-200 border-purple-400/60 shadow-md"
                        : "bg-slate-800/60 text-slate-300 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <span>💬 {item.q}</span>
                  </button>
                ))}
              </div>

              {/* AI Reasoning Pipeline Box */}
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-950/80 border border-purple-500/30 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span>مراحل استدلال شناختی دستیار هوشمند:</span>
                </div>

                <div className="space-y-2">
                  {aiQuestions[selectedAiQuestion].steps.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-slate-300 flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {sIdx + 1}
                      </span>
                      <p className="leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>

                {/* Final Structured Answer */}
                <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <span>پاسخ تشریحی دستیار آوانا:</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-100 leading-relaxed font-body">
                    {aiQuestions[selectedAiQuestion].answer}
                  </p>
                  <div className="p-2 rounded bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200 mt-2">
                    {aiQuestions[selectedAiQuestion].examTip}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 3. Learning Hierarchy Flow Demo */}
          {activeTab === "hierarchy" && (
            <motion.div
              key="hierarchy"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10 text-xs">
                <span className="text-teal-300 font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-teal-400" />
                  معماری ساختاریافته یادگیری: تبدیل جزوات سنگین به قطعات شناختی قابل هضم
                </span>
                <span className="text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-white/10">
                  سلسله‌مراتب دروس
                </span>
              </div>

              {/* 4-Level Interactive Flow Tree */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-teal-950/40 border border-teal-500/30 flex flex-col justify-between">
                  <span className="text-[10px] text-teal-400 font-bold mb-1">سطح ۱: دوره آموزشی</span>
                  <h4 className="font-bold text-sm text-white">فارماکولوژی پزشکی</h4>
                  <p className="text-[11px] text-slate-300 mt-2">دسته‌بندی جامع مباحث علوم پایه و بالینی</p>
                </div>

                <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col justify-between">
                  <span className="text-[10px] text-cyan-400 font-bold mb-1">سطح ۲: سرفصل / فصل</span>
                  <h4 className="font-bold text-sm text-white">فصل ۴: سیستم خودمختار</h4>
                  <p className="text-[11px] text-slate-300 mt-2">تفکیک مباحث آناتومی و فیزیولوژی مرتبط</p>
                </div>

                <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex flex-col justify-between">
                  <span className="text-[10px] text-purple-400 font-bold mb-1">سطح ۳: درسنامه عمیق</span>
                  <h4 className="font-bold text-sm text-white">درس ۴.۲: مهارکننده‌های بتا</h4>
                  <p className="text-[11px] text-slate-300 mt-2">خلاصه‌های کاربردی و محیط مطالعه تیره</p>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col justify-between">
                  <span className="text-[10px] text-emerald-400 font-bold mb-1">سطح ۴: تثبیت و سنجش</span>
                  <h4 className="font-bold text-sm text-white">فلش‌کارت و آزمون آزمایشی</h4>
                  <p className="text-[11px] text-slate-300 mt-2">انتقال مفاهیم به حافظه دائم با تحلیل کارنامه</p>
                </div>
              </div>

              {/* Mock Lesson Viewer Box */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-white/10 space-y-3">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <BookOpen className="w-4 h-4 text-teal-400" />
                    <span>محیط مطالعه ساختاریافته آوانا (نمونه زنده درسنامه)</span>
                  </div>
                  <span className="text-teal-300 text-[11px] bg-teal-950 px-2 py-0.5 rounded border border-teal-500/30">
                    پیشرفت: ۱۰۰٪ ✓
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  داروهای مسدودکننده گیرنده بتا (Beta-blockers) با کاهش ضربان قلب و فشار خون شریانی، اکسیژن مورد نیاز میوکارد را تعدیل می‌کنند. در آوانا هر نکته با ارجاع به گیرنده‌ها، عوارض و تداخلات به شکل ماژولار طبقه‌بندی می‌شود.
                </p>
              </div>
            </motion.div>
          )}

          {/* 4. Adaptive Mini Quiz Demo */}
          {activeTab === "quiz" && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10 text-xs">
                <span className="text-teal-300 font-bold flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" />
                  یک گزینه را انتخاب کنید تا نحوه سنجش و کارنامه تحلیلی آوانا را بررسی نمایید:
                </span>
                <span className="text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full border border-white/10">
                  شبیه‌ساز سوال استاندارد
                </span>
              </div>

              {/* Question Text */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-white/10">
                <span className="text-[11px] text-amber-400 font-bold block mb-1.5">سوال ۱ از ۱ — فارماکولوژی</span>
                <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                  {quizQuestion.text}
                </p>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quizQuestion.options.map((option) => {
                  const isSelected = selectedQuizOption === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setSelectedQuizOption(option.id)}
                      className={`p-3.5 rounded-xl text-xs font-bold text-right transition-all border cursor-pointer ${
                        isSelected
                          ? option.correct
                            ? "bg-teal-500/20 text-teal-200 border-teal-400 shadow-lg"
                            : "bg-rose-500/20 text-rose-200 border-rose-400 shadow-lg"
                          : "bg-slate-900/80 text-slate-300 border-white/10 hover:border-white/25"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option.label}</span>
                        {isSelected && (
                          <span>{option.correct ? "✓ صحیح" : "✕ نادرست"}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Instant Explanation Toast */}
              {selectedQuizOption !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-slate-950/90 border border-teal-500/40 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    <span>تحلیل و پاسخ تشریحی طراح سوال:</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {quizQuestion.explanation}
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
