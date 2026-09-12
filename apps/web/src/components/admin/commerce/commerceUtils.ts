export function formatToman(amount: number | null | undefined): string {
  if (amount === undefined || amount === null) return "۰ تومان";
  return `${amount.toLocaleString("fa-IR")} تومان`;
}

export function formatPersianDate(
  dateStr: string | null | undefined,
  includeTime = true
): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(includeTime
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : {}),
    };
    return d.toLocaleDateString("fa-IR", options);
  } catch {
    return dateStr;
  }
}

export function getOrderStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        label: "پرداخت شده",
        className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      };
    case "pending":
      return {
        label: "در انتظار پرداخت",
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      };
    case "failed":
      return {
        label: "ناموفق",
        className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      };
    case "cancelled":
      return {
        label: "لغو شده",
        className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      };
    case "expired":
      return {
        label: "منقضی شده",
        className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
      };
    default:
      return {
        label: status || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

export function getPaymentStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "paid":
      return {
        label: "موفق (درگاه)",
        className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
      };
    case "admin_approved":
      return {
        label: "تأیید شده ادمین",
        className: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
      };
    case "pending_admin_review":
      return {
        label: "در انتظار بررسی ادمین",
        className: "bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse",
      };
    case "admin_rejected":
      return {
        label: "رد شده ادمین",
        className: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
      };
    case "pending":
      return {
        label: "در انتظار پرداخت",
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      };
    case "failed":
      return {
        label: "ناموفق",
        className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      };
    case "cancelled":
      return {
        label: "لغو شده",
        className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      };
    default:
      return {
        label: status || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

export function getSubscriptionStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "active":
      return {
        label: "فعال",
        className: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
      };
    case "active_pending_payment_review":
      return {
        label: "فعال (در انتظار بررسی)",
        className: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
      };
    case "expired":
      return {
        label: "منقضی شده",
        className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
      };
    case "cancelled":
      return {
        label: "لغو شده",
        className: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
      };
    case "cancelled_payment_rejected":
      return {
        label: "لغو شده (عدم تأیید پرداخت)",
        className: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
      };
    default:
      return {
        label: status || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

export function getSourceTypeBadge(sourceType: string) {
  switch (sourceType?.toLowerCase()) {
    case "purchase":
      return {
        label: "خرید مستقیم",
        className: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
      };
    case "admin_grant":
      return {
        label: "اعطای ادمین",
        className: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
      };
    case "promotion":
      return {
        label: "پروموشن",
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
      };
    case "gift":
      return {
        label: "هدیه",
        className: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
      };
    default:
      return {
        label: sourceType || "نامشخص",
        className: "bg-slate-800 text-slate-400 border border-slate-700",
      };
  }
}

export function getResourceTypeLabel(resourceType: string) {
  switch (resourceType?.toLowerCase()) {
    case "subscription":
      return "اشتراک سراسری";
    case "course":
      return "دوره آموزشی";
    case "content_pack":
      return "بسته محتوایی";
    case "content":
      return "محتوای آموزشی";
    case "special_exam":
      return "آزمون ویژه";
    default:
      return resourceType;
  }
}
