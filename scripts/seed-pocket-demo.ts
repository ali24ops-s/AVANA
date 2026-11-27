/* eslint-disable no-console */
/**
 * AVANA Pocket — Comprehensive Idempotent Demo Dataset Seeder & Cleanup
 *
 * Target: Local development database `avana` on 127.0.0.1:5432 ONLY (Fail-Closed).
 * Usage:
 *   npx tsx scripts/seed-pocket-demo.ts
 *   npx tsx scripts/seed-pocket-demo.ts --cleanup
 *
 * Guarantees:
 * - Fail-closed production protection (checks NODE_ENV, URL host/db, and live PostgreSQL identity).
 * - Uses real Pocket domain services (ReviewerService, AssertionReviewService,
 *   AssertionVerificationService, AssertionPublishingService, SafetyOverrideService).
 * - Strictly idempotent: re-running creates zero duplicate records.
 * - Safe targeted cleanup: removes ONLY records belonging to this demo seed.
 */

import { eq, and, inArray, like, or, sql } from "drizzle-orm";
import { loadMonorepoEnv } from "@avana/config";
import { asUserId, asOrganizationId, type Actor } from "@avana/domain";
import { createDbClient, type DbClient } from "@avana/database/client";
import * as schema from "@avana/database/schema";
import { hashPassword } from "../apps/api/src/modules/identity/password-hasher.js";
import { DrizzleReviewerStore } from "../apps/api/src/modules/pocket/drizzle-reviewer-store.js";
import { ReviewerService } from "../apps/api/src/modules/pocket/reviewer-service.js";
import { DrizzleAssertionReviewStore } from "../apps/api/src/modules/pocket/drizzle-assertion-review-store.js";
import { AssertionReviewService } from "../apps/api/src/modules/pocket/assertion-review-service.js";
import { DrizzleAssertionVerificationStore } from "../apps/api/src/modules/pocket/drizzle-assertion-verification-store.js";
import { AssertionVerificationService } from "../apps/api/src/modules/pocket/assertion-verification-service.js";
import { DrizzleAssertionPublishingStore } from "../apps/api/src/modules/pocket/drizzle-assertion-publishing-store.js";
import { AssertionPublishingService } from "../apps/api/src/modules/pocket/assertion-publishing-service.js";
import { DrizzleSafetyOverrideStore } from "../apps/api/src/modules/pocket/drizzle-safety-override-store.js";
import { SafetyOverrideService } from "../apps/api/src/modules/pocket/safety-override-service.js";

loadMonorepoEnv();

export const DEMO_PREFIX = "pocket-demo-";
export const DEMO_EMAIL_DOMAIN = "@avana.demo";
export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_PASSWORD = "AvanaDemo#2026";

const ALLOWED_LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_TARGET_DB = "avana";

interface PgIdentityRow {
  db_name: string;
  db_user: string;
  server_addr: string | null;
  server_port: number | null;
}

