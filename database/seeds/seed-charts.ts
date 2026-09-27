/**
 * Seed data for Educational Charts Test Course: "تست نمودار"
 *
 * Populates a dedicated test course containing an educational lesson with:
 * 1. Persian introductory text (explicitly marked as illustrative/test data)
 * 2. Line Chart (Pharmacokinetic plasma concentration profile over time)
 * 3. Persian explanatory text
 * 4. Bar Chart (Comparative blood pressure reduction between drug classes)
 * 5. Persian explanatory text
 * 6. Comparison Table (Pharmacokinetic properties)
 * 7. LaTeX Math Formula (Volume of distribution & clearance equations)
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

export const CHARTS_TEST_LESSON_MARKDOWN = `# فارماکولوژی بالینی و تحلیل داده‌های دارویی (تست نمودار)

این درسنامه به عنوان پایگاه آزمون سیستم رسم بومی نمودارهای علمی و آموزشی AVANA طراحی شده است.
تمامی داده‌ها و مقادیر ارائه شده در این درسنامه صرفاً به صورت **داده‌های نمونه و آموزشی (Illustrative / Test Data)** تدوین شده‌اند و نباید به عنوان داده‌های بالینی واقعی ملاک عمل قرار گیرند.

---

## ۱. مقدمه و فارماکوکینتیک بالینی

در بررسی فارماکوکینتیک داروها، پایش تغییرات غلظت پلاسمایی نسبت به زمان از اهمیت محوری در بهینه‌سازی دوز درمانی و پیشگیری از سمیت دارویی برخوردار است. نمودار زیر غلظت داروی نمونه را پس از تجویز دوز خوراکی واحد نشان می‌دهد:

\`\`\`chart
{
  "type": "line",
  "title": "پروفایل غلظت پلاسمایی بر حسب زمان",
  "description": "منحنی تغییرات غلظت داروی پروپرانولول خوراکی بر حسب زمان (ساعت)",
  "xAxis": {
    "label": "زمان پس از مصرف",
    "unit": "ساعت"
  },
  "yAxis": {
    "label": "غلظت پلاسمایی",
    "unit": "mg/L"
  },
  "series": [
    {
      "name": "پروپرانولول (دوز ۴۰ میلی‌گرم)",
      "data": [
        { "x": 0, "y": 0 },
        { "x": 1, "y": 14.5 },
        { "x": 2, "y": 28.0 },
        { "x": 4, "y": 16.2 },
        { "x": 6, "y": 9.4 },
        { "x": 8, "y": 4.1 },
        { "x": 12, "y": 1.2 }
      ]
    }
  ],
  "sourceCitation": "داده‌های آموزشی مستند آزمون AVANA"
}
\`\`\`

---

## ۲. تحلیل فارماکودینامیک و پاسخ بالینی

همان‌طور که در نمودار بالا مشاهده می‌شود، اوج غلظت پلاسمایی ($C_{max}$) در حدود ساعت دوم ($T_{max} = 2h$) حاصل شده و پس از آن وارد فاز حذف خطی می‌گردد.
در مقایسه اثربخشی بالینی رژیم‌های درمانی مختلف بر پرفشاری خون، تغییرات میانگین کاهش فشار خون سیستولیک و دیاستولیک به شرح نمودار ستونی زیر به دست آمده است:

\`\`\`chart
{
  "type": "bar",
  "title": "کاهش میانگین فشار خون در گروه‌های درمانی",
  "description": "مقایسه اثربخشی داروهای مهارکننده ACE و بتابلاکرها پس از ۸ هفته درمان",
  "xAxis": {
    "label": "گروه دارویی"
  },
  "yAxis": {
    "label": "کاهش فشار خون",
    "unit": "mmHg"
  },
  "series": [
    {
      "name": "فشار سیستولیک",
      "data": [
        { "label": "انالاپریل", "value": 18.5 },
        { "label": "لوزارتان", "value": 16.0 },
        { "label": "آملودیپین", "value": 21.2 },
        { "label": "پروپرانولول", "value": 14.8 }
      ]
    },
    {
      "name": "فشار دیاستولیک",
      "data": [
        { "label": "انالاپریل", "value": 11.2 },
        { "label": "لوزارتان", "value": 9.8 },
        { "label": "آملودیپین", "value": 12.5 },
        { "label": "پروپرانولول", "value": 8.6 }
      ]
    }
  ]
}
\`\`\`

---

## ۳. جدول مقایسه‌ای پارامترهای فارماکوکینتیک

جدول زیر پارامترهای کلیدی داروهای ارزیابی‌شده در درس را به همراه مقادیر نیمه‌عمر و کلیرانس مقایسه می‌کند:

| نام دارو | زیست‌دست‌یابی ($F$) | نیمه‌عمر حذفی ($t_{1/2}$) | اتصال به پروتئین | مسیر اصلی متابولیسم |
|---|---|---|---|---|
| انالاپریل (Enalapril) | ۶۰٪ | ۱۱ ساعت | ۵۰٪ | هیدرولیز کبدی به انالاپریلات |
| لوزارتان (Losartan) | ۳۳٪ | ۲ ساعت (۶-۹ ساعت متابولیت) | ۹۹٪ | اکسیداسیون توسط CYP2C9 |
| آملودیپین (Amlodipine) | ۶۴ الی ۹۰٪ | ۳۰ الی ۵۰ ساعت | ۹۸٪ | متابولیسم آهسته کبدی |
| پروپرانولول (Propranolol) | ۲۵٪ | ۳ الی ۴ ساعت | ۹۰٪ | متابولیسم عبور اول کبدی |

---

## ۴. روابط ریاضی و محاسبات کلیرانس

محاسبه حجم توزیع ظاهری و کلیرانس دارویی از فرمول‌های استاندارد زیر پیروی می‌کند:

$$V_d = \\frac{Dose_{IV}}{C_0}$$

و کلیرانس تام بر حسب ثابت سرعت حذف:

$$CL = k_e \\times V_d = \\frac{0.693 \\times V_d}{t_{1/2}}$$

> **نکته کلیدی:** داروهایی با نیمه‌عمر طولانی (مانند آملودیپین با $t_{1/2} \\approx 40h$) برای رسیدن به غلظت پایدار ($Steady\\ State$) به حدود یک هفته زمان نیاز دارند.
`;

export async function seedChartsCourse(db: DbClient): Promise<void> {
  // 1. Find or create default organization
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
    const inserted = await db
      .insert(schema.organizations)
      .values({ name: "آوانا", slug: "avana" })
      .returning({ id: schema.organizations.id });
    org = inserted[0];
  }
  if (!org) {
    console.log("No organization found. Skipping charts seed.");
    return;
  }
  const orgId = org.id;

  // 2. Insert or find course "تست نمودار"
  const courseRows = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.name, "تست نمودار"))
    .limit(1);
  let course = courseRows[0];

  if (!course) {
    const inserted = await db
      .insert(schema.courses)
      .values({
        organizationId: orgId,
        name: "تست نمودار",
        subject: "فارماکولوژی و علوم پایه",
        status: "published",
        isOfficial: true,
      })
      .returning({ id: schema.courses.id });
    course = inserted[0];
  }

  if (!course) return;

  // 3. Insert or find module "نمودارهای علمی و فارماکولوژی"
  const moduleRows = await db
    .select({ id: schema.modules.id })
    .from(schema.modules)
    .where(
      and(
        eq(schema.modules.courseId, course.id),
        eq(schema.modules.title, "نمودارهای علمی و فارماکولوژی"),
      ),
    )
    .limit(1);
  let moduleRecord = moduleRows[0];

  if (!moduleRecord) {
    const inserted = await db
      .insert(schema.modules)
      .values({
        courseId: course.id,
        title: "نمودارهای علمی و فارماکولوژی",
        description: "مجموعه درسنامه‌ها و نمودارهای تحلیلی فارماکوکینتیک و بالینی",
        sortOrder: 1,
      })
      .returning({ id: schema.modules.id });
    moduleRecord = inserted[0];
  }

  if (!moduleRecord) return;

  // 4. Insert or update lesson "درسنامه تحلیل غلظت دارویی و اثرات بالینی (تست نمودار)"
  const lessonTitle = "درسنامه تحلیل غلظت دارویی و اثرات بالینی (تست نمودار)";
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
        contentMarkdown: CHARTS_TEST_LESSON_MARKDOWN,
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
      contentMarkdown: CHARTS_TEST_LESSON_MARKDOWN,
      publicationStatus: "published",
      sortOrder: 1,
      estimatedMinutes: 20,
    });
  }

  console.log("Successfully seeded course 'تست نمودار' with line, bar, table, and formula elements.");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: Development seed script must NOT be run in production.");
    process.exit(1);
  }

  const { db, close } = createDbClient(connectionString);
  try {
    await seedChartsCourse(db);
  } catch (err) {
    console.error("Failed to seed charts course:", err);
  } finally {
    await close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("seed-charts.ts")) {
  main();
}
