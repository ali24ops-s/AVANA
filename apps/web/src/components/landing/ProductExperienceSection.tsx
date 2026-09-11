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
import { Badge, Tabs } from "@avana/ui";

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
      className="snap-section relative py-10 lg:py-0 lg:h-[calc(100dvh-80px)] lg:min-h-[calc(100dvh-80px)] flex flex-col justify-center px-6 max-w-[1280px] mx-auto overflow-hidden text-right scroll-mt-20 border-y border-[var(--avana-border-default)] bg-white"
      aria-label="بخش تجربه تعاملی امکانات آوانا"
    >
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-3 lg:mb-4">
        <div className="mb-2 flex justify-center">
          <Badge
            variant="primary"
            size="md"
            icon={<Sparkles className="w-3.5 h-3.5 text-[#008080]" />}
            className="px-3 py-1 shadow-xs"
          >
            تست درایو و تجربه زنده
          </Badge>
        </div>

        <h2 className="font-headline text-2xl sm:text-3xl md:text-4xl font-black mb-1.5 text-[var(--avana-text-primary)] leading-tight">
          آوانا را تجربه کن
        </h2>
        <p className="text-xs sm:text-sm md:text-base leading-relaxed text-[var(--avana-text-secondary)]">
          قبل از شروع، بخشی از سیستم را همین‌جا لمس کن و تفاوت یادگیری هوشمند را ببین.
        </p>
      </div>

      {/* Main Experience Container */}
      <div className="max-w-4xl mx-auto rounded-[16px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] p-3.5 sm:p-5 md:p-5 shadow-xs w-full">
        {/* Navigation Tabs Bar */}
        <div className="mb-4">
          <Tabs
            items={[
              {
                id: "flashcard",
                label: "فلش‌کارت SRS",
                icon: <CreditCard className="w-4 h-4" />,
              },
              {
                id: "ai",
                label: "دستیار هوشمند AI",
                icon: <Bot className="w-4 h-4" />,
              },
              {
                id: "hierarchy",
                label: "مسیر یادگیری",
                icon: <Layers className="w-4 h-4" />,
              },
              {
                id: "quiz",
                label: "آزمون خودسنجی",
                icon: <Award className="w-4 h-4" />,
              },
            ]}
            activeTabId={activeTab}
            onChange={(id) => setActiveTab(id as ExperienceTab)}
            variant="pill"
            className="gap-0"
          />
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
              <div className="w-full flex items-center justify-between flex-wrap gap-2 mb-6 pb-3 border-b border-[var(--avana-border-default)] text-xs">
                <span className="text-[#008080] font-bold flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5" />
                  روی کارت کلیک کنید تا پاسخ ظاهر شود؛ سپس میزان تسلط را انتخاب نمایید:
                </span>
                <Badge variant="neutral" size="sm">
                  پیش‌نمایش تعاملی (Demo)
                </Badge>
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
                  className={`relative w-full h-full rounded-[16px] transition-transform duration-500 transform-style-3d border ${
                    isFlipped
                      ? "rotate-y-180 bg-white border-[#008080]/50 shadow-elevated"
                      : "bg-white border-[var(--avana-border-default)] group-hover:border-[#008080]/40 shadow-card"
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
                    <div className="w-full flex justify-between items-center text-xs text-[var(--avana-text-muted)]">
                      <span className="text-[#008080] font-bold bg-[#008080]/10 px-2 py-0.5 rounded-[6px] border border-[#008080]/20">
                        فارماکولوژی سیستم عصبی
                      </span>
                      <span>روی کارت کلیک کنید 👆</span>
                    </div>

                    <p className="text-sm sm:text-base font-bold text-[var(--avana-text-primary)] leading-relaxed my-auto">
                      گیرنده اصلی استیل‌کولین در صفحه محرکه عضلانی چیست و توسط چه کلاسی از داروها مهار می‌شود؟
                    </p>

                    <div className="text-[11px] text-[#008080] font-semibold flex items-center gap-1">
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
                    <div className="w-full flex justify-between items-center text-xs text-[#008080]">
                      <span className="font-bold bg-[#008080]/10 px-2 py-0.5 rounded-[6px] border border-[#008080]/20">
                        پاسخ علمی و بالینی
                      </span>
                      <span>بازگشت به سوال ↩</span>
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-[var(--avana-text-primary)] leading-relaxed my-auto">
                      گیرنده نیکوتینی نوع عضلانی (Nm). توسط داروهای بلاک‌کننده عصبی-عضلانی (مانند آتراکوریوم و سوکسینیل‌کولین) مهار یا فلج می‌شود.
                    </p>

                    <div className="text-[11px] text-[#008080] font-mono">
                      [مبحث: اتصالات نوروماسکولار]
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 SRS Action Buttons */}
              <div className="w-full max-w-md mt-6">
                <p className="text-xs text-[var(--avana-text-muted)] text-center mb-3">
                  درجه سختی این کارت را مشخص کنید تا هوش مصنوعی زمان مرور بعدی را تنظیم نماید:
                </p>
                <div className="grid grid-cols-4 gap-2 text-xs font-bold text-center">
                  <button
                    onClick={() => setSrsScheduledDays(1)}
                    className="p-2.5 rounded-[10px] bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors active:scale-[0.98] shadow-xs"
                  >
                    <span>مجدداً</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۱ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(3)}
                    className="p-2.5 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors active:scale-[0.98] shadow-xs"
                  >
                    <span>سخت</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۳ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(7)}
                    className="p-2.5 rounded-[10px] bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors active:scale-[0.98] shadow-xs"
                  >
                    <span>خوب</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">۷ روز بعد</span>
                  </button>
                  <button
                    onClick={() => setSrsScheduledDays(14)}
                    className="p-2.5 rounded-[10px] bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 transition-colors active:scale-[0.98] shadow-xs"
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
                  className="mt-5 p-3 rounded-[10px] bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center gap-2 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#008080] shrink-0" />
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
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[var(--avana-border-default)] text-xs">
                <span className="text-[#008080] font-bold flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-[#008080]" />
                  یک سوال نمونه انتخاب کنید تا فرآیند استدلال هوش مصنوعی آوانا را مشاهده نمایید:
                </span>
                <Badge variant="neutral" size="sm">
                  شبیه‌ساز هوش مصنوعی (Demo)
                </Badge>
              </div>

              {/* Sample Question Chips */}
              <div className="flex flex-wrap gap-2.5">
                {aiQuestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedAiQuestion(idx);
                    }}
                    className={`px-3.5 py-2 rounded-[10px] text-xs font-bold transition-all text-right border ${
                      selectedAiQuestion === idx
                        ? "bg-[#008080]/10 text-[#008080] border-[#008080]/40 shadow-xs"
                        : "bg-white text-[var(--avana-text-secondary)] border-[var(--avana-border-default)] hover:border-[#008080]/30 shadow-xs"
                    }`}
                  >
                    <span>💬 {item.q}</span>
                  </button>
                ))}
              </div>

              {/* AI Reasoning Pipeline Box */}
              <div className="p-5 sm:p-6 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#008080]">
                  <Brain className="w-4 h-4 text-[#008080]" />
                  <span>مراحل استدلال شناختی دستیار هوشمند:</span>
                </div>

                <div className="space-y-2">
                  {aiQuestions[selectedAiQuestion].steps.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-2.5 rounded-[10px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] text-xs text-[var(--avana-text-secondary)] flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#008080]/10 text-[#008080] border border-[#008080]/20 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {sIdx + 1}
                      </span>
                      <p className="leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>

                {/* Final Structured Answer */}
                <div className="p-4 rounded-[10px] bg-[var(--avana-bg-default)] border border-[var(--avana-border-default)] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#008080]">
                    <Sparkles className="w-4 h-4 text-[#008080]" />
                    <span>پاسخ تشریحی دستیار آوانا:</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--avana-text-primary)] leading-relaxed font-body">
                    {aiQuestions[selectedAiQuestion].answer}
                  </p>
                  <div className="p-2 rounded-[8px] bg-white border border-[var(--avana-border-default)] text-[11px] text-[#006060] mt-2 font-medium">
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
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[var(--avana-border-default)] text-xs">
                <span className="text-[#008080] font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#008080]" />
                  معماری ساختاریافته یادگیری: تبدیل جزوات سنگین به قطعات شناختی قابل هضم
                </span>
                <Badge variant="neutral" size="sm">
                  سلسله‌مراتب دروس
                </Badge>
              </div>

              {/* 4-Level Interactive Flow Tree */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs flex flex-col justify-between hover:bg-[var(--avana-surface-2)] transition-colors">
                  <span className="text-[10px] text-[#008080] font-bold mb-1">سطح ۱: دوره آموزشی</span>
                  <h4 className="font-bold text-sm text-[var(--avana-text-primary)]">فارماکولوژی پزشکی</h4>
                  <p className="text-[11px] text-[var(--avana-text-secondary)] mt-2">دسته‌بندی جامع مباحث علوم پایه و بالینی</p>
                </div>

                <div className="p-4 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs flex flex-col justify-between hover:bg-[var(--avana-surface-2)] transition-colors">
                  <span className="text-[10px] text-[#006666] font-bold mb-1">سطح ۲: سرفصل / فصل</span>
                  <h4 className="font-bold text-sm text-[var(--avana-text-primary)]">فصل ۴: سیستم خودمختار</h4>
                  <p className="text-[11px] text-[var(--avana-text-secondary)] mt-2">تفکیک مباحث آناتومی و فیزیولوژی مرتبط</p>
                </div>

                <div className="p-4 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs flex flex-col justify-between hover:bg-[var(--avana-surface-2)] transition-colors">
                  <span className="text-[10px] text-[#008080] font-bold mb-1">سطح ۳: درسنامه عمیق</span>
                  <h4 className="font-bold text-sm text-[var(--avana-text-primary)]">درس ۴.۲: مهارکننده‌های بتا</h4>
                  <p className="text-[11px] text-[var(--avana-text-secondary)] mt-2">خلاصه‌های کاربردی و محیط مطالعه ساختاریافته</p>
                </div>

                <div className="p-4 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs flex flex-col justify-between hover:bg-[var(--avana-surface-2)] transition-colors">
                  <span className="text-[10px] text-[#007952] font-bold mb-1">سطح ۴: تثبیت و سنجش</span>
                  <h4 className="font-bold text-sm text-[var(--avana-text-primary)]">فلش‌کارت و آزمون آزمایشی</h4>
                  <p className="text-[11px] text-[var(--avana-text-secondary)] mt-2">انتقال مفاهیم به حافظه دائم با تحلیل کارنامه</p>
                </div>
              </div>

              {/* Mock Lesson Viewer Box */}
              <div className="p-5 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs space-y-3">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--avana-border-default)]">
                  <div className="flex items-center gap-2 font-bold text-[var(--avana-text-primary)]">
                    <BookOpen className="w-4 h-4 text-[#008080]" />
                    <span>محیط مطالعه ساختاریافته آوانا (نمونه زنده درسنامه)</span>
                  </div>
                  <span className="text-[#008080] text-[11px] bg-[#008080]/10 px-2 py-0.5 rounded-[6px] border border-[#008080]/20 font-bold">
                    پیشرفت: ۱۰۰٪ ✓
                  </span>
                </div>
                <p className="text-xs text-[var(--avana-text-secondary)] leading-relaxed">
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
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[var(--avana-border-default)] text-xs">
                <span className="text-[#008080] font-bold flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#008080]" />
                  یک گزینه را انتخاب کنید تا نحوه سنجش و کارنامه تحلیلی آوانا را بررسی نمایید:
                </span>
                <Badge variant="neutral" size="sm">
                  شبیه‌ساز سوال استاندارد
                </Badge>
              </div>

              {/* Question Text */}
              <div className="p-4 sm:p-5 rounded-[16px] bg-white border border-[var(--avana-border-default)] shadow-xs">
                <span className="text-[11px] text-amber-700 font-bold block mb-1.5">سوال ۱ از ۱ — فارماکولوژی</span>
                <p className="text-xs sm:text-sm font-bold text-[var(--avana-text-primary)] leading-relaxed">
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
                      className={`p-3.5 rounded-[10px] text-xs font-bold text-right transition-all border cursor-pointer ${
                        isSelected
                          ? option.correct
                            ? "bg-teal-50 text-teal-900 border-teal-500 ring-1 ring-teal-500 shadow-xs"
                            : "bg-rose-50 text-rose-900 border-rose-500 ring-1 ring-rose-500 shadow-xs"
                          : "bg-white text-[var(--avana-text-secondary)] border border-[var(--avana-border-default)] hover:border-[#008080]/40 shadow-xs"
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
                  className="p-4 rounded-[10px] bg-teal-50 border border-teal-200 space-y-1.5 shadow-xs"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#008080]">
                    <CheckCircle2 className="w-4 h-4 text-[#008080]" />
                    <span>تحلیل و پاسخ تشریحی طراح سوال:</span>
                  </div>
                  <p className="text-xs text-[var(--avana-text-secondary)] leading-relaxed">
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
