import React, { useState, useEffect } from "react";
import {
  Wand2,
  Edit3,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  ShieldCheck,
  X,
  ExternalLink,
  Check,
} from "lucide-react";
import type {
  PresentationSlideResource,
  PresentationReferenceResource,
} from "@avana/contracts";
import type { GeneratedSlideClaim } from "@avana/domain";
import {
  Button,
  Input,
  Alert,
  Badge,
  AvanaSelect,
} from "../ui/index.js";
import { toPersianDigits } from "./presentation-utils.js";
import {
  useUpdatePresentationSlide,
  useGeneratePresentationSlide,
} from "../../hooks/usePresentation.js";

// Helper functions for DOI validation and link formation
function extractCleanDoi(doiOrUrl: string): string {
  return doiOrUrl.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
}

function isValidDoi(doi: string): boolean {
  if (!doi || typeof doi !== "string") return false;
  const clean = extractCleanDoi(doi);
  return /^10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+$/.test(clean);
}

function getDoiUrl(doi: string): string {
  const clean = extractCleanDoi(doi);
  return `https://doi.org/${clean}`;
}

const ACADEMIC_LEVEL_OPTIONS = [
  { value: "introductory", label: "مقدماتی (مفاهیم پایه)" },
  { value: "intermediate", label: "متوسط (دانشگاهی و عمومی)" },
  { value: "advanced", label: "پیشرفته و بالینی (تخصصی)" },
];

const TONE_OPTIONS = [
  { value: "formal_scientific", label: "علمی و دانشگاهی" },
  { value: "fluent_student", label: "روان و دانشجویی" },
];

const ELABORATION_DEPTH_OPTIONS = [
  { value: "concise", label: "خلاصه و بولت‌های کلیدی" },
  { value: "balanced", label: "متعادل و استاندارد" },
  { value: "comprehensive", label: "جامع و تفصیلی" },
];

interface SlideInspectorProps {
  projectId: string;
  slide: PresentationSlideResource | null;
  references?: PresentationReferenceResource[];
  onGenerationComplete?: () => void;
  onClose?: () => void;
  className?: string;
}

