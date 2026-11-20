import React, { useState } from "react";
import { Outlet, NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  Vote,
  Database,
  BarChart3,
  ArrowRight,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/studio",
    label: "پیشخوان",
    end: true,
    icon: LayoutDashboard,
  },
  {
    to: "/studio/quizzes",
    label: "آزمون‌های بازاریابی",
    icon: CheckSquare,
  },
  {
    to: "/studio/polls",
    label: "نظرسنجی‌ها و فرم‌ها",
    icon: Vote,
  },
  {
    to: "/studio/question-bank",
    label: "بانک سؤالات",
    icon: Database,
  },
  {
    to: "/studio/reports",
    label: "آمار و گزارش‌ها",
    icon: BarChart3,
  },
];

export function StudioLayout() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex font-sans" dir="rtl">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0d1719]/60 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <Link to="/studio" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-default)] text-white flex items-center justify-center font-bold text-base shadow-xs">
              S
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-[var(--color-text)]">AVANA Studio</span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">پنل مدیریت بازاریابی</span>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors cursor-pointer"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="بستن منو"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/25 font-bold shadow-xs"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Quick Links Footer */}
        <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 space-y-1">
          <Link
            to="/admin"
            className="flex items-center justify-between px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
          >
            <span>رفتن به پنل مدیریت کل (Admin)</span>
            <ArrowRight className="w-4 h-4 rotate-180 text-[var(--color-text-muted)]" />
          </Link>
          <Link
            to="/home"
            className="flex items-center justify-between px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
          >
            <span>بازگشت به سایت آوانا</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-sm sm:text-base text-[var(--color-text)]">
                فضای مدیریتی AVANA Studio
              </span>
              <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] border border-[#b3d9d9]">
                آزمون‌های بازاریابی
              </span>
            </div>
          </div>

          {/* User Profile Pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="hidden sm:inline font-medium text-[var(--color-text)]">{user?.name || user?.email}</span>
              <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-text-secondary)]">
                {user?.role === "platform_admin" ? "مدیر کل" : user?.role === "content_worker" ? "تولید محتوا" : "مدیر سازمان"}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
