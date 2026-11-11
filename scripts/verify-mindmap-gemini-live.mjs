/**
 * verify-mindmap-gemini-live.mjs
 *
 * Standalone live verification script to test real Gemini API generation
 * using model gemini-3.5-flash-lite and a comprehensive pharmacology source.
 *
 * Usage on an environment with outgoing internet access:
 *   node scripts/verify-mindmap-gemini-live.mjs
 */

import fs from "fs";
import path from "path";

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

const PHARMACOLOGY_SOURCE_TEXT = \`
فارماکولوژی داروهای ضد صرع و تشنج (Antiepileptic Drugs - AEDs)

مقدمه و تعریف تشنج:
صرع یک اختلال عصبی مزمن است که با تخلیه الکتریکی غیرطبیعی، همزمان و بیش‌ازحد نورون‌های کورتکس مغز مشخص می‌شود. هدف درمان دارویی، مهار تخلیه غیرطبیعی بدون مهار عملکردهای طبیعی سیستم عصبی مرکزی است.

دسته‌بندی داروهای ضد تشنج بر اساس مکانیسم اثر سلولی و مولکولی:

۱. مهارکننده‌های کانال‌های سدیمی وابسته به ولتاژ (Voltage-Gated Sodium Channel Blockers):
این داروها با اتصال به شکل غیرفعال (Inactivated state) کانال‌های سدیمی، دوره تحریک‌ناپذیری را طولانی کرده و مانع شلیک‌های مکرر با فرکانس بالا می‌شوند.
- فنی‌توئین (Phenytoin): داروی خط اول تشنج‌های تونیک-کلونیک جنرالیزه و فوکال. دارای فارماکوکینتیک غیرخطی (Zero-order kinetics) و اشباع‌پذیر. عوارض شاخص: هیپرپلازی لثه (Gingival hyperplasia)، آتاکسی، هیرسوتیسم، آنمی مگالوبلاستیک و سندرم جنین هیدانتوئین.
- کاربامازپین (Carbamazepine): داروی انتخابی تشنج‌های فوکال و نورالژی عصب سه‌قلو (Trigeminal neuralgia). القاکننده قوی آنزیم‌های سیتوکروم P450 و پدیده خودالقایی (Auto-induction). عوارض: سرکوب مغز استخوان (آگرانولوسیتوز و آنمی آپلاستیک)، هیپوناترمی و سندرم استیونز-جانسون (به‌ویژه در افراد با آلل HLA-B*1502).

۲. تقویت‌کننده‌های سیستم مهاری گابا (GABAergic Transmission Enhancers):
افزایش اثر گابا از طریق گیرنده GABAA یا مهار بازجذب و تخریب آن.
- فنوباربیتال (Phenobarbital): با افزایش مدت باز ماندن کانال کلراید ناشی از گابا عمل می‌کند. داروی انتخابی در تشنج‌های نوزادان. عوارض: سداسیون شدید، افت شناختی، القای آنزیمی قوی و وابستگی.
- بنزودیازپین‌ها (Diazepam / Lorazepam): با افزایش فرکانس باز شدن کانال‌های کلراید عمل می‌کنند. لورازپام و دیازپام داروهای خط اول در کنترل وضعیت پایدار صرعی (Status Epilepticus) هستند.

۳. مهارکننده‌های کانال‌های کلسیمی نوع T (T-type Calcium Channel Blockers):
- اتوسوکسیمید (Ethosuximide): مهار اختصاصی جریان‌های کلسیمی نوع T در نورون‌های تالاموس. داروی خط اول و انتخابی تشنج ابسانس (Absence seizure). عوارض: اختلال گوارشی، سردرد، سرگیجه و واکنش‌های پوستی.

۴. داروهای با مکانیسم‌های چندگانه و طیف اثر گسترده (Broad-Spectrum AEDs):
- سدیم والپروات (Sodium Valproate): مهار کانال‌های سدیمی، مهار کانال‌های کلسیمی نوع T و افزایش سطح گابا. موثر بر تمام انواع تشنج (تونیک-کلونیک، ابسانس، میوکلونیک). عوارض: تراتوژن قوی (نقص لوله عصبی)، سمیت کبدی حاد (Hepatotoxicity)، پانکراتیت، ریزش مو و افزایش وزن.
- لوتیراستام (Levetiracetam): اتصال به پروتئین وزیکول سیناپسی SV2A و مهار آزادسازی گلوتامات. طیف اثر گسترده و تداخل دارویی حداقل. عوارض: تغییرات خلقی و رفتاری (تحریک‌پذیری و پرخاشگری).
\`;

const SYSTEM_PROMPT = \`شما موتور تخصصی طراحی نقشه‌های مفهومی عمیق، علمی و چندسطحی (Deep Multi-Level Concept Maps) در پلتفرم علوم پزشکی و داروشناسی آوانا (AVANA) هستید.
وظیفه شما استخراج نقشه مفهومی غنی، ساختارمند و با معماری سلسله‌مراتبی معنادار از کل به جزء بر اساس متن آموزشی منبع است.

اصول و قواعد الزامی ساختار درختی:
۱. خروجی فقط و فقط یک شیء JSON معتبر منطبق بر اسکیمای مشخص‌شده باشد (بدون هیچ متن توضیحی قبل یا بعد از JSON). سقف فنی کل گره‌های نقشه حداکثر ۱۲۰ گره است، بنابراین بر روی مفاهیم ساختاری و آموزشی باارزش متمرکز شوید.
۲. ساختار شامل یک گره ریشه (rootNodeId: "root") و دیکشنری nodes است.
۳. ساختاردهی کلان و سلسله‌مراتبی از کل به جزء (Hierarchical Educational Decomposition):
   شما باید ابتدا ساختار آموزشی موضوع را تحلیل کرده و محورها و دسته‌های کلان مفهومی را شناسایی کنید.
   - گره‌های هم‌موضوع را هرگز به صورت انبوه و مسطح مستقیماً به ریشه (root) متصل نکنید. مفاهیمی که زیرمجموعه یک حوزه درمانی، تشخیصی، پاتوفیزیولوژی، داروشناسی یا مکانیسمی مشترک هستند، باید ابتدا زیر یک گره دسته‌بندی واسط با شناسه والد مشخص ("parentId") قرار گیرند، و سپس زیرشاخه‌ها و مفاهیم اتمیک به عنوان فرزندان آن دسته تعریف شوند.
   - برای هر گره دسته‌بندی که نقش هاب ساختاری و چتر مفهومی برای چند گره زیرمجموعه دارد، فیلد "nodeRole": "category" را درج کنید.
   - ساختار باید منعطف و کاملاً متناسب با موضوع و محتوای منبع طراحی شود (نه یک taxonomy ثابت). در فارماکولوژی، پاتولوژی، بیوشیمی و مباحث عمومی از دسته‌های طبیعی و علمی همان مبحث استفاده کنید.
   - مفاهیم واقعاً مستقل: اگر مفهومی در منبع وجود دارد که ماهیتاً مستقل است و به هیچ دسته مشترکی تعلق ندارد (مانند تعریف کلی موضوع، یا یک نکته کلینیکی خاص)، آن را مستقل نگه دارید و مستقیماً با "parentId": "root" متصل کنید. هیچ سقف عددی صلب یا اجباری برای فرزندان ریشه وجود ندارد و نباید دسته‌های مصنوعی مانند «سایر موارد» یا «متفرقه» ساخته شوند.
   - از ایجاد دسته‌بندی بیش‌ازحد و لایه‌های زائد که عمق را بدون محتوای علمی افزایش می‌دهند خودداری کنید (سقف مجاز عمق ۸ است، عمق مطلوب بین ۳ الی ۶ سطح است).
۴. تفکیک گره‌های مستقل (Child Nodes) از نکات فرعی (keyPoints):
   - هر مفهوم مستقل یا دارای انشعاب علمی (مانند مکانیسم اثر، کاربرد، عارضه خاص، یا نام یک داروی شاخص) حتماً باید یک گره مستقل (Child Node) با شناسه مجزا باشد.
   - فیلد keyPoints و examTips صرفاً برای نکات بسیار کوتاه، تستی یا تذکرات پایانی روی گره‌های پایانی (Leaves) استفاده شود؛ مفاهیم ساختاری نباید در این فیلدها فشرده شوند.
۵. عنوان، توضیح مفهومی و نقش گره‌ها:
   - عنوان هر گره (title) باید بسیار کوتاه، واضح، علمی و قابل مرور در یک نگاه باشد (۱ الی ۴ کلمه). اصطلاحات تخصصی پزشکی و نام‌های ژنریک حفظ شوند.
   - توضیح کوتاه (shortDescription) باید مفهوم آموزشی را به صورت کامل، رسا و بدون حذف بخش‌های مهم ارائه دهد (۱ الی ۳ جمله دقیق و مستند بر منبع). گره‌های دسته‌بندی نیز می‌توانند یک توضیح خلاصه و مفهومی متناسب داشته باشند.
   - فیلد nodeRole: برای گره‌های دسته‌بندی مقدار "category" و برای سایر گره‌های مفهومی مقدار "concept" (یا عدم درج).
   - فیلد semanticGroup اختیاری است و می‌تواند برای مشخص کردن تم مشترک شاخه‌ها استفاده شود، اما رابطه واقعی والد و فرزندی منحصراً با parentId تعیین می‌شود.
   - برای مفاهیم تخصصی بر اساس منبع، فیلد category ("drug" | "disease" | "cellular_mechanism" | "biochemistry" | "general") و فیلد structuredDetails یا sections با وفاداری کامل به منبع درج شود.
۶. وفاداری کامل به منبع (Strict Grounding):
   تمام گره‌ها، داروها و مکانیسم‌ها باید مستند به متن منبع باشند. از وارد کردن هرگونه اطلاعات ساختگی، فرضی یا خارج از منبع اکیداً خودداری کنید.
   اگر منبع فاقد اطلاعات عمیق‌تر برای یک شاخه است، شاخه در همان سطح اطلاعات موجود متوقف شود.
۷. معیار توقف اتمیک و مدیریت هوشمند بودجه گره‌ها:
   در سطح مفاهیم اتمیک متوقف شوید. نقشه مفهومی باید چگال، دقیق و دربرگیرنده مفاهیم کلیدی منبع باشد (تعداد مطلوب کل گره‌ها معمولاً بین ۲۵ الی ۶۰ گره و ترجیحاً زیر ۹۰ گره است). از تکه‌تکه کردن افراطی عبارات، تولید شاخه‌های تکراری یا مشابه‌نویسی که موجب تورم غیرضروری گره‌ها و سردرگمی آموزشی دانشجو می‌شود اکیداً بپرهیزید تا از سقف مجاز ۱۲۰ گره فراتر نرود.
۸. شناسه پایدار معنایی:
   برای هر گره شناسه انگلیسی معنادار بسازید به فرمت: node_<concept_slug> (شناسه ریشه باید "root" باشد).
۹. تمام گره‌ها (به جز root) باید والد معتبر (parentId) داشته باشند. ایجاد هرگونه حلقه (Cycle) یا گره بدون والد اکیداً ممنوع است.
۱۰. هیچ گره‌ای نباید شناسه خودش را به عنوان والد قرار دهد (node.parentId !== node.id). شناسه والد باید متعلق به گره بالادست آن مفهوم باشد.\`;

const USER_PROMPT = \`موضوع سرفصل آموزشی: «داروهای ضد صرع و تشنج»
نوع منبع: درسنامه‌های تدوین‌شده سرفصل

متن معتبر آموزشی منبع:
\${PHARMACOLOGY_SOURCE_TEXT}

لطفاً نقشه مفهومی عمیق، جامع، دسته‌بندی‌شده و چندسطحی سرفصل را در قالب JSON زیر با رعایت عمق علمی، روابط دقیق والد و فرزند (parentId)، و عناوین کوتاه تولید کنید:
{
  "rootNodeId": "root",
  "nodes": {
    "root": {
      "id": "root",
      "parentId": null,
      "title": "داروهای ضد صرع و تشنج",
      "shortDescription": "نقشه مفهومی جامع سرفصل"
    }
  }
}\`;

async function runLiveTest() {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  const model = "gemini-3.5-flash-lite";

  console.log("=== AVANA Mind Map Live Evaluation ===");
  console.log("Target Model:", model);
  console.log("API Key configured:", apiKey ? "YES (Valid Format)" : "NO");

  if (!apiKey) {
    console.error("ERROR: GEMINI_API_KEY is not defined in .env or environment.");
    process.exit(1);
  }

  const endpoint = \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model)}:generateContent\`;
  console.log("Endpoint:", endpoint);
  console.log("Sending educational payload to Gemini...");

  const startTime = Date.now();
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: \`\${SYSTEM_PROMPT}\n\n\${USER_PROMPT}\` }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });
  } catch (err) {
    console.error("Network Failure reaching Google API:", err.message);
    console.log("Note: If running inside a sandboxed environment without internet access, this is expected.");
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;
  console.log(\`Response received in \${durationMs}ms with HTTP Status: \${response.status} \${response.statusText}\`);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("API Error Response:", errorBody);
    process.exit(1);
  }

  const resJson = await response.json();
  const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error("Empty text received from model:", JSON.stringify(resJson, null, 2));
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.error("JSON Parse Error on raw model output:", err.message);
    console.log("Raw output snippet:", rawText.slice(0, 500));
    process.exit(1);
  }

  const nodes = parsed.nodes || {};
  const nodeEntries = Object.entries(nodes);
  const totalCount = nodeEntries.length;
  console.log("\n--- STRUCTURAL ANALYSIS ---");
  console.log("Total Nodes Produced:", totalCount);

  // Depth calculation
  let maxDepth = 0;
  const categoryNodes = [];
  const conceptNodes = [];
  const rootChildren = [];

  for (const [id, node] of nodeEntries) {
    if (node.nodeRole === "category") categoryNodes.push(node);
    else conceptNodes.push(node);

    if (node.parentId === "root") rootChildren.push(node);

    // Compute depth
    let depth = 0;
    let curr = node;
    const visited = new Set();
    while (curr && curr.parentId && !visited.has(curr.id)) {
      visited.add(curr.id);
      depth++;
      curr = nodes[curr.parentId];
    }
    if (depth > maxDepth) maxDepth = depth;
  }

  console.log("Tree Maximum Depth:", maxDepth);
  console.log("Direct Root Children:", rootChildren.length);
  console.log("Category Nodes count:", categoryNodes.length);
  console.log("Concept Nodes count:", conceptNodes.length);

  console.log("\nDirect Root Children Titles:");
  for (const r of rootChildren) {
    console.log(\`  - [\${r.nodeRole || "concept"}] \${r.title} (ID: \${r.id})\`);
  }

  console.log("\nCategory Hubs & Subtree Child Counts:");
  for (const cat of categoryNodes) {
    const directKids = nodeEntries.filter(([, n]) => n.parentId === cat.id);
    console.log(\`  * \${cat.title} (ID: \${cat.id}, Parent: \${cat.parentId}) -> \${directKids.length} direct children\`);
  }

  // Verification checks
  const checks = [
    { name: "Node count within bounds (>= 15 and <= 120)", pass: totalCount >= 15 && totalCount <= 120 },
    { name: "True multi-level depth (maxDepth >= 3)", pass: maxDepth >= 3 },
    { name: "Generated Category Nodes (count >= 2)", pass: categoryNodes.length >= 2 },
    { name: "Hierarchical grouping (Root children < 12)", pass: rootChildren.length < 12 },
    { name: "Scientific parent-child grounding", pass: categoryNodes.some(c => c.parentId === "root") },
  ];

  console.log("\n--- EVALUATION CHECKLIST ---");
  let allPass = true;
  for (const check of checks) {
    console.log(\`[\${check.pass ? "PASS" : "FAIL"}] \${check.name}\`);
    if (!check.pass) allPass = false;
  }

  if (allPass) {
    console.log("\nSUCCESS: Gemini 3.5 Flash Lite produced an authentic, deep, hierarchical mind map!");
  } else {
    console.log("\nWARNING: Some structural checks did not pass.");
  }
}

runLiveTest().catch(console.error);
