/**
 * TeacherRouteGuard component.
 *
 * Lightweight UX/navigation guard protecting /teacher routes.
 * Ensures user has teacher or admin privileges in the organization.
 * Distinguishes between:
 *  1. Unauthenticated -> safe redirect to /sign-in?redirect=/teacher
 *  2. Authorized Teacher / Admin -> renders Teacher Platform
 *  3. Authenticated Student without teacher application -> Teacher onboarding view
 *  4. Authenticated user with pending teacher application -> Pending view
 *
 * Note: Backend authorization remains strictly authoritative.
 */

import { Link, useLocation, Navigate, Outlet } from "react-router-dom";
import { GraduationCap, ShieldAlert, Clock, ArrowLeft, LogOut, ArrowRight } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { LoadingState } from "../ui/index.js";
import { BrandLogo } from "../brand/BrandLogo.js";

const TEACHER_ROLES = new Set(["teacher", "organization_admin", "platform_admin"]);

export function isTeacherOrAdmin(
  role?: string | null,
  memberships?: Array<{ role?: string | null }> | null,
): boolean {
  if (role && TEACHER_ROLES.has(role)) {
    return true;
  }
  if (memberships && Array.isArray(memberships)) {
    return memberships.some((m) => Boolean(m.role && TEACHER_ROLES.has(m.role)));
  }
  return false;
}

export function TeacherRouteGuard({ children }: { children?: React.ReactNode } = {}) {
  const { user, memberships, isLoading, isAuthenticated, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-[var(--color-bg-default)] flex items-center justify-center font-sans"
        dir="rtl"
      >
        <LoadingState message="در حال بررسی دسترسی به پنل اساتید..." />
      </div>
    );
  }

  // 1. Unauthenticated -> Redirect to sign-in with safe internal redirect
  if (!isAuthenticated || !user) {
    const redirectTarget = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?redirect=${redirectTarget}`} replace />;
  }

  // 2. Authorized Teacher or Admin
  const hasAccess = isTeacherOrAdmin(user?.role, memberships);
  if (hasAccess) {
    return children ? <>{children}</> : <Outlet />;
  }

  // 3. Check for genuine pending application status (if present on user object)
  const isApplicationPending =
    (user as { teacherApplicationStatus?: string }).teacherApplicationStatus === "pending";

  if (isApplicationPending) {
    return (
      <div
        className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col items-center justify-center p-4 font-sans"
        dir="rtl"
      >
        <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-card text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
              درخواست ثبت‌نام شما به‌عنوان استاد دریافت شد.
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              پس از بررسی درخواست، دسترسی پنل استاد برای شما فعال می‌شود.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Link
              to="/home"
              className="flex-1 h-11 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] text-white transition-all shadow-sm"
            >
              <span>بازگشت به پیشخوان دانشجو</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="h-11 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authenticated Student without teacher access and without application
  return (
    <div
      className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans"
      dir="rtl"
    >
      <header className="px-4 sm:px-6 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
        <BrandLogo linkTo="/" variant="logo-only" size="md" />
        <Link
          to="/home"
          className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] flex items-center gap-1"
        >
          <span>پیشخوان دانشجو</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-8 shadow-card text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080]">
            <GraduationCap className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
              برای استفاده از پنل استاد، ابتدا باید به‌عنوان استاد ثبت‌نام کنید.
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              شما در حال حاضر با حساب کاربری دانشجو وارد شده‌اید. برای مدیریت کلاس‌ها و طراحی آزمون، به حساب کاربری استاد نیاز دارید.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <Link
              to="/teachers"
              className="w-full h-11 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 bg-[#008080] hover:bg-[#007575] text-white transition-all shadow-sm"
            >
              <span>ثبت‌نام استاد</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <Link
              to="/home"
              className="w-full h-11 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] transition-all"
            >
              <span>بازگشت به پیشخوان دانشجو</span>
            </Link>

            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full h-9 rounded-xl font-medium text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج از حساب</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
