/**
 * Admin Layout with Sidebar.
 */

import { useState } from "react";
import { Outlet, Link, useLocation, Navigate } from "react-router-dom";
import {
  Sparkles,
  LayoutDashboard,
  Users,
  BrainCircuit,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Home,
  BookOpen,
  FileText,
  FolderTree,
  Activity,
  TerminalSquare,
  History,
  Server,
  MessageSquare,
  Settings
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";

const ADMIN_NAVIGATION = [
  { name: "داشبورد", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "آمار و تحلیل‌ها", href: "/admin/analytics", icon: Activity },
  { name: "آمار هوش مصنوعی", href: "/admin/analytics/ai", icon: BrainCircuit },
  { name: "دوره‌ها", href: "/admin/courses", icon: BookOpen },
  { name: "مدیریت محتوا", href: "/admin/content", icon: FolderTree },
  { name: "فایل‌ها", href: "/admin/documents", icon: FileText },
  { name: "کاربران", href: "/admin/users", icon: Users },
  { name: "تاریخچه تولیدات", href: "/admin/generation", icon: History },
  { name: "ارائه‌دهندگان AI", href: "/admin/generation/providers", icon: Server },
  { name: "مدیریت پرامپت‌ها", href: "/admin/generation/prompts", icon: MessageSquare },
  { name: "سلامت سیستم", href: "/admin/system/health", icon: Activity },
  { name: "سلامت داده‌ها", href: "/admin/system/integrity", icon: ShieldAlert },
  { name: "لاگ سیستم", href: "/admin/system/logs", icon: TerminalSquare },
  { name: "حسابرسی (Audit)", href: "/admin/system/audit", icon: History },
  { name: "تنظیمات", href: "/admin/settings", icon: Settings },
];

export function AdminLayout() {
  const { user, isLoading, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1120] text-slate-200 flex items-center justify-center font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Authorization Check
  if (!user || user.role !== "platform_admin") {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen flex bg-[#0b1120] text-slate-200 font-sans selection:bg-teal-700/50 selection:text-teal-200" dir="rtl">
      
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-64 glass-panel border-l border-white/10 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600/30 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-teal-400 leading-tight">آوانا ادمین</h1>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 text-slate-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {ADMIN_NAVIGATION.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <Link
            to="/home"
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium text-sm">بازگشت به اپلیکیشن</span>
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">خروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 glass-panel border-b border-white/10 flex items-center px-4 lg:hidden shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="mr-4 font-bold text-slate-200">پنل مدیریت</span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
