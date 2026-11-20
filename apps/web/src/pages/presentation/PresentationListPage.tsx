import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Presentation,
  Plus,
  Clock,
  Layers,
  GraduationCap,
  Calendar,
  Sparkles,
  ChevronLeft,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  EmptyState,
  LoadingState,
  Alert,
  Skeleton,
} from "../../components/ui/index.js";
import { usePresentationProjects } from "../../hooks/usePresentation.js";
import { CreatePresentationModal } from "../../components/presentation/CreatePresentationModal.js";
import {
  toPersianDigits,
  formatPersianDate,
  PROJECT_STATUS_LABELS,
  ACADEMIC_LEVEL_LABELS,
} from "../../components/presentation/presentation-utils.js";

export function PresentationListPage() {
  const { data, isLoading, isError, error, refetch } = usePresentationProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const projects = data?.items || [];

  return (
    <div className="min-h-screen bg-[#F7F9FA] text-[var(--color-text)] py-8 px-4 sm:px-6 lg:px-8 font-sans" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0 shadow-xs">
              <Presentation className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                دستیار ارائه
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                ارائه‌های علمی و آموزشی خود را با کمک هوش مصنوعی بسازید.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 text-xs sm:text-sm font-bold shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            ساخت ارائه جدید
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <Skeleton width="60%" height={20} />
                  <Skeleton width="20%" height={20} />
                </div>
                <Skeleton width="100%" height={40} />
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <Skeleton width="30%" height={16} />
                  <Skeleton width="30%" height={16} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="max-w-md mx-auto text-center p-8 bg-white rounded-2xl border border-red-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              خطا در بارگذاری پروژه‌های ارائه
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {error instanceof Error ? error.message : "امکان برقراری ارتباط با سرور وجود ندارد."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تلاش مجدد
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && projects.length === 0 && (
          <div className="max-w-lg mx-auto py-12 px-6 bg-white rounded-3xl border border-dashed border-slate-200 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-[#008080]/10 text-[#008080] flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800">
                هنوز ارائه‌ای نساخته‌اید
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                با مشخص کردن موضوع و اضافه کردن منابع علمی، اسلایدهای ساختاریافته خود را با هوش مصنوعی و اعتبارسنجی دقیق استنادها ایجاد کنید.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => setIsCreateOpen(true)}
              className="gap-2 text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              ساخت اولین ارائه
            </Button>
          </div>
        )}

        {/* Projects Grid */}
        {!isLoading && !isError && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => {
              const statusConfig =
                PROJECT_STATUS_LABELS[project.status] || {
                  label: project.status,
                  variant: "neutral" as const,
                };

              return (
                <Link
                  key={project.id}
                  to={`/presentations/${project.id}`}
                  className="group block p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-[#008080]/50 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-800 group-hover:text-[#008080] transition-colors line-clamp-2 leading-relaxed">
                        {project.title}
                      </h3>
                      <Badge variant={statusConfig.variant} size="sm" className="shrink-0 text-[10px]">
                        {statusConfig.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-medium">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {toPersianDigits(project.total_slides)} اسلاید
                      </span>

                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {toPersianDigits(project.target_duration_minutes)} دقیقه
                      </span>

                      <span className="flex items-center gap-1 font-medium">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                        {ACADEMIC_LEVEL_LABELS[project.academic_level] || project.academic_level}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {formatPersianDate(project.updated_at)}
                    </span>

                    <span className="flex items-center gap-0.5 text-[#008080] font-bold group-hover:translate-x-[-2px] transition-transform">
                      <span>ورود به محیط کار</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <CreatePresentationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}
