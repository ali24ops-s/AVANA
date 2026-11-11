import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  UserCheck,
  Tag,
  FileText,
  CreditCard,
  GraduationCap,
  Pin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  Laptop,
  Smartphone,
  Wallet,
  BookOpen,
  BrainCircuit,
  Award,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import type { UserResource } from "@avana/contracts";
import { AvanaSelect } from "@avana/ui";
import {
  getCrmCustomer360,
  listCrmTags,
  assignCrmCustomerTag,
  removeCrmCustomerTag,
  createCrmCustomerNote,
  updateCrmCustomerNote,
  deleteCrmCustomerNote,
  type CrmCustomerNoteItem,
} from "../../../lib/api/admin.js";
import { useAuth } from "../../../providers/AuthProvider.js";

function formatToman(toman: number | undefined | null): string {
  if (toman === undefined || toman === null) return "۰ تومان";
  return `${toPersianDigits(Math.round(toman).toLocaleString("fa-IR"))} تومان`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "ثبت نشده";
  try {
    const d = new Date(iso);
    return toPersianDigits(
      new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d),
    );
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds) return "۰ دقیقه";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه`;
  }
  return `${toPersianDigits(minutes)} دقیقه`;
}

export function AdminCrmCustomerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const authUser = user as (UserResource & { globalRole?: string | null }) | null;
  const isPlatformAdmin = authUser?.role === "platform_admin" || authUser?.globalRole === "platform_admin";
  const currentActorId = authUser?.id;

  const [activeTab, setActiveTab] = useState<"overview" | "financial" | "education" | "tags_notes">("overview");

  // Note composer state
  const [noteContent, setNoteContent] = useState("");
  const [noteIsPinned, setNoteIsPinned] = useState(false);
  const [editingNote, setEditingNote] = useState<CrmCustomerNoteItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editIsPinned, setEditIsPinned] = useState(false);

  // Queries
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "crm", "customer", userId],
    queryFn: () => getCrmCustomer360(userId!),
    enabled: !!userId,
  });

  const { data: tagsData } = useQuery({
    queryKey: ["admin", "crm", "tags"],
    queryFn: listCrmTags,
  });

  const allTags = tagsData?.tags || [];
  const profile = data?.profile;

  // Note Mutations
  const createNoteMutation = useMutation({
    mutationFn: (input: { content: string; isPinned?: boolean }) =>
      createCrmCustomerNote(userId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customer", userId] });
      setNoteContent("");
      setNoteIsPinned(false);
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, input }: { noteId: string; input: { content?: string; isPinned?: boolean } }) =>
      updateCrmCustomerNote(userId!, noteId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customer", userId] });
      setEditingNote(null);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteCrmCustomerNote(userId!, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customer", userId] });
    },
  });

  // Tag Mutations
  const assignTagMutation = useMutation({
    mutationFn: (tagId: string) => assignCrmCustomerTag(userId!, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customer", userId] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => removeCrmCustomerTag(userId!, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "crm", "customer", userId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-slate-50 space-y-3" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm text-slate-500">در حال بارگذاری نمایه ۳۶۰ درجه مشتری...</p>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="p-8 text-center bg-slate-50 min-h-screen space-y-4" dir="rtl">
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl max-w-md mx-auto space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="font-semibold text-slate-900">خطا در دریافت نمایه مشتری</p>
          <p className="text-xs text-rose-700">{(error as { message?: string } | null)?.message || "کاربر مورد نظر یافت نشد یا دسترسی نامعتبر است."}</p>
        </div>
        <Link
          to="/admin/crm/customers"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به فهرست مشتریان</span>
        </Link>
      </div>
    );
  }

  const identity = profile.identity;
  const financial = profile.financial;
  const education = profile.education;
  const tags = profile.tags;
  const notes = profile.notes;

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900" dir="rtl">
      {/* Top Breadcrumb & Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/crm/customers"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به فهرست مشتریان CRM</span>
        </Link>
      </div>

      {/* Hero Customer Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl shadow-2xs">
              {identity.name?.slice(0, 1) || "ک"}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{identity.name}</h1>
                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                  ID: {identity.id.slice(0, 8)}...
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    identity.isVerified
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                      : "bg-amber-50 text-amber-700 border border-amber-200/60"
                  }`}
                >
                  {identity.isVerified ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>{identity.isVerified ? "هویت تأیید شده" : "تأیید نشده"}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="font-mono">{identity.email}</span>
                {identity.phoneNumber && (
                  <span className="font-mono" dir="ltr">
                    {identity.phoneNumber}
                  </span>
                )}
                <span>عضویت: {formatDate(identity.createdAt)}</span>
                <span>آخرین فعالیت: {formatDate(identity.lastActiveAt)}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          {isPlatformAdmin && financial ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[100px]">
                <span className="text-xs text-slate-400 block">مجموع خرید</span>
                <span className="text-sm font-bold text-slate-800">
                  {financial.totalPaidAmount > 0 ? formatToman(financial.totalPaidAmount) : "بدون خرید"}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[100px]">
                <span className="text-xs text-slate-400 block">موجودی کیف پول</span>
                <span className="text-sm font-bold text-indigo-600">
                  {formatToman(financial.walletBalance)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[80px]">
                <span className="text-xs text-slate-400 block">سفارش‌ها</span>
                <span className="text-sm font-bold text-slate-800">
                  {toPersianDigits(financial.successfulOrdersCount)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[100px]">
                <span className="text-xs text-slate-400 block">دوره‌های فعال</span>
                <span className="text-sm font-bold text-slate-800">
                  {toPersianDigits(education.enrolledCoursesCount)} دوره
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[100px]">
                <span className="text-xs text-slate-400 block">مدت مطالعه</span>
                <span className="text-sm font-bold text-indigo-600">
                  {formatDuration(education.totalStudyTimeSeconds)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center min-w-[80px]">
                <span className="text-xs text-slate-400 block">دستگاه‌های فعال</span>
                <span className="text-sm font-bold text-slate-800">
                  {toPersianDigits(identity.activeDevicesCount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Customer Tags Pill Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            <span>برچسب‌های مشتری:</span>
          </span>
          {tags.length === 0 ? (
            <span className="text-xs text-slate-400">هیچ برچسبی الصاق نشده است.</span>
          ) : (
            tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-white shadow-2xs"
                style={{ backgroundColor: t.color || "#6366f1" }}
              >
                <span>{t.name}</span>
                {isPlatformAdmin && (
                  <button
                    type="button"
                    onClick={() => removeTagMutation.mutate(t.id)}
                    className="hover:opacity-75 transition-opacity"
                    title="حذف برچسب"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))
          )}

          {/* Quick Tag Selector (platform_admin only) */}
          {isPlatformAdmin && (
            <div className="w-52">
              <AvanaSelect
                size="sm"
                placeholder="+ افزودن برچسب جدید..."
                value=""
                onChange={(val) => {
                  const tagId = typeof val === "string" ? val : val[0];
                  if (tagId) {
                    assignTagMutation.mutate(tagId);
                  }
                }}
                options={allTags
                  .filter((t) => !tags.some((ct) => ct.id === t.id))
                  .map((t) => ({
                    value: t.id,
                    label: t.name,
                    icon: (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.color || "#008080" }}
                      />
                    ),
                  }))}
                disabled={assignTagMutation.isPending}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 rounded-xl shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>نمای کلی و هویت</span>
        </button>

        {isPlatformAdmin && financial && (
          <button
            type="button"
            onClick={() => setActiveTab("financial")}
            className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "financial"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>امور مالی و تراکنش‌ها</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("education")}
          className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "education"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>آموزش و هوش مصنوعی</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tags_notes")}
          className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "tags_notes"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>یادداشت‌های داخلی ({toPersianDigits(notes.length)})</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity & Account Details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>مشخصات کاربری و تحصیلی</span>
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">نام و نام خانوادگی:</span>
                <span className="font-semibold text-slate-800">{identity.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">نقش کاربری:</span>
                <span className="font-semibold text-slate-800">{identity.role}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">ایمیل:</span>
                <span className="font-mono text-slate-800">{identity.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">شماره موبایل:</span>
                <span className="font-mono text-slate-800" dir="ltr">
                  {identity.phoneNumber || "ثبت نشده"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">رشته تحصیلی:</span>
                <span className="font-semibold text-slate-800">{identity.major || "ثبت نشده"}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">دانشگاه / مؤسسه:</span>
                <span className="font-semibold text-slate-800">{identity.university || "ثبت نشده"}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">تعداد دستگاه‌های فعال:</span>
                <span className="font-semibold text-slate-800">
                  {toPersianDigits(identity.activeDevicesCount)} دستگاه
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">وضعیت تدریس:</span>
                <span className="font-semibold text-slate-800">{identity.teacherStatus || "ندارد"}</span>
              </div>
            </div>
          </div>

          {/* Activity & Engagement Summary */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>خلاصه تعامل و فعالیت</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">تاریخ اولین ثبت‌نام:</span>
                <span className="font-medium text-slate-900">{formatDate(identity.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">آخرین زمان فعالیت در سامانه:</span>
                <span className="font-medium text-slate-900">{formatDate(identity.lastActiveAt)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">تأییدیه ایمیل:</span>
                <span className={identity.emailVerified ? "text-emerald-600 font-medium" : "text-slate-400"}>
                  {identity.emailVerified ? "تأیید شده" : "تأیید نشده"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">تأییدیه شماره همراه:</span>
                <span className={identity.phoneVerified ? "text-emerald-600 font-medium" : "text-slate-400"}>
                  {identity.phoneVerified ? "تأیید شده" : "تأیید نشده"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Financial */}
      {activeTab === "financial" && isPlatformAdmin && financial && (
        <div className="space-y-6">
          {/* Strict Separation Notice */}
          <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs text-indigo-900 flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">تفکیک شفاف خریدهای نقدی از تراکنش‌های داخلی کیف پول</p>
              <p className="text-indigo-700 mt-0.5">
                پرداخت‌های نقدی (ریالی) شامل خریدهای انجام شده از طریق درگاه مستقیم بانکی هستند. موجودی کیف پول و اعتبار هدایا جهت مصارف هوش مصنوعی و خدمات ویژه سیستم به کار می‌روند و با حجم فروش نقدی ادغام نمی‌شوند.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fiat Purchases */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>خریدهای مستقیم و سفارش‌ها</span>
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">
                  درگاه بانکی
                </span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">مجموع مبالغ پرداختی موفق:</span>
                  <span className="font-bold text-sm text-emerald-700">
                    {formatToman(financial.totalPaidAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">تعداد سفارش‌های موفق:</span>
                  <span className="font-semibold text-slate-800">
                    {toPersianDigits(financial.successfulOrdersCount)} سفارش
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">تاریخ آخرین خرید نقدی:</span>
                  <span className="font-medium text-slate-800">{formatDate(financial.lastPaymentDate)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">اشتراک فعال:</span>
                  <span className="font-medium text-slate-800">
                    {financial.activeSubscription
                      ? `${financial.activeSubscription.productTitle} (انقضا: ${formatDate(financial.activeSubscription.expiresAt)})`
                      : "اشتراک فعالی ندارد"}
                  </span>
                </div>
              </div>
            </div>

            {/* Wallet & Consumption */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <span>کیف پول و اعتبارات داخلی</span>
                </span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                  اعتبار مصرفی
                </span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                  <span className="text-indigo-900 font-medium">موجودی فعلی کیف پول:</span>
                  <span className="font-bold text-sm text-indigo-700">
                    {formatToman(financial.walletBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">مجموع شارژهای کیف پول:</span>
                  <span className="font-semibold text-slate-800">{formatToman(financial.totalWalletTopups)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">مصرف هوش مصنوعی (کسر از کیف پول):</span>
                  <span className="font-semibold text-slate-800">{formatToman(financial.totalAiConsumption)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">اعتبار هدیه / پاداش دریافت شده:</span>
                  <span className="font-semibold text-slate-800">{formatToman(financial.totalGiftCredits)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-600">بازپرداخت‌ها (استرداد):</span>
                  <span className="font-semibold text-slate-800">
                    {toPersianDigits(financial.refundsCount)} مورد ({formatToman(financial.totalRefunds)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Education */}
      {activeTab === "education" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>دوره‌ها و محتوای آموزشی</span>
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-1">دوره‌های ثبت‌نام شده:</span>
                <span className="text-base font-bold text-slate-800">
                  {toPersianDigits(education.enrolledCoursesCount)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-1">دوره‌های خریداری‌شده:</span>
                <span className="text-base font-bold text-slate-800">
                  {toPersianDigits(education.ownedCoursesCount)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-1">اسناد بارگذاری‌شده:</span>
                <span className="text-base font-bold text-slate-800">
                  {toPersianDigits(education.uploadedDocumentsCount)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 block mb-1">محتوای تولیدشده با AI:</span>
                <span className="text-base font-bold text-slate-800">
                  {toPersianDigits(education.aiGeneratedContentsCount)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-indigo-600" />
              <span>مطالعه و آزمون‌ها</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">مجموع زمان مطالعه:</span>
                <span className="font-bold text-slate-800">
                  {formatDuration(education.totalStudyTimeSeconds)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">تعداد آزمون‌های شرکت کرده:</span>
                <span className="font-semibold text-slate-800">
                  {toPersianDigits(education.quizzesAttemptedCount)} آزمون
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">میانگین نمره آزمون‌ها:</span>
                <span className="font-semibold text-slate-800">
                  {education.averageQuizScore !== null
                    ? `${toPersianDigits(education.averageQuizScore)} درصد`
                    : "ثبت نشده"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-600">آخرین فعالیت آموزشی:</span>
                <span className="font-medium text-slate-800">
                  {formatDate(education.lastEducationalActivityAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Tags & Notes */}
      {activeTab === "tags_notes" && (
        <div className="space-y-6">
          {/* Note Composer */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>ثبت یادداشت داخلی جدید</span>
            </h3>

            <div className="space-y-3">
              <textarea
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="یادداشت‌های داخلی درباره تعامل با کاربر، تماس‌های تلفنی، درخواست‌های خاص و ..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noteIsPinned}
                    onChange={(e) => setNoteIsPinned(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>سنجاق به بالای لیست یادداشت‌ها</span>
                </label>

                <button
                  type="button"
                  disabled={!noteContent.trim() || createNoteMutation.isPending}
                  onClick={() =>
                    createNoteMutation.mutate({
                      content: noteContent,
                      isPinned: noteIsPinned,
                    })
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium disabled:opacity-50 transition-colors shadow-xs"
                >
                  {createNoteMutation.isPending ? "در حال ثبت..." : "ثبت یادداشت"}
                </button>
              </div>
            </div>
          </div>

          {/* Notes List */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">سوابق یادداشت‌ها ({toPersianDigits(notes.length)})</h3>

            {notes.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80 text-xs text-slate-400">
                هنوز هیچ یادداشت داخلی برای این کاربر ثبت نشده است.
              </div>
            ) : (
              notes.map((n) => {
                const canEditOrDelete = isPlatformAdmin || n.authorId === currentActorId;
                const isEditing = editingNote?.id === n.id;

                return (
                  <div
                    key={n.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      n.isPinned
                        ? "bg-amber-50/40 border-amber-200/80 shadow-xs"
                        : "bg-white border-slate-200/80 shadow-xs"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs"
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editIsPinned}
                              onChange={(e) => setEditIsPinned(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span>سنجاق شده</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNote(null)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                            >
                              انصراف
                            </button>
                            <button
                              type="button"
                              disabled={updateNoteMutation.isPending}
                              onClick={() =>
                                updateNoteMutation.mutate({
                                  noteId: n.id,
                                  input: { content: editContent, isPinned: editIsPinned },
                                })
                              }
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium"
                            >
                              ذخیره
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {n.isPinned && (
                              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full text-2xs font-semibold">
                                <Pin className="w-3 h-3 fill-amber-700" />
                                <span>سنجاق شده</span>
                              </span>
                            )}
                            <span className="font-medium text-slate-700">{n.authorName || "کارشناس سیستم"}</span>
                            <span>•</span>
                            <span>{formatDate(n.createdAt)}</span>
                          </div>

                          {canEditOrDelete && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNote(n);
                                  setEditContent(n.content);
                                  setEditIsPinned(n.isPinned);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="ویرایش"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm("آیا از حذف این یادداشت اطمینان دارید؟")) {
                                    deleteNoteMutation.mutate(n.id);
                                  }
                                }}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <p className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">{n.content}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
