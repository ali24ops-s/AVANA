import { useState, useRef } from "react";
import {
  Dialog,
  DialogFooter,
  Button,
  Input,
  AvanaSelect,
  Alert,
} from "@avana/ui";
import { Upload, X, Paperclip, CheckCircle2 } from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_TYPE_LABELS,
} from "./supportUiHelpers.js";
import { useCreateFeedback, getSupportApi } from "../../hooks/useSupport.js";
import type { FeedbackCategory, FeedbackType } from "@avana/domain";

interface FeedbackFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function FeedbackFormModal({
  isOpen,
  onClose,
  onSuccess,
}: FeedbackFormModalProps) {
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [category, setCategory] = useState<FeedbackCategory>("courses");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createFeedbackMutation = useCreateFeedback();

  const resetForm = () => {
    setType("suggestion");
    setCategory("courses");
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    if (createFeedbackMutation.isPending || uploading) return;
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("حجم فایل انتخابی بیش از حد مجاز است (حداکثر ۵ مگابایت).");
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!title.trim() || title.trim().length < 3) {
      setErrorMessage("لطفاً عنوان بازخورد را وارد کنید (حداقل ۳ کاراکتر).");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setErrorMessage("لطفاً متن توضیحات را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).");
      return;
    }

    try {
      let attachmentUrl: string | null = null;
      if (selectedFile) {
        setUploading(true);
        const uploadRes = await getSupportApi().uploadAttachment(selectedFile);
        attachmentUrl = uploadRes.attachment_url;
      }

      await createFeedbackMutation.mutateAsync({
        type,
        category,
        title: title.trim(),
        description: description.trim(),
        attachmentUrl,
      });

      setSuccessMessage("بازخورد شما با موفقیت ثبت شد و توسط تیم آوانا بررسی خواهد شد.");
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);
    } catch (err: unknown) {
      setErrorMessage(
        (err as Error)?.message || "خطایی در ثبت بازخورد رخ داد. لطفاً مجدداً تلاش کنید.",
      );
    } finally {
      setUploading(false);
    }
  };

  const typeOptions = Object.entries(FEEDBACK_TYPE_LABELS).map(([key, label]) => ({
    value: key,
    label,
  }));

  const categoryOptions = Object.entries(FEEDBACK_CATEGORY_LABELS).map(
    ([key, label]) => ({
      value: key,
      label,
    }),
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="ارسال پیشنهاد و بازخورد"
      description="انتقاد، پیشنهاد یا ایده جدیدی برای بهبود آوانا دارید؟ با ما در میان بگذارید."
      maxWidth="lg"
    >
      <div className="p-1">

        {successMessage ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {successMessage}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {errorMessage && (
              <Alert variant="error" title="خطا در ثبت بازخورد">
                {errorMessage}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  نوع بازخورد
                </label>
                <AvanaSelect
                  value={type}
                  onChange={(val) => setType(val as FeedbackType)}
                  options={typeOptions}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  دسته‌بندی مربوطه
                </label>
                <AvanaSelect
                  value={category}
                  onChange={(val) => setCategory(val as FeedbackCategory)}
                  options={categoryOptions}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                عنوان بازخورد
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: اضافه شدن حالت شب به صفحه آزمون‌ها"
                disabled={createFeedbackMutation.isPending || uploading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                متن توضیحات
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="لطفاً جزئیات پیشنهاد، انتقاد یا مشکل مدنظرتان را به طور دقیق بنویسید..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-sans"
                disabled={createFeedbackMutation.isPending || uploading}
                required
              />
            </div>

            {/* File Attachment */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                پیوست فایل یا تصویر (اختیاری)
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate font-medium">{selectedFile.name}</span>
                    <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">
                      ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  leftIcon={<Upload className="w-4 h-4" />}
                  className="w-full text-xs"
                  disabled={createFeedbackMutation.isPending || uploading}
                >
                  انتخاب فایل یا اسکرین‌شات (حداکثر ۵ مگابایت)
                </Button>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={createFeedbackMutation.isPending || uploading}
              >
                انصراف
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={createFeedbackMutation.isPending || uploading}
              >
                ثبت و ارسال بازخورد
              </Button>
            </DialogFooter>
          </form>
        )}
      </div>
    </Dialog>
  );
}
