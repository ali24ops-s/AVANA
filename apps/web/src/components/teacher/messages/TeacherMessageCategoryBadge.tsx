import { Badge } from "../../ui/index.js";
import {
  type TeacherMessageCategory,
  TEACHER_MESSAGE_CATEGORY_LABELS,
  TeacherMessageCategories,
} from "@avana/domain";
import {
  HelpCircle,
  FileText,
  FileQuestion,
  BookOpen,
  AlertTriangle,
  Compass,
  MessageCircle,
} from "lucide-react";

interface Props {
  category: TeacherMessageCategory;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function TeacherMessageCategoryBadge({
  category,
  size = "sm",
  showIcon = true,
}: Props) {
  const label = TEACHER_MESSAGE_CATEGORY_LABELS[category] || category;

  switch (category) {
    case TeacherMessageCategories.STUDY_QUESTION:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <HelpCircle className="w-3 h-3 text-[#008080]" /> : undefined}
          className="bg-teal-500/10 text-teal-800 dark:text-teal-200 border border-teal-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.ASSIGNMENT:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <FileText className="w-3 h-3 text-purple-600" /> : undefined}
          className="bg-purple-500/10 text-purple-800 dark:text-purple-200 border border-purple-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.EXAM:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <FileQuestion className="w-3 h-3 text-indigo-600" /> : undefined}
          className="bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 border border-indigo-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.EDUCATIONAL_CONTENT:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <BookOpen className="w-3 h-3 text-sky-600" /> : undefined}
          className="bg-sky-500/10 text-sky-800 dark:text-sky-200 border border-sky-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.CLASS_ISSUE:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <AlertTriangle className="w-3 h-3 text-amber-600" /> : undefined}
          className="bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.GUIDANCE:
      return (
        <Badge
          variant="secondary"
          size={size}
          icon={showIcon ? <Compass className="w-3 h-3 text-emerald-600" /> : undefined}
          className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/25 font-medium"
        >
          {label}
        </Badge>
      );
    case TeacherMessageCategories.OTHER:
    default:
      return (
        <Badge
          variant="neutral"
          size={size}
          icon={showIcon ? <MessageCircle className="w-3 h-3 text-slate-500" /> : undefined}
          className="bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/25 font-medium"
        >
          {label}
        </Badge>
      );
  }
}
