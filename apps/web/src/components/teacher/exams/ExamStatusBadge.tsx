/**
 * ExamStatusBadge component.
 *
 * Distinctly renders both:
 * 1. Persisted status: draft (پیش‌نویس), published (منتشر شده), archived (بایگانی‌شده)
 * 2. Dynamic runtime state for published exams: upcoming (به‌زودی), active (در حال برگزاری), closed (پایان‌یافته)
 *
 * Never mutates persisted status on client. Reuses calculateRuntimeExamState from @avana/domain.
 */

import React from "react";
import {
  type ExamPersistedStatus,
  type RuntimeExamState,
  calculateRuntimeExamState,
  type TeacherExam,
} from "@avana/domain";
import { Badge } from "../../ui/index.js";
import { FileEdit, CheckCircle2, Archive, Clock, Radio, CheckSquare } from "lucide-react";

export interface ExamStatusBadgeProps {
  exam: Pick<TeacherExam, "status" | "startsAt" | "endsAt" | "closedAt">;
  size?: "sm" | "md";
  showRuntimeStateOnlyForPublished?: boolean;
}

export function ExamStatusBadge({
  exam,
  size = "md",
  showRuntimeStateOnlyForPublished = true,
}: ExamStatusBadgeProps) {
  const { status } = exam;

  if (status === "draft") {
    return (
      <Badge
        variant="secondary"
        size={size}
        icon={<FileEdit className="w-3.5 h-3.5" />}
      >
        پیش‌نویس
      </Badge>
    );
  }

  if (status === "archived") {
    return (
      <Badge
        variant="neutral"
        size={size}
        icon={<Archive className="w-3.5 h-3.5" />}
      >
        بایگانی‌شده
      </Badge>
    );
  }

  // Published: Compute server-authoritative runtime state
  const runtimeState: RuntimeExamState = calculateRuntimeExamState(exam);

  if (showRuntimeStateOnlyForPublished) {
    if (runtimeState === "active") {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Badge
            variant="success"
            size={size}
            icon={<Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />}
          >
            درحال برگزاری
          </Badge>
        </span>
      );
    }

    if (runtimeState === "upcoming") {
      return (
        <Badge
          variant="warning"
          size={size}
          icon={<Clock className="w-3.5 h-3.5" />}
        >
          به‌زودی
        </Badge>
      );
    }

    // Closed runtime state
    return (
      <Badge
        variant="neutral"
        size={size}
        icon={<CheckSquare className="w-3.5 h-3.5" />}
      >
        پایان‌یافته
      </Badge>
    );
  }

  // If showing both persisted published badge and runtime badge
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge
        variant="primary"
        size={size}
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
      >
        منتشر شده
      </Badge>
      {runtimeState === "active" && (
        <Badge
          variant="success"
          size={size}
          icon={<Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />}
        >
          درحال برگزاری
        </Badge>
      )}
      {runtimeState === "upcoming" && (
        <Badge
          variant="warning"
          size={size}
          icon={<Clock className="w-3.5 h-3.5" />}
        >
          به‌زودی
        </Badge>
      )}
      {runtimeState === "closed" && (
        <Badge
          variant="neutral"
          size={size}
          icon={<CheckSquare className="w-3.5 h-3.5" />}
        >
          پایان‌یافته
        </Badge>
      )}
    </div>
  );
}
