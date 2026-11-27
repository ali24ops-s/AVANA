/**
 * AVANA Pocket — Centralized Clinical Quorum Policy (Phase 6.3.2 — Phase A Foundation).
 *
 * Centralizes `requiredApprovals` resolution for clinical verification across
 * Consumption, Search, and Publishing without scattering conditional rules.
 *
 * IMPORTANT GOVERNANCE NOTICE:
 * All numeric quorum defaults in `PROVISIONAL_QUORUM_POLICY_CONFIG` are
 * PROVISIONAL engineering defaults and have NOT yet received formal sign-off
 * from the AVANA Clinical Lead.
 *
 * Fail-Closed Guarantee:
 * - Unknown, null, empty, or unmapped `assertionType` values NEVER default to 1.
 *   They always fall back to the fail-closed fallback (2).
 * - High-risk aggregate pillars (e.g. `emergency`) enforce at least 2 approvals
 *   even if an unmapped or lower-tier assertionType is provided.
 */

import type { ClinicalAggregateType } from "./assertion-consumption-store.js";

export interface ClinicalQuorumInput {
  aggregateType?: ClinicalAggregateType | string | null;
  assertionType?: string | null;
}

export interface ClinicalQuorumResolution {
  requiredApprovals: number;
  matchedRuleKey: string;
  isProvisionalDefault: boolean;
  isFailClosedFallback: boolean;
  rationale: string;
}

export interface ClinicalQuorumPolicyConfig {
  /**
   * Explicit mapping of normalized `assertionType` keys to required reviewer approvals.
   * PROVISIONAL — pending formal Clinical Lead approval.
   */
  byAssertionType: Readonly<Record<string, number>>;
  /**
   * Minimum approvals required for specific clinical pillars (e.g. emergencies).
   * Applied as `Math.max(typeRequirement, pillarMinimum)` so high-risk pillars
   * cannot be downgraded.
   */
  byAggregateMinimum: Readonly<Partial<Record<ClinicalAggregateType, number>>>;
  /**
   * Fail-closed fallback used when `assertionType` is missing, blank, or unmapped.
   * Must be >= 2 to prevent accidental single-reviewer sign-off on unknown types.
   */
  unknownAssertionTypeFallback: number;
}

/**
 * PROVISIONAL clinical quorum defaults (awaiting Clinical Lead sign-off).
 *
 * Conceptual mapping aligned with Phase 6.3.2 Architecture Finalization:
 * - General information / Mechanism of action: 1 (provisional)
 * - Dosing & regimens / Emergencies / Critical safety warnings / High-risk interactions: 2 (provisional)
 * - Unknown / unmapped assertion types: 2 (fail-closed)
 */
export const PROVISIONAL_QUORUM_POLICY_CONFIG: ClinicalQuorumPolicyConfig = {
  byAssertionType: {
    // Low-risk informational categories (PROVISIONAL: 1)
    general_info: 1,
    general_information: 1,
    mechanism_of_action: 1,
    pharmacology_mechanism: 1,

    // Dosing & therapeutic regimens (PROVISIONAL: 2)
    dosing: 2,
    dosing_rule: 2,
    renal_adjustment: 2,
    hepatic_adjustment: 2,

    // Emergencies (PROVISIONAL: 2)
    emergency: 2,
    emergency_protocol: 2,
    emergency_triage: 2,
    emergency_medication: 2,

    // Critical safety warnings & contraindications (PROVISIONAL: 2)
    safety_warning: 2,
    black_box_warning: 2,
    contraindication: 2,
    pregnancy_lactation: 2,
    toxicity_overdose: 2,

    // High-risk drug interactions (PROVISIONAL: 2)
    interaction: 2,
    drug_interaction: 2,
    high_risk_interaction: 2,
  },
  byAggregateMinimum: {
    emergency: 2,
  },
  unknownAssertionTypeFallback: 2,
};

function normalizePolicyKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function sanitizePositiveQuorum(value: number | undefined, failClosedMin: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return failClosedMin;
  }
  return value;
}

