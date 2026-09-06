import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  X,
  Filter,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Library as LibraryIcon,
  GraduationCap,
  FileText,
  Layers,
} from "lucide-react";
import { useLibraryResources, useCoursePackages } from "../hooks/useLibrary.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
import { ContentLibraryCard } from "../components/library/ContentLibraryCard.js";
import { ChapterPackageCard } from "../components/library/ChapterPackageCard.js";
import { ChapterPackageModal } from "../components/library/ChapterPackageModal.js";
import { PaywallModal } from "../components/commerce/index.js";
import type {
  ChapterPackageItem,
  CourseWithChapterPackages,
} from "@avana/domain";
import type {
  LibraryCourseItem,
  LibraryContentItem,
} from "../lib/api/library.js";

type LibraryTab = "all" | "courses" | "contents" | "packs";

const PRESET_SUBJECTS = [
  { id: "all", label: "همه موضوعات" },
  { id: "داروسازی", label: "داروسازی" },
  { id: "فیزیولوژی", label: "فیزیولوژی" },
  { id: "فارماکولوژی", label: "فارماکولوژی" },
  { id: "شیمی دارویی", label: "شیمی دارویی" },
  { id: "فارماسیوتیکس", label: "فارماسیوتیکس" },
  { id: "سم شناسی", label: "سم‌شناسی" },
  { id: "بافت شناسی", label: "بافت‌شناسی" },
  { id: "بیولوژی", label: "بیولوژی" },
  { id: "میکروبیولوژی", label: "میکروبیولوژی" },
  { id: "گیاهان دارویی", label: "گیاهان دارویی" },
  { id: "انگل‌شناسی", label: "انگل‌شناسی" },
  { id: "آناتومی", label: "آناتومی" },
  { id: "بیوشیمی", label: "بیوشیمی" },
  { id: "پزشکی عمومی", label: "پزشکی عمومی" },
];

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const urlPackId = searchParams.get("packId") || searchParams.get("packageId");

  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedSort, setSelectedSort] = useState<"popular" | "newest">("popular");
  const [currentPage, setCurrentPage] = useState(1);

  // Selected Educational Chapter Package for Preview Modal
  const [selectedChapterPackage, setSelectedChapterPackage] =
    useState<ChapterPackageItem | null>(null);
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);

  // Paywall Modal State for Course / Content / Package purchase
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

  const handleBuyContent = (content: LibraryContentItem) => {
    const options: Array<{
      type: "subscription" | "content_pack" | "course" | "content";
      productId: string;
      code: string;
      title: string;
      price: number;
      currency: string;
      durationDays: number | null;
    }> = [];

    if (content.purchase && content.purchase.productId) {
      options.push({
        type: "content",
        productId: content.purchase.productId,
        code: content.purchase.code || `content-${content.id}`,
        title: content.title,
        price: content.purchase.price,
        currency: content.purchase.currency || "IRR",
        durationDays: null,
      });
    }

    setPaywallResource({
      title: content.title,
      type: "content",
      options,
    });
  };

  const handleBuyPackage = (pkg: ChapterPackageItem) => {
    const options: Array<{
      type: "subscription" | "content_pack" | "course" | "content";
      productId: string;
      code: string;
      title: string;
      price: number;
      currency: string;
      durationDays: number | null;
    }> = [];

    if (pkg.purchase && pkg.purchase.productId) {
      options.push({
        type: "content_pack",
        productId: pkg.purchase.productId,
        code: pkg.purchase.code || `pack-${pkg.id}`,
        title: pkg.title,
        price: pkg.purchase.price,
        currency: pkg.purchase.currency || "IRR",
        durationDays: null,
      });
    } else if (pkg.purchase && pkg.purchase.price > 0) {
      options.push({
        type: "content_pack",
        productId: `pack-${pkg.id}`,
        code: `pack-${pkg.id}`,
        title: pkg.title,
        price: pkg.purchase.price,
        currency: pkg.purchase.currency || "IRR",
        durationDays: null,
      });
    }

    setPaywallResource({
      title: `بسته آموزشی: ${pkg.title}`,
      type: "content_pack",
      options,
    });
  };

  const handleViewPackage = (pkg: ChapterPackageItem) => {
    setSelectedChapterPackage(pkg);
    setIsChapterModalOpen(true);
  };

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 1. Query library courses & contents (GET /v1/library/resources)
  const resourcesQuery = useLibraryResources({
    q: debouncedQuery || undefined,
    type:
      activeTab === "all"
        ? "all"
        : activeTab === "courses"
          ? "courses"
          : activeTab === "contents"
            ? "contents"
            : undefined,
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: 12,
  });

  // 2. Query Course Chapter Educational Packages (GET /v1/library/course-packages)
  const coursePackagesQuery = useCoursePackages({
    q: debouncedQuery || undefined,
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: 12,
  });

  // Auto-open detail if urlPackId is provided
  useEffect(() => {
    if (urlPackId && coursePackagesQuery.data?.courses) {
      for (const course of coursePackagesQuery.data.courses) {
        const found = course.packages.find(
          (p) =>
            p.id === urlPackId ||
            p.moduleId === urlPackId ||
            p.contentPackId === urlPackId,
        );
        if (found) {
          setSelectedChapterPackage(found);
          setIsChapterModalOpen(true);
          break;
        }
      }
    }
  }, [urlPackId, coursePackagesQuery.data?.courses]);

  const handleTabChange = (tab: LibraryTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubject(subjectId);
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
  const contents = resourcesQuery.data?.contents ?? [];
  const coursePackages = coursePackagesQuery.data?.courses ?? [];
  const totalChapterPackages = coursePackages.reduce(
    (sum, c) => sum + (c.packages?.length || 0),
    0,
  );

  const pagination =
    activeTab === "packs"
      ? {
          page: currentPage,
          limit: 12,
          total_count:
            coursePackagesQuery.data?.pagination?.total_courses ??
            coursePackages.length,
          total_pages:
            Math.ceil(
              (coursePackagesQuery.data?.pagination?.total_courses ??
                coursePackages.length) / 12,
            ) || 1,
        }
      : {
          page: currentPage,
          limit: 12,
          total_count:
            activeTab === "courses"
              ? (resourcesQuery.data?.pagination?.total_courses ?? 0)
              : activeTab === "contents"
                ? (resourcesQuery.data?.pagination?.total_contents ?? 0)
                : ((resourcesQuery.data?.pagination?.total_courses ?? 0) +
                  (resourcesQuery.data?.pagination?.total_contents ?? 0)),
          total_pages:
            Math.ceil(
              (activeTab === "courses"
                ? (resourcesQuery.data?.pagination?.total_courses ?? 0)
                : activeTab === "contents"
                  ? (resourcesQuery.data?.pagination?.total_contents ?? 0)
                  : Math.max(
                      resourcesQuery.data?.pagination?.total_courses ?? 0,
                      resourcesQuery.data?.pagination?.total_contents ?? 0,
                    )) / 12,
            ) || 1,
        };

  const isSearchActive = Boolean(debouncedQuery) || selectedSubject !== "all";
  const isLoading =
    activeTab === "packs"
      ? coursePackagesQuery.isLoading
      : activeTab === "all"
        ? resourcesQuery.isLoading || coursePackagesQuery.isLoading
        : resourcesQuery.isLoading;

  const isError =
    activeTab === "packs"
      ? coursePackagesQuery.isError
      : activeTab === "all"
        ? resourcesQuery.isError && coursePackagesQuery.isError
        : resourcesQuery.isError;

  const totalItemsInView =
    activeTab === "all"
      ? courses.length + contents.length + totalChapterPackages
      : activeTab === "courses"
        ? courses.length
        : activeTab === "contents"
          ? contents.length
          : totalChapterPackages;

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4" dir="rtl">
      {/* 1. Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-teal-950/60 via-slate-900/80 to-slate-900 border border-teal-500/20 p-6 sm:p-10 shadow-ambient">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 text-xs font-bold">
            <LibraryIcon className="w-3.5 h-3.5" />
            <span>کتابخانه جامع یادگیری و محتوای آموزشی آوانا</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            کتابخانه آوانا
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            مطالب آموزشی، دوره‌های معتبر و درسنامه‌های دانشگاهی را مرور و مطالعه کن، یا بسته‌های آموزشی آماده هر فصل را برای یادگیری کامل باز کن.
          </p>
        </div>

        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* 2. Search, Tabs, Filter & Sort Toolbar */}
      <div className="space-y-4 pt-2">
        {/* Resource Category Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto scrollbar-none">
          <button
            type="button"
            data-testid="tab-all"
            onClick={() => handleTabChange("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === "all"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <LibraryIcon className="w-4 h-4" />
            <span>همه</span>
          </button>

          <button
            type="button"
            data-testid="tab-courses"
            onClick={() => handleTabChange("courses")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === "courses"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>دوره‌ها</span>
          </button>

          <button
            type="button"
            data-testid="tab-contents"
            onClick={() => handleTabChange("contents")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === "contents"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>محتواها و درسنامه‌ها</span>
          </button>

          <button
            type="button"
            data-testid="tab-packs"
            onClick={() => handleTabChange("packs")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === "packs"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-900/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>بسته‌های آموزشی آماده</span>
          </button>
        </div>

        {/* Search Box & Sort Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو در عنوان دوره‌ها، درسنامه‌ها، سرفصل‌ها یا موضوع..."
              className="w-full pl-10 pr-10 py-3 rounded-2xl border border-white/10 bg-slate-900/80 text-slate-200 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-full hover:bg-white/10"
                aria-label="پاک کردن جستجو"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Switcher (محبوب‌ترین / جدیدترین) */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-white/10 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => handleSortChange("popular")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedSort === "popular"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-900/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>محبوب‌ترین</span>
            </button>

            <button
              type="button"
              onClick={() => handleSortChange("newest")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedSort === "newest"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-900/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>جدیدترین</span>
            </button>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          {PRESET_SUBJECTS.map((sub) => {
            const isSelected = selectedSubject === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSubjectChange(sub.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? "bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm"
                    : "bg-white/[0.03] text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200"
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
              <div
                key={i}
                className="h-64 rounded-2xl bg-slate-900/40 border border-white/5 p-5 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-24 bg-white/10 rounded-full" />
                    <div className="h-4 w-16 bg-white/5 rounded-full" />
                  </div>
                  <div className="h-6 w-3/4 bg-white/10 rounded-xl" />
                  <div className="h-4 w-full bg-white/5 rounded" />
                </div>
                <div className="h-10 bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="p-8 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center space-y-4 max-w-lg mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-base font-bold text-white">
              خطا در دریافت منابع کتابخانه
            </h3>
            <p className="text-xs text-slate-400">
              {resourcesQuery.error?.message ||
                coursePackagesQuery.error?.message ||
                "امکان برقراری ارتباط با سرور وجود ندارد."}
            </p>
            <button
              type="button"
              onClick={() => {
                void resourcesQuery.refetch();
                void coursePackagesQuery.refetch();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && totalItemsInView === 0 && (
          <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-white/10 space-y-4 max-w-md mx-auto shadow-ambient">
            <LibraryIcon className="w-12 h-12 text-teal-400/60 mx-auto" />
            {isSearchActive ? (
              <>
                <h3 className="text-base font-bold text-white">
                  محتوایی با این عبارت پیدا نشد.
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  عبارت دیگری را جستجو کن یا فیلترهای موضوعی را تغییر بده.
                </p>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
                >
                  پاک کردن جستجو و فیلترها
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-white">
                  هنوز محتوایی در این بخش وجود ندارد.
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  به زودی دوره‌ها و بسته‌های آموزشی دانشگاهی در این بخش قرار می‌گیرد.
                </p>
              </>
            )}
          </div>
        )}

        {/* --- SECTION: COURSES --- */}
        {!isLoading &&
          !isError &&
          (activeTab === "all" || activeTab === "courses") &&
          courses.length > 0 && (
            <section className="space-y-4" data-testid="library-courses-section">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-teal-400" />
                  <span>دوره‌ها</span>
                </h2>
                {activeTab === "all" && courses.length > 6 && (
                  <button
                    type="button"
                    onClick={() => handleTabChange("courses")}
                    className="text-teal-400 text-xs font-bold hover:underline flex items-center gap-1"
                  >
                    <span>مشاهده همه دوره‌ها</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map((course) => (
                  <CourseLibraryCard
                    key={course.id}
                    course={course}
                    onBuy={handleBuyCourse}
                  />
                ))}
              </div>
            </section>
          )}

        {/* --- SECTION: CONTENTS --- */}
        {!isLoading &&
          !isError &&
          (activeTab === "all" || activeTab === "contents") &&
          contents.length > 0 && (
            <section className="space-y-4" data-testid="library-contents-section">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  <span>محتواها و درسنامه‌ها</span>
                </h2>
                {activeTab === "all" && contents.length > 6 && (
                  <button
                    type="button"
                    onClick={() => handleTabChange("contents")}
                    className="text-cyan-400 text-xs font-bold hover:underline flex items-center gap-1"
                  >
                    <span>مشاهده همه محتواها</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {contents.map((content) => (
                  <ContentLibraryCard
                    key={content.id}
                    content={content}
                    onBuy={handleBuyContent}
                  />
                ))}
              </div>
            </section>
          )}

        {/* --- SECTION: EDUCATIONAL CHAPTER PACKAGES (بسته‌های آموزشی آماده) --- */}
        {!isLoading &&
          !isError &&
          (activeTab === "all" || activeTab === "packs") &&
          coursePackages.length > 0 && (
            <section
              className="space-y-8"
              data-testid="public-content-packs-section"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-400" />
                    <span>بسته‌های آموزشی آماده بر اساس فصول دوره‌ها</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    هر فصل یک بسته آموزشی کامل شامل ۴ محتوای مستقل (درسنامه، خلاصه، فلش‌کارت و آزمون) است.
                  </p>
                </div>

                {activeTab === "all" && totalChapterPackages > 6 && (
                  <button
                    type="button"
                    onClick={() => handleTabChange("packs")}
                    className="text-teal-400 text-xs font-bold hover:underline flex items-center gap-1"
                  >
                    <span>مشاهده همه بسته‌ها</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Course Groups & Chapters */}
              <div className="space-y-8">
                {coursePackages.map((course: CourseWithChapterPackages) => (
                  <div
                    key={course.id}
                    data-testid={`course-package-group-${course.id}`}
                    className="rounded-3xl bg-slate-900/40 border border-white/10 p-5 sm:p-7 space-y-5"
                  >
                    {/* Course Group Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-5 h-5 text-teal-400 shrink-0" />
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            {course.title}
                          </h3>
                          {course.subject && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                              {course.subject}
                            </span>
                          )}
                        </div>
                        {course.description && (
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {course.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        <span className="text-xs font-medium text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                          {course.packages.length} فصل دارای بسته آموزشی
                        </span>
                      </div>
                    </div>

                    {/* Chapter Packages Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {course.packages.map((pkg) => (
                        <ChapterPackageCard
                          key={pkg.id}
                          packageItem={pkg}
                          onView={handleViewPackage}
                          onBuy={handleBuyPackage}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* Pagination Bar */}
        {!isLoading && !isError && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-6 border-t border-white/10">
            <div className="text-xs text-slate-400">
              نمایش صفحه {pagination.page} از {pagination.total_pages} (مجموع{" "}
              {pagination.total_count} مورد)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={
                  currentPage <= 1 ||
                  resourcesQuery.isFetching ||
                  coursePackagesQuery.isFetching
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                <span>صفحه قبل</span>
              </button>

              <span className="px-3 py-1 text-xs font-bold text-teal-400 bg-teal-500/10 border border-teal-500/30 rounded-xl">
                {currentPage}
              </span>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(pagination.total_pages, p + 1))
                }
                disabled={
                  currentPage >= pagination.total_pages ||
                  resourcesQuery.isFetching ||
                  coursePackagesQuery.isFetching
                }
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <span>صفحه بعد</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Chapter Package Detail Preview Modal */}
      <ChapterPackageModal
        packageItem={selectedChapterPackage}
        open={isChapterModalOpen}
        onClose={() => {
          setIsChapterModalOpen(false);
          setSelectedChapterPackage(null);
        }}
        onBuy={(pkg) => {
          setIsChapterModalOpen(false);
          handleBuyPackage(pkg);
        }}
      />

      {/* 5. Commerce Paywall Modal */}
      <PaywallModal
        isOpen={Boolean(paywallResource)}
        onClose={() => setPaywallResource(null)}
        resourceTitle={paywallResource?.title}
        resourceType={paywallResource?.type}
        availablePurchaseOptions={paywallResource?.options ?? []}
      />
    </div>
  );
}

