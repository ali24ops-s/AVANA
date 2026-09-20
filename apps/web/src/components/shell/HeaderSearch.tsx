import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  BookOpen,
  Library as LibraryIcon,
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

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClear = () => {
    setRawQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleSelectResult = (item: SearchResultItem) => {
    setIsOpen(false);
    setRawQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
    if (item.target_url) {
      navigate(item.target_url);
    } else if (item.type === "course") {
      navigate(`/courses/${item.id}`);
    } else {
      navigate(`/library?packId=${item.id}`);
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
  const sharedContent =
    data?.grouped?.educational_packs ?? data?.grouped?.shared_content ?? [];
  const hasResults = courses.length > 0 || sharedContent.length > 0;
  const allResults = [...courses, ...sharedContent];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSelectedIndex(-1);
    } else if (e.key === "ArrowDown") {
      if (!isOpen && isQueryActive) {
        setIsOpen(true);
      } else if (allResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      if (allResults.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
      }
    } else if (e.key === "Enter") {
      if (isOpen && selectedIndex >= 0 && selectedIndex < allResults.length) {
        e.preventDefault();
        handleSelectResult(allResults[selectedIndex]);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative hidden md:block w-44 lg:w-60 xl:w-72 min-w-0" dir="rtl">
      {/* Search Input Bar */}
      <Input
        value={rawQuery}
        onChange={(e) => {
          setRawQuery(e.target.value);
          setSelectedIndex(-1);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (rawQuery.trim().length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="جستجو در دوره‌ها و محتوا..."
        startIcon={<Search className="w-4 h-4" />}
        endIcon={
          rawQuery ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-[var(--color-text-muted)] hover:text-red-500 rounded-md hover:bg-[var(--color-surface-warm)] transition-colors focus:outline-none"
              aria-label="پاک کردن جستجو"
            >
              <X className="w-4 h-4" />
            </button>
          ) : undefined
        }
      />

      {/* Floating Results Dropdown Modal */}
      {isOpen && isQueryActive && (
        <div
          role="listbox"
          aria-label="نتایج جستجو"
          className="absolute top-full start-0 mt-2 w-72 md:w-80 lg:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col p-2 animate-in fade-in zoom-in-95 duration-150"
        >
          {isSearchLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2.5 text-[var(--color-text-muted)]">
              <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[#008080] rounded-full animate-spin" />
              <span className="text-xs font-medium">در حال جستجو...</span>
            </div>
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle className="w-6 h-6 text-red-500" />}
              title="خطا در جستجو"
              description="خطا در برقراری ارتباط با سرور جستجو."
              className="py-6 px-4 border-none shadow-none bg-transparent"
            />
          ) : !hasResults ? (
            <EmptyState
              title={`نتیجه‌ای برای «${rawQuery}» پیدا نشد`}
              description="لطفاً کلمه کلیدی دیگری را جستجو کنید."
              className="py-6 px-4 border-none shadow-none bg-transparent"
            />
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-3 divide-y divide-[var(--color-border)]">
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
                          onClick={() => handleSelectResult(course)}
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

              {/* Category 2: Educational Packs (بسته‌های آموزشی) */}
              {sharedContent.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#008080]">
                    <span className="flex items-center gap-1.5">
                      <LibraryIcon className="w-3.5 h-3.5 text-[#008080] shrink-0" />
                      بسته‌های آموزشی
                    </span>
                    <Badge variant="primary" size="sm">
                      {toPersianDigits(sharedContent.length)}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {sharedContent.map((pack: SearchResultItem, idx: number) => {
                      const globalIdx = courses.length + idx;
                      const isSelected = selectedIndex === globalIdx;
                      return (
                        <button
                          key={`shared-${pack.id}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelectResult(pack)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={`w-full text-start px-3 py-2 rounded-xl flex items-center justify-between group transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[var(--color-surface-warm)] text-[#008080]"
                              : "hover:bg-[var(--color-surface-warm)]"
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pe-2">
                            <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-[#008080] truncate transition-colors">
                              {pack.title}
                            </span>
                            {pack.subtitle && (
                              <span className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">
                                {pack.subtitle}
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
          )}
        </div>
      )}
    </div>
  );
}

