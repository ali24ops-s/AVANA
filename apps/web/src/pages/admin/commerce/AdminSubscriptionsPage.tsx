import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  Search,
  Filter,
  User,
  PlusCircle,
  ShieldOff,
  ShoppingBag,
} from "lucide-react";
import type { AdminSubscriptionRecord } from "../../../lib/api/admin.js";
import {
  formatPersianDate,
  getSubscriptionStatusBadge,
} from "../../../components/admin/commerce/commerceUtils.js";
import {
  AdminTable,
  AdminPagination,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { UserCommerceDrawer } from "../../../components/admin/commerce/UserCommerceDrawer.js";
import { AdminGrantModal } from "../../../components/admin/commerce/AdminGrantModal.js";
import { AdminCancelSubscriptionModal } from "../../../components/admin/commerce/AdminCancelSubscriptionModal.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminSubscriptionsPage() {
  const adminApi = useAdmin();

  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDrawerUserId, setSelectedDrawerUserId] = useState<string | null>(null);
  const [selectedSubscriptionToCancel, setSelectedSubscriptionToCancel] = useState<AdminSubscriptionRecord | null>(null);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState<boolean>(false);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceSubscriptions({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setSubscriptions(res.subscriptions);
      setTotalCount(res.totalCount);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در دریافت لیست اشتراک‌ها";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubscriptions();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="اشتراک‌های کاربران"
        badge={{
          text: "اشتراک و دسترسی کاربران",
          icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مشاهده وضعیت اشتراک‌های سراسری کاربران، تمدیدها و تاریخ انقضا"
        actions={
          <>
            <Link
              to="/admin/commerce/products"
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] border border-[var(--color-border)] rounded-xl text-sm font-medium transition-colors"
            >
              <ShoppingBag className="w-4 h-4 text-[var(--color-primary-default)]" />
              <span>مدیریت قیمت پلن‌ها</span>
            </Link>

            <button
              onClick={() => setIsGrantModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>اعطای اشتراک به کاربر</span>
            </button>
          </>
        }
      />

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80 flex items-center">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا پلن اشتراک..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="active">اشتراک فعال (Active)</option>
            <option value="expired">منقضی شده (Expired)</option>
            <option value="cancelled">لغو شده (Cancelled)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "کاربر",
          "پلن اشتراک",
          "وضعیت",
          "تاریخ شروع",
          "تاریخ انقضا",
          "سفارش مرتبط",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={7} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={7} message={errorMsg} />
        ) : subscriptions.length === 0 ? (
          <AdminEmptyState message="هیچ اشتراکی مطابق با فیلتر یافت نشد." />
        ) : (
          subscriptions.map((sub) => {
            const statusBadge = getSubscriptionStatusBadge(sub.status);

            return (
              <tr key={sub.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className="font-semibold text-[var(--color-text)] font-mono text-xs truncate max-w-[180px]"
                      title={sub.userName ? `${sub.userEmail} (${sub.userName})` : sub.userEmail}
                      dir="ltr"
                    >
                      {sub.userEmail || sub.userName}
                    </span>
                    {sub.userName && sub.userName !== sub.userEmail && (
                      <span
                        className="text-[var(--color-text-muted)] text-[11px] truncate max-w-[120px]"
                        title={sub.userName}
                      >
                        {sub.userName}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs font-bold text-[var(--color-text)] truncate max-w-[200px] block" title={sub.plan ? `${sub.productTitle} (${sub.plan})` : sub.productTitle}>
                    {sub.productTitle}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {formatPersianDate(sub.startedAt, false)}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-[var(--color-primary-default)] whitespace-nowrap">
                  {formatPersianDate(sub.expiresAt)}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">
                  {sub.orderId ? sub.orderId.substring(0, 8) : "اعطای ادمین"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedDrawerUserId(sub.userId)}
                      className="p-1.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs cursor-pointer"
                      title="مشاهده سوابق مالی کاربر"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>کاربر</span>
                    </button>
                    {sub.status === "active" && (
                      <button
                        onClick={() => setSelectedSubscriptionToCancel(sub)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border border-rose-500/20 transition-colors flex items-center gap-1 text-xs cursor-pointer"
                        title="لغو فوری اشتراک کاربر"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        <span>لغو اشتراک</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {/* Pagination */}
      {!isLoading && !errorMsg && totalCount > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      )}

      {/* Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedDrawerUserId)}
        userId={selectedDrawerUserId}
        onClose={() => setSelectedDrawerUserId(null)}
      />

      {/* Grant Modal */}
      <AdminGrantModal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        onSuccess={() => {
          fetchSubscriptions();
        }}
      />

      {/* Cancel Subscription Modal */}
      {selectedSubscriptionToCancel && (
        <AdminCancelSubscriptionModal
          isOpen={Boolean(selectedSubscriptionToCancel)}
          subscription={selectedSubscriptionToCancel}
          onClose={() => setSelectedSubscriptionToCancel(null)}
          onSuccess={() => {
            fetchSubscriptions();
          }}
        />
      )}
    </div>
  );
}
