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
  FileText,
  Layers,
} from "lucide-react";
import { useLibraryResources, useCoursePackages } from "../hooks/useLibrary.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
import { ContentLibraryCard } from "../components/library/ContentLibraryCard.js";
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
  LibraryContentItem,
} from "../lib/api/library.js";

type LibraryTab = "all" | "courses" | "contents" | "packs";

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
          : activeTab === "contents"
            ? "contents"
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
      <Card variant="glass" className="relative overflow-hidden p-6 sm:p-10 border-[var(--color-border)] shadow-md">
        <div className="relative z-10 max-w-2xl space-y-3">
          <Badge variant="primary" icon={<LibraryIcon className="w-3.5 h-3.5" />}>
            کتابخانه جامع یادگیری و محتوای آموزشی آوانا
          </Badge>

          <h1 className="text-h1 text-[var(--color-text)]">
            کتابخانه آوانا
          </h1>

          <p className="text-body-lg text-[var(--color-text-muted)] leading-relaxed">
            مطالب آموزشی، دوره‌های معتبر و درسنامه‌های دانشگاهی را مرور و مطالعه کن، یا بسته‌های آموزشی آماده هر فصل را برای یادگیری کامل باز کن.
          </p>
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
          >
            همه
          </Button>

          <Button
            data-testid="tab-courses"
            size="sm"
            variant={activeTab === "courses" ? "primary" : "ghost"}
            onClick={() => handleTabChange("courses")}
            leftIcon={<GraduationCap className="w-4 h-4" />}
          >
            دوره‌ها
          </Button>

          <Button
            data-testid="tab-contents"
            size="sm"
            variant={activeTab === "contents" ? "primary" : "ghost"}
            onClick={() => handleTabChange("contents")}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            محتواها و درسنامه‌ها
          </Button>

          <Button
            data-testid="tab-packs"
            size="sm"
            variant={activeTab === "packs" ? "primary" : "ghost"}
            onClick={() => handleTabChange("packs")}
            leftIcon={<Layers className="w-4 h-4 text-amber-400" />}
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
          <div className="md:col-span-3 flex items-center justify-end gap-1.5 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            <Button
              size="sm"
              variant={selectedSort === "popular" ? "primary" : "ghost"}
              onClick={() => handleSortChange("popular")}
              leftIcon={<TrendingUp className="w-3.5 h-3.5" />}
              className="flex-1"
            >
              محبوب‌ترین
            </Button>

            <Button
              size="sm"
              variant={selectedSort === "newest" ? "primary" : "ghost"}
              onClick={() => handleSortChange("newest")}
              leftIcon={<Clock className="w-3.5 h-3.5" />}
              className="flex-1"
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
                    ? "bg-primary/20 text-primary border-primary/40 shadow-sm"
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

        {/* Content Items Grid */}
        {!isLoading && !isError && (activeTab === "all" || activeTab === "contents") && contents.length > 0 && (
          <div className="space-y-4" data-testid="library-contents-section">
            {activeTab === "all" && (
              <h2 className="text-h2 text-[var(--color-text)] flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <span>درسنامه‌ها و محتواها</span>
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {contents.map((content: LibraryContentItem) => (
                <ContentLibraryCard
                  key={content.id}
                  content={content}
                  onBuy={() => handleBuyContent(content)}
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
