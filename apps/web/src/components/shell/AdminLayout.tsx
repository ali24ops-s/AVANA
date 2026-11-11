import { useState, useCallback, useEffect } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { AdminSidebar } from "../admin/AdminSidebar.js";
import { AdminHeader } from "../admin/AdminHeader.js";
import { LoadingState } from "../ui/index.js";
import { isContentManagerOrAdmin } from "../../utils/generationPermissions.js";
import { ErrorView } from "../error/index.js";

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

  // Redundant layout-level SEO defense: Guarantee noindex and remove stale canonicals
  useEffect(() => {
    if (typeof document === "undefined") return;

    let robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.name = "robots";
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.content = "noindex, nofollow";
    robotsMeta.setAttribute("data-managed-by", "avana-route-robots");

    const canonicals = document.querySelectorAll('link[rel="canonical"]');
    canonicals.forEach((c) => c.remove());
  }, [location.pathname]);

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

  const isSupport = user?.role === "support_agent" || memberships?.some((m) => m.role === "support_agent");

  // 1. Overall Admin/Workspace Access Check (platform_admin, content_worker, organization_admin, course_editor, support_agent)
  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!isContentManagerOrAdmin(user, memberships) && !isSupport) {
    return (
      <ErrorView
        type="forbidden"
        statusCode="۴۰۳"
        title="دسترسی به پنل مدیریت محدود است"
        description="حساب کاربری شما مجوز لازم برای ورود به پنل مدیریت را ندارد."
        primaryAction={{
          label: "رفتن به صفحه اصلی",
          href: "/home",
        }}
        secondaryAction={{
          label: "مشاهده دوره‌ها",
          href: "/courses",
        }}
      />
    );
  }

  const isPlatformAdmin = user.role === "platform_admin";
  const isContentWorker = user.role === "content_worker";
  const pathname = location.pathname;

  // 2. Sub-route authorization for support agent & other non-platform admins
  if (isSupport && !isPlatformAdmin) {
    if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin/dashboard") {
      return <Navigate to="/admin/support" replace />;
    }
    const isAllowedSupportArea =
      pathname === "/admin/support" ||
      pathname.startsWith("/admin/support/");

    if (!isAllowedSupportArea) {
      return <Navigate to="/admin/support" replace />;
    }
  } else if (!isPlatformAdmin) {
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
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
