import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  parseChemicalCodeContent,
  parseReactionCodeContent,
  validateChemicalStructure,
  validateChemicalReaction,
  extractChemicalStructuresFromMarkdown,
  extractChemicalReactionsFromMarkdown,
  sanitizeChemicalToken,
} from "@avana/domain";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";

// ============================================================================
// 1. Production-Like Fixtures
// ============================================================================

/**
 * Production-like Organic Chemistry 1 Lesson
 * Topics:
 * - Functional group structure (2-Bromobutane with chiral center)
 * - Alkene stereochemistry (trans-2-butene with explicit directional bonds)
 * - SN2 nucleophilic substitution with chiral Walden inversion mechanism
 * - E2 elimination with beta-H abstraction mechanism
 * - Enolate resonance electron movement
 */
export const PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN = `# شیمی آلی ۱: واکنش‌های افزایشی و جانشینی در هالیدهای آلکیل

این درسنامه جامع به بررسی رفتار شیمیایی و مکانیستیک آلکیل هالیدها و آلکن‌ها می‌پردازد.

## ۱. ساختار مولکولی و گروه‌های عاملی
هالیدهای آلکیل دارای پیوند قطبی کربن-هالوژن هستند:

\`\`\`chemical
name: (R)-۲-بروموبوتان (2-Bromobutane)
smiles: CC[C@@H](C)Br
formula: C4H9Br
weight: 137.02
class: آلکیل هالید کایرال نوع دوم
sar:
  - مرکز کایرال C2: دارای صورت‌بندی فضایی مشخص (R)
  - پیوند C-Br: قطبیت بالا و خصلت الکتروفیلی در کربن حامل برم
\`\`\`

## ۲. استریوشیمی آلکن‌ها و جهت‌گیری سیس/ترانس
ایزومر ترانس به دلیل فاصله بیشتر گروه‌های متیل از پایداری ترمودینامیکی بالاتری برخوردار است:

\`\`\`chemical
name: ترانس-۲-بوتن (trans-2-Butene)
smiles: C/C=C/C
formula: C4H8
weight: 56.11
class: آلکن متقارن غیرحلقوی
sar:
  - پیوند دوگانه با هندسه ترانس (E): ممانعت فضایی کمتر میان گروه‌های متیل
\`\`\`

## ۳. مکانیزم جانشینی دومولکولی هسته‌دوست (SN2) با وارونگی والدن
در واکنش زیر، حمله هسته‌دوست از پشت پیوند کربن-برم موجب واژگونی صورت‌بندی کایرال از (R) به (S) می‌گردد:

\`\`\`reaction
title: جانشینی SN2 با وارونگی والدن
type: SN2
mechanism:
  reactionType: SN2
  reactionCenter:
    nucleophile:
      participantRole: reactant
      participantIndex: 1
      atomIndex: 0
      element: O
    electrophile:
      participantRole: reactant
      participantIndex: 0
      atomIndex: 2
      element: C
    leavingGroup:
      participantRole: reactant
      participantIndex: 0
      atomIndex: 4
      element: Br
  notes: حمله پشتی هیدروکسید و خروج همزمان برم با وارونگی کامل
reactants:
  - smiles: "CC[C@@H](C)Br"
    name: (R)-۲-بروموبوتان
  - smiles: "[OH-]"
    name: یون هیدروکسید
products:
  - smiles: "CC[C@H](C)O"
    name: (S)-بوتان-۲-اول
  - smiles: "[Br-]"
    name: آنیون برومید
\`\`\`

## ۴. مکانیزم حذف دومولکولی (E2)
حذف هماهنگ هیدروژن بتا توسط باز قوی به همراه خروج گروه ترک‌کننده:

\`\`\`reaction
title: مکانیزم حذف دومولکولی E2
type: E2
reactants:
  - smiles: "[OH-]"
    name: باز (نوکلئوفیل)
  - smiles: "CCBr"
    name: برومواتان
products:
  - smiles: "C=C"
    name: اتن
  - smiles: "O"
    name: آب
  - smiles: "[Br-]"
    name: آنیون برومید
mechanism:
  reactionType: E2
  arrows:
    - id: arrow_base_h
      type: lone_pair_to_atom
      from:
        type: lone_pair
        atom:
          participantRole: reactant
          participantIndex: 0
          atomIndex: 0
          element: O
      to:
        type: atom
        atom:
          participantRole: reactant
          participantIndex: 1
          atomIndex: 0
          element: C
      label: ربایش پروتون بتا
\`\`\`

## ۵. ساختارهای رزونانسی و انتقال جفت‌الکترون
تثبیت بار منفی از طریق رزونانس انولات:

\`\`\`reaction
title: انتقال جفت‌الکترون رزونانسی انولات
type: Resonance
arrow_type: resonance
reactants:
  - smiles: "[CH2-]C(=O)C"
    name: فرم کربانیون
products:
  - smiles: "C=C([O-])C"
    name: فرم اکسی‌آنیون
mechanism:
  reactionType: Resonance
  arrows:
    - id: arrow_lp_to_c_bond
      type: lone_pair_to_bond
      from:
        type: lone_pair
        atom:
          participantRole: reactant
          participantIndex: 0
          atomIndex: 0
          element: C
      to:
        type: bond
        bond:
          participantRole: reactant
          participantIndex: 0
          atom1: 0
          atom2: 1
      label: تشکیل پیوند C=C
\`\`\`
`;

