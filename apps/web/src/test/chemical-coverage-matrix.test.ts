import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  parseChemicalCodeContent,
  parseReactionCodeContent,
  validateChemicalStructure,
  validateChemicalReaction,
  sanitizeChemicalToken,
} from "@avana/domain";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";

interface CoverageArchetype {
  id: string;
  course: "Organic Chemistry 1" | "Organic Chemistry 2" | "Medicinal Chemistry 1" | "Medicinal Chemistry 2" | "Medicinal Chemistry 3";
  title: string;
  expectedRepresentation: "text-only" | "structure" | "reaction" | "mechanism";
  markdown: string;
  description: string;
  verifyContent?: (container: HTMLElement) => void;
}

const COVERAGE_MATRIX: CoverageArchetype[] = [
  // -------------------------------------------------------------
  // Organic Chemistry 1 & 2 Archetypes (10 Archetypes)
  // -------------------------------------------------------------
  {
    id: "org-01",
    course: "Organic Chemistry 1",
    title: "Alkene Electrophilic Addition (Markovnikov Hydrohalogenation)",
    expectedRepresentation: "reaction",
    description: "Addition of HBr to isobutylene yielding 2-bromo-2-methylpropane via carbocation intermediate",
    markdown: [
      "## هیدروهالوژناسیون مارکونیکوف آلکن",
      "واکنش افزایش هیدروژن برومید به ایزوبوتیلن طبق قاعده مارکونیکوف:",
      "```reaction",
      "title: افزایش HBr به ایزوبوتیلن",
      "type: افزایش الکتروفیلی",
      "reactants:",
      "  - smiles: CC(C)=C",
      "    name: ایزوبوتیلن (۲-متیل‌پروپن)",
      "  - smiles: Br",
      "    name: هیدروژن برومید",
      "products:",
      "  - smiles: CC(C)(Br)C",
      "    name: ۲-برومو-۲-متیل‌پروپان",
      "```",
    ].join("\n"),
  },
  {
    id: "org-02",
    course: "Organic Chemistry 1",
    title: "SN2 Nucleophilic Substitution with Chiral Walden Inversion",
    expectedRepresentation: "mechanism",
    description: "Concerted backside nucleophilic attack with complete chiral stereocenter inversion from (R) to (S)",
    markdown: [
      "## جانشینی دو مولکولی هسته‌دوست (SN2)",
      "```reaction",
      "title: واکنش SN2 با وارونگی والدن",
      "type: SN2",
      "mechanism:",
      "  reactionType: SN2",
      "  reactionCenter:",
      "    nucleophile:",
      "      participantRole: reactant",
      "      participantIndex: 1",
      "      atomIndex: 0",
      "      element: O",
      "    electrophile:",
      "      participantRole: reactant",
      "      participantIndex: 0",
      "      atomIndex: 2",
      "      element: C",
      "    leavingGroup:",
      "      participantRole: reactant",
      "      participantIndex: 0",
      "      atomIndex: 4",
      "      element: Br",
      "  notes: حمله پشتی هیدروکسید و خروج همزمان برم",
      "reactants:",
      "  - smiles: CC[C@@H](C)Br",
      "    name: (R)-۲-بروموبوتان",
      "  - smiles: [OH-]",
      "    name: یون هیدروکسید",
      "products:",
      "  - smiles: CC[C@H](C)O",
      "    name: (S)-بوتان-۲-اول",
      "  - smiles: [Br-]",
      "    name: آنیون برومید",
      "```",
    ].join("\n"),
  },
  {
    id: "org-03",
    course: "Organic Chemistry 1",
    title: "SN1 Substitution with Carbocation Intermediate",
    expectedRepresentation: "reaction",
    description: "Stepwise solvolysis of tert-butyl bromide with planar carbocation intermediate bracket [ ... ]",
    markdown: [
      "## جانشینی یک‌مولکولی با کربوکاتیون واسط (SN1)",
      "```reaction",
      "title: سولولیز ترت-بوتیل برومید",
      "type: SN1",
      "reactants:",
      "  - smiles: CC(C)(C)Br",
      "    name: ترت-بوتیل برومید",
      "intermediates:",
      "  - smiles: CC([C+])(C)C",
      "    name: کربوکاتیون ترت-بوتیل",
      "products:",
      "  - smiles: CC(C)(C)O",
      "    name: ترت-بوتانول",
      "```",
    ].join("\n"),
  },
  {
    id: "org-04",
    course: "Organic Chemistry 1",
    title: "E2 Elimination with Anti-Periplanar Geometry and Stereospecific trans-Alkene",
    expectedRepresentation: "mechanism",
    description: "Concerted bimolecular elimination requiring anti-coplanar H-C-C-Br alignment yielding trans-2-butene",
    markdown: [
      "## حذف دومولکولی E2 با جهت‌گیری آنتی‌کوپلانار",
      "```reaction",
      "title: حذف هماهنگ E2",
      "type: E2",
      "mechanism:",
      "  reactionType: E2",
      "  arrows:",
      "    - id: arrow_base_h",
      "      type: lone_pair_to_atom",
      "      from:",
      "        type: lone_pair",
      "        atom:",
      "          participantRole: reactant",
      "          participantIndex: 0",
      "          atomIndex: 0",
      "          element: O",
      "      to:",
      "        type: atom",
      "        atom:",
      "          participantRole: reactant",
      "          participantIndex: 1",
      "          atomIndex: 0",
      "          element: C",
      "      label: ربایش پروتون بتا",
      "reactants:",
      "  - smiles: [OH-]",
      "    name: باز قوی",
      "  - smiles: CCBr",
      "    name: برومواتان",
      "products:",
      "  - smiles: C=C",
      "    name: اتن (محصول زایتسف)",
      "  - smiles: O",
      "    name: آب",
      "  - smiles: [Br-]",
      "    name: برومید",
      "```",
    ].join("\n"),
  },
  {
    id: "org-05",
    course: "Organic Chemistry 1",
    title: "E1 Elimination Dehydration of Tertiary Alcohol",
    expectedRepresentation: "reaction",
    description: "Acid-catalyzed dehydration of 2-methyl-2-butanol with heat yielding the more substituted alkene",
    markdown: [
      "## آب‌گیری کاتالیزوری از الکل نوع سوم (E1)",
      "```reaction",
      "title: آب‌گیری اسیدی از ۲-متیل-۲-بوتانول",
      "type: E1 Dehydration",
      "reactants:",
      "  - smiles: CCC(C)(C)O",
      "    name: ۲-متیل-۲-بوتانول",
      "reagents:",
      "  - H2SO4",
      "conditions:",
      "  - Δ (۱۸۰ °C)",
      "products:",
      "  - smiles: CC=C(C)C",
      "    name: ۲-متیل-۲-بوتن",
      "  - smiles: O",
      "    name: آب",
      "```",
    ].join("\n"),
  },
  {
    id: "org-06",
    course: "Organic Chemistry 2",
    title: "Carbonyl Nucleophilic Addition (Grignard Addition to Ketone)",
    expectedRepresentation: "reaction",
    description: "Organometallic C-C bond formation attacking acetone yielding tertiary alkoxide",
    markdown: [
      "## افزایش واکنشگر گرینیارد به کربونیل کتون",
      "```reaction",
      "title: افزایش متیل‌منیزیم برمید به استون",
      "type: افزایش نوکلئوفیلی کربونیل",
      "reactants:",
      "  - smiles: CC(=O)C",
      "    name: استون",
      "  - smiles: C[Mg]Br",
      "    name: متیل‌منیزیم برومید",
      "solvents:",
      "  - دی‌اتیل اتر",
      "products:",
      "  - smiles: CC(C)(C)O",
      "    name: ترت-بوتانول",
      "```",
    ].join("\n"),
  },
  {
    id: "org-07",
    course: "Organic Chemistry 2",
    title: "Nucleophilic Acyl Substitution (Fischer Esterification)",
    expectedRepresentation: "reaction",
    description: "Reversible condensation between carboxylic acid and alcohol with tetrahedral intermediate pathway",
    markdown: [
      "## استریفیکاسیون فیشر",
      "```reaction",
      "title: استریفیکاسیون فیشر",
      "type: جانشینی نوکلئوفیلی آسیل",
      "reactants:",
      "  - smiles: CC(=O)O",
      "    name: اسید استیک",
      "  - smiles: CCO",
      "    name: اتانول",
      "reagents:",
      "  - H2SO4",
      "conditions:",
      "  - بازروانی (Reflux)",
      "products:",
      "  - smiles: CC(=O)OCC",
      "    name: اتیل استات",
      "  - smiles: O",
      "    name: آب",
      "```",
    ].join("\n"),
  },
  {
    id: "org-08",
    course: "Organic Chemistry 2",
    title: "Diels-Alder [4+2] Cycloaddition with Concerted Stereospecificity",
    expectedRepresentation: "reaction",
    description: "Pericyclic cycloaddition between diene and maleic anhydride retaining cis-stereochemistry",
    markdown: [
      "## حلقه‌زایی دیلز-آلدر با دی‌انوفیل متقارن",
      "```reaction",
      "title: واکنش دیلز-آلدر بوتادی‌ان با مالئیک انیدرید",
      "type: حلقه‌زایی [4+2]",
      "reactants:",
      "  - smiles: C=CC=C",
      "    name: ۱،۳-بوتادی‌ان",
      "  - smiles: O=C1OC(=O)C=C1",
      "    name: مالئیک انیدرید",
      "products:",
      "  - smiles: O=C1OC(=O)C2CC=CCC12",
      "    name: تتراهیدروفتالیک انیدرید",
      "```",
    ].join("\n"),
  },
  {
    id: "org-09",
    course: "Organic Chemistry 2",
    title: "Electrophilic Aromatic Substitution (EAS Nitration)",
    expectedRepresentation: "reaction",
    description: "Generation of nitronium ion (NO2+) and electrophilic attack on benzene ring yielding nitrobenzene",
    markdown: [
      "## نیتراسیون آروماتیک بنزن",
      "```reaction",
      "title: نیتراسیون الکتروفیلی بنزن",
      "type: جانشینی الکتروفیلی آروماتیک (EAS)",
      "reactants:",
      "  - smiles: c1ccccc1",
      "    name: بنزن",
      "reagents:",
      "  - HNO3",
      "  - H2SO4",
      "conditions:",
      "  - 50-55 °C",
      "products:",
      "  - smiles: c1ccc([N+](=O)[O-])cc1",
      "    name: نیتروبنزن",
      "  - smiles: O",
      "    name: آب",
      "```",
    ].join("\n"),
  },
  {
    id: "org-10",
    course: "Organic Chemistry 2",
    title: "Aldol Condensation & Enolate Resonance",
    expectedRepresentation: "mechanism",
    description: "Deprotonation forming resonance-stabilized enolate followed by nucleophilic attack on acetaldehyde",
    markdown: [
      "## تشکیل انولات و تراکم آلدول",
      "```reaction",
      "title: انتقال جفت‌الکترون رزونانسی انولات",
      "type: Resonance",
      "arrow_type: resonance",
      "reactants:",
      "  - smiles: \"[CH2-]C(=O)C\"",
      "    name: فرم کربانیون",
      "products:",
      "  - smiles: \"C=C([O-])C\"",
      "    name: فرم اکسی‌آنیون",
      "mechanism:",
      "  reactionType: Resonance",
      "  arrows:",
      "    - id: arrow_lp_to_c_bond",
      "      type: lone_pair_to_bond",
      "      from:",
      "        type: lone_pair",
      "        atom:",
      "          participantRole: reactant",
      "          participantIndex: 0",
      "          atomIndex: 0",
      "          element: C",
      "      to:",
      "        type: bond",
      "        bond:",
      "          participantRole: reactant",
      "          participantIndex: 0",
      "          atom1: 0",
      "          atom2: 1",
      "      label: تشکیل پیوند C=C",
      "```",
    ].join("\n"),
  },

  // -------------------------------------------------------------
  // Medicinal Chemistry 1, 2, & 3 Archetypes (10 Archetypes)
  // -------------------------------------------------------------
  {
    id: "med-01",
    course: "Medicinal Chemistry 1",
    title: "Beta-Lactam Antibiotic Strained Core & Serine Acylation",
    expectedRepresentation: "structure",
    description: "Strained 4-membered beta-lactam fused to thiazolidine ring with essential C3 carboxylate in Penicillin G",
    markdown: [
      "## فارماکوفور آنتی‌بیوتیک‌های بتالاکتام",
      "حلقه بتالاکتام با کشش زاویه‌ای بالا هدف آنزیم ترانس‌پپتیداز است:",
      "```chemical",
      "name: بنزیل‌پنی‌سیلین (Penicillin G)",
      "smiles: CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O",
      "formula: C16H18N2O4S",
      "class: آنتی‌بیوتیک بتالاکتام طبیعی",
      "sar:",
      "  - حلقه بتالاکتام: واکنش‌پذیری بالا ناشی از نبود رزونانس آمیدی در حلقه ۴تایی",
      "  - گروه کربوکسیل C3: پیوند یونی حیاتی با باقیمانده لیزین در جایگاه فعال آنزیم",
      "```",
    ].join("\n"),
  },
  {
    id: "med-02",
    course: "Medicinal Chemistry 1",
    title: "ACE Inhibitor Pharmacophore & Prodrug Bioactivation",
    expectedRepresentation: "reaction",
    description: "Lipophilic monoester prodrug Enalapril hydrolyzed by hepatic carboxylesterases to active diacid Enalaprilat",
    markdown: [
      "## بیواکتیواسیون پیش‌داروی انالاپریل",
      "انالاپریل برای بهبود نفوذ زیستی خوراکی به فرم استری تجویز می‌شود:",
      "```reaction",
      "title: فعال‌سازی متابولیک انالاپریل",
      "type: هیدرولیز استر پیش‌دارو",
      "reactants:",
      "  - smiles: CCOC(=O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O",
      "    name: انالاپریل (پیش‌داروی خوراکی)",
      "reagents:",
      "  - استرازهای کبد",
      "products:",
      "  - smiles: O=C(O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O",
      "    name: انالاپریلات (مهارکننده فعال دی‌اسید)",
      "  - smiles: CCO",
      "    name: اتانول",
      "```",
    ].join("\n"),
  },
  {
    id: "med-03",
    course: "Medicinal Chemistry 1",
    title: "NSAID COX-1 vs COX-2 Selectivity: Carboxylate vs Diaryl Sulfonamide",
    expectedRepresentation: "structure",
    description: "Celecoxib diarylpyrazole core with sulfonamide occupying COX-2 side-pocket",
    markdown: [
      "## مهارکننده‌های انتخابی COX-2",
      "سلکوکسیب دارای داربست ۱،۵-دی‌آریل پیرازول بدون گروه کربوکسیلیک اسید سنتی است:",
      "```chemical",
      "name: سلکوکسیب (Celecoxib)",
      "smiles: Cc1ccc(cc1)c2cc(nn2c3ccc(cc3)S(=O)(=O)N)C(F)(F)F",
      "formula: C17H14F3N3O2S",
      "class: مهارکننده انتخابی COX-2",
      "sar:",
      "  - گروه سولفونامید: اتصال اختصاصی به پاکت جانبی هیدروفیل COX-2 (Arg513)",
      "  - گروه تری‌فلورومتیل: پایداری متابولیک و ممانعت از هیدروکسیلاسیون فاز یک",
      "```",
    ].join("\n"),
  },
  {
    id: "med-04",
    course: "Medicinal Chemistry 2",
    title: "Histamine H1 vs H2 Receptor Antagonists",
    expectedRepresentation: "structure",
    description: "Ranitidine furan bioisostere replacement with nitroketene diamine polar group",
    markdown: [
      "## آنتاگونیست‌های گیرنده H2: داربست رانیتیدین",
      "جایگزینی حلقه ایمیدازول با فوران و حذف گروه سیانوگوانیدین سمی:",
      "```chemical",
      "name: رانیتیدین (Ranitidine)",
      "smiles: CNC(=C[N+](=O)[O-])NCCSCc1ccc(CN(C)C)o1",
      "formula: C13H22N4O3S",
      "class: مهارکننده گیرنده H2 هیستامین",
      "sar:",
      "  - حلقه فوران: بیوایزوستر حلقه ایمیدازول بدون تداخل شدید سیتوکروم P450",
      "  - گروه نیتروکوتن دی‌آمین: ایجاد برهم‌کنش قطبی قوی با جایگاه فعال گیرنده",
      "```",
    ].join("\n"),
  },
  {
    id: "med-05",
    course: "Medicinal Chemistry 2",
    title: "Classical & Non-Classical Bioisosterism: Carboxylate vs Tetrazole",
    expectedRepresentation: "structure",
    description: "Losartan tetrazole ring as a non-classical isostere of carboxylic acid with enhanced lipophilicity",
    markdown: [
      "## جایگزینی بیوایزوستری تترازول در سارتان‌ها",
      "لوزارتان حاوی حلقه ۵تایی تترازول به عنوان بیوایزوستر غیرکلاسیک کربوکسیلات است:",
      "```chemical",
      "name: لوزارتان (Losartan)",
      "smiles: CCCCc1nc(Cl)c(CO)n1Cc2ccc(cc2)c3ccccc3c4n[nH]nn4",
      "formula: C22H23ClN6O",
      "class: آنتاگونیست گیرنده AT1 آنژیوتانسین II",
      "sar:",
      "  - حلقه تترازول: توزیع بار منفی مشابه کربوکسیلات با لیپوفیلیسیتی ۱۰ برابر بالاتر و نفوذ سلولی عالی",
      "  - زنجیره بوتیل: اتصال به زیرواحد هیدروفوب پاکت گیرنده",
      "```",
    ].join("\n"),
  },
  {
    id: "med-06",
    course: "Medicinal Chemistry 2",
    title: "Local Anesthetics: Ester vs Amide Metabolic Stability",
    expectedRepresentation: "structure",
    description: "Lidocaine amide bond flanked by ortho-methyls protecting against plasma pseudocholinesterase hydrolysis",
    markdown: [
      "## بی‌حس‌کننده‌های موضعی آمیدی در برابر استری",
      "لیدوکائین به عنوان پروتوتایپ آمیدی با نیمه‌عمر طولانی‌تر نسبت به پروکائین:",
      "```chemical",
      "name: لیدوکائین (Lidocaine)",
      "smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C",
      "formula: C14H22N2O",
      "class: بی‌حس‌کننده موضعی آمیدی",
      "sar:",
      "  - ممانعت فضایی متیل‌های ارتو: محافظت از پیوند آمیدی در برابر استرازهای سرم",
      "  - آمین سوم انتهایی: تعادل یونیزاسیون فیزیولوژیک جهت عبور از غشای عصبی",
      "```",
    ].join("\n"),
  },
  {
    id: "med-07",
    course: "Medicinal Chemistry 2",
    title: "Dihydropyridine Calcium Channel Blockers: Ortho-Conformation",
    expectedRepresentation: "structure",
    description: "Amlodipine 1,4-dihydropyridine core with ortho-chloro directing perpendicular boat conformation",
    markdown: [
      "## مسدودکننده‌های کانال کلسیم دی‌هیدروپیریدینی",
      "املودیپین با مهار اختصاصی کانال‌های ولتاژی نوع L در عروق خونی:",
      "```chemical",
      "name: املودیپین (Amlodipine)",
      "smiles: CCOC(=O)C1=C(COCCN)NC(=C(C1c2ccccc2Cl)C(=O)OC)C",
      "formula: C20H25ClN2O5",
      "class: مسدودکننده کانال کلسیم (دی‌هیدروپیریدین)",
      "sar:",
      "  - کلر در موقعیت ارتو: تثبیت صورت‌بندی عمود حلقه فنیل نسبت به حلقه DHP",
      "  - زنجیره آمینواتوکسی: نیمه‌عمر طولانی و اتصال با میل ترکیبی بالا",
      "```",
    ].join("\n"),
  },
  {
    id: "med-08",
    course: "Medicinal Chemistry 3",
    title: "Opioid Mu-Receptor Pharmacophore (Morphine Prototype)",
    expectedRepresentation: "structure",
    description: "Rigid pentacyclic morphinan core with 3-OH phenolic and tertiary N-methyl amine",
    markdown: [
      "## فارماکوفور آگونیست‌های اپیوئیدی مورفین",
      "مورفین به عنوان الگوی کلاسیک آگونیست گیرنده مو (μ):",
      "```chemical",
      "name: مورفین (Morphine)",
      "smiles: CN1CC[C@]23[C@@H]4Oc5c2c(CC1[C@H]3C=C[C@@H]4O)ccc5O",
      "formula: C17H19NO3",
      "class: ضددرد مخدر آگونیست مو",
      "sar:",
      "  - هیدروکسیل فنولی موقعیت ۳: ضروری برای اتصال قوی به گیرنده مو (متیلاسیون در کدئین فعالیت را کاهش می‌دهد)",
      "  - آمین پروتونه در pH فیزیولوژیک: پیوند یونی با آسپارتات گیرنده",
      "```",
    ].join("\n"),
  },
  {
    id: "med-09",
    course: "Medicinal Chemistry 3",
    title: "Benzodiazepine GABAA Allosteric Modulator (Diazepam)",
    expectedRepresentation: "structure",
    description: "Fused 1,4-diazepine with 7-electron-withdrawing chlorine and 5-phenyl ring",
    markdown: [
      "## تعدیل‌کننده‌های آلوستریک بنزودیازپینی",
      "دیازپام اتصال گابا به گیرنده GABA-A را تسهیل می‌کند:",
      "```chemical",
      "name: دیازپام (Diazepam)",
      "smiles: CN1C(=O)CN=C(c2ccccc2)c3cc(Cl)ccc13",
      "formula: C16H13ClN2O",
      "class: تعدیل‌کننده آلوستریک مثبت GABA-A",
      "sar:",
      "  - کلر موقعیت ۷: گروه الکترون‌کشنده ضروری برای فعالیت آگونیستی",
      "  - حلقه آروماتیک در موقعیت ۵: تطابق ایده‌آل با پاکت هیدروفوبیک جایگاه آلوستریک",
      "```",
    ].join("\n"),
  },
  {
    id: "med-10",
    course: "Medicinal Chemistry 3",
    title: "Antineoplastic Kinase Inhibitor Hinge-Binding Motif (Imatinib)",
    expectedRepresentation: "structure",
    description: "2-Phenylaminopyrimidine hinge-binding pharmacophore selectively targeting BCR-ABL tyrosine kinase",
    markdown: [
      "## مهارکننده‌های تیروزین کیناز انکولوژی: ایماتینیب",
      "ایماتینیب به صورت‌بندی غیرفعال کیناز BCR-ABL متصل می‌شود:",
      "```chemical",
      "name: ایماتینیب (Imatinib)",
      "smiles: Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc4nccc(n4)c5cccnc5",
      "formula: C29H31N7O",
      "class: مهارکننده تیروزین کیناز BCR-ABL",
      "sar:",
      "  - ۲-فنیل‌آمینوپیریمیدین: پیوند هیدروژنی با ناحیه لولایی (Hinge region) کیناز",
      "  - حلقه N-متیل‌پیپرازین: افزایش انحلال‌پذیری در آب و نفوذپذیری سلولی",
      "```",
    ].join("\n"),
  },
];

