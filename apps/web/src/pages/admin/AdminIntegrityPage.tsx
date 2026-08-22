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
    return <div className="text-slate-400">در حال بررسی سلامت داده‌ها...</div>;
  }

  if (error || !report) {
    return <div className="text-red-400">خطا در بررسی سلامت داده‌ها.</div>;
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-8 h-8 text-teal-400" />
        <h2 className="text-2xl font-bold text-slate-200">مرکز سلامت داده‌ها (Data Integrity)</h2>
      </div>
      
      <div className={`p-4 rounded-xl border ${totalIssues > 0 ? 'bg-orange-500/10 border-orange-500/20 text-orange-200' : 'bg-green-500/10 border-green-500/20 text-green-200'} flex items-start gap-3`}>
        {totalIssues > 0 ? <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0" /> : <CheckCircle className="w-6 h-6 mt-0.5 shrink-0" />}
        <div>
          <h3 className="font-bold text-lg mb-1">
            {totalIssues > 0 ? `${totalIssues} مشکل در یکپارچگی داده‌ها پیدا شد` : 'هیچ مشکلی در سلامت داده‌ها یافت نشد.'}
          </h3>
          <p className="text-sm opacity-80">
            این مرکز رکوردهای یتیم (Orphan) و مغایرت‌های ساختاری دیتابیس را بر اساس Schema پروژه بررسی می‌کند.
            {totalIssues > 0 && " در فاز فعلی، تعمیر خودکار غیرفعال است و فقط گزارش داده می‌شود."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((check, idx) => (
          <div key={idx} className="glass-panel p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <span className="text-slate-300 font-medium">{check.name}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              check.value > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'
            }`}>
              {check.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
