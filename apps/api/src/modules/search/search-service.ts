/**
 * Search business logic and relevance ranking.
 *
 * Implements user-scoped search across:
 * 1. Accessible Courses (membership in owning organization OR system organization)
 * 2. Published Shared Content (Public Library Content Packs)
 *
 * Enforces relevance ranking:
 * - Exact title match: 100 pts
 * - Title starts with query: 80 pts
 * - Title word starts with query: 70 pts
 * - Title contains query: 60 pts
 * - Subject contains query: 40 pts
 * - Description contains query: 20 pts
 */

import { DomainError } from "@avana/domain";
import type { Actor, OrganizationId } from "@avana/domain";
import type { SearchStore } from "./search-store.js";
import type {
  SearchResponse,
  SearchResultItem,
} from "@avana/contracts";

export function computeRelevanceScore(
  title: string,
  query: string,
  subject?: string | null,
  description?: string | null,
): number {
  const normTitle = title.trim().toLowerCase();
  const normQuery = query.trim().toLowerCase();

  // 1. Exact title match
  if (normTitle === normQuery) {
    return 100;
  }

  // 2. Title starts with query
  if (normTitle.startsWith(normQuery)) {
    return 80;
  }

  // 3. Word in title starts with query
  const words = normTitle.split(/\s+/);
  if (words.some((w) => w.startsWith(normQuery))) {
    return 70;
  }

  // 4. Title contains query substring
  if (normTitle.includes(normQuery)) {
    return 60;
  }

  // 5. Subject contains query substring
  if (subject && subject.trim().toLowerCase().includes(normQuery)) {
    return 40;
  }

  // 6. Description contains query substring
  if (description && description.trim().toLowerCase().includes(normQuery)) {
    return 20;
  }

  return 10;
}

export class SearchService {
  constructor(
    private readonly store: SearchStore,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Search accessible courses and published shared content.
   */
  async search(
    actor: Actor,
    query: string,
    requestId: string,
    limit = 10,
  ): Promise<SearchResponse> {
    const trimmedQuery = query ? query.trim() : "";
    if (trimmedQuery.length === 0) {
      throw new DomainError("bad_request", "Search query is required");
    }

    const safeLimit = Math.max(1, Math.min(50, limit));

    // Parallel fetch: Accessible courses & Published content packs
    const [coursesList, sharedList] = await Promise.all([
      this.store.searchCourses(
        actor.userId,
        trimmedQuery,
        this.systemOrganizationId,
        safeLimit * 2,
      ),
      this.store.searchSharedContent(trimmedQuery, safeLimit * 2),
    ]);

    // Rank & format Course items
    const scoredCourses = coursesList.map((c) => {
      const score = computeRelevanceScore(
        c.name,
        trimmedQuery,
        c.subject,
        null,
      );
      const item: SearchResultItem = {
        id: c.id,
        type: "course",
        title: c.name,
        subtitle: c.subject || "دوره آموزشی",
        description: c.subject || null,
        target_url: `/courses/${c.id}`,
        metadata: {
          subject: c.subject,
          organizationId: c.organizationId,
        },
      };
      return { item, score, timestamp: new Date(c.createdAt).getTime() };
    });

    scoredCourses.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return a.item.title.localeCompare(b.item.title);
    });

    const formattedCourses = scoredCourses
      .slice(0, safeLimit)
      .map((sc) => sc.item);

    // Rank & format Shared Content items
    const scoredShared = sharedList.map((p) => {
      const score = computeRelevanceScore(
        p.title,
        trimmedQuery,
        p.subject,
        p.description,
      );
      const item: SearchResultItem = {
        id: p.id,
        type: "shared_content",
        title: p.title,
        subtitle: p.subject ? `${p.subject} • محتوای اشتراکی` : "محتوای اشتراکی",
        description: p.description || null,
        target_url: `/library?packId=${p.id}`,
        metadata: {
          subject: p.subject,
          usageCount: p.usageCount,
        },
      };
      return { item, score, timestamp: new Date(p.publishedAt).getTime() };
    });

    scoredShared.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return a.item.title.localeCompare(b.item.title);
    });

    const formattedShared = scoredShared
      .slice(0, safeLimit)
      .map((ss) => ss.item);

    // Combined scored results list
    const allScored = [...scoredCourses, ...scoredShared];
    allScored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return a.item.title.localeCompare(b.item.title);
    });

    const combinedResults = allScored
      .slice(0, safeLimit * 2)
      .map((entry) => entry.item);

    return {
      request_id: requestId,
      query: trimmedQuery,
      total: formattedCourses.length + formattedShared.length,
      results: combinedResults,
      grouped: {
        courses: formattedCourses,
        shared_content: formattedShared,
      },
    };
  }
}
