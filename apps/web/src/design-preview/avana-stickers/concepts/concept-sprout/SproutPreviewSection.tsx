import React, { useState } from "react";
import {
  Sparkles,
  Heart,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Monitor,
} from "lucide-react";
import { SPROUT_PROPOSALS, AvaniSprout } from "./AvaniSproutConcepts.js";
import { PureMinimalHand, PureMinimalBook } from "./PureMinimalVectorSample.js";

type SproutViewTab = "all-views" | "silhouette" | "primary" | "small" | "emotional" | "dashboard";

export const SproutPreviewSection: React.FC = () => {
  const [activeViewTab, setActiveViewTab] = useState<SproutViewTab>("all-views");
  const [bgMode, setBgMode] = useState<"default" | "white" | "dark">("default");

  const bgClasses = {
    default: "bg-[#F7F9FA]",
    white: "bg-white",
    dark: "bg-[#1A2226] text-white",
  }[bgMode];

  return (
    <div className="space-y-8">
      {/* 1. Reference Image Analysis Hero Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2E7EA] shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Reference Image Box (4 cols) */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="relative group">
              <div className="w-56 h-64 rounded-3xl overflow-hidden border-2 border-[#008080]/30 shadow-elevated bg-[#F0F7F7] flex items-center justify-center p-2">
                <img
                  src="/brand/avani-reference.png"
                  alt="تصویر مرجع آوانی"
                  className="w-full h-full object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <span className="absolute -bottom-3 right-1/2 translate-x-1/2 bg-[#008080] text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-xs whitespace-nowrap">
                تصویر مرجع منتخب شما
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-5 text-center">
              موجود نرم و دوست‌داشتنی بذر/جوانه با بافت پشمی و چشم‌های پرامید
            </p>
          </div>

          {/* Analytical Breakdown (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E0F2F2] text-[#006666] text-xs font-extrabold">
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              <span>تحلیل کارشناسی تصویر مرجع و دلایل جذابیت آن</span>
            </div>

            <h3 className="text-xl font-black text-[#1A2226]">
              چرا این موجود زنده و جوانه روی سر برای آوانا فوق‌العاده است؟
            </h3>

            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              بر خلاف طرح‌های قبلی که صرفاً برگردان خشک و مکانیکی حروف لوگو یا ربات‌های عمومی با عینک بودند، این مرجع دارای یک **شخصیت ارگانیک و همدل** است که دقیقاً برای یک پلتفرم آموزشی معنادار است:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#F0FAFA] border border-[#B3D9D9] space-y-1">
                <span className="font-extrabold text-[#006666] block">🌱 نماد رویش و جوانه زدن دانش:</span>
                <span className="text-gray-600 leading-normal">
                  برگ‌های دوقلوی بالای سر، یادآور شکوفایی یادگیری، رشد روزانه دانشجو و درک مفاهیم تازه در طول ترم است.
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FDF2E4] border border-[#F0E6D2] space-y-1">
                <span className="font-extrabold text-[#8F5E27] block">🌸 گونه‌های گل‌انداخته و صمیمیت:</span>
                <span className="text-gray-600 leading-normal">
                  رنگ هلویی/مرجانی گونه‌ها و لبخند ملایم، حس همراهی امن را به دانشجویی می‌دهد که ساعت‌ها با مطالب سنگین پزشکی درگیر است.
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E8F4FB] border border-[#A7D0E6] space-y-1">
                <span className="font-extrabold text-[#2B6D8F] block">👀 نگاه متمرکز، زنده و پرامید:</span>
                <span className="text-gray-600 leading-normal">
                  حلقه فیروزه‌ای عنبیه و برق‌های نوری چشم، هوش و اشتیاق را تداعی می‌کنند، بدون اینکه کودکانه یا بی‌هدف به نظر برسند.
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-1">
                <span className="font-extrabold text-gray-800 block">⚖️ سیلوئت متوازن گلابی/بذر:</span>
                <span className="text-gray-600 leading-normal">
                  پایین‌تنه پهن با پاهای تپل و محکم روی زمین، ثبات و تکیه‌گاه بودن شخصیت را تثبیت می‌کند و در ابعاد کوچک فوراً قابل تشخیص است.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Navigation Controls */}
      <div className="bg-white p-4 rounded-3xl border border-[#E2E7EA] flex items-center justify-between flex-wrap gap-4 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-gray-500">انتخاب نمای بررسی:</span>
          <button
            type="button"
            onClick={() => setActiveViewTab("all-views")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "all-views"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            هر ۵ نما در کنار هم
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab("silhouette")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "silhouette"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۱. سیلوئت تک‌رنگ
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab("primary")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "primary"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۲. نمای اصلی تخت
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab("small")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "small"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۳. اندازه واقعی (۳۲-۴۸px)
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab("emotional")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "emotional"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۴. حالت احساسی / ژست
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab("dashboard")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeViewTab === "dashboard"
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            ۵. ژست خوشامدگویی داشبورد
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

      {/* 3. The 3 New Concepts Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {SPROUT_PROPOSALS.map((prop, idx) => (
          <div
            key={prop.id}
            className="bg-white rounded-3xl border border-[#B3D9D9] p-6 shadow-xs hover:border-[#008080] hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-[#E0F2F2] text-[#006666]">
                  کانسپت {idx + 1}
                </span>
                <span className="text-xs text-gray-400 font-mono">{prop.nameEn}</span>
              </div>

              <h4 className="text-base font-black text-[#1A2226] mb-1">{prop.nameFa}</h4>
              <p className="text-xs text-gray-500 font-medium mb-4">{prop.nameEn}</p>

              {/* Visual Display Stage */}
              {activeViewTab === "all-views" ? (
                <div className="space-y-3 my-4">
                  {/* Row 1: Silhouette + Primary */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`h-28 rounded-2xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}>
                      <prop.Silhouette size={54} />
                      <span className="text-[10px] text-gray-400 mt-1">۱. سیلوئت</span>
                    </div>
                    <div className={`h-28 rounded-2xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}>
                      <prop.Primary size={54} />
                      <span className="text-[10px] text-gray-400 mt-1">۲. نمای اصلی</span>
                    </div>
                  </div>

                  {/* Row 2: Small Scale (36px) + Emotional Gesture */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`h-28 rounded-2xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}>
                      <prop.Small size={36} />
                      <span className="text-[10px] text-gray-400 mt-1">۳. ۳۶px واقعی</span>
                    </div>
                    <div className={`h-28 rounded-2xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}>
                      <prop.Emotional size={54} />
                      <span className="text-[10px] text-gray-400 mt-1">۴. حالت احساسی</span>
                    </div>
                  </div>

                  {/* Row 3: Dashboard Greeting */}
                  <div className={`h-24 rounded-2xl flex flex-col items-center justify-center p-2 border border-gray-100 ${bgClasses}`}>
                    <prop.Greeting size={50} />
                    <span className="text-[10px] text-[#008080] font-bold mt-1">۵. خوشامدگویی در داشبورد</span>
                  </div>
                </div>
              ) : (
                <div className={`h-56 rounded-3xl flex items-center justify-center border border-gray-100 my-4 ${bgClasses}`}>
                  {activeViewTab === "silhouette" && <prop.Silhouette size={96} />}
                  {activeViewTab === "primary" && <prop.Primary size={96} />}
                  {activeViewTab === "small" && <prop.Small size={44} />}
                  {activeViewTab === "emotional" && <prop.Emotional size={96} />}
                  {activeViewTab === "dashboard" && <prop.Greeting size={96} />}
                </div>
              )}

              <p className="text-xs text-gray-600 leading-relaxed mb-4">
                {prop.conceptDescFa}
              </p>
            </div>

            {/* Rationale Footer */}
            <div className="pt-3 border-t border-gray-100">
              <span className="text-[11px] font-bold text-[#006666] block mb-1">
                دلیل طراحی و فلسفه کاراکتر:
              </span>
              <p className="text-[11px] text-gray-500 leading-normal">
                {prop.designRationaleFa}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Live Dashboard Mockup for the New Sprout Direction */}
      <div className="bg-[#F7F9FA] rounded-3xl border border-[#E2E7EA] p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E9EFF2]">
          <span className="text-xs font-bold text-[#006666] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#008080]" />
            پیش‌نمایش حضور «آوانی جوانه» در هدر داشبورد آوانا
          </span>
          <span className="text-[11px] text-gray-400 font-mono">
            IN-SITU PRODUCT PREVIEW
          </span>
        </div>

        {/* Dashboard Header */}
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#1A2226] tracking-tight flex items-center gap-2">
              <span>سلام علی</span>
              <AvaniSprout.Greeting size={38} className="inline-block align-middle" />
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

        {/* Course Card Preview */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-6 items-stretch">
          <div className="md:col-span-8 bg-white p-5 rounded-2xl border border-[#E2E7EA] shadow-xs flex flex-col justify-between">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#E0F2F2] text-[#006666] text-xs font-semibold">
                دوره فعال مطالعه
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[#1A2226] mt-2">
                فارماکولوژی بالینی: داروهای سیستم آدرنرژیک
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                مکانیسم اثر گیرنده‌های آلفا و بتا، ایندیکاسیون‌های بالینی شوک و داروهای مهارکننده.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>درس ۵ از ۱۲ • ۷۵٪ تکمیل</span>
              <span className="text-[#008080] font-bold">ادامه مطالعه ←</span>
            </div>
          </div>

          <div className="md:col-span-4 bg-white p-5 rounded-2xl border border-[#E2E7EA] shadow-xs flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-[#1A2226]">۴ ساعت و ۲۰ دقیقه</span>
            <span className="text-xs text-gray-500 mt-1">زمان مطالعه این هفته</span>
            <div className="mt-3 px-3 py-1 rounded-full bg-[#E4F4EC] text-[#2A624B] text-[11px] font-bold">
              ✓ ۱۵٪ رشد نسبت به هفته گذشته
            </div>
          </div>
        </div>
      </div>

      {/* 5. Pure Minimal Vector Sample (Designed from Scratch) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2E7EA] shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold mb-1">
              <span>مرحله چهارم: بررسی مینیمالیسم ناب</span>
            </div>
            <h3 className="text-lg font-black text-[#1A2226]">
              نمونه استیکر Minimal Vector طراحی‌شده کاملاً از نو (Clean-Sheet)
            </h3>
            <p className="text-xs text-gray-500">
              طراحی مستقل و بدون اشتقاق از طرح‌های قبلی؛ فقط عناصر ساختاری ضروری با وضوح ۱۰۰٪ در ابعاد ریز.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Sample 1: Pure Minimal Hand */}
          <div className="p-5 rounded-2xl bg-[#F7F9FA] border border-[#E2E7EA] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#008080]">دست مینیمال خالص (Pure Minimal Hand)</span>
              <span className="text-[10px] text-gray-400 font-mono">16px - 64px</span>
            </div>

            <div className="h-32 rounded-xl bg-white flex items-center justify-around p-3 border border-gray-200">
              <div className="flex flex-col items-center gap-1">
                <PureMinimalHand size={64} />
                <span className="text-[10px] text-gray-400">64px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalHand size={40} />
                <span className="text-[10px] text-gray-400">40px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalHand size={28} />
                <span className="text-[10px] text-[#008080] font-bold">28px (UI)</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalHand size={20} />
                <span className="text-[10px] text-gray-400">20px</span>
              </div>
            </div>

            <ul className="text-[11px] text-gray-600 space-y-1">
              <li>• صفر گرادیان، صفر سایه و بدون دایره زمینه مزاحم.</li>
              <li>• ریتم ۴ انگشت هندسی و انگشت شست با فضای منفی خالص.</li>
              <li>• استفاده انحصاری از دو رنگ: فیروزه‌ای (#008080) و عاجی (#F0E6D2).</li>
            </ul>
          </div>

          {/* Sample 2: Pure Minimal Book */}
          <div className="p-5 rounded-2xl bg-[#F7F9FA] border border-[#E2E7EA] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#008080]">کتاب مینیمال خالص (Pure Minimal Book)</span>
              <span className="text-[10px] text-gray-400 font-mono">16px - 64px</span>
            </div>

            <div className="h-32 rounded-xl bg-white flex items-center justify-around p-3 border border-gray-200">
              <div className="flex flex-col items-center gap-1">
                <PureMinimalBook size={64} />
                <span className="text-[10px] text-gray-400">64px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalBook size={40} />
                <span className="text-[10px] text-gray-400">40px</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalBook size={28} />
                <span className="text-[10px] text-[#008080] font-bold">28px (UI)</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <PureMinimalBook size={20} />
                <span className="text-[10px] text-gray-400">20px</span>
              </div>
            </div>

            <ul className="text-[11px] text-gray-600 space-y-1">
              <li>• حذف کامل خطوط تقلبی متن و جزئیات تزیینی.</li>
              <li>• انحنای نمادین هندسی کتاب با خط عطف میانی.</li>
              <li>• وضوح و خوانایی کامل حتی در ابعاد ۱۶ و ۲۰ پیکسل.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
