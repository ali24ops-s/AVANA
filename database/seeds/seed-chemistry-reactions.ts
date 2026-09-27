/**
 * Seed data for Chemistry Reactions Test Course: "تست واکنش‌های شیمیایی"
 *
 * Populates a dedicated test course containing a comprehensive organic & medicinal
 * chemistry lesson with all 9 ChemDraw-like 2D reaction archetypes:
 * 1. Single reactant -> Single product (A -> B)
 * 2. Multiple reactants -> Single product (A + B -> C)
 * 3. Multiple reactants -> Multiple products (A + B -> C + D)
 * 4. Reaction with conditions above and below arrow
 * 5. Reversible / Equilibrium reaction (⇌)
 * 6. Resonance structures (↔)
 * 7. Multi-step reaction sequence (A -> B -> C)
 * 8. Reaction with stereochemistry / chiral inversion
 * 9. Reaction with reactive intermediate [ ... ]
 *
 * Idempotent: Can be run multiple times safely.
 */

import { createDbClient, type DbClient } from "../client.js";
import * as schema from "../schema/index.js";
import { eq, and } from "drizzle-orm";

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();

export const CHEMISTRY_REACTIONS_LESSON_MARKDOWN = `# واکنش‌های شاخص شیمی آلی و دارویی (ChemDraw 2D Reaction Schemes)

این درسنامه به عنوان پایگاه آزمون جامع سیستم رسم واکنش‌های ۲بعدی AVANA طراحی شده و ۹ الگوی بنیادین واکنش‌های شیمی آلی را در قالب استانداردهای ChemDraw نمایش می‌دهد.

---

## ۱. تبدیل تک‌ماده‌ای به تک‌فرآورده ($A \\rightarrow B$)
اکسیداسیون ملایم الکل نوع اول به آلدئید با استفاده از پیریدینیوم کلروکرومات:

\`\`\`reaction
title: اکسیداسیون الکل به آلدئید
type: اکسیداسیون ملایم
reactants:
  - smiles: CCO
    name: اتانول
    formula: C2H6O
reagents:
  - PCC
solvents:
  - CH2Cl2
products:
  - smiles: CC=O
    name: استالدئید
    formula: C2H4O
\`\`\`

---

## ۲. ترکیب دو واکنش‌دهنده به یک فرآورده ($A + B \\rightarrow C$)
واکنش حلقه‌زایی دیلز-آلدر میان ۱،۳-بوتادی‌ان و اتیلن:

\`\`\`reaction
title: واکنش دیلز-آلدر (Diels-Alder Cycloaddition)
type: حلقه‌زایی [4+2]
reactants:
  - smiles: C=CC=C
    name: ۱،۳-بوتادی‌ان
  - smiles: C=C
    name: اتیلن
conditions:
  - 150 °C
products:
  - smiles: C1=CCCCC1
    name: سیکلوهگزن
    formula: C6H10
\`\`\`

---

## ۳. دو جزء به دو فرآورده با شرایط گرمایی ($A + B \\rightarrow C + D$)
استریفیکاسیون فیشر میان اسید کربوکسیلیک و الکل در محیط اسیدی:

\`\`\`reaction
title: استریفیکاسیون فیشر (Fischer Esterification)
type: جانشینی آسیل
reactants:
  - smiles: CC(=O)O
    name: استیک اسید
    formula: C2H4O2
  - smiles: CCO
    name: اتانول
    formula: C2H6O
reagents:
  - H2SO4
conditions:
  - Δ
products:
  - smiles: CC(=O)OCC
    name: اتیل استات
    formula: C4H8O2
  - smiles: O
    name: آب
    formula: H2O
\`\`\`

---

## ۴. واکنش با شرایط همزمان بالا و پایین فلش
احیای کربونیل کتون به الکل با شرایط دمایی و حلالی کنترل‌شده:

\`\`\`reaction
title: احیای کتون به الکل دوم
type: احیای هسته‌دوستی کربونیل
reactants:
  - smiles: CC(=O)C
    name: استون
    formula: C3H6O
reagents:
  - NaBH4
solvents:
  - MeOH
conditions:
  - 0-5 °C
products:
  - smiles: CC(O)C
    name: ایزوپروپانول
    formula: C3H8O
\`\`\`

---

## ۵. تعادل شیمیایی برگشت‌پذیر با فلش دوجهته ChemDraw ($\\rightleftharpoons$)
توتومری کتو-انول در ترکیبات کربونیلی:

\`\`\`reaction
title: تعادل کتو-انول (Keto-Enol Tautomerism)
type: تعادل توتومری
reversible: true
arrow_type: reversible
reactants:
  - smiles: CC(=O)C
    name: استون (فرم کتو)
products:
  - smiles: CC(=C)O
    name: پروپن-۲-اول (فرم انول)
\`\`\`

---

## ۶. ساختارهای رزونانسی با فلش دوطرفه ($\\leftrightarrow$)
پخش الکترونی در آنیون انولات تثبیت‌شده با رزونانس:

\`\`\`reaction
title: ساختارهای رزونانسی آنیون انولات
type: رزونانس
arrow_type: resonance
reactants:
  - smiles: "[CH2-]C(=O)C"
    name: کربانیون انولات
products:
  - smiles: "C=C([O-])C"
    name: اکسی‌آنیون انولات
\`\`\`

---

## ۷. مسیر سنتزی چندمرحله‌ای متوالی ($A \\rightarrow B \\rightarrow C$)
سنتز چندمرحله‌ای آنیلین از بنزن با حفظ ماده واسط نیتروبنزن:

\`\`\`reaction
title: سنتز چندمرحله‌ای آنیلین از بنزن
type: مسیر سنتزی متوالی
layout: expanded
steps:
  - stepNumber: 1
    title: نیتراسیون بنزن
    reactants:
      - smiles: c1ccccc1
        name: بنزن
        formula: C6H6
    reagents:
      - HNO3
      - H2SO4
    yield: 85%
    products:
      - smiles: "c1ccc([N+](=O)[O-])cc1"
        name: نیتروبنزن
        formula: C6H5NO2
  - stepNumber: 2
    title: احیای کاتالیزوری نیترو به آمین
    reactants:
      - smiles: "c1ccc([N+](=O)[O-])cc1"
        name: نیتروبنزن
    reagents:
      - Fe
      - HCl
    yield: 92%
    products:
      - smiles: c1ccc(N)cc1
        name: آنیلین
        formula: C6H7N
\`\`\`

---

## ۸. استریوشیمی کایرال، وارونگی والدن و مکانیزم $S_N2$ با جفت‌الکترون‌های ناپیوندی
جانشینی هسته‌دوستی دو مولکولی با واژگونی کامل پیکربندی از (R) به (S) همراه با نمایش جفت‌الکترون‌های ناپیوندی (••) و بردار حمله از پشت:

\`\`\`reaction
title: جانشینی SN2 با واژگونی والدن
type: SN2
reactants:
  - smiles: "CC[C@@H](C)Br"
    name: (R)-۲-بروموبوتان
    formula: C4H9Br
  - smiles: "[OH-]"
    name: یون هیدروکسید
solvents:
  - DMSO
products:
  - smiles: "CC[C@H](C)O"
    name: (S)-بوتان-۲-اول
    formula: C4H10O
  - smiles: "[Br-]"
    name: یون برومید
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
  notes: "حمله الکترون‌های ناپیوندی اکسیژن از پشت پیوند کربن-برم و خروج همزمان آنیون برومید"
\`\`\`

---

## ۹. واکنش با تشکیل ماده واسط تتراهدرال درون کروشه ($[ \\dots ]$)
جانشینی نوکلئوفیلی آسیل از طریق واسط تتراهدرال با کروشه:

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

---

## ۱۰. مکانیزم واکنش حذف دومولکولی ($E_2$)
حذف هماهنگ هیدروژن بتا توسط باز، تشکیل پیوند دوگانه کربن-کربن و خروج گروه ترک‌کننده:

\`\`\`reaction
title: مکانیزم واکنش حذف دومولکولی (E2 Elimination)
type: E2
reactants:
  - smiles: "[OH-]"
    name: باز (نوکلئوفیل)
  - smiles: "CCBr"
    name: برومواتان (سوبسترا)
products:
  - smiles: "C=C"
    name: اتن (آلکن)
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
      label: گرفتن پروتون بتا
    - id: arrow_pi_bond
      type: bond_to_bond
      from:
        type: bond
        bond:
          participantRole: reactant
          participantIndex: 1
          atom1: 0
          atom2: 1
      to:
        type: bond
        bond:
          participantRole: reactant
          participantIndex: 1
          atom1: 0
          atom2: 1
      label: تشکیل پیوند دوگانه
    - id: arrow_lg_exit
      type: bond_to_atom
      from:
        type: bond
        bond:
          participantRole: reactant
          participantIndex: 1
          atom1: 1
          atom2: 2
      to:
        type: atom
        atom:
          participantRole: reactant
          participantIndex: 1
          atomIndex: 2
          element: Br
      label: خروج گروه ترک‌کننده
  notes: "مکانیزم هماهنگ تک‌مرحله‌ای E2 شامل شکست پیوند C-H، ایجاد پیوند پای و خروج برومید"
\`\`\`

---

## ۱۱. مکانیزم انتقال جفت‌الکترون در رزونانس (جفت‌الکترون به پیوند)
جابجایی الکترونی میان جفت‌الکترون غیرپیوندی کربانیون و پیوند دوگانه کربونیل:

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
    - id: arrow_carbonyl_cleavage
      type: bond_to_atom
      from:
        type: bond
        bond:
          participantRole: reactant
          participantIndex: 0
          atom1: 1
          atom2: 2
      to:
        type: atom
        atom:
          participantRole: reactant
          participantIndex: 0
          atomIndex: 2
          element: O
      label: انتقال جفت‌الکترون به اکسیژن
  notes: "پخش بار منفی با جابجایی جفت‌الکترون غیرپیوندی به پیوند دوگانه و باز شدن پیوند پای کربونیل"
\`\`\`

---

## ۱۲. فعال‌سازی پیش‌دارو در شیمی دارویی (Prodrug Bioactivation)
فعال‌سازی آنزیمی انالاپریلات از انالاپریل از طریق هیدرولیز استر توسط استرازهای کبدی:

\`\`\`reaction
title: فعال‌سازی پیش‌دارو: انالاپریل به انالاپریلات
type: فعال‌سازی پیش‌دارو (هیدرولیز متابولیک)
reactants:
  - smiles: "CCOC(=O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O"
    name: انالاپریل
    formula: C20H28N2O5
reagents:
  - استرازهای کبد
solvents:
  - H2O
products:
  - smiles: "O=C(O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N2CCC[C@H]2C(=O)O"
    name: انالاپریلات
    formula: C18H24N2O5
  - smiles: "CCO"
    name: اتانول
\`\`\`

---

## ۱۳. جایگزینی بیوایزوستر و رابطه ساختار-فعالیت (SAR & Bioisosterism)
نمایش ساختار مولکولی لوزارتان همراه با گروه تترازول به عنوان بیوایزوستر اسید کربوکسیلیک:

\`\`\`chemical
name: لوزارتان (Losartan)
smiles: "CCCCc1nc(Cl)c(CO)n1Cc2ccc(cc2)c3ccccc3c4n[nH]nn4"
formula: C22H23ClN6O
weight: 422.91
class: آنتاگونیست گیرنده آنژیوتانسین II (ARB)
sar:
  - حلقه تترازول: بیوایزوستر اسید کربوکسیلیک با پایداری متابولیک بالاتر و توزیع بار منفی مطلوب برای اتصال به گیرنده AT1
  - گروه بوتیل: برهم‌کنش هیدروفوبیک با پاکت اتصال
\`\`\`
`;

