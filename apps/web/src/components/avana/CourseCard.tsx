import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Progress,
} from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export interface CourseCardProps {
  id: string;
  title: string;
  code?: string;
  description?: string;
  category?: string;
  lessonsCount?: number;
  flashcardsCount?: number;
  quizzesCount?: number;
  progressPercent?: number;
  coverImage?: string;
  onSelect?: () => void;
  onActionClick?: () => void;
  actionText?: string;
  isEnrolled?: boolean;
  className?: string;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  id,
  title,
  code,
  description,
  category,
  lessonsCount = 0,
  flashcardsCount = 0,
  quizzesCount = 0,
  progressPercent,
  coverImage,
  onSelect,
  onActionClick,
  actionText = "مشاهده دوره",
  isEnrolled = false,
  className = "",
}) => {
  return (
    <Card
      data-testid={`course-card-${id}`}
      hoverable
      onClick={onSelect}
      className={`flex flex-col justify-between h-full bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-200 ${className}`}
      dir="rtl"
    >
      <div>
        {coverImage && (
          <div className="relative w-full h-36 rounded-xl overflow-hidden mb-4 bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <img src={coverImage} alt={title} className="w-full h-full object-cover" />
            {category && (
              <Badge variant="primary" className="absolute top-2.5 start-2.5 backdrop-blur-md">
                {category}
              </Badge>
            )}
          </div>
        )}

        <CardHeader>
          <div className="flex items-center justify-between gap-2 mb-1">
            {code && <span className="text-xs font-mono font-bold text-[#008080]">{code}</span>}
            {!coverImage && category && <Badge variant="primary">{category}</Badge>}
          </div>
          <CardTitle className="line-clamp-2 text-base font-bold text-[var(--color-text)]">{title}</CardTitle>
          {description && (
            <CardDescription className="line-clamp-2 mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed">
              {description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="pt-2">
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] flex-wrap">
            {lessonsCount > 0 && <span>📚 {toPersianDigits(lessonsCount)} درس</span>}
            {flashcardsCount > 0 && <span>🎴 {toPersianDigits(flashcardsCount)} کارت</span>}
            {quizzesCount > 0 && <span>✍️ {toPersianDigits(quizzesCount)} آزمون</span>}
          </div>

          {progressPercent !== undefined && (
            <div className="mt-3">
              <Progress value={progressPercent} showLabel size="sm" variant="primary" />
            </div>
          )}
        </CardContent>
      </div>

      <CardFooter className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          {isEnrolled ? "ثبت‌نام شده" : "آماده یادگیری"}
        </span>
        <Button
          size="sm"
          variant={isEnrolled ? "primary" : "outline"}
          onClick={(e) => {
            e.stopPropagation();
            onActionClick?.();
          }}
        >
          {actionText}
        </Button>
      </CardFooter>
    </Card>
  );
};
