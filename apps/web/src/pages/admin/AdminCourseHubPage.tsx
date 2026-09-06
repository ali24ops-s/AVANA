import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Layers,
  Sparkles,
  ShieldCheck,
  Settings,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
  HelpCircle,
  UploadCloud,
  FileCheck,
  Download,
  Upload,
} from "lucide-react";
import type { OfficialCourse } from "../../lib/api/admin.js";
import { CourseStructurePanel } from "../../components/admin/studio/CourseStructurePanel.js";
import { SourceProductionPanel } from "../../components/admin/studio/SourceProductionPanel.js";
import { DraftReviewPanel } from "../../components/admin/studio/DraftReviewPanel.js";
import { PublicationActionCenter } from "../../components/admin/studio/PublicationActionCenter.js";
import { CourseSettingsPanel } from "../../components/admin/studio/CourseSettingsPanel.js";
import { ContentExportModal } from "../../components/admin/content/ContentExportModal.js";
import { ContentImportModal } from "../../components/admin/content/ContentImportModal.js";

export type CourseHubTab = "structure" | "generation" | "review" | "publish" | "settings";

const VALID_TABS: readonly CourseHubTab[] = [
  "structure",
  "generation",
  "review",
  "publish",
  "settings",
] as const;

export function AdminCourseHubPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Resolve current active tab from searchParams, fallback to 'structure'
  const rawTab = searchParams.get("tab");
  const activeTab: CourseHubTab = useMemo(() => {
    if (rawTab === "sources") return "generation"; // Backward-compatibility mapping
    if (rawTab && (VALID_TABS as readonly string[]).includes(rawTab)) {
      return rawTab as CourseHubTab;
    }
    return "structure";
  }, [rawTab]);

  const setTab = useCallback(
    (newTab: CourseHubTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", newTab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [courses, setCourses] = useState<OfficialCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Export / Import Modals State
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/v1/admin/content-studio/courses", { credentials: "include" });
      if (!res.ok) throw new Error("دریافت اطلاعات دوره‌ها با خطا مواجه شد.");
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || "خطای ناشناخته در دریافت دوره‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const course = useMemo(() => {
    return courses.find((c) => c.id === courseId);
  }, [courses, courseId]);

  const organizationId = course?.organizationId || "";

  const handleSwitchCourse = (targetCourseId: string) => {
    if (!targetCourseId || targetCourseId === courseId) return;
    navigate(`/admin/courses/${targetCourseId}?tab=${activeTab}`);
  };

  const getStatusBadge = (status: OfficialCourse["status"]) => {
    switch (status) {
      case "draft":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            پیش‌نویس (Draft)
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
            <span>در حال تولید AI</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>در انتظار بازبینی</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-950/60 text-blue-300 border border-blue-500/40 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-blue-400" />
            <span>تایید شده (آماده انتشار)</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>منتشر شده در کاتالوگ</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">
            بایگانی شده
          </span>
        );
    }
  };

  // Loading state
  if (loading && !course) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400" dir="rtl">
        <Loader2 className="w-9 h-9 animate-spin text-teal-400" />
        <p className="text-sm font-medium">در حال بارگذاری هاب مدیریت دوره...</p>
      </div>
    );
  }

  // Not found / Error state
  if (!course) {
    return (
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-10 text-center space-y-4 max-w-xl mx-auto my-12" dir="rtl">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">دوره مورد نظر یافت نشد</h3>
        {error ? (
          <p className="text-xs text-rose-300">{error}</p>
        ) : (
          <p className="text-xs text-slate-400">
            دوره با شناسه <span className="font-mono text-slate-300">{courseId}</span> یافت نشد یا ممکن است حذف شده باشد.
          </p>
        )}
        <Link
          to="/admin/courses"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-teal-950/50"
        >
          <ChevronRight className="w-4 h-4" />
          <span>بازگشت به لیست دوره‌ها</span>
        </Link>
      </div>
    );
  }

  // Loaded Course Hub
  return (
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Course Hub Top Header */}
      <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-4">
        {/* Row 1: Breadcrumb & Course Switcher & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <Link
              to="/admin/dashboard"
              className="hover:text-teal-400 transition-colors font-medium"
            >
              پنل مدیریت
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
            <Link
              to="/admin/courses"
              className="hover:text-teal-400 transition-colors font-bold text-slate-300"
            >
              آموزش و دوره‌ها
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />

            {/* Quick Course Switcher Dropdown */}
            <select
              value={course.id}
              onChange={(e) => handleSwitchCourse(e.target.value)}
              aria-label="انتخاب دوره آموزشی"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-teal-500 max-w-[200px] sm:max-w-xs truncate"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export / Import Actions */}
            <button
              type="button"
              onClick={() => setIsExportOpen(true)}
              className="px-3 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5"
              title="دریافت بسته خروجی محتوای دوره (ZIP)"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>خروجی ZIP</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="px-3 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5"
              title="ورود بسته محتوا به این دوره"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>ورود محتوا</span>
            </button>

            <button
              type="button"
              onClick={fetchCourses}
              disabled={loading}
              className="p-2.5 rounded-2xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
              title="به‌روزرسانی اطلاعات دوره"
              aria-label="به‌روزرسانی"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <Link
              to="/admin/courses"
              className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>بازگشت به دوره‌ها</span>
            </Link>
          </div>
        </div>

        {/* Row 2: Main Course Title, Badges & Aggregate Learning Counters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-white">
                {course.name}
              </h1>
              {getStatusBadge(course.status)}
              {course.isOfficial && (
                <span className="px-2.5 py-0.5 rounded-xl bg-teal-950/80 text-teal-300 text-xs border border-teal-500/40 font-bold">
                  دوره رسمی آوانا
                </span>
              )}
              {course.subject && (
                <span className="px-2.5 py-0.5 rounded-xl bg-slate-800 text-slate-300 text-xs border border-slate-700 font-medium">
                  {course.subject}
                </span>
              )}
            </div>
            {course.description && (
              <p className="text-xs sm:text-sm text-slate-400 max-w-3xl line-clamp-2">
                {course.description}
              </p>
            )}
          </div>

          {/* Aggregate Learning & Commercial Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-950/40 border border-teal-500/20 text-teal-300 text-xs">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-bold">{course.moduleCount}</span>
              <span className="text-[11px] text-teal-400/70">فصل</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-300 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold">{course.lessonCount}</span>
              <span className="text-[11px] text-blue-400/70">درس</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-950/40 border border-purple-500/20 text-purple-300 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold">{course.flashcardCount}</span>
              <span className="text-[11px] text-purple-400/70">فلش‌کارت</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-500/20 text-amber-300 text-xs">
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold">{course.quizQuestionCount}</span>
              <span className="text-[11px] text-amber-400/70">سؤال تستی</span>
            </div>

            {course.product && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-xs font-bold">
                <span>{course.product.price.toLocaleString("fa-IR")} تومان</span>
                <span className="text-[10px] text-emerald-400/70">
                  {course.product.active ? "(فعال)" : "(پیش‌نویس)"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Course Hub 5 Tabs Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto text-xs font-bold shadow-lg">
        <button
          type="button"
          onClick={() => setTab("structure")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "structure"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>۱. ساختار و سرفصل‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("generation")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "generation"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>۲. تولید هوشمند و منابع</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("review")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "review"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>۳. بازبینی پیش‌نویس‌ها</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("publish")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "publish"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>۴. انتشار و تجاری‌سازی</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "settings"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>۵. تنظیمات دوره</span>
        </button>
      </div>

      {/* Main Tab Panel Content */}
      <div className="animate-in fade-in">
        {activeTab === "structure" && (
          <CourseStructurePanel courseId={course.id} />
        )}

        {activeTab === "generation" && (
          <SourceProductionPanel
            course={course}
            organizationId={organizationId}
            onGenerationComplete={() => setTab("review")}
            onNavigateToReview={() => setTab("review")}
          />
        )}

        {activeTab === "review" && (
          <DraftReviewPanel
            courseId={course.id}
            organizationId={organizationId}
            onNavigateToApproval={() => setTab("publish")}
          />
        )}

        {activeTab === "publish" && (
          <PublicationActionCenter
            course={course}
            onSuccess={fetchCourses}
          />
        )}

        {activeTab === "settings" && (
          <CourseSettingsPanel
            course={course}
            onRefresh={fetchCourses}
          />
        )}
      </div>

      {/* Content Export Modal */}
      <ContentExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        courses={courses.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* Content Import Modal */}
      <ContentImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setIsImportOpen(false);
          void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", course.id] });
          void queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
          void fetchCourses();
        }}
      />
    </div>
  );
}
