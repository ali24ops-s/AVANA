import { useState, useRef, useEffect } from "react";
import {
  Button,
  LoadingState,
  Alert,
} from "../../ui/index.js";
import { TeacherMessageStatusBadge } from "../../teacher/messages/TeacherMessageStatusBadge.js";
import { TeacherMessageCategoryBadge } from "../../teacher/messages/TeacherMessageCategoryBadge.js";
import {
  useStudentConversation,
  useStudentReplyMessage,
} from "../../../hooks/useStudentMessages.js";
import { toPersianDigits } from "@avana/domain";
import { X, Send, User, MessageSquare, GraduationCap } from "lucide-react";

interface Props {
  conversationId: string | null;
  onClose: () => void;
}

export function StudentConversationDetailModal({
  conversationId,
  onClose,
}: Props) {
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);

  const conversationQuery = useStudentConversation(conversationId ?? undefined);
  const conversation = conversationQuery.data?.conversation;
  const messages = conversationQuery.data?.messages ?? [];

  const replyMutation = useStudentReplyMessage(conversationId ?? "");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, conversationId]);

  if (!conversationId) return null;

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !conversationId || replyMutation.isPending) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            {conversation && (
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <TeacherMessageCategoryBadge
                  category={conversation.category}
                  size="sm"
                />
                <TeacherMessageStatusBadge
                  status={conversation.status}
                  size="sm"
                />
              </div>
            )}
            <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)] truncate">
              {conversation?.subject ?? "جزئیات گفتگو"}
            </h3>
            {conversation && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mt-0.5">
                <GraduationCap className="w-3.5 h-3.5 text-[#008080] shrink-0" />
                <span>استاد: {conversation.teacherName || "استاد محترم"}</span>
                {conversation.classroomTitle && (
                  <>
                    <span>•</span>
                    <span className="truncate">{conversation.classroomTitle}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content / Thread */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-[var(--color-bg-default)]/30 min-h-[220px]">
          {conversationQuery.isLoading ? (
            <div className="py-12 flex justify-center">
              <LoadingState message="در حال بارگذاری گفتگو..." />
            </div>
          ) : conversationQuery.isError ? (
            <Alert variant="error" title="خطا در دریافت گفتگو">
              امکان بارگذاری پیام‌های این گفتگو وجود ندارد.
            </Alert>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              پیامی یافت نشد.
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
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      isTeacher
                        ? "bg-[#008080]/15 border border-[#008080]/30 text-[var(--color-text)] rounded-tr-xs"
                        : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-tl-xs shadow-xs"
                    }`}
                  >
                    {/* Header of message bubble */}
                    <div className="flex items-center justify-between gap-3 text-[11px] mb-2 font-semibold border-b border-[var(--color-border)]/50 pb-1.5">
                      <span
                        className={
                          isTeacher
                            ? "text-[#008080] font-bold"
                            : "text-blue-600 dark:text-blue-400 font-bold"
                        }
                      >
                        {isTeacher
                          ? `استاد (${conversation?.teacherName || "استاد محترم"})`
                          : "شما"}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                        {formatPersianMessageTime(msg.createdAt)}
                      </span>
                    </div>

                    {/* Body */}
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

        {/* Reply Box */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
          {replyError && (
            <div className="mb-3">
              <Alert variant="error" title="خطا">
                {replyError}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSendReply} className="space-y-3">
            <textarea
              aria-label="پاسخ یا پیگیری پیام"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="ارسال پیام تکمیلی یا پاسخ به استاد..."
              rows={3}
              disabled={replyMutation.isPending}
              className="w-full text-xs sm:text-sm rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-3 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080]/40 resize-none"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--color-text-muted)]">
                پیام شما مستقیماً برای استاد کلاس ارسال خواهد شد.
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
      </div>
    </div>
  );
}
