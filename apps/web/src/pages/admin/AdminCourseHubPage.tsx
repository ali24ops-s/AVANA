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
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            پیش‌نویس (Draft)
          </span>
        );
      case "generating":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
            <span>در حال تولید AI</span>
          </span>
        );
      case "review":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>در انتظار بازبینی</span>
          </span>
        );
      case "approved":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-blue-500" />
            <span>تایید شده (آماده انتشار)</span>
          </span>
        );
      case "published":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>منتشر شده در کاتالوگ</span>
          </span>
        );
      case "archived":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            بایگانی شده
          </span>
        );
    }
  };

  // Loading state
  if (loading && !course) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]" dir="rtl">
        <Loader2 className="w-9 h-9 animate-spin text-[var(--color-primary-default)]" />
        <p className="text-sm font-medium">در حال بارگذاری هاب مدیریت دوره...</p>
      </div>
    );
  }

  // Not found / Error state
  if (!course) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center space-y-4 max-w-xl mx-auto my-12 shadow-sm" dir="rtl">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">دوره مورد نظر یافت نشد</h3>
        {error ? (
          <p className="text-xs text-rose-500">{error}</p>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            دوره با شناسه <span className="font-mono text-[var(--color-text)]">{courseId}</span> یافت نشد یا ممکن است حذف شده باشد.
          </p>
        )}
        <Link
          to="/admin/courses"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm"
        >
          <ChevronRight className="w-4 h-4" />
          <span>بازگشت به لیست دوره‌ها</span>
        </Link>
      </div>
    );
  }

  // Loaded Course Hub
  return (
    <div className="space-y-6 text-[var(--color-text)]" dir="rtl">
      {/* Course Hub Top Header */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        {/* Row 1: Breadcrumb & Course Switcher & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-wrap">
            <Link
              to="/admin/dashboard"
              className="hover:text-[var(--color-primary-default)] transition-colors font-medium"
            >
              پنل مدیریت
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <Link
              to="/admin/courses"
              className="hover:text-[var(--color-primary-default)] transition-colors font-bold text-[var(--color-text)]"
            >
              آموزش و دوره‌ها
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />

            {/* Quick Course Switcher Dropdown */}
            <select
              value={course.id}
              onChange={(e) => handleSwitchCourse(e.target.value)}
              aria-label="انتخاب دوره آموزشی"
              className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-[var(--color-primary-default)] max-w-[200px] sm:max-w-xs truncate"
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
              className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center gap-1.5"
              title="دریافت بسته خروجی محتوای دوره (ZIP)"
            >
              <Download className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
              <span>خروجی ZIP</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center gap-1.5"
              title="ورود بسته محتوا به این دوره"
            >
              <Upload className="w-3.5 h-3.5 text-blue-500" />
              <span>ورود محتوا</span>
            </button>

            <button
              type="button"
              onClick={fetchCourses}
              disabled={loading}
              className="p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              title="به‌روزرسانی اطلاعات دوره"
              aria-label="به‌روزرسانی"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <Link
              to="/admin/courses"
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>بازگشت به دوره‌ها</span>
            </Link>
          </div>
        </div>

        {/* Row 2: Main Course Title, Badges & Aggregate Learning Counters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-[var(--color-border)]">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
                {course.name}
              </h1>
              {getStatusBadge(course.status)}
              {course.isOfficial && (
                <span className="px-2.5 py-0.5 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] text-xs border border-[var(--color-primary-default)]/30 font-bold">
                  دوره رسمی آوانا
                </span>
              )}
              {course.subject && (
                <span className="px-2.5 py-0.5 rounded-xl bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] text-xs border border-[var(--color-border)] font-medium">
                  {course.subject}
                </span>
              )}
            </div>
            {course.description && (
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-3xl line-clamp-2">
                {course.description}
              </p>
            )}
          </div>

          {/* Aggregate Learning & Commercial Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-[var(--color-surface-subtle)] p-2.5 rounded-xl border border-[var(--color-border)]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] text-xs">
              <Layers className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
              <span className="font-bold">{course.moduleCount}</span>
              <span className="text-[11px] opacity-80">فصل</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-bold">{course.lessonCount}</span>
              <span className="text-[11px] opacity-80">درس</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="font-bold">{course.flashcardCount}</span>
              <span className="text-[11px] opacity-80">فلش‌کارت</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
              <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold">{course.quizQuestionCount}</span>
              <span className="text-[11px] opacity-80">سؤال تستی</span>
            </div>

            {course.product && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <span>{course.product.price.toLocaleString("fa-IR")} تومان</span>
                <span className="text-[10px] opacity-80">
                  {course.product.active ? "(فعال)" : "(پیش‌نویس)"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Course Hub 5 Tabs Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-x-auto text-xs font-bold shadow-sm">
        <button
          type="button"
          onClick={() => setTab("structure")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "structure"
              ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
              ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
              ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
              ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
              ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
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
