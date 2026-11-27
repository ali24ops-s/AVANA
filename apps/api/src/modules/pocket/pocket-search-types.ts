/**
 * AVANA Pocket — Clinical Discovery & Search Types & Contracts (UI-4.1).
 *
 * Provides strictly typed domain representations for:
 * 1. Unified Search across Medicines, Diseases, Treatments, Emergencies.
 * 2. Search Suggestions (Typeahead).
 * 3. Clinical Discovery (Category browsing).
 * 4. Related Clinical Entities (Relationship traversal).
 */

export type ClinicalSearchAggregateType = "all" | "drug" | "disease" | "treatment" | "emergency";

export type ClinicalPillarType = "drug" | "disease" | "treatment" | "emergency";

export const VALID_SEARCH_AGGREGATE_TYPES: readonly ClinicalSearchAggregateType[] = [
  "all",
  "drug",
  "disease",
  "treatment",
  "emergency",
] as const;

export const VALID_PILLAR_TYPES: readonly ClinicalPillarType[] = [
  "drug",
  "disease",
  "treatment",
  "emergency",
] as const;

export interface ClinicalVerificationStatus {
  isClinicallyVerified: boolean;
  verifiedAssertionsCount: number;
  totalAssertionsCount: number;
  lastVerifiedAt: string | null;
}

export interface PocketSearchResultItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  summary: string;
  publishedAt: string | null;
  versionNumber: number;
  relevanceScore: number;
  matchField: "name_fa" | "name_en" | "brand_name" | "alias" | "classification" | "summary";
  matchedTerm: string;
  verification: ClinicalVerificationStatus;
}

export interface PocketSearchResponse {
  items: PocketSearchResultItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  query: string;
}

export interface PocketSearchSuggestion {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  matchSource: "name_fa" | "name_en" | "brand_name" | "alias" | "classification";
  matchedText: string;
}

export interface PocketSuggestionsResponse {
  query: string;
  suggestions: PocketSearchSuggestion[];
}

export type DiscoverySortOption = "recent" | "name_asc" | "name_desc";
export const VALID_DISCOVERY_SORT_OPTIONS: readonly DiscoverySortOption[] = [
  "recent",
  "name_asc",
  "name_desc",
] as const;

export interface PocketDiscoveryItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  summary: string;
  category: string;
  publishedAt: string | null;
  versionNumber: number;
  verification: ClinicalVerificationStatus;
}

export interface PocketDiscoveryResponse {
  items: PocketDiscoveryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  type: ClinicalSearchAggregateType;
  category?: string;
}

export interface PocketRelatedEntityItem {
  id: string;
  slug: string;
  type: ClinicalPillarType;
  titleEn: string;
  titleFa: string;
  classification: string;
  relationshipType: string;
  clinicalNotes?: string | null;
  verification: ClinicalVerificationStatus;
}

export interface PocketRelatedGroup {
  relationshipCategory: "indicated_diseases" | "treatments" | "interactions" | "medications" | "associated_conditions";
  relationshipLabelFa: string;
  entities: PocketRelatedEntityItem[];
}

export interface PocketRelatedEntitiesResponse {
  aggregateType: ClinicalPillarType;
  aggregateId: string;
  groups: PocketRelatedGroup[];
}
