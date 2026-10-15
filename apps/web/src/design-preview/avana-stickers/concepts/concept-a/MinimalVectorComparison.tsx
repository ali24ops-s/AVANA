import React, { useState } from "react";
import { CheckCircle2, XCircle, ArrowLeftRight } from "lucide-react";
import {
  GreetingHandA,
  LearningA,
  IdeaA,
  SuccessA,
  ProgressA,
  EmptyStateA,
} from "./index.js";
import {
  GreetingHandA_Refined,
  LearningA_Refined,
  IdeaA_Refined,
  SuccessA_Refined,
  ProgressA_Refined,
  EmptyStateA_Refined,
} from "./refined.js";

interface TopicPair {
  id: string;
  titleFa: string;
  titleEn: string;
  Legacy: React.FC<{ size?: number; className?: string }>;
  Refined: React.FC<{ size?: number; className?: string }>;
  critiqueFa: string;
  fixesFa: string[];
}

const COMPARISON_PAIRS: TopicPair[] = [
  {
    id: "greeting-hand",
    titleFa: "۱. Greeting Hand (دست خوشامدگویی)",
    titleEn: "Greeting Hand",
    Legacy: GreetingHandA,
    Refined: GreetingHandA_Refined,
    critiqueFa:
      "در نسخه قبلی، وجود بک‌گراند دایره‌ای، خطوط چندگانه موج دست، چین‌های کف دست و لایه‌های آستین باعث شلوغی و محو شدن فرم در ۲۴px می‌شد.",
    fixesFa: [
      "حذف کامل دایره پس‌زمینه برای شفافیت ۱۰۰٪ و ادغام طبیعی با متن هدر",
      "سیلوئت یکدست دست با کف عاجی (#F0E6D2) و خط محیطی فیروزه‌ای قوی (#008080)",
      "حذف چین‌های داخلی و موج‌های اضافی؛ تبدیل به یک نماد تمیز و خوانا در ۳۲ پیکسل",
    ],
  },
  {
    id: "learning",
    titleFa: "۲. Learning (کتاب مطالعه)",
    titleEn: "Learning Tome",
    Legacy: LearningA,
    Refined: LearningA_Refined,
    critiqueFa:
      "وجود ۶ خط متن ساختگی (Fake Text Lines) روی صفحات، در ابعاد زیر ۴۸ پیکسل تبدیل به لکه‌های نامفهوم و آلودگی بصری می‌شد.",
    fixesFa: [
      "حذف کامل خطوط شبیه‌ساز متن و تکیه بر فرم خالص کتاب باز",
      "انحنای هندسی منطبق بر زاویه V در لوگوتایپ آوانا",
      "تک‌روبان شاخص در آبی مکمل (#A7D0E6) برای هدایت چشم",
    ],
  },
  {
    id: "idea",
    titleFa: "۳. Idea (ایده و درک مطلب)",
    titleEn: "Idea Bulb",
    Legacy: IdeaA,
    Refined: IdeaA_Refined,
    critiqueFa:
      "وجود ۵ پرتو نوری خارجی مجزا و فیلامنت درهم‌پیچیده باعث خروج از اصول مینیمالیسم و کاهش وضوح در اندازه کوچک بود.",
    fixesFa: [
      "حذف تمام خطوط شعاعی پرتوهای خارجی",
      "طراحی فیلامنت داخلی به شکل هندسه طاق حرف A آوانا (نقطه اتصال مفهومی)",
      "پایه پیچی ساده‌شده با ۲ لایه افقی متقارن",
    ],
  },
  {
    id: "success",
    titleFa: "۴. Success (مدال پیروزی)",
    titleEn: "Mastery Badge",
    Legacy: SuccessA,
    Refined: SuccessA_Refined,
    critiqueFa:
      "ترکیب همزمان روبان‌های پایین، لبه‌های کنگره‌دار، ۳ حلقه هم‌مرکز و جرقه‌های ستاره‌ای، استیکر را شبیه آیکون‌های پیچیده بازی کرده بود.",
    fixesFa: [
      "حذف کامل دنباله‌های روبان و ستاره‌های پراکنده خارجی",
      "پلاک دایره‌ای یکپارچه با نسبت طلایی و فضای تنفس سفید",
      "تیک ضخیم و باصلابت ۳.۲ پیکسلی که از فاصله دور نیز پیام پیروزی را می‌رساند",
    ],
  },
  {
    id: "progress",
    titleFa: "۵. Progress (رشد و پیشرفت)",
    titleEn: "Growth Metric",
    Legacy: ProgressA,
    Refined: ProgressA_Refined,
    critiqueFa:
      "پیکان اریب معلق و ستاره شناور با ستون‌ها تداخل داشت و مسیر بصری مغشوش ایجاد می‌کرد.",
    fixesFa: [
      "۳ ستون با شیب صعودی دقیق و افزایش غلظت رنگ از چپ به راست",
      "حذف پیکان اضافی و قرارگیری گوی جوانه مستقیماً در نوک ستون قله",
      "خط مبنای متوازن و خلوت",
    ],
  },
  {
    id: "empty-state",
    titleFa: "۶. Empty State (کتابخانه خالی)",
    titleEn: "Empty Library",
    Legacy: EmptyStateA,
    Refined: EmptyStateA_Refined,
    critiqueFa:
      "وجود میز ضخیم، حباب‌های معلق، پر شناور و جزئیات خرد حس سردرگمی ایجاد می‌کرد.",
    fixesFa: [
      "یک خط افق مینیمال بدون پایه‌های اضافه",
      "یک کتاب ایستا و یک کتاب تکیه‌داده‌شده با تناسب هندسی دقیق",
      "انتقال حس آرامش و فضای منفی تمیز بدون هیچ لکه اضافه",
    ],
  },
];

