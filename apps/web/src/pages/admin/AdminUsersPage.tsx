import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { Search, ChevronRight, ChevronLeft, ShieldAlert, UserX, AlertCircle, Loader2 } from "lucide-react";
import type { AdminUserRecord } from "../../lib/api/admin.js";

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
        <h1 className="text-2xl font-bold text-slate-200">مدیریت کاربران</h1>
        <p className="text-sm text-slate-400">جستجو، فیلتر و مدیریت نقش کاربران پلتفرم</p>
      </div>
      
      {/* Search & Filters */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
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
            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors placeholder:text-slate-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3.5" aria-hidden="true" />
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
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-teal-500 transition-colors"
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
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-teal-500 transition-colors"
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
              className="px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap"
            >
              پاک کردن
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-800/50 text-slate-400 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-medium whitespace-nowrap">کاربر</th>
                <th className="px-6 py-4 font-medium">نقش</th>
                <th className="px-6 py-4 font-medium">وضعیت</th>
                <th className="px-6 py-4 font-medium hidden sm:table-cell">تاریخ عضویت</th>
                <th className="px-6 py-4 font-medium w-24 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                      <p>در حال بارگذاری کاربران...</p>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-red-400">
                      <AlertCircle className="w-8 h-8 opacity-80" />
                      <p>خطا در دریافت لیست کاربران.</p>
                      <button onClick={() => setPage(1)} className="mt-2 text-sm text-slate-300 underline hover:text-white">تلاش مجدد</button>
                    </div>
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <UserX className="w-10 h-10 opacity-30" />
                      <p className="text-base font-medium">کاربری یافت نشد</p>
                      {hasActiveFilters && (
                        <p className="text-sm opacity-80">هیچ کاربری با فیلترهای فعلی مطابقت ندارد.</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                data?.users.map((user: AdminUserRecord) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-medium" dir="ltr">{user.email}</span>
                        {user.name && <span className="text-xs text-slate-400 mt-1">{user.name}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {ROLES.find(r => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.emailVerified ? (
                        <span className="inline-flex items-center gap-1.5 text-teal-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                          تأیید شده
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          در انتظار
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs hidden sm:table-cell">
                      {new Date(user.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => handleRoleChangeClick(user)}
                        className="text-xs font-medium text-teal-400 hover:text-teal-300 bg-teal-400/10 hover:bg-teal-400/20 px-3 py-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                        title="تغییر نقش"
                        aria-label={`تغییر نقش کاربر ${user.email}`}
                      >
                        ویرایش نقش
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-white/5 bg-slate-800/30 gap-4">
          <span className="text-sm text-slate-400">
            مجموع: {data?.totalCount || 0} کاربر
          </span>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="صفحه قبل"
                className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <span className="text-sm text-slate-300 px-3 font-medium min-w-[5rem] text-center" aria-current="page">
                {page} / {totalPages}
              </span>
              
              <button
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="صفحه بعد"
                className="p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Role Change Modal */}
      {selectedUser && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" dir="rtl">
            <div className="p-6 border-b border-white/5 space-y-2">
              <h3 id="modal-title" className="text-xl font-bold text-white">تغییر نقش کاربر</h3>
              <p className="text-sm text-slate-400">
                در حال تغییر نقش برای <span className="text-slate-200 font-medium break-all" dir="ltr">{selectedUser.email}</span>
              </p>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/50">
                <span className="text-sm text-slate-400">نقش فعلی</span>
                <span className="text-sm font-medium text-slate-200 bg-slate-700 px-2.5 py-1 rounded-md">
                  {ROLES.find(r => r.value === selectedUser.role)?.label || selectedUser.role}
                </span>
              </div>
              
              <div>
                <label htmlFor="newRoleSelect" className="block text-sm font-medium text-slate-300 mb-2">انتخاب نقش جدید</label>
                <select 
                  id="newRoleSelect"
                  value={newRole} 
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-xl p-3 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-shadow outline-none"
                >
                  {ROLES.filter(r => r.value !== "all").map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 items-start">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                  تغییر نقش، دسترسی‌های کاربر را در کل پلتفرم تحت تأثیر قرار می‌دهد. این تغییر بلافاصله اعمال می‌شود.
                </p>
              </div>
            </div>
            
            <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-slate-800/30">
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={roleMutation.isPending}
                className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button 
                onClick={() => roleMutation.mutate({ userId: selectedUser.id, role: newRole })}
                disabled={roleMutation.isPending || newRole === selectedUser.role}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-teal-500/20 active:scale-95"
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
