import React from "react";
import { Pill, Activity, Stethoscope, AlertTriangle, Layers } from "lucide-react";
import type { ClinicalSearchAggregateType } from "../../lib/api/pocket.js";

export interface PocketSearchFiltersProps {
  selectedType: ClinicalSearchAggregateType;
  onSelectType: (type: ClinicalSearchAggregateType) => void;
  className?: string;
  counts?: Partial<Record<ClinicalSearchAggregateType, number>>;
}

const FILTER_ITEMS: Array<{
  type: ClinicalSearchAggregateType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: "all", label: "همه", icon: Layers },
  { type: "drug", label: "دارو", icon: Pill },
  { type: "disease", label: "بیماری", icon: Activity },
  { type: "treatment", label: "درمان", icon: Stethoscope },
  { type: "emergency", label: "اورژانس", icon: AlertTriangle },
];

export const PocketSearchFilters: React.FC<PocketSearchFiltersProps> = ({
  selectedType,
  onSelectType,
  className = "",
  counts,
}) => {
  return (
    <div
      role="tablist"
      aria-label="فیلتر ارکان بالینی"
      className={`flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar ${className}`}
      dir="rtl"
    >
      {FILTER_ITEMS.map((item) => {
        const Icon = item.icon;
        const isSelected = selectedType === item.type;
        const count = counts?.[item.type];

        return (
          <button
            key={item.type}
            role="tab"
            aria-selected={isSelected}
            type="button"
            onClick={() => onSelectType(item.type)}
            className={`min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-2 shrink-0 border transition-all ${
              isSelected
                ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
            {count !== undefined && count > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected
                    ? "bg-teal-700/60 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-[var(--color-text-muted)]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
