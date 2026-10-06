import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  BookOpen,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { useSearch } from "../../hooks/useSearch.js";
import { Input, Badge, EmptyState } from "../ui/index.js";
import { toPersianDigits } from "@avana/domain";
import type { SearchResultItem } from "@avana/contracts";

export function HeaderSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Debounce input (300ms)
  useEffect(() => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setDebouncedQuery("");
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, 300);

    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Query Backend Search API
  const { data, isLoading, isFetching, isError } = useSearch(
    debouncedQuery,
    10,
  );

  // Close dropdown on outside click while preserving rawQuery
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Auto focus input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedIndex(-1);
    triggerRef.current?.focus();
  };

  const handleClear = () => {
    setRawQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleSelectResult = (item: SearchResultItem) => {
    setIsOpen(false);
    setRawQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
    if (item.target_url && !item.target_url.includes("packId=")) {
      navigate(item.target_url);
    } else {
      navigate(`/courses/${item.id}`);
    }
  };

  const isQueryActive = rawQuery.trim().length > 0;
  const isSearchLoading =
    !isError &&
    isQueryActive &&
    (isLoading ||
      isFetching ||
      (rawQuery.trim() !== debouncedQuery && debouncedQuery === ""));

  const courses = data?.grouped?.courses ?? [];
  const hasResults = courses.length > 0;
  const allResults = courses;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "ArrowDown") {
      if (allResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      if (allResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
      }
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && selectedIndex < allResults.length) {
        e.preventDefault();
        handleSelectResult(allResults[selectedIndex]);
      }
    }
  };

  const renderSearchResultsList = (onItemClick: (item: SearchResultItem) => void) => {
    if (isSearchLoading) {
      return (
        <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-[var(--color-text-muted)]">
          <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[#008080] rounded-full animate-spin" />
          <span className="text-xs font-medium">در حال جستجو...</span>
        </div>
      );
    }

    if (isError) {
      return (
        <EmptyState
          icon={<AlertCircle className="w-6 h-6 text-red-500" />}
          title="خطا در جستجو"
          description="خطا در برقراری ارتباط با سرور جستجو."
          className="py-6 px-4 border-none shadow-none bg-transparent"
        />
      );
    }

    if (!hasResults) {
      return (
        <EmptyState
          title={`نتیجه‌ای برای «${rawQuery}» پیدا نشد`}
          description="لطفاً کلمه کلیدی دیگری را جستجو کنید."
          className="py-6 px-4 border-none shadow-none bg-transparent"
        />
      );
    }

    return (
      <div className="space-y-3 divide-y divide-[var(--color-border)]">
        {/* Category 1: Courses (دوره‌ها) */}
        {courses.length > 0 && (
          <div className="pt-1 first:pt-0">
            <div className="px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#008080]">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#008080] shrink-0" />
                دوره‌ها
              </span>
              <Badge variant="primary" size="sm">
                {toPersianDigits(courses.length)}
              </Badge>
            </div>
            <div className="mt-1 space-y-0.5">
              {courses.map((course: SearchResultItem, idx: number) => {
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={`course-${course.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onItemClick(course)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-start px-3 py-2 rounded-xl flex items-center justify-between group transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--color-surface-warm)] text-[#008080]"
                        : "hover:bg-[var(--color-surface-warm)]"
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pe-2">
                      <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-[#008080] truncate transition-colors">
                        {course.title}
                      </span>
                      {course.subtitle && (
                        <span className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">
                          {course.subtitle}
                        </span>
                      )}
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[#008080] shrink-0 transition-transform group-hover:-translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative shrink-0" dir="rtl">
      {/* 1. Compact trigger button (Fixed 36x36px in header flow) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="w-9 h-9 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080] text-[var(--color-text-secondary)] hover:text-[#008080] flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008080]/30 shrink-0"
        aria-label="جستجو در سامانه"
        aria-expanded={isOpen}
        title="جستجو در سامانه"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* 2. Floating Dropdown Panel (Positioned out of header flow) */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="پنل جستجو"
          className="max-sm:fixed max-sm:inset-x-3 max-sm:top-18 max-sm:w-auto sm:absolute sm:top-full sm:end-0 sm:mt-2 sm:w-[320px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col p-2.5 transition-all animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        >
          {/* Search Input Box inside Dropdown */}
          <div className="relative w-full">
            <Input
              ref={inputRef}
              autoFocus
              value={rawQuery}
              onChange={(e) => {
                setRawQuery(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="جستجو در دوره‌ها و محتوا..."
              startIcon={<Search className="w-4 h-4 text-[#008080]" />}
              endIcon={
                rawQuery ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-[var(--color-text-muted)] hover:text-red-500 rounded-md hover:bg-[var(--color-surface-warm)] transition-colors focus:outline-none cursor-pointer"
                    aria-label="پاک کردن جستجو"
                    title="پاک کردن جستجو"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : undefined
              }
              containerClassName="w-full"
              className="!h-9 !py-0 rounded-xl bg-[var(--color-surface)] border-[var(--color-border)] focus:border-[#008080] text-xs sm:text-sm"
              autoComplete="off"
            />
          </div>

          {/* Results / Empty / Loading list */}
          {isQueryActive && (
            <div
              className="mt-2 pt-2 border-t border-[var(--color-border)] max-h-80 overflow-y-auto"
              role="listbox"
              aria-label="نتایج جستجو"
            >
              {renderSearchResultsList(handleSelectResult)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
