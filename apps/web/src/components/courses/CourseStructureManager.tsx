import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderPlus,
  Plus,
  Edit2,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Loader2,
  FileUp,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { Button, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { CoursePublishModal } from "./CoursePublishModal.js";
import { GenerateContentModal } from "../documents/GenerateContentModal.js";
import { DocumentUploader } from "../documents/DocumentUploader.js";
import { toPersianDigits } from "@avana/domain";
import type { GeneratedContentType } from "@avana/contracts";

export interface CourseStructureManagerProps {
  organizationId: string;
  courseId: string;
}

export function CourseStructureManager({
  organizationId,
  courseId,
}: CourseStructureManagerProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);
  const docsApi = createDocumentsApi(apiClient);
  const genApi = createGenerationApi(apiClient);

  // States
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState("");

  const [addingModuleChapterId, setAddingModuleChapterId] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDocId, setNewModuleDocId] = useState<string>("");

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState<{ id: string; name: string } | null>(null);
  const [uploadingForModule, setUploadingForModule] = useState<{ chapterId: string | null } | null>(null);

  // Fetch full structure
  const structureQuery = useQuery({
    queryKey: ["course-structure", organizationId, courseId],
    queryFn: () => courseApi.getCourseStructure(organizationId, courseId),
  });

  // Fetch available documents
  const docsQuery = useQuery({
    queryKey: ["org-docs-selection", organizationId],
    queryFn: () => docsApi.listDocuments(organizationId, { limit: 100 }),
  });

  const structure = structureQuery.data;
  const course = structure?.course;
  const chapters = structure?.chapters || [];
  const publication = structure?.publication;

  // Chapter mutations
  const createChapterMutation = useMutation({
    mutationFn: (title: string) =>
      courseApi.createChapter(organizationId, courseId, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
      setNewChapterTitle("");
      setIsAddingChapter(false);
    },
  });

  const updateChapterMutation = useMutation({
    mutationFn: ({ chapterId, title }: { chapterId: string; title: string }) =>
      courseApi.updateChapter(organizationId, courseId, chapterId, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
      setEditingChapterId(null);
    },
  });

  const deleteChapterMutation = useMutation({
    mutationFn: (chapterId: string) =>
      courseApi.deleteChapter(organizationId, courseId, chapterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
    },
  });

  // Module mutations
  const createModuleMutation = useMutation({
    mutationFn: ({
      title,
      subCourseGroupId,
      documentId,
    }: {
      title: string;
      subCourseGroupId?: string | null;
      documentId?: string | null;
    }) =>
      courseApi.createModule(organizationId, courseId, {
        title,
        subCourseGroupId,
        documentId: documentId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
      setAddingModuleChapterId(null);
      setNewModuleTitle("");
      setNewModuleDocId("");
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      courseApi.deleteModule(organizationId, courseId, moduleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: ({
      docId,
      types,
    }: {
      docId: string;
      types: Array<"lesson" | "flashcard" | "quiz" | "review_summary">;
    }) =>
      genApi.triggerGeneration(organizationId, courseId, docId, { types }),
    onSuccess: () => {
      setGeneratingDoc(null);
      void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
    },
  });

  const handleConfirmGenerate = (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
    review_summary: boolean;
  }) => {
    if (!generatingDoc) return;
    const types: Array<"lesson" | "flashcard" | "quiz" | "review_summary"> = [];
    if (selected.lesson) types.push("lesson");
    if (selected.flashcards) types.push("flashcard");
    if (selected.exam) types.push("quiz");
    if (selected.review_summary) types.push("review_summary");

    generateMutation.mutate({ docId: generatingDoc.id, types });
  };

  // Calculate totals for publish readiness
  let totalLessons = 0;
  let totalFlashcards = 0;
  let totalQuizQuestions = 0;
  let hasSummary = false;
  let totalModulesCount = 0;

  for (const ch of chapters) {
    for (const mod of ch.modules) {
      totalModulesCount++;
      totalLessons += mod.lessons?.length || 0;
      if (mod.generatedContents?.lesson?.status === "accepted") {
        totalLessons = Math.max(totalLessons, 1);
      }
      if (mod.generatedContents?.flashcard?.status === "accepted") {
        totalFlashcards += 10;
      }
      if (mod.generatedContents?.quiz?.status === "accepted") {
        totalQuizQuestions += 5;
      }
      if (mod.generatedContents?.reviewSummary?.status === "accepted") {
        hasSummary = true;
      }
    }
  }

  if (structureQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  const isOfficial = Boolean(
    course?.isOfficial || (course as any)?.is_official
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Structure Header & Publication Banner */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold text-[var(--color-text)]">
              {isOfficial
                ? "مدیریت سرفصل‌ها و ساختار آموزشی دوره"
                : "مدیریت ساختار دوره و انتشار در کتابخانه"}
            </h2>
            {isOfficial ? (
              <Badge className="bg-teal-500/10 text-[#008080] border-teal-500/20">
                دوره رسمی آوانا
              </Badge>
            ) : publication?.status === "pending_review" ? (
              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                <Clock className="w-3.5 h-3.5 ml-1" />
                در انتظار بررسی ادمین
              </Badge>
            ) : publication?.status === "published" ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                منتشر شده در کتابخانه
              </Badge>
            ) : publication?.status === "rejected" ? (
              <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                <X className="w-3.5 h-3.5 ml-1" />
                نیاز به بازبینی
              </Badge>
            ) : (
              <Badge className="bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border-[var(--color-border)]">
                پیش‌نویس شخصی
              </Badge>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            فصل‌ها و سرفصل‌های دوره را بسازید، فایل‌ها را متصل کنید و با یک کلیک محتوای هوشمند تولید نمایید.
          </p>
          {!isOfficial && publication?.status === "rejected" && publication.rejectionReason && (
            <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span><strong>علت عدم تأیید ادمین:</strong> {publication.rejectionReason}</span>
            </div>
          )}
        </div>

        {!isOfficial && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={() => setIsPublishModalOpen(true)}
              disabled={publication?.status === "pending_review"}
              className="bg-[#008080] hover:bg-[#006666] text-white shadow-sm font-bold text-xs"
            >
              <Send className="w-4 h-4 ml-1.5" />
              {publication?.status === "published"
                ? "ارسال نسخه به‌روزشده به کتابخانه"
                : publication?.status === "rejected"
                ? "ارسال مجدد برای بررسی"
                : "ارسال دوره برای انتشار در کتابخانه"}
            </Button>
          </div>
        )}
      </div>

      {/* Chapters & Modules Management */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#008080]" />
            فصل‌ها و سرفصل‌های آموزشی
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAddingChapter(true)}
            className="text-xs"
          >
            <FolderPlus className="w-4 h-4 ml-1 text-[#008080]" />
            افزودن فصل جدید
          </Button>
        </div>

        {/* Add Chapter Inline Box */}
        {isAddingChapter && (
          <div className="p-4 bg-[var(--color-surface)] border border-[#008080] rounded-2xl shadow-xs space-y-3">
            <span className="text-xs font-bold text-[var(--color-text)]">عنوان فصل جدید:</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                placeholder="مثلاً: فصل ۱: مبانی و تعاریف پایه"
                className="flex-1 px-3.5 py-2 text-xs bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (newChapterTitle.trim()) {
                    createChapterMutation.mutate(newChapterTitle.trim());
                  }
                }}
                disabled={!newChapterTitle.trim() || createChapterMutation.isPending}
                className="bg-[#008080] text-white"
              >
                ذخیره فصل
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAddingChapter(false);
                  setNewChapterTitle("");
                }}
              >
                انصراف
              </Button>
            </div>
          </div>
        )}

        {/* Chapters List */}
        {chapters.length === 0 ? (
          <div className="py-12 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-2xl p-6">
            <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--color-text)]">هنوز فصلی برای این دوره ایجاد نشده است</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm mx-auto">
              با افزودن فصل‌ها، ساختار یادگیری منظمی برای محتوا و فایل‌های خود تشکیل دهید.
            </p>
            <Button
              size="sm"
              onClick={() => setIsAddingChapter(true)}
              className="mt-4 bg-[#008080] text-white text-xs"
            >
              <Plus className="w-4 h-4 ml-1" />
              افزودن اولین فصل
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {chapters.map((ch, chIdx) => (
              <div
                key={ch.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Chapter Header */}
                <div className="p-4 bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-teal-500/10 text-[#008080] font-bold text-xs flex items-center justify-center">
                      {toPersianDigits(chIdx + 1)}
                    </span>
                    {editingChapterId === ch.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingChapterTitle}
                          onChange={(e) => setEditingChapterTitle(e.target.value)}
                          className="px-2.5 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg"
                        />
                        <button
                          onClick={() => {
                            if (editingChapterTitle.trim()) {
                              updateChapterMutation.mutate({
                                chapterId: ch.id,
                                title: editingChapterTitle.trim(),
                              });
                            }
                          }}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingChapterId(null)}
                          className="p-1 text-[var(--color-text-muted)] hover:bg-gray-100 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <h4 className="font-bold text-sm text-[var(--color-text)]">{ch.title}</h4>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingChapterId(ch.id);
                        setEditingChapterTitle(ch.title);
                      }}
                      className="p-1.5 text-[var(--color-text-muted)] hover:text-[#008080] rounded-lg transition-colors"
                      title="ویرایش عنوان فصل"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`آیا از حذف فصل «${ch.title}» اطمینان دارید؟`)) {
                          deleteChapterMutation.mutate(ch.id);
                        }
                      }}
                      className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-600 rounded-lg transition-colors"
                      title="حذف فصل"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAddingModuleChapterId(ch.id)}
                      className="text-xs text-[#008080]"
                    >
                      <Plus className="w-3.5 h-3.5 ml-1" />
                      افزودن سرفصل/درس
                    </Button>
                  </div>
                </div>

                {/* Add Module inside Chapter */}
                {addingModuleChapterId === ch.id && (
                  <div className="p-4 bg-teal-50/20 border-b border-[var(--color-border)] space-y-3">
                    <span className="text-xs font-bold text-[var(--color-text)]">
                      افزودن سرفصل جدید به {ch.title}:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                          عنوان درس یا سرفصل
                        </label>
                        <input
                          type="text"
                          value={newModuleTitle}
                          onChange={(e) => setNewModuleTitle(e.target.value)}
                          placeholder="مثلاً: جلسه اول - مقدمه و مفاهیم"
                          className="w-full px-3 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                          سند یا منبع آموزشی (اختیاری)
                        </label>
                        <select
                          value={newModuleDocId}
                          onChange={(e) => setNewModuleDocId(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
                        >
                          <option value="">-- بدون سند (ایجاد دستی) --</option>
                          {docsQuery.data?.items?.map((doc) => (
                            <option key={doc.id} value={doc.id}>
                              {doc.original_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddingModuleChapterId(null);
                          setNewModuleTitle("");
                          setNewModuleDocId("");
                        }}
                      >
                        انصراف
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newModuleTitle.trim()) {
                            createModuleMutation.mutate({
                              title: newModuleTitle.trim(),
                              subCourseGroupId: ch.id,
                              documentId: newModuleDocId || null,
                            });
                          }
                        }}
                        disabled={!newModuleTitle.trim() || createModuleMutation.isPending}
                        className="bg-[#008080] text-white text-xs"
                      >
                        افزودن سرفصل
                      </Button>
                    </div>
                  </div>
                )}

                {/* Modules in Chapter */}
                <div className="p-4 space-y-3">
                  {ch.modules.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
                      هنوز سرفصلی در این فصل اضافه نشده است.
                    </p>
                  ) : (
                    ch.modules.map((mod, modIdx) => (
                      <div
                        key={mod.id}
                        className="p-3.5 bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {toPersianDigits(modIdx + 1)}.
                            </span>
                            <span className="font-bold text-xs text-[var(--color-text)]">
                              {mod.title}
                            </span>
                          </div>
                          {mod.document && (
                            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                              <FileText className="w-3 h-3 text-[#008080]" />
                              <span>فایل متصل: {mod.document.originalName}</span>
                            </div>
                          )}
                        </div>

                        {/* Pipeline Status & Triggers */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {mod.documentId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setGeneratingDoc({
                                  id: mod.documentId!,
                                  name: mod.document?.originalName || mod.title,
                                })
                              }
                              className="text-xs text-[#008080] hover:bg-teal-50"
                            >
                              <Sparkles className="w-3.5 h-3.5 ml-1" />
                              تولید / بازتولید هوش مصنوعی
                            </Button>
                          ) : (
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              سند متصل نیست
                            </span>
                          )}

                          <button
                            onClick={() => {
                              if (confirm(`آیا از حذف سرفصل «${mod.title}» اطمینان دارید؟`)) {
                                deleteModuleMutation.mutate(mod.id);
                              }
                            }}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-600 rounded-lg transition-colors"
                            title="حذف سرفصل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generation Modal */}
      {generatingDoc && (
        <GenerateContentModal
          isOpen={!!generatingDoc}
          onClose={() => {
            setGeneratingDoc(null);
            void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
          }}
          documentId={generatingDoc.id}
          documentName={generatingDoc.name}
          organizationId={organizationId}
          courseId={courseId}
          isGenerating={generateMutation.isPending}
          onConfirmGenerate={handleConfirmGenerate}
        />
      )}

      {/* Course Publish Modal */}
      {!isOfficial && isPublishModalOpen && course && (
        <CoursePublishModal
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          organizationId={organizationId}
          courseId={courseId}
          courseTitle={course.title}
          courseDescription={course.description}
          courseSubject={course.subject}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ["course-structure", organizationId, courseId] });
          }}
        />
      )}
    </div>
  );
}
