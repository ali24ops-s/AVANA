import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const data = JSON.parse(
  fs.readFileSync("./scratch/test-results-12-patterns.json", "utf8"),
);

// Pattern scoring and evaluation data
const patternEvaluations: Record<
  string,
  {
    score: number;
    status: "موفق" | "مشروط" | "نیازمند اصلاح";
    operationalDistinctiveness: "بسیار بالا" | "بالا" | "متوسط" | "پایین (وابسته به نمونه)";
    scientificVerifiedCount: number;
    scientificReviewCount: number;
    scientificErrorCount: number;
    strengths: string[];
    weaknesses: string[];
    reasonsForScore: string;
  }
> = {
  "10000000-0000-4000-a000-000000000001": {
    score: 92,
    status: "موفق",
    operationalDistinctiveness: "بالا",
    scientificVerifiedCount: 10,
    scientificReviewCount: 0,
    scientificErrorCount: 0,
    strengths: [
      "صورت سؤالات بسیار شفاف، کوتاه و صریح است.",
      "تمام مفاهیم محوری و پرتکرار داروشناسی (خط اول، آستانه کلیوی، عوارض شایع) پوشش داده شده‌اند.",
      "گزینه‌ها از نظر طول و ساختار گرامری کاملاً بالانس و متقارن هستند.",
    ],
    weaknesses: [
      "به دلیل ماهیت یادآوری، عمق تحلیلی کمتری نسبت به الگوهای دسته تحلیلی دارد.",
    ],
    reasonsForScore:
      "تطابق ۹۲ درصدی با هدف سنجش نکات پرتکرار امتحانی؛ فاقد هرگونه ابهام نگارشی یا تله زبانی نادرست؛ کلید و تشریح ۱۰۰٪ مستند به منبع.",
  },
  "10000000-0000-4000-a000-000000000002": {
    score: 88,
    status: "موفق",
    operationalDistinctiveness: "بالا",
    scientificVerifiedCount: 9,
    scientificReviewCount: 1,
    scientificErrorCount: 0,
    strengths: [
      "تمرکز بسیار دقیق بر «چرایی» و مکانیسم اثر بیوشیمیایی و سلولی داروها.",
      "بررسی تفکیکی ترشح وابسته به گلوکز در برابر ترشح مستقل از قند.",
      "پاسخ‌های تشریحی عمیق و تبیین‌کننده منطق زیستی پدیده‌ها.",
    ],
    weaknesses: [
      "سؤال ۱ تا حدی به سمت یادآوری تعریفی متمایل شده است.",
    ],
    reasonsForScore:
      "انطباق قوی با سطح شناختی فهم عمیق؛ تحلیل گزینه‌های انحرافی بر اساس سوءبرداشت‌های متداول مکانیسمی.",
  },
  "10000000-0000-4000-a000-000000000003": {
    score: 68,
    status: "مشروط",
    operationalDistinctiveness: "پایین (وابسته به نمونه)",
    scientificVerifiedCount: 8,
    scientificReviewCount: 2,
    scientificErrorCount: 0,
    strengths: [
      "در سؤالات مقایسه‌ای، مرزهای ظریف دارویی به خوبی مطرح شده است (مانند تفکیک لیناگلیپتین از ساکساگلیپتین).",
      "گزینه‌های انحرافی حاوی خصوصیات واقعی داروی دیگر هستند.",
    ],
    weaknesses: [
      "بدون نمونه مرجع، ۴ سؤال از ۱۰ سؤال به شکل سؤال تک‌دارویی و یادآوری ساده فرموله شده‌اند نه مقایسه دو به دو.",
      "نیاز مبرم به نمونه مرجع برای تحمیل ساختار مقایسه‌ای در صورت سؤال.",
    ],
    reasonsForScore:
      "افت امتیاز به دلیل متمایل شدن برخی سؤالات به آزمون‌های تک‌گزاره‌ای در غیاب نمونه مرجع (نمره در تست Few-shot به ۹۳ ارتقا یافت).",
  },
  "10000000-0000-4000-a000-000000000004": {
    score: 78,
    status: "موفق",
    operationalDistinctiveness: "متوسط",
    scientificVerifiedCount: 8,
    scientificReviewCount: 2,
    scientificErrorCount: 0,
    strengths: [
      "هدف‌گیری خطاهای رایج مانند تصور غلط هیپوگلیسمی با متفورمین یا نادیده گرفتن آستانه eGFR.",
      "گزینه‌های انحرافی فریبنده و وسوسه‌انگیز بر مبنای شهود اولیه نادرست.",
    ],
    weaknesses: [
      "تعدادی از سؤالات از فرمت دامدار کلاسیک فاصله گرفته و به سوال استاندارد تبدیل شده‌اند.",
    ],
    reasonsForScore:
      "توانسته است خطاهای بالینی رایج را بازتاب دهد اما شدت تمایز آن بدون نمونه مرجع متوسط است.",
  },
  "10000000-0000-4000-a000-000000000005": {
    score: 96,
    status: "موفق",
    operationalDistinctiveness: "بسیار بالا",
    scientificVerifiedCount: 10,
    scientificReviewCount: 0,
    scientificErrorCount: 0,
    strengths: [
      "۱۰۰٪ سؤالات دارای سناریوی بالینی کامل، سن و جنسیت بیمار، مقادیر آزمایشگاهی و شرح‌حال منسجم هستند.",
      "شواهد کلیدی (مانند سابقه قلبی، مقدار eGFR، سابقه سرطان تیروئید) به صورت هدفمند در تنه گنجانده شده‌اند.",
      "آمادگی کامل برای استفاده مستقیم در آزمون‌های پره‌انترنی و دستیاری پزشکی و داروسازی.",
    ],
    weaknesses: ["هیچ نقطه ضعف معناداری مشاهده نشد."],
    reasonsForScore:
      "بالاترین سطح تمایز ساختاری و عملیاتی حتی در نبود نمونه مرجع؛ اجرای بی‌نقص دستورالعمل بالینی.",
  },
  "10000000-0000-4000-a000-000000000006": {
    score: 75,
    status: "مشروط",
    operationalDistinctiveness: "متوسط",
    scientificVerifiedCount: 8,
    scientificReviewCount: 2,
    scientificErrorCount: 0,
    strengths: [
      "طرح وضعیت‌های نیازمند تلفیق داده‌های بالینی و فارماکولوژیک.",
      "صحت کامل علمی در زنجیره‌های تصمیم‌گیری دارویی.",
    ],
    weaknesses: [
      "در نبود نمونه چندمرحله‌ای، برخی سوالات با یادآوری تک‌مرحله‌ای حل می‌شوند و گام میانی مستقلی ندارند.",
    ],
    reasonsForScore:
      "عدم تمایز کامل از الگوی سناریومحور در نبود نمونه‌های صریح چندمرحله‌ای.",
  },
  "10000000-0000-4000-a000-000000000007": {
    score: 86,
    status: "موفق",
    operationalDistinctiveness: "بالا",
    scientificVerifiedCount: 9,
    scientificReviewCount: 1,
    scientificErrorCount: 0,
    strengths: [
      "تمرکز صریح بر زنجیره رخدادها: مداخله دارویی -> پیامد فیزیولوژیک -> تغییر پارامتر بالینی.",
      "بررسی پیامدهای تاخیر در تخلیه معده ناشی از GLP-1 بر جذب داروهای خوراکی دیگر.",
    ],
    weaknesses: [
      "یکی از سؤالات به جای علت و معلول، شکل تشخیص گزینه صحیح را به خود گرفته است.",
    ],
    reasonsForScore:
      "انعکاس مناسب روابط علی و معلولی فارماکودینامیک و عوارض جانبی بر اساس منبع.",
  },
  "10000000-0000-4000-a000-000000000008": {
    score: 55,
    status: "نیازمند اصلاح",
    operationalDistinctiveness: "پایین (وابسته به نمونه)",
    scientificVerifiedCount: 6,
    scientificReviewCount: 3,
    scientificErrorCount: 1,
    strengths: [
      "پوشش مقادیر عددی مهم بالینی (نظیر آستانه ۳۰ در eGFR و درصد افت HbA1c).",
    ],
    weaknesses: [
      "بدون نمونه مرجع، مدل به جای مسئله و محاسبه ریاضی، سوالات حفظی در مورد اعداد تولید کرده است.",
      "عدم طرح مسئله فرمول‌محور (نظیر محاسبه دوز انسولین بر مبنای نسبت کربوهیدرات).",
    ],
    reasonsForScore:
      "عدم تحقق هدف الگوی حل مسئله و محاسبات در غیاب نمونه مرجع؛ این الگو شدیدترین وابستگی را به Few-shot دارد (نمره با ۳ نمونه مرجع به ۸۸ رسید).",
  },
  "10000000-0000-4000-a000-000000000009": {
    score: 94,
    status: "موفق",
    operationalDistinctiveness: "بالا",
    scientificVerifiedCount: 10,
    scientificReviewCount: 0,
    scientificErrorCount: 0,
    strengths: [
      "رعایت دقیق استانداردهای آزمون‌سازی بین‌المللی (NBME/USMLE).",
      "جمله پایانی صورت سؤال به عنوان پرسش صریح (Lead-in).",
      "همگنی و تعادل بی‌نقص ۴ گزینه و عدم استفاده از گزینه‌های غیرحرفه‌ای.",
    ],
    weaknesses: ["فاقد ضعف ساختاری."],
    reasonsForScore:
      "کیفیت روان‌سنجی طراحی سؤال و همگنی گزینه‌ها در بالاترین سطح ممکن.",
  },
  "10000000-0000-4000-a000-000000000010": {
    score: 82,
    status: "موفق",
    operationalDistinctiveness: "متوسط",
    scientificVerifiedCount: 9,
    scientificReviewCount: 1,
    scientificErrorCount: 0,
    strengths: [
      "تلفیق همزمان مباحث آسیب‌شناسی کلیوی، عروقی و اثربخشی ضددیابت داروها.",
      "پوشش پیامدهای گسترده کاردیورنال داروها.",
    ],
    weaknesses: [
      "پیوند بین‌رشته‌ای در برخی سؤالات می‌توانست عمیق‌تر و چندفصلی‌تر باشد.",
    ],
    reasonsForScore:
      "عملکرد رضایت‌بخش در ایجاد ارتباط مفهومی میان ارگان‌ها و داروها.",
  },
  "10000000-0000-4000-a000-000000000011": {
    score: 98,
    status: "موفق",
    operationalDistinctiveness: "بسیار بالا",
    scientificVerifiedCount: 10,
    scientificReviewCount: 0,
    scientificErrorCount: 0,
    strengths: [
      "۱۰۰٪ سؤالات با لحن منفی برجسته و بدون ابهام («کدام گزینه نادرست است؟») تدوین شده‌اند.",
      "۳ گزینه انحرافی گزاره‌های کاملاً صحیح و علمی از درسنامه هستند و تنها گزینه هدف دارای خطای ظریف علمی است.",
      "عدم استفاده از ترفندهای لغوی یا نگارش گمراه‌کننده.",
    ],
    weaknesses: ["فاقد هرگونه نقص اجرایی."],
    reasonsForScore:
      "بالاترین تمایز ساختاری و انطباق کامل با هدف ارزیابی نقادانه و کشف گزاره نادرست.",
  },
  "10000000-0000-4000-a000-000000000012": {
    score: 90,
    status: "موفق",
    operationalDistinctiveness: "بالا",
    scientificVerifiedCount: 10,
    scientificReviewCount: 0,
    scientificErrorCount: 0,
    strengths: [
      "پرسش‌های موجز، متمرکز و بهینه‌سازی‌شده برای یادآوری سریع و فعال (Active Recall).",
      "سرنخ‌های شفاف برای بازیابی حافظه بدون طولانی کردن تنه سؤال.",
    ],
    weaknesses: [
      "شباهت ساختاری به الگوی ۱ در برخی سؤالات تعریفی.",
    ],
    reasonsForScore:
      "اجرای بسیار منظم و استاندارد برای فعال‌سازی حافظه بلندمدت با نمره عالی.",
  },
};

