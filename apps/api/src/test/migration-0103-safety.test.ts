import { describe, it, expect } from "vitest";

interface CourseRow {
  id: string;
  name: string;
  slug: string | null;
  is_official: boolean;
  status: string;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Simulates the deterministic SQL logic executed in Migration 0103.
 */
function runMigration0103Backfill(courses: CourseRow[]) {
  const KNOWN_MAPPINGS: Record<string, string> = {
    "شیمی دارویی ۱": "medicinal-chemistry-1",
    "شیمی دارویی ۲": "medicinal-chemistry-2",
    "شیمی دارویی ۳": "medicinal-chemistry-3",
    "فارماسیوتیکس ۱": "pharmaceutics-1",
    "فارماکولوژی ۱": "pharmacology-1",
    "فارماکولوژی ۲": "pharmacology-2",
    "بافت شناسی": "histology",
    "بافت‌شناسی": "histology",
    "آناتومی قلب": "anatomy-heart",
  };

  // Step 3: Authoritative Backfill for known mappings
  // In SQL: ROW_NUMBER() OVER (PARTITION BY m.target_slug ORDER BY c.is_official DESC, c.created_at ASC)
  // Candidate rows: active (deleted_at IS NULL) and (slug IS NULL OR slug = '')
  for (const [targetName, targetSlug] of Object.entries(KNOWN_MAPPINGS)) {
    // Check NOT EXISTS (slug already taken by an active course)
    const alreadyTaken = courses.some(
      (c) => c.deleted_at === null && c.slug === targetSlug,
    );
    if (alreadyTaken) continue;

    const matchingCandidates = courses
      .filter(
        (c) =>
          c.name === targetName &&
          c.deleted_at === null &&
          (!c.slug || c.slug.trim() === ""),
      )
      .sort((a, b) => {
        // is_official DESC
        if (a.is_official !== b.is_official) {
          return a.is_official ? -1 : 1;
        }
        // created_at ASC
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    if (matchingCandidates.length > 0) {
      const authoritative = matchingCandidates[0];
      authoritative.slug = targetSlug;
    }
  }

  // Step 4: Fallback Backfill with collision-proof shortId
  const prefixMap = new Map<string, number>();
  const remaining = courses
    .filter((c) => !c.slug || c.slug.trim() === "")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const c of remaining) {
    const basePrefix = `course-${c.id.replace(/-/g, "").substring(0, 8)}`;
    const count = (prefixMap.get(basePrefix) ?? 0) + 1;
    prefixMap.set(basePrefix, count);

    c.slug = count === 1 ? basePrefix : `${basePrefix}-${count}`;
  }
}

describe("Migration 0103 Safety & Collision Defense Test", () => {
  it("Scenario 1: Multiple courses with identical names (official vs unofficial vs draft) assign authoritative slug safely", () => {
    const courses: CourseRow[] = [
      {
        id: "11111111-0000-4000-a000-000000000001",
        name: "شیمی دارویی ۱",
        slug: null,
        is_official: false,
        status: "published",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
      },
      {
        id: "22222222-0000-4000-a000-000000000002",
        name: "شیمی دارویی ۱", // Duplicate name, but official!
        slug: null,
        is_official: true,
        status: "published",
        created_at: "2024-01-02T00:00:00Z",
        deleted_at: null,
      },
      {
        id: "33333333-0000-4000-a000-000000000003",
        name: "شیمی دارویی ۱", // Third duplicate, personal course
        slug: null,
        is_official: false,
        status: "draft",
        created_at: "2024-01-03T00:00:00Z",
        deleted_at: null,
      },
    ];

    runMigration0103Backfill(courses);

    // Official course MUST receive the canonical slug
    const officialCourse = courses.find((c) => c.id === "22222222-0000-4000-a000-000000000002");
    expect(officialCourse?.slug).toBe("medicinal-chemistry-1");

    // Other courses MUST receive unique fallback slugs
    const unofficial1 = courses.find((c) => c.id === "11111111-0000-4000-a000-000000000001");
    expect(unofficial1?.slug).toBe("course-11111111");

    const unofficial2 = courses.find((c) => c.id === "33333333-0000-4000-a000-000000000003");
    expect(unofficial2?.slug).toBe("course-33333333");

    // Verify all active slugs are strictly unique
    const activeSlugs = courses.filter((c) => c.deleted_at === null).map((c) => c.slug);
    const uniqueSlugs = new Set(activeSlugs);
    expect(uniqueSlugs.size).toBe(courses.length);
  });

  it("Scenario 2: Preserves existing valid slugs and does NOT overwrite them", () => {
    const courses: CourseRow[] = [
      {
        id: "44444444-0000-4000-a000-000000000004",
        name: "فارماکولوژی ۲",
        slug: "custom-pharma-2-slug", // Already set
        is_official: true,
        status: "published",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
      },
      {
        id: "55555555-0000-4000-a000-000000000005",
        name: "فارماکولوژی ۲",
        slug: null,
        is_official: false,
        status: "published",
        created_at: "2024-01-02T00:00:00Z",
        deleted_at: null,
      },
    ];

    runMigration0103Backfill(courses);

    const existingCourse = courses.find((c) => c.id === "44444444-0000-4000-a000-000000000004");
    expect(existingCourse?.slug).toBe("custom-pharma-2-slug");

    const secondCourse = courses.find((c) => c.id === "55555555-0000-4000-a000-000000000005");
    expect(secondCourse?.slug).toBe("pharmacology-2");
  });

  it("Scenario 3: Soft-deleted courses do not block authoritative assignment of active courses", () => {
    const courses: CourseRow[] = [
      {
        id: "66666666-0000-4000-a000-000000000006",
        name: "فارماسیوتیکس ۱",
        slug: null,
        is_official: true,
        status: "published",
        created_at: "2023-01-01T00:00:00Z",
        deleted_at: "2023-06-01T00:00:00Z", // Soft deleted!
      },
      {
        id: "77777777-0000-4000-a000-000000000007",
        name: "فارماسیوتیکس ۱",
        slug: null,
        is_official: true,
        status: "published",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null, // Active
      },
    ];

    runMigration0103Backfill(courses);

    const activeCourse = courses.find((c) => c.id === "77777777-0000-4000-a000-000000000007");
    expect(activeCourse?.slug).toBe("pharmaceutics-1");

    const deletedCourse = courses.find((c) => c.id === "66666666-0000-4000-a000-000000000006");
    expect(deletedCourse?.slug).toBe("course-66666666");
  });

  it("Scenario 4: Idempotent rerun does not alter assigned slugs or produce conflicts", () => {
    const courses: CourseRow[] = [
      {
        id: "88888888-0000-4000-a000-000000000008",
        name: "بافت شناسی",
        slug: null,
        is_official: true,
        status: "published",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
      },
      {
        id: "99999999-0000-4000-a000-000000000009",
        name: "بافت‌شناسی", // Variant with half-space
        slug: null,
        is_official: false,
        status: "published",
        created_at: "2024-01-02T00:00:00Z",
        deleted_at: null,
      },
    ];

    // Run first time
    runMigration0103Backfill(courses);
    const slug1 = courses[0].slug;
    const slug2 = courses[1].slug;

    expect(slug1).toBe("histology");
    expect(slug2).toBe("course-99999999");

    // Run second time (retry simulation)
    runMigration0103Backfill(courses);

    expect(courses[0].slug).toBe(slug1);
    expect(courses[1].slug).toBe(slug2);
  });
});
