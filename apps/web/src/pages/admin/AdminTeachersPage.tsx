import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Layers,
  FileText,
  Users,
  ExternalLink,
  CheckCircle2,
  Clock,
  Eye,
  AlertCircle,
  Loader2,
  X,
  Check,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import type { AdminTeacherRecord } from "../../lib/api/admin.js";
import { TeacherDetailsDrawer } from "../../components/admin/teachers/TeacherDetailsDrawer.js";
import { Badge, Button } from "../../components/ui/index.js";

const STATUSES = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "approved", label: "تأیید شده" },
  { value: "pending", label: "در انتظار تأیید" },
  { value: "rejected", label: "رد شده" },
];

export function AdminTeachersPage() {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const pageSize = 20;

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [rejectModalTeacher, setRejectModalTeacher] = useState<AdminTeacherRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "teachers", page, search, statusFilter],
    queryFn: () =>
      adminApi.listTeachers(
        page,
        pageSize,
        search.trim() ? search.trim() : undefined,
        statusFilter === "all" ? undefined : statusFilter,
      ),
    placeholderData: (prev) => prev,
  });

  const approveMutation = useMutation({
    mutationFn: (teacherId: string) => adminApi.approveTeacher(teacherId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "teacher-overview"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ teacherId, reason }: { teacherId: string; reason?: string }) =>
      adminApi.rejectTeacher(teacherId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "teacher-overview"] });
      setRejectModalTeacher(null);
      setRejectReason("");
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1;

  const handleOpenDetails = (teacher: AdminTeacherRecord) => {
    setSelectedTeacherId(teacher.id);
    setIsDrawerOpen(true);
  };

  const handleCloseDetails = () => {
    setIsDrawerOpen(false);
    setSelectedTeacherId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all";

  return (
    <div className="space-y-6 font-sans text-[var(--color-text)]" dir="rtl">
      {/* Page Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-right">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            مدیریت اساتید
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            نظارت بر اساتید، دوره‌ها، کلاس‌ها و آزمون‌های آموزشی پلتفرم
          </p>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-3 shrink-0">
          <Link
            to="/teacher"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer"
            title="ورود به پنل استاد"
          >
            <GraduationCap className="w-4 h-4" />
            <span>ورود به پنل استاد</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-xs text-[var(--color-text-muted)] block font-medium">
              کل اساتید
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              {data ? toPersianDigits(data.stats.totalTeachers) : "-"}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-xs text-[var(--color-text-muted)] block font-medium">
              کلاس‌ها
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              {data ? toPersianDigits(data.stats.totalClassrooms) : "-"}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-xs text-[var(--color-text-muted)] block font-medium">
              آزمون‌ها
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              {data ? toPersianDigits(data.stats.totalExams) : "-"}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-xs text-[var(--color-text-muted)] block font-medium">
              دانشجویان
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              {data ? toPersianDigits(data.stats.totalStudents) : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow flex items-center">
          <input
            type="text"
            placeholder="جستجو با نام یا ایمیل استاد..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جستجوی اساتید"
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors placeholder:text-[var(--color-text-muted)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 pointer-events-none" />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute end-3 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              aria-label="پاک کردن جستجو"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="فیلتر وضعیت حساب"
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors cursor-pointer"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              className="text-xs text-[var(--color-primary-default)] whitespace-nowrap shrink-0"
            >
              پاک کردن فیلترها
            </Button>
          )}
        </div>
      </div>

      {/* Teachers Table & States */}
      <div className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] shadow-sm overflow-hidden">
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
            <span className="text-sm">در حال بارگذاری لیست اساتید...</span>
          </div>
        )}

        {isError && !isLoading && (
          <div className="py-16 px-4 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              خطا در برقراری ارتباط با سرور
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              امکان دریافت اطلاعات اساتید وجود ندارد. لطفاً مجدداً تلاش کنید.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void refetch()}>
              تلاش مجدد
            </Button>
          </div>
        )}

        {!isLoading && !isError && data && (
          <>
            {data.teachers.length === 0 ? (
              <div className="py-16 px-4 text-center space-y-3">
                <GraduationCap className="w-12 h-12 text-[var(--color-text-muted)] opacity-30 mx-auto" />
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  {hasActiveFilters
                    ? "هیچ استادی با این مشخصات یافت نشد."
                    : "هنوز استادی در سیستم ثبت نشده است."}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
                  {hasActiveFilters
                    ? "می‌توانید با تغییر عبارت جستجو یا پاک کردن فیلترها، مجدداً تلاش کنید."
                    : "کاربران با نقش استاد پس از ثبت‌نام و فعال‌سازی در این بخش نمایش داده می‌شوند."}
                </p>
                {hasActiveFilters && (
                  <Button size="sm" variant="secondary" onClick={clearFilters}>
                    پاک کردن فیلترها
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs" aria-label="جدول مدیریت اساتید">
                  <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)] font-semibold select-none">
                    <tr>
                      <th className="py-3.5 px-4 sm:px-6">استاد</th>
                      <th className="py-3.5 px-4 text-center">وضعیت حساب</th>
                      <th className="py-3.5 px-4 text-center">کلاس‌ها</th>
                      <th className="py-3.5 px-4 text-center">آزمون‌ها</th>
                      <th className="py-3.5 px-4 text-center">دانشجویان</th>
                      <th className="py-3.5 px-4 text-center">تاریخ عضویت</th>
                      <th className="py-3.5 px-4 sm:px-6 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.teachers.map((teacher) => (
                      <tr
                        key={teacher.id}
                        onClick={() => handleOpenDetails(teacher)}
                        className="hover:bg-[var(--color-surface-warm)]/60 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center font-bold text-sm shrink-0">
                              {teacher.name ? teacher.name[0] : "ا"}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-[var(--color-text)] block text-sm group-hover:text-[var(--color-primary-default)] transition-colors truncate">
                                {teacher.name || "استاد بدون نام"}
                              </span>
                              <span className="text-[11px] text-[var(--color-text-muted)] font-mono block truncate">
                                {teacher.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {teacher.teacherStatus === "approved" && (
                            <Badge variant="success" size="sm" icon={<CheckCircle2 className="w-3 h-3" />}>
                              تأیید شده
                            </Badge>
                          )}
                          {teacher.teacherStatus === "rejected" && (
                            <Badge variant="error" size="sm" icon={<XCircle className="w-3 h-3" />}>
                              رد شده
                            </Badge>
                          )}
                          {(teacher.teacherStatus === "pending" || !teacher.teacherStatus) && (
                            <Badge variant="warning" size="sm" icon={<Clock className="w-3 h-3" />}>
                              در انتظار تأیید
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center font-bold text-sm text-[var(--color-text)]">
                          {toPersianDigits(teacher.classroomsCount)}
                        </td>

                        <td className="py-3.5 px-4 text-center font-bold text-sm text-[var(--color-text)]">
                          {toPersianDigits(teacher.examsCount)}
                        </td>

                        <td className="py-3.5 px-4 text-center font-bold text-sm text-[var(--color-text)]">
                          {toPersianDigits(teacher.studentsCount)}
                        </td>

                        <td className="py-3.5 px-4 text-center text-[var(--color-text-muted)] whitespace-nowrap">
                          {teacher.createdAt
                            ? toPersianDigits(new Date(teacher.createdAt).toLocaleDateString("fa-IR"))
                            : "-"}
                        </td>

                        <td className="py-3.5 px-4 sm:px-6 text-center">
                          <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {teacher.teacherStatus === "pending" && (
                              <>
                                <button
                                  type="button"
                                  data-testid={`approve-teacher-${teacher.id}`}
                                  onClick={() => approveMutation.mutate(teacher.id)}
                                  disabled={approveMutation.isPending}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/40 transition-colors cursor-pointer"
                                  aria-label={`تأیید ${teacher.name || teacher.email}`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>تأیید</span>
                                </button>
                                <button
                                  type="button"
                                  data-testid={`reject-teacher-${teacher.id}`}
                                  onClick={() => setRejectModalTeacher(teacher)}
                                  disabled={rejectMutation.isPending}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-300 dark:bg-red-950/40 transition-colors cursor-pointer"
                                  aria-label={`رد ${teacher.name || teacher.email}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>رد</span>
                                </button>
                              </>
                            )}
                            {teacher.teacherStatus === "approved" && (
                              <button
                                type="button"
                                data-testid={`reject-teacher-${teacher.id}`}
                                onClick={() => setRejectModalTeacher(teacher)}
                                disabled={rejectMutation.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                aria-label={`رد ${teacher.name || teacher.email}`}
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>رد استاد</span>
                              </button>
                            )}
                            {teacher.teacherStatus === "rejected" && (
                              <button
                                type="button"
                                data-testid={`approve-teacher-${teacher.id}`}
                                onClick={() => approveMutation.mutate(teacher.id)}
                                disabled={approveMutation.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/40 transition-colors cursor-pointer"
                                aria-label={`تأیید مجدد ${teacher.name || teacher.email}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>تأیید استاد</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenDetails(teacher)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--color-primary-default)] hover:bg-[var(--color-primary-default)]/10 transition-colors cursor-pointer"
                              aria-label={`مشاهده جزئیات ${teacher.name || teacher.email}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>جزئیات</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {data.totalCount > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-muted)]">
                <div>
                  نمایش {toPersianDigits(data.teachers.length)} از {toPersianDigits(data.totalCount)} استاد
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="صفحه قبلی"
                      leftIcon={<ChevronRight className="w-4 h-4" />}
                    >
                      قبلی
                    </Button>

                    <span className="px-3 py-1 font-semibold text-[var(--color-text)]">
                      صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
                    </span>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="صفحه بعدی"
                      rightIcon={<ChevronLeft className="w-4 h-4" />}
                    >
                      بعدی
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Reject Confirmation Modal */}
      {rejectModalTeacher && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans"
          role="dialog"
          aria-modal="true"
          aria-label="تأیید رد استاد"
        >
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4 text-right">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  رد صلاحیت استاد
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {rejectModalTeacher.name || rejectModalTeacher.email}
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              آیا از رد کردن این استاد اطمینان دارید؟ در صورت نیاز می‌توانید دلیل رد را وارد کنید.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="reject-reason" className="text-xs font-semibold text-[var(--color-text)] block">
                دلیل رد (اختیاری):
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="توضیح کوتاه برای پرونده مدیریتی..."
                rows={3}
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors resize-none placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRejectModalTeacher(null);
                  setRejectReason("");
                }}
                disabled={rejectMutation.isPending}
              >
                انصراف
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid="confirm-reject-btn"
                onClick={() =>
                  rejectMutation.mutate({
                    teacherId: rejectModalTeacher.id,
                    reason: rejectReason.trim() || undefined,
                  })
                }
                disabled={rejectMutation.isPending}
                leftIcon={rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              >
                {rejectMutation.isPending ? "در حال ثبت..." : "رد استاد"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Details Drawer */}
      <TeacherDetailsDrawer
        isOpen={isDrawerOpen}
        teacherId={selectedTeacherId}
        onClose={handleCloseDetails}
      />
    </div>
  );
}
