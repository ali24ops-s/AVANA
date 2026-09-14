import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAdmin } from "../../hooks/useAdmin.js";
import {
  ChevronRight,
  ChevronLeft,
  Filter,
  Search,
  Eye,
  BrainCircuit,
  Ban,
  Sparkles,
  BookOpen,
  FileText,
  HelpCircle,
  Layers,
  X,
} from "lucide-react";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { ContentReviewDetail } from "../../components/review/ContentReviewDetail.js";
import type {
  AdminGenerationJobRecord,
  AdminRejectedContentRecord,
} from "../../lib/api/admin.js";

type GenerationTab = "jobs" | "rejected";

export function AdminGenerationPage() {
  const adminApi = useAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: GenerationTab =
    searchParams.get("tab") === "rejected" ? "rejected" : "jobs";

  const setTab = (tab: GenerationTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "rejected") {
        next.set("tab", "rejected");
      } else {
        next.delete("tab");
      }
      return next;
    });
  };

  // Jobs state
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsStatusFilter, setJobsStatusFilter] = useState<string>("");
  const [jobsSearchInput, setJobsSearchInput] = useState("");
  const [jobsSearchTerm, setJobsSearchTerm] = useState("");

  // Rejected content state
  const [rejectedPage, setRejectedPage] = useState(1);
  const [rejectedTypeFilter, setRejectedTypeFilter] = useState<string>("");
  const [rejectedSearchInput, setRejectedSearchInput] = useState("");
  const [rejectedSearchTerm, setRejectedSearchTerm] = useState("");
  const [selectedRejectedItem, setSelectedRejectedItem] =
    useState<AdminRejectedContentRecord | null>(null);

  const pageSize = 20;

  // Debounced search for jobs
  useEffect(() => {
    const timer = setTimeout(() => {
      setJobsSearchTerm(jobsSearchInput);
      setJobsPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [jobsSearchInput]);

  // Debounced search for rejected content
  useEffect(() => {
    const timer = setTimeout(() => {
      setRejectedSearchTerm(rejectedSearchInput);
      setRejectedPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [rejectedSearchInput]);

  // Query: Jobs Queue
  const {
    data: jobsData,
    isLoading: isJobsLoading,
    isError: isJobsError,
    error: jobsError,
  } = useQuery({
    queryKey: [
      "admin",
      "generation",
      jobsPage,
      jobsStatusFilter,
      jobsSearchTerm,
    ],
    queryFn: () =>
      adminApi.listGenerationJobs(
        jobsPage,
        pageSize,
        jobsStatusFilter,
        jobsSearchTerm,
      ),
    placeholderData: (prev) => prev,
    enabled: activeTab === "jobs",
  });

  // Query: Rejected Contents
  const {
    data: rejectedData,
    isLoading: isRejectedLoading,
    isError: isRejectedError,
    error: rejectedError,
  } = useQuery({
    queryKey: [
      "admin",
      "generation",
      "rejected",
      rejectedPage,
      rejectedTypeFilter,
      rejectedSearchTerm,
    ],
    queryFn: () =>
      adminApi.listRejectedContents({
        page: rejectedPage,
        pageSize,
        type: rejectedTypeFilter || undefined,
        search: rejectedSearchTerm || undefined,
      }),
    placeholderData: (prev) => prev,
    enabled: activeTab === "rejected",
  });

  const jobsTotalPages = jobsData
    ? Math.ceil(jobsData.totalCount / pageSize)
    : 1;
  const rejectedTotalPages = rejectedData
    ? Math.ceil(rejectedData.totalCount / pageSize)
    : 1;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20";
      case "failed":
        return "text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20";
      case "processing":
        return "text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20";
      default:
        return "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border border-[var(--color-border)]";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "lesson":
        return {
          label: "درس",
          icon: BookOpen,
          className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
        };
      case "flashcard":
        return {
          label: "فلش‌کارت",
          icon: Layers,
          className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
        };
      case "quiz":
        return {
          label: "آزمون",
          icon: HelpCircle,
          className: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
        };
      case "review_summary":
        return {
          label: "خلاصه بازبینی",
          icon: FileText,
          className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
        };
      default:
        return {
          label: type,
          icon: Sparkles,
          className: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20",
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-[var(--color-primary-default)]" />
            مرکز هوش مصنوعی (Generation Center)
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            نظارت بر صف پردازش موتورهای هوش مصنوعی و مدیریت سوابق محتواهای ردشده
          </p>
        </div>

        {/* Global Tab Navigation */}
        <div
          className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-2xl text-sm"
          role="tablist"
          aria-label="بخش‌های مرکز هوش مصنوعی"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "jobs"}
            onClick={() => setTab("jobs")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === "jobs"
                ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            صف و جاب‌های پردازش
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "rejected"}
            onClick={() => setTab("rejected")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all whitespace-nowrap ${
              activeTab === "rejected"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            }`}
          >
            <Ban className="w-4 h-4" />
            محتواهای ردشده
          </button>
        </div>
      </div>

      {/* TAB 1: Generation Jobs Queue */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="جستجو بر اساس ایمیل کاربر یا نام فایل..."
                value={jobsSearchInput}
                onChange={(e) => setJobsSearchInput(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl ps-10 pe-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-[var(--color-text-muted)] hidden sm:block" />
              <select
                value={jobsStatusFilter}
                onChange={(e) => {
                  setJobsStatusFilter(e.target.value);
                  setJobsPage(1);
                }}
                className="w-full sm:w-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
              >
                <option value="">همه وضعیت‌ها</option>
                <option value="queued">در صف (Queued)</option>
                <option value="processing">در حال پردازش (Processing)</option>
                <option value="completed">موفق (Completed)</option>
                <option value="failed">خطا (Failed)</option>
              </select>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="px-6 py-4 font-medium">نوع تولید</th>
                    <th className="px-6 py-4 font-medium">فایل مبدا</th>
                    <th className="px-6 py-4 font-medium">کاربر</th>
                    <th className="px-6 py-4 font-medium">وضعیت</th>
                    <th className="px-6 py-4 font-medium">تاریخ درخواست</th>
                    <th className="px-6 py-4 font-medium text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {isJobsLoading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-[var(--color-text-muted)]"
                      >
                        در حال جستجو و بارگذاری...
                      </td>
                    </tr>
                  ) : isJobsError ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-rose-600 dark:text-rose-400"
                      >
                        خطا در دریافت اطلاعات: {(jobsError as Error).message}
                      </td>
                    </tr>
                  ) : jobsData?.jobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-[var(--color-text-muted)]"
                      >
                        {jobsSearchTerm
                          ? "رکوردی با این مشخصات یافت نشد."
                          : "رکوردی یافت نشد."}
                      </td>
                    </tr>
                  ) : (
                    jobsData?.jobs.map((job: AdminGenerationJobRecord) => (
                      <tr
                        key={job.id}
                        className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
                      >
                        <td className="px-6 py-4 text-[var(--color-text)] font-medium">
                          {job.type}
                        </td>
                        <td
                          className="px-6 py-4 text-[var(--color-text)] truncate max-w-[200px]"
                          title={job.documentName}
                        >
                          {job.documentName || "-"}
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-muted)]">
                          {job.userEmail || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(
                              job.status,
                            )}`}
                          >
                            {job.status}
                          </span>
                          {job.errorMessage && (
                            <p
                              className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 max-w-[200px] truncate"
                              title={job.errorMessage}
                            >
                              {job.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-muted)]">
                          <div className="flex flex-col">
                            <span>
                              {new Date(job.createdAt).toLocaleDateString(
                                "fa-IR",
                              )}
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {new Date(job.createdAt).toLocaleTimeString(
                                "fa-IR",
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Link
                            to={`/admin/generation/${job.id}`}
                            className="inline-flex items-center justify-center p-2 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
                            title="مشاهده جزئیات"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Jobs Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
              <span className="text-sm text-[var(--color-text-muted)]">
                مجموع: {toPersianDigits(jobsData?.totalCount || 0)} رکورد
              </span>
              <div className="flex gap-2">
                <button
                  disabled={jobsPage === 1 || isJobsLoading}
                  onClick={() => setJobsPage((p) => p - 1)}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-sm text-[var(--color-text)] px-2 py-1">
                  {formatPersianOf(jobsPage, jobsTotalPages, { prefix: "صفحه" })}
                </span>
                <button
                  disabled={jobsPage >= jobsTotalPages || isJobsLoading}
                  onClick={() => setJobsPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Rejected Content History */}
      {activeTab === "rejected" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="جستجو در عنوان محتوا، دوره، منبع یا علت رد..."
                value={rejectedSearchInput}
                onChange={(e) => setRejectedSearchInput(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl ps-10 pe-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-[var(--color-text-muted)] hidden sm:block" />
              <select
                value={rejectedTypeFilter}
                onChange={(e) => {
                  setRejectedTypeFilter(e.target.value);
                  setRejectedPage(1);
                }}
                className="w-full sm:w-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
              >
                <option value="">همه انواع محتوا</option>
                <option value="lesson">درس‌ها (Lessons)</option>
                <option value="flashcard">فلش‌کارت‌ها (Flashcards)</option>
                <option value="quiz">آزمون‌ها (Quizzes)</option>
                <option value="review_summary">خلاصه بازبینی (Review Summary)</option>
              </select>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="px-6 py-4 font-medium">محتوا</th>
                    <th className="px-6 py-4 font-medium">نوع</th>
                    <th className="px-6 py-4 font-medium">دوره</th>
                    <th className="px-6 py-4 font-medium">منبع</th>
                    <th className="px-6 py-4 font-medium">علت رد</th>
                    <th className="px-6 py-4 font-medium">ردشده توسط</th>
                    <th className="px-6 py-4 font-medium">تاریخ رد</th>
                    <th className="px-6 py-4 font-medium text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {isRejectedLoading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-[var(--color-text-muted)]"
                      >
                        در حال بارگذاری سوابق محتواهای ردشده...
                      </td>
                    </tr>
                  ) : isRejectedError ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-rose-600 dark:text-rose-400"
                      >
                        خطا در دریافت سوابق رد: {(rejectedError as Error).message}
                      </td>
                    </tr>
                  ) : rejectedData?.items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-12 text-center text-[var(--color-text-muted)]"
                      >
                        <div className="space-y-2">
                          <Ban className="w-8 h-8 text-rose-500/60 mx-auto" />
                          <p className="font-medium text-[var(--color-text)]">
                            {rejectedSearchTerm
                              ? "رکوردی با مشخصات جستجوشده یافت نشد."
                              : "هیچ محتوای ردشده‌ای وجود ندارد."}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            تمام پیش‌نویس‌های هوش مصنوعی تایید شده‌اند یا هنوز بازبینی نشده‌اند.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rejectedData?.items.map((item: AdminRejectedContentRecord) => {
                      const badge = getTypeBadge(item.type);
                      const Icon = badge.icon;
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-medium text-[var(--color-text)] max-w-[220px] truncate" title={item.title}>
                            {item.title || "پیش‌نویس بدون عنوان"}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.className}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {badge.label}
                            </span>
                          </td>
                          <td
                            className="px-6 py-4 text-[var(--color-text-muted)] max-w-[160px] truncate"
                            title={item.courseTitle}
                          >
                            {item.courseTitle || "-"}
                          </td>
                          <td
                            className="px-6 py-4 text-[var(--color-text-muted)] max-w-[160px] truncate"
                            title={item.documentName}
                          >
                            {item.documentName || "-"}
                          </td>
                          <td
                            className="px-6 py-4 text-rose-700 dark:text-rose-300 max-w-[200px] truncate"
                            title={item.reviewReason}
                          >
                            {item.reviewReason || "بدون ذکر دلیل"}
                          </td>
                          <td className="px-6 py-4 text-[var(--color-text-muted)] text-xs">
                            {item.reviewedBy || "کارشناس بازبینی"}
                          </td>
                          <td className="px-6 py-4 text-[var(--color-text-muted)] text-xs">
                            {item.reviewedAt ? (
                              <div className="flex flex-col">
                                <span>
                                  {new Date(item.reviewedAt).toLocaleDateString(
                                    "fa-IR",
                                  )}
                                </span>
                                <span className="text-[10px]">
                                  {new Date(item.reviewedAt).toLocaleTimeString(
                                    "fa-IR",
                                  )}
                                </span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedRejectedItem(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:bg-[var(--color-primary-default)] hover:text-[var(--color-primary-contrast)] border border-[var(--color-border)] text-xs font-bold transition-all shadow-sm"
                              title="مشاهده جزئیات و بازتولید"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              جزئیات
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rejected Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
              <span className="text-sm text-[var(--color-text-muted)]">
                مجموع: {toPersianDigits(rejectedData?.totalCount || 0)} مورد ردشده
              </span>
              <div className="flex gap-2">
                <button
                  disabled={rejectedPage === 1 || isRejectedLoading}
                  onClick={() => setRejectedPage((p) => p - 1)}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-sm text-[var(--color-text)] px-2 py-1">
                  {formatPersianOf(rejectedPage, rejectedTotalPages, {
                    prefix: "صفحه",
                  })}
                </span>
                <button
                  disabled={
                    rejectedPage >= rejectedTotalPages || isRejectedLoading
                  }
                  onClick={() => setRejectedPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal / Drawer for Rejected Item */}
      {selectedRejectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-5xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-600" />
                  بررسی پیش‌نویس ردشده هوش مصنوعی
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  دوره: {selectedRejectedItem.courseTitle || "-"} | منبع: {selectedRejectedItem.documentName || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRejectedItem(null)}
                className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] border border-transparent hover:border-[var(--color-border)] transition-colors"
                title="بستن پنجره"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ContentReviewDetail
              organizationId={selectedRejectedItem.organizationId}
              courseId={selectedRejectedItem.courseId}
              contentId={selectedRejectedItem.id}
              onBack={() => setSelectedRejectedItem(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
