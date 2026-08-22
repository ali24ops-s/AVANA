import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen,
  Plus,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
} from "lucide-react";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createDocumentsApi, type DocumentListFilters } from "../lib/api/documents.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createContentApi } from "../lib/api/content.js";
import { FileStatsCards } from "../components/files/FileStatsCards.js";
import { FileFilterToolbar } from "../components/files/FileFilterToolbar.js";
import { FileTable } from "../components/files/FileTable.js";
import { FileDetailsDrawer } from "../components/files/FileDetailsDrawer.js";
import { FileUploadModal } from "../components/files/FileUploadModal.js";
import { FileDeleteModal } from "../components/files/FileDeleteModal.js";
import { FileRenameModal } from "../components/files/FileRenameModal.js";
import { FileAttachCourseModal } from "../components/files/FileAttachCourseModal.js";
import { FileBulkActions } from "../components/files/FileBulkActions.js";
import type {
  DocumentResource,
  DocumentDetailResource,
  CourseResource,
} from "@avana/contracts";

export function FilesPage() {
  const { memberships } = useAuth();
  const queryClient = useQueryClient();

  const apiClient = useMemo(() => createApiClient({ baseUrl: getApiBaseUrl() }), []);
  const orgApi = useMemo(() => createOrganizationApi(apiClient), [apiClient]);
  const docsApi = useMemo(() => createDocumentsApi(apiClient), [apiClient]);
  const courseApi = useMemo(() => createCourseApi(apiClient), [apiClient]);
  const contentApi = useMemo(() => createContentApi(apiClient), [apiClient]);

  // Fetch available organizations
  const orgsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organizationId =
    memberships[0]?.organization_id || orgsQuery.data?.items[0]?.id;

  // Search & Filter State
  const [filters, setFilters] = useState<DocumentListFilters>({
    search: undefined,
    status: undefined,
    type: undefined,
    used: undefined,
    sort: "newest",
    page: 1,
    limit: 25,
  });

  // Selection & UI Modals State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetailResource | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentDetailResource | DocumentResource | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentResource | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [attachCourseTarget, setAttachCourseTarget] = useState<DocumentResource | null>(null);
  const [isAttachCourseOpen, setIsAttachCourseOpen] = useState(false);
  const [isBulkAttachCourseOpen, setIsBulkAttachCourseOpen] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Queries: Stats, Documents, Courses
  const statsQuery = useQuery({
    queryKey: ["document-stats", organizationId],
    queryFn: () => docsApi.getDocumentStats(organizationId!),
    enabled: Boolean(organizationId),
    refetchInterval: (query) => {
      // Auto-poll if any documents are processing
      const hasProcessing =
        (query.state.data?.stats.status_counts?.extracting ?? 0) > 0 ||
        (query.state.data?.stats.status_counts?.processing ?? 0) > 0;
      return hasProcessing ? 3000 : false;
    },
  });

  const docsQuery = useQuery({
    queryKey: ["documents", organizationId, filters],
    queryFn: () => docsApi.listDocuments(organizationId!, filters),
    enabled: Boolean(organizationId),
  });

  const coursesQuery = useQuery({
    queryKey: ["courses", organizationId],
    queryFn: () => courseApi.listCourses(organizationId!),
    enabled: Boolean(organizationId),
  });

  const coursesList: CourseResource[] = coursesQuery.data?.items ?? [];
  const coursesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of coursesList) {
      map[c.id] = c.title;
    }
    return map;
  }, [coursesList]);

  // Handler: View Detailed Info in Drawer
  const handleViewDetails = async (doc: DocumentResource) => {
    if (!organizationId) return;
    try {
      const res = await docsApi.getDocument(organizationId, doc.id);
      setSelectedDoc(res.document);
      setIsDetailsOpen(true);
    } catch {
      // Fallback with minimal info
      setSelectedDoc(doc as DocumentDetailResource);
      setIsDetailsOpen(true);
    }
  };

  // Handler: Single Upload
  const handleUploadFile = async (file: File, courseId?: string) => {
    if (!organizationId) return { success: false, error: "سازمان یافت نشد" };
    try {
      const res = await docsApi.uploadDocument(organizationId, file, courseId);
      // Auto trigger extraction
      void docsApi.triggerExtraction(organizationId, res.document.id);
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "خطا در آپلود",
      };
    }
  };

  // Handler: Download
  const handleDownload = (doc: DocumentResource | DocumentDetailResource) => {
    if (!organizationId) return;
    const url = docsApi.getDownloadUrl(organizationId, doc.id, false);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = doc.original_name;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  // Handler: Single Reprocess
  const handleReprocess = async (doc: DocumentResource | DocumentDetailResource) => {
    if (!organizationId) return;
    setIsReprocessing(true);
    try {
      await docsApi.reprocessDocument(organizationId, doc.id);
      showToast("پردازش مجدد با موفقیت آغاز شد");
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
      if (selectedDoc?.id === doc.id) {
        const res = await docsApi.getDocument(organizationId, doc.id);
        setSelectedDoc(res.document);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در پردازش مجدد",
        "error",
      );
    } finally {
      setIsReprocessing(false);
    }
  };

  // Handler: Single Delete Confirm
  const handleDeleteConfirm = async () => {
    if (!organizationId || !deleteTarget) return;
    try {
      await docsApi.deleteDocument(organizationId, deleteTarget.id);
      showToast("فایل با موفقیت حذف شد");
      setIsDeleteOpen(false);
      if (selectedDoc?.id === deleteTarget.id) {
        setIsDetailsOpen(false);
        setSelectedDoc(null);
      }
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "خطا در حذف فایل", "error");
    }
  };

  // Handler: Single Rename Confirm
  const handleRenameConfirm = async (newName: string) => {
    if (!organizationId || !renameTarget) return;
    try {
      const res = await docsApi.updateDocument(organizationId, renameTarget.id, {
        original_name: newName,
      });
      showToast("نام فایل با موفقیت تغییر یافت");
      setIsRenameOpen(false);
      if (selectedDoc?.id === renameTarget.id) {
        setSelectedDoc((prev: DocumentDetailResource | null) =>
          prev ? { ...prev, original_name: res.document.original_name } : null,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در تغییر نام فایل",
        "error",
      );
    }
  };

  // Handler: Single Attach Course Confirm
  const handleAttachCourseConfirm = async (courseId: string | null) => {
    if (!organizationId || !attachCourseTarget) return;
    try {
      await docsApi.updateDocument(organizationId, attachCourseTarget.id, {
        course_id: courseId,
      });
      showToast("اتصال به دوره با موفقیت به‌روزرسانی شد");
      setIsAttachCourseOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
      if (selectedDoc?.id === attachCourseTarget.id) {
        const res = await docsApi.getDocument(organizationId, attachCourseTarget.id);
        setSelectedDoc(res.document);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در تغییر اتصال دوره",
        "error",
      );
    }
  };

  // Bulk Operations
  const handleBulkDeleteConfirm = async () => {
    if (!organizationId || selectedIds.length === 0) return;
    try {
      const res = await docsApi.bulkDeleteDocuments(organizationId, selectedIds);
      showToast(`${res.succeeded.toLocaleString("fa-IR")} فایل با موفقیت حذف شدند`);
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در حذف گروهی فایل‌ها",
        "error",
      );
    }
  };

  const handleBulkReprocess = async () => {
    if (!organizationId || selectedIds.length === 0) return;
    try {
      const res = await docsApi.bulkReprocessDocuments(organizationId, selectedIds);
      showToast(
        `پردازش مجدد برای ${res.succeeded.toLocaleString("fa-IR")} فایل آغاز شد`,
      );
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در پردازش مجدد گروهی",
        "error",
      );
    }
  };

  const handleBulkAttachCourseConfirm = async (courseId: string | null) => {
    if (!organizationId || selectedIds.length === 0) return;
    try {
      const res = await docsApi.bulkAttachCourse(organizationId, selectedIds, courseId);
      showToast(
        `اتصال دوره برای ${res.succeeded.toLocaleString("fa-IR")} فایل اعمال شد`,
      );
      setSelectedIds([]);
      setIsBulkAttachCourseOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["document-stats", organizationId] });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "خطا در اتصال گروهی به دوره",
        "error",
      );
    }
  };

  // Helper to load modules for a course in upload modal
  const loadModulesForCourse = async (courseId: string) => {
    if (!organizationId) return [];
    try {
      const res = await contentApi.getCourseContent(organizationId, courseId);
      return res.modules ?? [];
    } catch {
      return [];
    }
  };

  const documentsList = docsQuery.data?.items ?? [];
  const isSearchActive =
    Boolean(filters.search) ||
    Boolean(filters.type) ||
    Boolean(filters.status) ||
    Boolean(filters.used);

  return (
    <div className="space-y-6 pb-24" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in duration-200">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl backdrop-blur-xl border ${
              toast.type === "success"
                ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/40"
                : "bg-rose-950/90 text-rose-300 border-rose-500/40"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-0.5 rounded-full hover:bg-white/10 mr-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-sm">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">
                فایل‌ها و منابع آموزشی
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                مدیریت، بررسی و سازماندهی تمام فایل‌های بارگذاری‌شده در سیستم
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-bold transition-colors shadow-lg shadow-teal-900/40"
          >
            <Plus className="w-4 h-4" />
            <span>+ آپلود فایل جدید</span>
          </button>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <FileStatsCards
        stats={statsQuery.data?.stats}
        isLoading={statsQuery.isLoading}
      />

      {/* Search & Filter Toolbar */}
      <FileFilterToolbar
        filters={filters}
        onChange={setFilters}
        onRefresh={() => {
          void docsQuery.refetch();
          void statsQuery.refetch();
        }}
        isRefreshing={docsQuery.isFetching}
      />

      {/* Content Area */}
      {docsQuery.isError && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>خطا در دریافت لیست فایل‌ها</span>
          </div>
          <button
            type="button"
            onClick={() => void docsQuery.refetch()}
            className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-semibold"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {/* Empty States */}
      {!docsQuery.isLoading && documentsList.length === 0 && !isSearchActive && (
        <div className="glass-panel border border-white/10 rounded-3xl p-12 text-center space-y-4 shadow-ambient">
          <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mx-auto flex items-center justify-center">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              هنوز فایلی آپلود نشده است
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
              فایل‌های آموزشی خود را آپلود کنید تا بتوانید از آنها برای ساخت دوره، درس و محتوای هوشمند استفاده کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-lg shadow-teal-900/30"
          >
            <Plus className="w-4 h-4" />
            <span>آپلود اولین فایل</span>
          </button>
        </div>
      )}

      {!docsQuery.isLoading && documentsList.length === 0 && isSearchActive && (
        <div className="glass-panel border border-white/10 rounded-3xl p-12 text-center space-y-4 shadow-ambient">
          <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 text-slate-400 mx-auto flex items-center justify-center">
            <Search className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              فایلی مطابق جستجوی شما پیدا نشد
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              لطفاً کلمه کلیدی دیگری جستجو کنید یا فیلترهای اعمال‌شده را پاک نمایید.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setFilters({
                search: undefined,
                type: undefined,
                status: undefined,
                used: undefined,
                sort: "newest",
                page: 1,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors"
          >
            <span>پاک کردن فیلترها</span>
          </button>
        </div>
      )}

      {/* Table / List */}
      {(docsQuery.isLoading || documentsList.length > 0) && (
        <FileTable
          documents={documentsList}
          selectedIds={selectedIds}
          onSelectAll={(checked) => {
            if (checked) {
              setSelectedIds(documentsList.map((d) => d.id));
            } else {
              setSelectedIds([]);
            }
          }}
          onSelectOne={(id, checked) => {
            if (checked) {
              setSelectedIds((prev) => [...prev, id]);
            } else {
              setSelectedIds((prev) => prev.filter((i) => i !== id));
            }
          }}
          onViewDetails={handleViewDetails}
          onPreview={(doc) => handleViewDetails(doc)}
          onDownload={handleDownload}
          onRename={(doc) => {
            setRenameTarget(doc);
            setIsRenameOpen(true);
          }}
          onAttachCourse={(doc) => {
            setAttachCourseTarget(doc);
            setIsAttachCourseOpen(true);
          }}
          onReprocess={handleReprocess}
          onDelete={(doc) => {
            setDeleteTarget(doc);
            setIsDeleteOpen(true);
          }}
          onCopyLink={(doc) => {
            void navigator.clipboard.writeText(doc.id);
            showToast("شناسه فایل در کلیپ‌بورد کپی شد");
          }}
          isLoading={docsQuery.isLoading}
          pagination={docsQuery.data?.pagination}
          onPageChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
          coursesMap={coursesMap}
        />
      )}

      {/* Floating Bulk Actions Bar */}
      <FileBulkActions
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onBulkDelete={() => setIsBulkDeleteOpen(true)}
        onBulkReprocess={handleBulkReprocess}
        onBulkAttachCourse={() => setIsBulkAttachCourseOpen(true)}
      />

      {/* File Details Drawer */}
      <FileDetailsDrawer
        document={selectedDoc}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onPreview={() => {}}
        onDownload={handleDownload}
        onRename={(doc) => {
          setRenameTarget(doc);
          setIsRenameOpen(true);
        }}
        onAttachCourse={(doc) => {
          setAttachCourseTarget(doc);
          setIsAttachCourseOpen(true);
        }}
        onReprocess={handleReprocess}
        onDelete={(doc) => {
          setDeleteTarget(doc);
          setIsDeleteOpen(true);
        }}
        getDownloadUrl={(id, inline) =>
          organizationId ? docsApi.getDownloadUrl(organizationId, id, inline) : ""
        }
        isReprocessing={isReprocessing}
      />

      {/* Upload Modal */}
      <FileUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadFile={handleUploadFile}
        onUploadFinished={() => {
          showToast("بارگذاری با موفقیت انجام شد");
          setIsUploadOpen(false);
        }}
        courses={coursesList}
        loadModulesForCourse={loadModulesForCourse}
      />

      {/* Single Delete Modal */}
      <FileDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        document={deleteTarget}
        count={1}
      />

      {/* Bulk Delete Modal */}
      <FileDeleteModal
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        document={null}
        count={selectedIds.length}
      />

      {/* Rename Modal */}
      <FileRenameModal
        isOpen={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        onConfirm={handleRenameConfirm}
        document={renameTarget}
      />

      {/* Single Attach Course Modal */}
      <FileAttachCourseModal
        isOpen={isAttachCourseOpen}
        onClose={() => setIsAttachCourseOpen(false)}
        onConfirm={handleAttachCourseConfirm}
        courses={coursesList}
        currentCourseId={attachCourseTarget?.course_id}
        count={1}
      />

      {/* Bulk Attach Course Modal */}
      <FileAttachCourseModal
        isOpen={isBulkAttachCourseOpen}
        onClose={() => setIsBulkAttachCourseOpen(false)}
        onConfirm={handleBulkAttachCourseConfirm}
        courses={coursesList}
        count={selectedIds.length}
      />
    </div>
  );
}
