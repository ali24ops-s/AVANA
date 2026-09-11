/**
 * Quiz Experience Section — "فقط نخوان؛ خودت را امتحان کن"
 *
 * Real interactive quiz experience:
 * Question -> Option Selection -> Instant Feedback -> Complete Medical Rationale
 *
 * Refactored from existing AVANA quiz engine with Light-First design language.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Sparkles,
  RotateCcw,
  BookOpen,
} from "lucide-react";

export function QuizExperienceSection() {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const quizQuestion = {
    category: "فارماکولوژی قلب و عروق • سؤال استاندارد جامع",
    text: "کدام‌یک از داروهای زیر یک بتابلاکر غیرانتخابی (Non-selective) با ویژگی چربی‌دوست (Lipophilic) بالا است که از سد خونی-مغزی (BBB) عبور می‌کند؟",
    options: [
      { id: 1, label: "الف) آتنولول (Atenolol)", correct: false, note: "هیدروفیل، بدون نفوذ به مغز" },
      { id: 2, label: "ب) پروپرانولول (Propranolol)", correct: true, note: "پاسخ صحیح" },
      { id: 3, label: "ج) اسمولول (Esmolol)", correct: false, note: "بسیار کوتاه‌اثر، متابولیسم اریتروسیتی" },
      { id: 4, label: "د) متوپرولول (Metoprolol)", correct: false, note: "انتخابی بتا-۱ (کاردیوسلکتیو)" },
    ],
    explanation:
      "پاسخ صحیح گزینه (ب) است. پروپرانولول به دلیل انحلال‌پذیری بالا در چربی (Lipophilicity) به راحتی از سد خونی-مغزی عبور می‌کند. به همین دلیل علاوه بر درمان آریتمی و فشار خون، در پیشگیری از حملات میگرن، لرزش اساسی (Essential Tremor) و کنترل اضطراب عملکردی نیز کاربرد گسترده بالینی دارد.",
    examPearl:
      "نکته طلایی امتحانی: به دلیل عبور پروپرانولول از سد مغزی، خواب‌های پریشان و افسردگی از عوارض جانبی گزارش‌شده آن است؛ در صورتی که آتنولول به علت هیدروفیل بودن فاقد این عارضه است.",
  };

  const handleSelect = (id: number) => {
    setSelectedOption(id);
  };

  const handleReset = () => {
    setSelectedOption(null);
  };

  const isAnswered = selectedOption !== null;
  const isCorrect = selectedOption === 2;

  return (
    <section
      id="quiz-experience"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش تجربه آزمون و خودسنجی هوشمند"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Copy / Messaging */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-5 flex flex-col gap-6 z-10"
        >
          {/* Badge */}
          <div className="w-max">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold shadow-xs">
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>خودسنجی تعاملی</span>
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-headline text-3xl sm:text-4xl lg:text-[42px] leading-[1.25] font-black text-[#1a2226] tracking-tight">
            فقط نخوان؛
            <br />
            <span className="text-[#008080]">خودت را امتحان کن.</span>
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55]">
            با آزمون‌های متنوع و شبیه‌سازی‌شده آوانا، بلافاصله میزان تسلطت را بسنج و نقاط ضعفت را با تحلیل خط‌به‌خط پاسخ‌ها به نقاط قوت تبدیل کن.
          </p>

          <div className="space-y-2.5 pt-2">
            <div className="flex items-center gap-2.5 text-xs text-[#3d4f55]">
              <CheckCircle2 className="w-4 h-4 text-[#008080] shrink-0" />
              <span>شبیه‌سازی دقیق سؤالات امتحانات سراسری و قطبی علوم پایه و پره‌انترنی</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[#3d4f55]">
              <CheckCircle2 className="w-4 h-4 text-[#008080] shrink-0" />
              <span>پاسخ‌نامه تشریحی با یادآوری نکات طلایی امتحانی و دام‌های تستی</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-[#3d4f55]">
              <CheckCircle2 className="w-4 h-4 text-[#008080] shrink-0" />
              <span>ارزیابی هوشمند بازدهی یادگیری بلافاصله پس از اتمام مطالعه هر فصل</span>
            </div>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): Live Interactive Quiz Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="lg:col-span-7 relative"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E7EA] shadow-xl">
            {/* Question Header Meta */}
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-[#EEF1F3]">
              <span className="text-xs font-bold text-[#008080] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                {quizQuestion.category}
              </span>

              {isAnswered && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-[#5B6268] hover:text-[#008080] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>تلاش مجدد</span>
                </button>
              )}
            </div>

            {/* Question Prompt */}
            <h3 className="text-sm sm:text-base font-extrabold text-[#1a2226] leading-relaxed mb-5">
              {quizQuestion.text}
            </h3>

            {/* Options List */}
            <div className="space-y-3">
              {quizQuestion.options.map((option) => {
                const isSelected = selectedOption === option.id;
                let optionStyle =
                  "bg-[#F7F9FA] border-[#E2E7EA] text-[#1a2226] hover:bg-white hover:border-[#008080]/50";

                if (isAnswered) {
                  if (option.correct) {
                    optionStyle =
                      "bg-emerald-50 border-emerald-400 text-emerald-900 font-bold shadow-xs";
                  } else if (isSelected && !option.correct) {
                    optionStyle =
                      "bg-rose-50 border-rose-400 text-rose-900 font-bold shadow-xs";
                  } else {
                    optionStyle = "bg-[#F7F9FA] border-[#E2E7EA] opacity-60";
                  }
                }

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => handleSelect(option.id)}
                    className={`w-full text-right p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between cursor-pointer disabled:cursor-default ${optionStyle}`}
                  >
                    <span className="text-xs sm:text-sm">{option.label}</span>

                    {isAnswered && (
                      <span className="shrink-0 mr-2">
                        {option.correct ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : isSelected ? (
                          <XCircle className="w-4 h-4 text-rose-600" />
                        ) : null}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation & Rationale Reveal */}
            <AnimatePresence>
              {isAnswered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 pt-5 border-t border-[#EEF1F3] space-y-3"
                >
                  <div
                    className={`p-3 rounded-xl flex items-center gap-2 text-xs font-bold ${
                      isCorrect
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {isCorrect
                        ? "آفرین! پاسخ کاملاً صحیح است."
                        : "پاسخ نادرست بود؛ تحلیل پاسخ را در ادامه با دقت مرور کنید:"}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#3d4f55] leading-relaxed">
                    {quizQuestion.explanation}
                  </p>

                  <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-900 leading-relaxed flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-[#008080] shrink-0 mt-0.5" />
                    <span>{quizQuestion.examPearl}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
