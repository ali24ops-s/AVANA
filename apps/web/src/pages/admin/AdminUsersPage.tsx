import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { Search, ChevronRight, ChevronLeft, ShieldAlert } from "lucide-react";

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 20;

  const [selectedUser, setSelectedUser] = useState<import("../../lib/api/admin.js").AdminUserRecord | null>(null);
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
    onError: (error: any) => {
      console.error(error);
      alert("خطا در بروزرسانی نقش کاربر. کاربر ممکن است عضو هیچ سازمانی نباشد.");
    }
  });

  const handleRoleChangeClick = (user: import("../../lib/api/admin.js").AdminUserRecord) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setIsModalOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: () => adminApi.listUsers(page, pageSize, search),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-200">مدیریت کاربران</h2>
        
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="جستجو با ایمیل یا نام..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-4 pr-10 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
        </div>
      </div>

      <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-800/50 text-slate-400 border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-medium">ایمیل</th>
                <th className="px-6 py-4 font-medium">نام</th>
                <th className="px-6 py-4 font-medium">نقش</th>
                <th className="px-6 py-4 font-medium">وضعیت تأیید</th>
                <th className="px-6 py-4 font-medium">تاریخ عضویت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    در حال بارگذاری...
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    کاربری یافت نشد.
                  </td>
                </tr>
              ) : (
                data?.users.map((user: import("../../lib/api/admin.js").AdminUserRecord) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-slate-200">{user.email}</td>
                    <td className="px-6 py-4 text-slate-300">{user.name || "-"}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleRoleChangeClick(user)}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                        title="تغییر نقش"
                      >
                        {user.role}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {user.emailVerified ? (
                        <span className="text-teal-400">تأیید شده</span>
                      ) : (
                        <span className="text-slate-500">در انتظار</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-slate-800/30">
          <span className="text-sm text-slate-400">
            مجموع: {data?.totalCount || 0} کاربر
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-sm text-slate-300 px-2 py-1">
              صفحه {page} از {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {selectedUser && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" dir="rtl">
            <div className="p-6 border-b border-white/5 space-y-2">
              <h3 className="text-xl font-bold text-white">تغییر نقش کاربر</h3>
              <p className="text-sm text-slate-400">
                در حال تغییر نقش برای کاربر <span className="text-slate-200 font-medium" dir="ltr">{selectedUser.email}</span>
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                <span className="text-sm text-slate-400">نقش فعلی</span>
                <span className="text-sm text-slate-200 bg-slate-700 px-2 py-1 rounded">{selectedUser.role}</span>
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-2">انتخاب نقش جدید</label>
                <select 
                  value={newRole} 
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg p-2.5 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                  <option value="course_editor">course_editor</option>
                  <option value="organization_admin">organization_admin</option>
                  <option value="support_agent">support_agent</option>
                  <option value="platform_admin">platform_admin</option>
                </select>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  تغییر نقش دسترسی‌های کاربر را در کل پلتفرم تحت تأثیر قرار می‌دهد. این تغییر بلافاصله اعمال می‌شود.
                </p>
              </div>
            </div>
            
            <div className="p-4 border-t border-white/5 flex justify-end gap-3 bg-slate-800/50">
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={roleMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                انصراف
              </button>
              <button 
                onClick={() => roleMutation.mutate({ userId: selectedUser.id, role: newRole })}
                disabled={roleMutation.isPending || newRole === selectedUser.role}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {roleMutation.isPending ? "در حال اعمال..." : "تأیید و اعمال"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
