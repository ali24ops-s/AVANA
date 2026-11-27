/**
 * verify-mindmap-gemini-live.mjs
 *
 * Standalone Live Gemini Validation script for the Hierarchical-First MindMap pipeline.
 * Runs the REAL MindMapService + GeminiModelGateway (gemini-3.5-flash-lite)
 * using isolated in-memory stores:
 *   - Zero Production database writes
 *   - Zero Wallet / billing debits
 *   - Zero real user data mutations
 *   - Never prints GEMINI_API_KEY
 *
 * Prerequisites:
 *   1. npm run build
 *   2. GEMINI_API_KEY (or GEMINI_API_KEYS) configured in .env or environment
 *
 * Usage:
 *   node scripts/verify-mindmap-gemini-live.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SCENARIOS = [
  {
    name: "1. Comprehensive Pharmacology (Corticosteroids)",
    moduleTitle: "داروهای کورتیکواستروئیدی",
    lessonContent: `
داروهای کورتیکواستروئیدی شامل گلوکوکورتیکوئیدها و مینرالوکورتیکوئیدها هستند که از قشر غده آدرنال ترشح یا به صورت صناعی تولید می‌شوند.
۱. گلوکوکورتیکوئیدها:
با اتصال به گیرنده‌های سیتوپلاسمی GR و ورود به هسته، رونویسی ژن‌های ضدالتهابی (مانند لیپوکورتین/آنکسین-۱) را افزایش داده و فسفولیپاز A2 و سایتوکین‌های پیش‌التهابی را مهار می‌کنند.
- پردنیزولون: متابولیت فعال پردنیزون در کبد با نیمه‌عمر متوسط و فعالیت ضدالتهابی ۴ برابر کورتیزول. کاربرد در آسم، بیماری‌های خودایمنی و التهابی. عوارض: سندرم کوشینگ، پوکی استخوان، هیپرگلیسمی و سرکوب محور HPA.
- دگزامتازون: گلوکوکورتیکوئید طولانی‌اثر بسیار قوی (۲۵ برابر کورتیزول) و فاقد اثر مینرالوکورتیکوئیدی. کاربرد شاخص در ادم مغزی، تهوع ناشی از شیمی‌درمانی و تست سرکوب دگزامتازون.
۲. مینرالوکورتیکوئیدها:
- فلودروکورتیزون: مینرالوکورتیکوئید صناعی پرقدرت با اثر بر سلول‌های اصلی توبول دیستال و مجرای جمع‌کننده کلیه (گیرنده MR)، افزایش کانال‌های ENaC و پمپ Na+/K+ ATPase، بازجذب سدیم و آب و دفع پتاسیم و پروتون. کاربرد: درمان جایگزینی بیماری آدیسون و هیپوتانسیون ارتوستاتیک. عوارض: هیپرتانسیون، ادم و هیپوکالمی.
    `,
  },
  {
    name: "2. Single Specific Drug (Metformin)",
    moduleTitle: "متفورمین (Metformin)",
    lessonContent: `
متفورمین داروی خط اول درمان دیابت نوع ۲ از دسته بیگوانیدها است.
مکانیسم اثر: متفورمین با فعال‌سازی آنزیم AMPK در سلول‌های کبدی، گلوکونئوژنز کبدی را مهار کرده، حساسیت بافت‌های محیطی (عضله و چربی) به انسولین را افزایش می‌دهد و جذب گلوکز روده‌ای را کاهش می‌دهد. برخلاف سولفونیل‌اوره‌ها، متفورمین ترشح انسولین را تحریک نمی‌کند و به تنهایی باعث هیپوگلیسمی نمی‌شود.
فارماکوکینتیک: به صورت تغییرنیافته از طریق کلیه (فیلتراسیون گلومرولی و ترشح توبولی) دفع می‌شود.
موارد مصرف: دیابت نوع ۲، سندرم تخمدان پلی‌کیستیک (PCOS) و پیش‌دیابت.
عوارض جانبی و منع مصرف: شایع‌ترین عارضه اختلالات گوارشی (تهوع، اسهال) و کمبود ویتامین B12 در مصرف طولانی است. نادرترین ولی خطرناک‌ترین عارضه اسیدوز لاکتیک است؛ بنابراین در نارسایی کلیوی شدید (eGFR زیر ۳۰) و هیپوکسی شدید منع مصرف دارد.
    `,
  },
  {
    name: "3. Physiology Cause-Effect (RAAS)",
    moduleTitle: "سیستم رنین-آنژیوتانسین-آلدوسترون (RAAS)",
    lessonContent: `
سیستم رنین-آنژیوتانسین-آلدوسترون (RAAS) محور اصلی تنظیم فشار خون شریانی و حجم مایعات خارج‌سلولی است.
محرک‌های ترشح رنین: کاهش فشار پرفیوژن کلیوی (حس‌شده توسط بارورسپتورهای شریول آوران)، کاهش تحویل سدیم به ماکولا دنسا، و تحریک گیرنده‌های بتا-۱ آدرنرژیک سلول‌های جوکستاگلومرولار.
آبشار آنزیمی: رنین آنژیوتانسینوژن کبدی را به آنژیوتانسین I می‌شکند. سپس آنزیم مبدل آنژیوتانسین (ACE) در اندوتلیوم عروق ریه، آنژیوتانسین I را به آنژیوتانسین II تبدیل می‌کند (و همزمان برادی‌کینین را غیرفعال می‌سازد).
اثرات آنژیوتانسین II: انقباض قوی عروق مقاومتی (افزایش مقاومت عروقی محیطی)، تحریک ترشح آلدوسترون از زونا گلومرولوزای قشر آدرنال (بازجذب سدیم و آب در نفرون دیستال)، تحریک ترشح ADH و احساس تشنگی.
    `,
  },
  {
    name: "4. Pathology Classification (Anemias)",
    moduleTitle: "طبقه‌بندی پاتولوژیک کم‌خونی‌ها",
    lessonContent: `
کم‌خونی (آنمی) بر اساس میانگین حجم گلبول قرمز (MCV) به سه دسته اصلی تقسیم می‌شود:
۱. کم‌خونی‌های میکروسیتیک (MCV < 80 fL): ناشی از اختلال در سنتز هموگلوبین.
- کم‌خونی فقر آهن: شایع‌ترین علت؛ کاهش فریتین سرم، افزایش TIBC و کاهش آهن سرم.
- تالاسمی‌ها: اختلال ژنتیکی در سنتز زنجیره‌های گلوبین (آلفا یا بتا) با شمارش RBC بالا یا طبیعی.
۲. کم‌خونی‌های نورموسیتیک (MCV 80–100 fL):
- کم‌خونی بیماری‌های مزمن (التهاب مزمن و افزایش هپسیدین).
- کم‌خونی‌های همولیتیک (تخریب زودرس گلبول قرمز همراه با افزایش رتیکولوسیت‌ها و بیلی‌روبین غیرمستقیم).
۳. کم‌خونی‌های ماکروسیتیک (MCV > 100 fL):
- کم‌خونی مگالوبلاستیک ناشی از کمبود ویتامین B12 یا اسید فولیک (اختلال در سنتز DNA و نوتروفیل‌های هیپرسگمانته).
    `,
  },
  {
    name: "5. Linear Small Topic (Oral Drug Absorption)",
    moduleTitle: "جذب خوراکی داروها",
    lessonContent: `
اکثر داروهای خوراکی از طریق انتشار غیرفعال (Passive Diffusion) از غشای لیپیدی سلول‌های اپیتلیال روده کوچک جذب می‌شوند.
روده کوچک به دلیل سطح تماس بسیار وسیع (پرزها و میکروویلی‌ها) محل اصلی جذب داروهاست.
میزان یونیزاسیون دارو طبق معادله هندرسون-هاسلباخ به pKa دارو و pH محیط بستگی دارد؛ فرم غیریونیزه (محلول در چربی) به راحتی از غشا عبور می‌کند، بنابراین اسیدهای ضعیف در محیط اسیدی معده و بازهای ضعیف در محیط قلیایی‌تر روده فرم غیریونیزه بیشتری دارند.
    `,
  },
];

function computeTreeStats(nodes, rootNodeId) {
  const all = Object.values(nodes);
  const rootChildren = all.filter((n) => n.parentId === rootNodeId);
  const categoryCount = all.filter((n) => n.nodeRole === "category").length;
  const conceptCount = all.filter((n) => n.nodeRole === "concept").length;
  const emptyShortDescCount = all.filter(
    (n) => n.id !== rootNodeId && (!n.shortDescription || n.shortDescription.trim().length < 8),
  ).length;

  let maxDepth = 0;
  for (const n of all) {
    let d = 1;
    let curr = n.parentId;
    const seen = new Set([n.id]);
    while (curr && !seen.has(curr)) {
      seen.add(curr);
      d++;
      curr = nodes[curr]?.parentId ?? null;
    }
    if (d > maxDepth) maxDepth = d;
  }

  return {
    totalNodes: all.length,
    firstLevelBranches: rootChildren.length,
    maxDepth,
    categoryCount,
    conceptCount,
    emptyShortDescCount,
  };
}

async function main() {
  loadEnv();

  const hasApiKey = Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEYS ||
      process.env.GEMINI_API_KEY_1,
  );

  if (!hasApiKey) {
    console.error("ERROR: GEMINI_API_KEY (or GEMINI_API_KEYS) is not configured.");
    process.exit(1);
  }

  const apiDistBase = path.resolve(process.cwd(), "apps/api/dist");
  const serviceFile = path.join(apiDistBase, "modules/study/mind-map-service.js");
  if (!fs.existsSync(serviceFile)) {
    console.error("ERROR: apps/api/dist is not built. Run `npm run build` first.");
    process.exit(1);
  }

  const { MindMapService } = await import(pathToFileURL(serviceFile).href);
  const { InMemoryPersonalSummaryStore } = await import(
    pathToFileURL(path.join(apiDistBase, "modules/study/personal-summary-store.js")).href
  );
  const {
    InMemoryModuleStore,
    InMemoryLessonStore,
    InMemoryDocumentChunkStore,
  } = await import(
    pathToFileURL(path.join(apiDistBase, "modules/learning/test/in-memory-stores.js")).href
  );
  const { GeminiModelGateway } = await import(
    pathToFileURL(path.join(apiDistBase, "modules/generation/gateway/gemini.js")).href
  );

  const gateway = new GeminiModelGateway({
    socksProxyUrl: process.env.GEMINI_SOCKS_PROXY_URL || undefined,
  });

  console.log("=== AVANA Live Gemini Validation (Real MindMapService Pipeline) ===");
  console.log("Model:", gateway.model);
  console.log("API Key Configured: YES (redacted)");
  console.log("Mode: Isolated In-Memory Stores (Zero Production DB / Zero Wallet Debit)\n");

  const orgId = "live-eval-org";
  const courseId = "live-eval-course";
  const actor = { userId: "live-eval-user", role: "student" };

  const summaryRows = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const store = new InMemoryPersonalSummaryStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const courseStore = {
      findByIdForUser: async (cid, uid) =>
        cid === courseId && uid === actor.userId
          ? { id: courseId, organizationId: orgId, name: "Live Eval Course" }
          : null,
      findById: async () => null,
    };

    const events = [];
    const service = new MindMapService(
      store,
      gateway,
      moduleStore,
      lessonStore,
      courseStore,
      chunkStore,
      undefined,
      undefined,
      undefined,
      orgId,
      (ev) => events.push(ev),
      undefined, // No walletService -> zero debit
    );

    const modId = `live-mod-${i + 1}`;
    await moduleStore.create({
      id: modId,
      courseId,
      title: scenario.moduleTitle,
      sortOrder: i + 1,
      documentId: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await lessonStore.create({
      id: `live-lesson-${i + 1}`,
      moduleId: modId,
      title: scenario.moduleTitle,
      contentMarkdown: scenario.lessonContent.trim(),
      publicationStatus: "published",
      sortOrder: 1,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`--- Running ${scenario.name} ---`);
    const t0 = Date.now();
    try {
      const result = await service.generateMindMap(actor, modId, `live_cid_${i + 1}`, courseId);
      const totalMs = Date.now() - t0;
      const aiBase = result.mind_map.payload.aiBase;
      const stats = computeTreeStats(aiBase.nodes, aiBase.rootNodeId);

      const validatedEv = events.find(
        (e) => e.stage === "MIND_MAP_VALIDATED" && e.details?.pipeline === "hierarchical-first",
      );
      const coverageEv = events.find(
        (e) => e.stage === "MIND_MAP_VALIDATED" && e.details?.pipeline === "source-coverage",
      );

      const row = {
        scenario: scenario.name,
        status: "PASS",
        totalMs,
        ...stats,
        repairs: validatedEv?.details?.repairedWithAi ? 1 : 0,
        ungroundedCount: coverageEv?.details?.ungroundedCount ?? 0,
        missingAdded: coverageEv?.details?.addedCount ?? 0,
      };
      summaryRows.push(row);

      console.log(
        `PASS (${totalMs}ms) | Nodes=${stats.totalNodes} (Cat=${stats.categoryCount}, Con=${stats.conceptCount}) | RootBranches=${stats.firstLevelBranches} | MaxDepth=${stats.maxDepth} | EmptyDesc=${stats.emptyShortDescCount} | Repairs=${row.repairs} | Ungrounded=${row.ungroundedCount} | MissingAdded=${row.missingAdded}`,
      );
      for (const ev of events) {
        if (ev.durationMs > 0) {
          console.log(`  [${ev.stage}] ${ev.durationMs}ms (${ev.status})`);
        }
      }
    } catch (err) {
      const totalMs = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);
      summaryRows.push({
        scenario: scenario.name,
        status: "FAIL",
        totalMs,
        error: msg,
      });
      console.error(`FAIL (${totalMs}ms): ${msg}`);
    }
    console.log("");
  }

  console.log("=== SUMMARY ===");
  console.table(summaryRows);

  const anyFailed = summaryRows.some((r) => r.status === "FAIL");
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error in live validation:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
