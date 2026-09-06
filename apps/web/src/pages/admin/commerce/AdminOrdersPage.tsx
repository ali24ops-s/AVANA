import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Receipt,
  Search,
  Filter,
  User,
} from "lucide-react";
import type { AdminOrderRecord } from "../../../lib/api/admin.js";
import {
  formatToman,
  formatPersianDate,
  getOrderStatusBadge,
  getPaymentStatusBadge,
} from "../../../components/admin/commerce/commerceUtils.js";
import {
  AdminTable,
  AdminPagination,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { UserCommerceDrawer } from "../../../components/admin/commerce/UserCommerceDrawer.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";

export function AdminOrdersPage() {
  const adminApi = useAdmin();

  const [orders, setOrders] = useState<AdminOrderRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDrawerUserId, setSelectedDrawerUserId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceOrders({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setOrders(res.orders);
      setTotalCount(res.totalCount);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در بارگذاری لیست سفارش‌ها");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-blue-400" />
            مدیریت سفارش‌ها (Orders)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            سفارش‌های ثبت شده برای خرید اشتراک‌ها، دوره‌ها و بسته‌های آموزشی
          </p>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجو با شماره سفارش، ایمیل یا نام محصول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
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
              <option value="paid">پرداخت شده (Paid)</option>
              <option value="pending">در انتظار (Pending)</option>
              <option value="failed">ناموفق (Failed)</option>
              <option value="cancelled">لغو شده (Cancelled)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "شماره سفارش",
          "کاربر خریدار",
          "محصول",
          "مبلغ (تومان)",
          "وضعیت سفارش",
          "وضعیت پرداخت",
          "تاریخ ثبت",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={8} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={8} message={errorMsg} />
        ) : orders.length === 0 ? (
          <AdminEmptyState message="هیچ سفارشی مطابق با فیلتر یافت نشد." />
        ) : (
          orders.map((order) => {
            const orderBadge = getOrderStatusBadge(order.status);
            const payBadge = order.paymentStatus
              ? getPaymentStatusBadge(order.paymentStatus)
              : null;

            return (
              <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-300 font-semibold">
                  {order.orderNumber}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200">
                      {order.userName || order.userEmail}
                    </span>
                    <span className="text-xs text-slate-400 font-mono mt-0.5">
                      {order.userEmail}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-200 font-medium block">
                    {order.productTitle}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {order.productType === "subscription"
                      ? "اشتراک سراسری"
                      : order.productType === "course"
                      ? "دوره آموزشی"
                      : "بسته محتوایی"}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-teal-400 whitespace-nowrap">
                  {formatToman(order.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${orderBadge.className}`}>
                    {orderBadge.label}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {payBadge ? (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${payBadge.className}`}>
                      {payBadge.label} {order.paymentGateway ? `(${order.paymentGateway})` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                  {formatPersianDate(order.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedDrawerUserId(order.userId)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1 text-xs"
                    title="مشاهده سوابق مالی کاربر"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>پرونده کاربر</span>
                  </button>
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
    </div>
  );
}
