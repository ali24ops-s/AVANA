import type { ComponentType } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  CircleDollarSign,
  Newspaper,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";

export interface AdminNavItem {
  id?: string;
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  matchPrefixes?: string[];
}

export interface AdminNavGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
}

/**
 * 7 Primary Workspaces for platform_admin
 */
export const PLATFORM_ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "dashboard",
    name: "داشبورد و آمار",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    description: "نمای کلی سیستم و شاخص‌های کلیدی",
    matchPrefixes: ["/admin/dashboard", "/admin/analytics"],
  },
  {
    id: "courses",
    name: "آموزش و دوره‌ها",
    href: "/admin/courses",
    icon: BookOpen,
    description: "مدیریت دوره‌ها، استودیو محتوا، اسناد و بررسی‌ها",
    matchPrefixes: [
      "/admin/courses",
      "/admin/content-studio",
      "/admin/content",
      "/admin/documents",
      "/admin/community-content",
    ],
  },
  {
    id: "users",
    name: "کاربران و دسترسی‌ها",
    href: "/admin/users",
    icon: Users,
    description: "مدیریت حساب‌ها، نقش‌ها و فعالیت کاربران",
    matchPrefixes: ["/admin/users"],
  },
  {
    id: "commerce",
    name: "امور مالی و فروش",
    href: "/admin/commerce",
    icon: CircleDollarSign,
    description: "درآمد، سفارش‌ها، اشتراک‌ها، محصولات و تراکنش‌ها",
    matchPrefixes: ["/admin/commerce"],
  },
  {
    id: "blog",
    name: "مقالات و وبلاگ",
    href: "/admin/blog",
    icon: Newspaper,
    description: "تولید، ویرایش و انتشار مقالات آموزشی",
    matchPrefixes: ["/admin/blog"],
  },
  {
    id: "generation",
    name: "مرکز هوش مصنوعی",
    href: "/admin/generation",
    icon: BrainCircuit,
    description: "مدیریت موتورهای AI، بازرس پرامپت و تاریخچه تولیدات",
    matchPrefixes: ["/admin/generation"],
  },
  {
    id: "system",
    name: "سیستم و نظارت",
    href: "/admin/system/health",
    icon: ShieldCheck,
    description: "سلامت سرور، لاگ‌ها، حسابرسی داده‌ها و تنظیمات",
    matchPrefixes: ["/admin/system", "/admin/settings"],
  },
];

/**
 * 2 Workspaces for content_worker
 */
export const CONTENT_WORKER_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "courses",
    name: "آموزش و دوره‌ها",
    href: "/admin/courses",
    icon: BookOpen,
    description: "مدیریت دوره‌ها، استودیو محتوا و اسناد",
    matchPrefixes: [
      "/admin/courses",
      "/admin/content-studio",
      "/admin/content",
      "/admin/documents",
      "/admin/community-content",
    ],
  },
  {
    id: "blog",
    name: "مقالات و وبلاگ",
    href: "/admin/blog",
    icon: Newspaper,
    description: "تولید، ویرایش و انتشار مقالات آموزشی",
    matchPrefixes: ["/admin/blog"],
  },
];

/**
 * Helper to resolve visible navigation items based on user role.
 */
export function getVisibleNavItems(role?: string): AdminNavItem[] {
  if (role === "content_worker") {
    return CONTENT_WORKER_NAV_ITEMS;
  }
  return PLATFORM_ADMIN_NAV_ITEMS;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = PLATFORM_ADMIN_NAV_ITEMS;
export const ALL_ADMIN_NAV_ITEMS: AdminNavItem[] = PLATFORM_ADMIN_NAV_ITEMS;

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "workspaces",
    title: "فضاهای کاری مدیریت",
    items: PLATFORM_ADMIN_NAV_ITEMS,
  },
];

/**
 * Determines if a navigation item is active for a given pathname.
 * Handles prefix matching, deep sub-routes, and avoids collisions.
 */
