/**
 * Transformation Section — "آوانا، این پراکندگی را تبدیل به مسیر یادگیری می‌کند."
 *
 * Visual Journey:
 * Scattered Sources -> AVANA Engine (درک • پردازش • ساختار) -> Structured 4-Step Learning Path
 *
 * Supports subtle scroll reveal, editorial lightness, and responsive horizontal/vertical flow.
 */

import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowDown,
  BookOpen,
  Layers,
  FileCheck2,
  Clock,
  Cpu,
  Sparkles,
  FileText,
} from "lucide-react";

export function TransformationSection() {
  return (
    <section
      id="transformation"
      className="relative py-16 lg:py-24 px-4 sm:px-6 max-w-[1280px] mx-auto overflow-hidden text-right bg-[#F7F9FA]/60 border-y border-[#E2E7EA]/60 rounded-3xl my-6"
      aria-label="بخش تبدیل هوشمند: تبدیل پراکندگی به مسیر یادگیری"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#A7D0E6]/25 rounded-full blur-3xl pointer-events-none" />

      {/* Header Title */}
      <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold mb-4 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>فرآیند تبدیل هوشمند</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-headline text-3xl sm:text-4xl lg:text-[40px] leading-[1.25] font-black text-[#1a2226]"
        >
          آوانا، این پراکندگی را تبدیل به{" "}
          <span className="text-[#008080]">مسیر یادگیری</span> می‌کند.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-3 text-base sm:text-lg text-[#3d4f55] leading-relaxed"
        >
          منابع درسی‌ات را یک‌جا جمع می‌کند و آن‌ها را به یک مسیر هوشمند برای یادگیری، تمرین و مرور تبدیل می‌کند.
        </motion.p>
      </div>

      {/* TRANSFORMATION FLOW PIPELINE */}
      <div className="relative max-w-5xl mx-auto">
        {/* DESKTOP PIPELINE: Horizontal 3-Step Flow */}
        <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
          {/* STEP 1: Scattered Sources (3 cols) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="col-span-4 p-5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card flex flex-col items-center text-center relative"
          >
            <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-bold mb-3 border border-amber-200">
              منابع پراکنده
            </span>

            {/* Micro stacked documents */}
            <div className="relative w-32 h-24 mb-3 flex items-center justify-center">
              <div className="absolute w-24 h-16 bg-[#F0E6D2] rounded-lg rotate-[-8deg] border border-[#E2E7EA] shadow-xs" />
              <div className="absolute w-24 h-16 bg-white rounded-lg rotate-[6deg] border border-[#E2E7EA] shadow-xs" />
              <div className="relative w-24 h-16 bg-white rounded-lg p-2 border border-[#E2E7EA] shadow-card flex flex-col justify-between">
                <div className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-rose-500" />
                  <span className="text-[8px] font-bold text-[#1a2226]">جزوه + PDF</span>
                </div>
                <div className="space-y-1">
                  <div className="h-1 bg-[#EEF1F3] rounded w-full" />
                  <div className="h-1 bg-[#EEF1F3] rounded w-2/3" />
                </div>
              </div>
            </div>

            <p className="text-xs font-bold text-[#1a2226]">ورودی نامنظم فایل‌ها</p>
            <p className="text-[11px] text-[#5B6268] mt-1">
              پی‌دی‌اف، جزوه دست‌نویس، اسلایدها و عکس‌ها
            </p>
          </motion.div>

          {/* CONNECTOR 1 -> 2 (1 col) */}
          <div className="col-span-1 flex flex-col items-center justify-center relative">
            <div className="w-full h-0.5 border-t-2 border-dashed border-[#008080]/30 absolute top-1/2 -translate-y-1/2 left-0 right-0 z-0" />
            <div className="w-8 h-8 rounded-full bg-white border border-teal-200 shadow-xs flex items-center justify-center text-[#008080] relative z-10">
              <ArrowLeft className="w-4 h-4 animate-pulse" />
            </div>
          </div>

          {/* STEP 2: AVANA Intelligent Engine (2 cols) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="col-span-2 p-4 rounded-2xl bg-gradient-to-b from-teal-500 to-[#006060] text-white shadow-lg shadow-[#008080]/20 flex flex-col items-center text-center relative border-2 border-white"
          >
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center mb-2">
              <Cpu className="w-6 h-6 text-white" />
            </div>

            <span className="text-base font-black tracking-wider">AVANA</span>
            <div className="mt-2 text-[10px] font-bold text-teal-100 flex flex-col gap-0.5">
              <span>درک عمیق</span>
              <span>•</span>
              <span>پردازش پزشکی</span>
              <span>•</span>
              <span>ساختاردهی</span>
            </div>
          </motion.div>

          {/* CONNECTOR 2 -> 3 (1 col) */}
          <div className="col-span-1 flex flex-col items-center justify-center relative">
            <div className="w-full h-0.5 border-t-2 border-dashed border-[#008080]/30 absolute top-1/2 -translate-y-1/2 left-0 right-0 z-0" />
            <div className="w-8 h-8 rounded-full bg-white border border-teal-200 shadow-xs flex items-center justify-center text-[#008080] relative z-10">
              <ArrowLeft className="w-4 h-4 animate-pulse" />
            </div>
          </div>

          {/* STEP 3: Unified Learning Pathway (4 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="col-span-4 p-5 rounded-2xl bg-white border border-[#E2E7EA] shadow-card flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-[#008080] text-[11px] font-bold border border-teal-200">
                یک مسیر منظم یادگیری
              </span>
              <span className="text-[10px] text-[#5B6268]">خروجی استاندارد</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-[#F7F9FA] border border-[#EEF1F3]">
                <div className="w-6 h-6 rounded-md bg-teal-100/70 flex items-center justify-center text-[#008080]">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-[#1a2226]">۱. درسنامه تحلیلی و خلاصه‌شده</span>
              </div>

              <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-[#F7F9FA] border border-[#EEF1F3]">
                <div className="w-6 h-6 rounded-md bg-sky-100/70 flex items-center justify-center text-sky-600">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-[#1a2226]">۲. فلش‌کارت‌های فاصله‌دار (SRS)</span>
              </div>

              <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-[#F7F9FA] border border-[#EEF1F3]">
                <div className="w-6 h-6 rounded-md bg-emerald-100/70 flex items-center justify-center text-emerald-600">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-[#1a2226]">۳. آزمون شبیه‌سازی و خودسنجی</span>
              </div>

              <div className="flex items-center gap-2.5 p-1.5 rounded-lg bg-[#F7F9FA] border border-[#EEF1F3]">
                <div className="w-6 h-6 rounded-md bg-amber-100/70 flex items-center justify-center text-amber-600">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-[#1a2226]">۴. مرور سریع شب امتحانی</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* MOBILE PIPELINE: Sleek Vertical Flow */}
        <div className="md:hidden flex flex-col items-center gap-4">
          {/* Mobile Step 1 */}
          <div className="w-full p-4 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs text-center">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold mb-2 inline-block">
              منابع پراکنده
            </span>
            <p className="text-xs font-bold text-[#1a2226]">ورودی نامنظم فایل‌ها</p>
            <p className="text-[11px] text-[#5B6268] mt-0.5">
              جزوات PDF، عکس‌ها، فایل‌های درسی تلگرام
            </p>
          </div>

          <ArrowDown className="w-5 h-5 text-[#008080]" />

          {/* Mobile Step 2 */}
          <div className="w-full p-4 rounded-2xl bg-gradient-to-r from-teal-600 to-[#006060] text-white shadow-md text-center">
            <p className="text-sm font-black">هسته هوشمند آوانا</p>
            <p className="text-[11px] text-teal-100 mt-0.5">درک مفاهیم • استخراج ساختار • پالایش علمی</p>
          </div>

          <ArrowDown className="w-5 h-5 text-[#008080]" />

          {/* Mobile Step 3 */}
          <div className="w-full p-4 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs space-y-2">
            <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-[#008080] text-[10px] font-bold inline-block">
              یک مسیر منظم یادگیری
            </span>
            <div className="grid grid-cols-2 gap-2 text-right">
              <div className="p-2 rounded-lg bg-[#F7F9FA] text-[11px] font-bold text-[#1a2226]">
                📖 درسنامه تحلیلی
              </div>
              <div className="p-2 rounded-lg bg-[#F7F9FA] text-[11px] font-bold text-[#1a2226]">
                🃏 فلش‌کارت SRS
              </div>
              <div className="p-2 rounded-lg bg-[#F7F9FA] text-[11px] font-bold text-[#1a2226]">
                📝 آزمون و تست
              </div>
              <div className="p-2 rounded-lg bg-[#F7F9FA] text-[11px] font-bold text-[#1a2226]">
                ⏱️ مرور سریع
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
