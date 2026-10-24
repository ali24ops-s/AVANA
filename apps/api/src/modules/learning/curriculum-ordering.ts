/**
 * Curriculum ordering utility.
 *
 * Implements the authoritative sorting algorithm for course modules/chapters
 * exactly as defined and consumed by the learning view (درسنامه):
 *
 * 1. If subCourseGroups (پودمان‌ها/سرفصل‌ها) exist:
 *    - Groups are sequenced by group.sortOrder (ascending).
 *    - Inside each group, modules are sequenced by module.sortOrder (ascending).
 *    - Modules without a group (or whose group was deleted/unassigned) are sequenced
 *      after all grouped modules, ordered by module.sortOrder (ascending).
 * 2. If no subCourseGroups exist:
 *    - Modules are sequenced strictly by module.sortOrder (ascending).
 * 3. Tie-breaking is deterministic (using module title and id if sortOrder is identical).
 */

export interface CurriculumSortableModule {
  id: string;
  title?: string;
  sortOrder?: number | null;
  subCourseGroupId?: string | null;
}

export interface CurriculumSortableGroup {
  id: string;
  sortOrder?: number | null;
}

export function orderModulesByCurriculum<T extends CurriculumSortableModule>(
  modules: T[],
  groups: CurriculumSortableGroup[] = [],
): T[] {
  // Primary stable comparator for modules
  const compareModules = (a: T, b: T): number => {
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const titleA = a.title ?? "";
    const titleB = b.title ?? "";
    const titleCmp = titleA.localeCompare(titleB, "fa");
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  };

  const sortedModules = [...modules].sort(compareModules);

  if (!groups || groups.length === 0) {
    return sortedModules;
  }

  // Sort groups by sortOrder ascending
  const sortedGroups = [...groups].sort((a, b) => {
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });

  const groupMap = new Map<string, T[]>();
  for (const g of sortedGroups) {
    groupMap.set(g.id, []);
  }

  const ungrouped: T[] = [];

  for (const m of sortedModules) {
    if (m.subCourseGroupId && groupMap.has(m.subCourseGroupId)) {
      groupMap.get(m.subCourseGroupId)!.push(m);
    } else {
      ungrouped.push(m);
    }
  }

  const result: T[] = [];
  for (const g of sortedGroups) {
    const groupMods = groupMap.get(g.id);
    if (groupMods && groupMods.length > 0) {
      result.push(...groupMods);
    }
  }
  result.push(...ungrouped);

  return result;
}
