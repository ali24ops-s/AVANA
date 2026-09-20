import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  X,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  Library as LibraryIcon,
  GraduationCap,
  Layers,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import {
  useLibraryResources,
  useCoursePackages,
  useLibraryPack,
} from "../hooks/useLibrary.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
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
import {
  formatPersianOf,
  toPersianDigits,
  cleanEducationalTitle,
} from "@avana/domain";
import type {
  LibraryCourseItem,
} from "../lib/api/library.js";

type LibraryTab = "all" | "courses" | "packs";

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

const INITIAL_VISIBLE_PACKS_COUNT = 3;

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
  const urlPackId = searchParams.get("packId") || searchParams.get("packageId");

  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<string>>(() => new Set());
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

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
      setExpandedCourseIds(new Set());
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

  // Query all course packages when urlPackId is provided to ensure it is found regardless of pagination
  const targetedCoursePackagesQuery = useCoursePackages(
    urlPackId ? { limit: 100 } : { limit: 0 },
  );

  // Query single standalone content pack if packId is present in URL
  const singlePackQuery = useLibraryPack(urlPackId);

  // Auto-open detail if urlPackId is provided
  useEffect(() => {
    if (!urlPackId) return;

    // 1. Check in regular and targeted coursePackages
    const searchCourses = [
      ...(coursePackagesQuery.data?.courses || []),
      ...(targetedCoursePackagesQuery.data?.courses || []),
    ];

    for (const course of searchCourses) {
      const found = course.packages.find(
        (p) =>
          p.id === urlPackId ||
          p.moduleId === urlPackId ||
          p.contentPackId === urlPackId,
      );
      if (found) {
        setSelectedChapterPackage(found);
        setSelectedCourseForPreview(null);
        setIsChapterModalOpen(true);
        return;
      }
    }

    // 2. Check in single standalone pack query
    if (singlePackQuery.data?.pack) {
      const pack = singlePackQuery.data.pack;
      const converted: ChapterPackageItem = {
        id: pack.id,
        moduleId: pack.id,
        courseId: "",
        courseTitle: pack.title,
        title: pack.title,
        description: pack.description,
        subject: pack.subject,
        sortOrder: 0,
        documentId: null,
        contentPackId: pack.id,
        contents: {
          lesson: {
            exists: Boolean(pack.preview?.lesson),
            count: pack.stats?.session_count || (pack.preview?.lesson ? 1 : 0),
            estimatedMinutes: pack.stats?.estimated_reading_minutes || 10,
            title: pack.preview?.lesson?.title,
          },
          summary: {
            exists: Boolean(pack.preview?.review_summary),
            title: pack.preview?.review_summary?.title,
            overview: pack.preview?.review_summary?.overview,
            estimatedMinutes: pack.preview?.review_summary?.estimatedReadingMinutes,
          },
          flashcards: {
            exists: Boolean(pack.preview?.flashcard),
            count: pack.stats?.flashcard_count || pack.preview?.flashcard?.totalCards || 0,
          },
          quiz: {
            exists: Boolean(pack.preview?.quiz),
            title: pack.preview?.quiz?.title,
            questionCount: pack.stats?.quiz_question_count || pack.preview?.quiz?.totalQuestions || 0,
          },
        },
        stats: {
          totalItems:
            (pack.stats?.session_count || 0) +
            (pack.stats?.flashcard_count || 0) +
            (pack.stats?.quiz_question_count || 0) +
            (pack.preview?.review_summary ? 1 : 0),
          lessonCount: pack.stats?.session_count || 0,
          flashcardCount: pack.stats?.flashcard_count || 0,
          quizQuestionCount: pack.stats?.quiz_question_count || 0,
          hasSummary: Boolean(pack.preview?.review_summary),
          estimatedReadingMinutes: pack.stats?.estimated_reading_minutes || 0,
        },
        completeness: "partial",
        access: {
          isFree: pack.pricing?.is_free ?? true,
          isPurchased: false,
          hasAccess: true,
          accessSource: "free",
        },
        purchase: {
          price: pack.pricing?.price ?? 0,
          currency: pack.pricing?.currency ?? "toman",
          canPurchase: !(pack.pricing?.is_free ?? true),
          productId: pack.pricing?.product_id ?? null,
        },
        pricing: pack.pricing,
        createdAt: pack.published_at || new Date().toISOString(),
        updatedAt: pack.published_at || new Date().toISOString(),
      };
      setSelectedChapterPackage(converted);
      setSelectedCourseForPreview(null);
      setIsChapterModalOpen(true);
    }
  }, [
    urlPackId,
    coursePackagesQuery.data?.courses,
    targetedCoursePackagesQuery.data?.courses,
    singlePackQuery.data?.pack,
  ]);

  const handleTabChange = (tab: LibraryTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setExpandedCourseIds(new Set());
  };

  const handleSubjectChange = (subjectVal: string | string[]) => {
    const val = Array.isArray(subjectVal) ? subjectVal[0] || "all" : subjectVal;
    setSelectedSubject(val);
    setCurrentPage(1);
    setExpandedCourseIds(new Set());
  };

  const handleSortChange = (sort: "popular" | "newest") => {
    setSelectedSort(sort);
    setCurrentPage(1);
    setExpandedCourseIds(new Set());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setCurrentPage(1);
    setExpandedCourseIds(new Set());
  };

  const toggleCourseExpand = (courseId: string) => {
    setExpandedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const courses = resourcesQuery.data?.courses ?? [];
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
            resourcesQuery.data?.pagination?.total_courses ?? courses.length,
          total_pages:
            Math.ceil(
              (resourcesQuery.data?.pagination?.total_courses ??
                courses.length) / 12,
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
      ? courses.length + totalChapterPackages
      : activeTab === "courses"
        ? courses.length
        : totalChapterPackages;

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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[var(--color-text)] leading-tight">
              کتابخانه آوانا
            </h1>

            <div className="space-y-1.5 max-w-2xl">
              <p className="text-base sm:text-lg text-[var(--color-text-muted)] font-medium leading-relaxed">
                از درسنامه‌های معتبر دانشگاهی تا بسته‌های آموزشی فصل‌به‌فصل؛
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
                      آزمون‌های خودارزیابی فصلی
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
              {coursePackages.map((course: CourseWithChapterPackages) => {
                const isExpanded = expandedCourseIds.has(course.id);
                const totalCoursePackages = course.packages?.length ?? 0;
                const hasMorePackages = totalCoursePackages > INITIAL_VISIBLE_PACKS_COUNT;
                const visiblePackages =
                  hasMorePackages && !isExpanded
                    ? course.packages.slice(0, INITIAL_VISIBLE_PACKS_COUNT)
                    : course.packages;

                return (
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
                          <h3 className="text-h3 text-[var(--color-text)]">{cleanEducationalTitle(course.title, "دوره آموزشی جامع")}</h3>
                          {course.subject && <Badge variant="primary">{course.subject}</Badge>}
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {toPersianDigits(course.totalPackages ?? totalCoursePackages)} فصل دارای بسته آموزشی
                        </p>
                      </div>
                    </div>

                    {/* Chapter Packages Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {visiblePackages.map((pkg: ChapterPackageItem) => (
                        <ChapterPackageCard
                          key={pkg.id}
                          packageItem={pkg}
                          onView={() => handleViewPackage(pkg)}
                          onBuy={() => handleBuyPackage(pkg)}
                        />
                      ))}
                    </div>

                    {/* Per-Course Expand / Collapse CTA when this course has > 3 packages */}
                    {hasMorePackages && (
                      <div className="flex justify-center pt-2">
                        <Button
                          data-testid={`toggle-course-packs-${course.id}`}
                          variant={isExpanded ? "ghost" : "outline"}
                          size="sm"
                          onClick={() => toggleCourseExpand(course.id)}
                          rightIcon={
                            isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )
                          }
                          className="rounded-[10px] text-xs font-semibold"
                        >
                          {isExpanded ? "نمایش کمتر" : "مشاهده همه فصل‌ها"}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
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
            if (searchParams.has("packId") || searchParams.has("packageId")) {
              const newParams = new URLSearchParams(searchParams);
              newParams.delete("packId");
              newParams.delete("packageId");
              setSearchParams(newParams, { replace: true });
            }
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
