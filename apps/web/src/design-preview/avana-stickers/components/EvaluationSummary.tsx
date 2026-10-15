import React from "react";
import { CheckCircle2, AlertCircle, Sparkles, Trophy, Lightbulb, Compass } from "lucide-react";

export const EvaluationSummary: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* 1. Comparison Matrix Table */}
      <div className="bg-white rounded-2xl border border-[#E2E7EA] p-6 shadow-xs overflow-x-auto">
        <h3 className="text-base font-extrabold text-[#1A2226] mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#008080]" />
          <span>ماتریس مقایسه تحلیلی سه کانسپت استیکر آوانا</span>
        </h3>

        <table className="w-full text-right text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-[#F8FAFB]">
              <th className="py-3 px-4 font-bold text-gray-700">معیار ارزیابی</th>
              <th className="py-3 px-4 font-bold text-[#006666] bg-[#F0FAFA]">
                کانسپت A: Minimal Vector
              </th>
              <th className="py-3 px-4 font-bold text-[#2B6D8F] bg-[#F4F9FD]">
                کانسپت B: Soft 3D
              </th>
              <th className="py-3 px-4 font-bold text-[#8F5E27] bg-[#FDF8F0]">
                کانسپت C: Avani Character
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Row 1: Brand Identity */}
            <tr>
              <td className="py-3.5 px-4 font-bold text-gray-800">
                هویت برند و تمایز انحصاری
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F0FAFA]/40">
                <span className="font-semibold text-emerald-700">خوب (★★★☆☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  پالت رنگی کاملاً هماهنگ با آوانا، اما سبک وکتور ممکن است به سایر محصولات مینیمال شبیه باشد.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F4F9FD]/40">
                <span className="font-semibold text-blue-700">بسیار خوب (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  حس لوکس، مدرن و جذاب؛ تفاوت چشمگیر با ایموجی‌های پیش‌فرض و ایجاد جلوه بصری متمایز.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#FDF8F0]/40">
                <span className="font-semibold text-amber-700">فوق‌العاده (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  انحصاری‌ترین دارایی برند؛ ساخت یک مسکات الهام‌گرفته از آوانا که هیچ رقیبی نمی‌تواند کپی کند.
                </p>
              </td>
            </tr>

            {/* Row 2: Small size legibility */}
            <tr>
              <td className="py-3.5 px-4 font-bold text-gray-800">
                خوانایی در اندازه کوچک (۲۴-۳۲px)
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F0FAFA]/40">
                <span className="font-semibold text-emerald-700">بی‌نقص (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  خطوط ضخیم و بدون سایه؛ در کوچک‌ترین اندازه‌ها بدون کوچک‌ترین محو شدگی خواناست.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F4F9FD]/40">
                <span className="font-semibold text-blue-700">خوب (★★★☆☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  فرم کلی خواناست، اما در اندازه کمتر از ۲۴ پیکسل سایه‌های ظریف و گرادیان‌ها ادغام می‌شوند.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#FDF8F0]/40">
                <span className="font-semibold text-amber-700">خیلی خوب (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  عینک و فرم طاقی آوانی سیلوئت مشخصی دارد که در اندازه هدر داشبورد (۳۲px) کاملاً واضح است.
                </p>
              </td>
            </tr>

            {/* Row 3: UI Harmony */}
            <tr>
              <td className="py-3.5 px-4 font-bold text-gray-800">
                سازگاری با رابط کاربری داشبورد فعلی
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F0FAFA]/40">
                <span className="font-semibold text-emerald-700">طبیعی و یکدست (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  بهترین انطباق ارگانیک با آیکون‌های خطی Lucide و طراحی کارت‌های مینیمال فعلی آوانا.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F4F9FD]/40">
                <span className="font-semibold text-blue-700">برجسته و جذاب (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  به عنوان یک نقطه کانونی (Focus Point) زنده عمل می‌کند و به داشبورد روح تازه می‌بخشد.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#FDF8F0]/40">
                <span className="font-semibold text-amber-700">صمیمی و کاراکترمحور (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  داشبورد را از یک سامانه اداری به یک همراه هوشمند آموزش شخصی‌سازی‌شده تبدیل می‌کند.
                </p>
              </td>
            </tr>

            {/* Row 4: Academic Tone */}
            <tr>
              <td className="py-3.5 px-4 font-bold text-gray-800">
                تناسب با لحن دانشگاهی علوم پزشکی
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F0FAFA]/40">
                <span className="font-semibold text-emerald-700">بسیار متین (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  لحن کاملاً علمی، رسمی و غیرفانتزی؛ ایده‌آل برای مقاطع ارشد، دستیاری و تخصص.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F4F9FD]/40">
                <span className="font-semibold text-blue-700">مدرن و حرفه‌ای (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  شبیه استیکرهای باکیفیت پلتفرم‌های تراز اول فناوری (بدون لودگی کارتونی).
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#FDF8F0]/40">
                <span className="font-semibold text-amber-700">پژوهشگرانه و همراه (★★★★☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  عینک مطالعه و نگاه متفکر آوانی جلوی حس بچه‌گانه را می‌گیرد و حس منتور هوشمند ایجاد می‌کند.
                </p>
              </td>
            </tr>

            {/* Row 5: Scalability to 50+ stickers */}
            <tr>
              <td className="py-3.5 px-4 font-bold text-gray-800">
                قابلیت توسعه به پک کامل (۵۰+ استیکر)
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F0FAFA]/40">
                <span className="font-semibold text-emerald-700">بسیار آسان (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  سیستم وکتور دوبعدی به سرعت برای هر مفهوم پزشکی جدید (قلب، دارو، سلول) قابل گسترش است.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#F4F9FD]/40">
                <span className="font-semibold text-blue-700">متوسط (★★★☆☆)</span>
                <p className="text-xs text-gray-500 mt-1">
                  تولید مدل‌های سه‌بعدی نرم نیازمند رندر دقیق نور و متریال در ابزارهای سه‌بعدی است.
                </p>
              </td>
              <td className="py-3.5 px-4 text-gray-600 bg-[#FDF8F0]/40">
                <span className="font-semibold text-amber-700">روایت‌پذیر و غنی (★★★★★)</span>
                <p className="text-xs text-gray-500 mt-1">
                  آوانی را می‌توان در صدها ژست مختلف (خواب‌آلود، امتحان، قهوه، مطالعه شبانه) بازآفرینی کرد.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2. Architectural Recommendation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recommendation for Concept A */}
        <div className="bg-white p-5 rounded-2xl border border-[#E0F2F2] shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#006666]">
              <Compass className="w-5 h-5" />
              <h4 className="font-bold text-sm">چه زمانی کانسپت A را انتخاب کنیم؟</h4>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              اگر هدف پلتفرم حفظ یکپارچگی ۱۰۰٪ با آیکون‌های متنی، سادگی بی‌تکلف، تمرکز کامل روی محتوای سنگین پزشکی و حداقل جلب توجه تزئینی باشد، کانسپت A امن‌ترین و استانداردترین انتخاب مهندسی است.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>پیشنهاد برای: تجربه کاربری فوق‌سریع و علمی مینیمال</span>
          </div>
        </div>

        {/* Recommendation for Concept B */}
        <div className="bg-white p-5 rounded-2xl border border-[#E8F4FB] shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#2B6D8F]">
              <Sparkles className="w-5 h-5" />
              <h4 className="font-bold text-sm">چه زمانی کانسپت B را انتخاب کنیم؟</h4>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              اگر می‌خواهید آوانا ظاهری مدرن شبیه برنامه‌های برتر بین‌المللی داشته باشد و استیکرها به عنوان عناصر پاداش، پیشرفت و جذابیت در صفحات تبریک و داشبورد خودنمایی کنند، کانسپت B انتخاب ایده‌آل است.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-blue-800 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>پیشنهاد برای: افزایش جذابیت حسی و جلوه بصری لوکس</span>
          </div>
        </div>

        {/* Recommendation for Concept C */}
        <div className="bg-white p-5 rounded-2xl border border-[#FDF2E4] shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#8F5E27]">
              <Lightbulb className="w-5 h-5" />
              <h4 className="font-bold text-sm">چه زمانی کانسپت C را انتخاب کنیم؟</h4>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              اگر به دنبال خلق یک «برند ماندگار» هستید تا آوانا فراتر از یک سامانه، یک همیار و راهنمای تحصیلی شناخته شود و در شبکه‌های اجتماعی، کمپین‌ها و انیمیشن‌ها شخصیت منحصر‌به‌فرد داشته باشد، آوانی بهترین سرمایه‌گذاری است.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-amber-800 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>پیشنهاد برای: ساخت ارزش ویژه برند (Brand Equity)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
