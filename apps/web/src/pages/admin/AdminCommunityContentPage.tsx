import { useEffect, useState, useId, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api/admin";
import {
  AdminSearch,
  AdminStatusBadge,
  AdminPagination,
} from "../../components/admin/AdminUI";
import {
  PackageCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  BookOpen,
  HelpCircle,
  FileText,
  AlertTriangle,
  Eye,
  DollarSign,
  User,
  X,
  Check,
  RefreshCw,
  Download,
  FileCheck,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { MarkdownRenderer, RichContent } from "../../components/markdown/MarkdownRenderer";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { Tabs, type TabItem } from "@avana/ui";

export interface AdminContentPackListItem {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  status: "pending_review" | "approved" | "published" | "rejected" | "archived";
  usageCount: number;
  sourceDocumentId?: string | null;
  creator: {
    id: string;
    name: string;
  };
  stats: {
    sessionCount: number;
    flashcardCount: number;
    quizQuestionCount: number;
    estimatedReadingMinutes: number;
  };
  accessType: "free" | "paid";
  rejectionReason: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pricing?: {
    is_free: boolean;
    price: number;
    currency: string;
    product_id: string | null;
  };
  product?: {
    id: string;
    code: string;
    price: number;
    currency: string;
    active: boolean;
  } | null;
}

export interface AdminContentPackDetailResponse {
  pack: AdminContentPackListItem;
  preview: {
    lesson?: {
      title: string;
      sessionCount: number;
      estimatedMinutes: number;
      sessions?: Array<{
        title: string;
        contentMarkdown?: string;
        estimatedMinutes?: number;
      }>;
      contentMarkdown?: string;
      outline?: Array<{
        title: string;
        description?: string;
      }>;
      hasCanonicalSessions?: boolean;
    };
    flashcard?: {
      title: string;
      totalCards: number;
      cards?: Array<{
        front: string;
        back: string;
        explanation?: string | null;
        difficulty?: string;
        cardType?: string;
      }>;
    };
    quiz?: {
      title: string;
      totalQuestions: number;
      questions?: Array<{
        question: string;
        choices?: string[];
        correctAnswer: string;
        explanation?: string | null;
        difficulty?: string;
        category?: string;
      }>;
    };
    review_summary?: {
      title: string;
      summary?: string;
      overview?: string;
      estimatedReadingMinutes?: number;
      sections?: Array<{
        title: string;
        keyPoints?: string[];
      }>;
    };
  };
  sourceDocument?: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    createdAt?: string;
    downloadUrl?: string;
  } | null;
  itemsCount: number;
  product: {
    id: string;
    code: string;
    price: number;
    currency: string;
    active: boolean;
  } | null;
}

export function AdminCommunityContentPage() {
  const { id: routePackId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [packs, setPacks] = useState<AdminContentPackListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  // Selected pack for review modal
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<AdminContentPackDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Approval form state
  const [accessType, setAccessType] = useState<"free" | "paid">("free");
  const [priceInput, setPriceInput] = useState<string>("50000");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Reject form state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Preview active tab state
  const [activePreviewTab, setActivePreviewTab] = useState<"lesson" | "flashcard" | "quiz" | "summary">("lesson");
  const [expandedSessionIndices, setExpandedSessionIndices] = useState<number[]>([]);

  const freeRadioId = useId();
  const paidRadioId = useId();

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page,
        limit: pageSize,
      };
      if (statusFilter && statusFilter !== "all") {
        params.status = statusFilter;
      }
      if (search) {
        params.search = search;
      }

      const res = await api.get<{
        items: AdminContentPackListItem[];
        totalCount?: number;
        pagination?: { total_count: number };
      }>("/admin/content-packs", { params });

      const fetchedItems = res.items || [];
      const count = res.totalCount ?? res.pagination?.total_count ?? fetchedItems.length;

      setPacks(fetchedItems);
      setTotalCount(count);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در دریافت لیست بسته‌ها");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  // Open review modal / load detail
  const openReviewModal = useCallback(async (packId: string) => {
    setSelectedPackId(packId);
    setDetailLoading(true);
    setDetailError(null);
    setShowRejectForm(false);
    setRejectionReason("");
    setActionSuccessMessage(null);

    try {
      const res = await api.get<AdminContentPackDetailResponse>(`/admin/content-packs/${packId}`);
      setDetailData(res);
      setAccessType(res.pack?.accessType || (res.product ? "paid" : "free"));
      setPriceInput(res.product ? String(res.product.price) : "50000");

      if (res.preview?.lesson?.sessions) {
        const count = res.preview.lesson.sessions.length;
        if (count <= 2) {
          setExpandedSessionIndices(Array.from({ length: count }, (_, i) => i));
        } else {
          setExpandedSessionIndices([0]);
        }
      } else {
        setExpandedSessionIndices([]);
      }

      if (res.preview?.lesson) setActivePreviewTab("lesson");
      else if (res.preview?.flashcard) setActivePreviewTab("flashcard");
      else if (res.preview?.quiz) setActivePreviewTab("quiz");
      else setActivePreviewTab("summary");
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "خطا در دریافت جزئیات بسته");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Sync route param with review modal
  useEffect(() => {
    if (routePackId) {
      openReviewModal(routePackId);
    } else {
      setSelectedPackId(null);
      setDetailData(null);
      setExpandedSessionIndices([]);
    }
  }, [routePackId, openReviewModal]);

  const handleSelectPack = (packId: string) => {
    navigate(`/admin/community-content/${packId}`);
  };

  const closeReviewModal = () => {
    setSelectedPackId(null);
    setDetailData(null);
    setExpandedSessionIndices([]);
    setSubmittingAction(false);
    setShowRejectForm(false);
    if (routePackId) {
      navigate("/admin/community-content");
    }
  };

  const toggleSession = (idx: number) => {
    setExpandedSessionIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const sessionCount = detailData?.preview?.lesson?.sessions?.length ?? 0;
  const allSessionsExpanded = sessionCount > 0 && expandedSessionIndices.length === sessionCount;
  const toggleAllSessions = () => {
    if (allSessionsExpanded) {
      setExpandedSessionIndices([]);
    } else {
      setExpandedSessionIndices(Array.from({ length: sessionCount }, (_, i) => i));
    }
  };

  // Handle Approve
  const handleApprove = async () => {
    if (!selectedPackId) return;
    setSubmittingAction(true);
    try {
      const priceNum = accessType === "paid" ? parseInt(priceInput.replace(/\D/g, ""), 10) : 0;
      if (accessType === "paid" && (!priceNum || priceNum <= 0)) {
        alert("لطفاً قیمت معتبر به تومان وارد کنید.");
        setSubmittingAction(false);
        return;
      }

      await api.post(`/admin/content-packs/${selectedPackId}/approve`, {
        accessType,
        price: accessType === "paid" ? priceNum : undefined,
      });

      setActionSuccessMessage("بسته آموزشی با موفقیت تأیید و در لایبرری عمومی منتشر شد.");
      fetchPacks();
      setTimeout(() => {
        closeReviewModal();
      }, 1200);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در تأیید بسته");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!selectedPackId) return;
    if (!rejectionReason.trim()) {
      alert("لطفاً علت رد بسته را وارد کنید.");
      return;
    }

    setSubmittingAction(true);
    try {
      await api.post(`/admin/content-packs/${selectedPackId}/reject`, {
        reason: rejectionReason.trim(),
      });

      setActionSuccessMessage("بسته آموزشی با موفقیت رد شد.");
      fetchPacks();
      setTimeout(() => {
        closeReviewModal();
      }, 1200);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در رد بسته");
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6 text-[var(--color-text)]" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-6 h-6 text-[var(--color-primary-default)]" />
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
              بررسی و قیمت‌گذاری محتوای کامیونیتی
            </h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            محتواهای ارسالی کاربران را بررسی کرده و مدل دسترسی (رایگان یا پولی) و قیمت فروش آن‌ها را تعیین کنید.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3">
        {[
          { id: "pending_review", label: "در انتظار بررسی", icon: Clock },
          { id: "published", label: "منتشر شده", icon: CheckCircle2 },
          { id: "rejected", label: "رد شده", icon: XCircle },
          { id: "all", label: "همه بسته‌ها", icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all border ${
                isActive
                  ? "bg-[var(--color-primary-default)] text-white shadow-sm border-[var(--color-primary-default)] font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] border-transparent"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdminSearch
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="جستجو در عنوان، موضوع یا نام سازنده..."
          />
        </div>
      </div>

      {/* Content Table */}
      {error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-600 dark:text-rose-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm">
          در حال بارگذاری بسته‌ها...
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm">
          <PackageCheck className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
          <p className="text-[var(--color-text)] font-medium">هیچ بسته‌ای در این وضعیت یافت نشد.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border-b border-[var(--color-border)] text-xs font-semibold">
                <tr>
                  <th className="py-3.5 px-4 text-start">عنوان بسته</th>
                  <th className="py-3.5 px-4 text-start">سازنده</th>
                  <th className="py-3.5 px-4 text-start">محتویات</th>
                  <th className="py-3.5 px-4 text-start">وضعیت</th>
                  <th className="py-3.5 px-4 text-start">مدل دسترسی و قیمت</th>
                  <th className="py-3.5 px-4 text-start">تاریخ</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
                {packs.map((pack) => {
                  const isFree =
                    pack.accessType === "free" ||
                    pack.pricing?.is_free ||
                    (!pack.product?.active && !pack.pricing?.price);
                  const price = pack.pricing?.price ?? pack.product?.price;

                  return (
                    <tr
                      key={pack.id}
                      onClick={() => handleSelectPack(pack.id)}
                      className="hover:bg-[var(--color-surface-subtle)] transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--color-text)]">
                          {pack.title}
                        </div>
                        {pack.subject && (
                          <span className="inline-block mt-0.5 text-xs text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2 py-0.5 rounded">
                            {pack.subject}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-[var(--color-text)]">
                          <User className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                          <span>{pack.creator?.name || "کاربر آوانا"}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <span title="تعداد جلسات">{toPersianDigits(pack.stats?.sessionCount ?? 0)} درس</span>
                          <span>•</span>
                          <span title="تعداد فلش‌کارت">{toPersianDigits(pack.stats?.flashcardCount ?? 0)} کارت</span>
                          <span>•</span>
                          <span title="تعداد سوالات آزمون">{toPersianDigits(pack.stats?.quizQuestionCount ?? 0)} سوال</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <AdminStatusBadge status={pack.status} />
                      </td>
                      <td className="py-3.5 px-4">
                        {isFree ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            رایگان
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {price
                              ? `${price.toLocaleString("fa-IR")} تومان`
                              : "پولی"}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[var(--color-text-muted)]">
                        {new Date(pack.createdAt).toLocaleDateString("fa-IR")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPack(pack.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl transition-all shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>بررسی و تصمیم‌گیری</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex justify-between items-center">
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatPersianOf(packs.length, totalCount, { prefix: "نمایش", suffix: "بسته" })}
            </span>
            <AdminPagination
              page={page}
              totalPages={Math.ceil(totalCount / pageSize) || 1}
              totalCount={totalCount}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* Review & Moderation Drawer / Modal */}
      {selectedPackId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-y-auto">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto text-[var(--color-text)]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-subtle)]">
              <div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-[var(--color-primary-default)]" />
                  <h2 className="text-lg font-bold text-[var(--color-text)]">
                    {detailData?.pack?.title || "بررسی بسته آموزشی"}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mt-1">
                  <span>توسط: {detailData?.pack?.creator?.name || "کاربر آوانا"}</span>
                  {detailData?.pack?.subject && <span>• رشته: {detailData.pack.subject}</span>}
                  <span>• {detailData?.itemsCount ?? 0} آیتم محتوایی</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                aria-label="بستن"
                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-xl hover:bg-[var(--color-surface-warm)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-[var(--color-text)]">
              {detailLoading ? (
                <div className="py-16 text-center text-[var(--color-text-muted)]">
                  در حال دریافت پیش‌نمایش و محتویات بسته...
                </div>
              ) : detailError ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>{detailError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedPackId && openReviewModal(selectedPackId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تلاش مجدد</span>
                  </button>
                </div>
              ) : detailData ? (
                <>
                  {/* Action Success Message */}
                  {actionSuccessMessage && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-2">
                      <Check className="w-5 h-5 text-emerald-500" />
                      <span>{actionSuccessMessage}</span>
                    </div>
                  )}

                  {/* Source Document Reference */}
                  {detailData.sourceDocument && (
                    <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-[var(--color-surface-warm)] text-[var(--color-primary-default)] border border-[var(--color-border)] rounded-xl shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[var(--color-text-muted)]">
                            سند منبع (Source Document):
                          </div>
                          <div className="text-sm font-bold text-[var(--color-text)] mt-0.5">
                            {detailData.sourceDocument.originalName}
                          </div>
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
                            <span>
                              حجم: {Math.round(detailData.sourceDocument.sizeBytes / 1024)} کیلوبایت
                            </span>
                            <span>•</span>
                            <span>فرمت: {detailData.sourceDocument.mimeType}</span>
                          </div>
                        </div>
                      </div>
                      {detailData.sourceDocument.downloadUrl && (
                        <a
                          href={detailData.sourceDocument.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl transition-colors shrink-0"
                        >
                          <Download className="w-4 h-4" />
                          <span>دانلود / مشاهده فایل مرجع</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Pack Description */}
                  {detailData.pack?.description && (
                    <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl text-sm text-[var(--color-text)] leading-relaxed border border-[var(--color-border)]">
                      <span className="font-semibold block mb-1 text-[var(--color-text)]">
                        توضیحات بسته:
                      </span>
                      {detailData.pack.description}
                    </div>
                  )}

                  {/* Content Preview Tabs */}
                  <div>
                    {(() => {
                      const previewTabs: TabItem[] = [
                        detailData.preview?.lesson
                          ? {
                              id: "lesson",
                              label: `درس‌ها (${
                                detailData.preview.lesson.sessionCount ??
                                detailData.preview.lesson.sessions?.length ??
                                (detailData.preview.lesson.contentMarkdown ? 1 : 0)
                              })`,
                              icon: <BookOpen className="w-4 h-4" />,
                            }
                          : null,
                        detailData.preview?.flashcard
                          ? {
                              id: "flashcard",
                              label: `فلش‌کارت‌ها (${
                                detailData.preview.flashcard.totalCards ??
                                detailData.preview.flashcard.cards?.length ??
                                0
                              })`,
                              icon: <Layers className="w-4 h-4" />,
                            }
                          : null,
                        detailData.preview?.quiz
                          ? {
                              id: "quiz",
                              label: `آزمون تستی (${
                                detailData.preview.quiz.totalQuestions ??
                                detailData.preview.quiz.questions?.length ??
                                0
                              })`,
                              icon: <HelpCircle className="w-4 h-4" />,
                            }
                          : null,
                        detailData.preview?.review_summary
                          ? {
                              id: "summary",
                              label: "خلاصه مروری",
                              icon: <FileCheck className="w-4 h-4" />,
                            }
                          : null,
                      ].filter(Boolean) as TabItem[];

                      return (
                        <Tabs
                          items={previewTabs}
                          activeTabId={activePreviewTab}
                          onChange={(id) =>
                            setActivePreviewTab(
                              id as "lesson" | "flashcard" | "quiz" | "summary",
                            )
                          }
                          variant="underline"
                          className="mb-4 gap-0"
                        />
                      );
                    })()}

                    {/* Tab Panels with Dedicated Reading Surface */}
                    <div className="bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-2xl p-5 max-h-[500px] overflow-y-auto text-sm text-[var(--color-text)]">
                      {activePreviewTab === "lesson" && detailData.preview?.lesson && (
                        <div className="space-y-5">
                          {/* Course / Lesson Header */}
                          <div className="bg-[var(--color-surface)] p-4 sm:p-5 rounded-xl border border-[var(--color-border)] space-y-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[11px] font-bold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-0.5 rounded-full">
                                  درسنامه آموزشی
                                </span>
                                {detailData.preview.lesson.hasCanonicalSessions === false && (
                                  <span className="text-[11px] font-semibold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-0.5 rounded-full">
                                    محتوای یکپارچه درسنامه
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-relaxed break-words">
                                {detailData.preview.lesson.title || "درسنامه جامع آموزشی"}
                              </h4>
                            </div>

                            {/* Metadata Section: unconstrained, clean RTL typography */}
                            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                                <BookOpen className="w-3.5 h-3.5 text-[var(--color-primary-default)] shrink-0" />
                                <span>
                                  {(
                                    detailData.preview.lesson.sessionCount ||
                                    detailData.preview.lesson.sessions?.length ||
                                    1
                                  ).toLocaleString("fa-IR")}{" "}
                                  جلسه درسنامه
                                </span>
                              </span>
                              <span className="text-[var(--color-text-muted)] select-none">•</span>
                              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)]">
                                <Clock className="w-3.5 h-3.5 text-[var(--color-primary-default)] shrink-0" />
                                <span>
                                  زمان تخمینی مطالعه:{" "}
                                  {(
                                    detailData.preview.lesson.estimatedMinutes ?? 10
                                  ).toLocaleString("fa-IR")}{" "}
                                  دقیقه
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Render sessions content as clean Collapsible Lesson Cards or empty state */}
                          {(!detailData.preview.lesson.sessions ||
                            detailData.preview.lesson.sessions.length === 0) &&
                          !detailData.preview.lesson.contentMarkdown ? (
                            <p className="text-xs text-[var(--color-text-muted)] py-8 text-center">
                              جلسه‌ای برای این درسنامه ثبت نشده است.
                            </p>
                          ) : Array.isArray(detailData.preview.lesson.sessions) &&
                            detailData.preview.lesson.sessions.length > 0 ? (
                            <div className="space-y-3 pt-1">
                              {/* Toggle All Action Header (when > 1 session) */}
                              {detailData.preview.lesson.sessions.length > 1 && (
                                <div className="flex items-center justify-between pb-1 px-1">
                                  <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                                    فهرست جلسات و سرفصل‌ها:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={toggleAllSessions}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] transition-colors py-1 px-2.5 rounded-lg hover:bg-[var(--color-surface-warm)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-default)]/50"
                                  >
                                    <ChevronsUpDown className="w-3.5 h-3.5" />
                                    <span>{allSessionsExpanded ? "بستن همه" : "باز کردن همه"}</span>
                                  </button>
                                </div>
                              )}

                              {/* Collapsible Lesson Cards List */}
                              <div className="space-y-3">
                                {detailData.preview.lesson.sessions.map((session, i) => {
                                  const isExpanded = expandedSessionIndices.includes(i);
                                  return (
                                    <div
                                      key={i}
                                      className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm transition-all"
                                    >
                                      {/* Clickable Header Button */}
                                      <button
                                        type="button"
                                        onClick={() => toggleSession(i)}
                                        aria-expanded={isExpanded}
                                        className="w-full text-start p-3.5 sm:p-4 bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] transition-colors flex items-center justify-between gap-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-default)]/50 cursor-pointer"
                                      >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <ChevronDown
                                            className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${
                                              isExpanded ? "rotate-180 text-[var(--color-primary-default)]" : ""
                                            }`}
                                          />
                                          <span className="text-[11px] font-bold text-[var(--color-primary-default)] bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 rounded shrink-0">
                                            جلسه {toPersianDigits(i + 1)}
                                          </span>
                                          <h5 className="font-bold text-xs sm:text-sm text-[var(--color-text)] leading-snug break-words">
                                            {session.title || `جلسه ${toPersianDigits(i + 1)}`}
                                          </h5>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[var(--color-text-muted)] shrink-0 me-2">
                                          <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                                          <span>
                                            {toPersianDigits(session.estimatedMinutes ?? 10)} دقیقه
                                          </span>
                                        </div>
                                      </button>

                                      {/* Expanded Markdown Body */}
                                      {isExpanded && (
                                        <div className="p-5 border-t border-[var(--color-border)] leading-relaxed text-[var(--color-text)] animate-in fade-in duration-150">
                                          <MarkdownRenderer
                                            content={session.contentMarkdown || "بدون متن"}
                                            enableLessonCallouts
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            /* Master Unified Lesson Content */
                            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                              <div className="p-4 sm:p-4.5 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]">
                                <h5 className="font-bold text-sm sm:text-base text-[var(--color-text)] break-words">
                                  {detailData.preview.lesson.title || "متن کامل درسنامه"}
                                </h5>
                              </div>
                              <div className="p-5 leading-relaxed text-[var(--color-text)]">
                                <MarkdownRenderer
                                  content={detailData.preview.lesson.contentMarkdown || "بدون متن"}
                                  enableLessonCallouts
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {activePreviewTab === "flashcard" && detailData.preview?.flashcard && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                            <h4 className="font-bold text-base text-[var(--color-text)]">
                              {detailData.preview.flashcard.title || "فلش‌کارت‌های آموزشی"}
                            </h4>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {detailData.preview.flashcard.totalCards ||
                                detailData.preview.flashcard.cards?.length ||
                                0}{" "}
                              کارت
                            </span>
                          </div>

                          {(detailData.preview.flashcard.cards ?? []).length === 0 ? (
                            <p className="text-xs text-[var(--color-text-muted)] py-8 text-center">
                              کارت فلش‌کارتی برای این بسته ثبت نشده است.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                              {(detailData.preview.flashcard.cards ?? []).map((card, i) => (
                                <div
                                  key={i}
                                  className="bg-[var(--color-surface)] p-4 rounded-xl border border-[var(--color-border)] flex flex-col justify-between gap-3 shadow-sm"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2 py-0.5 rounded">
                                        کارت {toPersianDigits(i + 1)}
                                      </span>
                                      {card.difficulty && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                                          {card.difficulty === "hard"
                                            ? "سخت"
                                            : card.difficulty === "medium"
                                            ? "متوسط"
                                            : "آسان"}
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-semibold text-[var(--color-text-muted)] block mb-0.5">
                                        روی کارت (پرسش / مفهوم):
                                      </span>
                                      <div className="text-[var(--color-text)] text-xs font-medium leading-relaxed">
                                        <RichContent content={card.front || "-"} inline />
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-[var(--color-border)]">
                                      <span className="text-[11px] font-semibold text-[var(--color-text-muted)] block mb-0.5">
                                        پشت کارت (پاسخ تشریحی):
                                      </span>
                                      <div className="text-[var(--color-text)] text-xs leading-relaxed">
                                        <RichContent content={card.back || "-"} inline />
                                      </div>
                                    </div>
                                  </div>
                                  {card.explanation && (
                                    <div className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] p-2.5 rounded-lg border border-[var(--color-border)]">
                                      توضیح: <RichContent content={card.explanation} inline />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {activePreviewTab === "quiz" && detailData.preview?.quiz && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                            <h4 className="font-bold text-base text-[var(--color-text)]">
                              {detailData.preview.quiz.title || "آزمون ارزیابی"}
                            </h4>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {detailData.preview.quiz.totalQuestions ||
                                detailData.preview.quiz.questions?.length ||
                                0}{" "}
                              سوال
                            </span>
                          </div>

                          {(detailData.preview.quiz.questions ?? []).length === 0 ? (
                            <p className="text-xs text-[var(--color-text-muted)] py-8 text-center">
                              سوالی برای این آزمون ثبت نشده است.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {(detailData.preview.quiz.questions ?? []).map((q, i) => (
                                <div
                                  key={i}
                                  className="bg-[var(--color-surface)] p-4 sm:p-5 rounded-xl border border-[var(--color-border)] space-y-3 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="font-bold text-[var(--color-text)] text-sm leading-snug">
                                      <span className="text-[var(--color-primary-default)] ms-1.5">{i + 1}.</span>
                                      <RichContent content={q.question || "سوال تستی"} inline />
                                    </div>
                                    {q.category && (
                                      <span className="text-[10px] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)] px-2 py-0.5 rounded whitespace-nowrap">
                                        {q.category}
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {(q.choices ?? []).map((choice, ci) => {
                                      const isCorrect = choice === q.correctAnswer;
                                      return (
                                        <div
                                          key={ci}
                                          className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                                            isCorrect
                                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold"
                                              : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text)]"
                                          }`}
                                        >
                                          <span className="leading-relaxed">
                                            <RichContent content={choice} inline />
                                          </span>
                                          {isCorrect && (
                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold shrink-0 me-2">
                                              پاسخ صحیح
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {q.explanation && (
                                    <div className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] p-2.5 rounded-lg border border-[var(--color-border)] leading-relaxed">
                                      <strong className="text-[var(--color-text)]">
                                        توضیح پاسخ:
                                      </strong>{" "}
                                      <RichContent content={q.explanation} inline />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {activePreviewTab === "summary" && detailData.preview?.review_summary && (
                        <div className="space-y-4">
                          <div className="pb-2 border-b border-[var(--color-border)]">
                            <h4 className="font-bold text-base text-[var(--color-text)]">
                              {detailData.preview.review_summary.title || "خلاصه مروری"}
                            </h4>
                          </div>

                          <div className="bg-[var(--color-surface)] p-5 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] leading-relaxed text-xs">
                            <MarkdownRenderer
                              content={
                                detailData.preview.review_summary.summary ||
                                detailData.preview.review_summary.overview ||
                                "خلاصه‌ای ثبت نشده است."
                              }
                            />
                          </div>

                          {Array.isArray(detailData.preview.review_summary.sections) &&
                            detailData.preview.review_summary.sections.length > 0 && (
                              <div className="space-y-3 pt-2">
                                <h5 className="font-bold text-xs text-[var(--color-text-muted)]">
                                  نکات کلیدی به تفکیک بخش‌ها:
                                </h5>
                                {detailData.preview.review_summary.sections.map((sec, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="bg-[var(--color-surface)] p-4 rounded-xl border border-[var(--color-border)] space-y-1.5"
                                  >
                                    <span className="font-bold text-xs text-[var(--color-primary-default)] block">
                                      {sec.title}
                                    </span>
                                    {Array.isArray(sec.keyPoints) && (
                                      <ul className="list-disc list-inside text-xs text-[var(--color-text)] space-y-1 pe-1">
                                        {sec.keyPoints.map((kp, kIdx) => (
                                          <li key={kIdx} className="leading-relaxed">
                                            {kp}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Monetization & Moderation Decision Box */}
                  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-[var(--color-primary-default)]" />
                      <h3 className="font-bold text-[var(--color-text)]">
                        تعیین مدل دسترسی و قیمت فروش (توسط ادمین)
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Free Radio Option */}
                      <label
                        htmlFor={freeRadioId}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          accessType === "free"
                            ? "bg-[var(--color-surface-warm)] border-[var(--color-primary-default)] text-[var(--color-text)] shadow-sm ring-1 ring-[var(--color-primary-default)]/40"
                            : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)]"
                        }`}
                      >
                        <input
                          id={freeRadioId}
                          type="radio"
                          name="accessType"
                          checked={accessType === "free"}
                          onChange={() => setAccessType("free")}
                          className="mt-1 text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] bg-[var(--color-surface)] border-[var(--color-border)]"
                        />
                        <div>
                          <span className="font-bold text-[var(--color-text)] block">
                            بسته رایگان (Free)
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)] block mt-0.5">
                            تمامی کاربران و دانشجویان بدون پرداخت هزینه به این بسته دسترسی خواهند داشت.
                          </span>
                        </div>
                      </label>

                      {/* Paid Radio Option */}
                      <label
                        htmlFor={paidRadioId}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          accessType === "paid"
                            ? "bg-[var(--color-surface-warm)] border-[var(--color-primary-default)] text-[var(--color-text)] shadow-sm ring-1 ring-[var(--color-primary-default)]/40"
                            : "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)]"
                        }`}
                      >
                        <input
                          id={paidRadioId}
                          type="radio"
                          name="accessType"
                          checked={accessType === "paid"}
                          onChange={() => setAccessType("paid")}
                          className="mt-1 text-[var(--color-primary-default)] focus:ring-[var(--color-primary-default)] bg-[var(--color-surface)] border-[var(--color-border)]"
                        />
                        <div>
                          <span className="font-bold text-[var(--color-text)] block">
                            بسته پولی (Paid)
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)] block mt-0.5">
                            نیاز به خرید تکی یا اشتراک فعال برای اضافه کردن به دوره‌ها.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Price Input (if paid) */}
                    {accessType === "paid" && (
                      <div className="bg-[var(--color-surface-subtle)] p-4 rounded-xl border border-[var(--color-border)] space-y-2">
                        <label className="block text-xs font-semibold text-[var(--color-text)]">
                          قیمت فروش به تومان:
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder="مثال: ۱۰۰,۰۰۰"
                            className="px-3.5 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] w-48 font-mono focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-[var(--color-primary-default)]"
                          />
                          <span className="text-sm font-medium text-[var(--color-text-muted)]">تومان</span>
                          {priceInput && !isNaN(parseInt(priceInput.replace(/\D/g, ""), 10)) && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                              {parseInt(priceInput.replace(/\D/g, ""), 10).toLocaleString("fa-IR")}{" "}
                              تومان
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rejection Form Box */}
                  {showRejectForm && (
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                        <XCircle className="w-5 h-5 text-rose-500" />
                        <h4 className="font-bold">علت رد انتشار بسته</h4>
                      </div>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="علت رد بسته را بنویسید (مثلاً کیفیت پایین سوالات، نقض قوانین، و...)..."
                        rows={3}
                        className="w-full p-3 text-sm rounded-xl border border-rose-500/30 bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowRejectForm(false)}
                          className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
                        >
                          انصراف
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={submittingAction}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                        >
                          {submittingAction ? "در حال ثبت..." : "تأیید رد بسته"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] flex items-center justify-between">
              <div>
                {!showRejectForm && detailData?.pack.status !== "rejected" && (
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="px-3.5 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>رد بسته</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={closeReviewModal}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl transition-colors"
                >
                  بستن
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submittingAction || detailLoading}
                  className="px-5 py-2 text-sm font-bold text-white bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submittingAction
                      ? "در حال ثبت..."
                      : detailData?.pack.status === "published"
                      ? "بروزرسانی مدل دسترسی / قیمت"
                      : "تأیید و انتشار بسته"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
