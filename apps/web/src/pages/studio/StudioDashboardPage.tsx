import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Database, Copy, Check } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudioApi, type MarketingQuiz } from "../../lib/api/studio-api.js";
import { LoadingState, Button } from "../../components/ui/index.js";

export function StudioDashboardPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<MarketingQuiz[]>([]);
  const [bankCount, setBankCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const studioApi = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [quizzesRes, bankRes] = await Promise.all([
          studioApi.listQuizzes(),
          studioApi.listQuestionBank({ limit: 1 }),
        ]);
        if (mounted) {
          setQuizzes(quizzesRes.quizzes || []);
          setBankCount(bankRes.questions?.length ?? 0);
        }
      } catch (err) {
        console.error("Failed to load studio dashboard data", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [studioApi]);

  const stats = useMemo(() => {
    const total = quizzes.length;
    const published = quizzes.filter((q) => q.status === "published").length;
    const drafts = quizzes.filter((q) => q.status === "draft").length;
    const disabled = quizzes.filter((q) => q.status === "disabled").length;
    return { total, published, drafts, disabled };
  }, [quizzes]);

  const handleCopyLink = (slug: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/quiz/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <LoadingState message="در حال بارگذاری اطلاعات پیشخوان استودیو..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--color-surface)] p-6 rounded-[16px] border border-[var(--color-border)] shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
            پیشخوان AVANA Studio
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            مدیریت و انتشار آزمون‌های هدفمند بازاریابی و جذب مخاطبان داروسازی و پزشکی
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            onClick={() => navigate("/studio/question-bank")}
            leftIcon={<Database className="w-4 h-4" />}
          >
            بانک سؤالات
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate("/studio/quizzes?new=true")}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            ایجاد آزمون جدید
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--color-surface)] p-5 rounded-[16px] border border-[var(--color-border)] shadow-xs">
          <div className="text-xs text-[var(--color-text-muted)] font-medium">کل آزمون‌ها</div>
          <div className="text-2xl font-bold text-[var(--color-text)] mt-1.5">{stats.total}</div>
        </div>
        <div className="bg-[var(--color-surface)] p-5 rounded-[16px] border border-[var(--color-border)] shadow-xs">
          <div className="text-xs text-[#2a624b] font-medium">آزمون‌های فعال و منتشرشده</div>
          <div className="text-2xl font-bold text-[#2a624b] mt-1.5">{stats.published}</div>
        </div>
        <div className="bg-[var(--color-surface)] p-5 rounded-[16px] border border-[var(--color-border)] shadow-xs">
          <div className="text-xs text-[#8f5e27] font-medium">پیش‌نویس‌ها</div>
          <div className="text-2xl font-bold text-[#8f5e27] mt-1.5">{stats.drafts}</div>
        </div>
        <div className="bg-[var(--color-surface)] p-5 rounded-[16px] border border-[var(--color-border)] shadow-xs">
          <div className="text-xs text-[var(--color-text-muted)] font-medium">سؤالات در بانک</div>
          <div className="text-2xl font-bold text-[var(--color-text)] mt-1.5">{bankCount}</div>
        </div>
      </div>

      {/* Recent Marketing Quizzes Section */}
      <div className="bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-text)]">آزمون‌های اخیر</h2>
          <Link
            to="/studio/quizzes"
            className="text-xs font-semibold text-[var(--color-primary-default)] hover:underline"
          >
            مشاهده همه آزمون‌ها
          </Link>
        </div>

        {quizzes.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--color-border)] rounded-[16px] bg-[var(--color-surface-warm)]/30">
            <p className="text-sm text-[var(--color-text-muted)]">
              هنوز آزمون بازاریابی تعریف نشده است.
            </p>
            <div className="mt-3 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/studio/quizzes?new=true")}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                ساخت اولین آزمون
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--color-border)]">
            <table className="w-full text-sm text-right">
              <thead className="bg-[var(--color-surface-warm)]/80 text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                <tr className="text-xs font-semibold">
                  <th className="py-3 pr-4 font-semibold">عنوان آزمون</th>
                  <th className="py-3 px-4 font-semibold">وضعیت</th>
                  <th className="py-3 px-4 font-semibold">تعداد سؤالات</th>
                  <th className="py-3 px-4 font-semibold">تاریخ ساخت</th>
                  <th className="py-3 pl-4 text-left font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {quizzes.slice(0, 6).map((quiz) => (
                  <tr key={quiz.id} className="hover:bg-[var(--color-surface-warm)]/50 transition-colors">
                    <td className="py-3.5 pr-4 font-medium text-[var(--color-text)]">
                      <Link to={`/studio/quizzes/${quiz.id}/edit`} className="hover:text-[var(--color-primary-default)] transition-colors">
                        {quiz.title}
                      </Link>
                      {quiz.description && (
                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
                          {quiz.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {quiz.status === "published" && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                          منتشرشده
                        </span>
                      )}
                      {quiz.status === "draft" && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a]">
                          پیش‌نویس
                        </span>
                      )}
                      {quiz.status === "disabled" && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                          غیرفعال
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--color-text-muted)]">
                      {quiz.questionsCount ?? quiz.questions?.length ?? 0} سؤال
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--color-text-muted)]">
                      {new Date(quiz.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="py-3.5 pl-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        {quiz.status === "published" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(quiz.slug)}
                            leftIcon={copiedSlug === quiz.slug ? <Check className="w-3.5 h-3.5 text-[#2a624b]" /> : <Copy className="w-3.5 h-3.5" />}
                          >
                            {copiedSlug === quiz.slug ? "کپی شد" : "کپی لینک"}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/studio/quizzes/${quiz.id}/edit`)}
                        >
                          ویرایش
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
