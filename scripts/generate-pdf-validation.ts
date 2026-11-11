import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import {
  defaultPdfGenerationService,
} from "../apps/api/src/modules/admin/pdf-generation-service.js";
import {
  renderLessonPdfHtml,
  renderChapterPdfHtml,
  isValidAcademicReference,
} from "../apps/api/src/modules/admin/pdf-template.js";

async function main() {
  const outputDir = path.resolve(process.cwd(), "scratch/pdf-validation/final");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("=== 1. Testing Reference Validation Cases (Issue 3) ===");
  // Case 1: Course and Chapter both have registered reference
  const case1LessonHtml = renderLessonPdfHtml({
    title: "درس آزمون حالت ۱",
    courseName: "فارماکولوژی ۱",
    moduleTitle: "فصل ۱",
    reference: "کتاب کاتزونگ، فصل سوم",
    contentMarkdown: "محتوا با رفرنس معتبر.",
  });
  console.log("Case 1 (Valid Reference in Lesson):", case1LessonHtml.includes("کتاب کاتزونگ، فصل سوم") ? "PASSED (Displayed)" : "FAILED");

  const case1ChapterHtml = renderChapterPdfHtml({
    chapterId: "ch-1",
    chapterTitle: "فصل اول",
    courseName: "فارماکولوژی ۱",
    chapterReference: "منبع فصل گایتون",
    courseReference: "منبع دوره فارماکولوژی",
    sessions: [
      { id: "s-1", title: "جلسه ۱", sortOrder: 1, contentMarkdown: "متن ۱", reference: "رفرنس اختصاصی جلسه ۱" },
      { id: "s-2", title: "جلسه ۲", sortOrder: 2, contentMarkdown: "متن ۲" }, // Should inherit chapterReference
    ],
  });
  console.log("Case 1 Chapter Cover Reference:", case1ChapterHtml.includes("منبع فصل گایتون") ? "PASSED" : "FAILED");
  console.log("Case 1 Session 1 Specific Reference:", case1ChapterHtml.includes("رفرنس اختصاصی جلسه ۱") ? "PASSED" : "FAILED");
  console.log("Case 1 Session 2 Inherited Reference:", case1ChapterHtml.includes("جلسه ۲") && case1ChapterHtml.includes("منبع فصل گایتون") ? "PASSED" : "FAILED");

  // Case 2: Course has reference, chapter has no separate reference
  const case2ChapterHtml = renderChapterPdfHtml({
    chapterId: "ch-2",
    chapterTitle: "فصل دوم بدون رفرنس اختصاصی",
    courseName: "فیزیولوژی پزشکی",
    courseReference: "کتاب مرجع فیزیولوژی گایتون و هال",
    sessions: [
      { id: "s-1", title: "جلسه ۱", sortOrder: 1, contentMarkdown: "متن ۱" }, // Should inherit courseReference
    ],
  });
  console.log("Case 2 Inherits Course Reference on Cover:", case2ChapterHtml.includes("کتاب مرجع فیزیولوژی گایتون و هال") ? "PASSED" : "FAILED");

  // Case 3: No reference registered anywhere
  const case3LessonHtml = renderLessonPdfHtml({
    title: "درس آزمون حالت ۳",
    courseName: "دوره جامع فیزیولوژی",
    reference: null,
    contentMarkdown: "محتوا بدون هیچ رفرنسی.",
  });
  console.log("Case 3 No Reference rendered:", !case3LessonHtml.includes("مرجع:") ? "PASSED (Omitted entirely)" : "FAILED");
  console.log("Case 3 No Synthetic placeholders:", !case3LessonHtml.includes("بدون مرجع") && !case3LessonHtml.includes("نامشخص") ? "PASSED" : "FAILED");

  // Case 4: Input has a raw filename as reference (e.g. uploaded file)
  const case4LessonHtml = renderLessonPdfHtml({
    title: "درس آزمون حالت ۴",
    courseName: "فارماکولوژی",
    reference: "Katzung_Pharmacology_14th_Edition.pdf",
    contentMarkdown: "محتوا با نام فایل به عنوان رفرنس ورودی.",
  });
  console.log("Case 4 Filename rejected:", !case4LessonHtml.includes("Katzung_Pharmacology_14th_Edition.pdf") && !case4LessonHtml.includes("مرجع:") ? "PASSED (Filename omitted)" : "FAILED");

  console.log("\n=== 2. Generating Comprehensive Lesson PDF (KaTeX & 2D Chem) ===");
  const lessonData = {
    title: "فارماکولوژی مولکولی، ساختارهای شیمیایی و الکتروفیزیولوژی",
    courseName: "فارماکولوژی و فیزیولوژی پیشرفته",
    moduleTitle: "فصل اول: بیومولکول‌ها و سیناتیک آنزیمی",
    reference: "Katzung Basic & Clinical Pharmacology, 15th Ed",
    contentMarkdown: `
# مقدمه و مبانی فارماکودینامیک

این درسنامه به بررسی دقیق **سینتیک داروها**، ترسیم ساختارهای ۲بعدی مولکول‌ها و فرمول‌های الکتروفیزیولوژی غشا می‌پردازد.

> [!KEY-POINT]
> پیوند دارو-گیرنده می‌تواند کووالان، الکترواستاتیک یا هیدروفوب باشد و قدرت تمایل دارو با $K_d$ سنجیده می‌شود.

## فرمول‌های الکتروفیزیولوژی و ریاضیات KaTeX

معادله پتانسیل تعادلی نرنست برای یون‌های تک‌ظرفیتی در دمای استاندارد فیزیولوژیک ($37^\\circ\\text{C}$):

$$ E_{ion} = \\frac{RT}{zF} \\ln \\frac{[ion]_{out}}{[ion]_{in}} = \\frac{61.5}{z} \\log_{10} \\left( \\frac{[ion]_{out}}{[ion]_{in}} \\right) $$

فرمول کسر چندطبقه برای ارزیابی نفوذپذیری نسبی یون‌های مختلف غشا (ارتفاع عمودی کالیبره‌شده):

$$ P_{rel} = \\frac{\\frac{g_{Na}}{g_K} \\cdot \\frac{[Na^+]_{out}}{[K^+]_{out}} + 1}{\\frac{g_{Na}}{g_K} \\cdot \\frac{[Na^+]_{in}}{[K^+]_{in}} + 1} $$

محاسبه شار یونی از طریق انتگرال چگالی بار الکتریکی:

\\[ J_i = -D_i \\left( \\frac{dC_i}{dx} + \\frac{z_i F C_i}{RT} \\frac{d\\psi}{dx} \\right) \\]

> [!CLINICAL-POINT]
> در بیماران مبتلا به نارسایی حاد کلیوی، بروز هایپرکالمی با کاهش شیب غلظتی پتاسیم منجر به مسمومیت قلبی و آریتمی‌های بطنی مرگبار می‌شود.

## ساختارهای شیمیایی ۲بعدی با SmilesDrawer

### ۱. ساختار مولکولی آسپیرین (استیل‌سالیسیلیک اسید)

\`\`\`chemical
compoundName: آسپیرین (Aspirin)
formula: C9H8O4
molecularWeight: 180.16
smiles: CC(=O)Oc1ccccc1C(=O)O
sarHighlights:
  - استیلاسیون سرین ۵۲۹: مهار برگشت‌ناپذیر سیکلواکسیژناز ۱ (COX-1)
  - کربوکسیل آزاد: اتصال الکترواستاتیک به جایگاه کاتالیتیک آنزیم
\`\`\`

### ۲. ساختار مولکولی لیدوکائین (بی‌حس‌کننده موضعی)

\`\`\`chemical
compoundName: لیدوکائین (Lidocaine)
formula: C14H22N2O
molecularWeight: 234.34
smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C
sarHighlights:
  - حلقه ۲و۶-دی‌متیل‌فنیل: افزایش چربی‌دوستی و مقاومت به هیدرولیز پلاسما
  - اتصال آمیدی پایدار: نیمه‌عمر طولانی‌تر در مقایسه با پروکائین
  - زنجیره دی‌اتیل‌آمین: تنظیم تعادل یونی فرم محلول در چربی و هیدروفیل
\`\`\`

## نمایش واکنش‌های شیمیایی و تعادلی

### واکنش هیدرولیز استیل‌کولین به کولین و استیک اسید

\`\`\`reaction
CC(=O)OCC[N+](C)(C)C.O>>CC(=O)O.OCC[N+](C)(C)C
\`\`\`

### معادله استوکیومتری تجزیه گلوکز

\`\`\`reaction
C6H12O6 + 6O2 -> 6CO2 + 6H2O
\`\`\`

---
## جدول مقایسه ویژگی‌های فارماکوکینتیک داروها (بررسی تراز RTL و رفع خطوط خاکستری)

| نام دارو (راست پیش‌فرض) | دوز معمول (وسط صریح) | Formula (ایزولاسیون) | نیمه‌عمر پلاسما (راست صریح) | راه دفع اصلی و متابولیت (راست) |
|:---|:---:|---:|---|---|
| آسپیرین (Aspirin) | 100 mg | C9H8O4 | ۱۵-۲۰ دقیقه | کلیوی - سالیسیلیک اسید |
| لیدوکائین (Lidocaine) | 200 mg | C14H22N2O | ۱.۵-۲ ساعت | کبدی ($CYP1A2/3A4$) |
| پروپرانولول (Propranolol) | 40 mg | C16H21NO2 | ۳-۴ ساعت | کبدی ($CYP2D6$) - ۴-هیدروکسی |
| دیگوکسین (Digoxin) | 0.25 mg | C41H64O14 | ۳۶-۴۸ ساعت | فیلتراسیون گلومرولی کلیه |
| متفورمین (Metformin) | 500 mg | C4H11N5 | ۶.۲ ساعت | ترشح توبولار کلیوی فعال |
| آتورواستاتین (Atorvastatin) | 20 mg | C33H35FN2O5 | ۱۴ ساعت | دفع صفراوی و مدفوعی |

> [!WARNING]
> مصرف همزمان آسپیرین با وارفارین ریسک خونریزی شدید گوارشی را به شدت افزایش می‌دهد.
    `.trim(),
  };

  const lessonHtml = renderLessonPdfHtml(lessonData);
  const lessonPdfBuffer = await defaultPdfGenerationService.generatePdfFromHtml(lessonHtml);
  const lessonPdfPath = path.join(outputDir, "lesson-final.pdf");
  fs.writeFileSync(lessonPdfPath, lessonPdfBuffer);
  console.log(`✓ Lesson PDF saved: ${lessonPdfPath} (${lessonPdfBuffer.length} bytes)`);

  console.log("\n=== 3. Generating Multi-Session Chapter PDF ===");
  const chapterData = {
    chapterId: "chap-pharmacology-neuro",
    chapterTitle: "فصل جامع فارماکولوژی دستگاه عصبی خودمختار",
    courseName: "فارماکولوژی جامع علوم پزشکی",
    chapterReference: "Katzung Basic & Clinical Pharmacology, 15th Ed",
    organizationName: "دانشکده داروسازی آوانا",
    sessions: [
      {
        id: "sess-1",
        title: "جلسه ۱: سیستم کولینرژیک، گیرنده‌های موسکارینی و آگونیست‌های کولینواستر در فارماکولوژی بالینی و اعصاب",
        sortOrder: 1,
        reference: "Katzung Chapter 7",
        estimatedMinutes: 25,
        contentMarkdown: `
# سیستم کولینرژیک

استیل‌کولین انتقال‌دهنده اصلی در تمامی گانگلیون‌های خودمختار و محل اتصال عصب-عضله است.

\`\`\`chemical
compoundName: استیل‌کولین
formula: C7H16NO2+
molecularWeight: 146.21
smiles: CC(=O)OCC[N+](C)(C)C
\`\`\`

> [!NOTE]
> اتصال استیل‌کولین به گیرنده‌های موسکارینی M2 در قلب باعث کاهش ضربان قلب (برادی‌کاردی) می‌شود.
        `.trim(),
      },
      {
        id: "sess-2",
        title: "جلسه دوم: فارماکولوژی مسدودکننده‌های عصبی و لیدوکائین",
        sortOrder: 2,
        estimatedMinutes: 30, // Inherits chapterReference
        contentMarkdown: `
# مسدودکننده‌های کانال سدیمی

لیدوکائین با بلاک انتخابی کانال‌های فعال و غیرفعال سدیمی انتقال سیگنال درد را مهار می‌کند.

\`\`\`chemical
compoundName: لیدوکائین
formula: C14H22N2O
molecularWeight: 234.34
smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C
\`\`\`

$$ \\text{Blockade Ratio} = \\frac{[Drug]}{[Drug] + K_d \\cdot (1 + e^{\\frac{V - V_0}{k}})} $$

> [!KEY-POINT]
> کانال‌هایی که در فرکانس بالاتر شلیک می‌کنند (Use-dependent block) حساسیت بیشتری به لیدوکائین دارند.

## جدول جامع مسدودکننده‌های کانال یونی غشا

| ردیف | نام ژنریک دارو | دسته دارویی | Target Ion Channel | نیمه‌عمر پلاسمایی | اندیکاسیون بالینی اصلی |
|:---|---|:---:|---|:---:|---|
| ۱ | لیدوکائین (Lidocaine) | بی‌حس‌کننده موضعی و کلاس Ib | $Na_v1.5 / Na_v1.7$ | ۱.۵ ساعت | بی‌حسی موضعی و آریتمی بطنی |
| ۲ | بوپیواکائین (Bupivacaine) | بی‌حس‌کننده آمیدی طویل‌اثر | Voltage-Gated $Na^+$ | ۳.۵ ساعت | بی‌حسی نخاعی و اپیدورال زایمان |
| ۳ | تتراکائین (Tetracaine) | بی‌حس‌کننده استری قوی | $Na^+$ Fast Channels | ۲ ساعت | بی‌حسی موضعی چشم و مخاط |
| ۴ | پروکائین (Procaine) | بی‌حس‌کننده استری کوتاه‌اثر | $Na^+$ Channels | ۸ دقیقه | دندانپزشکی و انفیلتراسیون |
| ۵ | روپیواکائین (Ropivacaine) | آمید با سمیت قلبی کمتر | $Na_v$ Channels | ۱.۹ ساعت | بلوک اعصاب محیطی و تسکین درد |
| ۶ | مپیواکائین (Mepivacaine) | بی‌حس‌کننده آمیدی با شروع سریع | $Na^+$ Channels | ۲ ساعت | بی‌حسی دندانپزشکی بدون انقباض عروقی |
| ۷ | پریلوکائین (Prilocaine) | آمید با ریسک متهموگلوبینمی | $Na_v$ Channels | ۱.۶ ساعت | بی‌حسی موضعی همراه با لیدوکائین (EMLA) |
| ۸ | فلوکائینید (Flecainide) | ضدآریتمی کلاس Ic | Cardiac $Na_v1.5$ | ۲۰ ساعت | فیبریلاسیون دهلیزی و SVT |
        `.trim(),
      },
      {
        id: "sess-3",
        title: "جلسه ۳: داروهای ضدالتهاب غیراستروئیدی و مشتقات سالیسیلات",
        sortOrder: 3,
        reference: "Katzung Chapter 9",
        estimatedMinutes: 35,
        contentMarkdown: `
# آسپیرین و مهار سنتز پروستاگلاندین‌ها

\`\`\`chemical
compoundName: آسپیرین
formula: C9H8O4
molecularWeight: 180.16
smiles: CC(=O)Oc1ccccc1C(=O)O
\`\`\`

\`\`\`reaction
Aspirin + H2O -> Salicylic_Acid + Acetic_Acid
\`\`\`

| دارو | انتخابی بودن COX-1/COX-2 | دوز ضدپلاکتی | نیمه‌عمر دفع |
|---|---|---|---|
| آسپیرین | ۱۰۰ برابر تمایل بیشتر به COX-1 | ۸۰ تا ۱۰۰ میلی‌گرم | ۲۰ دقیقه |
| سلکوکسیب | بسیار انتخابی برای COX-2 | بدون اثر ضدپلاکتی | ۱۱ ساعت |
        `.trim(),
      },
    ],
  };

  const chapterHtml = renderChapterPdfHtml(chapterData);
  const chapterPdfBuffer = await defaultPdfGenerationService.generatePdfFromHtml(chapterHtml);
  const chapterPdfPath = path.join(outputDir, "chapter-final.pdf");
  fs.writeFileSync(chapterPdfPath, chapterPdfBuffer);
  console.log(`✓ Chapter PDF saved: ${chapterPdfPath} (${chapterPdfBuffer.length} bytes)`);

  const lessonPdfStr = lessonPdfBuffer.toString("latin1");
  const sMaskMatches = lessonPdfStr.match(/\/SMask/g) || [];
  console.log(`  -> Lesson PDF /SMask count: ${sMaskMatches.length} (Verified no masks in chemical drawings)`);

  console.log("\n=== 4. Rasterizing Actual PDF Document Pages via macOS PDFKit (2x High-Res) ===");
  const rasterizeScript = `
import PDFKit
import Cocoa

func rasterize(pdfPath: String, prefix: String, outDir: String) {
    let pdfUrl = URL(fileURLWithPath: pdfPath)
    guard let doc = PDFDocument(url: pdfUrl) else {
        print("Failed to open PDF at", pdfPath)
        return
    }
    print("Rasterizing \\(prefix): \\(doc.pageCount) pages")
    for i in 0..<doc.pageCount {
        guard let page = doc.page(at: i) else { continue }
        let pageRect = page.bounds(for: .mediaBox)
        let scale: CGFloat = 2.0 // High-res 2x
        let targetSize = NSSize(width: pageRect.width * scale, height: pageRect.height * scale)
        let renderer = NSImage(size: targetSize)
        renderer.lockFocus()
        if let ctx = NSGraphicsContext.current?.cgContext {
            ctx.scaleBy(x: scale, y: scale)
            ctx.setFillColor(NSColor.white.cgColor)
            ctx.fill(pageRect)
            page.draw(with: .mediaBox, to: ctx)
        }
        renderer.unlockFocus()
        if let tiff = renderer.tiffRepresentation,
           let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            let outUrl = URL(fileURLWithPath: "\\(outDir)/\\(prefix)_page_\\(i+1).png")
            try? png.write(to: outUrl)
            print("  ✓ Wrote \\(prefix)_page_\\(i+1).png")
        }
    }
}

rasterize(pdfPath: "${lessonPdfPath}", prefix: "lesson_actual", outDir: "${outputDir}")
rasterize(pdfPath: "${chapterPdfPath}", prefix: "chapter_actual", outDir: "${outputDir}")
`;

  const swiftPath = path.join(outputDir, "rasterize_final.swift");
  fs.writeFileSync(swiftPath, rasterizeScript);
  execSync(`swift "${swiftPath}"`, { stdio: "inherit" });

  console.log("=== All Validation Assets and Tests Completed Successfully! ===");
}

main().catch((err) => {
  console.error("Error generating validation assets:", err);
  process.exit(1);
});
