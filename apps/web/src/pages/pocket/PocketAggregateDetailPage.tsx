import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShieldCheck,
  Layers,
  FileText,
  Activity,
} from "lucide-react";
import {
  PocketPageHeader,
  AggregateTypeBadge,
  AssertionCard,
  PocketRelatedEntitiesSection,
} from "../../components/pocket/index.js";
import {
  Card,
  Skeleton,
  Alert,
  EmptyState,
} from "../../components/ui/index.js";
import {
  CLINICAL_AGGREGATE_TYPES,
  type ClinicalAggregateType,
} from "../../lib/api/pocket.js";
import { usePocketConsumption } from "../../hooks/usePocketConsumption.js";
import { usePocketAggregateMetadata } from "../../hooks/usePocketAggregateMetadata.js";
import { usePocketRelatedEntities } from "../../hooks/usePocketRelatedEntities.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-zA-Z0-9_.-]+$/;

const PILLAR_METADATA_CONFIG: Record<
  ClinicalAggregateType,
  {
    classificationLabel: string;
    summaryLabel: string;
  }
> = {
  drug: {
    classificationLabel: "رده دارویی",
    summaryLabel: "مکانیسم اثر",
  },
  disease: {
    classificationLabel: "کد طبقه‌بندی (ICD-10)",
    summaryLabel: "تعریف و پاتوفیزیولوژی",
  },
  treatment: {
    classificationLabel: "مدالیته و نوع درمان",
    summaryLabel: "استراتژی درمانی و فارماکولوژیک",
  },
  emergency: {
    classificationLabel: "رده و سطح تریاژ",
    summaryLabel: "راهنمای فوری تریاژ و مدیریت بحران",
  },
};

