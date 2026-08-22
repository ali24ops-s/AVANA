import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";
import { MessageSquare } from "lucide-react";

interface PromptConfig {
  id: string;
  name: string;
  type: string;
  source: string;
  version: string;
  active: boolean;
}

export function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ prompts: PromptConfig[] }>("/admin/generation/prompts")
      .then(res => setPrompts(res.prompts))
      .catch(err => setError(err.message || "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-teal-400" />
          بازرس پرامپت‌ها (Prompt Inspector)
        </h1>
        <p className="text-sm text-slate-400 mt-1">مشاهده پرامپت‌های موجود در سیستم (پرامپت‌های AVANA فعلاً در کد Hard-coded هستند)</p>
      </div>

      <AdminTable headers={["نام پرامپت", "نوع تولید", "منبع ذخیره‌سازی", "نسخه", "وضعیت"]}>
        {loading ? <AdminLoadingState colSpan={5} /> : error ? <AdminErrorState message={error} colSpan={5} /> : (
          prompts.map(p => (
            <tr key={p.id} className="hover:bg-white/5">
              <td className="px-6 py-4 font-medium text-slate-200">{p.name}</td>
              <td className="px-6 py-4 text-slate-400 font-mono text-sm">{p.type}</td>
              <td className="px-6 py-4 text-slate-400">{p.source}</td>
              <td className="px-6 py-4 text-slate-400">{p.version}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs ${p.active ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-400'}`}>
                  {p.active ? 'فعال' : 'غیرفعال'}
                </span>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
    </div>
  );
}