describe("AVANA Chemical Content Coverage Matrix Suite (Organic & Medicinal Chemistry)", () => {
  describe("1. Representation Level & Parsing Integrity Matrix", () => {
    it.each(COVERAGE_MATRIX)(
      "correctly parses and validates [$id] $title ($course)",
      ({ _id: _unusedId, expectedRepresentation, markdown }) => {
        if (expectedRepresentation === "structure") {
          const match = /```chemical([\s\S]*?)```/.exec(markdown);
          expect(match).not.toBeNull();
          const parsed = parseChemicalCodeContent(match![1], "chemical");
          expect(parsed).not.toBeNull();
          expect(parsed?.smiles).toBeTruthy();

          // Validate chemical structure with domain validator
          const validation = validateChemicalStructure(parsed!);
          expect(validation.valid).toBe(true);
          expect(validation.errors.length).toBe(0);
        } else if (expectedRepresentation === "reaction" || expectedRepresentation === "mechanism") {
          const match = /```reaction([\s\S]*?)```/.exec(markdown);
          expect(match).not.toBeNull();
          const parsed = parseReactionCodeContent(match![1], "reaction");
          expect(parsed).not.toBeNull();
          expect(parsed?.reactants?.length || parsed?.steps?.length).toBeGreaterThanOrEqual(1);

          // Validate reaction with domain validator
          const validation = validateChemicalReaction(parsed!);
          expect(validation.valid).toBe(true);

          if (expectedRepresentation === "mechanism") {
            expect(parsed?.mechanism).toBeDefined();
          }
        }
      },
    );
  });

  describe("2. UI Rendering & Zero-Silent-Fallback Verification Matrix", () => {
    it.each(COVERAGE_MATRIX)(
      "renders visual representations without falling back to raw code for [$id] $title",
      async ({ _id: _unusedId, expectedRepresentation, markdown }) => {
        const { findByTestId, queryByTestId } = render(
          React.createElement(MarkdownRenderer, {
            content: markdown,
            enableLessonCallouts: true,
          }),
        );

        if (expectedRepresentation === "structure") {
          // Must render 2D molecular structure block
          const structBlock = await findByTestId("chemical-structure-block");
          expect(structBlock).toBeInTheDocument();
          expect(structBlock).toHaveAttribute("dir", "rtl");
          const ltrSvgArea = structBlock.querySelector('[dir="ltr"]');
          expect(ltrSvgArea).toBeInTheDocument();
        } else if (expectedRepresentation === "reaction" || expectedRepresentation === "mechanism") {
          // Must render ChemDraw-like 2D reaction block
          const rxnBlock = await findByTestId("reaction-block");
          expect(rxnBlock).toBeInTheDocument();
          expect(rxnBlock).toHaveAttribute("dir", "rtl");
          const ltrSvgArea = rxnBlock.querySelector('[dir="ltr"]');
          expect(ltrSvgArea).toBeInTheDocument();
        }

        // Strict assertion: Never drop into the fallback block for valid course archetypes
        const fallback = queryByTestId("chemical-fallback-block");
        expect(fallback).toBeNull();
      },
    );
  });

  describe("3. Text-Only vs Structure Educational Boundary Invariant", () => {
    it("preserves purely textual definitions without forcing unnecessary chemical blocks", () => {
      const pureTextLesson = [
        "# آشنایی با گیرنده‌های H1 و H2 هیستامین",
        "گیرنده H1 عمدتاً در ماهیچه‌های صاف عروق، نایژه‌ها و دستگاه گوارش توزیع شده و واسطه واکنش‌های آلرژیک حاد است.",
        "در مقابل، گیرنده H2 با پروتئین Gs جفت شده و ترشح اسید معده را از سلول‌های پاریتال تحریک می‌کند.",
        "تاریخچه کشف آنتاگونیست‌های H2 به کارهای جیمز بلک در دهه ۱۹۷۰ بازمی‌گردد.",
      ].join("\n\n");

      const { container } = render(
        React.createElement(MarkdownRenderer, {
          content: pureTextLesson,
          enableLessonCallouts: true,
        }),
      );

      // Verify no chemical blocks were generated or rendered
      expect(container.querySelector('[data-testid="chemical-structure-block"]')).toBeNull();
      expect(container.querySelector('[data-testid="reaction-block"]')).toBeNull();
      expect(container.querySelector('[data-testid="chemical-fallback-block"]')).toBeNull();

      // Verify text rendered cleanly
      expect(screen.getByText(/گیرنده H1 عمدتاً در ماهیچه‌های صاف/)).toBeInTheDocument();
      expect(screen.getByText(/جیمز بلک در دهه ۱۹۷۰/)).toBeInTheDocument();
    });
  });

  describe("4. Stereochemical Token Sanitization Guard", () => {
    it("sanitizes Persian ZWNJ, bidi marks, and quotes while strictly preserving stereochemistry and charges", () => {
      // Input with quotes, ZWNJ, and bidi marks
      const dirtyTrans = "\"C/C=C/C\u200c\"";
      const dirtyChiral = "'C[C@H](O)CC\u200e'";
      const dirtyCarbocation = "[CC(C)(C)+]\u200f";

      expect(sanitizeChemicalToken(dirtyTrans)).toBe("C/C=C/C");
      expect(sanitizeChemicalToken(dirtyChiral)).toBe("C[C@H](O)CC");
      expect(sanitizeChemicalToken(dirtyCarbocation)).toBe("[CC(C)(C)+]");
    });
  });
});
