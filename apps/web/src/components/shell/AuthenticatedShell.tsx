import { useState, useRef, useEffect } from "react";
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
  Menu,
  X,
  Library as LibraryIcon,
  Crown,
  Receipt,
  Newspaper,
  ShieldCheck,
  Wallet,
  Gift,
  LifeBuoy,
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
import { NotificationDropdown } from "../notifications/NotificationDropdown.js";

export function AuthenticatedShell() {
  const { user, memberships, isLoading, error, signOut } = useAuth();
  const isAdmin = isUserAdmin(user, memberships);
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

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

  // Dedicated full-screen experiences (e.g. exam taking attempt, flashcard study session) bypass shell chrome
  if (
    location.pathname.startsWith("/exams/attempt") ||
    location.pathname.startsWith("/flashcards/review")
  ) {
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

            {/* Notifications Dropdown */}
            <NotificationDropdown />

            {/* Admin Badge link if admin */}
            {isAdmin && (
              <Link to="/admin" className="hidden sm:inline-flex shrink-0">
                <Badge variant="primary" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
                  پنل مدیریت
                </Badge>
              </Link>
            )}

            {/* User Profile / Account Menu Dropdown */}
            <div className="relative shrink-0" ref={userMenuRef}>
              <Link
                to="/account/subscription"
                onClick={(e) => {
                  e.preventDefault();
                  setUserMenuOpen((prev) => !prev);
                }}
                title={chipInfo.tooltip}
                aria-label={`حساب کاربری ${userName}${chipInfo.badgeLabel ? ` - وضعیت اشتراک: ${chipInfo.badgeLabel}` : ""}`}
                aria-expanded={userMenuOpen}
                className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080] transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008080]/30"
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

              {/* Floating User Profile Dropdown Panel */}
              {userMenuOpen && (
                <div
                  className="absolute left-0 mt-2 w-56 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col py-1.5 transition-all animate-in fade-in zoom-in-95 duration-150"
                  dir="rtl"
                >
                  {/* User info header */}
                  <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] mb-1 bg-[var(--color-surface-warm)]/50">
                    <div className="text-xs font-bold text-[var(--color-text)] truncate">
                      {userName}
                    </div>
                    {user?.email && user.email !== userName && (
                      <div className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5" dir="ltr">
                        {user.email}
                      </div>
                    )}
                  </div>

                  <Link
                    to="/account/subscription"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors"
                  >
                    <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>اشتراک من</span>
                  </Link>

                  <Link
                    to="/account/purchases"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors"
                  >
                    <Receipt className="w-4 h-4 text-[#008080] shrink-0" />
                    <span>خریدهای من و فاکتورها</span>
                  </Link>

                  <Link
                    to="/account/wallet"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-primary shrink-0" />
                    <span>کیف پول من</span>
                  </Link>

                  <Link
                    to="/account/referral"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors"
                  >
                    <Gift className="w-4 h-4 text-primary shrink-0" />
                    <span>دعوت از دوستان</span>
                  </Link>

                  <Link
                    to="/account/support"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors"
                  >
                    <LifeBuoy className="w-4 h-4 text-primary shrink-0" />
                    <span>پشتیبانی و بازخورد</span>
                  </Link>


                  <div className="my-1 border-t border-[var(--color-border)]" />

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut();
                    }}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors w-full text-start cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-500 shrink-0" />
                    <span>خروج از حساب</span>
                  </button>
                </div>
              )}
            </div>

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

            <MobileDrawerLink
              to="/account/wallet"
              active={location.pathname === "/account/wallet"}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Wallet className="w-5 h-5 text-primary" />
              <span>کیف پول من</span>
            </MobileDrawerLink>

            <MobileDrawerLink
              to="/account/referral"
              active={location.pathname === "/account/referral"}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Gift className="w-5 h-5 text-primary" />
              <span>دعوت از دوستان</span>
            </MobileDrawerLink>

            <MobileDrawerLink
              to="/account/support"
              active={location.pathname === "/account/support"}
              onClick={() => setMobileMenuOpen(false)}
            >
              <LifeBuoy className="w-5 h-5 text-primary" />
              <span>پشتیبانی و بازخورد</span>
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
