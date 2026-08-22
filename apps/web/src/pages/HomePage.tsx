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

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Clock,
  ChevronLeft,
  Loader2,
  Brain,
  Flame,
  Calendar,
  Video,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createStudyApi } from "../lib/api/study.js";
import { toPersianDigits } from "@avana/domain";
import { useAuth } from "../providers/AuthProvider.js";
import { useCurrentPersianDate } from "../utils/date.js";
import { StudyAssistantModal } from "../components/ai/StudyAssistantModal.js";
import type { CourseResource } from "@avana/contracts";

export function HomePage() {
  const { user, memberships } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
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

  const courses = (coursesQuery.data?.items as CourseResource[] | undefined) ?? [];

  // Filter out archived courses and sort by recency (created_at/updated_at descending)
  const activeCourses = courses.filter((c) => !c.archived);
  const sortedActive = [...activeCourses].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const displayCourses: CourseResource[] = [];
  if (sortedActive.length >= 2) {
    displayCourses.push(sortedActive[0], sortedActive[1]);
  } else if (sortedActive.length === 1) {
    displayCourses.push(sortedActive[0]);
    const fallback = courses.find((c) => c.id !== sortedActive[0].id);
    if (fallback) {
      displayCourses.push(fallback);
    }
  } else if (courses.length > 0) {
    displayCourses.push(...courses.slice(0, 2));
  }


  const primaryCourse = displayCourses.length > 0 ? displayCourses[0] : (courses.length > 0 ? courses[0] : null);


  // Extract display name (prefer name if available, otherwise email prefix)
  const userDisplayName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : user?.email
        ? user.email.split("@")[0]
        : "کاربر";

  const currentDate = useCurrentPersianDate();

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Welcome Greeting Header & Date Badge */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
            سلام {userDisplayName} 👋
          </h2>
          <p className="text-sm md:text-base text-slate-400">
            امروز آماده‌ای ادامه بدی؟
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
          {/* Hero Card (Stitch Reference Design) */}
          <section className="glass-panel rounded-xl p-6 md:p-8 shadow-ambient card-inner-border relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="absolute -left-20 -top-20 w-64 h-64 bg-teal-600/20 rounded-full blur-3xl" />
            <div className="z-10 w-full md:w-2/3 space-y-4">
              <span className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-semibold rounded-full border border-purple-500/30">
                {primaryCourse?.subject || "فارماکولوژی پایه"}
              </span>

              <div>
                <h3 className="text-lg md:text-xl font-bold text-white mb-1">
                  فصل ۴ — سیستم عصبی خودمختار
                </h3>
                <h1 className="text-base md:text-lg font-bold text-teal-400">
                  آوانا؛ همراه هوشمند یادگیری شما
                </h1>
                <p className="text-xs md:text-sm text-slate-300 mt-2 leading-relaxed">
                  جزوات و فایل‌های درسی PDF خود را بارگذاری کنید؛ آوانا آن‌ها را به
                  درس‌های منظم، فلش‌کارت‌های مرور فاصله‌دار و آزمون‌های سنجش تبدیل
                  می‌کند.
                </p>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="flex justify-between items-center text-xs font-medium mb-1.5">
                  <span className="text-slate-300">میزان پیشرفت</span>
                  <span className="text-teal-400 font-bold">۶۸٪ تکمیل شده</span>
                </div>
                <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-l from-teal-400 to-teal-600 rounded-full shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                    style={{ width: "68%" }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/courses"
                  className="w-full md:w-auto bg-teal-600 text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-teal-500 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-900/50"
                >
                  <span>شروع یادگیری</span>
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Glowing Brain / Artwork Frame */}
            <div className="z-10 w-full md:w-1/3 flex justify-center">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-slate-700/80 shadow-ambient-lg overflow-hidden relative bg-gradient-to-br from-teal-900/50 via-slate-800 to-purple-900/40 flex items-center justify-center group">
                <Brain className="w-16 h-16 md:w-20 md:h-20 text-teal-400 drop-shadow-[0_0_12px_rgba(45,212,191,0.6)] group-hover:scale-110 transition-transform duration-500" />
              </div>
            </div>
          </section>

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
              {studyTimeQuery.data?.changePercent !== null &&
                studyTimeQuery.data?.changePercent !== undefined && (
                  <span
                    className={`text-[10px] font-medium mt-1 flex items-center gap-0.5 ${
                      studyTimeQuery.data.changePercent > 0
                        ? "text-emerald-400"
                        : studyTimeQuery.data.changePercent < 0
                          ? "text-rose-400"
                          : "text-slate-400"
                    }`}
                  >
                    {studyTimeQuery.data.changePercent > 0
                      ? `↑ ${toPersianDigits(Math.abs(studyTimeQuery.data.changePercent))}٪ نسبت به هفته قبل`
                      : studyTimeQuery.data.changePercent < 0
                        ? `↓ ${toPersianDigits(Math.abs(studyTimeQuery.data.changePercent))}٪ نسبت به هفته قبل`
                        : "مشابه هفته قبل"}
                  </span>
                )}
              {studyTimeQuery.data &&
                studyTimeQuery.data.thisWeek?.seconds === 0 && (
                  <span className="text-[10px] text-teal-400/90 mt-1">
                    از همین امروز شروع کن 🌱
                  </span>
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

          {/* My Courses Section */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">دوره‌های من</h3>
              <Link
                to="/courses"
                className="text-teal-400 text-xs font-semibold hover:underline flex items-center gap-1"
              >
                <span>مشاهده همه</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {coursesQuery.isLoading || orgQuery.isLoading ? (
              <div className="glass-panel p-8 rounded-xl card-inner-border flex justify-center items-center min-h-[160px]">
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              </div>
            ) : displayCourses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayCourses.map((course) => (
                  <DashboardCourseCard key={course.id} course={course} />
                ))}
              </div>
            ) : (
              <div className="glass-panel p-8 rounded-xl card-inner-border flex flex-col items-center justify-center text-center p-6 min-h-[160px]">
                <BookOpen className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-300 font-semibold">
                  هنوز دوره‌ای به لیست شما اضافه نشده است
                </p>
                <Link
                  to="/courses"
                  className="mt-3 text-xs text-teal-400 font-bold hover:underline inline-flex items-center gap-1"
                >
                  <span>+ انتخاب و افزودن دوره‌ها</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </section>
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
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-400" />
              <span>برنامه مطالعه امروز</span>
            </h3>

            <ul className="space-y-2.5">
              <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-white/10">
                <div className="w-5 h-5 rounded border-2 border-slate-600 flex items-center justify-center mt-0.5 group-hover:border-teal-400 transition-colors shrink-0" />
                <div>
                  <p className="text-xs font-medium text-slate-200 group-hover:text-teal-300 transition-colors">
                    مرور فلش‌کارت‌های آناتومی
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ۳۰ کارت • ۱۵ دقیقه
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3 p-3 rounded-lg bg-teal-900/20 border border-teal-500/30 group cursor-pointer">
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

              <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-white/10">
                <div className="w-5 h-5 rounded border-2 border-slate-600 flex items-center justify-center mt-0.5 group-hover:border-teal-400 transition-colors shrink-0" />
                <div>
                  <p className="text-xs font-medium text-slate-200 group-hover:text-teal-300 transition-colors">
                    مطالعه فصل ۵ فارماکولوژی
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    صفحات ۱۲۰-۱۴۵
                  </p>
                </div>
              </li>
            </ul>
          </section>

          {/* Content Recommendations */}
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4">
            <h3 className="text-base font-bold text-white">
              پیشنهادات برای شما
            </h3>
            <div className="space-y-3">
              <div className="flex gap-3 items-center group cursor-pointer hover:bg-white/5 p-2 rounded-lg -mx-2 transition-colors">
                <div className="w-9 h-9 rounded-full bg-teal-900/40 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:bg-teal-500 group-hover:text-slate-900 transition-colors shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                    مقاله جدید: تازه‌های درمان فشار خون
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ۵ دقیقه مطالعه
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-center group cursor-pointer hover:bg-white/5 p-2 rounded-lg -mx-2 transition-colors">
                <div className="w-9 h-9 rounded-full bg-purple-900/40 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-slate-900 transition-colors shrink-0">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
                    ویدیو آموزشی: نحوه معاینه شکم
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">۱۲ دقیقه</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Floating Smart Assistant Modal */}
      <StudyAssistantModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        contextType="dashboard"
      />
    </div>
  );
}

/**
 * Individual course card component for Dashboard "دوره‌های من".
 * Queries real progress via learningApi.getCourseProgress.
 */
function DashboardCourseCard({ course }: { course: CourseResource }) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

  const progressQuery = useQuery({
    queryKey: ["course-progress", course.id],
    queryFn: () => learningApi.getCourseProgress(course.id),
    enabled: !!course.id,
  });

  const progress = progressQuery.data;
  const isProgressLoading = progressQuery.isLoading;

  const percentage =
    typeof progress?.percentage === "number" ? progress.percentage : 0;
  const totalLessons =
    typeof progress?.total_lessons === "number" ? progress.total_lessons : 0;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="glass-panel p-4 sm:p-5 rounded-xl shadow-ambient card-inner-border flex flex-col justify-between hover:bg-white/10 hover:border-teal-500/50 transition-all group cursor-pointer min-h-[160px]"
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-950/60 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400 group-hover:scale-105 transition-transform">
            <GraduationCap className="w-4.5 h-4.5" />
          </div>
          {course.archived && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-300 font-medium border border-amber-500/30 shrink-0">
              بایگانی شده
            </span>
          )}
        </div>

        <h4
          className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors line-clamp-2 min-h-[2.5rem] leading-snug"
          title={course.title}
        >
          {course.title}
        </h4>

        {/* Progress Bar Section */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">پیشرفت</span>
            <span className="font-bold text-teal-400 text-[11px]" dir="ltr">
              {isProgressLoading ? "..." : `${percentage}%`}
            </span>
          </div>
          <div
            className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-white/5"
            role="progressbar"
            aria-label="پیشرفت دوره"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(45,212,191,0.5)]"
              style={{ width: `${isProgressLoading ? 0 : percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="mt-3.5 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <span>
          {isProgressLoading ? "... درس" : `${totalLessons} درس`}
        </span>
        <div className="text-teal-400 font-semibold flex items-center gap-1 group-hover:underline">
          <span>ورود به دوره</span>
          <ChevronLeft className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}

