/**
 * Authenticated application shell with top navigation header bar.
 *
 * All primary menu items (Home, Courses, Flashcards, Quizzes, Files)
 * are situated in the top sticky header, allowing the main content container
 * to expand to full width (`max-w-7xl`).
 */

import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  Sparkles,
  BookOpen,
  LogOut,
  User,
  Home,
  Layers,
  HelpCircle,
  FolderOpen,
  Settings,
  Bell,
  Menu,
  X,
  Library as LibraryIcon,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { HeaderSearch } from "./HeaderSearch.js";

export function AuthenticatedShell() {
  const { user, isLoading, error, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-[#0b1120] text-slate-200 flex items-center justify-center font-sans"
        dir="rtl"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">
            در حال بارگذاری حساب کاربری...
          </p>
        </div>
      </div>
    );
  }

  const isHomeActive =
    location.pathname === "/" || location.pathname === "/home";
  const isCoursesActive = location.pathname.startsWith("/courses");
  const isFlashcardsActive = location.pathname.startsWith("/flashcards");
  const isExamsActive = location.pathname.startsWith("/exams");
  const isFilesActive = location.pathname.startsWith("/files");
  const isLibraryActive = location.pathname.startsWith("/library");

  return (
    <div
      className="min-h-screen bg-[#0b1120] text-slate-200 font-sans selection:bg-teal-700/50 selection:text-teal-200"
      dir="rtl"
    >
      {/* Top Sticky Header Navigation Bar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/10 w-full shadow-ambient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Brand & Desktop Horizontal Menu (RTL Right side) */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link
              to="/home"
              className="flex items-center gap-3 group shrink-0"
              aria-label="صفحه اصلی آوانا"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-600/30 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm group-hover:bg-teal-600/40 transition-colors">
                <Sparkles className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-teal-400 leading-tight">
                  آوانا
                </h1>
                <p className="text-[10px] sm:text-xs text-slate-400">
                  آموزش هوشمند پزشکی
                </p>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1" aria-label="منوی اصلی">
              <HeaderNavLink to="/home" active={isHomeActive}>
                <Home className="w-4 h-4" />
                <span>خانه</span>
              </HeaderNavLink>

              <HeaderNavLink to="/courses" active={isCoursesActive}>
                <BookOpen className="w-4 h-4" />
                <span>دوره‌ها</span>
              </HeaderNavLink>

              <HeaderNavLink to="/flashcards" active={isFlashcardsActive}>
                <Layers className="w-4 h-4" />
                <span>فلش‌کارت‌ها</span>
              </HeaderNavLink>

              <HeaderNavLink to="/exams" active={isExamsActive}>
                <HelpCircle className="w-4 h-4" />
                <span>آزمون‌ها</span>
              </HeaderNavLink>

              <HeaderNavLink to="/files" active={isFilesActive}>
                <FolderOpen className="w-4 h-4" />
                <span>فایل‌ها</span>
              </HeaderNavLink>

              <HeaderNavLink to="/library" active={isLibraryActive}>
                <LibraryIcon className="w-4 h-4" />
                <span>کتابخانه</span>
              </HeaderNavLink>
            </nav>
          </div>

          {/* Controls & User Profile (RTL Left side) */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Real Search Bar (Desktop) */}
            <HeaderSearch />

            {/* Notifications Button */}
            <button
              type="button"
              className="text-slate-300 hover:text-teal-400 transition-colors p-2 rounded-full hover:bg-white/10"
              aria-label="اعلانات"
            >
              <Bell className="w-5 h-5" />
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300 glass-panel px-3 py-1.5 rounded-full card-inner-border">
              <User className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline text-xs">
                {user?.name && user.name.trim().length > 0
                  ? user.name.trim()
                  : (user?.email ?? "کاربر")}
              </span>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="خروج از حساب"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-300 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">خروج</span>
            </button>

            {/* Mobile Menu Button */}
            <button
              type="button"
              className="md:hidden text-slate-300 p-2 rounded-lg hover:bg-white/10"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="باز کردن منو"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-20 bg-slate-950/90 backdrop-blur-xl z-40 p-6 flex flex-col gap-3 border-b border-white/10">
          <MobileDrawerLink
            to="/home"
            active={isHomeActive}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Home className="w-5 h-5" />
            <span>خانه (داشبورد)</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/courses"
            active={isCoursesActive}
            onClick={() => setMobileMenuOpen(false)}
          >
            <BookOpen className="w-5 h-5" />
            <span>دوره‌ها</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/flashcards"
            active={isFlashcardsActive}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Layers className="w-5 h-5" />
            <span>فلش‌کارت‌ها</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/courses"
            active={false}
            onClick={() => setMobileMenuOpen(false)}
          >
            <HelpCircle className="w-5 h-5" />
            <span>آزمون‌ها</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/files"
            active={isFilesActive}
            onClick={() => setMobileMenuOpen(false)}
          >
            <FolderOpen className="w-5 h-5" />
            <span>فایل‌ها</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/library"
            active={isLibraryActive}
            onClick={() => setMobileMenuOpen(false)}
          >
            <LibraryIcon className="w-5 h-5" />
            <span>کتابخانه عمومی</span>
          </MobileDrawerLink>

          <div className="mt-auto pt-4 border-t border-white/10">
            <Link
              to="/home"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 text-sm font-medium hover:bg-white/5"
            >
              <Settings className="w-5 h-5" />
              <span>تنظیمات</span>
            </Link>
          </div>
        </div>
      )}

      {/* API Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-medium backdrop-blur-md shadow-ambient">
            {error}
          </div>
        </div>
      )}

      {/* Main Content Area (Full Width max-w-7xl Container) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen w-full relative z-10">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass-panel shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-40 flex justify-around items-center px-2 border-t border-white/10">
        <Link
          to="/home"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isHomeActive ? "text-[#008080] text-teal-400 font-bold" : "text-slate-400 hover:text-teal-300"
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">صفحه اصلی</span>
        </Link>

        <Link
          to="/courses"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isCoursesActive ? "text-[#008080] text-teal-400 font-bold" : "text-slate-400 hover:text-teal-300"
          }`}
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">لیست دوره‌ها</span>
        </Link>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-red-400 transition-colors"
        >
          <User className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">خروج</span>
        </button>
      </nav>
    </div>
  );
}

function HeaderNavLink({
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
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold transition-all ${
        active
          ? "text-[#008080] text-teal-400 bg-teal-900/30 border border-teal-500/30 shadow-sm"
          : "text-slate-300 hover:text-white hover:bg-white/5"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileDrawerLink({
  to,
  active,
  onClick,
  children,
}: {
  to: string;
  active: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "text-[#008080] text-teal-400 bg-teal-900/30 font-bold border-r-4 border-teal-400"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
