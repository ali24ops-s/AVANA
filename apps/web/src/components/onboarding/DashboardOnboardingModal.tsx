import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@avana/ui";
import {
  BookOpen,
  Layers,
  Sparkles,
  GraduationCap,
  Calendar,
  HelpCircle,
  Library as LibraryIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import { useReducedMotion } from "framer-motion";

export interface DashboardOnboardingModalProps {
  isOpen: boolean;
  onClose: (action: "skip" | "complete", step: number) => void;
  isSaving?: boolean;
}

export interface TourStep {
  id: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  targetSelector: string;
  fallbackSelector?: string;
  placement?: "auto" | "bottom" | "top" | "left" | "right";
  padding?: number;
}

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    icon: BookOpen,
    title: "دوره‌های من",
    description:
      "مسیر یادگیری شما از اینجا آغاز می‌شود. دوره‌های فعال، درصد پیشرفت و سرفصل‌ها را در این بخش مشاهده کنید.",
    targetSelector: '[data-tour="my-courses"]',
    fallbackSelector: "main",
    placement: "bottom",
    padding: 10,
  },
  {
    id: 2,
    icon: BookOpen,
    title: "دوره‌ها",
    description:
      "دسترسی به فهرست تمام دوره‌های درسی، ساخت دوره جدید و مرور سرفصل‌های آموزشی شما.",
    targetSelector: '[data-tour="nav-courses"]',
    fallbackSelector: '[data-tour="mobile-nav-toggle"]',
    placement: "bottom",
    padding: 6,
  },
  {
    id: 3,
    icon: GraduationCap,
    title: "کلاس‌های من",
    description:
      "مشاهده کلاس‌های درسی فعال، عضویت با کد دعوت استاد و دسترسی به تکالیف و آزمون‌های کلاسی.",
    targetSelector: '[data-tour="nav-my-classes"]',
    fallbackSelector: '[data-tour="mobile-nav-toggle"]',
    placement: "bottom",
    padding: 6,
  },
  {
    id: 4,
    icon: HelpCircle,
    title: "آزمون‌ها",
    description:
      "ساخت آزمون‌های خودسنجی تستی، تعیین مباحث درسی و مشاهده سابقه و کارنامه آزمون‌های شما.",
    targetSelector: '[data-tour="nav-exams"]',
    fallbackSelector: '[data-tour="mobile-nav-toggle"]',
    placement: "bottom",
    padding: 6,
  },
  {
    id: 5,
    icon: LibraryIcon,
    title: "کتابخانه",
    description:
      "کاوش در دوره‌ها و منابع آماده آوانا در رشته‌های مختلف و افزودن آن‌ها به فضای مطالعه‌تان.",
    targetSelector: '[data-tour="nav-library"]',
    fallbackSelector: '[data-tour="mobile-nav-toggle"]',
    placement: "bottom",
    padding: 6,
  },
  {
    id: 6,
    icon: Layers,
    title: "فلش‌کارت‌ها",
    description:
      "مرور هوشمند و فاصله‌دار جعبه لایتنر برای تثبیت نکات کلیدی و فرمول‌ها در حافظه بلندمدت.",
    targetSelector: '[data-tour="nav-flashcards"]',
    fallbackSelector: '[data-tour="mobile-nav-toggle"]',
    placement: "bottom",
    padding: 6,
  },
  {
    id: 7,
    icon: Calendar,
    title: "امتحاناتت رو فراموش نکن",
    description:
      "تاریخ امتحاناتت رو اینجا ثبت کن تا همه رو یکجا ببینی و بدونی چقدر تا هر امتحان فرصت داری. آوانا هم از همین اطلاعات برای تنظیم برنامه مطالعه‌ای دقیق‌تر و مؤثرتر استفاده می‌کنه.",
    targetSelector: '[data-tour="upcoming-exams"]',
    fallbackSelector: '[data-tour="my-courses"]',
    placement: "top",
    padding: 8,
  },
  {
    id: 8,
    icon: Sparkles,
    title: "هر جای آوانا سوال داشتی، بپرس",
    description:
      "نمی‌دونی یک قابلیت کجاست یا چطور از بخشی از آوانا استفاده کنی؟ از دستیار هوشمند بپرس تا راهنمایی‌ات کنه و راحت‌تر از امکانات آوانا استفاده کنی.",
    targetSelector: '[data-tour="smart-assistant"]',
    fallbackSelector: '[data-tour="my-courses"]',
    placement: "left",
    padding: 8,
  },
  {
    id: 9,
    icon: Calendar,
    title: "برنامه مطالعه‌ات آماده‌ست!",
    description:
      "آوانا کارهای مطالعه‌ات رو به تسک‌های روزانه تبدیل می‌کنه و برنامه رو برات می‌چینه. تو فقط کافیه تسک‌های هر روز رو دنبال کنی و قدم‌به‌قدم پیش بری. اطلاعات امتحاناتت هم به آوانا کمک می‌کنه برنامه دقیق‌تر و کارآمدتری بچینه.",
    targetSelector: '[data-tour="study-planner"]',
    fallbackSelector: '[data-tour="upcoming-exams"]',
    placement: "top",
    padding: 8,
  },
];

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface PopoverPosition {
  top: number;
  left: number;
  arrowPlacement: "top" | "bottom" | "left" | "right";
  arrowOffset: number;
}

