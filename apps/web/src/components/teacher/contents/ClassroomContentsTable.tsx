import { useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingState,
  Button,
} from "../../ui/index.js";
import { ContentStatusBadge } from "./ContentStatusBadge.js";
import { ContentTypeBadge } from "./ContentTypeBadge.js";
import { CreateEditContentModal } from "./CreateEditContentModal.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import {
  usePublishClassroomContent,
  useUnpublishClassroomContent,
  useArchiveClassroomContent,
  useDeleteClassroomContent,
} from "../../../hooks/useTeacherContents.js";
import type { ClassroomContent } from "@avana/domain";
import { formatPersianExamDate } from "../../../utils/date.js";
import {
  FileText,
  Edit3,
  Send,
  RotateCcw,
  Archive,
  Trash2,
  ExternalLink,
  Download,
} from "lucide-react";

export interface ClassroomContentsTableProps {
  contents: ClassroomContent[];
  isLoading: boolean;
  classroomId: string;
  onOpenCreateModal: () => void;
}

export function ClassroomContentsTable({
  contents,
  isLoading,
  classroomId,
  onOpenCreateModal,
}: ClassroomContentsTableProps) {
  const [contentToEdit, setContentToEdit] = useState<ClassroomContent | null>(null);
  const [contentToDelete, setContentToDelete] = useState<ClassroomContent | null>(null);
  const [contentToArchive, setContentToArchive] = useState<ClassroomContent | null>(null);

  const publishMutation = usePublishClassroomContent(
    contents[0]?.id ?? "",
    classroomId,
  );
  const unpublishMutation = useUnpublishClassroomContent(
    contents[0]?.id ?? "",
    classroomId,
  );
  const archiveMutation = useArchiveClassroomContent(
    contentToArchive?.id ?? "",
    classroomId,
  );
  const deleteMutation = useDeleteClassroomContent(
    contentToDelete?.id ?? "",
    classroomId,
  );

  const handlePublishToggle = async (content: ClassroomContent) => {
    try {
      if (content.status === "draft") {
        await publishMutation.mutateAsync(undefined);
      } else if (content.status === "published") {
        await unpublishMutation.mutateAsync(undefined);
      }
    } catch {
      // Handled by query client
    }
  };

  const handleConfirmArchive = async () => {
    if (!contentToArchive) return;
    try {
      await archiveMutation.mutateAsync(undefined);
      setContentToArchive(null);
    } catch {
      // Handled
    }
  };

  const handleConfirmDelete = async () => {
    if (!contentToDelete) return;
    try {
      await deleteMutation.mutateAsync(undefined);
      setContentToDelete(null);
    } catch {
      // Handled
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%] text-right font-bold">عنوان محتوا</TableHead>
              <TableHead className="w-[15%] text-right font-bold">نوع</TableHead>
              <TableHead className="w-[15%] text-right font-bold">وضعیت</TableHead>
              <TableHead className="w-[15%] text-right font-bold">تاریخ ایجاد</TableHead>
              <TableHead className="w-[20%] text-left font-bold">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableLoadingState colSpan={5} message="در حال دریافت محتوای آموزشی..." />
            ) : contents.length === 0 ? (
              <TableEmptyState
                colSpan={5}
                icon={<FileText className="w-6 h-6" />}
                message="هنوز محتوای آموزشی در این کلاس ثبت نشده است."
                action={
                  <Button size="sm" variant="primary" onClick={onOpenCreateModal}>
                    ایجاد اولین محتوای آموزشی
                  </Button>
                }
              />
            ) : (
              contents.map((c) => {
                const isDraft = c.status === "draft";
                const isPublished = c.status === "published";
                const isArchived = c.status === "archived";

                return (
                  <TableRow key={c.id} className="hover:bg-[var(--color-surface-hover)]">
                    {/* Title & Description */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-xs sm:text-sm text-[var(--color-text)] line-clamp-1">
                          {c.title}
                        </span>
                        {c.description && (
                          <span className="text-[11px] text-[var(--color-text-muted)] line-clamp-1">
                            {c.description}
                          </span>
                        )}
                        {c.contentType === "video_external" && c.externalUrl && (
                          <span className="text-[10px] text-blue-600 line-clamp-1 font-mono" dir="ltr">
                            {c.externalUrl}
                          </span>
                        )}
                        {c.fileName && (
                          <span className="text-[10px] text-[var(--color-text-muted)] line-clamp-1">
                            فایل: {c.fileName}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <ContentTypeBadge type={c.contentType} />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <ContentStatusBadge status={c.status} />
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs text-[var(--color-text-muted)]">
                      {formatPersianExamDate(c.createdAt)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {/* View / Download Link */}
                        {c.fileUrl && (
                          <a
                            href={c.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={c.fileName || undefined}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[#008080] hover:bg-[var(--color-surface-hover)] transition-colors"
                            title="دانلود فایل"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {c.contentType === "video_external" && c.externalUrl && (
                          <a
                            href={c.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-blue-600 hover:bg-[var(--color-surface-hover)] transition-colors"
                            title="مشاهده لینک ویدئو"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => setContentToEdit(c)}
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[#008080] hover:bg-[var(--color-surface-hover)] transition-colors"
                          title="ویرایش"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Publish / Unpublish */}
                        {isDraft && (
                          <button
                            type="button"
                            onClick={() => handlePublishToggle(c)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="انتشار"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {isPublished && (
                          <button
                            type="button"
                            onClick={() => handlePublishToggle(c)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="تبدیل به پیش‌نویس (لغو انتشار)"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}

                        {/* Archive */}
                        {!isArchived && (
                          <button
                            type="button"
                            onClick={() => setContentToArchive(c)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="بایگانی"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => setContentToDelete(c)}
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      {contentToEdit && (
        <CreateEditContentModal
          isOpen={Boolean(contentToEdit)}
          onClose={() => setContentToEdit(null)}
          classroomId={classroomId}
          contentToEdit={contentToEdit}
        />
      )}

      {/* Archive Modal */}
      {contentToArchive && (
        <ConfirmModal
          isOpen={Boolean(contentToArchive)}
          onCancel={() => setContentToArchive(null)}
          onConfirm={handleConfirmArchive}
          title="بایگانی محتوای آموزشی"
          description={`آیا از بایگانی کردن محتوای «${contentToArchive.title}» اطمینان دارید؟`}
          confirmText="بایگانی محتوا"
          variant="warning"
        />
      )}

      {/* Delete Modal */}
      {contentToDelete && (
        <ConfirmModal
          isOpen={Boolean(contentToDelete)}
          onCancel={() => setContentToDelete(null)}
          onConfirm={handleConfirmDelete}
          title="حذف محتوای آموزشی"
          description={`آیا از حذف دائمی محتوای «${contentToDelete.title}» اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`}
          confirmText="حذف دائمی"
          variant="danger"
        />
      )}
    </>
  );
}
