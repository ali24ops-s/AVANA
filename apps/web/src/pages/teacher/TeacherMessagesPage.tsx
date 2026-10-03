/**
 * TeacherMessagesPage.
 *
 * Dedicated inbox and conversation manager for teachers:
 *  - Displays student messages grouped by conversation threads
 *  - Filters by topic/category, status (new, in_progress, answered, closed), and classroom
 *  - Master-detail thread viewer and response composer
 *  - Status transitions with optimistic updates
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useTeacherConversations,
  useTeacherConversation,
  useTeacherReplyMessage,
  useTeacherUpdateConversationStatus,
} from "../../hooks/useTeacherMessages.js";
import { useTeacherClassrooms } from "../../hooks/useTeacher.js";
import { useTeacherOrganization } from "../../components/teacher/TeacherOrganizationContext.js";
import {
  PageHeader,
  Card,
  Button,
  LoadingState,
  EmptyState,
  Alert,
} from "../../components/ui/index.js";
import { TeacherMessageStatusBadge } from "../../components/teacher/messages/TeacherMessageStatusBadge.js";
import { TeacherMessageCategoryBadge } from "../../components/teacher/messages/TeacherMessageCategoryBadge.js";
import {
  TeacherMessageCategories,
  TeacherMessageStatuses,
  TEACHER_MESSAGE_CATEGORY_LABELS,
  TEACHER_MESSAGE_STATUS_LABELS,
  type TeacherMessageCategory,
  type TeacherMessageStatus,
  toPersianDigits,
} from "@avana/domain";
import {
  MessageSquare,
  Search,
  Filter,
  Send,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Clock,
  Archive,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function TeacherMessagesPage() {
  const { conversationId: paramConversationId } = useParams<{
    conversationId?: string;
  }>();
  const navigate = useNavigate();

  const { selectedOrgId } = useTeacherOrganization();
  const { data: classroomsData } = useTeacherClassrooms(selectedOrgId ?? undefined);
  const classrooms = classroomsData?.classrooms ?? [];

  // Filters State
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected Conversation State
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    paramConversationId ?? null,
  );

  useEffect(() => {
    if (paramConversationId) {
      setActiveConversationId(paramConversationId);
    }
  }, [paramConversationId]);

  // Query Conversations
  const conversationsQuery = useTeacherConversations({
    classroomId: selectedClassroomId !== "all" ? selectedClassroomId : undefined,
    status:
      selectedStatus !== "all"
        ? (selectedStatus as TeacherMessageStatus)
        : undefined,
    category:
      selectedCategory !== "all"
        ? (selectedCategory as TeacherMessageCategory)
        : undefined,
  });

  const rawConversations = conversationsQuery.data?.conversations ?? [];

  // Filter conversations with search query
  const conversations = useMemo(() => {
    if (!searchQuery.trim()) return rawConversations;
    const query = searchQuery.trim().toLowerCase();
    return rawConversations.filter((c) => {
      const subject = c.subject.toLowerCase();
      const studentName = (c.studentName || "").toLowerCase();
      const classroomTitle = (c.classroomTitle || "").toLowerCase();
      return (
        subject.includes(query) ||
        studentName.includes(query) ||
        classroomTitle.includes(query)
      );
    });
  }, [rawConversations, searchQuery]);

  // Summary counts
  const stats = useMemo(() => {
    const total = rawConversations.length;
    const newCount = rawConversations.filter(
      (c) => c.status === TeacherMessageStatuses.NEW,
    ).length;
    const inProgressCount = rawConversations.filter(
      (c) => c.status === TeacherMessageStatuses.IN_PROGRESS,
    ).length;
    const answeredCount = rawConversations.filter(
      (c) => c.status === TeacherMessageStatuses.ANSWERED,
    ).length;
    return { total, newCount, inProgressCount, answeredCount };
  }, [rawConversations]);

  // Selected Conversation Query & Thread
  const selectedConversationQuery = useTeacherConversation(
    activeConversationId ?? undefined,
  );
  const selectedConversation =
    selectedConversationQuery.data?.conversation ??
    conversations.find((c) => c.id === activeConversationId);
  const messages = selectedConversationQuery.data?.messages ?? [];

  // Reply Mutation
  const replyMutation = useTeacherReplyMessage(activeConversationId ?? "");
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  // Status Mutation
  const updateStatusMutation = useTeacherUpdateConversationStatus(
    activeConversationId ?? "",
  );
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<boolean>(false);

  // Auto scroll messages container to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeConversationId]);

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    navigate(`/teacher/messages/${id}`, { replace: true });
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeConversationId || replyMutation.isPending) {
      return;
    }
    setReplyError(null);
    try {
      await replyMutation.mutateAsync({ body: replyText.trim() });
      setReplyText("");
    } catch (err) {
      setReplyError(
        err instanceof Error
          ? err.message
          : "خطا در ارسال پاسخ. لطفاً مجدداً تلاش کنید.",
      );
    }
  };

  const handleStatusChange = async (newStatus: TeacherMessageStatus) => {
    if (!activeConversationId || updateStatusMutation.isPending) return;
    try {
      await updateStatusMutation.mutateAsync({ status: newStatus });
      setStatusUpdateSuccess(true);
      setTimeout(() => setStatusUpdateSuccess(false), 2000);
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "خطا در به‌روزرسانی وضعیت پیام.",
      );
    }
  };

  function formatPersianMessageTime(dateInput?: string | null): string {
    if (!dateInput) return "";
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return "";
      const dateStr = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        calendar: "persian",
        month: "short",
        day: "numeric",
      }).format(d);
      const timeStr = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        calendar: "persian",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
      return `${dateStr}، ساعت ${timeStr}`;
    } catch {
      return "";
    }
  }

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <PageHeader
        title="پیام‌های دانشجویان"
        description="مشاهده، پیگیری و پاسخ‌دهی به سؤالات و پیام‌های آموزشی دانشجویان"
        badge={{
          text: "صندوق پیام‌ها",
          icon: <MessageSquare className="w-3.5 h-3.5" />,
        }}
      />

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)]">
          <div className="text-xs font-semibold text-[var(--color-text-muted)]">
            کل پیام‌ها
          </div>
          <div className="text-xl sm:text-2xl font-black text-[var(--color-text)] mt-1">
            {toPersianDigits(stats.total)}
          </div>
        </Card>

        <Card className="p-4 border border-blue-500/20 rounded-2xl bg-blue-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              پیام‌های جدید
            </span>
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">
            {toPersianDigits(stats.newCount)}
          </div>
        </Card>

        <Card className="p-4 border border-amber-500/20 rounded-2xl bg-amber-500/5">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            در حال پیگیری
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
            {toPersianDigits(stats.inProgressCount)}
          </div>
        </Card>

        <Card className="p-4 border border-emerald-500/20 rounded-2xl bg-emerald-500/5">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            پاسخ داده‌شده
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
            {toPersianDigits(stats.answeredCount)}
          </div>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: "all", label: "همه پیام‌ها" },
              { id: TeacherMessageStatuses.NEW, label: "جدید" },
              { id: TeacherMessageStatuses.IN_PROGRESS, label: "در حال پیگیری" },
              { id: TeacherMessageStatuses.ANSWERED, label: "پاسخ داده‌شده" },
              { id: TeacherMessageStatuses.CLOSED, label: "بسته‌شده" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedStatus === tab.id
                    ? "bg-[#008080] text-white shadow-xs font-bold"
                    : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category & Classroom Selectors & Search */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            {/* Category Dropdown */}
            <select
              aria-label="انتخاب موضوع"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs font-semibold rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]/30 shrink-0 cursor-pointer"
            >
              <option value="all">همه موضوعات</option>
              {Object.entries(TEACHER_MESSAGE_CATEGORY_LABELS).map(([cat, label]) => (
                <option key={cat} value={cat}>
                  {label}
                </option>
              ))}
            </select>

            {/* Classroom Dropdown */}
            {classrooms.length > 0 && (
              <select
                aria-label="انتخاب کلاس"
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                className="text-xs font-semibold rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]/30 shrink-0 max-w-[150px] truncate cursor-pointer"
              >
                <option value="all">همه کلاس‌ها</option>
                {classrooms.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.title}
                  </option>
                ))}
              </select>
            )}

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48 min-w-[140px]">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در پیام‌ها..."
                className="w-full text-xs rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] ps-8 pe-3 py-1.5 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080]/30"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Inbox Workspace (Master-Detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[550px]">
        {/* Left / List Column (Master) */}
        <div
          className={`lg:col-span-5 flex flex-col gap-3 ${
            activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          {conversationsQuery.isLoading ? (
            <Card className="p-12 border border-[var(--color-border)] rounded-2xl flex items-center justify-center">
              <LoadingState message="در حال بارگذاری پیام‌ها..." />
            </Card>
          ) : conversations.length === 0 ? (
            <Card className="p-8 border border-[var(--color-border)] rounded-2xl text-center bg-[var(--color-surface)]">
              <MessageSquare className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-2.5 opacity-50" />
              <h4 className="text-sm font-bold text-[var(--color-text)]">
                پیامی یافت نشد
              </h4>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {selectedStatus !== "all" || selectedCategory !== "all" || searchQuery
                  ? "هیچ پیامی با فیلترهای انتخابی مطابقت ندارد."
                  : "هنوز پیامی از سمت دانشجویان ارسال نشده است."}
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pe-1 scrollbar-thin">
              {conversations.map((item) => {
                const isSelected = item.id === activeConversationId;
                const isUnread =
                  item.lastSenderRole === "student" && !item.teacherReadAt;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectConversation(item.id)}
                    className={`w-full text-start p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? "bg-[#008080]/10 border-[#008080] shadow-sm ring-1 ring-[#008080]/40"
                        : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[#008080]/40 hover:bg-[var(--color-surface-warm)]/50"
                    }`}
                  >
                    {/* Unread indicator dot */}
                    {isUnread && (
                      <span className="absolute top-3 end-3 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
                    )}

                    {/* Top Row: Category + Status */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <TeacherMessageCategoryBadge
                        category={item.category}
                        size="sm"
                      />
                      <TeacherMessageStatusBadge
                        status={item.status}
                        size="sm"
                      />
                    </div>

                    {/* Subject */}
                    <h4 className="text-sm font-bold text-[var(--color-text)] line-clamp-1 mb-1">
                      {item.subject}
                    </h4>

                    {/* Metadata: Student & Classroom */}
                    <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
                        <span className="font-semibold text-[var(--color-text)] truncate">
                          {item.studentName || item.studentEmail || "دانشجو"}
                        </span>
                        {item.classroomTitle && (
                          <>
                            <span>•</span>
                            <span className="truncate">{item.classroomTitle}</span>
                          </>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-[10px]">
                        {formatPersianMessageTime(item.lastActivityAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right / Thread Column (Detail) */}
        <div
          className={`lg:col-span-7 flex flex-col ${
            !activeConversationId ? "hidden lg:flex" : "flex"
          }`}
        >
          {!activeConversationId ? (
            <Card className="p-12 border border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center text-center h-full min-h-[400px] bg-[var(--color-surface)]">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-warm)] flex items-center justify-center mb-3">
                <MessageSquare className="w-8 h-8 text-[var(--color-text-muted)]" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                یک پیام را انتخاب کنید
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-sm">
                برای مشاهده تاریخچه گفتگو و ارسال پاسخ به دانشجو، از ستون سمت راست یک پیام را انتخاب کنید.
              </p>
            </Card>
          ) : selectedConversationQuery.isLoading && !selectedConversation ? (
            <Card className="p-12 border border-[var(--color-border)] rounded-2xl flex items-center justify-center h-full">
              <LoadingState message="در حال بارگذاری جزئیات گفتگو..." />
            </Card>
          ) : !selectedConversation ? (
            <Card className="p-12 border border-[var(--color-border)] rounded-2xl text-center">
              <Alert variant="error" title="گفتگو یافت نشد">
                امکان بارگذاری این پیام وجود ندارد.
              </Alert>
            </Card>
          ) : (
            <Card className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] flex flex-col h-full shadow-xs overflow-hidden">
              {/* Thread Header */}
              <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 flex flex-col gap-3">
                {/* Mobile Back Button */}
                <div className="lg:hidden flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveConversationId(null)}
                    leftIcon={<ArrowRight className="w-4 h-4" />}
                    className="text-xs font-semibold px-2"
                  >
                    بازگشت به فهرست
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <TeacherMessageCategoryBadge
                        category={selectedConversation.category}
                        size="sm"
                      />
                      <TeacherMessageStatusBadge
                        status={selectedConversation.status}
                        size="sm"
                      />
                      {statusUpdateSuccess && (
                        <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 animate-in fade-in">
                          <CheckCircle2 className="w-3 h-3" /> وضعیت به‌روزرسانی شد
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-[var(--color-text)]">
                      {selectedConversation.subject}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mt-1">
                      <span className="font-semibold text-[var(--color-text)]">
                        {selectedConversation.studentName || selectedConversation.studentEmail}
                      </span>
                      {selectedConversation.classroomTitle && (
                        <>
                          <span>•</span>
                          <span>کلاس: {selectedConversation.classroomTitle}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status Transition Action */}
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="conversation-status-select"
                      className="text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap"
                    >
                      وضعیت:
                    </label>
                    <select
                      id="conversation-status-select"
                      aria-label="تغییر وضعیت گفتگو"
                      value={selectedConversation.status}
                      onChange={(e) =>
                        handleStatusChange(e.target.value as TeacherMessageStatus)
                      }
                      disabled={updateStatusMutation.isPending}
                      className="text-xs font-semibold rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]/30 cursor-pointer"
                    >
                      {Object.entries(TEACHER_MESSAGE_STATUS_LABELS).map(
                        ([st, label]) => (
                          <option key={st} value={st}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Messages Chronological Thread */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 max-h-[480px] min-h-[250px] bg-[var(--color-bg-default)]/30">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
                    پیامی در این گفتگو ثبت نشده است.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isTeacher = msg.senderRole === "teacher";

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isTeacher ? "items-start" : "items-end"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                            isTeacher
                              ? "bg-[#008080]/15 border border-[#008080]/30 text-[var(--color-text)] rounded-tr-xs"
                              : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-xs shadow-xs"
                          }`}
                        >
                          {/* Sender Info & Role */}
                          <div className="flex items-center justify-between gap-3 text-[11px] mb-2 font-semibold border-b border-[var(--color-border)]/50 pb-1.5">
                            <span
                              className={
                                isTeacher
                                  ? "text-[#008080] font-bold"
                                  : "text-blue-600 dark:text-blue-400 font-bold"
                              }
                            >
                              {isTeacher
                                ? "استاد (شما)"
                                : selectedConversation.studentName || "دانشجو"}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                              {formatPersianMessageTime(msg.createdAt)}
                            </span>
                          </div>

                          {/* Message Body */}
                          <div className="whitespace-pre-wrap font-sans">
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Form */}
              <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                {replyError && (
                  <div className="mb-3">
                    <Alert variant="error" title="خطا">
                      {replyError}
                    </Alert>
                  </div>
                )}

                <form onSubmit={handleSendReply} className="space-y-3">
                  <div className="relative">
                    <textarea
                      aria-label="متن پاسخ به دانشجو"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="پاسخ خود را برای دانشجو بنویسید..."
                      rows={3}
                      disabled={replyMutation.isPending}
                      className="w-full text-xs sm:text-sm rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-3 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080]/40 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      با ارسال پاسخ، وضعیت پیام خودکار به «پاسخ داده‌شده» تغییر می‌یابد.
                    </span>

                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={replyMutation.isPending}
                      disabled={!replyText.trim() || replyMutation.isPending}
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                    >
                      ارسال پاسخ
                    </Button>
                  </div>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
