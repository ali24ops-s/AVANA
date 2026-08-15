/**
 * Authenticated application shell.
 *
 * Contains:
 *  - Current user information from /v1/me
 *  - Navigation structure (Home, Courses)
 *  - Loading states
 *  - Sign-out action
 *  - API error display
 */

import { Outlet, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, BookOpen, LogOut, User, Home } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";

export function AuthenticatedShell() {
  const { user, isLoading, error, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#008080] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-muted)] text-sm font-medium">
            در حال بارگذاری حساب کاربری...
          </p>
        </div>
      </div>
    );
  }

  const isHomeActive =
    location.pathname === "/" || location.pathname === "/home";
  const isCoursesActive = location.pathname.startsWith("/courses");

  return (
    <div className="min-h-screen bg-[var(--color-background)] font-sans" dir="rtl">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 bg-[var(--color-surface)]/90 backdrop-blur-xl border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo and branding */}
          <div className="flex items-center gap-8">
            <Link
              to="/home"
              className="flex items-center gap-2.5 group"
              aria-label="صفحه اصلی آوانا"
            >
              <div className="w-9 h-9 rounded-xl bg-[#008080] flex items-center justify-center shadow-sm group-hover:bg-[#006666] transition-colors">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-extrabold text-xl tracking-tight text-[var(--color-text)]">
                آوانا
              </span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-1.5" aria-label="منوی اصلی">
              <NavLink to="/home" active={isHomeActive}>
                <Home className="w-4 h-4" />
                <span>خانه</span>
              </NavLink>

              <NavLink to="/courses" active={isCoursesActive}>
                <BookOpen className="w-4 h-4" />
                <span>دوره‌ها</span>
              </NavLink>
            </nav>
          </div>

          {/* User info and sign-out */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
              <User className="w-3.5 h-3.5 text-[#008080]" />
              <span className="hidden sm:inline font-mono" dir="ltr">
                {user?.email ?? "کاربر"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="خروج از حساب"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-medium">
            {error}
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Navigation link component with active state indication.
 */
function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
        active
          ? "text-[#008080] bg-[#008080]/10"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
      }`}
    >
      {children}
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#008080] rounded-full"
        />
      )}
    </Link>
  );
}
