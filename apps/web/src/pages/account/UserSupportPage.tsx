import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Badge,
  LoadingState,
  Alert,
} from "@avana/ui";
import {
  LifeBuoy,
  MessageSquarePlus,
  HelpCircle,
  MessageSquare,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Inbox,
} from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  formatPersianDateTime,
  getFeedbackStatusBadgeVariant,
  getTicketStatusBadgeVariant,
} from "../../components/support/supportUiHelpers.js";
import { FeedbackFormModal } from "../../components/support/FeedbackFormModal.js";
import { SupportTicketFormModal } from "../../components/support/SupportTicketFormModal.js";
import { TicketConversationModal } from "../../components/support/TicketConversationModal.js";
import { FeedbackDetailModal } from "../../components/support/FeedbackDetailModal.js";
import {
  useMyFeedbacks,
  useMyTickets,
} from "../../hooks/useSupport.js";
import type {
  FeedbackItem,
  SupportTicketItem,
  TicketStatus,
  TicketCategory,
  FeedbackStatus,
  FeedbackCategory,
  FeedbackType,
} from "@avana/domain";

type RequestTabFilter = "all" | "tickets" | "feedback";

export function UserSupportPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Modals state
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(
    searchParams.get("ticketId") || null,
  );
  const [activeFeedback, setActiveFeedback] = useState<FeedbackItem | null>(null);

  // History Tab Filter
  const [tabFilter, setTabFilter] = useState<RequestTabFilter>("all");
  const [page] = useState(1);

  const {
    data: ticketsData,
    isLoading: isTicketsLoading,
    error: ticketsError,
    refetch: refetchTickets,
  } = useMyTickets({ page, limit: 20 });

  const {
    data: feedbacksData,
    isLoading: isFeedbacksLoading,
    error: feedbacksError,
    refetch: refetchFeedbacks,
  } = useMyFeedbacks({ page, limit: 20 });

  const isLoading = isTicketsLoading || isFeedbacksLoading;
  const error = ticketsError || feedbacksError;

  // Merge and sort Unified Requests for the History section
  const combinedItems = useMemo(() => {
    const list: Array<
      | { kind: "ticket"; data: SupportTicketItem; date: number }
      | { kind: "feedback"; data: FeedbackItem; date: number }
    > = [];

    if (tabFilter === "all" || tabFilter === "tickets") {
      if (ticketsData?.items) {
        for (const t of ticketsData.items) {
          list.push({
            kind: "ticket",
            data: t,
            date: new Date(t.lastActivityAt || t.createdAt).getTime(),
          });
        }
      }
    }

    if (tabFilter === "all" || tabFilter === "feedback") {
      if (feedbacksData?.items) {
        for (const f of feedbacksData.items) {
          list.push({
            kind: "feedback",
            data: f,
            date: new Date(f.updatedAt || f.createdAt).getTime(),
          });
        }
      }
    }

    list.sort((a, b) => b.date - a.date);
    return list;
  }, [ticketsData?.items, feedbacksData?.items, tabFilter]);

  const handleTicketCreated = (newTicketId: string) => {
    void refetchTickets();
    setActiveTicketId(newTicketId);
  };

  const handleFeedbackCreated = () => {
    void refetchFeedbacks();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 font-sans" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
              پشتیبانی و بازخورد
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
            پیگیری درخواست‌های پشتیبانی، گفتگو با کارشناسان و ارسال پیشنهادات برای ارتقای آوانا
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="خطا در دریافت اطلاعات">
          {(error as Error)?.message || "دریافت اطلاعات پشتیبانی با خطا مواجه شد."}
        </Alert>
      )}

      {/* 2 Main Action CTA Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Support Ticket CTA */}
        <div
          onClick={() => setIsTicketModalOpen(true)}
          className="group relative p-6 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 end-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -z-10 group-hover:bg-primary/10 transition-colors" />

          <div>
            <div className="flex items-center gap-3.5 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                درخواست پشتیبانی
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              اگر در دسترسی به دوره‌ها، آزمون‌ها، پرداخت یا حساب کاربری خود مشکلی دارید، تیکت پشتیبانی ثبت کنید.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs font-bold text-primary">
            <span>ثبت تیکت جدید</span>
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Feedback CTA */}
        <div
          onClick={() => setIsFeedbackModalOpen(true)}
          className="group relative p-6 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080]/50 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
        >
          <div className="absolute top-0 end-0 w-32 h-32 bg-[#008080]/5 rounded-full blur-2xl -z-10 group-hover:bg-[#008080]/10 transition-colors" />

          <div>
            <div className="flex items-center gap-3.5 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <MessageSquarePlus className="w-6 h-6" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                ارسال بازخورد و پیشنهاد
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              انتقاد، پیشنهاد، گزارش باگ یا درخواستی برای ویژگی جدید دارید؟ نظرات شما آوانا را بهتر می‌سازد.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs font-bold text-[#008080]">
            <span>ثبت پیشنهاد یا انتقاد</span>
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* History Section: «درخواست‌های من» */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              درخواست‌های من
            </h3>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] self-start sm:self-auto text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTabFilter("all")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                tabFilter === "all"
                  ? "bg-[var(--color-surface)] text-primary shadow-sm font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              همه ({ (ticketsData?.total || 0) + (feedbacksData?.total || 0) })
            </button>
            <button
              type="button"
              onClick={() => setTabFilter("tickets")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                tabFilter === "tickets"
                  ? "bg-[var(--color-surface)] text-primary shadow-sm font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              پشتیبانی ({ ticketsData?.total || 0 })
            </button>
            <button
              type="button"
              onClick={() => setTabFilter("feedback")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                tabFilter === "feedback"
                  ? "bg-[var(--color-surface)] text-primary shadow-sm font-bold"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              بازخوردها ({ feedbacksData?.total || 0 })
            </button>
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <LoadingState message="در حال دریافت سابقه درخواست‌ها..." />
          </div>
        ) : combinedItems.length === 0 ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center mx-auto">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              هنوز درخواستی ثبت نکرده‌اید
            </p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
              برای پیگیری مشکلات فنی یا ثبت پیشنهادات، از دکمه‌های بالای صفحه استفاده کنید.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {combinedItems.map((item) => {
              if (item.kind === "ticket") {
                const ticket = item.data;
                return (
                  <div
                    key={`ticket-${ticket.id}`}
                    onClick={() => setActiveTicketId(ticket.id)}
                    className="group p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="primary" size="sm">
                          تیکت پشتیبانی
                        </Badge>
                        <Badge
                          variant={getTicketStatusBadgeVariant(ticket.status)}
                          size="sm"
                        >
                          {TICKET_STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {TICKET_CATEGORY_LABELS[ticket.category as TicketCategory] || ticket.category}
                        </Badge>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-[var(--color-text)] group-hover:text-primary transition-colors truncate">
                        {ticket.title}
                      </h4>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          آخرین فعالیت: {formatPersianDateTime(ticket.lastActivityAt)}
                        </span>
                        {ticket.messageCount && ticket.messageCount > 1 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {ticket.messageCount} پیام
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-xs font-semibold text-primary">
                      <span className="hidden sm:inline">مشاهده گفتگو</span>
                      <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              } else {
                const feedback = item.data;
                return (
                  <div
                    key={`fb-${feedback.id}`}
                    onClick={() => setActiveFeedback(feedback)}
                    className="group p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[#008080]/40 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="neutral" size="sm">
                          بازخورد: {FEEDBACK_TYPE_LABELS[feedback.type as FeedbackType] || feedback.type}
                        </Badge>
                        <Badge
                          variant={getFeedbackStatusBadgeVariant(feedback.status)}
                          size="sm"
                        >
                          {FEEDBACK_STATUS_LABELS[feedback.status as FeedbackStatus] || feedback.status}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {FEEDBACK_CATEGORY_LABELS[feedback.category as FeedbackCategory] || feedback.category}
                        </Badge>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors truncate">
                        {feedback.title}
                      </h4>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ثبت شده در: {formatPersianDateTime(feedback.createdAt)}
                        </span>
                        {feedback.adminResponse && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            دارای پاسخ تیم آوانا
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-xs font-semibold text-[#008080]">
                      <span className="hidden sm:inline">مشاهده جزئیات</span>
                      <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <FeedbackFormModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSuccess={handleFeedbackCreated}
      />

      <SupportTicketFormModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        onSuccess={handleTicketCreated}
      />

      <TicketConversationModal
        ticketId={activeTicketId}
        isOpen={Boolean(activeTicketId)}
        onClose={() => {
          setActiveTicketId(null);
          if (searchParams.get("ticketId")) {
            searchParams.delete("ticketId");
            setSearchParams(searchParams);
          }
        }}
      />

      <FeedbackDetailModal
        feedback={activeFeedback}
        isOpen={Boolean(activeFeedback)}
        onClose={() => setActiveFeedback(null)}
      />
    </div>
  );
}
