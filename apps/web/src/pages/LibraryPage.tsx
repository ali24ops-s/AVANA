import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  Sparkles,
} from "lucide-react";
import { useLibraryResources, useCoursePackages } from "../hooks/useLibrary.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
import { SpecialExamLibraryCard } from "../components/library/SpecialExamLibraryCard.js";
import { ChapterPackageCard } from "../components/library/ChapterPackageCard.js";
import { ChapterPackageModal } from "../components/library/ChapterPackageModal.js";
import { PaywallModal } from "../components/commerce/index.js";
import {
  Button,
  Input,
  AvanaSelect,
  Badge,
  Card,
  EmptyState,
  Skeleton,
} from "@avana/ui";
import type {
  ChapterPackageItem,
  CourseWithChapterPackages,
} from "@avana/domain";
import { formatPersianOf } from "@avana/domain";
import type {
  LibraryCourseItem,
  LibrarySpecialExamItem,
} from "../lib/api/library.js";

type LibraryTab = "all" | "courses" | "special_exams" | "packs";

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

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlPackId = searchParams.get("packId") || searchParams.get("packageId");

  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedSort, setSelectedSort] = useState<"popular" | "newest">("popular");
  const [currentPage, setCurrentPage] = useState(1);

  // Selected Educational Chapter Package or Course for Preview Modal
  const [selectedChapterPackage, setSelectedChapterPackage] =
    useState<ChapterPackageItem | null>(null);
  const [selectedCourseForPreview, setSelectedCourseForPreview] =
    useState<LibraryCourseItem | null>(null);
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
    }

    setPaywallResource({
      title: pkg.title,
      type: "content_pack",
      options,
    });
  };

  const handleViewPackage = (pkg: ChapterPackageItem) => {
    setSelectedCourseForPreview(null);
    setSelectedChapterPackage(pkg);
    setIsChapterModalOpen(true);
  };

  const handleViewCourse = (course: LibraryCourseItem) => {
    setSelectedChapterPackage(null);
    setSelectedCourseForPreview(course);
    setIsChapterModalOpen(true);
  };

  const handleBuySpecialExam = (exam: LibrarySpecialExamItem) => {
    navigate(`/checkout/card-to-card?productId=${encodeURIComponent(exam.productId)}`);
  };

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 1. Query library courses & contents
  const resourcesQuery = useLibraryResources({
    q: debouncedQuery || undefined,
    type:
      activeTab === "all"
        ? "all"
        : activeTab === "courses"
          ? "courses"
          : activeTab === "special_exams"
            ? "special_exams"
            : undefined,
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: 12,
  });

  // 2. Query Course Chapter Educational Packages
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
  const specialExams = resourcesQuery.data?.special_exams ?? [];
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
              : activeTab === "special_exams"
                ? (resourcesQuery.data?.pagination?.total_special_exams ?? specialExams.length)
                : ((resourcesQuery.data?.pagination?.total_courses ?? 0) +
                  (resourcesQuery.data?.pagination?.total_special_exams ?? specialExams.length)),
          total_pages:
            Math.ceil(
              (activeTab === "courses"
                ? (resourcesQuery.data?.pagination?.total_courses ?? 0)
                : activeTab === "special_exams"
                  ? (resourcesQuery.data?.pagination?.total_special_exams ?? specialExams.length)
                  : Math.max(
                      resourcesQuery.data?.pagination?.total_courses ?? 0,
                      resourcesQuery.data?.pagination?.total_special_exams ?? specialExams.length,
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
      ? courses.length + specialExams.length + totalChapterPackages
      : activeTab === "courses"
        ? courses.length
        : activeTab === "special_exams"
          ? specialExams.length
          : totalChapterPackages;

  return (
    <div className="space-y-8 pb-16 w-full" dir="rtl">
      {/* 1. Hero Header Banner */}
      <Card variant="solid" className="relative overflow-hidden p-6 sm:p-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[16px] shadow-subtle">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Right: Primary Hero Content */}
          <div className="lg:col-span-7 space-y-3.5">
            <Badge variant="primary" icon={<LibraryIcon className="w-3.5 h-3.5" />}>
              کتابخانه جامع یادگیری و محتوای آموزشی آوانا
            </Badge>

            <h1 className="text-h1 font-bold text-[var(--color-text)]">
              کتابخانه آوانا
            </h1>

            <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed max-w-xl">
              مطالب آموزشی، دوره‌های معتبر و درسنامه‌های دانشگاهی را مرور و مطالعه کن، یا بسته‌های آموزشی آماده هر فصل را برای یادگیری کامل باز کن.
            </p>

            {/* Educational Highlights Meta Strip */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                <span>درسنامه‌های استاندارد</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>فلش‌کارت‌های مرور فعال</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-medium">
                <HelpCircle className="w-3.5 h-3.5 text-[#5ba0c4]" />
                <span>آزمون‌های جامع فصلی</span>
              </span>
            </div>
          </div>

          {/* Left: Dedicated Educational Library Visual Composition */}
          <div className="lg:col-span-5 relative flex items-center justify-center lg:justify-end py-2 lg:py-0">
            {/* Subtle soft backdrop ambient accents */}
            <div className="absolute -top-6 -start-6 w-36 h-36 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-6 -end-6 w-36 h-36 rounded-full bg-[#A7D0E6]/15 blur-2xl pointer-events-none" />

            {/* Layered Cards Stack */}
            <div className="relative w-full max-w-sm select-none pointer-events-none space-y-0">
              {/* 1. Base Layer: Curated Course Module (درسنامه جامع) */}
              <div className="relative z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[14px] p-3.5 shadow-subtle space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-[8px] bg-[#e0f2f2] border border-[#b3d9d9] flex items-center justify-center text-[#006666] shrink-0">
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
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e0f2f2] text-[#006666] border border-[#b3d9d9]">
                    درسنامه
                  </span>
                </div>

                {/* Subtle structured lines preview */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="h-1.5 rounded-[4px] bg-[#EEF1F3] w-5/6" />
                  <div className="h-1.5 rounded-[4px] bg-[#EEF1F3] w-2/3" />
                </div>
              </div>

              {/* 2. Middle Layer: Spaced Repetition (فلش‌کارت مرور) */}
              <div className="relative z-20 -mt-2 ms-4 sm:ms-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[14px] p-3 shadow-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-[8px] bg-[#fdf2e4] border border-[#e8c18a] flex items-center justify-center text-[#8f5e27] shrink-0">
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
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a]">
                  فلش‌کارت
                </span>
              </div>

              {/* 3. Fore Layer: Assessment (آزمون خودارزیابی) */}
              <div className="relative z-30 -mt-2 me-4 sm:me-6 bg-[var(--color-surface)] border border-[#a7d0e6] rounded-[14px] p-3 shadow-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-[8px] bg-[#e8f4fb] border border-[#a7d0e6] flex items-center justify-center text-[#2b6d8f] shrink-0">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[var(--color-text)] block truncate">
                      آزمون‌های خودارزیابی فصلی
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] block truncate">
                      پرسش‌های استاندارد ۴گزینه‌ای
                    </span>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f4fb] text-[#2b6d8f] border border-[#a7d0e6]">
                  آزمون
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Search, Tabs, Filter & Sort Toolbar */}
      <div className="space-y-4 pt-2">
        {/* Resource Category Tabs */}
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3 overflow-x-auto">
          <Button
            data-testid="tab-all"
            size="sm"
            variant={activeTab === "all" ? "primary" : "ghost"}
            onClick={() => handleTabChange("all")}
            leftIcon={<LibraryIcon className="w-4 h-4" />}
            className="rounded-[10px]"
          >
            همه
          </Button>

          <Button
            data-testid="tab-courses"
            size="sm"
            variant={activeTab === "courses" ? "primary" : "ghost"}
            onClick={() => handleTabChange("courses")}
            leftIcon={<GraduationCap className="w-4 h-4" />}
            className="rounded-[10px]"
          >
            دوره‌ها
          </Button>

          <Button
            data-testid="tab-special-exams"
            size="sm"
            variant={activeTab === "special_exams" ? "primary" : "ghost"}
            onClick={() => handleTabChange("special_exams")}
            leftIcon={<Sparkles className="w-4 h-4 text-amber-500" />}
            className="rounded-[10px]"
          >
            آزمون‌های ویژه
          </Button>

          <Button
            data-testid="tab-packs"
            size="sm"
            variant={activeTab === "packs" ? "primary" : "ghost"}
            onClick={() => handleTabChange("packs")}
            leftIcon={<Layers className="w-4 h-4 text-amber-400" />}
            className="rounded-[10px]"
          >
            بسته‌های آموزشی آماده
          </Button>
        </div>

        {/* Search Box, AvanaSelect Subject Filter & Sort Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Box */}
          <div className="md:col-span-6">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو در عنوان دوره‌ها، درسنامه‌ها، سرفصل‌ها یا موضوع..."
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
            title="خطا در دریافت منابع کتابخانه"
            description="ارتباط با سرور برقرار نشد. لطفا مجدداً تلاش کنید."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  void resourcesQuery.refetch();
                  void coursePackagesQuery.refetch();
                }}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                تلاش مجدد
              </Button>
            }
          />
        )}

        {/* Empty Result State */}
        {!isLoading && !isError && totalItemsInView === 0 && (
          <EmptyState
            icon={<LibraryIcon className="w-10 h-10 text-[var(--color-text-muted)]" />}
            title="هیچ محتوایی یافت نشد"
            description={
              isSearchActive
                ? "با فیلترها و عبارت جستجوی فعلی، موردی در کتابخانه پیدا نشد."
                : "هنوز محتوایی در این بخش وجود ندارد."
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

        {/* Course Packages (بسته‌های آموزشی آماده) */}
        {!isLoading && !isError && (activeTab === "all" || activeTab === "packs") && coursePackages.length > 0 && (
          <div className="space-y-6" data-testid="library-packs-section">
            <div className="flex items-center justify-between" data-testid="public-content-packs-section">
              <h2 className="text-h2 text-[var(--color-text)] flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>بسته‌های آموزشی آماده سرفصل‌ها</span>
              </h2>
            </div>
            <div className="space-y-8">
              {coursePackages.map((course: CourseWithChapterPackages) => (
                <Card
                  key={course.id}
                  data-testid={`course-package-group-${course.id}`}
                  variant="solid"
                  className="space-y-5"
                >
                  {/* Course Group Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-primary shrink-0" />
                        <h3 className="text-h3 text-[var(--color-text)]">{course.title}</h3>
                        {course.subject && <Badge variant="primary">{course.subject}</Badge>}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {course.packages.length} فصل دارای بسته آموزشی
                      </p>
                    </div>
                  </div>

                  {/* Chapter Packages Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {course.packages.map((pkg: ChapterPackageItem) => (
                      <ChapterPackageCard
                        key={pkg.id}
                        packageItem={pkg}
                        onView={() => handleViewPackage(pkg)}
                        onBuy={() => handleBuyPackage(pkg)}
                      />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Courses Grid */}
        {!isLoading && !isError && (activeTab === "all" || activeTab === "courses") && courses.length > 0 && (
          <div className="space-y-4" data-testid="library-courses-section">
            {activeTab === "all" && (
              <h2 className="text-h2 text-[var(--color-text)] flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span>دوره‌ها</span>
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course: LibraryCourseItem) => (
                <CourseLibraryCard
                  key={course.id}
                  course={course}
                  onView={handleViewCourse}
                  onBuy={() => handleBuyCourse(course)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Special Exams Grid */}
        {!isLoading && !isError && (activeTab === "all" || activeTab === "special_exams") && specialExams.length > 0 && (
          <div className="space-y-4" data-testid="library-special-exams-section">
            {activeTab === "all" && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-h2 text-[var(--color-text)] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>آزمون‌های ویژه</span>
                </h2>
                <span className="text-xs text-[var(--color-text-muted)]">
                  تولید هوشمند و تصادفی سؤالات با هر بار خرید از بانک سؤالات
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {specialExams.map((exam: LibrarySpecialExamItem) => (
                <SpecialExamLibraryCard
                  key={exam.id}
                  exam={exam}
                  onBuy={handleBuySpecialExam}
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

      {/* Chapter Package / Course Preview Modal */}
      {(selectedChapterPackage || selectedCourseForPreview) && (
        <ChapterPackageModal
          open={isChapterModalOpen}
          onClose={() => {
            setIsChapterModalOpen(false);
            setSelectedChapterPackage(null);
            setSelectedCourseForPreview(null);
          }}
          packageItem={selectedChapterPackage}
          courseItem={selectedCourseForPreview}
          onBuy={() => {
            if (selectedChapterPackage) {
              handleBuyPackage(selectedChapterPackage);
            } else if (selectedCourseForPreview) {
              handleBuyCourse(selectedCourseForPreview);
            }
          }}
        />
      )}

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