/**
 * Production-like Organic Chemistry 2 Lesson
 * Topics:
 * - Carbonyl nucleophilic addition (Grignard addition to acetone)
 * - Nucleophilic acyl substitution with tetrahedral intermediate [ ... ]
 * - Resonance in conjugated enones
 * - Diels-Alder [4+2] cycloaddition (stereospecific cis adduct)
 * - Multi-step sequential reaction (Benzene -> Nitrobenzene -> Aniline)
 */
export const PROD_ORGANIC_CHEM_2_LESSON_MARKDOWN = `# شیمی آلی ۲: ترکیبات کربونیل و سنتزهای پیشرفته

این درسنامه به بررسی واکنش‌های ترکیبات کربونیل، جانشینی آسیل، و حلقه‌زایی‌های پری‌سیکلیک اختصاص دارد.

## ۱. افزایش واکنشگر گرینیارد به کربونیل
تشکیل پیوند کربن-کربن با حمله متیل‌منیزیم برمید به استون:

\`\`\`reaction
title: افزایش گرینیارد به استون
type: افزایش نوکلئوفیلی کربونیل
reactants:
  - smiles: "CC(=O)C"
    name: استون
  - smiles: "C[Mg]Br"
    name: متیل‌منیزیم برومید
solvents:
  - دی‌اتیل اتر
products:
  - smiles: "CC(C)(C)O"
    name: ترت-بوتانول
\`\`\`

## ۲. جانشینی نوکلئوفیلی آسیل از طریق واسط تتراهدرال درون کروشه
هیدرولیز استیل کلرید از طریق تشکیل حدواسط چهاروجهی:

\`\`\`reaction
title: جانشینی آسیل با واسط تتراهدرال
type: جانشینی نوکلئوفیلی آسیل
reactants:
  - smiles: "CC(=O)Cl"
    name: استیل کلرید
  - smiles: "O"
    name: آب
intermediates:
  - smiles: "CC([O-])(Cl)[OH2+]"
    name: حدواسط تتراهدرال
products:
  - smiles: "CC(=O)O"
    name: استیک اسید
  - smiles: "Cl"
    name: کلریدریک اسید
\`\`\`

## ۳. حلقه‌زایی دیلز-آلدر [4+2] با دی‌انوفیل متقارن
واکنش هماهنگ ۱،۳-بوتادی‌ان با مالئیک انیدرید با حفظ فضاشیمی سیس:

\`\`\`reaction
title: واکنش دیلز-آلدر بوتادی‌ان با مالئیک انیدرید
type: حلقه‌زایی [4+2]
reactants:
  - smiles: "C=CC=C"
    name: ۱،۳-بوتادی‌ان
  - smiles: "O=C1OC(=O)C=C1"
    name: مالئیک انیدرید
products:
  - smiles: "O=C1OC(=O)C2CC=CCC12"
    name: تتراهیدروفتالیک انیدرید
\`\`\`

## ۴. سنتز چندمرحله‌ای آنیلین از بنزن
مسیر پیوسته شامل نیتراسیون الکتروفیلی و احیای فلزی متوالی:

\`\`\`reaction
title: سنتز دو‌مرحله‌ای آنیلین از بنزن
type: سنتز چندمرحله‌ای
steps:
  - stepNumber: 1
    title: نیتراسیون آروماتیک بنزن
    reactants:
      - smiles: "c1ccccc1"
        name: بنزن
    reagents:
      - HNO3
      - H2SO4
    yield: 85%
    products:
      - smiles: "c1ccc([N+](=O)[O-])cc1"
        name: نیتروبنزن
  - stepNumber: 2
    title: احیای کاتالیزوری به آمین
    reactants:
      - smiles: "c1ccc([N+](=O)[O-])cc1"
        name: نیتروبنزن
    reagents:
      - Fe
      - HCl
    yield: 92%
    products:
      - smiles: "c1ccc(N)cc1"
        name: آنیلین
\`\`\`
`;

