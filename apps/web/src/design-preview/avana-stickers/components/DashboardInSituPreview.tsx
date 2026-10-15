import React, { useState } from "react";
import { Calendar, Clock, BookOpen, Award, ArrowLeft, Sparkles } from "lucide-react";
import { GreetingHandA } from "../concepts/concept-a/index.js";
import { GreetingHandA_Refined } from "../concepts/concept-a/refined.js";
import { GreetingHandB } from "../concepts/concept-b/index.js";
import { GreetingHandC } from "../concepts/concept-c/index.js";
import {
  Avani_C1_Letterform,
  Avani_C2_Geometric,
  Avani_C3_Monogram,
} from "../concepts/concept-c/base-characters.js";

type PreviewVariant =
  | "baseline"
  | "concept-a-legacy"
  | "concept-a-refined"
  | "concept-b"
  | "concept-c-current"
  | "concept-c1"
  | "concept-c2"
  | "concept-c3";

export const DashboardInSituPreview: React.FC = () => {
  const [activeVariant, setActiveVariant] = useState<PreviewVariant>("concept-a-refined");

  const renderGreetingSymbol = (variant: PreviewVariant, sizePx = 34) => {
    switch (variant) {
      case "baseline":
        return <span className="inline-block text-2xl sm:text-3xl select-none">👋</span>;
      case "concept-a-legacy":
        return <GreetingHandA size={sizePx} className="inline-block align-middle" />;
      case "concept-a-refined":
        return <GreetingHandA_Refined size={sizePx} className="inline-block align-middle" />;
      case "concept-b":
        return <GreetingHandB size={sizePx} className="inline-block align-middle" />;
      case "concept-c-current":
        return <GreetingHandC size={sizePx} className="inline-block align-middle" />;
      case "concept-c1":
        return <Avani_C1_Letterform.Greeting size={sizePx} className="inline-block align-middle" />;
      case "concept-c2":
        return <Avani_C2_Geometric.Greeting size={sizePx} className="inline-block align-middle" />;
      case "concept-c3":
        return <Avani_C3_Monogram.Greeting size={sizePx} className="inline-block align-middle" />;
    }
  };

  const getVariantTitle = (variant: PreviewVariant) => {
    switch (variant) {
      case "baseline":
        return "وضعیت موجود (ایموجی سیستمعامل 👋)";
      case "concept-a-legacy":
        return "کانسپت A اولیه (همراه با دایره پس‌زمینه)";
      case "concept-a-refined":
        return "کانسپت A اصلاح‌شده (مینیمال خالص و بدون زوائد)";
      case "concept-b":
        return "کانسپت B: Soft 3D";
      case "concept-c-current":
        return "آوانی کنونی (نسخه اولیه)";
      case "concept-c1":
        return "آوانی C1: Avani Letterform (طاق A)";
      case "concept-c2":
        return "آوانی C2: Avani Geometric (چندوجهی علمی)";
      case "concept-c3":
        return "آوانی C3: Avani Monogram (روبان پیوسته لوگو)";
    }
  };

  return (
    <div className="space-y-6">
      {/* Variant Selector Tabs */}
      <div className="bg-white p-4 rounded-3xl border border-[#E2E7EA] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#008080]" />
            <span className="text-xs sm:text-sm font-bold text-[#1A2226]">
              آزمون استیکر در هدر واقعی داشبورد آوانا:
            </span>
          </div>
          <span className="text-xs text-gray-500">
            اندازه استاندارد در رابط کاربری: ۳۲ الی ۳۴ پیکسل
          </span>
        </div>

        {/* Option Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <button
            type="button"
            onClick={() => setActiveVariant("baseline")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "baseline"
                ? "bg-gray-800 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ایموجی عمومی 👋
          </button>

          <span className="text-gray-300 mx-1">|</span>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-a-refined")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-a-refined"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-[#E0F2F2] text-[#006666] hover:bg-[#c9e8e8]"
            }`}
          >
            ★ کانسپت A (مینیمال اصلاح‌شده)
          </button>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-a-legacy")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-a-legacy"
                ? "bg-gray-600 text-white shadow-xs"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            کانسپت A (اولیه)
          </button>

          <span className="text-gray-300 mx-1">|</span>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-b")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-b"
                ? "bg-[#2B6D8F] text-white shadow-xs"
                : "bg-[#E8F4FB] text-[#2B6D8F] hover:bg-[#d4ebf8]"
            }`}
          >
            کانسپت B (Soft 3D)
          </button>

          <span className="text-gray-300 mx-1">|</span>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-c1")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-c1"
                ? "bg-[#8F5E27] text-white shadow-xs"
                : "bg-[#FDF2E4] text-[#8F5E27] hover:bg-[#fae4c9]"
            }`}
          >
            آوانی C1 (Letterform)
          </button>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-c2")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-c2"
                ? "bg-[#8F5E27] text-white shadow-xs"
                : "bg-[#FDF2E4] text-[#8F5E27] hover:bg-[#fae4c9]"
            }`}
          >
            آوانی C2 (Geometric)
          </button>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-c3")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-c3"
                ? "bg-[#8F5E27] text-white shadow-xs"
                : "bg-[#FDF2E4] text-[#8F5E27] hover:bg-[#fae4c9]"
            }`}
          >
            آوانی C3 (Monogram)
          </button>

          <button
            type="button"
            onClick={() => setActiveVariant("concept-c-current")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeVariant === "concept-c-current"
                ? "bg-gray-600 text-white shadow-xs"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            آوانی اولیه (کنونی)
          </button>
        </div>
      </div>

      {/* Main Dashboard In-Situ Stage */}
      <div className="bg-[#F7F9FA] rounded-3xl border border-[#E2E7EA] p-6 sm:p-8 shadow-xs">
        {/* Active Variant Tag */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E9EFF2]">
          <span className="text-xs font-bold text-[#006666] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#008080]" />
            {getVariantTitle(activeVariant)}
          </span>
          <span className="text-[11px] text-gray-400 font-mono">
            LIVE PREVIEW (IN-SITU)
          </span>
        </div>

        {/* 1. Exact AVANA Welcome Greeting Header */}
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#1A2226] tracking-tight flex items-center gap-2">
              <span>سلام علی</span>
              {renderGreetingSymbol(activeVariant, 34)}
            </h2>
            <div className="bg-white px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-[#E2E7EA] shadow-xs text-xs md:text-sm text-[#1A2226] flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#008080]" />
              <span className="text-[#008080] font-bold">۲۴ مهر</span>
              <span className="text-gray-500">۱۴۰۵</span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-2xl">
            استمرار روزانه در مرور مباحث، کلید تسلط پایدار در آزمون‌های بالینی و علوم پایه پزشکی است.
          </p>
        </div>

        {/* 2. Real AVANA Course Card and Study Time Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-6 items-stretch">
          {/* Active Course Card (8 cols) */}
          <div className="md:col-span-8 bg-white p-5 rounded-2xl border border-[#E2E7EA] shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-[#E0F2F2] text-[#006666] text-xs font-semibold">
                  در حال مطالعه • دوره اصلی
                </span>
                <span className="text-xs text-gray-400">آخرین مرور: دیروز</span>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1A2226]">
                  فارماکولوژی بالینی: داروهای سیستم آدرنرژیک و سمپاتومیمتیک
                </h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  مکانیسم اثر گیرنده‌های آلفا و بتا، ایندیکاسیون‌های بالینی شوک آنافیلاکسی و داروهای مهارکننده.
                </p>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#008080]" />
                <span className="text-xs text-gray-600">درس ۵ از ۱۲ • ۷۵٪ تکمیل</span>
              </div>
              <button
                type="button"
                className="px-4 py-1.5 rounded-lg bg-[#008080] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#007575] transition-colors"
              >
                <span>ادامه درس</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Weekly Study Time Card (4 cols) */}
          <div className="md:col-span-4 bg-white p-5 rounded-2xl border border-[#E2E7EA] shadow-xs flex flex-col items-center justify-center text-center">
            <Clock className="w-7 h-7 text-[#008080] mb-2" />
            <span className="text-xl font-extrabold text-[#1A2226]">۴ ساعت و ۲۰ دقیقه</span>
            <span className="text-xs text-gray-500 mt-1">زمان مطالعه این هفته</span>
            <div className="mt-3 px-2.5 py-1 rounded-full bg-[#E4F4EC] text-[#2A624B] text-[11px] font-bold flex items-center gap-1">
              <Award className="w-3 h-3" />
              <span>۱۵٪ رشد نسبت به هفته گذشته</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
