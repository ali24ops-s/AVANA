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
import { Input, Badge, Card, LoadingState, EmptyState } from "../ui/index.js";
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
    <div ref={containerRef} className="relative hidden md:block w-44 lg:w-60 xl:w-72 min-w-0">
      {/* Search Input Bar */}
      <Input
        value={rawQuery}
        onChange={(e) => {
          setRawQuery(e.target.value);
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
              className="p-1 hover:text-red-500 transition-colors"
              aria-label="پاک کردن جستجو"
            >
              <X className="w-4 h-4" />
            </button>
          ) : undefined
        }
      />

      {/* Floating Results Dropdown Modal */}
      {isOpen && isQueryActive && (
        <Card
          variant="glass"
          className="absolute top-full start-0 mt-2 w-72 md:w-80 max-w-[90vw] z-[1400] max-h-96 overflow-y-auto p-2 border-[var(--color-border)] shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {isSearchLoading ? (
            <LoadingState message="در حال جستجو..." className="py-6" />
          ) : isError ? (
            <EmptyState
              icon={<AlertCircle className="w-8 h-8 text-red-400" />}
              title="خطا در جستجو"
              description="خطا در برقراری ارتباط با سرور جستجو."
              className="py-6"
            />
          ) : !hasResults ? (
            <EmptyState
              title={`نتیجه‌ای برای «${rawQuery}» پیدا نشد`}
              description="لطفاً کلمه کلیدی دیگری را جستجو کنید."
              className="py-6"
            />
          ) : (
            <div className="space-y-3 divide-y divide-[var(--color-border)]">
              {/* Category 1: Courses (دوره‌ها) */}
              {courses.length > 0 && (
                <div className="pt-1">
                  <div className="px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#008080]">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      دوره‌ها
                    </span>
                    <Badge variant="primary" size="sm">
                      {courses.length}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {courses.map((course: SearchResultItem) => (
                      <button
                        key={`course-${course.id}`}
                        type="button"
                        onClick={() => handleSelectResult(course)}
                        className="w-full text-start px-3 py-2 rounded-xl flex items-center justify-between group hover:bg-[#008080]/10 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-col min-w-0 pe-2">
                          <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-[#008080] truncate">
                            {course.title}
                          </span>
                          {course.subtitle && (
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              {course.subtitle}
                            </span>
                          )}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[#008080] shrink-0 transition-transform group-hover:-translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category 2: Shared Content (محتواهای به‌اشتراک‌گذاشته‌شده) */}
              {sharedContent.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-1.5 flex items-center justify-between text-xs font-bold text-[#008080]">
                    <span className="flex items-center gap-1.5">
                      <LibraryIcon className="w-3.5 h-3.5" />
                      محتواهای به‌اشتراک‌گذاشته‌شده
                    </span>
                    <Badge variant="primary" size="sm">
                      {sharedContent.length}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {sharedContent.map((pack: SearchResultItem) => (
                      <button
                        key={`shared-${pack.id}`}
                        type="button"
                        onClick={() => handleSelectResult(pack)}
                        className="w-full text-start px-3 py-2 rounded-xl flex items-center justify-between group hover:bg-[#008080]/10 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-col min-w-0 pe-2">
                          <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-[#008080] truncate">
                            {pack.title}
                          </span>
                          {pack.subtitle && (
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              {pack.subtitle}
                            </span>
                          )}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[#008080] shrink-0 transition-transform group-hover:-translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
