import { useQuery } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { ShieldAlert, AlertTriangle, CheckCircle } from "lucide-react";

export function AdminIntegrityPage() {
  const adminApi = useAdmin();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["admin", "integrityReport"],
    queryFn: () => adminApi.getDataIntegrityReport(),
  });

  if (isLoading) {
    return <div className="text-[var(--color-text-muted)] py-8 text-center" dir="rtl">در حال بررسی سلامت داده‌ها...</div>;
  }

  if (error || !report) {
    return <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-600 dark:text-rose-400" dir="rtl">خطا در بررسی سلامت داده‌ها.</div>;
  }

  const checks = [
    { name: "درس‌های بدون ماژول تخصیص یافته (Orphan Lessons)", value: report.lessonsWithoutModule },
    { name: "فلش‌کارت‌های بدون درس", value: report.flashcardsWithoutLesson },
    { name: "کوییزهای بدون درس و سوال (Orphan Quizzes)", value: report.quizzesWithoutLesson },
    { name: "فایل‌های بدون دوره (Orphan Documents)", value: report.documentsWithoutCourse },
    { name: "Jobهای هوش مصنوعی ناموفق", value: report.failedGenerations },
  ];

  const totalIssues = checks.reduce((acc, check) => acc + check.value, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-8 h-8 text-[var(--color-primary-default)] shrink-0" />
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text)]">مرکز سلامت داده‌ها (Data Integrity)</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">پایش مغایرت‌های ساختاری، داده‌های بدون والد و خطاهای فرآیند تولید</p>
        </div>
      </div>
      
      <div className={`p-5 rounded-2xl border ${
        totalIssues > 0
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-200'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-200'
      } flex items-start gap-3 shadow-sm`}>
        {totalIssues > 0 ? (
          <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle className="w-6 h-6 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div>
          <h3 className="font-bold text-base sm:text-lg mb-1">
            {totalIssues > 0 ? `${totalIssues} مشکل در یکپارچگی داده‌ها پیدا شد` : 'هیچ مشکلی در سلامت داده‌ها یافت نشد.'}
          </h3>
          <p className="text-xs sm:text-sm leading-relaxed opacity-90">
            این مرکز رکوردهای یتیم (Orphan) و مغایرت‌های ساختاری دیتابیس را بر اساس Schema پروژه بررسی می‌کند.
            {totalIssues > 0 && " در فاز فعلی، تعمیر خودکار غیرفعال است و فقط گزارش داده می‌شود."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((check, idx) => (
          <div key={idx} className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm flex items-center justify-between transition-colors">
            <span className="text-[var(--color-text)] text-sm font-medium">{check.name}</span>
            <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-bold border ${
              check.value > 0
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)]'
            }`} dir="ltr">
              {check.value.toLocaleString("fa-IR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
