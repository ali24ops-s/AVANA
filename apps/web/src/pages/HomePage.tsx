/**
 * Home / Dashboard page after login.
 *
 * Implements Google Stitch dark glassmorphic dashboard layout:
 *  - Greeting header with Persian date badge
 *  - Hero banner with progress bar & CTA
 *  - 4-card study stats grid (study time, completed lessons, quizzes, streak)
 *  - "My Courses" grid card list
 *  - AI Mentor sidebar card ("دستیار هوشمند آوانا")
 *  - Today's study plan & content recommendations
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Brain,
  Flame,
  Calendar,
  ArrowLeft,
  Check,
  Sparkles,
  Plus,
  X,
  AlertCircle,
  Layers,
  Eye,
  PlusCircle,
  Users,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createStudyApi } from "../lib/api/study.js";
import { toPersianDigits, getWeeklyStudyComparison } from "@avana/domain";
import { useAuth } from "../providers/AuthProvider.js";
import {
  useCurrentPersianDate,
  calculateDaysRemaining,
  formatPersianExamDate,
} from "../utils/date.js";
import { PersianDatePicker } from "../components/ui/PersianDatePicker.js";
import { useDailyMotivationalQuote } from "../utils/dailyQuote.js";
import { StudyAssistantModal } from "../components/ai/StudyAssistantModal.js";
import { useLibraryPacks } from "../hooks/useLibrary.js";
import { PackDetailModal } from "../components/library/PackDetailModal.js";
import { AddToCourseModal } from "../components/library/AddToCourseModal.js";
import type { CourseResource } from "@avana/contracts";
import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
} from "@avana/domain";

export function HomePage() {
  const { user, memberships } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [selectedCourseIdForExam, setSelectedCourseIdForExam] = useState<string | undefined>();

  // Selected pack for Detail Preview Modal
  const [detailPackId, setDetailPackId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Selected pack for Add-to-Course Modal
  const [targetPack, setTargetPack] = useState<
    PublicContentPackItemSummary | PublicContentPackDetailResource | null
  >(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleViewPackDetails = (pack: PublicContentPackItemSummary) => {
    setDetailPackId(pack.id);
    setIsDetailOpen(true);
  };

  const handleAddToCourse = (
    pack: PublicContentPackItemSummary | PublicContentPackDetailResource,
  ) => {
    setTargetPack(pack);
    setIsAddOpen(true);
  };

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);
  const studyApi = createStudyApi(apiClient);

  // Fetch real active study time for current week
  const studyTimeQuery = useQuery({
    queryKey: ["dashboard-study-time"],
    queryFn: () => studyApi.getDashboardStudyTime(),
  });

  // Fetch organization and courses for user learning status
  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organization =
    orgQuery.data?.items?.[0] ||
    (memberships && memberships.length > 0
      ? { id: memberships[0].organization_id, name: "سازمان یادگیری" }
      : undefined);

  const coursesQuery = useQuery({
    queryKey: ["my-courses", organization?.id],
    queryFn: () => courseApi.listMyCourses(organization!.id),
    enabled: !!organization?.id,
  });

  const allCoursesQuery = useQuery({
    queryKey: ["all-courses", organization?.id],
    queryFn: () => courseApi.listCourses(organization!.id),
    enabled: !!organization?.id,
  });

  const courses = (coursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const allOrgCourses = (allCoursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const availableCourses = allOrgCourses.length > 0 ? allOrgCourses.filter((c) => !c.archived) : courses.filter((c) => !c.archived);

  // Upcoming exams: sorted by nearest date ascending (smallest days remaining first)
  const upcomingExams = courses
    .filter((c) => !!c.exam_at && !c.archived)
    .map((c) => ({
      course: c,
      daysRemaining: calculateDaysRemaining(c.exam_at!),
    }))
    .filter((item) => item.daysRemaining >= 0)
    .sort((a, b) => {
      const dateA = new Date(a.course.exam_at!).getTime();
      const dateB = new Date(b.course.exam_at!).getTime();
      return dateA - dateB;
    });

  // Filter out archived courses and sort by recency (created_at/updated_at descending)
  const activeCourses = courses.filter((c) => !c.archived);
  const sortedActive = [...activeCourses].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const primaryCourse =
    sortedActive.length > 0
      ? sortedActive[0]
      : courses.length > 0
        ? courses[0]
        : null;

  // Extract display name (prefer name if available, otherwise email prefix)
  const userDisplayName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : user?.email
        ? user.email.split("@")[0]
        : "کاربر";

  const currentDate = useCurrentPersianDate();
  const dailyQuote = useDailyMotivationalQuote();

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Welcome Greeting Header & Date Badge */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
            سلام {userDisplayName} 👋
          </h2>
          <p className="text-sm md:text-base text-slate-400">
            {dailyQuote}
          </p>
        </div>
        <div className="glass-panel px-4 py-2 rounded-full shadow-ambient card-inner-border text-xs md:text-sm text-slate-300 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-purple-400" />
          <span className="text-purple-400 font-bold">{currentDate.formattedHeader}</span>
          <span>{currentDate.year}</span>
        </div>
      </div>

      {/* 2. Main 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Main Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero Card / Top Courses Carousel */}
          <HeroCoursesCarousel
            courses={activeCourses}
            isLoading={coursesQuery.isLoading || orgQuery.isLoading}
          />

          {/* Stats Grid (4 Cards) */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <Clock className="w-7 h-7 text-purple-400 mb-2" />
              {studyTimeQuery.isLoading ? (
                <div className="h-7 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                </div>
              ) : (
                <span className="text-lg font-bold text-white">
                  {studyTimeQuery.data?.thisWeek?.formatted || "۰ دقیقه"}
                </span>
              )}
              <span className="text-xs text-slate-400 mt-1">
                زمان مطالعه این هفته
              </span>
              {studyTimeQuery.data && !studyTimeQuery.isLoading && (
                (() => {
                  const thisWeekSec = studyTimeQuery.data.thisWeek?.seconds ?? 0;
                  const lastWeekSec = studyTimeQuery.data.lastWeek?.seconds ?? 0;
                  const lastWeekFormatted = studyTimeQuery.data.lastWeek?.formatted;
                  const comparison = getWeeklyStudyComparison(
                    thisWeekSec,
                    lastWeekSec,
                    lastWeekFormatted,
                  );

                  const colorClass =
                    comparison.type === "increase" || comparison.type === "new_start"
                      ? "text-emerald-400 font-medium"
                      : comparison.type === "decrease"
                        ? "text-rose-400 font-medium"
                        : comparison.type === "last_week_reference"
                          ? "text-purple-300 font-medium bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/25 shadow-xs"
                          : "text-slate-400";

                  return (
                    <span
                      className={`text-[10px] mt-1.5 flex items-center justify-center gap-0.5 ${colorClass}`}
                    >
                      {comparison.text}
                    </span>
                  );
                })()
              )}
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <CheckCircle2 className="w-7 h-7 text-teal-400 mb-2" />
              {studyTimeQuery.isLoading ? (
                <div className="h-7 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                </div>
              ) : (
                <span className="text-lg font-bold text-white">
                  {toPersianDigits(studyTimeQuery.data?.stats?.completedLessons ?? 0)}
                </span>
              )}
              <span className="text-xs text-slate-400 mt-1">
                درس‌های تکمیل‌شده
              </span>
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <FileText className="w-7 h-7 text-cyan-400 mb-2" />
              {studyTimeQuery.isLoading ? (
                <div className="h-7 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                </div>
              ) : (
                <span className="text-lg font-bold text-white">
                  {toPersianDigits(studyTimeQuery.data?.stats?.completedExams ?? 0)}
                </span>
              )}
              <span className="text-xs text-slate-400 mt-1">آزمون‌ها</span>
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <Flame className="w-7 h-7 text-orange-400 mb-2 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
              {studyTimeQuery.isLoading ? (
                <div className="h-7 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                </div>
              ) : (
                <span className="text-lg font-bold text-white">
                  {toPersianDigits(studyTimeQuery.data?.stats?.currentStreak ?? 0)} روز
                </span>
              )}
              <span className="text-xs text-slate-400 mt-1">streak</span>
            </div>
          </section>

          {/* Popular Content Packs Section (محبوب‌ترین بسته‌های محتوای آموزشی) */}
          <PopularContentPacksSection
            onViewDetails={handleViewPackDetails}
            onAddToCourse={handleAddToCourse}
          />
        </div>

        {/* Right / Side Column (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* AI Mentor Card (Stitch Reference) */}
          <section
            id="assistant-section"
            className="bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-xl p-6 rounded-xl shadow-ambient-lg card-inner-border relative overflow-hidden border-t-4 border-t-purple-500 space-y-4"
          >
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-purple-600/20 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30 shrink-0">
                <Brain className="w-6 h-6 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">
                  دستیار هوشمند آوانا
                </h3>
                <span className="text-[10px] text-purple-300 font-medium">
                  پاسخگویی هوشمند با Cloudflare AI
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed relative z-10">
              درباره امکانات آوانا، تبدیل جزوه به درس و آزمون، روش‌های مرور و برنامه‌ریزی مطالعه از من بپرس.
            </p>
            <div className="flex items-center gap-2 relative z-10">
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-md active:scale-98 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>از آوانا بپرس</span>
              </button>
              {primaryCourse && (
                <Link
                  to={`/courses/${primaryCourse.id}`}
                  title="رفتن به آخرین درس"
                  className="bg-white/10 text-slate-300 hover:text-white px-3 py-2.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/15 transition-all flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              )}
            </div>
          </section>

          {/* Today's Study Plan */}
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4 relative overflow-hidden">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-400" />
              <span>برنامه مطالعه امروز</span>
            </h3>

            <div className="relative">
              {/* Blurred items mockup */}
              <ul className="space-y-2.5 filter blur-[3px] opacity-40 select-none pointer-events-none" aria-hidden="true">
                <li className="flex items-start gap-3 p-3 rounded-lg border border-transparent">
                  <div className="w-5 h-5 rounded border-2 border-slate-600 flex items-center justify-center mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      مرور فلش‌کارت‌های آناتومی
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ۳۰ کارت • ۱۵ دقیقه
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3 rounded-lg bg-teal-900/20 border border-teal-500/30">
                  <div className="w-5 h-5 rounded bg-teal-500 border-2 border-teal-500 flex items-center justify-center mt-0.5 text-slate-900 shadow-[0_0_8px_rgba(20,184,166,0.5)] shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 line-through">
                      کوییز فیزیولوژی قلب
                    </p>
                    <p className="text-[11px] text-teal-300/80 mt-0.5">
                      تکمیل شده • نمره: ۱۸/۲۰
                    </p>
                  </div>
                </li>

                <li className="flex items-start gap-3 p-3 rounded-lg border border-transparent">
                  <div className="w-5 h-5 rounded border-2 border-slate-600 flex items-center justify-center mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      مطالعه فصل ۵ فارماکولوژی
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      صفحات ۱۲۰-۱۴۵
                    </p>
                  </div>
                </li>
              </ul>

              {/* Coming soon overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 backdrop-blur-[1px] rounded-lg">
                <span className="px-6 py-2.5 rounded-2xl bg-teal-500/15 border border-teal-500/40 text-teal-200 text-base sm:text-lg font-bold shadow-[0_0_20px_rgba(20,184,166,0.25)] backdrop-blur-md">
                  به‌زودی
                </span>
              </div>
            </div>
          </section>

          {/* Upcoming Exams Section (Replaced Content Recommendations) */}
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-teal-400" />
                <span>امتحانات پیش رو</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedCourseIdForExam(undefined);
                  setIsAddExamOpen(true);
                }}
                className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن امتحان</span>
              </button>
            </div>

            {coursesQuery.isLoading ? (
              <div className="p-6 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
              </div>
            ) : upcomingExams.length > 0 ? (
              <div className="space-y-2.5">
                {upcomingExams.map(({ course, daysRemaining }) => {
                  const formattedDate = formatPersianExamDate(course.exam_at!);
                  const urgencyTheme =
                    daysRemaining < 3
                      ? {
                          badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
                          iconBox: "bg-rose-950/40 border-rose-500/30 text-rose-400",
                        }
                      : daysRemaining < 7
                        ? {
                            badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                            iconBox: "bg-amber-950/40 border-amber-500/30 text-amber-400",
                          }
                        : {
                            badge: "bg-teal-500/20 text-teal-300 border-teal-500/30",
                            iconBox: "bg-teal-950/40 border-teal-500/30 text-teal-400",
                          };

                  return (
                    <div
                      key={course.id}
                      className="glass-panel p-3.5 rounded-xl card-inner-border flex items-center justify-between gap-3 hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${urgencyTheme.iconBox}`}
                        >
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/courses/${course.id}`}
                            className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors truncate block"
                            title={course.title}
                          >
                            {course.title}
                          </Link>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            تاریخ امتحان: {formattedDate}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgencyTheme.badge}`}
                        >
                          {daysRemaining === 0
                            ? "امروز"
                            : `${toPersianDigits(daysRemaining)} روز باقیمانده`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCourseIdForExam(course.id);
                            setIsAddExamOpen(true);
                          }}
                          className="text-[11px] text-slate-400 hover:text-teal-300 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
                          title="ویرایش تاریخ امتحان"
                          aria-label={`ویرایش امتحان ${course.title}`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-400 mb-2.5">
                  <Calendar className="w-5 h-5 text-teal-400/80" />
                </div>
                <p className="text-xs font-bold text-slate-300">
                  هیچ امتحانی ثبت نشده است
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                  با ثبت تاریخ آزمون‌ها، زمان‌بندی و مطالعه خود را مدیریت کنید.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCourseIdForExam(undefined);
                    setIsAddExamOpen(true);
                  }}
                  className="mt-3.5 text-xs text-teal-400 font-bold hover:text-teal-300 inline-flex items-center gap-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن امتحان</span>
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Floating Smart Assistant Modal */}
      <StudyAssistantModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        contextType="dashboard"
      />

      {/* Add / Edit Exam Modal */}
      <AddExamModal
        isOpen={isAddExamOpen}
        onClose={() => {
          setIsAddExamOpen(false);
          setSelectedCourseIdForExam(undefined);
        }}
        organizationId={organization?.id}
        courses={availableCourses}
        initialCourseId={selectedCourseIdForExam}
      />

      {/* Pack Detail Preview Modal */}
      <PackDetailModal
        packId={detailPackId}
        open={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailPackId(null);
        }}
        onAddToCourse={(pack) => {
          setIsDetailOpen(false);
          handleAddToCourse(pack);
        }}
      />

      {/* Add To Course Selection Modal */}
      <AddToCourseModal
        pack={targetPack}
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setTargetPack(null);
        }}
      />
    </div>
  );
}

