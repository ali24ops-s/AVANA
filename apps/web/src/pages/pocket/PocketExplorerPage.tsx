import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Pill,
  Activity,
  Stethoscope,
  AlertTriangle,
  Layers,
  ArrowUpDown,
  Search,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  Loader2,
  ChevronDown,
  X,
} from "lucide-react";
import { PocketPageHeader, PocketDiscoveryCard } from "../../components/pocket/index.js";
import { Button, Input } from "../../components/ui/index.js";
import { usePocketDiscovery } from "../../hooks/usePocketDiscovery.js";
import { usePocketSearch } from "../../hooks/usePocketSearch.js";
import {
  type ClinicalSearchAggregateType,
  type ClinicalPillarType,
  type DiscoverySortOption,
  type PocketDiscoveryItem,
  type PocketDiscoveryQueryParams,
  VALID_SEARCH_AGGREGATE_TYPES,
  VALID_DISCOVERY_SORT_OPTIONS,
} from "../../lib/api/pocket.js";
import {
  buildExplorerSessionKey,
  cleanSearchQuery,
  clearOffsetInFlight,
  getExplorerSession,
  isOffsetInFlight,
  markOffsetInFlight,
  startExplorerSession,
  updateExplorerSession,
  type ExplorerItem,
} from "./explorerSessionCache.js";

const PAGE_LIMIT = 20;

const PILLARS: Array<{
  type: ClinicalSearchAggregateType;
  label: string;
  enLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: "all", label: "همه", enLabel: "All", icon: Layers },
  { type: "drug", label: "داروها", enLabel: "Drugs", icon: Pill },
  { type: "disease", label: "بیماری‌ها", enLabel: "Diseases", icon: Activity },
  { type: "treatment", label: "درمان‌ها", enLabel: "Treatments", icon: Stethoscope },
  { type: "emergency", label: "اورژانس‌ها", enLabel: "Emergencies", icon: AlertTriangle },
];

const SORT_OPTIONS: Array<{
  value: DiscoverySortOption;
  label: string;
}> = [
  { value: "recent", label: "جدیدترین‌ها" },
  { value: "name_asc", label: "عنوان: الف - ی" },
  { value: "name_desc", label: "عنوان: ی - الف" },
];

