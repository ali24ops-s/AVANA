import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api/admin";
import { AdminSearch, AdminStatusBadge, AdminPagination } from "../../components/admin/AdminUI";
import {
  ChevronDown,
  ChevronLeft,
  Folder,
  FileText,
  Layers,
  BrainCircuit,
  HelpCircle,
  BookOpen,
  Download,
  Upload,
} from "lucide-react";
import { ContentExportModal } from "../../components/admin/content/ContentExportModal";
import { ContentImportModal } from "../../components/admin/content/ContentImportModal";
import { useAuth } from "../../providers/AuthProvider.js";
import { toPersianDigits } from "@avana/domain";

interface DashboardStatsShape {
  totalCourses?: number;
  totalModules?: number;
  totalLessons?: number;
  totalFlashcards?: number;
  totalQuizzes?: number;
  totalDocuments?: number;
  counts?: {
    courses?: number;
    modules?: number;
    lessons?: number;
    flashcards?: number;
    quizzes?: number;
    documents?: number;
  };
}

interface CourseListItem {
  id: string;
  name: string;
  subject?: string;
  counts?: {
    modules?: number;
    lessons?: number;
  };
}

interface LessonHierarchyItem {
  id: string;
  title: string;
  hasContent?: boolean;
  publicationStatus?: string;
  flashcardCount?: number;
  quizCount?: number;
}

interface ModuleHierarchyItem {
  id: string;
  title: string;
  lessons: LessonHierarchyItem[];
}

interface CourseHierarchy {
  modules: ModuleHierarchyItem[];
}