export const DashboardOnboardingModal: React.FC<DashboardOnboardingModalProps> = ({
  isOpen,
  onClose,
  isSaving = false,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition>({
    top: 100,
    left: 20,
    arrowPlacement: "top",
    arrowOffset: 40,
  });

  const popoverRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const step = DASHBOARD_TOUR_STEPS[currentStepIndex];
  const StepIcon = step.icon;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === DASHBOARD_TOUR_STEPS.length - 1;

  // Find target element with fallback
  const resolveTargetElement = useCallback(
    (currentStep: TourStep): HTMLElement | null => {
      if (typeof document === "undefined") return null;

      const primary = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (primary && primary.getBoundingClientRect().width > 0) {
        return primary;
      }

      if (currentStep.fallbackSelector) {
        const fallback = document.querySelector(currentStep.fallbackSelector) as HTMLElement | null;
        if (fallback && fallback.getBoundingClientRect().width > 0) {
          return fallback;
        }
      }

      return null;
    },
    [],
  );

  // Measure and position
  const updatePositions = useCallback(() => {
    if (!isOpen) return;

    const el = resolveTargetElement(step);
    if (!el) {
      // Meaningful fallback if no element is available
      const cardW = Math.min(360, window.innerWidth - 32);
      const cardH = popoverRef.current?.offsetHeight || 240;
      setTargetRect(null);
      setPopoverPos({
        top: Math.max(20, (window.innerHeight - cardH) / 2),
        left: Math.max(16, (window.innerWidth - cardW) / 2),
        arrowPlacement: "top",
        arrowOffset: cardW / 2,
      });
      return;
    }

    const domRect = el.getBoundingClientRect();
    const padding = step.padding ?? 8;
    const top = Math.max(4, domRect.top - padding);
    const left = Math.max(4, domRect.left - padding);
    const width = Math.min(window.innerWidth - left - 4, domRect.width + padding * 2);
    const height = Math.min(window.innerHeight - top - 4, domRect.height + padding * 2);
    const right = left + width;
    const bottom = top + height;

    const currentRect: ElementRect = { top, left, width, height, right, bottom };
    setTargetRect(currentRect);

    // Compute smart popover position
    const cardW = Math.min(360, window.innerWidth - 32);
    const cardH = popoverRef.current?.offsetHeight || 220;

    const spaceBelow = window.innerHeight - bottom - 16;
    const spaceAbove = top - 16;
    const spaceLeft = left - 16;
    const spaceRight = window.innerWidth - right - 16;

    let chosenPlacement: "bottom" | "top" | "left" | "right" = "bottom";

    if (window.innerWidth < 640) {
      // Mobile: always prefer vertical placement (bottom or top)
      if (spaceBelow >= cardH || spaceBelow >= spaceAbove) {
        chosenPlacement = "bottom";
      } else {
        chosenPlacement = "top";
      }
    } else {
      // Desktop: check step preference or best available space
      if (step.placement === "left" && spaceLeft >= cardW) {
        chosenPlacement = "left";
      } else if (step.placement === "right" && spaceRight >= cardW) {
        chosenPlacement = "right";
      } else if (step.placement === "top" && spaceAbove >= cardH) {
        chosenPlacement = "top";
      } else if (spaceBelow >= cardH) {
        chosenPlacement = "bottom";
      } else if (spaceAbove >= cardH) {
        chosenPlacement = "top";
      } else if (spaceLeft >= cardW) {
        chosenPlacement = "left";
      } else {
        chosenPlacement = "bottom";
      }
    }

    let calculatedTop = 0;
    let calculatedLeft = 0;
    let arrowPlacement: "top" | "bottom" | "left" | "right" = "top";
    let arrowOffset = 40;

    if (chosenPlacement === "bottom") {
      calculatedTop = Math.min(window.innerHeight - cardH - 16, bottom + 12);
      calculatedLeft = Math.max(
        16,
        Math.min(window.innerWidth - cardW - 16, left + width / 2 - cardW / 2),
      );
      arrowPlacement = "top";
      arrowOffset = Math.max(24, Math.min(cardW - 24, left + width / 2 - calculatedLeft));
    } else if (chosenPlacement === "top") {
      calculatedTop = Math.max(16, top - cardH - 12);
      calculatedLeft = Math.max(
        16,
        Math.min(window.innerWidth - cardW - 16, left + width / 2 - cardW / 2),
      );
      arrowPlacement = "bottom";
      arrowOffset = Math.max(24, Math.min(cardW - 24, left + width / 2 - calculatedLeft));
    } else if (chosenPlacement === "left") {
      calculatedLeft = Math.max(16, left - cardW - 12);
      calculatedTop = Math.max(
        16,
        Math.min(window.innerHeight - cardH - 16, top + height / 2 - cardH / 2),
      );
      arrowPlacement = "right";
      arrowOffset = Math.max(24, Math.min(cardH - 24, top + height / 2 - calculatedTop));
    } else {
      calculatedLeft = Math.min(window.innerWidth - cardW - 16, right + 12);
      calculatedTop = Math.max(
        16,
        Math.min(window.innerHeight - cardH - 16, top + height / 2 - cardH / 2),
      );
      arrowPlacement = "left";
      arrowOffset = Math.max(24, Math.min(cardH - 24, top + height / 2 - calculatedTop));
    }

    setPopoverPos({
      top: calculatedTop,
      left: calculatedLeft,
      arrowPlacement,
      arrowOffset,
    });
  }, [isOpen, step, resolveTargetElement]);

  // Smooth scroll and focus element on step change
  useEffect(() => {
    if (!isOpen) return;

    const el = resolveTargetElement(step);
    if (el) {
      if (el.closest("header")) {
        try {
          window.scrollTo({
            top: 0,
            behavior: shouldReduceMotion ? "auto" : "smooth",
          });
        } catch {
          // Ignore environment without scrollTo (e.g. test jsdom)
        }
      } else {
        try {
          el.scrollIntoView({
            behavior: shouldReduceMotion ? "auto" : "smooth",
            block: "center",
            inline: "nearest",
          });
        } catch {
          // Ignore environment without scrollIntoView
        }
      }
    }

    // Measure initially and after scroll animation settles
    updatePositions();
    const timer1 = setTimeout(updatePositions, 60);
    const timer2 = setTimeout(updatePositions, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, currentStepIndex, step, resolveTargetElement, updatePositions, shouldReduceMotion]);

  // Window scroll & resize listeners
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    const handleScrollOrResize = () => {
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updatePositions);
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      cancelAnimationFrame(animId);
    };
  }, [isOpen, updatePositions]);

  // Keyboard navigation & accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose("skip", currentStepIndex + 1);
      } else if (e.key === "ArrowLeft") {
        // In Persian RTL: ArrowLeft advances forward
        if (!isLastStep) {
          e.preventDefault();
          setCurrentStepIndex((prev) => prev + 1);
        }
      } else if (e.key === "ArrowRight") {
        // In Persian RTL: ArrowRight goes backward
        if (!isFirstStep) {
          e.preventDefault();
          setCurrentStepIndex((prev) => prev - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, currentStepIndex, isFirstStep, isLastStep, onClose]);

  // Focus next button on step change
  useEffect(() => {
    if (isOpen) {
      nextButtonRef.current?.focus();
    }
  }, [isOpen, currentStepIndex]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      onClose("complete", DASHBOARD_TOUR_STEPS.length);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    onClose("skip", currentStepIndex + 1);
  };

  const cardWidth = typeof window !== "undefined" ? Math.min(360, window.innerWidth - 32) : 360;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] select-none"
      dir="rtl"
      aria-label="آموزش تعاملی داشبورد آوانا"
    >
      {/* 1. SVG Cutout Mask Backdrop Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[9990] overflow-hidden" aria-hidden="true">
        <svg className="w-full h-full" width="100%" height="100%">
          <defs>
            <mask id="avana-tour-spotlight-mask" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left}
                  y={targetRect.top}
                  width={targetRect.width}
                  height={targetRect.height}
                  rx="14"
                  ry="14"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(15, 23, 42, 0.65)"
            mask="url(#avana-tour-spotlight-mask)"
            className="transition-all duration-300 backdrop-blur-[1px]"
          />
        </svg>
      </div>

      {/* 2. Spotlight Highlight Border Frame Around Target Element */}
      {targetRect && (
        <div
          data-testid="spotlight-highlight-frame"
          className="fixed pointer-events-none z-[9991] rounded-2xl border-2 border-[#008080] shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_24px_rgba(0,128,128,0.45)] transition-all duration-300"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
        >
          {/* Subtle luminous background wash inside cutout to make target stand out distinctly */}
          <div className="absolute inset-0 rounded-2xl bg-teal-500/10 pointer-events-none" />

          {/* Animated pulsing beacon on corner */}
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#008080] opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#008080] border-2 border-white dark:border-zinc-900" />
          </span>
        </div>
      )}

      {/* 3. Floating Popover Card Near Target */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={`مرحله ${toPersianDigits(currentStepIndex + 1)}: ${step.title}`}
        className="fixed z-[9995] bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-4 sm:p-5 flex flex-col transition-all duration-200"
        style={{
          top: `${popoverPos.top}px`,
          left: `${popoverPos.left}px`,
          width: `${cardWidth}px`,
        }}
      >
        {/* Subtle Pointer Arrow pointing to Target */}
        {targetRect && popoverPos.arrowPlacement === "top" && (
          <div
            className="absolute -top-2 w-3.5 h-3.5 bg-white dark:bg-zinc-900 border-t border-r border-slate-200 dark:border-zinc-800 rotate-[-45deg]"
            style={{ left: `${popoverPos.arrowOffset}px` }}
          />
        )}
        {targetRect && popoverPos.arrowPlacement === "bottom" && (
          <div
            className="absolute -bottom-2 w-3.5 h-3.5 bg-white dark:bg-zinc-900 border-b border-l border-slate-200 dark:border-zinc-800 rotate-[-45deg]"
            style={{ left: `${popoverPos.arrowOffset}px` }}
          />
        )}
        {targetRect && popoverPos.arrowPlacement === "right" && (
          <div
            className="absolute -right-2 w-3.5 h-3.5 bg-white dark:bg-zinc-900 border-t border-l border-slate-200 dark:border-zinc-800 rotate-[-45deg]"
            style={{ top: `${popoverPos.arrowOffset}px` }}
          />
        )}
        {targetRect && popoverPos.arrowPlacement === "left" && (
          <div
            className="absolute -left-2 w-3.5 h-3.5 bg-white dark:bg-zinc-900 border-b border-r border-slate-200 dark:border-zinc-800 rotate-[-45deg]"
            style={{ top: `${popoverPos.arrowOffset}px` }}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-[#008080] dark:text-teal-300 border border-teal-100 dark:border-teal-900/40 flex items-center justify-center shrink-0">
              <StepIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-full border border-teal-200/50 dark:border-teal-800/40 shrink-0">
              مرحله {toPersianDigits(currentStepIndex + 1)} از {toPersianDigits(DASHBOARD_TOUR_STEPS.length)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            title="بستن آموزش"
            aria-label="بستن آموزش"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1.5 py-1">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            {step.title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-1.5 py-2.5" aria-hidden="true">
          {DASHBOARD_TOUR_STEPS.map((s, idx) => (
            <div
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? "w-5 bg-[#008080]"
                  : "w-1.5 bg-slate-200 dark:bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={isSaving}
            className="text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-normal px-2"
          >
            رد کردن آموزش
          </Button>

          <div className="flex items-center gap-1.5">
            {!isFirstStep && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={isSaving}
                className="text-xs px-2.5 gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>قبلی</span>
              </Button>
            )}

            <Button
              ref={nextButtonRef}
              type="button"
              variant="primary"
              size="sm"
              onClick={handleNext}
              disabled={isSaving}
              className="bg-[#008080] hover:bg-[#006666] text-white text-xs px-3.5 gap-1 font-bold shadow-xs"
            >
              <span>{isLastStep ? "شروع یادگیری" : "بعدی"}</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Aliases for clean backward compatibility
export const DashboardOnboardingTour = DashboardOnboardingModal;
