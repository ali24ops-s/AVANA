/**
 * Node Details Drawer & Comprehensive Educational Knowledge Reference.
 *
 * Displays:
 * - Structured educational knowledge tailored to node nature (drug, disease, cellular mechanism, etc.).
 * - Clean categorization (Mechanism of action, indications, pharmacology, adverse effects,
 *   contraindications, interactions, clinical pearls, exam tips, common pitfalls, related concepts).
 * - Full normalization of legacy fields (keyPoints, examTips, examples, detailedExplanation)
 *   and structured fields without duplicate or lost information.
 * - Source citations and private user notes.
 */

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  BookOpen,
  GraduationCap,
  Bookmark,
  FileText,
  Check,
  ExternalLink,
  Activity,
  AlertTriangle,
  Layers,
  Pill,
  ShieldAlert,
  GitFork,
  Stethoscope,
  Info,
  FlaskConical,
} from "lucide-react";
import { Button, Badge } from "@avana/ui";
import type { MindMapNodeBase, MindMapChemicalStructure } from "@avana/contracts";
import { toPersianDigits, type ChemicalStructure } from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import { ChemicalStructureBlock } from "../chemistry/ChemicalStructureBlock.js";
import { ChemicalErrorBoundary } from "../chemistry/ChemicalFallbackBlock.js";

export interface MindMapDetailDrawerProps {
  node: (MindMapNodeBase & { isUserCustom?: boolean; isOverridden?: boolean; userNote?: string }) | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveNote: (nodeId: string, noteText: string) => void;
  onExpandAi?: (nodeId: string) => Promise<void>;
  isExpanding?: boolean;
  viewportChangeCount?: number;
  mindMapId?: string;
  version?: number;
}

/**
 * Normalizes and deduplicates two string arrays while preserving order and distinct complementary details.
 */
function deduplicateStrings(primary?: string[], secondary?: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (arr?: string[]) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const normalized = trimmed.replace(/\u200c/g, "").replace(/[\s\t\r\n]+/g, " ").toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(trimmed);
      }
    }
  };

  add(primary);
  add(secondary);
  return result;
}

