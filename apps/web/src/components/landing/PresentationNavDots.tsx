import React from "react";

export const HEADER_HEIGHT = 80;

export interface NavSection {
  id: string;
  label: string;
  shortLabel: string;
}

export const PRESENTATION_SECTIONS: NavSection[] = [
  { id: "hero", label: "آغاز معرفی", shortLabel: "شروع" },
  { id: "features", label: "مسائل و چالش‌ها", shortLabel: "چالش‌ها" },
  { id: "benefits", label: "اکوسیستم و قابلیت‌ها", shortLabel: "ویژگی‌ها" },
  { id: "experience", label: "تست‌درایو و تجربه زنده", shortLabel: "تجربه" },
  { id: "how-it-works", label: "فرایند ۴ مرحله‌ای یادگیری", shortLabel: "مراحل" },
  { id: "final-cta", label: "فراخوان و شروع یادگیری", shortLabel: "پیوستن" },
];

interface PresentationNavDotsProps {
  activeSection: string;
  onSelectSection: (id: string) => void;
}

export const PresentationNavDots: React.FC<PresentationNavDotsProps> = ({
  activeSection,
  onSelectSection,
}) => {
  return (
    <nav
      aria-label="ناوبری سریع بخش‌های ارائه"
      className="hidden lg:flex fixed left-6 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-3.5 p-2 rounded-full bg-slate-950/60 backdrop-blur-xl border border-white/10 shadow-2xl"
    >
      {PRESENTATION_SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelectSection(section.id)}
            aria-label={`پرش به بخش ${section.label}`}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex items-center justify-center cursor-pointer p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-full"
          >
            {/* Tooltip on hover */}
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-slate-900/95 border border-white/15 text-[11px] font-bold text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl backdrop-blur-md">
              {section.label}
            </span>

            {/* Indicator Dot */}
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? "w-3 h-3 bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.8)] scale-110 ring-2 ring-teal-400/40"
                  : "w-2 h-2 bg-slate-600 group-hover:bg-slate-300 group-hover:scale-125"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
};
