import { useState, useCallback } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { AdminSidebar } from "../admin/AdminSidebar.js";
import { AdminHeader } from "../admin/AdminHeader.js";
import { LoadingState } from "../ui/index.js";
import { isContentManagerOrAdmin } from "../../utils/generationPermissions.js";

const COURSE_WORKSPACES_PREFIXES = [
  "/admin/courses",
  "/admin/content-studio",
  "/admin/documents",
  "/admin/content",
  "/admin/generation",
  "/admin/community-content",
];

export function AdminLayout() {
  const { user, memberships, isLoading } = useAuth();
  const location = useLocation();
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

  // 1. Overall Admin/Workspace Access Check (platform_admin, content_worker, organization_admin, course_editor)
  if (!user || !isContentManagerOrAdmin(user, memberships)) {
    return <Navigate to="/home" replace />;
  }

  const isPlatformAdmin = user.role === "platform_admin";
  const isContentWorker = user.role === "content_worker";
  const pathname = location.pathname;

  // 2. Sub-route authorization for course editors & non-platform admins
  if (!isPlatformAdmin) {
    // If accessing root admin or platform-admin-only dashboard, redirect to primary workspace
    if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin/dashboard") {
      return <Navigate to="/admin/courses" replace />;
    }

    const isAllowedCourseArea = COURSE_WORKSPACES_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    const isAllowedBlogArea =
      isContentWorker &&
      (pathname === "/admin/blog" || pathname.startsWith("/admin/blog/"));

    if (!isAllowedCourseArea && !isAllowedBlogArea) {
      // Forbidden platform-admin-only areas (users, commerce, system, teachers, settings)
      return <Navigate to="/admin/courses" replace />;
    }
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
