import React, { useState, useRef, useEffect, useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface AvanaSelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  isMulti?: boolean;
  className?: string;
  containerClassName?: string;
}

export const AvanaSelect: React.FC<AvanaSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "انتخاب کنید...",
  label,
  error,
  disabled = false,
  isLoading = false,
  isSearchable = false,
  isMulti = false,
  className = "",
  containerClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const labelId = useId();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group options if group field present
  const groupedOptions = filteredOptions.reduce((acc, opt) => {
    const groupName = opt.group || "سایر";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(opt);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  const hasGroups = Object.keys(groupedOptions).length > 1 || options.some((o) => o.group);

  // Auto focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      if (isSearchable && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    } else {
      setSearchQuery("");
      setHighlightedIndex(-1);
    }
  }, [isOpen, isSearchable]);

  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const handleSelect = (optionValue: string) => {
    if (disabled || isLoading) return;
    if (isMulti) {
      const nextValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange?.(nextValues);
    } else {
      onChange?.(optionValue);
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || isLoading) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case "Enter":
      case " ":
        if (isSearchable && e.key === " ") return; // Allow typing space in search
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const opt = filteredOptions[highlightedIndex];
          if (opt && !opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const renderTriggerContent = () => {
    if (isLoading) {
      return (
        <span className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <svg className="animate-spin h-4 w-4 text-[#008080]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          در حال بارگذاری...
        </span>
      );
    }

    if (selectedValues.length === 0) {
      return <span className="text-[var(--color-text-muted)]">{placeholder}</span>;
    }

    if (isMulti) {
      return (
        <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
          {selectedValues.map((val) => {
            const opt = options.find((o) => o.value === val);
            return (
              <span
                key={val}
                className="inline-flex items-center gap-1 ps-2 pe-1.5 py-0.5 rounded-lg text-xs bg-[#008080]/15 text-[#006666] dark:text-teal-200 border border-[#008080]/30 font-medium"
              >
                {opt?.label || val}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(val);
                  }}
                  className="hover:text-red-500 transition-colors"
                  aria-label={`حذف ${opt?.label || val}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      );
    }

    const selectedOption = options.find((o) => o.value === value);
    return (
      <span className="flex items-center gap-2 font-medium text-[var(--color-text)] truncate">
        {selectedOption?.icon}
        {selectedOption?.label || value}
      </span>
    );
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`flex flex-col gap-1.5 w-full relative ${containerClassName}`}
    >
      {label && (
        <label id={labelId} className="text-xs font-semibold text-[var(--color-text)]">
          {label}
        </label>
      )}

      {/* Select Trigger */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[42px] py-2 px-3.5 bg-[var(--color-surface)] border ${
          error
            ? "border-[#b84c4c] ring-1 ring-[#b84c4c]"
            : isOpen
            ? "border-[#008080] ring-3 ring-[#008080]/15"
            : "border-[var(--color-border)] hover:border-[#008080]/40"
        } rounded-[10px] text-xs sm:text-sm flex items-center justify-between gap-2 transition-all focus:outline-none focus-visible:ring-3 focus-visible:ring-[#008080]/20 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-start">{renderTriggerContent()}</div>
        <svg
          className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#008080]" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && <span className="text-xs font-medium text-[#b84c4c]">{error}</span>}

      {/* Dropdown Options List */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable={isMulti}
          className="absolute z-[1400] top-full start-0 end-0 mt-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] shadow-[0_4px_16px_rgba(0,0,0,.1)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {isSearchable && (
            <div className="p-2 border-b border-[var(--color-border)]">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در گزینه‌ها..."
                className="w-full px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-[var(--color-text-muted)]">
                گزینه‌ای یافت نشد
              </div>
            ) : hasGroups ? (
              Object.entries(groupedOptions).map(([groupName, groupOpts]) => (
                <div key={groupName} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold tracking-wider text-[var(--color-text-muted)] uppercase">
                    {groupName}
                  </div>
                  {groupOpts.map((opt) => {
                    const globalIdx = filteredOptions.findIndex((o) => o.value === opt.value);
                    return (
                      <OptionItem
                        key={opt.value}
                        option={opt}
                        isSelected={selectedValues.includes(opt.value)}
                        isHighlighted={highlightedIndex === globalIdx}
                        onSelect={() => handleSelect(opt.value)}
                        onHover={() => setHighlightedIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              ))
            ) : (
              filteredOptions.map((opt, idx) => (
                <OptionItem
                  key={opt.value}
                  option={opt}
                  isSelected={selectedValues.includes(opt.value)}
                  isHighlighted={highlightedIndex === idx}
                  onSelect={() => handleSelect(opt.value)}
                  onHover={() => setHighlightedIndex(idx)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const OptionItem: React.FC<{
  option: SelectOption;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}> = ({ option, isSelected, isHighlighted, onSelect, onHover }) => (
  <div
    role="option"
    aria-selected={isSelected}
    onClick={() => !option.disabled && onSelect()}
    onMouseEnter={onHover}
    className={`w-full px-3 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between text-start transition-colors select-none ${
      isSelected
        ? "bg-[#008080]/15 text-[#006666] dark:text-teal-200 font-bold"
        : isHighlighted
        ? "bg-[#e0f2f2]/70 dark:bg-teal-950/50 text-[#006666] dark:text-teal-200 font-medium"
        : "text-[var(--color-text)]"
    } ${option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span className="flex items-center gap-2">
      {option.icon}
      {option.label}
    </span>
    {isSelected && (
      <svg className="w-4 h-4 text-[#008080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
      </svg>
    )}
  </div>
);
