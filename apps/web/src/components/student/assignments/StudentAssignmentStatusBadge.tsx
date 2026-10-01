import { Badge } from "../../ui/index.js";

export interface StudentAssignmentStatusBadgeProps {
  status: "submitted" | "can_submit" | "not_started" | "expired";
  size?: "sm" | "md";
}

export function StudentAssignmentStatusBadge({
  status,
  size = "sm",
}: StudentAssignmentStatusBadgeProps) {
  switch (status) {
    case "submitted":
      return (
        <Badge variant="success" size={size}>
          ارسال شده
        </Badge>
      );
    case "can_submit":
      return (
        <Badge variant="primary" size={size}>
          قابل ارسال
        </Badge>
      );
    case "not_started":
      return (
        <Badge variant="warning" size={size}>
          شروع نشده
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="neutral" size={size}>
          مهلت تمام شده
        </Badge>
      );
  }
}
