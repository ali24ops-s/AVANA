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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-teal-400" />
            اشتراک‌های کاربران (User Subscriptions)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مشاهده وضعیت اشتراک‌های سراسری کاربران، تمدیدها و تاریخ انقضا
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/commerce/products"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded-xl text-sm font-medium transition-colors"
          >
            <ShoppingBag className="w-4 h-4 text-teal-400" />
            <span>مدیریت قیمت پلن‌ها</span>
          </Link>

          <button
            onClick={() => setIsGrantModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-teal-900/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>اعطای اشتراک به کاربر</span>
          </button>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا پلن اشتراک..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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
              <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">
                      {sub.userName || sub.userEmail}
                    </span>
                    <span className="text-xs text-slate-400 font-mono mt-0.5">
                      {sub.userEmail}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-200 font-medium block">
                    {sub.productTitle}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                    {sub.plan}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                  {formatPersianDate(sub.startedAt, false)}
                </td>
                <td className="px-6 py-4 text-xs font-medium text-teal-300 whitespace-nowrap">
                  {formatPersianDate(sub.expiresAt)}
                </td>
                <td className="px-6 py-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                  {sub.orderId ? sub.orderId.substring(0, 8) + "..." : "اعطای ادمین"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDrawerUserId(sub.userId)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs"
                      title="مشاهده سوابق مالی کاربر"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>پرونده کاربر</span>
                    </button>
                    {sub.status === "active" && (
                      <button
                        onClick={() => setSelectedSubscriptionToCancel(sub)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-colors flex items-center gap-1 text-xs"
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
