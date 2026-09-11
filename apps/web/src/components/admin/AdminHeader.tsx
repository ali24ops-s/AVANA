import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  ChevronLeft,
  ShieldCheck,
  User,
  Home,
  LogOut,
} from "lucide-react";
import { getAdminPageInfo } from "./adminNavigation.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { GlobalGenerationIndicator } from "../generation/GlobalGenerationIndicator.js";
import { Button, Badge } from "../ui/index.js";

export interface AdminHeaderProps {
  onOpenMobileMenu?: () => void;
}

export function AdminHeader({ onOpenMobileMenu }: AdminHeaderProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { breadcrumbs } = getAdminPageInfo(location.pathname);

  return (
    <header
      className="h-16 bg-[var(--color-surface-glass)] backdrop-blur-xl border-b border-[var(--color-border)] flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 z-30 font-sans text-[var(--color-text)] shadow-sm"
      dir="rtl"
    >
      {/* Right Side (RTL): Mobile Hamburger & Breadcrumb / Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileMenu && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenMobileMenu}
            className="lg:hidden shrink-0"
            aria-label="باز کردن منوی مدیریت"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Breadcrumb Navigation */}
        <nav
          aria-label="مسیر راهنما"
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] overflow-x-auto no-scrollbar py-1"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;

            return (
              <div key={idx} className="flex items-center gap-1.5 shrink-0">
                {idx > 0 && (
                  <ChevronLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                )}
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="hover:text-[var(--color-text)] transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`font-semibold ${
                      isLast ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    {crumb.label}
                  </span>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Left Side (RTL): Admin Role Badge, User Pill & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Global Generation Status Indicator */}
        <GlobalGenerationIndicator />

        {/* Role Badge */}
        <div className="hidden sm:flex">
          <Badge variant="primary" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
            مدیر ارشد پلتفرم
          </Badge>
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)] bg-[var(--color-surface)] px-3 py-1.5 rounded-full border border-[var(--color-border)]">
          <User className="w-3.5 h-3.5 text-[var(--color-primary-default)] shrink-0" />
          <span className="hidden md:inline max-w-[140px] truncate">
            {user?.name && user.name.trim().length > 0
              ? user.name.trim()
              : (user?.email ?? "مدیر سیستم")}
          </span>
        </div>

        {/* Link to App */}
        <Link to="/home" title="بازگشت به اپلیکیشن">
          <Button size="sm" variant="ghost" leftIcon={<Home className="w-4 h-4" />}>
            <span className="hidden lg:inline">اپلیکیشن</span>
          </Button>
        </Link>

        {/* Sign Out Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void signOut()}
          title="خروج از حساب"
          aria-label="خروج از حساب"
          leftIcon={<LogOut className="w-4 h-4 text-red-500" />}
        >
          <span className="hidden sm:inline text-red-500">خروج</span>
        </Button>
      </div>
    </header>
  );
}
