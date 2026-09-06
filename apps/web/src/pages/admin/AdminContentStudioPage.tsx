import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Sparkles,
  BookOpen,
  Plus,
  Layers,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShoppingBag,
  Send,
  Archive,
  RefreshCw,
  Eye,
  Loader2,
  FileCheck,
  ShieldCheck,
  X,
  ChevronLeft,
} from "lucide-react";
import type {
  OfficialCourse,
  OfficialReviewWorkspace,
  ConsistencyValidationReport,
} from "../../lib/api/admin.js";
import { OfficialProductionWorkspace } from "../../components/admin/studio/OfficialProductionWorkspace.js";

export function AdminContentStudioPage() {
  const { courseId: routeCourseId } = useParams<{ courseId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCourseId = routeCourseId || searchParams.get("courseId");

  const [courses, setCourses] = useState<OfficialCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseSubject, setNewCourseSubject] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Review Modal state (for catalog quick-action)
  const [selectedCourseForReview, setSelectedCourseForReview] = useState<string | null>(null);
  const [reviewWorkspace, setReviewWorkspace] = useState<OfficialReviewWorkspace | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  // Pricing & Publish Modal state (for catalog quick-action)
  const [selectedCourseForPublish, setSelectedCourseForPublish] = useState<OfficialCourse | null>(null);
  const [priceInput, setPriceInput] = useState<number>(499000);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/v1/admin/content-studio/courses", { credentials: "include" });
      if (!res.ok) throw new Error("دریافت دوره‌های رسمی با خطا مواجه شد.");
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch("/v1/admin/content-studio/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newCourseName.trim(),
          subject: newCourseSubject.trim() || undefined,
          description: newCourseDescription.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "خطا در ایجاد دوره");
      }

      const created = await res.json();
      setIsCreateOpen(false);
      setNewCourseName("");
      setNewCourseSubject("");
      setNewCourseDescription("");
      await fetchCourses();

      // Automatically open the production workspace for the newly created course
      if (created.course?.id) {
        setSearchParams({ courseId: created.course.id });
      }
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const openReviewModal = async (courseId: string) => {
    try {
      setSelectedCourseForReview(courseId);
      setReviewLoading(true);
      const res = await fetch(`/v1/admin/content-studio/courses/${courseId}/review`, { credentials: "include" });
      if (!res.ok) throw new Error("خطا در بارگذاری پیش‌نویس‌های دوره");
      const data = await res.json();
      setReviewWorkspace(data);
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
      setSelectedCourseForReview(null);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleApproveCourse = async () => {
    if (!selectedCourseForReview) return;
    try {
      setApproving(true);
      const res = await fetch(`/v1/admin/content-studio/courses/${selectedCourseForReview}/approve`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "خطا در تایید دوره");
      }

      alert("دوره با موفقیت تایید شد و تمام ماژول‌ها، درس‌ها، فلش‌کارت‌ها و آزمون‌ها ثبت شدند.");
      setSelectedCourseForReview(null);
      setReviewWorkspace(null);
      await fetchCourses();
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
    } finally {
      setApproving(false);
    }
  };

  const openPublishModal = async (course: OfficialCourse) => {
    setSelectedCourseForPublish(course);
    setPriceInput(course.product?.price || 499000);
    try {
      setValidating(true);
      const res = await fetch(`/v1/admin/content-studio/courses/${course.id}/validate`, { credentials: "include" });
      const report = await res.json();
      setConsistencyReport(report);
    } catch (err) {
      console.error(err);
    } finally {
      setValidating(false);
    }
  };

  const handleSavePrice = async () => {
    if (!selectedCourseForPublish) return;
    try {
      setPricingLoading(true);
      const res = await fetch(`/v1/admin/content-studio/courses/${selectedCourseForPublish.id}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ price: priceInput }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "خطا در ثبت قیمت");
      }

      // Re-validate
      const vRes = await fetch(`/v1/admin/content-studio/courses/${selectedCourseForPublish.id}/validate`, { credentials: "include" });
      const report = await vRes.json();
      setConsistencyReport(report);
      await fetchCourses();
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
    } finally {
      setPricingLoading(false);
    }
  };

  const handlePublishCourse = async () => {
    if (!selectedCourseForPublish) return;
    try {
      setPublishing(true);
      const res = await fetch(`/v1/admin/content-studio/courses/${selectedCourseForPublish.id}/publish`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "خطا در انتشار دوره");
      }

      alert("محصول رسمی با موفقیت منتشر شد و در کاتالوگ فروش قرار گرفت.");
      setSelectedCourseForPublish(null);
      await fetchCourses();
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleArchiveCourse = async (courseId: string) => {
    if (!confirm("آیا از آرشیو کردن این دوره رسمی و غیرفعال‌سازی فروش آن اطمینان دارید؟")) return;
    try {
      const res = await fetch(`/v1/admin/content-studio/courses/${courseId}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("خطا در آرشیو دوره");
      await fetchCourses();
    } catch (err: unknown) {
      const e = err as Error;
      alert(e.message);
    }
  };

  const getStatusBadge = (status: OfficialCourse["status"]) => {
    switch (status) {
      case "draft":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">پیش‌نویس (Draft)</span>;
      case "generating":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin text-purple-400" /> در حال تولید AI</span>;
      case "review":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1.5"><Clock className="w-3 h-3 text-amber-400" /> در انتظار بازبینی</span>;
      case "approved":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-950/60 text-blue-300 border border-blue-500/40 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-blue-400" /> تایید شده (آماده انتشار)</span>;
      case "published":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> منتشر شده (در حال فروش)</span>;
      case "archived":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">بایگانی شده</span>;
    }
  };

  // If a course is selected via URL or state, render the unified OfficialProductionWorkspace
  const activeCourse = courses.find((c) => c.id === activeCourseId);

  if (activeCourseId) {
    if (loading && !activeCourse) {
      return (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          <p className="text-sm">در حال بارگذاری محیط استودیو دوره...</p>
        </div>
      );
    }

    if (!loading && !activeCourse) {
      return (
        <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-10 text-center space-y-4 max-w-xl mx-auto my-12">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h3 className="text-base font-bold text-white">دوره رسمی مورد نظر یافت نشد</h3>
          <p className="text-xs text-slate-400">
            ممکن است دوره حذف یا شناسه آن تغییر کرده باشد.
          </p>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all"
          >
            بازگشت به کاتالوگ دوره‌های رسمی
          </button>
        </div>
      );
    }

    if (activeCourse) {
      return (
        <OfficialProductionWorkspace
          course={activeCourse}
          courses={courses}
          onSelectCourse={(id) => setSearchParams({ courseId: id })}
          onBackToCatalog={() => setSearchParams({})}
          onRefresh={fetchCourses}
          isLoading={loading}
        />
      );
    }
  }

  return (
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center shadow-lg shadow-teal-950/30">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">استودیو محتوای رسمی آوانا (Official Studio)</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              تولید هوشمند دوره‌های تجاری با پایپ‌لاین رسمی، بازبینی انسانی، قیمت‌گذاری و انتشار عمومی
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCourses}
            disabled={loading}
            className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 transition-colors"
            title="به‌روزرسانی"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-teal-950/50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>ایجاد دوره رسمی جدید</span>
          </button>
        </div>
      </div>

      {/* Courses List Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          <p className="text-sm">در حال بارگذاری دوره‌های رسمی...</p>
        </div>
      ) : error ? (
        <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : courses.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/40 rounded-3xl border border-slate-800/80 p-8 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">هنوز دوره رسمی تعریف نشده است</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            برای شروع، روی دکمه «ایجاد دوره رسمی جدید» کلیک کنید تا دوره تجاری در سازمان AVANA OFFICIAL تعریف شود.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/40 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-4 font-bold">عنوان دوره رسمی</th>
                  <th className="p-4 font-bold">رشته / موضوع</th>
                  <th className="p-4 font-bold">وضعیت محتوا</th>
                  <th className="p-4 font-bold">اقلام آموزشی</th>
                  <th className="p-4 font-bold">وضعیت تجاری و قیمت</th>
                  <th className="p-4 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => setSearchParams({ courseId: course.id })}
                        className="font-bold text-slate-200 text-sm hover:text-teal-400 transition-colors text-right flex items-center gap-1.5"
                      >
                        <span>{course.name}</span>
                        <ChevronLeft className="w-3.5 h-3.5 text-teal-400 opacity-60" />
                      </button>
                      {course.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 max-w-xs">{course.description}</div>
                      )}
                    </td>
                    <td className="p-4 text-slate-300">
                      {course.subject || "عمومی"}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(course.status)}
                    </td>
                    <td className="p-4 text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1" title="ماژول‌ها"><Layers className="w-3.5 h-3.5 text-teal-400" /> {course.moduleCount}</span>
                        <span className="flex items-center gap-1" title="درس‌ها"><BookOpen className="w-3.5 h-3.5 text-blue-400" /> {course.lessonCount}</span>
                        <span className="flex items-center gap-1" title="فلش‌کارت‌ها"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> {course.flashcardCount}</span>
                        <span className="flex items-center gap-1" title="سؤالات تستی"><HelpCircle className="w-3.5 h-3.5 text-amber-400" /> {course.quizQuestionCount}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {course.product ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-emerald-400">
                            {course.product.price.toLocaleString("fa-IR")} تومان
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {course.product.active ? "🟢 در حال فروش" : "🟡 پیش‌نویس قیمت"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">بدون محصول</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Open Studio Production Workspace */}
                        <button
                          type="button"
                          onClick={() => setSearchParams({ courseId: course.id })}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white text-[11px] font-bold transition-all shadow-md shadow-teal-950/40 flex items-center gap-1.5"
                          title="ورود به محیط استودیوی تولید محتوا"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>ورود به استودیو</span>
                        </button>

                        {/* Review Action */}
                        <button
                          onClick={() => openReviewModal(course.id)}
                          className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors flex items-center gap-1.5"
                          title="بازبینی و تایید محتوا"
                        >
                          <Eye className="w-3.5 h-3.5 text-teal-400" />
                        </button>

                        {/* Pricing & Publish Action */}
                        <button
                          onClick={() => openPublishModal(course)}
                          className="px-2.5 py-1.5 rounded-xl border border-teal-500/40 bg-teal-950/40 hover:bg-teal-900/50 text-teal-300 text-[11px] font-bold transition-colors flex items-center gap-1.5"
                          title="قیمت‌گذاری و انتشار"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                        </button>

                        {/* Archive Action */}
                        {course.status !== "archived" && (
                          <button
                            onClick={() => handleArchiveCourse(course.id)}
                            className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                            title="بایگانی"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Official Course Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-lg text-white">ایجاد دوره رسمی جدید (AVANA Official)</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">عنوان دوره آموزشی *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فارماکولوژی جامع بالینی"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">رشته / سرفصل موضوعی</label>
                <input
                  type="text"
                  placeholder="مثال: داروسازی، پزشکی"
                  value={newCourseSubject}
                  onChange={(e) => setNewCourseSubject(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">توضیحات و اهداف دوره</label>
                <textarea
                  rows={3}
                  placeholder="معرفی اجمالی سرفصل‌ها و مباحث تحت پوشش..."
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={creating || !newCourseName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>ایجاد دوره و ورود به استودیو</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Workspace Modal */}
      {selectedCourseForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white">محیط بازبینی و تایید محتوای رسمی</h3>
                <p className="text-xs text-slate-400 mt-0.5">{reviewWorkspace?.course?.name}</p>
              </div>
              <button onClick={() => setSelectedCourseForReview(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {reviewLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
                <p className="text-xs">در حال بررسی پیش‌نویس‌ها و نگاشت‌های درسنامه...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Lesson Mapping Invariant Check Card */}
                <div className={`p-4 rounded-2xl border ${
                  reviewWorkspace?.unresolvedLessonMappings === 0
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                } flex items-start gap-3`}>
                  {reviewWorkspace?.unresolvedLessonMappings === 0 ? (
                    <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                  )}
                  <div className="text-xs space-y-1">
                    <div className="font-bold">
                      {reviewWorkspace?.unresolvedLessonMappings === 0
                        ? "نگاشت قطعی درسنامه تایید شد (unresolvedLessonMappings = 0)"
                        : `خطای نگاشت درسنامه: ${reviewWorkspace?.unresolvedLessonMappings} مورد کارت/سؤال فاقد نگاشت معتبر هستند.`}
                    </div>
                    <p className="opacity-80">
                      طبق قوانین رسمی آوانا، هیچ فلش‌کارت یا سؤالی به درس اول منتسب نمی‌شود و تایید تا زمان نگاشت ۱۰۰٪ قطعی مسدود است.
                    </p>
                  </div>
                </div>

                {/* Draft Content Items */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400">پیش‌نویس‌های تولیدشده توسط هوش مصنوعی:</h4>
                  {reviewWorkspace?.draftContents?.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-800/40 text-center text-xs text-slate-500">
                      هنوز محتوایی برای این دوره تولید نشده است.
                    </div>
                  ) : (
                    reviewWorkspace?.draftContents?.map((item) => (
                      <div key={item.id} className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-slate-700/60 text-slate-300">
                            {item.contentType === "lesson" && <BookOpen className="w-4 h-4 text-blue-400" />}
                            {item.contentType === "flashcard" && <Sparkles className="w-4 h-4 text-purple-400" />}
                            {item.contentType === "quiz" && <HelpCircle className="w-4 h-4 text-amber-400" />}
                            {item.contentType === "review_summary" && <FileCheck className="w-4 h-4 text-teal-400" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-200">
                              {item.contentType === "lesson" && "درسنامه‌ها (Lessons)"}
                              {item.contentType === "flashcard" && "فلش‌کارت‌ها (Flashcards)"}
                              {item.contentType === "quiz" && "آزمون تستی (Quizzes)"}
                              {item.contentType === "review_summary" && "خلاصه مروری (Review Summary)"}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.itemCount} آیتم تولیدشده • وضعیت: {item.status}
                            </div>
                          </div>
                        </div>

                        <div>
                          {item.status === "accepted" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">تایید شده</span>
                          ) : item.hasMappingErrors ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">خطای نگاشت</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">آماده تایید</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <button
                    onClick={() => setSelectedCourseForReview(null)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
                  >
                    بستن
                  </button>

                  <button
                    onClick={handleApproveCourse}
                    disabled={approving || !reviewWorkspace?.readyForApproval}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                  >
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>تایید رسمی دوره (Approve)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing & Publish Modal */}
      {selectedCourseForPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white">قیمت‌گذاری و انتشار عمومی محصول</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedCourseForPublish.name}</p>
              </div>
              <button onClick={() => setSelectedCourseForPublish(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {/* Price Setting Box */}
            <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/80 space-y-3">
              <label className="block text-xs font-bold text-slate-300">قیمت فروش محصول (تومان) *</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={priceInput}
                  onChange={(e) => setPriceInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={handleSavePrice}
                  disabled={pricingLoading}
                  className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold whitespace-nowrap"
                >
                  {pricingLoading ? "در حال ثبت..." : "ثبت قیمت"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                این قیمت در کاتالوگ و مدال خرید اختصاصی به عنوان دسترسی مادام‌العمر (Lifetime Access) درج می‌شود.
              </p>
            </div>

            {/* Consistency Validation Report */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400">بررسی الزامات پیش از انتشار (Consistency Validation):</h4>
              {validating ? (
                <div className="p-4 text-center text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline ml-2" /> در حال اعتبارسنجی...</div>
              ) : consistencyReport ? (
                <div className="space-y-2">
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                    consistencyReport.valid
                      ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                  }`}>
                    <div className="font-bold flex items-center gap-2">
                      {consistencyReport.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                      <span>{consistencyReport.valid ? "تمامی الزامات انتشار رعایت شده است." : "برخی الزامات انتشار تأمین نشده است:"}</span>
                    </div>

                    {!consistencyReport.valid && (
                      <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pr-2">
                        {consistencyReport.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedCourseForPublish(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                انصراف
              </button>

              <button
                onClick={handlePublishCourse}
                disabled={publishing || !consistencyReport?.valid}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>انتشار عمومی و فعال‌سازی فروش</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
