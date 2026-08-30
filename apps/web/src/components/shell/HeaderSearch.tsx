/**
 * HeaderSearch Component.
 *
 * Real-time debounced search for Avana Top Header.
 * Connects to GET /v1/search and displays user-accessible courses
 * and public shared content with categorical grouping, ranking,
 * and robust UX states (Loading, Empty, Error, Navigation).
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  BookOpen,
  Library as LibraryIcon,
  Loader2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import { useSearch } from "../../hooks/useSearch.js";
import type { SearchResultItem } from "@avana/contracts";

export function HeaderSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

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
  };

  const handleSelectResult = (item: SearchResultItem) => {
    setIsOpen(false);
    setRawQuery("");
    setDebouncedQuery("");
    if (item.target_url) {
      navigate(item.target_url);
    } else if (item.type === "course") {
      navigate(`/courses/${item.id}`);
    } else {
      navigate(`/library?packId=${item.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
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
  const sharedContent = data?.grouped?.shared_content ?? [];
  const hasResults = courses.length > 0 || sharedContent.length > 0;

  return (
    <div ref={containerRef} className="hidden lg:block relative" dir="rtl">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search
          className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={rawQuery}
          onChange={(e) => {
            setRawQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (rawQuery.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="جستجو در دوره‌ها و محتوا..."
          aria-label="جستجو در دوره‌ها و محتوا"
          className="w-40 xl:w-48 pl-8 pr-9 py-1.5 rounded-full border border-white/10 bg-white/5 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-slate-900/80 transition-all shadow-inner"
        />

        {/* Clear Button or Spinner */}
        {isSearchLoading ? (
          <Loader2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 animate-spin" />
        ) : isQueryActive ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="پاک کردن جستجو"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Results Dropdown / Popover */}
      {isOpen && isQueryActive && (
        <div className="absolute right-0 top-full mt-2 w-80 xl:w-96 rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-xl z-50 overflow-hidden text-right max-h-[28rem] flex flex-col animation-fade-in">
          {/* 1. Loading State */}
          {!isError && isSearchLoading && !data && (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              <p className="text-xs font-medium">در حال جستجو...</p>
            </div>
          )}

          {/* 2. Error State */}
          {isError && (
            <div className="p-4 flex items-center gap-3 text-red-400 bg-red-950/30 text-xs border-b border-red-500/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>خطا در برقراری ارتباط با سرور جستجو.</p>
            </div>
          )}

          {/* 3. Empty State */}
          {!isSearchLoading && !isError && debouncedQuery && !hasResults && (
            <div className="p-6 text-center text-slate-400">
              <p className="text-sm font-semibold text-slate-300">
                نتیجه‌ای برای «{debouncedQuery}» پیدا نشد
              </p>
              <p className="text-xs mt-1 text-slate-500">
                لطفاً کلمه کلیدی دیگری را جستجو کنید.
              </p>
            </div>
          )}

          {/* 4. Categorized Results */}
          {!isSearchLoading && hasResults && (
            <div className="overflow-y-auto divide-y divide-white/5 py-2">
              {/* Category 1: Courses (دوره‌ها) */}
              {courses.length > 0 && (
                <div className="py-2">
                  <div className="px-4 py-1.5 flex items-center justify-between text-[11px] font-bold text-teal-400">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      دوره‌ها
                    </span>
                    <span className="bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded-full text-[10px] border border-teal-500/20">
                      {courses.length}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 px-2">
                    {courses.map((course: SearchResultItem) => (
                      <button
                        key={`course-${course.id}`}
                        type="button"
                        onClick={() => handleSelectResult(course)}
                        className="w-full text-right px-3 py-2 rounded-xl flex items-center justify-between group hover:bg-teal-500/10 transition-colors"
                      >
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-teal-300 truncate">
                            {course.title}
                          </span>
                          {course.subtitle && (
                            <span className="text-[10px] text-slate-400 truncate">
                              {course.subtitle}
                            </span>
                          )}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:text-teal-400 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category 2: Shared Content (محتواهای به‌اشتراک‌گذاشته‌شده) */}
              {sharedContent.length > 0 && (
                <div className="py-2">
                  <div className="px-4 py-1.5 flex items-center justify-between text-[11px] font-bold text-teal-400">
                    <span className="flex items-center gap-1.5">
                      <LibraryIcon className="w-3.5 h-3.5" />
                      محتواهای به‌اشتراک‌گذاشته‌شده
                    </span>
                    <span className="bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded-full text-[10px] border border-teal-500/20">
                      {sharedContent.length}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 px-2">
                    {sharedContent.map((pack: SearchResultItem) => (
                      <button
                        key={`shared-${pack.id}`}
                        type="button"
                        onClick={() => handleSelectResult(pack)}
                        className="w-full text-right px-3 py-2 rounded-xl flex items-center justify-between group hover:bg-teal-500/10 transition-colors"
                      >
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-teal-300 truncate">
                            {pack.title}
                          </span>
                          {pack.subtitle && (
                            <span className="text-[10px] text-slate-400 truncate">
                              {pack.subtitle}
                            </span>
                          )}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:text-teal-400 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                      </button>
                    ))}
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
