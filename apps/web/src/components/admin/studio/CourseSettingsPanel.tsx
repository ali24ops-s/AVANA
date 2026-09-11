import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Archive,
  Copy,
  Check,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import type { OfficialCourse } from "../../../lib/api/admin.js";
import { AdminCourseDeleteModal } from "../courses/AdminCourseDeleteModal.js";

export interface CourseSettingsPanelProps {
  course: OfficialCourse;
  onRefresh: () => void | Promise<void>;
}

export function CourseSettingsPanel({ course, onRefresh }: CourseSettingsPanelProps) {
  const adminApi = useAdmin();
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState(course.name || "");
  const [subject, setSubject] = useState(course.subject || "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Archive state
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccess, setArchiveSuccess] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Copy state
  const [copiedId, setCopiedId] = useState(false);

  // Sync internal form state if incoming course prop changes
  useEffect(() => {
    setName(course.name || "");
    setSubject(course.subject || "");
  }, [course.name, course.subject]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(course.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setSaveError("نام دوره نمی‌تواند خالی باشد.");
      return;
    }

    try {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      const res = await adminApi.updateCourseMetadata(course.id, {
        name: name.trim(),
        subject: subject.trim() || undefined,
      });

      if (res && res.success) {
        setSaveSuccess(true);
        await onRefresh();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        throw new Error("خطا در ذخیره مشخصات دوره");
      }
    } catch (err: unknown) {
      const e = err as Error;
      setSaveError(e.message || "خطا در برقراری ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveCourse = async () => {
    try {
      setIsArchiving(true);
      setArchiveError(null);
      setArchiveSuccess(false);

      const res = await adminApi.archiveOfficialCourse(course.id);
      if (res && res.success) {
        setArchiveSuccess(true);
        setShowArchiveConfirm(false);
        await onRefresh();
      } else {
        throw new Error("عملیات بایگانی با خطا مواجه شد.");
      }
    } catch (err: unknown) {
      const e = err as Error;
      setArchiveError(e.message || "خطا در بایگانی دوره");
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6 text-[var(--color-text)]" dir="rtl">
      {/* Panel Intro */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>تنظیمات و متادیتای دوره</span>
          </h3>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] px-3 py-1 rounded-lg border border-[var(--color-border)]">
            {course.status === "archived" ? "بایگانی شده" : "دوره فعال"}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          ویرایش مشخصات اصلی دوره، مشاهده شناسه‌های سیستمی و مدیریت وضعیت چرخه حیات دوره.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Edit Metadata Form */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleSaveMetadata}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-5 shadow-sm"
          >
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <span>اطلاعات پایه دوره</span>
            </h4>

            {saveError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>مشخصات دوره با موفقیت ذخیره شد.</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  نام دوره <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: فارماکولوژی جامع بالینی"
                  disabled={saving}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-2">
                  رشته / موضوع تخصصی
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: داروسازی، پزشکی، هوش مصنوعی"
                  disabled={saving}
                  className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
                />
              </div>

              {course.description && (
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-2">
                    توضیحات دوره (ثبت شده در ایجاد)
                  </label>
                  <div className="p-3.5 rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {course.description}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-end">
              <button
                type="submit"
                disabled={saving || (name === course.name && subject === (course.subject || ""))}
                className="px-6 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--color-primary-contrast)] text-xs font-bold transition-all shadow-sm flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </form>

          {/* Danger Zone: Archiving */}
          <div className="bg-rose-500/5 rounded-2xl border border-rose-500/20 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">بایگانی و غیرفعال‌سازی دوره</h4>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با بایگانی این دوره، فروش آن در کاتالوگ متوقف شده و وضعیت دوره به حالت بایگانی درمی‌آید. تمام محتوا، درخت سرفصل‌ها و فلش‌کارت‌ها حفظ خواهند شد اما برای کاربران جدید غیرقابل خرید خواهد بود.
            </p>

            {archiveError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{archiveError}</span>
              </div>
            )}

            {archiveSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>دوره با موفقیت بایگانی شد.</span>
              </div>
            )}

            {course.status === "archived" ? (
              <div className="text-xs font-bold text-rose-500 bg-rose-500/10 px-4 py-2.5 rounded-xl border border-rose-500/20 inline-block">
                این دوره در حال حاضر بایگانی شده است.
              </div>
            ) : (
              <div>
                {!showArchiveConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(true)}
                    className="px-5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span>بایگانی کردن این دوره</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                    <p className="text-xs font-bold text-[var(--color-text)]">
                      آیا از بایگانی کردن این دوره اطمینان کامل دارید؟
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleArchiveCourse}
                        disabled={isArchiving}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-2"
                      >
                        {isArchiving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                        <span>بله، بایگانی کن</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowArchiveConfirm(false)}
                        disabled={isArchiving}
                        className="px-4 py-2 rounded-xl bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Danger Zone: Permanent Deletion */}
          <div className="bg-rose-500/5 rounded-2xl border border-rose-500/20 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-rose-500">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">حذف قطعی و دائمی دوره</h4>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              حذف قطعی و برگشت‌ناپذیر دوره، تمام ساختار آموزشی، درس‌ها، فلش‌کارت‌ها، آزمون‌ها و پیش‌نویس‌های تولیدشده هوش مصنوعی را پاک خواهد کرد. دوره‌های دارای سابقه خرید یا دسترسی کاربران قابل حذف قطعی نیستند و باید بایگانی شوند.
            </p>

            <div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف قطعی این دوره</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: System Metadata & Status */}
        <div className="space-y-6">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-4 shadow-sm">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--color-primary-default)]" />
              <span>مشخصات و شناسه‌ها</span>
            </h4>

            <div className="space-y-3.5 text-xs divide-y divide-[var(--color-border)]">
              <div className="pt-2">
                <div className="text-[var(--color-text-muted)] text-[11px] mb-1">شناسه یکتای دوره (Course ID)</div>
                <div className="flex items-center justify-between gap-2 bg-[var(--color-surface-subtle)] p-2.5 rounded-xl border border-[var(--color-border)] font-mono text-[11px] text-[var(--color-text)]">
                  <span className="truncate">{course.id}</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
                    title="کپی شناسه"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {course.organizationId && (
                <div className="pt-3">
                  <div className="text-[var(--color-text-muted)] text-[11px] mb-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span>شناسه سازمان مالک</span>
                  </div>
                  <div className="font-mono text-[11px] text-[var(--color-text)] bg-[var(--color-surface-subtle)] p-2 rounded-xl border border-[var(--color-border)] truncate">
                    {course.organizationId}
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">وضعیت محتوا:</span>
                <span className="font-bold text-[var(--color-text)] capitalize">{course.status}</span>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">نوع دوره:</span>
                <span className="text-[var(--color-primary-default)] font-medium">
                  {course.isOfficial ? "رسمی (Official)" : "عمومی / سازمانی"}
                </span>
              </div>

              <div className="pt-3">
                <div className="text-[var(--color-text-muted)] text-[11px] mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-[var(--color-text-muted)]" />
                  <span>وضعیت محصول تجاری</span>
                </div>
                {course.product ? (
                  <div className="bg-[var(--color-surface-subtle)] p-2.5 rounded-xl border border-[var(--color-border)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-muted)] text-[11px]">قیمت:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {course.product.price.toLocaleString("fa-IR")} تومان
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-muted)] text-[11px]">وضعیت فروش:</span>
                      <span className="text-[11px]">
                        {course.product.active ? "🟢 فعال در کاتالوگ" : "🟡 پیش‌نویس قیمت"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[var(--color-text-muted)] text-[11px]">محصولی تعریف نشده است</div>
                )}
              </div>

              {course.createdAt && (
                <div className="pt-3 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span>تاریخ ایجاد:</span>
                  </span>
                  <span className="text-[var(--color-text)]" dir="ltr">
                    {new Date(course.createdAt).toLocaleDateString("fa-IR")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AdminCourseDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        course={course}
        onSuccess={() => {
          navigate("/admin/courses", { replace: true });
        }}
      />
    </div>
  );
}
