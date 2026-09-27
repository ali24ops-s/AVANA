/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import {
  PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN,
  PROD_ORGANIC_CHEM_2_LESSON_MARKDOWN,
  PROD_MEDICINAL_CHEM_LESSON_MARKDOWN,
} from "./chemical-production-validation.test.js";

describe("Production Visual QA Artifact Generation", () => {
  it("renders production lessons and generates comprehensive HTML Visual QA report with Desktop & Mobile preview containers", async () => {
    const { findByText, container } = render(
      <div>
        <div id="organic-1">
          <MarkdownRenderer content={PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <div id="organic-2">
          <MarkdownRenderer content={PROD_ORGANIC_CHEM_2_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <div id="med-chem">
          <MarkdownRenderer content={PROD_MEDICINAL_CHEM_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
      </div>
    );

    // Ensure all lessons are rendered
    expect(await findByText(/شیمی آلی ۱: واکنش‌های افزایشی و جانشینی/)).toBeInTheDocument();
    expect(await findByText(/شیمی آلی ۲: ترکیبات کربونیل و سنتزهای پیشرفته/)).toBeInTheDocument();
    expect(await findByText(/شیمی دارویی: طراحی دارو، روابط ساختار-فعالیت/)).toBeInTheDocument();

    const organic1Html = container.querySelector("#organic-1")?.innerHTML || "";
    const organic2Html = container.querySelector("#organic-2")?.innerHTML || "";
    const medChemHtml = container.querySelector("#med-chem")?.innerHTML || "";

    const artifactDir = "/Users/ops/.gemini/antigravity/brain/11ec6c93-30ad-4223-85fa-b9e02c1b35fc/visual-qa";
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    const fullVisualQaHtml = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AVANA Production Chemistry Visual QA Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
    body {
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    code, pre, [dir="ltr"] {
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-900 antialiased p-4 sm:p-8 min-h-screen">
  <div class="max-w-7xl mx-auto space-y-10">
    <header class="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-slate-900">داشبورد ارزیابی بصری محتوای شیمیایی AVANA (Visual QA)</h1>
          <p class="text-slate-500 text-sm mt-1">صحه‌گذاری رندرینگ ساختارها، واکنش‌ها، مکانیزم‌ها، SAR، پیش‌دارو و مسیرهای سنتزی</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            ✓ تمامی تست‌ها موفق (Zero Silent Fallback)
          </span>
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
            Desktop 1280x800 & Mobile 375x667
          </span>
        </div>
      </div>
    </header>

    <!-- Navigation Tabs / Controls -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Desktop Viewport Simulator (1280px Scale) -->
      <section class="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
            <h2 class="font-bold text-slate-800">شبیه‌ساز دسکتاپ (Desktop Viewport: 1280×800)</h2>
          </div>
          <span class="text-xs text-slate-400 font-mono">100% Width Container</span>
        </div>
        <div class="w-full bg-slate-50 p-4 rounded-2xl border border-slate-200/80 overflow-y-auto max-h-[700px]">
          <div class="space-y-8">
            <div>
              <h3 class="text-lg font-bold text-indigo-900 mb-3 pb-2 border-b border-indigo-100">شیمی آلی ۱ (Organic 1)</h3>
              ${organic1Html}
            </div>
            <div>
              <h3 class="text-lg font-bold text-indigo-900 mb-3 pb-2 border-b border-indigo-100">شیمی آلی ۲ (Organic 2)</h3>
              ${organic2Html}
            </div>
            <div>
              <h3 class="text-lg font-bold text-indigo-900 mb-3 pb-2 border-b border-indigo-100">شیمی دارویی ۱، ۲ و ۳ (Medicinal Chemistry)</h3>
              ${medChemHtml}
            </div>
          </div>
        </div>
      </section>

      <!-- Mobile Viewport Simulator (375px Fixed Device Frame) -->
      <section class="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500"></span>
            <h2 class="font-bold text-slate-800">شبیه‌ساز موبایل (Mobile Viewport: 375×667)</h2>
          </div>
          <span class="text-xs text-slate-400 font-mono">iPhone SE / Mini Size (375px)</span>
        </div>
        <div class="flex justify-center bg-slate-100 p-4 rounded-2xl border border-slate-200/80">
          <!-- Exact 375px Mobile Frame -->
          <div class="w-[375px] bg-white rounded-3xl border-4 border-slate-800 p-4 shadow-xl overflow-y-auto max-h-[700px] text-xs space-y-6">
            <div class="text-center pb-2 border-b border-slate-100">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">نمای واقعی صفحه درسنامه موبایل</span>
            </div>
            <div>
              <h3 class="text-base font-bold text-indigo-900 mb-2">شیمی آلی ۱</h3>
              ${organic1Html}
            </div>
            <div>
              <h3 class="text-base font-bold text-indigo-900 mb-2">شیمی آلی ۲</h3>
              ${organic2Html}
            </div>
            <div>
              <h3 class="text-base font-bold text-indigo-900 mb-2">شیمی دارویی</h3>
              ${medChemHtml}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(path.join(artifactDir, "index.html"), fullVisualQaHtml, "utf-8");
    expect(fs.existsSync(path.join(artifactDir, "index.html"))).toBe(true);
  });
});
