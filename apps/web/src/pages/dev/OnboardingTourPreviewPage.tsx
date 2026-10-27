import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Compass,
  Sun,
  Moon,
  Smartphone,
  Monitor,
  RotateCcw,
  Play,
  ArrowRight,
  Info,
  CheckCircle2,
} from "lucide-react";
import { DashboardOnboardingModal } from "../../components/onboarding/DashboardOnboardingModal.js";
import { Button } from "@avana/ui";

export const OnboardingTourPreviewPage: React.FC = () => {
  // Modal state - starts open by default for immediate preview
  const [isOpen, setIsOpen] = useState(true);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  // Viewport & theme simulation state
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewportMode, setViewportMode] = useState<"standard" | "mobile-frame">("standard");

  // Keep dark class synced with state
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [isDarkMode]);

  const handleModalClose = (action: "skip" | "complete", step: number) => {
    setIsOpen(false);
    if (action === "complete") {
      setLastActionMessage(
        `آموزش با موفقیت تکمیل شد (اکشن: complete، مرحله: ${step}). هیچ تغییری در دیتابیس ثبت نشد.`
      );
    } else {
      setLastActionMessage(
        `آموزش رد شد (اکشن: skip، مرحله: ${step}). هیچ تغییری در دیتابیس ثبت نشد.`
      );
    }
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    setLastActionMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 p-4 sm:p-8" dir="rtl">
      {/* Top Navigation & Info Header */}
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#008080] text-white flex items-center justify-center shadow-sm">
                <Compass className="w-4 h-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                پیش‌نمایش Onboarding Tour داشبورد آوانا
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-[#008080] dark:bg-teal-950 dark:text-teal-300">
                محیط توسعه (Dev Only)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              محیط ایزوله و امن جهت تست بصری و عملکردی مراحل ۳ گانه آموزش شروع کار، بدون اثر بر دیتابیس
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/home"
              className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-[#008080] dark:hover:text-teal-400 transition-colors flex items-center gap-1.5"
            >
              <span>بازگشت به داشبورد</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Control Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Modal State Trigger */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-[#008080]" />
              <span>کنترل باز کردن مودال</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              وضعیت فعلی مودال:{" "}
              <span className={`font-bold ${isOpen ? "text-[#008080]" : "text-slate-400"}`}>
                {isOpen ? "باز است" : "بسته است"}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleOpenModal}
                disabled={isOpen}
                className="w-full bg-[#008080] hover:bg-[#006666] text-white"
              >
                نمایش مجدد تور
              </Button>
            </div>
          </div>

          {/* Card 2: Environment Simulation */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#008080]" />
              <span>شبیه‌سازی تم و نمایشگر</span>
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isDarkMode ? "primary" : "outline"}
                size="sm"
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="flex-1 gap-1.5"
              >
                {isDarkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                <span>{isDarkMode ? "تم تاریک" : "تم روشن"}</span>
              </Button>
              <Button
                type="button"
                variant={viewportMode === "mobile-frame" ? "primary" : "outline"}
                size="sm"
                onClick={() =>
                  setViewportMode(viewportMode === "mobile-frame" ? "standard" : "mobile-frame")
                }
                className="flex-1 gap-1.5"
              >
                {viewportMode === "mobile-frame" ? (
                  <Smartphone className="w-3.5 h-3.5" />
                ) : (
                  <Monitor className="w-3.5 h-3.5" />
                )}
                <span>{viewportMode === "mobile-frame" ? "موبایل" : "دسکتاپ"}</span>
              </Button>
            </div>
          </div>

          {/* Card 3: Safety Guard Notice */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>حفاظت از داده‌های حساب</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              این پیش‌نمایش کاملاً مستقل اجرا می‌شود. هیچ تغییری در دیتابیس یا وضعیت واقعی حساب شما رخ نمی‌دهد.
            </p>
          </div>
        </div>

        {/* Feedback / Event log banner */}
        {lastActionMessage && (
          <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 flex items-start gap-3 text-xs sm:text-sm text-teal-900 dark:text-teal-200">
            <Info className="w-5 h-5 shrink-0 text-[#008080] dark:text-teal-400 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">گزارش رویداد آخرین کنش:</span>
              <p>{lastActionMessage}</p>
            </div>
          </div>
        )}

        {/* Viewport Sandbox / Simulated Dashboard Elements */}
        <main className="mt-8 space-y-6">
          {/* Mock Top Nav with all 5 Header Navigation Items */}
          <header className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <span className="font-extrabold text-[#008080]">آوانا • داشبورد یادگیری</span>
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-tour="nav-courses"
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
              >
                دوره‌ها
              </span>
              <span
                data-tour="nav-my-classes"
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
              >
                کلاس‌های من
              </span>
              <span
                data-tour="nav-exams"
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
              >
                آزمون‌ها
              </span>
              <span
                data-tour="nav-library"
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
              >
                کتابخانه
              </span>
              <span
                data-tour="nav-flashcards"
                className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold cursor-pointer"
              >
                فلش‌کارت‌ها
              </span>
            </div>
          </header>

          {/* Mock Hero Courses Carousel */}
          <section
            data-tour="my-courses"
            className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6"
          >
            <div className="space-y-3 flex-1">
              <span className="inline-block px-3 py-1 bg-teal-50 dark:bg-teal-950/60 text-[#008080] text-xs font-semibold rounded-full border border-teal-200/40">
                شروع یادگیری با آوانا
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                دوره‌های من
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-lg leading-relaxed">
                مسیر یادگیری شما از اینجا آغاز می‌شود. دوره‌های فعال، درصد پیشرفت و سرفصل‌ها را در این بخش مشاهده کنید.
              </p>
              <div className="pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-[#008080] hover:bg-[#006666] text-white"
                >
                  ایجاد اولین دوره
                </Button>
              </div>
            </div>
            <div className="w-24 h-24 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/30 flex items-center justify-center text-[#008080]">
              <Compass className="w-10 h-10" />
            </div>
          </section>

          {/* Mock Grid of 3 side features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Upcoming Exams */}
            <section
              data-tour="upcoming-exams"
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">امتحاناتت رو فراموش نکن</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                تاریخ امتحاناتت رو اینجا ثبت کن تا همه رو یکجا ببینی و بدونی چقدر تا هر امتحان فرصت داری.
              </p>
            </section>

            {/* Smart Assistant */}
            <section
              data-tour="smart-assistant"
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <Play className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">هر جای آوانا سوال داشتی، بپرس</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                نمی‌دونی یک قابلیت کجاست یا چطور از بخشی از آوانا استفاده کنی؟ از دستیار هوشمند بپرس تا راهنمایی‌ات کنه.
              </p>
            </section>

            {/* Study Planner */}
            <section
              data-tour="study-planner"
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">برنامه مطالعه‌ات آماده‌ست!</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                آوانا کارهای مطالعه‌ات رو به تسک‌های روزانه تبدیل می‌کنه و برنامه رو برات می‌چینه.
              </p>
            </section>
          </div>
        </main>
      </div>

      {/* The Actual Dashboard Onboarding Modal Component */}
      <DashboardOnboardingModal
        isOpen={isOpen}
        onClose={handleModalClose}
      />
    </div>
  );
};