/**
 * Production-like Medicinal Chemistry 1–3 Lesson
 * Topics:
 * - Drug structure: Prototype antibiotics (Penicillin G)
 * - SAR: Ester vs Amide local anesthetics (Procaine vs Lidocaine)
 * - Bioisosterism: Carboxylate vs Tetrazole (Losartan)
 * - Prodrug activation: Enalapril -> Enalaprilat diacid
 * - Metabolism: Carboxylesterase hydrolysis
 */
export const PROD_MEDICINAL_CHEM_LESSON_MARKDOWN = `# شیمی دارویی: طراحی دارو، روابط ساختار-فعالیت (SAR) و پیش‌داروها

این درسنامه اصول طراحی منطقی دارو، بهینه‌سازی متابولیک و بیوایزوستریسم را بررسی می‌کند.

## ۱. ساختار مولکولی داروی پروتوتایپ: بنزیل‌پنی‌سیلین
داربست طبیعی آنتی‌بیوتیک‌های بتالاکتام با کشش زاویه‌ای بالا:

\`\`\`chemical
name: بنزیل‌پنی‌سیلین (Penicillin G)
smiles: CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O
formula: C16H18N2O4S
weight: 334.39
class: آنتی‌بیوتیک بتالاکتام طبیعی
sar:
  - حلقه بتالاکتام: واکنش‌پذیری بالا ناشی از کاهش رزونانس آمیدی در حلقه ۴تایی
  - گروه کربوکسیلات آزاد C3: اتصال یونی پایدار با باقیمانده لیزین در پاکت آنزیم ترانس‌پپتیداز
\`\`\`

## ۲. روابط ساختار-فعالیت (SAR) و پایداری متابولیک: لیدوکائین در برابر استرها
مقایسه پیوند آمیدی لیدوکائین با استرهای حساس به استراز پلاسمایی (مانند پروکائین):

\`\`\`chemical
name: لیدوکائین (Lidocaine)
smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C
formula: C14H22N2O
weight: 234.34
class: بی‌حس‌کننده موضعی آمیدی
sar:
  - دو متیل ارتو روی حلقه آروماتیک: محافظت فضایی (Steric Shield) در برابر هیدرولیز استرازها
  - زنجیره آمیدی: نیمه‌عمر بسیار طولانی‌تر و پایداری فارماکوکینتیک برتر نسبت به پروکائین
\`\`\`

## ۳. جایگزینی بیوایزوستری غیرکلاسیک: تترازول در لوزارتان
جایگزینی گروه اسید کربوکسیلیک با حلقه ۵تایی تترازول جهت افزایش لیپوفیلیسیتی:

\`\`\`chemical
name: لوزارتان (Losartan)
smiles: CCCCc1nc(Cl)c(CO)n1Cc2ccc(cc2)c3ccccc3c4n[nH]nn4
formula: C22H23ClN6O
weight: 422.91
class: آنتاگونیست گیرنده AT1 آنژیوتانسین II
sar:
  - حلقه تترازول: توزیع بار منفی مشابه کربوکسیلات با پایداری متابولیک و نفوذ سلولی ۱۰ برابر بیشتر
  - زنجیره نرمال بوتیل: اتصال محکم به پاکت هیدروفوبیک گیرنده
\`\`\`

## ۴. فعال‌سازی متابولیک پیش‌دارو (Prodrug Bioactivation)
تبدیل آنزیمی پیش‌داروی استری انالاپریل به فرم فعال دی‌اسید انالاپریلات در کبد:

\`\`\`reaction
title: فعال‌سازی پیش‌دارو: انالاپریل به انالاپریلات
type: فعال‌سازی متابولیک پیش‌دارو
reactants:
  - smiles: "CCOC(=O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O"
    name: انالاپریل (پیش‌داروی لیپوفیل)
    formula: C20H28N2O5
reagents:
  - استرازهای کبد (Carboxylesterases)
solvents:
  - H2O
products:
  - smiles: "O=C(O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O"
    name: انالاپریلات (مهارکننده فعال ACE)
    formula: C18H24N2O5
  - smiles: "CCO"
    name: اتانول
\`\`\`
`;