export function isNavItemActive(
  itemHref: string,
  currentPathname: string,
  navItemsOrHrefs?: (AdminNavItem | string)[],
): boolean {
  let targetItem: AdminNavItem | undefined;

  if (
    navItemsOrHrefs &&
    navItemsOrHrefs.length > 0 &&
    typeof navItemsOrHrefs[0] === "object"
  ) {
    targetItem = (navItemsOrHrefs as AdminNavItem[]).find(
      (i) => i.href === itemHref,
    );
  } else {
    targetItem = PLATFORM_ADMIN_NAV_ITEMS.find((i) => i.href === itemHref);
  }

  if (targetItem?.matchPrefixes && targetItem.matchPrefixes.length > 0) {
    return targetItem.matchPrefixes.some(
      (prefix) =>
        currentPathname === prefix ||
        currentPathname.startsWith(prefix + "/"),
    );
  }

  if (currentPathname === itemHref) return true;
  if (currentPathname.startsWith(itemHref + "/")) return true;

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
  const rootCrumb: BreadcrumbItem = {
    label: "پنل مدیریت",
    href: "/admin/dashboard",
  };

  // 1. Dashboard & Analytics
  if (currentPathname === "/admin" || currentPathname === "/admin/dashboard") {
    return {
      title: "داشبورد و آمار",
      breadcrumbs: [rootCrumb, { label: "داشبورد و آمار", isCurrent: true }],
    };
  }
  if (currentPathname === "/admin/analytics") {
    return {
      title: "آمار و تحلیل‌ها",
      breadcrumbs: [
        rootCrumb,
        { label: "داشبورد و آمار", href: "/admin/dashboard" },
        { label: "آمار و تحلیل‌ها", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/analytics/ai" ||
    currentPathname.startsWith("/admin/analytics/ai/")
  ) {
    return {
      title: "آمار هوش مصنوعی",
      breadcrumbs: [
        rootCrumb,
        { label: "داشبورد و آمار", href: "/admin/dashboard" },
        { label: "آمار هوش مصنوعی", isCurrent: true },
      ],
    };
  }

  // 2. Education & Courses
  if (currentPathname === "/admin/courses") {
    return {
      title: "آموزش و دوره‌ها",
      breadcrumbs: [rootCrumb, { label: "آموزش و دوره‌ها", isCurrent: true }],
    };
  }
  if (currentPathname.startsWith("/admin/courses/")) {
    return {
      title: "جزئیات دوره",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "جزئیات دوره", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/content-studio") {
    return {
      title: "استودیو محتوای رسمی",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "استودیو محتوای رسمی", isCurrent: true },
      ],
    };
  }
  if (currentPathname.startsWith("/admin/content-studio/")) {
    return {
      title: "ویرایش دوره در استودیو",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "استودیو محتوای رسمی", href: "/admin/content-studio" },
        { label: "ویرایش دوره", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/community-content") {
    return {
      title: "بررسی محتوای ارسالی (کامیونیتی)",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "بررسی محتوای ارسالی", isCurrent: true },
      ],
    };
  }
  if (currentPathname.startsWith("/admin/community-content/")) {
    return {
      title: "جزئیات بررسی محتوا",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "بررسی محتوای ارسالی", href: "/admin/community-content" },
        { label: "جزئیات محتوا", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/content" ||
    currentPathname.startsWith("/admin/content/")
  ) {
    return {
      title: "مدیریت محتوا",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "مدیریت محتوا", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/documents") {
    return {
      title: "فایل‌ها و اسناد",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "فایل‌ها و اسناد", isCurrent: true },
      ],
    };
  }
  if (currentPathname.startsWith("/admin/documents/")) {
    return {
      title: "جزئیات سند",
      breadcrumbs: [
        rootCrumb,
        { label: "آموزش و دوره‌ها", href: "/admin/courses" },
        { label: "فایل‌ها و اسناد", href: "/admin/documents" },
        { label: "جزئیات سند", isCurrent: true },
      ],
    };
  }

  // 3. Users & Permissions
  if (currentPathname === "/admin/users") {
    return {
      title: "کاربران و دسترسی‌ها",
      breadcrumbs: [rootCrumb, { label: "کاربران و دسترسی‌ها", isCurrent: true }],
    };
  }
  if (currentPathname.startsWith("/admin/users/")) {
    return {
      title: "پروفایل کاربر",
      breadcrumbs: [
        rootCrumb,
        { label: "کاربران و دسترسی‌ها", href: "/admin/users" },
        { label: "پروفایل کاربر", isCurrent: true },
      ],
    };
  }

  // 4. Commerce & Sales
  if (currentPathname === "/admin/commerce") {
    return {
      title: "امور مالی و فروش",
      breadcrumbs: [rootCrumb, { label: "امور مالی و فروش", isCurrent: true }],
    };
  }
  if (
    currentPathname === "/admin/commerce/orders" ||
    currentPathname.startsWith("/admin/commerce/orders/")
  ) {
    return {
      title: "سفارش‌ها",
      breadcrumbs: [
        rootCrumb,
        { label: "امور مالی و فروش", href: "/admin/commerce" },
        { label: "سفارش‌ها", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/commerce/payments" ||
    currentPathname.startsWith("/admin/commerce/payments/")
  ) {
    return {
      title: "تراکنش‌ها و پرداخت‌ها",
      breadcrumbs: [
        rootCrumb,
        { label: "امور مالی و فروش", href: "/admin/commerce" },
        { label: "تراکنش‌ها و پرداخت‌ها", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/commerce/subscriptions" ||
    currentPathname.startsWith("/admin/commerce/subscriptions/")
  ) {
    return {
      title: "اشتراک‌های کاربران",
      breadcrumbs: [
        rootCrumb,
        { label: "امور مالی و فروش", href: "/admin/commerce" },
        { label: "اشتراک‌های کاربران", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/commerce/entitlements" ||
    currentPathname.startsWith("/admin/commerce/entitlements/")
  ) {
    return {
      title: "حقوق دسترسی (Entitlements)",
      breadcrumbs: [
        rootCrumb,
        { label: "امور مالی و فروش", href: "/admin/commerce" },
        { label: "حقوق دسترسی", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname === "/admin/commerce/products" ||
    currentPathname.startsWith("/admin/commerce/products/")
  ) {
    return {
      title: "کاتالوگ محصولات",
      breadcrumbs: [
        rootCrumb,
        { label: "امور مالی و فروش", href: "/admin/commerce" },
        { label: "کاتالوگ محصولات", isCurrent: true },
      ],
    };
  }

  // 5. Articles & Blog
  if (currentPathname === "/admin/blog") {
    return {
      title: "مقالات و وبلاگ",
      breadcrumbs: [rootCrumb, { label: "مقالات و وبلاگ", isCurrent: true }],
    };
  }
  if (currentPathname === "/admin/blog/new") {
    return {
      title: "ایجاد مقاله جدید",
      breadcrumbs: [
        rootCrumb,
        { label: "مقالات و وبلاگ", href: "/admin/blog" },
        { label: "ایجاد مقاله جدید", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname.startsWith("/admin/blog/") &&
    currentPathname.endsWith("/edit")
  ) {
    return {
      title: "ویرایش مقاله",
      breadcrumbs: [
        rootCrumb,
        { label: "مقالات و وبلاگ", href: "/admin/blog" },
        { label: "ویرایش مقاله", isCurrent: true },
      ],
    };
  }
  if (
    currentPathname.startsWith("/admin/blog/") &&
    currentPathname.endsWith("/preview")
  ) {
    return {
      title: "پیش‌نمایش مقاله",
      breadcrumbs: [
        rootCrumb,
        { label: "مقالات و وبلاگ", href: "/admin/blog" },
        { label: "پیش‌نمایش مقاله", isCurrent: true },
      ],
    };
  }
  if (currentPathname.startsWith("/admin/blog/")) {
    return {
      title: "جزئیات مقاله",
      breadcrumbs: [
        rootCrumb,
        { label: "مقالات و وبلاگ", href: "/admin/blog" },
        { label: "جزئیات مقاله", isCurrent: true },
      ],
    };
  }

  // 6. AI Generation
  if (currentPathname === "/admin/generation") {
    return {
      title: "مرکز هوش مصنوعی",
      breadcrumbs: [rootCrumb, { label: "مرکز هوش مصنوعی", isCurrent: true }],
    };
  }
  if (currentPathname === "/admin/generation/providers") {
    return {
      title: "ارائه‌دهندگان AI",
      breadcrumbs: [
        rootCrumb,
        { label: "مرکز هوش مصنوعی", href: "/admin/generation" },
        { label: "ارائه‌دهندگان AI", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/generation/prompts") {
    return {
      title: "بازرس پرامپت‌ها (Prompt Inspector)",
      breadcrumbs: [
        rootCrumb,
        { label: "مرکز هوش مصنوعی", href: "/admin/generation" },
        { label: "بازرس پرامپت‌ها", isCurrent: true },
      ],
    };
  }
  if (currentPathname.startsWith("/admin/generation/")) {
    return {
      title: "جزئیات تولید",
      breadcrumbs: [
        rootCrumb,
        { label: "مرکز هوش مصنوعی", href: "/admin/generation" },
        { label: "جزئیات تولید", isCurrent: true },
      ],
    };
  }

  // 7. System & Monitoring
  if (
    currentPathname === "/admin/system/health" ||
    currentPathname === "/admin/system"
  ) {
    return {
      title: "سیستم و نظارت",
      breadcrumbs: [rootCrumb, { label: "سیستم و نظارت", isCurrent: true }],
    };
  }
  if (currentPathname === "/admin/system/integrity") {
    return {
      title: "سلامت داده‌ها",
      breadcrumbs: [
        rootCrumb,
        { label: "سیستم و نظارت", href: "/admin/system/health" },
        { label: "سلامت داده‌ها", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/system/logs") {
    return {
      title: "لاگ‌های سیستم",
      breadcrumbs: [
        rootCrumb,
        { label: "سیستم و نظارت", href: "/admin/system/health" },
        { label: "لاگ‌های سیستم", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/system/audit") {
    return {
      title: "گزارش حسابرسی",
      breadcrumbs: [
        rootCrumb,
        { label: "سیستم و نظارت", href: "/admin/system/health" },
        { label: "گزارش حسابرسی", isCurrent: true },
      ],
    };
  }
  if (currentPathname === "/admin/settings") {
    return {
      title: "تنظیمات سیستم",
      breadcrumbs: [
        rootCrumb,
        { label: "سیستم و نظارت", href: "/admin/system/health" },
        { label: "تنظیمات", isCurrent: true },
      ],
    };
  }

  return {
    title: "پنل مدیریت",
    breadcrumbs: [rootCrumb],
  };
}