export const MinimalVectorComparison: React.FC = () => {
  const [testBg, setTestBg] = useState<"default" | "white" | "dark">("default");

  const bgStyle = {
    default: "bg-[#F7F9FA]",
    white: "bg-white",
    dark: "bg-[#1A2226] text-white",
  }[testBg];

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white p-5 rounded-2xl border border-[#E2E7EA] flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-base font-extrabold text-[#1A2226] flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-[#008080]" />
            <span>مقایسه رو در رو: کانسپت A اولیه در برابر نسخه بازطراحی‌شده و مینیمال</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            در نسخه اصلاح‌شده، دایره‌های زمینه، پرتوهای نوری، خطوط جعلی متن و زوائد تزئینی حذف شده و فرم‌ها به هندسه ناب و خوانا تقلیل یافته‌اند.
          </p>
        </div>

        {/* Test Background Switcher */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <span className="text-[11px] text-gray-500 px-2 font-medium">پس‌زمینه آزمون:</span>
          <button
            type="button"
            onClick={() => setTestBg("default")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              testBg === "default" ? "bg-white text-[#008080] shadow-xs" : "text-gray-500"
            }`}
          >
            آوانا (#F7F9FA)
          </button>
          <button
            type="button"
            onClick={() => setTestBg("white")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              testBg === "white" ? "bg-white text-[#008080] shadow-xs" : "text-gray-500"
            }`}
          >
            سفید
          </button>
          <button
            type="button"
            onClick={() => setTestBg("dark")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              testBg === "dark" ? "bg-[#1A2226] text-white shadow-xs" : "text-gray-500"
            }`}
          >
            تیره
          </button>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="space-y-6">
        {COMPARISON_PAIRS.map((pair) => (
          <div
            key={pair.id}
            className="bg-white rounded-2xl border border-[#E2E7EA] p-5 shadow-xs overflow-hidden"
          >
            {/* Header */}
            <div className="border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-[#1A2226]">{pair.titleFa}</h4>
              <span className="text-xs text-gray-400 font-mono">{pair.titleEn}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Legacy Display (5 cols) */}
              <div className="lg:col-span-5 bg-gray-50/70 p-4 rounded-xl border border-gray-200/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>نسخه اولیه (بیش از حد شلوغ)</span>
                  </span>
                  <span className="text-[10px] text-gray-400">۶۴px + ۲۴px</span>
                </div>
                <div className={`h-28 rounded-xl flex items-center justify-center gap-6 border border-gray-200 ${bgStyle}`}>
                  <pair.Legacy size={60} />
                  <div className="border-r border-gray-300 h-10" />
                  <div className="flex flex-col items-center gap-1">
                    <pair.Legacy size={28} />
                    <span className="text-[9px] text-gray-400">28px</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                  {pair.critiqueFa}
                </p>
              </div>

              {/* Refined Display (7 cols) */}
              <div className="lg:col-span-7 bg-[#F0FAFA]/60 p-4 rounded-xl border border-[#B3D9D9]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>نسخه اصلاح‌شده (مینیمال، دقیق، بدون زوائد)</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold">خوانایی بالا در ابعاد کوچک</span>
                </div>
                <div className={`h-28 rounded-xl flex items-center justify-center gap-8 border border-[#B3D9D9] ${bgStyle}`}>
                  <pair.Refined size={60} />
                  <div className="border-r border-emerald-200 h-10" />
                  <div className="flex flex-col items-center gap-1">
                    <pair.Refined size={32} />
                    <span className="text-[9px] text-emerald-700 font-bold">32px (UI)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <pair.Refined size={24} />
                    <span className="text-[9px] text-emerald-700 font-bold">24px</span>
                  </div>
                </div>

                {/* List of concrete fixes */}
                <div className="mt-2.5 space-y-1">
                  {pair.fixesFa.map((fix, idx) => (
                    <div key={idx} className="text-[11px] text-emerald-950 flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold shrink-0">✓</span>
                      <span>{fix}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
