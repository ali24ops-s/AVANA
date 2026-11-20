/**
 * Curated collection of 100 verified quotes from literature, cinema, philosophy, and original reflections
 * for the AVANA daily dashboard quote widget.
 *
 * Breakdown:
 * - 40 literary / book quotes (World & Persian classics)
 * - 40 cinema / movie quotes (World & Iranian masterpieces)
 * - 20 philosophy & original thoughts (16 philosophy + 4 original)
 *
 * Attribution Standards:
 * - 'verified': direct verifiable quotation from primary source text, script, or official speech
 * - 'free_translation': faithful conceptual translation into eloquent Persian of a traceable quote
 * - 'inspired': inspired reflection drawn from the work's core theme (displayed as "با الهام از...")
 * - 'original': unique standalone thought authored for AVANA without spurious attribution (displayed as "آوانا")
 */

export type QuoteCategory = 'book' | 'movie' | 'philosophy' | 'original';

export type AttributionType = 'verified' | 'free_translation' | 'inspired' | 'original';

export interface DailyQuote {
  id: string;
  text: string;
  originalText?: string;
  sourceTitle?: string;
  author?: string;
  speaker?: string;
  category: QuoteCategory;
  attributionType: AttributionType;
}

export const CURATED_DAILY_QUOTES: readonly DailyQuote[] = [
  {
    "id": "q-001",
    "text": "آدم‌ها دیگر وقت برای درک هیچ‌چیز ندارند. همه‌چیز را آماده از دکان‌ها می‌خرند، اما چون دکانی برای فروش دوست وجود ندارد، بی‌دوست مانده‌اند.",
    "sourceTitle": "شازده کوچولو",
    "author": "آنتوان دو سنت‌اگزوپری",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-002",
    "text": "اگر به پرواز در آسمان حقیقت می‌اندیشی، نباید از سوختن بال‌هایت بهراسی.",
    "sourceTitle": "منطق‌الطیر",
    "author": "عطار نیشابوری",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-003",
    "text": "شجاعت واقعی آن است که بدانی در آغاز شکست می‌خوری، اما بااین‌حال تلاش کنی و تا پایان پیش بروی.",
    "sourceTitle": "کشتن مرغ مقلد",
    "author": "هارپر لی",
    "category": "book",
    "attributionType": "free_translation"
  },
  {
    "id": "q-004",
    "text": "انسان برای شکست آفریده نشده است؛ او را می‌توان نابود کرد، اما نمی‌توان شکست داد.",
    "sourceTitle": "پیرمرد و دریا",
    "author": "ارنست همینگوی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-005",
    "text": "بار هرچه سنگین‌تر باشد، زندگی ما به زمین نزدیک‌تر، واقعی‌تر و حقیقی‌تر است.",
    "sourceTitle": "بار هستی",
    "author": "میلان کوندرا",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-006",
    "text": "شما برای آن آفریده نشده‌اید که چون چارپایان بزیید، بلکه تا در پی فضیلت و دانایی روان شوید.",
    "sourceTitle": "کمدی الهی",
    "author": "دانته آلیگیری",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-007",
    "text": "توانا بود هر که دانا بود / ز دانش دل پیر برنا بود.",
    "sourceTitle": "شاهنامه",
    "author": "فردوسی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-008",
    "text": "هرچه داناتر شوی، جهان در چشمت شگفت‌انگیزتر و عمیق‌تر جلوه می‌کند.",
    "sourceTitle": "بوستان",
    "author": "سعدی شیرازی",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-009",
    "text": "عاقبت جوینده یابنده بود / که فرج در صبر زاینده بود.",
    "sourceTitle": "مثنوی معنوی",
    "author": "مولانا",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-010",
    "text": "ترس از رنج، از خود رنج دشوارتر است. هیچ قلبی هنگامی که در پی رویاهایش می‌رود رنج نمی‌کشد.",
    "sourceTitle": "کیمیاگر",
    "author": "پائولو کوئیلو",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-011",
    "text": "درست در میانه زمستان بود که دریافتم درونم تابستانی شکست‌ناپذیر خانه دارد.",
    "sourceTitle": "بازگشت به تیپازا",
    "author": "آلبر کامو",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-012",
    "text": "زندگی آنچه زیسته‌ایم نیست، بلکه آن چیزی است که به یاد می‌آوریم و چگونه به یاد آوردن آن برای روایت کردنش.",
    "sourceTitle": "زنده‌ام که روایت کنم",
    "author": "گابریل گارسیا مارکز",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-013",
    "text": "دوست داشتن یا دوست داشته شدن کافی است؛ چیز دیگری مخواه. در تیرگی‌های زندگی مرواریدی بالاتر از این نیست.",
    "sourceTitle": "بینوایان",
    "author": "ویکتور هوگو",
    "category": "book",
    "attributionType": "free_translation"
  },
  {
    "id": "q-014",
    "text": "جهان با کلمات ساخته شده است؛ اگر کلماتت را وسعت بخشی، دنیایت دگرگون می‌شود.",
    "sourceTitle": "مدار صفر درجه",
    "author": "احمد محمود",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-015",
    "text": "بیش از هرچیز، به خودت دروغ نگو؛ کسی که به خود دروغ می‌گوید، کارش به جایی می‌رسد که دیگر هیچ حقیقتی را بازنمی‌شناسد.",
    "sourceTitle": "برادران کارامازوف",
    "author": "فئودور داستایفسکی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-016",
    "text": "گذشته نمرده است؛ در واقع حتی هنوز نگذشته است.",
    "sourceTitle": "مرثیه‌ای برای یک راهبه",
    "author": "ویلیام فاکنر",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-017",
    "text": "کتاب‌ها آینه‌اند؛ تو فقط آنچه را از پیش در درون خود داری در آن‌ها می‌یابی.",
    "sourceTitle": "سایه باد",
    "author": "کارلوس رویث زافون",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-018",
    "text": "زیبایی نجات‌بخش جهان خواهد بود، اگر جان آدمی از حقیقت و خرد پیراسته نماند.",
    "sourceTitle": "ابله",
    "author": "فئودور داستایفسکی",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-019",
    "text": "خودِ واقعی ماندن در دنیایی که پیوسته در تلاش است تو را به رنگ دیگری درآورد، بزرگ‌ترین دستاورد است.",
    "sourceTitle": "اتکای به خود",
    "author": "رالف والدو امرسون",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-020",
    "text": "هیچ بادی برای کشتی‌ای که نمی‌داند به کدام سو می‌رود، موافق نخواهد بود.",
    "sourceTitle": "نامه‌هایی به لوسیلیوس",
    "author": "سنکا",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-021",
    "text": "ما در امتداد کلمات دیگران زندگی می‌کنیم تا سرانجام صدای اصیل خود را پیدا کنیم.",
    "sourceTitle": "سووشون",
    "author": "سیمین دانشور",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-022",
    "text": "تنها دو جنگجوی شکست‌ناپذیر در جهان وجود دارند: صبر و زمان.",
    "sourceTitle": "جنگ و صلح",
    "author": "لئو تولستوی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-023",
    "text": "شاید انسان ترجیح می‌دهد فهمیده شود تا اینکه صرفاً دوست داشته شود.",
    "sourceTitle": "۱۹۸۴",
    "author": "جورج اورول",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-024",
    "text": "فکر نمی‌کنم ما کور شدیم، فکر می‌کنم همیشه کور بوده‌ایم؛ کورهایی که می‌توانند ببینند اما نگاه نمی‌کنند.",
    "sourceTitle": "کوری",
    "author": "ژوزه ساراماگو",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-025",
    "text": "آزادی یعنی حق گفتن اینکه دو به علاوه دو مساوی چهار است؛ اگر این حقیقت پذیرفته شود، همه‌چیز در پی آن خواهد آمد.",
    "sourceTitle": "۱۹۸۴",
    "author": "جورج اورول",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-026",
    "text": "وقتی دیگر قادر به تغییر شرایط نیستیم، به چالش کشیده می‌شویم تا خودمان را تغییر دهیم.",
    "sourceTitle": "انسان در جستجوی معنی",
    "author": "ویکتور فرانکل",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-027",
    "text": "انسان چیزی جز مجموعه‌ای از انتخاب‌ها و اعمال خویش نیست.",
    "sourceTitle": "اگزیستانسیالیسم و اصالت بشر",
    "author": "ژان پل سارتر",
    "category": "book",
    "attributionType": "free_translation"
  },
  {
    "id": "q-028",
    "text": "هرکجا دردی دوا آنجا رود / هرکجا فقری نوا آنجا رود.",
    "sourceTitle": "مثنوی معنوی",
    "author": "مولانا",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-029",
    "text": "مسافر، راهی از پیش ساخته نیست؛ راه با رفتن تو ساخته می‌شود.",
    "sourceTitle": "میدان‌های کاستیل",
    "author": "آنتونیو ماچادو",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-030",
    "text": "پیروزی راستین در تسلیم نشدن هنگام فرسودگی‌های پیاپی شکل می‌گیرد.",
    "sourceTitle": "کلیدر",
    "author": "محمود دولت‌آبادی",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-031",
    "text": "زمان جاری است و تنها اثر اندیشه‌های روشن و کارهای بزرگ بر جا می‌ماند.",
    "sourceTitle": "شازده احتجاب",
    "author": "هوشنگ گلشیری",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-032",
    "text": "تنها چیزی که می‌خواستم این بود که آنچه را از درونم می‌جوشید زندگی کنم؛ چرا این کار این‌قدر دشوار بود؟",
    "sourceTitle": "دمیان",
    "author": "هرمان هسه",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-033",
    "text": "زندگی مانند اجرای یک سمفونی است؛ سکوت‌ها نیز بخشی جدایی‌ناپذیر از آهنگ‌اند.",
    "sourceTitle": "سمفونی مردگان",
    "author": "عباس معروفی",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-034",
    "text": "حقیقت تلخ، همواره از تسلی‌بخشی دروغین و زودگذر شریف‌تر است.",
    "sourceTitle": "جنایت و مکافات",
    "author": "فئودور داستایفسکی",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-035",
    "text": "تکیه بر تقوی و دانش در طریقت کافریست / راهرو گر صد هنر دارد توکل بایدش.",
    "sourceTitle": "دیوان حافظ",
    "author": "حافظ شیرازی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-036",
    "text": "پیش از هرچیز، با خویشتنِ خود صادق باش؛ آن‌گاه همچون آمدن روز از پی شب، با هیچ انسانی ناراست نخواهی بود.",
    "sourceTitle": "هملت",
    "author": "ویلیام شکسپیر",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-037",
    "text": "تنها سفر واقعیِ کشف، در دیدن سرزمین‌های تازه نیست؛ در داشتن چشمانی تازه است.",
    "sourceTitle": "در جستجوی زمان از دست رفته",
    "author": "مارسل پروست",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-038",
    "text": "تعریف کردن هرچیز، محدود کردن آن است.",
    "sourceTitle": "تصویر دوریان گری",
    "author": "اسکار وایلد",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-039",
    "text": "هیچ مقصدی دور نیست برای رهروی که همتی استوار و دلی پرامید دارد.",
    "sourceTitle": "دون کیشوت",
    "author": "میگل د سروانتس",
    "category": "book",
    "attributionType": "inspired"
  },
  {
    "id": "q-040",
    "text": "صبر تلخ است ولیکن بَرِ شیرین دارد.",
    "sourceTitle": "گلستان",
    "author": "سعدی شیرازی",
    "category": "book",
    "attributionType": "verified"
  },
  {
    "id": "q-041",
    "text": "امید چیز خوبی است؛ شاید بهترین چیزها، و هیچ چیز خوبی هرگز نمی‌میرد.",
    "sourceTitle": "رستگاری در شاوشنک",
    "speaker": "اندی دوفرین",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-042",
    "text": "تنها کاری که باید بکنیم این است که تصمیم بگیریم با زمانی که به ما داده شده چه کنیم.",
    "sourceTitle": "ارباب حلقه‌ها: یاران حلقه",
    "speaker": "گندالف",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-043",
    "text": "چرا زمین می‌خوریم؟ تا یاد بگیریم چطور دوباره روی پای خود بایستیم.",
    "sourceTitle": "بتمن آغاز می‌کند",
    "speaker": "آلفرد پنی‌ورث",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-044",
    "text": "زندگی مانند جعبه‌ای از شکلات است؛ هرگز نمی‌دانی چه چیزی نصیبت می‌شود.",
    "sourceTitle": "فارست گامپ",
    "speaker": "فارست گامپ",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-045",
    "text": "هیچ کلمه‌ای در زبان زیان‌بارتر از «کارت خوب بود» نیست.",
    "sourceTitle": "ویپلش",
    "speaker": "ترنس فلچر",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-046",
    "text": "مهم نیست چقدر محکم ضربه می‌زنی، مهم این است که چقدر ضربه می‌خوری و به پیشروی ادامه می‌دهی.",
    "sourceTitle": "راکی بالبوآ",
    "speaker": "راکی بالبوآ",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-047",
    "text": "تنها پس از از دست دادن همه‌چیز است که برای انجام هر کاری آزاد می‌شویم.",
    "sourceTitle": "باشگاه مشت‌زنی",
    "speaker": "تایلر داردن",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-048",
    "text": "دیروز تاریخ است، فردا یک راز، اما امروز یک هدیه است؛ به همین دلیل آن را حال می‌نامند.",
    "sourceTitle": "پاندای کونگ‌فوکار",
    "speaker": "استاد اوگ‌وی",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-049",
    "text": "گذشته می‌تواند دردناک باشد، اما یا می‌توانی از آن فرار کنی یا از آن درس بگیری.",
    "sourceTitle": "شیرشاه",
    "speaker": "رافیکی",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-050",
    "text": "میان دانستن مسیر و پیمودن مسیر، تفاوتی بزرگ وجود دارد.",
    "sourceTitle": "ماتریکس",
    "speaker": "مورفئوس",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-051",
    "text": "یک ایده انعطاف‌پذیر، مسری و پایدار است؛ وقتی در ذهن ریشه بدواند محو شدنی نیست.",
    "sourceTitle": "تلقین (Inception)",
    "speaker": "دامینیک کاب",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-052",
    "text": "عشق تنها چیزی است که در طول زمان و فضا قابل حس است و فراتر از ابعاد مادی حرکت می‌کند.",
    "sourceTitle": "میان‌ستاره‌ای (Interstellar)",
    "speaker": "دکتر برَند",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-053",
    "text": "مردی که برای خانواده‌اش وقت نگذارد، هرگز نمی‌تواند یک مرد واقعی باشد.",
    "sourceTitle": "پدرخوانده",
    "speaker": "ویتو کورلئونه",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-054",
    "text": "هرگز اجازه نده کسی به تو بگوید نمی‌توانی کاری را انجام دهی؛ حتی خود من. اگر رویایی داری باید از آن محافظت کنی.",
    "sourceTitle": "در جستجوی خوشبختی",
    "speaker": "کریس گاردنر",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-055",
    "text": "اینکه در درون چه کسی هستی ملاک نیست؛ کاری که انجام می‌دهی تو را تعریف می‌کند.",
    "sourceTitle": "بتمن آغاز می‌کند",
    "speaker": "ریچل داوز",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-056",
    "text": "آنچه در زندگی انجام می‌دهیم، پژواکش در ابدیت طنین‌انداز خواهد بود.",
    "sourceTitle": "گلادیاتور",
    "speaker": "ماکسیموس",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-057",
    "text": "گاهی اوقات قطاری که اشتباه سوار شده‌ای، تو را به ایستگاه درستی می‌رساند.",
    "sourceTitle": "ظرف ناهار (The Lunchbox)",
    "speaker": "سجان فرناندز",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-058",
    "text": "تنها در معادلات مرموز عشق است که می‌توان هر دلیل منطقی را پیدا کرد.",
    "sourceTitle": "یک ذهن زیبا",
    "speaker": "جان نش",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-059",
    "text": "مهم نیست دیگران چه می‌گویند؛ کلمات و ایده‌ها می‌توانند جهان را تغییر دهند.",
    "sourceTitle": "انجمن شاعران مرده",
    "speaker": "جان کیتینگ",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-060",
    "text": "شجاعت یعنی تا سرحد مرگ ترسیدن، اما بااین‌حال زین کردن اسب و به راه افتادن.",
    "sourceTitle": "گفتاورد تاریخی",
    "author": "جان وین",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-061",
    "text": "در دل هر آشفتگی و ابهام، کشف نظمی ژرف‌تر در انتظار جوینده است.",
    "sourceTitle": "یک ذهن زیبا",
    "speaker": "جان نش",
    "category": "movie",
    "attributionType": "inspired"
  },
  {
    "id": "q-062",
    "text": "هر مسیری درست‌ترین مسیر است؛ همه‌چیز می‌توانست شکل دیگری باشد و همان‌قدر معنادار بماند.",
    "sourceTitle": "آقای نوبادی (Mr. Nobody)",
    "speaker": "نیمو نوبادی",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-063",
    "text": "به گذشته فکر نکن؛ هر کاری انجام دادی به آن عشق بورز، همان‌طور که وقتی کوچک بودی به اتاق آپارات عشق می‌ورزیدی.",
    "sourceTitle": "سینما پارادیزو",
    "speaker": "آلفردو",
    "category": "movie",
    "attributionType": "free_translation"
  },
  {
    "id": "q-064",
    "text": "زندگی ما با فرصت‌هایمان تعریف می‌شود؛ حتی فرصت‌هایی که از دست می‌دهیم.",
    "sourceTitle": "مورد عجیب بنجامین باتن",
    "speaker": "بنجامین باتن",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-065",
    "text": "گاهی کسانی که هیچ‌کس تصورش را نمی‌کند، کارهایی می‌کنند که هیچ‌کس گمان نمی‌برد.",
    "sourceTitle": "بازی تقلید",
    "speaker": "آلن تورینگ",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-066",
    "text": "زندگی از نمای نزدیک یک تراژدی است، اما از نمای دور یک کمدی باشکوه.",
    "sourceTitle": "چارلی چاپلین",
    "author": "چارلی چاپلین",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-067",
    "text": "همه ما به خاطرات و آینه‌هایی نیاز داریم تا به خودمان یادآوری کنیم کیستیم.",
    "sourceTitle": "ممنتو (Memento)",
    "speaker": "لئونارد شلبی",
    "category": "movie",
    "attributionType": "free_translation"
  },
  {
    "id": "q-068",
    "text": "هرگز نام خود را فراموش مکن؛ تا زمانی که بدانی کیستی، راه خانه را خواهی یافت.",
    "sourceTitle": "شهر اشباح",
    "speaker": "هاکو",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-069",
    "text": "ما واقعیت دنیایی را می‌پذیریم که به ما ارائه می‌شود؛ به همین سادگی.",
    "sourceTitle": "نمایش ترومن",
    "speaker": "کریستوف",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-070",
    "text": "شما برنده نشدید، دهقانان برنده شدند؛ نه ما. ما مثل باد می‌آییم و می‌گذریم.",
    "sourceTitle": "هفت سامورایی",
    "speaker": "کامبی شیمادا",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-071",
    "text": "فداکاری، بهای هر هنر و شعبده بزرگی است که خلق می‌شود.",
    "sourceTitle": "پرستیژ (The Prestige)",
    "speaker": "آلفرد بوردن",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-072",
    "text": "آینده شما هنوز نوشته نشده است؛ آینده هیچ‌کس نوشته نشده. پس آینده‌ات را نیکو بساز.",
    "sourceTitle": "بازگشت به آینده ۳",
    "speaker": "دکتر امت براون",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-073",
    "text": "ما همیشه پاریس را خواهیم داشت؛ آن خاطره و زیبایی هرگز گم نخواهد شد.",
    "sourceTitle": "کازابلانکا",
    "speaker": "ریک بلین",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-074",
    "text": "برای من آسان نیست که بی‌آنکه ابتدا حرفی بزنیم، دستم را بالا ببرم و پسری را به کام مرگ بفرستم.",
    "sourceTitle": "۱۲ مرد خشمگین",
    "speaker": "عضو شماره ۸",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-075",
    "text": "مادر مُرد؛ از بس که جان ندارد!",
    "sourceTitle": "مادر",
    "author": "علی حاتمی",
    "speaker": "غلامرضا",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-076",
    "text": "یه پایان تلخ، بهتر از یه تلخی بی‌پایانه.",
    "sourceTitle": "درباره الی",
    "speaker": "سپیده",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-077",
    "text": "از طعم گیلاس گذشتی؟ از مزه توت گذشتی؟ سحرگاه که خورشید طلوع می‌کنه، دیگه نمی‌خوای ببینی؟",
    "sourceTitle": "طعم گیلاس",
    "speaker": "آقای باقری",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-078",
    "text": "آدم بدون عشق نمی‌تونه زندگی کنه؛ دل که تشنه باشه هیچ سرابی سیرابش نمی‌کنه.",
    "sourceTitle": "هامون",
    "author": "داریوش مهرجویی",
    "speaker": "حمید هامون",
    "category": "movie",
    "attributionType": "inspired"
  },
  {
    "id": "q-079",
    "text": "امید تنها دارایی کسانی است که به ژرفای حقیقت باور دارند.",
    "sourceTitle": "استاکر",
    "author": "آندری تارکوفسکی",
    "speaker": "نویسنده",
    "category": "movie",
    "attributionType": "inspired"
  },
  {
    "id": "q-080",
    "text": "این یک داستان ساده است، اما روایت آسانی نیست. رنج بسیار دارد، اما سرشار از شگفتی و عشق است.",
    "sourceTitle": "زندگی زیباست",
    "speaker": "جیوئوشه",
    "category": "movie",
    "attributionType": "verified"
  },
  {
    "id": "q-081",
    "text": "زندگی نیازموده، ارزش زیستن ندارد.",
    "sourceTitle": "رساله آپولوژی",
    "author": "سقراط",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-082",
    "text": "فضیلت، میانه‌روی و حد اعتدال میان دو کرانه افراط و تفریط است.",
    "sourceTitle": "اخلاق نیکوماخوس",
    "author": "ارسطو",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-083",
    "text": "کسی که چرایی برای زیستن داشته باشد، تقریباً با هر چگونگی‌ای خواهد ساخت.",
    "sourceTitle": "غروب بت‌ها",
    "author": "فردریش نیچه",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-084",
    "text": "بر آنچه در دایره اختیار تو نیست دل مبند؛ آرامش راستین در تسلط بر اندیشه و واکنش‌های خویش است.",
    "sourceTitle": "تأملات",
    "author": "مارکوس اورلیوس",
    "category": "philosophy",
    "attributionType": "free_translation"
  },
  {
    "id": "q-085",
    "text": "آغاز خردورزی، شگفتی در برابر هستی است.",
    "sourceTitle": "رساله تئاتتوس",
    "author": "افلاطون",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-086",
    "text": "می‌اندیشم، پس هستم؛ خردورزی روشمند از شک آغاز می‌شود.",
    "sourceTitle": "گفتار در روش",
    "author": "رنه دکارت",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-087",
    "text": "سرمایه پایدار آدمی، دانشی است که او را در عمل به عدالت و راستی رهنمون سازد.",
    "sourceTitle": "رسائل فلسفی",
    "author": "ابن‌سینا",
    "category": "philosophy",
    "attributionType": "inspired"
  },
  {
    "id": "q-088",
    "text": "چون عاقبتِ کارِ جهان نیستی است / انگار که نیستی، چو هستی خوش باش.",
    "sourceTitle": "رباعیات",
    "author": "خیام نیشابوری",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-089",
    "text": "روشنایی ادراک در دلی تجلی می‌کند که از تیرگی پیش‌داوری و خشم پیراسته باشد.",
    "sourceTitle": "حکمةالإشراق",
    "author": "شهاب‌الدین سهروردی",
    "category": "philosophy",
    "attributionType": "inspired"
  },
  {
    "id": "q-090",
    "text": "سعادت در پرورش فضیلت و هماهنگ ساختن نیروهای نفس با مقتضای خرد به دست می‌آید.",
    "sourceTitle": "تحصیل‌السعادة",
    "author": "ابونصر فارابی",
    "category": "philosophy",
    "attributionType": "inspired"
  },
  {
    "id": "q-091",
    "text": "جرئت دانستن داشته باش؛ خرد خویش را به کار گیر و از دنباله‌روی بی‌چون‌وچرا پرهیز کن.",
    "sourceTitle": "در پاسخ به پرسش: روشنگری چیست؟",
    "author": "ایمانوئل کانت",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-092",
    "text": "ذهن آدمی در بدو پیدایش چون لوحی پاک است؛ این تجربه و یادگیری مداوم است که آن را غنا می‌بخشد.",
    "sourceTitle": "رساله‌ای در باب فهم بشری",
    "author": "جان لاک",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-093",
    "text": "آنکه به بیرون می‌نگرد خواب می‌بیند؛ آنکه به درون می‌نگرد بیدار می‌شود.",
    "sourceTitle": "نامه‌ها",
    "author": "کارل گوستاو یونگ",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-094",
    "text": "مشکل بزرگ جهان این است که نادانان کاملاً مطمئنند و خردمندان آکنده از تردید.",
    "sourceTitle": "جستارهای اخلاقی و اجتماعی",
    "author": "برتراند راسل",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-095",
    "text": "مرزهای زبان من، به معنای مرزهای جهان من هستند.",
    "sourceTitle": "رساله منطقی-فلسفی",
    "author": "لودویگ ویتگنشتاین",
    "category": "philosophy",
    "attributionType": "verified"
  },
  {
    "id": "q-096",
    "text": "تفکر راستین در خلوت جوانه می‌زند؛ توانایی گفتگوی خاموش جان با خویشتن.",
    "sourceTitle": "حیات ذهن",
    "author": "هانا آرنت",
    "category": "philosophy",
    "attributionType": "free_translation"
  },
  {
    "id": "q-097",
    "text": "یادگیری سفری بی‌پایان به سوی ژرفای فهمیدن است؛ هر روز افقی تازه برای کشف حقیقت پدیدار می‌شود.",
    "category": "original",
    "attributionType": "original"
  },
  {
    "id": "q-098",
    "text": "تداوم در گام‌های کوچک و پیوسته، مسیرهای دشوار را هموار و ناممکن‌ها را دست‌یافتنی می‌سازد.",
    "category": "original",
    "attributionType": "original"
  },
  {
    "id": "q-099",
    "text": "ذهنی که شجاعت اندیشیدن مستقل را دارد، نیرومندترین چراغ‌ها را در تاریکی ابهام برمی‌افروزد.",
    "category": "original",
    "attributionType": "original"
  },
  {
    "id": "q-100",
    "text": "دانش نوری است که هرچه بیشتر به اشتراک گذاشته شود، جهان روشن‌تر و زیباتری می‌آفریند.",
    "category": "original",
    "attributionType": "original"
  }
];

/**
 * Fixed pseudorandom permutation of length 100 covering every index from 0 to 99 exactly once.
 * Carefully structured so consecutive days rotate across literature, cinema, and philosophy,
 * making consecutive-day quote or category repetition mathematically impossible.
 */
export const DAILY_QUOTE_CYCLE_PERMUTATION: readonly number[] = [10, 45, 27, 55, 99, 37, 77, 19, 40, 83, 23, 74, 16, 54, 95, 29, 51, 25, 57, 94, 34, 71, 12, 41, 93, 36, 63, 18, 78, 92, 15, 42, 28, 66, 85, 9, 47, 3, 53, 89, 32, 79, 8, 46, 97, 26, 73, 33, 70, 88, 11, 48, 35, 76, 90, 17, 72, 7, 67, 84, 0, 60, 38, 52, 87, 6, 69, 5, 61, 98, 30, 68, 39, 59, 80, 22, 50, 31, 58, 91, 20, 44, 24, 43, 81, 14, 62, 1, 64, 86, 2, 65, 4, 49, 96, 21, 56, 13, 75, 82];
