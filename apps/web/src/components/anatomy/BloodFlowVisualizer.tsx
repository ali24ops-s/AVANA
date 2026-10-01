import React, { useState } from "react";
import { ArrowLeft, ArrowDown, Droplets } from "lucide-react";
import { toPersianDigits } from "@avana/domain";

export interface FlowStep {
  id: string;
  stepNumber: number;
  name: string;
  phase: "pulmonary-in" | "exchange" | "systemic-out";
  phaseTitle: string;
  oxygenStatus: "deoxygenated" | "exchange" | "oxygenated";
  description: string;
}

export const BLOOD_FLOW_STEPS: FlowStep[] = [
  // 1. Pulmonary / Right Side (Deoxygenated)
  {
    id: "step-1",
    stepNumber: 1,
    name: "وریدهای اجوف",
    phase: "pulmonary-in",
    phaseTitle: "گردش ریوی (خون کم‌اکسیژن)",
    oxygenStatus: "deoxygenated",
    description: "جمع‌آوری خون مصرف‌شده اندام‌ها از طریق وریدهای اجوف فوقانی و تحتانی",
  },
  {
    id: "step-2",
    stepNumber: 2,
    name: "دهلیز راست",
    phase: "pulmonary-in",
    phaseTitle: "گردش ریوی (خون کم‌اکسیژن)",
    oxygenStatus: "deoxygenated",
    description: "ورود خون سیاهرگی به اولین حفره دریافت‌کننده قلب",
  },
  {
    id: "step-3",
    stepNumber: 3,
    name: "دریچه تریکوسپید",
    phase: "pulmonary-in",
    phaseTitle: "گردش ریوی (خون کم‌اکسیژن)",
    oxygenStatus: "deoxygenated",
    description: "عبور یک‌طرفه خون از دهلیز راست به بطن راست",
  },
  {
    id: "step-4",
    stepNumber: 4,
    name: "بطن راست",
    phase: "pulmonary-in",
    phaseTitle: "گردش ریوی (خون کم‌اکسیژن)",
    oxygenStatus: "deoxygenated",
    description: "انقباض بطن راست جهت پرتاب خون به سمت شریان ریوی",
  },
  {
    id: "step-5",
    stepNumber: 5,
    name: "شریان ریوی",
    phase: "pulmonary-in",
    phaseTitle: "گردش ریوی (خون کم‌اکسیژن)",
    oxygenStatus: "deoxygenated",
    description: "انتقال خون کم‌اکسیژن به سمت شبکه مویرگی ریه‌ها",
  },

  // 2. Gas Exchange in Lungs
  {
    id: "step-6",
    stepNumber: 6,
    name: "ریه‌ها",
    phase: "exchange",
    phaseTitle: "تبادل گاز تنفسی",
    oxygenStatus: "exchange",
    description: "دفع دی‌اکسید کربن و جذب اکسیژن تازه در مویرگ‌های آلوئولی",
  },

  // 3. Systemic / Left Side (Oxygenated)
  {
    id: "step-7",
    stepNumber: 7,
    name: "وریدهای ریوی",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "انتقال خون پراکسیژن تازه از هر دو ریه به دهلیز چپ",
  },
  {
    id: "step-8",
    stepNumber: 8,
    name: "دهلیز چپ",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "تجمع خون پر از اکسیژن و هدایت آن به بطن چپ",
  },
  {
    id: "step-9",
    stepNumber: 9,
    name: "دریچه میترال",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "عبور یک‌طرفه خون از دهلیز چپ به داخل بطن چپ",
  },
  {
    id: "step-10",
    stepNumber: 10,
    name: "بطن چپ",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "ایجاد فشار سیستولیک بالا برای پمپاژ خون به سرتاسر بدن",
  },
  {
    id: "step-11",
    stepNumber: 11,
    name: "آئورت",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "توزیع خون شریانی از طریق قوس آئورت و شاخه‌های اصلی",
  },
  {
    id: "step-12",
    stepNumber: 12,
    name: "گردش سیستمیک",
    phase: "systemic-out",
    phaseTitle: "گردش سیستمیک (خون اکسیژن‌دار)",
    oxygenStatus: "oxygenated",
    description: "اکسیژن‌رسانی و تغذیه کلیه سلول‌ها و بافت‌های سراسر بدن",
  },
];

export interface BloodFlowVisualizerProps {
  className?: string;
  onStepSelect?: (step: FlowStep) => void;
}

