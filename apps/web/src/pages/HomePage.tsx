/**
 * Home / Dashboard page after login.
 *
 * Welcomes the authenticated user to AVANA, introduces how to use the product
 * in Persian, showcases real capabilities, provides a dedicated PDF upload section
 * in the "Start Learning" journey, and displays user learning status.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  const { memberships } = useAuth();
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
      : { id: "00000000-0000-0000-0000-000000000010", name: "سازمان یادگیری آوانا" });

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

  return (
    <div className="space-y-12 pb-12">
      {/* 1. Hero / معرفی */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#008080]/10 via-[#a7d0e6]/25 to-[var(--color-surface)] border border-[var(--color-border)] p-8 sm:p-12 shadow-sm">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#008080]/15 text-[#008080] text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>سامانه یادگیری هوشمند آوانا</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[var(--color-text)] tracking-tight leading-tight">
            آوانا؛ همراه هوشمند یادگیری شما
          </h1>

          <p className="text-base sm:text-lg text-[var(--color-text-muted)] leading-relaxed">
            جزوات و فایل‌های درسی PDF خود را بارگذاری کنید؛ آوانا آن‌ها را به درس‌های منظم،
            فلش‌کارت‌های مرور فاصله‌دار و آزمون‌های سنجش تبدیل می‌کند.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to={primaryCourse ? `/courses/${primaryCourse.id}` : "/courses"}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#008080] hover:bg-[#006666] text-white rounded-2xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
            >
              <span>شروع یادگیری</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={() => {
                const section = document.getElementById("upload-section");
                section?.scrollIntoView({ behavior: "smooth" });
                const fileInput = document.getElementById("pdf-document-file-input") as HTMLInputElement | null;
                fileInput?.click();
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] rounded-2xl text-sm font-semibold transition-all cursor-pointer"
            >
              <FileUp className="w-4 h-4 text-[#008080]" />
              <span>بارگذاری فایل PDF</span>
            </button>

            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-xs text-[var(--color-text-muted)] hover:text-[#008080] font-semibold transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>مشاهده همه دوره‌ها ({courses.length})</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. بخش بارگذاری فایل PDF در شروع یادگیری */}
      <section
        id="upload-section"
        className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 space-y-6 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#a7d0e6]/30 text-[#008080] text-xs font-bold">
              <UploadCloud className="w-4 h-4" />
              <span>شروع یادگیری با بارگذاری منبع درسی</span>
            </div>
            <h2 className="text-xl font-bold text-[var(--color-text)]">
              بارگذاری فایل PDF و تولید بسته یادگیری
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              فایل جزوه، اسلاید یا منبع درسی خود (PDF) را بارگذاری کنید تا فرآیند پردازش متن و تولید محتوا آغاز شود.
            </p>
          </div>

          {courses.length > 1 && (
            <div className="flex items-center gap-2 bg-[var(--color-surface-warm)] p-2 rounded-2xl border border-[var(--color-border)]">
              <label htmlFor="course-select" className="text-xs font-semibold text-[var(--color-text-muted)]">
                دوره مقصد:
              </label>
              <select
                id="course-select"
                value={effectiveCourseId || ""}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="text-xs font-bold bg-[var(--color-surface)] text-[var(--color-text)] px-3 py-1.5 rounded-xl border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
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
                setLocalDocs((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
                void docsQuery.refetch();
                void coursesQuery.refetch();
              }}
            />

            {/* Recent documents & status cards */}
            {activeDocuments.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#008080]" />
                    <span>اسناد و جزوات بارگذاری‌شده</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    {effectiveCourseId && (
                      <Link
                        to={`/courses/${effectiveCourseId}/manage?tab=review`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#008080]/10 hover:bg-[#008080]/20 text-[#008080] rounded-xl text-xs font-bold transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>مدیریت محتوا و صف بررسی</span>
                      </Link>
                    )}
                    {effectiveCourseId && (
                      <Link
                        to={`/courses/${effectiveCourseId}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#008080] hover:underline"
                      >
                        <span>ورود به دوره</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid gap-4">
                  {activeDocuments.map((doc) => (
                    <DocumentStatusCard
                      key={doc.id}
                      document={doc}
                      organizationId={organization.id}
                      courseId={effectiveCourseId || doc.course_id || ""}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : orgQuery.isLoading ? (
          <div className="p-8 text-center bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#008080]" />
          </div>
        ) : (
          <div className="p-8 text-center bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
            <BookOpen className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              در حال بارگذاری اطلاعات سازمان...
            </h3>
            <button
              type="button"
              onClick={() => void orgQuery.refetch()}
              className="px-4 py-2 bg-[#008080] text-white text-xs font-bold rounded-xl"
            >
              تلاش مجدد
            </button>
          </div>
        )}
      </section>

      {/* 3. وضعیت فعلی کاربر (User Status) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text)]">
              وضعیت یادگیری شما
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              خلاصه دوره‌های فعال و مسیر مطالعه شما
            </p>
          </div>
          {courses.length > 0 && (
            <Link
              to="/courses"
              className="text-xs font-semibold text-[#008080] hover:underline inline-flex items-center gap-1"
            >
              <span>همه دوره‌ها ({courses.length})</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {coursesQuery.isLoading || orgQuery.isLoading ? (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#008080]" />
          </div>
        ) : courses.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 3).map((course) => (
              <motion.div
                key={course.id}
                whileHover={{ y: -2 }}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 hover:border-[#a7d0e6] transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--color-text)] text-base line-clamp-1">
                      {course.title}
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-1">
                      {course.subject || "دوره تخصصی"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-[var(--color-border)] flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    آماده مطالعه
                  </span>
                  <Link
                    to={`/courses/${course.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#008080] hover:underline"
                  >
                    <span>ورود به دوره</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/25 text-[#008080] flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              به آوانا خوش آمدید!
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
              دوره‌های آموزشی شما پس از بارگذاری توسط مدیر سیستم در این بخش نمایش داده خواهند شد.
            </p>
          </div>
        )}
      </section>

      {/* 4. بخش «چطور با آوانا یاد بگیریم؟» */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">
            چطور با آوانا یاد بگیریم؟
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            چهار مرحله ساده برای یادگیری مؤثر، مرور هدفمند و تثبیت مطالب
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* مرحله ۱ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#008080] text-white flex items-center justify-center font-bold text-sm">
              ۱
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              بارگذاری یا انتخاب درس
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              فایل PDF جزوه را بارگذاری کنید یا دوره و درس موردنظر خود را انتخاب نمایید.
            </p>
          </div>

          {/* مرحله ۲ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#008080] text-white flex items-center justify-center font-bold text-sm">
              ۲
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              یادگیری
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              محتوای درس را مطالعه کنید و پیشرفت خود را ثبت کنید.
            </p>
          </div>

          {/* مرحله ۳ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#008080] text-white flex items-center justify-center font-bold text-sm">
              ۳
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              مرور
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با فلش‌کارت‌ها مطالب مهم را مرور کنید.
            </p>
          </div>

          {/* مرحله ۴ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3 relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#008080] text-white flex items-center justify-center font-bold text-sm">
              ۴
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              ارزیابی
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با آزمون‌ها میزان یادگیری خود را بسنجید.
            </p>
          </div>
        </div>
      </section>

      {/* 5. بخش معرفی امکانات */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">
            امکانات آوانا
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            ابزارهای طراحی‌شده برای تقویت فرآیند آموزش و سنجش مستمر
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* کارت ۱ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              دوره‌ها و درس‌ها
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              دسترسی به ساختار منظم و دسته‌بندی‌شده فصول و درس‌های آموزشی به همراه زمان تخمینی مطالعه.
            </p>
          </div>

          {/* کارت ۲ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              مطالعه و ثبت پیشرفت
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              مطالعه تعاملی مطالب با امکان علامت‌گذاری درس‌های تمام‌شده و پیگیری روند یادگیری دوره.
            </p>
          </div>

          {/* کارت ۳ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              فلش‌کارت‌های مرور فاصله‌دار
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              تثبیت مفاهیم کلیدی با سیستم مرور فاصله‌دار و ارزیابی آسان، خوب و سخت برای یادسپاری ماندگار.
            </p>
          </div>

          {/* کارت ۴ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              آزمون‌های خودسنجی
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              آزمون‌های تعاملی با پرسش‌های چهارگزینه‌ای و کارنامه تحلیلی برای سنجش میزان تسلط بر موضوعات.
            </p>
          </div>

          {/* کارت ۵ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              تحلیل پیشرفت و عملکرد
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              مشاهده درصد تسلط بر مباحث، بررسی وضعیت آزمون‌ها و شناسایی نقاط نیازمند تمرین بیشتر.
            </p>
          </div>

          {/* کارت ۶ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              پیشنهادهای مطالعه
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              ابزارهای هوشمند مطالعه برای راهنمایی گام‌به‌گام و اولویت‌بندی مباحث با توجه به عملکرد شما.
            </p>
          </div>

          {/* کارت ۷ */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-3 sm:col-span-2 lg:col-span-3">
            <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-[var(--color-text)]">
              مدیریت منابع و اسناد
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              بارگذاری و سازمان‌دهی جزوات، فایل‌ها و منابع آموزشی با امکان بازبینی و انتشار دروس توسط مدیران دوره.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
