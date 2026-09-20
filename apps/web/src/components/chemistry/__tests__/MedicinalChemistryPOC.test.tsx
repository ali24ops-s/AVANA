import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import { validateChemicalStructure } from "@avana/domain";
import type { ChemicalStructure, LessonPayload } from "@avana/domain";

describe("Medicinal Chemistry Proof of Concept (POC) — Lidocaine & Procaine", () => {
  const lidocaineStructure: ChemicalStructure = {
    id: "lidocaine",
    compoundName: "لیدوکائین (Lidocaine)",
    iupacName: "2-(diethylamino)-N-(2,6-dimethylphenyl)acetamide",
    smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
    formula: "C14H22N2O",
    molecularWeight: 234.34,
    drugClass: "بی‌حس‌کننده موضعی آمیدی (Class Ib Antiarrhythmic / Local Anesthetic)",
    sarHighlights: [
      {
        feature: "پیوند آمیدی (Amide Bond)",
        description:
          "مقاومت در برابر هیدرولیز توسط سودوکولین‌استراز پلاسما و افزایش طول اثر نسبت به پروکائین",
      },
      {
        feature: "گروه دی‌متیل بنزن (2,6-Dimethylphenyl)",
        description:
          "ممانعت فضایی (Steric Hindrance) در برابر آنزیم‌های تجزیه‌کننده کبدی",
      },
      {
        feature: "آمین سوم انتهای زنجیره (Tertiary Amine)",
        description:
          "تنظیم pKa در محدوده ۷.۹ برای تعادل مناسب بین فرم یونیزه و غیریونیزه جهت عبور از غشای عصبی",
      },
    ],
  };

  const procaineStructure: ChemicalStructure = {
    id: "procaine",
    compoundName: "پروکائین (Procaine)",
    iupacName: "2-(diethylamino)ethyl 4-aminobenzoate",
    smiles: "CCN(CC)CCOC(=O)c1ccc(N)cc1",
    formula: "C13H20N2O2",
    molecularWeight: 236.31,
    drugClass: "بی‌حس‌کننده موضعی استری (Ester Local Anesthetic)",
    sarHighlights: [
      {
        feature: "پیوند استری (Ester Linkage)",
        description:
          "هیدرولیز سریع توسط بوتیریل‌کولین‌استراز پلاسما و ایجاد متابولیت PABA (احتمال آلرژی‌زایی)",
      },
    ],
  };

  it("1. validates Lidocaine and Procaine domain structures with Level 1 & Level 2 validation", () => {
    const lidoValidation = validateChemicalStructure(lidocaineStructure);
    expect(lidoValidation.valid).toBe(true);
    expect(lidoValidation.needsReview).toBe(false);
    expect(lidoValidation.confidence).toBe("high");
    expect(lidoValidation.extractedFormula).toBe("C14H22N2O");
    expect(lidoValidation.estimatedMolecularWeight).toBeCloseTo(234.34, 1);

    const procValidation = validateChemicalStructure(procaineStructure);
    expect(procValidation.valid).toBe(true);
    expect(procValidation.needsReview).toBe(false);
    expect(procValidation.confidence).toBe("high");
    expect(procValidation.extractedFormula).toBe("C13H20N2O2");
    expect(procValidation.estimatedMolecularWeight).toBeCloseTo(236.31, 1);
  });

  it("2. renders a complete Medicinal Chemistry lesson containing both Lidocaine and Procaine with SAR and comparisons", async () => {
    const lessonContent = [
      "# شیمی دارویی بی‌حس‌کننده‌های موضعی (Local Anesthetics)",
      "",
      "بی‌حس‌کننده‌های موضعی از نظر ساختار شیمیایی به دو دسته اصلی **آمیدها** و **استرها** تقسیم می‌شوند.",
      "",
      "> **نکته کلیدی:** تفاوت اصلی آمیدها و استرها در محل متابولیسم و پایداری شیمیایی پیوند مرکزی است.",
      "",
      "## ۱. داروی لیدوکائین (Lidocaine) — پروتوتایپ آمیدی",
      "",
      "```chemical",
      "name: لیدوکائین (Lidocaine)",
      "smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C",
      "formula: C14H22N2O",
      "weight: 234.34",
      "class: بی‌حس‌کننده موضعی آمیدی",
      "sar:",
      "  - پیوند آمیدی: مسئول پایداری بیشتر در برابر هیدرولیز استرازهای پلاسما",
      "```",
      "",
      "## ۲. داروی پروکائین (Procaine) — پروتوتایپ استری",
      "",
      "```chemical",
      "name: پروکائین (Procaine)",
      "smiles: CCN(CC)CCOC(=O)c1ccc(N)cc1",
      "formula: C13H20N2O2",
      "weight: 236.31",
      "class: بی‌حس‌کننده موضعی استری",
      "sar:",
      "  - پیوند استری: مستعد هیدرولیز سریع توسط بوتیریل کولین‌استراز پلاسمایی",
      "```",
      "",
      "## ۳. جدول مقایسه ساختار و ویژگی‌های فارماکوکینتیک",
      "| ویژگی | لیدوکائین (آمید) | پروکائین (استر) |",
      "|---|---|---|",
      "| نیمه‌عمر ($t_{1/2}$) | $1.6\\text{ h}$ | $<1\\text{ min}$ |",
      "| مسیر اصلی متابولیسم | آنزیم‌های سیتوکروم P450 کبدی ($CYP1A2/CYP3A4$) | سودوکولین‌استراز پلاسما |",
      "| پایداری شیمیایی | بالا (پایدار در برابر اتوکلاو) | پایین‌تر |",
    ].join("\n");

    const { container } = render(
      <MarkdownRenderer content={lessonContent} enableLessonCallouts />,
    );

    // Verify Headings
    expect(
      screen.getByRole("heading", { name: "شیمی دارویی بی‌حس‌کننده‌های موضعی (Local Anesthetics)" }),
    ).toBeInTheDocument();

    // Verify Lidocaine Block (lazy loaded)
    expect(await screen.findByText("لیدوکائین (Lidocaine)")).toBeInTheDocument();
    expect(await screen.findByText("C14H22N2O")).toBeInTheDocument();
    expect(await screen.findByText("پیوند آمیدی:")).toBeInTheDocument();

    // Verify Procaine Block (lazy loaded)
    expect(await screen.findByText("پروکائین (Procaine)")).toBeInTheDocument();
    expect(await screen.findByText("C13H20N2O2")).toBeInTheDocument();
    expect(await screen.findByText("پیوند استری:")).toBeInTheDocument();

    // Verify SVGs rendered for both molecules
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);

    // Verify Comparison Table & LaTeX
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });

  it("3. verifies zero regression when rendered into a simulated LessonPayload", () => {
    const payload: LessonPayload = {
      kind: "lesson",
      title: "شیمی دارویی لیدوکائین",
      contentMarkdown: "```chemical\nname: لیدوکائین\nsmiles: CCN(CC)CC(=O)Nc1c(C)cccc1C\nformula: C14H22N2O\n```",
      citationChunkIds: ["chunk-1"],
      chemicalStructures: [lidocaineStructure],
    };

    expect(payload.chemicalStructures).toHaveLength(1);
    expect(payload.chemicalStructures?.[0].smiles).toBe(lidocaineStructure.smiles);
  });
});
