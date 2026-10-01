/**
 * Concept-driven mapping connecting pharmacological educational concepts to
 * existing canonical chart specifications (PHARMACOLOGY_CANONICAL_CHARTS).
 *
 * Lightweight, deterministic, and extensible.
 */

import { PHARMACOLOGY_CANONICAL_CHARTS } from "./pharmacology-lesson-enrichment.js";
import type { EducationalChart } from "./types.js";

export type CanonicalPharmacologyConceptKey =
  | "dose_response"
  | "competitive_antagonist"
  | "full_vs_partial_agonist"
  | "inverse_agonist";

/**
 * Matches an educational concept title or description to a known canonical concept key.
 * Normalizes text to lowercase and ignores Persian zero-width non-joiners.
 */
export function matchCanonicalConceptKey(text: string): CanonicalPharmacologyConceptKey | null {
  if (!text || typeof text !== "string") return null;

  const normalized = text
    .toLowerCase()
    .replace(/\u200C/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1. Competitive Antagonism
  if (
    normalized.includes("آنتاگونیسم رقابتی") ||
    normalized.includes("مهارکننده رقابتی") ||
    normalized.includes("competitive antagonist") ||
    normalized.includes("competitive antagonism") ||
    normalized.includes("شیفت موازی به راست") ||
    normalized.includes("شیفت به راست") ||
    normalized.includes("parallel rightward shift") ||
    normalized.includes("rightward shift")
  ) {
    return "competitive_antagonist";
  }

  // 2. Full vs Partial Agonist
  if (
    normalized.includes("آگونیست جزئی") ||
    normalized.includes("آگونیست نسبی") ||
    normalized.includes("partial agonist") ||
    normalized.includes("full vs partial") ||
    normalized.includes("آگونیست کامل و جزئی") ||
    normalized.includes("آگونیست کامل در برابر جزئی")
  ) {
    return "full_vs_partial_agonist";
  }

  // 3. Inverse Agonist & Two-State Model
  if (
    normalized.includes("آگونیست معکوس") ||
    normalized.includes("inverse agonist") ||
    normalized.includes("constitutive activity") ||
    normalized.includes("آنتاگونیست خنثی") ||
    normalized.includes("neutral antagonist")
  ) {
    return "inverse_agonist";
  }

  // 4. Basic Dose-Response & Emax / EC50
  if (
    normalized.includes("غلظت-پاسخ") ||
    normalized.includes("غلظت پاسخ") ||
    normalized.includes("دوز-پاسخ") ||
    normalized.includes("دوز پاسخ") ||
    normalized.includes("dose-response") ||
    normalized.includes("dose response") ||
    normalized.includes("منحنی غلظت") ||
    normalized.includes("منحنی دوز") ||
    normalized.includes("concentration-response") ||
    normalized.includes("concentration response")
  ) {
    return "dose_response";
  }

  return null;
}

/**
 * Returns the canonical EducationalChart specification for a recognized canonical concept key.
 */
export function getCanonicalChartForConcept(
  conceptKey: CanonicalPharmacologyConceptKey,
): EducationalChart {
  switch (conceptKey) {
    case "dose_response":
      return PHARMACOLOGY_CANONICAL_CHARTS.doseResponse;
    case "competitive_antagonist":
      return PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist;
    case "full_vs_partial_agonist":
      return PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist;
    case "inverse_agonist":
      return PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist;
  }
}
