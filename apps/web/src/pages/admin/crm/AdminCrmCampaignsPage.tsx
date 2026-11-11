import { useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  Search,
  CheckCircle2,
  Eye,
  Trash2,
  Edit,
  Play,
  Pause,
  Ban,
  Users,
  Layers,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Mail,
  Send,
  Bell,
  Calendar,
  FileText,
  ShieldCheck,
} from "lucide-react";
import {
  toPersianDigits,
  type CrmCampaignItem,
  type CrmCampaignExecutionItem,
  type CampaignStatus,
  type CampaignChannel,
  type CampaignRecipientStatus,
  type CrmSegmentItem,
} from "@avana/domain";
import {
  listCrmCampaigns,
  createCrmCampaign,
  updateCrmCampaign,
  deleteCrmCampaign,
  executeCrmCampaign,
  pauseCrmCampaign,
  resumeCrmCampaign,
  cancelCrmCampaign,
  listCrmCampaignExecutions,
  listCrmCampaignRecipients,
  listCrmSegments,
} from "../../../lib/api/admin.js";
import { useAuth } from "../../../providers/AuthProvider.js";

function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "—";
  const p = phone.trim();
  if (p.length > 6) {
    return `${p.slice(0, 4)}***${p.slice(-3)}`;
  }
  return "***";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "ثبت نشده";
  try {
    const d = new Date(iso);
    return toPersianDigits(
      new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d),
    );
  } catch {
    return iso;
  }
}

const CHANNEL_CONFIG: Record<CampaignChannel, { label: string; icon: typeof MessageSquare; bg: string; text: string }> = {
  sms: { label: "پیامک (SMS)", icon: MessageSquare, bg: "bg-amber-50", text: "text-amber-700" },
  email: { label: "ایمیل (Email)", icon: Mail, bg: "bg-sky-50", text: "text-sky-700" },
  telegram: { label: "تلگرام (Telegram)", icon: Send, bg: "bg-blue-50", text: "text-blue-700" },
  in_app: { label: "پیام درون‌برنامه‌ای (In-App)", icon: Bell, bg: "bg-purple-50", text: "text-purple-700" },
};

const STATUS_CONFIG: Record<CampaignStatus, { label: string; bg: string; text: string }> = {
  draft: { label: "پیش‌نویس", bg: "bg-slate-100", text: "text-slate-700" },
  scheduled: { label: "زمان‌بندی‌شده", bg: "bg-blue-50", text: "text-blue-700" },
  running: { label: "در حال اجرا", bg: "bg-amber-100", text: "text-amber-800" },
  paused: { label: "متوقف‌شده", bg: "bg-orange-50", text: "text-orange-700" },
  completed: { label: "تکمیل‌شده", bg: "bg-emerald-50", text: "text-emerald-700" },
  cancelled: { label: "لغوشده", bg: "bg-rose-50", text: "text-rose-700" },
};

