import { useEffect, useState, useMemo } from "react";
import {
  MessageSquare,
  Copy,
  Check,
  X,
  Code2,
  FileCode,
  Tag,
  Cpu,
  Layers,
  Info,
  Sparkles,
} from "lucide-react";
import {
  AdminTable,
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
  AdminSearch,
  AdminFilter,
  AdminStatusBadge,
} from "../../components/admin/AdminUI";
import { api, type AdminPromptRecord } from "../../lib/api/admin";

export function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<AdminPromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  // Selected prompt for Drawer / Modal
  const [selectedPrompt, setSelectedPrompt] = useState<AdminPromptRecord | null>(
    null,
  );

  // Copy state management
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = async (text: string, sectionKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(sectionKey);
      setTimeout(() => setCopiedSection(null), 2500);
    } catch {
      // Fallback if navigator.clipboard is unavailable
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedSection(sectionKey);
      setTimeout(() => setCopiedSection(null), 2500);
    }
  };

  useEffect(() => {
    api
      .get<{ prompts: AdminPromptRecord[] }>("/admin/generation/prompts")
      .then((res) => setPrompts(res.prompts))
      .catch((err) => setError(err.message || "خطا در دریافت اطلاعات پرامپت‌ها"))
      .finally(() => setLoading(false));
  }, []);

  // Category & Provider Options
  const categories = useMemo(() => {
    const set = new Set(prompts.map((p) => p.category).filter(Boolean));
    return [
      { value: "all", label: "همه دسته‌بندی‌ها" },
      ...Array.from(set).map((c) => ({ value: c, label: c })),
    ];
  }, [prompts]);

  const providers = useMemo(() => {
    const set = new Set(prompts.map((p) => p.provider).filter(Boolean));
    return [
      { value: "all", label: "همه ارائه‌دهندگان" },
      ...Array.from(set).map((pr) => ({ value: pr, label: pr.toUpperCase() })),
    ];
  }, [prompts]);

  // Filtered List
  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      const matchesSearch =
        searchTerm.trim() === "" ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || p.category === categoryFilter;

      const matchesProvider =
        providerFilter === "all" ||
        p.provider.toLowerCase() === providerFilter.toLowerCase();

      return matchesSearch && matchesCategory && matchesProvider;
    });
  }, [prompts, searchTerm, categoryFilter, providerFilter]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Content Planning":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "Lesson Generation":
        return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
      case "Flashcard Generation":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "Quiz Generation":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "Summary Generation":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "Study Assistant":
        return "bg-teal-500/10 text-teal-400 border border-teal-500/20";
      default:
        return "bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]";
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-[var(--color-primary-default)]" />
            بازرس پرامپت‌ها (Prompt Inspector)
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            مشاهده فقط-خواندنی (Read-Only) تمام پرامپت‌های واقعی و فعال هوش مصنوعی در کد AVANA (Single Source of Truth)
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] text-xs font-mono">
          <Sparkles className="w-4 h-4 text-[var(--color-primary-default)]" />
          <span>تعداد پرامپت‌های فعال: {prompts.length}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm">
        <div className="flex-1 max-w-md">
          <AdminSearch
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="جستجوی پرامپت بر اساس نام یا کاربرد..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AdminFilter
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories}
            label="دسته‌بندی"
          />
          <AdminFilter
            value={providerFilter}
            onChange={setProviderFilter}
            options={providers}
            label="ارائه‌دهنده"
          />
        </div>
      </div>

      {/* Main Prompts Table */}
      <AdminTable
        headers={[
          "نام پرامپت",
          "دسته‌بندی",
          "ارائه‌دهنده و مدل",
          "فایل منبع",
          "وضعیت",
          "عملیات",
        ]}
      >
        {loading ? (
          <AdminLoadingState colSpan={6} />
        ) : error ? (
          <AdminErrorState message={error} colSpan={6} />
        ) : filteredPrompts.length === 0 ? (
          <AdminEmptyState message="پرامپتی با فیلترهای انتخابی یافت نشد." />
        ) : (
          filteredPrompts.map((p) => (
            <tr
              key={p.id}
              onClick={() => setSelectedPrompt(p)}
              className="hover:bg-[var(--color-surface-warm)] cursor-pointer transition-colors group"
            >
              <td className="px-6 py-4">
                <div className="font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary-default)] transition-colors">
                  {p.name}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-1 max-w-sm">
                  {p.description}
                </div>
              </td>

              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${getCategoryColor(
                    p.category,
                  )}`}
                >
                  {p.category}
                </span>
              </td>

              <td className="px-6 py-4">
                <div className="text-[var(--color-text)] font-mono text-xs flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  <span className="uppercase font-semibold text-[var(--color-primary-default)]">
                    {p.provider}
                  </span>
                  <span className="text-[var(--color-border)]">/</span>
                  <span className="text-[var(--color-text-muted)] truncate max-w-[140px]" title={p.model}>
                    {p.model}
                  </span>
                </div>
              </td>

              <td className="px-6 py-4">
                <div
                  className="text-[var(--color-text-muted)] font-mono text-xs flex items-center gap-1 max-w-xs truncate"
                  dir="ltr"
                  title={`${p.sourceFile} (${p.sourceLocation})`}
                >
                  <FileCode className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                  <span className="truncate">{p.sourceFile.split("/").pop()}</span>
                </div>
              </td>

              <td className="px-6 py-4">
                <AdminStatusBadge status={p.status} />
              </td>

              <td className="px-6 py-4">
                <button
                  type="button"
                  data-testid={`inspect-btn-${p.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPrompt(p);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] text-xs font-medium transition-colors border border-[var(--color-primary-default)]/20"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  بازرسی (Inspect)
                </button>
              </td>
            </tr>
          ))
        )}
      </AdminTable>

      {/* Drawer / Modal for Detailed Prompt Inspection */}
      {selectedPrompt && (
        <div
          data-testid="prompt-inspector-drawer"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end transition-opacity animate-in fade-in duration-200"
        >
          <div
            className="w-full max-w-3xl bg-[var(--color-surface)] border-e border-[var(--color-border)] h-full flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-warm)]/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/20">
                  <Code2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                    {selectedPrompt.name}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    شناسه: <span className="font-mono text-[var(--color-primary-default)]">{selectedPrompt.id}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPrompt(null)}
                className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body with Smooth Scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Overview Section */}
              <div className="p-4 rounded-2xl border border-[var(--color-border)] space-y-3 bg-[var(--color-surface-warm)]/40 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                  <Info className="w-4 h-4 text-[var(--color-primary-default)]" />
                  مشخصات کلی پرامپت (Overview)
                </div>

                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {selectedPrompt.description}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Tag className="w-3 h-3 text-[var(--color-text-muted)]" />
                      دسته‌بندی
                    </div>
                    <div className="text-xs font-semibold text-[var(--color-text)] mt-1">
                      {selectedPrompt.category}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[var(--color-text-muted)]" />
                      ارائه‌دهنده
                    </div>
                    <div className="text-xs font-semibold text-[var(--color-primary-default)] mt-1 uppercase">
                      {selectedPrompt.provider}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[var(--color-text-muted)]" />
                      مدل فعال
                    </div>
                    <div className="text-xs font-mono text-[var(--color-text)] mt-1 truncate" title={selectedPrompt.model}>
                      {selectedPrompt.model}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                    <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[var(--color-text-muted)]" />
                      وضعیت
                    </div>
                    <div className="mt-1">
                      <AdminStatusBadge status={selectedPrompt.status} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Information */}
              <div className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)] block">سورس‌کد و متد منبع (Single Source of Truth):</span>
                    <span className="text-xs font-mono text-[var(--color-text)]" dir="ltr">
                      {selectedPrompt.sourceFile}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-mono text-[var(--color-primary-default)] bg-[var(--color-primary-default)]/10 px-2.5 py-1 rounded-lg border border-[var(--color-primary-default)]/20 shrink-0" dir="ltr">
                  {selectedPrompt.sourceLocation}
                </span>
              </div>

              {/* Variables Chips */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                  <Tag className="w-4 h-4 text-[var(--color-primary-default)]" />
                  متغیرهای استفاده‌شده در پرامپت ({selectedPrompt.variables.length} متغیر)
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPrompt.variables.map((variable) => (
                    <span
                      key={variable}
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-primary-default)] font-mono text-xs border border-[var(--color-border)] flex items-center gap-1.5"
                      dir="ltr"
                    >
                      <span>{`{{${variable}}}`}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* System Prompt Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-[var(--color-primary-default)]" />
                    پرامپت سیستم (System Prompt)
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(selectedPrompt.systemPrompt, "system")
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] text-xs transition-colors border border-[var(--color-border)] shadow-sm"
                  >
                    {copiedSection === "system" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                        <span className="text-[var(--color-primary-default)] font-medium">کپی شد!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        <span>کپی System Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  className="rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-4 overflow-x-auto text-xs font-mono text-[var(--color-text)] leading-relaxed max-h-64 whitespace-pre-wrap selection:bg-[var(--color-primary-default)]/20"
                  dir={
                    selectedPrompt.systemPrompt.includes("شما") ? "rtl" : "ltr"
                  }
                >
                  {selectedPrompt.systemPrompt}
                </div>
              </div>

              {/* User Prompt / Template Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[var(--color-primary-default)]" />
                    قالب پرامپت کاربر (User Prompt Template)
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCopy(selectedPrompt.userPrompt, "user")}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] text-xs transition-colors border border-[var(--color-border)] shadow-sm"
                  >
                    {copiedSection === "user" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                        <span className="text-[var(--color-primary-default)] font-medium">کپی شد!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        <span>کپی User Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  className="rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-4 overflow-x-auto text-xs font-mono text-[var(--color-text)] leading-relaxed max-h-96 whitespace-pre-wrap selection:bg-[var(--color-primary-default)]/20"
                  dir={selectedPrompt.userPrompt.includes("شما") || selectedPrompt.userPrompt.includes("پیام") ? "rtl" : "ltr"}
                >
                  {selectedPrompt.userPrompt}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/60 flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                این اطلاعات به صورت زنده از سورس‌کد سیستم دریافت شده است.
              </span>

              <button
                type="button"
                onClick={() => setSelectedPrompt(null)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] text-xs font-medium transition-colors border border-[var(--color-border)] shadow-sm"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
