import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { CHEMISTRY_REACTIONS_LESSON_MARKDOWN } from "../../../../database/seeds/seed-chemistry-reactions.js";

describe("Dedicated Chemistry Reactions Test Course: 'تست واکنش‌های شیمیایی'", () => {
  it("renders all 9 ChemDraw 2D reaction archetypes in the lesson UI without errors", async () => {
    const { container } = render(
      <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />,
    );

    // Verify main heading
    expect(screen.getByText(/واکنش‌های شاخص شیمی آلی و دارویی/)).toBeInTheDocument();

    // Archetype 1: Single reactant -> Single product (A -> B)
    expect(await screen.findByText("اکسیداسیون الکل به آلدئید")).toBeInTheDocument();
    expect((await screen.findAllByText("اتانول")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("استالدئید")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("PCC").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CH2Cl2").length).toBeGreaterThanOrEqual(1);

    // Archetype 2: Multiple reactants -> Single product (A + B -> C)
    expect(await screen.findByText("واکنش دیلز-آلدر (Diels-Alder Cycloaddition)")).toBeInTheDocument();
    expect(await screen.findByText("۱،۳-بوتادی‌ان")).toBeInTheDocument();
    expect(await screen.findByText("اتیلن")).toBeInTheDocument();
    expect(await screen.findByText("سیکلوهگزن")).toBeInTheDocument();
    expect(screen.getAllByText("150 °C").length).toBeGreaterThanOrEqual(1);

    // Archetype 3: Multiple reactants -> Multiple products (A + B -> C + D)
    expect(await screen.findByText("استریفیکاسیون فیشر (Fischer Esterification)")).toBeInTheDocument();
    expect((await screen.findAllByText("استیک اسید")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("اتیل استات")).toBeInTheDocument();
    expect(screen.getAllByText("H2SO4").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Δ").length).toBeGreaterThanOrEqual(1);

    // Archetype 4: Conditions above and below arrow
    expect(await screen.findByText("احیای کتون به الکل دوم")).toBeInTheDocument();
    expect((await screen.findAllByText("استون")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("ایزوپروپانول")).toBeInTheDocument();
    expect(screen.getAllByText("NaBH4").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("MeOH").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0-5 °C").length).toBeGreaterThanOrEqual(1);

    // Archetype 5: Reversible / Equilibrium reaction (⇌)
    expect(await screen.findByText("تعادل کتو-انول (Keto-Enol Tautomerism)")).toBeInTheDocument();
    expect(await screen.findByText("استون (فرم کتو)")).toBeInTheDocument();
    expect(await screen.findByText("پروپن-۲-اول (فرم انول)")).toBeInTheDocument();

    // Archetype 6: Resonance structures (↔)
    expect(await screen.findByText("ساختارهای رزونانسی آنیون انولات")).toBeInTheDocument();
    expect(await screen.findByText("کربانیون انولات")).toBeInTheDocument();
    expect(await screen.findByText("اکسی‌آنیون انولات")).toBeInTheDocument();

    // Archetype 7: Multi-step reaction sequence (A -> B -> C)
    expect(await screen.findByText("سنتز چندمرحله‌ای آنیلین از بنزن")).toBeInTheDocument();
    expect(await screen.findByText("بنزن")).toBeInTheDocument();
    expect((await screen.findAllByText("نیتروبنزن")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("آنیلین")).toBeInTheDocument();

    // Archetype 8: Stereochemistry / Chiral inversion (SN2)
    expect(await screen.findByText("جانشینی SN2 با واژگونی والدن")).toBeInTheDocument();
    expect(await screen.findByText("(R)-۲-بروموبوتان")).toBeInTheDocument();
    expect(await screen.findByText("(S)-بوتان-۲-اول")).toBeInTheDocument();
    expect(screen.getAllByText("DMSO").length).toBeGreaterThanOrEqual(1);

    // Archetype 9: Reactive intermediate with brackets [ ... ]
    expect(await screen.findByText("جانشینی آسیل با واسط تتراهدرال")).toBeInTheDocument();
    expect(await screen.findByText("استیل کلرید")).toBeInTheDocument();
    expect(await screen.findByText("حدواسط تتراهدرال")).toBeInTheDocument();

    // Check that intermediate brackets [ and ] are rendered for Archetype 9
    const intermediateCard = screen.getByTestId("rxn-intermediate-card");
    expect(intermediateCard).toBeInTheDocument();
    expect(intermediateCard.textContent).toContain("[");
    expect(intermediateCard.textContent).toContain("]");

    // Archetype 10: E2 Elimination Mechanism
    expect(await screen.findByText("مکانیزم واکنش حذف دومولکولی (E2 Elimination)")).toBeInTheDocument();
    expect(await screen.findByText("اتن (آلکن)")).toBeInTheDocument();

    // Archetype 11: Resonance Mechanism
    expect(await screen.findByText("انتقال جفت‌الکترون رزونانسی انولات")).toBeInTheDocument();
    expect(await screen.findByText("فرم اکسی‌آنیون")).toBeInTheDocument();

    // Archetype 12: Prodrug Bioactivation (Medicinal Chemistry)
    expect(await screen.findByText("فعال‌سازی پیش‌دارو: انالاپریل به انالاپریلات")).toBeInTheDocument();
    expect(await screen.findByText("انالاپریل")).toBeInTheDocument();
    expect(await screen.findByText("انالاپریلات")).toBeInTheDocument();

    // Archetype 13: Bioisosterism & SAR (Medicinal Chemistry Structure Block)
    expect(await screen.findByText("لوزارتان (Losartan)")).toBeInTheDocument();
    expect(await screen.findByText(/آنتاگونیست گیرنده آنژیوتانسین/)).toBeInTheDocument();

    // Verify all 12 reaction blocks are rendered
    const blocks = container.querySelectorAll('[data-testid="reaction-block"]');
    expect(blocks.length).toBe(12);

    // Verify 1 chemical structure block is rendered
    const structBlocks = container.querySelectorAll('[data-testid="chemical-structure-block"]');
    expect(structBlocks.length).toBe(1);

    // Verify each block has horizontal overflow protection and LTR isolation
    blocks.forEach((block) => {
      expect(block).toHaveAttribute("dir", "rtl");
      const ltr = block.querySelector('[dir="ltr"]');
      expect(ltr).toBeInTheDocument();
      const scrollable = block.querySelector(".overflow-x-auto");
      expect(scrollable).toBeInTheDocument();
    });

    // Write rendered output to artifact directory for visual preview
    try {
      const fs = await import("fs");
      const artifactDir = "/Users/ops/.gemini/antigravity/brain/3e30780c-c248-4c45-8622-0c01832d0818";
      if (fs.existsSync(artifactDir)) {
        const previewHtml = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ChemDraw 2D Reaction Schemes Preview</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    :root {
      --background: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --foreground: #0f172a;
      --muted-foreground: #64748b;
      --primary: #4f46e5;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
  </style>
</head>
<body class="bg-[var(--background)] text-[var(--foreground)] antialiased p-6 sm:p-10 min-h-screen">
  <div class="max-w-5xl mx-auto space-y-8">
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
      <div class="flex items-center gap-3 mb-2">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-lg">✓</span>
        <h1 class="text-xl font-bold text-[var(--foreground)]">پیش‌نمایش بصری طرح‌های واکنش‌های ۲بعدی ChemDraw (AVANA)</h1>
      </div>
      <p class="text-sm text-[var(--muted-foreground)]">
        نمایش زنده و تولیدشده از خط لوله واقعی رندرینگ AVANA شامل ۹ الگوی واکنش‌های شیمی آلی با ساختارهای پیوسته و متناسب، فلش‌های برداری SVG (تعادلی ⇌، رزونانس ↔، برگشت‌ناپذیر →)، حدواسط درون کروشه [ ... ]، شرایط تایپوگرافیک بالا و پایین بدون کادر دکمه‌ای، و ایزولاسیون کامل LTR.
      </p>
    </div>
    <div class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm space-y-8">
      ${container.innerHTML}
    </div>
  </div>
  <script>
    function alignMechanismOverlays() {
      try {
        const blocks = document.querySelectorAll("[data-testid='reaction-block']");
        blocks.forEach((block) => {
          const interSvg = block.querySelector("[data-testid='intermolecular-mechanism-overlay']");
          if (!interSvg) return;
          const container = interSvg.parentElement;
          if (!container) return;
          const cRect = container.getBoundingClientRect();
          if (cRect.width === 0) return;

          // 1. SN2 Arrow (arrow_nu_to_c)
          const sn2Path = interSvg.querySelector("path[id='arrow_nu_to_c']");
          if (sn2Path) {
            const reactantCards = block.querySelectorAll("[data-testid='rxn-reactant-card']");
            if (reactantCards.length >= 2) {
              const nuCard = reactantCards[1];
              const tealDots = Array.from(nuCard.querySelectorAll(".rxn-lone-pairs circle[fill='#0d9488']"));
              const subSvg = reactantCards[0].querySelector("svg[id^='rxn_mol_']");
              if (tealDots.length > 0 && subSvg) {
                const dotRects = tealDots.map(d => d.getBoundingClientRect());
                const srcX = dotRects.reduce((s, r) => s + r.left + r.width / 2, 0) / dotRects.length - cRect.left;
                const srcY = dotRects.reduce((s, r) => s + r.top + r.height / 2, 0) / dotRects.length - cRect.top;

                const sRect = subSvg.getBoundingClientRect();
                const [vx, vy, vw, vh] = (subSvg.getAttribute("viewBox") || "0 0 100 100").split(" ").map(Number);
                const scaleX = sRect.width / vw;
                const scaleY = sRect.height / vh;
                const tgtX = sRect.left + (77.32 - vx) * scaleX - cRect.left;
                const tgtY = sRect.top + (44.64 - vy) * scaleY - cRect.top;

                const dx = tgtX - srcX;
                const arch = Math.max(30, Math.min(65, Math.abs(dx) * 0.32));
                const ctrlX = (srcX + tgtX) / 2;
                const ctrlY = Math.min(srcY, tgtY) - arch;

                const toArrX = tgtX - ctrlX;
                const toArrY = tgtY - ctrlY;
                const arrLen = Math.hypot(toArrX, toArrY) || 1;
                const setback = 9.0;
                const endX = tgtX - (toArrX / arrLen) * setback;
                const endY = tgtY - (toArrY / arrLen) * setback;

                sn2Path.setAttribute("d", "M " + srcX.toFixed(1) + " " + srcY.toFixed(1) + " Q " + ctrlX.toFixed(1) + " " + ctrlY.toFixed(1) + " " + endX.toFixed(1) + " " + endY.toFixed(1));
              }
            }
          }

          // 2. E2 Arrow (arrow_base_h)
          const e2Path = interSvg.querySelector("path[id='arrow_base_h']");
          if (e2Path) {
            const reactantCards = block.querySelectorAll("[data-testid='rxn-reactant-card']");
            const betaH = block.querySelector("[data-testid='mechanism-beta-hydrogen'] text");
            if (reactantCards.length >= 1 && betaH) {
              const baseCard = reactantCards[0];
              const baseTealDots = Array.from(baseCard.querySelectorAll(".rxn-lone-pairs circle[fill='#0d9488']"));
              if (baseTealDots.length > 0) {
                const dotRects = baseTealDots.map(d => d.getBoundingClientRect());
                const srcX = dotRects.reduce((s, r) => s + r.left + r.width / 2, 0) / dotRects.length - cRect.left;
                const srcY = dotRects.reduce((s, r) => s + r.top + r.height / 2, 0) / dotRects.length - cRect.top;

                const hRect = betaH.getBoundingClientRect();
                const tgtX = hRect.left + hRect.width / 2 - cRect.left;
                const tgtY = hRect.top + hRect.height / 2 - cRect.top;

                const dx = tgtX - srcX;
                const arch = Math.max(30, Math.min(65, Math.abs(dx) * 0.24));
                const ctrlX = (srcX + tgtX) / 2;
                const ctrlY = Math.min(srcY, tgtY) - arch;

                const toArrX = tgtX - ctrlX;
                const toArrY = tgtY - ctrlY;
                const arrLen = Math.hypot(toArrX, toArrY) || 1;
                const setback = 9.0;
                const endX = tgtX - (toArrX / arrLen) * setback;
                const endY = tgtY - (toArrY / arrLen) * setback;

                e2Path.setAttribute("d", "M " + srcX.toFixed(1) + " " + srcY.toFixed(1) + " Q " + ctrlX.toFixed(1) + " " + ctrlY.toFixed(1) + " " + endX.toFixed(1) + " " + endY.toFixed(1));
              }
            }
          }
        });
      } catch (e) {
        console.error("Alignment error:", e);
      }
    }

    window.alignMechanismOverlays = alignMechanismOverlays;
    window.addEventListener("DOMContentLoaded", alignMechanismOverlays);
    window.addEventListener("load", alignMechanismOverlays);
    window.addEventListener("resize", alignMechanismOverlays);
    setTimeout(alignMechanismOverlays, 200);
  </script>
</body>
</html>`;
        fs.writeFileSync(artifactDir + "/chemdraw-reactions-preview.html", previewHtml, "utf-8");
      }
    } catch {
      // Ignore if running outside agent environment
    }
  });
});
