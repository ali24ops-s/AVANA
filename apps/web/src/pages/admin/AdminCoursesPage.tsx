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
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            پیش‌نویس
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
            <span>در حال تولید</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>در انتظار بازبینی</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-950/60 text-blue-300 border border-blue-500/40 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-blue-400" />
            <span>تایید شده</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>منتشر شده</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">
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
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* 1. Education Workspace Header & Overview */}
      <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-6 sm:p-7 shadow-xl backdrop-blur-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center shadow-lg shadow-teal-950/30">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">آموزش و دوره‌ها</h1>
                <p className="text-xs sm:text-sm text-slate-400">
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
              className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 transition-colors"
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
              className="px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-teal-950/50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد دوره جدید</span>
            </button>
          </div>
        </div>

        {/* Header Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 font-medium">تعداد کل دوره‌ها</span>
            <span className="text-lg font-black text-white">{totalCoursesCount}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 font-medium">پیش‌نویس (Draft)</span>
            <span className="text-lg font-black text-slate-300">{draftCoursesCount}</span>
          </div>

          <div className="bg-purple-950/20 p-3.5 rounded-2xl border border-purple-500/20 flex flex-col gap-1">
            <span className="text-[11px] text-purple-300/80 font-medium">در حال تولید AI</span>
            <span className="text-lg font-black text-purple-300">{generatingCoursesCount}</span>
          </div>

          <div className="bg-amber-950/20 p-3.5 rounded-2xl border border-amber-500/20 flex flex-col gap-1">
            <span className="text-[11px] text-amber-300/80 font-medium">در انتظار بازبینی</span>
            <span className="text-lg font-black text-amber-300">{reviewCoursesCount}</span>
          </div>

          <div className="bg-emerald-950/20 p-3.5 rounded-2xl border border-emerald-500/20 flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-emerald-300/80 font-medium">منتشر شده در کاتالوگ</span>
            <span className="text-lg font-black text-emerald-400">{publishedCoursesCount}</span>
          </div>
        </div>
      </div>

      {/* 2. Search, Status Filter & Sorting Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-lg space-y-4">
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
              className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-4 pr-11 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
            <Search className="w-4 h-4 text-slate-500 absolute right-4 top-3.5" aria-hidden="true" />
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700 rounded-2xl px-3 py-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">وضعیت:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilterOption)}
                aria-label="فیلتر وضعیت دوره"
                className="bg-transparent text-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-slate-200">همه</option>
                <option value="draft" className="bg-slate-900 text-slate-200">پیش‌نویس</option>
                <option value="generating" className="bg-slate-900 text-slate-200">در حال تولید</option>
                <option value="review" className="bg-slate-900 text-slate-200">در انتظار بازبینی</option>
                <option value="approved" className="bg-slate-900 text-slate-200">تایید شده</option>
                <option value="published" className="bg-slate-900 text-slate-200">منتشر شده</option>
                <option value="archived" className="bg-slate-900 text-slate-200">بایگانی شده</option>
              </select>
            </div>

            {/* Sort Control */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700 rounded-2xl px-3 py-1.5 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="مرتب‌سازی دوره‌ها"
                className="bg-transparent text-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="newest" className="bg-slate-900 text-slate-200">جدیدترین</option>
                <option value="oldest" className="bg-slate-900 text-slate-200">قدیمی‌ترین</option>
                <option value="name" className="bg-slate-900 text-slate-200">نام دوره</option>
                <option value="content" className="bg-slate-900 text-slate-200">بیشترین محتوا</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                aria-label="پاک کردن فیلترها"
                className="px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-2xl transition-colors flex items-center gap-1.5"
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
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-900/40 rounded-3xl border border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            <p className="text-sm">در حال بارگذاری دوره‌ها...</p>
          </div>
        ) : coursesQuery.isError ? (
          <div className="p-8 rounded-3xl bg-rose-950/30 border border-rose-500/30 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-base font-bold text-rose-200">خطا در دریافت لیست دوره‌ها.</h3>
            <p className="text-xs text-rose-300/80">
              خطایی در برقراری ارتباط با سرور رخ داد.
            </p>
            <button
              type="button"
              onClick={() => coursesQuery.refetch()}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md"
            >
              تلاش مجدد
            </button>
          </div>
        ) : displayedCourses.length === 0 ? (
          <div className="py-16 text-center bg-slate-900/40 rounded-3xl border border-slate-800 p-8 space-y-4">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-200">دوره‌ای یافت نشد</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {hasActiveFilters
                ? "هیچ دوره‌ای با کلمه جستجو شده یا فیلترهای انتخابی مطابقت ندارد."
                : "اولین دوره رسمی آوانا را ایجاد کنید و فرایند تولید و انتشار محتوا را شروع کنید."}
            </p>
            {!hasActiveFilters && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-lg shadow-teal-950/50"
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
                className="bg-slate-900/60 rounded-3xl border border-slate-800/90 hover:border-slate-700/80 p-5 sm:p-6 transition-all shadow-lg hover:shadow-xl space-y-4 group"
              >
                {/* Row 1: Identity, Status, and Commercial Pricing */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to={`/admin/courses/${course.id}?tab=structure`}
                        className="text-base sm:text-lg font-black text-white hover:text-teal-400 transition-colors"
                      >
                        {course.name}
                      </Link>
                      {getStatusBadge(course.status)}
                      {course.subject ? (
                        <span className="px-2.5 py-0.5 rounded-xl bg-slate-800 text-slate-300 text-xs border border-slate-700 font-medium">
                          {course.subject}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-xl bg-slate-800/60 text-slate-500 text-xs border border-slate-800">
                          عمومی
                        </span>
                      )}
                      {course.isOfficial && (
                        <span className="px-2 py-0.5 rounded-xl bg-teal-950/40 text-teal-300 text-[10px] border border-teal-500/30 font-bold">
                          رسمی (Official)
                        </span>
                      )}
                    </div>

                    {course.description && (
                      <p className="text-xs text-slate-400 line-clamp-1 max-w-3xl">
                        {course.description}
                      </p>
                    )}
                  </div>

                  {/* Commercial Product Info */}
                  <div className="flex items-center gap-3 self-start lg:self-center shrink-0">
                    {course.product ? (
                      <div className="bg-slate-950/60 px-3 py-1.5 rounded-2xl border border-slate-800 text-right">
                        <div className="font-bold text-xs text-emerald-400">
                          {course.product.price.toLocaleString("fa-IR")} تومان
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {course.product.active ? "🟢 در حال فروش" : "🟡 پیش‌نویس قیمت"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 bg-slate-950/40 px-3 py-1.5 rounded-xl border border-slate-800">
                        بدون محصول
                      </span>
                    )}

                    {/* Quick Edit Metadata Button */}
                    <button
                      type="button"
                      onClick={() => handleEditClick(course)}
                      aria-label={`ویرایش دوره ${course.name}`}
                      className="p-2 rounded-xl text-slate-400 hover:text-teal-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition-colors"
                      title="ویرایش سریع نام و موضوع"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Delete Course Button */}
                    <button
                      type="button"
                      onClick={() => setDeletingCourse(course)}
                      aria-label={`حذف دوره ${course.name}`}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition-colors"
                      title="حذف قطعی دوره"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Content Metrics & Lifecycle Indicator */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-800/70">
                  {/* Content Counters */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                      <Layers className="w-3.5 h-3.5 text-teal-400" />
                      <span className="font-bold">{course.counts.modules}</span>
                      <span className="text-[11px] text-slate-400">فصل</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-bold">{course.counts.lessons}</span>
                      <span className="text-[11px] text-slate-400">درس</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                      <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
                      <span className="font-bold">{course.counts.flashcards}</span>
                      <span className="text-[11px] text-slate-400">فلش‌کارت</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-bold">{course.counts.quizzes}</span>
                      <span className="text-[11px] text-slate-400">سؤال تستی</span>
                    </div>

                    <div className="text-[11px] text-slate-500 mr-2" dir="ltr">
                      {new Date(course.createdAt).toLocaleDateString("fa-IR")}
                    </div>
                  </div>

                  {/* Actions & Course Hub Direct Links */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick tab shortcuts */}
                    <Link
                      to={`/admin/courses/${course.id}?tab=structure`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1"
                      title="مشاهده سرفصل‌ها و ساختار دوره"
                    >
                      <Layers className="w-3 h-3 text-teal-400" />
                      <span>ساختار</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=generation`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1"
                      title="منابع و تولید هوشمند محتوا"
                    >
                      <UploadCloud className="w-3 h-3 text-purple-400" />
                      <span>تولید</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=review`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1"
                      title="میز بازبینی پیش‌نویس‌ها"
                    >
                      <FileCheck className="w-3 h-3 text-amber-400" />
                      <span>بازبینی</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=publish`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1"
                      title="انتشار و قیمت‌گذاری"
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>انتشار</span>
                    </Link>

                    <Link
                      to={`/admin/courses/${course.id}?tab=settings`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1"
                      title="تنظیمات و بایگانی"
                    >
                      <Settings className="w-3 h-3 text-slate-400" />
                      <span>تنظیمات</span>
                    </Link>

                    {/* Status-aware Primary Action -> Direct to Canonical Course Hub */}
                    <Link
                      to={`/admin/courses/${course.id}?tab=${statusCta.tab}`}
                      className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-teal-950/50 flex items-center gap-1.5 mr-1"
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
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 rounded-3xl border border-slate-800 bg-slate-900/60 gap-4 text-xs font-bold">
        <span className="text-slate-400">
          مجموع: {totalCount} دوره
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 1 || coursesQuery.isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="صفحه قبل"
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-slate-300 px-3 font-medium min-w-[5rem] text-center" aria-current="page">
              {page} / {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || coursesQuery.isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="صفحه بعد"
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 5. Create Course Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95" dir="rtl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="create-modal-title" className="text-base font-bold text-white">ایجاد دوره رسمی جدید</h3>
                  <p className="text-xs text-slate-400 mt-0.5">تعریف دوره در سازمان رسمی آوانا برای تولید و فروش</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="p-6 space-y-4">
              {createError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  نام دوره <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="مثال: فیزیولوژی اعصاب بالینی"
                  disabled={creating}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  رشته / موضوع تخصصی
                </label>
                <input
                  type="text"
                  value={newCourseSubject}
                  onChange={(e) => setNewCourseSubject(e.target.value)}
                  placeholder="مثال: پزشکی، داروسازی، هوش مصنوعی"
                  disabled={creating}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  توضیحات تکمیلی (اختیاری)
                </label>
                <textarea
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  placeholder="توضیحاتی درباره اهداف آموزشی، مخاطبان و سرفصل‌ها..."
                  rows={3}
                  disabled={creating}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={creating || !newCourseName.trim()}
                  className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-teal-950/50 flex items-center gap-2"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95" dir="rtl">
            <div className="p-6 border-b border-slate-800 space-y-1">
              <h3 id="edit-modal-title" className="text-base font-bold text-white">ویرایش مشخصات دوره</h3>
              <p className="text-xs text-slate-400">
                در حال ویرایش اطلاعات <span className="text-slate-200 font-medium">{editingCourse.name}</span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="courseName" className="block text-xs font-bold text-slate-300 mb-2">نام دوره</label>
                <input
                  id="courseName"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  placeholder="نام دوره را وارد کنید..."
                />
              </div>

              <div>
                <label htmlFor="courseSubject" className="block text-xs font-bold text-slate-300 mb-2">موضوع (اختیاری)</label>
                <input
                  id="courseSubject"
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  placeholder="موضوع دوره را وارد کنید..."
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/40">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-2xl transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate({ id: editingCourse.id, name: editForm.name, subject: editForm.subject })}
                disabled={updateMutation.isPending || !editForm.name.trim()}
                className="px-5 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-2xl transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-950/50"
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
