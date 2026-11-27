import React, { useRef } from "react";
import { Search, X, Loader2, ArrowLeft } from "lucide-react";

export interface PocketSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  onClear?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  isLoading?: boolean;
  isDropdownOpen?: boolean;
  activeDescendantId?: string;
  placeholder?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const PocketSearchBar: React.FC<PocketSearchBarProps> = ({
  value,
  onChange,
  onSearch,
  onClear,
  onKeyDown,
  onFocus,
  isLoading = false,
  isDropdownOpen = false,
  activeDescendantId,
  placeholder = "نام دارو، بیماری، درمان یا وضعیت اورژانسی را جستجو کنید…",
  className = "",
  inputRef: externalInputRef,
}) => {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const resolvedRef = externalInputRef || internalInputRef;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSearch(trimmed);
      }
    }
  };

  const handleClear = () => {
    onChange("");
    if (onClear) {
      onClear();
    }
    resolvedRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative w-full ${className}`}
      dir="rtl"
      role="search"
      aria-label="جستجوی بالینی AVANA Pocket"
    >
      <div className="relative flex items-center w-full">
        {/* Right Search Icon (RTL Start) */}
        <div className="absolute right-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="w-5 h-5 text-[#008080]" />
        </div>

        {/* Combobox Input */}
        <input
          ref={resolvedRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-controls="pocket-search-suggestions-list"
          aria-autocomplete="list"
          aria-activedescendant={activeDescendantId}
          aria-label="جستجوی جامع بالینی"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full h-12 md:h-14 pr-11 pl-24 md:pl-28 rounded-[14px] md:rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm md:text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 shadow-xs transition-all"
        />

        {/* Left Action Controls (RTL End) */}
        <div className="absolute left-2 flex items-center gap-1">
          {/* Loading Spinner */}
          {isLoading && (
            <div
              className="p-1.5 text-[#008080] animate-spin"
              aria-label="در حال جستجو"
              role="status"
            >
              <Loader2 className="w-4 h-4" />
            </div>
          )}

          {/* Clear Button */}
          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="پاک کردن ورودی جستجو"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Quick Submit Button */}
          <button
            type="submit"
            disabled={!value.trim()}
            className="h-8 md:h-9 px-3 rounded-[10px] bg-[#008080] text-white text-xs font-semibold hover:bg-[#007575] disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 shadow-xs"
            aria-label="اجرای جستجو"
          >
            <span className="hidden sm:inline">جستجو</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </form>
  );
};
