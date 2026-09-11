/**
 * Review Summary Section — "وقتی وقت کم است، دقیق مرور کن"
 *
 * Believable, high-yield summary card representing AVANA's Review Engine:
 * - Key high-yield concepts
 * - Critical exam pearls & traps (موارد پرتکرار و کنکوری)
 * - Rapid revision playlist trigger
 */

import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowLeft,
  Sparkles,
  BookMarked,
} from "lucide-react";

export function ReviewSummarySection() {
  return (
    <section
      id="review-summary"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش مرور سریع و جمع‌بندی نکات کلیدی"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Copy & Value Prop */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-5 flex flex-col gap-6 z-10"
        >
          {/* Badge */}
          <div className="w-max">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold shadow-xs">
              <Clock className="w-3.5 h-3.5" />
              <span>مرور پربازده (High-Yield)</span>
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-headline text-3xl sm:text-4xl lg:text-[42px] leading-[1.25] font-black text-[#1a2226] tracking-tight">
            وقتی وقت کم است،
            <br />
            <span className="text-[#008080]">دقیق مرور کن.</span>
          </h2>

          {/* Subtitle */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55]">
            در شب‌های امتحان و فرصت‌های محدود جمع‌بندی، آوانا تمام حواشی را کنار می‌زند و چکیده طلایی، مفاهیم آزمونی و دام‌های تستی پرتکرار را در اختیارتان می‌گذارد.
          </p>

          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-[#E2E7EA] shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080] shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a2226]">عصاره‌گیری از صدها صفحه رفرنس</p>
                <p className="text-[11px] text-[#5B6268]">تمرکز کامل روی مباحثی که بیشترین بارم نمره را در آزمون‌ها دارند</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-[#E2E7EA] shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a2226]">شناسایی تله‌ها و نکات انحرافی</p>
                <p className="text-[11px] text-[#5B6268]">پیش‌بینی اشتباهات رایج دانشجویان در گزینه‌های گمراه‌کننده کنکور</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): High-Yield Review Summary Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="lg:col-span-7 relative"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E7EA] shadow-xl space-y-5">
            {/* Card Header */}
            <div className="flex justify-between items-center pb-3 border-b border-[#EEF1F3]">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-[#008080]" />
                <h3 className="text-sm sm:text-base font-extrabold text-[#1a2226]">
                  خلاصه مرور • مهارکننده‌های بتا-آدرنرژیک
                </h3>
              </div>
              <span className="text-[11px] font-bold text-[#008080] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                ⏱️ زمان مطالعه: ۴ دقیقه
              </span>
            </div>

            {/* Section 1: Key Concepts */}
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-[#1a2226] flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>مفاهیم کلیدی و اثرات فیزیولوژیک:</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#3d4f55]">
                <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#EEF1F3] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008080] shrink-0" />
                  <span>اثر منفی بر گره SA (کاهش ضربان)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#EEF1F3] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008080] shrink-0" />
                  <span>کاهش ترشح رنین از سلول‌های JG کلیه</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#EEF1F3] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008080] shrink-0" />
                  <span>کاهش تقاضای اکسیژن میوکارد در آنژین</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#EEF1F3] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#008080] shrink-0" />
                  <span>طولانی شدن زمان تحریک‌پذیری گره AV</span>
                </div>
              </div>
            </div>

            {/* Section 2: Exam Traps & Warnings */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
              <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>دام‌های پرتکرار آزمون‌های جامع:</span>
              </p>
              <ul className="text-xs text-amber-950/85 space-y-1 pr-4 list-disc">
                <li>
                  <strong>منع مصرف در آسم:</strong> بتابلاکرهای غیرانتخابی (پروپرانولول) به علت مهار گیرنده $\beta_2$ برونش ممنوع هستند.
                </li>
                <li>
                  <strong>پنهان‌سازی علائم افت قند خون:</strong> تاکی‌کاردیا ناشی از هیپوگلیسمی در بیماران دیابتی را ماسک می‌کنند (به جز تعریق).
                </li>
              </ul>
            </div>

            {/* Section 3: Bottom Action Trigger */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#5B6268]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>پوشش ۱۰۰٪ نکات سوال‌خیز آخرین دوره آزمون دستیاری</span>
              </div>

              <div className="w-full sm:w-auto h-10 px-5 rounded-xl bg-[#008080] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs">
                <span>شروع مرور سریع</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
