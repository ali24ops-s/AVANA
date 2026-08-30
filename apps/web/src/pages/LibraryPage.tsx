/**
 * Public Content Library Page.
 *
 * Route: `/library`
 *
 * Architecture & Data Flow:
 * - Public Content Packs: Published 4-asset content packs (GET /v1/library/packs)
 * - Unified Search, Subject filters, and Sorting
 * - Detail Modal & Add to Course Modal
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  X,
  Filter,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Library as LibraryIcon,
  Layers,
} from "lucide-react";
import { useLibraryPacks } from "../hooks/useLibrary.js";
import { ContentPackCard } from "../components/library/ContentPackCard.js";
import { PackDetailModal } from "../components/library/PackDetailModal.js";
import { AddToCourseModal } from "../components/library/AddToCourseModal.js";
import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
} from "@avana/domain";

const PRESET_SUBJECTS = [
  { id: "all", label: "همه موضوعات" },
  { id: "داروسازی", label: "داروسازی" },
  { id: "فیزیولوژی", label: "فیزیولوژی" },
  { id: "فارماکولوژی", label: "فارماکولوژی" },
  { id: "شیمی دارویی", label: "شیمی دارویی" },
  { id: "فارماسیوتیکس", label: "فارماسیوتیکس" },
  { id: "سم شناسی", label: "سم‌شناسی" },
  { id: "بافت شناسی", label: "بافت‌شناسی" },
  { id: "بیولوژی", label: "بیولوژی" },
  { id: "میکروبیولوژی", label: "میکروبیولوژی" },
  { id: "گیاهان دارویی", label: "گیاهان دارویی" },
  { id: "انگل‌شناسی", label: "انگل‌شناسی" },
  { id: "آناتومی", label: "آناتومی" },
  { id: "بیوشیمی", label: "بیوشیمی" },
  { id: "پزشکی عمومی", label: "پزشکی عمومی" },
];

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const urlPackId = searchParams.get("packId");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedSort, setSelectedSort] = useState<"popular" | "newest">("popular");
  const [currentPage, setCurrentPage] = useState(1);

  // Selected pack for Detail Modal
  const [detailPackId, setDetailPackId] = useState<string | null>(urlPackId || null);
  const [isDetailOpen, setIsDetailOpen] = useState(Boolean(urlPackId));

  useEffect(() => {
    if (urlPackId) {
      setDetailPackId(urlPackId);
      setIsDetailOpen(true);
    }
  }, [urlPackId]);

  // Selected pack for Add-to-Course Modal
  const [targetPack, setTargetPack] = useState<
    PublicContentPackItemSummary | PublicContentPackDetailResource | null
  >(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Query published content packs (GET /v1/library/packs)
  const packsQuery = useLibraryPacks({
    q: debouncedQuery || undefined,
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: 12,
  });

  // Reset page when subject or sort changes
  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubject(subjectId);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: "popular" | "newest") => {
    setSelectedSort(sort);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setCurrentPage(1);
  };

  const packs = packsQuery.data?.items ?? [];
  const pagination = packsQuery.data?.pagination ?? {
    page: 1,
    limit: 12,
    total_count: 0,
    total_pages: 1,
  };

  const isSearchActive = Boolean(debouncedQuery) || selectedSubject !== "all";

  const handleViewDetails = (pack: PublicContentPackItemSummary) => {
    setDetailPackId(pack.id);
    setIsDetailOpen(true);
  };

  const handleAddToCourse = (
    pack: PublicContentPackItemSummary | PublicContentPackDetailResource,
  ) => {
    setTargetPack(pack);
    setIsAddOpen(true);
  };

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4" dir="rtl">
      {/* 1. Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-teal-950/60 via-slate-900/80 to-slate-900 border border-teal-500/20 p-6 sm:p-10 shadow-ambient">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 text-xs font-bold">
            <LibraryIcon className="w-3.5 h-3.5" />
            <span>کتابخانه عمومی محتوای آموزشی آوانا</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            کتابخانه آوانا
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            مطالب آموزشی آماده را پیدا کن و به دوره خودت اضافه کن. مجموعه‌های جامع شامل درسنامه ساختاریافته، فلش‌کارت مرور، آزمون ارزیابی و خلاصه نکات کلیدی.
          </p>
        </div>

        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* 2. Search, Filter & Sort Toolbar */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="جستجو در عنوان، موضوع یا محتوای بسته‌ها..."
              className="w-full pl-10 pr-10 py-3 rounded-2xl border border-white/10 bg-slate-900/80 text-slate-200 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-full hover:bg-white/10"
                aria-label="پاک کردن جستجو"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Switcher (محبوب‌ترین / جدیدترین) */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-white/10 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => handleSortChange("popular")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedSort === "popular"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-900/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>محبوب‌ترین</span>
            </button>

            <button
              type="button"
              onClick={() => handleSortChange("newest")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedSort === "newest"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-900/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>جدیدترین</span>
            </button>
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Filter className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          {PRESET_SUBJECTS.map((sub) => {
            const isSelected = selectedSubject === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSubjectChange(sub.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  isSelected
                    ? "bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm"
                    : "bg-white/[0.03] text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Section: بسته‌های محتوای آموزشی آماده (Public Content Packs) */}
      <section className="space-y-4 pt-2" data-testid="public-content-packs-section">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>بسته‌های محتوای آموزشی آماده</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            بسته‌های آموزشی تاییدشده برای اضافه کردن مستقیم به دوره‌های شخصی
          </p>
        </div>

        {/* Loading State */}
        {packsQuery.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-72 rounded-2xl bg-slate-900/40 border border-white/5 p-5 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-24 bg-white/10 rounded-full" />
                    <div className="h-4 w-16 bg-white/5 rounded-full" />
                  </div>
                  <div className="h-6 w-3/4 bg-white/10 rounded-xl" />
                  <div className="h-4 w-full bg-white/5 rounded" />
                  <div className="h-4 w-2/3 bg-white/5 rounded" />
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-8 bg-white/5 rounded-xl" />
                    <div className="h-8 bg-white/5 rounded-xl" />
                  </div>
                  <div className="h-10 bg-white/10 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {packsQuery.isError && (
          <div className="p-8 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center space-y-4 max-w-lg mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-base font-bold text-white">
              خطا در دریافت بسته‌های کتابخانه
            </h3>
            <p className="text-xs text-slate-400">
              {packsQuery.error?.message || "امکان برقراری ارتباط با سرور وجود ندارد."}
            </p>
            <button
              type="button"
              onClick={() => void packsQuery.refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد</span>
            </button>
          </div>
        )}

        {/* Empty States */}
        {!packsQuery.isLoading && !packsQuery.isError && packs.length === 0 && (
          <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-white/10 space-y-4 max-w-md mx-auto shadow-ambient">
            <LibraryIcon className="w-12 h-12 text-teal-400/60 mx-auto" />
            {isSearchActive ? (
              <>
                <h3 className="text-base font-bold text-white">
                  محتوایی با این عبارت پیدا نشد.
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  عبارت دیگری را امتحان کن یا فیلترهای موضوعی را پاک کن.
                </p>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
                >
                  پاک کردن جستجو و فیلترها
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-white">
                  هنوز محتوایی در کتابخانه منتشر نشده است.
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  به زودی بسته‌های آموزشی برگزیده توسط دانشجویان و اساتید در این بخش قرار می‌گیرد.
                </p>
              </>
            )}
          </div>
        )}

        {/* Content Pack Grid */}
        {!packsQuery.isLoading && !packsQuery.isError && packs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {packs.map((pack) => (
              <ContentPackCard
                key={pack.id}
                pack={pack}
                onViewDetails={handleViewDetails}
                onAddToCourse={handleAddToCourse}
              />
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {!packsQuery.isLoading && !packsQuery.isError && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-6 border-t border-white/10">
            <div className="text-xs text-slate-400">
              نمایش صفحه {pagination.page} از {pagination.total_pages} (مجموع{" "}
              {pagination.total_count} بسته)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || packsQuery.isFetching}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                <span>صفحه قبل</span>
              </button>

              <span className="px-3 py-1 text-xs font-bold text-teal-400 bg-teal-500/10 border border-teal-500/30 rounded-xl">
                {currentPage}
              </span>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(pagination.total_pages, p + 1))
                }
                disabled={currentPage >= pagination.total_pages || packsQuery.isFetching}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                <span>صفحه بعد</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 4. Pack Detail Preview Modal */}
      <PackDetailModal
        packId={detailPackId}
        open={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailPackId(null);
        }}
        onAddToCourse={(pack) => {
          setIsDetailOpen(false);
          handleAddToCourse(pack);
        }}
      />

      {/* 5. Add To Course Selection Modal */}
      <AddToCourseModal
        pack={targetPack}
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setTargetPack(null);
        }}
      />
    </div>
  );
}
