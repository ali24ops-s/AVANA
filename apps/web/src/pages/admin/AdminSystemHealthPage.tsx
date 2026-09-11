import { useEffect, useState } from "react";
import { api, type AdminSystemHealth } from "../../lib/api/admin";
import { AdminStatusBadge } from "../../components/admin/AdminUI";
import { Activity, Database, Server, Cpu, RefreshCw } from "lucide-react";

export function AdminSystemHealthPage() {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async () => {
    try {
      setRefreshing(true);
      const res = await api.get<AdminSystemHealth>("/admin/system/health");
      setHealth(res);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در بررسی سلامت سیستم");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const dbDetail = health?.services?.database;
  const redisDetail = health?.services?.redis;
  const aiDetail = health?.services?.ai;

  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <Activity className="w-6 h-6 text-[var(--color-primary-default)]" />
            سلامت سیستم
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">وضعیت سرویس‌های زیرساختی، زمان پاسخ‌دهی و وابستگی‌ها</p>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-medium border border-[var(--color-border)] shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[var(--color-primary-default)]" : ""}`} />
          <span>بررسی مجدد</span>
        </button>
      </div>

      {loading ? (
        <div className="text-[var(--color-text-muted)] py-8 text-center">در حال بررسی ارتباط با سرویس‌ها...</div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : health ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <HealthCard
            title="پایگاه داده (PostgreSQL)"
            icon={<Database className="w-6 h-6 text-blue-500 dark:text-blue-400" />}
            status={health.database}
            latencyMs={dbDetail?.latencyMs}
            reason={dbDetail?.reason}
          />
          <HealthCard
            title="حافظه پنهان (Redis)"
            icon={<Server className="w-6 h-6 text-amber-500 dark:text-amber-400" />}
            status={health.redis}
            latencyMs={redisDetail?.latencyMs}
            reason={redisDetail?.reason}
          />
          <HealthCard
            title="هوش مصنوعی (AI Provider)"
            icon={<Cpu className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />}
            status={health.ai}
            latencyMs={aiDetail?.latencyMs}
            reason={aiDetail?.reason}
            subtitle={aiDetail?.provider ? `${aiDetail.provider.toUpperCase()}${aiDetail.model ? ` (${aiDetail.model})` : ""}` : undefined}
          />
        </div>
      ) : null}

      {health && (
        <div className="text-sm text-[var(--color-text-muted)] flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
          <span>آخرین بررسی:</span>
          <span dir="ltr">{new Date(health.lastCheck).toLocaleString("fa-IR")}</span>
        </div>
      )}
    </div>
  );
}

function HealthCard({
  title,
  subtitle,
  icon,
  status,
  latencyMs,
  reason,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  status: string;
  latencyMs?: number | null;
  reason?: string | null;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm flex flex-col gap-4 items-center text-center justify-between">
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-warm)] flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="text-[var(--color-text)] font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 font-mono">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 w-full pt-2">
        <AdminStatusBadge status={status} />

        {typeof latencyMs === "number" && latencyMs >= 0 && (
          <span className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
            {latencyMs} ms
          </span>
        )}

        {reason && (
          <p className="text-[11px] text-red-600 dark:text-red-300 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg mt-1 max-w-full truncate text-center" title={reason}>
            {reason}
          </p>
        )}
      </div>
    </div>
  );
}
