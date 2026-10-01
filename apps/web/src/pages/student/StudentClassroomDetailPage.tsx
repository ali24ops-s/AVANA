/**
 * StudentClassroomDetailPage.
 *
 * Detailed view of a classroom for a student:
 *  - Displays classroom metadata and leave action
 *  - Lists published exams under this classroom
 *  - Shows runtime states (upcoming, active, closed)
 *  - Shows student's attempt status and CTA (Start, Resume, Results)
 */

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useStudentClassrooms,
  useStudentClassroomExams,
  useLeaveClassroom,
} from "../../hooks/useStudentTeacherExams.js";
import { useStudentClassroomAssignments } from "../../hooks/useStudentAssignments.js";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Tabs,
  LoadingState,
  EmptyState,
  Alert,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingState,
} from "../../components/ui/index.js";
import { ConfirmModal } from "../../components/teacher/common/ConfirmModal.js";
import { ExamStatusBadge } from "../../components/teacher/exams/ExamStatusBadge.js";
import { StudentAssignmentsTable } from "../../components/student/assignments/StudentAssignmentsTable.js";
import { formatPersianExamDate, formatPersianTimeOnly, formatPersianExamTimeRange } from "../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import {
  GraduationCap,
  LogOut,
  Calendar,
  Clock,
  ArrowRight,
  HelpCircle,
  Play,
  RotateCw,
  Eye,
  FileText,
} from "lucide-react";

