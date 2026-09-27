import React, { useState } from "react";
import { FlaskConical, ChevronDown, ChevronUp, Code2, AlertCircle } from "lucide-react";

export interface ChemicalFallbackBlockProps {
  rawContent: string;
  language: string;
  title?: string;
  reason?: string;
  className?: string;
}

export const ChemicalFallbackBlock: React.FC<ChemicalFallbackBlockProps> = ({
  rawContent,
  language,
  title,
  reason,
  className = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayTitle =
    title ||
    (language.includes("reaction") || language === "rxn"
      ? "واکنش یا نمودار شیمیایی"
      : "ساختار مولکولی");

  return (
    <div
      className={`my-4 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 sm:p-4 text-slate-800 dark:text-slate-200 shadow-xs ${className}`.trim()}
      dir="rtl"
      data-testid="chemical-fallback-block"
      data-raw-language={language}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {displayTitle}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 font-mono"
                dir="ltr"
              >
                {language}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              اطلاعات ساختار یا فرمول شیمیایی به صورت متن فنی ذخیره شده است.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white/80 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
          data-testid="chemical-fallback-toggle"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{isExpanded ? "بستن متن کد" : "مشاهده کد"}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-900/40">
          {reason && (
            <div className="mb-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{reason}</span>
            </div>
          )}
          <pre
            className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800"
            dir="ltr"
            data-testid="chemical-fallback-raw"
          >
            <code>{rawContent.trim()}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

export interface ChemicalErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ChemicalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ChemicalErrorBoundary extends React.Component<
  ChemicalErrorBoundaryProps,
  ChemicalErrorBoundaryState
> {
  constructor(props: ChemicalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChemicalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Chemical rendering error caught by boundary:", error, errorInfo);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
