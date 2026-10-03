/**
 * Teacher Platform Introduction & Showcase Page.
 *
 * Public entry point for teachers at /teachers (with /for-teachers alias).
 * Visual-first product showcase built on the authentic AVANA Teacher Platform UI.
 */

import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Users,
  FileCheck2,
  FileText,
  BarChart3,
  ArrowLeft,
  ShieldCheck,
  UserCheck,
  LogOut,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "../components/brand/BrandLogo.js";
import { useAuth } from "../providers/AuthProvider.js";
import { isTeacherOrAdmin } from "../components/teacher/TeacherRouteGuard.js";
import {
  ClassroomsPreview,
  ExamEditorPreview,
  AssignmentsPreview,
  ResultsPreview,
} from "../components/teacher/preview/TeacherPlatformPreviews.js";

export function TeacherIntroPage() {
  const { user, memberships, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const isTeacher = isTeacherOrAdmin(user?.role, memberships);

  const handleSwitchAccount = async () => {
    await signOut();
    navigate("/sign-in?redirect=/teacher");
  };

  const showcaseSections = [
    {
      id: "classrooms",
      badge: "مدیریت کلاس‌ها",
      icon: Users,
      title: "کلاس‌ها و دانشجوها، یکجا",
      description: "کلاس‌ها، اعضا و وضعیت دسترسی دانشجوها را از یک محیط مدیریت کنید.",
      preview: <ClassroomsPreview />,
      reverse: false,
    },
    {
      id: "exam-builder",
      badge: "ساخت آزمون",
      icon: FileCheck2,
      title: "آزمون را دقیقاً مطابق نیازتان بسازید",
      description: "سؤال‌ها، کلید پاسخ، زمان‌بندی و تنظیمات آزمون را در یک ویرایشگر مدیریت کنید.",
      preview: <ExamEditorPreview />,
      reverse: true,
    },
    {
      id: "assignments",
      badge: "تکلیف و بازخورد",
      icon: FileText,
      title: "از ارسال تا نمره‌دهی، یکجا",
      description: "ارسال‌های دانشجوها را بررسی کنید، نمره بدهید و بازخورد ثبت کنید.",
      preview: <AssignmentsPreview />,
      reverse: false,
    },
    {
      id: "results",
      badge: "تحلیل نتایج",
      icon: BarChart3,
      title: "عملکرد دانشجوها را بهتر ببینید",
      description: "میانگین، قبولی و توزیع نمرات را در یک نگاه بررسی کنید.",
      preview: <ResultsPreview />,
      reverse: true,
    },
  ];

  return (
    <div
      className="min-h-screen bg-[#F7F9FA] text-[var(--color-text)] flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900"
      dir="rtl"
    >
      {/* 1. Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E2E7EA] px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <BrandLogo linkTo="/" variant="logo-only" size="md" />
          <span className="text-xs font-bold text-[#008080] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
            پنل اساتید
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] transition-colors py-1.5 px-2.5 rounded-lg hover:bg-[var(--color-surface-warm)]"
          >
            <span>صفحه اصلی</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-8 sm:pb-12 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full flex flex-col items-center space-y-5 sm:space-y-6"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs sm:text-sm font-bold shadow-2xs">
            <GraduationCap className="w-4 h-4 text-[#008080]" />
            <span>پنل استاد AVANA</span>
          </div>

          {/* Title & One-line Description */}
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#1a2226] tracking-tight">
              پنل حرفه‌ای استاد آوانا
            </h1>
            <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed">
              کلاس، محتوای آموزشی، تکلیف و آزمون‌هایتان را در یک محیط یکپارچه مدیریت کنید.
            </p>
          </div>

          {/* Auth State Action Box */}
          <div className="w-full max-w-md pt-2">
            {!isAuthenticated ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/sign-up?redirect=/teacher&role=teacher"
                  className="w-full sm:w-auto flex-1 h-11 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
                >
                  <span>ثبت‌نام استاد</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>

                <Link
                  to="/sign-in?redirect=/teacher"
                  className="w-full sm:w-auto flex-1 h-11 px-5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-white hover:bg-[#F7F9FA] text-[#1a2226] border border-[#E2E7EA] transition-all"
                >
                  <span>ورود به پنل استاد</span>
                </Link>
              </div>
            ) : isTeacher ? (
              <div className="p-4 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#008080]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>دسترسی به پنل استاد برای حساب شما فعال است.</span>
                </div>
                <Link
                  to="/teacher"
                  className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
                >
                  <span>ورود به پنل استاد</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs flex flex-col gap-3 text-center">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-[#1a2226]">
                  <UserCheck className="w-4 h-4 text-[#008080]" />
                  <span>حساب کاربری فعال: دانشجو</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  شما در حال حاضر با حساب دانشجو وارد شده‌اید. برای استفاده از پنل استاد، ابتدا باید به‌عنوان استاد ثبت‌نام کرده یا با حساب استاد وارد شوید.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleSwitchAccount()}
                    className="flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-[#008080] hover:bg-[#007575] text-white transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>ورود با حساب استاد</span>
                  </button>
                  <Link
                    to="/home"
                    className="flex-1 h-10 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 bg-[#F7F9FA] hover:bg-[#E2E7EA] text-[#1a2226] border border-[#E2E7EA] transition-all"
                  >
                    <span>بازگشت به پیشخوان دانشجو</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* 3. Visual Showcase Sections (Visual Walkthrough) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-16 sm:space-y-24">
        {showcaseSections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <motion.section
              key={section.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: idx * 0.05 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
              aria-label={section.title}
            >
              {/* Text Column (~40% on Desktop) */}
              <div
                className={`lg:col-span-5 flex flex-col gap-4 text-center lg:text-right ${
                  section.reverse ? "lg:order-2" : "lg:order-1"
                }`}
              >
                <div className="flex justify-center lg:justify-start">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs font-bold">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{section.badge}</span>
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#1a2226] tracking-tight">
                  {section.title}
                </h2>

                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {section.description}
                </p>
              </div>

              {/* Preview Window Column (~60% on Desktop) */}
              <div
                className={`lg:col-span-7 w-full ${
                  section.reverse ? "lg:order-1" : "lg:order-2"
                }`}
              >
                {section.preview}
              </div>
            </motion.section>
          );
        })}
      </main>

      {/* 4. Final CTA Section */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center border-t border-[#E2E7EA]/80 mt-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="p-6 sm:p-10 rounded-3xl bg-white border border-[#E2E7EA] shadow-xs flex flex-col items-center space-y-5"
        >
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-[#008080] flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>

          <div className="space-y-2 max-w-xl">
            <h2 className="text-xl sm:text-2xl font-black text-[#1a2226]">
              آماده‌اید تدریس را ساده‌تر کنید؟
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
              کلاس، تکالیف و آزمون‌هایتان را در پنل یکپارچه استاد آوانا مدیریت کنید.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full max-w-sm">
            {!isAuthenticated ? (
              <>
                <Link
                  to="/sign-up?redirect=/teacher&role=teacher"
                  className="w-full sm:flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
                >
                  <span>ثبت‌نام به‌عنوان استاد</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <Link
                  to="/sign-in?redirect=/teacher"
                  className="w-full sm:flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-[#F7F9FA] hover:bg-[#E2E7EA] text-[#1a2226] border border-[#E2E7EA] transition-all"
                >
                  <span>ورود به پنل استاد</span>
                </Link>
              </>
            ) : isTeacher ? (
              <Link
                to="/teacher"
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
              >
                <span>ورود به پنل استاد</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void handleSwitchAccount()}
                className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] text-white shadow-sm transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>ورود با حساب استاد</span>
              </button>
            )}
          </div>
        </motion.div>
      </section>

      {/* 5. Footer */}
      <footer className="border-t border-[#E2E7EA] py-6 text-center text-xs text-[var(--color-text-muted)] bg-white">
        سامانه هوشمند آموزش و یادگیری آوانا © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
