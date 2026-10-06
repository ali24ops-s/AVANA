import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  X,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Library as LibraryIcon,
  GraduationCap,
  Layers,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { useLibraryResources } from "../hooks/useLibrary.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
import { PaywallModal } from "../components/commerce/index.js";
import {
  Button,
  Input,
  AvanaSelect,
  Card,
  EmptyState,
  Skeleton,
} from "@avana/ui";
import {
  formatPersianOf,
  toPersianDigits,
} from "@avana/domain";
import type {
  LibraryCourseItem,
} from "../lib/api/library.js";

const PRESET_SUBJECTS = [
  { value: "all", label: "همه موضوعات" },
  { value: "داروسازی", label: "داروسازی" },
  { value: "فیزیولوژی", label: "فیزیولوژی" },
  { value: "فارماکولوژی", label: "فارماکولوژی" },
  { value: "شیمی دارویی", label: "شیمی دارویی" },
  { value: "فارماسیوتیکس", label: "فارماسیوتیکس" },
  { value: "سم شناسی", label: "سم‌شناسی" },
  { value: "بافت شناسی", label: "بافت‌شناسی" },
  { value: "بیولوژی", label: "بیولوژی" },
  { value: "میکروبیولوژی", label: "میکروبیولوژی" },
  { value: "گیاهان دارویی", label: "گیاهان دارویی" },
  { value: "انگل‌شناسی", label: "انگل‌شناسی" },
  { value: "آناتومی", label: "آناتومی" },
  { value: "بیوشیمی", label: "بیوشیمی" },
  { value: "پزشکی عمومی", label: "پزشکی عمومی" },
];

const ANIMATED_WORDS = ["همه‌چیز", "برای", "یادگیری", "کامل."];

