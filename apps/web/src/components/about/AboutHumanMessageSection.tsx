import React from "react";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";

export const AboutHumanMessageSection: React.FC = () => {
  return (
    <section
      id="human-message"
      className="relative py-24 md:py-32 px-6 max-w-[1000px] mx-auto text-center overflow-hidden"
      aria-label="پیام انسانی آوانا به دانشجویان داروسازی"
    >
      {/* Gentle, calm ambient warm glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] sm:w-[650px] h-[350px] bg-gradient-to-r from-teal-500/10 via-amber-500/5 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Subtle Warm Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-slate-900/60 border-teal-500/20 text-teal-300 backdrop-blur-md">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400/20" />
          <span>همراه مسیر شما</span>
        </div>

        {/* Headline */}
        <h2 className="font-headline text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-8">
          برای دانشجو ساخته شده؛{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300">
            با نگاه به آینده.
          </span>
        </h2>

        {/* Central Human Manifesto (Clean, Spacious Typography) */}
        <div className="rounded-3xl bg-slate-900/40 border border-white/10 p-8 sm:p-12 backdrop-blur-xl max-w-3xl shadow-2xl space-y-6 text-right sm:text-center">
          <p className="text-base sm:text-lg md:text-xl text-slate-200 font-medium leading-relaxed sm:leading-loose">
            «ما قرار نیست مسیر را به جای تو طی کنیم.
            <br />
            ما کمک می‌کنیم انرژی‌ای که برای یادگیری می‌گذاری، در جهت درست حرکت کند.»
          </p>

          <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent mx-auto opacity-40" />

          <p className="text-xs sm:text-sm md:text-base text-slate-300/90 leading-relaxed max-w-2xl mx-auto">
            ما می‌دانیم شب‌های امتحان، حجم سرسام‌آور مطالب، اضطراب فراموشی مکانیسم‌ها و سردرگمی میان جزوه‌ها چقدر چالش‌برانگیز است.
            آوانا پلتفرمی برای حذف زحمت نیست؛ بلکه ساخته شده تا هیچ تلاشی به هدر نرود و زمان شما صرف ساختن تسلط واقعی شود.
          </p>
        </div>
      </motion.div>
    </section>
  );
};
