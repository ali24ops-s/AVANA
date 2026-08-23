import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminSearch, AdminStatusBadge } from "../../components/admin/AdminUI";
import { ChevronDown, ChevronLeft, Folder, FileText, Layers, BrainCircuit, HelpCircle, BookOpen } from "lucide-react";

export function AdminContentPage() {
  const [stats, setStats] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const res = await api.get<any>("/admin/dashboard");
        if (active) setStats(res);
      } catch (err: any) {
        // ignore stats error
      }
    };
    fetchStats();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchCourses = async () => {
      setLoading(true);
      try {
        const params = search ? { search } : {};
        // Fetch up to 100 courses for curriculum explorer
        const res = await api.get<{ courses: any[] }>(`/admin/courses`, { params: { ...params, pageSize: 100 } });
        if (active) {
          setCourses(res.courses || []);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err.message || "خطا در دریافت دوره‌ها");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(fetchCourses, 300);
    return () => { active = false; clearTimeout(t); };
  }, [search]);

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">مدیریت محتوا</h1>
        <p className="text-sm text-slate-400 mt-1">ساختار آموزشی و وضعیت محتوای دوره‌ها</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={<BookOpen className="w-5 h-5" />} label="دوره‌ها" value={stats.totalCourses} />
          <StatCard icon={<Layers className="w-5 h-5" />} label="ماژول‌ها" value={stats.totalModules || "-"} />
          <StatCard icon={<FileText className="w-5 h-5" />} label="درس‌ها" value={stats.totalLessons} />
          <StatCard icon={<BrainCircuit className="w-5 h-5" />} label="فلش‌کارت‌ها" value={stats.totalFlashcards} />
          <StatCard icon={<HelpCircle className="w-5 h-5" />} label="آزمون‌ها" value={stats.totalQuizzes} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-800/30 p-4 rounded-2xl border border-white/5 gap-4">
        <h2 className="text-lg font-semibold text-slate-200">مرورگر محتوا (Curriculum Explorer)</h2>
        <AdminSearch value={search} onChange={setSearch} placeholder="جستجوی دوره..." />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-white/5">
            در حال بارگذاری...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 bg-slate-900/50 rounded-2xl border border-white/5">
            {error}
          </div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-white/5">
            دوره‌ای یافت نشد.
          </div>
        ) : (
          courses.map(course => (
            <CourseNode 
              key={course.id} 
              course={course} 
              isExpanded={expandedCourse === course.id}
              onToggle={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function CourseNode({ course, isExpanded, onToggle }: { course: any, isExpanded: boolean, onToggle: () => void }) {
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isExpanded && !hierarchy) {
      setLoading(true);
      api.get<any>(`/admin/content/courses/${course.id}/hierarchy`)
        .then(res => {
          setHierarchy(res);
          setError(null);
        })
        .catch(err => setError(err.message || "خطا در دریافت ساختار"))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, course.id, hierarchy]);

  return (
    <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden transition-all">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800/80 transition-colors text-right focus:outline-none focus:ring-2 focus:ring-teal-500/50"
        aria-expanded={isExpanded}
        aria-controls={`course-content-${course.id}`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg transition-transform ${isExpanded ? "bg-teal-500/20 text-teal-400" : "bg-slate-700 text-slate-400"}`}>
            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">{course.name}</h3>
            {course.subject && <span className="text-xs text-slate-500">{course.subject}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400 hidden sm:flex">
          <span title="ماژول‌ها"><Layers className="w-4 h-4 inline ml-1"/>{course.counts?.modules || 0}</span>
          <span title="درس‌ها"><FileText className="w-4 h-4 inline ml-1"/>{course.counts?.lessons || 0}</span>
        </div>
      </button>

      {isExpanded && (
        <div id={`course-content-${course.id}`} className="p-4 bg-slate-900/30 border-t border-white/5">
          {loading ? (
            <div className="text-center py-4 text-sm text-slate-400">در حال دریافت ساختار...</div>
          ) : error ? (
            <div className="text-center py-4 text-sm text-red-400">{error}</div>
          ) : !hierarchy || hierarchy.modules.length === 0 ? (
            <div className="text-center py-4 text-sm text-slate-500">محتوایی برای این دوره ثبت نشده است.</div>
          ) : (
            <div className="space-y-4 pr-2 border-r-2 border-slate-700/50">
              {hierarchy.modules.map((mod: any) => (
                <div key={mod.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                    <Folder className="w-4 h-4 text-teal-500" />
                    <span>{mod.title}</span>
                  </div>
                  {mod.lessons.length === 0 ? (
                    <div className="pr-6 text-xs text-slate-500">بدون درس</div>
                  ) : (
                    <div className="space-y-1.5 pr-4 border-r border-slate-700/30">
                      {mod.lessons.map((lesson: any) => (
                        <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className={`w-3.5 h-3.5 ${lesson.hasContent ? 'text-blue-400' : 'text-slate-500'}`} />
                            <span className="text-sm text-slate-300 truncate max-w-[200px] sm:max-w-[300px]">{lesson.title}</span>
                            {!lesson.hasContent && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">بدون محتوا</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs pr-6 sm:pr-0">
                            <AdminStatusBadge status={lesson.publicationStatus} />
                            <div className="flex items-center gap-2 text-slate-400 w-32 justify-end">
                              <span title="فلش‌کارت" className="flex items-center gap-1">
                                <BrainCircuit className={`w-3 h-3 ${lesson.flashcardCount === 0 ? 'opacity-30' : 'text-purple-400'}`} />
                                {lesson.flashcardCount}
                              </span>
                              <span title="آزمون" className="flex items-center gap-1">
                                <HelpCircle className={`w-3 h-3 ${lesson.quizCount === 0 ? 'opacity-30' : 'text-orange-400'}`} />
                                {lesson.quizCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
