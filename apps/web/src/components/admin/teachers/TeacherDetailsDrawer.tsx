import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  X,
  GraduationCap,
  BookOpen,
  FileText,
  Activity,
  User,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Users,
  Award,
  Layers,
  XCircle,
  AlertTriangle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { AdminTeacherOverview } from "../../../lib/api/admin.js";
import { toPersianDigits } from "@avana/domain";
import { Badge, Button } from "../../ui/index.js";

interface TeacherDetailsDrawerProps {
  isOpen: boolean;
  teacherId: string | null;
  onClose: () => void;
  onStatusChange?: () => void;
}

type TabType = "info" | "classrooms" | "exams" | "activity";

export function TeacherDetailsDrawer({
  isOpen,
  teacherId,
  onClose,
  onStatusChange,
}: TeacherDetailsDrawerProps) {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();
  const [overview, setOverview] = useState<AdminTeacherOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("info");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const fetchOverview = async () => {
    if (!teacherId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminApi.getTeacherOverview(teacherId);
      setOverview(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "خطا در دریافت اطلاعات و سوابق استاد";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && teacherId) {
      setActiveTab("info");
      setShowRejectConfirm(false);
      setRejectReason("");
      setActionError(null);
      void fetchOverview();
    } else {
      setOverview(null);
      setErrorMsg(null);
      setActionError(null);
      setShowRejectConfirm(false);
    }
  }, [isOpen, teacherId]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showRejectConfirm) {
          setShowRejectConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, showRejectConfirm]);

  const handleCopyInviteCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleApprove = async () => {
    if (!teacherId) return;
    setIsActionLoading(true);
    setActionError(null);
    try {
      await adminApi.approveTeacher(teacherId);
      await queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "teacher-overview", teacherId] });
      void fetchOverview();
      onStatusChange?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در تأیید استاد";
      setActionError(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!teacherId) return;
    setIsActionLoading(true);
    setActionError(null);
    try {
      await adminApi.rejectTeacher(teacherId, rejectReason.trim() || undefined);
      setShowRejectConfirm(false);
      setRejectReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "teacher-overview", teacherId] });
      void fetchOverview();
      onStatusChange?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در رد درخواست استاد";
      setActionError(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  if (!isOpen || !teacherId) return null;

  const currentTeacherStatus = overview?.teacher.teacherStatus || "approved";

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="جزئیات و پرونده مدیریتی استاد"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 start-0 max-w-full flex ps-0 sm:ps-10">
        <div className="w-full max-w-3xl bg-[var(--color-surface)] border-e border-[var(--color-border)] shadow-2xl flex flex-col font-sans text-[var(--color-text)]">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 flex items-center justify-center text-[var(--color-primary-default)] shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--color-text)] truncate">
                    {overview?.teacher.name || "پرونده استاد"}
                  </h2>
                  {currentTeacherStatus === "approved" && (
                    <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3 h-3" />}>
                      تأیید شده
                    </Badge>
                  )}
                  {currentTeacherStatus === "pending" && (
                    <Badge variant="warning" size="sm" icon={<Clock className="w-3 h-3" />}>
                      در انتظار تأیید
                    </Badge>
                  )}
                  {currentTeacherStatus === "rejected" && (
                    <Badge variant="error" size="sm" icon={<XCircle className="w-3 h-3" />}>
                      رد شده
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5 truncate">
                  {overview?.teacher.email || teacherId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/teacher"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-medium transition-colors shadow-sm"
                title="ورود به پنل استاد"
              >
                <span>ورود به پنل استاد</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                aria-label="بستن پنجره"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] overflow-x-auto no-scrollbar shrink-0" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "info"}
              data-testid="tab-info"
              onClick={() => setActiveTab("info")}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "info"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <User className="w-4 h-4" />
              <span>اطلاعات استاد</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "classrooms"}
              data-testid="tab-classrooms"
              onClick={() => setActiveTab("classrooms")}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "classrooms"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>کلاس‌ها و دوره‌ها</span>
              {overview && (
                <span className="bg-[var(--color-surface-warm)] px-1.5 py-0.5 rounded-full text-[10px]">
                  {toPersianDigits(overview.classrooms.length)}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "exams"}
              data-testid="tab-exams"
              onClick={() => setActiveTab("exams")}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "exams"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>آزمون‌ها</span>
              {overview && (
                <span className="bg-[var(--color-surface-warm)] px-1.5 py-0.5 rounded-full text-[10px]">
                  {toPersianDigits(overview.exams.length)}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "activity"}
              data-testid="tab-activity"
              onClick={() => setActiveTab("activity")}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "activity"
                  ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>فعالیت‌های آموزشی و نتایج</span>
              {overview && (
                <span className="bg-[var(--color-surface-warm)] px-1.5 py-0.5 rounded-full text-[10px]">
                  {toPersianDigits(overview.recentActivity.length)}
                </span>
              )}
            </button>
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-muted)] gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
                <span className="text-sm">در حال بارگذاری اطلاعات استاد...</span>
              </div>
            )}

            {errorMsg && !isLoading && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold">خطا در بارگذاری پرونده</p>
                  <p className="text-xs">{errorMsg}</p>
                  <Button size="sm" variant="secondary" onClick={() => void fetchOverview()}>
                    تلاش مجدد
                  </Button>
                </div>
              </div>
            )}

            {actionError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isLoading && !errorMsg && overview && (
              <>
                {/* TAB 1: اطلاعات استاد */}
                {activeTab === "info" && (
                  <div className="space-y-6">
                    {/* Status Management Bar */}
                    <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-[var(--color-primary-default)] shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-[var(--color-text)]">
                            وضعیت احراز و صلاحیت تدریس
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {currentTeacherStatus === "approved" && "استاد تأیید شده است و مجاز به برگزاری کلاس و آزمون می‌باشد."}
                            {currentTeacherStatus === "pending" && "درخواست تدریس در انتظار بررسی و تصمیم‌گیری مدیر پلتفرم است."}
                            {currentTeacherStatus === "rejected" && "درخواست تدریس این کاربر توسط مدیریت رد شده است."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {currentTeacherStatus !== "approved" && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void handleApprove()}
                            disabled={isActionLoading}
                            data-testid="drawer-approve-btn"
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin ms-1" />
                            ) : (
                              <Check className="w-3.5 h-3.5 ms-1 text-emerald-300" />
                            )}
                            <span>تأیید استاد</span>
                          </Button>
                        )}

                        {currentTeacherStatus !== "rejected" && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setShowRejectConfirm(true)}
                            disabled={isActionLoading}
                            data-testid="drawer-reject-btn"
                          >
                            <XCircle className="w-3.5 h-3.5 ms-1" />
                            <span>رد استاد</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Stat Tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-1">
                        <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                          کلاس‌ها
                        </span>
                        <span className="text-xl font-bold text-[var(--color-text)]">
                          {toPersianDigits(overview.stats.classroomsCount)}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-1">
                        <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          آزمون‌ها
                        </span>
                        <span className="text-xl font-bold text-[var(--color-text)]">
                          {toPersianDigits(overview.stats.examsCount)}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-1">
                        <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-emerald-500" />
                          دانشجویان
                        </span>
                        <span className="text-xl font-bold text-[var(--color-text)]">
                          {toPersianDigits(overview.stats.studentsCount)}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex flex-col gap-1">
                        <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-amber-500" />
                          پاسخ‌ها
                        </span>
                        <span className="text-xl font-bold text-[var(--color-text)]">
                          {toPersianDigits(overview.stats.attemptsCount)}
                        </span>
                      </div>
                    </div>

                    {/* Basic Info Details */}
                    <div className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] p-5 space-y-4">
                      <h3 className="text-sm font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2.5 flex items-center gap-2">
                        <User className="w-4 h-4 text-[var(--color-primary-default)]" />
                        مشخصات حساب کاربری
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">نام و نام خانوادگی:</span>
                          <p className="font-semibold text-[var(--color-text)]">
                            {overview.teacher.name || "ثبت نشده"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">ایمیل:</span>
                          <p className="font-semibold text-[var(--color-text)] font-mono">
                            {overview.teacher.email}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">وضعیت صلاحیت تدریس:</span>
                          <div>
                            {currentTeacherStatus === "approved" && (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                تأیید شده (مجاز)
                              </span>
                            )}
                            {currentTeacherStatus === "pending" && (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                                <Clock className="w-3.5 h-3.5" />
                                در انتظار تأیید مدیریت
                              </span>
                            )}
                            {currentTeacherStatus === "rejected" && (
                              <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                <XCircle className="w-3.5 h-3.5" />
                                رد شده
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">وضعیت ایمیل:</span>
                          <div>
                            {overview.teacher.emailVerified ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                <Mail className="w-3.5 h-3.5" />
                                ایمیل تأیید شده
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                                <Mail className="w-3.5 h-3.5" />
                                در انتظار تأیید ایمیل
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">نقش در سیستم:</span>
                          <p className="font-semibold text-[var(--color-text)]">
                            استاد (معلم)
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[var(--color-text-muted)]">تاریخ عضویت:</span>
                          <p className="font-semibold text-[var(--color-text)]">
                            {overview.teacher.createdAt
                              ? toPersianDigits(new Date(overview.teacher.createdAt).toLocaleDateString("fa-IR"))
                              : "نامشخص"}
                          </p>
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <span className="text-[var(--color-text-muted)]">آخرین به‌روزرسانی / فعالیت:</span>
                          <p className="font-semibold text-[var(--color-text)]">
                            {overview.teacher.lastActiveAt
                              ? toPersianDigits(new Date(overview.teacher.lastActiveAt).toLocaleString("fa-IR"))
                              : "نامشخص"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: کلاس‌ها و دوره‌ها */}
                {activeTab === "classrooms" && (
                  <div className="space-y-4">
                    {overview.classrooms.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] space-y-2">
                        <BookOpen className="w-8 h-8 mx-auto opacity-40" />
                        <p className="text-sm font-semibold">هیچ کلاسی برای این استاد ثبت نشده است.</p>
                        <p className="text-xs">استاد تاکنون کلاسی ایجاد نکرده است.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {overview.classrooms.map((c) => (
                          <div
                            key={c.id}
                            className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary-default)]/40 transition-all space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <h4 className="text-sm font-bold text-[var(--color-text)]">
                                  {c.title}
                                </h4>
                                {c.description && (
                                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                                    {c.description}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                                  c.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : "bg-gray-500/10 text-gray-500 border border-gray-500/20"
                                }`}
                              >
                                {c.status === "active" ? "فعال" : "آرشیو شده"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                              <div>
                                <span>کد دعوت: </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyInviteCode(c.inviteCode)}
                                  className="font-mono font-bold text-[var(--color-primary-default)] inline-flex items-center gap-1 hover:underline cursor-pointer"
                                  title="کپی کد دعوت"
                                >
                                  <span>{c.inviteCode}</span>
                                  {copiedCode === c.inviteCode ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>

                              <div>
                                <span>دوره متصل: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {c.courseTitle || "بدون دوره"}
                                </span>
                              </div>

                              <div>
                                <span>دانشجویان: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {toPersianDigits(c.membersCount)} نفر
                                </span>
                              </div>

                              <div>
                                <span>آزمون‌ها: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {toPersianDigits(c.examsCount)} آزمون
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: آزمون‌ها */}
                {activeTab === "exams" && (
                  <div className="space-y-4">
                    {overview.exams.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] space-y-2">
                        <FileText className="w-8 h-8 mx-auto opacity-40" />
                        <p className="text-sm font-semibold">هیچ آزمونی برای این استاد ثبت نشده است.</p>
                        <p className="text-xs">استاد تاکنون آزمونی طراحی نکرده است.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {overview.exams.map((e) => (
                          <div
                            key={e.id}
                            className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary-default)]/40 transition-all space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <h4 className="text-sm font-bold text-[var(--color-text)]">
                                  {e.title}
                                </h4>
                                <p className="text-xs text-[var(--color-text-muted)]">
                                  کلاس: <span className="font-semibold text-[var(--color-text)]">{e.classroomTitle}</span>
                                </p>
                              </div>

                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                                  e.status === "published"
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : e.status === "closed"
                                    ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                    : "bg-gray-500/10 text-gray-500 border border-gray-500/20"
                                }`}
                              >
                                {e.status === "published"
                                  ? "منتشر شده"
                                  : e.status === "closed"
                                  ? "پایان‌یافته"
                                  : "پیش‌نویس"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                              <div>
                                <span>مدت زمان: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {e.durationMinutes ? `${toPersianDigits(e.durationMinutes)} دقیقه` : "نامحدود"}
                                </span>
                              </div>

                              <div>
                                <span>تعداد سوالات: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {toPersianDigits(e.questionsCount)} سؤال
                                </span>
                              </div>

                              <div>
                                <span>شرکت‌کنندگان: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {toPersianDigits(e.attemptsCount)} نفر
                                </span>
                              </div>

                              <div>
                                <span>میانگین نمرات: </span>
                                <span className="font-semibold text-[var(--color-text)]">
                                  {e.averageScore !== null ? `${toPersianDigits(e.averageScore)}٪` : "ثبت نشده"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: فعالیت‌های آموزشی و نتایج */}
                {activeTab === "activity" && (
                  <div className="space-y-4">
                    {overview.recentActivity.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] space-y-2">
                        <Activity className="w-8 h-8 mx-auto opacity-40" />
                        <p className="text-sm font-semibold">هیچ فعالیت یا پاسخ آزمونی ثبت نشده است.</p>
                        <p className="text-xs">دانشجویان هنوز پاسخی در آزمون‌های این استاد ثبت نکرده‌اند.</p>
                      </div>
                    ) : (
                      <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden bg-[var(--color-surface)]">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-right">
                            <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)] font-semibold">
                              <tr>
                                <th className="py-3 px-4">دانش‌آموز</th>
                                <th className="py-3 px-4">آزمون</th>
                                <th className="py-3 px-4">وضعیت</th>
                                <th className="py-3 px-4">نمره</th>
                                <th className="py-3 px-4">نتیجه</th>
                                <th className="py-3 px-4">زمان ثبت</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                              {overview.recentActivity.map((a) => (
                                <tr key={a.attemptId} className="hover:bg-[var(--color-surface-warm)]/50 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-[var(--color-text)]">{a.studentName}</div>
                                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono">{a.studentEmail}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-[var(--color-text)]">{a.examTitle}</div>
                                    <div className="text-[10px] text-[var(--color-text-muted)]">{a.classroomTitle}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                        a.status === "graded" || a.status === "submitted"
                                          ? "bg-emerald-500/10 text-emerald-600"
                                          : a.status === "in_progress"
                                          ? "bg-blue-500/10 text-blue-600"
                                          : "bg-amber-500/10 text-amber-600"
                                      }`}
                                    >
                                      {a.status === "graded"
                                        ? "تصحیح‌شده"
                                        : a.status === "submitted"
                                        ? "ارسال‌شده"
                                        : a.status === "in_progress"
                                        ? "در حال آزمون"
                                        : "پایان مهلت"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold text-[var(--color-text)]">
                                    {a.percentage !== null
                                      ? `${toPersianDigits(a.percentage)}٪`
                                      : a.score !== null
                                      ? toPersianDigits(a.score)
                                      : "-"}
                                  </td>
                                  <td className="py-3 px-4">
                                    {a.passed === true ? (
                                      <span className="text-emerald-600 font-bold">قبول</span>
                                    ) : a.passed === false ? (
                                      <span className="text-red-500 font-bold">مردود</span>
                                    ) : (
                                      <span className="text-[var(--color-text-muted)]">-</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-[var(--color-text-muted)] whitespace-nowrap">
                                    {a.submittedAt || a.startedAt
                                      ? toPersianDigits(new Date(a.submittedAt || a.startedAt).toLocaleString("fa-IR"))
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rejection Confirmation Modal inside Drawer */}
          {showRejectConfirm && (
            <div
              className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs"
              dir="rtl"
              role="dialog"
              aria-modal="true"
              aria-label="تأیید رد صلاحیت استاد"
            >
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center gap-3 text-red-600">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h3 className="text-base font-bold text-[var(--color-text)]">
                    تأیید رد صلاحیت استاد
                  </h3>
                </div>

                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  آیا از رد درخواست یا لغو صلاحیت تدریس کاربر{" "}
                  <strong className="text-[var(--color-text)]">
                    {overview?.teacher.name || overview?.teacher.email}
                  </strong>{" "}
                  اطمینان دارید؟ با این کار، استاد مجاز به فعالیت نخواهد بود.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="drawer-reject-reason" className="text-xs font-semibold text-[var(--color-text)]">
                    علت رد درخواست (اختیاری):
                  </label>
                  <textarea
                    id="drawer-reject-reason"
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="توضیحات یا علت رد صلاحیت..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRejectConfirm(false)}
                    disabled={isActionLoading}
                  >
                    انصراف
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void handleReject()}
                    disabled={isActionLoading}
                    data-testid="confirm-reject-drawer-btn"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin ms-1" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 ms-1" />
                    )}
                    <span>تأیید و رد صلاحیت</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
