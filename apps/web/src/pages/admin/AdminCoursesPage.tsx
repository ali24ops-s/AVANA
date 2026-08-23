import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { Search, ChevronRight, ChevronLeft, BookOpen, AlertCircle, Loader2, Edit2, Layers, FileText, BrainCircuit, HelpCircle } from "lucide-react";
import type { AdminCourseRecord } from "../../lib/api/admin.js";

export function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const adminApi = useAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  
  const pageSize = 20;

  const [editingCourse, setEditingCourse] = useState<AdminCourseRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subject: "" });
  
  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string, name: string, subject: string }) => {
      return adminApi.updateCourseMetadata(vars.id, { name: vars.name, subject: vars.subject });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      setEditingCourse(null);
    },
    onError: (err: any) => {
      console.error(err);
      alert("خطا در بروزرسانی دوره: " + err.message);
    }
  });

  const handleEditClick = (course: AdminCourseRecord) => {
    setEditingCourse(course);
    setEditForm({ name: course.name, subject: course.subject || "" });
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "courses", page, search],
    queryFn: () => adminApi.listCourses(page, pageSize, search),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1;

  const clearFilters = () => {
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = !!search;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-200">دوره‌های آموزشی</h1>
        <p className="text-sm text-slate-400">جستجو، بررسی ساختار و مدیریت اطلاعات دوره‌های پلتفرم</p>
      </div>
      
      {/* Search & Filters */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="جستجوی دوره بر اساس نام..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="جستجوی دوره‌ها"
            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors placeholder:text-slate-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3.5" aria-hidden="true" />
        </div>
        
        <div className="flex flex-wrap sm:flex-nowrap gap-3">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              aria-label="پاک کردن فیلترها"
              className="px-4 py-2.5 text-sm font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap"
            >
              پاک کردن جستجو
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
                <th className="px-6 py-4 font-medium whitespace-nowrap w-2/5">مشخصات دوره</th>
                <th className="px-4 py-4 font-medium text-center hidden md:table-cell">ساختار محتوا</th>
                <th className="px-6 py-4 font-medium hidden sm:table-cell text-center">تاریخ ایجاد</th>
                <th className="px-6 py-4 font-medium w-24 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                      <p>در حال بارگذاری دوره‌ها...</p>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-red-400">
                      <AlertCircle className="w-8 h-8 opacity-80" />
                      <p>خطا در دریافت لیست دوره‌ها.</p>
                      <button onClick={() => setPage(1)} className="mt-2 text-sm text-slate-300 underline hover:text-white">تلاش مجدد</button>
                    </div>
                  </td>
                </tr>
              ) : data?.courses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <BookOpen className="w-10 h-10 opacity-30" />
                      <p className="text-base font-medium">دوره‌ای یافت نشد</p>
                      {hasActiveFilters && (
                        <p className="text-sm opacity-80">هیچ دوره‌ای با کلمه جستجو شده مطابقت ندارد.</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                data?.courses.map((course: AdminCourseRecord) => (
                  <tr key={course.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-200 font-medium text-base">{course.name}</span>
                        {course.subject ? (
                          <span className="inline-flex w-fit px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            {course.subject}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2 md:hidden">
                          <span className="text-xs text-slate-400" title="ماژول‌ها"><Layers className="w-3 h-3 inline mr-1" /> {course.counts.modules}</span>
                          <span className="text-xs text-slate-400" title="درس‌ها"><FileText className="w-3 h-3 inline mr-1" /> {course.counts.lessons}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <div className="flex flex-wrap items-center justify-center gap-2 max-w-[300px] mx-auto">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-white/5 text-slate-300" title="تعداد ماژول‌ها">
                          <Layers className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs font-medium">{course.counts.modules}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-white/5 text-slate-300" title="تعداد درس‌ها">
                          <FileText className="w-3.5 h-3.5 text-teal-400" />
                          <span className="text-xs font-medium">{course.counts.lessons}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-white/5 text-slate-300" title="تعداد فلش‌کارت‌ها">
                          <BrainCircuit className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs font-medium">{course.counts.flashcards}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-white/5 text-slate-300" title="تعداد آزمون‌ها">
                          <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-medium">{course.counts.quizzes}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs hidden sm:table-cell text-center">
                      <div className="flex flex-col" dir="ltr">
                        {new Date(course.createdAt).toLocaleDateString("fa-IR")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => handleEditClick(course)}
                        className="text-xs font-medium text-teal-400 hover:text-teal-300 bg-teal-400/10 hover:bg-teal-400/20 px-3 py-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                        title="ویرایش دوره"
                        aria-label={`ویرایش دوره ${course.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        ویرایش
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
            مجموع: {data?.totalCount || 0} دوره
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

      {/* Edit Course Modal */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" dir="rtl">
            <div className="p-6 border-b border-white/5 space-y-2">
              <h3 id="modal-title" className="text-xl font-bold text-white">ویرایش مشخصات دوره</h3>
              <p className="text-sm text-slate-400">
                در حال ویرایش اطلاعات <span className="text-slate-200 font-medium">{editingCourse.name}</span>
              </p>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label htmlFor="courseName" className="block text-sm font-medium text-slate-300 mb-2">نام دوره</label>
                <input 
                  id="courseName"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-xl p-3 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-shadow outline-none"
                  placeholder="نام دوره را وارد کنید..."
                />
              </div>
              <div>
                <label htmlFor="courseSubject" className="block text-sm font-medium text-slate-300 mb-2">موضوع (اختیاری)</label>
                <input 
                  id="courseSubject"
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({...editForm, subject: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-xl p-3 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-shadow outline-none"
                  placeholder="موضوع دوره را وارد کنید..."
                />
              </div>
            </div>
            
            <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-slate-800/30">
              <button 
                onClick={() => setEditingCourse(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors"
              >
                انصراف
              </button>
              <button 
                onClick={() => updateMutation.mutate({ id: editingCourse.id, name: editForm.name, subject: editForm.subject })}
                disabled={updateMutation.isPending || !editForm.name.trim()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-teal-500/20 active:scale-95"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {updateMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
