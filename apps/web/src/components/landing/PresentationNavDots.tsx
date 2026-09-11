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
      className="hidden lg:flex fixed left-6 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-3.5 p-2 rounded-full bg-white/95 backdrop-blur-md border border-[var(--avana-border-default)] shadow-elevated"
    >
      {PRESENTATION_SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelectSection(section.id)}
            aria-label={`پرش به بخش ${section.label}`}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex items-center justify-center cursor-pointer p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
          >
            {/* Tooltip on hover */}
            <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-[8px] bg-white border border-[var(--avana-border-default)] text-[11px] font-bold text-[var(--avana-text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-elevated">
              {section.label}
            </span>

            {/* Indicator Dot */}
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? "w-3 h-3 bg-primary scale-110 ring-2 ring-primary/30 shadow-xs"
                  : "w-2 h-2 bg-[var(--avana-border-default)] group-hover:bg-[var(--avana-text-muted)] group-hover:scale-125"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
};