export async function seedChemistryReactionsCourse(db: DbClient) {
  console.log("Seeding Chemistry Reactions Test Course: 'تست واکنش‌های شیمیایی'...");

  // 1. Get or pick organization
  const orgRows = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, "avana-demo"))
    .limit(1);
  let org = orgRows[0];

  if (!org) {
    const fallbackOrgRows = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    org = fallbackOrgRows[0];
  }

  if (!org) {
    console.log("No organization found. Skipping chemistry reactions seed.");
    return;
  }

  // 2. Insert or find course "تست واکنش‌های شیمیایی"
  const courseRows = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.organizationId, org.id),
        eq(schema.courses.name, "تست واکنش‌های شیمیایی"),
      ),
    )
    .limit(1);
  let course = courseRows[0];

  if (!course) {
    const inserted = await db
      .insert(schema.courses)
      .values({
        organizationId: org.id,
        name: "تست واکنش‌های شیمیایی",
        description: "دوره جامع ارزیابی و نمایش الگوهای واکنش‌های شیمی آلی با استاندارد ChemDraw",
        subject: "شیمی دارویی",
        status: "published",
        isOfficial: true,
      })
      .returning({ id: schema.courses.id });
    course = inserted[0];
  }

  if (!course) return;

  // 3. Insert or find module "واکنش‌های شاخص شیمی آلی"
  const moduleRows = await db
    .select({ id: schema.modules.id })
    .from(schema.modules)
    .where(
      and(
        eq(schema.modules.courseId, course.id),
        eq(schema.modules.title, "واکنش‌های شاخص شیمی آلی"),
      ),
    )
    .limit(1);
  let moduleRecord = moduleRows[0];

  if (!moduleRecord) {
    const inserted = await db
      .insert(schema.modules)
      .values({
        courseId: course.id,
        title: "واکنش‌های شاخص شیمی آلی",
        description: "مجموعه واکنش‌های بنیادی شیمی آلی و دارویی با رسم ۲بعدی برداری",
        sortOrder: 1,
      })
      .returning({ id: schema.modules.id });
    moduleRecord = inserted[0];
  }

  if (!moduleRecord) return;

  // 4. Insert or update lesson "درسنامه جامع واکنش‌های شیمیایی (ChemDraw 2D Scheme)"
  const lessonTitle = "درسنامه جامع واکنش‌های شیمیایی (ChemDraw 2D Scheme)";
  const lessonRows = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(
      and(
        eq(schema.lessons.moduleId, moduleRecord.id),
        eq(schema.lessons.title, lessonTitle),
      ),
    )
    .limit(1);
  const existingLesson = lessonRows[0];

  if (existingLesson) {
    await db
      .update(schema.lessons)
      .set({
        contentMarkdown: CHEMISTRY_REACTIONS_LESSON_MARKDOWN,
        contentType: "markdown",
        publicationStatus: "published",
        sortOrder: 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.lessons.id, existingLesson.id));
  } else {
    await db.insert(schema.lessons).values({
      moduleId: moduleRecord.id,
      title: lessonTitle,
      contentType: "markdown",
      contentMarkdown: CHEMISTRY_REACTIONS_LESSON_MARKDOWN,
      publicationStatus: "published",
      sortOrder: 1,
      estimatedMinutes: 25,
    });
  }

  console.log("Successfully seeded course 'تست واکنش‌های شیمیایی' with 9 reaction archetypes.");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: Development seed script must NOT be run in production.");
    process.exit(1);
  }

  const { db, close } = createDbClient(connectionString);
  try {
    await seedChemistryReactionsCourse(db);
  } catch (err) {
    console.error("Failed to seed chemistry reactions:", err);
  } finally {
    await close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-chemistry-reactions.ts")) {
  main();
}
