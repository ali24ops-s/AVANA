import { useState, useCallback } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { AdminSidebar } from "../admin/AdminSidebar.js";
import { AdminHeader } from "../admin/AdminHeader.js";
import { LoadingState } from "../ui/index.js";

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
        className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex items-center justify-center font-sans"
        dir="rtl"
      >
        <LoadingState message="در حال بارگذاری پنل مدیریت..." />
      </div>
    );
  }

  // Authorization Check (platform_admin or content_worker)
  if (!user || (user.role !== "platform_admin" && user.role !== "content_worker")) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div
      className="min-h-screen flex bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans transition-colors duration-200"
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