function defaultLocalDbUrl(): string {
  const user = "avana";
  const pass = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${pass}@${host}:${port}/${db}?sslmode=disable`;
}

function resolveAndValidateLocalDbUrl(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[FAIL-CLOSED] Refusing to run Pocket demo seed/cleanup when NODE_ENV=production.",
    );
  }

  const rawUrl = process.env.DATABASE_URL?.trim() || defaultLocalDbUrl();

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("[FAIL-CLOSED] Invalid DATABASE_URL format.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`[FAIL-CLOSED] Unsupported DB protocol '${parsed.protocol}'.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[FAIL-CLOSED] Host '${host}' is forbidden. Only local hosts (127.0.0.1, localhost) are allowed.`,
    );
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== ALLOWED_TARGET_DB) {
    throw new Error(
      `[FAIL-CLOSED] Database '${dbName}' is forbidden. Target database must be '${ALLOWED_TARGET_DB}'.`,
    );
  }

  return rawUrl;
}

async function verifyLivePostgresIdentity(db: DbClient): Promise<void> {
  const result = await db.execute(
    sql`SELECT current_database() AS db_name, current_user AS db_user, inet_server_addr()::text AS server_addr, inet_server_port() AS server_port`,
  );
  const rows = result.rows as unknown as PgIdentityRow[];
  const identity = rows[0];
  if (!identity) {
    throw new Error("[FAIL-CLOSED] Could not verify live PostgreSQL connection identity.");
  }

  if (identity.db_name !== ALLOWED_TARGET_DB) {
    throw new Error(
      `[FAIL-CLOSED] PostgreSQL current_database() is '${identity.db_name}', expected '${ALLOWED_TARGET_DB}'.`,
    );
  }

  const validServerAddrs = new Set(["127.0.0.1", "127.0.0.1/32", "::1", "::1/128", null]);
  if (!validServerAddrs.has(identity.server_addr)) {
    throw new Error(
      `[FAIL-CLOSED] PostgreSQL inet_server_addr() is '${identity.server_addr}', expected local address.`,
    );
  }

  console.log(
    `[Safety Check OK] Connected to PostgreSQL db='${identity.db_name}', user='${identity.db_user}', addr='${identity.server_addr ?? "local"}:${identity.server_port ?? 5432}'`,
  );
}

function daysFromTodayIsoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function daysFromTodayDate(offsetDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

interface DemoUserSpec {
  key: string;
  email: string;
  name: string;
  globalRole: "platform_admin" | "teacher" | "user";
  teacherStatus: "approved";
}

const DEMO_USERS: readonly DemoUserSpec[] = [
  {
    key: "admin",
    email: "pocket-demo-admin@avana.demo",
    name: "دکتر سهراب امیری (ادمین دمو Pocket)",
    globalRole: "platform_admin",
    teacherStatus: "approved",
  },
  {
    key: "reviewer1",
    email: "pocket-demo-reviewer-1@avana.demo",
    name: "دکتر مریم فرهادی (داور فعال - فارماکولوژی بالینی)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewer2",
    email: "pocket-demo-reviewer-2@avana.demo",
    name: "دکتر علیرضا کاظمی (داور فعال - قلب و داخلی)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewer3",
    email: "pocket-demo-reviewer-3@avana.demo",
    name: "دکتر نرگس حسینی (داور فعال - عفونی و نورولوژی)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewerExpired",
    email: "pocket-demo-reviewer-expired@avana.demo",
    name: "دکتر کیوان شریفی (داور با پروانه منقضی دمو)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewerSuspended",
    email: "pocket-demo-reviewer-suspended@avana.demo",
    name: "دکتر سارا نادری (داور تعلیق‌شده دمو)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewerRevoked",
    email: "pocket-demo-reviewer-revoked@avana.demo",
    name: "دکتر حامد رضایی (داور لغو مجوز دمو)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "reviewerPostPubExpired",
    email: "pocket-demo-reviewer-postpub@avana.demo",
    name: "دکتر آزاده موسوی (داور منقضی پس از انتشار دمو)",
    globalRole: "teacher",
    teacherStatus: "approved",
  },
  {
    key: "student",
    email: "pocket-demo-student@avana.demo",
    name: "پارسا محمدی (کاربر مصرف‌کننده دمو)",
    globalRole: "user",
    teacherStatus: "approved",
  },
];

function makeActor(userId: string, spec: DemoUserSpec): Actor {
  return {
    userId: asUserId(userId),
    role: spec.globalRole === "user" ? "student" : spec.globalRole,
    globalRole: spec.globalRole === "user" ? "student" : spec.globalRole,
    teacherStatus: spec.teacherStatus,
    memberships: [
      {
        organizationId: asOrganizationId(DEMO_ORG_ID),
        role: spec.globalRole === "platform_admin" ? "organization_admin" : "student",
      },
    ],
  };
}

interface DrugSeed {
  slug: string;
  genericNameEn: string;
  genericNameFa: string;
  brandNames: string[];
  drugClass: string;
  mechanismOfAction: string;
  standardAdultDoseText: string;
  counselingPoints: string;
  status: "published" | "draft";
  aliases: Array<{ raw: string; lang: "fa" | "en"; type: string }>;
}

const DEMO_DRUGS: readonly DrugSeed[] = [
  {
    slug: `${DEMO_PREFIX}drug-atorvastatin`,
    genericNameEn: "Atorvastatin (Demo)",
    genericNameFa: "آتورواستاتین [آزمایشی]",
    brandNames: ["Lipitor-Demo", "Atorva-Demo"],
    drugClass: "قلب و عروق - استاتین (HMG-CoA Reductase Inhibitor)",
    mechanismOfAction: "[محتوای آزمایشی] مهار رقابتی آنزیم HMG-CoA ردوکتاز در کبد و کاهش سنتز کلسترول LDL.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست نمایش دوز استاندارد بزرگسالان.",
    counselingPoints: "[آزمایشی] این رکورد صرفاً برای آزمون رابط کاربری AVANA Pocket است و توصیه درمانی نیست.",
    status: "published",
    aliases: [
      { raw: "آتورواستاتین آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Atorvastatin Demo", lang: "en", type: "generic_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-amoxicillin-clavulanate`,
    genericNameEn: "Amoxicillin/Clavulanate (Demo)",
    genericNameFa: "آموکسی‌سیلین/کلاوولانات [آزمایشی]",
    brandNames: ["Augmentin-Demo", "Co-Amoxiclave-Demo"],
    drugClass: "بیماری‌های عفونی - پنی‌سیلین + مهارکننده بتالاکتاماز",
    mechanismOfAction: "[محتوای آزمایشی] مهار سنتز دیواره سلولی باکتری همراه با مهار آنزیم بتالاکتاماز.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست نمایش رژیم دارویی عفونی.",
    counselingPoints: "[آزمایشی] توصیه آزمایشی برای بررسی UI؛ مصرف واقعی نیازمند تجویز پزشک است.",
    status: "published",
    aliases: [
      { raw: "کوآموکسی کلاو آزمایشی", lang: "fa", type: "brand_fa" },
      { raw: "Co-Amoxiclav Demo", lang: "en", type: "brand_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-levetiracetam`,
    genericNameEn: "Levetiracetam (Demo)",
    genericNameFa: "لوتیراستام [آزمایشی]",
    brandNames: ["Keppra-Demo", "Levebel-Demo"],
    drugClass: "نورولوژی - ضدتشنج (SV2A Modulator)",
    mechanismOfAction: "[محتوای آزمایشی] اتصال به پروتئین وزیکولی SV2A و تعدیل رهایش نوروترنسمیترها.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست سناریوهای نورولوژی.",
    counselingPoints: "[آزمایشی] محتوای دمو برای ارزیابی چرخه عمر و حدنصاب داوری.",
    status: "published",
    aliases: [
      { raw: "لوتیراستام آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Keppra Demo", lang: "en", type: "brand_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-metformin`,
    genericNameEn: "Metformin (Demo)",
    genericNameFa: "متفورمین [آزمایشی]",
    brandNames: ["Glucophage-Demo"],
    drugClass: "غدد - بیگوانید (Biguanide)",
    mechanismOfAction: "[محتوای آزمایشی] کاهش گلوکونئوژنز کبدی و افزایش حساسیت محیطی به انسولین.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست نمایش تنظیم دوز کلیوی و غدد.",
    counselingPoints: "[آزمایشی] رکورد آزمایشی؛ جایگزین مشاوره پزشکی نیست.",
    status: "published",
    aliases: [
      { raw: "متفورمین آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Glucophage Demo", lang: "en", type: "brand_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-omeprazole`,
    genericNameEn: "Omeprazole (Demo)",
    genericNameFa: "امپرازول [آزمایشی]",
    brandNames: ["Losec-Demo"],
    drugClass: "بیماری‌های داخلی - مهارکننده پمپ پروتون (PPI)",
    mechanismOfAction: "[محتوای آزمایشی] مهار برگشت‌ناپذیر پمپ H+/K+ ATPase در سلول‌های جداری معده.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست سناریوی داخلی و تداخلات.",
    counselingPoints: "[آزمایشی] داده دمو جهت بررسی رابط کاربری.",
    status: "published",
    aliases: [
      { raw: "امپرازول آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Omeprazole Demo", lang: "en", type: "generic_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-vancomycin`,
    genericNameEn: "Vancomycin (Demo)",
    genericNameFa: "وانکومایسین [آزمایشی]",
    brandNames: ["Vancocin-Demo"],
    drugClass: "داروسازی بالینی - گلیکوپپتید (TDM Required)",
    mechanismOfAction: "[محتوای آزمایشی] اتصال به انتهای D-Ala-D-Ala و مهار ساخت پپتیدوگلیکان.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست پایش درمانی دارویی (TDM).",
    counselingPoints: "[آزمایشی] صرفاً برای آزمایش جریان کاری داروسازی بالینی در Pocket.",
    status: "published",
    aliases: [
      { raw: "وانکومایسین آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Vancomycin TDM Demo", lang: "en", type: "generic_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-warfarin`,
    genericNameEn: "Warfarin (Demo)",
    genericNameFa: "وارفارین [آزمایشی]",
    brandNames: ["Coumadin-Demo"],
    drugClass: "ایمنی دارویی - ضدانعقاد خوراکی (Vitamin K Antagonist)",
    mechanismOfAction: "[محتوای آزمایشی] مهار آنزیم VKORC1 و کاهش فاکتورهای انعقادی وابسته به ویتامین K.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست سناریوهای Safety Override و Conflict.",
    counselingPoints: "[آزمایشی] محتوای آزمایشی برای بررسی هشدارهای ایمنی دارویی.",
    status: "published",
    aliases: [
      { raw: "وارفارین آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Warfarin Demo", lang: "en", type: "generic_en" },
    ],
  },
  {
    slug: `${DEMO_PREFIX}drug-propranolol`,
    genericNameEn: "Propranolol (Demo)",
    genericNameFa: "پروپرانولول [آزمایشی]",
    brandNames: ["Inderal-Demo"],
    drugClass: "فارماکولوژی - بتابلوکر غیراختصاصی",
    mechanismOfAction: "[محتوای آزمایشی] آنتاگونیسم رقابتی گیرنده‌های بتا-۱ و بتا-۲ آدرنرژیک.",
    standardAdultDoseText: "[داده آزمایشی غیربالینی] صرفاً جهت تست سناریوی فارماکولوژی.",
    counselingPoints: "[آزمایشی] رکورد دمو برای بررسی جستجو و مصرف محتوا.",
    status: "published",
    aliases: [
      { raw: "پروپرانولول آزمایشی", lang: "fa", type: "generic_fa" },
      { raw: "Propranolol Demo", lang: "en", type: "generic_en" },
    ],
  },
];

interface DiseaseSeed {
  slug: string;
  titleEn: string;
  titleFa: string;
  icd10Code: string;
  definition: string;
  clinicalPearls: string;
  status: "published" | "draft";
}

const DEMO_DISEASES: readonly DiseaseSeed[] = [
  {
    slug: `${DEMO_PREFIX}disease-hypertension`,
    titleEn: "Essential Hypertension (Demo)",
    titleFa: "پرفشاری خون اولیه [آزمایشی]",
    icd10Code: "I10-DEMO",
    definition: "[محتوای آزمایشی] افزایش پایدار فشار خون شریانی بدون علت ثانویه مشخص، جهت تست ماژول قلب و عروق.",
    clinicalPearls: "[آزمایشی] این صفحه برای آزمایش نمایش بیماری‌ها و ارتباط با داروها ساخته شده است.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}disease-cap`,
    titleEn: "Community-Acquired Pneumonia (Demo)",
    titleFa: "پنومونی اکتسابی از جامعه [آزمایشی]",
    icd10Code: "J18.9-DEMO",
    definition: "[محتوای آزمایشی] عفونت حاد پارانشیم ریه خارج از محیط بیمارستان، جهت تست ماژول بیماری‌های عفونی.",
    clinicalPearls: "[آزمایشی] صرفاً برای آزمایش رابط کاربری AVANA Pocket.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}disease-epilepsy`,
    titleEn: "Focal Epilepsy (Demo)",
    titleFa: "صرع کانونی [آزمایشی]",
    icd10Code: "G40.2-DEMO",
    definition: "[محتوای آزمایشی] اختلال تشنجی با منشأ کانونی در قشر مغز، جهت تست ماژول نورولوژی.",
    clinicalPearls: "[آزمایشی] داده آزمایشی غیربالینی.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}disease-t2dm`,
    titleEn: "Type 2 Diabetes Mellitus (Demo)",
    titleFa: "دیابت ملیتوس نوع ۲ [آزمایشی]",
    icd10Code: "E11-DEMO",
    definition: "[محتوای آزمایشی] اختلال متابولیک مزمن با مقاومت به انسولین، جهت تست ماژول غدد.",
    clinicalPearls: "[آزمایشی] داده دمو جهت بررسی تاریخ اعتبار و انقضای محتوا.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}disease-gerd`,
    titleEn: "Gastroesophageal Reflux Disease (Demo)",
    titleFa: "ریفلاکس معدی-مروی [آزمایشی]",
    icd10Code: "K21-DEMO",
    definition: "[محتوای آزمایشی] برگشت محتویات اسیدی معده به مری، جهت تست ماژول بیماری‌های داخلی.",
    clinicalPearls: "[آزمایشی] داده دمو؛ نباید به عنوان توصیه پزشکی تلقی شود.",
    status: "published",
  },
];

interface TreatmentSeed {
  slug: string;
  titleEn: string;
  titleFa: string;
  treatmentType: string;
  pharmacologicalStrategy: string;
  efficacyMonitoring: string;
  safetyMonitoring: string;
  status: "published" | "draft";
}

const DEMO_TREATMENTS: readonly TreatmentSeed[] = [
  {
    slug: `${DEMO_PREFIX}treatment-htn-firstline`,
    titleEn: "First-Line Hypertension Protocol (Demo)",
    titleFa: "پروتکل آزمایشی کنترل فشار خون [آزمایشی]",
    treatmentType: "pharmacological",
    pharmacologicalStrategy: "[محتوای آزمایشی] استراتژی نمونه برای آزمایش نمایش پروتکل درمانی قلب و عروق.",
    efficacyMonitoring: "[آزمایشی] پایش دوره‌ای شاخص‌های آزمایشی.",
    safetyMonitoring: "[آزمایشی] بررسی الکترولیت‌ها و عوارض نمونه.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}treatment-t2dm-metformin`,
    titleEn: "Metformin Initiation Protocol (Demo)",
    titleFa: "پروتکل آزمایشی شروع درمان متفورمین [آزمایشی]",
    treatmentType: "pharmacological",
    pharmacologicalStrategy: "[محتوای آزمایشی] الگوی نمونه برای تست ماژول غدد و تنظیم دوز.",
    efficacyMonitoring: "[آزمایشی] ارزیابی شاخص‌های متابولیک آزمایشی.",
    safetyMonitoring: "[آزمایشی] پایش عملکرد کلیه در سناریوی دمو.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}treatment-vancomycin-tdm`,
    titleEn: "Vancomycin TDM Protocol (Demo)",
    titleFa: "پروتکل آزمایشی پایش درمانی وانکومایسین [آزمایشی]",
    treatmentType: "pharmacological",
    pharmacologicalStrategy: "[محتوای آزمایشی] الگوی نمونه برای تست داروسازی بالینی و حدنصاب دو داور.",
    efficacyMonitoring: "[آزمایشی] پایش غلظت سرمی در محیط دمو.",
    safetyMonitoring: "[آزمایشی] پایش عملکرد کلیوی در سناریوی آزمایشی.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}treatment-warfarin-monitoring`,
    titleEn: "Warfarin Safety & INR Monitoring (Demo)",
    titleFa: "پروتکل آزمایشی پایش ایمنی وارفارین [آزمایشی]",
    treatmentType: "pharmacological",
    pharmacologicalStrategy: "[محتوای آزمایشی] سناریوی نمونه جهت تست Safety Override در سطح Aggregate.",
    efficacyMonitoring: "[آزمایشی] پایش آزمایشی INR.",
    safetyMonitoring: "[آزمایشی] بررسی علائم خونریزی در سناریوی تست.",
    status: "published",
  },
];

interface EmergencySeed {
  slug: string;
  titleEn: string;
  titleFa: string;
  conditionType: string;
  immediateTriageGuidance: string;
  referralAndEscalationCriteria: string;
  status: "published" | "draft";
}

const DEMO_EMERGENCIES: readonly EmergencySeed[] = [
  {
    slug: `${DEMO_PREFIX}emergency-anaphylaxis`,
    titleEn: "Anaphylaxis Triage (Demo)",
    titleFa: "شوک آنافیلاکسی [آزمایشی]",
    conditionType: "allergic_emergency",
    immediateTriageGuidance: "[محتوای آزمایشی غیربالینی] سناریوی دمو برای تست حداقل حدنصاب ۲ داور در ستون اورژانس.",
    referralAndEscalationCriteria: "[آزمایشی] صرفاً جهت بررسی رفتار UI در اورژانس‌ها.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}emergency-status-epilepticus`,
    titleEn: "Status Epilepticus Triage (Demo)",
    titleFa: "صرع پایدار [آزمایشی]",
    conditionType: "neurological_emergency",
    immediateTriageGuidance: "[محتوای آزمایشی غیربالینی] سناریوی دمو برای تست نورولوژی و اورژانس.",
    referralAndEscalationCriteria: "[آزمایشی] صرفاً جهت آزمایش نمایش کارت اورژانس در Pocket.",
    status: "published",
  },
  {
    slug: `${DEMO_PREFIX}emergency-hypoglycemia`,
    titleEn: "Severe Hypoglycemia Triage (Demo)",
    titleFa: "هیپوگلیسمی شدید [آزمایشی]",
    conditionType: "metabolic_emergency",
    immediateTriageGuidance: "[محتوای آزمایشی غیربالینی] سناریوی دمو برای تست غدد و اورژانس.",
    referralAndEscalationCriteria: "[آزمایشی] داده آزمایشی؛ توصیه پزشکی واقعی نیست.",
    status: "published",
  },
];

type PillarKind = "drug" | "disease" | "treatment" | "emergency";

interface AssertionScenarioSpec {
  scenarioId: string;
  assertionKey: string;
  pillarType: PillarKind;
  pillarSlug: string;
  assertionType: string;
  statementText: string;
  validUntilOffsetDays: number | null;
  targetOutcome:
    | "draft"
    | "in_review"
    | "reviewed"
    | "verified_single_quorum_short"
    | "verified_ready_for_publish"
    | "published_healthy"
    | "published_near_expiry"
    | "published_expired_date"
    | "published_needs_reeval"
    | "published_post_pub_cred_expired"
    | "published_override_active"
    | "published_override_cleared"
    | "published_override_history"
    | "published_conflict_active"
    | "published_mixed_valid_invalid"
    | "superseded_chain"
    | "retired_historical"
    | "reviewed_with_expired_cred_vote"
    | "reviewed_with_conflict_vote"
    | "reviewed_with_rejection_disagreement";
}

const SCENARIO_SPECS: readonly AssertionScenarioSpec[] = [
  // 1-3: Draft
  {
    scenarioId: "POCKET-DEMO-001",
    assertionKey: `${DEMO_PREFIX}001-draft-atorvastatin`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-atorvastatin`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-001] پیش‌نویس اطلاعات عمومی آتورواستاتین در وضعیت Draft (نباید در مصرف‌کننده دیده شود).",
    validUntilOffsetDays: 365,
    targetOutcome: "draft",
  },
  {
    scenarioId: "POCKET-DEMO-002",
    assertionKey: `${DEMO_PREFIX}002-draft-epilepsy`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-epilepsy`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-002] پیش‌نویس تعریف بیماری صرع کانونی در وضعیت Draft.",
    validUntilOffsetDays: 365,
    targetOutcome: "draft",
  },
  {
    scenarioId: "POCKET-DEMO-003",
    assertionKey: `${DEMO_PREFIX}003-draft-propranolol`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-propranolol`,
    assertionType: "mechanism_of_action",
    statementText: "[آزمایشی POCKET-DEMO-003] پیش‌نویس مکانیسم اثر پروپرانولول در فارماکولوژی.",
    validUntilOffsetDays: 365,
    targetOutcome: "draft",
  },

  // 4-6: In Review (Submitted for Review)
  {
    scenarioId: "POCKET-DEMO-004",
    assertionKey: `${DEMO_PREFIX}004-in-review-amox`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-amoxicillin-clavulanate`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-004] دوز آزمایشی آموکسی‌سیلین/کلاوولانات در انتظار داوری اولیه (in_review).",
    validUntilOffsetDays: 365,
    targetOutcome: "in_review",
  },
  {
    scenarioId: "POCKET-DEMO-005",
    assertionKey: `${DEMO_PREFIX}005-in-review-gerd`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-gerd`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-005] اطلاعات بیماری ریفلاکس معدی-مروی ارسال‌شده برای بررسی (in_review).",
    validUntilOffsetDays: 365,
    targetOutcome: "in_review",
  },
  {
    scenarioId: "POCKET-DEMO-006",
    assertionKey: `${DEMO_PREFIX}006-in-review-omeprazole`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-omeprazole`,
    assertionType: "interaction",
    statementText: "[آزمایشی POCKET-DEMO-006] تداخل آزمایشی امپرازول در وضعیت در حال بررسی (in_review).",
    validUntilOffsetDays: 365,
    targetOutcome: "in_review",
  },

  // 7-9: Reviewed (Initial review approved, awaiting clinical verification)
  {
    scenarioId: "POCKET-DEMO-007",
    assertionKey: `${DEMO_PREFIX}007-reviewed-cap`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-cap`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-007] پنومونی اکتسابی از جامعه تاییدشده در مرور اولیه (reviewed)، منتظر تایید بالینی.",
    validUntilOffsetDays: 365,
    targetOutcome: "reviewed",
  },
  {
    scenarioId: "POCKET-DEMO-008",
    assertionKey: `${DEMO_PREFIX}008-reviewed-htn-protocol`,
    pillarType: "treatment",
    pillarSlug: `${DEMO_PREFIX}treatment-htn-firstline`,
    assertionType: "dosing_rule",
    statementText: "[آزمایشی POCKET-DEMO-008] پروتکل آزمایشی فشار خون در وضعیت reviewed بدون رای بالینی.",
    validUntilOffsetDays: 365,
    targetOutcome: "reviewed",
  },
  {
    scenarioId: "POCKET-DEMO-009",
    assertionKey: `${DEMO_PREFIX}009-reviewed-metformin`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-metformin`,
    assertionType: "renal_adjustment",
    statementText: "[آزمایشی POCKET-DEMO-009] تنظیم دوز کلیوی متفورمین در وضعیت reviewed.",
    validUntilOffsetDays: 365,
    targetOutcome: "reviewed",
  },

  // 10-12: Verified (not yet published) & Quorum-Short
  {
    scenarioId: "POCKET-DEMO-010",
    assertionKey: `${DEMO_PREFIX}010-verified-quorum-short`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-vancomycin`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-010] دوز وانکومایسین با ۱ تایید معتبر (یک تایید کمتر از حدنصاب ۲) - انتشار توسط Gate مسدود می‌شود.",
    validUntilOffsetDays: 365,
    targetOutcome: "verified_single_quorum_short",
  },
  {
    scenarioId: "POCKET-DEMO-011",
    assertionKey: `${DEMO_PREFIX}011-verified-ready`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-levetiracetam`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-011] دوز لوتیراستام تاییدشده با ۲ داور معتبر (verified) و آماده انتشار.",
    validUntilOffsetDays: 365,
    targetOutcome: "verified_ready_for_publish",
  },
  {
    scenarioId: "POCKET-DEMO-012",
    assertionKey: `${DEMO_PREFIX}012-verified-emergency-short`,
    pillarType: "emergency",
    pillarSlug: `${DEMO_PREFIX}emergency-status-epilepticus`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-012] اورژانس صرع پایدار با ۱ تایید (به دلیل حداقل ۲ تایید برای emergency هنوز به حدنصاب نرسیده).",
    validUntilOffsetDays: 365,
    targetOutcome: "verified_single_quorum_short",
  },

  // 13-22: Published & Healthy (visible in UI Search, Discovery, Consumption)
  {
    scenarioId: "POCKET-DEMO-013",
    assertionKey: `${DEMO_PREFIX}013-pub-atorvastatin-moa`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-atorvastatin`,
    assertionType: "mechanism_of_action",
    statementText: "[آزمایشی POCKET-DEMO-013] مکانیسم اثر آتورواستاتین: مهار HMG-CoA ردوکتاز و کاهش کلسترول LDL (منتشرشده و معتبر با ۱ تایید).",
    validUntilOffsetDays: 540,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-014",
    assertionKey: `${DEMO_PREFIX}014-pub-atorvastatin-dosing`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-atorvastatin`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-014] اطلاعات دوز آزمایشی آتورواستاتین با حدنصاب کامل ۲ داور فعال منتشر شده است.",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-015",
    assertionKey: `${DEMO_PREFIX}015-pub-amox-dosing`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-amoxicillin-clavulanate`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-015] رژیم نمونه آموکسی‌سیلین/کلاوولانات در بیماری‌های عفونی (منتشرشده با ۲ تایید معتبر).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-016",
    assertionKey: `${DEMO_PREFIX}016-pub-levetiracetam-info`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-levetiracetam`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-016] معرفی داروی ضدتشنج لوتیراستام در نورولوژی (منتشرشده و قابل مشاهده در UI).",
    validUntilOffsetDays: 730,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-017",
    assertionKey: `${DEMO_PREFIX}017-pub-metformin-info`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-metformin`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-017] اطلاعات پایه متفورمین در غدد (دارای اعتبار بلندمدت ۷۳۰ روزه).",
    validUntilOffsetDays: 730,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-018",
    assertionKey: `${DEMO_PREFIX}018-pub-omeprazole-info`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-omeprazole`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-018] اطلاعات داروی امپرازول در بیماری‌های داخلی (منتشرشده و معتبر).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-019",
    assertionKey: `${DEMO_PREFIX}019-pub-vancomycin-tdm`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-vancomycin`,
    assertionType: "dosing_rule",
    statementText: "[آزمایشی POCKET-DEMO-019] پروتکل نمونه پایش درمانی وانکومایسین در داروسازی بالینی (منتشرشده با ۲ تایید).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-020",
    assertionKey: `${DEMO_PREFIX}020-pub-propranolol-moa`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-propranolol`,
    assertionType: "mechanism_of_action",
    statementText: "[آزمایشی POCKET-DEMO-020] مکانیسم اثر پروپرانولول در فارماکولوژی (منتشرشده و معتبر).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-021",
    assertionKey: `${DEMO_PREFIX}021-pub-disease-htn`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-hypertension`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-021] تعریف و معیارهای آزمایشی پرفشاری خون اولیه (منتشرشده).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-022",
    assertionKey: `${DEMO_PREFIX}022-pub-emergency-anaphylaxis`,
    pillarType: "emergency",
    pillarSlug: `${DEMO_PREFIX}emergency-anaphylaxis`,
    assertionType: "emergency_protocol",
    statementText: "[آزمایشی POCKET-DEMO-022] پروتکل آزمایشی تریاژ شوک آنافیلاکسی (منتشرشده با ۲ تایید معتبر).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },
  {
    scenarioId: "POCKET-DEMO-023",
    assertionKey: `${DEMO_PREFIX}023-pub-treatment-vanco`,
    pillarType: "treatment",
    pillarSlug: `${DEMO_PREFIX}treatment-vancomycin-tdm`,
    assertionType: "dosing_rule",
    statementText: "[آزمایشی POCKET-DEMO-023] پروتکل درمانی پایش وانکومایسین (منتشرشده با ۲ تایید معتبر).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_healthy",
  },

  // 24-26: Validity Dates (Near Expiry, Expired Date, Needs Re-evaluation)
  {
    scenarioId: "POCKET-DEMO-024",
    assertionKey: `${DEMO_PREFIX}024-pub-near-expiry`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-t2dm`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-024] محتوای منتشرشده دیابت نوع ۲ نزدیک به تاریخ انقضا (۱۰ روز آینده).",
    validUntilOffsetDays: 10,
    targetOutcome: "published_near_expiry",
  },
  {
    scenarioId: "POCKET-DEMO-025",
    assertionKey: `${DEMO_PREFIX}025-pub-expired-date`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-cap`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-025] محتوای منتشرشده پنومونی با تاریخ اعتبار منقضی‌شده (۱۵ روز قبل) - وضعیت DB همچنان published است.",
    validUntilOffsetDays: -15,
    targetOutcome: "published_expired_date",
  },
  {
    scenarioId: "POCKET-DEMO-026",
    assertionKey: `${DEMO_PREFIX}026-pub-needs-reeval`,
    pillarType: "treatment",
    pillarSlug: `${DEMO_PREFIX}treatment-t2dm-metformin`,
    assertionType: "dosing_rule",
    statementText: "[آزمایشی POCKET-DEMO-026] محتوای منتشرشده پروتکل متفورمین نیازمند بازبینی دوره‌ای (۵ روز تا سررسید اعتبار).",
    validUntilOffsetDays: 5,
    targetOutcome: "published_needs_reeval",
  },

  // 27-29: Safety Override Scenarios
  {
    scenarioId: "POCKET-DEMO-027",
    assertionKey: `${DEMO_PREFIX}027-pub-override-active`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-omeprazole`,
    assertionType: "safety_warning",
    statementText: "[آزمایشی POCKET-DEMO-027] هشدار ایمنی امپرازول: منتشرشده اما به دلیل Safety Override فعال از دسترس مصرف‌کننده خارج شده است.",
    validUntilOffsetDays: 365,
    targetOutcome: "published_override_active",
  },
  {
    scenarioId: "POCKET-DEMO-028",
    assertionKey: `${DEMO_PREFIX}028-pub-override-cleared`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-propranolol`,
    assertionType: "safety_warning",
    statementText: "[آزمایشی POCKET-DEMO-028] هشدار ایمنی پروپرانولول دارای Safety Override غیرفعال‌شده (cleared) که مجدداً در دسترس مصرف‌کننده است.",
    validUntilOffsetDays: 365,
    targetOutcome: "published_override_cleared",
  },
  {
    scenarioId: "POCKET-DEMO-029",
    assertionKey: `${DEMO_PREFIX}029-pub-override-history`,
    pillarType: "treatment",
    pillarSlug: `${DEMO_PREFIX}treatment-warfarin-monitoring`,
    assertionType: "safety_warning",
    statementText: "[آزمایشی POCKET-DEMO-029] پروتکل ایمنی وارفارین دارای تاریخچه چندمرحله‌ای Safety Override (فعال -> رفع -> فعال مجدد).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_override_history",
  },

  // 30-32: Post-Publication Credential Expiry, Clinical Conflict, Mixed Votes
  {
    scenarioId: "POCKET-DEMO-030",
    assertionKey: `${DEMO_PREFIX}030-postpub-cred-expired`,
    pillarType: "emergency",
    pillarSlug: `${DEMO_PREFIX}emergency-hypoglycemia`,
    assertionType: "emergency_protocol",
    statementText: "[آزمایشی POCKET-DEMO-030] محتوای منتشرشده هیپوگلیسمی که پس از انتشار، پروانه یکی از ۲ داور آن منقضی شده و حدنصاب معتبر از دست رفته است.",
    validUntilOffsetDays: 365,
    targetOutcome: "published_post_pub_cred_expired",
  },
  {
    scenarioId: "POCKET-DEMO-031",
    assertionKey: `${DEMO_PREFIX}031-pub-conflict-active`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-warfarin`,
    assertionType: "interaction",
    statementText: "[آزمایشی POCKET-DEMO-031] تداخل دارویی وارفارین دارای تعارض بالینی فعال (pocket_clinical_conflicts) - از خروجی مصرف‌کننده مسدود می‌شود.",
    validUntilOffsetDays: 365,
    targetOutcome: "published_conflict_active",
  },
  {
    scenarioId: "POCKET-DEMO-032",
    assertionKey: `${DEMO_PREFIX}032-pub-mixed-votes`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-warfarin`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-032] دوز آزمایشی وارفارین با ترکیب ۲ تایید معتبر + ۱ تایید با Credential منقضی/لغوشده (همچنان حدنصاب ۲ حفظ شده است).",
    validUntilOffsetDays: 365,
    targetOutcome: "published_mixed_valid_invalid",
  },

  // 33-34: Superseded Chain & Retired + Governance Conflict/Disagreement in Review
  {
    scenarioId: "POCKET-DEMO-033",
    assertionKey: `${DEMO_PREFIX}033-superseded-chain`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-epilepsy`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-033 v2] نسخه به‌روزشده بیماری صرع کانونی که نسخه قبلی (v1) را Superseded کرده است.",
    validUntilOffsetDays: 365,
    targetOutcome: "superseded_chain",
  },
  {
    scenarioId: "POCKET-DEMO-034",
    assertionKey: `${DEMO_PREFIX}034-retired-historical`,
    pillarType: "disease",
    pillarSlug: `${DEMO_PREFIX}disease-gerd`,
    assertionType: "general_info",
    statementText: "[آزمایشی POCKET-DEMO-034] رکورد تاریخی بازنشسته‌شده (retired) برای نمایش عدم انتشار و غیرقابل بازگشت بودن.",
    validUntilOffsetDays: -60,
    targetOutcome: "retired_historical",
  },
  {
    scenarioId: "POCKET-DEMO-035",
    assertionKey: `${DEMO_PREFIX}035-reviewed-disagreement`,
    pillarType: "drug",
    pillarSlug: `${DEMO_PREFIX}drug-metformin`,
    assertionType: "contraindication",
    statementText: "[آزمایشی POCKET-DEMO-035] منع مصرف آزمایشی متفورمین با اختلاف‌نظر فعال بین دو داور (۱ تایید + ۱ رد بالینی).",
    validUntilOffsetDays: 365,
    targetOutcome: "reviewed_with_rejection_disagreement",
  },
  {
    scenarioId: "POCKET-DEMO-036",
    assertionKey: `${DEMO_PREFIX}036-reviewed-expired-cred-vote`,
    pillarType: "treatment",
    pillarSlug: `${DEMO_PREFIX}treatment-htn-firstline`,
    assertionType: "dosing",
    statementText: "[آزمایشی POCKET-DEMO-036] پروتکل فشار خون با رای ثبت‌شده توسط داوری که پروانه او پس از رای منقضی شده است.",
    validUntilOffsetDays: 365,
    targetOutcome: "reviewed_with_expired_cred_vote",
  },
];