export function PocketAggregateDetailPage() {
  const { type: rawType, id: rawId } = useParams<{ type: string; id: string }>();

  // 1. Upfront Route Parameter Validation
  const isValidType =
    rawType !== undefined &&
    CLINICAL_AGGREGATE_TYPES.includes(rawType as ClinicalAggregateType);
  const type = isValidType ? (rawType as ClinicalAggregateType) : "drug";

  const trimmedId = rawId ? rawId.trim() : "";
  const isValidIdentifier = Boolean(
    trimmedId &&
    trimmedId.length <= 255 &&
    (UUID_REGEX.test(trimmedId) || SLUG_REGEX.test(trimmedId)),
  );
  const isRouteValid = isValidType && isValidIdentifier;
  const aggregateId = isRouteValid ? trimmedId : undefined;

  // 2. Controlled Query Hooks (never execute on invalid routes)
  // Fetch consumption assertions (published, RFC 7232 ETag cached)
  const {
    data: consumptionData,
    isLoading: isConsumptionLoading,
    error: consumptionError,
    refetch: refetchConsumption,
  } = usePocketConsumption(type, aggregateId);

  // Fetch unified aggregate metadata (nameEn, nameFa, classification, summary)
  const {
    data: metadata,
    isLoading: isMetadataLoading,
    error: metadataError,
  } = usePocketAggregateMetadata(type, aggregateId);

  // Fetch related clinical entities
  const {
    data: relatedData,
    isLoading: isRelatedLoading,
    error: relatedError,
    refetch: refetchRelated,
  } = usePocketRelatedEntities(type, aggregateId, {
    enabled: isRouteValid,
  });

  // Invalid Aggregate Type State
  if (!isValidType) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
        <Alert
          variant="error"
          title="نوع رکن بالینی نامعتبر است"
        >
          {`مقدار '${rawType}' در ارکان بالینی مجاز نیست. ارکان مجاز عبارتند از: ${CLINICAL_AGGREGATE_TYPES.join(", ")}`}
        </Alert>
        <div className="mt-4">
          <Link to="/pocket" className="text-xs font-semibold text-[#008080] hover:underline">
            بازگشت به خانه پاکت
          </Link>
        </div>
      </div>
    );
  }

  // Invalid Identifier State
  if (!isValidIdentifier) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
        <Alert
          variant="error"
          title="شناسه موجودیت بالینی نامعتبر است"
        >
          {`شناسه '${rawId}' یک شناسه معتبر بالینی (UUID یا اسلاگ) نیست.`}
        </Alert>
        <div className="mt-4 flex items-center gap-4">
          <Link to="/pocket/explorer" className="text-xs font-semibold text-[#008080] hover:underline">
            بازگشت به کاوشگر بالینی
          </Link>
          <span className="text-slate-300">|</span>
          <Link to="/pocket" className="text-xs text-[var(--color-text-secondary)] hover:underline">
            خانه پاکت
          </Link>
        </div>
      </div>
    );
  }

  const isLoading = isConsumptionLoading || isMetadataLoading;
  const isError = Boolean(consumptionError || metadataError);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
        <div className="mb-6">
          <Skeleton height={28} width="40%" className="mb-2" />
          <Skeleton height={16} width="60%" />
        </div>
        <div className="p-6 rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] mb-6">
          <Skeleton height={24} width="30%" className="mb-3" />
          <Skeleton height={60} width="100%" className="mb-4" />
          <div className="flex gap-2">
            <Skeleton height={20} width={80} />
            <Skeleton height={20} width={120} />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton height={120} width="100%" />
          <Skeleton height={120} width="100%" />
        </div>
      </div>
    );
  }

  if (isError || !consumptionData) {
    const errorMsg =
      (consumptionError as Error)?.message ||
      (metadataError as Error)?.message ||
      "موجودیت بالینی مورد نظر یافت نشد یا هنوز ادعای علمی معتبری برای آن منتشر نشده است.";

    return (
      <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
        <Alert
          variant="error"
          title="خطا در بازیابی موجودیت بالینی"
        >
          {errorMsg}
        </Alert>
        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => void refetchConsumption()}
            className="text-xs font-semibold text-[#008080] hover:underline"
          >
            تلاش مجدد
          </button>
          <span className="text-slate-300">|</span>
          <Link to="/pocket/explorer" className="text-xs text-[var(--color-text-secondary)] hover:underline">
            بازگشت به کاوشگر
          </Link>
        </div>
      </div>
    );
  }

  const titlePersian = metadata?.nameFa || `موجودیت ${consumptionData.aggregateType}`;
  const titleEnglish = metadata?.nameEn;
  const classification = metadata?.classification;
  const summary = metadata?.summary;
  const currentVersion = consumptionData.currentVersion;
  const assertions = consumptionData.assertions;
  const pillarConfig = PILLAR_METADATA_CONFIG[consumptionData.aggregateType] ?? PILLAR_METADATA_CONFIG.drug;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <PocketPageHeader
        title={titlePersian}
        subtitle={titleEnglish ? `عنوان علمی لاتین: ${titleEnglish}` : undefined}
        badge={
          <div className="flex items-center gap-2">
            <AggregateTypeBadge type={consumptionData.aggregateType} size="md" />
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)] font-mono font-medium border border-slate-200 dark:border-slate-700">
              <Layers className="w-3 h-3 text-[#008080]" />
              نسخه {currentVersion}
            </span>
          </div>
        }
        breadcrumbs={[
          { label: "خانه پاکت", to: "/pocket" },
          { label: "کاوشگر", to: "/pocket/explorer" },
          { label: titlePersian },
        ]}
        backLink={{ to: "/pocket/explorer", label: "بازگشت به کاوشگر" }}
      />

      {/* Aggregate Overview Card */}
      <Card className="p-6 md:p-7 rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] mb-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {classification && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--color-text-secondary)]">
                  {pillarConfig.classificationLabel}: {classification}
                </span>
              )}
              {metadata?.slug && (
                <span className="text-xs font-mono text-[var(--color-text-muted)]">
                  اسلاگ: {metadata.slug}
                </span>
              )}
            </div>

            {/* Pillar-specific Summary */}
            {summary && (
              <div className="mt-4 pt-3.5 border-t border-[var(--color-border)]">
                <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#008080]" />
                  <span>{pillarConfig.summaryLabel}</span>
                </div>
                <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">
                  {summary}
                </p>
              </div>
            )}
          </div>

          <div className="p-3 rounded-[12px] bg-slate-50 dark:bg-slate-900 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] shrink-0">
            <div className="font-mono text-[11px] mb-1">
              UUID: {metadata?.id ?? consumptionData?.aggregateId ?? aggregateId}
            </div>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>پروتکل انتشار اتمیک فعال</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Published Assertions Section */}
      <section aria-label="بیانیه‌های علمی معتبر">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#008080]" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              بیانیه‌ها و ادعاهای علمی معتبر (Published Assertions)
            </h2>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] dark:text-teal-300 font-mono">
            {assertions.length} بیانیه مصوب
          </span>
        </div>

        {assertions.length === 0 ? (
          <EmptyState
            title="هیچ بیانیه علمی فعالی برای این موجودیت ثبت نشده است"
            description="این موجودیت در رجیستری بالینی وجود دارد، اما تمامی ادعاهای علمی آن یا در وضعیت پیش‌نویس قرار دارند و یا منسوخ شده‌اند."
          />
        ) : (
          <div className="space-y-4">
            {assertions.map((assertion) => (
              <AssertionCard key={assertion.id} assertion={assertion} />
            ))}
          </div>
        )}
      </section>

      {/* Related Clinical Entities Section (Multi-group, Independent State) */}
      <PocketRelatedEntitiesSection
        groups={relatedData?.groups}
        isLoading={isRelatedLoading}
        isError={Boolean(relatedError)}
        error={relatedError as Error | null}
        onRetry={() => void refetchRelated()}
      />
    </div>
  );
}
