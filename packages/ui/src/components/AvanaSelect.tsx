import React, { useState, useRef, useEffect, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

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
  searchPlaceholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isSearchable?: boolean;
  isMulti?: boolean;
  allowCustom?: boolean;
  customOptionLabel?: (query: string) => string;
  icon?: React.ReactNode;
  id?: string;
  name?: string;
  dataTestId?: string;
  className?: string;
  containerClassName?: string;
  size?: "sm" | "md" | "lg";
  placement?: "auto" | "bottom" | "top";
  usePortal?: boolean;
  clearable?: boolean;
  onClear?: () => void;
}

export const AvanaSelect: React.FC<AvanaSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "انتخاب کنید...",
  searchPlaceholder = "جستجو در گزینه‌ها...",
  label,
  error,
  disabled = false,
  isLoading = false,
  isSearchable = false,
  isMulti = false,
  allowCustom = false,
  customOptionLabel,
  icon,
  id,
  name,
  dataTestId,
  className = "",
  containerClassName = "",
  size = "md",
  placement = "auto",
  usePortal = false,
  clearable = false,
  onClear,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const labelId = useId();

  // Close dropdown on outside click (properly checking both container and portal menu)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const safeOptions = options || [];

  // Filter options based on search query
  const filteredOptions = safeOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opt.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const trimmedQuery = searchQuery.trim();
  const hasExactMatch = trimmedQuery
    ? safeOptions.some(
        (opt) =>
          opt.label.trim().toLowerCase() === trimmedQuery.toLowerCase() ||
          opt.value.trim().toLowerCase() === trimmedQuery.toLowerCase()
      )
    : true;

  const showCustomOption = Boolean(allowCustom && trimmedQuery && !hasExactMatch);
  const totalItemCount = filteredOptions.length + (showCustomOption ? 1 : 0);

  // Group options if group field present
  const groupedOptions = filteredOptions.reduce((acc, opt) => {
    const groupName = opt.group || "سایر";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(opt);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  const hasGroups = Object.keys(groupedOptions).length > 1 || safeOptions.some((o) => o.group);

  // Smart placement & coordinate calculations based on actual height and viewport bounds
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    // Trigger scrolled out of viewport bounds
    if (
      triggerRect.bottom < 0 ||
      triggerRect.top > window.innerHeight ||
      triggerRect.right < 0 ||
      triggerRect.left > window.innerWidth
    ) {
      if (usePortal) {
        setIsOpen(false);
        return;
      }
    }

    const viewportHeight = window.innerHeight;
    const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom);
    const spaceAbove = Math.max(0, triggerRect.top);

    // Calculate actual menu height if mounted, otherwise estimate accurately
    const menuEl = menuRef.current;
    const measuredHeight = menuEl ? menuEl.offsetHeight : 0;
    const estimatedItemsHeight = Math.min(260, Math.max(80, (filteredOptions.length || 1) * 40 + (isSearchable ? 52 : 12)));
    const actualMenuHeight = measuredHeight > 0 ? measuredHeight : estimatedItemsHeight;

    let shouldOpenUp = false;
    if (placement === "top") {
      shouldOpenUp = true;
    } else if (placement === "bottom") {
      shouldOpenUp = false;
    } else {
      // "auto": dynamically evaluate if actual menu height fits below vs above
      if (spaceBelow < actualMenuHeight && spaceAbove > spaceBelow) {
        shouldOpenUp = true;
      } else {
        shouldOpenUp = false;
      }
    }

    setOpenUpwards(shouldOpenUp);

    if (usePortal) {
      const maxAvailableHeight = shouldOpenUp ? spaceAbove - 16 : spaceBelow - 16;
      const computedMaxHeight = Math.max(120, Math.min(280, maxAvailableHeight));

      const topPos = shouldOpenUp
        ? triggerRect.top - 6
        : triggerRect.bottom + 6;

      setPortalCoords({
        top: topPos,
        left: triggerRect.left,
        width: triggerRect.width,
        maxHeight: computedMaxHeight,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, placement, usePortal, filteredOptions.length]);

  // Track scroll and resize events while open
  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;
    const onScrollOrResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updatePosition();
      });
    };

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [isOpen, usePortal, placement]);

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
        setHighlightedIndex((prev) => (prev < totalItemCount - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalItemCount - 1));
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
        } else if (highlightedIndex === filteredOptions.length && showCustomOption) {
          handleSelect(trimmedQuery);
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

  // Size variations honoring touch target ergonomics
  const sizeClasses = {
    sm: "min-h-[40px] sm:min-h-[34px] py-1.5 px-3 text-xs rounded-lg",
    md: "min-h-[44px] sm:min-h-[38px] py-2 px-3.5 text-xs sm:text-sm rounded-[10px]",
    lg: "min-h-[48px] sm:min-h-[44px] py-2.5 px-4 text-sm sm:text-base rounded-xl",
  }[size];

  const menuContent = (
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      aria-multiselectable={isMulti}
      style={
        usePortal && portalCoords
          ? {
              position: "fixed",
              top: portalCoords.top,
              left: portalCoords.left,
              width: portalCoords.width,
              transform: openUpwards ? "translateY(-100%)" : "none",
              zIndex: 9999,
            }
          : undefined
      }
      className={
        usePortal
          ? "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden font-sans animate-in fade-in duration-150"
          : `absolute z-[1400] ${
              openUpwards ? "bottom-full mb-1.5 slide-in-from-bottom-2" : "top-full mt-1.5 slide-in-from-top-2"
            } start-0 end-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] shadow-[0_4px_16px_rgba(0,0,0,.1)] overflow-hidden font-sans animate-in fade-in duration-150 max-w-[calc(100vw-2rem)]`
      }
    >
      {isSearchable && (
        <div className="p-2 border-b border-[var(--color-border)]">
          <div className="relative flex items-center">
            <svg
              className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder || "جستجو در گزینه‌ها..."}
              className="w-full ps-8 pe-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
            />
          </div>
        </div>
      )}

      <div
        style={usePortal && portalCoords ? { maxHeight: `${portalCoords.maxHeight}px` } : undefined}
        className="max-h-60 overflow-y-auto p-1.5 space-y-1"
      >
        {filteredOptions.length === 0 && !showCustomOption ? (
          <div className="p-3 text-center text-xs text-[var(--color-text-muted)]">
            گزینه‌ای یافت نشد
          </div>
        ) : hasGroups ? (
          Object.entries(groupedOptions).map(([groupName, groupOpts]) => (
            <div key={groupName} className="space-y-1">
              <div className="px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wider text-[var(--color-text-muted)] bg-[var(--color-surface-subtle,#f0f4f6)]/60 rounded-md uppercase">
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

        {showCustomOption && (
          <div className="pt-1 mt-1 border-t border-[var(--color-border)]">
            <OptionItem
              option={{
                value: trimmedQuery,
                label: customOptionLabel
                  ? customOptionLabel(trimmedQuery)
                  : `ثبت «${trimmedQuery}» به عنوان مقدار دلخواه`,
                icon: (
                  <svg className="w-3.5 h-3.5 text-[#008080] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                ),
              }}
              isSelected={selectedValues.includes(trimmedQuery)}
              isHighlighted={highlightedIndex === filteredOptions.length}
              onSelect={() => handleSelect(trimmedQuery)}
              onHover={() => setHighlightedIndex(filteredOptions.length)}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`flex flex-col gap-1.5 w-full relative font-sans ${containerClassName}`}
    >
      {label && (
        <label id={labelId} htmlFor={id} className="text-xs font-semibold text-[var(--color-text)]">
          {label}
        </label>
      )}

      {/* Select Trigger */}
      <button
        ref={triggerRef}
        id={id}
        name={name}
        data-testid={dataTestId}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${sizeClasses} bg-[var(--color-surface)] border ${
          error
            ? "border-[#b84c4c] ring-1 ring-[#b84c4c]"
            : isOpen
            ? "border-[#008080] ring-3 ring-[#008080]/15"
            : "border-[var(--color-border)] hover:border-[#008080]/40"
        } flex items-center justify-between gap-2 transition-all focus:outline-none focus-visible:ring-3 focus-visible:ring-[#008080]/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-start">
          {icon && <span className="shrink-0 text-[var(--color-text-muted)] flex items-center">{icon}</span>}
          {renderTriggerContent()}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {clearable && !disabled && !isLoading && selectedValues.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (isMulti) {
                  onChange?.([]);
                } else {
                  onChange?.("");
                }
                onClear?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  if (isMulti) {
                    onChange?.([]);
                  } else {
                    onChange?.("");
                  }
                  onClear?.();
                }
              }}
              aria-label="پاک کردن انتخاب"
              className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}

          <svg
            className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 shrink-0 ${
              isOpen ? (openUpwards ? "rotate-0 text-[#008080]" : "rotate-180 text-[#008080]") : (openUpwards ? "rotate-180" : "")
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {error && <span className="text-xs font-medium text-[#b84c4c]">{error}</span>}

      {/* Dropdown Options List: Either in-place or via portal */}
      {isOpen && (usePortal && typeof document !== "undefined" ? createPortal(menuContent, document.body) : menuContent)}
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
    className={`w-full px-3 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between text-start transition-colors select-none gap-2 min-h-[38px] ${
      isSelected
        ? "bg-[#008080]/15 text-[#006666] dark:text-teal-200 font-bold"
        : isHighlighted
        ? "bg-[#e0f2f2]/70 dark:bg-teal-950/50 text-[#006666] dark:text-teal-200 font-medium"
        : "text-[var(--color-text)] hover:bg-[var(--color-surface-subtle,#f4f7f8)]"
    } ${option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span className="flex items-center gap-2 min-w-0 flex-1 break-words leading-relaxed">
      {option.icon}
      <span>{option.label}</span>
    </span>
    {isSelected && (
      <svg className="w-4 h-4 text-[#008080] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
      </svg>
    )}
  </div>
);
