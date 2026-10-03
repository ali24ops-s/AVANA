import type { ClassroomContentType } from "@avana/domain";
import { FileText, Image, FileCode, Presentation, Video } from "lucide-react";

export interface ContentTypeBadgeProps {
  type: ClassroomContentType;
}

export function ContentTypeBadge({ type }: ContentTypeBadgeProps) {
  switch (type) {
    case "text":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <FileText className="w-3.5 h-3.5" />
          <span>متن</span>
        </span>
      );
    case "image":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Image className="w-3.5 h-3.5" />
          <span>تصویر</span>
        </span>
      );
    case "pdf":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <FileCode className="w-3.5 h-3.5" />
          <span>PDF</span>
        </span>
      );
    case "word":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
          <FileText className="w-3.5 h-3.5" />
          <span>Word</span>
        </span>
      );
    case "powerpoint":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Presentation className="w-3.5 h-3.5" />
          <span>PowerPoint</span>
        </span>
      );
    case "video_external":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          <Video className="w-3.5 h-3.5" />
          <span>ویدئو (لینک خارجی)</span>
        </span>
      );
    default:
      return null;
  }
}
