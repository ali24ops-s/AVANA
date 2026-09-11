import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { Search, ChevronRight, ChevronLeft, ShieldAlert, UserX, AlertCircle, Loader2, CreditCard, Laptop } from "lucide-react";
import type { AdminUserRecord } from "../../lib/api/admin.js";
import { UserCommerceDrawer } from "../../components/admin/commerce/UserCommerceDrawer.js";
import { UserDevicesDrawer } from "../../components/admin/devices/UserDevicesDrawer.js";

const ROLES = [
  { value: "all", label: "همه نقش‌ها" },
  { value: "student", label: "دانش‌آموز" },
  { value: "teacher", label: "معلم" },
  { value: "course_editor", label: "ویرایشگر دوره" },
  { value: "organization_admin", label: "مدیر سازمان" },
  { value: "support_agent", label: "پشتیبان" },
  { value: "platform_admin", label: "مدیر پلتفرم" },
];

const STATUSES = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "active", label: "تأیید شده" },
  { value: "inactive", label: "در انتظار تأیید" },
];

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const pageSize = 20;

  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRole, setNewRole] = useState("student");
  const [selectedCommerceUserId, setSelectedCommerceUserId] = useState<string | null>(null);
  const [selectedDeviceUserId, setSelectedDeviceUserId] = useState<string | null>(null);
  
  const roleMutation = useMutation({
    mutationFn: async (vars: { userId: string, role: string }) => {
      return adminApi.updateUserRole(vars.userId, vars.role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setIsModalOpen(false);
    },
    onError: () => {
      alert("خطا در بروزرسانی نقش کاربر. لطفاً مجدداً تلاش کنید.");
    }
  });

  const handleRoleChangeClick = (user: AdminUserRecord) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setIsModalOpen(true);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "users", page, search, roleFilter, statusFilter],
    queryFn: () => adminApi.listUsers(page, pageSize, search, roleFilter === "all" ? undefined : roleFilter, statusFilter === "all" ? undefined : statusFilter),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 1;

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const hasActiveFilters = search || roleFilter !== "all" || statusFilter !== "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">مدیریت کاربران</h1>
        <p className="text-sm text-[var(--color-text-muted)]">جستجو، فیلتر و مدیریت نقش کاربران پلتفرم</p>
      </div>
      
      {/* Search & Filters */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا نام..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جستجوی کاربران"
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors placeholder:text-[var(--color-text-muted)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-3.5" aria-hidden="true" />
        </div>
        
        <div className="flex flex-wrap sm:flex-nowrap gap-3">
          <div className="w-full sm:w-40">
            <select
              aria-label="فیلتر بر اساس نقش"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          
          <div className="w-full sm:w-40">
            <select
              aria-label="فیلتر بر اساس وضعیت"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              aria-label="پاک کردن فیلترها"
              className="px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              پاک کردن
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden bg-[var(--color-surface)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-6 py-4 font-medium whitespace-nowrap">کاربر</th>
                <th className="px-6 py-4 font-medium">نقش</th>
                <th className="px-6 py-4 font-medium">وضعیت</th>
                <th className="px-6 py-4 font-medium hidden sm:table-cell">تاریخ عضویت</th>
                <th className="px-6 py-4 font-medium w-40 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
                      <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
                      <p>در حال بارگذاری کاربران...</p>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-red-500">
                      <AlertCircle className="w-8 h-8 opacity-80" />
                      <p>خطا در دریافت لیست کاربران.</p>
                      <button onClick={() => setPage(1)} className="mt-2 text-sm text-[var(--color-text)] underline hover:text-[var(--color-primary-default)] cursor-pointer">تلاش مجدد</button>
                    </div>
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-[var(--color-text-muted)]">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <UserX className="w-10 h-10 opacity-30" />
                      <p className="text-base font-medium text-[var(--color-text)]">کاربری یافت نشد</p>
                      {hasActiveFilters && (
                        <p className="text-sm opacity-80">هیچ کاربری با فیلترهای فعلی مطابقت ندارد.</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                data?.users.map((user: AdminUserRecord) => (
                  <tr key={user.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[var(--color-text)] font-medium" dir="ltr">{user.email}</span>
                        {user.name && <span className="text-xs text-[var(--color-text-muted)] mt-1">{user.name}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)]">
                        {ROLES.find(r => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          تأیید شده
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)] text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]"></span>
                          در انتظار
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--color-text-muted)] text-xs hidden sm:table-cell">
                      {new Date(user.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedCommerceUserId(user.id)}
                          className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="سوابق مالی و دسترسی"
                          aria-label={`سوابق مالی کاربر ${user.email}`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>مالی</span>
                        </button>
                        <button
                          onClick={() => setSelectedDeviceUserId(user.id)}
                          className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="مدیریت دستگاه‌ها و سشن‌ها"
                          aria-label={`دستگاه‌های کاربر ${user.email}`}
                        >
                          <Laptop className="w-3.5 h-3.5" />
                          <span>دستگاه‌ها</span>
                        </button>
                        <button 
                          onClick={() => handleRoleChangeClick(user)}
                          className="text-xs font-medium text-[var(--color-primary-default)] hover:text-[var(--color-primary-dark)] bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                          title="تغییر نقش"
                          aria-label={`تغییر نقش کاربر ${user.email}`}
                        >
                          ویرایش نقش
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] gap-4">
          <span className="text-sm text-[var(--color-text-muted)]">
            مجموع: {data?.totalCount || 0} کاربر
          </span>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="صفحه قبل"
                className="p-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <span className="text-sm text-[var(--color-text)] px-3 font-medium min-w-[5rem] text-center" aria-current="page">
                {page} / {totalPages}
              </span>
              
              <button
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="صفحه بعد"
                className="p-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-50 hover:bg-[var(--color-surface-muted)] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* User Commerce Drawer */}
      <UserCommerceDrawer
        isOpen={Boolean(selectedCommerceUserId)}
        userId={selectedCommerceUserId}
        onClose={() => setSelectedCommerceUserId(null)}
      />

      {/* User Devices Drawer */}
      <UserDevicesDrawer
        isOpen={Boolean(selectedDeviceUserId)}
        userId={selectedDeviceUserId}
        onClose={() => setSelectedDeviceUserId(null)}
      />

      {/* Role Change Modal */}
      {selectedUser && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden" dir="rtl">
            <div className="p-6 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-2">
              <h3 id="modal-title" className="text-xl font-bold text-[var(--color-text)]">تغییر نقش کاربر</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                در حال تغییر نقش برای <span className="text-[var(--color-text)] font-medium break-all" dir="ltr">{selectedUser.email}</span>
              </p>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center bg-[var(--color-surface-warm)] p-3.5 rounded-xl border border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text-muted)]">نقش فعلی</span>
                <span className="text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1 rounded-md">
                  {ROLES.find(r => r.value === selectedUser.role)?.label || selectedUser.role}
                </span>
              </div>
              
              <div>
                <label htmlFor="newRoleSelect" className="block text-sm font-medium text-[var(--color-text)] mb-2">انتخاب نقش جدید</label>
                <select 
                  id="newRoleSelect"
                  value={newRole} 
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-sm rounded-xl p-3 focus:ring-1 focus:ring-[var(--color-primary-default)] focus:border-[var(--color-primary-default)] transition-shadow outline-none"
                >
                  {ROLES.filter(r => r.value !== "all").map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-amber-700 dark:text-amber-200/90 leading-relaxed font-medium">
                  تغییر نقش، دسترسی‌های کاربر را در کل پلتفرم تحت تأثیر قرار می‌دهد. این تغییر بلافاصله اعمال می‌شود.
                </p>
              </div>
            </div>
            
            <div className="p-5 border-t border-[var(--color-border)] flex justify-end gap-3 bg-[var(--color-surface-warm)]">
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={roleMutation.isPending}
                className="px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button 
                onClick={() => roleMutation.mutate({ userId: selectedUser.id, role: newRole })}
                disabled={roleMutation.isPending || newRole === selectedUser.role}
                className="px-5 py-2.5 text-sm font-medium text-[var(--color-primary-contrast)] bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              >
                {roleMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {roleMutation.isPending ? "در حال اعمال..." : "تأیید و اعمال"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