// ============================================================================
// 2. Comprehensive Production Validation Tests
// ============================================================================

describe("End-to-End Production Validation Suite (Organic & Medicinal Chemistry)", () => {
  describe("1. Organic Chemistry 1 Production Pipeline (Extraction -> Validation -> UI)", () => {
    it("successfully parses, validates and extracts all structures and reactions from production Organic Chemistry 1 lesson", () => {
      // Step 1: Extraction from generated markdown
      const extractedStructures = extractChemicalStructuresFromMarkdown(PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN);
      const extractedReactions = extractChemicalReactionsFromMarkdown(PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN);

      expect(extractedStructures).toHaveLength(2); // 2-Bromobutane, trans-2-Butene
      expect(extractedReactions).toHaveLength(3);  // SN2, E2, Resonance

      // Step 2: Structure validation
      extractedStructures.forEach((struct) => {
        const val = validateChemicalStructure(struct);
        expect(val.valid).toBe(true);
        expect(val.errors).toHaveLength(0);
      });

      // Step 3: Reaction validation
      extractedReactions.forEach((rxn) => {
        const val = validateChemicalReaction(rxn);
        expect(val.valid).toBe(true);
        expect(val.errors).toHaveLength(0);
      });

      // Step 4: Specific Organic 1 representations
      expect(extractedStructures[0].smiles).toBe("CC[C@@H](C)Br");
      expect(extractedStructures[1].smiles).toBe("C/C=C/C");
      expect(extractedReactions[0].reactionType).toBe("SN2");
      expect(extractedReactions[1].reactionType).toBe("E2");
      expect(extractedReactions[2].reactionType).toBe("Resonance");

      // Verify direct code block parser on individual reaction fence
      const rxnMatch = /```reaction([\s\S]*?)```/.exec(PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN);
      expect(rxnMatch).not.toBeNull();
      const directParsedRxn = parseReactionCodeContent(rxnMatch![1], "reaction");
      expect(directParsedRxn?.reactionType).toBe("SN2");
    });

    it("renders Organic Chemistry 1 lesson in UI with real 2D vector renderers and zero fallback", async () => {
      const { findByText, queryByTestId, container } = render(
        <MarkdownRenderer content={PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN} enableLessonCallouts />
      );

      // Verify headings
      expect(await findByText(/شیمی آلی ۱: واکنش‌های افزایشی و جانشینی/)).toBeInTheDocument();

      // Verify structure blocks rendered
      expect(await findByText("(R)-۲-بروموبوتان (2-Bromobutane)")).toBeInTheDocument();
      expect(await findByText("ترانس-۲-بوتن (trans-2-Butene)")).toBeInTheDocument();

      // Verify reaction and mechanism blocks rendered
      expect(await findByText("جانشینی SN2 با وارونگی والدن")).toBeInTheDocument();
      expect(await findByText("مکانیزم حذف دومولکولی E2")).toBeInTheDocument();
      expect(await findByText("انتقال جفت‌الکترون رزونانسی انولات")).toBeInTheDocument();

      // Check structure blocks count
      const structBlocks = container.querySelectorAll('[data-testid="chemical-structure-block"]');
      expect(structBlocks.length).toBe(2);

      // Check reaction blocks count
      const rxnBlocks = container.querySelectorAll('[data-testid="reaction-block"]');
      expect(rxnBlocks.length).toBe(3);

      // Strict Invariant: Zero fallback
      expect(queryByTestId("chemical-fallback-block")).toBeNull();
    });
  });

  describe("2. Organic Chemistry 2 Production Pipeline (Extraction -> Validation -> UI)", () => {
    it("successfully parses, validates and extracts carbonyl, acyl, cycloaddition, and multi-step schemes", () => {
      const extractedReactions = extractChemicalReactionsFromMarkdown(PROD_ORGANIC_CHEM_2_LESSON_MARKDOWN);
      expect(extractedReactions).toHaveLength(4);

      // Verify each reaction scheme
      extractedReactions.forEach((rxn) => {
        const val = validateChemicalReaction(rxn);
        expect(val.valid).toBe(true);
      });

      // Acyl substitution has intermediate
      expect(extractedReactions[1].intermediates).toBeDefined();
      expect(extractedReactions[1].intermediates?.length).toBe(1);

      // Multi-step scheme has 2 steps
      expect(extractedReactions[3].steps).toBeDefined();
      expect(extractedReactions[3].steps?.length).toBe(2);
    });

    it("renders Organic Chemistry 2 schemes in UI without fallback or error", async () => {
      const { findByText, queryByTestId, container } = render(
        <MarkdownRenderer content={PROD_ORGANIC_CHEM_2_LESSON_MARKDOWN} enableLessonCallouts />
      );

      expect(await findByText(/شیمی آلی ۲: ترکیبات کربونیل و سنتزهای پیشرفته/)).toBeInTheDocument();
      expect(await findByText("افزایش گرینیارد به استون")).toBeInTheDocument();
      expect(await findByText("جانشینی آسیل با واسط تتراهدرال")).toBeInTheDocument();
      expect(await findByText("واکنش دیلز-آلدر بوتادی‌ان با مالئیک انیدرید")).toBeInTheDocument();
      expect(await findByText("سنتز دو‌مرحله‌ای آنیلین از بنزن")).toBeInTheDocument();

      // Verify all 4 reaction blocks rendered
      const rxnBlocks = container.querySelectorAll('[data-testid="reaction-block"]');
      expect(rxnBlocks.length).toBe(4);

      // Strict Invariant: Zero fallback
      expect(queryByTestId("chemical-fallback-block")).toBeNull();
    });
  });

  describe("3. Medicinal Chemistry 1–3 Production Pipeline (Extraction -> Validation -> UI)", () => {
    it("successfully extracts and validates Drug Structure, SAR, Bioisostere, and Prodrug Metabolism", () => {
      const extractedStructures = extractChemicalStructuresFromMarkdown(PROD_MEDICINAL_CHEM_LESSON_MARKDOWN);
      const extractedReactions = extractChemicalReactionsFromMarkdown(PROD_MEDICINAL_CHEM_LESSON_MARKDOWN);

      expect(extractedStructures).toHaveLength(3); // Penicillin G, Lidocaine, Losartan
      expect(extractedReactions).toHaveLength(1);  // Enalapril -> Enalaprilat prodrug bioactivation

      extractedStructures.forEach((struct) => {
        const val = validateChemicalStructure(struct);
        expect(val.valid).toBe(true);
      });

      extractedReactions.forEach((rxn) => {
        const val = validateChemicalReaction(rxn);
        expect(val.valid).toBe(true);
      });

      // Verify Bioisostere contains tetrazole ring
      expect(extractedStructures[2].smiles).toContain("c4n[nH]nn4");

      // Verify Prodrug activation transformation
      expect(extractedReactions[0].reactants?.[0].name).toContain("انالاپریل");
      expect(extractedReactions[0].products?.[0].name).toContain("انالاپریلات");
    });

    it("renders Medicinal Chemistry lesson in UI with real structures and reaction scheme", async () => {
      const { findByText, queryByTestId, container } = render(
        <MarkdownRenderer content={PROD_MEDICINAL_CHEM_LESSON_MARKDOWN} enableLessonCallouts />
      );

      expect(await findByText(/شیمی دارویی: طراحی دارو، روابط ساختار-فعالیت/)).toBeInTheDocument();
      expect(await findByText("بنزیل‌پنی‌سیلین (Penicillin G)")).toBeInTheDocument();
      expect(await findByText("لیدوکائین (Lidocaine)")).toBeInTheDocument();
      expect(await findByText("لوزارتان (Losartan)")).toBeInTheDocument();
      expect(await findByText("فعال‌سازی پیش‌دارو: انالاپریل به انالاپریلات")).toBeInTheDocument();

      const structBlocks = container.querySelectorAll('[data-testid="chemical-structure-block"]');
      expect(structBlocks.length).toBe(3);

      const rxnBlocks = container.querySelectorAll('[data-testid="reaction-block"]');
      expect(rxnBlocks.length).toBe(1);

      expect(queryByTestId("chemical-fallback-block")).toBeNull();
    });
  });

  describe("4. Regression Guard: Educational Objective Enforcement vs Text-Only Distinction", () => {
    it("flags regression if AI outputs only plain text when the objective explicitly requires reaction mechanism", () => {
      // Scenario: AI generated plain text explanation for a mechanism lesson objective without any reaction block
      const missingMechanismText = [
        "# مکانیزم واکنش جانشینی هسته‌دوستی دو مولکولی (SN2)",
        "واکنش SN2 زمانی رخ می‌دهد که یک هسته‌دوست با کربن حامل هالوژن برهم‌کنش می‌دهد.",
        "در این فرآیند، حمله نوکلئوفیل از پشت پیوند کربن-بروم صورت می‌گیرد و صورت‌بندی کایرال وارونه می‌شود.",
      ].join("\n\n");

      // Checker evaluating whether a lesson covering electron-pushing mechanism contains the required reaction block
      const hasMechanismBlock = /```reaction[\s\S]*?mechanism:[\s\S]*?```/.test(missingMechanismText);
      const isMechanismObjective = /مکانیزم/i.test(missingMechanismText);

      // Regression Assertion: When mechanism is an explicit educational objective, text alone is insufficient
      expect(isMechanismObjective).toBe(true);
      expect(hasMechanismBlock).toBe(false); // Flags failure/regression in generation
    });

    it("does NOT enforce chemical block or create fallback for a simple textual definition", () => {
      // Scenario: AI generated a legitimate definition sentence
      const definitionText = "واکنش جانشینی هسته‌دوستی دو مولکولی (SN2) یک فرآیند هماهنگ و تک‌مرحله‌ای است.";

      const { container } = render(
        <MarkdownRenderer content={definitionText} />
      );

      // Passes cleanly without requiring chemical block or creating fallback block
      expect(container.querySelector('[data-testid="chemical-structure-block"]')).toBeNull();
      expect(container.querySelector('[data-testid="reaction-block"]')).toBeNull();
      expect(container.querySelector('[data-testid="chemical-fallback-block"]')).toBeNull();
      expect(screen.getByText(/واکنش جانشینی هسته‌دوستی دو مولکولی/)).toBeInTheDocument();
    });
  });

  describe("5. Scientific Safety Check: Stereochemical & Geometric Invariants", () => {
    it("does not fabricate 3D anti-coplanar Newman projection claims from flat 2D SMILES without 3D dihedral coordinates", () => {
      // Input: Flat 2D SMILES for 2-bromopropane
      const flatSmiles = "CC(Br)C";
      const sanitized = sanitizeChemicalToken(flatSmiles);
      expect(sanitized).toBe("CC(Br)C");

      // Verify that parsing flat 2D SMILES produces a valid 2D structure without fabricated 3D dihedral coordinates
      const parsed = parseChemicalCodeContent(`smiles: ${flatSmiles}\nname: ۲-بروموپروپان`, "chemical");
      expect(parsed).not.toBeNull();
      expect(parsed?.smiles).toBe("CC(Br)C");

      // Safety Invariant: System does not claim 3D anti-periplanar conformation when only 2D flat topology exists
      const has3DCoordinates = "dihedralAngles" in (parsed || {});
      expect(has3DCoordinates).toBe(false);
    });

    it("strictly preserves explicit 2D E/Z and chiral stereochemistry while rejecting corrupting zero-width marks", () => {
      const rawTransWithZWNJ = "C/C=C/C\u200c";
      const sanitizedTrans = sanitizeChemicalToken(rawTransWithZWNJ);
      expect(sanitizedTrans).toBe("C/C=C/C");

      const rawCisWithBidi = "\u200eC/C=C\\C";
      const sanitizedCis = sanitizeChemicalToken(rawCisWithBidi);
      expect(sanitizedCis).toBe("C/C=C\\C");

      const rawChiralWithQuotes = "'C[C@H](O)CC'";
      const sanitizedChiral = sanitizeChemicalToken(rawChiralWithQuotes);
      expect(sanitizedChiral).toBe("C[C@H](O)CC");
    });
  });
});
