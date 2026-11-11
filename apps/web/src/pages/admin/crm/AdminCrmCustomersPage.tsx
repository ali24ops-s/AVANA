import { useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  UserCheck,
  Tag,
  Calendar,
  CreditCard,
  Clock,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Loader2,
  AlertCircle,
  Eye,
  CheckCircle2,
  XCircle,
  Megaphone,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { AvanaSelect } from "@avana/ui";
import {
  listCrmCustomers,
  listCrmTags,
  createCrmTag,
  deleteCrmTag,
  assignCrmCustomerTag,
  removeCrmCustomerTag,
  type CrmCustomerListItem,
  type CrmTagItem,
} from "../../../lib/api/admin.js";
import { useAuth } from "../../../providers/AuthProvider.js";

function formatToman(toman: number): string {
  return `${toPersianDigits(Math.round(toman).toLocaleString("fa-IR"))} تومان`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "ثبت نشده";
  try {
    const d = new Date(iso);
    return toPersianDigits(
      new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d),
    );
  } catch {
    return iso;
  }
}

export function AdminCrmCustomersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPlatformAdmin =
    user?.role === "platform_admin" ||
    (user as { globalRole?: unknown })?.globalRole === "platform_admin";

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [, startTransition] = useTransition();

  const [verifiedStatus, setVerifiedStatus] = useState<"all" | "verified" | "unverified">("all");
  const [hasPurchases, setHasPurchases] = useState<"all" | "true" | "false">("all");
  const [selectedTagId, setSelectedTagId] = useState<string>("all");
  const [minSpent, setMinSpent] = useState<string>("");
  const [maxSpent, setMaxSpent] = useState<string>("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "totalSpent" | "successfulOrdersCount">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Tag manager modal
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [newTagDesc, setNewTagDesc] = useState("");

  // Customer tag assign modal
  const [selectedCustomerForTag, setSelectedCustomerForTag] = useState<CrmCustomerListItem | null>(null);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    startTransition(() => {
      setDebouncedSearch(val);
      setPage(1);
    });
  };

  // Queries
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "admin",
      "crm",
      "customers",
      {
        page,
        pageSize,
        search: debouncedSearch,
        verifiedStatus,
        hasPurchases,
        selectedTagId,
        minSpent,
        maxSpent,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      listCrmCustomers({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        verifiedStatus: verifiedStatus === "all" ? undefined : verifiedStatus,
        hasPurchases: hasPurchases === "all" ? undefined : hasPurchases,
        tagId: selectedTagId === "all" ? undefined : selectedTagId,
        minSpent: minSpent ? Number(minSpent) : undefined,
        maxSpent: maxSpent ? Number(maxSpent) : undefined,
        sortBy,
        sortOrder,
      }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ["admin", "crm", "tags"],
    queryFn: listCrmTags,
  });

  const allTags = tagsData?.tags || [];

  // Tag Mutations
  const createTagMutation = useMutation({
    mutationFn: (input: { name: string; color?: string; description?: string }) =>
      createCrmTag(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "tags"] });
      setNewTagName("");
      setNewTagDesc("");
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: string) => deleteCrmTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "tags"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customers"] });
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: ({ userId, tagId }: { userId: string; tagId: string }) =>
      assignCrmCustomerTag(userId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customers"] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ userId, tagId }: { userId: string; tagId: string }) =>
      removeCrmCustomerTag(userId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customers"] });
    },
  });

  const hasActiveFilters =
    debouncedSearch ||
    verifiedStatus !== "all" ||
    hasPurchases !== "all" ||
    selectedTagId !== "all" ||
    minSpent ||
    maxSpent ||
    sortBy !== "createdAt" ||
    sortOrder !== "desc";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setVerifiedStatus("all");
    setHasPurchases("all");
    setSelectedTagId("all");
    setMinSpent("");
    setMaxSpent("");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const customers = data?.customers || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">باشگاه مشتریان و CRM</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                مدیریت نمایه ۳۶۰ درجه مشتریان، برچسب‌گذاری، سوابق خرید و یادداشت‌های داخلی
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
            تعداد کل: <span className="font-bold">{toPersianDigits(totalCount)}</span> کاربر
          </div>
          <button
            type="button"
            onClick={() => setIsTagModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-xs"
          >
            <Tag className="w-4 h-4" />
            <span>مدیریت برچسب‌ها</span>
          </button>
        </div>
      </div>

      {/* CRM Subnavigation */}
      <div className="flex items-center gap-2 bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-xs text-sm">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">
          <UserCheck className="w-4 h-4" />
          <span>فهرست و نمایه مشتریان</span>
        </div>
        <Link
          to="/admin/crm/segments"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <Tag className="w-4 h-4" />
          <span>سگمنت‌های پویا</span>
        </Link>
        <Link
          to="/admin/crm/campaigns"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <Megaphone className="w-4 h-4" />
          <span>کمپین‌های مشتریان</span>
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {/* Row 1: Search & Sort */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="جستجو بر اساس نام، ایمیل یا شماره موبایل..."
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <AvanaSelect
              value={sortBy}
              onChange={(val) => {
                const selected = typeof val === "string" ? val : val[0];
                if (
                  selected === "createdAt" ||
                  selected === "name" ||
                  selected === "totalSpent" ||
                  selected === "successfulOrdersCount"
                ) {
                  setSortBy(selected);
                }
              }}
              options={
                isPlatformAdmin
                  ? [
                      { value: "createdAt", label: "مرتب‌سازی: تاریخ ثبت‌نام" },
                      { value: "name", label: "مرتب‌سازی: نام مشتری" },
                      { value: "totalSpent", label: "مرتب‌سازی: مجموع خرید" },
                      { value: "successfulOrdersCount", label: "مرتب‌سازی: تعداد سفارش" },
                    ]
                  : [
                      { value: "createdAt", label: "مرتب‌سازی: تاریخ ثبت‌نام" },
                      { value: "name", label: "مرتب‌سازی: نام مشتری" },
                    ]
              }
            />
          </div>

          <div className="md:col-span-3 flex gap-2">
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-[10px] text-xs sm:text-sm text-[var(--color-text)] w-full transition-colors cursor-pointer min-h-[44px] sm:min-h-[38px]"
            >
              <ArrowUpDown className="w-4 h-4 text-[var(--color-text-muted)]" />
              <span>{sortOrder === "desc" ? "نزولی (بیشترین)" : "صعودی (کمترین)"}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Filters */}
        <div className={`grid grid-cols-2 ${isPlatformAdmin ? "md:grid-cols-5" : "md:grid-cols-2"} gap-3 pt-2 border-t border-[var(--color-border)]`}>
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">وضعیت تأیید</label>
            <AvanaSelect
              size="sm"
              value={verifiedStatus}
              onChange={(val) => {
                const selected = typeof val === "string" ? val : val[0];
                if (selected === "all" || selected === "verified" || selected === "unverified") {
                  setVerifiedStatus(selected);
                  setPage(1);
                }
              }}
              options={[
                { value: "all", label: "همه کاربران" },
                { value: "verified", label: "تأیید شده (ایمیل/موبایل)" },
                { value: "unverified", label: "تأیید نشده" },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">برچسب مشتری</label>
            <AvanaSelect
              size="sm"
              value={selectedTagId}
              onChange={(val) => {
                setSelectedTagId(typeof val === "string" ? val : val[0]);
                setPage(1);
              }}
              options={[
                { value: "all", label: "همه برچسب‌ها" },
                ...allTags.map((t) => ({
                  value: t.id,
                  label: t.name,
                })),
              ]}
            />
          </div>

          {isPlatformAdmin && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">سابقه خرید</label>
              <AvanaSelect
                size="sm"
                value={hasPurchases}
                onChange={(val) => {
                  const selected = typeof val === "string" ? val : val[0];
                  if (selected === "all" || selected === "true" || selected === "false") {
                    setHasPurchases(selected);
                    setPage(1);
                  }
                }}
                options={[
                  { value: "all", label: "همه" },
                  { value: "true", label: "دارای خرید موفق" },
                  { value: "false", label: "بدون خرید" },
                ]}
              />
            </div>
          )}

          {isPlatformAdmin && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">حداقل خرید (تومان)</label>
              <input
                type="number"
                value={minSpent}
                onChange={(e) => {
                  setMinSpent(e.target.value);
                  setPage(1);
                }}
                placeholder="مثلاً ۱۰۰,۰۰۰"
                className="w-full min-h-[40px] sm:min-h-[34px] px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
              />
            </div>
          )}

          {isPlatformAdmin && (
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">حداکثر خرید (تومان)</label>
              <input
                type="number"
                value={maxSpent}
                onChange={(e) => {
                  setMaxSpent(e.target.value);
                  setPage(1);
                }}
                placeholder="مثلاً ۱,۰۰۰,۰۰۰"
                className="w-full min-h-[40px] sm:min-h-[34px] px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] focus:outline-none focus:border-[#008080]"
              />
            </div>
          )}
        </div>

        {/* Active Filters Clear */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">فیلترهای فعال روی نتایج اعمال شده‌اند.</span>
            <button
              type="button"
              onClick={clearFilters}
              className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>پاک‌سازی همه فیلترها</span>
            </button>
          </div>
        )}
      </div>

      {/* Content Area: Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-slate-500">در حال دریافت فهرست مشتریان...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-full">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-800">
              خطا در بارگذاری اطلاعات: {(error as any)?.message || "خطای ناشناخته"}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors"
            >
              تلاش مجدد
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4 space-y-3">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-full">
              <UserCheck className="w-8 h-8" />
            </div>
            <p className="text-base font-semibold text-slate-700">مشتری‌ای با این مشخصات یافت نشد</p>
            <p className="text-sm text-slate-400 max-w-sm">
              می‌توانید کلمه جستجو یا فیلترهای اعمال شده را تغییر دهید تا نتایج نمایش داده شوند.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-medium transition-colors"
              >
                پاک‌سازی فیلترها
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">مشتری</th>
                    <th className="py-3.5 px-4 font-semibold">برچسب‌ها</th>
                    <th className="py-3.5 px-4 font-semibold">وضعیت تأیید</th>
                    {isPlatformAdmin && <th className="py-3.5 px-4 font-semibold">سفارش‌ها و خرید</th>}
                    <th className="py-3.5 px-4 font-semibold">آخرین فعالیت</th>
                    <th className="py-3.5 px-4 font-semibold">تاریخ عضویت</th>
                    <th className="py-3.5 px-4 font-semibold text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{c.email}</div>
                        {c.phoneNumber && (
                          <div className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                            {c.phoneNumber}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                          {c.tags.length > 0 ? (
                            c.tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white shadow-2xs"
                                style={{ backgroundColor: t.color || "#6366f1" }}
                              >
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">بدون برچسب</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerForTag(c)}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
                            title="مدیریت برچسب‌های کاربر"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium w-fit ${
                              c.isVerified
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {c.isVerified ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <XCircle className="w-3 h-3 text-amber-600" />
                            )}
                            <span>{c.isVerified ? "تأیید شده" : "تأیید نشده"}</span>
                          </span>
                        </div>
                      </td>

                      {isPlatformAdmin && (
                        <td className="py-4 px-4">
                          <div className="font-semibold text-slate-800">
                            {c.totalPaidAmount !== undefined && c.totalPaidAmount > 0
                              ? formatToman(c.totalPaidAmount)
                              : "بدون پرداخت"}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {toPersianDigits(c.successfulOrdersCount ?? 0)} سفارش موفق
                          </div>
                        </td>
                      )}

                      <td className="py-4 px-4 text-xs text-slate-600">
                        {formatDate(c.lastActiveAt)}
                      </td>

                      <td className="py-4 px-4 text-xs text-slate-500">
                        {formatDate(c.createdAt)}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <Link
                          to={`/admin/crm/customers/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>نمایه ۳۶۰</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {customers.map((c) => (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{c.name}</h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{c.email}</p>
                      {c.phoneNumber && (
                        <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                          {c.phoneNumber}
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/admin/crm/customers/${c.id}`}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>۳۶۰</span>
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.tags.map((t) => (
                      <span
                        key={t.id}
                        className="text-xs px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: t.color || "#6366f1" }}
                      >
                        {t.name}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerForTag(c)}
                      className="text-xs text-slate-500 hover:text-slate-700 p-1 bg-slate-100 rounded-full"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <div>
                      {isPlatformAdmin && c.totalPaidAmount !== undefined ? (
                        <>
                          <span className="text-slate-400 block">مجموع خرید:</span>
                          <span className="font-semibold text-slate-800">
                            {c.totalPaidAmount > 0 ? formatToman(c.totalPaidAmount) : "بدون خرید"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-400 block">تاریخ عضویت:</span>
                          <span className="font-medium text-slate-700">{formatDate(c.createdAt)}</span>
                        </>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block">آخرین فعالیت:</span>
                      <span>{formatDate(c.lastActiveAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                <div>
                  صفحه <span className="font-bold">{toPersianDigits(page)}</span> از{" "}
                  <span className="font-bold">{toPersianDigits(totalPages)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tag Management Modal */}
      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200" dir="rtl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Tag className="w-5 h-5 text-indigo-600" />
                <span>مدیریت برچسب‌های مشتریان</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTagModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create Tag Form (Only platform admin) */}
            {isPlatformAdmin ? (
              <div className="p-4 bg-slate-50 rounded-xl space-y-3 border border-slate-100">
                <div className="text-xs font-semibold text-slate-700">تعریف برچسب جدید</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="نام برچسب (مثلاً VIP)"
                    className="sm:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-10 h-8 p-0.5 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <button
                      type="button"
                      disabled={!newTagName.trim() || createTagMutation.isPending}
                      onClick={() =>
                        createTagMutation.mutate({
                          name: newTagName,
                          color: newTagColor,
                          description: newTagDesc,
                        })
                      }
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                    >
                      {createTagMutation.isPending ? "..." : "افزودن"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl">
                تعریف یا حذف برچسب تنها توسط مدیر ارشد پلتفرم قابل انجام است. کارشناسان پشتیبانی می‌توانند برچسب‌ها را به مشتریان الصاق نمایند.
              </div>
            )}

            {/* Existing Tags List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-500">برچسب‌های موجود:</div>
              {allTags.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">هنوز برچسبی تعریف نشده است.</div>
              ) : (
                allTags.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: t.color || "#6366f1" }}
                      />
                      <span className="text-sm font-medium text-slate-800">{t.name}</span>
                    </div>
                    {isPlatformAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`آیا از حذف برچسب "${t.name}" اطمینان دارید؟`)) {
                            deleteTagMutation.mutate(t.id);
                          }
                        }}
                        className="text-rose-500 hover:text-rose-700 text-xs"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTagModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Tag Assign Modal */}
      {selectedCustomerForTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200" dir="rtl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="text-sm font-bold text-slate-900">الصاق برچسب به مشتری</div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedCustomerForTag.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForTag(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current customer tags */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">برچسب‌های فعلی مشتری:</div>
              <div className="flex flex-wrap gap-2">
                {selectedCustomerForTag.tags.length === 0 ? (
                  <span className="text-xs text-slate-400">برچسبی الصاق نشده است.</span>
                ) : (
                  selectedCustomerForTag.tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-white"
                      style={{ backgroundColor: t.color || "#6366f1" }}
                    >
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          removeTagMutation.mutate({
                            userId: selectedCustomerForTag.id,
                            tagId: t.id,
                          })
                        }
                        className="hover:opacity-75"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Available tags to attach */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500">انتخاب برای الصاق:</div>
              <div className="flex flex-wrap gap-2">
                {allTags
                  .filter((t) => !selectedCustomerForTag.tags.some((ct) => ct.id === t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        assignTagMutation.mutate({
                          userId: selectedCustomerForTag.id,
                          tagId: t.id,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-slate-200 hover:border-indigo-400 transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                      <span>{t.name}</span>
                      <Plus className="w-3 h-3 text-slate-400" />
                    </button>
                  ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCustomerForTag(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium"
              >
                تأیید و بازگشت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