export function MindMapDetailDrawer({
  node,
  isOpen,
  onClose,
  onSaveNote,
}: MindMapDetailDrawerProps) {
  const [localNote, setLocalNote] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (node) {
      setLocalNote(node.userNote || "");
      setIsSaved(false);
    }
  }, [node?.id]);

  // Keep portal target in sync with fullscreen element or document.body
  useEffect(() => {
    const updateTarget = () => {
      if (typeof document === "undefined") return;
      setPortalTarget((document.fullscreenElement as HTMLElement) || document.body);
    };

    updateTarget();
    document.addEventListener("fullscreenchange", updateTarget);
    return () => {
      document.removeEventListener("fullscreenchange", updateTarget);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Normalize educational content across legacy and structured fields
  const details = useMemo(() => {
    if (!node) return null;

    const structured = node.structuredDetails || {};

    // 1. Mechanism
    const rawMech =
      structured.mechanismOfAction ??
      ((structured as Record<string, unknown>).mechanism as string | undefined);
    const mechanism = typeof rawMech === "string" ? rawMech.trim() : undefined;

    // 2. Indications / Clinical uses (combine structured indications + legacy examples)
    const indications = deduplicateStrings(structured.indications, node.examples);

    // 3. Key Points & Pearls (combine legacy keyPoints + structured clinicalPearls)
    const keyPoints = deduplicateStrings(node.keyPoints, structured.clinicalPearls);

    // 4. Exam Tips
    const examTips = deduplicateStrings(
      node.examTips,
      Array.isArray((structured as Record<string, unknown>).examTips)
        ? ((structured as Record<string, unknown>).examTips as string[])
        : undefined,
    );

    // 5. Adverse Effects
    const adverseEffects = Array.isArray(structured.adverseEffects)
      ? structured.adverseEffects.filter((a) => typeof a === "string" && a.trim().length > 0)
      : [];

    // 6. Contraindications & Drug Interactions
    const contraindications = Array.isArray(structured.contraindications)
      ? structured.contraindications.filter((c) => typeof c === "string" && c.trim().length > 0)
      : [];
    const interactions = Array.isArray(structured.interactions)
      ? structured.interactions.filter((i) => typeof i === "string" && i.trim().length > 0)
      : [];

    // 7. Common Pitfalls
    const pitfalls = Array.isArray(structured.commonPitfalls)
      ? structured.commonPitfalls.filter((p) => typeof p === "string" && p.trim().length > 0)
      : [];

    // 8. Related Concepts
    const relatedConcepts = Array.isArray(structured.relatedConcepts)
      ? structured.relatedConcepts.filter((r) => typeof r === "string" && r.trim().length > 0)
      : [];

    // 9. Pharmacology / PK-PD
    const pharmacology = structured.pharmacology?.trim();
    const drugClass = structured.drugClass?.trim();

    // 10. Additional detailed markdown explanation (if not solely duplicate of shortDescription)
    const detailedExplanation = node.detailedExplanation?.trim();
    const showDetailedExp =
      Boolean(detailedExplanation) &&
      detailedExplanation !== node.shortDescription?.trim();

    // 11. Custom sections
    const sections = Array.isArray(node.sections) ? node.sections : [];

    // Check if node has been enriched with deep details
    const hasDetailedKnowledge = Boolean(
      mechanism ||
      indications.length > 0 ||
      adverseEffects.length > 0 ||
      contraindications.length > 0 ||
      interactions.length > 0 ||
      pharmacology ||
      showDetailedExp ||
      sections.length > 0,
    );

    return {
      mechanism,
      indications,
      keyPoints,
      examTips,
      adverseEffects,
      contraindications,
      interactions,
      pitfalls,
      relatedConcepts,
      pharmacology,
      drugClass,
      showDetailedExp,
      detailedExplanation,
      sections,
      hasDetailedKnowledge,
    };
  }, [node]);

  const chemicalStructureForBlock = useMemo<ChemicalStructure | null>(() => {
    if (
      !node?.chemicalStructure ||
      !node.chemicalStructure.isValidated ||
      node.chemicalStructure.confidence !== "high" ||
      node.chemicalStatus !== "enriched"
    ) {
      return null;
    }
    return {
      ...node.chemicalStructure,
      needsReview: false,
    };
  }, [node?.chemicalStructure, node?.chemicalStatus]);

  const relatedChemicalsForBlock = useMemo<MindMapChemicalStructure[]>(() => {
    if (!node?.relatedChemicals || !Array.isArray(node.relatedChemicals)) {
      return [];
    }
    return node.relatedChemicals.filter((c) => c.isValidated && c.confidence === "high");
  }, [node?.relatedChemicals]);

  const RELATION_LABELS: Record<string, { label: string; className: string }> = {
    class_member: {
      label: "عضو رده دارویی",
      className: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    },
    combination_component: {
      label: "جزء فرمولاسیون ترکیبی (Combination Component)",
      className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    },
    example_of: {
      label: "نمونه شاخص",
      className: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    },
    mechanism_related: {
      label: "مرتبط با مکانیسم اثر",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    },
    sar_related: {
      label: "تحلیل ساختار-فعالیت (SAR)",
      className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
    },
    mentioned_in: {
      label: "ذکرشده در مبحث",
      className: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    },
  };

  const CATEGORY_LABELS: Record<string, string> = {
    drug: "دارو / فارماکولوژی",
    disease: "بیماری / پاتولوژی",
    mechanism: "مکانیسم سلولی-مولکولی",
    cellular_mechanism: "مکانیسم سلولی-مولکولی",
    biochemistry: "بیوشیمی / مسیر متابولیک",
    diagnosis: "تشخیص و نشانه‌ها",
    treatment: "درمان و مدیریت",
    anatomy: "آناتومی / بافت‌شناسی",
    physiology: "فیزیولوژی",
    general: "مفهوم پایه",
    concept: "مفهوم پایه",
  };

  const categoryLabel = node?.category ? (CATEGORY_LABELS[node.category] || node.category) : null;

  if (!isOpen || !node || !details) return null;

  const handleNoteSave = () => {
    onSaveNote(node.id, localNote);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const modalBody = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      role="presentation"
    >
      {/* Backdrop with click-outside to close */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="جزئیات شاخه مایندمپ"
        data-testid="mindmap-detail-drawer"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="relative z-10 w-full max-w-xl max-h-[85vh] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 font-sans select-text"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <BookOpen className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)] truncate">
                {node.title}
              </h3>
              {categoryLabel && (
                <Badge variant="secondary" size="sm" className="text-[10px]">
                  {categoryLabel}
                </Badge>
              )}
              {node.nodeRole === "category" && (
                <Badge variant="neutral" size="sm" className="text-[10px] text-teal-600 border-teal-500/40 bg-teal-50/50 dark:bg-teal-950/30">
                  دسته‌بندی موضوعی
                </Badge>
              )}
              {details.drugClass && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 font-medium">
                  {details.drugClass}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            data-testid="mindmap-detail-drawer-close"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
            title="بستن پنل"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {/* Section: Short Description / Initial Concept Overview */}
          {node.shortDescription && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>معرفی و تعریف مفهوم</span>
              </h4>
              <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed bg-[var(--color-surface-warm)] p-3.5 rounded-xl border border-[var(--color-border)]">
                {node.shortDescription}
              </p>
            </div>
          )}

          {/* Section: Chemical Structure */}
          {chemicalStructureForBlock && (
            <div className="space-y-1.5" data-testid="mindmap-chemical-section">
              <h4 className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>ساختار شیمیایی</span>
              </h4>
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                <ChemicalErrorBoundary
                  fallback={
                    <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10">
                      خطا در نمایش ساختار شیمیایی
                    </div>
                  }
                >
                  <ChemicalStructureBlock
                    structure={chemicalStructureForBlock}
                    showSarHighlights={true}
                  />
                </ChemicalErrorBoundary>
              </div>
            </div>
          )}

          {/* Section: Related Chemicals */}
          {relatedChemicalsForBlock.length > 0 && (
            <div className="space-y-2.5" data-testid="mindmap-related-chemicals-section">
              <h4 className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>ترکیبات شیمیایی مرتبط ({toPersianDigits(relatedChemicalsForBlock.length)})</span>
              </h4>
              <div className="space-y-3">
                {relatedChemicalsForBlock.map((relatedStruct, idx) => {
                  const relMeta = relatedStruct.relationType
                    ? RELATION_LABELS[relatedStruct.relationType]
                    : undefined;

                  return (
                    <div
                      key={relatedStruct.compoundName || idx}
                      className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] shadow-2xs"
                    >
                      {relMeta && (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-[var(--color-surface-warm)]/90 border-b border-[var(--color-border)] text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold border ${relMeta.className}`}
                            data-testid="chemical-relation-badge"
                            data-relation-type={relatedStruct.relationType}
                          >
                            {relMeta.label}
                          </span>
                          {relatedStruct.provenanceField && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              منبع استخراج: {relatedStruct.provenanceField === "shortDescription" ? "توضیح کوتاه" : relatedStruct.provenanceField === "keyPoints" ? "نکات کلیدی" : "عنوان گره"}
                            </span>
                          )}
                        </div>
                      )}
                      {relatedStruct.educationalNote && (
                        <div className="px-3.5 py-2 text-[11px] text-[var(--color-text)] bg-teal-500/5 dark:bg-teal-950/20 border-b border-[var(--color-border)] leading-relaxed">
                          {relatedStruct.educationalNote}
                        </div>
                      )}
                      <ChemicalErrorBoundary
                        fallback={
                          <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10">
                            خطا در نمایش ساختار {relatedStruct.compoundName}
                          </div>
                        }
                      >
                        <ChemicalStructureBlock
                          structure={relatedStruct as unknown as ChemicalStructure}
                          showSarHighlights={false}
                        />
                      </ChemicalErrorBoundary>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Mechanism of Action / Pathophysiology */}
          {details.mechanism && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>
                  {node.category === "disease" ? "پاتوفیزیولوژی و علل بیماری" : "مکانیسم اثر و مسیر سلولی"}
                </span>
              </h4>
              <div className="text-xs text-[var(--color-text)] leading-relaxed bg-teal-500/5 dark:bg-teal-950/20 p-3 rounded-xl border border-teal-500/20">
                <RichContent content={details.mechanism} />
              </div>
            </div>
          )}

          {/* Section: Clinical Indications & Therapeutic Uses */}
          {details.indications.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-primary" />
                <span>کاربردها و موارد مصرف بالینی</span>
              </h4>
              <ul className="space-y-1.5">
                {details.indications.map((ind, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{ind}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Pharmacology / Pharmacokinetics & Pharmacodynamics */}
          {details.pharmacology && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>ویژگی‌های فارماکوکینتیک و فارماکودینامیک</span>
              </h4>
              <div className="text-xs text-[var(--color-text)] leading-relaxed bg-blue-500/5 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-500/20">
                <RichContent content={details.pharmacology} />
              </div>
            </div>
          )}

          {/* Section: Adverse Effects & Toxicities */}
          {details.adverseEffects.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <span>عوارض جانبی و نکات سمیت</span>
              </h4>
              <ul className="space-y-1.5">
                {details.adverseEffects.map((adv, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-rose-950 dark:text-rose-200 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{adv}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Contraindications & Precautions */}
          {details.contraindications.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>موارد منع مصرف و احتیاط‌های ویژه</span>
              </h4>
              <ul className="space-y-1.5">
                {details.contraindications.map((contra, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-200 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{contra}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Drug Interactions */}
          {details.interactions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>تداخلات مهم</span>
              </h4>
              <ul className="space-y-1.5">
                {details.interactions.map((inter, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{inter}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Key Points & Clinical Pearls */}
          {details.keyPoints.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>نکات کلیدی و مرواریدهای بالینی</span>
              </h4>
              <ul className="space-y-1.5">
                {details.keyPoints.map((point, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Exam Tips */}
          {details.examTips.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>نکات طلایی آزمونی</span>
              </h4>
              <ul className="space-y-1.5">
                {details.examTips.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Common Pitfalls */}
          {details.pitfalls.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <span>اشتباهات رایج و هشدارهای مهم</span>
              </h4>
              <ul className="space-y-1.5">
                {details.pitfalls.map((pit, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-rose-950 dark:text-rose-200 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{pit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Section: Related Concepts */}
          {details.relatedConcepts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>ارتباط با سایر مفاهیم مایندمپ</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {details.relatedConcepts.map((concept, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 font-medium"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Section: Comprehensive Context & Detailed Documentation */}
          {details.showDetailedExp && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                <span>توضیحات و مستندات تکمیلی</span>
              </h4>
              <div className="text-xs text-[var(--color-text)] leading-relaxed bg-[var(--color-surface-warm)] p-3.5 rounded-xl border border-[var(--color-border)]">
                <RichContent content={details.detailedExplanation!} />
              </div>
            </div>
          )}

          {/* Section: Extensible Custom Sections */}
          {details.sections.map((sec, idx) => (
            <div key={sec.id || idx} className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>{sec.title}</span>
              </h4>
              {sec.content && (
                <div className="text-xs text-[var(--color-text)] leading-relaxed bg-[var(--color-surface-warm)] p-3 rounded-xl border border-[var(--color-border)]">
                  <RichContent content={sec.content} />
                </div>
              )}
              {Array.isArray(sec.items) && sec.items.length > 0 && (
                <ul className="space-y-1.5">
                  {sec.items.map((item, itemIdx) => (
                    <li
                      key={itemIdx}
                      className="flex items-start gap-2 text-xs text-[var(--color-text)] bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* Source References */}
          {node.sourceReferences && node.sourceReferences.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>ارجاع به منبع آموزشی</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {node.sourceReferences.map((ref, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                  >
                    {ref.pageNumber ? `صفحه ${toPersianDigits(ref.pageNumber)}` : null}
                    {ref.lessonTitle ? `درسنامه «${ref.lessonTitle}»` : null}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* User Personal Notes Section */}
          <div className="space-y-2.5 pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>یادداشت شخصی شما روی این شاخه</span>
              </h4>
              {isSaved && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  <Check className="w-3 h-3" />
                  <span>ذخیره شد</span>
                </span>
              )}
            </div>
            <textarea
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              placeholder="نکات، یادداشت‌ها یا برداشت‌های شخصی خود از این مبحث را اینجا بنویسید..."
              rows={4}
              className="w-full p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
            />
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleNoteSave}
                disabled={localNote === (node.userNote || "")}
              >
                <span>ذخیره یادداشت</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const mountNode = portalTarget || (typeof document !== "undefined" ? document.body : null);
  if (!mountNode) return null;

  return createPortal(modalBody, mountNode);
}
