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
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Panel Intro */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-teal-400" />
            <span>تنظیمات و متادیتای دوره</span>
          </h3>
          <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
            {course.status === "archived" ? "بایگانی شده" : "دوره فعال"}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          ویرایش مشخصات اصلی دوره، مشاهده شناسه‌های سیستمی و مدیریت وضعیت چرخه حیات دوره.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Edit Metadata Form */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleSaveMetadata}
            className="bg-slate-900/40 rounded-3xl border border-slate-800 p-6 space-y-5 shadow-lg"
          >
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>اطلاعات پایه دوره</span>
            </h4>

            {saveError && (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>مشخصات دوره با موفقیت ذخیره شد.</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  نام دوره <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: فارماکولوژی جامع بالینی"
                  disabled={saving}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  رشته / موضوع تخصصی
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: داروسازی، پزشکی، هوش مصنوعی"
                  disabled={saving}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </div>

              {course.description && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">
                    توضیحات دوره (ثبت شده در ایجاد)
                  </label>
                  <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    {course.description}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving || (name === course.name && subject === (course.subject || ""))}
                className="px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-md shadow-teal-950/50 flex items-center gap-2"
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
          <div className="bg-rose-950/20 rounded-3xl border border-rose-500/20 p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">بایگانی و غیرفعال‌سازی دوره</h4>
            </div>

            <p className="text-xs text-rose-300/80 leading-relaxed">
              با بایگانی این دوره، فروش آن در کاتالوگ متوقف شده و وضعیت دوره به حالت بایگانی درمی‌آید. تمام محتوا، درخت سرفصل‌ها و فلش‌کارت‌ها حفظ خواهند شد اما برای کاربران جدید غیرقابل خرید خواهد بود.
            </p>

            {archiveError && (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{archiveError}</span>
              </div>
            )}

            {archiveSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>دوره با موفقیت بایگانی شد.</span>
              </div>
            )}

            {course.status === "archived" ? (
              <div className="text-xs font-bold text-rose-400/90 bg-rose-950/40 px-4 py-2.5 rounded-2xl border border-rose-500/30 inline-block">
                این دوره در حال حاضر بایگانی شده است.
              </div>
            ) : (
              <div>
                {!showArchiveConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(true)}
                    className="px-5 py-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    <span>بایگانی کردن این دوره</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 space-y-3">
                    <p className="text-xs font-bold text-rose-200">
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
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
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
          <div className="bg-rose-950/20 rounded-3xl border border-rose-500/20 p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">حذف قطعی و دائمی دوره</h4>
            </div>

            <p className="text-xs text-rose-300/80 leading-relaxed">
              حذف قطعی و برگشت‌ناپذیر دوره، تمام ساختار آموزشی، درس‌ها، فلش‌کارت‌ها، آزمون‌ها و پیش‌نویس‌های تولیدشده هوش مصنوعی را پاک خواهد کرد. دوره‌های دارای سابقه خرید یا دسترسی کاربران قابل حذف قطعی نیستند و باید بایگانی شوند.
            </p>

            <div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-5 py-2.5 rounded-2xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف قطعی این دوره</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: System Metadata & Status */}
        <div className="space-y-6">
          <div className="bg-slate-900/40 rounded-3xl border border-slate-800 p-6 space-y-4 shadow-lg">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <span>مشخصات و شناسه‌ها</span>
            </h4>

            <div className="space-y-3.5 text-xs divide-y divide-slate-800/80">
              <div className="pt-2">
                <div className="text-slate-400 text-[11px] mb-1">شناسه یکتای دوره (Course ID)</div>
                <div className="flex items-center justify-between gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300">
                  <span className="truncate">{course.id}</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
                    title="کپی شناسه"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {course.organizationId && (
                <div className="pt-3">
                  <div className="text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-500" />
                    <span>شناسه سازمان مالک</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-xl border border-slate-800 truncate">
                    {course.organizationId}
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between">
                <span className="text-slate-400">وضعیت محتوا:</span>
                <span className="font-bold text-slate-200 capitalize">{course.status}</span>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <span className="text-slate-400">نوع دوره:</span>
                <span className="text-teal-300 font-medium">
                  {course.isOfficial ? "رسمی (Official)" : "عمومی / سازمانی"}
                </span>
              </div>

              <div className="pt-3">
                <div className="text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-slate-500" />
                  <span>وضعیت محصول تجاری</span>
                </div>
                {course.product ? (
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">قیمت:</span>
                      <span className="font-bold text-emerald-400">
                        {course.product.price.toLocaleString("fa-IR")} تومان
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px]">وضعیت فروش:</span>
                      <span className="text-[11px]">
                        {course.product.active ? "🟢 فعال در کاتالوگ" : "🟡 پیش‌نویس قیمت"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-[11px]">محصولی تعریف نشده است</div>
                )}
              </div>

              {course.createdAt && (
                <div className="pt-3 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>تاریخ ایجاد:</span>
                  </span>
                  <span className="text-slate-300" dir="ltr">
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