/**
 * Configurable centralized Clinical Quorum Policy.
 */
export class ClinicalQuorumPolicy {
  private readonly config: ClinicalQuorumPolicyConfig;
  private readonly isProvisional: boolean;

  constructor(
    config: ClinicalQuorumPolicyConfig = PROVISIONAL_QUORUM_POLICY_CONFIG,
    options?: { isProvisionalDefault?: boolean },
  ) {
    const safeFallback = sanitizePositiveQuorum(config.unknownAssertionTypeFallback, 2);
    this.config = {
      byAssertionType: { ...config.byAssertionType },
      byAggregateMinimum: { ...config.byAggregateMinimum },
      unknownAssertionTypeFallback: Math.max(2, safeFallback),
    };
    this.isProvisional = options?.isProvisionalDefault ?? config === PROVISIONAL_QUORUM_POLICY_CONFIG;
  }

  /**
   * Resolves `requiredApprovals` for an assertion using its `assertionType` and `aggregateType`.
   * Fail-closed: unknown or unmapped types never default to 1.
   */
  resolve(input: ClinicalQuorumInput): ClinicalQuorumResolution {
    const normalizedType = normalizePolicyKey(input.assertionType);
    const normalizedAggregate = normalizePolicyKey(input.aggregateType) as ClinicalAggregateType;

    const aggregateMinimum = this.config.byAggregateMinimum[normalizedAggregate];
    const hasAggregateMinimum =
      typeof aggregateMinimum === "number" && Number.isInteger(aggregateMinimum) && aggregateMinimum >= 1;

    const mappedValue = normalizedType ? this.config.byAssertionType[normalizedType] : undefined;
    const isMapped = typeof mappedValue === "number" && Number.isInteger(mappedValue) && mappedValue >= 1;

    if (!isMapped) {
      const baseFallback = this.config.unknownAssertionTypeFallback;
      const requiredApprovals = hasAggregateMinimum
        ? Math.max(baseFallback, aggregateMinimum)
        : baseFallback;

      return {
        requiredApprovals,
        matchedRuleKey: normalizedType
          ? `fallback:unmapped_assertion_type:${normalizedType}`
          : "fallback:missing_assertion_type",
        isProvisionalDefault: this.isProvisional,
        isFailClosedFallback: true,
        rationale: normalizedType
          ? `Unmapped assertionType '${normalizedType}' triggered fail-closed fallback (${requiredApprovals} approvals).`
          : `Missing assertionType triggered fail-closed fallback (${requiredApprovals} approvals).`,
      };
    }

    const requiredApprovals = hasAggregateMinimum
      ? Math.max(mappedValue, aggregateMinimum)
      : mappedValue;

    const ruleKey =
      hasAggregateMinimum && aggregateMinimum > mappedValue
        ? `aggregate_minimum:${normalizedAggregate}`
        : `assertion_type:${normalizedType}`;

    return {
      requiredApprovals,
      matchedRuleKey: ruleKey,
      isProvisionalDefault: this.isProvisional,
      isFailClosedFallback: false,
      rationale:
        hasAggregateMinimum && aggregateMinimum > mappedValue
          ? `Aggregate pillar '${normalizedAggregate}' minimum (${aggregateMinimum}) superseded assertionType '${normalizedType}' (${mappedValue}).`
          : `Resolved from centralized quorum rule '${normalizedType}' (${requiredApprovals} approvals).`,
    };
  }
}

export const DEFAULT_CLINICAL_QUORUM_POLICY = new ClinicalQuorumPolicy(
  PROVISIONAL_QUORUM_POLICY_CONFIG,
  { isProvisionalDefault: true },
);

export function resolveRequiredApprovals(
  input: ClinicalQuorumInput,
  policy: ClinicalQuorumPolicy = DEFAULT_CLINICAL_QUORUM_POLICY,
): ClinicalQuorumResolution {
  return policy.resolve(input);
}
