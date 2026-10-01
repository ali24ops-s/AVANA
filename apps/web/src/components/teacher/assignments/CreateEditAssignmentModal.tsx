import { useState, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Input,
  Textarea,
  Button,
  Alert,
} from "../../ui/index.js";
import { useCreateAssignment, useUpdateAssignment } from "../../../hooks/useTeacherAssignments.js";
import type { TeacherAssignmentListItemDTO } from "../../../lib/api/teacher.js";
import { ApiError } from "../../../lib/api/errors.js";
import { FileText, Calendar, Clock } from "lucide-react";

export interface CreateEditAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  assignmentToEdit?: TeacherAssignmentListItemDTO | null;
}

function toLocalDatetimeInputString(isoDate?: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function CreateEditAssignmentModal({
  isOpen,
  onClose,
  classroomId,
  assignmentToEdit,
}: CreateEditAssignmentModalProps) {
  const isEditing = Boolean(assignmentToEdit);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateAssignment(classroomId);
  const updateMutation = useUpdateAssignment(assignmentToEdit?.id ?? "", classroomId);

  useEffect(() => {
    if (assignmentToEdit) {
      setTitle(assignmentToEdit.title);
      setDescription(assignmentToEdit.description || "");
      setStartsAt(toLocalDatetimeInputString(assignmentToEdit.startsAt));
      setDueAt(toLocalDatetimeInputString(assignmentToEdit.dueAt));
    } else {
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setTitle("");
      setDescription("");
      setStartsAt(toLocalDatetimeInputString(now.toISOString()));
      setDueAt(toLocalDatetimeInputString(inSevenDays.toISOString()));
    }
    setError(null);
  }, [assignmentToEdit, isOpen]);

  const handleClose = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (targetStatus: "draft" | "published") => {
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setError("عنوان تکلیف باید حداقل ۲ کاراکتر باشد");
      return;
    }

    if (!startsAt || isNaN(Date.parse(startsAt))) {
      setError("زمان شروع تکلیف نامعتبر است");
      return;
    }

    if (!dueAt || isNaN(Date.parse(dueAt))) {
      setError("مهلت ارسال تکلیف نامعتبر است");
      return;
    }

    const startMs = new Date(startsAt).getTime();
    const dueMs = new Date(dueAt).getTime();

    if (dueMs <= startMs) {
      setError("مهلت ارسال باید بعد از زمان شروع باشد");
      return;
    }

    try {
      if (isEditing && assignmentToEdit) {
        await updateMutation.mutateAsync({
          title: trimmedTitle,
          description: description.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          dueAt: new Date(dueAt).toISOString(),
          status: targetStatus,
        });
      } else {
        await createMutation.mutateAsync({
          title: trimmedTitle,
          description: description.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          dueAt: new Date(dueAt).toISOString(),
          status: targetStatus,
        });
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "خطا در ذخیره تکلیف. لطفاً مجدداً تلاش کنید.",
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="lg"
      ariaLabel={isEditing ? "ویرایش تکلیف کلاسی" : "ایجاد تکلیف کلاسی جدید"}
    >
      <DialogHeader onClose={isPending ? undefined : handleClose}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
              {isEditing ? "ویرایش تکلیف کلاسی" : "ایجاد تکلیف کلاسی جدید"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              استاد می‌تواند تکلیف را همراه با مهلت ارسال برای دانشجویان این کلاس تعریف کند.
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 font-sans text-right" dir="rtl">
          {error && (
            <Alert variant="error" title="خطا در اعتبارسنجی">
              {error}
            </Alert>
          )}

          {/* Title */}
          <Input
            label="عنوان تکلیف *"
            placeholder="مثال: تمرین فصل دوم — فیزیولوژی تنفس"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            required
            autoFocus
          />

          {/* Description */}
          <Textarea
            label="توضیحات و دستورالعمل تکلیف (اختیاری)"
            placeholder="دستورالعمل، سوالات، مباحث مرتبط و جزئیات مورد انتظار پاسخ را بنویسید..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={isPending}
          />

          {/* Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#008080]" />
                زمان شروع دریافت پاسخ <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
                disabled={isPending}
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                مهلت نهایی ارسال پاسخ (Deadline) <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
                disabled={isPending}
              />
            </div>
          </div>
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2.5 w-full flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isPending}
          >
            انصراف
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleSubmit("draft")}
            isLoading={isPending}
            disabled={isPending}
          >
            ذخیره پیش‌نویس
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => handleSubmit("published")}
            isLoading={isPending}
            disabled={isPending}
          >
            {isEditing && assignmentToEdit?.status === "published"
              ? "ذخیره تغییرات"
              : "انتشار تکلیف"}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
