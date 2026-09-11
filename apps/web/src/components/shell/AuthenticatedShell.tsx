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
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { HeaderSearch } from "./HeaderSearch.js";
import { useMySubscription } from "../../hooks/useCommerce.js";
import {
  calculateRemainingTime,
  getUserChipSubscriptionInfo,
} from "../commerce/userCommerceUtils.js";
import { isUserAdmin } from "../../utils/adminPermissions.js";
import { GlobalGenerationIndicator } from "../generation/GlobalGenerationIndicator.js";
import { Button, Badge, LoadingState, Alert, Skeleton } from "../ui/index.js";
import { FILES_ENABLED } from "../../config/features.js";

export function AuthenticatedShell() {
  const { user, memberships, isLoading, error, signOut } = useAuth();
  const isAdmin = isUserAdmin(user, memberships);
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
        className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex items-center justify-center font-sans"
        dir="rtl"
      >
        <LoadingState message="در حال بارگذاری حساب کاربری..." />
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
      className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans transition-colors duration-200"
      dir="rtl"
    >
      {/* Top Sticky Header Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[var(--color-surface-glass)] backdrop-blur-xl border-b border-[var(--color-border)] w-full shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand & Desktop Horizontal Menu */}
          <div className="flex items-center gap-4 xl:gap-8 min-w-0">
            <BrandLogo
              linkTo="/home"
              variant="logo-only"
              size="md"
            />

            {/* Desktop Navigation Links */}
            <nav className="hidden xl:flex items-center gap-1" aria-label="منوی اصلی">
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

              {FILES_ENABLED && (
                <HeaderNavLink to="/files" active={isFilesActive}>
                  <FolderOpen className="w-4 h-4" />
                  <span>فایل‌ها</span>
                </HeaderNavLink>
              )}

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

          {/* Controls & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {/* Global Generation Status Indicator (Admin only) */}
            {isAdmin && <GlobalGenerationIndicator className="hidden sm:flex" />}

            {/* Real Search Bar (Desktop) */}
            <HeaderSearch />

            {/* Notifications Button */}
            <button
              type="button"
              className="text-[var(--color-text-muted)] hover:text-[#008080] transition-colors p-2 rounded-full hover:bg-[var(--color-surface-warm)] cursor-pointer shrink-0"
              aria-label="اعلانات"
            >
              <Bell className="w-5 h-5" />
            </button>

            {/* Admin Badge link if admin */}
            {isAdmin && (
              <Link to="/admin" className="hidden sm:inline-flex shrink-0">
                <Badge variant="primary" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
                  پنل مدیریت
                </Badge>
              </Link>
            )}

            {/* User Profile / Subscription Trigger Chip */}
            <Link
              to="/account/subscription"
              title={chipInfo.tooltip}
              aria-label={`حساب کاربری ${userName}${chipInfo.badgeLabel ? ` - وضعیت اشتراک: ${chipInfo.badgeLabel}` : ""}`}
              className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080] transition-colors shrink-0"
            >
              <User className="w-4 h-4 text-[#008080] shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold truncate max-w-[90px] xl:max-w-[120px] text-[var(--color-text)]">
                {userName}
              </span>
              {isSubLoading ? (
                <Skeleton className="hidden sm:inline-block w-12 h-4 rounded-full" />
              ) : chipInfo.badgeLabel ? (
                <span className="hidden sm:inline-flex">
                  <Badge
                    variant={
                      chipInfo.status === "active"
                        ? "success"
                        : chipInfo.status === "expiring_soon"
                        ? "warning"
                        : chipInfo.status === "expired"
                        ? "error"
                        : "neutral"
                    }
                    size="sm"
                  >
                    {chipInfo.badgeLabel}
                  </Badge>
                </span>
              ) : null}
            </Link>

            {/* Sign Out Button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void signOut()}
              title="خروج از حساب"
              aria-label="خروج از حساب"
              leftIcon={<LogOut className="w-3.5 h-3.5 text-red-500" />}
              className="shrink-0 px-2 sm:px-3"
            >
              <span className="hidden sm:inline text-xs text-red-500 font-semibold">خروج</span>
            </Button>

            {/* Mobile/Tablet Hamburger Toggle Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden shrink-0"
              aria-label="منو"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile/Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-20 z-40 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] p-6 xl:hidden flex flex-col gap-4 animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-2">
            <MobileDrawerLink
              to="/home"
              active={isHomeActive}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Home className="w-5 h-5" />
              <span>صفحه اصلی</span>
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
              to="/exams"
              active={isExamsActive}
              onClick={() => setMobileMenuOpen(false)}
            >
              <HelpCircle className="w-5 h-5" />
              <span>آزمون‌ها</span>
            </MobileDrawerLink>

            {FILES_ENABLED && (
              <MobileDrawerLink
                to="/files"
                active={isFilesActive}
                onClick={() => setMobileMenuOpen(false)}
              >
                <FolderOpen className="w-5 h-5" />
                <span>فایل‌ها</span>
              </MobileDrawerLink>
            )}

            <MobileDrawerLink
              to="/library"
              active={isLibraryActive}
              onClick={() => setMobileMenuOpen(false)}
            >
              <LibraryIcon className="w-5 h-5" />
              <span>کتابخانه</span>
            </MobileDrawerLink>

            <MobileDrawerLink
              to="/blog"
              active={location.pathname.startsWith("/blog")}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Newspaper className="w-5 h-5" />
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
              <Receipt className="w-5 h-5 text-[#008080]" />
              <span>خریدهای من و فاکتورها</span>
            </MobileDrawerLink>

            <div className="mt-auto pt-4 border-t border-[var(--color-border)]">
              <Link
                to="/home"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-[var(--color-text-muted)] text-sm font-medium hover:bg-[var(--color-surface)]"
              >
                <Settings className="w-5 h-5" />
                <span>تنظیمات</span>
              </Link>
            </div>
          </nav>
        </div>
      )}

      {/* API Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Alert variant="error" title="خطای سامانه">
            {error}
          </Alert>
        </div>
      )}

      {/* Main Content Area (Full Width max-w-7xl Container) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen w-full relative z-10">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 start-0 end-0 h-16 bg-[var(--color-surface-glass)] backdrop-blur-xl shadow-lg z-40 flex justify-around items-center px-2 border-t border-[var(--color-border)]">
        <Link
          to="/home"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isHomeActive ? "text-[#008080] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">صفحه اصلی</span>
        </Link>

        <Link
          to="/courses"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isCoursesActive ? "text-[#008080] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">لیست دوره‌ها</span>
        </Link>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex flex-col items-center justify-center w-full h-full text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
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
      className={`flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-xl text-xs xl:text-sm font-semibold transition-all shrink-0 ${
        active
          ? "text-[#008080] bg-[#008080]/15 border border-[#008080]/30 shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
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
          ? "text-[#008080] bg-[#008080]/15 font-bold border-s-4 border-[#008080]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </Link>
  );
}
