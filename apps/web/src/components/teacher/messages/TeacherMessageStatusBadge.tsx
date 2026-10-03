import { Badge } from "../../ui/index.js";
import {
  type TeacherMessageStatus,
  TEACHER_MESSAGE_STATUS_LABELS,
  TeacherMessageStatuses,
} from "@avana/domain";
import { Clock, CheckCircle2, AlertCircle, Archive } from "lucide-react";

interface Props {
  status: TeacherMessageStatus;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function TeacherMessageStatusBadge({
  status,
  size = "sm",
  showIcon = true,
}: Props) {
  const label = TEACHER_MESSAGE_STATUS_LABELS[status] || status;

  switch (status) {
    case TeacherMessageStatuses.NEW:
      return (
        <Badge
          variant="info"
          size={size}
          icon={showIcon ? <AlertCircle className="w-3 h-3" /> : undefined}
          className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-semibold"
        >
          {label}
        </Badge>
      );
    case TeacherMessageStatuses.IN_PROGRESS:
      return (
        <Badge
          variant="warning"
          size={size}
          icon={showIcon ? <Clock className="w-3 h-3" /> : undefined}
          className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold"
        >
          {label}
        </Badge>
      );
    case TeacherMessageStatuses.ANSWERED:
      return (
        <Badge
          variant="success"
          size={size}
          icon={showIcon ? <CheckCircle2 className="w-3 h-3" /> : undefined}
          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold"
        >
          {label}
        </Badge>
      );
    case TeacherMessageStatuses.CLOSED:
      return (
        <Badge
          variant="neutral"
          size={size}
          icon={showIcon ? <Archive className="w-3 h-3" /> : undefined}
          className="bg-gray-500/15 text-gray-700 dark:text-gray-300 border border-gray-500/30 font-semibold"
        >
          {label}
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" size={size}>
          {label}
        </Badge>
      );
  }
}
