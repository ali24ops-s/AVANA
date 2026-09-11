import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  LogOut,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { BrandLogo } from "../brand/BrandLogo.js";
import {
  getVisibleNavItems,
  isNavItemActive,
} from "./adminNavigation.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { Button } from "../ui/index.js";

export interface AdminSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({
  isCollapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const navItems = getVisibleNavItems(user?.role);

  // Close mobile drawer on Escape key press
  useEffect(() => {
    if (!mobileOpen || !onCloseMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseMobile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const renderNavList = (isMobile = false) => {
    return (
      <div className="space-y-1.5">
        {(!isCollapsed || isMobile) && (
          <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] select-none">
            فضاهای کاری مدیریت
          </div>
        )}
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = isNavItemActive(
              item.href,
              location.pathname,
              navItems,
            );
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={isMobile ? onCloseMobile : undefined}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed && !isMobile ? item.name : undefined}
                aria-label={item.name}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[var(--color-primary-default)]/15 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30 shadow-sm font-bold"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                } ${isCollapsed && !isMobile ? "justify-center px-2" : ""}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {(!isCollapsed || isMobile) && (
                  <span className="truncate">{item.name}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 w-72 sm:w-80 bg-[var(--color-surface-warm)] border-e border-[var(--color-border)] flex flex-col font-sans text-[var(--color-text)] shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        dir="rtl"
        aria-label="ناوبری مدیریت موبایل"
      >
        {/* Drawer Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          <BrandLogo
            linkTo="/admin"
            variant="logo-only"
            size="sm"
          />

          <Button
            size="sm"
            variant="ghost"
            onClick={onCloseMobile}
            aria-label="بستن منو"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Drawer Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">{renderNavList(true)}</nav>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-[var(--color-border)] space-y-2 shrink-0">
          <Link
            to="/home"
            onClick={onCloseMobile}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
          >
            <Home className="w-5 h-5 shrink-0" />
            <span>بازگشت به اپلیکیشن</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[var(--color-surface-warm)] border-e border-[var(--color-border)] font-sans text-[var(--color-text)] transition-[width] duration-300 ease-in-out shrink-0 sticky top-0 h-screen z-30 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
        dir="rtl"
        aria-label="ناوبری مدیریت"
      >
        {/* Desktop Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <BrandLogo
                linkTo="/admin"
                variant="logo-only"
                size="sm"
              />
              <span className="text-sm font-bold text-[var(--color-text)]">آوانا ادمین</span>
            </div>
          )}

          {isCollapsed && (
            <div className="mx-auto">
              <BrandLogo
                linkTo="/admin"
                variant="logo-only"
                size="sm"
              />
            </div>
          )}

          {onToggleCollapse && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "گسترش نوار کناری" : "جمع کردن نوار کناری"}
              title={isCollapsed ? "گسترش نوار کناری" : "جمع کردن نوار کناری"}
            >
              {isCollapsed ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav
          className="flex-1 overflow-y-auto p-3"
          aria-label="منوی اصلی مدیریت"
        >
          {renderNavList(false)}
        </nav>

        {/* Desktop Footer */}
        <div className="p-3 border-t border-[var(--color-border)] space-y-1 shrink-0">
          <Link
            to="/home"
            title={isCollapsed ? "بازگشت به اپلیکیشن" : undefined}
            aria-label="بازگشت به اپلیکیشن"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
          >
            <Home className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">بازگشت به اپلیکیشن</span>}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            title={isCollapsed ? "خروج" : undefined}
            aria-label="خروج"
            className={`flex w-full items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors ${
              isCollapsed ? "justify-center px-2" : ""
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">خروج</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
