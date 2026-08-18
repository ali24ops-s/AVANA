/**
 * Home / Dashboard page after login.
 *
 * Implements Google Stitch dark glassmorphic dashboard layout:
 *  - Greeting header with Persian date badge
 *  - Hero banner with progress bar & CTA
 *  - 4-card study stats grid (study time, completed lessons, quizzes, streak)
 *  - "My Courses" grid card list
 *  - Integrated PDF Document Uploader & Processing status list
 *  - AI Mentor sidebar card ("دستیار هوشمند آوانا")
 *  - Today's study plan & content recommendations
 *  - 4-step workflow and platform capability cards
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  Layers,
  HelpCircle,
  BarChart3,
  Compass,
  FileText,
  GraduationCap,
  Clock,
  ChevronLeft,
  Loader2,
  UploadCloud,
  FileUp,
  Brain,
  Flame,
  Calendar,
  Video,
  ArrowLeft,
  Check,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createDocumentsApi } from "../lib/api/documents.js";
import { DocumentUploader } from "../components/documents/DocumentUploader.js";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { useAuth } from "../providers/AuthProvider.js";
import type { CourseResource, DocumentResource } from "@avana/contracts";

export function HomePage() {
  const { user, memberships } = useAuth();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);
  const docsApi = createDocumentsApi(apiClient);

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
    queryKey: ["courses", organization?.id],
    queryFn: () => courseApi.listCourses(organization!.id),
    enabled: !!organization?.id,
  });

  const courses = (coursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const primaryCourse = courses.length > 0 ? courses[0] : null;

  // Local state for instantly displaying newly uploaded documents
  const [localDocs, setLocalDocs] = useState<DocumentResource[]>([]);

  // Selected course for upload section
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const effectiveCourseId = selectedCourseId || primaryCourse?.id || null;

  // Query documents for the active course on home page
  const docsQuery = useQuery({
    queryKey: ["course-documents", organization?.id, effectiveCourseId],
    queryFn: async () => {
      if (!organization?.id) return [];
      const res = await docsApi.listDocuments(organization.id);
      if (!effectiveCourseId) {
        return res.items ?? [];
      }
      return (res.items ?? []).filter(
        (d) => d.course_id === effectiveCourseId || d.course_id === null,
      );
    },
    enabled: !!organization?.id,
    refetchInterval: 3000,
  });

  const serverDocs = docsQuery.data ?? [];
  const allDocsMap = new Map<string, DocumentResource>();
  for (const doc of [...localDocs, ...serverDocs]) {
    allDocsMap.set(doc.id, doc);
  }
  const activeDocuments: DocumentResource[] = Array.from(allDocsMap.values());

  // Extract display name (prefer name if available, otherwise email prefix)
  const userDisplayName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : user?.email
        ? user.email.split("@")[0]
        : "کاربر";

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
          <span className="text-purple-400 font-bold">۱۲ مهر</span>
          <span>۱۴۰۳</span>
        </div>
      </div>

      {/* 2. Main 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Main Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
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

                <button
                  type="button"
                  onClick={() => {
                    const section = document.getElementById("upload-section");
                    section?.scrollIntoView({ behavior: "smooth" });
                    const fileInput = document.getElementById(
                      "pdf-document-file-input",
                    ) as HTMLInputElement | null;
                    fileInput?.click();
                  }}
                  className="w-full md:w-auto bg-white/10 hover:bg-white/15 text-slate-200 px-4 py-3 rounded-lg text-sm font-semibold border border-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  <FileUp className="w-4 h-4 text-teal-400" />
                  <span>بارگذاری فایل PDF</span>
                </button>
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
              <span className="text-lg font-bold text-white">۱۲ ساعت</span>
              <span className="text-xs text-slate-400 mt-1">
                زمان مطالعه این هفته
              </span>
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <CheckCircle2 className="w-7 h-7 text-teal-400 mb-2" />
              <span className="text-lg font-bold text-white">۸</span>
              <span className="text-xs text-slate-400 mt-1">
                درس‌های تکمیل‌شده
              </span>
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <FileText className="w-7 h-7 text-cyan-400 mb-2" />
              <span className="text-lg font-bold text-white">۳</span>
              <span className="text-xs text-slate-400 mt-1">آزمون‌ها</span>
            </div>

            <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors">
              <Flame className="w-7 h-7 text-orange-400 mb-2 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
              <span className="text-lg font-bold text-white">۵ روز</span>
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
              <div className="glass-panel p-8 rounded-xl card-inner-border flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              </div>
            ) : courses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.slice(0, 4).map((course, idx) => (
                  <Link
                    key={course.id}
                    to={`/courses/${course.id}`}
                    className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex gap-4 items-center hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <div className="w-16 h-16 rounded-lg bg-teal-950/60 border border-teal-500/20 flex items-center justify-center shrink-0 text-teal-400 group-hover:scale-105 transition-transform">
                      <GraduationCap className="w-8 h-8" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white truncate mb-1">
                        {course.title}
                      </h4>
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                        <span>{idx === 0 ? "۹۰٪" : "۴۵٪"}</span>
                        <span>
                          {idx === 0 ? "۲ درس باقیمانده" : "۱۲ درس باقیمانده"}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-teal-400 rounded-full shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                          style={{ width: idx === 0 ? "90%" : "45%" }}
                        />
                      </div>
                      <div className="mt-2 text-xs font-bold text-teal-400 flex items-center gap-1 group-hover:underline">
                        <span>ورود به دوره</span>
                        <ChevronLeft className="w-3 h-3" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fallback Display Cards */}
                <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-lg bg-rose-950/40 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-400">
                    <BookOpen className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate mb-1">
                      آناتومی سیستم قلبی عروقی
                    </h4>
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>۴۵٪</span>
                      <span>۱۲ درس باقیمانده</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-teal-500 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.5)]"
                        style={{ width: "45%" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-4 rounded-xl shadow-ambient card-inner-border flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-lg bg-teal-950/40 border border-teal-500/20 flex items-center justify-center shrink-0 text-teal-400">
                    <GraduationCap className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate mb-1">
                      فیزیولوژی سلولی
                    </h4>
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>۹۰٪</span>
                      <span>۲ درس باقیمانده</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-teal-400 rounded-full shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                        style={{ width: "90%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* PDF Upload & Learning Journey Section */}
          <section
            id="upload-section"
            className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-6 border-t-2 border-t-teal-500/40"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-900/40 text-teal-300 text-xs font-bold border border-teal-500/30">
                  <UploadCloud className="w-4 h-4 text-teal-400" />
                  <span>شروع یادگیری با بارگذاری منبع درسی</span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  بارگذاری فایل PDF و تولید بسته یادگیری
                </h2>
                <p className="text-xs text-slate-400">
                  مستندات و جزوات خود را بارگذاری کنید تا فرآیند استخراج متن و
                  تولید هوشمند درس‌ها و فلش‌کارت‌ها آغاز شود.
                </p>
              </div>

              {courses.length > 1 && (
                <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10">
                  <label
                    htmlFor="course-select"
                    className="text-xs font-semibold text-slate-300"
                  >
                    دوره مقصد:
                  </label>
                  <select
                    id="course-select"
                    value={effectiveCourseId || ""}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="text-xs font-bold bg-slate-900 text-slate-200 px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {organization ? (
              <div className="space-y-6">
                <DocumentUploader
                  organizationId={organization.id}
                  courseId={effectiveCourseId}
                  onUploaded={(newDoc) => {
                    setLocalDocs((prev) => [
                      newDoc,
                      ...prev.filter((d) => d.id !== newDoc.id),
                    ]);
                    void docsQuery.refetch();
                    void coursesQuery.refetch();
                  }}
                />

                {/* Document Status Cards List */}
                {activeDocuments.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-400" />
                        <span>اسناد و جزوات بارگذاری‌شده</span>
                      </h3>
                      <div className="flex items-center gap-2">
                        {effectiveCourseId && (
                          <Link
                            to={`/courses/${effectiveCourseId}/manage?tab=review`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-900/40 hover:bg-teal-900/60 text-teal-300 rounded-lg text-xs font-bold border border-teal-500/30 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                            <span>مدیریت محتوا و صف بررسی</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {activeDocuments.map((doc) => (
                        <DocumentStatusCard
                          key={doc.id}
                          document={doc}
                          organizationId={organization.id}
                          courseId={effectiveCourseId || doc.course_id || undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : orgQuery.isLoading ? (
              <div className="p-8 text-center glass-panel rounded-xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              </div>
            ) : (
              <div className="p-8 text-center glass-panel rounded-xl space-y-3">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">
                  در حال بارگذاری اطلاعات سازمان...
                </h3>
                <button
                  type="button"
                  onClick={() => void orgQuery.refetch()}
                  className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-500 transition-colors"
                >
                  تلاش مجدد
                </button>
              </div>
            )}
          </section>

          {/* 4-Step Workflow Section */}
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">
                چطور با آوانا یاد بگیریم؟
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                چهار مرحله ساده برای یادگیری مؤثر، مرور هدفمند و تثبیت مطالب
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  ۱
                </div>
                <h4 className="font-bold text-sm text-white">
                  بارگذاری یا انتخاب درس
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  فایل PDF جزوه را بارگذاری کنید یا دوره و درس موردنظر خود را انتخاب
                  نمایید.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  ۲
                </div>
                <h4 className="font-bold text-sm text-white">یادگیری</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  محتوای درس را مطالعه کنید و پیشرفت خود را ثبت کنید.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  ۳
                </div>
                <h4 className="font-bold text-sm text-white">مرور</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  با فلش‌کارت‌ها مطالب مهم را مرور کنید.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  ۴
                </div>
                <h4 className="font-bold text-sm text-white">ارزیابی</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  با آزمون‌ها میزان یادگیری خود را بسنجید.
                </p>
              </div>
            </div>
          </section>

          {/* Platform Capability Cards */}
          <section className="glass-panel p-6 rounded-xl shadow-ambient card-inner-border space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">امکانات آوانا</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ابزارهای طراحی‌شده برای تقویت فرآیند آموزش و سنجش مستمر
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">دوره‌ها و درس‌ها</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  دسترسی به ساختار منظم و دسته‌بندی‌شده فصول و درس‌های آموزشی.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  مطالعه و ثبت پیشرفت
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  مطالعه تعاملی مطالب با امکان علامت‌گذاری درس‌های تمام‌شده.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  فلش‌کارت‌های مرور فاصله‌دار
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  تثبیت مفاهیم کلیدی با سیستم مرور فاصله‌دار.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  آزمون‌های خودسنجی
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  آزمون‌های تعاملی با پرسش‌های چهارگزینه‌ای.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  تحلیل پیشرفت و عملکرد
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  مشاهده درصد تسلط بر مباحث و شناسایی نقاط ضعف.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  پیشنهادهای مطالعه
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ابزارهای هوشمند مطالعه برای راهنمایی گام‌به‌گام.
                </p>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2 sm:col-span-2 lg:col-span-3">
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 text-teal-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-white">
                  مدیریت منابع و اسناد
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  بارگذاری و سازمان‌دهی جزوات، فایل‌ها و منابع آموزشی.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right / Side Column (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* AI Mentor Card (Stitch Reference) */}
          <section
            id="assistant-section"
            className="bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-xl p-6 rounded-xl shadow-ambient-lg card-inner-border relative overflow-hidden border-t-4 border-t-purple-500 space-y-4"
          >
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-purple-600/20 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 border border-purple-500/30">
                <Brain className="w-6 h-6 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]" />
              </div>
              <h3 className="text-base font-bold text-white">
                دستیار هوشمند آوانا
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed relative z-10">
              سوالت رو از من بپرس تا با هم رفع اشکال کنیم.
            </p>
            <Link
              to={primaryCourse ? `/courses/${primaryCourse.id}` : "/courses"}
              className="w-full bg-white/10 text-purple-300 border border-purple-500/50 px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-purple-500/20 hover:text-white transition-all duration-300 flex items-center justify-center gap-2 relative z-10 backdrop-blur-sm shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>از آوانا بپرس</span>
            </Link>
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
    </div>
  );
}
