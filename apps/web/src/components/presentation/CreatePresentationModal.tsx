import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Wand2,
  UploadCloud,
  FileSpreadsheet,
  X,
  Clock,
  GraduationCap,
  MessageSquare,
  BookOpen,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Alert,
} from "../ui/index.js";
import {
  useCreatePresentationProject,
  useImportPresentationPptx,
} from "../../hooks/usePresentation.js";
import { presentationApi } from "../../lib/api/presentation.js";
import {
  toPersianDigits,
  formatFileSize,
  VALID_DURATIONS,
  ACADEMIC_LEVEL_LABELS,
  TONE_LABELS,
  ELABORATION_DEPTH_LABELS,
} from "./presentation-utils.js";
import type { CreatePresentationProjectRequest } from "@avana/contracts";

interface CreatePresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_PPTX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (Strictly matching backend limits)

export const CreatePresentationModal: React.FC<CreatePresentationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const createMutation = useCreatePresentationProject();
  const importMutation = useImportPresentationPptx();

  // Mode: 'import' (primary default) vs 'manual'
  const [creationMode, setCreationMode] = useState<"import" | "manual">("import");

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scientific Reference input
  const [referenceContent, setReferenceContent] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");

  // Advanced settings toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number>(10);
  const [academicLevel, setAcademicLevel] = useState<CreatePresentationProjectRequest["academic_level"]>("intermediate");
  const [tone, setTone] = useState<CreatePresentationProjectRequest["tone"]>("formal_scientific");
  const [depth, setDepth] = useState<CreatePresentationProjectRequest["elaboration_depth"]>("balanced");
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = createMutation.isPending || importMutation.isPending;

  const validateAndSetFile = (file: File) => {
    // 1. Check file extension (.pptx)
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith(".pptx")) {
      setFormError("فرمت فایل انتخاب‌شده معتبر نیست. لطفاً صرفاً فایل با پسوند .pptx بارگذاری نمایید.");
      return;
    }

    // 2. Check file size (50MB)
    if (file.size > MAX_PPTX_SIZE_BYTES) {
      setFormError(
        `حجم فایل انتخاب‌شده (${formatFileSize(file.size)}) بیش از سقف مجاز ۵۰ مگابایت است. لطفاً حجم فایل را کاهش دهید.`,
      );
      return;
    }

    setFormError(null);
    setSelectedFile(file);

    // Auto-fill title from filename if title is currently empty
    if (!title.trim()) {
      const derivedTitle = file.name.replace(/\.pptx$/i, "").trim();
      if (derivedTitle) {
        setTitle(derivedTitle);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    // Reset input value so same file can be re-selected if removed
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPending) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isPending) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (creationMode === "import" && !selectedFile) {
      setFormError("لطفاً یک فایل پاورپوینت با پسوند .pptx انتخاب یا بارگذاری فرمایید.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("لطفاً عنوان ارائه را وارد نمایید.");
      return;
    }

    if (trimmedTitle.length > 255) {
      setFormError("عنوان ارائه نباید بیشتر از ۲۵۵ کاراکتر باشد.");
      return;
    }

    setFormError(null);

    try {
      let createdProjectId: string | undefined;

      if (creationMode === "import" && selectedFile) {
        // Upload real PPTX file to backend import endpoint
        const response = await importMutation.mutateAsync({
          file: selectedFile,
          options: {
            title: trimmedTitle,
            targetDurationMinutes: duration,
            academicLevel: academicLevel,
            tone: tone,
            elaborationDepth: depth,
          },
        });
        createdProjectId = response.project?.id;
      } else {
        // Create empty presentation project
        const response = await createMutation.mutateAsync({
          title: trimmedTitle,
          target_duration_minutes: duration,
          academic_level: academicLevel,
          tone: tone,
          elaboration_depth: depth,
        });
        createdProjectId = response.project?.id;
      }

      // If user supplied scientific references at project creation time, attach them immediately
      if (referenceContent.trim() && createdProjectId) {
        try {
          await presentationApi.createReference(createdProjectId, {
            type: "text",
            title: referenceTitle.trim() || `منابع علمی پیوست: ${trimmedTitle}`,
            extracted_content: referenceContent.trim(),
          });
        } catch {
          // Non-fatal to project creation
        }
      }

      onClose();
      if (createdProjectId) {
        navigate(`/presentations/${createdProjectId}`);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "خطا در پردازش فایل یا ساخت ارائه. لطفاً مجدداً تلاش فرمایید.";
      setFormError(errorMsg);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={isPending ? () => {} : onClose} maxWidth="lg">
      <DialogHeader onClose={isPending ? () => {} : onClose}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              ساخت ارائه جدید با دستیار هوشمند
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              فایل پاورپوینت و منابع علمی خود را وارد کنید تا متن کامل و پیوسته ارائه تدوین شود.
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <DialogContent className="space-y-4 sm:space-y-5 flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setCreationMode("import");
                setFormError(null);
              }}
              disabled={isPending}
              className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                creationMode === "import"
                  ? "bg-white text-[#008080] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              بارگذاری فایل پاورپوینت (PPTX)
            </button>

            <button
              type="button"
              onClick={() => {
                setCreationMode("manual");
                setFormError(null);
              }}
              disabled={isPending}
              className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
                creationMode === "manual"
                  ? "bg-white text-[#008080] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Plus className="w-4 h-4" />
              شروع با ارائه خالی
            </button>
          </div>

          {formError && (
            <Alert variant="error" className="text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="leading-relaxed">{formError}</span>
              </div>
            </Alert>
          )}

          {/* Import PPTX Area */}
          {creationMode === "import" && (
            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                فایل پاورپوینت ارائه (.pptx) <span className="text-red-500">*</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={handleFileChange}
                className="hidden"
                disabled={isPending}
              />

              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isPending && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? "border-[#008080] bg-[#008080]/5"
                      : "border-slate-200 hover:border-[#008080]/50 hover:bg-slate-50/50 bg-[#F7F9FA]"
                  } ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center mx-auto mb-3">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    فایل پاورپوینت خود را به اینجا بکشید یا کلیک کنید
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3 leading-relaxed">
                    پشتیبانی از فرمت‌های استاندارد PowerPoint (.pptx) تا سقف ۵۰ مگابایت
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs font-bold text-[#008080] border-[#008080]/30 hover:bg-[#008080]/10"
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    انتخاب فایل از رایانه
                  </Button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white border border-[#008080]/30 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 truncate" dir="ltr">
                        {selectedFile.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        حجم: {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  </div>

                  {!isPending && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                      className="text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0 p-1.5 rounded-lg"
                      title="حذف فایل"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* عنوان ارائه */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
              عنوان ارائه <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="مثال: رویکردهای تشخیصی در ایسکمی حاد میوکارد"
              maxLength={255}
              required
              disabled={isPending}
              className="text-sm font-medium"
            />
          </div>

          {/* بخش بارگذاری منابع علمی همزمان */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <BookOpen className="w-4 h-4 text-[#008080]" />
              <span>منابع علمی و مستندات تکمیلی (اختیاری)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              متن چکیده مقالات، دستورالعمل‌های بالینی یا مطالب مرجع را وارد نمایید تا هوش مصنوعی متن ارائه را بر پایه آن‌ها استناددهی کند.
            </p>
            <Input
              type="text"
              value={referenceTitle}
              onChange={(e) => setReferenceTitle(e.target.value)}
              placeholder="عنوان منبع یا مقاله (مثال: دستورالعمل بالینی AHA 2024)"
              maxLength={255}
              disabled={isPending}
              className="text-xs bg-white"
            />
            <textarea
              value={referenceContent}
              onChange={(e) => setReferenceContent(e.target.value)}
              placeholder="متن چکیده، پاراگراف‌های مهم یا توضیحات علمی مرجع را اینجا وارد یا الصاق فرمایید..."
              rows={3}
              disabled={isPending}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#008080] resize-y"
            />
          </div>

          {/* مدت زمان تقریبی */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)] mb-2">
              <Clock className="w-3.5 h-3.5 text-[#008080]" />
              مدت زمان هدف ارائه
            </label>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {VALID_DURATIONS.map((dur) => (
                <button
                  key={dur}
                  type="button"
                  disabled={isPending}
                  onClick={() => setDuration(dur)}
                  className={`py-2 px-1 text-center rounded-xl text-[11px] sm:text-xs font-bold border transition-all cursor-pointer ${
                    duration === dur
                      ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[#008080]/50 hover:text-[var(--color-text)]"
                  } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {toPersianDigits(dur)} دقیقه
                </button>
              ))}
            </div>
          </div>

          {/* تنظیمات پیشرفته (اختیاری) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#008080] transition-colors py-1 cursor-pointer"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>تنظیمات تکمیلی لحن و سطح علمی (اختیاری)</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 p-3.5 sm:p-4 rounded-2xl bg-slate-50/50 border border-slate-200/60 space-y-4">
                {/* سطح علمی */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)] mb-2">
                    <GraduationCap className="w-3.5 h-3.5 text-[#008080]" />
                    سطح علمی مخاطبان
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["introductory", "intermediate", "advanced"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        disabled={isPending}
                        onClick={() => setAcademicLevel(level)}
                        className={`p-2.5 text-start rounded-xl text-xs border transition-all cursor-pointer ${
                          academicLevel === level
                            ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                        } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <div className="font-bold">{ACADEMIC_LEVEL_LABELS[level]}</div>
                      </button>
                    ))}
                  </div>
                </div>


                {/* لحن ارائه و عمق جزئیات */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)] mb-2">
                      <MessageSquare className="w-3.5 h-3.5 text-[#008080]" />
                      لحن بیان
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {(["formal_scientific", "fluent_student"] as const).map((t) => (
                        <label
                          key={t}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            tone === t
                              ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                          } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="radio"
                            name="tone"
                            value={t}
                            disabled={isPending}
                            checked={tone === t}
                            onChange={() => setTone(t)}
                            className="accent-[#008080]"
                          />
                          <span>{TONE_LABELS[t]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)] mb-2">
                      <BookOpen className="w-3.5 h-3.5 text-[#008080]" />
                      عمق پرداختن به محتوا
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {(["concise", "balanced", "comprehensive"] as const).map((d) => (
                        <label
                          key={d}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            depth === d
                              ? "bg-[#008080]/10 border-[#008080] text-[#008080] font-bold"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                          } ${isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <input
                            type="radio"
                            name="elaborationDepth"
                            value={d}
                            disabled={isPending}
                            checked={depth === d}
                            onChange={() => setDepth(d)}
                            className="accent-[#008080]"
                          />
                          <span>{ELABORATION_DEPTH_LABELS[d]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            size="md"
          >
            انصراف
          </Button>

          <Button
            type="submit"
            variant="primary"
            isLoading={isPending}
            disabled={isPending}
            size="md"
            className="gap-2 font-bold"
          >
            <Wand2 className="w-4 h-4" />
            {isPending
              ? creationMode === "import"
                ? "در حال بارگذاری و استخراج اسلایدها..."
                : "در حال ایجاد ارائه..."
              : creationMode === "import"
              ? "استخراج اسلایدها و ورود به فضای کار"
              : "ایجاد ارائه و ورود به فضای کار"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
