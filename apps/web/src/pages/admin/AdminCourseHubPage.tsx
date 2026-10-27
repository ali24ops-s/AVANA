import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Flag,
  GraduationCap,
  User,
  School,
  AlertTriangle,
  Info,
  X,
  MessageSquare,
  GitCompare,
} from "lucide-react";
import {
  listCourseSubmissions,
  approveCourseSubmission,
  rejectCourseSubmission,
  requestCourseSubmissionChanges,
  type AdminCourseRecord,
  type OfficialCourse,
  type AdminCourseSubmissionItem,
} from "../../lib/api/admin.js";
import { useAdmin } from "../../hooks/useAdmin.js";
import { CourseStructurePanel } from "../../components/admin/studio/CourseStructurePanel.js";
import { SourceProductionPanel } from "../../components/admin/studio/SourceProductionPanel.js";
import { DraftReviewPanel } from "../../components/admin/studio/DraftReviewPanel.js";
import { PublicationActionCenter } from "../../components/admin/studio/PublicationActionCenter.js";
import { CourseSettingsPanel } from "../../components/admin/studio/CourseSettingsPanel.js";
import { AdminContentReportsPanel } from "../../components/admin/reports/AdminContentReportsPanel.js";
import { ContentExportModal } from "../../components/admin/content/ContentExportModal.js";
import { ContentImportModal } from "../../components/admin/content/ContentImportModal.js";
import { toPersianDigits } from "@avana/domain";
import { formatToman } from "../../components/admin/commerce/commerceUtils.js";

export type CourseHubTab =
  | "structure"
  | "generation"
  | "review"
  | "publish"
  | "settings"
  | "reports"
  | "details";

const OFFICIAL_VALID_TABS: readonly CourseHubTab[] = [
  "structure",
  "generation",
  "review",
  "publish",
  "settings",
  "reports",
] as const;

const INSPECTION_VALID_TABS: readonly CourseHubTab[] = [
  "structure",
  "details",
  "reports",
] as const;

