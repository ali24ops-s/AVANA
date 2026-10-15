import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  LayoutGrid,
  Monitor,
  Layers,
  FileText,
  Sliders,
  Sun,
  Moon,
  Grid,
  ArrowRight,
  ShieldCheck,
  Heart,
  ArrowLeftRight,
  UserCheck,
} from "lucide-react";
import { STICKER_CONCEPTS, ALL_STICKERS } from "./registry.js";
import { ComparisonMatrix } from "./components/ComparisonMatrix.js";
import { DashboardInSituPreview } from "./components/DashboardInSituPreview.js";
import { StickerCard } from "./components/StickerCard.js";
import { EvaluationSummary } from "./components/EvaluationSummary.js";
import { MinimalVectorComparison } from "./concepts/concept-a/MinimalVectorComparison.js";
import { AvaniCharacterEvaluation } from "./concepts/concept-c/AvaniCharacterEvaluation.js";
import { SproutPreviewSection } from "./concepts/concept-sprout/SproutPreviewSection.js";
import { FinalAvaniPreviewSection } from "./concepts/concept-approved/FinalAvaniPreviewSection.js";

type TabId =
  | "final-approved"
  | "sprout-direction"
  | "refined-a"
  | "avani-logotype"
  | "insitu"
  | "matrix"
  | "evaluation";
type BgMode = "default" | "white" | "dark" | "checker";

export const StickerSystemPreviewPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("final-approved");
  const [bgMode, setBgMode] = useState<BgMode>("default");
  const [displaySize, setDisplaySize] = useState<number>(64);

  return (
    <div className="min-h-screen bg-[#F7F9FA] text-[#1A2226] font-sans antialiased pb-20" dir="rtl">
      {/* 1. Header Bar */}
      <header className="bg-white border-b border-[#E2E7EA] sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080] text-white flex items-center justify-center font-black text-lg shadow-sm">
              🌱
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-[#1A2226]">
                  سیستم استیکر و کاراکتر اختصاصی AVANA
                </h1>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#E0F2F2] text-[#006666] font-extrabold">
                  مسیر جدید آوانی بر پایه تصویر مرجع
                </span>
              </div>
              <p className="text-xs text-gray-400">
                طراحی ۳ کانسپت ارگانیک بذر/جوانه + نمونه Minimal Vector طراحی‌شده از صفر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>پیش‌نمایش ایزوله طراحی</span>
            </span>
            <Link
              to="/"
              className="text-xs text-gray-600 hover:text-[#008080] flex items-center gap-1 font-semibold border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <span>بازگشت به خانه</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Mission Brief */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
        <div className="bg-gradient-to-br from-[#008080] to-[#005050] rounded-3xl p-6 sm:p-8 text-white shadow-elevated relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-[#A7D0E6]">
              <Heart className="w-3.5 h-3.5 text-rose-300 fill-rose-300" />
              <span>تغییر مسیر طراحی بر اساس سلیقه و تصویر مرجع منتخب شما</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-black leading-tight">
              تعریف شخصیت «آوانی» با الهام از موجود دوست‌داشتنی بذر و جوانه رویش
            </h2>
            <p className="text-xs sm:text-sm text-[#E0F2F2] leading-relaxed">
              طرح‌های قبلی مبتنی بر حروف لوگو و ربات‌های کلیشه‌ای کنار گذاشته شدند. بر پایه تصویر مرجع شما، سه کانسپت متمایز با زبان بصری گرم، برگ‌های جوانه دانایی، گونه‌های گل‌انداخته و پاهای تپل و باثبات در ۵ نمای استاندارد طراحی شدند. همچنین یک نمونه استیکر Minimal Vector کاملاً از صفر و بدون هیچ زائده‌ای بازطراحی شد.
            </p>
          </div>

          <div className="absolute left-[-40px] bottom-[-40px] w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute left-32 top-[-20px] w-32 h-32 rounded-full bg-[#A7D0E6]/10 pointer-events-none" />
        </div>
      </section>

      {/* 3. Global Navigation Controls */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="bg-white rounded-3xl border border-[#E2E7EA] p-3 sm:p-4 flex items-center justify-between flex-wrap gap-4 shadow-xs">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("final-approved")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "final-approved"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>★ شخصیت نهایی آوانی (تأییدشده 🌟)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("sprout-direction")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "sprout-direction"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-[#E0F2F2] text-[#006666] hover:bg-[#cbe8e8]"
              }`}
            >
              <Heart className="w-4 h-4 text-rose-300 fill-rose-300" />
              <span>آرشیو کانسپت بذر و جوانه 🌱</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("refined-a")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "refined-a"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>اصلاح Minimal Vector (قبل و بعد ۶ تایی)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("insitu")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "insitu"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>پیش‌نمایش در هدر داشبورد آوانا</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("avani-logotype")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "avani-logotype"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>آرشیو کانسپت‌های لوگومحور (C1, C2, C3)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all ${
                activeTab === "matrix"
                  ? "bg-[#008080] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>ماتریس جامع فاز ۱</span>
            </button>
          </div>

          {/* Background Switcher */}
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
            <span className="text-[11px] text-gray-500 px-2 font-medium">پس‌زمینه:</span>
            <button
              type="button"
              onClick={() => setBgMode("default")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                bgMode === "default" ? "bg-white text-[#008080] shadow-xs" : "text-gray-500"
              }`}
            >
              آوانا
            </button>
            <button
              type="button"
              onClick={() => setBgMode("white")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                bgMode === "white" ? "bg-white text-[#008080] shadow-xs" : "text-gray-500"
              }`}
            >
              سفید
            </button>
            <button
              type="button"
              onClick={() => setBgMode("dark")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                bgMode === "dark" ? "bg-[#1A2226] text-white shadow-xs" : "text-gray-500"
              }`}
            >
              تیره
            </button>
          </div>
        </div>
      </section>

      {/* 4. Active Tab Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 0: Final Approved Avani Character (Primary!) */}
        {activeTab === "final-approved" && <FinalAvaniPreviewSection />}

        {/* TAB 1: Brand New Sprout Direction */}
        {activeTab === "sprout-direction" && <SproutPreviewSection />}

        {/* TAB 2: Minimal Vector Refinement */}
        {activeTab === "refined-a" && <MinimalVectorComparison />}

        {/* TAB 3: Dashboard In-Situ */}
        {activeTab === "insitu" && <DashboardInSituPreview />}

        {/* TAB 4: Archive of Logotype Concepts */}
        {activeTab === "avani-logotype" && <AvaniCharacterEvaluation />}

        {/* TAB 5: Original Matrix */}
        {activeTab === "matrix" && (
          <div className="space-y-6">
            <ComparisonMatrix displaySize={displaySize} bgMode={bgMode} />
          </div>
        )}
      </main>
    </div>
  );
};
