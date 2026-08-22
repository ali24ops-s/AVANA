import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminStatusBadge } from "../../components/admin/AdminUI";
import { Activity, Database, Server, Cpu } from "lucide-react";

interface SystemHealth {
  database: string;
  redis: string;
  ai: string;
  lastCheck: string;
}

export function AdminSystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get<SystemHealth>("/admin/system/health");
        setHealth(res);
      } catch (err: any) {
        setError(err.message || "خطا در بررسی سلامت سیستم");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Activity className="w-6 h-6 text-teal-400" />
          سلامت سیستم
        </h1>
        <p className="text-sm text-slate-400 mt-1">وضعیت سرویس‌های زیرساختی و وابستگی‌ها</p>
      </div>

      {loading ? (
        <div className="text-slate-400">در حال بررسی...</div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : health ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <HealthCard title="پایگاه داده (PostgreSQL)" icon={<Database className="w-6 h-6 text-blue-400"/>} status={health.database} />
          <HealthCard title="حافظه پنهان (Redis)" icon={<Server className="w-6 h-6 text-red-400"/>} status={health.redis} />
          <HealthCard title="هوش مصنوعی (AI Provider)" icon={<Cpu className="w-6 h-6 text-emerald-400"/>} status={health.ai} />
        </div>
      ) : null}
      
      {health && (
        <div className="text-sm text-slate-500">
          آخرین بررسی: <span dir="ltr">{new Date(health.lastCheck).toLocaleString("fa-IR")}</span>
        </div>
      )}
    </div>
  );
}

function HealthCard({ title, icon, status }: { title: string, icon: React.ReactNode, status: string }) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4 items-center text-center">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-slate-200 font-medium">{title}</h3>
      <AdminStatusBadge status={status} />
    </div>
  );
}
