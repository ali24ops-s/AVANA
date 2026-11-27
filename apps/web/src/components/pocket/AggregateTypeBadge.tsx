import React from "react";
import type { ClinicalAggregateType } from "../../lib/api/pocket.js";
import { Pill, Activity, Stethoscope, AlertTriangle } from "lucide-react";

export interface AggregateTypeBadgeProps {
  type: ClinicalAggregateType;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

const TYPE_CONFIG: Record<
  ClinicalAggregateType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  drug: {
    label: "دارو",
    icon: Pill,
    bgClass: "bg-teal-50 dark:bg-teal-950/40",
    textClass: "text-[#008080] dark:text-teal-300",
    borderClass: "border-teal-200 dark:border-teal-800",
  },
  disease: {
    label: "بیماری",
    icon: Activity,
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-200 dark:border-amber-800",
  },
  treatment: {
    label: "درمان",
    icon: Stethoscope,
    bgClass: "bg-blue-50 dark:bg-blue-950/40",
    textClass: "text-[#2b6d8f] dark:text-sky-300",
    borderClass: "border-blue-200 dark:border-sky-800",
  },
  emergency: {
    label: "اورژانس",
    icon: AlertTriangle,
    bgClass: "bg-rose-50 dark:bg-rose-950/40",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-200 dark:border-rose-800",
  },
};

export const AggregateTypeBadge: React.FC<AggregateTypeBadgeProps> = ({
  type,
  size = "md",
  showIcon = true,
  className = "",
}) => {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.drug;
  const Icon = config.icon;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs font-medium gap-1.5",
    lg: "px-3 py-1.5 text-sm font-semibold gap-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bgClass} ${config.textClass} ${config.borderClass} ${sizeClasses[size]} ${className}`}
      dir="rtl"
    >
      {showIcon && <Icon className={`${iconSizes[size]} shrink-0`} />}
      <span>{config.label}</span>
    </span>
  );
};
