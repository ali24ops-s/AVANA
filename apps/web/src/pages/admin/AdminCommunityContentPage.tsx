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
    <div className="space-y-6 text-slate-200" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-6 h-6 text-teal-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
              بررسی و قیمت‌گذاری محتوای کامیونیتی
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            محتواهای ارسالی کاربران را بررسی کرده و مدل دسترسی (رایگان یا پولی) و قیمت فروش آن‌ها را تعیین کنید.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
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
                  ? "bg-teal-600 text-white shadow-sm border-teal-500 font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent"
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
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-2xl text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-slate-400 glass-panel border border-slate-800 rounded-2xl">
          در حال بارگذاری بسته‌ها...
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-16 glass-panel border border-slate-800 rounded-2xl">
          <PackageCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">هیچ بسته‌ای در این وضعیت یافت نشد.</p>
        </div>
      ) : (
        <div className="glass-panel border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-850/70 text-slate-400 border-b border-slate-800 text-xs font-semibold">
                <tr>
                  <th className="py-3.5 px-4">عنوان بسته</th>
                  <th className="py-3.5 px-4">سازنده</th>
                  <th className="py-3.5 px-4">محتویات</th>
                  <th className="py-3.5 px-4">وضعیت</th>
                  <th className="py-3.5 px-4">مدل دسترسی و قیمت</th>
                  <th className="py-3.5 px-4">تاریخ</th>
                  <th className="py-3.5 px-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
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
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100">
                          {pack.title}
                        </div>
                        {pack.subject && (
                          <span className="inline-block mt-0.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
                            {pack.subject}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{pack.creator?.name || "کاربر آوانا"}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span title="تعداد جلسات">{pack.stats?.sessionCount ?? 0} درس</span>
                          <span>•</span>
                          <span title="تعداد فلش‌کارت">{pack.stats?.flashcardCount ?? 0} کارت</span>
                          <span>•</span>
                          <span title="تعداد سوالات آزمون">{pack.stats?.quizQuestionCount ?? 0} سوال</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <AdminStatusBadge status={pack.status} />
                      </td>
                      <td className="py-3.5 px-4">
                        {isFree ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                            رایگان
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/60">
                            {price
                              ? `${price.toLocaleString("fa-IR")} تومان`
                              : "پولی"}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(pack.createdAt).toLocaleDateString("fa-IR")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPack(pack.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 rounded-xl transition-all shadow-xs"
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

          <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-between items-center">
            <span className="text-xs text-slate-400">
              نمایش {packs.length} از {totalCount} بسته
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl w-full max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto text-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-850/90">
              <div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-teal-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    {detailData?.pack?.title || "بررسی بسته آموزشی"}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>توسط: {detailData?.pack?.creator?.name || "کاربر آوانا"}</span>
                  {detailData?.pack?.subject && <span>• رشته: {detailData.pack.subject}</span>}
                  <span>• {detailData?.itemsCount ?? 0} آیتم محتوایی</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                aria-label="بستن"
                className="p-2 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-200">
              {detailLoading ? (
                <div className="py-16 text-center text-slate-400">
                  در حال دریافت پیش‌نمایش و محتویات بسته...
                </div>
              ) : detailError ? (
                <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span>{detailError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedPackId && openReviewModal(selectedPackId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تلاش مجدد</span>
                  </button>
                </div>
              ) : detailData ? (
                <>
                  {/* Action Success Message */}
                  {actionSuccessMessage && (
                    <div className="p-4 bg-emerald-950/40 border border-emerald-800 rounded-xl text-emerald-300 text-sm flex items-center gap-2">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <span>{actionSuccessMessage}</span>
                    </div>
                  )}

                  {/* Source Document Reference */}
                  {detailData.sourceDocument && (
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-400">
                            سند منبع (Source Document):
                          </div>
                          <div className="text-sm font-bold text-slate-100 mt-0.5">
                            {detailData.sourceDocument.originalName}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
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
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 rounded-xl transition-colors shrink-0"
                        >
                          <Download className="w-4 h-4" />
                          <span>دانلود / مشاهده فایل مرجع</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Pack Description */}
                  {detailData.pack?.description && (
                    <div className="bg-slate-800/30 p-4 rounded-xl text-sm text-slate-300 leading-relaxed border border-slate-800">
                      <span className="font-semibold block mb-1 text-slate-100">
                        توضیحات بسته:
                      </span>
                      {detailData.pack.description}
                    </div>
                  )}

                  {/* Content Preview Tabs */}
                  <div>
                    <div className="flex border-b border-slate-800 mb-4 gap-2">
                      {detailData.preview?.lesson && (
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("lesson")}
                          className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activePreviewTab === "lesson"
                              ? "border-teal-400 text-teal-400 font-bold"
                              : "border-transparent text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>
                            درس‌ها (
                            {detailData.preview.lesson.sessionCount ??
                              detailData.preview.lesson.sessions?.length ??
                              (detailData.preview.lesson.contentMarkdown ? 1 : 0)}
                            )
                          </span>
                        </button>
                      )}
                      {detailData.preview?.flashcard && (
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("flashcard")}
                          className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activePreviewTab === "flashcard"
                              ? "border-teal-400 text-teal-400 font-bold"
                              : "border-transparent text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Layers className="w-4 h-4" />
                          <span>
                            فلش‌کارت‌ها (
                            {detailData.preview.flashcard.totalCards ??
                              detailData.preview.flashcard.cards?.length ??
                              0}
                            )
                          </span>
                        </button>
                      )}
                      {detailData.preview?.quiz && (
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("quiz")}
                          className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activePreviewTab === "quiz"
                              ? "border-teal-400 text-teal-400 font-bold"
                              : "border-transparent text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <HelpCircle className="w-4 h-4" />
                          <span>
                            آزمون تستی (
                            {detailData.preview.quiz.totalQuestions ??
                              detailData.preview.quiz.questions?.length ??
                              0}
                            )
                          </span>
                        </button>
                      )}
                      {detailData.preview?.review_summary && (
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("summary")}
                          className={`pb-2.5 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            activePreviewTab === "summary"
                              ? "border-teal-400 text-teal-400 font-bold"
                              : "border-transparent text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <FileCheck className="w-4 h-4" />
                          <span>خلاصه مروری</span>
                        </button>
                      )}
                    </div>

                    {/* Tab Panels with Dedicated Reading Surface */}
                    <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-5 max-h-[500px] overflow-y-auto text-sm text-slate-200">
                      {activePreviewTab === "lesson" && detailData.preview?.lesson && (
                        <div className="space-y-5">
                          {/* Course / Lesson Header */}
                          <div className="bg-slate-900/60 p-4 sm:p-5 rounded-xl border border-slate-800/80 space-y-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="text-[11px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 rounded-full">
                                  درسنامه آموزشی
                                </span>
                                {detailData.preview.lesson.hasCanonicalSessions === false && (
                                  <span className="text-[11px] font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 rounded-full">
                                    محتوای یکپارچه درسنامه
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base sm:text-lg font-bold text-slate-100 leading-relaxed break-words">
                                {detailData.preview.lesson.title || "درسنامه جامع آموزشی"}
                              </h4>
                            </div>

                            {/* Metadata Section: unconstrained, clean RTL typography */}
                            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                                <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                <span>
                                  {(
                                    detailData.preview.lesson.sessionCount ||
                                    detailData.preview.lesson.sessions?.length ||
                                    1
                                  ).toLocaleString("fa-IR")}{" "}
                                  جلسه درسنامه
                                </span>
                              </span>
                              <span className="text-slate-600 select-none">•</span>
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                                <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
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
                            <p className="text-xs text-slate-400 py-8 text-center">
                              جلسه‌ای برای این درسنامه ثبت نشده است.
                            </p>
                          ) : Array.isArray(detailData.preview.lesson.sessions) &&
                            detailData.preview.lesson.sessions.length > 0 ? (
                            <div className="space-y-3 pt-1">
                              {/* Toggle All Action Header (when > 1 session) */}
                              {detailData.preview.lesson.sessions.length > 1 && (
                                <div className="flex items-center justify-between pb-1 px-1">
                                  <span className="text-xs font-semibold text-slate-400">
                                    فهرست جلسات و سرفصل‌ها:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={toggleAllSessions}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors py-1 px-2.5 rounded-lg hover:bg-slate-800/60 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
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
                                      className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-sm transition-all"
                                    >
                                      {/* Clickable Header Button */}
                                      <button
                                        type="button"
                                        onClick={() => toggleSession(i)}
                                        aria-expanded={isExpanded}
                                        className="w-full text-right p-3.5 sm:p-4 bg-slate-850/70 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3 focus:outline-none focus:ring-1 focus:ring-teal-500/50 cursor-pointer"
                                      >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <ChevronDown
                                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                                              isExpanded ? "rotate-180 text-teal-400" : ""
                                            }`}
                                          />
                                          <span className="text-[11px] font-bold text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded shrink-0">
                                            جلسه {(i + 1).toLocaleString("fa-IR")}
                                          </span>
                                          <h5 className="font-bold text-xs sm:text-sm text-slate-100 leading-snug break-words">
                                            {session.title || `جلسه ${(i + 1).toLocaleString("fa-IR")}`}
                                          </h5>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 shrink-0 mr-2">
                                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                                          <span>
                                            {(session.estimatedMinutes ?? 10).toLocaleString("fa-IR")} دقیقه
                                          </span>
                                        </div>
                                      </button>

                                      {/* Expanded Markdown Body */}
                                      {isExpanded && (
                                        <div className="p-5 border-t border-slate-800/80 leading-relaxed text-slate-200 animate-in fade-in duration-150">
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
                            <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
                              <div className="p-4 sm:p-4.5 bg-slate-850/70 border-b border-slate-800">
                                <h5 className="font-bold text-sm sm:text-base text-slate-100 break-words">
                                  {detailData.preview.lesson.title || "متن کامل درسنامه"}
                                </h5>
                              </div>
                              <div className="p-5 leading-relaxed text-slate-200">
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
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <h4 className="font-bold text-base text-slate-100">
                              {detailData.preview.flashcard.title || "فلش‌کارت‌های آموزشی"}
                            </h4>
                            <span className="text-xs text-slate-400">
                              {detailData.preview.flashcard.totalCards ||
                                detailData.preview.flashcard.cards?.length ||
                                0}{" "}
                              کارت
                            </span>
                          </div>

                          {(detailData.preview.flashcard.cards ?? []).length === 0 ? (
                            <p className="text-xs text-slate-400 py-8 text-center">
                              کارت فلش‌کارتی برای این بسته ثبت نشده است.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                              {(detailData.preview.flashcard.cards ?? []).map((card, i) => (
                                <div
                                  key={i}
                                  className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-3 shadow-sm"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
                                        کارت {i + 1}
                                      </span>
                                      {card.difficulty && (
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                          {card.difficulty === "hard"
                                            ? "سخت"
                                            : card.difficulty === "medium"
                                            ? "متوسط"
                                            : "آسان"}
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                                        روی کارت (پرسش / مفهوم):
                                      </span>
                                      <div className="text-slate-100 text-xs font-medium leading-relaxed">
                                        <RichContent content={card.front || "-"} inline />
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-slate-800">
                                      <span className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                                        پشت کارت (پاسخ تشریحی):
                                      </span>
                                      <div className="text-slate-200 text-xs leading-relaxed">
                                        <RichContent content={card.back || "-"} inline />
                                      </div>
                                    </div>
                                  </div>
                                  {card.explanation && (
                                    <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
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
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <h4 className="font-bold text-base text-slate-100">
                              {detailData.preview.quiz.title || "آزمون ارزیابی"}
                            </h4>
                            <span className="text-xs text-slate-400">
                              {detailData.preview.quiz.totalQuestions ||
                                detailData.preview.quiz.questions?.length ||
                                0}{" "}
                              سوال
                            </span>
                          </div>

                          {(detailData.preview.quiz.questions ?? []).length === 0 ? (
                            <p className="text-xs text-slate-400 py-8 text-center">
                              سوالی برای این آزمون ثبت نشده است.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {(detailData.preview.quiz.questions ?? []).map((q, i) => (
                                <div
                                  key={i}
                                  className="bg-slate-900/90 p-4 sm:p-5 rounded-xl border border-slate-800 space-y-3 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="font-bold text-slate-100 text-sm leading-snug">
                                      <span className="text-teal-400 ml-1.5">{i + 1}.</span>
                                      <RichContent content={q.question || "سوال تستی"} inline />
                                    </div>
                                    {q.category && (
                                      <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded whitespace-nowrap">
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
                                              ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 font-semibold"
                                              : "bg-slate-800/40 border-slate-700/60 text-slate-300"
                                          }`}
                                        >
                                          <span className="leading-relaxed">
                                            <RichContent content={choice} inline />
                                          </span>
                                          {isCorrect && (
                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold shrink-0 mr-2">
                                              پاسخ صحیح
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {q.explanation && (
                                    <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                                      <strong className="text-slate-200">
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
                          <div className="pb-2 border-b border-slate-800">
                            <h4 className="font-bold text-base text-slate-100">
                              {detailData.preview.review_summary.title || "خلاصه مروری"}
                            </h4>
                          </div>

                          <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 text-slate-200 leading-relaxed text-xs">
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
                                <h5 className="font-bold text-xs text-slate-300">
                                  نکات کلیدی به تفکیک بخش‌ها:
                                </h5>
                                {detailData.preview.review_summary.sections.map((sec, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-1.5"
                                  >
                                    <span className="font-bold text-xs text-teal-400 block">
                                      {sec.title}
                                    </span>
                                    {Array.isArray(sec.keyPoints) && (
                                      <ul className="list-disc list-inside text-xs text-slate-300 space-y-1 pr-1">
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
                  <div className="bg-teal-950/20 border border-teal-500/30 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-teal-400" />
                      <h3 className="font-bold text-slate-100">
                        تعیین مدل دسترسی و قیمت فروش (توسط ادمین)
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Free Radio Option */}
                      <label
                        htmlFor={freeRadioId}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          accessType === "free"
                            ? "bg-slate-850 border-teal-500 text-slate-100 shadow-md ring-1 ring-teal-500/50"
                            : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50"
                        }`}
                      >
                        <input
                          id={freeRadioId}
                          type="radio"
                          name="accessType"
                          checked={accessType === "free"}
                          onChange={() => setAccessType("free")}
                          className="mt-1 text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-700"
                        />
                        <div>
                          <span className="font-bold text-slate-100 block">
                            بسته رایگان (Free)
                          </span>
                          <span className="text-xs text-slate-400 block mt-0.5">
                            تمامی کاربران و دانشجویان بدون پرداخت هزینه به این بسته دسترسی خواهند داشت.
                          </span>
                        </div>
                      </label>

                      {/* Paid Radio Option */}
                      <label
                        htmlFor={paidRadioId}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          accessType === "paid"
                            ? "bg-slate-850 border-teal-500 text-slate-100 shadow-md ring-1 ring-teal-500/50"
                            : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50"
                        }`}
                      >
                        <input
                          id={paidRadioId}
                          type="radio"
                          name="accessType"
                          checked={accessType === "paid"}
                          onChange={() => setAccessType("paid")}
                          className="mt-1 text-teal-500 focus:ring-teal-500 bg-slate-900 border-slate-700"
                        />
                        <div>
                          <span className="font-bold text-slate-100 block">
                            بسته پولی (Paid)
                          </span>
                          <span className="text-xs text-slate-400 block mt-0.5">
                            نیاز به خرید تکی یا اشتراک فعال برای اضافه کردن به دوره‌ها.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Price Input (if paid) */}
                    {accessType === "paid" && (
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-750 space-y-2">
                        <label className="block text-xs font-semibold text-slate-300">
                          قیمت فروش به تومان:
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder="مثال: ۱۰۰,۰۰۰"
                            className="px-3.5 py-2 text-sm rounded-lg border border-slate-700 bg-slate-950 text-slate-100 w-48 font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                          <span className="text-sm font-medium text-slate-400">تومان</span>
                          {priceInput && !isNaN(parseInt(priceInput.replace(/\D/g, ""), 10)) && (
                            <span className="text-xs text-emerald-300 font-semibold bg-emerald-950/50 border border-emerald-800/60 px-2 py-1 rounded">
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
                    <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-red-300">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <h4 className="font-bold">علت رد انتشار بسته</h4>
                      </div>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="علت رد بسته را بنویسید (مثلاً کیفیت پایین سوالات، نقض قوانین، و...)..."
                        rows={3}
                        className="w-full p-3 text-sm rounded-xl border border-red-500/40 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowRejectForm(false)}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          انصراف
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={submittingAction}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-sm disabled:opacity-50"
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
            <div className="p-4 border-t border-slate-800 bg-slate-850/90 flex items-center justify-between">
              <div>
                {!showRejectForm && detailData?.pack.status !== "rejected" && (
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="px-3.5 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/30 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>رد بسته</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={closeReviewModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  بستن
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submittingAction || detailLoading}
                  className="px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-all shadow-lg shadow-teal-900/40 flex items-center gap-2 disabled:opacity-50"
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