async function ensureDemoUsers(
  db: DbClient,
): Promise<Map<string, { id: string; actor: Actor; spec: DemoUserSpec }>> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const userMap = new Map<string, { id: string; actor: Actor; spec: DemoUserSpec }>();

  for (const spec of DEMO_USERS) {
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, spec.email))
      .limit(1);

    let userId: string;
    if (existing.length > 0 && existing[0]) {
      userId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(schema.users)
        .values({
          email: spec.email,
          name: spec.name,
          globalRole: spec.globalRole,
          teacherStatus: spec.teacherStatus,
          passwordHash,
          emailVerifiedAt: now,
        })
        .returning({ id: schema.users.id });
      if (!inserted) {
        throw new Error(`Failed to insert demo user ${spec.email}`);
      }
      userId = inserted.id;
    }

    userMap.set(spec.key, {
      id: userId,
      actor: makeActor(userId, spec),
      spec,
    });
  }

  return userMap;
}

async function ensureReviewerCredentials(
  db: DbClient,
  reviewerService: ReviewerService,
  adminActor: Actor,
  users: Map<string, { id: string; actor: Actor; spec: DemoUserSpec }>,
): Promise<void> {
  const specs: Array<{
    userKey: string;
    license: string;
    specialty: string;
    authority: string;
    mode: "active" | "expired" | "suspended" | "revoked" | "postpub_expired";
  }> = [
    {
      userKey: "reviewer1",
      license: "DEMO-LIC-1001",
      specialty: "داروسازی بالینی",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "active",
    },
    {
      userKey: "reviewer2",
      license: "DEMO-LIC-1002",
      specialty: "قلب و عروق و داخلی",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "active",
    },
    {
      userKey: "reviewer3",
      license: "DEMO-LIC-1003",
      specialty: "بیماری‌های عفونی و نورولوژی",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "active",
    },
    {
      userKey: "reviewerExpired",
      license: "DEMO-LIC-EXP-1004",
      specialty: "فارماکولوژی",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "expired",
    },
    {
      userKey: "reviewerSuspended",
      license: "DEMO-LIC-SUSP-1005",
      specialty: "ایمنی دارویی",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "suspended",
    },
    {
      userKey: "reviewerRevoked",
      license: "DEMO-LIC-REV-1006",
      specialty: "غدد",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "revoked",
    },
    {
      userKey: "reviewerPostPubExpired",
      license: "DEMO-LIC-POSTPUB-1007",
      specialty: "طب اورژانس",
      authority: "سازمان نظام پزشکی (دمو)",
      mode: "postpub_expired",
    },
  ];

  for (const item of specs) {
    const userEntry = users.get(item.userKey);
    if (!userEntry) continue;

    const existing = await db
      .select({ id: schema.pocketClinicalReviewerCredentials.id })
      .from(schema.pocketClinicalReviewerCredentials)
      .where(
        and(
          eq(schema.pocketClinicalReviewerCredentials.userId, userEntry.id),
          eq(schema.pocketClinicalReviewerCredentials.medicalLicenseNumber, item.license),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const granted = await reviewerService.grantCredential(adminActor, {
      userId: userEntry.id,
      medicalLicenseNumber: item.license,
      specialty: item.specialty,
      licensingAuthority: item.authority,
      licenseExpiresAt: daysFromTodayDate(365),
    });

    if (item.mode === "expired") {
      // ReviewerService.grantCredential enforces future licenseExpiresAt at creation time;
      // for demoing an expired credential, backdate license_expires_at in a controlled update.
      await db
        .update(schema.pocketClinicalReviewerCredentials)
        .set({ licenseExpiresAt: daysFromTodayDate(-30) })
        .where(eq(schema.pocketClinicalReviewerCredentials.id, granted.id));
    } else if (item.mode === "suspended") {
      await reviewerService.suspendCredential(adminActor, {
        credentialId: granted.id,
        reason: "[DEMO] تعلیق آزمایشی جهت بررسی سناریوی Reviewer Governance",
      });
    } else if (item.mode === "revoked") {
      await reviewerService.revokeCredential(adminActor, {
        credentialId: granted.id,
        reason: "[DEMO] لغو مجوز آزمایشی جهت بررسی سناریوی Reviewer Governance",
      });
    }
  }
}

async function ensureDemoSource(db: DbClient): Promise<string> {
  const code = `${DEMO_PREFIX}src-clinical-ref`;
  const existing = await db
    .select({ id: schema.pocketSources.id })
    .from(schema.pocketSources)
    .where(eq(schema.pocketSources.code, code))
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(schema.pocketSources)
    .values({
      code,
      title: "[DEMO] مرجع آزمایشی فارماکوتراپی و راهنمای بالینی AVANA",
      publisher: "AVANA Demo Editorial Board",
      sourceType: "clinical_guideline",
      editionOrVersion: "Demo-2026.1",
      publicationDate: "2026-01-01",
      validUntilDate: daysFromTodayIsoDate(730),
      licenseType: "open_demo",
      reproductionAllowed: true,
      displayScope: "citation_pointer_only",
      storageScope: "metadata_only",
      auditStatus: "approved",
    })
    .returning({ id: schema.pocketSources.id });

  if (!inserted) throw new Error("Failed to insert demo pocket_source");
  return inserted.id;
}

async function ensureDemoPillars(db: DbClient): Promise<{
  drugs: Map<string, string>;
  diseases: Map<string, string>;
  treatments: Map<string, string>;
  emergencies: Map<string, string>;
}> {
  const drugs = new Map<string, string>();
  const diseases = new Map<string, string>();
  const treatments = new Map<string, string>();
  const emergencies = new Map<string, string>();

  for (const d of DEMO_DRUGS) {
    const existing = await db
      .select({ id: schema.pocketDrugs.id })
      .from(schema.pocketDrugs)
      .where(eq(schema.pocketDrugs.slug, d.slug))
      .limit(1);

    let drugId: string;
    if (existing.length > 0 && existing[0]) {
      drugId = existing[0].id;
    } else {
      const [ins] = await db
        .insert(schema.pocketDrugs)
        .values({
          slug: d.slug,
          genericNameEn: d.genericNameEn,
          genericNameFa: d.genericNameFa,
          brandNames: d.brandNames,
          drugClass: d.drugClass,
          mechanismOfAction: d.mechanismOfAction,
          standardAdultDoseText: d.standardAdultDoseText,
          counselingPoints: d.counselingPoints,
          organizationId: DEMO_ORG_ID,
          status: d.status,
          publishedAt: d.status === "published" ? new Date() : null,
        })
        .returning({ id: schema.pocketDrugs.id });
      if (!ins) throw new Error(`Failed to insert drug ${d.slug}`);
      drugId = ins.id;
    }
    drugs.set(d.slug, drugId);

    for (const alias of d.aliases) {
      const norm = alias.raw.trim().toLowerCase();
      const existingAlias = await db
        .select({ id: schema.pocketSearchAliases.id })
        .from(schema.pocketSearchAliases)
        .where(
          and(
            eq(schema.pocketSearchAliases.drugId, drugId),
            eq(schema.pocketSearchAliases.normalizedAlias, norm),
          ),
        )
        .limit(1);
      if (existingAlias.length === 0) {
        await db.insert(schema.pocketSearchAliases).values({
          drugId,
          rawAlias: alias.raw,
          normalizedAlias: norm,
          aliasType: alias.type,
          language: alias.lang,
          priorityWeight: 100,
        });
      }
    }
  }

  for (const dis of DEMO_DISEASES) {
    const existing = await db
      .select({ id: schema.pocketDiseases.id })
      .from(schema.pocketDiseases)
      .where(eq(schema.pocketDiseases.slug, dis.slug))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      diseases.set(dis.slug, existing[0].id);
    } else {
      const [ins] = await db
        .insert(schema.pocketDiseases)
        .values({
          slug: dis.slug,
          titleEn: dis.titleEn,
          titleFa: dis.titleFa,
          icd10Code: dis.icd10Code,
          definition: dis.definition,
          clinicalPearls: dis.clinicalPearls,
          organizationId: DEMO_ORG_ID,
          status: dis.status,
          publishedAt: dis.status === "published" ? new Date() : null,
        })
        .returning({ id: schema.pocketDiseases.id });
      if (!ins) throw new Error(`Failed to insert disease ${dis.slug}`);
      diseases.set(dis.slug, ins.id);
    }
  }

  for (const tr of DEMO_TREATMENTS) {
    const existing = await db
      .select({ id: schema.pocketTreatments.id })
      .from(schema.pocketTreatments)
      .where(eq(schema.pocketTreatments.slug, tr.slug))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      treatments.set(tr.slug, existing[0].id);
    } else {
      const [ins] = await db
        .insert(schema.pocketTreatments)
        .values({
          slug: tr.slug,
          titleEn: tr.titleEn,
          titleFa: tr.titleFa,
          treatmentType: tr.treatmentType,
          pharmacologicalStrategy: tr.pharmacologicalStrategy,
          efficacyMonitoring: tr.efficacyMonitoring,
          safetyMonitoring: tr.safetyMonitoring,
          organizationId: DEMO_ORG_ID,
          status: tr.status,
          publishedAt: tr.status === "published" ? new Date() : null,
        })
        .returning({ id: schema.pocketTreatments.id });
      if (!ins) throw new Error(`Failed to insert treatment ${tr.slug}`);
      treatments.set(tr.slug, ins.id);
    }
  }

  for (const em of DEMO_EMERGENCIES) {
    const existing = await db
      .select({ id: schema.pocketEmergencies.id })
      .from(schema.pocketEmergencies)
      .where(eq(schema.pocketEmergencies.slug, em.slug))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      emergencies.set(em.slug, existing[0].id);
    } else {
      const [ins] = await db
        .insert(schema.pocketEmergencies)
        .values({
          slug: em.slug,
          titleEn: em.titleEn,
          titleFa: em.titleFa,
          conditionType: em.conditionType,
          immediateTriageGuidance: em.immediateTriageGuidance,
          referralAndEscalationCriteria: em.referralAndEscalationCriteria,
          organizationId: DEMO_ORG_ID,
          status: em.status,
          publishedAt: em.status === "published" ? new Date() : null,
        })
        .returning({ id: schema.pocketEmergencies.id });
      if (!ins) throw new Error(`Failed to insert emergency ${em.slug}`);
      emergencies.set(em.slug, ins.id);
    }
  }

  return { drugs, diseases, treatments, emergencies };
}

