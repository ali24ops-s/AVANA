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
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در دریافت لیست اشتراک‌ها");
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-[var(--color-primary-default)]" />
            اشتراک‌های کاربران (User Subscriptions)
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            مشاهده وضعیت اشتراک‌های سراسری کاربران، تمدیدها و تاریخ انقضا
          </p>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا پلن اشتراک..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-3.5" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)]"
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
          "کاربر مشترک",
          "پلن اشتراک",
          "وضعیت",
          "تاریخ شروع",
          "تاریخ انقضا",
          "شناسه سفارش مرتبط",
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
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {sub.userName || sub.userEmail}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
                      {sub.userEmail}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[var(--color-text)] font-medium block">
                    {sub.productTitle}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] font-mono block mt-0.5">
                    {sub.plan}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {formatPersianDate(sub.startedAt, false)}
                </td>
                <td className="px-6 py-4 text-xs font-medium text-[var(--color-primary-default)] whitespace-nowrap">
                  {formatPersianDate(sub.expiresAt)}
                </td>
                <td className="px-6 py-4 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">
                  {sub.orderId ? sub.orderId.substring(0, 8) + "..." : "اعطای ادمین"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDrawerUserId(sub.userId)}
                      className="p-1.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs"
                      title="مشاهده سوابق مالی کاربر"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>پرونده کاربر</span>
                    </button>
                    {sub.status === "active" && (
                      <button
                        onClick={() => setSelectedSubscriptionToCancel(sub)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border border-rose-500/20 transition-colors flex items-center gap-1 text-xs"
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
