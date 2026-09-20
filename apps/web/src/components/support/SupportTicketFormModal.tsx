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
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
} from "./supportUiHelpers.js";
import { useCreateTicket, getSupportApi } from "../../hooks/useSupport.js";
import type { TicketCategory, TicketPriority } from "@avana/domain";

interface SupportTicketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (ticketId: string) => void;
}

export function SupportTicketFormModal({
  isOpen,
  onClose,
  onSuccess,
}: SupportTicketFormModalProps) {
  const [category, setCategory] = useState<TicketCategory>("courses");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createTicketMutation = useCreateTicket();

  const resetForm = () => {
    setCategory("courses");
    setPriority("medium");
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    if (createTicketMutation.isPending || uploading) return;
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
      setErrorMessage("لطفاً عنوان تیکت را وارد کنید (حداقل ۳ کاراکتر).");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setErrorMessage("لطفاً شرح درخواست را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).");
      return;
    }

    try {
      let attachmentUrl: string | null = null;
      if (selectedFile) {
        setUploading(true);
        const uploadRes = await getSupportApi().uploadAttachment(selectedFile);
        attachmentUrl = uploadRes.attachment_url;
      }

      const res = await createTicketMutation.mutateAsync({
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        attachmentUrl,
      });

      setSuccessMessage("درخواست پشتیبانی شما با موفقیت ثبت شد.");
      const ticketId = res.ticket.id;
      setTimeout(() => {
        handleClose();
        onSuccess?.(ticketId);
      }, 1200);
    } catch (err: unknown) {
      setErrorMessage(
        (err as Error)?.message || "خطایی در ثبت تیکت رخ داد. لطفاً مجدداً تلاش کنید.",
      );
    } finally {
      setUploading(false);
    }
  };

  const categoryOptions = Object.entries(TICKET_CATEGORY_LABELS).map(
    ([key, label]) => ({
      value: key,
      label,
    }),
  );

  const priorityOptions = Object.entries(TICKET_PRIORITY_LABELS).map(
    ([key, label]) => ({
      value: key,
      label,
    }),
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="ثبت درخواست پشتیبانی جدید"
      description="مشکلی در دوره‌ها، حساب کاربری یا پرداخت دارید؟ کارشناسان ما پاسخگوی شما خواهند بود."
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
              <Alert variant="error" title="خطا در ثبت تیکت">
                {errorMessage}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  موضوع و دسته‌بندی
                </label>
                <AvanaSelect
                  value={category}
                  onChange={(val) => setCategory(val as TicketCategory)}
                  options={categoryOptions}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  اولویت درخواست
                </label>
                <AvanaSelect
                  value={priority}
                  onChange={(val) => setPriority(val as TicketPriority)}
                  options={priorityOptions}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                عنوان درخواست
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: عدم دسترسی به آزمون پس از پرداخت موفق"
                disabled={createTicketMutation.isPending || uploading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                شرح دقیق مشکل
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="لطفاً توضیح دهید چه اتفاقی افتاده و در صورت داشتن شماره سفارش یا اطلاعات دیگر، آن را بنویسید..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-sans"
                disabled={createTicketMutation.isPending || uploading}
                required
              />
            </div>

            {/* File Attachment */}
            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                پیوست فایل یا تصویر فیش/خطا (اختیاری)
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
                  disabled={createTicketMutation.isPending || uploading}
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
                disabled={createTicketMutation.isPending || uploading}
              >
                انصراف
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={createTicketMutation.isPending || uploading}
              >
                ایجاد تیکت پشتیبانی
              </Button>
            </DialogFooter>
          </form>
        )}
      </div>
    </Dialog>
  );
}
