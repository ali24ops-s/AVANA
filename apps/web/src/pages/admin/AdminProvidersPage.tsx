import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Server className="w-6 h-6 text-teal-400" />
          مدیریت ارائه‌دهندگان هوش مصنوعی
        </h1>
        <p className="text-sm text-slate-400 mt-1">مشاهده وضعیت Configuration ارائه‌دهندگان (Read-only)</p>
      </div>

      <AdminTable headers={["ارائه‌دهنده", "وضعیت فعالیت", "مدل", "اولویت", "سلامت"]}>
        {loading ? <AdminLoadingState colSpan={5} /> : error ? <AdminErrorState message={error} colSpan={5} /> : (
          providers.map(p => (
            <tr key={p.id} className="hover:bg-white/5">
              <td className="px-6 py-4 font-medium text-slate-200">{p.name}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs ${p.status === 'active' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-400'}`}>
                  {p.status === 'active' ? 'Configured' : 'Not Configured'}
                </span>
              </td>
              <td className="px-6 py-4 text-slate-400 font-mono text-sm">{p.model}</td>
              <td className="px-6 py-4 text-slate-400">{p.priority}</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-400">
                  Unknown
                </span>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
    </div>
  );
}
