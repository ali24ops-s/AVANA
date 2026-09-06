import React from "react";
import { motion } from "framer-motion";
import { SectionHeading } from "./shared/SectionHeading.js";
import { Sparkles, User, Lightbulb, Trophy, ArrowLeft } from "lucide-react";

export const AboutFutureStorySection: React.FC = () => {
  const milestones = [
    {
      step: 1,
      title: "دانشجو: مواجهه و کنجکاوی",
      enTitle: "The Learner",
      icon: User,
      color: "from-sky-500/20 to-teal-500/20",
      border: "border-sky-500/30",
      iconColor: "text-sky-400",
      description: "ورود به دنیای عظیم داروسازی؛ جایی که یادگیری با هزاران اصطلاح، سوالات بی‌پاسخ و جستجوی ساختار آغاز می‌شود.",
    },
    {
      step: 2,
      title: "درک عمیق: اتصال و تحلیل",
      enTitle: "Deep Understanding",
      icon: Lightbulb,
      color: "from-teal-500/20 to-emerald-500/20",
      border: "border-teal-500/40",
      iconColor: "text-teal-300",
      description: "پیوند زدن مفاهیم؛ درک علت‌ها، اثرات متقابل داروها و تبدیل داده‌های خام به چارچوب‌های ذهنی مستحکم و ماندگار.",
    },
    {
      step: 3,
      title: "تسلط کامل: اطمینان و مهارت بالینی",
      enTitle: "Clinical Mastery",
      icon: Trophy,
      color: "from-purple-500/20 to-teal-500/20",
      border: "border-purple-500/40",
      iconColor: "text-purple-300",
      description: "آمادگی کامل برای آزمون‌های سرنوشت‌ساز، تصمیم‌گیری بالینی دقیق در داروخانه و هدایت مطمئن سلامت جامعه.",
    },
  ];

  return (
    <section
      id="future-story"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden"
      aria-label="بخش داستان آینده آموزش و مسیر تحول دانشجو"
    >
      {/* Soft Ambient Radiance */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Heading */}
      <SectionHeading
        badge="آینده آموزش داروسازی"
        badgeIcon={<Sparkles className="w-4 h-4 text-teal-300" />}
        title="ما تازه در ابتدای مسیر هستیم؛"
        highlightText="آموزش هوشمند، شخصی و پویاست."
        subtitle="هدف ما بازتعریف تجربه تحصیل داروسازی است؛ ساختن مسیری که دانشجو را از سردرگمی اولیه به بینش و تسلط حرفه‌ای می‌رساند."
      />

      {/* 3-Milestone Progressive Roadmap */}
      <div className="max-w-4xl mx-auto relative">
        {/* Connecting Track Line for Desktop */}
        <div className="hidden md:block absolute top-1/2 right-12 left-12 h-1 bg-gradient-to-l from-sky-500/40 via-teal-400 to-purple-500/50 -translate-y-1/2 z-0" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {milestones.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                whileHover={{ y: -4 }}
                className={`rounded-2xl bg-gradient-to-b ${item.color} border ${item.border} p-6 backdrop-blur-xl flex flex-col justify-between shadow-xl`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-center shadow-md">
                      <Icon className={`w-6 h-6 ${item.iconColor}`} />
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-900/60 border border-white/10 text-slate-300">
                      مرحله {item.step}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-white mb-1">
                    {item.title}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-sans block mb-3">
                    {item.enTitle}
                  </span>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-white/10 flex items-center gap-1 text-xs text-teal-300 font-semibold">
                  <span>سفر به سوی تسلط</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
