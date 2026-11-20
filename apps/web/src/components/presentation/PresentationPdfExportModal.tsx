import React, { useState } from "react";
import {
  FileDown,
  CheckSquare,
  Square,
  AlertTriangle,
  Loader2,
  Lock,
  Mic,
  CheckCircle2,
  BookOpen,
  Stethoscope,
  ArrowLeft,
  Clock,
  Info,
} from "lucide-react";
import type {
  PresentationPdfExportOptions,
  PresentationSlideResource,
} from "@avana/contracts";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../ui/index.js";
import { presentationApi } from "../../lib/api/presentation.js";
import { extractSlideImagesFromPdf } from "./presentation-pdf-export-utils.js";
import { toPersianDigits } from "./presentation-utils.js";

interface PresentationPdfExportModalProps {
  projectId: string;
  projectTitle: string;
  slides: PresentationSlideResource[];
  isPdfReady: boolean;
  pdfUrl?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PresentationPdfExportModal: React.FC<PresentationPdfExportModalProps> = ({
  projectId,
  projectTitle,
  slides,
  isPdfReady,
  pdfUrl = "",
  isOpen,
  onClose,
}) => {
  // Configurable export options
  const [includeSpeechText, setIncludeSpeechText] = useState(true);
  const [includeKeyPoints, setIncludeKeyPoints] = useState(true);
  const [includeSupplementary, setIncludeSupplementary] = useState(true);
  const [includeClinicalExample, setIncludeClinicalExample] = useState(true);
  const [includeTransitionSentence, setIncludeTransitionSentence] = useState(true);
  const [includeEstimatedDuration, setIncludeEstimatedDuration] = useState(true);

  // Export progress states
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState<"idle" | "extracting_images" | "generating_pdf">("idle");
  const [extractedProgress, setExtractedProgress] = useState({ current: 0, total: slides.length });
  const [exportError, setExportError] = useState<string | null>(null);

  // Collect unsaved drafts from sessionStorage
  const collectDraftNotes = (): Record<string, string> => {
    const drafts: Record<string, string> = {};
    if (typeof window === "undefined" || !window.sessionStorage) return drafts;

    for (const slide of slides) {
      try {
        const raw = sessionStorage.getItem(`avana_speech_draft_${projectId}_${slide.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.text === "string" && parsed.text.trim()) {
            drafts[slide.id] = parsed.text.trim();
          }
        }
      } catch {
        // ignore
      }
    }
    return drafts;
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      let extractedImages: Record<number, string> = {};

      // 1. Extract slide images if PDF is ready
      if (isPdfReady && pdfUrl) {
        setExportStep("extracting_images");
        setExtractedProgress({ current: 0, total: slides.length });

        extractedImages = await extractSlideImagesFromPdf({
          pdfUrl,
          totalSlides: slides.length,
          onProgress: (current, total) => {
            setExtractedProgress({ current, total });
          },
        });
      }

      // 2. Request PDF generation on server
      setExportStep("generating_pdf");

      const options: PresentationPdfExportOptions = {
        includeSlideImages: true,
        includeSpeechText,
        includeKeyPoints,
        includeSupplementary,
        includeClinicalExample,
        includeTransitionSentence,
        includeEstimatedDuration,
      };

      const drafts = collectDraftNotes();

      await presentationApi.exportPdf(projectId, {
        options,
        slideImages: extractedImages as unknown as Record<string, string>,
        draftNotesBySlideId: drafts,
      });

      // Close modal on successful download trigger
      setIsExporting(false);
      setExportStep("idle");
      onClose();
    } catch (err: unknown) {
      setIsExporting(false);
      setExportStep("idle");
      const msg = err instanceof Error ? err.message : "خطای ناشناخته در تولید خروجی PDF";
      setExportError(msg);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={isExporting ? () => {} : onClose} maxWidth="lg">
      <DialogHeader onClose={isExporting ? undefined : onClose}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center">
            <FileDown className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">تنظیمات خروجی PDF ارائه</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-sm">
              خروجی PDF برای «{projectTitle}» در قالب آکادمیک آوانا
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-4 py-3">
        {/* Notice if real PDF is unavailable */}
        {!isPdfReady && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>توجه در مورد تصویر اسلایدها:</strong>
              <p className="text-[11px] text-amber-800 mt-0.5">
                فایل تصویری مستقیم پاورپوینت در سرور در دسترس نیست. بنابراین خروجی PDF شامل{' '}
                <strong>بازسازی ساختار محتوایی اسلایدها</strong> (عناوین، جدول‌ها و متن‌ها) خواهد بود، نه تصویر اصلی پاورپوینت.
              </p>
            </div>
          </div>
        )}

        {/* Section Selection List */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            بخش‌های مورد نظر برای قرارگیری در PDF:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* 1. Slide Images (Mandatory & Locked) */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 opacity-90 select-none">
              <div className="mt-0.5 text-[#008080]">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span>تصویر اسلایدها</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" />
                    (اجباری)
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  تصویر واقعی اسلاید در بالای هر بخش قرار می‌گیرد
                </p>
              </div>
            </div>

            {/* 2. Main Speech Text */}
            <div
              onClick={() => !isExporting && setIncludeSpeechText((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                includeSpeechText
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeSpeechText ? "text-[#008080]" : "text-slate-400"}`}>
                {includeSpeechText ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Mic className="w-3.5 h-3.5 text-[#008080]" />
                  <span>متن اصلی سخنرانی</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  متن گفتاری روان (شامل آخرین ویرایش‌های شما)
                </p>
              </div>
            </div>

            {/* 3. Key Points */}
            <div
              onClick={() => !isExporting && setIncludeKeyPoints((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                includeKeyPoints
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeKeyPoints ? "text-[#008080]" : "text-slate-400"}`}>
                {includeKeyPoints ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>نکات کلیدی برای ارائه</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  بولت‌های جمع‌بندی مهم برای سخنران
                </p>
              </div>
            </div>

            {/* 4. Supplementary Explanation */}
            <div
              onClick={() => !isExporting && setIncludeSupplementary((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                includeSupplementary
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeSupplementary ? "text-[#008080]" : "text-slate-400"}`}>
                {includeSupplementary ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>توضیحات تکمیلی</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  توضیح مفهومی عمیق‌تر مرتبط با اسلاید
                </p>
              </div>
            </div>

            {/* 5. Clinical Example & Scenario */}
            <div
              onClick={() => !isExporting && setIncludeClinicalExample((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                includeClinicalExample
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeClinicalExample ? "text-[#008080]" : "text-slate-400"}`}>
                {includeClinicalExample ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                  <span>مثال و سناریوی بالینی</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  سناریوی کاربردی و نکته طلایی آموزشی
                </p>
              </div>
            </div>

            {/* 6. Transition Sentence */}
            <div
              onClick={() => !isExporting && setIncludeTransitionSentence((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                includeTransitionSentence
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeTransitionSentence ? "text-[#008080]" : "text-slate-400"}`}>
                {includeTransitionSentence ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-600" />
                  <span>جمله انتقال به اسلاید بعدی</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  پل ارتباطی کلامی برای جابجایی طبیعی بین اسلایدها
                </p>
              </div>
            </div>

            {/* 7. Estimated Duration */}
            <div
              onClick={() => !isExporting && setIncludeEstimatedDuration((prev) => !prev)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none sm:col-span-2 ${
                includeEstimatedDuration
                  ? "bg-[#008080]/5 border-[#008080]/30"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`mt-0.5 ${includeEstimatedDuration ? "text-[#008080]" : "text-slate-400"}`}>
                {includeEstimatedDuration ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                  <span>مدت زمان تخمینی ارائه هر اسلاید</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  نمایش نشانگر دقیقه پیشنهادی در سربرگ هر اسلاید
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Note on missing content */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>اگر بخشی برای اسلایدی وجود نداشته باشد، هیچ فضای خالی در PDF ایجاد نخواهد شد.</span>
        </div>

        {/* Export Progress Bar */}
        {isExporting && (
          <div className="p-3.5 bg-[#008080]/5 rounded-xl border border-[#008080]/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#008080]">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {exportStep === "extracting_images"
                  ? `در حال استخراج و پردازش تصاویر اسلایدها (${toPersianDigits(extractedProgress.current)} از ${toPersianDigits(extractedProgress.total)})...`
                  : "در حال صفحه‌بندی و تولید فایل PDF در قالب آوانا..."}
              </span>
              {exportStep === "extracting_images" && extractedProgress.total > 0 && (
                <span>{toPersianDigits(Math.round((extractedProgress.current / extractedProgress.total) * 100))}%</span>
              )}
            </div>
            {exportStep === "extracting_images" && (
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#008080] transition-all duration-200"
                  style={{
                    width: `${Math.round((extractedProgress.current / Math.max(1, extractedProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {exportError && (
          <Alert variant="error" className="text-xs">
            {exportError}
          </Alert>
        )}
      </DialogContent>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isExporting}
          className="text-xs"
        >
          انصراف
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleStartExport}
          disabled={isExporting || slides.length === 0}
          isLoading={isExporting}
          className="text-xs font-bold gap-1.5"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>دریافت فایل PDF</span>
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