export function AdminCrmCampaignsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPlatformAdmin =
    user?.role === "platform_admin" ||
    (user as unknown as Record<string, unknown>)?.globalRole === "platform_admin";

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<CampaignChannel | "all">("all");
  const [, startTransition] = useTransition();

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CrmCampaignItem | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignChannel, setCampaignChannel] = useState<CampaignChannel>("sms");
  const [targetSegmentId, setTargetSegmentId] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Execution & Delivery Monitor Modal State
  const [monitoringCampaign, setMonitoringCampaign] = useState<CrmCampaignItem | null>(null);
  const [recipientsPage, setRecipientsPage] = useState(1);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<CampaignRecipientStatus | "all">("all");
  const recipientsPageSize = 15;

  // Action status message
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    startTransition(() => {
      setDebouncedSearch(val);
      setPage(1);
    });
  };

  // Queries
  const {
    data: campaignsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      "admin",
      "crm",
      "campaigns",
      {
        page,
        pageSize,
        search: debouncedSearch,
        statusFilter,
        channelFilter,
      },
    ],
    queryFn: () =>
      listCrmCampaigns({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        channel: channelFilter === "all" ? undefined : channelFilter,
      }),
  });

  const { data: segmentsData } = useQuery({
    queryKey: ["admin", "crm", "segments", "for-campaigns"],
    queryFn: () => listCrmSegments({ page: 1, pageSize: 100 }),
  });

  const availableSegments: CrmSegmentItem[] = segmentsData?.segments || [];
  const selectedSegment = availableSegments.find((s) => s.id === targetSegmentId);

  // Executions & Recipients Query for Active Modal
  const { data: executionsData } = useQuery({
    queryKey: ["admin", "crm", "campaign-executions", monitoringCampaign?.id],
    queryFn: () => (monitoringCampaign ? listCrmCampaignExecutions(monitoringCampaign.id) : null),
    enabled: Boolean(monitoringCampaign),
  });

  const { data: recipientsData, isLoading: isRecipientsLoading } = useQuery({
    queryKey: [
      "admin",
      "crm",
      "campaign-recipients",
      monitoringCampaign?.id,
      recipientsPage,
      recipientStatusFilter,
    ],
    queryFn: () =>
      monitoringCampaign
        ? listCrmCampaignRecipients(monitoringCampaign.id, {
            page: recipientsPage,
            pageSize: recipientsPageSize,
            status: recipientStatusFilter === "all" ? undefined : recipientStatusFilter,
          })
        : null,
    enabled: Boolean(monitoringCampaign),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createCrmCampaign>[0]) => createCrmCampaign(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setIsModalOpen(false);
      resetModalForm();
      setActionNotice({ type: "success", text: "کمپین جدید با موفقیت ثبت شد." });
    },
    onError: (err: unknown) => {
      setFormError((err as { message?: string })?.message || "خطا در ایجاد کمپین");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateCrmCampaign>[1] }) =>
      updateCrmCampaign(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setIsModalOpen(false);
      resetModalForm();
      setActionNotice({ type: "success", text: "تغییرات کمپین با موفقیت ذخیره شد." });
    },
    onError: (err: unknown) => {
      setFormError((err as { message?: string })?.message || "خطا در بروزرسانی کمپین");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCrmCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setActionNotice({ type: "success", text: "کمپین با موفقیت حذف شد." });
    },
    onError: (err: unknown) => {
      setActionNotice({ type: "error", text: (err as { message?: string })?.message || "خطا در حذف کمپین" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => executeCrmCampaign(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setActionNotice({
        type: "success",
        text: `کمپین با موفقیت راه‌اندازی شد. تعداد مخاطبان محاسبه‌شده: ${toPersianDigits(res.recipientCount)} نفر`,
      });
    },
    onError: (err: unknown) => {
      setActionNotice({ type: "error", text: (err as { message?: string })?.message || "خطا در راه‌اندازی کمپین" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => pauseCrmCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setActionNotice({ type: "success", text: "کمپین متوقف شد." });
    },
    onError: (err: unknown) => {
      setActionNotice({ type: "error", text: (err as { message?: string })?.message || "خطا در توقف کمپین" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => resumeCrmCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setActionNotice({ type: "success", text: "اجرای کمپین از سر گرفته شد." });
    },
    onError: (err: unknown) => {
      setActionNotice({ type: "error", text: (err as { message?: string })?.message || "خطا در ادامه کمپین" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelCrmCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "campaigns"] });
      setActionNotice({ type: "success", text: "کمپین لغو گردید." });
    },
    onError: (err: unknown) => {
      setActionNotice({ type: "error", text: (err as { message?: string })?.message || "خطا در لغو کمپین" });
    },
  });

  const resetModalForm = () => {
    setEditingCampaign(null);
    setCampaignName("");
    setCampaignDesc("");
    setCampaignChannel("sms");
    setTargetSegmentId(availableSegments[0]?.id || "");
    setMessageContent("");
    setScheduledAt("");
    setFormError(null);
  };

  const openCreateModal = () => {
    resetModalForm();
    if (availableSegments.length > 0) {
      setTargetSegmentId(availableSegments[0].id);
    }
    setIsModalOpen(true);
  };

  const openEditModal = (c: CrmCampaignItem) => {
    setEditingCampaign(c);
    setCampaignName(c.name);
    setCampaignDesc(c.description || "");
    setCampaignChannel(c.channel);
    setTargetSegmentId(c.targetSegmentId);
    setMessageContent(c.messageContent || "");
    setScheduledAt(c.scheduledAt ? c.scheduledAt.substring(0, 16) : "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveCampaign = () => {
    setFormError(null);
    if (!campaignName.trim()) {
      setFormError("عنوان کمپین الزامی است.");
      return;
    }
    if (!targetSegmentId) {
      setFormError("انتخاب سگمنت هدف الزامی است.");
      return;
    }
    if (!messageContent.trim()) {
      setFormError("متن محتوای پیام کمپین الزامی است.");
      return;
    }

    if (editingCampaign) {
      updateMutation.mutate({
        id: editingCampaign.id,
        input: {
          name: campaignName.trim(),
          description: campaignDesc.trim() || undefined,
          targetSegmentId,
          channel: campaignChannel,
          messageContent: messageContent.trim(),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
    } else {
      createMutation.mutate({
        name: campaignName.trim(),
        description: campaignDesc.trim() || undefined,
        targetSegmentId,
        channel: campaignChannel,
        messageContent: messageContent.trim(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
    }
  };

  const campaigns = campaignsData?.campaigns || [];
  const totalCount = campaignsData?.totalCount || 0;
  const totalPages = campaignsData?.totalPages || 1;

  // Overview stats
  const runningCount = campaigns.filter((c) => c.status === "running").length;
  const completedCount = campaigns.filter((c) => c.status === "completed").length;
  const totalRecipientsCount = campaigns.reduce((acc, c) => acc + (c.estimatedRecipientsCount || 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">کمپین‌های مشتریان (Customer Campaigns)</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                طراحی، زمان‌بندی و ارسال چندکاناله پیام‌ها و پیشنهادات هوشمند بر اساس سگمنت‌های پویای مخاطبان
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              تعداد کل کمپین‌ها: <span className="font-bold">{toPersianDigits(totalCount)}</span>
            </div>
            {isPlatformAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>ایجاد کمپین جدید</span>
              </button>
            )}
          </div>
        </div>

        {/* CRM Subnavigation */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <Link
            to="/admin/crm/customers"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Users className="w-4 h-4" />
            <span>فهرست و نمایه مشتریان</span>
          </Link>
          <Link
            to="/admin/crm/segments"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>سگمنت‌های پویا</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold">
            <Megaphone className="w-4 h-4" />
            <span>کمپین‌های مشتریان</span>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            actionNotice.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">کل کمپین‌ها</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{toPersianDigits(totalCount)}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl">
            <Play className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">کمپین‌های در حال اجرا</div>
            <div className="text-xl font-bold text-amber-700 mt-1">{toPersianDigits(runningCount)}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">مجموع مخاطبان پردازش‌شده</div>
            <div className="text-xl font-bold text-indigo-700 mt-1">
              {toPersianDigits(totalRecipientsCount)} کاربر
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">کمپین‌های تکمیل‌شده</div>
            <div className="text-xl font-bold text-emerald-700 mt-1">{toPersianDigits(completedCount)}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="جستجو در عنوان یا محتوای پیام کمپین..."
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CampaignStatus | "all");
                setPage(1);
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-700"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="draft">پیش‌نویس (Draft)</option>
              <option value="scheduled">زمان‌بندی‌شده (Scheduled)</option>
              <option value="running">در حال اجرا (Running)</option>
              <option value="paused">متوقف‌شده (Paused)</option>
              <option value="completed">تکمیل‌شده (Completed)</option>
              <option value="cancelled">لغوشده (Cancelled)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value as CampaignChannel | "all");
                setPage(1);
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-700"
            >
              <option value="all">همه کانال‌ها</option>
              <option value="sms">پیامک (SMS)</option>
              <option value="email">ایمیل (Email)</option>
              <option value="telegram">تلگرام (Telegram)</option>
              <option value="in_app">پیام درون‌برنامه‌ای (In-App)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Information Banner: Safe Dry-Run Boundary Guard */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold">حالت ارسال پیامک کمپین‌ها:</span> اجرای شبیه‌سازی‌شده (Dry-Run) فعال است. هیچ پیامکی بدون پیکربندی صریح محیط عملیاتی به خطوط واقعی کاربران ارسال نمی‌شود.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg font-mono text-[11px] font-semibold text-amber-800 shadow-2xs">
            SMS: Safe Dry-Run Mode
          </span>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
            <span className="text-sm">در حال دریافت فهرست کمپین‌ها...</span>
          </div>
        ) : isError ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-rose-500">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm font-medium">خطا در دریافت اطلاعات کمپین‌ها</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 px-4 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-lg transition-colors"
            >
              تلاش مجدد
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Megaphone className="w-10 h-10 stroke-1" />
            <span className="text-sm font-medium text-slate-600">هیچ کمپینی یافت نشد</span>
            <p className="text-xs text-slate-400 max-w-sm text-center">
              می‌توانید با انتخاب سگمنت‌های پویای مخاطبان، اولین کمپین ارسال پیام خود را بسازید.
            </p>
            {isPlatformAdmin && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ایجاد کمپین جدید</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs">
                <tr>
                  <th className="py-3.5 px-4">عنوان و توضیحات</th>
                  <th className="py-3.5 px-4">کانال ارسال</th>
                  <th className="py-3.5 px-4">سگمنت هدف</th>
                  <th className="py-3.5 px-4">وضعیت</th>
                  <th className="py-3.5 px-4">مخاطبان هدف</th>
                  <th className="py-3.5 px-4">زمان ثبت / اجرا</th>
                  <th className="py-3.5 px-4 text-center">عملیات و مدیریت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => {
                  const channelCfg = CHANNEL_CONFIG[c.channel] || CHANNEL_CONFIG.sms;
                  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
                  const ChannelIcon = channelCfg.icon;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.description}</div>
                        )}
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1 italic bg-slate-50 p-1.5 rounded-lg border border-slate-100 font-mono">
                          {c.messageContent}
                        </div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${channelCfg.bg} ${channelCfg.text}`}
                        >
                          <ChannelIcon className="w-3.5 h-3.5" />
                          <span>{channelCfg.label}</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            حالت: آزمایشی (Dry Run)
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-500" />
                          <span className="font-medium text-slate-800">{c.targetSegmentName}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                        >
                          {c.status === "running" && <Loader2 className="w-3 h-3 animate-spin mr-1 inline" />}
                          {statusCfg.label}
                        </span>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-700">
                          {c.estimatedRecipientsCount !== null && c.estimatedRecipientsCount !== undefined
                            ? `${toPersianDigits(c.estimatedRecipientsCount)} کاربر`
                            : "محاسبه در زمان اجرا"}
                        </span>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-500">
                        <div>ثبت: {formatDate(c.createdAt)}</div>
                        {c.lastExecution?.startedAt && (
                          <div className="text-emerald-600 mt-0.5">
                            اجرا: {formatDate(c.lastExecution.startedAt)}
                          </div>
                        )}
                        {c.scheduledAt && !c.lastExecution && (
                          <div className="text-blue-600 mt-0.5">زمان‌بندی: {formatDate(c.scheduledAt)}</div>
                        )}
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Execute Button */}
                          {isPlatformAdmin && (c.status === "draft" || c.status === "scheduled") && (
                            <button
                              type="button"
                              onClick={() => executeMutation.mutate(c.id)}
                              disabled={executeMutation.isPending}
                              title="اجرای کمپین"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          {/* Pause Button */}
                          {isPlatformAdmin && c.status === "running" && (
                            <button
                              type="button"
                              onClick={() => pauseMutation.mutate(c.id)}
                              disabled={pauseMutation.isPending}
                              title="توقف موقت کمپین"
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}

                          {/* Resume Button */}
                          {isPlatformAdmin && c.status === "paused" && (
                            <button
                              type="button"
                              onClick={() => resumeMutation.mutate(c.id)}
                              disabled={resumeMutation.isPending}
                              title="ادامه اجرای کمپین"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          {/* Cancel Button */}
                          {isPlatformAdmin && (c.status === "running" || c.status === "paused" || c.status === "scheduled") && (
                            <button
                              type="button"
                              onClick={() => cancelMutation.mutate(c.id)}
                              disabled={cancelMutation.isPending}
                              title="لغو کمپین"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}

                          {/* View Executions & Recipients Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setMonitoringCampaign(c);
                              setRecipientsPage(1);
                              setRecipientStatusFilter("all");
                            }}
                            title="مشاهده گزارش و گیرندگان"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Button */}
                          {isPlatformAdmin && c.status === "draft" && (
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              title="ویرایش کمپین"
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete Button */}
                          {isPlatformAdmin && (c.status === "draft" || c.status === "completed" || c.status === "cancelled") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm("آیا از حذف این کمپین اطمینان دارید؟")) {
                                  deleteMutation.mutate(c.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              title="حذف کمپین"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500 text-xs">
              صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Create / Edit Campaign Modal */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  {editingCampaign ? "ویرایش کمپین" : "تعریف کمپین جدید"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-sm">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان کمپین *</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="مثلاً: تخفیف ویژه بازگشت به تحصیل برای دانشجویان مهندسی"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">توضیحات اختیاری</label>
                <textarea
                  value={campaignDesc}
                  onChange={(e) => setCampaignDesc(e.target.value)}
                  placeholder="هدف از اجرای کمپین، یادداشت‌های پشتیبانی و..."
                  rows={2}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Target Segment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">سگمنت پویای مخاطبان *</label>
                <select
                  value={targetSegmentId}
                  onChange={(e) => setTargetSegmentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="">-- انتخاب سگمنت هدف --</option>
                  {availableSegments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {!s.isActive ? "(غیرفعال)" : ""}
                    </option>
                  ))}
                </select>

                {selectedSegment && (
                  <div className="mt-2 p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      <span>
                        تعداد مخاطبان پیش‌بینی‌شده سگمنت:{" "}
                        <strong className="font-bold">
                          {toPersianDigits(selectedSegment.estimatedCount ?? 0)} کاربر
                        </strong>
                      </span>
                    </div>
                    {!selectedSegment.isActive && (
                      <span className="text-rose-600 font-semibold text-[11px]">
                        هشدار: این سگمنت غیرفعال است!
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">کانال ارسال پیام *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["sms", "email", "telegram", "in_app"] as CampaignChannel[]).map((ch) => {
                    const cfg = CHANNEL_CONFIG[ch];
                    const Icon = cfg.icon;
                    const isSelected = campaignChannel === ch;

                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setCampaignChannel(ch)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-amber-50 border-amber-500 text-amber-800 shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="w-5 h-5 mb-1.5" />
                        <span>{cfg.label.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Content */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">متن و محتوای پیام *</label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {toPersianDigits(messageContent.length)} کاراکتر
                  </span>
                </div>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="سلام {name} عزیز، ۲۰٪ تخفیف اشتراک ویژه برای شما فعال شد. کد تخفیف: AVANA20"
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-sans"
                />
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                  <span>متغیرهای قابل جایگزینی:</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">{"{name}"}</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">{"{email}"}</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">{"{mobile}"}</span>
                </div>
              </div>

              {/* Scheduled At */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  زمان‌بندی ارسال (اختیاری - در صورت خالی بودن، به صورت دستی راه‌اندازی می‌شود)
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full pr-10 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-700"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-100 transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveCampaign}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-medium transition-colors shadow-xs disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>{editingCampaign ? "ذخیره تغییرات" : "ایجاد کمپین"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Campaign Details & Delivery Monitoring Modal */}
      {/* ========================================================================= */}
      {monitoringCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    رهگیری اجرا و گزارش تحویل کمپین: {monitoringCampaign.name}
                  </h3>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>کانال: {CHANNEL_CONFIG[monitoringCampaign.channel]?.label}</span>
                    <span>•</span>
                    <span>سگمنت: {monitoringCampaign.targetSegmentName}</span>
                    <span>•</span>
                    <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold text-[11px]">
                      حالت درگاه: شبیه‌سازی آزمایشی (Dry-Run)
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMonitoringCampaign(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-sm">
              {/* Executions History */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  تاریخچه دفعات اجرای کمپین
                </h4>
                {executionsData?.executions && executionsData.executions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {executionsData.executions.map((ex: CrmCampaignExecutionItem) => (
                      <div
                        key={ex.id}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            شناسه اجرا: {ex.id.substring(0, 8)}...
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold ${
                              ex.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : ex.status === "running"
                                ? "bg-amber-100 text-amber-800"
                                : ex.status === "failed"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {ex.status}
                          </span>
                        </div>
                        <div className="text-slate-500">شروع: {formatDate(ex.startedAt)}</div>
                        <div className="text-slate-500">پایان: {formatDate(ex.completedAt)}</div>
                        <div className="flex items-center gap-3 pt-1 border-t border-slate-200 text-slate-700 font-medium">
                          <span>کل: {toPersianDigits(ex.totalRecipients)}</span>
                          <span className="text-emerald-600">
                            موفق: {toPersianDigits(ex.successfulRecipients)}
                          </span>
                          <span className="text-rose-600">
                            ناموفق: {toPersianDigits(ex.failedRecipients)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 text-center">
                    هنوز اجرایی برای این کمپین ثبت نشده است.
                  </div>
                )}
              </div>

              {/* Recipient Deliveries Log */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    فهرست مخاطبان و لاگ تحویل پیام
                  </h4>
                  <div className="flex items-center gap-2">
                    <select
                      value={recipientStatusFilter}
                      onChange={(e) => {
                        setRecipientStatusFilter(e.target.value as CampaignRecipientStatus | "all");
                        setRecipientsPage(1);
                      }}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                    >
                      <option value="all">همه وضعیت‌های تحویل</option>
                      <option value="pending">در انتظار (Pending)</option>
                      <option value="sent">ارسال‌شده (Sent)</option>
                      <option value="failed">ناموفق (Failed)</option>
                      <option value="skipped">ردشده (Skipped)</option>
                    </select>
                  </div>
                </div>

                {isRecipientsLoading ? (
                  <div className="py-12 flex justify-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
                  </div>
                ) : recipientsData?.recipients && recipientsData.recipients.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">کاربر / مخاطب</th>
                            <th className="py-2.5 px-3">شماره / ایمیل</th>
                            <th className="py-2.5 px-3">وضعیت تحویل</th>
                            <th className="py-2.5 px-3">زمان ارسال</th>
                            <th className="py-2.5 px-3">توضیحات خطا</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {recipientsData.recipients.map((rec) => (
                            <tr key={rec.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {rec.userName || `کاربر ${rec.userId.substring(0, 8)}`}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600">
                                <div>{maskPhoneNumber(rec.userPhoneNumber)}</div>
                                {rec.userEmail && (
                                  <div className="text-slate-400 text-[11px]">{rec.userEmail}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                                    rec.status === "sent"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : rec.status === "failed"
                                      ? rec.errorCode === "DELIVERY_UNCONFIRMED_TIMEOUT"
                                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                                        : "bg-rose-100 text-rose-800"
                                      : rec.status === "skipped"
                                      ? "bg-slate-100 text-slate-600"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {rec.status === "sent"
                                    ? "ارسال موفق"
                                    : rec.status === "failed"
                                    ? rec.errorCode === "DELIVERY_UNCONFIRMED_TIMEOUT"
                                      ? "تحویل نامشخص (وقفه زمانی)"
                                      : "ناموفق"
                                    : rec.status === "skipped"
                                    ? "ردشده"
                                    : "در انتظار"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                                {formatDate(rec.sentAt || rec.createdAt)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {rec.errorCode && (
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mb-0.5 ml-1 border ${
                                      rec.errorCode === "DELIVERY_UNCONFIRMED_TIMEOUT"
                                        ? "bg-amber-50 text-amber-800 border-amber-300"
                                        : "bg-rose-50 text-rose-700 border-rose-200"
                                    }`}
                                  >
                                    {rec.errorCode}
                                  </span>
                                )}
                                <span
                                  className={
                                    rec.errorCode === "DELIVERY_UNCONFIRMED_TIMEOUT"
                                      ? "text-amber-800 font-sans"
                                      : "text-rose-600 font-sans"
                                  }
                                >
                                  {rec.errorMessage || "—"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Modal pagination */}
                    {recipientsData.totalPages > 1 && (
                      <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/50">
                        <span className="text-slate-500">
                          صفحه {toPersianDigits(recipientsPage)} از {toPersianDigits(recipientsData.totalPages)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRecipientsPage((p) => Math.max(1, p - 1))}
                            disabled={recipientsPage <= 1}
                            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRecipientsPage((p) => Math.min(recipientsData.totalPages, p + 1))
                            }
                            disabled={recipientsPage >= recipientsData.totalPages}
                            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 text-center">
                    هیچ داده‌ای در لاگ تحویل این کمپین وجود ندارد.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={() => setMonitoringCampaign(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-medium transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
