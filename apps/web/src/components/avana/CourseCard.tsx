/**
 * Canonical Unified CourseCard Component for AVANA.
 *
 * Implements a standardized, responsive, accessible, Light-first Course Card
 * matching the AVANA Design System with three primary context variants:
 *
 * 1. variant="library"    — For course catalog / library discovery, preview, and purchase
 * 2. variant="my-courses" — For enrolled personal courses with active progress tracking & management
 * 3. variant="compact"    — For dashboard carousels, popular courses, and dense lists
 */

import React from "react";
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
  Trash2,
  HelpCircle,
} from "lucide-react";
import { Card, Badge, Progress, Button } from "@avana/ui";
import {
  toPersianDigits,
  cleanEducationalTitle,
  cleanEducationalDescription,
} from "@avana/domain";
import { formatToman } from "../commerce/userCommerceUtils.js";
import type { LibraryCourseItem } from "../../lib/api/library.js";
import type { CourseResource } from "@avana/contracts";

export interface CourseCardProgressData {
  percentage?: number;
  completedLessons?: number;
  totalLessons?: number;
  isLoading?: boolean;
}

export interface CourseCardAccessData {
  hasAccess?: boolean;
  isPurchased?: boolean;
  isSubscription?: boolean;
  isFree?: boolean;
  price?: number;
}

export interface CourseCardProps {
  /** Unique course identifier */
  id: string;
  /** Course title (will be sanitized from technical filenames automatically) */
  title: string;
  /** Subject/Category (e.g. داروسازی, فیزیولوژی) */
  subject?: string | null;
  /** Course description */
  description?: string | null;
  /** Optional cover image thumbnail URL */
  coverImage?: string | null;
  /** Destination route href (defaults to /courses/:id) */
  href?: string;

  /** Context variant */
  variant?: "library" | "my-courses" | "compact";

  /** Access and commercial state */
  access?: CourseCardAccessData;
  /** Learning progress state */
  progress?: CourseCardProgressData;
  /** Content statistics */
  stats?: {
    moduleCount?: number;
    lessonCount?: number;
    flashcardCount?: number;
    quizQuestionCount?: number;
  };

  /** Archival status */
  archived?: boolean;

  /** Actions */
  onView?: () => void;
  onBuy?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;

  /** Custom styling & test attributes */
  className?: string;
  dataTestId?: string;
}

/**
 * Thumbnail or Fallback Header Visual
 */
