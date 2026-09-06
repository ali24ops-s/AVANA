import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Activity } from "lucide-react";
import { ParticleConstellationCanvas } from "./canvas/ParticleConstellationCanvas.js";
import { ScrollIndicator } from "./shared/ScrollIndicator.js";

export const AboutHeroSection: React.FC = () => {
  return (
    <section
      id="about-hero"
      className="relative min-h-[92vh] flex flex-col justify-between items-center pt-32 pb-12 px-6 max-w-[1280px] mx-auto overflow-hidden text-center"
      aria-label="بخش آغازین درباره آوانا"
    >
      {/* Dynamic Background Constellation Canvas */}
      <div className="absolute inset-0 -z-10">
        <ParticleConstellationCanvas />
        {/* Soft Radial Ambient Lighting */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[800px] h-[400px] sm:h-[500px] bg-gradient-to-br from-teal-500/15 via-cyan-500/10 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Floating Scientific Tags (Ambient Background Accents) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-24 right-[10%] hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-teal-500/20 text-teal-300 text-xs shadow-lg backdrop-blur-sm"
        >
          <Activity className="w-3.5 h-3.5 text-teal-400" />
          <span>گیرنده‌های سلولی</span>
        </motion.div>
        <motion.div
          animate={{ y: [0, 14, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-44 left-[12%] hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-cyan-500/20 text-cyan-300 text-xs shadow-lg backdrop-blur-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>فارماکودینامیک هوشمند</span>
        </motion.div>
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-32 right-[15%] hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-purple-500/20 text-purple-300 text-xs shadow-lg backdrop-blur-sm"
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
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide border mb-6 bg-teal-950/40 text-teal-300 border-teal-500/30 shadow-[0_0_20px_rgba(0,128,128,0.2)]"
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
          <span>داستان و مأموریت آوانا</span>
        </motion.div>

        {/* Primary Climax Sequence: Line 1 (Instant Paint) -> Line 2 -> Line 3 */}
        <h1 className="font-headline font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white tracking-tight leading-[1.3] sm:leading-[1.35] mb-6 flex flex-col gap-2 sm:gap-3">
          {/* Line 1: Immediate visibility */}
          <span className="text-slate-100 drop-shadow-md">
            داروسازی فقط حفظ کردن نیست.
          </span>

          {/* Line 2: Transition */}
          <motion.span
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-transparent bg-clip-text bg-gradient-to-l from-teal-300 via-teal-400 to-cyan-300 drop-shadow-[0_0_30px_rgba(45,212,191,0.25)]"
          >
            یادگیری یعنی ساختن ارتباط بین مفاهیم.
          </motion.span>

          {/* Line 3: Resolution */}
          <motion.span
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="text-lg sm:text-2xl md:text-3xl font-semibold text-slate-300 mt-2 font-body"
          >
            و <strong className="text-white font-black text-teal-200">آوانا</strong> برای همین ساخته شده است.
          </motion.span>
        </h1>

        {/* Narrative Narrative Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-slate-300 text-sm sm:text-base md:text-lg max-w-2xl leading-relaxed mt-2"
        >
          فاصله میان اقیانوس مفاهیم داروسازی و تسلط واقعی، حفظ هزاران صفحه جزوه نیست؛
          بلکه درک شبکه‌ای از الگوها و تبدیل اطلاعات به دانش ماندگار است.
        </motion.p>
      </div>

      {/* Scroll Down Beacon */}
      <div className="z-10 mt-8">
        <ScrollIndicator targetId="problem-section" label="کشف داستان" />
      </div>
    </section>
  );
};
