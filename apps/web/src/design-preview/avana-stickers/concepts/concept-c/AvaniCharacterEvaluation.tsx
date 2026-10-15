import React, { useState } from "react";
import {
  Sparkles,
  Layers,
  CheckCircle2,
  HelpCircle,
  Eye,
  Hand,
  Maximize2,
  Compass,
} from "lucide-react";
import { AVANI_PROPOSALS } from "./base-characters.js";

type ViewMode = "all-views" | "silhouette" | "primary" | "small" | "greeting";

export const AvaniCharacterEvaluation: React.FC = () => {
  const [activeViewMode, setActiveViewMode] = useState<ViewMode>("all-views");
  const [bgMode, setBgMode] = useState<"default" | "white" | "dark">("default");

  const bgClasses = {
    default: "bg-[#F7F9FA]",
    white: "bg-white",
    dark: "bg-[#1A2226] text-white",
  }[bgMode];

  return (
    <div className="space-y-8">
      {/* 1. Logotype Architectural Analysis Banner */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2E7EA] shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#008080] text-white flex items-center justify-center font-black text-2xl shrink-0 shadow-sm">
            Λ
          </div>
          <div className="space-y-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#E0F2F2] text-[#006666]">
              تحلیل هندسی لوگوتایپ واقعی AVANA
            </span>
            <h3 className="text-lg font-black text-[#1A2226]">
              ریشه‌یابی ساختار شخصیت آوانی از فرم حروف و نشان آوانا
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed max-w-4xl">
              در بررسی دقیق دارایی‌های برند (فایل‌های <code className="text-[#008080] font-mono">avana-wordmark.png</code> و <code className="text-[#008080] font-mono">avana-logo.png</code>)، مشخص شد که هویت بصری آوانا بر سه ستون هندسی استوار است:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="font-bold text-[#008080] block mb-1">۱. طاق باز بدون خط وسط (Λ)</span>
                حرف «A» در کلمه AVANA فاقد خط افقی (Crossbar) است و یک طاق متین با زاویه ۶۰ درجه و پخ مسطح در نوک تشکیل می‌دهد.
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="font-bold text-[#008080] block mb-1">۲. تلاقی و قرینگی زوایای ۶۰ درجه</span>
                ریتم کلمه «Λ - V - Λ - N - Λ» حاصل بازی قرینه قله‌ها (A) و دره‌ها (V) با ضخامت استروک یکنواخت است.
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="font-bold text-[#008080] block mb-1">۳. مونوگرام روبانی پیوسته</span>
                نشان گرافیکی اصلی آوانا از دو قله و یک دره مرکزی درهم‌تنیده تشکیل شده که فضای منفی مثلثی در دل خود دارد.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive View Mode & Controls */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E7EA] flex items-center justify-between flex-wrap gap-4 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500">انتخاب نمای بررسی:</span>
          <button
            type="button"
            onClick={() => setActiveViewMode("all-views")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewMode === "all-views"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            هر ۴ نما در کنار هم
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode("silhouette")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewMode === "silhouette"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۱. سیلوئت خالص
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode("primary")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewMode === "primary"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۲. نمای اصلی
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode("small")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewMode === "small"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۳. اندازه کوچک (۳۲-۴۸px)
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode("greeting")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewMode === "greeting"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۴. نسخه خوشامدگویی
          </button>
        </div>

        {/* Background Selector */}
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

      {/* 3. The 4 Characters Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {AVANI_PROPOSALS.map((char, index) => {
          const isBaseline = char.id === "avani-current";

          return (
            <div
              key={char.id}
              className={`bg-white rounded-3xl border p-5 flex flex-col justify-between shadow-xs transition-all ${
                isBaseline
                  ? "border-gray-200 bg-gray-50/40"
                  : "border-[#B3D9D9] hover:border-[#008080] hover:shadow-md"
              }`}
            >
              <div>
                {/* Header Tag */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      isBaseline
                        ? "bg-gray-200 text-gray-700"
                        : "bg-[#E0F2F2] text-[#006666]"
                    }`}
                  >
                    {isBaseline ? "نسخه کنونی" : `پیشنهاد جدید ${index}`}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {char.nameEn.split(" ")[0]}
                  </span>
                </div>

                <h4 className="text-base font-extrabold text-[#1A2226] mb-1">
                  {char.nameFa}
                </h4>
                <p className="text-xs text-gray-500 font-medium mb-3">
                  {char.nameEn}
                </p>

                {/* Visual Stage depending on view mode */}
                {activeViewMode === "all-views" ? (
                  <div className="space-y-3 my-4">
                    {/* View 1 & 2 Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}
                      >
                        <char.Silhouette size={48} />
                        <span className="text-[9px] text-gray-400 mt-1">۱. سیلوئت</span>
                      </div>
                      <div
                        className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}
                      >
                        <char.Primary size={48} />
                        <span className="text-[9px] text-gray-400 mt-1">۲. نمای اصلی</span>
                      </div>
                    </div>

                    {/* View 3 & 4 Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}
                      >
                        <char.Small size={36} />
                        <span className="text-[9px] text-gray-400 mt-1">۳. ۳۶px</span>
                      </div>
                      <div
                        className={`h-24 rounded-xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}
                      >
                        <char.Greeting size={48} />
                        <span className="text-[9px] text-gray-400 mt-1">۴. خوشامدگویی</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`h-48 rounded-2xl flex items-center justify-center border border-gray-100 my-4 ${bgClasses}`}
                  >
                    {activeViewMode === "silhouette" && <char.Silhouette size={84} />}
                    {activeViewMode === "primary" && <char.Primary size={84} />}
                    {activeViewMode === "small" && <char.Small size={44} />}
                    {activeViewMode === "greeting" && <char.Greeting size={84} />}
                  </div>
                )}

                {/* Concept Description */}
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  {char.conceptDescFa}
                </p>
              </div>

              {/* Geometric Linkage Box */}
              <div className="pt-3 border-t border-gray-100">
                <span className="text-[10px] font-bold text-[#006666] block mb-1">
                  پیوند با هویت بصری آوانا:
                </span>
                <p className="text-[11px] text-gray-500 leading-normal">
                  {char.linkageFa}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Adaptability to the 6 Core Topics Analysis */}
      <div className="bg-white p-6 rounded-3xl border border-[#E2E7EA] shadow-xs space-y-4">
        <h4 className="text-base font-extrabold text-[#1A2226] flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#008080]" />
          <span>بررسی قابلیت انطباق کانسپت‌های بازطراحی‌شده با ۶ موقعیت استیکر</span>
        </h4>
        <p className="text-xs text-gray-600 leading-relaxed">
          پیش از انتخاب سبک نهایی، بررسی شده است که هر یک از کانسپت‌های سه‌گانه چگونه می‌توانند در فاز بعدی به ۶ حالت کامل تبدیل شوند:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* C1 Adaptability */}
          <div className="p-4 rounded-2xl bg-[#F0FAFA] border border-[#B3D9D9] space-y-2">
            <h5 className="font-bold text-[#006666] text-sm">قابلیت توسعه C1: Letterform</h5>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Learning:</strong> کاراکتر طاقی A به عنوان پایه نگهدارنده کتاب باز عمل می‌کند.</li>
              <li>• <strong>Idea:</strong> نوک مسطح طاق A به یک درخشش نوری تبدیل می‌شود.</li>
              <li>• <strong>Success:</strong> قرارگیری مدال پیروزی در فضای منفی میان پایه‌ها.</li>
              <li>• <strong>Progress:</strong> گام برداشتن دو پایه طاق روی پله‌های صعودی.</li>
              <li>• <strong>Empty State:</strong> استراحت متین طاق A در کنار میز خلوت.</li>
            </ul>
          </div>

          {/* C2 Adaptability */}
          <div className="p-4 rounded-2xl bg-[#F4F9FD] border border-[#A7D0E6] space-y-2">
            <h5 className="font-bold text-[#2B6D8F] text-sm">قابلیت توسعه C2: Geometric</h5>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Learning:</strong> کاراکتر کریستالی کتاب را در آغوش گرفته و افق دید آن به کتاب می‌تابد.</li>
              <li>• <strong>Idea:</strong> پخ ۶۰ درجه بالای سر روشن شده و برق دانش می‌زند.</li>
              <li>• <strong>Success:</strong> برافراشتن مدال با دستان چندوجهی هندسی.</li>
              <li>• <strong>Progress:</strong> صعود با شیب هماهنگ با اضلاع ۶۰ درجه بدنه.</li>
              <li>• <strong>Empty State:</strong> فرم ساکن هندسی با نگاه متفکر به افق خالی.</li>
            </ul>
          </div>

          {/* C3 Adaptability */}
          <div className="p-4 rounded-2xl bg-[#FDF8F0] border border-[#F0E6D2] space-y-2">
            <h5 className="font-bold text-[#8F5E27] text-sm">قابلیت توسعه C3: Monogram</h5>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Learning:</strong> دو قله روبان آوانا ورق‌های کتاب را شکل می‌دهند.</li>
              <li>• <strong>Idea:</strong> فضای منفی دره مرکزی V به عنوان کانون انتشار نور می‌درخشد.</li>
              <li>• <strong>Success:</strong> روبان در نوک قله به یک ستاره پیروزی منتهی می‌شود.</li>
              <li>• <strong>Progress:</strong> موج پیوسته صعودی روبان نماد تداوم مسیر یادگیری است.</li>
              <li>• <strong>Empty State:</strong> روبان آرام و حلقه‌شده در انتظار گشوده شدن دانش.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
