/**
 * Course Card for Avana Library.
 *
 * Displays an accessible Course in the Library grid with:
 * - Course Title & Subject
 * - Pricing & Entitlement Badges (رایگان، خریداری شده، با اشتراک، قیمت به تومان)
 * - Short description
 * - Module and Lesson counts
 * - User completion progress bar & percentage
 * - Direct link / CTA to course learning hub or paywall (/courses/:courseId)
 */

import { Link } from "react-router-dom";
import {
  GraduationCap,
  BookOpen,
  Layers,
  ChevronLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  Zap,
  Eye,
} from "lucide-react";
import type { LibraryCourseItem } from "../../lib/api/library.js";
import { Card, Badge, Progress, Button } from "@avana/ui";

export interface CourseLibraryCardProps {
  course: LibraryCourseItem;
  onBuy?: (course: LibraryCourseItem) => void;
  onView?: (course: LibraryCourseItem) => void;
}

export function CourseLibraryCard({ course, onBuy, onView }: CourseLibraryCardProps) {
  const progress = course.progress;
  const hasProgress = progress && progress.total_lessons > 0;
  const isCompleted = hasProgress && progress.completed_lessons >= progress.total_lessons;

  const access = course.access;
  const purchase = course.purchase;
  const hasAccess = access?.hasAccess ?? true;
  const isPurchased = access?.isPurchased === true;
  const isSubscriptionAccess = access?.accessSource === "subscription";
  const isFree = access?.isFree ?? (purchase ? purchase.price === 0 : true);
  const price = purchase?.price ?? 0;

  return (
    <Card
      data-testid={`library-course-card-${course.id}`}
      hoverable
      className="group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-300"
      dir="rtl"
    >
      {/* Card Header & Content */}
      <div className="space-y-3.5">
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button border border-primary/30 bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5" />
            </div>
            {course.subject && (
              <Badge variant="primary">
                {course.subject}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isCompleted && (
              <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                تکمیل شده
              </Badge>
            )}

            {/* Pricing & Entitlement Badges */}
            {isPurchased ? (
              <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                خریداری شده
              </Badge>
            ) : isSubscriptionAccess ? (
              <Badge variant="primary" icon={<Zap className="h-3 w-3" />}>
                اشتراک فعال
              </Badge>
            ) : isFree ? (
              <Badge variant="info" icon={<Sparkles className="h-3 w-3" />}>
                رایگان
              </Badge>
            ) : price > 0 ? (
              <Badge variant="warning" icon={<Lock className="h-3 w-3" />}>
                {price.toLocaleString("fa-IR")} تومان
              </Badge>
            ) : !hasAccess ? (
              <Badge variant="warning" icon={<Lock className="h-3 w-3" />}>
                ویژه
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Title */}
        <h3 className="line-clamp-2 text-base font-bold text-[var(--color-text)] transition-colors group-hover:text-primary">
          {course.title}
        </h3>

        {/* Description (if present) */}
        {course.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {course.description}
          </p>
        )}

        {/* Stats Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--color-text-muted)]">
          {course.module_count > 0 && (
            <div className="flex items-center gap-1.5 rounded-button border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1">
              <Layers className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>{course.module_count} فصل</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 rounded-button border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1">
            <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>{course.content_count} درسنامه</span>
          </div>
        </div>

        {/* Progress Bar (if available) */}
        {hasProgress && (
          <div className="space-y-1.5 pt-1">
            <Progress value={progress.percent} showLabel label="پیشرفت مطالعه" size="sm" variant="primary" />
          </div>
        )}
      </div>

      {/* Action CTA Footer */}
      <div className="mt-5 border-t border-[var(--color-border)] pt-3">
        {!hasAccess ? (
          <div className="flex items-center gap-2">
            {onView && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onView(course)}
                data-testid={`view-course-btn-${course.id}`}
                leftIcon={<Eye className="h-3.5 w-3.5" />}
                className="flex-1 text-xs"
              >
                مشاهده بسته
              </Button>
            )}
            {onBuy && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => onBuy(course)}
                data-testid={`buy-course-btn-${course.id}`}
                leftIcon={<Lock className="h-3.5 w-3.5" />}
                className="flex-1 text-xs"
              >
                <span className="truncate">
                  {price > 0
                    ? `خرید (${price.toLocaleString("fa-IR")})`
                    : "خرید دوره"}
                </span>
              </Button>
            )}
            {!onView && !onBuy && (
              <Link
                to={course.href || `/courses/${course.id}`}
                className="flex w-full items-center justify-between rounded-button px-3.5 py-2 text-xs font-bold transition-all bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/20"
              >
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  <span>مشاهده و خرید دوره</span>
                </div>
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </Link>
            )}
          </div>
        ) : (
          <Link
            to={course.href || `/courses/${course.id}`}
            className="flex w-full items-center justify-between rounded-button px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm bg-primary/10 text-primary hover:bg-primary hover:text-white"
          >
            <div className="flex items-center gap-1.5">
              <span>ورود به دوره</span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        )}
      </div>
    </Card>
  );
}
