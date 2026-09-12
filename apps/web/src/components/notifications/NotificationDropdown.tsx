import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  AlertCircle,
  XCircle,
  ShieldCheck,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Badge, Button } from "@avana/ui";
import type { NotificationItem, NotificationType } from "@avana/domain";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from "../../hooks/useNotifications.js";

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "همین الان";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} دقیقه پیش`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} ساعت پیش`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} روز پیش`;
    return date.toLocaleDateString("fa-IR", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "purchase_completed":
      return (
        <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-4 h-4" />
        </div>
      );
    case "generation_completed":
      return (
        <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-400 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
      );
    case "generation_failed":
    case "payment_failed":
      return (
        <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <XCircle className="w-4 h-4" />
        </div>
      );
    case "email_verified":
      return (
        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    case "login_success":
      return (
        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
      );
    case "registration_success":
      return (
        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </div>
      );
  }
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: countData } = useUnreadNotificationCount();
  const unreadCount = countData?.unread_count ?? 0;

  const { data, isLoading } = useNotifications(
    { unread_only: filter === "unread" },
    { enabled: isOpen },
  );

  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markAsReadMutation.mutate(item.id);
    }
    if (item.action?.url) {
      setIsOpen(false);
      navigate(item.action.url);
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount > 0 && !markAllAsReadMutation.isPending) {
      markAllAsReadMutation.mutate();
    }
  };

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative text-[var(--color-text-muted)] hover:text-[#008080] transition-colors p-2 rounded-full hover:bg-[var(--color-surface-warm)] cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-[#008080]/30"
        aria-label="اعلانات"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-[#008080] text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--color-surface)]">
            {unreadCount > 99 ? "+۹۹" : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[340px] sm:w-[380px] max-w-[calc(100vw-24px)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col transition-all animate-in fade-in zoom-in-95 duration-150"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--color-text)]">
                اعلانات
              </span>
              {unreadCount > 0 && (
                <Badge variant="primary" size="sm">
                  {unreadCount} جدید
                </Badge>
              )}
            </div>

            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={markAllAsReadMutation.isPending}
                leftIcon={
                  markAllAsReadMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3.5 h-3.5 text-[#008080]" />
                  )
                }
                className="text-xs text-[#008080] hover:bg-[#008080]/10 px-2 py-1 h-7"
              >
                خواندن همه
              </Button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex items-center px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/50 gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === "all"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs border border-[var(--color-border)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              همه
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                filter === "unread"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs border border-[var(--color-border)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              خوانده‌نشده
            </button>
          </div>

          {/* Notification Items List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--color-border)] overscroll-contain">
            {isLoading ? (
              <div className="p-6 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
                <Loader2 className="w-6 h-6 animate-spin text-[#008080]" />
                <span className="text-xs">در حال بارگذاری اعلانات...</span>
              </div>
            ) : !data?.items || data.items.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-[var(--color-surface-warm)] flex items-center justify-center text-[var(--color-text-muted)]">
                  <Bell className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  {filter === "unread"
                    ? "اعلان خوانده‌نشده‌ای ندارید."
                    : "هنوز اعلانی ثبت نشده است."}
                </p>
              </div>
            ) : (
              data.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer text-right group ${
                    !item.isRead
                      ? "bg-[#008080]/5 hover:bg-[#008080]/10"
                      : "hover:bg-[var(--color-surface-warm)]"
                  }`}
                >
                  {getNotificationIcon(item.type)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="text-xs font-bold text-[var(--color-text)] truncate">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">
                      {item.message}
                    </p>

                    {item.action?.url && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#008080] group-hover:underline">
                        <span>مشاهده</span>
                        <ArrowLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
                      </div>
                    )}
                  </div>

                  {!item.isRead && (
                    <span className="w-2 h-2 rounded-full bg-[#008080] mt-1 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