function LoopingWordReveal() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (visibleCount < ANIMATED_WORDS.length) {
      timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, 350);
    } else {
      timer = setTimeout(() => {
        setVisibleCount(0);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [visibleCount]);

  return (
    <span
      className="inline-flex items-center gap-1.5 min-h-[1.75rem]"
      aria-label="همه‌چیز برای یادگیری کامل."
    >
      {ANIMATED_WORDS.map((word, index) => (
        <span
          key={index}
          className={`inline-block transition-all duration-300 ease-out transform ${
            index < visibleCount
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-1 scale-95 pointer-events-none"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Normalize/strip package URL parameters if entered directly
  useEffect(() => {
    if (searchParams.has("packId") || searchParams.has("packageId")) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("packId");
      newParams.delete("packageId");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedSort, setSelectedSort] = useState<"popular" | "newest">("popular");
  const [currentPage, setCurrentPage] = useState(1);

  // Paywall Modal State for Course purchase
  const [paywallResource, setPaywallResource] = useState<{
    title: string;
    type: "course" | "content" | "content_pack";
    options: Array<{
      type: "subscription" | "content_pack" | "course" | "content";
      productId: string;
      code: string;
      title: string;
      price: number;
      currency: string;
      durationDays: number | null;
    }>;
  } | null>(null);

  const handleBuyCourse = (course: LibraryCourseItem) => {
    const options: Array<{
      type: "subscription" | "content_pack" | "course" | "content";
      productId: string;
      code: string;
      title: string;
      price: number;
      currency: string;
      durationDays: number | null;
    }> = [];

    if (course.purchase && course.purchase.productId) {
      options.push({
        type: "course",
        productId: course.purchase.productId,
        code: course.purchase.code || `course-${course.id}`,
        title: course.title,
        price: course.purchase.price,
        currency: course.purchase.currency || "IRR",
        durationDays: null,
      });
    }

    setPaywallResource({
      title: course.title,
      type: "course",
      options,
    });
  };

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Query library courses
  const resourcesQuery = useLibraryResources({
    q: debouncedQuery || undefined,
    type: "courses",
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: 12,
  });

  const handleSubjectChange = (subjectVal: string | string[]) => {
    const val = Array.isArray(subjectVal) ? subjectVal[0] || "all" : subjectVal;
    setSelectedSubject(val);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: "popular" | "newest") => {
    setSelectedSort(sort);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setCurrentPage(1);
  };

  const courses = resourcesQuery.data?.courses ?? [];

  const pagination = {
    page: currentPage,
    limit: 12,
    total_count: resourcesQuery.data?.pagination?.total_courses ?? courses.length,
    total_pages:
      Math.ceil(
        (resourcesQuery.data?.pagination?.total_courses ?? courses.length) / 12,
      ) || 1,
  };

  const isSearchActive = Boolean(debouncedQuery) || selectedSubject !== "all";
  const isLoading = resourcesQuery.isLoading;
  const isError = resourcesQuery.isError;

  return (
    <div className="space-y-8 pb-16 w-full" dir="rtl">
      {/* 1. Hero Header Banner */}
      <Card
        variant="solid"
        className="relative overflow-hidden p-6 sm:p-8 bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface-warm)]/70 to-[var(--color-surface)] border border-[var(--color-border)] rounded-[20px] shadow-card group"
      >
        {/* Top Highlight Accent Line */}
        <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-primary/80 to-transparent" />

        {/* Ambient Glow Orbs */}
        <div className="absolute -top-16 -start-16 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none transition-all duration-700 group-hover:bg-primary/15" />
        <div className="absolute -bottom-16 -end-16 w-80 h-80 rounded-full bg-[#38bdf8]/10 dark:bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

        {/* Subtle Geometric / Dot Pattern Overlay */}
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(var(--color-primary, #008080) 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
            maskImage: "radial-gradient(ellipse 85% 70% at 50% 50%, black 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 70% at 50% 50%, black 40%, transparent 100%)",
          }}
        />

        {/* Decorative Background Knowledge Wave Lines */}
        <svg
          className="absolute start-0 bottom-0 w-full h-24 opacity-[0.04] dark:opacity-[0.08] pointer-events-none text-primary"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0,0 C150,90 350,-40 500,45 C650,130 900,10 1200,50 L1200,120 L0,120 Z"
            fill="currentColor"
          />
        </svg>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Right: Primary Hero Content */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[var(--color-text)] leading-tight text-center lg:text-right">
              کتابخانه آوانا
            </h1>

            <div className="space-y-1.5 max-w-2xl">
              <p className="text-base sm:text-lg text-[var(--color-text-muted)] font-medium leading-relaxed">
                دوره‌ها و درسنامه‌های دانشگاهی، یکجا برای یادگیری؛
              </p>
              <div className="text-lg sm:text-xl font-bold text-primary dark:text-teal-400 flex items-center gap-2">
                <LoopingWordReveal />
              </div>
            </div>
          </div>

          {/* Left: Dedicated Educational Library Visual Composition */}
          <div className="lg:col-span-5 relative flex items-center justify-center lg:justify-end py-2 lg:py-0">
            {/* Layered Cards Stack */}
            <div className="relative w-full max-w-sm select-none pointer-events-none space-y-0">
              {/* 1. Base Layer: Curated Course Module (درسنامه جامع) */}
              <div className="relative z-10 bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-[14px] p-3.5 shadow-subtle space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-[8px] bg-[#e0f2f2] dark:bg-teal-950/60 border border-[#b3d9d9] dark:border-teal-800/60 flex items-center justify-center text-[#006666] dark:text-teal-300 shrink-0">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[var(--color-text)] block truncate">
                        درسنامه‌های تخصصی
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] block truncate">
                        سرفصل‌های تاییدشده دانشگاهی
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e0f2f2] text-[#006666] dark:bg-teal-950/70 dark:text-teal-200 border border-[#b3d9d9] dark:border-teal-800">
                    درسنامه
                  </span>
                </div>

                {/* Subtle structured lines preview */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="h-1.5 rounded-[4px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]/50 w-5/6" />
                  <div className="h-1.5 rounded-[4px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]/50 w-2/3" />
                </div>
              </div>

              {/* 2. Middle Layer: Spaced Repetition (فلش‌کارت مرور) */}
              <div className="relative z-20 -mt-2 ms-4 sm:ms-6 bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[var(--color-border)] rounded-[14px] p-3 shadow-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-[8px] bg-[#fdf2e4] dark:bg-amber-950/50 border border-[#e8c18a] dark:border-amber-800/60 flex items-center justify-center text-[#8f5e27] dark:text-amber-300 shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--color-text)] block truncate">
                      مرور فعال با فلش‌کارت
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] block truncate">
                      تثبیت هوشمند با الگوریتم SRS
                    </span>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fdf2e4] text-[#8f5e27] dark:bg-amber-950/70 dark:text-amber-200 border border-[#e8c18a] dark:border-amber-800">
                  فلش‌کارت
                </span>
              </div>

              {/* 3. Fore Layer: Assessment (آزمون خودارزیابی) */}
              <div className="relative z-30 -mt-2 me-4 sm:me-6 bg-[var(--color-surface)]/90 backdrop-blur-sm border border-[#a7d0e6] dark:border-sky-800/60 rounded-[14px] p-3 shadow-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-[8px] bg-[#e8f4fb] dark:bg-sky-950/50 border border-[#a7d0e6] dark:border-sky-800/60 flex items-center justify-center text-[#2b6d8f] dark:text-sky-300 shrink-0">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--color-text)] block truncate">
                      آزمون‌های خودارزیابی
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] block truncate">
                      پرسش‌های استاندارد ۴گزینه‌ای
                    </span>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f4fb] text-[#2b6d8f] dark:bg-sky-950/70 dark:text-sky-200 border border-[#a7d0e6] dark:border-sky-800">
                  آزمون
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Search, Filter & Sort Toolbar */}
      <div className="space-y-4 pt-2">
        {/* Search Box, AvanaSelect Subject Filter & Sort Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Box */}
          <div className="md:col-span-6">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو در عنوان دوره‌ها، درسنامه‌ها یا موضوع..."
              startIcon={<Search className="w-4 h-4" />}
              endIcon={
                searchInput ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="p-1 hover:text-red-500 transition-colors"
                    aria-label="پاک کردن جستجو"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : undefined
              }
            />
          </div>

          {/* Canonical AvanaSelect for Subject Filtering */}
          <div className="md:col-span-3">
            <AvanaSelect
              options={PRESET_SUBJECTS}
              value={selectedSubject}
              onChange={handleSubjectChange}
              placeholder="فیلتر موضوعی..."
              isSearchable
            />
          </div>

          {/* Sort Switcher (محبوب‌ترین / جدیدترین) */}
          <div className="md:col-span-3 flex items-center justify-end gap-1.5 p-1 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)]">
            <Button
              size="sm"
              variant={selectedSort === "popular" ? "primary" : "ghost"}
              onClick={() => handleSortChange("popular")}
              leftIcon={<TrendingUp className="w-3.5 h-3.5" />}
              className="flex-1 rounded-[8px]"
            >
              محبوب‌ترین
            </Button>

            <Button
              size="sm"
              variant={selectedSort === "newest" ? "primary" : "ghost"}
              onClick={() => handleSortChange("newest")}
              leftIcon={<Clock className="w-3.5 h-3.5" />}
              className="flex-1 rounded-[8px]"
            >
              جدیدترین
            </Button>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {PRESET_SUBJECTS.map((sub) => {
            const isSelected = selectedSubject === sub.value;
            return (
              <button
                key={sub.value}
                type="button"
                onClick={() => handleSubjectChange(sub.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
                }`}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Content Sections */}
      <div className="space-y-10 pt-2">
        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <EmptyState
            icon={<AlertCircle className="w-10 h-10 text-red-400" />}
            title="خطا در دریافت دوره‌های کتابخانه"
            description="ارتباط با سرور برقرار نشد. لطفا مجدداً تلاش کنید."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  void resourcesQuery.refetch();
                }}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                تلاش مجدد
              </Button>
            }
          />
        )}

        {/* Empty Result State */}
        {!isLoading && !isError && courses.length === 0 && (
          <EmptyState
            icon={<LibraryIcon className="w-10 h-10 text-[var(--color-text-muted)]" />}
            title="هیچ دوره‌ای یافت نشد"
            description={
              isSearchActive
                ? "با فیلترها و عبارت جستجوی فعلی، دوره‌ای در کتابخانه پیدا نشد."
                : "هنوز دوره‌ای در این بخش وجود ندارد."
            }
            action={
              isSearchActive ? (
                <Button variant="outline" onClick={handleClearSearch}>
                  پاک کردن فیلترها
                </Button>
              ) : undefined
            }
          />
        )}

        {/* Courses Grid */}
        {!isLoading && !isError && courses.length > 0 && (
          <div className="space-y-4" data-testid="library-courses-section">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-h2 text-[var(--color-text)] flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span>دوره‌های آموزشی</span>
              </h2>
              <span className="text-xs text-[var(--color-text-muted)] font-medium">
                {toPersianDigits(courses.length)} دوره موجود
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course: LibraryCourseItem) => (
                <CourseLibraryCard
                  key={course.id}
                  course={course}
                  onBuy={() => handleBuyCourse(course)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 4. Pagination */}
        {!isLoading && !isError && pagination.total_pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6 border-t border-[var(--color-border)]">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronRight className="w-4 h-4" />}
            >
              صفحه قبل
            </Button>
            <span className="text-xs font-bold text-[var(--color-text-muted)] px-3">
              {formatPersianOf(currentPage, pagination.total_pages, { prefix: "صفحه" })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= pagination.total_pages}
              onClick={() => setCurrentPage((p) => Math.min(pagination.total_pages, p + 1))}
              rightIcon={<ChevronLeft className="w-4 h-4" />}
            >
              صفحه بعد
            </Button>
          </div>
        )}
      </div>

      {/* Paywall Modal */}
      {paywallResource && (
        <PaywallModal
          isOpen={Boolean(paywallResource)}
          onClose={() => setPaywallResource(null)}
          resourceTitle={paywallResource.title}
          resourceType={paywallResource.type}
          availablePurchaseOptions={paywallResource.options}
        />
      )}
    </div>
  );
}
