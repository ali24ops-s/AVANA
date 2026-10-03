import { useState } from "react";
import {
  Card,
  Button,
  LoadingState,
  EmptyState,
} from "../../ui/index.js";
import { TeacherMessageStatusBadge } from "../../teacher/messages/TeacherMessageStatusBadge.js";
import { TeacherMessageCategoryBadge } from "../../teacher/messages/TeacherMessageCategoryBadge.js";
import { StudentSendMessageModal } from "./StudentSendMessageModal.js";
import { StudentConversationDetailModal } from "./StudentConversationDetailModal.js";
import { useStudentConversations } from "../../../hooks/useStudentMessages.js";
import { toPersianDigits } from "@avana/domain";
import {
  MessageSquare,
  Plus,
  Clock,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
} from "lucide-react";

interface Props {
  classroomId: string;
  classroomTitle?: string;
}

export function StudentClassroomMessages({
  classroomId,
  classroomTitle,
}: Props) {
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const { data, isLoading, isError } = useStudentConversations({
    classroomId,
  });

  const conversations = data?.conversations ?? [];

  function formatPersianMessageDate(dateInput?: string | null): string {
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
      return `${dateStr}، ${timeStr}`;
    } catch {
      return "";
    }
  }

  return (
    <div className="space-y-4 pt-2 font-sans" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
            پیام‌های آموزشی و پشتیبانی
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            ارسال سؤال، درخواست راهنمایی یا اشکالات درسی به استاد این کلاس
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsSendModalOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          ارسال پیام جدید
        </Button>
      </div>

      {/* Content State */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <LoadingState message="در حال بارگذاری پیام‌ها..." />
        </div>
      ) : conversations.length === 0 ? (
        <Card className="p-8 text-center border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)]">
          <MessageSquare className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3 opacity-50" />
          <h3 className="text-base font-bold text-[var(--color-text)]">
            هنوز پیامی برای استاد این کلاس ارسال نکرده‌اید
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-md mx-auto leading-relaxed">
            در صورت داشتن سؤال درسی، ابهام در تمرین‌ها یا نیاز به راهنمایی، می‌توانید برای استاد خود پیام بفرستید.
          </p>
          <div className="mt-4">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSendModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              ارسال اولین پیام
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((item) => {
            const hasTeacherReply = item.lastSenderRole === "teacher";
            const isUnread =
              item.lastSenderRole === "teacher" && !item.studentReadAt;

            return (
              <Card
                key={item.id}
                onClick={() => setSelectedConversationId(item.id)}
                className={`p-4 border rounded-2xl transition-all cursor-pointer bg-[var(--color-surface)] hover:border-[#008080]/50 hover:bg-[var(--color-surface-warm)]/40 relative shadow-xs ${
                  isUnread
                    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "border-[var(--color-border)]"
                }`}
              >
                {/* Unread badge indicator */}
                {isUnread && (
                  <span className="absolute top-3 end-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                    پاسخ جدید استاد
                  </span>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TeacherMessageCategoryBadge
                        category={item.category}
                        size="sm"
                      />
                      <TeacherMessageStatusBadge
                        status={item.status}
                        size="sm"
                      />
                    </div>

                    <h4 className="text-sm font-bold text-[var(--color-text)] truncate">
                      {item.subject}
                    </h4>

                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-wrap">
                      <div className="flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5 text-[#008080]" />
                        <span>استاد: {item.teacherName || "استاد محترم"}</span>
                      </div>
                      <span>•</span>
                      <span>آخرین فعالیت: {formatPersianMessageDate(item.lastActivityAt)}</span>
                      <span>•</span>
                      <span className={hasTeacherReply ? "text-emerald-600 font-semibold" : ""}>
                        آخرین فرستنده: {hasTeacherReply ? "استاد" : "شما"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConversationId(item.id);
                      }}
                      className="text-xs"
                    >
                      <span>مشاهده گفتگو</span>
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Send Message Modal */}
      <StudentSendMessageModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        classroomId={classroomId}
        classroomTitle={classroomTitle}
        onSuccess={(newId) => {
          setSelectedConversationId(newId);
        }}
      />

      {/* Detail & Reply Thread Modal */}
      <StudentConversationDetailModal
        conversationId={selectedConversationId}
        onClose={() => setSelectedConversationId(null)}
      />
    </div>
  );
}
