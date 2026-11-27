import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, Award, ShieldAlert } from "lucide-react";

export interface PocketAdminNavItem {
  id: string;
  name: string;
  href: string;
  icon: typeof Award;
  exact?: boolean;
}

export const POCKET_ADMIN_NAV_ITEMS: PocketAdminNavItem[] = [
  {
    id: "dashboard",
    name: "داشبورد",
    href: "/admin/pocket",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "assertions",
    name: "فهرست Assertionها",
    href: "/admin/pocket/assertions",
    icon: ListChecks,
  },
  {
    id: "reviewers",
    name: "مدیریت داوران و اعتبارنامه‌ها",
    href: "/admin/pocket/reviewers",
    icon: Award,
  },
  {
    id: "safety-overrides",
    name: "مدیریت Safety Override",
    href: "/admin/pocket/safety-overrides",
    icon: ShieldAlert,
  },
];

export function AdminPocketNavigation() {
  const location = useLocation();

  const isItemActive = (item: PocketAdminNavItem) => {
    if (item.exact) {
      return location.pathname === item.href || location.pathname === `${item.href}/`;
    }
    return location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav
      aria-label="ناوبری بخش مدیریت AVANA Pocket"
      className="flex items-center gap-1.5 p-1.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-2xl overflow-x-auto text-xs font-bold shadow-sm no-scrollbar"
      dir="rtl"
    >
      {POCKET_ADMIN_NAV_ITEMS.map((item) => {
        const active = isItemActive(item);
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            to={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              active
                ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm font-bold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
