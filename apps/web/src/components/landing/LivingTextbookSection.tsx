/**
 * Living Textbook Section — "جزوه فقط برای خواندن نیست. با آوانا، تبدیل به یادگیری می‌شود."
 *
 * Signature Editorial Visual:
 * Renders a genuine, believable Persian scientific textbook page with:
 * - Chapter header and scientific typography
 * - Anatomical/pathway cardiovascular diagram
 * - Active text highlight with interactive contextual floating actions:
 *   [توضیح ساده‌تر | ساخت فلش‌کارت | سؤال امتحانی]
 * - Live interactive state switching when clicking any action!
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Layers,
  HelpCircle,
  Heart,
  BookOpen,
} from "lucide-react";

type ContextAction = "explain" | "flashcard" | "quiz";

export function LivingTextbookSection() {
  const [activeAction, setActiveAction] = useState<ContextAction>("quiz");
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);

  const quizOptions = [
    {
      id: 1,
      text: "مهار گیرنده‌های آلفا-۱ در عضلات صاف عروق محیطی",
      isCorrect: false,
    },
    {
      id: 2,
      text: "مهار رقابتی گیرنده‌های بتا-۱ و کاهش ضربان و برون‌ده قلبی",
      isCorrect: true,
    },
    {
      id: 3,
      text: "تحریک مستقیم گیرنده‌های دوپامین در عروق کلیوی",
      isCorrect: false,
    },
  ];

  return (
    <section
      id="living-textbook"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right"
      aria-label="بخش کتاب درسی زنده و تعاملی آوانا"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Headline & Storytelling */}
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
              <Sparkles className="w-3.5 h-3.5" />
              <span>محتوای درسی زنده و تعاملی</span>
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-headline text-3xl sm:text-4xl lg:text-[42px] leading-[1.25] font-black text-[#1a2226] tracking-tight">
            جزوه فقط برای خواندن نیست.
            <br />
            <span className="text-[#008080]">با آوانا، تبدیل به یادگیری می‌شود.</span>
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55]">
            محتوای درسی‌ات را بخوان، خطوط مهم را انتخاب کن، و ببین چطور آوانا در همان لحظه آن را به توضیح روان، فلش‌کارت حافظه و سؤال امتحانی تبدیل می‌کند.
          </p>

          {/* Key capability highlights */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#E2E7EA] shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080] shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a2226]">توضیح ساده‌تر بر پایه درک مفهومی</p>
                <p className="text-[11px] text-[#5B6268]">تبدیل متون سنگین پزشکی به زبان بالینی و شهودی</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#E2E7EA] shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a2226]">تولید آنی فلش‌کارت SRS</p>
                <p className="text-[11px] text-[#5B6268]">انتقال سریع نکات به چرخه مرور فاصله‌دار بدون فوت وقت</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#E2E7EA] shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a2226]">شبیه‌سازی سؤالات امتحانی قطبی</p>
                <p className="text-[11px] text-[#5B6268]">سنجش میزان تسلط بلافاصله پس از خواندن هر پاراگراف</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): Living Textbook Visual Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="lg:col-span-7 relative"
        >
          {/* Textbook Binding / Open Book Envelope */}
          <div className="relative bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E7EA] shadow-xl overflow-hidden">
            {/* Book Header Margin */}
            <div className="flex justify-between items-center pb-4 mb-5 border-b border-[#EEF1F3] text-xs text-[#5B6268]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#008080]" />
                <span className="font-bold text-[#1a2226]">فصل ۴ • فارماکولوژی قلب و عروق</span>
              </div>
              <span className="bg-[#F7F9FA] px-2.5 py-1 rounded-full border border-[#E2E7EA] text-[10px]">
                صفحه ۱۴۲ از رفرنس کاتزونگ
              </span>
            </div>

            {/* Chapter Headline inside book */}
            <h3 className="font-headline text-xl sm:text-2xl font-black text-[#1a2226] mb-3">
              مکانیسم اثر داروهای بتا بلاکر
            </h3>

            {/* Normal paragraph 1 */}
            <p className="text-xs sm:text-sm text-[#3d4f55] leading-relaxed mb-4">
              داروهای آنتاگونیست گیرنده‌های بتا-آدرنرژیک با مسدود کردن رقابتی اثر کاتکول‌آمین‌ها (نوراپی‌نفرین و اپی‌نفرین) در بافت‌های هدف اثر می‌کنند. عمده‌ترین اثر درمانی این داروها در بیماری‌های قلبی از طریق مهار گیرنده‌های بتا-۱ میانجی‌گری می‌شود.
            </p>

            {/* Active Highlighted Passage with Floating Actions Toolbar */}
            <div className="relative my-6 p-4 sm:p-5 rounded-2xl bg-teal-50/60 border border-[#008080]/30 shadow-xs">
              {/* Contextual Action Floating Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setActiveAction("explain")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeAction === "explain"
                      ? "bg-[#008080] text-white shadow-xs"
                      : "bg-white text-[#3d4f55] border border-[#E2E7EA] hover:border-[#008080]/40"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>توضیح ساده‌تر</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAction("flashcard")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeAction === "flashcard"
                      ? "bg-[#008080] text-white shadow-xs"
                      : "bg-white text-[#3d4f55] border border-[#E2E7EA] hover:border-[#008080]/40"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>ساخت فلش‌کارت</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAction("quiz")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeAction === "quiz"
                      ? "bg-[#008080] text-white shadow-xs"
                      : "bg-white text-[#3d4f55] border border-[#E2E7EA] hover:border-[#008080]/40"
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>سؤال امتحانی</span>
                </button>
              </div>

              {/* Highlighted text sentence */}
              <p className="text-xs sm:text-sm font-semibold text-[#1a2226] leading-relaxed">
                مهار گیرنده‌های $\beta_1$ در گره سینوسی-دهلیزی (SA Node) منجر به کاهش سرعت دپولاریزاسیون خودبه‌خودی در فاز ۴ شده و ضربان قلب (Chronotropy) و انقباض‌پذیری میوکارد (Inotropy) را به صورت وابسته به دوز کاهش می‌دهد.
              </p>

              {/* DYNAMIC CONTEXTUAL RESPONSE PANEL */}
              <div className="mt-4 pt-3 border-t border-[#008080]/20">
                <AnimatePresence>
                  {/* 1. EXPLAIN PANEL */}
                  {activeAction === "explain" && (
                    <motion.div
                      key="explain"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3.5 rounded-xl bg-white border border-[#008080]/20 shadow-xs"
                    >
                      <div className="flex items-center gap-2 mb-1.5 text-[#008080] text-xs font-bold">
                        <Sparkles className="w-4 h-4" />
                        <span>توضیح ساده و کاربردی آوانا:</span>
                      </div>
                      <p className="text-xs text-[#3d4f55] leading-relaxed">
                        مثل ترمز گرفتن روی دور موتور: وقتی آدرنالین می‌خواد به قلب فرمان شتاب بده، بتا بلاکر روی گیرنده‌های بتا-۱ می‌شینه و مانع پیام هیجان میشه؛ در نتیجه ضربان قلب آروم‌تر و مصرف اکسیژن عضله قلب کم میشه.
                      </p>
                    </motion.div>
                  )}

                  {/* 2. FLASHCARD PANEL */}
                  {activeAction === "flashcard" && (
                    <motion.div
                      key="flashcard"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3.5 rounded-xl bg-white border border-sky-200 shadow-xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                          فلش‌کارت آماده مطالعه (SRS)
                        </span>
                        <span className="text-[10px] text-[#5B6268]">روی کارت ضربه بزنید</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#F7F9FA] border border-[#EEF1F3]">
                        <p className="text-[11px] text-[#5B6268] mb-1">❓ روی کارت:</p>
                        <p className="text-xs font-bold text-[#1a2226]">
                          اثر مهار گیرنده‌های $\beta_1$ بر فاز ۴ پتانسیل عمل گره SA چیست؟
                        </p>
                        <p className="text-[11px] text-teal-700 font-semibold mt-2 pt-1 border-t border-[#EEF1F3]">
                          ✓ پشت کارت: کاهش شیب دپولاریزاسیون $\rightarrow$ کاهش ضربان قلب (Chronotropic منفی)
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* 3. QUIZ PANEL */}
                  {activeAction === "quiz" && (
                    <motion.div
                      key="quiz"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3.5 rounded-xl bg-white border border-teal-200 shadow-xs"
                    >
                      <p className="text-xs font-bold text-[#1a2226] mb-2.5">
                        کدام گزینه بهترین توضیح برای مکانیسم اولیه بتابلاکرها در گره SA قلب است؟
                      </p>
                      <div className="space-y-1.5">
                        {quizOptions.map((opt) => {
                          const isSelected = selectedQuizOption === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setSelectedQuizOption(opt.id)}
                              className={`w-full text-right p-2 rounded-lg text-xs transition-all border flex items-center justify-between ${
                                isSelected
                                  ? opt.isCorrect
                                    ? "bg-emerald-50 border-emerald-400 text-emerald-900 font-bold"
                                    : "bg-rose-50 border-rose-300 text-rose-800"
                                  : "bg-[#F7F9FA] border-[#E2E7EA] text-[#3d4f55] hover:bg-white"
                              }`}
                            >
                              <span>{opt.text}</span>
                              {isSelected && (
                                <span className="text-[11px] font-bold">
                                  {opt.isCorrect ? "✓ صحیح" : "✕ نادرست"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Scientific Diagram / Cardiovascular heart preview inside book */}
            <div className="p-4 rounded-2xl bg-[#F7F9FA] border border-[#E2E7EA] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#E2E7EA] flex items-center justify-center text-rose-500 shadow-xs">
                  <Heart className="w-6 h-6 fill-rose-50" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1a2226]">نمودار فیزیولوژیک گره سینوسی</p>
                  <p className="text-[11px] text-[#5B6268]">مهار ورود یون کلسیم و کاهش پیام سمپاتیک</p>
                </div>
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold text-[#008080] bg-white px-2.5 py-1 rounded-full border border-[#E2E7EA]">
                  پایش پیوسته آوانا
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