interface AddExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
  courses: CourseResource[];
  initialCourseId?: string;
}

function AddExamModal({
  isOpen,
  onClose,
  organizationId,
  courses,
  initialCourseId,
}: AddExamModalProps) {
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId || "");
  const [examDate, setExamDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when modal opens or initialCourseId changes
  useEffect(() => {
    if (isOpen) {
      const courseId = initialCourseId || (courses.length > 0 ? courses[0].id : "");
      setSelectedCourseId(courseId);
      const found = courses.find((c) => c.id === courseId);
      if (found?.exam_at) {
        try {
          const d = new Date(found.exam_at);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setExamDate(`${yyyy}-${mm}-${dd}`);
        } catch {
          setExamDate("");
        }
      } else {
        setExamDate("");
      }
      setError(null);
    }
  }, [isOpen, initialCourseId, courses]);

  // When course selection changes, prefill if that course has an exam date
  const handleCourseChange = (newCourseId: string) => {
    setSelectedCourseId(newCourseId);
    const found = courses.find((c) => c.id === newCourseId);
    if (found?.exam_at) {
      try {
        const d = new Date(found.exam_at);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setExamDate(`${yyyy}-${mm}-${dd}`);
      } catch {
        setExamDate("");
      }
    } else {
      setExamDate("");
    }
  };

  // Keyboard Escape listener & scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setError("لطفاً یک درس را انتخاب کنید.");
      return;
    }
    if (!examDate) {
      setError("لطفاً تاریخ امتحان را مشخص کنید.");
      return;
    }

    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const targetOrgId =
      (selectedCourse as { organization_id?: string } | undefined)
        ?.organization_id || organizationId;

    if (!targetOrgId) {
      setError("شناسه سازمان یادگیری یافت نشد.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const courseApi = createCourseApi(apiClient);

      const isoDate = new Date(`${examDate}T00:00:00.000Z`).toISOString();

      await courseApi.updateCourse(targetOrgId, selectedCourseId, {
        exam_at: isoDate,
      });

      // Ensure course is in user's enrolled courses list if not already
      try {
        await courseApi.addMyCourse(targetOrgId, selectedCourseId);
      } catch {
        // Ignore if already added
      }

      await queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["all-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["course"] });

      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ثبت تاریخ امتحان",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-exam-modal-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-800/40">
          <div className="flex items-center gap-2 text-teal-400">
            <GraduationCap className="w-5 h-5" />
            <h3 id="add-exam-modal-title" className="text-base font-bold text-white">
              {selectedCourse?.exam_at ? "ویرایش تاریخ امتحان" : "افزودن تاریخ امتحان"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Select Course */}
          <div className="space-y-1.5">
            <label
              htmlFor="exam-course-select"
              className="block text-xs font-semibold text-slate-300"
            >
              انتخاب درس / دوره
            </label>
            {courses.length > 0 ? (
              <select
                id="exam-course-select"
                value={selectedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full bg-slate-800/90 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                required
              >
                <option value="">-- یک درس را انتخاب کنید --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.exam_at ? " (دارای امتحان)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-400 p-3 bg-slate-800/40 rounded-xl border border-white/5">
                دوره‌ای برای انتخاب موجود نیست.
              </p>
            )}
          </div>

          {/* Persian Exam Date Picker */}
          <div className="space-y-1.5">
            <PersianDatePicker
              id="exam-date-input"
              label="تاریخ برگزاری امتحان"
              value={examDate}
              onChange={(isoDate) => setExamDate(isoDate)}
              minDate={new Date()}
              required
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting || courses.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-teal-900/40 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال ثبت...</span>
                </>
              ) : (
                <span>ثبت امتحان</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Shared motion variants generator for Dashboard Carousels.
 * Ensures synchronized, premium, direction-aware slide & scale transitions
 * while respecting prefers-reduced-motion.
 */
function createCarouselVariants(shouldReduceMotion: boolean | null) {
  return {
    enter: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction >= 0 ? 48 : -48,
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0.2 : 0.45,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
    exit: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction >= 0 ? -48 : 48,
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
      transition: {
        duration: shouldReduceMotion ? 0.15 : 0.3,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    }),
  };
}

/**
 * Popular Content Packs section component for Dashboard (محبوب‌ترین بسته‌های محتوای آموزشی).
 * Displays up to 8 top popular published content packs across Avana, showing 2 packs at a time
 * with automatic rotation every 5 seconds, smooth transition, and pausing on hover.
 */
function PopularContentPacksSection({
  onViewDetails,
  onAddToCourse,
}: {
  onViewDetails: (pack: PublicContentPackItemSummary) => void;
  onAddToCourse: (pack: PublicContentPackItemSummary) => void;
}) {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const packsQuery = useLibraryPacks({
    sort: "popular",
    limit: 8,
  });

  const packs = packsQuery.data?.items ?? [];

  // Group packs into pairs of 2
  const packPairs: PublicContentPackItemSummary[][] = [];
  for (let i = 0; i < packs.length; i += 2) {
    packPairs.push(packs.slice(i, i + 2));
  }

  const totalGroups = packPairs.length;
  const safeGroupIndex =
    totalGroups > 0 ? currentGroupIndex % totalGroups : 0;

  const handleDotClick = (i: number) => {
    if (i === safeGroupIndex) return;
    setDirection(i > safeGroupIndex ? 1 : -1);
    setCurrentGroupIndex(i);
  };

  // Auto-rotate every 5 seconds when more than 1 group exists and not paused
  useEffect(() => {
    if (totalGroups <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setDirection(1);
      setCurrentGroupIndex((prev) => (prev + 1) % totalGroups);
    }, 5000);

    return () => clearInterval(timer);
  }, [totalGroups, isPaused]);

  const carouselVariants = createCarouselVariants(shouldReduceMotion);

  return (
    <section
      className="space-y-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="popular-content-packs-section"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">
              محبوب‌ترین بسته‌های محتوای آموزشی
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            بسته‌های آموزشی پرمخاطب که بیشترین استفاده را توسط کاربران آوانا داشته‌اند
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {totalGroups > 1 && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-slate-400 font-medium ml-1">
                {toPersianDigits(safeGroupIndex + 1)} از{" "}
                {toPersianDigits(totalGroups)}
              </span>
              <div className="flex items-center gap-1">
                {packPairs.map((_, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleDotClick(i)}
                    aria-label={`رفتن به گروه ${toPersianDigits(i + 1)}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      i === safeGroupIndex
                        ? "w-4 bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]"
                        : "w-1.5 bg-slate-600 hover:bg-slate-400"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <Link
            to="/library"
            className="text-teal-400 text-xs font-semibold hover:underline flex items-center gap-1"
          >
            <span>مشاهده همه</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {packsQuery.isLoading ? (
        <div className="glass-panel p-8 rounded-xl card-inner-border flex justify-center items-center min-h-[160px]">
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        </div>
      ) : totalGroups > 0 ? (
        <div className="relative overflow-hidden min-h-[160px]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={safeGroupIndex}
              custom={direction}
              variants={carouselVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {packPairs[safeGroupIndex].map((pack) => (
                <PopularContentPackCard
                  key={pack.id}
                  pack={pack}
                  onViewDetails={onViewDetails}
                  onAddToCourse={onAddToCourse}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="glass-panel p-8 rounded-xl card-inner-border flex flex-col items-center justify-center text-center p-6 min-h-[160px]">
          <Layers className="w-8 h-8 text-slate-400 mb-2" />
          <p className="text-sm text-slate-300 font-semibold">
            هنوز بسته آموزشی در کتابخانه منتشر نشده است
          </p>
          <Link
            to="/library"
            className="mt-3 text-xs text-teal-400 font-bold hover:underline inline-flex items-center gap-1"
          >
            <span>+ مشاهده کتابخانه محتوا</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * Individual content pack card component for Dashboard ("محبوب‌ترین بسته‌های محتوای آموزشی").
 * Displays subject, title, description, educational stats, usage count,
 * and direct actions ("مشاهده محتوا" & "افزودن به دوره").
 */
function PopularContentPackCard({
  pack,
  onViewDetails,
  onAddToCourse,
}: {
  pack: PublicContentPackItemSummary;
  onViewDetails: (pack: PublicContentPackItemSummary) => void;
  onAddToCourse: (pack: PublicContentPackItemSummary) => void;
}) {
  const sessionCount = pack.stats?.session_count ?? 0;
  const flashcardCount = pack.stats?.flashcard_count ?? 0;
  const estimatedReadingMinutes = pack.stats?.estimated_reading_minutes ?? 10;
  const usageCount = pack.usage_count ?? 0;

  return (
    <div
      className="glass-panel p-4 sm:p-5 rounded-xl shadow-ambient card-inner-border flex flex-col justify-between hover:bg-white/10 hover:border-teal-500/50 transition-all group min-h-[180px] bg-slate-900/60"
      dir="rtl"
    >
      <div>
        {/* Top Header: Subject Badge & Usage Count */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 truncate max-w-[140px]">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">{pack.subject || "عمومی / پزشکی"}</span>
          </span>

          <span
            className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium bg-white/5 px-2 py-0.5 rounded-full border border-white/5 shrink-0"
            title="تعداد کاربران استفاده‌کننده"
          >
            <Users className="w-3 h-3 text-teal-400" />
            <span>{toPersianDigits(usageCount)} نصب</span>
          </span>
        </div>

        {/* Title */}
        <h4
          className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1 mb-1.5 leading-snug"
          title={pack.title}
        >
          {pack.title}
        </h4>

        {/* Description */}
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3 min-h-[2rem]">
          {pack.description && pack.description.trim().length > 0
            ? pack.description
            : "مجموعه آموزشی جامع شامل درسنامه‌ها، فلش‌کارت‌های مرور فعال و آزمون‌های ارزیابی آنلاین."}
        </p>

        {/* Educational Content Stats Grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-3 text-[11px] text-slate-300">
          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <BookOpen className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="truncate">{toPersianDigits(sessionCount)} درس</span>
          </div>

          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Layers className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate">{toPersianDigits(flashcardCount)} کارت</span>
          </div>

          <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">~{toPersianDigits(estimatedReadingMinutes)}د</span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2.5 border-t border-white/10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onViewDetails(pack)}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>مشاهده</span>
        </button>

        <button
          type="button"
          onClick={() => onAddToCourse(pack)}
          className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 shadow-md shadow-teal-900/30 transition-all cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>افزودن</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Hero section displaying user's top completed courses in a carousel (up to 3)
 * or a clean empty state if no courses exist.
 */
function HeroCoursesCarousel({
  courses,
  isLoading,
}: {
  courses: CourseResource[];
  isLoading: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

  // Fetch real progress for each course
  const progressQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["course-progress", course.id],
      queryFn: () => learningApi.getCourseProgress(course.id),
      enabled: !!course.id,
      staleTime: 30000,
    })),
  });

  // Combine courses with their real progress data
  const coursesWithProgress = courses.map((course, idx) => {
    const progressData = progressQueries[idx]?.data;
    const isProgressLoading = progressQueries[idx]?.isLoading ?? false;
    const percentage =
      typeof progressData?.percentage === "number"
        ? progressData.percentage
        : 0;
    const completedLessons =
      typeof progressData?.completed_lessons === "number"
        ? progressData.completed_lessons
        : 0;
    const totalLessons =
      typeof progressData?.total_lessons === "number"
        ? progressData.total_lessons
        : 0;

    return {
      course,
      percentage,
      completedLessons,
      totalLessons,
      isProgressLoading,
    };
  });

  // Sort strictly by completion rate:
  // 1. percentage descending
  // 2. completedLessons descending
  // 3. updated_at / created_at descending
  const sortedCourses = [...coursesWithProgress].sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    if (b.completedLessons !== a.completedLessons) {
      return b.completedLessons - a.completedLessons;
    }
    const timeA = new Date(a.course.updated_at || a.course.created_at).getTime();
    const timeB = new Date(b.course.updated_at || b.course.created_at).getTime();
    return timeB - timeA;
  });

  // Take strictly the Top 3 courses with highest completion
  const topCourses = sortedCourses.slice(0, 3);
  const totalCount = topCourses.length;

  // Safe index within Top 3 bounds
  const activeIndex = totalCount > 0 ? currentIndex % totalCount : 0;

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + totalCount) % totalCount);
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % totalCount);
  };

  const handleDotClick = (i: number) => {
    if (i === activeIndex) return;
    setDirection(i > activeIndex ? 1 : -1);
    setCurrentIndex(i);
  };

  // Auto-advance rotation every 6 seconds (if more than 1 course and not paused)
  useEffect(() => {
    if (totalCount <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % totalCount);
    }, 6000);

    return () => clearInterval(timer);
  }, [totalCount, isPaused]);

  const carouselVariants = createCarouselVariants(shouldReduceMotion);

  // Loading state
  if (isLoading) {
    return (
      <section className="glass-panel rounded-xl p-6 md:p-8 shadow-ambient card-inner-border relative overflow-hidden flex items-center justify-center min-h-[250px]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          <span className="text-xs font-medium">در حال بارگذاری دوره‌های شما...</span>
        </div>
      </section>
    );
  }

  // 0 courses: Empty State
  if (topCourses.length === 0) {
    return (
      <section className="glass-panel rounded-xl p-6 md:p-8 shadow-ambient card-inner-border relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 min-h-[250px]">
        <div className="absolute -left-20 -top-20 w-64 h-64 bg-teal-600/20 rounded-full blur-3xl" />
        <div className="z-10 w-full md:w-2/3 space-y-4">
          <span className="inline-block px-3 py-1 bg-teal-500/20 text-teal-300 text-xs font-semibold rounded-full border border-teal-500/30">
            شروع یادگیری با آوانا
          </span>

          <div>
            <h3 className="text-lg md:text-xl font-bold text-white mb-2">
              اولین دوره خود را ایجاد کنید
            </h3>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              هنوز دوره‌ای در حساب شما ثبت نشده است. با ایجاد یا انتخاب دوره، بسته‌های یادگیری هوشمند، فلش‌کارت‌های مرور و آزمون‌های خودسنجی برای شما فعال خواهند شد.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/courses"
              className="w-full md:w-auto bg-teal-600 hover:bg-teal-500 text-white px-6 py-3 rounded-lg text-sm font-bold transition-all inline-flex items-center justify-center gap-2 shadow-lg shadow-teal-900/50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد دوره</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="z-10 w-full md:w-1/3 flex justify-center">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-slate-700/80 shadow-ambient-lg overflow-hidden relative bg-gradient-to-br from-teal-900/50 via-slate-800 to-purple-900/40 flex items-center justify-center group">
            <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-teal-400 drop-shadow-[0_0_12px_rgba(45,212,191,0.6)] group-hover:scale-110 transition-transform duration-500" />
          </div>
        </div>
      </section>
    );
  }

  // Active top course (1, 2, or 3)
  const current = topCourses[activeIndex];

  return (
    <section
      className="glass-panel rounded-xl p-6 md:p-8 shadow-ambient card-inner-border relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 min-h-[250px] transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="absolute -left-20 -top-20 w-64 h-64 bg-teal-600/20 rounded-full blur-3xl" />
      <div className="z-10 w-full md:w-2/3 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.span
                key={`badge-${current.course.id}`}
                custom={direction}
                variants={carouselVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-semibold rounded-full border border-purple-500/30 truncate"
              >
                {current.course.subject || "دوره آموزشی"}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Carousel Indicator & Controls (Shown ONLY if 2 or 3 courses exist) */}
          {totalCount > 1 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-400 font-medium ml-1">
                دوره {toPersianDigits(activeIndex + 1)} از {toPersianDigits(totalCount)}
              </span>

              <div className="flex items-center gap-1">
                {topCourses.map((_, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleDotClick(i)}
                    aria-label={`رفتن به دوره ${toPersianDigits(i + 1)}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      i === activeIndex
                        ? "w-5 bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]"
                        : "w-1.5 bg-slate-600 hover:bg-slate-400"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1 mr-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handlePrev}
                  aria-label="دوره قبلی"
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleNext}
                  aria-label="دوره بعدی"
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden min-h-[140px]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={current.course.id}
              custom={direction}
              variants={carouselVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <div>
                <h3 className="text-lg md:text-xl font-bold text-white mb-1 leading-snug">
                  {current.course.title}
                </h3>
                <p className="text-xs md:text-sm text-slate-300 mt-1.5 leading-relaxed">
                  {current.isProgressLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                      <span>در حال دریافت پیشرفت...</span>
                    </span>
                  ) : current.totalLessons > 0 ? (
                    `${toPersianDigits(current.completedLessons)} از ${toPersianDigits(current.totalLessons)} درس تکمیل شده است.`
                  ) : (
                    "دوره در حال آماده‌سازی محتوا و دروس است."
                  )}
                </p>
              </div>

              {/* Progress bar */}
              <div className="pt-1">
                <div className="flex justify-between items-center text-xs font-medium mb-1.5">
                  <span className="text-slate-300">میزان پیشرفت</span>
                  <span className="text-teal-400 font-bold" dir="rtl">
                    {current.isProgressLoading
                      ? "..."
                      : `${toPersianDigits(current.percentage)}٪ تکمیل شده`}
                  </span>
                </div>
                <div
                  className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden border border-white/5"
                  role="progressbar"
                  aria-label={`میزان پیشرفت دوره ${current.course.title}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={current.percentage}
                >
                  <div
                    className="h-full bg-gradient-to-l from-teal-400 to-teal-600 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                    style={{ width: `${current.isProgressLoading ? 0 : current.percentage}%` }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={`/courses/${current.course.id}`}
                  className="w-full md:w-auto bg-teal-600 text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-teal-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-900/50 cursor-pointer group"
                >
                  <span>
                    {current.percentage > 0 ? "ادامه یادگیری" : "شروع یادگیری"}
                  </span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Glowing Brain / Artwork Frame */}
      <div className="z-10 w-full md:w-1/3 flex justify-center">
        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-slate-700/80 shadow-ambient-lg overflow-hidden relative bg-gradient-to-br from-teal-900/50 via-slate-800 to-purple-900/40 flex items-center justify-center group">
          <Brain className="w-16 h-16 md:w-20 md:h-20 text-teal-400 drop-shadow-[0_0_12px_rgba(45,212,191,0.6)] group-hover:scale-110 transition-transform duration-500" />
        </div>
      </div>
    </section>
  );
}


