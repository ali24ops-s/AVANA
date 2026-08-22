import { useQuery } from "@tanstack/react-query";
import { useAdmin } from "../../hooks/useAdmin.js";
import { Users, BookOpen, Layers, BrainCircuit, FileText, CheckCircle2 } from "lucide-react";

export function AdminDashboardPage() {
  const adminApi = useAdmin();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["admin", "dashboardStats"],
    queryFn: () => adminApi.getDashboardStats(),
  });

  if (isLoading) {
    return <div className="text-slate-400">در حال بارگذاری آمار...</div>;
  }

  if (error || !stats) {
    return <div className="text-red-400">خطا در دریافت آمار.</div>;
  }

  const kpis = [
    { title: "کل کاربران", value: stats.totalUsers, subtitle: `+${stats.newUsersToday} کاربر جدید امروز`, icon: Users, color: "text-blue-400" },
    { title: "کل دوره‌ها", value: stats.totalCourses, icon: BookOpen, color: "text-purple-400" },
    { title: "کل درس‌ها", value: stats.totalLessons, icon: Layers, color: "text-teal-400" },
    { title: "کل فایل‌ها", value: stats.totalDocuments, icon: FileText, color: "text-orange-400" },
    { title: "درخواست‌های هوش مصنوعی (امروز)", value: stats.generationsToday, icon: BrainCircuit, color: "text-pink-400" },
    { title: "نرخ موفقیت هوش مصنوعی", value: `${stats.generationSuccessRate}%`, icon: CheckCircle2, color: "text-green-400" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-200">داشبورد مدیریت</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">{kpi.title}</p>
                <h3 className="text-3xl font-bold text-slate-100 mt-2">{kpi.value}</h3>
                {kpi.subtitle && (
                  <p className="text-xs font-medium text-teal-400 mt-1">{kpi.subtitle}</p>
                )}
              </div>
              <div className={`p-3 rounded-xl bg-white/5 ${kpi.color}`}>
                <kpi.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
