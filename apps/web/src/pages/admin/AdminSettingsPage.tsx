import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminLoadingState, AdminErrorState } from "../../components/admin/AdminUI";
import { Settings, ToggleLeft } from "lucide-react";

interface SystemSettings {
  general: Record<string, string>;
  ai: Record<string, string>;
  system: Record<string, string>;
}

interface FeatureFlag {
  id: string;
  name: string;
  status: string;
  environment: string;
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<SystemSettings>("/admin/settings"),
      api.get<{ features: FeatureFlag[] }>("/admin/settings/features")
    ])
      .then(([settingsRes, featuresRes]) => {
        setSettings(settingsRes);
        setFeatures(featuresRes.features);
      })
      .catch(err => setError(err.message || "خطا در دریافت تنظیمات"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLoadingState colSpan={1} />;
  if (error) return <AdminErrorState message={error} colSpan={1} />;
  if (!settings) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Settings className="w-6 h-6 text-teal-400" />
          تنظیمات سیستم (Read-only)
        </h1>
        <p className="text-sm text-slate-400 mt-1">پیکربندی کلی سیستم AVANA</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingPanel title="تنظیمات عمومی" data={settings.general} />
        <SettingPanel title="تنظیمات هوش مصنوعی" data={settings.ai} />
        <SettingPanel title="زیرساخت سیستم" data={settings.system} />
        
        {/* Feature Flags */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2 flex items-center gap-2">
            <ToggleLeft className="w-5 h-5 text-indigo-400" /> Feature Availability
          </h2>
          <div className="space-y-4">
            {features.map(f => (
              <div key={f.id} className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">{f.name}</span>
                <span className={`px-2 py-1 rounded text-xs ${f.status === 'enabled' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-400'}`}>
                  {f.status === 'enabled' ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingPanel({ title, data }: { title: string, data: Record<string, string> }) {
  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
      <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">{title}</h2>
      <div className="space-y-4">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400 text-sm font-mono">{key}</span>
            <span className="text-slate-200 text-sm">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
