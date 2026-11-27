import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Pill,
  Activity,
  Stethoscope,
  AlertTriangle,
  Search,
  ArrowLeft,
  Shield,
  Layers,
} from "lucide-react";
import {
  PocketPageHeader,
  ClinicalReviewerBanner,
  PocketSearchBar,
  PocketSearchDropdown,
  PocketSearchFilters,
  PocketSearchResultCard,
} from "../../components/pocket/index.js";
import {
  Card,
  Button,
  Input,
  Alert,
  EmptyState,
  Skeleton,
} from "../../components/ui/index.js";
import type {
  ClinicalAggregateType,
  ClinicalSearchAggregateType,
  PocketSearchSuggestion,
} from "../../lib/api/pocket.js";
import {
  usePocketSearch,
  usePocketSuggestions,
} from "../../hooks/usePocket.js";

const PILLARS: Array<{
  type: ClinicalAggregateType;
  title: string;
  enTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = [
  {
    type: "drug",
    title: "داروها",
    enTitle: "Drugs & Pharmacology",
    description: "اطلاعات استاندارد دارویی، دوزاژ بالینی، تداخلات و هشدارهای مصرف.",
    icon: Pill,
    colorClass: "text-[#008080]",
    bgClass: "bg-teal-50 dark:bg-teal-950/40",
    borderClass: "hover:border-teal-400",
  },
  {
    type: "disease",
    title: "بیماری‌ها",
    enTitle: "Diseases & Pathophysiology",
    description: "تعاریف بالینی، کدهای ICD-10، اتیولوژی، پاتوفیزیولوژی و نکات مهم تشخیصی.",
    icon: Activity,
    colorClass: "text-amber-600",
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
    borderClass: "hover:border-amber-400",
  },
  {
    type: "treatment",
    title: "درمان‌ها",
    enTitle: "Treatments & Guidelines",
    description: "استراتژی‌های دارویی و غیردارویی، خطوط درمان و پایش اثربخشی و ایمنی.",
    icon: Stethoscope,
    colorClass: "text-[#2b6d8f]",
    bgClass: "bg-blue-50 dark:bg-blue-950/40",
    borderClass: "hover:border-blue-400",
  },
  {
    type: "emergency",
    title: "اورژانس‌ها",
    enTitle: "Emergencies & Triage",
    description: "راهنماهای تریاژ فوری، معیارهای ارجاع و پروتکل‌های نجات‌بخش بالینی.",
    icon: AlertTriangle,
    colorClass: "text-rose-600",
    bgClass: "bg-rose-50 dark:bg-rose-950/40",
    borderClass: "hover:border-rose-400",
  },
];

export function PocketHomePage() {
  const navigate = useNavigate();

  // Search & Typeahead State
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedType, setSelectedType] = useState<ClinicalSearchAggregateType>("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Direct Identifier Lookup State (Preserved for doctors with exact UUID)
  const [lookupType, setLookupType] = useState<ClinicalAggregateType>("drug");
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Debounce searchInput (300ms) for Typeahead Suggestions
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setDebouncedQuery("");
      setIsDropdownOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setIsDropdownOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Hook 1: Typeahead Suggestions
  const {
    data: suggestionsData,
    isLoading: isSuggestionsLoading,
    isError: isSuggestionsError,
  } = usePocketSuggestions({
    q: debouncedQuery,
    type: selectedType !== "all" ? selectedType : undefined,
    limit: 6,
  });

  const suggestions = suggestionsData?.suggestions ?? [];

  // Active search intent condition
  const hasSearchIntent = Boolean(
    submittedQuery.trim() || (selectedType !== "all" && searchInput.trim()),
  );

  const activeSearchTerm = submittedQuery.trim() || (selectedType !== "all" ? searchInput.trim() : undefined);

  // Hook 2: Full Unified Search
  const {
    data: searchResultsData,
    isLoading: isSearchLoading,
    error: searchError,
    refetch: refetchSearch,
  } = usePocketSearch(
    {
      q: activeSearchTerm,
      type: selectedType,
      limit: 20,
    },
    {
      enabled: hasSearchIntent,
    },
  );

  const searchResults = searchResultsData?.items ?? [];
  const totalResults = searchResultsData?.total ?? 0;

  // Search Execution & Selection Handlers
  const handleExecuteSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSubmittedQuery(trimmed);
    setSearchInput(trimmed);
    setIsDropdownOpen(false);
    setSelectedIndex(-1);
  };

  const handleSelectSuggestion = (item: PocketSearchSuggestion) => {
    setIsDropdownOpen(false);
    navigate(`/pocket/${item.type}/${item.id}`);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setSubmittedQuery("");
    setSelectedIndex(-1);
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (suggestions.length > 0) {
        e.preventDefault();
        setIsDropdownOpen(true);
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      if (suggestions.length > 0) {
        e.preventDefault();
        setIsDropdownOpen(true);
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      }
    } else if (e.key === "Enter") {
      if (isDropdownOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else {
        e.preventDefault();
        handleExecuteSearch(e.currentTarget.value || searchInput);
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleDirectLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupId.trim();
    if (!trimmed) {
      setLookupError("لطفاً شناسه یکتای موجودیت (UUID) را وارد کنید.");
      return;
    }
    setLookupError(null);
    navigate(`/pocket/${lookupType}/${trimmed}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" dir="rtl">
      <PocketPageHeader
        title="AVANA Pocket"
        subtitle="مرجع سریع و بالینی بر بالین بیمار — مبتنی بر ادعاهای علمی تغییرناپذیر، داوری همتا و انتشار اتمیک شواهد پزشکی."
        badge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e0f2f2] dark:bg-teal-950/60 text-[#008080] dark:text-teal-300 text-xs font-bold border border-[#b3d9d9] dark:border-teal-800">
            <Shield className="w-3.5 h-3.5" />
            نسخه بالینی مصوب
          </span>
        }
      />

      {/* Reviewer Status Banner */}
      <section className="mb-6" aria-label="وضعیت داور بالینی">
        <ClinicalReviewerBanner showWhenNonReviewer />
      </section>

      {/* Prominent Unified Clinical Search Hub */}
      <section className="mb-8" aria-label="مرکز جستجوی بالینی">
        <div className="p-6 md:p-8 rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] mb-2">
                جستجوی جامع در پایگاه دانش بالینی AVANA
              </h2>
              <p className="text-xs md:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                دسترسی آنی به دوزاژ داروها، علائم و معیارهای بیماری‌ها، پروتکل‌های درمان و راهنماهای تریاژ اورژانس.
              </p>
            </div>

            {/* Search Input with Live Dropdown */}
            <div className="relative mb-4">
              <PocketSearchBar
                inputRef={searchInputRef}
                value={searchInput}
                onChange={(val) => {
                  setSearchInput(val);
                  setSelectedIndex(-1);
                }}
                onSearch={handleExecuteSearch}
                onClear={handleClearSearch}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (debouncedQuery.trim().length > 0) {
                    setIsDropdownOpen(true);
                  }
                }}
                isLoading={isSuggestionsLoading}
                isDropdownOpen={isDropdownOpen}
                activeDescendantId={
                  isDropdownOpen && selectedIndex >= 0 && selectedIndex < suggestions.length
                    ? `pocket-suggestion-item-${selectedIndex}`
                    : undefined
                }
              />

              <PocketSearchDropdown
                anchorRef={searchInputRef}
                isOpen={isDropdownOpen}
                suggestions={suggestions}
                isLoading={isSuggestionsLoading}
                isError={isSuggestionsError}
                query={searchInput}
                selectedIndex={selectedIndex}
                onSelect={handleSelectSuggestion}
                onSearchAll={handleExecuteSearch}
                onClose={() => setIsDropdownOpen(false)}
              />
            </div>

            {/* Pillar Filter Pills */}
            <div className="flex items-center justify-center">
              <PocketSearchFilters
                selectedType={selectedType}
                onSelectType={(newType) => {
                  setSelectedType(newType);
                  if (submittedQuery.trim() || searchInput.trim()) {
                    setIsDropdownOpen(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Area 1: Active Search Results View */}
      {hasSearchIntent && (
        <section className="mb-10" aria-label="نتایج جستجوی بالینی">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                نتایج جستجو
              </h2>
              {activeSearchTerm && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  برای «<span className="font-semibold text-[#008080]">{activeSearchTerm}</span>»
                </span>
              )}
              {selectedType !== "all" && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-[#008080] font-medium border border-teal-200 dark:border-teal-800">
                  فیلتر: {PILLARS.find((p) => p.type === selectedType)?.title ?? selectedType}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!isSearchLoading && !searchError && (
                <span className="text-xs font-mono text-[var(--color-text-muted)]">
                  {totalResults} موجودیت یافت شد
                </span>
              )}
              {activeSearchTerm && (
                <Link
                  to={`/pocket/explorer?q=${encodeURIComponent(activeSearchTerm)}${selectedType !== "all" ? `&type=${selectedType}` : ""}`}
                  className="text-xs font-semibold text-[#008080] bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 px-3 py-1.5 rounded-[8px] hover:bg-teal-100 dark:hover:bg-teal-900/40 flex items-center gap-1 transition-colors"
                  data-testid="view-in-explorer-link"
                >
                  <span>مشاهده در کاوشگر بالینی</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Link>
              )}
              <button
                type="button"
                onClick={handleClearSearch}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
              >
                پاک کردن جستجو
              </button>
            </div>
          </div>

          {/* Loading Skeletons */}
          {isSearchLoading && (
            <div className="space-y-4">
              <Skeleton height={140} width="100%" borderRadius="16px" />
              <Skeleton height={140} width="100%" borderRadius="16px" />
              <Skeleton height={140} width="100%" borderRadius="16px" />
            </div>
          )}

          {/* Error Alert */}
          {!isSearchLoading && searchError && (
            <Alert variant="error" title="خطا در بازیابی نتایج جستجو">
              <span>{searchError.message || "خطا در برقراری ارتباط با سرویس جستجوی بالینی."}</span>
              <button
                type="button"
                onClick={() => void refetchSearch()}
                className="mt-2 text-xs font-semibold underline block"
              >
                تلاش مجدد
              </button>
            </Alert>
          )}

          {/* Empty State */}
          {!isSearchLoading && !searchError && searchResults.length === 0 && (
            <EmptyState
              icon={<Search className="w-6 h-6 text-[#008080]" />}
              title={`هیچ موجودیتی برای «${activeSearchTerm}» یافت نشد`}
              description="املا را بررسی کنید، از کلمات کلیدی عام‌تر استفاده نمایید یا فیلتر رکن دیگری را انتخاب کنید."
              action={
                <Button variant="outline" size="sm" onClick={handleClearSearch}>
                  مشاهده تمام ارکان بالینی
                </Button>
              }
            />
          )}

          {/* Results Grid */}
          {!isSearchLoading && !searchError && searchResults.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((item) => (
                  <PocketSearchResultCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    searchQuery={activeSearchTerm}
                  />
                ))}
              </div>
              {activeSearchTerm && (
                <div className="mt-6 flex justify-center">
                  <Link
                    to={`/pocket/explorer?q=${encodeURIComponent(activeSearchTerm)}${selectedType !== "all" ? `&type=${selectedType}` : ""}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] bg-[#008080] text-white hover:bg-[#006666] font-semibold text-sm transition-colors shadow-sm"
                    data-testid="explorer-footer-link"
                  >
                    <span>مشاهده تمام نتایج و صفحه‌بندی کامل در کاوشگر بالینی</span>
                    <ArrowLeft className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Dynamic Area 2: Default Hub View (Rendered when no search is active) */}
      {!hasSearchIntent && (
        <>
          {/* Four Clinical Pillars */}
          <section className="mb-10" aria-label="ارکان چهارگانه بالینی">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                ارکان چهارگانه بالینی
              </h2>
              <Link
                to="/pocket/explorer"
                className="text-xs font-semibold text-[#008080] hover:underline flex items-center gap-1"
              >
                <span>مرورگر بالینی</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.type}
                    className={`p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] ${pillar.borderClass} transition-all shadow-xs flex flex-col justify-between`}
                  >
                    <div>
                      <div className={`w-12 h-12 rounded-[14px] ${pillar.bgClass} ${pillar.colorClass} flex items-center justify-center mb-4`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                        {pillar.title}
                      </h3>
                      <p className="text-xs font-mono text-[var(--color-text-muted)] mb-2">
                        {pillar.enTitle}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedType(pillar.type);
                          searchInputRef.current?.focus();
                        }}
                        className="text-xs font-semibold text-[#008080] hover:underline inline-flex items-center gap-1"
                      >
                        <span>جستجو در {pillar.title}</span>
                        <ArrowLeft className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLookupType(pillar.type);
                          const inputEl = document.getElementById("lookup-id-input");
                          inputEl?.focus();
                        }}
                        className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        title="استعلام با UUID"
                      >
                        ورود شناسه
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Direct Identifier Lookup Widget */}
          <section className="mb-10" aria-label="استعلام مستقیم رفرنس بالینی">
            <Card className="p-6 md:p-8 rounded-[20px] bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border border-[var(--color-border)] shadow-xs">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-2 text-[#008080] font-bold text-xs">
                  <Search className="w-4 h-4" />
                  <span>استعلام مستقیم سند بالینی</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
                  جستجو با شناسه یکتای مرجع (Direct Identifier Lookup)
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mb-6">
                  جهت فراخوانی ادعاهای علمی تاییدشده و پایش نسخه اگریگیت، شناسه یکتای موجودیت بالینی (UUID) را وارد نمایید.
                </p>

                <form onSubmit={handleDirectLookup} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="w-full sm:w-44 shrink-0">
                    <select
                      value={lookupType}
                      onChange={(e) => setLookupType(e.target.value as ClinicalAggregateType)}
                      className="w-full h-11 px-3 py-2 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#008080]"
                      aria-label="نوع موجودیت بالینی"
                    >
                      <option value="drug">دارو (Drug)</option>
                      <option value="disease">بیماری (Disease)</option>
                      <option value="treatment">درمان (Treatment)</option>
                      <option value="emergency">اورژانس (Emergency)</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <Input
                      id="lookup-id-input"
                      type="text"
                      placeholder="مثال: c8b0a514-4fb9-4f80-b747-91f1a5ff6818"
                      value={lookupId}
                      onChange={(e) => {
                        setLookupId(e.target.value);
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
                    مشاهده اطلاعات
                  </Button>
                </form>

                {lookupError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium">
                    {lookupError}
                  </p>
                )}
              </div>
            </Card>
          </section>

          {/* Governance & Architecture Notice */}
          <section className="p-5 rounded-[16px] bg-slate-50 dark:bg-slate-900/40 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#008080] shrink-0" />
              <span>
                سیستم مصرف بالینی AVANA Pocket به پروتکل کش هوشمند ETag (RFC 7232) و یکپارچگی نسخه‌بندی یکنواخت (Monotonic Versioning) مجهز است.
              </span>
            </div>
            <Link to="/pocket/explorer" className="text-[#008080] font-semibold hover:underline">
              مشاهده کاوشگر بالینی &larr;
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
