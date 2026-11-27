/**
 * AVANA Pocket — In-Memory Search Store for Testing (UI-4.1).
 *
 * Dedicated test infrastructure store providing hermetic, fast, and deterministic
 * search, suggestions, discovery, and relationship traversal without requiring
 * an external PostgreSQL connection.
 */

import type {
  DiscoveryStoreParams,
  PocketSearchStore,
  SearchPublishedStoreParams,
  SuggestionsStoreParams,
} from "../pocket-search-store.js";
import type {
  ClinicalPillarType,
  ClinicalVerificationStatus,
  PocketDiscoveryItem,
  PocketDiscoveryResponse,
  PocketRelatedEntitiesResponse,
  PocketRelatedGroup,
  PocketSearchResponse,
  PocketSearchResultItem,
  PocketSearchSuggestion,
  PocketSuggestionsResponse,
} from "../pocket-search-types.js";
import {
  calculateClinicalRelevanceScore,
  compareUnicodeCodePoint,
  getNormalizedTitleSortKey,
  normalizeClinicalText,
} from "../pocket-text-normalizer.js";

export interface MockEntityData {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  summary: string;
  category: string;
  status: "draft" | "published" | "archived";
  versionNumber: number;
  publishedAt: string | null;
  brandNames?: string[];
  aliases?: string[];
  verification?: ClinicalVerificationStatus;
}

export interface MockRelationData {
  sourceType: ClinicalPillarType;
  sourceId: string;
  targetType: ClinicalPillarType;
  targetId: string;
  relationshipCategory: "indicated_diseases" | "treatments" | "interactions" | "medications" | "associated_conditions";
  relationshipLabelFa: string;
  relationshipType: string;
  clinicalNotes?: string | null;
}

export class InMemoryPocketSearchStore implements PocketSearchStore {
  private readonly entities = new Map<string, MockEntityData>();
  private readonly relations: MockRelationData[] = [];

  registerEntity(entity: MockEntityData): void {
    this.entities.set(`${entity.type}:${entity.id}`, { ...entity });
  }

  registerRelation(relation: MockRelationData): void {
    this.relations.push({ ...relation });
  }

  clear(): void {
    this.entities.clear();
    this.relations.length = 0;
  }

