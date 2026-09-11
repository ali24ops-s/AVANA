import React from "react";
import { Badge, Button } from "@avana/ui";

export interface LessonCardProps {
  id: string;
  title: string;
  duration?: string;
  status?: "completed" | "in_progress" | "locked" | "not_started";
  index?: number;
  onSelect?: () => void;
  isActive?: boolean;
  className?: string;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  title,
  duration,
  status = "not_started",
  index,
  onSelect,
  isActive = false,
  className = "",
}) => {
  const statusBadge = {
    completed: <Badge variant="success" size="sm">تکمیل شده</Badge>,
    in_progress: <Badge variant="warning" size="sm">در حال مطالعه</Badge>,
    locked: <Badge variant="neutral" size="sm">قفل شده</Badge>,
    not_started: <Badge variant="neutral" size="sm">شروع نشده</Badge>,
  };

  return (
    <div
      onClick={status !== "locked" ? onSelect : undefined}
      className={`p-3.5 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 text-start ${
        isActive
          ? "bg-[#008080]/15 border-[#008080] shadow-md font-bold"
          : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)]"
      } ${status === "locked" ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${className}`}
      dir="rtl"
    >
      <div className="flex items-center gap-3 min-w-0">
        {index !== undefined && (
          <span className="w-7 h-7 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-muted)] flex items-center justify-center shrink-0">
            {index}
          </span>
        )}
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)] truncate">{title}</h4>
          {duration && <span className="text-[11px] text-[var(--color-text-muted)]">⏱️ {duration}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {statusBadge[status]}
        {status !== "locked" && (
          <Button size="sm" variant={isActive ? "primary" : "ghost"}>
            {isActive ? "در حال پخش" : "مطالعه"}
          </Button>
        )}
      </div>
    </div>
  );
};
