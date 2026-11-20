import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { LoadingState } from "../ui/index.js";
import { ErrorView } from "../error/index.js";
import { isContentManagerOrAdmin } from "../../utils/generationPermissions.js";

interface StudioRouteGuardProps {
  children: React.ReactNode;
}

export function StudioRouteGuard({ children }: StudioRouteGuardProps) {
  const { user, memberships, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex items-center justify-center font-sans"
        dir="rtl"
      >
        <LoadingState message="در حال بررسی دسترسی به AVANA Studio..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  const isPlatformAdmin = user.role === "platform_admin";
  const isOrgAdmin = user.role === "organization_admin" || memberships?.some((m) => m.role === "organization_admin");
  const isContentWorker = user.role === "content_worker" || memberships?.some((m) => m.role === "content_worker");
  const hasContentManagement = isContentManagerOrAdmin(user, memberships);

  const hasStudioAccess = isPlatformAdmin || isOrgAdmin || isContentWorker || hasContentManagement;

  if (!hasStudioAccess) {
    return (
      <ErrorView
        type="forbidden"
        statusCode="۴۰۳"
        title="دسترسی به استودیو محدود است"
        description="حساب کاربری شما مجوز لازم برای دسترسی به محیط مدیریتی AVANA Studio را ندارد."
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

  return <>{children}</>;
}
