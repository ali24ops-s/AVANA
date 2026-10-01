/**
 * TeacherDashboardPage.
 *
 * Operational overview for teachers:
 *  - High-level counts derived strictly from existing classroom responses:
 *      * total classrooms
 *      * total enrolled members
 *      * total defined exams
 *  - Quick actions (Create Classroom, Manage Classrooms)
 *  - Preview of active classrooms with quick invite-code copy
 *
 * No fabricated analytics or trends are displayed.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { useTeacherClassrooms } from "../../hooks/useTeacher.js";
import { useTeacherOrganization } from "../../components/teacher/TeacherOrganizationContext.js";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  LoadingState,
  Alert,
  EmptyState,
} from "../../components/ui/index.js";
import { CreateClassroomModal } from "../../components/teacher/classrooms/CreateClassroomModal.js";
import {
  Users,
  GraduationCap,
  HelpCircle,
  Plus,
  ArrowLeft,
  Copy,
  Check,
  Building,
  ExternalLink,
} from "lucide-react";

export function TeacherDashboardPage() {
  const { user } = useAuth();
  const {
    selectedOrgId,
    selectedOrg,
    availableOrgs,
    isLoadingOrgs,
    orgsError,
    needsOrgSelection,
    hasNoOrganizations,
    isPlatformAdmin,
    setSelectedOrgId,
  } = useTeacherOrganization();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Invariant: query is only fired when a valid organizationId exists
  const { data, isLoading, error } = useTeacherClassrooms(selectedOrgId ?? undefined);
  const classrooms = data?.classrooms ?? [];

  const handleCopyInvite = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Derive purely operational metrics from existing backend response
  const activeClassrooms = classrooms.filter((c) => c && c.status === "active");
  const totalEnrolled = classrooms.reduce((sum, c) => sum + (c?.membersCount ?? 0), 0);
  const totalExams = classrooms.reduce((sum, c) => sum + (c?.examsCount ?? 0), 0);

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
          title="داشبورد مدیریت آموزش"
          description="سلام مدیر ارشد سامانه؛ به پنل اساتید خوش آمدید."
          badge={{
            text: "پنل اساتید",
            icon: <GraduationCap className="w-3.5 h-3.5" />,
          }}
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
          title="داشبورد مدیریت آموزش"
          description="سلام مدیر ارشد سامانه؛ لطفاً سازمان مورد نظر خود را جهت مشاهده و مدیریت کلاس‌ها انتخاب کنید."
          badge={{
            text: "پنل اساتید",
            icon: <GraduationCap className="w-3.5 h-3.5" />,
          }}
        />
        <Card className="p-6 border border-amber-500/30 bg-amber-500/5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
                انتخاب سازمان آموزشی
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                شما به عنوان مدیر ارشد سیستم به چندین سازمان دسترسی دارید. لطفاً سازمان مورد نظر خود را جهت مدیریت کلاس‌ها انتخاب نمایید.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
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
        </Card>
      </div>
    );
  }

  if (!selectedOrgId) {
    return (
      <div className="space-y-4">
        <Alert variant="warning" title="عدم انتساب به سازمان">
          شما به هیچ سازمانی متصل نیستید. برای استفاده از پنل اساتید، باید عضویت معتبر در یک سازمان داشته باشید.
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-20 flex items-center justify-center font-sans">
        <LoadingState message="در حال بارگذاری اطلاعات داشبورد اساتید..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="خطا در دریافت اطلاعات داشبورد">
          {error.message || "امکان بارگذاری اطلاعات کلاس‌ها وجود ندارد."}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 font-sans" dir="rtl">
      {/* Header */}
      <PageHeader
        title="داشبورد مدیریت آموزش"
        description={`سلام ${user?.name || "استاد گرامی"}؛ به پنل اساتید خوش آمدید. مدیریت کلاس‌ها، دانش‌آموزان و آزمون‌ها از این بخش انجام می‌شود.`}
        badge={{
          text: "پنل اساتید",
          icon: <GraduationCap className="w-3.5 h-3.5" />,
        }}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/teacher/classrooms">
              <Button variant="outline" size="sm">
                مشاهده همه کلاس‌ها
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreateModalOpen(true)}
            >
              ایجاد کلاس جدید
            </Button>
          </div>
        }
      />

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 border border-[var(--color-border)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[var(--color-text)]">
              {activeClassrooms.length.toLocaleString("fa-IR")}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">
              کلاس‌های فعال تحت آموزش
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-[var(--color-border)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#5ba0c4]/15 text-[#2b6d8f] flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[var(--color-text)]">
              {totalEnrolled.toLocaleString("fa-IR")}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">
              دانش‌آموزان عضو کلاس‌ها
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-[var(--color-border)] shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-[var(--color-text)]">
              {totalExams.toLocaleString("fa-IR")}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">
              مجموع آزمون‌های تعریف‌شده
            </div>
          </div>
        </Card>
      </div>

      {/* Active Classrooms Quick Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
            کلاس‌های فعال شما
          </h2>
          <Link
            to="/teacher/classrooms"
            className="text-xs font-semibold text-[#008080] hover:underline flex items-center gap-1"
          >
            <span>مدیریت کامل کلاس‌ها</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeClassrooms.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="w-8 h-8" />}
            title="هنوز کلاسی ایجاد نکرده‌اید"
            description="با ایجاد اولین کلاس آموزشی، یک کد دعوت اختصاصی دریافت می‌کنید که دانش‌آموزان با استفاده از آن می‌توانند به کلاس ملحق شوند."
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeClassrooms.slice(0, 6).map((classroom) => (
              <Card
                key={classroom.id}
                className="p-5 border border-[var(--color-border)] hover:border-[#008080]/50 transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)] line-clamp-1">
                      {classroom.title}
                    </h3>
                    <Badge variant="success" size="sm">
                      فعال
                    </Badge>
                  </div>

                  {classroom.description && (
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                      {classroom.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-[var(--color-border)] space-y-3">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                    <span>{(classroom.membersCount ?? 0).toLocaleString("fa-IR")} دانش‌آموز</span>
                    <span>{(classroom.examsCount ?? 0).toLocaleString("fa-IR")} آزمون</span>
                  </div>

                  {/* Invite Code Bar */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[var(--color-text-muted)]">کد دعوت:</span>
                      <code className="text-xs font-mono font-bold text-[#008080] tracking-wider select-all">
                        {classroom.inviteCode}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(classroom.inviteCode)}
                      className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
                      title="کپی کد دعوت"
                    >
                      {copiedCode === classroom.inviteCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <Link to={`/teacher/classrooms/${classroom.id}`} className="block">
                    <Button variant="secondary" size="sm" fullWidth className="text-xs">
                      ورود به مدیریت کلاس
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Create Classroom */}
      {createModalOpen && selectedOrgId && (
        <CreateClassroomModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          organizationId={selectedOrgId}
        />
      )}
    </div>
  );
}
