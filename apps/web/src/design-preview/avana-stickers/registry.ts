import { ConceptMeta, StickerMeta, StickerTopicId } from "./types.js";
import {
  GreetingHandA,
  LearningA,
  IdeaA,
  SuccessA,
  ProgressA,
  EmptyStateA,
} from "./concepts/concept-a/index.js";
import {
  GreetingHandB,
  LearningB,
  IdeaB,
  SuccessB,
  ProgressB,
  EmptyStateB,
} from "./concepts/concept-b/index.js";
import {
  GreetingHandC,
  LearningC,
  IdeaC,
  SuccessC,
  ProgressC,
  EmptyStateC,
} from "./concepts/concept-c/index.js";

export const STICKER_CONCEPTS: ConceptMeta[] = [
  {
    id: "concept-a",
    nameEn: "Concept A: Minimal Vector",
    nameFa: "کانسپت الف: وکتور مینیمال و آکادمیک",
    badgeFa: "دقت علمی و خلوص هندسی",
    philosophyFa:
      "تصویرسازی دوبعدی وکتور با خطوط محیطی تمیز و فرم‌های هندسی نرم. این سبک وقار دانشگاهی، وضوح بی‌نقص در اندازه کوچک (۱۶ تا ۳۲ پیکسل) و وزن صفر در رندرینگ را فراهم می‌کند.",
    styleTraitsFa: [
      "خطوط محیطی ۲ تا ۳ پیکسلی با انتهای نرم (Round)",
      "پالت اختصاصی Teal (#008080) و Light Blue (#A7D0E6)",
      "بدون سایه پرزرق‌وبرق، بدون تزیینات اضافی",
      "خوانایی ۱۰۰٪ در رزولوشن‌های پایین و دستگاه‌های مختلف",
    ],
    recommendedSizes: "۲۴px الی ۱۲۸px",
    strengthsFa: [
      "هماهنگی بی‌نقص با زبان طراحی مسطح و مدرن فعلی آوانا",
      "حجم فایل بسیار سبک و رندر بدون افت کیفیت",
      "حس رسمی و مورد اعتماد برای پزشکان و دانشجویان علوم پزشکی",
    ],
    considerationsFa: [
      "احساس صمیمیت و هیجان عاطفی آن ممکن است نسبت به سبک‌های حجمی کمتر باشد.",
    ],
  },
  {
    id: "concept-b",
    nameEn: "Concept B: Soft 3D",
    nameFa: "کانسپت ب: سه‌بعدی نرم و مات (Soft Clay)",
    badgeFa: "عمق لطیف و حس لوکس",
    philosophyFa:
      "فرم‌های حجمی ارگانیک و کنترل‌شده با سایه‌های بسیار ملایم چندلایه و بافت کائولینی/مات. هیچ بازتاب پلاستیکی براق یا تقلید از ایموجی‌های عمومی اپل در آن وجود ندارد.",
    styleTraitsFa: [
      "گرادیان‌های نوری چندنقطه‌ای و آمبینت ملایم",
      "سایه‌های نرم محو (Soft Gaussian Ambient Shadows)",
      "بافت مات و نیمه‌روشن سرامیکی/خاک‌رسی نرم",
      "رنگ‌آمیزی هماهنگ با تیره و روشنی رنگ فیروزه‌ای آوانا",
    ],
    recommendedSizes: "۳۲px الی ۱۹۲px",
    strengthsFa: [
      "جذابیت بصری بسیار بالا و ترند جهانی رابط کاربری مدرن",
      "ایجاد حس گرمی، نشاط و عمق خوشایند در داشبورد و کارت‌های درس",
      "متمایزکننده قدرتمند نسبت به وبسایت‌های متنی سنتی",
    ],
    considerationsFa: [
      "در اندازه‌های بسیار ریز (کمتر از ۲۰ پیکسل) جزئیات عمق ممکن است محو شود.",
    ],
  },
  {
    id: "concept-c",
    nameEn: "Concept C: Signature Character (Avani)",
    nameFa: "کانسپت ج: کاراکتر اختصاصی برند (آوانی)",
    badgeFa: "هویت انحصاری و ماندگار",
    philosophyFa:
      "خلق یک کاراکتر مستقل و باهوش با الهام از انحنای طاق حرف «A» در لوگوی آوانا و عینک کاوش علمی. آوانی در تمام شش سناریو زنده، همراه و مشوق کاربر در مسیر یادگیری است.",
    styleTraitsFa: [
      "اسکلت هندسی یکپارچه متناسب با طاق آوانا",
      "ویژگی شاخص: عینک پژوهشگر گرد و پین آنتن بینش",
      "بیان حالات انسانی بدون لودگی یا فضای مهدکودکی",
      "قابلیت توسعه به انیمیشن‌های تعاملی، سیستم پاداش و گیمیفیکیشن",
    ],
    recommendedSizes: "۲۸px الی ۲۵۶px",
    strengthsFa: [
      "بالاترین سطح تمایز و ساخت هویت بصری ماندگار در ذهن مخاطب",
      "ایجاد ارتباط حسی عمیق با دانشجو در طول ترم و ساعت‌های سخت مطالعه",
      "پایه‌ای برای ساخت استیکرهای آینده (امتحانات، خواب‌الودگی، خوشحالی قبولی)",
    ],
    considerationsFa: [
      "نیازمند رعایت دقیق خط قرمزهای آکادمیک است تا جدی بودن محیط آموزشی حفظ شود.",
    ],
  },
];

