import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Activity,
  BrainCircuit,
  BookOpen,
  FolderTree,
  FileText,
  Users,
  History,
  Server,
  MessageSquare,
  ShieldAlert,
  TerminalSquare,
  FileCheck2,
  Settings,
} from "lucide-react";

export interface AdminNavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
}

export interface AdminNavGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    title: "اصلی و تحلیل",
    items: [
      { name: "داشبورد", href: "/admin/dashboard", icon: LayoutDashboard },
      { name: "آمار و تحلیل‌ها", href: "/admin/analytics", icon: Activity },
      { name: "آمار هوش مصنوعی", href: "/admin/analytics/ai", icon: BrainCircuit },
    ],
  },
  {
    id: "management",
    title: "آموزش و کاربران",
    items: [
      { name: "دوره‌ها", href: "/admin/courses", icon: BookOpen },
      { name: "مدیریت محتوا", href: "/admin/content", icon: FolderTree },
      { name: "فایل‌ها و اسناد", href: "/admin/documents", icon: FileText },
      { name: "کاربران", href: "/admin/users", icon: Users },
    ],
  },
  {
    id: "generation",
    title: "هوش مصنوعی",
    items: [
      { name: "تاریخچه تولیدات", href: "/admin/generation", icon: History },
      { name: "ارائه‌دهندگان AI", href: "/admin/generation/providers", icon: Server },
      { name: "مدیریت پرامپت‌ها", href: "/admin/generation/prompts", icon: MessageSquare },
    ],
  },
  {
    id: "system",
    title: "سیستم و نظارت",
    items: [
      { name: "سلامت سیستم", href: "/admin/system/health", icon: Activity },
      { name: "سلامت داده‌ها", href: "/admin/system/integrity", icon: ShieldAlert },
      { name: "لاگ‌های سیستم", href: "/admin/system/logs", icon: TerminalSquare },
      { name: "گزارش حسابرسی", href: "/admin/system/audit", icon: FileCheck2 },
      { name: "تنظیمات", href: "/admin/settings", icon: Settings },
    ],
  },
];

export const ALL_ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (group) => group.items,
);

const ALL_NAV_HREFS = ALL_ADMIN_NAV_ITEMS.map((item) => item.href);

/**
 * Determines if a navigation item is active for a given pathname.
 * Handles exact matches, nested detail paths, and avoids false prefix collisions.
 */
export function isNavItemActive(
  itemHref: string,
  currentPathname: string,
  allHrefs: string[] = ALL_NAV_HREFS,
): boolean {
  if (currentPathname === itemHref) return true;

  if (currentPathname.startsWith(itemHref + "/")) {
    const hasMoreSpecificMatch = allHrefs.some(
      (otherHref) =>
        otherHref !== itemHref &&
        otherHref.length > itemHref.length &&
        (currentPathname === otherHref ||
          currentPathname.startsWith(otherHref + "/")),
    );
    return !hasMoreSpecificMatch;
  }

  return false;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

/**
 * Derives the active page title and breadcrumbs from the current pathname.
 */
export function getAdminPageInfo(currentPathname: string): {
  title: string;
  breadcrumbs: BreadcrumbItem[];
} {
  const activeItem = ALL_ADMIN_NAV_ITEMS.find((item) =>
    isNavItemActive(item.href, currentPathname),
  );

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "پنل مدیریت", href: "/admin/dashboard" },
  ];

  if (!activeItem) {
    if (currentPathname.startsWith("/admin/documents/")) {
      breadcrumbs.push({ label: "فایل‌ها و اسناد", href: "/admin/documents" });
      breadcrumbs.push({ label: "جزئیات سند", isCurrent: true });
      return { title: "جزئیات سند", breadcrumbs };
    }
    if (currentPathname.startsWith("/admin/generation/")) {
      breadcrumbs.push({ label: "تاریخچه تولیدات", href: "/admin/generation" });
      breadcrumbs.push({ label: "جزئیات تولید", isCurrent: true });
      return { title: "جزئیات تولید", breadcrumbs };
    }
    return { title: "پنل مدیریت", breadcrumbs };
  }

  const isDeepDetail =
    currentPathname.startsWith(activeItem.href + "/") &&
    currentPathname !== activeItem.href;

  if (isDeepDetail) {
    breadcrumbs.push({ label: activeItem.name, href: activeItem.href });
    breadcrumbs.push({ label: "جزئیات", isCurrent: true });
    return { title: `${activeItem.name} — جزئیات`, breadcrumbs };
  }

  breadcrumbs.push({ label: activeItem.name, isCurrent: true });
  return { title: activeItem.name, breadcrumbs };
}
