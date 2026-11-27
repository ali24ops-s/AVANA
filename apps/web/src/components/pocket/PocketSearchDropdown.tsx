import React, { useEffect, useRef } from "react";
import { Search, AlertCircle, ArrowLeft, Loader2, CornerDownLeft } from "lucide-react";
import type { PocketSearchSuggestion } from "../../lib/api/pocket.js";
import { AggregateTypeBadge } from "./AggregateTypeBadge.js";

export interface PocketSearchDropdownProps {
  isOpen: boolean;
  suggestions: PocketSearchSuggestion[];
  isLoading: boolean;
  isError: boolean;
  query: string;
  selectedIndex: number;
  onSelect: (item: PocketSearchSuggestion) => void;
  onSearchAll: (query: string) => void;
  onClose: () => void;
  className?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export const PocketSearchDropdown: React.FC<PocketSearchDropdownProps> = ({
  isOpen,
  suggestions,
  isLoading,
  isError,
  query,
  selectedIndex,
  onSelect,
  onSearchAll,
  onClose,
  className = "",
  anchorRef,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef?.current && anchorRef.current.contains(target)) {
        return;
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmedQuery = query.trim();

  return (
    <div
      ref={dropdownRef}
      id="pocket-search-suggestions-list"
      role="listbox"
      aria-label="پیشنهادهای جستجوی بالینی"
      className={`absolute top-full right-0 left-0 mt-2 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] shadow-lg overflow-hidden ${className}`}
      dir="rtl"
    >
      {/* 1. Loading State */}
      {isLoading && (
        <div className="p-4 flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 text-[#008080] animate-spin" />
          <span>در حال دریافت پیشنهادهای بالینی...</span>
        </div>
      )}

      {/* 2. Error State */}
      {!isLoading && isError && (
        <div className="p-4 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>خطا در دریافت پیشنهادهای لحظه‌ای. برای جستجوی مستقیم Enter بزنید.</span>
        </div>
      )}

      {/* 3. Empty State (Query present, but no suggestions) */}
      {!isLoading && !isError && trimmedQuery.length > 0 && suggestions.length === 0 && (
        <div className="p-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)] mb-2">
            موردی در پیشنهادهای اولیه برای «<span className="font-semibold text-[var(--color-text-primary)]">{trimmedQuery}</span>» یافت نشد.
          </p>
          <button
            type="button"
            onClick={() => onSearchAll(trimmedQuery)}
            className="text-xs font-semibold text-[#008080] hover:underline inline-flex items-center gap-1"
          >
            <span>جستجوی سراسری در پایگاه داده بالینی</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. Suggestions List */}
      {!isLoading && !isError && suggestions.length > 0 && (
        <ul className="divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
          {suggestions.map((item, index) => {
            const isSelected = selectedIndex === index;
            const itemId = `pocket-suggestion-item-${index}`;

            return (
              <li
                key={`${item.type}-${item.id}`}
                id={itemId}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(item)}
                className={`p-3 md:px-4 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                  isSelected
                    ? "bg-teal-50/70 dark:bg-teal-950/40 border-r-4 border-r-[#008080]"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                      {item.titleFa}
                    </span>
                    <span className="text-xs font-mono text-[var(--color-text-muted)] truncate">
                      ({item.titleEn})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    {item.classification && (
                      <span className="truncate">
                        رده: {item.classification}
                      </span>
                    )}
                    {item.matchedText && item.matchedText !== item.titleFa && (
                      <span className="text-[11px] text-[#008080] dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded">
                        منطبق با: {item.matchedText}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <AggregateTypeBadge type={item.type} size="sm" />
                  <CornerDownLeft className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hidden sm:block" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 5. Dropdown Footer with Search All Trigger */}
      {trimmedQuery.length > 0 && (
        <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <button
            type="button"
            onClick={() => onSearchAll(trimmedQuery)}
            className="text-xs font-semibold text-[#008080] hover:underline inline-flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>جستجوی سراسری برای «{trimmedQuery}»</span>
          </button>

          <span className="text-[11px] text-slate-400 hidden sm:inline">
            کلیدهای ↑ ↓ برای حرکت، Enter برای انتخاب
          </span>
        </div>
      )}
    </div>
  );
};