  async searchPublished(params: SearchPublishedStoreParams): Promise<PocketSearchResponse> {
    const { query = "", type, limit, offset } = params;
    const rawQ = query.trim();
    const normQ = normalizeClinicalText(rawQ);

    const scoredItems: Array<PocketSearchResultItem & { sortKey: string }> = [];

    for (const entity of this.entities.values()) {
      // 1. Publication isolation: strictly published only!
      if (entity.status !== "published") {
        continue;
      }

      // 2. Type filtering
      if (type !== "all" && entity.type !== type) {
        continue;
      }

      const scoring = calculateClinicalRelevanceScore({
        normalizedQuery: normQ,
        normalizedTitleFa: normalizeClinicalText(entity.titleFa),
        normalizedTitleEn: normalizeClinicalText(entity.titleEn),
        normalizedBrandNames: (entity.brandNames ?? []).map(normalizeClinicalText),
        normalizedAliases: (entity.aliases ?? []).map(normalizeClinicalText),
        normalizedClassification: normalizeClinicalText(entity.classification),
        normalizedSummary: normalizeClinicalText(entity.summary),
      });

      // If query was provided, only include if score > 10 (or if query matched something)
      if (normQ.length > 0 && scoring.score <= 10) {
        continue;
      }

      scoredItems.push({
        id: entity.id,
        slug: entity.slug,
        type: entity.type,
        titleEn: entity.titleEn,
        titleFa: entity.titleFa,
        classification: entity.classification,
        summary: entity.summary,
        publishedAt: entity.publishedAt,
        versionNumber: entity.versionNumber,
        relevanceScore: normQ.length === 0 ? 100 : scoring.score,
        matchField: scoring.matchField,
        matchedTerm: scoring.matchedTerm,
        verification: entity.verification ?? {
          isClinicallyVerified: false,
          verifiedAssertionsCount: 0,
          totalAssertionsCount: 0,
          lastVerifiedAt: null,
        },
        sortKey: getNormalizedTitleSortKey(entity.titleFa),
      });
    }

    // Deterministic sort: score DESC, normalized_title_sort_key ASC, type ASC, id ASC
    scoredItems.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      const titleCmp = compareUnicodeCodePoint(a.sortKey, b.sortKey);
      if (titleCmp !== 0) return titleCmp;
      const typeCmp = compareUnicodeCodePoint(a.type, b.type);
      if (typeCmp !== 0) return typeCmp;
      return compareUnicodeCodePoint(a.id, b.id);
    });

    const total = scoredItems.length;
    const paginatedSlice = scoredItems.slice(offset, offset + limit);

    return {
      items: paginatedSlice.map(({ sortKey: _sk, ...item }) => item),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      query: rawQ,
    };
  }

  async getSuggestions(params: SuggestionsStoreParams): Promise<PocketSuggestionsResponse> {
    const { query, type, limit } = params;
    const rawQ = query.trim();
    const normQ = normalizeClinicalText(rawQ);

    if (normQ.length === 0) {
      return { query: rawQ, suggestions: [] };
    }

    const searchRes = await this.searchPublished({
      query: rawQ,
      type,
      limit: Math.min(10, Math.max(1, limit)),
      offset: 0,
    });

    const suggestions: PocketSearchSuggestion[] = searchRes.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      type: item.type,
      titleEn: item.titleEn,
      titleFa: item.titleFa,
      classification: item.classification,
      matchSource: item.matchField === "summary" ? "name_fa" : item.matchField,
      matchedText: item.matchedTerm || item.titleFa,
    }));

    return {
      query: rawQ,
      suggestions,
    };
  }

  async getDiscovery(params: DiscoveryStoreParams): Promise<PocketDiscoveryResponse> {
    const { type, category, sort, limit, offset } = params;

    const matchedRecords: PocketDiscoveryItem[] = [];

    for (const entity of this.entities.values()) {
      // 1. Publication isolation
      if (entity.status !== "published") {
        continue;
      }

      // 2. Type filtering
      if (type !== "all" && entity.type !== type) {
        continue;
      }

      // 3. Category filtering (strictly backed by actual field)
      if (category && category.trim()) {
        const normCat = normalizeClinicalText(category);
        const entityCat = normalizeClinicalText(entity.category);
        if (entityCat !== normCat) {
          continue;
        }
      }

      matchedRecords.push({
        id: entity.id,
        slug: entity.slug,
        type: entity.type,
        titleEn: entity.titleEn,
        titleFa: entity.titleFa,
        classification: entity.classification,
        summary: entity.summary,
        category: entity.category,
        publishedAt: entity.publishedAt,
        versionNumber: entity.versionNumber,
        verification: entity.verification ?? {
          isClinicallyVerified: false,
          verifiedAssertionsCount: 0,
          totalAssertionsCount: 0,
          lastVerifiedAt: null,
        },
      });
    }

    // Deterministic sorting
    matchedRecords.sort((a, b) => {
      if (sort === "name_asc") {
        const cmp = a.titleFa.localeCompare(b.titleFa, "fa");
        if (cmp !== 0) return cmp;
      } else if (sort === "name_desc") {
        const cmp = b.titleFa.localeCompare(a.titleFa, "fa");
        if (cmp !== 0) return cmp;
      } else {
        // 'recent'
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
      }
      const typeCmp = compareUnicodeCodePoint(a.type, b.type);
      if (typeCmp !== 0) return typeCmp;
      return compareUnicodeCodePoint(a.id, b.id);
    });

    const total = matchedRecords.length;
    const paginatedSlice = matchedRecords.slice(offset, offset + limit);

    return {
      items: paginatedSlice,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      type,
      category,
    };
  }

  async getRelatedEntities(
    type: ClinicalPillarType,
    id: string,
  ): Promise<PocketRelatedEntitiesResponse | null> {
    let root = this.entities.get(`${type}:${id}`);
    if (!root) {
      for (const ent of this.entities.values()) {
        if (ent.type === type && ent.slug === id) {
          root = ent;
          break;
        }
      }
    }
    if (!root || root.status !== "published") {
      return null;
    }

    const canonicalId = root.id;

    const groupsMap = new Map<
      string,
      {
        category: PocketRelatedGroup["relationshipCategory"];
        labelFa: string;
        entities: Map<string, PocketRelatedGroup["entities"][number]>;
      }
    >();

    for (const rel of this.relations) {
      if (rel.sourceType === type && rel.sourceId === canonicalId) {
        const target = this.entities.get(`${rel.targetType}:${rel.targetId}`);
        // Publication isolation: target must also be published!
        if (!target || target.status !== "published") {
          continue;
        }

        const grpKey = rel.relationshipCategory;
        if (!groupsMap.has(grpKey)) {
          groupsMap.set(grpKey, {
            category: rel.relationshipCategory,
            labelFa: rel.relationshipLabelFa,
            entities: new Map(),
          });
        }

        const entityKey = `${target.type}:${target.id}`;
        const groupEntities = groupsMap.get(grpKey)!.entities;
        const existing = groupEntities.get(entityKey);

        if (!existing) {
          groupEntities.set(entityKey, {
            id: target.id,
            slug: target.slug,
            type: target.type,
            titleEn: target.titleEn,
            titleFa: target.titleFa,
            classification: target.classification,
            relationshipType: rel.relationshipType,
            clinicalNotes: rel.clinicalNotes,
            verification: target.verification ?? {
              isClinicallyVerified: false,
              verifiedAssertionsCount: 0,
              totalAssertionsCount: 0,
              lastVerifiedAt: null,
            },
          });
        } else {
          // Merge relationship types
          const types = new Set(
            [...existing.relationshipType.split(", "), ...rel.relationshipType.split(", ")]
              .map((s) => s.trim())
              .filter(Boolean),
          );
          existing.relationshipType = Array.from(types).join(", ");

          // Merge clinical notes
          const notes = [existing.clinicalNotes, rel.clinicalNotes]
            .map((n) => n?.trim())
            .filter((n): n is string => Boolean(n && n.length > 0));
          const uniqueNotes = Array.from(new Set(notes));
          existing.clinicalNotes = uniqueNotes.length > 0 ? uniqueNotes.join(" | ") : null;
        }
      }
    }

    const groups: PocketRelatedGroup[] = Array.from(groupsMap.values()).map((g) => {
      const entityList = Array.from(g.entities.values());
      entityList.sort((a, b) => a.titleFa.localeCompare(a.titleFa, "fa") || a.id.localeCompare(b.id));
      return {
        relationshipCategory: g.category,
        relationshipLabelFa: g.labelFa,
        entities: entityList,
      };
    });

    return {
      aggregateType: type,
      aggregateId: canonicalId,
      groups,
    };
  }

  async getVerificationStatusBatch(
    items: Array<{ type: ClinicalPillarType; id: string }>,
  ): Promise<Map<string, ClinicalVerificationStatus>> {
    const map = new Map<string, ClinicalVerificationStatus>();
    for (const item of items) {
      const entity = this.entities.get(`${item.type}:${item.id}`);
      map.set(`${item.type}:${item.id}`, entity?.verification ?? {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 0,
        lastVerifiedAt: null,
      });
    }
    return map;
  }

  async getVerificationStatusForAggregate(
    type: ClinicalPillarType,
    id: string,
  ): Promise<ClinicalVerificationStatus> {
    const map = await this.getVerificationStatusBatch([{ type, id }]);
    return map.get(`${type}:${id}`) ?? {
      isClinicallyVerified: false,
      verifiedAssertionsCount: 0,
      totalAssertionsCount: 0,
      lastVerifiedAt: null,
    };
  }
}