export function AdminContentPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStatsShape | null>(null);
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<DashboardStatsShape>("/admin/dashboard");
      setStats(res);
    } catch {
      // ignore stats error
    }
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = { page, pageSize };
      if (search) params.search = search;
      const res = await api.get<{ courses: CourseListItem[]; totalCount?: number }>(`/admin/courses`, { params });
      setCourses(res.courses || []);
      setTotalCount(res.totalCount ?? res.courses?.length ?? 0);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در دریافت دوره‌ها");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, refreshTrigger]);

  useEffect(() => {
    const delay = search ? 300 : 0;
    const t = setTimeout(fetchCourses, delay);
    return () => clearTimeout(t);
  }, [fetchCourses, search, refreshTrigger]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6 pb-20 text-[var(--color-text)]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">مدیریت محتوا</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">ساختار آموزشی، خروجی و ورود محتوای دوره‌ها</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-subtle)] hover:bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-primary-default)]/40 rounded-xl text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4 text-[var(--color-primary-default)]" />
            <span>خروجی محتوا (Export)</span>
          </button>
          {user?.role !== "content_worker" && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] rounded-xl text-sm font-medium transition-all shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>ورود محتوا (Import)</span>
            </button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={<BookOpen className="w-5 h-5 text-[var(--color-primary-default)]" />} label="دوره‌ها" value={stats.totalCourses !== undefined ? toPersianDigits(stats.totalCourses) : "-"} />
          <StatCard icon={<Layers className="w-5 h-5 text-[var(--color-primary-default)]" />} label="ماژول‌ها" value={stats.totalModules !== undefined ? toPersianDigits(stats.totalModules) : "-"} />
          <StatCard icon={<FileText className="w-5 h-5 text-blue-500" />} label="درس‌ها" value={stats.totalLessons !== undefined ? toPersianDigits(stats.totalLessons) : "-"} />
          <StatCard icon={<BrainCircuit className="w-5 h-5 text-purple-500" />} label="فلش‌کارت‌ها" value={stats.totalFlashcards !== undefined ? toPersianDigits(stats.totalFlashcards) : "-"} />
          <StatCard icon={<HelpCircle className="w-5 h-5 text-amber-500" />} label="آزمون‌ها" value={stats.totalQuizzes !== undefined ? toPersianDigits(stats.totalQuizzes) : "-"} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)] gap-4 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">مرورگر محتوا (Curriculum Explorer)</h2>
        <AdminSearch value={search} onChange={handleSearchChange} placeholder="جستجوی دوره..." />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
            در حال بارگذاری...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
            {error}
          </div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
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

      {!loading && !error && courses.length > 0 && totalPages > 1 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      )}

      <ContentExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        courses={courses}
      />

      <ContentImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={handleRefresh}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function CourseNode({ course, isExpanded, onToggle }: { course: CourseListItem, isExpanded: boolean, onToggle: () => void }) {
  const [hierarchy, setHierarchy] = useState<CourseHierarchy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isExpanded && !hierarchy) {
      setLoading(true);
      api.get<CourseHierarchy>(`/admin/content/courses/${course.id}/hierarchy`)
        .then(res => {
          setHierarchy(res);
          setError(null);
        })
        .catch(err => setError(err.message || "خطا در دریافت ساختار"))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, course.id, hierarchy]);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden transition-all shadow-sm">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] transition-colors text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)]/50"
        aria-expanded={isExpanded}
        aria-controls={`course-content-${course.id}`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg transition-transform ${isExpanded ? "bg-[var(--color-primary-default)]/15 text-[var(--color-primary-default)]" : "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]"}`}>
            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">{course.name}</h3>
            {course.subject && <span className="text-xs text-[var(--color-text-muted)]">{course.subject}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--color-text-muted)] hidden sm:flex">
          <span title="ماژول‌ها"><Layers className="w-4 h-4 inline ms-1"/>{toPersianDigits(course.counts?.modules || 0)}</span>
          <span title="درس‌ها"><FileText className="w-4 h-4 inline ms-1"/>{toPersianDigits(course.counts?.lessons || 0)}</span>
        </div>
      </button>

      {isExpanded && (
        <div id={`course-content-${course.id}`} className="p-4 bg-[var(--color-surface-subtle)] border-t border-[var(--color-border)]">
          {loading ? (
            <div className="text-center py-4 text-sm text-[var(--color-text-muted)]">در حال دریافت ساختار...</div>
          ) : error ? (
            <div className="text-center py-4 text-sm text-rose-500">{error}</div>
          ) : !hierarchy || hierarchy.modules.length === 0 ? (
            <div className="text-center py-4 text-sm text-[var(--color-text-muted)]">محتوایی برای این دوره ثبت نشده است.</div>
          ) : (
            <div className="space-y-4 ps-2 border-s-2 border-[var(--color-border)]">
              {hierarchy.modules.map((mod: ModuleHierarchyItem) => (
                <div key={mod.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-[var(--color-text)] font-medium text-sm">
                    <Folder className="w-4 h-4 text-[var(--color-primary-default)]" />
                    <span>{mod.title}</span>
                  </div>
                  {mod.lessons.length === 0 ? (
                    <div className="ps-6 text-xs text-[var(--color-text-muted)]">بدون درس</div>
                  ) : (
                    <div className="space-y-1.5 ps-4 border-s border-[var(--color-border)]">
                      {mod.lessons.map((lesson: LessonHierarchyItem) => (
                        <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] transition-colors gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className={`w-3.5 h-3.5 ${lesson.hasContent ? 'text-blue-500' : 'text-[var(--color-text-muted)]'}`} />
                            <span className="text-sm text-[var(--color-text)] truncate max-w-[200px] sm:max-w-[300px]">{lesson.title}</span>
                            {!lesson.hasContent && <span className="text-[10px] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">بدون محتوا</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs ps-6 sm:ps-0">
                            <AdminStatusBadge status={lesson.publicationStatus || "published"} />
                            <div className="flex items-center gap-2 text-[var(--color-text-muted)] w-32 justify-end">
                              <span title="فلش‌کارت" className="flex items-center gap-1">
                                <BrainCircuit className={`w-3 h-3 ${lesson.flashcardCount === 0 ? 'opacity-30' : 'text-purple-500'}`} />
                                {lesson.flashcardCount}
                              </span>
                              <span title="آزمون" className="flex items-center gap-1">
                                <HelpCircle className={`w-3 h-3 ${lesson.quizCount === 0 ? 'opacity-30' : 'text-amber-500'}`} />
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