async function runSeed(): Promise<void> {
  const dbUrl = resolveAndValidateLocalDbUrl();
  const { db, close } = createDbClient(dbUrl);

  try {
    await verifyLivePostgresIdentity(db);

    const reviewerStore = new DrizzleReviewerStore(db);
    const reviewerService = new ReviewerService({ reviewerStore, db });
    const assertionReviewStore = new DrizzleAssertionReviewStore(db);
    const assertionReviewService = new AssertionReviewService({
      assertionReviewStore,
      reviewerService,
      db,
    });
    const verificationStore = new DrizzleAssertionVerificationStore(db);
    const verificationService = new AssertionVerificationService({
      verificationStore,
      assertionStore: assertionReviewStore,
      reviewerService,
      db,
    });
    const publishingStore = new DrizzleAssertionPublishingStore(db);
    const publishingService = new AssertionPublishingService({
      publishingStore,
      assertionStore: assertionReviewStore,
      verificationStore,
      db,
    });
    const safetyOverrideStore = new DrizzleSafetyOverrideStore(db);
    const safetyOverrideService = new SafetyOverrideService({
      safetyOverrideStore,
      db,
    });

    const users = await ensureDemoUsers(db);
    const admin = users.get("admin")!;
    const rev1 = users.get("reviewer1")!;
    const rev2 = users.get("reviewer2")!;
    const rev3 = users.get("reviewer3")!;
    const revPostPub = users.get("reviewerPostPubExpired")!;

    await ensureReviewerCredentials(db, reviewerService, admin.actor, users);
    const sourceId = await ensureDemoSource(db);
    const pillars = await ensureDemoPillars(db);

    // Ensure a demo release record for tagging if needed
    let assertionsCreated = 0;
    let assertionsSkipped = 0;
    const createdAssertionIds = new Map<string, string>();

    for (const spec of SCENARIO_SPECS) {
      const existing = await db
        .select({ id: schema.pocketScientificAssertions.id })
        .from(schema.pocketScientificAssertions)
        .where(eq(schema.pocketScientificAssertions.assertionKey, spec.assertionKey))
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        createdAssertionIds.set(spec.scenarioId, existing[0].id);
        assertionsSkipped += 1;
        continue;
      }

      const pillarFk: {
        drugId?: string | null;
        diseaseId?: string | null;
        treatmentId?: string | null;
        emergencyId?: string | null;
      } = {};
      if (spec.pillarType === "drug") pillarFk.drugId = pillars.drugs.get(spec.pillarSlug) ?? null;
      if (spec.pillarType === "disease")
        pillarFk.diseaseId = pillars.diseases.get(spec.pillarSlug) ?? null;
      if (spec.pillarType === "treatment")
        pillarFk.treatmentId = pillars.treatments.get(spec.pillarSlug) ?? null;
      if (spec.pillarType === "emergency")
        pillarFk.emergencyId = pillars.emergencies.get(spec.pillarSlug) ?? null;

      const validUntilDate =
        spec.validUntilOffsetDays !== null
          ? daysFromTodayIsoDate(spec.validUntilOffsetDays)
          : null;

      // Special case: Superseded chain creates v1, publishes v1, then creates v2 and publishes v2
      if (spec.targetOutcome === "superseded_chain") {
        const v1 = await assertionReviewService.createDraftAssertion(rev1.actor, {
          ...pillarFk,
          assertionType: spec.assertionType,
          assertionKey: `${spec.assertionKey}-v1`,
          statementText: "[آزمایشی POCKET-DEMO-033 v1] نسخه قدیمی بیماری صرع کانونی (باید Superseded شود).",
          validUntilDate,
        });
        await db.insert(schema.pocketAssertionCitations).values({
          assertionId: v1.id,
          sourceId,
          locationReference: "Demo Sec 1.0",
          accessedAt: daysFromTodayIsoDate(0),
          evidenceGrade: "B",
          verifiedByUserId: rev1.id,
          status: "published",
        });
        await assertionReviewService.submitForReview(rev1.actor, { assertionId: v1.id });
        await assertionReviewService.recordReviewDecision(rev2.actor, {
          assertionId: v1.id,
          decision: "approve",
          notes: "[DEMO] تایید اولیه نسخه ۱",
        });
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: v1.id,
          clinicalReviewNotes: "[DEMO] تایید بالینی نسخه ۱",
        });
        await publishingService.publishAssertion(admin.actor, { assertionId: v1.id });

        // Create v2 under the SAME assertionRootId
        const v2 = await assertionReviewService.createDraftAssertion(rev1.actor, {
          assertionRootId: v1.assertionRootId,
          versionNumber: 2,
          previousVersionId: v1.id,
          ...pillarFk,
          assertionType: spec.assertionType,
          assertionKey: spec.assertionKey,
          statementText: spec.statementText,
          validUntilDate,
        });
        await db.insert(schema.pocketAssertionCitations).values({
          assertionId: v2.id,
          sourceId,
          locationReference: "Demo Sec 2.0",
          accessedAt: daysFromTodayIsoDate(0),
          evidenceGrade: "A",
          verifiedByUserId: rev1.id,
          status: "published",
        });
        await assertionReviewService.submitForReview(rev1.actor, { assertionId: v2.id });
        await assertionReviewService.recordReviewDecision(rev2.actor, {
          assertionId: v2.id,
          decision: "approve",
          notes: "[DEMO] تایید اولیه نسخه ۲",
        });
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: v2.id,
          clinicalReviewNotes: "[DEMO] تایید بالینی نسخه ۲",
        });
        await publishingService.publishAssertion(admin.actor, { assertionId: v2.id });

        createdAssertionIds.set(`${spec.scenarioId}-v1`, v1.id);
        createdAssertionIds.set(spec.scenarioId, v2.id);
        assertionsCreated += 2;
        continue;
      }

      // Create draft assertion via real service
      const draft = await assertionReviewService.createDraftAssertion(rev1.actor, {
        ...pillarFk,
        assertionType: spec.assertionType,
        assertionKey: spec.assertionKey,
        statementText: spec.statementText,
        validUntilDate,
      });

      await db.insert(schema.pocketAssertionCitations).values({
        assertionId: draft.id,
        sourceId,
        locationReference: `Demo Ref ${spec.scenarioId}`,
        accessedAt: daysFromTodayIsoDate(0),
        evidenceGrade: "A",
        verifiedByUserId: rev1.id,
        status: "draft",
      });

      createdAssertionIds.set(spec.scenarioId, draft.id);
      assertionsCreated += 1;

      if (spec.targetOutcome === "draft") {
        continue;
      }

      await assertionReviewService.submitForReview(rev1.actor, {
        assertionId: draft.id,
        notes: `[DEMO] ارسال برای بررسی ${spec.scenarioId}`,
      });

      if (spec.targetOutcome === "in_review") {
        continue;
      }

      await assertionReviewService.recordReviewDecision(rev2.actor, {
        assertionId: draft.id,
        decision: "approve",
        notes: `[DEMO] تایید مرور اولیه ${spec.scenarioId}`,
      });

      if (spec.targetOutcome === "reviewed") {
        continue;
      }

      if (spec.targetOutcome === "retired_historical") {
        // Retire assertion (not exposed as public service transition; controlled state setup)
        await assertionReviewStore.updateStatus(draft.id, "retired");
        await assertionReviewStore.insertAuditLog({
          assertionId: draft.id,
          actorUserId: admin.id,
          action: "retired",
          previousStatus: "reviewed",
          newStatus: "retired",
          clinicalNotes: "[DEMO] بازنشسته‌سازی تاریخی برای سناریوی retired",
        });
        continue;
      }

      if (spec.targetOutcome === "reviewed_with_rejection_disagreement") {
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید داور اول",
        });
        await verificationService.rejectAssertionVerification(rev2.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] رد بالینی داور دوم - ایجاد اختلاف‌نظر فعال",
        });
        continue;
      }

      if (spec.targetOutcome === "reviewed_with_expired_cred_vote") {
        // Grant a temporary active credential to revExpired? No, use revPostPub or insert vote?
        // Instead, verify with rev1 (or a dedicated user) — here we use revPostPub BEFORE expiry, then expire!
        // Note: revPostPub is used for POCKET-DEMO-030 too, so both share the post-expiry state cleanly.
        await verificationService.verifyAssertion(revPostPub.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] رای ثبت‌شده پیش از انقضای پروانه",
        });
        continue;
      }

      if (spec.targetOutcome === "verified_single_quorum_short") {
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تنها ۱ تایید ثبت شده (کمتر از حدنصاب ۲)",
        });
        continue;
      }

      if (spec.targetOutcome === "verified_ready_for_publish") {
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید بالینی داور اول",
        });
        await verificationService.verifyAssertion(rev2.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید بالینی داور دوم",
        });
        continue;
      }

      // Remaining outcomes require publishing!
      if (spec.targetOutcome === "published_post_pub_cred_expired") {
        await verificationService.verifyAssertion(rev1.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید داور اول (فعال)",
        });
        await verificationService.verifyAssertion(revPostPub.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید داور دوم پیش از انقضای پروانه",
        });
        await publishingService.publishAssertion(admin.actor, {
          assertionId: draft.id,
          notes: "[DEMO] انتشار پیش از انقضای پروانه داور دوم",
        });
        continue;
      }

      // Standard 2-reviewer verification (satisfies both quorum=1 and quorum=2)
      await verificationService.verifyAssertion(rev1.actor, {
        assertionId: draft.id,
        clinicalReviewNotes: `[DEMO] تایید بالینی ۱ برای ${spec.scenarioId}`,
      });
      await verificationService.verifyAssertion(rev2.actor, {
        assertionId: draft.id,
        clinicalReviewNotes: `[DEMO] تایید بالینی ۲ برای ${spec.scenarioId}`,
      });

      if (spec.targetOutcome === "published_mixed_valid_invalid") {
        // Also add a vote from revPostPub (whose credential will be expired at end of run)
        await verificationService.verifyAssertion(revPostPub.actor, {
          assertionId: draft.id,
          clinicalReviewNotes: "[DEMO] تایید داور سوم (پروانه این داور منقضی خواهد شد)",
        });
      }

      await publishingService.publishAssertion(admin.actor, {
        assertionId: draft.id,
        notes: `[DEMO] انتشار ${spec.scenarioId}`,
      });

      // Post-publish governance overlays
      if (spec.targetOutcome === "published_override_active") {
        await safetyOverrideService.activateOverride(admin.actor, {
          targetEntityType: "assertion",
          targetEntityId: draft.id,
          reason: "[DEMO] فعال‌سازی Safety Override جهت مسدودسازی نمایش به مصرف‌کننده",
        });
      } else if (spec.targetOutcome === "published_override_cleared") {
        const ov = await safetyOverrideService.activateOverride(admin.actor, {
          targetEntityType: "assertion",
          targetEntityId: draft.id,
          reason: "[DEMO] فعال‌سازی موقت Override",
        });
        await safetyOverrideService.clearOverride(admin.actor, {
          overrideId: ov.override.id,
          reason: "[DEMO] رفع Override پس از بازبینی ایمنی",
        });
      } else if (spec.targetOutcome === "published_override_history") {
        const ov1 = await safetyOverrideService.activateOverride(admin.actor, {
          targetEntityType: "assertion",
          targetEntityId: draft.id,
          reason: "[DEMO] مرحله ۱: فعال‌سازی اولیه Override",
        });
        await safetyOverrideService.clearOverride(admin.actor, {
          overrideId: ov1.override.id,
          reason: "[DEMO] مرحله ۲: رفع موقت Override",
        });
        await safetyOverrideService.activateOverride(admin.actor, {
          targetEntityType: "assertion",
          targetEntityId: draft.id,
          reason: "[DEMO] مرحله ۳: فعال‌سازی مجدد Override",
        });
      } else if (spec.targetOutcome === "published_conflict_active") {
        const healthyRef = createdAssertionIds.get("POCKET-DEMO-013");
        if (healthyRef) {
          await verificationService.recordClinicalConflict(rev3.actor, {
            assertionAId: draft.id,
            assertionBId: healthyRef,
            conflictSubject: `[DEMO] تعارض بالینی آزمایشی ${spec.scenarioId}`,
            discrepancyDescription:
              "[DEMO] اختلاف گزارش‌شده بین دو Assertion جهت تست مسدودسازی خودکار در Consumption و Search.",
          });
        }
      }
    }

    // Finally, expire revPostPub's credential AFTER post-publication assertions were published!
    await db
      .update(schema.pocketClinicalReviewerCredentials)
      .set({ licenseExpiresAt: daysFromTodayDate(-5) })
      .where(eq(schema.pocketClinicalReviewerCredentials.userId, revPostPub.id));

    // Create sample clinical links & interactions (idempotent)
    const atorvaId = pillars.drugs.get(`${DEMO_PREFIX}drug-atorvastatin`);
    const warfarinId = pillars.drugs.get(`${DEMO_PREFIX}drug-warfarin`);
    const htnId = pillars.diseases.get(`${DEMO_PREFIX}disease-hypertension`);
    const htnTreatId = pillars.treatments.get(`${DEMO_PREFIX}treatment-htn-firstline`);
    const pubAtorvaAssertionId = createdAssertionIds.get("POCKET-DEMO-013");

    if (atorvaId && htnId) {
      await db
        .insert(schema.pocketDrugDiseaseLinks)
        .values({
          drugId: atorvaId,
          diseaseId: htnId,
          assertionId: pubAtorvaAssertionId ?? null,
          relationshipType: "adjunct_therapy",
          clinicalNotes: "[DEMO] ارتباط آزمایشی دارو و بیماری",
        })
        .onConflictDoNothing();
    }

    if (htnId && htnTreatId) {
      await db
        .insert(schema.pocketDiseaseTreatmentLinks)
        .values({
          diseaseId: htnId,
          treatmentId: htnTreatId,
          lineOfTherapy: "first_line",
          isStandardOfCare: true,
          clinicalNotes: "[DEMO] ارتباط آزمایشی بیماری و پروتکل",
        })
        .onConflictDoNothing();
    }

    if (atorvaId && warfarinId && pubAtorvaAssertionId) {
      const [drugAId, drugBId] = atorvaId < warfarinId ? [atorvaId, warfarinId] : [warfarinId, atorvaId];
      await db
        .insert(schema.pocketDrugInteractions)
        .values({
          drugAId,
          drugBId,
          assertionId: pubAtorvaAssertionId,
          severity: "moderate",
          mechanismType: "pharmacokinetic",
          clinicalConsequencePersian: "[DEMO] تداخل آزمایشی جهت نمایش در بخش Related Entities.",
          managementActionPersian: "[DEMO] پایش آزمایشی بدون توصیه بالینی واقعی.",
          status: "published",
        })
        .onConflictDoNothing();
    }

    console.log("-------------------------------------------------------------------");
    console.log("  AVANA Pocket Demo Seed Completed");
    console.log(`  Demo Users: ${users.size}`);
    console.log(`  Demo Pillars: ${DEMO_DRUGS.length} drugs, ${DEMO_DISEASES.length} diseases, ${DEMO_TREATMENTS.length} treatments, ${DEMO_EMERGENCIES.length} emergencies`);
    console.log(`  Assertions Created: ${assertionsCreated}, Existing Skipped: ${assertionsSkipped}`);
    console.log("-------------------------------------------------------------------");
  } finally {
    await close();
  }
}

