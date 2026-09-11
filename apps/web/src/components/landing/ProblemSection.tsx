/**
 * Problem Section — "منابع زیادند. وقت کم است."
 *
 * Captures the student's authentic dilemma:
 * Study materials are scattered across Telegram, PDFs, camera photos, Word files,
 * handwritten notes, and Google Drive.
 *
 * Visual:
 * An editorial, beautifully organized "scattered desk" composition of study sources
 * using clean light-first cards, warm ivory accents, and subtle micro-rotations.
 */

import { motion } from "framer-motion";
import {
  FileText,
  Send,
  Image as ImageIcon,
  FolderKanban,
  FileCode2,
  HelpCircle,
  BookMarked,
  Layers,
} from "lucide-react";

export function ProblemSection() {
  return (
    <section
      id="problem"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right border-t border-[#E2E7EA]/60"
      aria-label="بخش چالش‌ها: پراکندگی منابع درسی"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* RIGHT COLUMN (RTL): Copy / Messaging */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-5 flex flex-col gap-5 z-10"
        >
          {/* Tag */}
          <div className="w-max">
            <span className="px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200/80 text-rose-600 text-xs font-bold shadow-xs">
              چالش اصلی دانشجو
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-headline text-3xl sm:text-4xl lg:text-[42px] leading-[1.25] font-black text-[#1a2226] tracking-tight">
            منابع زیادند.
            <br />
            <span className="text-[#008080]">وقت کم است.</span>
          </h2>

          {/* Paragraph */}
          <p className="text-base sm:text-lg leading-relaxed text-[#3d4f55]">
            جزوه، PDF، عکس‌ها، فایل‌ها و منابع مختلف در جاهای مختلف پراکنده‌اند و پیدا کردن، دسته‌بندی و مرور منظم آن‌ها وقت و انرژی زیادی از شما می‌گیرد.
          </p>

          <div className="p-4 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <BookMarked className="w-5 h-5" />
            </div>
            <p className="text-xs sm:text-sm text-[#5B6268] leading-relaxed">
              «همه چیز دارم، ولی نمی‌دونم دقیقاً از کجا شروع کنم و چی رو کی مرور کنم...»
            </p>
          </div>
        </motion.div>

        {/* LEFT COLUMN (RTL): Scattered Study Desk Composition */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="lg:col-span-7 relative flex items-center justify-center"
        >
          {/* Subtle desk area background */}
          <div className="w-full max-w-[620px] rounded-3xl bg-[#F7F9FA] p-6 sm:p-8 border border-[#E2E7EA] relative overflow-hidden">
            {/* Ambient desk accents */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#F0E6D2]/50 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#A7D0E6]/30 rounded-full blur-2xl pointer-events-none" />

            {/* Scattered Cards Grid / Layout */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 relative z-10">
              {/* 1. PDF Card */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[-2deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">PDF رفرنس</span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 bg-[#EEF1F3] rounded-full w-full" />
                  <div className="h-1.5 bg-[#EEF1F3] rounded-full w-4/5" />
                  <div className="h-1.5 bg-rose-100 rounded-full w-2/3" />
                </div>
                <p className="text-[10px] text-[#5B6268] mt-2">۳۲۰ صفحه سنگین</p>
              </motion.div>

              {/* 2. Telegram Card */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[2deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-500">
                    <Send className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">کانال تلگرام</span>
                </div>
                <p className="text-[11px] text-[#3d4f55] line-clamp-2 bg-[#F7F9FA] p-1.5 rounded-lg border border-[#E2E7EA]">
                  بچه‌ها ویس جلسه ۴ استاد آپلود شد...
                </p>
                <p className="text-[10px] text-[#5B6268] mt-1.5">گم‌شده بین پیام‌ها</p>
              </motion.div>

              {/* 3. Photo / Whiteboard Snapshot */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[-1deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">عکس تخته</span>
                </div>
                <div className="h-12 rounded-lg bg-emerald-50/50 border border-dashed border-emerald-200 flex items-center justify-center text-[10px] text-emerald-700">
                  اسلاید نمودار فارماکوکینتیک
                </div>
                <p className="text-[10px] text-[#5B6268] mt-2">کیفیت کم، ناخوانا</p>
              </motion.div>

              {/* 4. Word / Summary File */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[3deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                    <FileCode2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">فایل ورد</span>
                </div>
                <p className="text-[11px] text-[#3d4f55]">خلاصه تایپی ورودی ۹۹</p>
                <p className="text-[10px] text-[#5B6268] mt-2">بدون فرمت‌بندی استاندارد</p>
              </motion.div>

              {/* 5. Google Drive Folder */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[-2deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                    <FolderKanban className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">گوگل درایو</span>
                </div>
                <p className="text-[11px] text-[#3d4f55]">پوشه رفرانس ترم ۴</p>
                <p className="text-[10px] text-[#5B6268] mt-2">ده‌ها فولدر تودرتو</p>
              </motion.div>

              {/* 6. Exam Sample Questions */}
              <motion.div
                whileHover={{ y: -3, rotate: 0 }}
                className="p-3.5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card rotate-[1deg] transition-transform duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#1a2226]">نمونه سؤال</span>
                </div>
                <p className="text-[11px] text-[#3d4f55]">سؤالات قطبی و ترم‌های قبل</p>
                <p className="text-[10px] text-[#5B6268] mt-2">پاسخ‌های نامشخص</p>
              </motion.div>
            </div>

            {/* Bottom Caption Banner */}
            <div className="mt-5 p-2.5 rounded-xl bg-white border border-[#E2E7EA] flex items-center justify-center gap-2 text-xs font-bold text-[#5B6268] shadow-xs">
              <Layers className="w-4 h-4 text-[#008080]" />
              <span>همه این منابع باید خونده بشن، اما فرصت کمه و پراکندگی زیاده.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
