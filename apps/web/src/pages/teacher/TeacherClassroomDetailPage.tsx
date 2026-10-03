/**
 * TeacherClassroomDetailPage.
 *
 * Detailed workspace for a specific classroom:
 *  - Classroom title, description, and status
 *  - Invite code display with copy and regenerate action
 *  - Edit metadata modal
 *  - Underline tabs switching between:
 *      1. Exams tab: list of exams, create exam action
 *      2. Members tab: list of students, remove student action
 *  - Lifecycle actions (Archive, Delete with 409 conflict explanation)
 */

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useTeacherClassroom,
  useClassroomExams,
  useClassroomMembers,
  useRegenerateInviteCode,
  useArchiveClassroom,
  useDeleteClassroom,
} from "../../hooks/useTeacher.js";
import { useTeacherClassroomAssignments } from "../../hooks/useTeacherAssignments.js";
import { useTeacherClassroomContents } from "../../hooks/useTeacherContents.js";
import {
  PageHeader,
  Tabs,
  Badge,
  Button,
  LoadingState,
  Alert,
} from "../../components/ui/index.js";
import { ClassroomExamsTable } from "../../components/teacher/exams/ClassroomExamsTable.js";
import { ClassroomMembersTable } from "../../components/teacher/classrooms/ClassroomMembersTable.js";
import { ClassroomAssignmentsTable } from "../../components/teacher/assignments/ClassroomAssignmentsTable.js";
import { CreateEditAssignmentModal } from "../../components/teacher/assignments/CreateEditAssignmentModal.js";
import { ClassroomContentsTable } from "../../components/teacher/contents/ClassroomContentsTable.js";
import { CreateEditContentModal } from "../../components/teacher/contents/CreateEditContentModal.js";
import { EditClassroomModal } from "../../components/teacher/classrooms/EditClassroomModal.js";
import { ConfirmModal } from "../../components/teacher/common/ConfirmModal.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  Users,
  HelpCircle,
  Plus,
  Edit3,
  Copy,
  Check,
  RefreshCw,
  Archive,
  Trash2,
  ArrowRight,
  FileText,
  BookOpen,
} from "lucide-react";

