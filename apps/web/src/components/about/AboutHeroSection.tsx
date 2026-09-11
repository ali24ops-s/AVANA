import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Activity } from "lucide-react";
import { ParticleConstellationCanvas } from "./canvas/ParticleConstellationCanvas.js";
import { ScrollIndicator } from "./shared/ScrollIndicator.js";

export const AboutHeroSection: React.FC = () => {
  return (
    <section
      id="about-hero"
      className="relative pt-6 pb-12 px-4 sm:px-6 max-w-[1280px] mx-auto text-center"
      aria-label="بخش آغازین درباره آوانا"
    >
      {/* Contained Visual Showcase Stage (Hero Visual Zone with Particle Constellation) */}
      <div className="relative w-full rounded-2xl sm:rounded-3xl bg-[#0D1719] border border-[#1e3235] p-8 sm:p-14 md:p-18 overflow-hidden shadow-xl text-center flex flex-col items-center justify-center min-h-[500px]">
        {/* Dynamic Background Constellation Canvas strictly contained inside this visual zone */}
        <div className="absolute inset-0 z-0">
          <ParticleConstellationCanvas />
          {/* Soft Radial Ambient Lighting */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[400px] sm:h-[500px] bg-gradient-to-br from-teal-500/20 via-cyan-500/15 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Floating Scientific Tags (Ambient Background Accents) */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-8 right-[8%] hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#142124]/90 border border-[#1e3235] text-teal-300 text-xs shadow-md backdrop-blur-sm"
          >
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span>گیرنده‌های سلولی</span>
          </motion.div>
          <motion.div
            animate={{ y: [0, 14, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute top-20 left-[8%] hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#142124]/90 border border-[#1e3235] text-cyan-300 text-xs shadow-md backdrop-blur-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>فارماکودینامیک هوشمند</span>
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-12 right-[12%] hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#142124]/90 border border-[#1e3235] text-purple-300 text-xs shadow-md backdrop-blur-sm"
          >
            <span>سینتیک دارویی</span>
          </motion.div>
        </div>

        {/* Main Narrative Hero Content */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto z-10 my-auto">
          {/* Brand Tag / Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-[#008080]/20 text-teal-300 border-[#008080]/40 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
            <span>داستان و مأموریت آوانا</span>
          </motion.div>

          {/* Primary Climax Sequence */}
          <h1 className="font-headline font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#F2F7F7] tracking-tight leading-[1.3] sm:leading-[1.35] mb-6 flex flex-col gap-2 sm:gap-3">
            <span className="text-[#F2F7F7] drop-shadow-sm">
              داروسازی فقط حفظ کردن نیست.
            </span>

            <motion.span
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 drop-shadow-sm"
            >
              یادگیری یعنی ساختن ارتباط بین مفاهیم.
            </motion.span>

            <motion.span
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="text-lg sm:text-2xl md:text-3xl font-semibold text-[#c8d8da] mt-2 font-body"
            >
              و <strong className="text-white font-black text-teal-200">آوانا</strong> برای همین ساخته شده است.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-[#c8d8da] text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed mt-2"
          >
            فاصله میان اقیانوس مفاهیم داروسازی و تسلط واقعی، حفظ هزاران صفحه جزوه نیست؛
            بلکه درک شبکه‌ای از الگوها و تبدیل اطلاعات به دانش ماندگار است.
          </motion.p>
        </div>
      </div>

      {/* Scroll Down Beacon */}
      <div className="z-10 mt-8">
        <ScrollIndicator targetId="problem-section" label="کشف داستان" />
      </div>
    </section>
  );
};
