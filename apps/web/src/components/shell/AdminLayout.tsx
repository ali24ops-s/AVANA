/**
 * Admin Layout & Shell.
 *
 * Provides a dedicated, standalone Shell for the AVANA Admin Console,
 * decoupled from the Student/User shell.
 *
 * Reuses Phase 1 AuthProvider / role resolution for access control.
 */

import { useState, useCallback } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { AdminSidebar } from "../admin/AdminSidebar.js";
import { AdminHeader } from "../admin/AdminHeader.js";

export function AdminLayout() {
  const { user, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleOpenMobile = useCallback(() => {
    setMobileMenuOpen(true);
  }, []);

  const handleCloseMobile = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-[#0b1120] text-slate-200 flex items-center justify-center font-sans"
        dir="rtl"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">
            در حال بارگذاری پنل مدیریت...
          </p>
        </div>
      </div>
    );
  }

  // Authorization Check (reusing Phase 1 role resolution)
  if (!user || user.role !== "platform_admin") {
    return <Navigate to="/home" replace />;
  }

  return (
    <div
      className="min-h-screen flex bg-[#0b1120] text-slate-200 font-sans selection:bg-teal-700/50 selection:text-teal-200"
      dir="rtl"
    >
      {/* Admin Dedicated Sidebar */}
      <AdminSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={handleCloseMobile}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Admin Dedicated Top Header Bar */}
        <AdminHeader onOpenMobileMenu={handleOpenMobile} />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
