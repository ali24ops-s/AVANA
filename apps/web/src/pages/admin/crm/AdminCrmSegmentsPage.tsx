import { useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Edit,
  Play,
  Users,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
  ChevronLeft,
  Megaphone,
} from "lucide-react";
import {
  toPersianDigits,
  type SegmentFieldKey,
  type SegmentRuleOperator,
  type SegmentMatchOperator,
  type CrmSegmentItem,
  type SegmentFilterRule,
} from "@avana/domain";
import { AvanaSelect, type SelectOption } from "@avana/ui";
import {
  listCrmSegments,
  createCrmSegment,
  updateCrmSegment,
  deleteCrmSegment,
  previewCrmSegmentCount,
  getCrmSegmentMembers,
  listCrmTags,
} from "../../../lib/api/admin.js";
import { useAuth } from "../../../providers/AuthProvider.js";

function formatToman(toman: number): string {
  return `${toPersianDigits(Math.round(toman).toLocaleString("fa-IR"))} تومان`;
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

// Allowed fields metadata for UI
interface FieldMeta {
  key: SegmentFieldKey;
  label: string;
  category: "کاربر" | "برچسب" | "خرید و پرداخت" | "فعالیت و یادگیری";
  type: "boolean" | "number" | "date" | "string" | "tag";
}

const AVAILABLE_FIELDS: FieldMeta[] = [
  // کاربر
  { key: "user.createdAt", label: "تاریخ عضویت", category: "کاربر", type: "date" },
  { key: "user.isVerified", label: "احراز هویت شده (ایمیل یا موبایل)", category: "کاربر", type: "boolean" },
  { key: "user.emailVerified", label: "ایمیل تأیید شده", category: "کاربر", type: "boolean" },
  { key: "user.phoneVerified", label: "موبایل تأیید شده", category: "کاربر", type: "boolean" },
  { key: "user.major", label: "رشته تحصیلی", category: "کاربر", type: "string" },
  // برچسب
  { key: "crm.tag", label: "برچسب کاربر", category: "برچسب", type: "tag" },
  // خرید و پرداخت
  { key: "payment.hasCashPurchase", label: "دارای خرید نقدی", category: "خرید و پرداخت", type: "boolean" },
  { key: "payment.totalCashSpent", label: "مجموع پرداختی نقدی (تومان)", category: "خرید و پرداخت", type: "number" },
  { key: "payment.successfulOrdersCount", label: "تعداد سفارش‌های موفق", category: "خرید و پرداخت", type: "number" },
  { key: "payment.lastCashPurchaseDate", label: "تاریخ آخرین خرید نقدی", category: "خرید و پرداخت", type: "date" },
  // فعالیت و یادگیری
  { key: "activity.lastActiveDate", label: "آخرین فعالیت", category: "فعالیت و یادگیری", type: "date" },
  { key: "activity.studySessionsCount", label: "تعداد جلسات مطالعه", category: "فعالیت و یادگیری", type: "number" },
  { key: "activity.totalStudyTimeMinutes", label: "مجموع زمان مطالعه (دقیقه)", category: "فعالیت و یادگیری", type: "number" },
  { key: "activity.completedQuizzesCount", label: "تعداد آزمون‌های تکمیل‌شده", category: "فعالیت و یادگیری", type: "number" },
  { key: "activity.enrolledCoursesCount", label: "تعداد دوره‌های عضو", category: "فعالیت و یادگیری", type: "number" },
  { key: "activity.uploadedDocumentsCount", label: "تعداد اسناد آپلودشده", category: "فعالیت و یادگیری", type: "number" },
  { key: "activity.aiGeneratedContentsCount", label: "تعداد تولیدات هوش مصنوعی", category: "فعالیت و یادگیری", type: "number" },
];

export function AdminCrmSegmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" || (user as unknown as Record<string, unknown>)?.globalRole === "platform_admin";

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [, startTransition] = useTransition();

  // Builder Drawer State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<CrmSegmentItem | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDesc, setSegmentDesc] = useState("");
  const [segmentMatchOp, setSegmentMatchOp] = useState<SegmentMatchOperator>("and");
  const [segmentIsActive, setSegmentIsActive] = useState(true);
  const [rules, setRules] = useState<Array<{
    field: SegmentFieldKey;
    operator: SegmentRuleOperator;
    value: unknown;
    window?: string;
  }>>([]);
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Live preview state
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Members Modal State
  const [viewingMembersSegment, setViewingMembersSegment] = useState<CrmSegmentItem | null>(null);
  const [membersPage, setMembersPage] = useState(1);
  const membersPageSize = 15;

  const handleSearchChange = (val: string) => {
    setSearch(val);
    startTransition(() => {
      setDebouncedSearch(val);
      setPage(1);
    });
  };

  // Queries
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "admin",
      "crm",
      "segments",
      {
        page,
        pageSize,
        search: debouncedSearch,
        statusFilter,
      },
    ],
    queryFn: () =>
      listCrmSegments({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      }),
  });

  const { data: tagsData } = useQuery({
    queryKey: ["admin", "crm", "tags"],
    queryFn: listCrmTags,
  });

  const tags = tagsData?.tags || [];

  // Members Query
  const { data: membersData, isLoading: isMembersLoading } = useQuery({
    queryKey: ["admin", "crm", "segment-members", viewingMembersSegment?.id, membersPage],
    queryFn: () =>
      viewingMembersSegment
        ? getCrmSegmentMembers(viewingMembersSegment.id, { page: membersPage, pageSize: membersPageSize })
        : Promise.resolve({ customers: [], totalCount: 0, page: 1, pageSize: 15, totalPages: 1 }),
    enabled: !!viewingMembersSegment,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createCrmSegment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "crm", "segments"] });
      closeBuilder();
    },
    onError: (err: unknown) => {
      setBuilderError((err as { message?: string })?.message || "خطا در ایجاد سگمنت");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: updateData }: { id: string; data: Parameters<typeof updateCrmSegment>[1] }) => updateCrmSegment(id, updateData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "crm", "segments"] });
      closeBuilder();
    },
    onError: (err: unknown) => {
      setBuilderError((err as { message?: string })?.message || "خطا در ویرایش سگمنت");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCrmSegment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "crm", "segments"] });
    },
  });

  const openCreateBuilder = () => {
    setEditingSegment(null);
    setSegmentName("");
    setSegmentDesc("");
    setSegmentMatchOp("and");
    setSegmentIsActive(true);
    setRules([
      {
        field: "payment.totalCashSpent",
        operator: "greater_than_or_equal",
        value: 1000000,
      },
    ]);
    setPreviewCount(null);
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const openEditBuilder = (segment: CrmSegmentItem) => {
    setEditingSegment(segment);
    setSegmentName(segment.name);
    setSegmentDesc(segment.description || "");
    setSegmentMatchOp(segment.matchOperator);
    setSegmentIsActive(segment.isActive);
    setRules(
      segment.filterRules.map((r: SegmentFilterRule) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          field: r.field,
          operator: r.operator,
          value: raw.value,
          window: typeof raw.window === "string" ? raw.window : undefined,
        };
      }),
    );
    setPreviewCount(segment.estimatedCount ?? null);
    setBuilderError(null);
    setIsBuilderOpen(true);
  };

  const closeBuilder = () => {
    setIsBuilderOpen(false);
    setEditingSegment(null);
    setBuilderError(null);
    setPreviewCount(null);
  };

  const handleAddRule = () => {
    if (rules.length >= 20) return;
    setPreviewCount(null);
    setRules([
      ...rules,
      {
        field: "user.isVerified",
        operator: "is_true",
        value: true,
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    setPreviewCount(null);
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
  };

  const handleRuleFieldChange = (index: number, newField: SegmentFieldKey) => {
    setPreviewCount(null);
    const meta = AVAILABLE_FIELDS.find((f) => f.key === newField);
    const updated = [...rules];
    let defaultOp: SegmentRuleOperator = "equals";
    let defaultVal: unknown = "";

    if (meta?.type === "boolean") {
      defaultOp = "is_true";
      defaultVal = true;
    } else if (meta?.type === "number") {
      defaultOp = "greater_than_or_equal";
      defaultVal = 0;
    } else if (meta?.type === "date") {
      defaultOp = "days_ago_less_than";
      defaultVal = 30;
    } else if (meta?.type === "string") {
      defaultOp = "equals";
      defaultVal = "";
    } else if (meta?.type === "tag") {
      defaultOp = "equals";
      defaultVal = tags[0]?.id || "";
    }

    updated[index] = {
      field: newField,
      operator: defaultOp,
      value: defaultVal,
    };
    setRules(updated);
  };

  const handleRuleOperatorChange = (index: number, newOp: SegmentRuleOperator) => {
    setPreviewCount(null);
    const updated = [...rules];
    updated[index].operator = newOp;
    if (newOp === "is_true" || newOp === "is_false") {
      updated[index].value = newOp === "is_true";
    }
    setRules(updated);
  };

  const handleRuleValueChange = (index: number, val: unknown) => {
    setPreviewCount(null);
    const updated = [...rules];
    updated[index].value = val;
    setRules(updated);
  };

  const handleLivePreview = async () => {
    try {
      setIsPreviewLoading(true);
      setBuilderError(null);
      const res = await previewCrmSegmentCount(rules as SegmentFilterRule[], segmentMatchOp);
      setPreviewCount(res.count);
    } catch (err: unknown) {
      setBuilderError((err as { message?: string })?.message || "خطا در ارزیابی پیش‌نمایش قوانین");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleSaveSegment = () => {
    setBuilderError(null);
    if (!segmentName.trim()) {
      setBuilderError("نام سگمنت الزامی است.");
      return;
    }
    if (rules.length === 0) {
      setBuilderError("تعریف حداقل یک قاعده برای سگمنت الزامی است.");
      return;
    }

    const payload = {
      name: segmentName.trim(),
      description: segmentDesc.trim() || undefined,
      isActive: segmentIsActive,
      matchOperator: segmentMatchOp,
      filterRules: rules as SegmentFilterRule[],
    };

    if (editingSegment) {
      updateMutation.mutate({ id: editingSegment.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const segments = data?.segments || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6 p-4 md:p-6 bg-slate-50 min-h-screen text-slate-900" dir="rtl">
      {/* Page Header & Navigation Tabs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">سگمنت‌های پویای مشتریان (Dynamic Segmentation)</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                دسته‌بندی خودکار کاربران با قواعد منعطف چندگانه بر پایه پرداخت نقدی، رفتار و فعالیت آموزشی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              تعداد کل سگمنت‌ها: <span className="font-bold">{toPersianDigits(totalCount)}</span>
            </div>
            {isPlatformAdmin && (
              <button
                type="button"
                onClick={openCreateBuilder}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف سگمنت جدید</span>
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">
            <Layers className="w-4 h-4" />
            <span>سگمنت‌های پویا</span>
          </div>
          <Link
            to="/admin/crm/campaigns"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Megaphone className="w-4 h-4" />
            <span>کمپین‌های مشتریان</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="جستجو در نام و توضیحات سگمنت..."
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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

          <div className="md:col-span-4">
            <AvanaSelect
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter((typeof val === "string" ? val : val[0]) as "all" | "active" | "inactive");
                setPage(1);
              }}
              options={[
                { value: "all", label: "همه وضعیت‌ها" },
                { value: "active", label: "فقط سگمنت‌های فعال" },
                { value: "inactive", label: "فقط سگمنت‌های غیرفعال" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Segments List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-sm">در حال بارگذاری سگمنت‌ها...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">خطا در بارگذاری فهرست سگمنت‌ها.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium"
            >
              تلاش مجدد
            </button>
          </div>
        ) : segments.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <Layers className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-base font-semibold text-slate-700">هیچ سگمنتی یافت نشد</p>
            <p className="text-xs text-slate-400">
              {search ? "با جستجوی فعلی نتیجه‌ای منطبق نیست." : "اولین سگمنت پویای مشتریان را تعریف کنید."}
            </p>
            {isPlatformAdmin && !search && (
              <button
                type="button"
                onClick={openCreateBuilder}
                className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium"
              >
                تعریف سگمنت جدید
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 text-slate-600 text-xs font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">نام و توضیحات سگمنت</th>
                  <th className="py-3.5 px-4 text-center">وضعیت</th>
                  <th className="py-3.5 px-4 text-center">تعداد قواعد</th>
                  <th className="py-3.5 px-4 text-center">اعضای منطبق</th>
                  <th className="py-3.5 px-4">ایجادکننده / تاریخ</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {segments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.description}</div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          ترکیب: {s.matchOperator === "and" ? "تمام قواعد (AND)" : "حداقل یکی (OR)"}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      {s.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>فعال</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>غیرفعال</span>
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-center font-medium text-slate-700">
                      {toPersianDigits(s.filterRules.length)} قاعده
                    </td>

                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingMembersSegment(s);
                          setMembersPage(1);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                        title="مشاهده اعضا"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{toPersianDigits(s.estimatedCount)} عضو</span>
                      </button>
                    </td>

                    <td className="py-4 px-4 text-xs text-slate-500">
                      <div>{s.createdByName}</div>
                      <div className="mt-0.5 text-slate-400">{formatDate(s.createdAt)}</div>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingMembersSegment(s);
                            setMembersPage(1);
                          }}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="مشاهده اعضای منطبق"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isPlatformAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditBuilder(s)}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="ویرایش سگمنت"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`آیا از حذف سگمنت "${s.name}" مطمئن هستید؟`)) {
                                  deleteMutation.mutate(s.id);
                                }
                              }}
                              className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="حذف سگمنت"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Segment Builder Modal / Drawer */}
      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-center items-start p-4 md:p-8">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-xl overflow-hidden my-auto space-y-5">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingSegment ? `ویرایش سگمنت: ${editingSegment.name}` : "تعریف سگمنت پویای جدید"}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    قواعد و شروط فیلتر را تعیین کنید و تعداد اعضا را به صورت زنده پیش‌نمایش بگیرید
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBuilder}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {builderError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{builderError}</span>
                </div>
              )}

              {/* General Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    نام سگمنت <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={segmentName}
                    onChange={(e) => setSegmentName(e.target.value)}
                    placeholder="مثلاً: خریداران وفادار بالای ۵ میلیون تومان"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    وضعیت سگمنت
                  </label>
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={segmentIsActive}
                        onChange={(e) => setSegmentIsActive(e.target.checked)}
                        className="rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>فعال و در دسترس برای استفاده</span>
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">توضیحات</label>
                  <input
                    type="text"
                    value={segmentDesc}
                    onChange={(e) => setSegmentDesc(e.target.value)}
                    placeholder="توضیح هدف و کاربرد این سگمنت..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Rules Configuration */}
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">ترکیب منطقی قواعد:</span>
                    <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewCount(null);
                          setSegmentMatchOp("and");
                        }}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${
                          segmentMatchOp === "and"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        همه‌ی شروط (AND)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewCount(null);
                          setSegmentMatchOp("or");
                        }}
                        className={`px-3 py-1 rounded-md font-medium transition-all ${
                          segmentMatchOp === "or"
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        حداقل یک شرط (OR)
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRule}
                    disabled={rules.length >= 20}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-indigo-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن شرط جدید</span>
                  </button>
                </div>

                {/* Rule Rows */}
                <div className="space-y-3">
                  {rules.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      هیچ قاعده‌ای اضافه نشده است. با کلیک روی «افزودن شرط جدید» شروط را تعیین کنید.
                    </div>
                  ) : (
                    rules.map((rule, idx) => {
                      const meta = AVAILABLE_FIELDS.find((f) => f.key === rule.field);
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs"
                        >
                          <span className="text-xs font-bold text-slate-400 px-1 w-6 text-center">
                            {toPersianDigits(idx + 1)}
                          </span>

                          {/* Field Selector */}
                          <div className="w-full md:w-56">
                            <AvanaSelect
                              size="sm"
                              usePortal={true}
                              value={rule.field}
                              onChange={(val) =>
                                handleRuleFieldChange(idx, (typeof val === "string" ? val : val[0]) as SegmentFieldKey)
                              }
                              options={AVAILABLE_FIELDS.map((f) => ({
                                value: f.key,
                                label: f.label,
                                group: f.category,
                              }))}
                            />
                          </div>

                          {/* Operator Selector */}
                          <div className="w-full md:w-48">
                            <AvanaSelect
                              size="sm"
                              usePortal={true}
                              value={rule.operator}
                              onChange={(val) =>
                                handleRuleOperatorChange(idx, (typeof val === "string" ? val : val[0]) as SegmentRuleOperator)
                              }
                              options={
                                meta?.type === "boolean"
                                  ? [
                                      { value: "is_true", label: "صحیح باشد (Yes)" },
                                      { value: "is_false", label: "نادرست باشد (No)" },
                                    ]
                                  : meta?.type === "number"
                                  ? [
                                      { value: "greater_than_or_equal", label: "بزرگتر یا مساوی (>=)" },
                                      { value: "greater_than", label: "بزرگتر از (>)" },
                                      { value: "equals", label: "دقیقاً برابر (=)" },
                                      { value: "less_than_or_equal", label: "کوچکتر یا مساوی (<=)" },
                                      { value: "less_than", label: "کوچکتر از (<)" },
                                    ]
                                  : meta?.type === "date"
                                  ? [
                                      { value: "days_ago_less_than", label: "کمتر از N روز گذشته" },
                                      { value: "days_ago_greater_than", label: "بیشتر از N روز گذشته" },
                                      { value: "greater_than_or_equal", label: "از تاریخ" },
                                      { value: "less_than_or_equal", label: "تا تاریخ" },
                                    ]
                                  : meta?.type === "string"
                                  ? [
                                      { value: "equals", label: "دقیقاً برابر" },
                                      { value: "not_equals", label: "مخالف" },
                                    ]
                                  : meta?.type === "tag"
                                  ? [
                                      { value: "equals", label: "دارای برچسب" },
                                      { value: "not_equals", label: "فاقد برچسب" },
                                    ]
                                  : []
                              }
                            />
                          </div>

                          {/* Value Input */}
                          <div className="w-full md:flex-1">
                            {meta?.type === "boolean" ? (
                              <div className="text-xs text-slate-400 py-1">
                                {rule.operator === "is_true" ? "کاربرانی که این ویژگی را دارند" : "کاربرانی که این ویژگی را ندارند"}
                              </div>
                            ) : meta?.type === "tag" ? (
                              <AvanaSelect
                                size="sm"
                                usePortal={true}
                                value={String(rule.value ?? "")}
                                onChange={(val) => handleRuleValueChange(idx, typeof val === "string" ? val : val[0])}
                                options={tags.map((t) => ({
                                  value: t.id,
                                  label: t.name,
                                  icon: (
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: t.color || "#008080" }}
                                    />
                                  ),
                                }))}
                              />
                            ) : meta?.type === "date" && (rule.operator === "days_ago_less_than" || rule.operator === "days_ago_greater_than") ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={(rule.value as number | undefined) ?? ""}
                                  onChange={(e) => handleRuleValueChange(idx, parseInt(e.target.value, 10) || 0)}
                                  className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                                />
                                <span className="text-xs text-slate-500">روز قبل</span>
                              </div>
                            ) : meta?.type === "number" ? (
                              <input
                                type="number"
                                min={0}
                                value={(rule.value as number | undefined) ?? ""}
                                onChange={(e) => handleRuleValueChange(idx, parseFloat(e.target.value) || 0)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                              />
                            ) : (
                              <input
                                type="text"
                                value={String(rule.value ?? "")}
                                onChange={(e) => handleRuleValueChange(idx, e.target.value)}
                                placeholder="مقدار شرط..."
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                              />
                            )}
                          </div>

                          {/* Remove Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف شرط"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Live Preview Button & Count Badge */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={handleLivePreview}
                    disabled={isPreviewLoading || rules.length === 0}
                    className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {isPreviewLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>پیش‌نمایش تعداد اعضا (Live Evaluation)</span>
                  </button>

                  {previewCount !== null && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs font-bold">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <span>{toPersianDigits(previewCount)} کاربر منطبق</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
              <button
                type="button"
                onClick={closeBuilder}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveSegment}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-xs disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>{editingSegment ? "ذخیره تغییرات" : "ایجاد سگمنت"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Segment Members Modal */}
      {viewingMembersSegment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-center items-start p-4 md:p-8">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-xl overflow-hidden my-auto space-y-4">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    اعضای سگمنت: {viewingMembersSegment.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    کاربرانی که بر اساس ارزیابی زنده دیتابیس در این سگمنت قرار می‌گیرند
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingMembersSegment(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {isMembersLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
                  <p className="text-sm">در حال بارگذاری اعضای سگمنت...</p>
                </div>
              ) : membersData?.customers.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  در حال حاضر هیچ کاربری با قواعد این سگمنت همخوانی ندارد.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">نام و مشخصات کاربر</th>
                        <th className="py-2.5 px-3">تأیید هویت</th>
                        {isPlatformAdmin && <th className="py-2.5 px-3 text-center">پرداخت نقدی</th>}
                        {isPlatformAdmin && <th className="py-2.5 px-3 text-center">سفارشات</th>}
                        <th className="py-2.5 px-3">برچسب‌ها</th>
                        <th className="py-2.5 px-3 text-center">مشاهده</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {membersData?.customers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{c.name}</div>
                            <div className="text-slate-500 text-[11px] mt-0.5">{c.email}</div>
                            {c.phoneNumber && (
                              <div className="text-slate-400 text-[11px]">{c.phoneNumber}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {c.isVerified ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                تأیید شده
                              </span>
                            ) : (
                              <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                تأیید نشده
                              </span>
                            )}
                          </td>
                          {isPlatformAdmin && (
                            <td className="py-3 px-3 text-center font-bold text-slate-900">
                              {c.totalPaidAmount !== undefined ? formatToman(c.totalPaidAmount) : "-"}
                            </td>
                          )}
                          {isPlatformAdmin && (
                            <td className="py-3 px-3 text-center text-slate-700 font-medium">
                              {c.successfulOrdersCount !== undefined ? toPersianDigits(c.successfulOrdersCount) : "-"}
                            </td>
                          )}
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {c.tags.length === 0 ? (
                                <span className="text-slate-400 text-[11px]">-</span>
                              ) : (
                                c.tags.map((t) => (
                                  <span
                                    key={t.id}
                                    style={{ borderColor: `${t.color}40`, backgroundColor: `${t.color}15`, color: t.color }}
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold border"
                                  >
                                    {t.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Link
                              to={`/admin/crm/customers/${c.id}`}
                              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                            >
                              <span>پروفایل ۳۶۰</span>
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Members Pagination */}
              {(membersData?.totalPages || 1) > 1 && (
                <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    صفحه {toPersianDigits(membersPage)} از {toPersianDigits(membersData?.totalPages || 1)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={membersPage <= 1}
                      onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={membersPage >= (membersData?.totalPages || 1)}
                      onClick={() => setMembersPage((p) => Math.min(membersData?.totalPages || 1, p + 1))}
                      className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
