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

export interface AdminHeaderProps {
  onOpenMobileMenu?: () => void;
}

export function AdminHeader({ onOpenMobileMenu }: AdminHeaderProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { breadcrumbs } = getAdminPageInfo(location.pathname);

  return (
    <header
      className="h-16 glass-panel border-b border-white/10 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 z-30 font-sans text-slate-200"
      dir="rtl"
    >
      {/* Right Side (RTL): Mobile Hamburger & Breadcrumb / Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors lg:hidden shrink-0"
            aria-label="باز کردن منوی مدیریت"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Breadcrumb Navigation */}
        <nav
          aria-label="مسیر راهنما"
          className="flex items-center gap-1.5 text-xs text-slate-400 overflow-x-auto no-scrollbar py-1"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;

            return (
              <div key={idx} className="flex items-center gap-1.5 shrink-0">
                {idx > 0 && (
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                )}
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="hover:text-slate-200 transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`font-semibold ${
                      isLast ? "text-slate-100" : "text-slate-400"
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
        {/* Role Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[11px] font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span>مدیر ارشد پلتفرم</span>
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300 glass-panel px-3 py-1.5 rounded-full border border-white/10">
          <User className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="hidden md:inline max-w-[140px] truncate">
            {user?.name && user.name.trim().length > 0
              ? user.name.trim()
              : (user?.email ?? "مدیر سیستم")}
          </span>
        </div>

        {/* Link to App */}
        <Link
          to="/home"
          title="بازگشت به اپلیکیشن"
          aria-label="بازگشت به اپلیکیشن"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
        >
          <Home className="w-4 h-4" />
          <span className="hidden lg:inline">اپلیکیشن</span>
        </Link>

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={() => void signOut()}
          title="خروج از حساب"
          aria-label="خروج از حساب"
          className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/30"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>
    </header>
  );
}
