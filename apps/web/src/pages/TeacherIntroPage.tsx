/**
 * Teacher Platform Introduction & Entry Page.
 *
 * Public entry point for teachers at /teachers (with /for-teachers alias).
 * Clean, lightweight, editorial design matching AVANA design system.
 */

import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Users,
  FileCheck,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  LogOut,
} from "lucide-react";
import { BrandLogo } from "../components/brand/BrandLogo.js";
import { useAuth } from "../providers/AuthProvider.js";
import { isTeacherOrAdmin } from "../components/teacher/TeacherRouteGuard.js";

export function TeacherIntroPage() {
  const { user, memberships, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const isTeacher = isTeacherOrAdmin(user?.role, memberships);

  const handleSwitchAccount = async () => {
    await signOut();
    navigate("/sign-in?redirect=/teacher");
  };

  return (
    <div
      className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans"
      dir="rtl"
    >
      {/* 1. Header */}
      <header className="sticky top-0 z-50 bg-[var(--color-surface)]/90 backdrop-blur-md border-b border-[var(--color-border)] px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <BrandLogo linkTo="/" variant="logo-only" size="md" />
          <span className="hidden sm:inline-block text-xs font-bold text-[#008080] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
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

      {/* 2. Main Hero & Info */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full flex flex-col items-center text-center space-y-8"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-[#008080] text-xs sm:text-sm font-bold shadow-xs">
            <GraduationCap className="w-4 h-4 text-[#008080]" />
            <span>پنل استاد AVANA</span>
          </div>

          {/* Heading & Subtitle */}
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--color-text)] tracking-tight">
              آزمون، دوره و محتوای آموزشی خود را در یک محیط یکپارچه مدیریت کنید.
            </h1>
            <p className="text-sm sm:text-base leading-relaxed text-[var(--color-text-muted)]">
              پلتفرم هوشمند آوانا به اساتید، مدرسین و مدیران آموزشی امکان می‌دهد تا کلاس‌های درسی را مدیریت، آزمون‌های زمان‌بندی‌شده طراحی و کارنامه‌ها و نتایج دانشجویان را تحلیل کنند.
            </p>
          </div>

          {/* Feature Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-right my-2">
            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080]">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">
                مدیریت کلاس‌ها و دانشجویان
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                ایجاد کلاس، اختصاص کد دعوت یکتا و کنترل دسترسی اعضای کلاس در فضای امن.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080]">
                <FileCheck className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">
                طراحی و زمان‌بندی آزمون
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                آزمون‌ساز پیشرفته با پشتیبانی از سؤالات تستی و تشریحی، زمان‌بندی و حدنصاب قبولی.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080]">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">
                تصحیح و تحلیل نتایج
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                نمودارهای توزیع نمرات، بازخورد تشریحی و انتشار نتایج با یک کلیک.
              </p>
            </div>
          </div>

          {/* Action Box based on Auth State */}
          <div className="w-full max-w-lg p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
            {!isAuthenticated ? (
              <div className="flex flex-col gap-3.5">
                <Link
                  to="/sign-in?redirect=/teacher"
                  className="w-full h-11 sm:h-12 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
                >
                  <span>ورود به پنل استاد</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>

                <Link
                  to="/sign-up?redirect=/teacher&role=teacher"
                  className="w-full h-11 sm:h-12 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] transition-all"
                >
                  <span>ثبت‌نام استاد</span>
                </Link>
              </div>
            ) : isTeacher ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#008080]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>دسترسی به پنل استاد برای حساب شما فعال است.</span>
                </div>
                <Link
                  to="/teacher"
                  className="w-full h-11 sm:h-12 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm transition-all"
                >
                  <span>ورود به پنل استاد</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 text-center">
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-[var(--color-text)]">
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
                    className="flex-1 h-10 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] transition-all"
                  >
                    <span>بازگشت به پیشخوان دانشجو</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </main>

      {/* 3. Footer */}
      <footer className="border-t border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-text-muted)]">
        سامانه هوشمند آموزش و یادگیری آوانا © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