export function StudentClassroomDetailPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  const [activeTabId, setActiveTabId] = useState("exams");
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const classroomsQuery = useStudentClassrooms();
  const examsQuery = useStudentClassroomExams(classroomId);
  const assignmentsQuery = useStudentClassroomAssignments(classroomId);
  const leaveMutation = useLeaveClassroom();

  const classroom = classroomsQuery.data?.classrooms?.find((c) => c.id === classroomId);
  const exams = examsQuery.data?.exams ?? [];
  const assignments = assignmentsQuery.data?.assignments ?? [];

  const handleConfirmLeave = async () => {
    if (!classroomId) return;
    setLeaveError(null);
    try {
      await leaveMutation.mutateAsync(classroomId);
      setLeaveModalOpen(false);
      navigate("/classrooms");
    } catch (err) {
      setLeaveError(
        err instanceof Error ? err.message : "خطا در خروج از کلاس. لطفاً مجدداً تلاش کنید.",
      );
    }
  };

  if (classroomsQuery.isLoading) {
    return (
      <div className="w-full py-20 flex justify-center font-sans" dir="rtl">
        <LoadingState message="در حال دریافت اطلاعات کلاس..." />
      </div>
    );
  }

  // Security / IDOR: If student is not an active member of this classroom
  if (examsQuery.isError || (!classroomsQuery.isLoading && !classroom)) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="کلاس یافت نشد"
          description="اطلاعات این کلاس در دسترس نیست یا شما عضو فعال آن نیستید."
          icon={<GraduationCap className="w-12 h-12 text-[var(--color-text-muted)]" />}
          action={
            <Link to="/classrooms">
              <Button variant="primary">بازگشت به کلاس‌های من</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const tabItems = [
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
            <span className="text-xs text-[var(--color-text-muted)]">
              {toPersianDigits(assignments.length)} تکلیف تعریف شده
            </span>
          </div>
          <StudentAssignmentsTable
            assignments={assignments}
            isLoading={assignmentsQuery.isLoading}
            classroomId={classroom?.id ?? ""}
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
              آزمون‌های این کلاس
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {toPersianDigits(exams.length)} آزمون منتشر شده
            </span>
          </div>

          {examsQuery.isLoading ? (
            <div className="py-12 flex justify-center">
              <LoadingState message="در حال بارگذاری لیست آزمون‌های کلاس..." />
            </div>
          ) : exams.length === 0 ? (
            <Card className="p-8 text-center border border-[var(--color-border)] rounded-2xl">
              <HelpCircle className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
              <h3 className="text-base font-bold text-[var(--color-text)]">
                هنوز آزمونی برای این کلاس تعریف یا منتشر نشده است
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-md mx-auto leading-relaxed">
                به محض انتشار آزمون جدید توسط استاد، آن را در این صفحه مشاهده خواهید کرد.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow hoverable={false}>
                      <TableHead>عنوان آزمون</TableHead>
                      <TableHead>وضعیت برگزاری</TableHead>
                      <TableHead>مدت زمان</TableHead>
                      <TableHead>بازه زمانی برگزاری</TableHead>
                      <TableHead>وضعیت شرکت شما</TableHead>
                      <TableHead className="text-center">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exams.map((exam) => {
                      const isUpcoming = exam.runtimeState === "upcoming";
                      const isActive = exam.runtimeState === "active";
                      const isClosed = exam.runtimeState === "closed";
                      const hasInProgressAttempt = exam.attemptStatus === "in_progress";
                      const isCompletedAttempt =
                        exam.attemptStatus === "submitted" || exam.attemptStatus === "timed_out";

                      return (
                        <TableRow key={exam.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <Link
                                to={`/classrooms/${classroomId}/exams/${exam.id}`}
                                className="font-bold text-sm text-[var(--color-text)] hover:text-[#008080] transition-colors"
                              >
                                {exam.title}
                              </Link>
                              {exam.description && (
                                <span className="text-xs text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
                                  {exam.description}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <ExamStatusBadge
                              exam={{
                                status: "published",
                                startsAt: exam.startsAt,
                                endsAt: exam.endsAt,
                                closedAt: null,
                              }}
                              size="sm"
                            />
                          </TableCell>

                          <TableCell className="text-xs text-[var(--color-text-muted)] font-mono">
                            {toPersianDigits(exam.durationMinutes)} دقیقه
                          </TableCell>

                          <TableCell className="text-xs text-[var(--color-text-muted)]">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-[var(--color-text)]">{formatPersianExamDate(exam.startsAt)}</span>
                              <span className="text-[11px]">ساعت {formatPersianTimeOnly(exam.startsAt)} تا {formatPersianTimeOnly(exam.endsAt)}</span>
                            </div>
                          </TableCell>

                          <TableCell>
                            {hasInProgressAttempt ? (
                              <Badge variant="warning" size="sm">
                                در حال انجام
                              </Badge>
                            ) : isCompletedAttempt ? (
                              <div className="flex flex-col gap-1 items-start">
                                <Badge variant="success" size="sm">
                                  {exam.attemptStatus === "submitted" ? "پایان یافته" : "پایان زمان"}
                                </Badge>
                                {exam.score !== null && exam.score !== undefined && (
                                  <span className="text-[11px] font-bold text-[#008080]">
                                    نمره: {toPersianDigits(exam.score)} از {toPersianDigits(exam.maxScore ?? 100)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--color-text-muted)]">
                                شرکت نکرده‌اید
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            {isUpcoming ? (
                              <Button size="sm" variant="outline" disabled>
                                شروع نشده
                              </Button>
                            ) : isActive && !exam.hasAttempt ? (
                              <Link to={`/classrooms/${classroomId}/exams/${exam.id}`}>
                                <Button size="sm" variant="primary">
                                  <Play className="w-3.5 h-3.5 ml-1" />
                                  شرکت در آزمون
                                </Button>
                              </Link>
                            ) : isActive && hasInProgressAttempt ? (
                              <Link to={`/classrooms/${classroomId}/exams/${exam.id}/take`}>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="bg-amber-600 hover:bg-amber-700"
                                >
                                  <RotateCw className="w-3.5 h-3.5 ml-1" />
                                  ادامه آزمون
                                </Button>
                              </Link>
                            ) : isCompletedAttempt ? (
                              <Link to={`/classrooms/${classroomId}/exams/${exam.id}/results`}>
                                <Button size="sm" variant="outline">
                                  <Eye className="w-3.5 h-3.5 ml-1" />
                                  مشاهده نتیجه
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="outline" disabled>
                                پایان یافته
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {exams.map((exam) => {
                  const isUpcoming = exam.runtimeState === "upcoming";
                  const isActive = exam.runtimeState === "active";
                  const isClosed = exam.runtimeState === "closed";
                  const hasInProgressAttempt = exam.attemptStatus === "in_progress";
                  const isCompletedAttempt =
                    exam.attemptStatus === "submitted" || exam.attemptStatus === "timed_out";

                  return (
                    <Card key={exam.id} className="p-4 border border-[var(--color-border)] rounded-2xl space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/classrooms/${classroomId}/exams/${exam.id}`}
                          className="font-bold text-sm text-[var(--color-text)] hover:text-[#008080]"
                        >
                          {exam.title}
                        </Link>
                        <ExamStatusBadge
                          exam={{
                            status: "published",
                            startsAt: exam.startsAt,
                            endsAt: exam.endsAt,
                            closedAt: null,
                          }}
                          size="sm"
                        />
                      </div>

                      {exam.description && (
                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                          {exam.description}
                        </p>
                      )}

                      <div className="text-xs text-[var(--color-text-muted)] space-y-1 pt-2 border-t border-[var(--color-border)]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>مدت زمان: {toPersianDigits(exam.durationMinutes)} دقیقه</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>زمان برگزاری: {formatPersianExamTimeRange(exam.startsAt, exam.endsAt)}</span>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2">
                        <div>
                          {hasInProgressAttempt ? (
                            <Badge variant="warning" size="sm">
                              در حال انجام
                            </Badge>
                          ) : isCompletedAttempt ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="success" size="sm">
                                ثبت شده
                              </Badge>
                              {exam.score !== null && exam.score !== undefined && (
                                <span className="text-[11px] font-bold text-[#008080]">
                                  نمره: {toPersianDigits(exam.score)}
                                </span>
                              )}
                            </div>
                          ) : isClosed ? (
                            <span className="text-xs text-[var(--color-text-muted)]">
                              شرکت نکرده‌اید
                            </span>
                          ) : null}
                        </div>

                        <div>
                          {isUpcoming ? (
                            <Button size="sm" variant="outline" disabled>
                              شروع نشده
                            </Button>
                          ) : isActive && !exam.hasAttempt ? (
                            <Link to={`/classrooms/${classroomId}/exams/${exam.id}`}>
                              <Button size="sm" variant="primary">
                                شرکت در آزمون
                              </Button>
                            </Link>
                          ) : isActive && hasInProgressAttempt ? (
                            <Link to={`/classrooms/${classroomId}/exams/${exam.id}/take`}>
                              <Button size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700">
                                ادامه آزمون
                              </Button>
                            </Link>
                          ) : isCompletedAttempt ? (
                            <Link to={`/classrooms/${classroomId}/exams/${exam.id}/results`}>
                              <Button size="sm" variant="outline">
                                مشاهده نتیجه
                              </Button>
                            </Link>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              پایان یافته
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 font-sans" dir="rtl">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-4">
        <Link to="/classrooms" className="hover:text-[#008080] transition-colors">
          کلاس‌های من
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold">{classroom?.title}</span>
      </div>

      {/* Header */}
      <PageHeader
        title={classroom?.title ?? "جزئیات کلاس"}
        description={classroom?.description ?? "مشاهده تکالیف و شرکت در آزمون‌های کلاسی"}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setLeaveModalOpen(true)}
          >
            <LogOut className="w-4 h-4 ml-1" />
            خروج از کلاس
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mt-8">
        <Tabs
          items={tabItems}
          activeTabId={activeTabId}
          onChange={setActiveTabId}
          variant="underline"
        />
      </div>

      {/* Leave Classroom Confirm Modal */}
      <ConfirmModal
        isOpen={leaveModalOpen}
        title="خروج از کلاس"
        description="آیا از خروج از این کلاس اطمینان دارید؟ با خروج از کلاس، دسترسی شما به آزمون‌های آن لغو خواهد شد اما تلاش‌های ثبت‌شده قبلی شما در سیستم محفوظ می‌ماند."
        confirmText="تأیید و خروج"
        cancelText="انصراف"
        variant="danger"
        isProcessing={leaveMutation.isPending}
        errorMessage={leaveError}
        onConfirm={handleConfirmLeave}
        onCancel={() => setLeaveModalOpen(false)}
      />
    </div>
  );
}