export interface TopicInfo {
  id: StickerTopicId;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  contextUsageFa: string;
}

export const STICKER_TOPICS: TopicInfo[] = [
  {
    id: "greeting-hand",
    titleFa: "دست خوشامدگویی",
    titleEn: "Greeting Hand",
    descriptionFa: "دستی برای خوشامدگویی صمیمی و شایسته در سربرگ داشبورد و صفحه ورود.",
    contextUsageFa: "جایگزین مستقیم ایموجی 👋 در تیتر «سلام {نام_کاربر}» داشبورد آوانا.",
  },
  {
    id: "learning",
    titleFa: "کتاب و مطالعه",
    titleEn: "Learning / Book",
    descriptionFa: "کتاب باز با نشانگر صفحه؛ نماد دسترسی به مخزن دروس، متون و جزوات علمی.",
    contextUsageFa: "کارت‌های شروع درس، دکمه ورود به مطالعه و تب دوره‌ها.",
  },
  {
    id: "idea",
    titleFa: "ایده و درک مطلب",
    titleEn: "Idea & Comprehension",
    descriptionFa: "لامپ بینش و فهم مطلب با ساختار سیناپسی؛ تجسم لحظه کشف و یادگیری عمیق.",
    contextUsageFa: "کارت‌های نکات کلیدی، دستیار هوش مصنوعی و خلاصه دروس پزشکی.",
  },
  {
    id: "success",
    titleFa: "موفقیت و تسلط",
    titleEn: "Success & Mastery",
    descriptionFa: "نشان پیروزی با تیک تأیید و روبان افتخار؛ نماد اتمام درس و پاسخ صحیح آزمون.",
    contextUsageFa: "پایان دوره فلش‌کارت، کسب نمره قبولی در کوییز و پاداش تسلط.",
  },
  {
    id: "progress",
    titleFa: "رشد و پیشرفت",
    titleEn: "Progress & Continuity",
    descriptionFa: "نمودار ستونی صعودی و پیکان هدایت؛ نماد حفظ زنجیره پیوستگی مطالعه.",
    contextUsageFa: "بخش آمار مطالعه هفتگی، ردیاب فعالیت و هدف‌گذاری روزانه.",
  },
  {
    id: "empty-state",
    titleFa: "وضعیت خالی کتابخانه",
    titleEn: "Empty State / Library",
    descriptionFa: "میز و قفسه آرام در انتظار آغاز؛ انتقال حس اشتیاق بدون ایجاد حس نقص یا خطا.",
    contextUsageFa: "زمانی که کاربر درسی ثبت نکرده یا کتابخانه خالی از محتواست.",
  },
];

