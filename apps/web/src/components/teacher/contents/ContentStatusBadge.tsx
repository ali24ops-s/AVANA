import { Badge } from "../../ui/index.js";
import type { ClassroomContentStatus } from "@avana/domain";

export interface ContentStatusBadgeProps {
  status: ClassroomContentStatus;
}

export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  switch (status) {
    case "draft":
      return (
        <Badge variant="warning" size="sm">
          پیش‌نویس
        </Badge>
      );
    case "published":
      return (
        <Badge variant="success" size="sm">
          منتشر شده
        </Badge>
      );
    case "archived":
      return (
        <Badge variant="neutral" size="sm">
          بایگانی‌شده
        </Badge>
      );
    default:
      return null;
  }
}
