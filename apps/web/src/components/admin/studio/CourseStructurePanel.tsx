import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Layers,
  Sparkles,
  HelpCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  X,
  Flag,
  Plus,
  FolderPlus,
  Folder,
  ArrowUp,
  ArrowDown,
  Edit3,
  Trash2,
  MoveVertical,
  Check,
} from "lucide-react";
import {
  api,
  type AdminCourseHierarchy,
  type AdminCourseHierarchyGroup,
  type AdminCourseHierarchyModule,
  type AdminCourseHierarchyLesson,
} from "../../../lib/api/admin.js";
import { useAdmin } from "../../../hooks/useAdmin.js";
import { toPersianDigits } from "@avana/domain";

export interface CourseStructurePanelProps {
  courseId: string;
}

export function CourseStructurePanel({ courseId }: CourseStructurePanelProps) {
  const adminApi = useAdmin();
  const queryClient = useQueryClient();

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [previewLesson, setPreviewLesson] = useState<AdminCourseHierarchyLesson | null>(null);

  // Group modal & inline states
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [editingGroup, setEditingGroup] = useState<AdminCourseHierarchyGroup | null>(null);
  const [editGroupTitle, setEditGroupTitle] = useState("");
  const [deletingGroup, setDeletingGroup] = useState<AdminCourseHierarchyGroup | null>(null);

  // Notification / message banner
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Reset expanded modules when switching courses
  useEffect(() => {
    setExpandedModules(new Set());
  }, [courseId]);

  const hierarchyQuery = useQuery({
    queryKey: ["course-hierarchy", courseId],
    queryFn: async () => {
      return adminApi.getCourseHierarchy(courseId);
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["admin", "content-reports", { courseId }],
    queryFn: () => adminApi.listContentReports({ courseId, pageSize: 100 }),
  });

  const reportsByLessonId = useMemo(() => {
    const map = new Map<string, number>();
    const items = reportsQuery.data?.items ?? [];
    for (const r of items) {
      if (r.lessonId) {
        map.set(r.lessonId, (map.get(r.lessonId) || 0) + 1);
      }
    }
    return map;
  }, [reportsQuery.data]);

  const hierarchy = hierarchyQuery.data;
  const groups = useMemo(() => {
    const rawGroups = hierarchy?.groups ?? [];
    return [...rawGroups].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [hierarchy?.groups]);

  const allModules = useMemo(() => {
    const rawModules = hierarchy?.modules ?? [];
    return [...rawModules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [hierarchy?.modules]);

  // Invalidate queries helper
  const invalidateHierarchy = () => {
    void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", courseId] });
    void queryClient.invalidateQueries({ queryKey: ["course-learning", courseId] });
  };

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: (title: string) => adminApi.createSubCourseGroup(courseId, { title }),
    onSuccess: () => {
      setIsCreateGroupOpen(false);
      setNewGroupTitle("");
      setActionMessage({ type: "success", text: "گروه سرفصل با موفقیت ایجاد شد." });
      invalidateHierarchy();
    },
    onError: (err: Error) => {
      setActionMessage({ type: "error", text: err.message || "خطا در ایجاد گروه" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ groupId, title }: { groupId: string; title: string }) =>
      adminApi.updateSubCourseGroup(courseId, groupId, { title }),
    onSuccess: () => {
      setEditingGroup(null);
      setEditGroupTitle("");
      setActionMessage({ type: "success", text: "نام گروه سرفصل با موفقیت ویرایش شد." });
      invalidateHierarchy();
    },
    onError: (err: Error) => {
      setActionMessage({ type: "error", text: err.message || "خطا در ویرایش گروه" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => adminApi.deleteSubCourseGroup(courseId, groupId),
    onSuccess: () => {
      setDeletingGroup(null);
      setActionMessage({ type: "success", text: "گروه حذف شد. فصل‌های آن به بخش بدون دسته‌بندی منتقل شدند." });
      invalidateHierarchy();
    },
    onError: (err: Error) => {
      setActionMessage({ type: "error", text: err.message || "خطا در حذف گروه" });
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: (groupIds: string[]) => adminApi.reorderSubCourseGroups(courseId, groupIds),
    onSuccess: () => {
      invalidateHierarchy();
    },
    onError: (err: Error) => {
      setActionMessage({ type: "error", text: err.message || "خطا در مرتب‌سازی گروه‌ها" });
    },
  });

  const reorderModulesMutation = useMutation({
    mutationFn: (items: Array<{ id: string; sortOrder: number; subCourseGroupId?: string | null }>) =>
      adminApi.reorderCourseModules(courseId, items),
    onSuccess: () => {
      invalidateHierarchy();
    },
    onError: (err: Error) => {
      setActionMessage({ type: "error", text: err.message || "خطا در مرتب‌سازی فصل‌ها" });
    },
  });

  const toggleModule = (modId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  // Reorder Group Up/Down
  const handleMoveGroup = (groupIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? groupIndex - 1 : groupIndex + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) return;

    const newGroups = [...groups];
    const [moved] = newGroups.splice(groupIndex, 1);
    newGroups.splice(targetIndex, 0, moved);

    const groupIds = newGroups.map((g) => g.id);
    reorderGroupsMutation.mutate(groupIds);
  };

  // Move Module Up/Down within the global module list
  const handleMoveModule = (moduleIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? moduleIndex - 1 : moduleIndex + 1;
    if (targetIndex < 0 || targetIndex >= allModules.length) return;

    const newModules = [...allModules];
    const [moved] = newModules.splice(moduleIndex, 1);
    newModules.splice(targetIndex, 0, moved);

    const items = newModules.map((m, idx) => ({
      id: m.id,
      sortOrder: idx,
      subCourseGroupId: m.subCourseGroupId ?? null,
    }));
    reorderModulesMutation.mutate(items);
  };

  // Change Module's SubCourseGroup
  const handleAssignModuleGroup = (moduleId: string, newGroupId: string | null) => {
    const items = allModules.map((m) => ({
      id: m.id,
      sortOrder: m.sortOrder ?? 0,
      subCourseGroupId: m.id === moduleId ? newGroupId : (m.subCourseGroupId ?? null),
    }));
    reorderModulesMutation.mutate(items);
  };

  // Partition modules into grouped and ungrouped
  const groupMap = useMemo(() => {
    const map = new Map<string, AdminCourseHierarchyModule[]>();
    for (const g of groups) {
      map.set(g.id, []);
    }
    const ungrouped: AdminCourseHierarchyModule[] = [];

    for (const m of allModules) {
      if (m.subCourseGroupId && map.has(m.subCourseGroupId)) {
        map.get(m.subCourseGroupId)!.push(m);
      } else {
        ungrouped.push(m);
      }
    }
    return { map, ungrouped };
  }, [groups, allModules]);

  const isMutating =
    createGroupMutation.isPending ||
    updateGroupMutation.isPending ||
    deleteGroupMutation.isPending ||
    reorderGroupsMutation.isPending ||
    reorderModulesMutation.isPending;

  function renderModuleCard(mod: AdminCourseHierarchyModule, globalIndex: number) {
    const isExpanded = expandedModules.has(mod.id);
    return (
      <div
        key={mod.id}
        className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden transition-all shadow-xs"
      >
        {/* Module Bar */}
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-[var(--color-surface-warm)]/40 transition-colors">
          <button
            type="button"
            onClick={() => toggleModule(mod.id)}
            aria-expanded={isExpanded}
            className="flex items-center gap-3 min-w-0 flex-1 text-right cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] flex items-center justify-center font-bold text-xs shrink-0">
              {toPersianDigits(globalIndex + 1)}
            </div>
            <div className="min-w-0 flex-1">
              <h5 className="font-bold text-xs sm:text-sm text-[var(--color-text)] truncate">
                {mod.title}
              </h5>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                {toPersianDigits(mod.lessons.length)} درسنامه
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 shrink-0 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Module Actions: Reorder & Group Assignment Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Group Selector */}
            {groups.length > 0 && (
              <select
                value={mod.subCourseGroupId || ""}
                disabled={isMutating}
                onChange={(e) => {
                  const val = e.target.value;
                  handleAssignModuleGroup(mod.id, val ? val : null);
                }}
                className="text-[11px] bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] rounded-lg px-2 py-1 outline-none font-semibold focus:border-[var(--color-primary-default)] transition-colors cursor-pointer"
                title="تغییر گروه سرفصل"
              >
                <option value="">بدون گروه</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}

            {/* Move Up/Down buttons */}
            <button
              type="button"
              disabled={globalIndex === 0 || isMutating}
              onClick={() => handleMoveModule(globalIndex, "up")}
              title="انتقال فصل به بالا"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={globalIndex === allModules.length - 1 || isMutating}
              onClick={() => handleMoveModule(globalIndex, "down")}
              title="انتقال فصل به پایین"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Lessons in Module */}
        {isExpanded && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 divide-y divide-[var(--color-border)]">
            {mod.lessons.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                درسی در این فصل وجود ندارد.
              </div>
            ) : (
              mod.lessons.map((lesson, lIdx) => (
                <div
                  key={lesson.id}
                  className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-[var(--color-surface-warm)]/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-5 h-5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center justify-center text-[10px] font-bold shrink-0">
                      {toPersianDigits(lIdx + 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-[var(--color-text)] truncate">
                        {lesson.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-muted)] mt-0.5">
                        <span>
                          وضعیت:{" "}
                          <span className="text-[var(--color-text)] font-semibold">
                            {lesson.publicationStatus === "published"
                              ? "منتشر شده"
                              : "پیش‌نویس"}
                          </span>
                        </span>
                        <span>•</span>
                        <span>
                          {lesson.hasContent ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              ✓ دارای متن درس
                            </span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">بدون متن</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Badges & View Content */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {reportsByLessonId.has(lesson.id) && (
                      <Link
                        to={`/admin/courses/${courseId}?tab=reports`}
                        className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-500/20 transition-colors"
                        title="مشاهده گزارش‌های این درس در برگه گزارش‌ها"
                      >
                        <Flag className="w-3 h-3 text-rose-500" />
                        <span>{toPersianDigits(reportsByLessonId.get(lesson.id)!)} گزارش</span>
                      </Link>
                    )}

                    {lesson.flashcardCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-700 dark:text-teal-300 text-[10px] font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                        <span>{toPersianDigits(lesson.flashcardCount)} کارت</span>
                      </span>
                    )}

                    {lesson.quizCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1">
                        <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>{toPersianDigits(lesson.quizCount)} سؤال</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setPreviewLesson(lesson)}
                      className="px-2.5 py-1 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors cursor-pointer"
                    >
                      مشاهده
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--color-primary-default)]" />
              <span>ساختار و مدیریت سرفصل‌های دوره (Course Builder)</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              مدیریت ترتیب ماژول‌ها و دسته‌بندی سرفصل‌های دوره (Sub-Courses). حذف گروه هرگز فصل‌ها را حذف نمی‌کند.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1 rounded-full border border-[var(--color-border)]">
              {toPersianDigits(allModules.length)} فصل مصوب
            </span>
            <span className="text-xs font-semibold text-[var(--color-primary-default)] bg-[var(--color-primary-default)]/10 px-3 py-1 rounded-full border border-[var(--color-primary-default)]/20">
              {toPersianDigits(groups.length)} گروه
            </span>
            <button
              type="button"
              onClick={() => {
                setNewGroupTitle("");
                setIsCreateGroupOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--color-primary-default)] hover:opacity-90 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <FolderPlus className="w-4 h-4" />
              <span>ایجاد سرفصل / گروه جدید</span>
            </button>
          </div>
        </div>

        {/* Action message banner */}
        {actionMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              actionMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400"
            }`}
          >
            {actionMessage.type === "success" ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}
      </div>

      {/* Loading state */}
      {hierarchyQuery.isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-default)]" />
          <p className="text-xs">در حال بارگذاری ساختار دوره...</p>
        </div>
      )}

      {/* Error state */}
      {hierarchyQuery.isError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{hierarchyQuery.error?.message || "خطا در دریافت ساختار دوره"}</span>
        </div>
      )}

      {/* Empty State */}
      {!hierarchyQuery.isLoading && allModules.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-[var(--color-text-muted)] opacity-60 mx-auto" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">
            هنوز فصلی برای این دوره ثبت نهایی نشده است
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto">
            پیش‌نویس‌های تولیدشده توسط هوش مصنوعی ابتدا در برگه «پیش‌نویس‌ها و بازبینی» بررسی می‌شوند و پس از «تایید رسمی دوره»، ساختار آموزشی در این بخش مستقر خواهد شد.
          </p>
        </div>
      )}

      {/* Content Groups & Modules */}
      {!hierarchyQuery.isLoading && (groups.length > 0 || allModules.length > 0) && (
        <div className="space-y-6">
          {/* Defined Sub-Course Groups */}
          {groups.map((group, groupIdx) => {
            const groupModules = groupMap.map.get(group.id) || [];
            return (
              <div
                key={group.id}
                className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-primary-default)]/20 overflow-hidden shadow-xs space-y-3 p-4 sm:p-5"
              >
                {/* Group Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[var(--color-primary-default)]/15 border border-[var(--color-primary-default)]/30 text-[var(--color-primary-default)] flex items-center justify-center font-bold text-xs">
                      {toPersianDigits(groupIdx + 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-[var(--color-primary-default)]" />
                        <h4 className="font-bold text-sm text-[var(--color-text)]">
                          {group.title}
                        </h4>
                        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)]">
                          {toPersianDigits(groupModules.length)} فصل
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Group Reorder & Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={groupIdx === 0 || isMutating}
                      onClick={() => handleMoveGroup(groupIdx, "up")}
                      title="انتقال گروه به بالا"
                      className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={groupIdx === groups.length - 1 || isMutating}
                      onClick={() => handleMoveGroup(groupIdx, "down")}
                      title="انتقال گروه به پایین"
                      className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(group);
                        setEditGroupTitle(group.title);
                      }}
                      title="ویرایش نام گروه"
                      className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingGroup(group)}
                      title="حذف گروه"
                      className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Modules inside this Group */}
                {groupModules.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/40 rounded-xl border border-dashed border-[var(--color-border)]">
                    هنوز فصلی به این گروه اختصاص داده نشده است. می‌توانید از بخش فصل‌های عمومی، فصل‌ها را به این گروه منتقل کنید.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {groupModules.map((mod) => {
                      const globalIdx = allModules.findIndex((m) => m.id === mod.id);
                      return renderModuleCard(mod, globalIdx);
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped Modules Section */}
          {groupMap.ungrouped.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-xs space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <h4 className="font-bold text-sm text-[var(--color-text)]">
                    {groups.length > 0 ? "فصل‌های عمومی (بدون دسته‌بندی)" : "فصل‌های دوره"}
                  </h4>
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)]">
                    {toPersianDigits(groupMap.ungrouped.length)} فصل
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                {groupMap.ungrouped.map((mod) => {
                  const globalIdx = allModules.findIndex((m) => m.id === mod.id);
                  return renderModuleCard(mod, globalIdx);
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Group */}
      {isCreateGroupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h4 className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>ایجاد گروه سرفصل جدید</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text)]">
                عنوان گروه / سرفصل (مانند: بخش اول - مبانی و تعاریف)
              </label>
              <input
                type="text"
                autoFocus
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                placeholder="عنوان گروه را وارد کنید..."
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl outline-none focus:border-[var(--color-primary-default)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!newGroupTitle.trim() || createGroupMutation.isPending}
                onClick={() => createGroupMutation.mutate(newGroupTitle.trim())}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary-default)] hover:opacity-90 text-white text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {createGroupMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ایجاد گروه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Group */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h4 className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>ویرایش عنوان گروه سرفصل</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text)]">
                عنوان گروه
              </label>
              <input
                type="text"
                autoFocus
                value={editGroupTitle}
                onChange={(e) => setEditGroupTitle(e.target.value)}
                placeholder="عنوان گروه..."
                className="w-full px-3 py-2 text-xs bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl outline-none focus:border-[var(--color-primary-default)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!editGroupTitle.trim() || updateGroupMutation.isPending}
                onClick={() =>
                  updateGroupMutation.mutate({
                    groupId: editingGroup.id,
                    title: editGroupTitle.trim(),
                  })
                }
                className="px-4 py-2 rounded-xl bg-[var(--color-primary-default)] hover:opacity-90 text-white text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {updateGroupMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Group Confirmation */}
      {deletingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h4 className="font-bold text-base text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>حذف گروه سرفصل</span>
              </h4>
              <button
                type="button"
                onClick={() => setDeletingGroup(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text)] leading-relaxed">
                آیا از حذف گروه <strong className="font-bold">«{deletingGroup.title}»</strong> اطمینان دارید؟
              </p>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                💡 <strong>توجه:</strong> فصل‌ها و درسنامه‌های این گروه به هیچ وجه حذف نخواهند شد و به بخش بدون دسته‌بندی منتقل می‌شوند.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setDeletingGroup(null)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={deleteGroupMutation.isPending}
                onClick={() => deleteGroupMutation.mutate(deletingGroup.id)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {deleteGroupMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حذف گروه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Details Preview Modal */}
      {previewLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
              <div>
                <h3 className="font-bold text-lg text-[var(--color-text)]">{previewLesson.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  شناسه درس: {previewLesson.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {reportsByLessonId.has(previewLesson.id) && (
                  <Link
                    to={`/admin/courses/${courseId}?tab=reports`}
                    className="px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5 hover:bg-rose-500/20 transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5 text-rose-500" />
                    <span>{toPersianDigits(reportsByLessonId.get(previewLesson.id)!)} گزارش مشکل ثبت‌شده — مشاهده در برگه گزارش‌ها</span>
                  </Link>
                )}
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  فلش‌کارت‌های مرتبط: {toPersianDigits(previewLesson.flashcardCount)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  سؤالات تستی مرتبط: {toPersianDigits(previewLesson.quizCount)}
                </span>
                <span className="px-3 py-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
                  وضعیت محتوا: {previewLesson.hasContent ? "تکمیل شده" : "فاقد متن"}
                </span>
              </div>

              <div className="p-4 bg-[var(--color-surface-warm)]/50 rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text)] max-h-80 overflow-y-auto">
                <p className="text-[var(--color-text-muted)]">
                  درسنامه با موفقیت در ساختار رسمی دوره مستقر شده است و تمامی ارجاعات کارت‌ها و آزمون‌ها به این شناسه نگاشت شده‌اند.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setPreviewLesson(null)}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] text-xs font-bold transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