async function runCleanup(): Promise<void> {
  const dbUrl = resolveAndValidateLocalDbUrl();
  const { db, close } = createDbClient(dbUrl);

  try {
    await verifyLivePostgresIdentity(db);

    const demoUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(like(schema.users.email, `${DEMO_PREFIX}%${DEMO_EMAIL_DOMAIN}`));
    const demoUserIds = demoUsers.map((u) => u.id);

    const demoDrugs = await db
      .select({ id: schema.pocketDrugs.id })
      .from(schema.pocketDrugs)
      .where(like(schema.pocketDrugs.slug, `${DEMO_PREFIX}%`));
    const demoDrugIds = demoDrugs.map((d) => d.id);

    const demoDiseases = await db
      .select({ id: schema.pocketDiseases.id })
      .from(schema.pocketDiseases)
      .where(like(schema.pocketDiseases.slug, `${DEMO_PREFIX}%`));
    const demoDiseaseIds = demoDiseases.map((d) => d.id);

    const demoTreatments = await db
      .select({ id: schema.pocketTreatments.id })
      .from(schema.pocketTreatments)
      .where(like(schema.pocketTreatments.slug, `${DEMO_PREFIX}%`));
    const demoTreatmentIds = demoTreatments.map((t) => t.id);

    const demoEmergencies = await db
      .select({ id: schema.pocketEmergencies.id })
      .from(schema.pocketEmergencies)
      .where(like(schema.pocketEmergencies.slug, `${DEMO_PREFIX}%`));
    const demoEmergencyIds = demoEmergencies.map((e) => e.id);

    const demoAssertions = await db
      .select({ id: schema.pocketScientificAssertions.id })
      .from(schema.pocketScientificAssertions)
      .where(like(schema.pocketScientificAssertions.assertionKey, `${DEMO_PREFIX}%`));
    const demoAssertionIds = demoAssertions.map((a) => a.id);

    const allTargetEntityIds = [
      ...demoAssertionIds,
      ...demoDrugIds,
      ...demoDiseaseIds,
      ...demoTreatmentIds,
      ...demoEmergencyIds,
    ];

    await db.transaction(async (tx) => {
      if (allTargetEntityIds.length > 0) {
        await tx
          .delete(schema.pocketSafetyOverrides)
          .where(inArray(schema.pocketSafetyOverrides.targetEntityId, allTargetEntityIds));

        await tx
          .delete(schema.pocketEntityVersionRegistry)
          .where(inArray(schema.pocketEntityVersionRegistry.aggregateId, allTargetEntityIds));

        await tx
          .delete(schema.pocketOutbox)
          .where(inArray(schema.pocketOutbox.aggregateId, allTargetEntityIds));
      }

      if (demoAssertionIds.length > 0) {
        await tx
          .delete(schema.pocketClinicalConflicts)
          .where(
            or(
              inArray(schema.pocketClinicalConflicts.assertionAId, demoAssertionIds),
              inArray(schema.pocketClinicalConflicts.assertionBId, demoAssertionIds),
            ),
          );

        await tx
          .delete(schema.pocketAssertionAuditLog)
          .where(inArray(schema.pocketAssertionAuditLog.assertionId, demoAssertionIds));

        // Break linear parent chain before deleting verifications (fk_verif_parent_same_assertion_reviewer ON DELETE RESTRICT)
        await tx
          .update(schema.pocketAssertionVerifications)
          .set({ parentVerificationId: null })
          .where(inArray(schema.pocketAssertionVerifications.assertionId, demoAssertionIds));

        await tx
          .delete(schema.pocketAssertionVerifications)
          .where(inArray(schema.pocketAssertionVerifications.assertionId, demoAssertionIds));

        await tx
          .delete(schema.pocketAssertionCitations)
          .where(inArray(schema.pocketAssertionCitations.assertionId, demoAssertionIds));

        await tx
          .delete(schema.pocketDrugInteractions)
          .where(inArray(schema.pocketDrugInteractions.assertionId, demoAssertionIds));

        await tx
          .delete(schema.pocketDrugDiseaseLinks)
          .where(inArray(schema.pocketDrugDiseaseLinks.assertionId, demoAssertionIds));

        await tx
          .delete(schema.pocketTreatmentDrugs)
          .where(inArray(schema.pocketTreatmentDrugs.assertionId, demoAssertionIds));

        // Break self-referencing previous_version_id before deleting assertions
        await tx
          .update(schema.pocketScientificAssertions)
          .set({ previousVersionId: null })
          .where(inArray(schema.pocketScientificAssertions.id, demoAssertionIds));

        await tx
          .delete(schema.pocketScientificAssertions)
          .where(inArray(schema.pocketScientificAssertions.id, demoAssertionIds));
      }

      if (demoDrugIds.length > 0) {
        await tx
          .delete(schema.pocketDrugs)
          .where(inArray(schema.pocketDrugs.id, demoDrugIds));
      }
      if (demoDiseaseIds.length > 0) {
        await tx
          .delete(schema.pocketDiseases)
          .where(inArray(schema.pocketDiseases.id, demoDiseaseIds));
      }
      if (demoTreatmentIds.length > 0) {
        await tx
          .delete(schema.pocketTreatments)
          .where(inArray(schema.pocketTreatments.id, demoTreatmentIds));
      }
      if (demoEmergencyIds.length > 0) {
        await tx
          .delete(schema.pocketEmergencies)
          .where(inArray(schema.pocketEmergencies.id, demoEmergencyIds));
      }

      await tx
        .delete(schema.pocketSources)
        .where(like(schema.pocketSources.code, `${DEMO_PREFIX}%`));

      if (demoUserIds.length > 0) {
        await tx
          .delete(schema.pocketClinicalReviewerCredentials)
          .where(inArray(schema.pocketClinicalReviewerCredentials.userId, demoUserIds));

        await tx.delete(schema.users).where(inArray(schema.users.id, demoUserIds));
      }
    });

    console.log("-------------------------------------------------------------------");
    console.log("  AVANA Pocket Demo Cleanup Completed");
    console.log(`  Removed Assertions: ${demoAssertionIds.length}`);
    console.log(`  Removed Pillars: ${demoDrugIds.length + demoDiseaseIds.length + demoTreatmentIds.length + demoEmergencyIds.length}`);
    console.log(`  Removed Demo Users: ${demoUserIds.length}`);
    console.log("-------------------------------------------------------------------");
  } finally {
    await close();
  }
}

const isCleanup = process.argv.includes("--cleanup");
(isCleanup ? runCleanup() : runSeed()).catch((err: unknown) => {
  console.error("[Pocket Demo Script Error]", err);
  process.exit(1);
});