export const ALL_STICKERS: StickerMeta[] = [
  // Concept A
  {
    id: "concept-a-greeting-hand",
    topicId: "greeting-hand",
    conceptId: "concept-a",
    titleFa: "دست خوشامدگویی مینیمال",
    titleEn: "Minimal Greeting Hand",
    descriptionFa: "خطوط فیروزه‌ای محیطی دقیق، کف دست گرم عاجی و آستین باوقار آوانا.",
    intendedUsageFa: "جایگزینی ظریف و شیک در تیتر داشبورد بدون تغییر تم مسطح فعلی.",
    Component: GreetingHandA,
  },
  {
    id: "concept-a-learning",
    topicId: "learning",
    conceptId: "concept-a",
    titleFa: "کتاب مطالعه مینیمال",
    titleEn: "Minimal Learning Book",
    descriptionFa: "اوراق کتاب باز با انحنای ملایم و روبان مطالعه فیروزه‌ای.",
    intendedUsageFa: "آیکون‌های درشت هدر دروس و نشان بخش جزوات.",
    Component: LearningA,
  },
  {
    id: "concept-a-idea",
    topicId: "idea",
    conceptId: "concept-a",
    titleFa: "ایده و درک مطلب مینیمال",
    titleEn: "Minimal Idea Bulb",
    descriptionFa: "لامپ هندسی مدرن با فیلامنت سیناپسی و پرتوهای نور منظم.",
    intendedUsageFa: "پیام‌های هوش مصنوعی و نکات کنکوری/پزشکی مهم.",
    Component: IdeaA,
  },
  {
    id: "concept-a-success",
    topicId: "success",
    conceptId: "concept-a",
    titleFa: "موفقیت مینیمال",
    titleEn: "Minimal Mastery Check",
    descriptionFa: "مدال افتخار کنگره‌دار با تیک برجسته و ستاره‌های پیشرفت.",
    intendedUsageFa: "مودال پایان درس و خلاصه آزمون.",
    Component: SuccessA,
  },
  {
    id: "concept-a-progress",
    topicId: "progress",
    conceptId: "concept-a",
    titleFa: "پیشرفت مینیمال",
    titleEn: "Minimal Progress Growth",
    descriptionFa: "پله‌های استوار یادگیری با پیکان جهش به سمت ستاره هدف.",
    intendedUsageFa: "کارت آمار ساعات هفتگی مطالعه.",
    Component: ProgressA,
  },
  {
    id: "concept-a-empty-state",
    topicId: "empty-state",
    conceptId: "concept-a",
    titleFa: "کتابخانه خالی مینیمال",
    titleEn: "Minimal Empty Library",
    descriptionFa: "میز مطالعه پاکیزه و کتاب‌های ایستاده با خطوط هندسی خلوت.",
    intendedUsageFa: "صفحه دوره‌های خالی یا جستجوی بدون نتیجه.",
    Component: EmptyStateA,
  },

  // Concept B
  {
    id: "concept-b-greeting-hand",
    topicId: "greeting-hand",
    conceptId: "concept-b",
    titleFa: "دست خوشامدگویی سه‌بعدی نرم",
    titleEn: "Soft 3D Greeting Hand",
    descriptionFa: "انگشتان استوانه‌ای نرم با بافت مات کائولین و مچ‌بند سه‌بعدی فیروزه‌ای.",
    intendedUsageFa: "ایجاد یک نقطه عطف بصری دلپذیر و مجلل در اولین نگاه کاربر به داشبورد.",
    Component: GreetingHandB,
  },
  {
    id: "concept-b-learning",
    topicId: "learning",
    conceptId: "concept-b",
    titleFa: "کتاب مطالعه سه‌بعدی نرم",
    titleEn: "Soft 3D Learning Book",
    descriptionFa: "کتاب قطور با صفحات مخملی عاجی و جلد چرمی فیروزه‌ای برجسته.",
    intendedUsageFa: "کارت دوره فعال و دکمه ادامه درس.",
    Component: LearningB,
  },
  {
    id: "concept-b-idea",
    topicId: "idea",
    conceptId: "concept-b",
    titleFa: "ایده سه‌بعدی نرم",
    titleEn: "Soft 3D Insight Bulb",
    descriptionFa: "حباب مات نیمه‌شفاف با هسته کهربایی ملایم و حلقه‌های پیچی متالیک.",
    intendedUsageFa: "کارت‌های راهنمای تحلیل عملکرد و پیشنهادهای هوش مصنوعی.",
    Component: IdeaB,
  },
  {
    id: "concept-b-success",
    topicId: "success",
    conceptId: "concept-b",
    titleFa: "مدال پیروزی سه‌بعدی نرم",
    titleEn: "Soft 3D Success Medal",
    descriptionFa: "پلاک مدال گرد با لبه‌های پخ‌خورده نرم و تیک نقش‌برجسته ابریشمی.",
    intendedUsageFa: "بخش جوایز، نشان‌ها و دستاوردهای تحصیلی.",
    Component: SuccessB,
  },
  {
    id: "concept-b-progress",
    topicId: "progress",
    conceptId: "concept-b",
    titleFa: "نمودار رشد سه‌بعدی نرم",
    titleEn: "Soft 3D Growth Metric",
    descriptionFa: "ستون‌های استوانه‌ای با سایه ملایم و گوی معلق شناور بر فراز پله‌ها.",
    intendedUsageFa: "کارت آمار هفتگی و هیت‌مپ فعالیت.",
    Component: ProgressB,
  },
  {
    id: "concept-b-empty-state",
    topicId: "empty-state",
    conceptId: "concept-b",
    titleFa: "قفسه منتظر سه‌بعدی نرم",
    titleEn: "Soft 3D Empty Shelf",
    descriptionFa: "پایگاه ابری/قفسه‌ای سرامیکی شناور با کتاب‌های مخملی آماده تورق.",
    intendedUsageFa: "وضعیت خالی کتابخانه با القای آرامش و فضای دعوت‌کننده.",
    Component: EmptyStateB,
  },

  // Concept C
  {
    id: "concept-c-greeting-hand",
    topicId: "greeting-hand",
    conceptId: "concept-c",
    titleFa: "آوانی — دست خوشامدگویی",
    titleEn: "Avani Greeting Character",
    descriptionFa: "کاراکتر آوانی با عینک گرد هوشمند، سر خمیده دوستانه و دست راست بلندشده.",
    intendedUsageFa: "جان‌بخشی به پیام خوشامدگویی داشبورد به عنوان همراه همیشگی آوانا.",
    Component: GreetingHandC,
  },
  {
    id: "concept-c-learning",
    topicId: "learning",
    conceptId: "concept-c",
    titleFa: "آوانی — غرق در مطالعه",
    titleEn: "Avani Studying with Tome",
    descriptionFa: "آوانی در حال نگه داشتن دو طرف کتاب قطور و تمرکز دقیق روی متون پزشکی.",
    intendedUsageFa: "کارت در حال مطالعه، شروع جلسه فلش‌کارت و دوره‌ها.",
    Component: LearningC,
  },
  {
    id: "concept-c-idea",
    topicId: "idea",
    conceptId: "concept-c",
    titleFa: "آوانی — لحظه اورکا و درک مطلب",
    titleEn: "Avani Eureka Spark",
    descriptionFa: "چشمان گشوده با برق هوش، دست اشاره‌کننده به نور بالای سر و تاج درخشان.",
    intendedUsageFa: "پاسخ دستیار هوش مصنوعی به سوال دشوار پزشکی یا خلاصه مفهوم.",
    Component: IdeaC,
  },
  {
    id: "concept-c-success",
    topicId: "success",
    conceptId: "concept-c",
    titleFa: "آوانی — جشن پایان درس و موفقیت",
    titleEn: "Avani Proud Achievement",
    descriptionFa: "آوانی با خنده شادمانه و چشم‌های کمانی، نشان افتخار آوانا را بالای سر گرفته.",
    intendedUsageFa: "صفحه کارنامه پایان آزمون و پیام‌های تبریک پیشرفت.",
    Component: SuccessC,
  },
  {
    id: "concept-c-progress",
    topicId: "progress",
    conceptId: "concept-c",
    titleFa: "آوانی — بالا رفتن از پله‌های دانش",
    titleEn: "Avani Climbing the Knowledge Ladder",
    descriptionFa: "آوانی پرچم آوانا را در دست دارد و با گام‌های مصمم به قله صعود می‌کند.",
    intendedUsageFa: "نشان دادن حفظ زنجیره یادگیری (Streak) و رتبه آموزشی.",
    Component: ProgressC,
  },
  {
    id: "concept-c-empty-state",
    topicId: "empty-state",
    conceptId: "concept-c",
    titleFa: "آوانی — منتظر روی میز مطالعه",
    titleEn: "Avani Patiently Awaiting",
    descriptionFa: "آوانی روی میز نشسته، دفترچه سفید و قلم در دست، با نگاه پرامید منتظر شماست.",
    intendedUsageFa: "صفحه دوره‌های خالی یا زمان شروع اولین دوره آموزشی.",
    Component: EmptyStateC,
  },
];

export const getSticker = (conceptId: string, topicId: string): StickerMeta | undefined => {
  return ALL_STICKERS.find((s) => s.conceptId === conceptId && s.topicId === topicId);
};
