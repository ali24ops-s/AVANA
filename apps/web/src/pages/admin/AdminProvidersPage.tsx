import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable } from "../../components/admin/AdminUI";
import { TableLoadingState, TableErrorState } from "@avana/ui";
import { Server } from "lucide-react";

interface ProviderConfig {
  id: string;
  name: string;
  status: string;
  model: string;
  priority: number;
  health: string;
}

export function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ providers: ProviderConfig[] }>("/admin/generation/providers")
      .then(res => setProviders(res.providers))
      .catch(err => setError(err.message || "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
          <Server className="w-6 h-6 text-[var(--color-primary-default)]" />
          مدیریت ارائه‌دهندگان هوش مصنوعی
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">مشاهده وضعیت Configuration ارائه‌دهندگان (Read-only)</p>
      </div>

      <AdminTable headers={["ارائه‌دهنده", "وضعیت فعالیت", "مدل", "اولویت", "سلامت"]}>
        {loading ? <TableLoadingState colSpan={5} /> : error ? <TableErrorState message={error} colSpan={5} /> : (
          providers.map(p => (
            <tr key={p.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
              <td className="px-6 py-4 font-medium text-[var(--color-text)]">{p.name}</td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  p.status === 'active'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                    : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}>
                  {p.status === 'active' ? 'Configured' : 'Not Configured'}
                </span>
              </td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] font-mono text-xs sm:text-sm" dir="ltr">{p.model}</td>
              <td className="px-6 py-4 text-[var(--color-text)] font-semibold text-sm" dir="ltr">{p.priority}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[var(--color-text-muted)]" dir="ltr">
                  {p.health || 'Unknown'}
                </span>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
    </div>
  );
}
