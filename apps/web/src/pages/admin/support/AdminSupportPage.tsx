import { useState } from "react";
import {
  Button,
  Badge,
  Input,
  AvanaSelect,
  LoadingState,
  Alert,
} from "@avana/ui";
import {
  LifeBuoy,
  Search,
  Eye,
  Inbox,
} from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatPersianDateTime,
  getFeedbackStatusBadgeVariant,
  getPriorityBadgeVariant,
  getTicketStatusBadgeVariant,
} from "../../../components/support/supportUiHelpers.js";
import { TicketConversationModal } from "../../../components/support/TicketConversationModal.js";
import { FeedbackDetailModal } from "../../../components/support/FeedbackDetailModal.js";
import {
  useAdminFeedbacks,
  useAdminTickets,
} from "../../../hooks/useSupport.js";
import type {
  FeedbackItem,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  FeedbackType,
  FeedbackCategory,
  FeedbackStatus,
} from "@avana/domain";
import { toPersianDigits, formatPersianOf } from "@avana/domain";

type AdminSupportTab = "tickets" | "feedback";

export function AdminSupportPage() {
  const [activeTab, setActiveTab] = useState<AdminSupportTab>("tickets");

  // Ticket filters & pagination
  const [ticketCategory, setTicketCategory] = useState<string>("all");
  const [ticketPriority, setTicketPriority] = useState<string>("all");
  const [ticketStatus, setTicketStatus] = useState<string>("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketPage, setTicketPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Feedback filters & pagination
  const [feedbackType, setFeedbackType] = useState<string>("all");
  const [feedbackCategory, setFeedbackCategory] = useState<string>("all");
  const [feedbackStatus, setFeedbackStatus] = useState<string>("all");
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  // Queries
  const {
    data: ticketsData,
    isLoading: isTicketsLoading,
    error: ticketsError,
    refetch: refetchTickets,
  } = useAdminTickets({
    category: ticketCategory !== "all" ? ticketCategory : undefined,
    priority: ticketPriority !== "all" ? ticketPriority : undefined,
    status: ticketStatus !== "all" ? ticketStatus : undefined,
    search: ticketSearch.trim() || undefined,
    page: ticketPage,
    limit: 20,
  });

  const {
    data: feedbacksData,
    isLoading: isFeedbacksLoading,
    error: feedbacksError,
    refetch: refetchFeedbacks,
  } = useAdminFeedbacks({
    type: feedbackType !== "all" ? feedbackType : undefined,
    category: feedbackCategory !== "all" ? feedbackCategory : undefined,
    status: feedbackStatus !== "all" ? feedbackStatus : undefined,
    search: feedbackSearch.trim() || undefined,
    page: feedbackPage,
    limit: 20,
  });

  return (
    <div className="space-y-6 font-sans pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
              مرکز پشتیبانی و بازخورد
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
            مدیریت تیکت‌های پشتیبانی، مکالمه با کاربران، ثبت یادداشت‌های داخلی و پاسخگویی به بازخوردها
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] self-start sm:self-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("tickets")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "tickets"
                ? "bg-[var(--color-surface)] text-primary shadow-sm font-bold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            تیکت‌های پشتیبانی ({toPersianDigits(ticketsData?.total ?? 0)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("feedback")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "feedback"
                ? "bg-[var(--color-surface)] text-primary shadow-sm font-bold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            پیشنهادات و بازخوردها ({toPersianDigits(feedbacksData?.total ?? 0)})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: SUPPORT TICKETS */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div>
                <Input
                  value={ticketSearch}
                  onChange={(e) => {
                    setTicketSearch(e.target.value);
                    setTicketPage(1);
                  }}
                  placeholder="جستجو در عنوان، شرح، کاربر..."
                  startIcon={<Search className="w-4 h-4 text-[var(--color-text-muted)]" />}
                />
              </div>

              {/* Category Filter */}
              <div>
                <AvanaSelect
                  value={ticketCategory}
                  onChange={(val) => {
                    setTicketCategory(String(Array.isArray(val) ? val[0] : val));
                    setTicketPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه دسته‌بندی‌ها" },
                    ...Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    })),
                  ]}
                />
              </div>

              {/* Status Filter */}
              <div>
                <AvanaSelect
                  value={ticketStatus}
                  onChange={(val) => {
                    setTicketStatus(String(Array.isArray(val) ? val[0] : val));
                    setTicketPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه وضعیت‌ها" },
                    ...Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    })),
                  ]}
                />
              </div>

              {/* Priority Filter */}
              <div>
                <AvanaSelect
                  value={ticketPriority}
                  onChange={(val) => {
                    setTicketPriority(String(Array.isArray(val) ? val[0] : val));
                    setTicketPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه اولویت‌ها" },
                    ...Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => ({
                      value: k,
                      label: `اولویت: ${v}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Tickets Table */}
          {isTicketsLoading ? (
            <div className="py-16 flex items-center justify-center">
              <LoadingState message="در حال بارگذاری تیکت‌های پشتیبانی..." />
            </div>
          ) : ticketsError ? (
            <Alert variant="error" title="خطا در دریافت تیکت‌ها">
              {(ticketsError as Error)?.message || "خطایی رخ داد."}
            </Alert>
          ) : !ticketsData?.items || ticketsData.items.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-2">
              <Inbox className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
              <p className="text-sm font-semibold text-[var(--color-text)]">
                تیکتی با این فیلترها یافت نشد
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <tr>
                      <th className="p-3.5 font-bold">کاربر</th>
                      <th className="p-3.5 font-bold">عنوان تیکت</th>
                      <th className="p-3.5 font-bold">دسته‌بندی</th>
                      <th className="p-3.5 font-bold">اولویت</th>
                      <th className="p-3.5 font-bold">وضعیت</th>
                      <th className="p-3.5 font-bold">آخرین فعالیت</th>
                      <th className="p-3.5 font-bold text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {ticketsData.items.map((ticket) => (
                      <tr
                        key={ticket.id}
                        className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
                      >
                        <td className="p-3.5 max-w-[160px] truncate">
                          <div className="font-bold text-[var(--color-text)] truncate">
                            {ticket.userName || "کاربر"}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate" dir="ltr">
                            {ticket.userEmail}
                          </div>
                        </td>

                        <td className="p-3.5 max-w-[220px]">
                          <div className="font-bold text-[var(--color-text)] truncate">
                            {ticket.title}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                            {ticket.description}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral" size="sm">
                            {TICKET_CATEGORY_LABELS[ticket.category as TicketCategory] || ticket.category}
                          </Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge
                            variant={getPriorityBadgeVariant(ticket.priority)}
                            size="sm"
                          >
                            {TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority] || ticket.priority}
                          </Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge
                            variant={getTicketStatusBadgeVariant(ticket.status)}
                            size="sm"
                          >
                            {TICKET_STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                          {formatPersianDateTime(ticket.lastActivityAt)}
                        </td>

                        <td className="p-3.5 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedTicketId(ticket.id)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            className="text-xs"
                          >
                            بررسی و پاسخ
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {ticketsData.totalPages > 1 && (
                <div className="p-3.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>
                    {formatPersianOf(ticketsData.page, ticketsData.totalPages, { prefix: "صفحه" })} (مجموع: {toPersianDigits(ticketsData.total)})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ticketsData.page <= 1}
                      onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
                    >
                      قبلی
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ticketsData.page >= ticketsData.totalPages}
                      onClick={() => setTicketPage((p) => p + 1)}
                    >
                      بعدی
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 2: FEEDBACK & SUGGESTIONS */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div>
                <Input
                  value={feedbackSearch}
                  onChange={(e) => {
                    setFeedbackSearch(e.target.value);
                    setFeedbackPage(1);
                  }}
                  placeholder="جستجو در عنوان، متن، کاربر..."
                  startIcon={<Search className="w-4 h-4 text-[var(--color-text-muted)]" />}
                />
              </div>

              {/* Type Filter */}
              <div>
                <AvanaSelect
                  value={feedbackType}
                  onChange={(val) => {
                    setFeedbackType(String(Array.isArray(val) ? val[0] : val));
                    setFeedbackPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه انواع بازخورد" },
                    ...Object.entries(FEEDBACK_TYPE_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    })),
                  ]}
                />
              </div>

              {/* Category Filter */}
              <div>
                <AvanaSelect
                  value={feedbackCategory}
                  onChange={(val) => {
                    setFeedbackCategory(String(Array.isArray(val) ? val[0] : val));
                    setFeedbackPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه دسته‌بندی‌ها" },
                    ...Object.entries(FEEDBACK_CATEGORY_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    })),
                  ]}
                />
              </div>

              {/* Status Filter */}
              <div>
                <AvanaSelect
                  value={feedbackStatus}
                  onChange={(val) => {
                    setFeedbackStatus(String(Array.isArray(val) ? val[0] : val));
                    setFeedbackPage(1);
                  }}
                  options={[
                    { value: "all", label: "همه وضعیت‌ها" },
                    ...Object.entries(FEEDBACK_STATUS_LABELS).map(([k, v]) => ({
                      value: k,
                      label: v,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Feedback Table */}
          {isFeedbacksLoading ? (
            <div className="py-16 flex items-center justify-center">
              <LoadingState message="در حال بارگذاری بازخوردها..." />
            </div>
          ) : feedbacksError ? (
            <Alert variant="error" title="خطا در دریافت بازخوردها">
              {(feedbacksError as Error)?.message || "خطایی رخ داد."}
            </Alert>
          ) : !feedbacksData?.items || feedbacksData.items.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-2">
              <Inbox className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
              <p className="text-sm font-semibold text-[var(--color-text)]">
                بازخوردی با این فیلترها یافت نشد
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <tr>
                      <th className="p-3.5 font-bold">کاربر</th>
                      <th className="p-3.5 font-bold">عنوان بازخورد</th>
                      <th className="p-3.5 font-bold">نوع</th>
                      <th className="p-3.5 font-bold">دسته‌بندی</th>
                      <th className="p-3.5 font-bold">وضعیت</th>
                      <th className="p-3.5 font-bold">تاریخ ثبت</th>
                      <th className="p-3.5 font-bold text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {feedbacksData.items.map((fb) => (
                      <tr
                        key={fb.id}
                        className="hover:bg-[var(--color-surface-warm)]/50 transition-colors"
                      >
                        <td className="p-3.5 max-w-[160px] truncate">
                          <div className="font-bold text-[var(--color-text)] truncate">
                            {fb.userName || "کاربر"}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate" dir="ltr">
                            {fb.userEmail}
                          </div>
                        </td>

                        <td className="p-3.5 max-w-[240px]">
                          <div className="font-bold text-[var(--color-text)] truncate">
                            {fb.title}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                            {fb.description}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral" size="sm">
                            {FEEDBACK_TYPE_LABELS[fb.type as FeedbackType] || fb.type}
                          </Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge variant="neutral" size="sm">
                            {FEEDBACK_CATEGORY_LABELS[fb.category as FeedbackCategory] || fb.category}
                          </Badge>
                        </td>

                        <td className="p-3.5">
                          <Badge
                            variant={getFeedbackStatusBadgeVariant(fb.status)}
                            size="sm"
                          >
                            {FEEDBACK_STATUS_LABELS[fb.status as FeedbackStatus] || fb.status}
                          </Badge>
                        </td>

                        <td className="p-3.5 text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                          {formatPersianDateTime(fb.createdAt)}
                        </td>

                        <td className="p-3.5 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedFeedback(fb)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            className="text-xs"
                          >
                            مشاهده و پاسخ
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {feedbacksData.totalPages > 1 && (
                <div className="p-3.5 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>
                    {formatPersianOf(feedbacksData.page, feedbacksData.totalPages, { prefix: "صفحه" })} (مجموع: {toPersianDigits(feedbacksData.total)})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={feedbacksData.page <= 1}
                      onClick={() => setFeedbackPage((p) => Math.max(1, p - 1))}
                    >
                      قبلی
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={feedbacksData.page >= feedbacksData.totalPages}
                      onClick={() => setFeedbackPage((p) => p + 1)}
                    >
                      بعدی
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin Conversation Modal */}
      <TicketConversationModal
        ticketId={selectedTicketId}
        isOpen={Boolean(selectedTicketId)}
        onClose={() => {
          setSelectedTicketId(null);
          void refetchTickets();
        }}
        isAdminMode={true}
      />

      {/* Admin Feedback Detail & Response Modal */}
      <FeedbackDetailModal
        feedback={selectedFeedback}
        isOpen={Boolean(selectedFeedback)}
        onClose={() => setSelectedFeedback(null)}
        isAdminMode={true}
        onSuccess={() => void refetchFeedbacks()}
      />
    </div>
  );
}
