/**
 * 5-Step Product Walkthrough ("چطور با آوانا یاد بگیریم؟")
 *
 * Alternating left/right layout matching Stitch design.
 * Each step has a numbered badge, title, description, and screenshot.
 */

import { motion } from "framer-motion";

interface Step {
  id: number;
  title: string;
  description: string;
  highlights: string[];
  imageAlt: string;
  imageSrc: string;
  color: string;
  shadowColor: string;
  reverse?: boolean; // Reverse layout (image on left)
  animationClass: string;
}

const steps: Step[] = [
  {
    id: 1,
    title: "انتخاب دوره، سرفصل و بارگذاری منابع",
    description:
      "شما می‌توانید جزوات درسی و فایل‌های PDF خود را بارگذاری کنید یا کورس‌های تخصصی علوم پزشکی را انتخاب نمایید. آوانا به صورت هوشمند ساختار آموزشی فصول، درس‌ها و منابع شما را سازمان‌دهی کرده و داشبوردی کامل از روند پیشرفت در اختیارتان قرار می‌دهد.",
    highlights: [
      "بارگذاری مستقیم فایل‌های PDF و استخراج هوشمند فصل‌ها",
      "دسته‌بندی منظم کورس‌ها بر اساس موضوعات علوم پایه و بالینی",
      "نمایش دقیق آمار و پیشرفت درسی در داشبورد اختصاصی",
    ],
    imageAlt: "داشبورد انتخاب درس",
    imageSrc: "",
    color: "var(--lp-primary-container, #0f766e)",
    shadowColor: "rgba(15,118,110,0.4)",
    animationClass: "animate-lp-float",
  },
  {
    id: 2,
    title: "مطالعه ساختاریافته و منسجم محتوا",
    description:
      "وارد محیط اختصاصی مطالعه شوید؛ متن درس‌ها همراه با خلاصه‌های کاربردی، نکات کلیدی کنکوری و هایلایت‌های مهم در قالبی عاری از حواس‌پرتی ارائه می‌شوند. سیستم هوشمند آوانا امکان ثبت تیک مطالعه و انتقال گام‌به‌گام بین مباحث را فراهم می‌کند.",
    highlights: [
      "باکس‌های هوشمند نکات کنکوری و خلاصه‌های جامع",
      "رابط کاربری تیره (Dark Mode) و بدون حواس‌پرتی برای تمرکز بالا",
      "ثبت تیک تکمیل درس و ناوبری آسان بین سرفصل‌ها",
    ],
    imageAlt: "محیط مطالعه درس",
    imageSrc: "",
    color: "var(--lp-secondary, #6b38d4)",
    shadowColor: "rgba(107,56,212,0.4)",
    reverse: true,
    animationClass: "animate-lp-float-slow",
  },
  {
    id: 3,
    title: "تثبیت عمیق و مرور با فلش‌کارت SRS",
    description:
      "پس از مطالعه هر مبحث، فلش‌کارت‌های استاندارد مرتبط فعال می‌شوند. الگوریتم هوشمند مرور فاصله‌دار (Spaced Repetition) با برچسب‌گذاری میزان سختی هر کارت، زمان دقیق یادآوری و مرور بعدی را پیش‌بینی می‌کند تا مطالب به حافظه بلندمدت منتقل شوند.",
    highlights: [
      "الگوریتم علمی مرور فاصله‌دار (SRS) جهت جلوگیری از فراموشی",
      "دکمه‌های ۴ گانه تعیین میزان درجه سختی هر کارت (مجدداً، سخت، خوب، آسان)",
      "ثبت وضعیت یادگیری و زمان‌بندی دقیق دور بعدی مرور",
    ],
    imageAlt: "مرور فلش‌کارت",
    imageSrc: "",
    color: "var(--lp-tertiary-container, #007952)",
    shadowColor: "rgba(0,121,82,0.4)",
    animationClass: "animate-lp-float",
  },
  {
    id: 4,
    title: "سنجش هوشمند با آزمون‌های شبیه‌سازی‌شده",
    description:
      "با تنظیم تعداد سوالات، انتخاب مباحث دلخواه و فعال‌سازی حالت شب امتحان، میزان تسلط خود را بسنجید. آوانا کارنامه تحلیلی دقیق، نمره ارزیابی و گزارش جامعی از نقاط ضعف و قوت شما ارائه می‌دهد تا با آمادگی کامل وارد امتحانات اصلی شوید.",
    highlights: [
      "تنظیم سفارشی تعداد سوالات، مباحث و حالت شب امتحان",
      "شبیه‌سازی دقیق شرایط امتحانات سراسری و آزمون‌های دانشگاهی",
      "گزارش تحلیلی نقاط ضعف و سنجش میزان آمادگی",
    ],
    imageAlt: "تنظیمات آزمون",
    imageSrc: "",
    color: "var(--lp-primary, #005c55)",
    shadowColor: "rgba(0,92,85,0.4)",
    reverse: true,
    animationClass: "animate-lp-float-slow",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-24"
      style={{ backgroundColor: "var(--lp-surface-bright, #f8f9ff)" }}
    >
      <div className="max-w-[1280px] mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span
            className="font-semibold tracking-wider text-sm uppercase mb-2 block"
            style={{ color: "var(--lp-primary, #005c55)" }}
          >
            فرایند یادگیری
          </span>
          <h2
            className="font-headline text-3xl md:text-4xl font-bold"
            style={{ color: "var(--lp-on-surface, #0b1c30)" }}
          >
            آوانا را در ۴ مرحله یاد بگیر
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="space-y-32">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" as const }}
              className={`flex flex-col lg:flex-row items-center gap-12 ${
                step.reverse ? "lg:flex-row-reverse" : ""
              }`}
            >
              {/* Text Area */}
              <div className="lg:w-1/2 text-right">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl mb-6 text-white"
                  style={{
                    backgroundColor: step.color,
                    boxShadow: `0 0 15px ${step.shadowColor}`,
                  }}
                >
                  {step.id}
                </div>
                <h3
                  className="font-headline text-2xl md:text-3xl font-bold mb-4 transition-colors"
                  style={{ color: "var(--lp-on-surface, #0b1c30)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = step.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--lp-on-surface, #0b1c30)";
                  }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-base md:text-lg mb-5 leading-relaxed"
                  style={{ color: "var(--lp-on-surface-variant, #3e4947)" }}
                >
                  {step.description}
                </p>

                {/* Highlights List */}
                <ul className="space-y-2 mb-6">
                  {step.highlights.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-sm font-medium text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-[#008080]/20 border border-[#008080]/40 text-teal-400 flex items-center justify-center text-xs shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Image Area */}
              <div className={`lg:w-1/2 w-full ${step.animationClass}`}>
                <div
                  className="rounded-2xl overflow-hidden soft-shadow relative group hover:shadow-2xl transition-shadow duration-500 aspect-[4/3] bg-[#0b1120]"
                  style={{ border: "1px solid rgba(189, 201, 198, 0.2)" }}
                >
                  {/* Inline HTML Mockups based on Step ID */}
                  <div className="absolute inset-0 flex flex-col pointer-events-none select-none text-right dir-rtl">
                    {step.id === 1 && (
                      <div className="flex-1 p-5 flex flex-col gap-3 text-slate-100 bg-[#0b1120] text-right dir-rtl">
                        {/* Page Header matching CourseListPage */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                          <div>
                            <h4 className="text-xs font-black text-white">دوره‌های آموزشی</h4>
                            <p className="text-[9px] text-slate-400 mt-0.5">سازمان یادگیری آوانا</p>
                          </div>
                          <span className="text-[9px] font-bold text-teal-300 bg-teal-900/30 px-2.5 py-1 rounded-full border border-teal-500/30">
                            ۳ دوره در دسترس
                          </span>
                        </div>

                        {/* Course Cards Grid matching CourseCard in CourseListPage */}
                        <div className="grid grid-cols-2 gap-3 flex-1">
                          {[
                            { title: "آناتومی سیستم قلبی عروقی", subject: "علوم پایه پزشکی", date: "تاریخ آزمون: ۲۰ دی" },
                            { title: "فیزیولوژی سلولی و مولکولی", subject: "فیزیولوژی عمومی", date: "آماده یادگیری" },
                            { title: "فارماکولوژی دارویی", subject: "داروشناسی تخصصی", date: "تاریخ آزمون: ۱۵ بهمن" },
                            { title: "بیوشیمی بالینی", subject: "بیوشیمی پزشکی", date: "آماده یادگیری" },
                          ].map((c, i) => (
                            <div key={i} className="rounded-xl bg-slate-800/40 border border-white/10 p-3 flex flex-col justify-between hover:border-teal-500/50">
                              <div>
                                <div className="w-8 h-8 rounded-lg bg-teal-950/60 border border-teal-500/30 text-teal-400 flex items-center justify-center text-xs mb-2">
                                  🎓
                                </div>
                                <h5 className="text-[11px] font-bold text-white line-clamp-1">{c.title}</h5>
                                <p className="text-[9px] text-slate-400 mt-0.5">{c.subject}</p>
                              </div>
                              <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[8px] text-slate-400">
                                <span>{c.date}</span>
                                <span className="text-teal-400 font-bold flex items-center gap-0.5">
                                  <span>ورود</span>
                                  <span>◄</span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {step.id === 2 && (
                      <div className="flex-1 p-3 flex flex-col gap-2 bg-[#0b1120] text-right dir-rtl text-slate-100 overflow-hidden text-[9px]">
                        {/* Top Back & Course Header matching LearningPage */}
                        <div className="space-y-1.5 border-b border-white/10 pb-2">
                          <span className="text-[8px] text-slate-400 font-semibold">← بازگشت به دوره‌ها</span>
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-[8px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">فارماکولوژی پایه</span>
                              <h4 className="text-xs font-black text-white mt-0.5">فارماکولوژی عمومی و سیستم عصبی</h4>
                            </div>
                            <span className="text-[8px] text-teal-300 border border-teal-500/30 bg-teal-950/40 px-2 py-1 rounded-lg font-bold">✨ مدیریت محتوا</span>
                          </div>
                          {/* Progress bar */}
                          <div className="flex items-center gap-2">
                            <div className="h-1 flex-1 bg-slate-700/50 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-l from-teal-400 to-[#008080] w-[68%]" />
                            </div>
                            <span className="text-[8px] text-teal-400 font-bold">۶۸٪</span>
                          </div>
                        </div>

                        {/* Navigation Tabs matching LearningPage */}
                        <div className="flex gap-1 border-b border-white/10 pb-1 text-[8px]">
                          <span className="px-2 py-0.5 rounded-t bg-[#008080] text-white font-bold">📖 درس‌ها</span>
                          <span className="px-2 py-0.5 text-slate-400">🎴 فلش‌کارت‌ها</span>
                          <span className="px-2 py-0.5 text-slate-400">❓ آزمون‌ها</span>
                          <span className="px-2 py-0.5 text-slate-400">📊 تحلیل</span>
                          <span className="px-2 py-0.5 text-slate-400">☁️ منابع PDF</span>
                        </div>

                        {/* Main 2-Column Content Area */}
                        <div className="flex flex-1 gap-2 overflow-hidden">
                          {/* Right Sidebar (Modules & Lessons) */}
                          <div className="w-1/3 border-l border-white/10 bg-[#0f172a]/60 p-2 flex flex-col gap-1 overflow-hidden">
                            <span className="text-[8px] font-bold text-slate-400 mb-0.5">سرفصل‌های آموزشی</span>
                            <div className="p-1 rounded bg-white/5 text-slate-300 flex justify-between">
                              <span className="truncate">فصل ۱: کلیات داروها</span>
                              <span className="text-teal-400 font-bold">✓</span>
                            </div>
                            <div className="p-1 rounded bg-[#008080]/20 border border-[#008080]/40 text-teal-300 font-bold">
                              ▶ ۱.۲: متابولیسم داروها
                            </div>
                            <div className="p-1 rounded bg-white/5 text-slate-400">فصل ۲: سیستم عصبی</div>
                            <div className="p-1 rounded bg-white/5 text-slate-400">فصل ۳: فارماکوکینتیک</div>
                          </div>

                          {/* Left Reader Panel (Lesson Reader) */}
                          <div className="flex-1 bg-slate-900/40 rounded-lg p-2.5 flex flex-col justify-between border border-white/5 overflow-hidden">
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center border-b border-white/5 pb-1">
                                <h5 className="text-[10px] font-extrabold text-white">درس ۱.۲: متابولیسم و دفع داروها</h5>
                                <span className="text-[8px] bg-teal-950 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30">تکمیل شده ✓</span>
                              </div>
                              <p className="text-[8px] text-slate-300 leading-relaxed">
                                فرآیند متابولیسم دارو عمدتاً در کبد و توسط سیستم آنزیمی سیتوکروم P450 هدایت می‌شود. این فرآیند داروها را به ترکیبات قطبی‌تر و قابل دفع از کلیه تبدیل می‌کند.
                              </p>
                              <p className="text-[8px] text-slate-300 leading-relaxed">
                                در فاز اول زیست‌دگرگونی، واکنش‌های اکسیداسیون، کاهش و هیدرولیز رخ می‌دهند که گروه‌های عاملی قطبی را وارد مولکول دارو می‌کنند.
                              </p>
                              <div className="rounded bg-purple-950/40 border border-purple-500/30 p-1.5 flex items-start gap-1">
                                <span className="text-purple-300">💡</span>
                                <div>
                                  <span className="font-bold text-purple-200 block text-[8px]">نکته مهم کنکوری:</span>
                                  <span className="text-[7.5px] text-purple-300/90">داروهایی که اثر عبور اول کبدی (First-pass effect) بالایی دارند، زیست‌دسترسی خوراکی کمتری دارند.</span>
                                </div>
                              </div>
                              <p className="text-[8px] text-slate-300 leading-relaxed">
                                در فاز دوم، واکنش‌های جفت‌شدن (Conjugation) مانند گلوکورونیداسیون باعث انحلال‌پذیری بیشتر در آب و تسهیل دفع ادراری می‌گردند.
                              </p>
                            </div>

                            <div className="flex justify-between items-center border-t border-white/5 pt-1 text-[8px] text-slate-400">
                              <span>◄ درس قبلی</span>
                              <span className="text-teal-400 font-bold">درس بعدی ►</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {step.id === 3 && (
                      <div className="flex-1 p-4 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_rgba(0,121,82,0.15),_transparent)] text-slate-100">
                        <div className="w-full max-w-xs rounded-xl bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col overflow-hidden dir-rtl text-right">
                          <div className="p-4 flex flex-col items-center justify-center text-center border-b border-white/5 min-h-[110px] relative">
                            <span className="absolute top-2 right-2 text-[9px] text-teal-400 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-500/30 font-semibold">سوال فلش‌کارت</span>
                            <p className="text-xs font-bold text-white leading-relaxed mt-2">
                              گیرنده اصلی استیل‌کولین در صفحه محرکه عضلانی چه نام دارد؟
                            </p>
                          </div>
                          <div className="p-2.5 grid grid-cols-4 gap-1.5 bg-[#0b1120]/80 text-[9px] font-bold text-center">
                            <div className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300">مجدداً<br/><span className="text-[8px] opacity-75">۱ روز</span></div>
                            <div className="p-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300">سخت<br/><span className="text-[8px] opacity-75">۳ روز</span></div>
                            <div className="p-1.5 rounded-lg bg-[#007952]/20 border border-[#007952]/40 text-emerald-300">خوب<br/><span className="text-[8px] opacity-75">۷ روز</span></div>
                            <div className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300">آسان<br/><span className="text-[8px] opacity-75">۱۴ روز</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {step.id === 4 && (
                      <div className="flex-1 p-5 flex flex-col justify-center gap-3 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(0,92,85,0.15),_transparent)] text-slate-100">
                        <div className="w-full max-w-xs mx-auto space-y-3">
                          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                            <div className="w-6 h-6 rounded-md bg-[#005c55]/30 border border-[#005c55]/50 flex items-center justify-center text-xs">📝</div>
                            <div>
                              <h5 className="text-xs font-bold text-white">تنظیمات آزمون خودسنجی</h5>
                              <p className="text-[9px] text-slate-400">شبیه‌سازی شرایط امتحانات سراسری</p>
                            </div>
                          </div>
                          
                          <div className="rounded-xl bg-[#0f172a]/90 border border-white/10 p-3 space-y-2 text-[10px]">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">تعداد سوالات:</span>
                              <span className="font-bold text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-500/30">۲۰ سوال</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">مبحث:</span>
                              <span className="font-bold text-slate-200">سیستم قلبی عروقی</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">حالت شب امتحان:</span>
                              <span className="font-bold text-emerald-400">فعال ✔</span>
                            </div>
                          </div>
                          
                          <div className="h-9 w-full rounded-xl bg-[#005c55] text-white flex items-center justify-center text-xs font-bold shadow-md shadow-[#005c55]/30">
                            شروع آزمون سنجش
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--lp-surface)]/50 to-transparent pointer-events-none group-hover:opacity-0 transition-opacity duration-500" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
