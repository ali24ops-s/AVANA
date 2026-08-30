/**
 * AddToCourseModal Component.
 *
 * Handles adding a published Content Pack from Public Library into a target course.
 * Includes course selection, loading feedback (no fake LLM status),
 * success state with breakdown of materialized items, already_installed handling,
 * and friendly Persian error messages.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Info,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createOrganizationApi } from "../../lib/api/organizations.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { useAddContentPack } from "../../hooks/useLibrary.js";
import { ApiError } from "../../lib/api/errors.js";
import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
} from "@avana/domain";
import type { AddPackToCourseResponse } from "../../lib/api/library.js";
import type { CourseResource } from "@avana/contracts";

export interface AddToCourseModalProps {
  pack: PublicContentPackItemSummary | PublicContentPackDetailResource | null;
  open: boolean;
  onClose: () => void;
  onNavigateToCourse?: (courseId: string) => void;
}

export function AddToCourseModal({
  pack,
  open,
  onClose,
  onNavigateToCourse,
}: AddToCourseModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, memberships } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [result, setResult] = useState<AddPackToCourseResponse | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const addPackMutation = useAddContentPack();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);

  // Fetch active organization
  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
    enabled: open && isAuthenticated,
  });

  const organizationId =
    orgQuery.data?.items?.[0]?.id || memberships?.[0]?.organization_id;

  // Fetch user's courses in the organization
  const coursesQuery = useQuery({
    queryKey: ["my-courses", organizationId],
    queryFn: () => courseApi.listMyCourses(organizationId!),
    enabled: Boolean(open && organizationId),
  });

  const courses: CourseResource[] = coursesQuery.data?.items ?? [];

  // Reset modal state upon opening
  useEffect(() => {
    if (open) {
      setResult(null);
      setCustomError(null);
      if (courses.length > 0) {
        setSelectedCourseId(courses[0].id);
      }
      if (typeof document !== "undefined") {
        document.body.style.overflow = "hidden";
      }
    } else {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.overflow = "";
      }
    };
  }, [open, courses.length]);

  // Set default course when courses query completes
  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !addPackMutation.isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, addPackMutation.isPending, onClose]);

  if (!open || !pack) return null;

  const handleAdd = () => {
    if (!selectedCourseId) {
      setCustomError("لطفاً یک دوره آموزشی را برای افزودن محتوا انتخاب کنید.");
      return;
    }
    setCustomError(null);

    addPackMutation.mutate(
      { packId: pack.id, courseId: selectedCourseId },
      {
        onSuccess: (res) => {
          setResult(res);
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            switch (err.code) {
              case "bad_request":
                setCustomError("این بسته کامل نیست و فعلاً قابل افزودن نیست.");
                break;
              case "unauthorized":
                setCustomError("برای افزودن محتوا ابتدا وارد حساب خود شوید.");
                break;
              case "forbidden":
                setCustomError("شما به این دوره آموزشی دسترسی لازم را ندارید.");
                break;
              case "not_found":
                setCustomError("این بسته آموزشی یا دوره انتخاب‌شده دیگر در دسترس نیست.");
                break;
              case "conflict":
                setCustomError("این بسته قبلاً به دوره شما اضافه شده است.");
                break;
              default:
                setCustomError(
                  err.message || "خطایی در افزودن محتوا به دوره رخ داد. لطفاً دوباره تلاش کنید.",
                );
            }
          } else {
            setCustomError("خطایی در برقراری ارتباط با سرور رخ داد.");
          }
        },
      },
    );
  };

  const handleGoToCourse = (courseId: string) => {
    onClose();
    if (onNavigateToCourse) {
      onNavigateToCourse(courseId);
    } else {
      navigate(`/courses/${courseId}`);
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-xl overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-to-course-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !addPackMutation.isPending) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden glass-panel flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-slate-900/80">
          <div className="min-w-0">
            <h2
              id="add-to-course-title"
              className="text-lg font-bold text-white flex items-center gap-2"
            >
              <GraduationCap className="w-5 h-5 text-teal-400" />
              <span>افزودن بسته به دوره آموزشی</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 truncate">
              بسته: <span className="text-slate-200 font-semibold">{pack.title}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* 0. Unauthenticated Guard */}
          {!isAuthenticated ? (
            <div className="p-6 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
              <GraduationCap className="w-10 h-10 text-teal-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">برای افزودن به دوره وارد شوید</h4>
              <p className="text-xs text-slate-400">
                جهت افزودن این بسته آموزشی به دوره‌های خود، لطفاً ابتدا وارد حساب کاربری شوید.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate("/sign-in");
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-900/30 transition-all"
              >
                ورود به حساب کاربری
              </button>
            </div>
          ) : result ? (
            <div className="space-y-4">
              {result.already_installed ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-white mb-1">
                      این بسته قبلاً به این دوره اضافه شده است.
                    </h4>
                    <p className="text-slate-300 leading-relaxed">
                      محتوای آموزشی، جلسات درس، فلش‌کارت‌ها و آزمون‌های این بسته از قبل در دوره «
                      {selectedCourse?.title || "انتخاب‌شده"}» قرار دارند.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-white mb-1">
                      این بسته با موفقیت به دوره شما اضافه شد.
                    </h4>
                    <p className="text-slate-300 leading-relaxed">
                      یک فصل آموزشی جدید با مشخصات زیر به دوره شما افزوده شد:
                    </p>
                    <ul className="mt-2 space-y-1 text-slate-300 font-medium list-disc list-inside">
                      {result.materialized.lessons_created > 0 && (
                        <li>{result.materialized.lessons_created} جلسه درسنامه اختصاصی</li>
                      )}
                      {result.materialized.flashcards_created > 0 && (
                        <li>{result.materialized.flashcards_created} فلش‌کارت در صف مرور هوشمند</li>
                      )}
                      {result.materialized.quiz_questions_created > 0 && (
                        <li>{result.materialized.quiz_questions_created} سوال آزمون تستی آماده</li>
                      )}
                      {result.materialized.review_summary_created && (
                        <li>خلاصه مروری و جمع‌بندی نکات کلیدی</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleGoToCourse(selectedCourseId!)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-900/30 transition-all"
                >
                  <span>رفتن به دوره</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 2. Loading Courses */}
              {coursesQuery.isLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
                  <p className="text-xs text-slate-400">در حال دریافت دوره‌های شما...</p>
                </div>
              )}

              {/* 3. Error Alert */}
              {(customError || coursesQuery.isError) && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {customError || coursesQuery.error?.message || "خطا در دریافت دوره‌ها"}
                  </span>
                </div>
              )}

              {/* 4. No Courses Available */}
              {!coursesQuery.isLoading && courses.length === 0 && (
                <div className="p-6 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                  <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-white">شما هنوز دوره‌ای ندارید</h4>
                  <p className="text-xs text-slate-400">
                    برای افزودن محتوای کتابخانه، ابتدا باید حداقل یک دوره آموزشی در داشبورد خود انتخاب یا ایجاد کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate("/courses");
                    }}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
                  >
                    مدیریت و ایجاد دوره
                  </button>
                </div>
              )}

              {/* 5. Course Selector List */}
              {courses.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-300">
                    دوره مقصد را انتخاب کنید:
                  </label>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {courses.map((course) => {
                      const isSelected = selectedCourseId === course.id;
                      return (
                        <div
                          key={course.id}
                          onClick={() => setSelectedCourseId(course.id)}
                          className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-teal-500/15 border-teal-500/50 text-white shadow-sm"
                              : "bg-white/[0.02] border-white/5 hover:bg-white/5 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? "border-teal-400 bg-teal-500"
                                  : "border-slate-500 bg-transparent"
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-xs font-bold truncate">{course.title}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                موضوع: {course.subject || "عمومی"}
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <span className="text-[10px] font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                              انتخاب‌شده
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {courses.length > 0 && (
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={addPackMutation.isPending}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    انصراف
                  </button>

                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!selectedCourseId || addPackMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 shadow-md shadow-teal-900/30 transition-all"
                  >
                    {addPackMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال افزودن محتوا به دوره شما...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تایید و افزودن به دوره</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