export const SlideInspector: React.FC<SlideInspectorProps> = ({
  projectId,
  slide,
  references = [],
  onGenerationComplete,
  onClose,
  className = "",
}) => {
  const updateMutation = useUpdatePresentationSlide(projectId);
  const generateMutation = useGeneratePresentationSlide(projectId);

  // Active Tab: content, ai, citations
  const [activeTab, setActiveTab] = useState<"content" | "ai" | "citations">("content");

  // Form states for slide editing (speaker_notes is managed solely in SlideCanvas)
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [hasVisuals, setHasVisuals] = useState(false);
  const [visualSummary, setVisualSummary] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI Generation Instructions states
  const [customInstructions, setCustomInstructions] = useState("");
  const [aiAcademicLevel, setAiAcademicLevel] = useState<"introductory" | "intermediate" | "advanced">("intermediate");
  const [aiTone, setAiTone] = useState<"formal_scientific" | "fluent_student">("formal_scientific");
  const [aiDepth, setAiDepth] = useState<"concise" | "balanced" | "comprehensive">("balanced");
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Sync state when active slide changes
  useEffect(() => {
    if (slide) {
      setTitle(slide.title || "");
      setRawText(slide.raw_text || "");
      setHasVisuals(slide.has_visuals || false);
      setVisualSummary(slide.visual_summary || "");
      setSaveSuccess(false);
      setSaveError(null);
      setGenerateError(null);
    }
  }, [slide?.id]);

  if (!slide) {
    return (
      <div className={`w-full h-full flex items-center justify-center p-6 text-center text-slate-400 text-xs bg-white border-s border-[var(--color-border)] ${className}`}>
        برای مشاهده یا ویرایش جزئیات، یک اسلاید را انتخاب کنید.
      </div>
    );
  }

  // Calculate if content is dirty
  const isDirty =
    title !== (slide.title || "") ||
    rawText !== (slide.raw_text || "") ||
    hasVisuals !== (slide.has_visuals || false) ||
    visualSummary !== (slide.visual_summary || "");

  // Handle Save Slide Content (Preserves existing speaker_notes untouched)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isDirty || updateMutation.isPending) return;

    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateMutation.mutateAsync({
        slideId: slide.id,
        data: {
          title: title.trim() || null,
          raw_text: rawText,
          speaker_notes: slide.speaker_notes,
          has_visuals: hasVisuals,
          visual_summary: visualSummary.trim() || null,
          expected_updated_at: slide.updated_at,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "خطا در ذخیره‌سازی اسلاید. لطفاً اتصال اینترنت خود را بررسی نمایید.",
      );
    }
  };

  // Handle AI Generate Slide
  const handleGenerate = async () => {
    if (generateMutation.isPending) return;

    setGenerateError(null);

    try {
      await generateMutation.mutateAsync({
        slideId: slide.id,
        instructions: {
          academic_level: aiAcademicLevel,
          tone: aiTone,
          elaboration_depth: aiDepth,
          language: "fa",
          custom_instructions: customInstructions.trim() || undefined,
        },
      });

      if (onGenerationComplete) {
        onGenerationComplete();
      }
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error
          ? err.message
          : "خطا در تولید محتوای هوشمند اسلاید با Gemini 3.5 Flash-Lite. لطفاً مجدداً تلاش فرمایید.",
      );
    }
  };

  // Extract all claims associated with this slide (from metadata, speech_content, or generatedSlide)
  const claims: GeneratedSlideClaim[] = React.useMemo(() => {
    if (slide.extraction_metadata?.claims && Array.isArray(slide.extraction_metadata.claims)) {
      return slide.extraction_metadata.claims as GeneratedSlideClaim[];
    }
    const sc = slide.speech_content ?? (slide.extraction_metadata?.speechContent as any);
    if (sc?.claims && Array.isArray(sc.claims)) {
      return sc.claims as GeneratedSlideClaim[];
    }
    const genSlide = slide.extraction_metadata?.generatedSlide as any;
    if (genSlide?.content && Array.isArray(genSlide.content)) {
      const flattened = genSlide.content.flatMap((c: any) => c.claims || []);
      if (flattened.length > 0) return flattened;
    }
    return [];
  }, [slide]);

  // Authoritative chunkId -> referenceId mapping from slide citations
  const citationsChunkToRefMap = React.useMemo(() => {
    const map = new Map<string, string>();
    const sc = slide.speech_content ?? (slide.extraction_metadata?.speechContent as any);
    if (Array.isArray(sc?.citations)) {
      for (const cit of sc.citations) {
        if (cit?.chunkId && cit?.referenceId) {
          map.set(String(cit.chunkId).trim(), String(cit.referenceId).trim());
        }
      }
    }
    const genSlide = slide.extraction_metadata?.generatedSlide as any;
    if (Array.isArray(genSlide?.citations)) {
      for (const cit of genSlide.citations) {
        if (cit?.chunkId && cit?.referenceId) {
          map.set(String(cit.chunkId).trim(), String(cit.referenceId).trim());
        }
      }
    }
    const directCitations = (slide as any).citations;
    if (Array.isArray(directCitations)) {
      for (const cit of directCitations) {
        if (cit?.chunkId && cit?.referenceId) {
          map.set(String(cit.chunkId).trim(), String(cit.referenceId).trim());
        }
      }
    }
    return map;
  }, [slide]);

  return (
    <div
      className={`w-full h-full flex flex-col bg-white border-s border-[var(--color-border)] select-text ${className}`}
    >
      {/* Inspector Header */}
      <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-[#008080]" />
          <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
            تنظیمات و بازرسی اسلاید
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">
            اسلاید {toPersianDigits(slide.slide_index)}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              title="بستن سایدبار تنظیمات"
              aria-label="بستن سایدبار تنظیمات"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-4 pt-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("content")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "content"
                ? "border-[#008080] text-[#008080]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            محتوا و ویرایش
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "ai"
                ? "border-[#008080] text-[#008080]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            تنظیمات AI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("citations")}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === "citations"
                ? "border-[#008080] text-[#008080]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            استنادها ({toPersianDigits(claims.length)})
          </button>
        </div>
      </div>

      {/* Tab 1: Content (Slide Title & Raw Text) */}
      {activeTab === "content" && (
        <form onSubmit={handleSave} className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {saveSuccess && (
              <Alert variant="success" className="text-xs">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>تغییرات اسلاید با موفقیت در دیتابیس ذخیره شد.</span>
                </div>
              </Alert>
            )}

            {saveError && (
              <Alert variant="error" className="text-xs">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              </Alert>
            )}

            {/* Slide Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                عنوان اسلاید
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان اصلی این اسلاید..."
                maxLength={255}
                className="text-xs font-semibold"
              />
            </div>

            {/* Raw Text Content */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                متن خام و سرفصل‌های اسلاید
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={7}
                placeholder="نکات کلیدی، پاراگراف‌ها یا بولت‌های این اسلاید را اینجا یادداشت نمایید..."
                className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent leading-relaxed"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                برای تفکیک پاراگراف‌ها از دو بار فشردن Enter استفاده فرمایید.
              </p>
            </div>

            {/* Visuals Toggle */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVisuals}
                  onChange={(e) => setHasVisuals(e.target.checked)}
                  className="rounded accent-[#008080]"
                />
                اسلاید دارای نمودار، تصویر یا جدول گرافیکی است
              </label>

              {hasVisuals && (
                <div className="mt-2">
                  <Input
                    type="text"
                    value={visualSummary}
                    onChange={(e) => setVisualSummary(e.target.value)}
                    placeholder="توضیح کوتاه ساختار بصری یا نمودار..."
                    className="text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-slate-400">
              {isDirty ? "تغییرات ذخیره‌نشده موجود است" : "تمامی تغییرات ذخیره هستند"}
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!isDirty || updateMutation.isPending}
              isLoading={updateMutation.isPending}
              className="gap-1.5 text-xs font-bold"
            >
              <Save className="w-3.5 h-3.5" />
              ذخیره تغییرات
            </Button>
          </div>
        </form>
      )}

      {/* Tab 2: AI Generation Controls */}
      {activeTab === "ai" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {generateError && (
            <Alert variant="error" className="text-xs">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{generateError}</span>
              </div>
            </Alert>
          )}

          {/* Custom Instructions */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              دستورالعمل اختصاصی برای این اسلاید (اختیاری)
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={3}
              placeholder="مثال: تأکید بیشتر بر نتایج کارآزمایی‌های بالینی اخیر و مقایسه دوزها..."
              className="w-full text-xs font-medium p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent leading-relaxed"
            />
          </div>

          {/* Academic Level */}
          <div>
            <AvanaSelect
              label="سطح علمی"
              size="sm"
              value={aiAcademicLevel}
              options={ACADEMIC_LEVEL_OPTIONS}
              onChange={(val) => setAiAcademicLevel(val as "introductory" | "intermediate" | "advanced")}
            />
          </div>

          {/* Tone */}
          <div>
            <AvanaSelect
              label="لحن بیان"
              size="sm"
              value={aiTone}
              options={TONE_OPTIONS}
              onChange={(val) => setAiTone(val as "formal_scientific" | "fluent_student")}
            />
          </div>

          {/* Depth */}
          <div>
            <AvanaSelect
              label="عمق پرداخت به جزئیات"
              size="sm"
              value={aiDepth}
              options={ELABORATION_DEPTH_OPTIONS}
              onChange={(val) => setAiDepth(val as "concise" | "balanced" | "comprehensive")}
            />
          </div>

          {/* Trigger Generate Button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              isLoading={generateMutation.isPending}
              className="w-full gap-2 text-xs font-bold py-3"
            >
              <Wand2 className="w-4 h-4" />
              {generateMutation.isPending
                ? "در حال اعتبارسنجی و تولید با Gemini..."
                : slide?.is_paid
                ? "بازتولید رایگان این اسلاید"
                : "شروع تولید هوشمند این اسلاید (۱٬۵۰۰ تومان)"}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: Citations & Claims with 3-Tier Independent Validation */}
      {activeTab === "citations" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>ادعاهای علمی و استنادها</span>
            <Badge variant="neutral" size="sm">
              {toPersianDigits(claims.length)} ادعا
            </Badge>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            اعتبارسنجی مستقل ۳ سطحی: ۱. وجود فیزیکی منبع در اسنپ‌شات، ۲. صحت متادیتا و DOI، ۳. ارزیابی انطباق ادعا توسط هوش مصنوعی.
          </p>

          {claims.length === 0 ? (
            <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <BookOpen className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">
                هنوز ادعای علمی یا استنادی برای این اسلاید ثبت نشده است. پس از تولید با هوش مصنوعی، ادعاها و مشخصات مراجع استخراج‌شده در این بخش متمرکز خواهند بود.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim, idx) => {
                const isInsufficient = claim.evidenceStatus === "insufficient_evidence";
                const hasChunks = Array.isArray(claim.chunkIds) && claim.chunkIds.length > 0;

                // Match references authoritatively via citations mapping or exact ID match
                const matchedRefs: PresentationReferenceResource[] = [];
                const addedIds = new Set<string>();

                for (const rawCid of claim.chunkIds || []) {
                  const cid = String(rawCid).trim();
                  const mappedRefId = citationsChunkToRefMap.get(cid);
                  if (mappedRefId) {
                    const found = references.find((r) => r.id === mappedRefId);
                    if (found && !addedIds.has(found.id)) {
                      matchedRefs.push(found);
                      addedIds.add(found.id);
                    }
                  } else {
                    const direct = references.find((r) => r.id === cid || r.source_identifier === cid);
                    if (direct && !addedIds.has(direct.id)) {
                      matchedRefs.push(direct);
                      addedIds.add(direct.id);
                    }
                  }
                }

                const isSupported = claim.evidenceStatus === "supported" && hasChunks;

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed transition-all ${
                      isSupported
                        ? "bg-white border-slate-200 shadow-xs"
                        : isInsufficient
                        ? "bg-amber-50/70 border-amber-300"
                        : "bg-rose-50/70 border-rose-300"
                    }`}
                  >
                    <div className="flex items-start gap-1.5 font-semibold text-slate-800">
                      {isSupported ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <span className="flex-1">{claim.text}</span>
                    </div>

                    {/* 3-Tier Status Row */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-1 gap-1.5 text-[10px]">
                      {/* Tier 1: Real Source Existence */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">۱. وجود فیزیکی منبع در اسنپ‌شات:</span>
                        <strong className={isSupported ? "text-emerald-700" : isInsufficient ? "text-slate-600" : "text-rose-700"}>
                          {isSupported
                            ? "تأییدشده در اسنپ‌شات مراجع پروژه"
                            : isInsufficient
                            ? "فاقد ارجاع مستند در اسناد"
                            : "فاقد منبع ثبت‌شده در پروژه"}
                        </strong>
                      </div>

                      {/* Tier 2: Bibliographic Metadata Accuracy */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">۲. صحت متادیتا و DOI:</span>
                        <strong className={matchedRefs.length > 0 ? "text-emerald-700" : isInsufficient ? "text-slate-600" : "text-amber-700"}>
                          {matchedRefs.length > 0
                            ? "مشخصات کتاب‌شناختی معتبر"
                            : isInsufficient
                            ? "بدون نیاز به شناسه استنادی"
                            : "فاقد شناسه استنادی ثبت‌شده"}
                        </strong>
                      </div>

                      {/* Tier 3: AI Claim Support Assessment */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">۳. ارزیابی پشتیبانی ادعا (توسط هوش مصنوعی):</span>
                        <strong className={isSupported ? "text-emerald-700" : isInsufficient ? "text-amber-800 font-bold" : "text-rose-700 font-bold"}>
                          {isSupported
                            ? "پشتیبانی‌شده در متن منبع (ارزیابی‌شده توسط Gemini)"
                            : isInsufficient
                            ? "شواهد ناکافی در اسناد پروژه (بدون استناد ساختگی)"
                            : "عدم تطبیق یا منبع نامعتبر"}
                        </strong>
                      </div>
                    </div>

                    {/* Matched References & Clickable DOI */}
                    {matchedRefs.map((ref) => {
                      const meta = (ref.bibliographic_metadata || {}) as Record<string, unknown>;
                      const doi = typeof meta.detectedDoi === "string" ? meta.detectedDoi : null;
                      const validDoi = doi && isValidDoi(doi);
                      const rawYear = meta.detectedYear || meta.year;
                      const year = typeof rawYear === "string" || typeof rawYear === "number" ? rawYear : null;
                      const authors = Array.isArray(meta.authors) ? meta.authors.join("، ") : null;
                      const directUrl =
                        typeof meta.url === "string" && meta.url.startsWith("http")
                          ? meta.url
                          : typeof ref.source_identifier === "string" && ref.source_identifier.startsWith("http")
                          ? ref.source_identifier
                          : null;

                      return (
                        <div
                          key={ref.id}
                          className="mt-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[10px] text-slate-600 space-y-1.5"
                        >
                          <div className="font-bold text-slate-800 flex items-center justify-between">
                            <span className="truncate max-w-[220px]">{ref.title}</span>
                            {ref.type && (
                              <Badge variant="neutral" size="sm" className="text-[9px]">
                                {ref.type}
                              </Badge>
                            )}
                          </div>
                          {authors && (
                            <div className="text-slate-500">
                              نویسندگان: {authors} {year ? `(${toPersianDigits(year)})` : ""}
                            </div>
                          )}
                          <div className="pt-0.5 flex items-center gap-3 flex-wrap">
                            {doi && (
                              <div className="flex items-center gap-1 font-mono">
                                <span>DOI:</span>
                                {validDoi ? (
                                  <a
                                    href={getDoiUrl(doi)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#008080] hover:underline flex items-center gap-0.5 font-bold"
                                  >
                                    {getDoiUrl(doi)}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ) : (
                                  <span className="text-amber-600">{doi}</span>
                                )}
                              </div>
                            )}
                            {directUrl && (
                              <a
                                href={directUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#008080] hover:underline flex items-center gap-0.5 font-bold"
                              >
                                <span>مشاهده سند</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