export function TeacherClassroomDetailPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const [activeTabId, setActiveTabId] = useState("contents");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createAssignmentModalOpen, setCreateAssignmentModalOpen] = useState(false);
  const [createContentModalOpen, setCreateContentModalOpen] = useState(false);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const classroomQuery = useTeacherClassroom(classroomId);
  const classroom = classroomQuery.data?.classroom;

  // Authoritative organization resolution:
  // For an existing classroom resource, classroom.organizationId is strictly authoritative.
  const authoritativeOrgId = classroom?.organizationId;

  const examsQuery = useClassroomExams(classroomId);
  const membersQuery = useClassroomMembers(classroomId);
  const assignmentsQuery = useTeacherClassroomAssignments(classroomId);
  const contentsQuery = useTeacherClassroomContents(classroomId);

  const regenMutation = useRegenerateInviteCode(classroomId ?? "", authoritativeOrgId);
  const archiveMutation = useArchiveClassroom(classroomId ?? "", authoritativeOrgId);
  const deleteMutation = useDeleteClassroom(authoritativeOrgId ?? "");
  const exams = examsQuery.data?.exams ?? [];
  const members = membersQuery.data?.members ?? [];
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const contents = contentsQuery.data?.contents ?? [];

  const handleCopyInvite = () => {
    if (!classroom) return;
    navigator.clipboard.writeText(classroom.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleConfirmRegenerate = async () => {
    setActionError(null);
    try {
      await regenMutation.mutateAsync();
      setRegenConfirmOpen(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "خطا در تولید مجدد کد دعوت");
    }
  };

  const handleConfirmArchive = async () => {
    setActionError(null);
    try {
      await archiveMutation.mutateAsync();
      setArchiveConfirmOpen(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "خطا در بایگانی کلاس");
    }
  };

  const handleConfirmDelete = async () => {
    if (!classroomId) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(classroomId);
      setDeleteConfirmOpen(false);
      navigate("/teacher/classrooms");
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")) {
        setActionError(
          err.message ||
            "کلاس دارای آزمون، تکلیف یا تلاش ثبت‌شده است و قابل حذف قطعی نیست. لطفاً از گزینه بایگانی استفاده کنید.",
        );
      } else {
        setActionError(err instanceof ApiError ? err.message : "خطا در حذف کلاس");
      }
    }
  };

  if (classroomQuery.isLoading) {
    return (
      <div className="py-20 flex items-center justify-center font-sans">
        <LoadingState message="در حال دریافت اطلاعات کلاس..." />
      </div>
    );
  }

  if (classroomQuery.error || !classroom) {
    return (
      <div className="space-y-4">
        <Link
          to="/teacher/classrooms"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>بازگشت به لیست کلاس‌ها</span>
        </Link>
        <Alert variant="error" title="کلاس یافت نشد">
          {classroomQuery.error?.message || "کلاس مورد نظر یافت نشد یا شما دسترسی به آن ندارید."}
        </Alert>
      </div>
    );
  }

  const isActive = classroom.status === "active";

  const tabItems = [
    {
      id: "contents",
      label: "محتوای آموزشی",
      badge: contents.length,
      icon: <BookOpen className="w-4 h-4" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                فهرست محتوای آموزشی کلاس
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                محتوای درسی، جزوات، تصاویر، اسلایدها و ویدئوهای آموزشی منتشر شده برای دانش‌آموزان.
              </p>
            </div>
            {isActive && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreateContentModalOpen(true)}
              >
                ایجاد محتوای آموزشی جدید
              </Button>
            )}
          </div>
          <ClassroomContentsTable
            contents={contents}
            isLoading={contentsQuery.isLoading}
            classroomId={classroom.id}
            onOpenCreateModal={() => setCreateContentModalOpen(true)}
          />
        </div>
      ),
    },
    {
      id: "assignments",
      label: "تکالیف",
      badge: assignments.length,
      icon: <FileText className="w-4 h-4" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              فهرست تکالیف کلاسی
            </h3>
            {isActive && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreateAssignmentModalOpen(true)}
              >
                ایجاد تکلیف جدید
              </Button>
            )}
          </div>
          <ClassroomAssignmentsTable
            assignments={assignments}
            isLoading={assignmentsQuery.isLoading}
            classroomId={classroom.id}
            onOpenCreateModal={() => setCreateAssignmentModalOpen(true)}
          />
        </div>
      ),
    },
    {
      id: "exams",
      label: "آزمون‌ها",
      badge: exams.length,
      icon: <HelpCircle className="w-4 h-4" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
              فهرست آزمون‌های اختصاصی کلاس
            </h3>
            {isActive && (
              <Link to={`/teacher/classrooms/${classroom.id}/exams/new`}>
                <Button size="sm" variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
                  تعریف آزمون جدید
                </Button>
              </Link>
            )}
          </div>
          <ClassroomExamsTable
            exams={exams}
            isLoading={examsQuery.isLoading}
            classroomId={classroom.id}
          />
        </div>
      ),
    },
    {
      id: "members",
      label: "دانش‌آموزان",
      badge: members.length,
      icon: <Users className="w-4 h-4" />,
      content: (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                لیست دانش‌آموزان عضو کلاس
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                دانش‌آموزان با وارد کردن کد دعوت کلاس در حساب خود ملحق شده‌اند.
              </p>
            </div>
          </div>
          <ClassroomMembersTable
            classroomId={classroom.id}
            members={members}
            isLoading={membersQuery.isLoading}
          />
        </div>
      ),
    },
  ];


  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Breadcrumb back to list */}
      <Link
        to="/teacher/classrooms"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] transition-colors"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        <span>بازگشت به کلاس‌های من</span>
      </Link>

      {/* Classroom Header */}
      <PageHeader
        title={classroom.title}
        description={classroom.description || "بدون توضیحات"}
        badge={{
          text: isActive ? "کلاس فعال" : "بایگانی‌شده",
          icon: <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />,
        }}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Invite Code Badge with Copy and Regenerate */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs">
              <span className="text-xs text-[var(--color-text-muted)]">کد دعوت:</span>
              <code className="text-xs font-mono font-bold text-[#008080] tracking-wider select-all">
                {classroom.inviteCode}
              </code>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                title="کپی کد دعوت"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              {isActive && (
                <button
                  type="button"
                  onClick={() => setRegenConfirmOpen(true)}
                  className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[#008080] transition-colors"
                  title="تولید مجدد کد دعوت"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Management Actions */}
            {isActive && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                  onClick={() => setEditModalOpen(true)}
                >
                  ویرایش کلاس
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Archive className="w-3.5 h-3.5 text-amber-600" />}
                  onClick={() => setArchiveConfirmOpen(true)}
                >
                  بایگانی
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              حذف کلاس
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        items={tabItems}
        activeTabId={activeTabId}
        onChange={setActiveTabId}
        variant="underline"
      />

      {/* Modal: Create Content */}
      {createContentModalOpen && (
        <CreateEditContentModal
          isOpen={createContentModalOpen}
          onClose={() => setCreateContentModalOpen(false)}
          classroomId={classroom.id}
        />
      )}

      {/* Modal: Create Assignment */}
      {createAssignmentModalOpen && (
        <CreateEditAssignmentModal
          isOpen={createAssignmentModalOpen}
          onClose={() => setCreateAssignmentModalOpen(false)}
          classroomId={classroom.id}
        />
      )}

      {/* Modal: Edit Classroom */}
      {editModalOpen && (

        <EditClassroomModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          classroom={classroom}
          organizationId={classroom.organizationId}
        />
      )}

      {/* Modal: Regenerate Invite Code */}
      {regenConfirmOpen && (
        <ConfirmModal
          isOpen={regenConfirmOpen}
          title="تولید مجدد کد دعوت"
          description={`آیا از تغییر کد دعوت کلاس مطمئن هستید؟ کد دعوت فعلی (${classroom.inviteCode}) بی‌اعتبار شده و کد جدیدی برای عضویت صادر می‌شود.`}
          confirmText="تولید کد جدید"
          cancelText="انصراف"
          variant="primary"
          isProcessing={regenMutation.isPending}
          errorMessage={actionError}
          onConfirm={handleConfirmRegenerate}
          onCancel={() => {
            setRegenConfirmOpen(false);
            setActionError(null);
          }}
        />
      )}

      {/* Modal: Archive Classroom */}
      {archiveConfirmOpen && (
        <ConfirmModal
          isOpen={archiveConfirmOpen}
          title="بایگانی کردن کلاس"
          description="با بایگانی کردن کلاس، امکان تعریف آزمون جدید مسدود می‌شود اما سوابق دانش‌آموزان محفوظ خواهد ماند."
          confirmText="بایگانی کلاس"
          cancelText="انصراف"
          variant="warning"
          isProcessing={archiveMutation.isPending}
          errorMessage={actionError}
          onConfirm={handleConfirmArchive}
          onCancel={() => {
            setArchiveConfirmOpen(false);
            setActionError(null);
          }}
        />
      )}

      {/* Modal: Delete Classroom */}
      {deleteConfirmOpen && (
        <ConfirmModal
          isOpen={deleteConfirmOpen}
          title="حذف قطعی کلاس"
          description={
            <div className="space-y-2">
              <p>آیا از حذف دائمی این کلاس اطمینان دارید؟</p>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                <strong>توجه به قوانین سرور:</strong> در صورتی که کلاس دارای آزمون یا پیشینه مشارکت دانش‌آموزان باشد، سرور با خطای تعارض (۴۰۹) مانع حذف خواهد شد و باید از امکان «بایگانی» استفاده فرمایید.
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
            setDeleteConfirmOpen(false);
            setActionError(null);
          }}
        />
      )}
    </div>
  );
}