function CourseThumbnailHeader({
  coverImage,
  title,
  subject,
}: {
  coverImage?: string | null;
  title: string;
  subject?: string | null;
}) {
  if (coverImage) {
    return (
      <div className="relative w-full aspect-[16/9] rounded-[12px] overflow-hidden mb-3.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
        <img
          src={coverImage}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {subject && (
          <div className="absolute top-2.5 start-2.5">
            <Badge variant="primary" size="sm">
              {subject}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Top Header Row: Icon, Subject, Status Badges & Secondary Actions
 */
function CourseHeaderRow({
  hasCoverImage,
  subject,
  access,
  isCompleted,
  archived,
  onDelete,
}: {
  hasCoverImage: boolean;
  subject?: string | null;
  access?: CourseCardAccessData;
  isCompleted?: boolean;
  archived?: boolean;
  onDelete?: () => void;
}) {
  const isPurchased = access?.isPurchased === true;
  const isSubscription = access?.isSubscription === true;
  const isFree = access?.isFree === true;
  const price = access?.price ?? 0;
  const hasAccess = access?.hasAccess ?? true;

  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      {/* Subject & Icon */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {!hasCoverImage && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary transition-transform group-hover:scale-105">
            <GraduationCap className="h-5 w-5" />
          </div>
        )}
        {!hasCoverImage && subject && (
          <Badge variant="primary" size="sm">
            {subject}
          </Badge>
        )}
      </div>

      {/* Badges & Optional Delete Action */}
      <div className="flex flex-wrap items-center gap-1.5 justify-end">
        {isCompleted && (
          <Badge variant="success" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>
            تکمیل شده
          </Badge>
        )}

        {isPurchased ? (
          <Badge variant="success" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>
            خریداری شده
          </Badge>
        ) : isSubscription ? (
          <Badge variant="primary" size="sm" icon={<Zap className="h-3 w-3" />}>
            در دسترس با اشتراک
          </Badge>
        ) : isFree ? (
          <Badge variant="info" size="sm" icon={<Sparkles className="h-3 w-3" />}>
            رایگان
          </Badge>
        ) : price > 0 ? (
          <Badge variant="warning" size="sm" icon={<Lock className="h-3 w-3" />}>
            {formatToman(price)}
          </Badge>
        ) : !hasAccess ? (
          <Badge variant="warning" size="sm" icon={<Lock className="h-3 w-3" />}>
            ویژه
          </Badge>
        ) : null}

        {archived && (
          <Badge variant="warning" size="sm">
            بایگانی شده
          </Badge>
        )}

        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="!p-1.5 !h-auto text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-[8px]"
            title="حذف از دوره‌های من"
            aria-label="حذف از دوره‌های من"
            leftIcon={<Trash2 className="w-4 h-4" />}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Main Canonical CourseCard Component
 */
export function CourseCard({
  id,
  title,
  subject,
  description,
  coverImage,
  href,
  variant = "library",
  access,
  progress,
  stats,
  archived,
  onView,
  onBuy,
  onDelete,
  onSelect,
  className = "",
  dataTestId,
}: CourseCardProps) {
  const targetHref = href || `/courses/${id}`;
  const cleanTitle = cleanEducationalTitle(title, "دوره آموزشی جامع");
  const cleanDesc = description ? cleanEducationalDescription(description, "") : null;

  const percentage = progress?.percentage ?? 0;
  const isProgressLoading = progress?.isLoading ?? false;
  const totalLessons = progress?.totalLessons ?? stats?.lessonCount ?? 0;
  const hasProgress = progress !== undefined && (totalLessons > 0 || percentage > 0);
  const isCompleted = hasProgress && percentage >= 100;

  const hasAccess = access?.hasAccess ?? true;
  const isPurchased = access?.isPurchased === true;
  const isSubscription = access?.isSubscription === true;
  const price = access?.price ?? 0;

  const resolvedTestId =
    dataTestId ||
    (variant === "library"
      ? `library-course-card-${id}`
      : `course-card-${id}`);

  // Handle entire card click if onSelect is provided and not triggering child buttons
  const handleCardClick = () => {
    if (onSelect) {
      onSelect();
    }
  };

  return (
    <Card
      data-testid={resolvedTestId}
      hoverable
      onClick={handleCardClick}
      className={`group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-200 rounded-[16px] ${
        onSelect ? "cursor-pointer" : ""
      } ${className}`}
      dir="rtl"
    >
      {/* Top Body Section */}
      <div>
        {/* Cover Image */}
        <CourseThumbnailHeader
          coverImage={coverImage}
          title={cleanTitle}
          subject={subject}
        />

        {/* Header Badges & Actions */}
        <CourseHeaderRow
          hasCoverImage={Boolean(coverImage)}
          subject={subject}
          access={access}
          isCompleted={isCompleted}
          archived={archived}
          onDelete={onDelete}
        />

        {/* Course Title Link */}
        <Link
          to={targetHref}
          className="block group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
        >
          <h3
            className={`font-bold text-[var(--color-text)] group-hover/title:text-primary transition-colors ${
              variant === "compact"
                ? "text-sm line-clamp-2 min-h-[2.5rem] leading-snug"
                : variant === "my-courses"
                ? "text-base line-clamp-1 leading-snug"
                : "text-base line-clamp-2 leading-snug"
            }`}
            title={cleanTitle}
          >
            {cleanTitle}
          </h3>
        </Link>

        {/* Description (for Library or full cards) */}
        {variant === "library" && cleanDesc && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)] mt-1.5 min-h-[2rem]">
            {cleanDesc}
          </p>
        )}

        {/* Metadata Stats Grid (2x2 symmetric layout) */}
        {stats &&
        ((stats.moduleCount ?? 0) > 0 ||
          (stats.lessonCount ?? 0) > 0 ||
          (stats.flashcardCount ?? 0) > 0 ||
          (stats.quizQuestionCount ?? 0) > 0) ? (
          <div className="grid grid-cols-2 gap-1.5 pt-2 text-xs text-[var(--color-text-muted)]">
            {(stats.moduleCount ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1 min-w-0">
                <Layers className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="truncate">
                  {toPersianDigits(stats.moduleCount!)} فصل
                </span>
              </div>
            )}
            {(stats.lessonCount ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1 min-w-0">
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">
                  {toPersianDigits(stats.lessonCount!)} درسنامه
                </span>
              </div>
            )}
            {(stats.flashcardCount ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1 min-w-0">
                <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="truncate">
                  {toPersianDigits(stats.flashcardCount!)} فلش‌کارت
                </span>
              </div>
            )}
            {(stats.quizQuestionCount ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] px-2.5 py-1 min-w-0">
                <HelpCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">
                  {toPersianDigits(stats.quizQuestionCount!)} سؤال
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* Progress Bar Section */}
        {variant === "my-courses" ? (
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)] text-[11px]">پیشرفت</span>
              <span className="font-bold text-primary text-[11px]">
                {isProgressLoading ? "..." : `${toPersianDigits(percentage)}٪`}
              </span>
            </div>
            <div
              className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
              role="progressbar"
              aria-label="پیشرفت دوره"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${isProgressLoading ? 0 : percentage}%` }}
              />
            </div>
          </div>
        ) : variant === "library" && hasProgress ? (
          <div className="mt-3 space-y-1.5">
            <Progress
              value={percentage}
              showLabel
              label="پیشرفت مطالعه"
              size="sm"
              variant="primary"
            />
          </div>
        ) : null}
      </div>

      {/* Footer / CTA Actions Section */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
        {variant === "library" ? (
          !hasAccess ? (
            <div className="flex items-center gap-2">
              {onView && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView();
                  }}
                  data-testid={`view-course-btn-${id}`}
                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                  className="flex-1 text-xs rounded-[10px]"
                >
                  مشاهده بسته
                </Button>
              )}
              {onBuy && (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuy();
                  }}
                  data-testid={`buy-course-btn-${id}`}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                  className="flex-1 text-xs rounded-[10px]"
                >
                  <span className="truncate">
                    {price > 0 ? `خرید (${formatToman(price)})` : "خرید دوره"}
                  </span>
                </Button>
              )}
              {!onView && !onBuy && (
                <Link
                  to={targetHref}
                  className="flex w-full items-center justify-between rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-500/20"
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
              to={targetHref}
              className="flex w-full items-center justify-between rounded-[10px] px-3.5 py-2 text-xs font-bold transition-all group-hover:shadow-xs bg-primary/10 text-primary hover:bg-primary hover:text-white"
            >
              <div className="flex items-center gap-1.5">
                <span>ورود به دوره</span>
              </div>
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          )
        ) : variant === "my-courses" ? (
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {isProgressLoading ? "... درس" : `${toPersianDigits(totalLessons)} درس`}
            </span>

            <div className="flex items-center gap-2">
              {!isPurchased && !isSubscription && price > 0 && onBuy && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBuy();
                  }}
                  className="!h-7 !px-2.5 !text-[11px] rounded-[8px]"
                >
                  خرید دوره
                </Button>
              )}

              <Link
                to={targetHref}
                className="text-primary font-semibold flex items-center gap-1 group-hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <span>
                  {isPurchased || isSubscription || price === 0 ? "ورود" : "پیش‌نمایش"}
                </span>
                <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              </Link>
            </div>
          </div>
        ) : (
          /* compact variant */
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>محتوای آموزشی</span>
            <Link
              to={targetHref}
              className="text-primary font-semibold flex items-center gap-1 group-hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <span>ورود به دوره</span>
              <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Helper Adapter for LibraryCourseItem
 */
export function CourseLibraryCardAdapter({
  course,
  onBuy,
  onView,
}: {
  course: LibraryCourseItem;
  onBuy?: (course: LibraryCourseItem) => void;
  onView?: (course: LibraryCourseItem) => void;
}) {
  const access = course.access;
  const purchase = course.purchase;
  const progress = course.progress;
  const rawCourse = course as {
    cover_image?: string;
    thumbnail_url?: string;
    packages?: import("@avana/domain").ChapterPackageItem[];
    flashcard_count?: number;
    quiz_question_count?: number;
  };

  const flashcardCount =
    rawCourse.flashcard_count ??
    (rawCourse.packages && rawCourse.packages.length > 0
      ? rawCourse.packages.reduce(
          (sum, p) => sum + (p.stats?.flashcardCount || 0),
          0,
        )
      : undefined);

  const quizQuestionCount =
    rawCourse.quiz_question_count ??
    (rawCourse.packages && rawCourse.packages.length > 0
      ? rawCourse.packages.reduce(
          (sum, p) => sum + (p.stats?.quizQuestionCount || 0),
          0,
        )
      : undefined);

  return (
    <CourseCard
      id={course.id}
      title={course.title}
      subject={course.subject}
      description={course.description}
      coverImage={rawCourse.cover_image || rawCourse.thumbnail_url}
      href={course.href || `/courses/${course.id}`}
      variant="library"
      access={{
        hasAccess: access?.hasAccess ?? true,
        isPurchased: access?.isPurchased === true,
        isSubscription: access?.accessSource === "subscription",
        isFree: access?.isFree ?? (purchase ? purchase.price === 0 : true),
        price: purchase?.price ?? 0,
      }}
      progress={
        progress && progress.total_lessons > 0
          ? {
              percentage: progress.percent,
              completedLessons: progress.completed_lessons,
              totalLessons: progress.total_lessons,
            }
          : undefined
      }
      stats={{
        moduleCount: course.module_count,
        lessonCount: course.content_count,
        flashcardCount: flashcardCount && flashcardCount > 0 ? flashcardCount : undefined,
        quizQuestionCount: quizQuestionCount && quizQuestionCount > 0 ? quizQuestionCount : undefined,
      }}
      onBuy={onBuy ? () => onBuy(course) : undefined}
      onView={onView ? () => onView(course) : undefined}
    />
  );
}

/**
 * Helper Adapter for CourseResource in "My Courses"
 */
export function MyCourseCardAdapter({
  course,
  progress,
  stats,
  isPurchased,
  hasSubscription,
  price,
  onBuy,
  onDelete,
}: {
  course: CourseResource;
  progress?: {
    percentage?: number;
    completed_lessons?: number;
    total_lessons?: number;
    isLoading?: boolean;
  };
  stats?: {
    moduleCount?: number;
    lessonCount?: number;
    flashcardCount?: number;
    quizQuestionCount?: number;
  };
  isPurchased?: boolean;
  hasSubscription?: boolean;
  price?: number;
  onBuy?: () => void;
  onDelete?: () => void;
}) {
  const rawCourse = course as { cover_image?: string; thumbnail_url?: string };

  return (
    <CourseCard
      id={course.id}
      title={course.title}
      subject={course.subject}
      coverImage={rawCourse.cover_image || rawCourse.thumbnail_url}
      href={`/courses/${course.id}`}
      variant="my-courses"
      archived={course.archived}
      access={{
        hasAccess: isPurchased || hasSubscription || (price !== undefined && price === 0),
        isPurchased,
        isSubscription: hasSubscription,
        isFree: price === 0,
        price,
      }}
      progress={{
        percentage: progress?.percentage ?? 0,
        completedLessons: progress?.completed_lessons ?? 0,
        totalLessons: progress?.total_lessons ?? 0,
        isLoading: progress?.isLoading,
      }}
      stats={stats}
      onBuy={onBuy}
      onDelete={onDelete}
    />
  );
}

