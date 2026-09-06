/**
 * Future Knowledge Network Feature (Experimental / Future Concept)
 * 
 * Internal Name: FutureKnowledgeNetwork / KnowledgeNetworkConcept
 *
 * NOTE: This feature is not rendered in the live production UI of Landing or About,
 * as AVANA does not currently feature a standalone Knowledge Network engine in MVP.
 * It is structured cleanly and preserved here as a starting foundation for future
 * integration into the product once the real Knowledge Graph is developed.
 *
 * How to re-enable:
 * 1. Import `FutureKnowledgeNetwork` or `KnowledgeNetworkSection` into the target page.
 * 2. Connect real taxonomy / knowledge graph nodes from the backend API.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Pill,
  Cog,
  Target,
  Activity,
  Stethoscope,
  CreditCard,
  Award,
  CheckCircle2,
} from "lucide-react";

export interface NetworkNode {
  id: string;
  label: string;
  enLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  roleInAvana: string;
  color: string;
}

export interface DrugNetworkData {
  id: string;
  name: string;
  enName: string;
  category: string;
  centralSummary: string;
  nodes: {
    [key: string]: {
      title: string;
      description: string;
      avanaModule: string;
    };
  };
}

export const NETWORK_NODES: NetworkNode[] = [
  { id: "mechanism", label: "مکانیسم اثر", enLabel: "Mechanism of Action", icon: Cog, roleInAvana: "ماژول درسنامه مفهومی", color: "cyan" },
  { id: "receptor", label: "گیرنده هدف", enLabel: "Target Receptor", icon: Target, roleInAvana: "نمودار بیوشیمیایی", color: "blue" },
  { id: "physiology", label: "اثر فیزیولوژیک", enLabel: "Physiologic Effect", icon: Activity, roleInAvana: "نکات بالینی و کنکوری", color: "purple" },
  { id: "clinical", label: "کاربرد بالینی", enLabel: "Clinical Indication", icon: Stethoscope, roleInAvana: "بانک سناریوهای کیس", color: "emerald" },
  { id: "flashcard", label: "فلش‌کارت مرور", enLabel: "Active Flashcard", icon: CreditCard, roleInAvana: "چرخه مرور فاصله‌دار (SRS)", color: "pink" },
  { id: "exam", label: "بانک آزمون", enLabel: "Adaptive Quiz", icon: Award, roleInAvana: "سنجش و تحلیل ضعف", color: "amber" },
];

export const DRUGS_NETWORK: DrugNetworkData[] = [
  {
    id: "propranolol",
    name: "پروپرانولول",
    enName: "Propranolol",
    category: "بتا بلاکر غیرانتخابی (Non-selective β-blocker)",
    centralSummary: "داروی مرجع برای مهار گیرنده‌های سمپاتیک در سیستم قلبی-عروقی و عروق مغزی.",
    nodes: {
      mechanism: {
        title: "مهار رقابتی کاتکول‌آمین‌ها",
        description: "جایگزینی در جایگاه اتصال اپی‌نفرین و نوراپی‌نفرین بر روی گیرنده‌ها بدون فعالیت سمپاتومیمتیک ذاتی (ISA).",
        avanaModule: "درسنامه فصل ۴: سیستم عصبی خودمختار",
      },
      receptor: {
        title: "آنتاگونیست گیرنده‌های β1 و β2",
        description: "اتصال به گیرنده‌های قلبی (β1) و تنفسی/عروقی (β2) با میل ترکیبی برابر و ماهیت لیپوفیلیک بالا.",
        avanaModule: "نقشه مفهومی فارماکودینامیک",
      },
      physiology: {
        title: "کاهش بار کاری و ضربان قلب",
        description: "کاهش ضربان (Negative Chronotropy)، کاهش برون‌ده قلبی و مهار نسبی ترشح رنین از سلول‌های کلیوی.",
        avanaModule: "باکس نکات کلیدی فیزیولوژی",
      },
      clinical: {
        title: "کنترل فشار خون، آنژین و میگرن",
        description: "کاهش فشار خون شریانی، تسکین حملات آنژین صدری و پیشگیری از سردردهای میگرنی عروقی.",
        avanaModule: "کیس‌های بالینی فارماکوتراپی",
      },
      flashcard: {
        title: "کارت شماره ۱۲ — عوارض بتابلاکرها",
        description: "سوال: چرا پروپرانولول در بیماران مبتلا به آسم منع مصرف دارد؟ پاسخ: به علت مهار گیرنده β2 و ایجاد برونکواسپاسم.",
        avanaModule: "بسته فلش‌کارت فارماکولوژی قلبی",
      },
      exam: {
        title: "سوال تحلیلی آزمون جامع",
        description: "شبیه‌سازی سوال کنکور دستیاری درباره عبور از سد خونی-مغزی (BBB) و کنترل لرزش ناشی از اضطراب.",
        avanaModule: "بانک آزمون‌های شبیه‌سازی‌شده",
      },
    },
  },
  {
    id: "metformin",
    name: "متفورمین",
    enName: "Metformin",
    category: "بیگوانید ضددیابت (Biguanide Antidiabetic)",
    centralSummary: "خط اول درمان دارویی در دیابت نوع ۲ با تکیه بر کاهش مقاومت به انسولین.",
    nodes: {
      mechanism: {
        title: "فعال‌سازی مسیر کیناز AMPK",
        description: "مهار کمپلکس I زنجیره تنفسی میتوکندری و تنظیم نسبت AMP/ATP در سلول‌های هپاتوسیت.",
        avanaModule: "درسنامه بیوشیمی متابولیسم داروها",
      },
      receptor: {
        title: "ناقل‌های کاتیون آلی (OCT1/OCT2)",
        description: "انتقال مستقیم به داخل بافت کبد و اثرگذاری بر مسیرهای آنزیمی گلوکونئوژنز بدون تحریک ترشح انسولین.",
        avanaModule: "نقشه مفهومی انتقال‌دهنده‌های غشایی",
      },
      physiology: {
        title: "مهار ساخت قند کبد و افزایش حساسیت عضلانی",
        description: "کاهش محسوس قند خون ناشتا و تسهیل انتقال‌دهنده گلوکز GLUT4 در بافت عضلات اسکلتی.",
        avanaModule: "باکس نکات تحلیلی غدد",
      },
      clinical: {
        title: "دیابت نوع ۲ و سندرم تخمدان پلی‌کیستیک (PCOS)",
        description: "کنترل استاندارد قند خون بدون ایجاد افزایش وزن و با اثرات اثبات‌شده محافظت قلبی-عروقی.",
        avanaModule: "پروتکل‌های بالینی انجمن دیابت",
      },
      flashcard: {
        title: "کارت شماره ۴۸ — عوارض متفورمین",
        description: "سوال: نادرترین و خطیرترین عارضه متفورمین چیست و چه زمانی رخ می‌دهد؟ پاسخ: اسیدوز لاکتیک در نارسایی کلیه.",
        avanaModule: "بسته فلش‌کارت غدد و متابولیسم",
      },
      exam: {
        title: "سوال تستی آزمون دوره‌ای",
        description: "سوال ارزیابی پایش فاکتور eGFR قبل از تجویز متفورمین در بیماران دیابتی.",
        avanaModule: "بانک آزمون فارماکولوژی",
      },
    },
  },
  {
    id: "atropine",
    name: "آتروپین",
    enName: "Atropine",
    category: "آنتی‌کولینرژیک / آنتاگونیست موسکارینی",
    centralSummary: "داروی اورژانس احیا برای درمان برادی‌کاردی و پادزهر مسمومیت‌های ارگانوفسفره.",
    nodes: {
      mechanism: {
        title: "مهار رقابتی استیل‌کولین",
        description: "اشغال جایگاه فعال گیرنده‌های پاراسمپاتیک و خنثی‌سازی اثرات تحریکی عصب واگ بر ارگان‌های هدف.",
        avanaModule: "درسنامه داروشناسی سیستم کولینرژیک",
      },
      receptor: {
        title: "آنتاگونیست گیرنده‌های موسکارینی M1 تا M5",
        description: "اثر پرقدرت بر گیرنده‌های M2 در قلب (افزایش هدایت AV) و M3 در عضلات صاف احشایی و غدد ترشحی.",
        avanaModule: "نمودار جامع گیرنده‌های خودمختار",
      },
      physiology: {
        title: "افزایش هدایت قلبی و کاهش ترشحات",
        description: "افزایش سرعت ضربان در برادی‌کاردی، خشکی دهان، میدریاز (گشادی مردمک) و رفع اسپاسم‌های گوارشی.",
        avanaModule: "باکس نکات فارماسیوتیکس و بالین",
      },
      clinical: {
        title: "احیای اورژانس و پادزهر سموم ارگانوفسفره",
        description: "درمان شوک ناشی از کندی ضربان قلب و مقابله با مسمومیت حشره‌کش‌های کشاورزی.",
        avanaModule: "کیس‌های اورژانس و سم‌شناسی",
      },
      flashcard: {
        title: "کارت شماره ۷ — نشانه‌های مسمومیت با آتروپین",
        description: "سوال: علائم کلاسیک مسمومیت آنتی‌کولینرژیک چیست؟ پاسخ: خشکی مخاط، تاری دید، برافروختگی و تاکی‌کاردی.",
        avanaModule: "بسته فلش‌کارت سم‌شناسی بالینی",
      },
      exam: {
        title: "سوال آزمون شبیه‌سازی پره‌انترنی",
        description: "تحلیل دوزاژ و اندیکاسیون آتروپین در ایست قلبی آسیستول و مسمومیت با مهارکننده‌های کولین‌استراز.",
        avanaModule: "بانک آزمون‌های جامع",
      },
    },
  },
];

export function FutureKnowledgeNetwork() {
  const [selectedDrugId, setSelectedDrugId] = useState<string>("propranolol");
  const [activeNodeId, setActiveNodeId] = useState<string>("mechanism");

  const currentDrug = DRUGS_NETWORK.find((d) => d.id === selectedDrugId) || DRUGS_NETWORK[0];
  const activeNodeMeta = NETWORK_NODES.find((n) => n.id === activeNodeId) || NETWORK_NODES[0];
  const activeNodeData = currentDrug.nodes[activeNodeId] || currentDrug.nodes["mechanism"];

  return (
    <section
      id="knowledge-network"
      className="relative py-20 md:py-28 px-6 max-w-[1280px] mx-auto overflow-hidden text-right"
      aria-label="بخش شبکه دانش یکپارچه آوانا"
    >
      {/* Background Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[550px] bg-cyan-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border mb-4 bg-teal-950/60 text-teal-300 border-teal-500/40 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
          <span>معماری شبکه دانش</span>
        </div>

        <h2 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black mb-4 text-white leading-tight">
          یک مفهوم، یک شبکه یادگیری
        </h2>
        <p className="text-sm sm:text-base md:text-lg leading-relaxed text-slate-300">
          در آوانا هیچ مفهومی یک صفحه جداگانه نیست؛ مولکول دارو در تمام چرخه درس، فلش‌کارت، آزمون و بالین به هم متصل است.
        </p>
      </div>

      {/* Drug Selection Chips */}
      <div className="flex flex-wrap justify-center items-center gap-3 mb-8" role="tablist" aria-label="انتخاب داروی نمونه">
        {DRUGS_NETWORK.map((drug) => {
          const isSelected = drug.id === selectedDrugId;
          return (
            <button
              key={drug.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => {
                setSelectedDrugId(drug.id);
                setActiveNodeId("mechanism");
              }}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center gap-2 border cursor-pointer ${
                isSelected
                  ? "bg-teal-500/25 text-teal-200 border-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.25)] scale-105"
                  : "bg-slate-900/70 text-slate-400 border-white/10 hover:text-slate-200 hover:border-white/20"
              }`}
            >
              <Pill className={`w-4 h-4 ${isSelected ? "text-teal-300" : "text-slate-500"}`} />
              <span>{drug.name}</span>
              <span className="text-[10px] font-sans opacity-75">({drug.enName})</span>
            </button>
          );
        })}
      </div>

      {/* Drug Header Summary Banner */}
      <div className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-extrabold text-white">{currentDrug.name}</span>
            <span className="text-xs text-teal-400 font-mono">[{currentDrug.enName}]</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/10">
              {currentDrug.category}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{currentDrug.centralSummary}</p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-teal-300 bg-teal-950/70 border border-teal-500/30 px-3 py-1.5 rounded-xl shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>شبکه یکپارچه ۶ بعدی</span>
        </div>
      </div>

      {/* Network Interactive Orbit Grid & Detail Box */}
      <div className="max-w-4xl mx-auto rounded-3xl bg-slate-900/90 border border-white/15 p-5 sm:p-8 backdrop-blur-2xl shadow-2xl">
        {/* Nodes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-8" role="tablist" aria-label="لایه‌های شبکه دانش">
          {NETWORK_NODES.map((node) => {
            const Icon = node.icon;
            const isSelected = node.id === activeNodeId;
            return (
              <button
                key={node.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveNodeId(node.id)}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-2 text-center transition-all duration-300 cursor-pointer ${
                  isSelected
                    ? "bg-teal-950/80 border-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.35)] scale-105 z-10"
                    : "bg-slate-900/60 border-white/10 text-slate-400 opacity-70 hover:opacity-100 hover:border-white/20"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-teal-500 text-slate-950 font-bold shadow-md"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-bold leading-tight ${
                    isSelected ? "text-teal-200" : "text-slate-300"
                  }`}
                >
                  {node.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Detail Card for Active Node */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedDrugId}-${activeNodeId}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl bg-gradient-to-br from-slate-800/90 via-slate-900/95 to-[#0b1120] border border-teal-500/30 p-5 sm:p-7 relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0 shadow-lg">
                  <activeNodeMeta.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">{activeNodeData.title}</h3>
                  <span className="text-[11px] text-teal-400 font-sans">{activeNodeMeta.enLabel}</span>
                </div>
              </div>

              <div className="px-3 py-1 rounded-xl text-xs font-bold bg-teal-950/70 text-teal-300 border border-teal-500/30">
                <span>ماژول در آوانا: {activeNodeData.avanaModule}</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-body">
              {activeNodeData.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// Backward-compatible alias export
export const KnowledgeNetworkSection = FutureKnowledgeNetwork;
