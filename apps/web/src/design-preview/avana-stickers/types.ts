import React from "react";

export type StickerConceptId = "concept-a" | "concept-b" | "concept-c";

export type StickerTopicId =
  | "greeting-hand"
  | "learning"
  | "idea"
  | "success"
  | "progress"
  | "empty-state";

export interface StickerMeta {
  id: string;
  topicId: StickerTopicId;
  conceptId: StickerConceptId;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  intendedUsageFa: string;
  Component: React.FC<{ size?: number; className?: string; title?: string }>;
}

export interface ConceptMeta {
  id: StickerConceptId;
  nameEn: string;
  nameFa: string;
  badgeFa: string;
  philosophyFa: string;
  styleTraitsFa: string[];
  recommendedSizes: string;
  strengthsFa: string[];
  considerationsFa: string[];
}
