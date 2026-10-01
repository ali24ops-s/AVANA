import { Badge } from "../../ui/index.js";

export interface AssignmentStatusBadgeProps {
  status: "draft" | "published" | "archived";
  size?: "sm" | "md";
}

export function AssignmentStatusBadge({
  status,
  size = "sm",
}: AssignmentStatusBadgeProps) {
  if (status === "published") {
    return (
      <Badge variant="success" size={size}>
        منتشر شده
      </Badge>
    );
  }

  if (status === "draft") {
    return (
      <Badge variant="warning" size={size}>
        پیش‌نویس
      </Badge>
    );
  }

  return (
    <Badge variant="neutral" size={size}>
      بایگانی‌شده
    </Badge>
  );
}
