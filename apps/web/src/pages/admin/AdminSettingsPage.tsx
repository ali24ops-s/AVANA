import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]" dir="rtl">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--color-primary-default)] border-t-transparent animate-spin mb-3" />
        <span className="text-sm font-medium">در حال بارگذاری تنظیمات سیستم...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm" dir="rtl">
        {error}
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
          <Settings className="w-6 h-6 text-[var(--color-primary-default)]" />
          تنظیمات سیستم (Read-only)
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">پیکربندی کلی و متغیرهای عملیاتی پلتفرم آوانا</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SettingPanel title="تنظیمات عمومی" data={settings.general} />
        <SettingPanel title="تنظیمات هوش مصنوعی" data={settings.ai} />
        <SettingPanel title="زیرساخت سیستم" data={settings.system} />
        
        {/* Feature Flags */}
        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3 flex items-center gap-2">
            <ToggleLeft className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>قابلیت‌های پلتفرم (Feature Availability)</span>
          </h2>
          <div className="space-y-3">
            {features.map(f => (
              <div key={f.id} className="flex items-center justify-between py-1 border-b border-[var(--color-border)] last:border-0">
                <span className="text-[var(--color-text)] text-xs sm:text-sm font-medium">{f.name}</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  f.status === 'enabled'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                    : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}>
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

function SettingPanel({ title, data }: { title: string; data: Record<string, string> }) {
  return (
    <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
      <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">{title}</h2>
      <div className="space-y-2.5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center py-1.5 border-b border-[var(--color-border)] last:border-0 gap-4">
            <span className="text-[var(--color-text-muted)] text-xs font-mono" dir="ltr">{key}</span>
            <span className="text-[var(--color-text)] text-xs sm:text-sm font-semibold truncate" dir="ltr">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