export function AdminCourseHubPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const adminApi = useAdmin();

  const [course, setCourse] = useState<AdminCourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Export / Import Modals State
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Course Submission Moderation State
  const [rejectingSubmission, setRejectingSubmission] = useState<AdminCourseSubmissionItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvingSubmission, setApprovingSubmission] = useState<AdminCourseSubmissionItem | null>(null);
  const [requestingChangesSubmission, setRequestingChangesSubmission] = useState<AdminCourseSubmissionItem | null>(null);
  const [changeRequestNotes, setChangeRequestNotes] = useState("");
  const [submissionAccessType, setSubmissionAccessType] = useState<"free" | "paid" | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [targetPrice, setTargetPrice] = useState<number | undefined>(undefined);
  const [isSubmittingModeration, setIsSubmittingModeration] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);

  const submissionsQuery = useQuery({
    queryKey: ["course-submissions", courseId],
    queryFn: () => listCourseSubmissions({ courseId: courseId!, status: "pending_review" }),
    enabled: Boolean(courseId),
  });

  const pendingSubmission = submissionsQuery.data?.items?.[0] || null;

  const handleApproveSubmission = async () => {
    if (!pendingSubmission || isSubmittingModeration) return;

    if (!submissionAccessType) {
      setModerationError("لطفاً نوع دسترسی دوره (رایگان یا پولی) را مشخص کنید.");
      return;
    }

    if (submissionAccessType === "paid") {
      if (
        targetPrice === undefined ||
        targetPrice === null ||
        isNaN(targetPrice) ||
        !Number.isInteger(targetPrice) ||
        targetPrice <= 0
      ) {
        setModerationError("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).");
        return;
      }
    }

    try {
      setIsSubmittingModeration(true);
      setModerationError(null);
      await approveCourseSubmission(pendingSubmission.id, {
        accessType: submissionAccessType,
        price: submissionAccessType === "paid" ? targetPrice : undefined,
        reviewNotes: approvalNotes.trim() || undefined,
      });
      setApprovingSubmission(null);
      void submissionsQuery.refetch();
      void fetchCourse();
      void queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
    } catch (err) {
      setModerationError(err instanceof Error ? err.message : "خطا در تأیید و انتشار دوره");
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleRejectSubmission = async () => {
    if (!pendingSubmission || !rejectionReason.trim()) return;
    try {
      setIsSubmittingModeration(true);
      setModerationError(null);
      await rejectCourseSubmission(pendingSubmission.id, rejectionReason.trim());
      setRejectingSubmission(null);
      setRejectionReason("");
      void submissionsQuery.refetch();
      void fetchCourse();
      void queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
    } catch (err) {
      setModerationError(err instanceof Error ? err.message : "خطا در رد انتشار دوره");
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!pendingSubmission || !changeRequestNotes.trim() || isSubmittingModeration) return;
    try {
      setIsSubmittingModeration(true);
      setModerationError(null);
      await requestCourseSubmissionChanges(pendingSubmission.id, changeRequestNotes.trim());
      setRequestingChangesSubmission(null);
      setChangeRequestNotes("");
      void submissionsQuery.refetch();
      void fetchCourse();
      void queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
    } catch (err) {
      setModerationError(err instanceof Error ? err.message : "خطا در ارسال درخواست اصلاحات");
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const fetchCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      setError(null);
      setIs404(false);

      try {
        const res = await adminApi.getCourse(courseId);
        if (res && res.course) {
          setCourse(res.course);
          return;
        }
      } catch {
        // Fallback to content-studio endpoint if getCourse is unmocked or fails
      }

      const res = await fetch("/v1/admin/content-studio/courses", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const found = (data.courses || []).find((c: any) => c.id === courseId);
        if (found) {
          setCourse({
            id: found.id,
            name: found.name,
            subject: found.subject ?? null,
            description: found.description ?? null,
            status: found.status,
            isOfficial: true,
            scope: "official",
            organizationId: found.organizationId,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
            counts: {
              modules: found.moduleCount ?? 0,
              lessons: found.lessonCount ?? 0,
              flashcards: found.flashcardCount ?? 0,
              quizzes: found.quizQuestionCount ?? 0,
            },
            product: found.product ?? null,
          });
          return;
        }
      }

      setIs404(true);
    } catch (err: unknown) {
      const e = err as Error;
      if (
        e.message?.includes("404") ||
        e.message?.includes("not_found") ||
        e.message?.includes("یافت نشد")
      ) {
        setIs404(true);
      } else {
        setError(e.message || "خطا در دریافت اطلاعات دوره");
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, adminApi]);

  useEffect(() => {
    void fetchCourse();
  }, [fetchCourse]);

  const isOfficial = course?.scope === "official" || Boolean(course?.isOfficial);

  // Resolve current active tab from searchParams
  const rawTab = searchParams.get("tab");
  const activeTab: CourseHubTab = useMemo(() => {
    if (rawTab === "sources") return "generation";
    if (isOfficial) {
      if (rawTab && (OFFICIAL_VALID_TABS as readonly string[]).includes(rawTab)) {
        return rawTab as CourseHubTab;
      }
      return "structure";
    } else {
      if (rawTab && (INSPECTION_VALID_TABS as readonly string[]).includes(rawTab)) {
        return rawTab as CourseHubTab;
      }
      return "structure";
    }
  }, [rawTab, isOfficial]);

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

  // Switcher courses query in the same scope
  const siblingCoursesQuery = useQuery({
    queryKey: ["admin", "courses-switcher", course?.scope],
    queryFn: async () => {
      if (!course?.scope) return [];
      const res = await adminApi.listCourses(1, 50, undefined, course.scope);
      return res.courses || [];
    },
    enabled: Boolean(course?.scope),
  });

  const handleSwitchCourse = (targetCourseId: string) => {
    if (!targetCourseId || targetCourseId === courseId) return;
    navigate(`/admin/courses/${targetCourseId}?tab=${activeTab}`);
  };

  // Convert AdminCourseRecord to OfficialCourse adapter for studio components
  const officialCourseAdapter = useMemo<OfficialCourse | null>(() => {
    if (!course) return null;
    return {
      id: course.id,
      organizationId: course.organizationId,
      name: course.name,
      description: course.description ?? null,
      subject: course.subject,
      status: (course.status as OfficialCourse["status"]) || "draft",
      isOfficial: Boolean(course.isOfficial),
      moduleCount: course.counts.modules,
      lessonCount: course.counts.lessons,
      flashcardCount: course.counts.flashcards,
      quizQuestionCount: course.counts.quizzes,
      product: course.product
        ? {
            id: course.product.id,
            code: course.product.code,
            name: course.name,
            price: course.product.price,
            currency: course.product.currency,
            active: course.product.active,
          }
        : null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt || course.createdAt,
    };
  }, [course]);

  const getStatusBadge = (status?: string) => {
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
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            {status || "پیش‌نویس"}
          </span>
        );
    }
  };

  // Loading state
  if (loading && !course) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]" dir="rtl">
        <Loader2 className="w-9 h-9 animate-spin text-[var(--color-primary-default)]" />
        <p className="text-sm font-medium">در حال بارگذاری اطلاعات دوره...</p>
      </div>
    );
  }

  // Real 404 state
  if (is404) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center space-y-4 max-w-xl mx-auto my-12 shadow-sm" dir="rtl">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">دوره مورد نظر یافت نشد</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          دوره با شناسه <span className="font-mono text-[var(--color-text)]">{courseId}</span> یافت نشد یا ممکن است حذف شده باشد.
        </p>
        <Link
          to="/admin/courses?tab=official"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm"
        >
          <ChevronRight className="w-4 h-4" />
          <span>بازگشت به لیست دوره‌ها</span>
        </Link>
      </div>
    );
  }

  // Network or Server Error state
  if (error && !course) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl border border-rose-500/20 p-10 text-center space-y-4 max-w-xl mx-auto my-12 shadow-sm bg-rose-500/5" dir="rtl">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">خطا در دریافت اطلاعات دوره</h3>
        <p className="text-xs text-rose-500/80">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fetchCourse()}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تلاش مجدد</span>
          </button>
          <Link
            to="/admin/courses?tab=official"
            className="px-5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold hover:bg-[var(--color-surface-subtle)] transition-colors"
          >
            بازگشت به فهرست
          </Link>
        </div>
      </div>
    );
  }

  if (!course) return null;

  const organizationId = course.organizationId || "";
  const backTab = course.scope === "teacher" ? "teacher" : course.scope === "user" ? "user" : "official";

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
              to={`/admin/courses?tab=${backTab}`}
              className="hover:text-[var(--color-primary-default)] transition-colors font-bold text-[var(--color-text)]"
            >
              {course.scope === "teacher"
                ? "دوره‌های اساتید"
                : course.scope === "user"
                ? "دوره‌های کاربران"
                : "دوره‌های رسمی آوانا"}
            </Link>
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />

            {/* Quick Course Switcher Dropdown */}
            {siblingCoursesQuery.data && siblingCoursesQuery.data.length > 0 && (
              <select
                value={course.id}
                onChange={(e) => handleSwitchCourse(e.target.value)}
                aria-label="انتخاب دوره آموزشی"
                className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-[var(--color-primary-default)] max-w-[200px] sm:max-w-xs truncate"
              >
                {siblingCoursesQuery.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status || "draft"})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export / Import Actions */}
            <button
              type="button"
              onClick={() => setIsExportOpen(true)}
              className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center gap-1.5"
              title="دریافت بسته خروجی محتوای دوره (ZIP)"
            >
              <FileCheck className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span>خروجی ZIP</span>
            </button>

            {isOfficial && (
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center gap-1.5"
                title="بارگذاری و درون‌ریزی بسته محتوایی دوره (ZIP)"
              >
                <UploadCloud className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                <span>ورود محتوا (ZIP)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchCourse()}
              disabled={loading}
              className="p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              title="به‌روزرسانی اطلاعات دوره"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Title, Category Badges & Metrics */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
                {course.name}
              </h1>
              {getStatusBadge(course.status)}

              {/* Scope Badge */}
              {isOfficial && (
                <span className="px-2.5 py-0.5 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] text-xs border border-[var(--color-primary-default)]/30 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>دوره رسمی آوانا</span>
                </span>
              )}

              {course.scope === "teacher" && (
                <span className="px-2.5 py-0.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs border border-blue-500/30 font-bold flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" />
                  <span>دوره استاد</span>
                </span>
              )}

              {course.scope === "user" && (
                <span className="px-2.5 py-0.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs border border-amber-500/30 font-bold flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>دوره شخصی کاربر</span>
                </span>
              )}

              {course.needsReview && (
                <span className="px-2.5 py-0.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs border border-amber-500/30 font-black flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>نیازمند بررسی مالکیت</span>
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
              <span className="font-bold">{course.counts.modules}</span>
              <span className="text-[11px] opacity-80">فصل</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-bold">{course.counts.lessons}</span>
              <span className="text-[11px] opacity-80">درس</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span className="font-bold">{course.counts.flashcards}</span>
              <span className="text-[11px] opacity-80">فلش‌کارت</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
              <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold">{course.counts.quizzes}</span>
              <span className="text-[11px] opacity-80">سؤال تستی</span>
            </div>

            {course.product && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <span>{formatToman(course.product.price)}</span>
                <span className="text-[10px] opacity-80">
                  {course.product.active ? "(فعال)" : "(پیش‌نویس)"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Teacher/User Course Submission Moderation Banner */}
      {pendingSubmission && (
        <div className={`border-2 rounded-2xl p-5 shadow-sm space-y-4 ${
          pendingSubmission.isUpdate
            ? "bg-blue-500/10 border-blue-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className={`w-5 h-5 shrink-0 ${pendingSubmission.isUpdate ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`} />
                <h3 className="text-base font-black text-[var(--color-text)]">
                  {pendingSubmission.isUpdate
                    ? "درخواست به‌روزرسانی دوره منتشرشده"
                    : "درخواست بررسی و انتشار دوره توسط مدرس"}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  pendingSubmission.isUpdate
                    ? "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                }`}>
                  {pendingSubmission.isUpdate
                    ? `نسخه به‌روزرسانی ${toPersianDigits(pendingSubmission.version)} (پایه: ${toPersianDigits(pendingSubmission.baseVersion || 1)})`
                    : `نسخه اولیه ${toPersianDigits(pendingSubmission.version)}`}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                این دوره توسط <strong className="text-[var(--color-text)]">{pendingSubmission.creator.name}</strong> ({pendingSubmission.creator.email || "بدون ایمیل"}) برای بررسی و {pendingSubmission.isUpdate ? "اعمال تغییرات در نسخه رسمی" : "اشتراک در کاتالوگ عمومی"} ارسال شده است. شما می‌توانید تمام درس‌ها، فلش‌کارت‌ها و آزمون‌های دوره را در برگه «ساختار و سرفصل‌ها» بررسی نمایید.
              </p>
              {pendingSubmission.isUpdate && (
                <div className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5 mt-2 flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>
                    نسخه فعلی دوره بدون وقفه در حال ارائه به دانشجویان در کاتالوگ رسمی است. درس‌ها و تغییرات پیش‌نویس جدید تنها پس از تأیید نهایی شما جایگزین و عمومی خواهند شد.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                data-testid="admin-approve-submission-button"
                onClick={() => {
                  let initialAccess: "free" | "paid" | null = null;
                  let initialPrice: number | undefined = undefined;

                  const rawPrice =
                    pendingSubmission.product?.price ??
                    pendingSubmission.product?.priceAmount ??
                    pendingSubmission.pricing?.price;

                  if (
                    pendingSubmission.accessType === "free" ||
                    pendingSubmission.pricing?.is_free === true
                  ) {
                    initialAccess = "free";
                    initialPrice = undefined;
                  } else if (
                    pendingSubmission.accessType === "paid" ||
                    (typeof rawPrice === "number" && rawPrice > 0)
                  ) {
                    initialAccess = "paid";
                    initialPrice = typeof rawPrice === "number" && rawPrice > 0 ? rawPrice : undefined;
                  } else {
                    initialAccess = null;
                    initialPrice = undefined;
                  }

                  setSubmissionAccessType(initialAccess);
                  setTargetPrice(initialPrice);
                  setApprovalNotes("");
                  setModerationError(null);
                  setApprovingSubmission(pendingSubmission);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{pendingSubmission.isUpdate ? "تأیید و اعمال به‌روزرسانی" : "تأیید و انتشار عمومی"}</span>
              </button>

              <button
                type="button"
                data-testid="admin-request-changes-button"
                onClick={() => {
                  setChangeRequestNotes("");
                  setModerationError(null);
                  setRequestingChangesSubmission(pendingSubmission);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold text-xs transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>درخواست اصلاحات</span>
              </button>

              <button
                type="button"
                data-testid="admin-reject-submission-button"
                onClick={() => {
                  setRejectionReason("");
                  setModerationError(null);
                  setRejectingSubmission(pendingSubmission);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-xs transition-all cursor-pointer"
              >
                <AlertCircle className="w-4 h-4" />
                <span>رد درخواست</span>
              </button>
            </div>
          </div>

          {/* Diff summary card if available */}
          {pendingSubmission.diffSummary && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 space-y-2.5 mt-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text)]">
                <GitCompare className="w-4 h-4 text-[var(--color-primary-default)]" />
                <span>خلاصه تغییرات نسبت به نسخه فعال (پایه {toPersianDigits(pendingSubmission.baseVersion || 1)})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <div className="font-bold">درس‌های جدید: {toPersianDigits(pendingSubmission.diffSummary.addedLessons?.length || 0)}</div>
                  {pendingSubmission.diffSummary.addedLessons?.length > 0 && (
                    <div className="text-[11px] truncate text-emerald-600 mt-0.5">
                      {pendingSubmission.diffSummary.addedLessons.map((l: any) => l.title).join("، ")}
                    </div>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                  <div className="font-bold">درس‌های ویرایش‌شده: {toPersianDigits(pendingSubmission.diffSummary.modifiedLessons?.length || 0)}</div>
                  {pendingSubmission.diffSummary.modifiedLessons?.length > 0 && (
                    <div className="text-[11px] truncate text-blue-600 mt-0.5">
                      {pendingSubmission.diffSummary.modifiedLessons.map((l: any) => l.title).join("، ")}
                    </div>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                  <div className="font-bold">درس‌های حذف‌شده: {toPersianDigits(pendingSubmission.diffSummary.deletedLessons?.length || 0)}</div>
                  {pendingSubmission.diffSummary.deletedLessons?.length > 0 && (
                    <div className="text-[11px] truncate text-rose-600 mt-0.5">
                      {pendingSubmission.diffSummary.deletedLessons.map((l: any) => l.title).join("، ")}
                    </div>
                  )}
                </div>
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
                  <div className="font-bold">سرفصل‌ها: +{toPersianDigits(pendingSubmission.diffSummary.addedChapters?.length || 0)} / ~{toPersianDigits(pendingSubmission.diffSummary.modifiedChapters?.length || 0)}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {pendingSubmission.diffSummary.titleChanged ? "تغییر عنوان دوره" : "عنوان دوره بدون تغییر"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs Navigation */}
      {isOfficial ? (
        /* Official Course Tabs (Full Content Studio) */
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
            <Sparkles className="w-4 h-4" />
            <span>۲. منابع و تولید خودکار</span>
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
            <span>۳. میز بازبینی پیش‌نویس‌ها</span>
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

          <button
            type="button"
            onClick={() => setTab("reports")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === "reports"
                ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>۶. گزارش‌های مشکل درسنامه</span>
          </button>
        </div>
      ) : (
        /* Teacher & User Courses Inspection Tabs */
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
            onClick={() => setTab("details")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === "details"
                ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
            }`}
          >
            <Info className="w-4 h-4" />
            <span>۲. مشخصات مالکیت و سیستم</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("reports")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === "reports"
                ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]"
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>۳. گزارش‌های مشکل درسنامه</span>
          </button>
        </div>
      )}

      {/* Main Tab Panel Content */}
      <div className="animate-in fade-in">
        {activeTab === "structure" && (
          <CourseStructurePanel courseId={course.id} />
        )}

        {isOfficial && officialCourseAdapter && (
          <>
            {activeTab === "generation" && (
              <SourceProductionPanel
                course={officialCourseAdapter}
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
                course={officialCourseAdapter}
                onSuccess={fetchCourse}
              />
            )}

            {activeTab === "settings" && (
              <CourseSettingsPanel
                course={officialCourseAdapter}
                onRefresh={fetchCourse}
              />
            )}
          </>
        )}

        {/* Dedicated Ownership & System Details Panel for Inspection */}
        {!isOfficial && activeTab === "details" && (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <Info className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>مشخصات فنی و مالکیت دوره</span>
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                اطلاعات ثبت‌شده در دیتابیس پیرامون سازنده، مالک حقوقی و کلاس‌های آموزشی متصل
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)] space-y-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)] block">شناسه دوره (Course ID)</span>
                <span className="font-mono text-xs text-[var(--color-text)] select-all block">{course.id}</span>
              </div>

              <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)] space-y-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)] block">شناسه سازمان مالک (Organization ID)</span>
                <span className="font-mono text-xs text-[var(--color-text)] select-all block">{course.organizationId || "نامشخص"}</span>
              </div>

              {course.teacher && (
                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 space-y-1">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" />
                    <span>استاد مسئول</span>
                  </span>
                  <div className="text-sm font-black text-[var(--color-text)]">{course.teacher.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{course.teacher.email}</div>
                </div>
              )}

              {course.classroom && (
                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 space-y-1">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 block flex items-center gap-1.5">
                    <School className="w-4 h-4" />
                    <span>کلاس درس متصل</span>
                  </span>
                  <div className="text-sm font-black text-[var(--color-text)]">{course.classroom.title}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    کد دعوت: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{course.classroom.inviteCode}</span>
                  </div>
                </div>
              )}

              {course.owner && (
                <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/20 space-y-1">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>مالک حساب / سازمان</span>
                  </span>
                  <div className="text-sm font-black text-[var(--color-text)]">{course.owner.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{course.owner.email}</div>
                </div>
              )}

              {course.creator && (
                <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)] space-y-1">
                  <span className="text-xs font-bold text-[var(--color-text-muted)] block">سازنده اولیه</span>
                  <div className="text-sm font-black text-[var(--color-text)]">{course.creator.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{course.creator.email}</div>
                </div>
              )}
            </div>

            <div className="p-4 bg-[var(--color-surface-subtle)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] space-y-1">
              <div>تاریخ ایجاد: {toPersianDigits(new Date(course.createdAt).toLocaleString("fa-IR"))}</div>
              {course.updatedAt && (
                <div>آخرین به‌روزرسانی: {toPersianDigits(new Date(course.updatedAt).toLocaleString("fa-IR"))}</div>
              )}
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <AdminContentReportsPanel
            courseId={course.id}
            title={`گزارش‌های مشکل درسنامه — ${course.name}`}
            description="بررسی و مدیریت اشکالات علمی، تایپی و نمایشی گزارش‌شده توسط کاربران در درسنامه‌های این دوره"
          />
        )}
      </div>

      {/* Content Export Modal */}
      <ContentExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        courses={[{ id: course.id, name: course.name }]}
      />

      {/* Content Import Modal */}
      {isOfficial && (
        <ContentImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            setIsImportOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", course.id] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
            void fetchCourse();
          }}
        />
      )}

      {/* Approve Submission Modal */}
      {approvingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>تأیید و انتشار عمومی دوره</span>
              </h3>
              <button
                type="button"
                onClick={() => setApprovingSubmission(null)}
                disabled={isSubmittingModeration}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با تأیید این درخواست، دوره «{course.name}» (نسخه {toPersianDigits(approvingSubmission.version)}) رسماً در فهرست دوره‌های آوانا منتشر شده و برای کاربران قابل مشاهده خواهد شد.
            </p>

            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  نوع دسترسی دوره (Access Type)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    htmlFor="submission-access-free"
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      submissionAccessType === "free"
                        ? "bg-[var(--color-surface-warm)] border-[var(--color-primary-default)] text-[var(--color-text)] ring-1 ring-[var(--color-primary-default)]/40"
                        : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)]"
                    }`}
                  >
                    <input
                      id="submission-access-free"
                      type="radio"
                      name="courseSubmissionAccessType"
                      checked={submissionAccessType === "free"}
                      onChange={() => {
                        setSubmissionAccessType("free");
                        setModerationError(null);
                      }}
                      disabled={isSubmittingModeration}
                      className="mt-0.5 text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
                    />
                    <div>
                      <span className="font-bold text-xs text-[var(--color-text)] block">
                        دوره رایگان (Free)
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] block mt-0.5 leading-snug">
                        دسترسی عمومی بدون پرداخت هزینه
                      </span>
                    </div>
                  </label>

                  <label
                    htmlFor="submission-access-paid"
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      submissionAccessType === "paid"
                        ? "bg-[var(--color-surface-warm)] border-[var(--color-primary-default)] text-[var(--color-text)] ring-1 ring-[var(--color-primary-default)]/40"
                        : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)]"
                    }`}
                  >
                    <input
                      id="submission-access-paid"
                      type="radio"
                      name="courseSubmissionAccessType"
                      checked={submissionAccessType === "paid"}
                      onChange={() => {
                        setSubmissionAccessType("paid");
                        setModerationError(null);
                      }}
                      disabled={isSubmittingModeration}
                      className="mt-0.5 text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)]"
                    />
                    <div>
                      <span className="font-bold text-xs text-[var(--color-text)] block">
                        دوره پولی (Paid)
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] block mt-0.5 leading-snug">
                        نیازمند خرید و پرداخت نقدی
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {submissionAccessType === "paid" && (
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                    قیمت فروش نهایی (تومان)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={targetPrice ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                      setTargetPrice(val);
                      if (moderationError) setModerationError(null);
                    }}
                    disabled={isSubmittingModeration}
                    placeholder="مثلاً ۵۰,۰۰۰ تومان"
                    className="w-full px-3 py-2 text-xs bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] disabled:opacity-50"
                  />
                  <span className="text-[11px] text-[var(--color-text-muted)] mt-1 block">
                    {targetPrice && targetPrice > 0
                      ? formatToman(targetPrice)
                      : "قیمت باید بزرگتر از صفر باشد."}
                  </span>
                </div>
              )}

              {submissionAccessType === "free" && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
                  این دوره پس از تأیید به صورت کاملاً رایگان برای تمام کاربران در دسترس خواهد بود.
                </div>
              )}

              {!submissionAccessType && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                  وضعیت دسترسی مشخص نیست؛ لطفاً یکی از گزینه‌های رایگان یا پولی را انتخاب نمایید.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                  یادداشت بررسی (اختیاری)
                </label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  disabled={isSubmittingModeration}
                  placeholder="توضیحاتی برای مدرس یا ثبت در سابقه بازبینی..."
                  className="w-full px-3 py-2 text-xs bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {moderationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
                {moderationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setApprovingSubmission(null)}
                disabled={isSubmittingModeration}
                className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleApproveSubmission}
                disabled={isSubmittingModeration}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmittingModeration && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأیید و انتشار</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Changes Modal */}
      {requestingChangesSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-500" />
                <span>درخواست اصلاحات از مدرس</span>
              </h3>
              <button
                type="button"
                onClick={() => setRequestingChangesSubmission(null)}
                disabled={isSubmittingModeration}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              توضیحات و موارد لازم برای اصلاح را برای مدرس «{pendingSubmission?.creator?.name}» بنویسید. دوره در وضعیت نیاز به اصلاح قرار خواهد گرفت و مدرس می‌تواند پس از اعمال موارد، دوره را مجدداً ارسال نماید.
            </p>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                توضیحات اصلاحات <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={changeRequestNotes}
                onChange={(e) => setChangeRequestNotes(e.target.value)}
                placeholder="مثلاً: لطفاً فایل صوتی درس سوم را با کیفیت بهتری بارگذاری کرده و تمرین پایانی فصل را کامل کنید..."
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            {moderationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
                {moderationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setRequestingChangesSubmission(null)}
                disabled={isSubmittingModeration}
                className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleRequestChanges}
                disabled={isSubmittingModeration || !changeRequestNotes.trim()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmittingModeration && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ارسال درخواست اصلاحات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Submission Modal */}
      {rejectingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                <span>
                  {rejectingSubmission.isUpdate
                    ? "رد درخواست به‌روزرسانی دوره"
                    : "رد درخواست انتشار دوره"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectingSubmission(null)}
                disabled={isSubmittingModeration}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              لطفاً علت رد درخواست {rejectingSubmission.isUpdate ? "به‌روزرسانی" : "انتشار"} دوره «{course.name}» را ذکر کنید. این بازخورد در اختیار مدرس قرار خواهد گرفت تا اصلاحات لازم را انجام دهد.
            </p>

            {rejectingSubmission.isUpdate && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                توجه: رد این درخواست به‌روزرسانی تأثیری بر نسخه در حال انتشار دوره نخواهد داشت و دوره در کاتالوگ عمومی بدون وقفه فعال باقی می‌ماند.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1">
                علت رد درخواست <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="مثلاً: کیفیت محتوای فصل ۲ نیازمند بازبینی و اصلاح است یا منابع کافی پیوست نشده است..."
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
              />
            </div>

            {moderationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
                {moderationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setRejectingSubmission(null)}
                disabled={isSubmittingModeration}
                className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleRejectSubmission}
                disabled={isSubmittingModeration || !rejectionReason.trim()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmittingModeration && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ثبت و رد درخواست</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
