/**
 * Course Card for Avana Library.
 *
 * Displays an accessible Course in the Library grid delegating to
 * canonical CourseCard with variant="library".
 */

import type { LibraryCourseItem } from "../../lib/api/library.js";
import { CourseLibraryCardAdapter } from "../avana/CourseCard.js";

export interface CourseLibraryCardProps {
  course: LibraryCourseItem;
  onBuy?: (course: LibraryCourseItem) => void;
  onView?: (course: LibraryCourseItem) => void;
  onAdd?: (course: LibraryCourseItem) => void;
  isAdded?: boolean;
  isAdding?: boolean;
}

export function CourseLibraryCard({
  course,
  onBuy,
  onView,
  onAdd,
  isAdded,
  isAdding,
}: CourseLibraryCardProps) {
  return (
    <CourseLibraryCardAdapter
      course={course}
      onBuy={onBuy}
      onView={onView}
      onAdd={onAdd}
      isAdded={isAdded}
      isAdding={isAdding}
    />
  );
}

