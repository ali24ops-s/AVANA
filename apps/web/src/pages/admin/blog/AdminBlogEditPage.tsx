import { useParams, useNavigate } from "react-router-dom";
import {
  useAdminBlogPost,
  useAdminBlogCategories,
  useCreateBlogPost,
  useUpdateBlogPost,
  usePublishBlogPost,
} from "../../../hooks/useBlog.js";
import { AdminBlogEditor } from "../../../components/admin/blog/AdminBlogEditor.js";
import { Loader2 } from "lucide-react";
import type {
  CreateBlogPostRequest,
  UpdateBlogPostRequest,
} from "../../../lib/api/blog.js";

export function AdminBlogEditPage() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id && id !== "new");
  const navigate = useNavigate();

  const { data: postData, isLoading: isLoadingPost } = useAdminBlogPost(isEditing ? id : null);
  const { data: categoriesData } = useAdminBlogCategories();

  const createMutation = useCreateBlogPost();
  const updateMutation = useUpdateBlogPost();
  const publishMutation = usePublishBlogPost();

  const categories = categoriesData?.categories || [];
  const post = postData?.post;

  const isSaving =
    createMutation.isPending || updateMutation.isPending || publishMutation.isPending;

  const handleSave = (data: CreateBlogPostRequest | UpdateBlogPostRequest) => {
    if (isEditing && id) {
      updateMutation.mutate(
        { id, data },
        {
          onSuccess: () => {
            navigate("/admin/blog");
          },
        },
      );
    } else {
      createMutation.mutate(data as CreateBlogPostRequest, {
        onSuccess: () => {
          navigate("/admin/blog");
        },
      });
    }
  };

  const handlePublish = (data: CreateBlogPostRequest | UpdateBlogPostRequest) => {
    if (isEditing && id) {
      updateMutation.mutate(
        { id, data: { ...data, status: "published" } },
        {
          onSuccess: () => {
            navigate("/admin/blog");
          },
        },
      );
    } else {
      createMutation.mutate(
        { ...(data as CreateBlogPostRequest), status: "published" },
        {
          onSuccess: () => {
            navigate("/admin/blog");
          },
        },
      );
    }
  };

  if (isEditing && isLoadingPost) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-[var(--color-text-muted)] gap-3" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
        <p className="text-sm font-medium">در حال بارگذاری اطلاعات مقاله...</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <AdminBlogEditor
        initialPost={isEditing ? post : undefined}
        categories={categories}
        isSaving={isSaving}
        onSave={handleSave}
        onPublish={handlePublish}
      />
    </div>
  );
}
