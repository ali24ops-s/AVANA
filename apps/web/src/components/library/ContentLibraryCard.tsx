/**
 * Standalone Content Card for Avana Library.
 *
 * Displays an accessible content item (e.g. Lesson) from any user-accessible course with:
 * - Content Title
 * - Content Type badge (درسنامه)
 * - Pricing & Entitlement Badges (رایگان، خریداری شده، با اشتراک، قیمت مستقل به تومان)
 * - Parent Course Title & Module / Chapter Title
 * - Estimated reading time
 * - Completion / Study status badge
 * - Direct link / CTA straight to the content or paywall (/courses/:courseId?lessonId=:id)
 */

import { Link } from "react-router-dom";
import {
  FileText,
  Layers,
  Clock,
  ChevronLeft,
  CheckCircle2,
  CircleDashed,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LibraryContentItem } from "../../lib/api/library.js";
import { Card, Badge, Button } from "@avana/ui";

export interface ContentLibraryCardProps {
  content: LibraryContentItem;
  onBuy?: (content: LibraryContentItem) => void;
}

export function ContentLibraryCard({ content, onBuy }: ContentLibraryCardProps) {
  const isCompleted = content.completed === true;

  const access = content.access;
  const purchase = content.purchase;
  const hasAccess = access?.hasAccess ?? true;
  const isPurchased = access?.isPurchased === true;
  const isSubscriptionAccess = access?.accessSource === "subscription";
  const isFree = access?.isFree ?? (purchase ? purchase.price === 0 : true);
  const price = purchase?.price ?? 0;

  return (
    <Card
      data-testid={`library-content-card-${content.id}`}
      hoverable
      className="group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-300"
      dir="rtl"
    >
      {/* Card Header & Content */}
      <div className="space-y-3">
        {/* Top Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 transition-transform group-hover:scale-105">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <Badge variant="info">
              {content.type === "lesson" ? "درسنامه" : "محتوای آموزشی"}
            </Badge>
          </div>

          {/* Badges: Completion & Pricing */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isCompleted ? (
              <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                تکمیل شده
              </Badge>
            ) : (
              <Badge variant="neutral" icon={<CircleDashed className="h-3 w-3" />}>
                شروع نشده
              </Badge>
            )}

            {/* Pricing & Entitlement Badges */}
            {content.is_preview ? (
              <Badge variant="info" icon={<Sparkles className="h-3 w-3" />}>
                پیش‌نمایش رایگان
              </Badge>
            ) : isPurchased ? (
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

        {/* Content Title */}
        <h3 className="line-clamp-2 text-base font-bold text-[var(--color-text)] transition-colors group-hover:text-primary">
          {content.title}
        </h3>

        {/* Parent Course & Module Context */}
        <div className="space-y-1.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] p-2.5 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5 truncate font-medium text-[var(--color-text)]" title={content.course_title}>
            <span className="shrink-0 text-[var(--color-text-muted)]">دوره:</span>
            <span className="truncate text-primary font-semibold">{content.course_title}</span>
          </div>

          {content.module_title && (
            <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--color-text-muted)]" title={content.module_title}>
              <Layers className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="truncate">{content.module_title}</span>
            </div>
          )}
        </div>

        {/* Estimated Reading Time */}
        {content.estimated_minutes && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <Clock className="h-3 w-3 text-[var(--color-text-muted)]" />
            <span>زمان مطالعه: ~{content.estimated_minutes} دقیقه</span>
          </div>
        )}

        {/* Free Preview Explanatory Notice */}
        {content.is_preview && (
          <div className="rounded-[10px] border border-cyan-500/20 bg-cyan-500/5 p-2 text-[11px] text-cyan-700 dark:text-cyan-300">
            این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.
          </div>
        )}
      </div>

      {/* Action CTA Footer */}
      <div className="mt-5 border-t border-[var(--color-border)] pt-3">
        {!hasAccess && !content.is_preview && onBuy ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            fullWidth
            onClick={() => onBuy(content)}
            data-testid={`buy-content-btn-${content.id}`}
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            rightIcon={<ChevronLeft className="h-4 w-4" />}
            className="rounded-[10px]"
          >
            <span>
              {price > 0
                ? `خرید محتوا (${price.toLocaleString("fa-IR")} تومان)`
                : "خرید محتوا"}
            </span>
          </Button>
        ) : (
          <Link
            to={content.href || `/courses/${content.course_id}?lessonId=${content.lesson_id || content.id}`}
            className={`flex w-full items-center justify-between rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-sm ${
              hasAccess || content.is_preview
                ? "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-500/20"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {!hasAccess && !content.is_preview && <Lock className="h-3.5 w-3.5" />}
              {content.is_preview && <Sparkles className="h-3.5 w-3.5 text-cyan-500" />}
              <span>
                {content.is_preview
                  ? "مشاهده درسنامه رایگان"
                  : hasAccess
                  ? (isCompleted ? "مرور مجدد درس" : "مطالعه محتوا")
                  : "مشاهده و خرید محتوا"}
              </span>
            </div>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </Link>
        )}
      </div>
    </Card>
  );
}
