import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Sparkles,
  Home,
  LogOut,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  ADMIN_NAV_GROUPS,
  isNavItemActive,
  type AdminNavItem,
} from "./adminNavigation.js";
import { useAuth } from "../../providers/AuthProvider.js";

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
  const { signOut } = useAuth();

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

  const renderNavGroup = (
    groupTitle: string,
    items: AdminNavItem[],
    isMobile = false,
  ) => {
    return (
      <div key={groupTitle} className="space-y-1">
        {(!isCollapsed || isMobile) && (
          <h3 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 select-none">
            {groupTitle}
          </h3>
        )}
        <div className="space-y-1">
          {items.map((item) => {
            const isActive = isNavItemActive(item.href, location.pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={isMobile ? onCloseMobile : undefined}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed && !isMobile ? item.name : undefined}
                aria-label={item.name}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
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
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-over Drawer */}
      <aside
        aria-label="ناوبری مدیریت موبایل"
        className={`fixed inset-y-0 right-0 z-50 w-72 sm:w-80 bg-[#0b1120] border-l border-white/10 flex flex-col font-sans text-slate-200 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        dir="rtl"
      >
        {/* Mobile Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/10 shrink-0 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600/30 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-teal-400">آوانا ادمین</span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">
                کنسول مدیریت
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            aria-label="بستن منوی مدیریت"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Navigation List */}
        <nav
          className="flex-1 overflow-y-auto p-4 space-y-5"
          aria-label="منوی اصلی مدیریت"
        >
          {ADMIN_NAV_GROUPS.map((group) =>
            renderNavGroup(group.title, group.items, true),
          )}
        </nav>

        {/* Mobile Footer */}
        <div className="p-4 border-t border-white/10 space-y-1 bg-white/5 shrink-0">
          <Link
            to="/home"
            onClick={onCloseMobile}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>بازگشت به اپلیکیشن</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>

      {/* Desktop / Tablet Persistent Sidebar */}
      <aside
        aria-label="ناوبری مدیریت"
        className={`hidden lg:flex flex-col shrink-0 bg-[#0b1120]/80 glass-panel border-l border-white/10 transition-[width] duration-200 ease-in-out h-screen sticky top-0 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
        dir="rtl"
      >
        {/* Brand & Collapse Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600/30 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <span className="font-bold text-sm text-teal-400 block truncate">
                  آوانا ادمین
                </span>
                <span className="text-[10px] text-slate-400 block -mt-0.5 truncate">
                  کنسول مدیریت سیستم
                </span>
              </div>
            )}
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              aria-label={
                isCollapsed ? "گسترش نوار کناری" : "جمع کردن نوار کناری"
              }
              title={isCollapsed ? "گسترش نوار کناری" : "جمع کردن نوار کناری"}
            >
              {isCollapsed ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav
          className="flex-1 overflow-y-auto p-3 space-y-4"
          aria-label="منوی اصلی مدیریت"
        >
          {ADMIN_NAV_GROUPS.map((group) =>
            renderNavGroup(group.title, group.items, false),
          )}
        </nav>

        {/* Desktop Footer */}
        <div className="p-3 border-t border-white/10 space-y-1 shrink-0 bg-black/10">
          <Link
            to="/home"
            title={isCollapsed ? "بازگشت به اپلیکیشن" : undefined}
            aria-label="بازگشت به اپلیکیشن"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors ${
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
            className={`flex w-full items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors ${
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
