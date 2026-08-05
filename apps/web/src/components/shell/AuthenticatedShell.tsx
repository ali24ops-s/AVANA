/**
 * Authenticated application shell.
 *
 * Contains:
 *  - Current user information from /v1/me
 *  - Navigation structure
 *  - Loading states
 *  - Sign-out action
 *  - API error display
 */

import { Outlet, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, BookOpen, LogOut, User } from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";

export function AuthenticatedShell() {
  const { user, isLoading, error, signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-muted)] text-sm">
            Loading your account...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 bg-[var(--color-surface)]/80 backdrop-blur-xl border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo and branding */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg">AVANA</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <NavLink to="/" active={location.pathname === "/"}>
              <BookOpen className="w-4 h-4" />
              Courses
            </NavLink>
          </nav>

          {/* User info and sign-out */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">
                {user?.email ?? "Unknown"}
              </span>
            </div>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-6 py-8">
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
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]"
      }`}
    >
      {children}
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full"
        />
      )}
    </Link>
  );
}
