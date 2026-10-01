/**
 * TeacherClassroomsPage.
 *
 * Full management surface for teacher classrooms:
 *  - list all classrooms
 *  - search and filter (active / archived)
 *  - create classroom modal
 *  - copy invite code
 *  - regenerate invite code (with confirmation)
 *  - archive classroom (with confirmation)
 *  - delete classroom (with strong confirmation & 409 conflict handling)
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import {
  useTeacherClassrooms,
  useRegenerateInviteCode,
  useArchiveClassroom,
  useDeleteClassroom,
} from "../../hooks/useTeacher.js";
import { useTeacherOrganization } from "../../components/teacher/TeacherOrganizationContext.js";
import {
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingState,
  Badge,
  Button,
  Input,
  Alert,
  EmptyState,
  LoadingState,
} from "../../components/ui/index.js";
import { CreateClassroomModal } from "../../components/teacher/classrooms/CreateClassroomModal.js";
import { ConfirmModal } from "../../components/teacher/common/ConfirmModal.js";
import type { ClassroomWithDetails } from "../../lib/api/teacher.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  Users,
  Plus,
  Search,
  Copy,
  Check,
  RefreshCw,
  Archive,
  Trash2,
  ExternalLink,
  Building,
} from "lucide-react";

export function TeacherClassroomsPage() {
  const {
    selectedOrgId,
    availableOrgs,
    isLoadingOrgs,
    orgsError,
    needsOrgSelection,
    hasNoOrganizations,
    setSelectedOrgId,
  } = useTeacherOrganization();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Selected classrooms for action modals
  const [regenClassroom, setRegenClassroom] = useState<ClassroomWithDetails | null>(null);
  const [archiveClassroomTarget, setArchiveClassroomTarget] = useState<ClassroomWithDetails | null>(null);
  const [deleteClassroomTarget, setDeleteClassroomTarget] = useState<ClassroomWithDetails | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Query is safe: only enabled when selectedOrgId is valid
  const { data, isLoading, error } = useTeacherClassrooms(selectedOrgId ?? undefined);
  const classrooms = data?.classrooms ?? [];

  // Mutations
  const regenMutation = useRegenerateInviteCode(
    regenClassroom?.id ?? "",
    regenClassroom?.organizationId || selectedOrgId || undefined,
  );
  const archiveMutation = useArchiveClassroom(
    archiveClassroomTarget?.id ?? "",
    archiveClassroomTarget?.organizationId || selectedOrgId || undefined,
  );
  const deleteMutation = useDeleteClassroom(
    deleteClassroomTarget?.organizationId || selectedOrgId || "",
  );

  const handleCopyInvite = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleConfirmRegenerate = async () => {
    if (!regenClassroom) return;
    setActionError(null);
    try {
      await regenMutation.mutateAsync();
      setRegenClassroom(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "خطا در تولید مجدد کد دعوت");
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveClassroomTarget) return;
    setActionError(null);
    try {
      await archiveMutation.mutateAsync();
      setArchiveClassroomTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "خطا در بایگانی کلاس");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteClassroomTarget) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(deleteClassroomTarget.id);
      setDeleteClassroomTarget(null);
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")) {
        setActionError(
          err.message ||
            "کلاس دارای آزمون یا تلاش ثبت‌شده است و قابل حذف قطعی نیست. لطفاً از گزینه بایگانی استفاده کنید.",
        );
      } else {
        setActionError(err instanceof ApiError ? err.message : "خطا در حذف کلاس");
      }
    }
  };

  const filteredClassrooms = useMemo(() => {
    return classrooms.filter((c) => {
      const matchesSearch =
        search.trim().length === 0 ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.inviteCode.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [classrooms, search, statusFilter]);

  if (isLoadingOrgs) {
    return (
      <div className="py-20 flex items-center justify-center font-sans">
        <LoadingState message="در حال بارگذاری اطلاعات سازمان..." />
      </div>
    );
  }

  if (orgsError) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="خطا در دریافت اطلاعات سازمان">
          {orgsError}
        </Alert>
      </div>
    );
  }

  if (hasNoOrganizations) {
    return (
      <div className="space-y-6 font-sans" dir="rtl">
        <PageHeader
          title="کلاس‌های آموزشی من"
          description="فهرست و مدیریت کلاس‌های فعال و بایگانی‌شده، صدور و بازتولید کدهای دعوت و پایش اعضا."
        />
        <EmptyState
          icon={<Building className="w-8 h-8 text-[#008080]" />}
          title="هیچ سازمانی در سیستم ثبت نشده است"
          description="برای ایجاد کلاس یا مدیریت آزمون‌ها در پنل اساتید، ابتدا باید یک سازمان در بخش مدیریت سیستم ایجاد شود."
          action={
            <Link to="/admin">
              <Button variant="primary" size="sm" leftIcon={<ExternalLink className="w-4 h-4" />}>
                ورود به پنل مدیریت
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (needsOrgSelection) {
    return (
      <div className="space-y-6 font-sans" dir="rtl">
        <PageHeader
          title="کلاس‌های آموزشی من"
          description="لطفاً سازمان مورد نظر خود را جهت مشاهده و مدیریت کلاس‌ها انتخاب فرمایید."
        />
        <EmptyState
          icon={<Building className="w-8 h-8 text-amber-500" />}
          title="سازمان آموزشی انتخاب نشده است"
          description="شما به چندین سازمان دسترسی دارید. لطفاً سازمان مورد نظر خود را از لیست زیر یا منوی بالای صفحه انتخاب نمایید."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {availableOrgs.map((org) => (
                <Button
                  key={org.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOrgId(org.id)}
                  className="text-xs hover:border-[#008080] hover:text-[#008080]"
                >
                  {org.name}
                </Button>
              ))}
            </div>
          }
        />
      </div>
    );
  }

  if (!selectedOrgId) {
    return (
      <Alert variant="warning" title="عدم انتساب به سازمان">
        برای مشاهده و مدیریت کلاس‌ها نیاز به عضویت فعال در سازمان دارید.
      </Alert>
    );
  }

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <PageHeader
        title="کلاس‌های آموزشی من"
        description="فهرست و مدیریت کلاس‌های فعال و بایگانی‌شده، صدور و بازتولید کدهای دعوت و پایش اعضا."
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            ایجاد کلاس جدید
          </Button>
        }
      />

      {error && (
        <Alert variant="error" title="خطا در دریافت کلاس‌ها">
          {error.message}
        </Alert>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <Input
            placeholder="جستجوی نام کلاس یا کد دعوت..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "all"
                ? "bg-[#008080] text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
          >
            همه ({classrooms.length.toLocaleString("fa-IR")})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "active"
                ? "bg-[#008080] text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
          >
            فعال ({classrooms.filter((c) => c.status === "active").length.toLocaleString("fa-IR")})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("archived")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "archived"
                ? "bg-[#008080] text-white"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
          >
            بایگانی ({classrooms.filter((c) => c.status === "archived").length.toLocaleString("fa-IR")})
          </button>
        </div>
      </div>

      {/* Classrooms Table */}
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>عنوان و مشخصات کلاس</TableHead>
            <TableHead>وضعیت</TableHead>
            <TableHead>کد دعوت</TableHead>
            <TableHead>دانش‌آموزان</TableHead>
            <TableHead>آزمون‌ها</TableHead>
            <TableHead className="text-center">عملیات</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableLoadingState colSpan={6} message="در حال بارگذاری کلاس‌ها..." />
          ) : filteredClassrooms.length === 0 ? (
            <TableEmptyState
              colSpan={6}
              icon={<Users className="w-6 h-6" />}
              message="هیچ کلاسی با مشخصات وارد شده یافت نشد."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setCreateModalOpen(true)}
                >
                  ایجاد اولین کلاس
                </Button>
              }
            />
          ) : (
            filteredClassrooms.map((c) => {
              const isActive = c.status === "active";

              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        to={`/teacher/classrooms/${c.id}`}
                        className="font-bold text-xs sm:text-sm text-[var(--color-text)] hover:text-[#008080] transition-colors"
                      >
                        {c.title}
                      </Link>
                      {c.description && (
                        <span className="text-[11px] text-[var(--color-text-muted)] line-clamp-1 mt-0.5 max-w-sm">
                          {c.description}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {isActive ? (
                      <Badge variant="success" size="sm">
                        فعال
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        بایگانی‌شده
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono font-bold text-[#008080] px-2 py-0.5 rounded bg-[var(--color-surface-warm)] border border-[var(--color-border)] select-all">
                        {c.inviteCode}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyInvite(c.inviteCode)}
                        className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                        title="کپی کد دعوت"
                      >
                        {copiedCode === c.inviteCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs font-semibold text-[var(--color-text)]">
                    {(c.membersCount ?? 0).toLocaleString("fa-IR")} نفر
                  </TableCell>

                  <TableCell className="text-xs font-semibold text-[var(--color-text)]">
                    {(c.examsCount ?? 0).toLocaleString("fa-IR")} آزمون
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <Link to={`/teacher/classrooms/${c.id}`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                          className="text-xs px-2.5"
                        >
                          ورود
                        </Button>
                      </Link>

                      {isActive && (
                        <>
                          <button
                            type="button"
                            onClick={() => setRegenClassroom(c)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[#008080] hover:bg-[var(--color-surface-warm)] transition-colors"
                            title="تولید مجدد کد دعوت"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setArchiveClassroomTarget(c)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                            title="بایگانی کلاس"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteClassroomTarget(c)}
                        className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="حذف قطعی کلاس"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal: Create Classroom */}
      {createModalOpen && selectedOrgId && (
        <CreateClassroomModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          organizationId={selectedOrgId}
        />
      )}

      {/* Modal: Regenerate Invite Code Confirmation */}
      {regenClassroom && (
        <ConfirmModal
          isOpen={Boolean(regenClassroom)}
          title="تولید مجدد کد دعوت"
          description={`آیا از تغییر کد دعوت کلاس "${regenClassroom.title}" مطمئن هستید؟ با انجام این عملیات، کد قبلی (${regenClassroom.inviteCode}) بی‌اعتبار شده و دانش‌آموزان جدید تنها با کد جدید قادر به عضویت خواهند بود.`}
          confirmText="تولید کد جدید"
          cancelText="انصراف"
          variant="primary"
          isProcessing={regenMutation.isPending}
          errorMessage={actionError}
          onConfirm={handleConfirmRegenerate}
          onCancel={() => {
            setRegenClassroom(null);
            setActionError(null);
          }}
        />
      )}

      {/* Modal: Archive Classroom Confirmation */}
      {archiveClassroomTarget && (
        <ConfirmModal
          isOpen={Boolean(archiveClassroomTarget)}
          title="بایگانی کردن کلاس"
          description={`با بایگانی کردن کلاس "${archiveClassroomTarget.title}"، امکان تعریف آزمون جدید یا ویرایش اطلاعات آن مسدود می‌شود؛ اما سوابق آزمون‌ها و دانش‌آموزان حفظ خواهد شد.`}
          confirmText="بایگانی کلاس"
          cancelText="انصراف"
          variant="warning"
          isProcessing={archiveMutation.isPending}
          errorMessage={actionError}
          onConfirm={handleConfirmArchive}
          onCancel={() => {
            setArchiveClassroomTarget(null);
            setActionError(null);
          }}
        />
      )}

      {/* Modal: Delete Classroom Confirmation (Explains 409 Conflict) */}
      {deleteClassroomTarget && (
        <ConfirmModal
          isOpen={Boolean(deleteClassroomTarget)}
          title="حذف قطعی کلاس"
          description={
            <div className="space-y-2">
              <p>
                آیا از حذف دائمی کلاس <strong>"{deleteClassroomTarget.title}"</strong> اطمینان دارید؟
              </p>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                <strong>توجه به قوانین سرور:</strong> طبق استاندارد امنیتی سامانه، تنها کلاس‌هایی که هیچ آزمون یا تلاشی در آن‌ها ثبت نشده باشد امکان حذف قطعی دارند. در صورتی که کلاس دارای پیشینه آموزشی باشد، سرور با خطای تعارض (۴۰۹) مانع حذف خواهد شد و باید از گزینه «بایگانی» استفاده فرمایید.
              </div>
            </div>
          }
          confirmText="تأیید حذف کلاس"
          cancelText="انصراف"
          variant="danger"
          isProcessing={deleteMutation.isPending}
          errorMessage={actionError}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteClassroomTarget(null);
            setActionError(null);
          }}
        />
      )}
    </div>
  );
}
