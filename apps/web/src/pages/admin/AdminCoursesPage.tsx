import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAdmin } from "../../hooks/useAdmin.js";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  AlertCircle,
  Loader2,
  Edit2,
  Layers,
  FileText,
  BrainCircuit,
  HelpCircle,
  Plus,
  Sparkles,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Settings,
  UploadCloud,
  FileCheck,
  ArrowUpDown,
  RefreshCw,
  X,
  Trash2,
} from "lucide-react";
import type { AdminCourseRecord, OfficialCourse } from "../../lib/api/admin.js";
import { AdminCourseDeleteModal } from "../../components/admin/courses/AdminCourseDeleteModal.js";

type StatusFilterOption = "all" | "draft" | "generating" | "review" | "approved" | "published" | "archived";
type SortOption = "newest" | "oldest" | "name" | "content";

export function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const adminApi = useAdmin();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const pageSize = 20;

  // Edit metadata modal state
  const [editingCourse, setEditingCourse] = useState<AdminCourseRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subject: "" });

  // Delete course modal state
  const [deletingCourse, setDeletingCourse] = useState<{
    id: string;
    name: string;
    status?: string;
    product?: { active?: boolean; price?: number } | null;
  } | null>(null);

  // Create course modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseSubject, setNewCourseSubject] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Queries
  const coursesQuery = useQuery({
    queryKey: ["admin", "courses", page, search],
    queryFn: () => adminApi.listCourses(page, pageSize, search),
    placeholderData: (prev) => prev,
  });

  const officialCoursesQuery = useQuery({
    queryKey: ["admin", "official-courses"],
    queryFn: async () => {
      try {
        const res = await adminApi.listOfficialCourses();
        return res?.courses || [];
      } catch {
        return [];
      }
    },
  });

  const officialMap = useMemo(() => {
    const map = new Map<string, OfficialCourse>();
    const list = officialCoursesQuery.data || [];
    for (const c of list) {
      map.set(c.id, c);
    }
    return map;
  }, [officialCoursesQuery.data]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; name: string; subject: string }) => {
      return adminApi.updateCourseMetadata(vars.id, { name: vars.name, subject: vars.subject });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "official-courses"] });
      setEditingCourse(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      alert("خطا در بروزرسانی دوره: " + msg);
    },
  });

  const handleEditClick = (course: AdminCourseRecord) => {
    setEditingCourse(course);
    setEditForm({ name: course.name, subject: course.subject || "" });
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) {
      setCreateError("نام دوره الزامی است.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      const res = await adminApi.createOfficialCourse({
        name: newCourseName.trim(),
        subject: newCourseSubject.trim() || undefined,
        description: newCourseDescription.trim() || undefined,
      });

      if (res && res.course) {
        setIsCreateOpen(false);
        setNewCourseName("");
        setNewCourseSubject("");
        setNewCourseDescription("");
        await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "official-courses"] });
        navigate(`/admin/courses/${res.course.id}?tab=structure`);
      } else {
        throw new Error("خطا در ایجاد دوره رسمی");
      }
    } catch (err: unknown) {
      const e = err as Error;
      setCreateError(e.message || "خطا در ایجاد دوره");
    } finally {
      setCreating(false);
    }
  };

  const rawCourses = coursesQuery.data?.courses || [];
  const totalCount = coursesQuery.data?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Compute Header Overview Stats
  const officialList = officialCoursesQuery.data || [];
  const totalCoursesCount = totalCount || officialList.length;
  const draftCoursesCount = officialList.filter((c) => c.status === "draft").length;
  const generatingCoursesCount = officialList.filter((c) => c.status === "generating").length;
  const reviewCoursesCount = officialList.filter((c) => c.status === "review").length;
  const publishedCoursesCount = officialList.filter((c) => c.status === "published").length;

  // Client-side filtering & sorting on current dataset
  const displayedCourses = useMemo(() => {
    let result = rawCourses.map((c) => {
      const official = officialMap.get(c.id);
      const status = official?.status || "draft";
      const counts = official
        ? {
            modules: official.moduleCount,
            lessons: official.lessonCount,
            flashcards: official.flashcardCount,
            quizzes: official.quizQuestionCount,
          }
        : c.counts;

      return {
        ...c,
        status,
        isOfficial: official?.isOfficial ?? true,
        product: official?.product || null,
        description: official?.description || null,
        counts,
      };
    });

    // Filter by status if requested
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, "fa");
      }
      if (sortBy === "content") {
        const totalA = a.counts.modules + a.counts.lessons + a.counts.flashcards + a.counts.quizzes;
        const totalB = b.counts.modules + b.counts.lessons + b.counts.flashcards + b.counts.quizzes;
        return totalB - totalA;
      }
      return 0;
    });

    return result;
  }, [rawCourses, officialMap, statusFilter, sortBy]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSortBy("newest");
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || statusFilter !== "all" || sortBy !== "newest");

  const getStatusBadge = (status: OfficialCourse["status"]) => {
    switch (status) {
      case "draft":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            پیش‌نویس
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
            <span>در حال تولید</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>در انتظار بازبینی</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-blue-500" />
            <span>تایید شده</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>منتشر شده</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            بایگانی شده
          </span>
        );
    }
  };

  const getStatusAwareCta = (status: OfficialCourse["status"]) => {
    switch (status) {
      case "draft":
        return {
          label: "ادامه مدیریت",
          tab: "structure",
          icon: Layers,
        };
      case "generating":
        return {
          label: "مشاهده تولید",
          tab: "generation",
          icon: Sparkles,
        };
      case "review":
        return {
          label: "بازبینی پیش‌نویس‌ها",
          tab: "review",
          icon: FileCheck,
        };
      case "approved":
        return {
          label: "آماده انتشار",
          tab: "publish",
          icon: ShieldCheck,
        };
      case "published":
      default:
        return {
          label: "مشاهده و مدیریت",
          tab: "structure",
          icon: Layers,
        };
    }
  };

  return (
    <div className="space-y-6 text-[var(--color-text)]" dir="rtl">
      {/* 1. Education Workspace Header & Overview */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-7 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/30 text-[var(--color-primary-default)] flex items-center justify-center shadow-sm">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">آموزش و دوره‌ها</h1>
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                  مدیریت ساختار آموزشی، تولید محتوا، بازبینی و انتشار دوره‌ها
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
                void queryClient.invalidateQueries({ queryKey: ["admin", "official-courses"] });
              }}
              disabled={coursesQuery.isFetching}
              className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              title="به‌روزرسانی"
              aria-label="به‌روزرسانی دوره‌ها"
            >
              <RefreshCw className={`w-4 h-4 ${coursesQuery.isFetching ? "animate-spin" : ""}`} />
            </button>

            {/* Primary Action: Create Course */}
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              className="px-5 py-3 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد دوره جدید</span>
            </button>
          </div>
        </div>

        {/* Header Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 border-t border-[var(--color-border)]">
          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">تعداد کل دوره‌ها</span>
            <span className="text-lg font-black text-[var(--color-text)]">{totalCoursesCount}</span>
          </div>

          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">پیش‌نویس (Draft)</span>
            <span className="text-lg font-black text-[var(--color-text-muted)]">{draftCoursesCount}</span>
          </div>

          <div className="bg-purple-500/10 p-3.5 rounded-xl border border-purple-500/20 flex flex-col gap-1">
            <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">در حال تولید AI</span>
            <span className="text-lg font-black text-purple-600 dark:text-purple-400">{generatingCoursesCount}</span>
          </div>

          <div className="bg-amber-500/10 p-3.5 rounded-xl border border-amber-500/20 flex flex-col gap-1">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">در انتظار بازبینی</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400">{reviewCoursesCount}</span>
          </div>

          <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20 flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">منتشر شده در کاتالوگ</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{publishedCoursesCount}</span>
          </div>
        </div>
      </div>

      {/* 2. Search, Status Filter & Sorting Bar */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="جستجوی نام یا موضوع دوره..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="جستجوی دوره‌ها"
              className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl ps-4 pe-11 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
            />
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-4 top-3.5" aria-hidden="true" />
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[var(--color-text-muted)] text-[11px]">وضعیت:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilterOption)}
                aria-label="فیلتر وضعیت دوره"
                className="bg-transparent text-[var(--color-text)] text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[var(--color-surface)] text-[var(--color-text)]">همه</option>
                <option value="draft" className="bg-[var(--color-surface)] text-[var(--color-text)]">پیش‌نویس</option>
                <option value="generating" className="bg-[var(--color-surface)] text-[var(--color-text)]">در حال تولید</option>
                <option value="review" className="bg-[var(--color-surface)] text-[var(--color-text)]">در انتظار بازبینی</option>
                <option value="approved" className="bg-[var(--color-surface)] text-[var(--color-text)]">تایید شده</option>
                <option value="published" className="bg-[var(--color-surface)] text-[var(--color-text)]">منتشر شده</option>
                <option value="archived" className="bg-[var(--color-surface)] text-[var(--color-text)]">بایگانی شده</option>
              </select>
            </div>

            {/* Sort Control */}
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-3 py-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="مرتب‌سازی دوره‌ها"
                className="bg-transparent text-[var(--color-text)] text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="newest" className="bg-[var(--color-surface)] text-[var(--color-text)]">جدیدترین</option>
                <option value="oldest" className="bg-[var(--color-surface)] text-[var(--color-text)]">قدیمی‌ترین</option>
                <option value="name" className="bg-[var(--color-surface)] text-[var(--color-text)]">نام دوره</option>
                <option value="content" className="bg-[var(--color-surface)] text-[var(--color-text)]">بیشترین محتوا</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                aria-label="پاک کردن فیلترها"
                className="px-3.5 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl transition-colors flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>پاک کردن فیلترها</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Course Cards / Rows Container */}
      <div className="space-y-4">
        {coursesQuery.isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
            <p className="text-sm">در حال بارگذاری دوره‌ها...</p>
          </div>
        ) : coursesQuery.isError ? (
          <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-bold text-rose-500">خطا در دریافت لیست دوره‌ها.</h3>
            <p className="text-xs text-rose-500/80">
              خطایی در برقراری ارتباط با سرور رخ داد.
            </p>
            <button
              type="button"
              onClick={() => coursesQuery.refetch()}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              تلاش مجدد
            </button>
          </div>
        ) : displayedCourses.length === 0 ? (
          <div className="py-16 text-center bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 space-y-4">
            <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto" />
            <h3 className="text-base font-bold text-[var(--color-text)]">دوره‌ای یافت نشد</h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
              {hasActiveFilters
                ? "هیچ دوره‌ای با کلمه جستجو شده یا فیلترهای انتخابی مطابقت ندارد."
                : "اولین دوره رسمی آوانا را ایجاد کنید و فرایند تولید و انتشار محتوا را شروع کنید."}
            </p>
            {!hasActiveFilters && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>ایجاد اولین دوره</span>
              </button>
            )}
          </div>
        ) : (
          displayedCourses.map((course) => {
            const statusCta = getStatusAwareCta(course.status);
            const StatusCtaIcon = statusCta.icon;

            return (
              <div
                key={course.id}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-primary-default)]/30 p-5 sm:p-6 transition-all shadow-sm hover:shadow-md space-y-4 group"
              >
                {/* Row 1: Identity, Status, and Commercial Pricing */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to={`/admin/courses/${course.id}?tab=structure`}
                        className="text-base sm:text-lg font-black text-[var(--color-text)] hover:text-[var(--color-primary-default)] transition-colors"
                      >
                        {course.name}
                      </Link>
                      {getStatusBadge(course.status)}
                      {course.subject ? (
                        <span className="px-2.5 py-0.5 rounded-lg bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] text-xs border border-[var(--color-border)] font-medium">
                          {course.subject}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] text-xs border border-[var(--color-border)]">
                          عمومی
                        </span>
                      )}
                      {course.isOfficial && (
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] text-[10px] border border-[var(--color-primary-default)]/20 font-bold">
                          رسمی (Official)
                        </span>
                      )}
                    </div>

                    {course.description && (
                      <p className="text-xs text-[var(--color-text-muted)] line-clamp-1 max-w-3xl">
                        {course.description}
                      </p>
                    )}
                  </div>

                  {/* Commercial Product Info */}
                  <div className="flex items-center gap-3 self-start lg:self-center shrink-0">
                    {course.product ? (
                      <div className="bg-[var(--color-surface-subtle)] px-3 py-1.5 rounded-xl border border-[var(--color-border)] text-right">
                        <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          {course.product.price.toLocaleString("fa-IR")} تومان
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          {course.product.active ? "🟢 در حال فروش" : "🟡 پیش‌نویس قیمت"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
                        بدون محصول
                      </span>
                    )}

                    {/* Quick Edit Metadata Button */}
                    <button
                      type="button"
                      onClick={() => handleEditClick(course)}
                      aria-label={`ویرایش دوره ${course.name}`}
                      className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-primary-default)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
                      title="ویرایش سریع نام و موضوع"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Delete Course Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingCourse(course)}
                      aria-label={`حذف دوره ${course.name}`}
                      className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-rose-500 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
                      title="حذف قطعی دوره"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Content Metrics & Lifecycle Indicator */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-[var(--color-border)]">
                  {/* Content Counters */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)]">
                      <Layers className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                      <span className="font-bold">{course.counts.modules}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">فصل</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)]">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span className="font-bold">{course.counts.lessons}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">درس</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)]">
                      <BrainCircuit className="w-3.5 h-3.5 text-purple-500" />
                      <span className="font-bold">{course.counts.flashcards}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">فلش‌کارت</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)]">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-bold">{course.counts.quizzes}</span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">سؤال تستی</span>
                    </div>

                    <div className="text-[11px] text-[var(--color-text-muted)] me-2" dir="ltr">
                      {new Date(course.createdAt).toLocaleDateString("fa-IR")}
                    </div>
                  </div>

                  {/* Actions & Course Hub Direct Links */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick tab shortcuts */}
                    <Link
                      to={`/admin/courses/${course.id}?tab=structure`}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-semibold transition-colors flex items-center gap-1"
                      title="مشاهده سرفصل‌ها و ساختار دوره"
                    >
                      <Layers className="w-3 h-3 text-[var(--color-primary-default)]" />
                      <span>ساختار</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=generation`}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-semibold transition-colors flex items-center gap-1"
                      title="منابع و تولید هوشمند محتوا"
                    >
                      <UploadCloud className="w-3 h-3 text-purple-500" />
                      <span>تولید</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=review`}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-semibold transition-colors flex items-center gap-1"
                      title="میز بازبینی پیش‌نویس‌ها"
                    >
                      <FileCheck className="w-3 h-3 text-amber-500" />
                      <span>بازبینی</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=publish`}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-semibold transition-colors flex items-center gap-1"
                      title="انتشار و قیمت‌گذاری"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      <span>انتشار</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=settings`}
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs font-semibold transition-colors flex items-center gap-1"
                      title="تنظیمات و بایگانی"
                    >
                      <Settings className="w-3 h-3 text-[var(--color-text-muted)]" />
                      <span>تنظیمات</span>
                    </Link>

                    {/* Status-aware Primary Action -> Direct to Canonical Course Hub */}
                    <Link
                      to={`/admin/courses/${course.id}?tab=${statusCta.tab}`}
                      className="px-4 py-1.5 rounded-lg bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 me-1"
                    >
                      <StatusCtaIcon className="w-3.5 h-3.5" />
                      <span>{statusCta.label}</span>
                      <ChevronLeft className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] gap-4 text-xs font-bold shadow-sm">
        <span className="text-[var(--color-text-muted)]">
          مجموع: {totalCount} دوره
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 1 || coursesQuery.isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="صفحه قبل"
              className="p-2 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-[var(--color-text)] px-3 font-medium min-w-[5rem] text-center" aria-current="page">
              {page} / {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || coursesQuery.isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="صفحه بعد"
              className="p-2 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 5. Create Course Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95" dir="rtl">
            <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/30 text-[var(--color-primary-default)] flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="create-modal-title" className="text-base font-bold text-[var(--color-text)]">ایجاد دوره رسمی جدید</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">تعریف دوره در سازمان رسمی آوانا برای تولید و فروش</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl hover:bg-[var(--color-surface-subtle)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
              {createError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  نام دوره <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="مثال: فیزیولوژی اعصاب بالینی"
                  disabled={creating}
                  required
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  رشته / موضوع تخصصی
                </label>
                <input
                  type="text"
                  value={newCourseSubject}
                  onChange={(e) => setNewCourseSubject(e.target.value)}
                  placeholder="مثال: پزشکی، داروسازی، هوش مصنوعی"
                  disabled={creating}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  توضیحات تکمیلی (اختیاری)
                </label>
                <textarea
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  placeholder="توضیحاتی درباره اهداف آموزشی، مخاطبان و سرفصل‌ها..."
                  rows={3}
                  disabled={creating}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl p-3 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors resize-none"
                />
              </div>

              <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={creating || !newCourseName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] disabled:opacity-50 text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{creating ? "در حال ایجاد..." : "ایجاد دوره و ورود به هاب"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Quick Edit Course Metadata Modal */}
      {editingCourse && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95" dir="rtl">
            <div className="p-6 border-b border-[var(--color-border)] space-y-1">
              <h3 id="edit-modal-title" className="text-base font-bold text-[var(--color-text)]">ویرایش مشخصات دوره</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                در حال ویرایش اطلاعات <span className="text-[var(--color-text)] font-medium">{editingCourse.name}</span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="courseName" className="block text-xs font-bold text-[var(--color-text)] mb-2">نام دوره</label>
                <input
                  id="courseName"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                  placeholder="نام دوره را وارد کنید..."
                />
              </div>

              <div>
                <label htmlFor="courseSubject" className="block text-xs font-bold text-[var(--color-text)] mb-2">موضوع (اختیاری)</label>
                <input
                  id="courseSubject"
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                  placeholder="موضوع دوره را وارد کنید..."
                />
              </div>
            </div>

            <div className="p-5 border-t border-[var(--color-border)] flex justify-end gap-3 bg-[var(--color-surface-subtle)]">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate({ id: editingCourse.id, name: editForm.name, subject: editForm.subject })}
                disabled={updateMutation.isPending || !editForm.name.trim()}
                className="px-5 py-2.5 text-xs font-bold text-[var(--color-primary-contrast)] bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{updateMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminCourseDeleteModal
        isOpen={Boolean(deletingCourse)}
        course={deletingCourse}
        onClose={() => setDeletingCourse(null)}
        onSuccess={() => setDeletingCourse(null)}
      />
    </div>
  );
}