export function PocketExplorerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL search params
  const paramQ = searchParams.get("q") ?? "";
  const paramType = searchParams.get("type");
  const validParamType: ClinicalSearchAggregateType =
    paramType && VALID_SEARCH_AGGREGATE_TYPES.includes(paramType as ClinicalSearchAggregateType)
      ? (paramType as ClinicalSearchAggregateType)
      : "all";

  const paramSort = searchParams.get("sort");
  const validParamSort: DiscoverySortOption =
    paramSort && VALID_DISCOVERY_SORT_OPTIONS.includes(paramSort as DiscoverySortOption)
      ? (paramSort as DiscoverySortOption)
      : "recent";

  const cleanQ = cleanSearchQuery(paramQ);
  const isSearchMode = cleanQ.length > 0;

  // Search input state
  const [searchQueryInput, setSearchQueryInput] = useState(paramQ);

  const [selectedType, setSelectedType] = useState<ClinicalSearchAggregateType>(validParamType);
  const [selectedSort, setSelectedSort] = useState<DiscoverySortOption>(validParamSort);

  // Canonical Session Key & Filter Key
  const currentSessionKey = buildExplorerSessionKey(paramQ, selectedType, selectedSort);
  const currentFilterKey = `${selectedType}:${selectedSort}:${PAGE_LIMIT}${cleanQ ? `:${cleanQ}` : ""}`;

  // Synchronous mount hydration from explorerSessionCache
  const initialSession = getExplorerSession(currentSessionKey);
  const [offset, setOffset] = useState<number>(() => initialSession?.offset ?? 0);
  const [accumulatedItems, setAccumulatedItems] = useState<ExplorerItem[]>(
    () => initialSession?.items ?? [],
  );
  const [loadedFilterKey, setLoadedFilterKey] = useState<string>(
    () => (initialSession ? currentFilterKey : currentFilterKey),
  );
  const [serverTotal, setServerTotal] = useState<number | undefined>(
    () => initialSession?.total,
  );
  const [serverHasMore, setServerHasMore] = useState<boolean>(
    () => initialSession?.hasMore ?? false,
  );

  // Request Race Guard: Active session key & generation identity
  const activeSessionKeyRef = useRef<string>(currentSessionKey);
  const sessionGenerationRef = useRef<number>(initialSession?.generation ?? 1);
  const prevParamQRef = useRef<string>(paramQ);

  // Synchronize state when URL search params change (Browser Back/Forward)
  useEffect(() => {
    if (validParamType !== selectedType) {
      setSelectedType(validParamType);
      setOffset(0);
      setAccumulatedItems([]);
      setLoadedFilterKey("");
      setServerTotal(undefined);
      setServerHasMore(false);
    }
  }, [validParamType, selectedType]);

  useEffect(() => {
    if (validParamSort !== selectedSort) {
      setSelectedSort(validParamSort);
      setOffset(0);
      setAccumulatedItems([]);
      setLoadedFilterKey("");
      setServerTotal(undefined);
      setServerHasMore(false);
    }
  }, [validParamSort, selectedSort]);

  useEffect(() => {
    if (prevParamQRef.current !== paramQ) {
      prevParamQRef.current = paramQ;
      setSearchQueryInput(paramQ);
      setOffset(0);
      setAccumulatedItems([]);
      setLoadedFilterKey("");
      setServerTotal(undefined);
      setServerHasMore(false);
    }
  }, [paramQ]);

  // Hook Branching: Search Mode vs Discovery Mode
  const searchQueryHook = usePocketSearch(
    {
      q: cleanQ,
      type: selectedType !== "all" ? selectedType : undefined,
      limit: PAGE_LIMIT,
      offset,
    },
    { enabled: isSearchMode },
  );

  const discoveryQueryParams: PocketDiscoveryQueryParams = useMemo(() => ({
    type: selectedType,
    sort: selectedSort,
    limit: PAGE_LIMIT,
    offset,
  }), [selectedType, selectedSort, offset]);

  const discoveryHook = usePocketDiscovery(
    discoveryQueryParams,
    { enabled: !isSearchMode },
  );

  const activeData = isSearchMode ? searchQueryHook.data : discoveryHook.data;
  const isLoading = isSearchMode ? searchQueryHook.isLoading : discoveryHook.isLoading;
  const isFetching = isSearchMode ? searchQueryHook.isFetching : discoveryHook.isFetching;
  const isError = isSearchMode ? searchQueryHook.isError : discoveryHook.isError;
  const error = isSearchMode ? searchQueryHook.error : discoveryHook.error;
  const refetch = isSearchMode ? searchQueryHook.refetch : discoveryHook.refetch;

  const isFilterKeyStale = loadedFilterKey !== currentFilterKey && offset === 0;

  // Process newly arrived data with strict Request Race Guard & Phase 3 compatibility
  useEffect(() => {
    if (!activeData) return;

    // 1. Strict aggregate type guard: Reject responses from a different pillar
    if ("type" in activeData && activeData.type && activeData.type !== selectedType) {
      return;
    }

    // 2. Strict pagination offset guard: Reject late responses for a previous or mismatched page
    if (activeData.offset !== undefined && activeData.offset !== offset) {
      return;
    }

    // 3. Strict page limit guard: Reject responses with mismatched page boundaries
    if (activeData.limit !== undefined && activeData.limit !== PAGE_LIMIT) {
      return;
    }

    setServerTotal(activeData.total);
    setServerHasMore(activeData.hasMore);

    if (offset === 0) {
      setAccumulatedItems(activeData.items);
      setLoadedFilterKey(currentFilterKey);
      updateExplorerSession(
        currentSessionKey,
        {
          items: activeData.items,
          total: activeData.total,
          offset: 0,
          hasMore: activeData.hasMore,
        },
        sessionGenerationRef.current,
      );
    } else {
      setAccumulatedItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const newItems = activeData.items.filter((item) => !existingIds.has(item.id));
        const combined = [...prev, ...newItems];
        updateExplorerSession(
          currentSessionKey,
          {
            items: combined,
            total: activeData.total,
            offset,
            hasMore: activeData.hasMore,
          },
          sessionGenerationRef.current,
        );
        return combined;
      });
    }

    clearOffsetInFlight(currentSessionKey, offset);
  }, [activeData, offset, currentFilterKey, currentSessionKey, selectedType]);

  // Pillar tab change handler
  const handlePillarChange = (newType: ClinicalSearchAggregateType) => {
    if (newType === selectedType) return;
    setSelectedType(newType);
    setOffset(0);
    setAccumulatedItems([]);
    setLoadedFilterKey("");
    setServerTotal(undefined);
    setServerHasMore(false);

    const nextSessionKey = buildExplorerSessionKey(paramQ, newType, selectedSort);
    activeSessionKeyRef.current = nextSessionKey;
    const { generation } = startExplorerSession(nextSessionKey);
    sessionGenerationRef.current = generation;

    const nextParams = new URLSearchParams(searchParams);
    if (newType === "all") {
      nextParams.delete("type");
    } else {
      nextParams.set("type", newType);
    }
    nextParams.delete("offset");
    setSearchParams(nextParams);
  };

  // Sort change handler
  const handleSortChange = (newSort: DiscoverySortOption) => {
    if (newSort === selectedSort) return;
    setSelectedSort(newSort);
    setOffset(0);
    setAccumulatedItems([]);
    setLoadedFilterKey("");
    setServerTotal(undefined);
    setServerHasMore(false);

    const nextSessionKey = buildExplorerSessionKey(paramQ, selectedType, newSort);
    activeSessionKeyRef.current = nextSessionKey;
    const { generation } = startExplorerSession(nextSessionKey);
    sessionGenerationRef.current = generation;

    const nextParams = new URLSearchParams(searchParams);
    if (newSort === "recent") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", newSort);
    }
    nextParams.delete("offset");
    setSearchParams(nextParams);
  };

  // Search submission handler
  const handleApplySearch = (term: string) => {
    const trimmed = term.trim();
    setOffset(0);
    setAccumulatedItems([]);
    setLoadedFilterKey("");
    setServerTotal(undefined);
    setServerHasMore(false);

    const nextSessionKey = buildExplorerSessionKey(trimmed, selectedType, selectedSort);
    activeSessionKeyRef.current = nextSessionKey;
    const { generation } = startExplorerSession(nextSessionKey);
    sessionGenerationRef.current = generation;

    const nextParams = new URLSearchParams(searchParams);
    if (trimmed) {
      nextParams.set("q", trimmed);
    } else {
      nextParams.delete("q");
    }
    nextParams.delete("offset");
    setSearchParams(nextParams);
  };

  // Search clear handler
  const handleClearSearch = () => {
    setSearchQueryInput("");
    setOffset(0);
    setAccumulatedItems([]);
    setLoadedFilterKey("");
    setServerTotal(undefined);
    setServerHasMore(false);

    const nextSessionKey = buildExplorerSessionKey("", selectedType, selectedSort);
    activeSessionKeyRef.current = nextSessionKey;
    const { generation } = startExplorerSession(nextSessionKey);
    sessionGenerationRef.current = generation;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("q");
    nextParams.delete("offset");
    setSearchParams(nextParams);
  };

  // Load More handler
  const handleLoadMore = () => {
    const hasMore = activeData?.hasMore ?? serverHasMore;
    if (isFetching || !hasMore) return;
    const nextOffset = offset + PAGE_LIMIT;
    if (isOffsetInFlight(currentSessionKey, nextOffset)) {
      return;
    }
    markOffsetInFlight(currentSessionKey, nextOffset);
    setOffset(nextOffset);
  };

  // Quick direct UUID lookup state
  const [identifierInput, setIdentifierInput] = useState("");
  const [identifierType, setIdentifierType] = useState<ClinicalPillarType>("drug");
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleDirectLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = identifierInput.trim();
    if (!trimmed) {
      setLookupError("لطفاً شناسه یکتای موجودیت (UUID) را وارد نمایید.");
      return;
    }
    setLookupError(null);
    navigate(`/pocket/${identifierType}/${trimmed}`);
  };

  // State calculations
  const isInitialOrFilterLoading =
    (isLoading && offset === 0) || (isFetching && accumulatedItems.length === 0) || isFilterKeyStale;
  const isNextPageLoading = isFetching && offset > 0;
  const effectiveTotal = isFilterKeyStale ? undefined : (activeData?.total ?? serverTotal);
  const hasValidTotal = typeof effectiveTotal === "number";
  const effectiveHasMore = isFilterKeyStale ? false : Boolean(activeData?.hasMore ?? serverHasMore);
  const canLoadMore = Boolean(effectiveHasMore && !isFilterKeyStale);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" dir="rtl">
      {/* Page Header */}
      <PocketPageHeader
        title="کاوشگر بالینی (Clinical Explorer)"
        subtitle="مرور ساختاریافته پایگاه دانش بالینی در چهار رکن پزشکی و کشف موجودیت‌های علمی معتبر."
        breadcrumbs={[
          { label: "خانه پاکت", to: "/pocket" },
          { label: "کاوشگر" },
        ]}
        backLink={{ to: "/pocket", label: "بازگشت به خانه پاکت" }}
      />

      {/* Search Bar in Explorer */}
      <div className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleApplySearch(searchQueryInput);
          }}
          className="relative flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQueryInput}
              onChange={(e) => setSearchQueryInput(e.target.value)}
              placeholder="جستجو در تمام ارکان بالینی (مثلاً: آتورواستاتین، فشار خون، تریاژ)..."
              className="w-full pl-10 pr-10 py-2.5 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#008080] shadow-xs"
              data-testid="explorer-search-input"
            />
            {searchQueryInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="پاک کردن متن جستجو"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                data-testid="explorer-clear-search-button"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            className="px-5 py-2.5 text-xs font-semibold shrink-0"
            data-testid="explorer-search-submit-btn"
          >
            جستجو
          </Button>
        </form>
      </div>

      {/* Pillar Tabs Bar */}
      <div className="mb-6">
        <div
          aria-label="ستون‌های بالینی"
          className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--color-border)] no-scrollbar"
        >
          {PILLARS.map((p) => {
            const Icon = p.icon;
            const isSelected = selectedType === p.type;
            return (
              <button
                key={p.type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handlePillarChange(p.type)}
                className={`min-h-[44px] px-4 py-2.5 rounded-[12px] text-xs font-semibold inline-flex items-center gap-2 shrink-0 border transition-all ${
                  isSelected
                    ? "bg-[#008080] text-white border-[#008080] shadow-xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{p.label}</span>
                <span
                  className={`text-[11px] font-mono ${
                    isSelected ? "text-teal-100" : "text-slate-400"
                  }`}
                  dir="ltr"
                >
                  ({p.enLabel})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explorer Controls Row: Total Counter & Sort Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        {/* Results Counter & Search Status */}
        <div className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2 flex-wrap">
          {hasValidTotal && !isInitialOrFilterLoading ? (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-full border border-[var(--color-border)] font-medium">
              <span>نمایش</span>
              <strong className="font-bold text-[var(--color-text-primary)] font-mono">
                {accumulatedItems.length}
              </strong>
              <span>از</span>
              <strong className="font-bold text-[var(--color-text-primary)] font-mono">
                {effectiveTotal}
              </strong>
              <span>موجودیت بالینی</span>
            </div>
          ) : (
            <span className="text-slate-400">در حال کشف اطلاعات بالینی...</span>
          )}

          {cleanQ && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] font-medium border border-teal-200 dark:border-teal-800">
              جستجو برای: «{cleanQ}»
            </span>
          )}
        </div>

        {/* Sort Controls (Enabled in Discovery Mode, or informative in Search) */}
        {!isSearchMode && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="discovery-sort-select"
              className="text-xs text-[var(--color-text-secondary)] font-medium shrink-0 flex items-center gap-1"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#008080]" />
              <span>مرتب‌سازی:</span>
            </label>
            <select
              id="discovery-sort-select"
              value={selectedSort}
              onChange={(e) => handleSortChange(e.target.value as DiscoverySortOption)}
              className="text-xs h-9 px-3 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-medium focus:outline-none focus:ring-1 focus:ring-[#008080] shadow-xs cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isInitialOrFilterLoading ? (
        /* Skeleton Loading State */
        <div
          data-testid="discovery-loading-state"
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
        >
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs animate-pulse flex flex-col justify-between gap-4 h-48"
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-16 h-5 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="w-24 h-5 rounded-full bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="w-40 h-6 rounded bg-slate-200 dark:bg-slate-800 mb-2" />
                <div className="w-full h-4 rounded bg-slate-100 dark:bg-slate-800/60 mb-1" />
                <div className="w-3/4 h-4 rounded bg-slate-100 dark:bg-slate-800/60" />
              </div>
              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                <div className="w-24 h-4 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="w-28 h-4 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      ) : isError && accumulatedItems.length === 0 ? (
        /* Error State with Retry */
        <div data-testid="discovery-error-state" className="p-8 text-center rounded-[20px] bg-[var(--color-surface)] border border-rose-200 dark:border-rose-900/50 mb-8">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1">
            خطا در دریافت اطلاعات کشف بالینی
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4 max-w-md mx-auto">
            {error instanceof Error ? error.message : "برقراری ارتباط با سرویس بالینی با اختلال مواجه شد."}
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تلاش مجدد</span>
          </Button>
        </div>
      ) : accumulatedItems.length === 0 ? (
        /* Empty State */
        <div data-testid="discovery-empty-state" className="p-12 text-center rounded-[20px] bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] mb-8">
          <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1">
            {cleanQ ? `هیچ موردی برای «${cleanQ}» یافت نشد` : "هیچ موردی در این رکن بالینی یافت نشد"}
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4 max-w-md mx-auto">
            {cleanQ
              ? "املا را بررسی کنید، کلمات عام‌تر به کار ببرید، یا فیلتر رکن دیگری را انتخاب نمایید."
              : "در حال حاضر داده‌ای مطابق با فیلتر انتخابی شما در پایگاه دانش بالینی منتشر نشده است."}
          </p>
          {cleanQ ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleClearSearch}
              className="text-xs font-semibold px-4 py-2"
            >
              پاک کردن جستجو و نمایش کشف بالینی
            </Button>
          ) : selectedType !== "all" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePillarChange("all")}
              className="text-xs font-semibold px-4 py-2"
            >
              مشاهده همه ارکان بالینی
            </Button>
          ) : null}
        </div>
      ) : (
        /* Results Grid */
        <div>
          <div
            data-testid="discovery-results-grid"
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
          >
            {accumulatedItems.map((item) => (
              <PocketDiscoveryCard
                key={`${item.type}-${item.id}`}
                item={item as PocketDiscoveryItem}
                searchQuery={cleanQ}
              />
            ))}
          </div>

          {/* Load More Button */}
          {canLoadMore && (
            <div className="text-center my-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadMore}
                disabled={isNextPageLoading}
                className="px-8 py-2.5 text-xs font-semibold inline-flex items-center gap-2 rounded-full border-[var(--color-border)] hover:border-[#008080] shadow-xs"
              >
                {isNextPageLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#008080]" />
                    <span>در حال بارگذاری صفحه بعد...</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-[#008080]" />
                    <span>بارگذاری بیشتر</span>
                  </>
                )}
              </Button>
            </div>
          )}

          {isError && offset > 0 && (
            <div className="text-center my-4 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-[12px] border border-rose-200 dark:border-rose-900/40 text-xs">
              <span className="text-rose-700 dark:text-rose-400 font-medium ml-2">
                دریافت موارد بیشتر با خطا مواجه شد.
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-[#008080] font-bold underline hover:text-[#006060]"
              >
                تلاش مجدد
              </button>
            </div>
          )}
        </div>
      )}

      {/* Direct UUID Lookup */}
      <details className="mt-8 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 text-xs group shadow-xs">
        <summary className="font-semibold text-[var(--color-text-secondary)] cursor-pointer hover:text-[#008080] transition-colors flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#008080]" />
            <span>استعلام مستقیم با شناسه یکتا (Direct UUID Lookup)</span>
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="pt-4 mt-3 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mb-4">
            اگر شناسه یکتا (UUID) یک موجودیت بالینی را در دست دارید، می‌توانید مستقیماً به شناسنامه علمی و بیانیه‌های تاییدشده آن دسترسی پیدا کنید.
          </p>
          <form
            onSubmit={handleDirectLookup}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          >
            <div className="w-full sm:w-36">
              <select
                value={identifierType}
                onChange={(e) => setIdentifierType(e.target.value as ClinicalPillarType)}
                className="w-full text-xs h-11 px-3 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-medium focus:outline-none focus:ring-1 focus:ring-[#008080]"
              >
                <option value="drug">داروها</option>
                <option value="disease">بیماری‌ها</option>
                <option value="treatment">درمان‌ها</option>
                <option value="emergency">اورژانس‌ها</option>
              </select>
            </div>
            <div className="flex-1">
              <Input
                type="text"
                placeholder="مثال: c8b0a514-4fb9-4f80-b747-91f1a5ff6818"
                value={identifierInput}
                onChange={(e) => {
                  setIdentifierInput(e.target.value);
                  if (lookupError) setLookupError(null);
                }}
                className="font-mono text-xs h-11"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="h-11 px-6 font-semibold shrink-0"
            >
              استعلام سند
            </Button>
          </form>
          {lookupError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium">
              {lookupError}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
