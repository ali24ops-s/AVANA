import React, { useState } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  content?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultTabId?: string;
  activeTabId?: string;
  onChange?: (tabId: string) => void;
  variant?: "underline" | "pill";
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  defaultTabId,
  activeTabId,
  onChange,
  variant = "underline",
  className = "",
}) => {
  const [selectedId, setSelectedId] = useState(defaultTabId || items[0]?.id);
  const currentTabId = activeTabId !== undefined ? activeTabId : selectedId;

  const handleTabClick = (id: string) => {
    setSelectedId(id);
    onChange?.(id);
  };

  const activeContent = items.find((item) => item.id === currentTabId)?.content;

  if (variant === "pill") {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-[10px] overflow-x-auto">
          {items.map((tab) => {
            const isActive = tab.id === currentTabId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold whitespace-nowrap leading-none transition-all [&_svg]:shrink-0 [&_svg]:block ${
                  isActive
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {tab.icon && (
                  <span className="inline-flex shrink-0 items-center justify-center leading-none">
                    {tab.icon}
                  </span>
                )}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      isActive ? "bg-[#e0f2f2] text-[#006666]" : "bg-slate-200 dark:bg-slate-800 text-[var(--color-text-muted)]"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {activeContent && <div>{activeContent}</div>}
      </div>
    );
  }

  // Canonical Figma Underline Tabs
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2 border-b-2 border-[var(--color-border)] overflow-x-auto">
        {items.map((tab) => {
          const isActive = tab.id === currentTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap leading-none transition-all [&_svg]:shrink-0 [&_svg]:block -mb-[2px] border-b-2 ${
                isActive
                  ? "border-[#008080] text-[#008080]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.icon && (
                <span className="inline-flex shrink-0 items-center justify-center leading-none">
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? "bg-[#e0f2f2] text-[#006666]" : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {activeContent && <div>{activeContent}</div>}
    </div>
  );
};

export interface SegmentedControlProps {
  options: (string | { value: string; label: React.ReactNode })[];
  value?: string;
  defaultValue?: string;
  onChange?: (val: string) => void;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  defaultValue,
  onChange,
  className = "",
}) => {
  const normalized = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );
  const [selected, setSelected] = useState(defaultValue || normalized[0]?.value);
  const current = value !== undefined ? value : selected;

  const handleClick = (val: string) => {
    setSelected(val);
    onChange?.(val);
  };

  return (
    <div
      className={`inline-flex items-center bg-[var(--color-background)] border border-[var(--color-border)] rounded-[10px] p-1 gap-1 ${className}`}
      dir="rtl"
    >
      {normalized.map((opt) => {
        const isActive = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            className={`px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-medium transition-all ${
              isActive
                ? "bg-[var(--color-surface)] text-[var(--color-text)] font-semibold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
