/**
 * ContentPackCard Component.
 *
 * Renders a published content pack card in the public library grid.
 * Displays subject, title, description, creator, educational stats,
 * and clear actionable CTAs ("مشاهده محتوا" & "افزودن به دوره").
 */

import React from "react";
import {
  BookOpen,
  Layers,
  HelpCircle,
  Clock,
  Users,
  Eye,
  PlusCircle,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import { type PublicContentPackItemSummary } from "@avana/domain";
import {
  useCommerceProducts,
  useMyEntitlements,
  useMySubscription,
} from "../../hooks/useCommerce.js";
import { formatToman } from "../commerce/userCommerceUtils.js";
import { Card, Badge, Button } from "@avana/ui";

export interface ContentPackCardProps {
  pack: PublicContentPackItemSummary;
  onViewDetails: (pack: PublicContentPackItemSummary) => void;
  onAddToCourse: (pack: PublicContentPackItemSummary) => void;
}

export function ContentPackCard({
  pack,
  onViewDetails,
  onAddToCourse,
}: ContentPackCardProps) {
  const sessionCount = pack.stats?.session_count ?? 0;
  const flashcardCount = pack.stats?.flashcard_count ?? 0;
  const quizQuestionCount = pack.stats?.quiz_question_count ?? 0;
  const estimatedReadingMinutes = pack.stats?.estimated_reading_minutes ?? 10;
  const usageCount = pack.usage_count ?? 0;

  const { data: productsData } = useCommerceProducts();
  const { data: entitlementsData } = useMyEntitlements();
  const { data: subData } = useMySubscription();

  // Find product for this pack
  const packProduct = (productsData?.items ?? []).find(
    (p) => p.target_type === "content_pack" && p.target_id === pack.id,
  );

  // Check if user purchased this pack permanently
  const isPurchased = (entitlementsData?.items ?? []).some(
    (e) => e.resource_type === "content_pack" && e.resource_id === pack.id,
  );

  // Check if user has active subscription
  const hasSubscription = subData?.subscription?.status === "active";

  const handleBuyPack = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (packProduct) {
      window.location.href = `/checkout/card-to-card?productId=${encodeURIComponent(packProduct.id)}`;
    }
  };

  return (
    <Card
      hoverable
      className="group relative flex flex-col justify-between p-5 bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] transition-all duration-300"
      dir="rtl"
    >
      {/* Top Header: Subject Badge & Usage Count */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge variant="primary" icon={<Sparkles className="w-3 h-3" />}>
              {pack.subject || "عمومی / پزشکی"}
            </Badge>

            {isPurchased ? (
              <Badge variant="success">خریداری شده</Badge>
            ) : hasSubscription ? (
              <Badge variant="primary">در دسترس با اشتراک</Badge>
            ) : packProduct ? (
              <Badge variant="warning">{formatToman(packProduct.price)}</Badge>
            ) : null}
          </div>

          <span
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] font-medium bg-[var(--color-surface-warm)] px-2.5 py-1 rounded-full border border-[var(--color-border)] whitespace-nowrap shrink-0"
            title="تعداد دفعات افزوده‌شده به دوره‌ها"
          >
            <Users className="w-3.5 h-3.5 text-[#008080] shrink-0" />
            <span>{usageCount} افزوده‌شده</span>
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors line-clamp-1 mb-1.5">
          {pack.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-4 min-h-[2rem]">
          {pack.description && pack.description.trim().length > 0
            ? pack.description
            : "مجموعه آموزشی جامع شامل درسنامه ساختاریافته، فلش‌کارت‌های مرور فعال، آزمون تستی و خلاصه نکات کلیدی."}
        </p>

        {/* Creator Info */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text-muted)]">سازنده:</span>
          <span className="font-medium text-[var(--color-text)]">
            {pack.creator?.name || "کاربر آوانا"}
          </span>
        </div>

        {/* Educational Content Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="flex items-center gap-2 p-2 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
            <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate">{sessionCount} جلسه درس</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
            <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{flashcardCount} فلش‌کارت</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
            <HelpCircle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="truncate">{quizQuestionCount} سوال آزمون</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)]">
            <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">~{estimatedReadingMinutes} دقیقه</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onViewDetails(pack)}
          className="flex-1"
          leftIcon={<Eye className="w-3.5 h-3.5" />}
        >
          مشاهده محتوا
        </Button>

        {!isPurchased && !hasSubscription && packProduct ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleBuyPack}
            className="flex-1"
            leftIcon={<ShoppingBag className="w-3.5 h-3.5" />}
          >
            خرید بسته
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onAddToCourse(pack)}
            className="flex-1"
            leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
          >
            افزودن به دوره
          </Button>
        )}
      </div>
    </Card>
  );
}
