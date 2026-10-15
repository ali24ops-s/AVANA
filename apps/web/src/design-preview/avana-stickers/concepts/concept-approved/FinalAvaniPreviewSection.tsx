import React, { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  Layers,
  Eye,
  Sliders,
  ShieldCheck,
  Info,
  BookOpen,
  HelpCircle,
  Trophy,
  Lightbulb,
  Cpu,
  Inbox,
  Hand,
  MessageSquare,
  MousePointer2,
  PartyPopper,
  AlertCircle,
  ThumbsUp,
  Glasses,
  Presentation,
  Moon,
} from "lucide-react";
import { AvaniAvatar, type AvaniVariant } from "../../../../components/brand/AvaniAvatar.js";

type BgMode = "white" | "light" | "dark" | "checker";

interface AvaniPoseInfo {
  variant: AvaniVariant;
  nameFa: string;
  nameEn: string;
  icon: React.ComponentType<{ className?: string }>;
  descriptionFa: string;
  usageFa: string;
}

const AVANI_ALL_POSES: AvaniPoseInfo[] = [
  {
    variant: "default",
    nameFa: "۱. حالت عادی (Default)",
    nameEn: "Neutral Standing",
    icon: ShieldCheck,
    descriptionFa:
      "نمای تمام‌قد متین روبرو با دست‌های در طرفین، فرم دو مثلث متداخل A و V با لبه‌های نرم و صورت عاجی با لبخند آرامش‌بخش.",
    usageFa: "تصویر اصلی برند، معرفی پلتفرم، کارت‌های راهنما و پروفایل.",
  },
  {
    variant: "wave",
    nameFa: "۲. خوشامدگویی (Wave)",
    nameEn: "Greeting Wave",
    icon: Hand,
    descriptionFa:
      "دست برافراشته در حال سلام دادن همراه با اکسنت نارنجی-مرجانی یقه و امواج ملایم انرژی. ژست صمیمی برای استقبال از دانشجو.",
    usageFa: "جایگزین مستقیم ایموجی 👋 در هدر داشبورد («سلام علی»)، پیام‌های خوشامدگویی و شروع آزمون.",
  },
  {
    variant: "learning",
    nameFa: "۳. مطالعه و یادگیری (Learning)",
    nameEn: "Focused Study",
    icon: BookOpen,
    descriptionFa:
      "در دست داشتن کتاب هندسی باز با زاویه ۱۲۰ درجه (مشتق از V آوانا)، نگاه متمرکز به درس و نشانک روبان مرجانی.",
    usageFa: "کنار دوره‌های فعال، یادآوری مرور روزانه، صفحه درس‌نامه و کارت‌های فلش‌کارت.",
  },
  {
    variant: "thinking",
    nameFa: "۴. تحلیل و تفکر (Thinking)",
    nameEn: "Deep Contemplation",
    icon: HelpCircle,
    descriptionFa:
      "دست قرارگرفته زیر چانه، نگاه متوجه بالا و راست همراه با سه حباب ایده فیروزه‌ای شناور.",
    usageFa: "بخش پرسش و پاسخ، حل تمرین‌های تشخیصی پزشکی، سوالات هوش مصنوعی و رفع اشکال.",
  },
  {
    variant: "success",
    nameFa: "۵. موفقیت و پیروزی (Success)",
    nameEn: "Victory & Triumph",
    icon: Trophy,
    descriptionFa:
      "هر دو دست بالا رفته در حالت پیروزی (V-Shape)، چشمان هلالی شاد و ستاره درخشان طلایی در بالای سر.",
    usageFa: "اتمام موفق ماژول آموزشی، ثبت نمره عالی در کوئیز، تکمیل هدف روزانه و تبریک قبولی.",
  },
  {
    variant: "idea",
    nameFa: "۶. ایده و کشف (Idea)",
    nameEn: "Insight & Discovery",
    icon: Lightbulb,
    descriptionFa:
      "اشاره انگشت به سمت لامپ مینیمال و پرتوهای نور طلایی؛ انتقال حس دستیابی به نکته کلیدی بالینی.",
    usageFa: "نکات طلایی کنکوری/پزشکی (High-Yield Pearls)، ترفندهای حل تست و راهکارهای استاد.",
  },
  {
    variant: "processing",
    nameFa: "۷. پردازش و فعالیت (Processing)",
    nameEn: "Busy / Loading",
    icon: Cpu,
    descriptionFa:
      "چشمان متمرکز بر عملکرد، دست‌های هماهنگ کاری همراه با حلقه مداری ظریف CSS با چرخش نرم و بی‌صدا.",
    usageFa: "تولید آزمون با هوش مصنوعی، بارگذاری خلاصه فصول، ذخیره پاسخنامه و تحلیل عملکرد.",
  },
  {
    variant: "empty",
    nameFa: "۸. حالت خالی و آرامش (Empty)",
    nameEn: "Peaceful / Clean Slate",
    icon: Inbox,
    descriptionFa:
      "ژست آرام با دست‌های جمع‌شده در سینه، چشمان آرامش‌بخش زن و خط افق ملایم بدون المان‌های شلوغ.",
    usageFa: "وضعیت خالی (Empty State) کتابخانه دوره‌ها، بدون آزمون جدید، و صفحاتی که هنوز داده ندارند.",
  },
  {
    variant: "explaining",
    nameFa: "۹. توضیح و آموزش (Explaining)",
    nameEn: "Explaining / Tutoring",
    icon: MessageSquare,
    descriptionFa:
      "ژست معلمی پویا؛ دست راست باز به نشانه توضیح مفهوم و دست چپ نگهدارنده، همراه با حباب گفتگوی آموزشی ظریف.",
    usageFa: "باکس‌های توضیح پاسخ تست‌ها، بخش تیچر/مدرس هوشمند، معرفی قابلیت‌های جدید و آنبوردینگ.",
  },
  {
    variant: "pointing",
    nameFa: "۱۰. اشاره و راهنمایی (Pointing)",
    nameEn: "Direction / CTA Guide",
    icon: MousePointer2,
    descriptionFa:
      "دست کشیده به سمت چپ (جهت مطالعه در فارسی و دکمه‌های CTA) با نگاه مستقیم همراه با پالس هدایت بصری.",
    usageFa: "جلب توجه به دکمه‌های اقدام کلیدی (شروع آزمون، ثبت‌نام، پرداخت)، راهنمای تور تعاملی پلتفرم.",
  },
  {
    variant: "celebrating",
    nameFa: "۱۱. جشن و فستیوال (Celebrating)",
    nameEn: "Festive Celebration",
    icon: PartyPopper,
    descriptionFa:
      "شور و هیجان مضاعف؛ دست‌های باز در هوا به همراه کاغذهای رنگی (کانفتی) فیروزه‌ای و مرجانی شناور در فضا.",
    usageFa: "سال نو، ارتقای سطح کاربری، پایان ترم، کسب نشان طلایی مهارت و کمپین‌های تخفیف و مناسبتی.",
  },
  {
    variant: "confused",
    nameFa: "۱۲. ابهام و سوال (Confused)",
    nameEn: "Puzzled / Query",
    icon: AlertCircle,
    descriptionFa:
      "سر کمی متمایل، ابروهای ناهمگون ملایم، دست به سر یا شانه بالا انداخته همراه با علامت سوال ظریف بالای سر.",
    usageFa: "پاسخ نادرست به سوال، صفحه ۴۰۴ خطای یافت نشد، بن‌بست جستجو و نیاز به تکرار مجدد تمرین.",
  },
  {
    variant: "encouraging",
    nameFa: "۱۳. انگیزه و لایک (Encouraging)",
    nameEn: "Thumbs Up / Motivation",
    icon: ThumbsUp,
    descriptionFa:
      "ژست مثبت با شست بالا رفته (Thumbs Up)، نگاه دلگرم‌کننده و درخشش انرژی صمیمی برای حفظ روحیه دانشجو.",
    usageFa: "پس از نمره متوسط («ادامه بده، نزدیک شدی!»)، تقویت روحیه بعد از آزمون سخت، یادآوری استمرار.",
  },
  {
    variant: "reading",
    nameFa: "۱۴. مطالعه تخصصی (Reading)",
    nameEn: "Scholarly Study / Glasses",
    icon: Glasses,
    descriptionFa:
      "عینک فیروزه‌ای خوش‌فرم و ظریف روی چهره عاجی، تمرکز عمیق روی جزوه یا سند پزشکی و استایل پژوهشگر.",
    usageFa: "بخش مقالات رفرنس، کیس‌های بالینی پیشرفته، دستورالعمل‌های درمانی و رفرنس‌های آپتودیت.",
  },
  {
    variant: "presenting",
    nameFa: "۱۵. ارائه و وبینار (Presenting)",
    nameEn: "Keynote / Webinar",
    icon: Presentation,
    descriptionFa:
      "حالت سخنران با دست اشاره به تخته یا مانیتور داده‌ها با نمودار رشد صعودی آوانا در پس‌زمینه.",
    usageFa: "کلاس‌های آنلاین زنده، وبینارهای تخصصی، گزارش‌های آماری جامع و اسلایدهای پرزنتیشن اساتید.",
  },
  {
    variant: "sleeping",
    nameFa: "۱۶. استراحت و شب (Sleeping)",
    nameEn: "Rest / Night Mode",
    icon: Moon,
    descriptionFa:
      "چشمان بسته خواب‌آلود با آرامش عمیق، هلال ماه فیروزه‌ای و حروف شناور Zzz، آماده تجدید قوای شبانه.",
    usageFa: "حالت تعمیرات دوره‌ای سرور، یادآوری خواب کافی به دانشجویان کنکور و ساعات آفلاین پشتیبانی.",
  },
];

