import { useState, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Input,
  RichTextEditor,
  Button,
  Alert,
  PersianDatePicker,
} from "../../ui/index.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import { useCreateAssignment, useUpdateAssignment } from "../../../hooks/useTeacherAssignments.js";
import type { TeacherAssignmentListItemDTO } from "../../../lib/api/teacher.js";
import { ApiError } from "../../../lib/api/errors.js";
import {
  extractLocalDateAndTimeString,
  combineLocalDateAndTimeToIso,
} from "../../../utils/date.js";
import { FileText, Calendar, Clock } from "lucide-react";

export interface CreateEditAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  assignmentToEdit?: TeacherAssignmentListItemDTO | null;
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
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("23:59");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateAssignment(classroomId);
  const updateMutation = useUpdateAssignment(assignmentToEdit?.id ?? "", classroomId);

  useEffect(() => {
    if (assignmentToEdit) {
      const startExtracted = extractLocalDateAndTimeString(assignmentToEdit.startsAt);
      const dueExtracted = extractLocalDateAndTimeString(assignmentToEdit.dueAt);
      setTitle(assignmentToEdit.title);
      setDescription(assignmentToEdit.description || "");
      setStartDate(startExtracted.dateStr);
      setStartTime(startExtracted.timeStr || "08:00");
      setDueDate(dueExtracted.dateStr);
      setDueTime(dueExtracted.timeStr || "23:59");
    } else {
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const startExtracted = extractLocalDateAndTimeString(now);
      const dueExtracted = extractLocalDateAndTimeString(inSevenDays);
      setTitle("");
      setDescription("");
      setStartDate(startExtracted.dateStr);
      setStartTime(startExtracted.timeStr || "08:00");
      setDueDate(dueExtracted.dateStr);
      setDueTime("23:59");
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

    if (!startDate || !startTime) {
      setError("زمان شروع تکلیف نامعتبر است");
      return;
    }

    if (!dueDate || !dueTime) {
      setError("مهلت ارسال تکلیف نامعتبر است");
      return;
    }

    const startsAtIso = combineLocalDateAndTimeToIso(startDate, startTime);
    const dueAtIso = combineLocalDateAndTimeToIso(dueDate, dueTime);

    if (!startsAtIso || isNaN(Date.parse(startsAtIso))) {
      setError("زمان شروع تکلیف نامعتبر است");
      return;
    }

    if (!dueAtIso || isNaN(Date.parse(dueAtIso))) {
      setError("مهلت ارسال تکلیف نامعتبر است");
      return;
    }

    const startMs = new Date(startsAtIso).getTime();
    const dueMs = new Date(dueAtIso).getTime();

    if (dueMs <= startMs) {
      setError("مهلت ارسال باید بعد از زمان شروع باشد");
      return;
    }

    try {
      if (isEditing && assignmentToEdit) {
        await updateMutation.mutateAsync({
          title: trimmedTitle,
          description: description.trim() || null,
          startsAt: startsAtIso,
          dueAt: dueAtIso,
          status: targetStatus,
        });
      } else {
        await createMutation.mutateAsync({
          title: trimmedTitle,
          description: description.trim() || null,
          startsAt: startsAtIso,
          dueAt: dueAtIso,
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
          <RichTextEditor
            label="توضیحات و دستورالعمل تکلیف (اختیاری)"
            placeholder="دستورالعمل، سوالات، مباحث مرتبط و جزئیات مورد انتظار پاسخ را بنویسید..."
            value={description}
            onChange={setDescription}
            disabled={isPending}
            minHeight={140}
            rows={5}
            renderPreview={(cnt) => <MarkdownRenderer content={cnt} />}
          />

          {/* Schedule */}
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] space-y-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                <Calendar className="w-4 h-4 text-[#008080]" />
                <span>زمان شروع دریافت پاسخ</span>
                <span className="text-red-500">*</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PersianDatePicker
                  id="assignment-start-date"
                  label="تاریخ شروع *"
                  value={startDate}
                  onChange={setStartDate}
                  minDate={null}
                  disabled={isPending}
                  required
                />
                <Input
                  id="assignment-start-time"
                  type="time"
                  label="ساعت شروع *"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isPending}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] space-y-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>مهلت نهایی ارسال پاسخ (Deadline)</span>
                <span className="text-red-500">*</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PersianDatePicker
                  id="assignment-due-date"
                  label="تاریخ مهلت تحویل *"
                  value={dueDate}
                  onChange={setDueDate}
                  minDate={null}
                  disabled={isPending}
                  required
                />
                <Input
                  id="assignment-due-time"
                  type="time"
                  label="ساعت مهلت تحویل *"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  disabled={isPending}
                  dir="ltr"
                  required
                />
              </div>
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