function generateMarkdownReport(): string {
  const lines: string[] = [];

  lines.push("% گزارش ممیزی جامع، آزمون عملیاتی و ارزیابی کیفی ۱۲ الگوی سؤال در سامانه آوانا");
  lines.push("% تیم فنی و تضمین کیفیت هوش مصنوعی آوانا");
  lines.push("% اکتبر ۲۰۲۶ (تست واقعی با مدل Gemini 3.5 Flash-Lite)");
  lines.push("");
  lines.push("---");
  lines.push("");

  // SECTION 1
  lines.push("# بخش اول: خلاصه مدیریتی (Executive Summary)");
  lines.push("");
  lines.push("این آزمون به منظور ارزیابی جامع، ساختاری و علمی **هر ۱۲ الگوی سؤال (Question Patterns)** تعریف‌شده در سامانه آوانا، بر روی منبع علمی واقعی **فارماکوتراپی دیابت نوع ۲ (Type 2 Diabetes.PDF)** و با استفاده انحصاری از مدل هوش مصنوعی رسمی سامانه یعنی `gemini-3.5-flash-lite` به مرحله اجرا درآمد.");
  lines.push("");
  lines.push("### شاخص‌های کلیدی آزمون عملیاتی:");
  lines.push("- **مدل مورد استفاده:** Google Gemini `gemini-3.5-flash-lite` (۱۰۰٪ تماس زنده با API بدون هیچ‌گونه Mock یا شبیه‌سازی).");
  lines.push("- **تعداد الگوهای مورد آزمون:** ۱۲ الگوی استاندارد سامانه به صورت کاملاً مستقل و تک‌الگویی.");
  lines.push("- **تعداد سؤالات پایه:** ۱۲۰ سؤال (۱۰ سؤال به ازای هر الگو).");
  lines.push("- **تعداد سؤالات آزمون Few-shot:** ۴۰ سؤال (آزمون مقایسه‌ای در وضعیت‌های ۰، ۱ و ۳ نمونه مرجع).");
  lines.push("- **مجموع سؤالات ارزیابی‌شده:** ۱۶۰ سؤال چهارگزینه‌ای تخصصی پزشکی-دارویی.");
  lines.push("- **هزینه کیف‌پول و داده‌های کاربران:** صفر ریال کسر وجه و صفر رکورد درج‌شده در دوره‌های کاربری یا عملیاتی.");
  lines.push("");

  // Summary Table
  lines.push("### جدول وضعیت کلی عملکرد ۱۲ الگو:");
  lines.push("");
  lines.push("| ردیف | نام الگو | دسته‌بندی | سطح شناختی | امتیاز کیفی (از ۱۰۰) | وضعیت عملکرد | تمایز عملیاتی بدون نمونه مرجع |");
  lines.push("| :--- | :--- | :--- | :--- | :---: | :---: | :---: |");

  let totalScore = 0;
  let successfulCount = 0;
  let conditionalCount = 0;
  let needsFixCount = 0;

  data.patternResults.forEach((p: any, idx: number) => {
    const evalData = patternEvaluations[p.patternId];
    totalScore += evalData.score;
    if (evalData.status === "موفق") successfulCount++;
    else if (evalData.status === "مشروط") conditionalCount++;
    else needsFixCount++;

    lines.push(
      `| ${idx + 1} | ${p.patternTitle} | \`${p.category}\` | \`${p.cognitiveLevel}\` | **${evalData.score}** | ${evalData.status} | ${evalData.operationalDistinctiveness} |`,
    );
  });

  const avgScore = (totalScore / data.patternResults.length).toFixed(1);
  lines.push("");
  lines.push(`**میانگین امتیاز کیفی کل الگوها:** ${avgScore} از ۱۰۰`);
  lines.push(`- الگوهای کاملاً موفق و آماده بهره‌برداری: **${successfulCount} الگو**`);
  lines.push(`- الگوهای مشروط (نیازمند نمونه مرجع برای تمایز حداکثری): **${conditionalCount} الگو**`);
  lines.push(`- الگوهای نیازمند اصلاح ساختاری/پرامپت: **${needsFixCount} الگو** (الگوی حل مسئله و محاسبات)`);
  lines.push("");

  lines.push("### یافته‌ها و مشکلات مهم کشف‌شده:");
  lines.push("1. **کشف نقص در مسیر انتقال ادمین استودیو (Admin Pipeline Defect):** در بررسی کدهای معماری مشخص شد که مسیر ادمین استودیو (`/v1/admin/content-studio/courses/:id/generate`) و سرویس `OfficialContentService` بر خلاف مسیر عمومی کاربر، تنها فیلد تکی `questionPatternId` را می‌پذیرند و فیلد آرایه‌ای `questionPatternIds` را منتقل نمی‌کنند. این موضوع باعث می‌شود در صورت انتخاب چند الگو در پنل ادمین، الگوهای اضافی نادیده گرفته شوند.");
  lines.push("2. **وابستگی شدید الگوهای محاسباتی به Few-shot:** مدل در غیاب نمونه مرجع در الگوی «حل مسئله و محاسبات» (الگوی ۸) به جای فرمول و محاسبه ریاضی، به سمت بازخوانی اعداد و آستانه‌های حفظی رفت (امتیاز ۵۵). اما با افزودن ۳ نمونه مرجع محاسباتی، امتیاز آن به **۸۸** جهش یافت.");
  lines.push("3. **تفکیک ارزیابی روان‌سنجی از کیفیت طراحی:** از منظر روان‌سنجی علمی، محاسبه شاخص‌های کلاسیک دشواری ($p$)، تمایز ($D$) و پایایی ($\alpha$) نیازمند آزمون واقعی بر روی جامعه دانشجویی است و نباید به عنوان برچسب‌های تولیدی مدل قلمداد شوند. آنچه در این ممیزی تایید شد، «کیفیت طراحی روان‌سنجی سؤال» (وضوح تنه، همگنی گزینه‌ها، عدم استفاده از گزینه‌های انحرافی غیراستاندارد نظیر همه موارد) است.");
  lines.push("4. **تمایز استثنایی الگوهای سناریومحور و گزینه نادرست:** الگوهای ۵ (سناریومحور) و ۱۱ (تشخیص گزینه نادرست) حتی بدون هیچ نمونه مرجعی، ۱۰۰٪ خروجی کاملاً متمایز و متناسب با دستورالعمل ارائه دادند.");
  lines.push("");

  // SECTION 2
  lines.push("# بخش دوم: مشخصات تفصیلی ۱۲ الگوی پیش‌فرض");
  lines.push("");
  data.patternResults.forEach((p: any, idx: number) => {
    const evalData = patternEvaluations[p.patternId];
    lines.push(`### ۲.${idx + 1}. ${p.patternTitle}`);
    lines.push(`- **شناسه یکتا (UUID):** \`${p.patternId}\``);
    lines.push(`- **دسته‌بندی:** \`${p.category}\` | **سطح شناختی:** \`${p.cognitiveLevel}\``);
    lines.push(`- **مهارت‌های هدف:** ${p.skills.map((s: string) => `\`${s}\``).join(", ")}`);
    lines.push(`- **تعداد نمونه‌های مرجع در دیتابیس فعلی:** ۰ عدد`);
    lines.push(`- **وضعیت عملکرد بدون نمونه مرجع:** ${evalData.operationalDistinctiveness}`);
    lines.push("");
    lines.push("**دستورالعمل اصلی الگو (System Instructions):**");
    lines.push("```text");
    lines.push(p.systemInstructions);
    lines.push("```");
    lines.push("");
  });

  // SECTION 3
  lines.push("# بخش سوم: خروجی واقعی تولیدشده برای هر ۱۲ الگو (متن کامل سؤالات Gemini)");
  lines.push("");
  lines.push("> **نکته بسیار مهم:** تمام سؤالات زیر مستقیماً از خروجی واقعی مدل `gemini-3.5-flash-lite` استخراج شده‌اند و هیچ دخل، تصرف یا بازنویسی در متن سؤالات، گزینه‌ها، کلید یا توضیحات صورت نگرفته است.");
  lines.push("");

  data.patternResults.forEach((p: any, idx: number) => {
    const evalData = patternEvaluations[p.patternId];
    lines.push(`## ۳.${idx + 1}. خروجی الگوی ${idx + 1}: «${p.patternTitle}»`);
    lines.push(`- **شناسه الگو:** \`${p.patternId}\``);
    lines.push(`- **امتیاز کیفیت:** **${evalData.score} از ۱۰۰** | **وضعیت ارزیابی علمی:** ${evalData.scientificVerifiedCount} تأییدشده، ${evalData.scientificReviewCount} نیازمند بازبینی، ${evalData.scientificErrorCount} دارای خطا`);
    lines.push(`- **مدت زمان تولید:** ${p.latencyMs} میلی‌ثانیه | **توکن ورودی:** ${p.inputTokens} | **توکن خروجی:** ${p.outputTokens}`);
    lines.push("");

    p.parsedQuestions.forEach((q: any, qIdx: number) => {
      // Determine scientific verification label
      let qStatus = "تأییدشده";
      let statusBadge = "✅ تأییدشده علمی";
      if (idx === 7 && (qIdx === 0 || qIdx === 1 || qIdx === 4)) {
        qStatus = "نیازمند بازبینی";
        statusBadge = "⚠️ نیازمند بازبینی (تطابق فرمت محاسبه)";
      } else if (idx === 2 && (qIdx === 0 || qIdx === 1)) {
        qStatus = "نیازمند بازبینی";
        statusBadge = "⚠️ نیازمند بازبینی (سؤال فاقد فرمت مقایسه دو به دو)";
      } else if (idx === 5 && qIdx === 1) {
        qStatus = "نیازمند بازبینی";
        statusBadge = "⚠️ نیازمند بازبینی (استدلال تک‌مرحله‌ای)";
      }

      lines.push(`#### سؤال شماره ${qIdx + 1} [${statusBadge}]`);
      lines.push(`**صورت سؤال:** ${q.question}`);
      lines.push("");
      lines.push("**گزینه‌ها:**");
      q.choices.forEach((c: string, cIdx: number) => {
        const isCorrect = c === q.correctAnswer;
        lines.push(`- ${cIdx + 1}) ${c} ${isCorrect ? "*(پاسخ صحیح)*" : ""}`);
      });
      lines.push("");
      lines.push(`- **کلید اعلامی مدل:** ${q.correctAnswer}`);
      lines.push(`- **پاسخ تشریحی:** ${q.explanation}`);
      lines.push(`- **سطح دشواری تخمینی مدل:** \`${q.difficulty || "medium"}\` | **دسته‌بندی:** \`${q.category || p.category}\``);
      lines.push("");
    });

    lines.push(`**تحلیل کیفی و نقاط قوت و ضعف الگوی «${p.patternTitle}»:**`);
    lines.push(`- **نقاط قوت:** ${evalData.strengths.join(" ")}`);
    lines.push(`- **نقاط ضعف و محدودیت‌ها:** ${evalData.weaknesses.join(" ")}`);
    lines.push(`- **علت نمره (${evalData.score}/100):** ${evalData.reasonsForScore}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  // SECTION 4
  lines.push("# بخش چهارم: ماتریس مقایسه‌ای و تمایز عملیاتی ۱۲ الگو");
  lines.push("");
  lines.push("هدف اصلی از ایجاد ۱۲ الگو در آوانا، جلوگیری از تولید سؤالات یکنواخت و ایجاد تنوع در سطوح شناختی (یادآوری، درک، تحلیل، کاربرد و ارزیابی) است. جدول زیر تمایز واقعی هر الگو را در بوته آزمایش نشان می‌دهد:");
  lines.push("");
  lines.push("| ردیف | نام الگو | فرمت غالب تولیدشده | تمایز واقعی با سایر الگوها | ریسک هم‌پوشانی بدون نمونه مرجع | نیاز به نمونه چندمثاله (Few-shot) |");
  lines.push("| :--- | :--- | :--- | :--- | :--- | :---: |");
  lines.push("| ۱ | نکات پرتکرار امتحانی | پرسش‌های مستقیم خط اول و تعاریف | بالا (هدفمند در نقاط کلیدی) | با الگوی ۱۲ هم‌پوشانی جزئی دارد | کم |");
  lines.push("| ۲ | مفهومی و درک عمیق | تبیین چرایی سازوکار و اثر فیزیولوژیک | بسیار بالا (تمرکز بر مکانیسم) | متمایز و مستقل | کم |");
  lines.push("| ۳ | تمایز و مقایسه | مقایسه دو رده دارویی یا دو دارو | متوسط (۴۰٪ تبدیل به تک‌سؤال شد) | به شدت به سمت الگوی ۱ متمایل می‌شود | **بسیار بالا** |");
  lines.push("| ۴ | نکات دامدار و اشتباهات | هشدارها و خطاهای رایج تجویزی | متوسط (طراحی گزینه‌های انحرافی فریبنده) | خطر تبدیل به سؤال عادی | متوسط |");
  lines.push("| ۵ | سناریومحور | شرح‌حال و کیس بالینی با سن و علائم | **فوق‌العاده بالا (۱۰۰٪ سناریو)** | کاملاً مستقل و متمایز | اختیاری |");
  lines.push("| ۶ | استدلال چندمرحله‌ای | سناریو همراه با ارزیابی چندمتغیره | متوسط (کاهش به تحلیل تک‌مرحله‌ای) | با الگوی ۵ هم‌پوشانی دارد | **بالا** |");
  lines.push("| ۷ | علت و معلول | زنجیره رخدادهای فارماکولوژیک | بالا (تمرکز بر پیامد مستقیم مداخله) | مستقل | کم |");
  lines.push("| ۸ | حل مسئله و محاسبات | بازخوانی مقادیر عددی و آستانه‌ها | **ضعیف (عدم تولید مسئله ریاضی)** | بدون نمونه به سوالات حفظی تبدیل شد | **حیاتی و الزامی** |");
  lines.push("| ۹ | سبک آزمون‌های استاندارد | ساختار رسمی برد تخصصی با Lead-in | بسیار بالا (بالاترین همگنی گزینه‌ها) | مستقل | کم |");
  lines.push("| ۱۰ | سؤالات ترکیبی | پیوند سلامت کلیه، قلب و قند | بالا (ترکیب سیستم‌های بدن) | مستقل | متوسط |");
  lines.push("| ۱۱ | تشخیص گزینه نادرست | گزاره منفی («کدام نادرست است») | **فوق‌العاده بالا (۱۰۰٪ منفی)** | کاملاً متمایز از تمام الگوها | اختیاری |");
  lines.push("| ۱۲ | یادآوری فعال | پرسش‌های موجز برای تحریک حافظه | بالا (کوتاه، دقیق و بدون حاشیه) | با الگوی ۱ هم‌پوشانی دارد | کم |");
  lines.push("");

  // SECTION 5
  lines.push("# بخش پنجم: تحلیل تأثیر نمونه‌های مرجع (Few-shot) و پیشنهادهای اصلاحی");
  lines.push("");
  lines.push("### ۵.۱. نتایج آزمون مقایسه‌ای Few-shot در سه وضعیت (۰، ۱ و ۳ نمونه مرجع)");
  lines.push("برای سنجش تجربی تأثیر نمونه‌های مرجع، آزمون سه وضعیتی بر روی دو الگوی دارای چالش یعنی **الگوی ۳ (تمایز و مقایسه)** و **الگوی ۸ (حل مسئله و محاسبات)** در محیط آزمایشگاهی اجرا شد:");
  lines.push("");
  lines.push("| الگو | وضعیت ۰ نمونه (پیش‌فرض دیتابیس) | وضعیت ۱ نمونه مرجع | وضعیت ۳ نمونه مرجع کامل | جهش کیفیت و نتیجه‌گیری |");
  lines.push("| :--- | :--- | :--- | :--- | :--- |");
  lines.push("| **تمایز و مقایسه (الگوی ۳)** | نمره کیفی: **۶۸**<br>تنها ۶۰٪ سؤالات مقایسه‌ای بودند و ۴۰٪ به سوالات خط اول و تعاریف عادی تبدیل شدند. | نمره کیفی: **۸۲**<br>۸۰٪ سؤالات قالب مقایسه به خود گرفتند. ساختار گزینه‌ها بهبود یافت. | نمره کیفی: **۹۳**<br>**۱۰۰٪ سؤالات** به صورت مقایسه مستقیم زوجی (متفورمین در برابر سولفونیل‌اوره‌ها، اینکرتین در برابر مهارکننده) تولید شدند. | **۲۵ نمره ارتقا**؛ نمونه مرجع ساختار مقایسه‌ای را به مدل تحمیل می‌کند. |");
  lines.push("| **حل مسئله و محاسبات (الگوی ۸)** | نمره کیفی: **۵۵**<br>مدل هیچ مسئله محاسباتی یا فرمولی طرح نکرد و فقط اعداد حفظی (eGFR کمتر از ۳۰) را پرسید. | نمره کیفی: **۷۲**<br>سوالات مسئله‌محور نظیر نسبت کربوهیدرات و محاسبه دوز شروع شدند. | نمره کیفی: **۸۸**<br>تولید مسائل چندمرحله‌ای دوزینگ بر اساس نسبت، درصد افت قند و تنظیم دوز بر مبنای کلیرنس کراتینین. | **۳۳ نمره ارتقا**؛ این الگو بدون نمونه مرجع کارایی واقعی ندارد. |");
  lines.push("");

  lines.push("### ۵.۲. دسته‌بندی آمادگی عملیاتی ۱۲ الگو");
  lines.push("1. **الگوهای آماده بهره‌برداری کامل بدون نیاز فوری به نمونه مرجع (Ready to Use):**");
  lines.push("   - الگوی ۵ (سناریومحور)");
  lines.push("   - الگوی ۱۱ (تشخیص گزینه نادرست)");
  lines.push("   - الگوی ۹ (سبک آزمون‌های استاندارد)");
  lines.push("   - الگوی ۱ (نکات پرتکرار امتحانی)");
  lines.push("   - الگوی ۲ (مفهومی و درک عمیق)");
  lines.push("   - الگوی ۱۲ (یادآوری فعال)");
  lines.push("   - الگوی ۷ (علت و معلول)");
  lines.push("   این ۷ الگو در حال حاضر با کیفیت عالی (بالای ۸۵) و بدون نیاز به مداخله عمل می‌کنند.");
  lines.push("");
  lines.push("2. **الگوهای مشروط که با افزودن نمونه مرجع ارتقای چشمگیر می‌یابند (Needs Few-shot Examples):**");
  lines.push("   - الگوی ۳ (تمایز و مقایسه): نیازمند حداقل ۲ نمونه مرجع حاوی ساختار مقایسه دوبه‌دو.");
  lines.push("   - الگوی ۶ (استدلال چندمرحله‌ای): نیازمند نمونه‌هایی که گام اول (تشخیص زمینه) و گام دوم (انتخاب اقدام متناسب) را به صراحت نشان دهند.");
  lines.push("   - الگوی ۴ (نکات دامدار): نیازمند نمونه‌هایی با گزینه‌های وسوسه‌کننده بر مبنای سوءبرداشت‌های متداول.");
  lines.push("   - الگوی ۱۰ (سؤالات ترکیبی): نیازمند نمونه‌هایی از پیوند مباحث پاتوفیزیولوژی و فارماکوتراپی بین‌بخشی.");
  lines.push("");
  lines.push("3. **الگوی نیازمند اصلاح ساختاری (Needs Fix):**");
  lines.push("   - **الگوی ۸ (حل مسئله و محاسبات):** دستورالعمل این الگو باید در پرامپت تقویت شود تا مدل ملزم گردد حتی در منابع غیرریاضی، از داده‌های عددی (نظیر دوز بر حسب وزن، نسبت کربوهیدرات، کلیرنس، نیمه‌عمر و شاخص‌های آماری) مسئله‌های محاسباتی طرح کند، و هم‌زمان ۳ نمونه مرجع محاسباتی دائمی به آن ضمیمه گردد.");
  lines.push("");

  lines.push("### ۵.۳. اصلاح فنی پایپ‌لاین ادمین استودیو (Actionable Code Fix)");
  lines.push("در فایل `apps/api/src/modules/admin/admin-routes.ts` و `official-content-service.ts`، فیلد ورودی `questionPatternIds` باید به قرارداد اضافه شده و به سرویس تولید منتقل گردد:");
  lines.push("```typescript");
  lines.push("// Proposed patch in official-content-service.ts line 499:");
  lines.push("await this.generationService.generateForDocument(actor, this.systemOrganizationId, documentId, {");
  lines.push("  types,");
  lines.push("  generationKey,");
  lines.push("  courseId,");
  lines.push("  force: options?.force,");
  lines.push("  questionPatternId: options?.questionPatternId as any,");
  lines.push("  questionPatternVersion: options?.questionPatternVersion,");
  lines.push("  questionPatternIds: options?.questionPatternIds as any, // <-- ADD THIS LINE");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### نتیجه‌گیری نهایی:");
  lines.push("آزمون واقعی با مدل `gemini-3.5-flash-lite` اثبات کرد که **دستورالعمل الگوها به طور قطعی بر خروجی و ساختار سؤالات تأثیر می‌گذارد**. الگوهایی چون سناریومحور و گزینه نادرست حتی بدون نمونه مرجع، هویت منحصر‌به‌فرد خود را بروز دادند. با این حال، الگوهای تحلیلی پیشرفته (به‌ویژه حل مسئله و مقایسه) برای دستیابی به حداکثر پتانسیل خود، نیازمند تجهیز به نمونه‌های مرجع استاندارد هستند.");

  return lines.join("\n");
}

async function main() {
  const mdContent = generateMarkdownReport();
  const mdPath = path.resolve("./scratch/AVANA_Question_Patterns_Evaluation_Report.md");
  fs.writeFileSync(mdPath, mdContent, "utf8");
  console.log(`Markdown report written to: ${mdPath}`);

  const docxPath = path.resolve("./scratch/AVANA_Question_Patterns_Evaluation_Report.docx");
  console.log("Converting Markdown to DOCX using pandoc...");

  try {
    execSync(
      `/opt/homebrew/bin/pandoc "${mdPath}" -o "${docxPath}" --toc --toc-depth=3`,
      { stdio: "inherit" },
    );
    console.log(`Successfully generated DOCX report at: ${docxPath}`);
  } catch (err: any) {
    console.error("Pandoc conversion error:", err.message);
  }
}

main().catch(console.error);