export const FinalAvaniPreviewSection: React.FC = () => {
  const [bgMode, setBgMode] = useState<BgMode>("white");
  const [activeScale, setActiveScale] = useState<number>(34);

  const bgClasses: Record<BgMode, string> = {
    white: "bg-white text-gray-900 border border-gray-200",
    light: "bg-[#F3F4F6] text-gray-900 border border-gray-200",
    dark: "bg-[#1A2226] text-white border border-gray-700",
    checker:
      "text-gray-900 border border-gray-300 bg-[linear-gradient(45deg,#f0f0f0_25%,transparent_25%),linear-gradient(-45deg,#f0f0f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f0f0f0_75%),linear-gradient(-45deg,transparent_75%,#f0f0f0_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]",
  };

  const SIZES = [
    { px: 16, label: "۱۶px", note: "تست فنی مقیاس ریز؛ سیلوئت دو مثلث بدون خطای رندرینگ شفاف است." },
    { px: 24, label: "۲۴px", note: "مقیاس هدر فشرده موبایل و بج‌های اعلان." },
    { px: 32, label: "۳۲px", note: "سایز استاندارد المان‌های سایدبار و نوار وضعیت." },
    { px: 34, label: "۳۴px", note: "سایز منتخب هدر داشبورد آوانا (هماهنگ با ارتفاع متن تیتر)." },
    { px: 48, label: "۴۸px", note: "کارت‌های راهنما، بنرهای یادگیری و دیالوگ‌ها." },
    { px: 64, label: "۶۴px", note: "استیکر برجسته کارت‌های نتیجه و گزارش هفتگی." },
    { px: 128, label: "۱۲۸px", note: "صفحات فرود، معرفی قابلیت‌ها و وضعیت‌های خالی بزرگ." },
  ];

  return (
    <div className="space-y-8" dir="rtl">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-3xl border border-[#E2E7EA] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E0F2F2] text-[#006666] text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#008080]" />
              <span>سیستم جامع وکتور ۱۶ حالته (Pure Vector SVG — 16 Poses)</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-black text-[#1A2226]">
              سیستم جامع شخصیت «آوانی» (Avani Character System)
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 max-w-2xl leading-relaxed">
              شخصیت آوانی از نو به شکل برداری (SVG واقعی و بدون وابستگی به تصویر پیکسلی برش‌خورده) پیاده‌سازی و در قالب یک سیستم جامع ۱۶ حالته تکمیل شد. هندسه اصیل دو مثلث متداخل A و V، اتصال طبیعی و پایین دست‌ها، پالت فیروزه‌ای اختصاصی آوانا و چهره دوست‌داشتنی عاجی در تمام ژست‌ها رعایت شده است.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#F7F9FA] p-3 rounded-2xl border border-[#E2E7EA] shrink-0">
            <AvaniAvatar variant="wave" size={48} />
            <div className="text-xs">
              <div className="font-extrabold text-[#1A2226]">نوع دارایی:</div>
              <div className="text-[#008080] font-semibold">وکتور خالص (SVG) + بسته PNG بازاریابی</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Background Controls */}
      <div className="bg-white rounded-2xl border border-[#E2E7EA] p-4 flex items-center justify-between flex-wrap gap-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#008080]" />
          <span className="text-xs font-bold text-gray-700">تغییر پس‌زمینه ارزیابی شفافیت:</span>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setBgMode("white")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              bgMode === "white" ? "bg-white text-[#008080] shadow-xs" : "text-gray-600"
            }`}
          >
            سفید خالص
          </button>
          <button
            type="button"
            onClick={() => setBgMode("light")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              bgMode === "light" ? "bg-white text-[#008080] shadow-xs" : "text-gray-600"
            }`}
          >
            خاکستری روشن
          </button>
          <button
            type="button"
            onClick={() => setBgMode("dark")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              bgMode === "dark" ? "bg-white text-[#008080] shadow-xs" : "text-gray-600"
            }`}
          >
            تیره (Dark Mode)
          </button>
          <button
            type="button"
            onClick={() => setBgMode("checker")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              bgMode === "checker" ? "bg-white text-[#008080] shadow-xs" : "text-gray-600"
            }`}
          >
            شطرنجی (Transparency Grid)
          </button>
        </div>
      </div>

      {/* 3. 16-Pose Character Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-extrabold text-[#1A2226] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#008080]" />
            <span>مجموعه کامل ۱۶ حالته شخصیت آوانی (یک کاراکتر واحد، ۱۶ ژست کاربردی)</span>
          </h3>
          <span className="text-xs text-gray-400">تمام حالت‌ها با پس‌زمینه شفاف و بدون متن</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {AVANI_ALL_POSES.map((pose) => {
            const Icon = pose.icon;
            return (
              <div
                key={pose.variant}
                className="bg-white rounded-3xl border border-[#E2E7EA] p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-4 h-4 text-[#008080]" />
                      <h4 className="text-xs font-extrabold text-[#1A2226]">{pose.nameFa}</h4>
                    </div>
                    <code className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded dir-ltr font-mono">
                      {pose.variant}
                    </code>
                  </div>

                  {/* Visual Render Canvas */}
                  <div
                    className={`rounded-2xl p-6 mt-3 flex items-center justify-center transition-colors min-h-[140px] ${bgClasses[bgMode]}`}
                  >
                    <AvaniAvatar
                      variant={pose.variant}
                      size={96}
                      alt={pose.nameFa}
                      asInlineSvg={true}
                    />
                  </div>

                  <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
                    {pose.descriptionFa}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <div className="text-[10px] text-gray-400 font-medium">محل استفاده در محصول:</div>
                  <div className="text-[11px] text-[#008080] font-semibold mt-0.5">
                    {pose.usageFa}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Multi-Scale Matrix Table */}
      <div className="bg-white rounded-3xl border border-[#E2E7EA] p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-extrabold text-[#1A2226] flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#008080]" />
            <span>مقایسه ابعاد در رابط کاربری (Multi-Scale Matrix)</span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            بررسی وضوح برداری از ۱۶px تا ۱۲۸px بدون افت کیفیت یا ایجاد نویز پیکسلی
          </p>
        </div>

        <div className={`rounded-2xl p-5 overflow-x-auto ${bgClasses[bgMode]}`}>
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-gray-200/50 text-gray-500">
                <th className="pb-3 px-3">اندازه</th>
                <th className="pb-3 px-3">Wave (داشبورد)</th>
                <th className="pb-3 px-3">Default (عادی)</th>
                <th className="pb-3 px-3">Learning (مطالعه)</th>
                <th className="pb-3 px-3">Success (موفقیت)</th>
                <th className="pb-3 px-3">توضیح کارشناسی وضوح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/30">
              {SIZES.map((s) => (
                <tr key={s.px} className="hover:bg-black/5 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-gray-700">{s.label}</td>
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center justify-center p-1.5 rounded-xl bg-black/5">
                      <AvaniAvatar variant="wave" size={s.px} asInlineSvg={true} />
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center justify-center p-1.5 rounded-xl bg-black/5">
                      <AvaniAvatar variant="default" size={s.px} asInlineSvg={true} />
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center justify-center p-1.5 rounded-xl bg-black/5">
                      <AvaniAvatar variant="learning" size={s.px} asInlineSvg={true} />
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center justify-center p-1.5 rounded-xl bg-black/5">
                      <AvaniAvatar variant="success" size={s.px} asInlineSvg={true} />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-gray-500">
                    <div className="flex items-center gap-2">
                      {s.px === 34 ? (
                        <span className="inline-flex items-center gap-1 text-[#008080] bg-[#E0F2F2] px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اندازه استاندارد داشبورد؛ وضوح چهره و لبخند کاملاً متناسب با خط تیتر</span>
                        </span>
                      ) : (
                        <span>{s.note}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Live In-Situ Dashboard Preview */}
      <div className="bg-white rounded-3xl border border-[#E2E7EA] p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E0F2F2] text-[#006666]">
            تست زنده در رابط کاربری واقعی
          </span>
          <h3 className="text-base sm:text-lg font-black text-[#1A2226] mt-2">
            هدر داشبورد آوانا با نسخه برداری آوانی
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            جایگزینی دقیق ایموجی 👋 با کاراکتر برداری خالص آوانی در اندازه ۳۴ پیکسل
          </p>
        </div>

        {/* Mock Dashboard Header */}
        <div className="bg-[#F7F9FA] p-6 rounded-2xl border border-[#E2E7EA] space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#1A2226] tracking-tight flex items-center gap-2">
              <span>سلام علی</span>
              <AvaniAvatar variant="wave" size={34} alt="آوانی" />
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
      </div>
    </div>
  );
};
