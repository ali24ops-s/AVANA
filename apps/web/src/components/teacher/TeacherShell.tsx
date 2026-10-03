/**
 * TeacherShell component.
 *
 * Dedicated layout for the AVANA Teacher Platform (/teacher).
 * Reuses existing AVANA design system tokens, header structure,
 * responsive mobile drawer, and user profile menu.
 */

import { useState, useRef, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  LogOut,
  User,
  ArrowRightLeft,
  Menu,
  X,
  ChevronLeft,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { NotificationDropdown } from "../notifications/NotificationDropdown.js";
import { Button } from "../ui/index.js";
import { TeacherOrganizationProvider } from "./TeacherOrganizationContext.js";
import { TeacherOrgSwitcher } from "./TeacherOrgSwitcher.js";

export function TeacherShell() {
  const { user, memberships, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
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

  // Close menus on route change
  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const userName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : (user?.email ?? "استاد گرامی");

  const isDashboardActive =
    location.pathname === "/teacher" || location.pathname === "/teacher/";
  const isClassroomsActive = location.pathname.startsWith("/teacher/classrooms");
  const isMessagesActive = location.pathname.startsWith("/teacher/messages");

  return (
    <TeacherOrganizationProvider>
      <div
        className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans transition-colors duration-200"
        dir="rtl"
      >
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-50 bg-[var(--color-surface-glass)] backdrop-blur-xl border-b border-[var(--color-border)] w-full shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand & Desktop Navigation */}
            <div className="flex items-center gap-4 xl:gap-8 min-w-0">
              <BrandLogo
                linkTo="/teacher"
                variant="logo-only"
                size="md"
                logoClassName="!h-9 sm:!h-14 md:!h-14 !w-auto"
              />

              {/* Desktop Navigation Links */}
              <nav className="hidden md:flex items-center gap-1" aria-label="منوی اساتید">
                <TeacherNavLink to="/teacher" active={isDashboardActive}>
                  <LayoutDashboard className="w-4 h-4" />
                  <span>داشبورد استاد</span>
                </TeacherNavLink>

                <TeacherNavLink to="/teacher/classrooms" active={isClassroomsActive}>
                  <Users className="w-4 h-4" />
                  <span>کلاس‌های من</span>
                </TeacherNavLink>

                <TeacherNavLink to="/teacher/messages" active={isMessagesActive}>
                  <MessageSquare className="w-4 h-4" />
                  <span>پیام‌های دانشجویان</span>
                </TeacherNavLink>
              </nav>
            </div>

            {/* Controls & Quick Actions */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              {/* Context Switcher Button to Student Platform */}
              <Link to="/home" className="hidden sm:inline-flex shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ArrowRightLeft className="w-3.5 h-3.5 text-[#008080]" />}
                  className="text-xs"
                >
                  <span>نمای دانش‌آموز</span>
                </Button>
              </Link>

              {/* Quick Link to Admin Panel for platform_admin */}
              {user?.role === "platform_admin" && (
                <Link to="/admin" className="hidden sm:inline-flex shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-[#008080]" />}
                    className="text-xs"
                  >
                    <span>پنل مدیریت</span>
                  </Button>
                </Link>
              )}

              {/* Notifications Dropdown */}
              <NotificationDropdown />

              {/* User Profile / Account Menu Dropdown */}
              <div className="relative shrink-0" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-label={`حساب کاربری ${userName}`}
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080] transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008080]/30"
                >
                  <User className="w-4 h-4 text-[#008080] shrink-0" />
                  <span className="hidden sm:inline text-xs font-semibold truncate max-w-[90px] xl:max-w-[120px] text-[var(--color-text)]">
                    {userName}
                  </span>
                  <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0 transition-transform -rotate-90" />
                </button>

                {/* Floating Dropdown Panel */}
                {userMenuOpen && (
                  <div
                    className="absolute left-0 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col py-1.5 transition-all animate-in fade-in zoom-in-95 duration-150 text-start"
                    dir="rtl"
                  >
                    <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] mb-1 bg-[var(--color-surface-warm)]/50">
                      <div className="text-xs font-bold text-[var(--color-text)] truncate">
                        {userName}
                      </div>
                      {user?.email && user.email !== userName && (
                        <div className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5" dir="ltr">
                          {user.email}
                        </div>
                      )}
                      {memberships.length > 0 && (
                        <div className="mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-[#008080] font-medium">
                            نقش: استاد
                          </span>
                        </div>
                      )}
                    </div>

                    <Link
                      to="/home"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-[#008080] transition-colors"
                    >
                      <ArrowRightLeft className="w-4 h-4 text-[#008080] shrink-0" />
                      <span>بازگشت به نمای دانش‌آموز</span>
                    </Link>

                    {user?.role === "platform_admin" && (
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-[#008080] transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#008080] shrink-0" />
                        <span>پنل مدیریت</span>
                      </Link>
                    )}

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

              {/* Mobile Hamburger Toggle Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden shrink-0"
                aria-label="منو"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 top-16 sm:top-20 z-40 bg-black/40 backdrop-blur-xs md:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 start-0 top-16 sm:top-20 z-40 w-[63vw] min-w-[210px] max-w-[320px] sm:w-80 bg-[var(--color-surface-warm)] border-inline-end border-[var(--color-border)] p-4 sm:p-6 md:hidden flex flex-col gap-4 overflow-y-auto pb-28 animate-in rtl:slide-in-from-right ltr:slide-in-from-left duration-200 shadow-2xl">
            <nav className="flex flex-col gap-2">
              <MobileTeacherLink
                to="/teacher"
                active={isDashboardActive}
                onClick={() => setMobileMenuOpen(false)}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>داشبورد استاد</span>
              </MobileTeacherLink>

              <MobileTeacherLink
                to="/teacher/classrooms"
                active={isClassroomsActive}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Users className="w-5 h-5" />
                <span>کلاس‌های من</span>
              </MobileTeacherLink>

              <MobileTeacherLink
                to="/teacher/messages"
                active={isMessagesActive}
                onClick={() => setMobileMenuOpen(false)}
              >
                <MessageSquare className="w-5 h-5" />
                <span>پیام‌های دانشجویان</span>
              </MobileTeacherLink>

              <div className="my-2 border-t border-[var(--color-border)]" />

              <MobileTeacherLink
                to="/home"
                active={false}
                onClick={() => setMobileMenuOpen(false)}
              >
                <ArrowRightLeft className="w-5 h-5 text-[#008080]" />
                <span>نمای دانش‌آموز</span>
              </MobileTeacherLink>

              {user?.role === "platform_admin" && (
                <MobileTeacherLink
                  to="/admin"
                  active={false}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ShieldCheck className="w-5 h-5 text-[#008080]" />
                  <span>پنل مدیریت</span>
                </MobileTeacherLink>
              )}

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void signOut();
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors w-full text-start cursor-pointer"
              >
                <LogOut className="w-5 h-5 text-red-500" />
                <span>خروج از حساب</span>
              </button>
            </nav>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 md:pb-12 min-h-[calc(100vh-5rem)] w-full relative z-10">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 start-0 end-0 h-16 bg-[var(--color-surface-glass)] backdrop-blur-xl shadow-lg z-40 flex justify-around items-center px-2 border-t border-[var(--color-border)]">
        <Link
          to="/teacher"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isDashboardActive ? "text-[#008080] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">داشبورد</span>
        </Link>

        <Link
          to="/teacher/classrooms"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isClassroomsActive ? "text-[#008080] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">کلاس‌ها</span>
        </Link>

        <Link
          to="/teacher/messages"
          className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium ${
            isMessagesActive ? "text-[#008080] font-bold" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <MessageSquare className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">پیام‌ها</span>
        </Link>

        <Link
          to="/home"
          className="flex flex-col items-center justify-center w-full h-full text-xs font-medium text-[var(--color-text-muted)] hover:text-[#008080]"
        >
          <ArrowRightLeft className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">دانش‌آموز</span>
        </Link>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex flex-col items-center justify-center w-full h-full text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
        >
          <LogOut className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">خروج</span>
        </button>
      </nav>
    </div>
  </TeacherOrganizationProvider>
  );
}

function TeacherNavLink({
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
          ? "text-[#008080] bg-[#008080]/15 border border-[#008080]/30 shadow-sm font-bold"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileTeacherLink({
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
