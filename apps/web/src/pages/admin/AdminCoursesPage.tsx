import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation } from "@tanstack/react-query";
import { Edit2 } from "lucide-react";
import { AdminTable, AdminPagination, AdminSearch, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";

interface CourseRecord {
  id: string;
  name: string;
  subject: string | null;
  createdAt: string;
  counts: {
    modules: number;
    lessons: number;
    flashcards: number;
    quizzes: number;
  };
}

export function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;
  
  const adminApi = useAdmin();
  const [editingCourse, setEditingCourse] = useState<CourseRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subject: "" });
  
  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string, name: string, subject: string }) => {
      return adminApi.updateCourseMetadata(vars.id, { name: vars.name, subject: vars.subject });
    },
    onSuccess: () => {
      setEditingCourse(null);
      // We aren't using react-query for fetching here, but we can just trigger a re-fetch by updating state 
      // or reloading page. Since this is a simple page, let's just update the local state manually.
      setCourses(courses.map(c => c.id === editingCourse?.id ? { ...c, name: editForm.name, subject: editForm.subject } : c));
    },
    onError: (err: any) => {
      alert("خطا در بروزرسانی دوره: " + err.message);
    }
  });

  const handleEditClick = (course: CourseRecord) => {
    setEditingCourse(course);
    setEditForm({ name: course.name, subject: course.subject || "" });
  };

  useEffect(() => {
    let active = true;
    const fetchCourses = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ courses: CourseRecord[]; totalCount: number }>(`/admin/courses`, {
          params: { page, pageSize, search }
        });
        if (active) {
          setCourses(res.courses);
          setTotalCount(res.totalCount);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err.message || "خطا در دریافت دوره‌ها");
      } finally {
        if (active) setLoading(false);
      }
    };

    const delay = setTimeout(fetchCourses, 300);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">دوره‌های آموزشی</h1>
          <p className="text-sm text-slate-400 mt-1">مشاهده و بررسی دوره‌ها و ساختار آن‌ها</p>
        </div>
        <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی دوره..." />
      </div>

      <AdminTable headers={["نام دوره", "موضوع", "ماژول‌ها", "درس‌ها", "فلش‌کارت‌ها", "آزمون‌ها", "تاریخ ایجاد"]}>
        {loading ? (
          <AdminLoadingState colSpan={7} />
        ) : error ? (
          <AdminErrorState message={error} colSpan={7} />
        ) : courses.length === 0 ? (
          <AdminEmptyState message="دوره‌ای یافت نشد." />
        ) : (
          courses.map(course => (
            <tr key={course.id} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 flex items-center gap-2">
                {course.name}
                <button 
                  onClick={() => handleEditClick(course)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="ویرایش دوره"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </td>
              <td className="px-6 py-4 text-slate-400">{course.subject || "-"}</td>
              <td className="px-6 py-4">{course.counts.modules}</td>
              <td className="px-6 py-4">{course.counts.lessons}</td>
              <td className="px-6 py-4">{course.counts.flashcards}</td>
              <td className="px-6 py-4">{course.counts.quizzes}</td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(course.createdAt).toLocaleDateString("fa-IR")}</td>
            </tr>
          ))
        )}
      </AdminTable>
      
      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
            <h3 className="text-xl font-bold text-white mb-6">ویرایش دوره</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-slate-300 mb-2">نام دوره</label>
                <input 
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">موضوع</label>
                <input 
                  type="text"
                  value={editForm.subject}
                  onChange={(e) => setEditForm({...editForm, subject: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg p-2"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingCourse(null)}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              >
                انصراف
              </button>
              <button 
                onClick={() => updateMutation.mutate({ id: editingCourse.id, name: editForm.name, subject: editForm.subject })}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
            </div>
          </div>
        </div>
      )}
      <AdminPagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
