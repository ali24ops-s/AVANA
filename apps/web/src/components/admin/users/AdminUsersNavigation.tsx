import { Link, useLocation } from "react-router-dom";
import { Users, Sparkles, ShoppingBag, Wallet } from "lucide-react";

export interface UserNavItem {
  id: string;
  name: string;
  href: string;
  icon: typeof Users;
  exact?: boolean;
}

export const USER_NAV_ITEMS: UserNavItem[] = [
  {
    id: "users",
    name: "کاربران",
    href: "/admin/users",
    icon: Users,
    exact: true,
  },
  {
    id: "subscriptions",
    name: "پرداخت اشتراک‌ها",
    href: "/admin/users/subscriptions",
    icon: Sparkles,
  },
  {
    id: "purchases",
    name: "خرید محصولات",
    href: "/admin/users/purchases",
    icon: ShoppingBag,
  },
  {
    id: "wallet-topups",
    name: "شارژ کیف پول",
    href: "/admin/users/wallet-topups",
    icon: Wallet,
  },
];

export function AdminUsersNavigation() {
  const location = useLocation();

  const isItemActive = (item: UserNavItem) => {
    if (item.exact) {
      return location.pathname === item.href;
    }
    return (
      location.pathname === item.href ||
      location.pathname.startsWith(item.href + "/")
    );
  };

  return (
    <nav
      aria-label="ناوبری بخش مدیریت کاربران"
      className="flex items-center gap-1.5 p-1.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-2xl overflow-x-auto text-xs font-bold shadow-sm no-scrollbar"
      dir="rtl"
    >
      {USER_NAV_ITEMS.map((item) => {
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
