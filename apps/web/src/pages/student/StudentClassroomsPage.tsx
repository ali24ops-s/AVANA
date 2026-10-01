/**
 * StudentClassroomsPage.
 *
 * Primary dashboard for student classrooms:
 *  - Lists active enrolled classrooms
 *  - Displays join date, title, description, and status
 *  - Provides action to join a new classroom via invite code
 *  - Clean RTL Estedad styling adhering to AVANA design system
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  LoadingState,
  EmptyState,
  Alert,
} from "../../components/ui/index.js";
import { useStudentClassrooms } from "../../hooks/useStudentTeacherExams.js";
import { JoinClassroomModal } from "../../components/student-exams/JoinClassroomModal.js";
import { formatPersianExamDate } from "../../utils/date.js";
import { GraduationCap, Plus, ArrowLeft, BookOpen, Calendar } from "lucide-react";

export function StudentClassroomsPage() {
  const navigate = useNavigate();
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const classroomsQuery = useStudentClassrooms();
  const classrooms = classroomsQuery.data?.classrooms ?? [];

  const handleJoined = (classroomId: string) => {
    navigate(`/classrooms/${classroomId}`);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 font-sans" dir="rtl">
      {/* Page Header */}
      <PageHeader
        title="کلاس‌های من"
        description="مشاهده کلاس‌های فعال، تکالیف و شرکت در آزمون‌های طراحی‌شده توسط اساتید"
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => setJoinModalOpen(true)}
          >
            <Plus className="w-4 h-4 ml-1" />
            عضویت در کلاس جدید
          </Button>
        }
      />

      {/* Main Content Area */}
      <div className="mt-6">
        {classroomsQuery.isLoading ? (
          <div className="py-20 flex justify-center">
            <LoadingState message="در حال دریافت لیست کلاس‌های شما..." />
          </div>
        ) : classroomsQuery.isError ? (
          <Alert variant="error" title="خطا در دریافت کلاس‌ها">
            مشکلی در برقراری ارتباط با سرور رخ داده است.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => classroomsQuery.refetch()}
              >
                تلاش مجدد
              </Button>
            </div>
          </Alert>
        ) : classrooms.length === 0 ? (
          <EmptyState
            title="هنوز در هیچ کلاسی عضو نیستید"
            description="برای دسترسی به آزمون‌های کلاسی، کد دعوت ارائه‌شده توسط استاد خود را وارد کرده و در کلاس عضو شوید."
            icon={<GraduationCap className="w-12 h-12 text-[var(--color-text-muted)]" />}
            action={
              <Button
                variant="primary"
                onClick={() => setJoinModalOpen(true)}
              >
                <Plus className="w-4 h-4 ml-1" />
                عضویت در اولین کلاس
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {classrooms.map((c) => (
              <Card
                key={c.id}
                className="flex flex-col justify-between p-5 border border-[var(--color-border)] hover:border-[#008080]/40 transition-all duration-200 bg-[var(--color-surface)] shadow-xs hover:shadow-sm rounded-2xl group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <Badge variant="success" size="sm">
                      عضو فعال
                    </Badge>
                  </div>

                  <h3 className="text-base font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors line-clamp-1">
                    {c.title}
                  </h3>

                  {c.description ? (
                    <p className="text-xs text-[var(--color-text-muted)] mt-2 line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)] mt-2 italic">
                      بدون توضیحات تکمیلی
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>عضویت: {formatPersianExamDate(c.firstJoinedAt)}</span>
                  </div>

                  <Link to={`/classrooms/${c.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="group-hover:bg-[#008080] group-hover:text-white group-hover:border-[#008080] transition-all"
                    >
                      ورود به کلاس
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Join Modal */}
      <JoinClassroomModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        onJoined={handleJoined}
      />
    </div>
  );
}
