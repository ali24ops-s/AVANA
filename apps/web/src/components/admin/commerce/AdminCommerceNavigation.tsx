import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Sparkles,
  Receipt,
  CreditCard,
  KeyRound,
} from "lucide-react";

export interface CommerceNavItem {
  id: string;
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

export const COMMERCE_NAV_ITEMS: CommerceNavItem[] = [
  {
    id: "overview",
    name: "نمای کلی و آمار",
    href: "/admin/commerce",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "products",
    name: "محصولات و قیمت‌گذاری",
    href: "/admin/commerce/products",
    icon: ShoppingBag,
  },
  {
    id: "subscriptions",
    name: "اشتراک‌های کاربران",
    href: "/admin/commerce/subscriptions",
    icon: Sparkles,
  },
  {
    id: "orders",
    name: "سفارش‌ها",
    href: "/admin/commerce/orders",
    icon: Receipt,
  },
  {
    id: "payments",
    name: "تراکنش‌ها و پرداخت‌ها",
    href: "/admin/commerce/payments",
    icon: CreditCard,
  },
  {
    id: "entitlements",
    name: "حقوق دسترسی (Entitlements)",
    href: "/admin/commerce/entitlements",
    icon: KeyRound,
  },
];

export function AdminCommerceNavigation() {
  const location = useLocation();

  const isItemActive = (item: CommerceNavItem) => {
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
      aria-label="ناوبری بخش امور مالی و فروش"
      className="flex items-center gap-1.5 p-1.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-2xl overflow-x-auto text-xs font-bold shadow-sm no-scrollbar"
      dir="rtl"
    >
      {COMMERCE_NAV_ITEMS.map((item) => {
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