export function BloodFlowVisualizer({
  className = "",
  onStepSelect,
}: BloodFlowVisualizerProps) {
  const [selectedStepId, setSelectedStepId] = useState<string>("step-1");

  const selectedStep =
    BLOOD_FLOW_STEPS.find((s) => s.id === selectedStepId) || BLOOD_FLOW_STEPS[0];

  const handleStepClick = (step: FlowStep) => {
    setSelectedStepId(step.id);
    if (onStepSelect) {
      onStepSelect(step);
    }
  };

  return (
    <div
      className={`my-6 sm:my-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 shadow-xs ${className}`}
      dir="rtl"
    >
      {/* Title & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] tracking-tight">
            مسیر پیوسته جریان خون در قلب
          </h3>
          <p className="text-xs sm:text-[13px] text-[var(--color-text-muted)] mt-0.5">
            ترتیب فیزیولوژیک حرکت خون از وریدهای بزرگ ورودی تا خروج از آئورت
          </p>
        </div>

        {/* Legend pills */}
        <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] select-none flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            <span>خون کم‌اکسیژن</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400" />
            <span>تبادل در ریه‌ها</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
            <span className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400" />
            <span>خون اکسیژن‌دار</span>
          </div>
        </div>
      </div>

      {/* Structured Multi-Row Pathway */}
      <div className="py-4 space-y-4">
        {/* Phase 1: Right Heart / Pulmonary Loop */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 px-1">
            مرحله ۱: دریافت و ارسال به ریه‌ها (سمت راست)
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {BLOOD_FLOW_STEPS.slice(0, 5).map((step, idx) => {
              const isSelected = selectedStepId === step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => handleStepClick(step)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-[13px] font-medium border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                        : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-900 dark:text-blue-100 border-blue-500/30"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isSelected
                          ? "bg-white text-blue-700"
                          : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {toPersianDigits(step.stepNumber)}
                    </span>
                    <span>{step.name}</span>
                  </button>
                  {idx < 4 && (
                    <ArrowLeft className="w-3.5 h-3.5 text-blue-400 dark:text-blue-600 shrink-0 hidden sm:inline" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Transition Arrow down to Lungs */}
        <div className="flex items-center gap-2 pr-6 text-xs text-[var(--color-text-muted)]">
          <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px]">انتقال به گردش مویرگی ریه</span>
        </div>

        {/* Phase 2: Pulmonary Gas Exchange */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 px-1">
            مرحله ۲: اکسیژن‌گیری
          </span>
          <div className="flex items-center">
            {BLOOD_FLOW_STEPS.slice(5, 6).map((step) => {
              const isSelected = selectedStepId === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStepClick(step)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-[13px] font-medium border transition-all cursor-pointer select-none ${
                    isSelected
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs font-bold"
                      : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-900 dark:text-purple-100 border-purple-500/30"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isSelected
                        ? "bg-white text-purple-700"
                        : "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                    }`}
                  >
                    {toPersianDigits(step.stepNumber)}
                  </span>
                  <span>{step.name} (تبادل گاز و جذب اکسیژن)</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Transition Arrow down to Left Heart */}
        <div className="flex items-center gap-2 pr-6 text-xs text-[var(--color-text-muted)]">
          <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px]">بازگشت خون تمیز به قلب چپ</span>
        </div>

        {/* Phase 3: Left Heart / Systemic Loop */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 px-1">
            مرحله ۳: پمپاژ به کل بدن (سمت چپ)
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {BLOOD_FLOW_STEPS.slice(6).map((step, idx) => {
              const isSelected = selectedStepId === step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => handleStepClick(step)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-[13px] font-medium border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs font-bold"
                        : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-900 dark:text-rose-100 border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isSelected
                          ? "bg-white text-rose-700"
                          : "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {toPersianDigits(step.stepNumber)}
                    </span>
                    <span>{step.name}</span>
                  </button>
                  {idx < 5 && (
                    <ArrowLeft className="w-3.5 h-3.5 text-rose-400 dark:text-rose-600 shrink-0 hidden sm:inline" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Step Explanation Strip */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center gap-2.5 bg-[var(--color-surface-warm)] p-3 rounded-xl">
        <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
        <div className="text-xs sm:text-[13px] text-[var(--color-text)] leading-relaxed">
          <span className="font-bold ml-1 text-teal-800 dark:text-teal-300">
            قدم {toPersianDigits(selectedStep.stepNumber)} ({selectedStep.name}):
          </span>
          <span>{selectedStep.description}</span>
        </div>
      </div>
    </div>
  );
}
