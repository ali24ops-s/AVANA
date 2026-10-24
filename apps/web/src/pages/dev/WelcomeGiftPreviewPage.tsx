import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Gift,
  Sun,
  Moon,
  Smartphone,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Play,
  ArrowRight,
  Info,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { WelcomeGiftModal } from "../../components/welcome/WelcomeGiftModal.js";
import { Button } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export const WelcomeGiftPreviewPage: React.FC = () => {
  // Modal state - starts open by default for immediate preview
  const [isOpen, setIsOpen] = useState(true);
  const [walletAmount, setWalletAmount] = useState(20000);
  const [subscriptionDays, setSubscriptionDays] = useState(7);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
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
      // Cleanup dark class if page unmounts
      document.documentElement.classList.remove("dark");
    };
  }, [isDarkMode]);

  const handleModalClose = () => {
    setIsOpen(false);
    setLastActionMessage(
      "مودال با موفقیت بسته شد (رویداد onClose اجرا شد؛ هیچ درخواست سرور یا تغییر دیتابیس صورت نگرفت)."
    );
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    setLastActionMessage(null);
  };

  const handleSimulateAcknowledging = () => {
    setIsAcknowledging(true);
    setLastActionMessage("حالت لودینگ دکمه فعال شد. پس از ۱.۵ ثانیه مودال به صورت شبیه‌سازی‌شده بسته می‌شود.");
    setTimeout(() => {
      setIsAcknowledging(false);
      setIsOpen(false);
      setLastActionMessage("فرآیند شبیه‌سازی تایید تکمیل شد (بدون اثر بر کیف پول یا دیتابیس).");
    }, 1500);
  };

  const handleResetDefaults = () => {
    setWalletAmount(20000);
    setSubscriptionDays(7);
    setIsAcknowledging(false);
    setIsOpen(true);
    setLastActionMessage("مقادیر به حالت پیش‌فرض (۲۰,۰۰۰ تومان و ۷ روز اشتراک) بازگردانی شدند.");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 p-4 sm:p-8" dir="rtl">
      {/* Top Navigation & Info Header */}
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#008080] text-white flex items-center justify-center shadow-sm">
                <Gift className="w-4 h-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                پیش‌نمایش هدیه خوشامدگویی آوانا
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                محیط توسعه (Dev Only)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              محیط ایزوله و کاملاً امن جهت بررسی ظاهر، فونت، واکنش‌گرایی و تجربه کاربری مودال هدیه
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              بازگشت به خانه
            </Link>
          </div>
        </header>

        {/* Security / Dev-Only Notice Banner */}
        <div className="rounded-2xl p-4 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 flex items-start gap-3.5 text-teal-950 dark:text-teal-200">
          <ShieldCheck className="w-5 h-5 text-[#008080] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1 leading-relaxed">
            <p className="font-bold">
              تضمین امنیت داده‌ها و عدم ارتباط با سرور:
            </p>
            <p className="text-teal-800 dark:text-teal-300 text-xs">
              این پیش‌نمایش کاملاً مستقل از بک‌اند کار می‌کند. کلیک روی دکمه «بزن بریم!» یا بستن پنجره، هیچ تغییری در دیتابیس، کیف پول، اشتراک یا حساب‌های واقعی ایجاد نمی‌کند و نیازی به ساخت کاربر جدید ندارید.
            </p>
          </div>
        </div>

        {/* Action / Event Feedback Banner */}
        {lastActionMessage && (
          <div className="rounded-2xl p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{lastActionMessage}</span>
          </div>
        )}

        {/* Control Toolbar */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#008080]" />
            تنظیمات و ابزارهای تست
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Modal Visibility Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                وضعیت نمایش مودال
              </label>
              <div>
                {isOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    className="w-full text-xs py-2 rounded-xl"
                  >
                    بستن موقت مودال
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleOpenModal}
                    className="w-full text-xs py-2 rounded-xl bg-[#008080] hover:bg-[#006666] text-white font-bold"
                  >
                    <Play className="w-3.5 h-3.5 ml-1.5" />
                    نمایش مجدد مودال
                  </Button>
                )}
              </div>
            </div>

            {/* Loading State Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                شبیه‌سازی اکشن کاربر
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={!isOpen || isAcknowledging}
                onClick={handleSimulateAcknowledging}
                className="w-full text-xs py-2 rounded-xl"
              >
                تست حالت در حال دریافت...
              </Button>
            </div>

            {/* Dark Mode Switcher */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                حالت تم رنگی
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="w-full text-xs py-2 rounded-xl flex items-center justify-center gap-2"
              >
                {isDarkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    تغییر به تم روشن
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-indigo-500" />
                    تغییر به تم تاریک
                  </>
                )}
              </Button>
            </div>

            {/* Viewport Frame Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                شبیه‌ساز قاب دستگاه
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewportMode("standard")}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1 ${
                    viewportMode === "standard"
                      ? "bg-[#008080] text-white border-[#008080]"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-transparent hover:bg-slate-200"
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  استاندارد
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode("mobile-frame")}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1 ${
                    viewportMode === "mobile-frame"
                      ? "bg-[#008080] text-white border-[#008080]"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-transparent hover:bg-slate-200"
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  قاب موبایل
                </button>
              </div>
            </div>
          </div>

          {/* Value Customization */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <label className="font-semibold text-slate-600 dark:text-zinc-400">
                  مبلغ کیف پول:
                </label>
                <input
                  type="number"
                  step="5000"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(Number(e.target.value) || 0)}
                  className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-mono text-center text-xs"
                />
                <span className="text-slate-500">تومان ({toPersianDigits(walletAmount.toLocaleString("fa-IR"))})</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="font-semibold text-slate-600 dark:text-zinc-400">
                  مدت اشتراک:
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={subscriptionDays}
                  onChange={(e) => setSubscriptionDays(Number(e.target.value) || 0)}
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-mono text-center text-xs"
                />
                <span className="text-slate-500">روز ({toPersianDigits(subscriptionDays)})</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleResetDefaults}
              className="text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              بازنشانی مقادیر به ۲۰ هزار تومان و ۷ روز
            </Button>
          </div>
        </div>

        {/* Viewport Simulation Stage */}
        {viewportMode === "mobile-frame" ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#008080]" />
              شبیه‌ساز قاب نمایشگر موبایل (۳۷۵×۷۲۰ پیکسل)
            </div>
            <div className="w-[375px] h-[720px] rounded-[44px] border-[10px] border-slate-800 dark:border-zinc-700 bg-slate-900 shadow-2xl relative overflow-hidden flex flex-col">
              {/* iPhone style speaker notch */}
              <div className="w-36 h-5 bg-slate-800 dark:bg-zinc-700 rounded-b-2xl mx-auto z-10 shrink-0" />
              <div className="flex-1 bg-slate-100 dark:bg-zinc-950 p-3 overflow-y-auto flex items-center justify-center">
                {isOpen ? (
                  <div className="w-full">
                    <div className="rounded-3xl shadow-xl overflow-hidden">
                      <WelcomeGiftModal
                        isOpen={true}
                        onClose={handleModalClose}
                        walletAmount={walletAmount}
                        subscriptionDays={subscriptionDays}
                        isAcknowledging={isAcknowledging}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <p className="text-xs text-slate-500 dark:text-zinc-400">مودال بسته شده است</p>
                    <Button
                      type="button"
                      onClick={handleOpenModal}
                      className="text-xs py-2 px-4 rounded-xl bg-[#008080] text-white"
                    >
                      باز کردن مجدد
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900 text-[#008080] flex items-center justify-center mx-auto">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              مودال در حالت دیالوگ استاندارد (تمام صفحه) فعال است
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
              در این حالت، مودال با استایل واقعی روی صفحه باز می‌شود. با بستن آن می‌توانید دوباره از کنترل‌های بالا دکمه «نمایش مجدد مودال» را بزنید.
            </p>
            {!isOpen && (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleOpenModal}
                  className="text-xs py-2 px-6 rounded-xl bg-[#008080] hover:bg-[#006666] text-white font-bold"
                >
                  <Play className="w-3.5 h-3.5 ml-1.5" />
                  باز کردن مودال
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The Actual WelcomeGiftModal Component */}
      {viewportMode === "standard" && (
        <WelcomeGiftModal
          isOpen={isOpen}
          onClose={handleModalClose}
          walletAmount={walletAmount}
          subscriptionDays={subscriptionDays}
          isAcknowledging={isAcknowledging}
        />
      )}
    </div>
  );
};
