import { useState } from "react";
import {
  Button,
  Alert,
} from "../../ui/index.js";
import {
  TeacherMessageCategories,
  TEACHER_MESSAGE_CATEGORY_LABELS,
  type TeacherMessageCategory,
} from "@avana/domain";
import { useStudentCreateConversation } from "../../../hooks/useStudentMessages.js";
import { Send, X, MessageSquare, AlertCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  classroomTitle?: string;
  onSuccess?: (conversationId: string) => void;
}

export function StudentSendMessageModal({
  isOpen,
  onClose,
  classroomId,
  classroomTitle,
  onSuccess,
}: Props) {
  const [category, setCategory] = useState<TeacherMessageCategory>(
    TeacherMessageCategories.STUDY_QUESTION,
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useStudentCreateConversation();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("لطفاً عنوان پیام را وارد کنید.");
      return;
    }
    if (!body.trim()) {
      setError("لطفاً متن پیام را وارد کنید.");
      return;
    }

    setError(null);
    try {
      const res = await createMutation.mutateAsync({
        classroomId,
        category,
        subject: subject.trim(),
        body: body.trim(),
      });
      setSubject("");
      setBody("");
      setCategory(TeacherMessageCategories.STUDY_QUESTION);
      onClose();
      if (onSuccess && res?.conversation?.id) {
        onSuccess(res.conversation.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "خطا در ارسال پیام به استاد. لطفاً دوباره تلاش کنید.",
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#008080]/15 text-[#008080] flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                ارسال پیام به استاد
              </h3>
              {classroomTitle && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  کلاس: {classroomTitle}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <Alert variant="error" title="خطا">
              {error}
            </Alert>
          )}

          {/* Category Dropdown */}
          <div className="space-y-1.5">
            <label
              htmlFor="message-category"
              className="text-xs font-bold text-[var(--color-text)]"
            >
              موضوع و دسته‌بندی پیام <span className="text-red-500">*</span>
            </label>
            <select
              id="message-category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as TeacherMessageCategory)
              }
              className="w-full text-xs font-semibold rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-2.5 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]/40 cursor-pointer"
            >
              {Object.entries(TEACHER_MESSAGE_CATEGORY_LABELS).map(
                ([cat, label]) => (
                  <option key={cat} value={cat}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Subject Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="message-subject"
              className="text-xs font-bold text-[var(--color-text)]"
            >
              عنوان پیام <span className="text-red-500">*</span>
            </label>
            <input
              id="message-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: سؤال در مورد جلسه سوم یا رفع اشکال تمرین..."
              className="w-full text-xs rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-2.5 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080]/40"
              maxLength={150}
            />
          </div>

          {/* Message Body */}
          <div className="space-y-1.5">
            <label
              htmlFor="message-body"
              className="text-xs font-bold text-[var(--color-text)]"
            >
              متن پیام <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="توضیحات و جزئیات سؤال یا درخواست خود را به طور کامل بنویسید..."
              rows={5}
              className="w-full text-xs sm:text-sm rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-3 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080]/40 resize-none"
              maxLength={3000}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={createMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createMutation.isPending}
              disabled={!subject.trim() || !body.trim() || createMutation.isPending}
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              ارسال پیام
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
