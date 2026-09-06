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
  Crown,
  Receipt,
  Newspaper,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { HeaderSearch } from "./HeaderSearch.js";
import { useMySubscription } from "../../hooks/useCommerce.js";
import {
  calculateRemainingTime,
  getUserChipSubscriptionInfo,
} from "../commerce/userCommerceUtils.js";
import { GlobalGenerationIndicator } from "../generation/GlobalGenerationIndicator.js";

export function AuthenticatedShell() {
  const { user, isLoading, error, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: subData, isLoading: isSubLoading } = useMySubscription();
  const subscription = subData?.subscription;
  const remainingInfo = calculateRemainingTime(subscription?.expires_at);
  const hasActiveSub = subscription?.status === "active" && !remainingInfo.isExpired;
  const chipInfo = getUserChipSubscriptionInfo(subscription);
  const userName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : (user?.email ?? "کاربر");

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

  // Dedicated full-screen experiences (e.g. exam taking attempt) bypass shell chrome
  if (location.pathname.startsWith("/exams/attempt")) {
    return <Outlet />;
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
            <BrandLogo
              linkTo="/home"
              variant="logo-only"
              size="md"
            />

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

              <HeaderNavLink to="/blog" active={location.pathname.startsWith("/blog")}>
                <Newspaper className="w-4 h-4" />
                <span>وبلاگ</span>
              </HeaderNavLink>
            </nav>
          </div>

          {/* Controls & User Profile (RTL Left side) */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Global Generation Status Indicator */}
            <GlobalGenerationIndicator />

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

            {/* User Profile / Subscription Trigger Chip */}
            <Link
              to="/account/subscription"
              title={chipInfo.tooltip}
              aria-label={`حساب کاربری ${userName}${chipInfo.badgeLabel ? ` - وضعیت اشتراک: ${chipInfo.badgeLabel}` : ""}`}
              className={`group flex items-center gap-2 text-xs font-medium glass-panel px-3 py-1.5 rounded-full card-inner-border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                location.pathname === "/account/subscription"
                  ? "text-teal-300 border-teal-500/50 bg-teal-500/10 shadow-sm"
                  : chipInfo.chipClassName
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 text-teal-400 group-hover:border-teal-400/40 transition-colors">
                <User className="w-3 h-3" />
              </div>
              <span className="hidden sm:inline text-xs font-semibold truncate max-w-[130px]">
                {userName}
              </span>
              {isSubLoading ? (
                <span className="hidden sm:inline-block w-8 h-3.5 bg-white/10 animate-pulse rounded-full" />
              ) : chipInfo.badgeLabel ? (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium leading-none transition-colors ${chipInfo.badgeClassName}`}
                >
                  {chipInfo.status === "active" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                  )}
                  {chipInfo.status === "expiring_soon" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                  {chipInfo.status === "expired" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  )}
                  <span>{chipInfo.badgeLabel}</span>
                </span>
              ) : null}
            </Link>

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

          <MobileDrawerLink
            to="/blog"
            active={location.pathname.startsWith("/blog")}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Newspaper className="w-5 h-5 text-teal-400" />
            <span>وبلاگ آموزشی</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/account/subscription"
            active={location.pathname === "/account/subscription"}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Crown className="w-5 h-5 text-amber-400" />
            <span>اشتراک من ({hasActiveSub ? remainingInfo.shortText : "ارتقا"})</span>
          </MobileDrawerLink>

          <MobileDrawerLink
            to="/account/purchases"
            active={location.pathname === "/account/purchases"}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Receipt className="w-5 h-5 text-teal-400" />
            <span>خریدهای من و فاکتورها</span>
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
