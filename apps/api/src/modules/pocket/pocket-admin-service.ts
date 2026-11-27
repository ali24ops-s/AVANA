/**
 * AVANA Pocket — Admin Dashboard Service (Phase 2.1).
 *
 * Strictly restricted to platform_admin.
 * Aggregates assertion counts, operational counts, and authoritative
 * Resolver-evaluated clinical verification metrics without exposing any
 * sensitive reviewer PII.
 */

import { DomainError, type Actor } from "@avana/domain";
import { VALID_CLINICAL_AGGREGATE_TYPES, type ClinicalAggregateType } from "./assertion-consumption-store.js";
import type { AssertionVerificationStore } from "./assertion-verification-store.js";
import type { ClinicalQuorumPolicy } from "./clinical-quorum-policy.js";
import type { ReviewerService } from "./reviewer-service.js";
import {
  buildClinicalVerificationCountsFromSummaries,
  type PocketAdminAssertionDetail,
  type PocketAdminAssertionsQuery,
  type PocketAdminAssertionsResult,
  type PocketAdminStore,
  type PocketAdminSummary,
  type PocketReviewerAssertionDetail,
} from "./pocket-admin-store.js";

const REVIEWER_ELIGIBLE_STATUSES = ["reviewed", "verified", "published"] as const;

const VALID_ASSERTION_STATUSES = new Set([
  "draft",
  "in_review",
  "reviewed",
  "verified",
  "published",
  "superseded",
  "retired",
]);

export interface PocketAdminServiceDeps {
  adminStore: PocketAdminStore;
  reviewerService?: ReviewerService;
  verificationStore?: AssertionVerificationStore;
  quorumPolicy?: ClinicalQuorumPolicy;
}

export class PocketAdminService {
  private readonly store: PocketAdminStore;
  private readonly reviewerService?: ReviewerService;
  private readonly verificationStore?: AssertionVerificationStore;
  private readonly quorumPolicy?: ClinicalQuorumPolicy;

  constructor(deps: PocketAdminServiceDeps) {
    this.store = deps.adminStore;
    this.reviewerService = deps.reviewerService;
    this.verificationStore = deps.verificationStore;
    this.quorumPolicy = deps.quorumPolicy;
  }

  private assertPlatformAdmin(actor: Actor): void {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }

    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isPlatformAdmin) {
      throw new DomainError(
        "forbidden",
        "Access denied: Pocket admin dashboard summary is restricted to platform_admin",
      );
    }
  }

  async getDashboardSummary(actor: Actor): Promise<PocketAdminSummary> {
    this.assertPlatformAdmin(actor);

    const [assertions, contexts, operations] = await Promise.all([
      this.store.getAssertionStatusCounts(),
      this.store.getClinicalAssertionContextsForSummary(),
      this.store.getOperationalCounts(),
    ]);

    const summaries = await this.store.resolveVerificationSummaries(
      contexts,
      this.quorumPolicy,
    );
    const clinical = buildClinicalVerificationCountsFromSummaries(summaries);

    return {
      assertions,
      clinical,
      operations,
      generatedAt: new Date().toISOString(),
    };
  }

  async listAssertions(
    actor: Actor,
    query: PocketAdminAssertionsQuery = {},
  ): Promise<PocketAdminAssertionsResult> {
    this.assertPlatformAdmin(actor);

    const status = query.status?.trim();
    if (status && !VALID_ASSERTION_STATUSES.has(status)) {
      throw new DomainError("bad_request", `Invalid assertion status filter '${status}'`);
    }

    const aggregateType = query.aggregateType?.trim() as ClinicalAggregateType | undefined;
    if (aggregateType && !VALID_CLINICAL_AGGREGATE_TYPES.includes(aggregateType)) {
      throw new DomainError(
        "bad_request",
        `Invalid aggregateType filter '${aggregateType}'`,
      );
    }

    const sortBy = query.sortBy === "createdAt" ? "createdAt" : "updatedAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100);
    const offset = Math.max(Number(query.offset ?? 0) || 0, 0);

    const { rows, totalCount } = await this.store.listAssertions({
      status: status || undefined,
      aggregateType,
      q: query.q,
      sortBy,
      sortOrder,
      limit,
      offset,
    });

    const contexts = rows.map((row) => ({
      assertionId: row.id,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      assertionType: row.assertionType,
    }));

    const summaries = await this.store.resolveVerificationSummaries(
      contexts,
      this.quorumPolicy,
    );

    const items = rows.map((row) => {
      const s = summaries.get(row.id);
      return {
        id: row.id,
        assertionRootId: row.assertionRootId,
        versionNumber: row.versionNumber,
        assertionKey: row.assertionKey,
        statementText: row.statementText,
        assertionType: row.assertionType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        aggregateTitleFa: row.aggregateTitleFa,
        aggregateTitleEn: row.aggregateTitleEn,
        aggregateSlug: row.aggregateSlug,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        clinicalSummary: s
          ? {
              isClinicallyVerified: s.isClinicallyVerified,
              quorumSatisfied: s.quorumSatisfied,
              requiredApprovals: s.requiredApprovals,
              validApprovalCount: s.validApprovalCount,
              validRejectionCount: s.validRejectionCount,
              activeDisagreement: s.activeDisagreement,
              hasActiveConflict: s.hasActiveConflict,
              hasActiveSafetyOverride: s.hasActiveSafetyOverride,
              verificationBlockReasons: s.verificationBlockReasons,
            }
          : {
              isClinicallyVerified: false,
              quorumSatisfied: false,
              requiredApprovals: 2,
              validApprovalCount: 0,
              validRejectionCount: 0,
              activeDisagreement: false,
              hasActiveConflict: false,
              hasActiveSafetyOverride: false,
              verificationBlockReasons: ["no_verifications" as const],
            },
      };
    });

    return {
      items,
      totalCount,
      limit,
      offset,
    };
  }

  async getAssertionDetail(
    actor: Actor,
    assertionId: string,
  ): Promise<PocketAdminAssertionDetail> {
    this.assertPlatformAdmin(actor);

    const trimmedId = assertionId?.trim() ?? "";
    if (!trimmedId) {
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const detail = await this.store.getAssertionDetail(trimmedId);
    if (!detail) {
      throw new DomainError("not_found", `Assertion ${trimmedId} not found`);
    }

    const summaries = await this.store.resolveVerificationSummaries(
      [
        {
          assertionId: detail.assertion.id,
          aggregateType: detail.assertion.aggregateType,
          aggregateId: detail.assertion.aggregateId,
          assertionType: detail.assertion.assertionType,
        },
      ],
      this.quorumPolicy,
    );

    const s = summaries.get(detail.assertion.id);
    const clinicalSummary = s
      ? {
          isClinicallyVerified: s.isClinicallyVerified,
          quorumSatisfied: s.quorumSatisfied,
          requiredApprovals: s.requiredApprovals,
          validApprovalCount: s.validApprovalCount,
          validRejectionCount: s.validRejectionCount,
          activeDisagreement: s.activeDisagreement,
          hasActiveConflict: s.hasActiveConflict,
          hasActiveSafetyOverride: s.hasActiveSafetyOverride,
          verificationBlockReasons: s.verificationBlockReasons,
        }
      : {
          isClinicallyVerified: false,
          quorumSatisfied: false,
          requiredApprovals: 2,
          validApprovalCount: 0,
          validRejectionCount: 0,
          activeDisagreement: false,
          hasActiveConflict: false,
          hasActiveSafetyOverride: false,
          verificationBlockReasons: ["no_verifications" as const],
        };

    return {
      assertion: {
        id: detail.assertion.id,
        assertionRootId: detail.assertion.assertionRootId,
        versionNumber: detail.assertion.versionNumber,
        previousVersionId: detail.assertion.previousVersionId,
        assertionKey: detail.assertion.assertionKey,
        statementText: detail.assertion.statementText,
        assertionType: detail.assertion.assertionType,
        aggregateType: detail.assertion.aggregateType,
        aggregateId: detail.assertion.aggregateId,
        aggregateTitleFa: detail.assertion.aggregateTitleFa,
        aggregateTitleEn: detail.assertion.aggregateTitleEn,
        aggregateSlug: detail.assertion.aggregateSlug,
        jurisdiction: detail.assertion.jurisdiction,
        targetPopulation: detail.assertion.targetPopulation,
        clinicalSetting: detail.assertion.clinicalSetting,
        status: detail.assertion.status,
        releaseId: detail.assertion.releaseId,
        validUntilDate: detail.assertion.validUntilDate,
        supersededAt: detail.assertion.supersededAt
          ? detail.assertion.supersededAt.toISOString()
          : null,
        createdAt: detail.assertion.createdAt.toISOString(),
        updatedAt: detail.assertion.updatedAt.toISOString(),
      },
      clinicalSummary,
      citations: detail.citations,
      versions: detail.versions,
      conflicts: detail.conflicts,
      history: detail.history,
    };
  }

  private async assertActiveClinicalReviewer(actor: Actor): Promise<void> {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }
    if (!this.reviewerService) {
      throw new DomainError(
        "forbidden",
        "Clinical reviewer governance service is not configured",
      );
    }
    await this.reviewerService.assertActiveReviewer(actor.userId);
  }

  /**
   * Lists clinical-verification-eligible assertions (reviewed, verified, published)
   * exclusively for users holding an active, valid, unexpired Clinical Reviewer Credential.
   */
  async listReviewerAssertions(
    actor: Actor,
    query: PocketAdminAssertionsQuery = {},
  ): Promise<PocketAdminAssertionsResult> {
    await this.assertActiveClinicalReviewer(actor);

    const status = query.status?.trim();
    if (
      status &&
      !(REVIEWER_ELIGIBLE_STATUSES as readonly string[]).includes(status)
    ) {
      throw new DomainError(
        "bad_request",
        `Invalid reviewer queue status filter '${status}'. Allowed: ${REVIEWER_ELIGIBLE_STATUSES.join(", ")}`,
      );
    }

    const aggregateType = query.aggregateType?.trim() as ClinicalAggregateType | undefined;
    if (aggregateType && !VALID_CLINICAL_AGGREGATE_TYPES.includes(aggregateType)) {
      throw new DomainError(
        "bad_request",
        `Invalid aggregateType filter '${aggregateType}'`,
      );
    }

    const sortBy = query.sortBy === "createdAt" ? "createdAt" : "updatedAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100);
    const offset = Math.max(Number(query.offset ?? 0) || 0, 0);

    // Fetch only eligible statuses when status filter is omitted
    let rows: Awaited<ReturnType<PocketAdminStore["listAssertions"]>>["rows"] = [];
    let totalCount = 0;

    if (status) {
      const res = await this.store.listAssertions({
        status,
        aggregateType,
        q: query.q,
        sortBy,
        sortOrder,
        limit,
        offset,
      });
      rows = res.rows;
      totalCount = res.totalCount;
    } else {
      const allEligible = await Promise.all(
        REVIEWER_ELIGIBLE_STATUSES.map((s) =>
          this.store.listAssertions({
            status: s,
            aggregateType,
            q: query.q,
            sortBy,
            sortOrder,
            limit: 100,
            offset: 0,
          }),
        ),
      );
      totalCount = allEligible.reduce((acc, r) => acc + r.totalCount, 0);
      const merged = allEligible.flatMap((r) => r.rows);
      const dir = sortOrder === "asc" ? 1 : -1;
      merged.sort((a, b) => {
        const ta = (sortBy === "createdAt" ? a.createdAt : a.updatedAt).getTime();
        const tb = (sortBy === "createdAt" ? b.createdAt : b.updatedAt).getTime();
        return (ta - tb) * dir;
      });
      rows = merged.slice(offset, offset + limit);
    }

    const contexts = rows.map((row) => ({
      assertionId: row.id,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      assertionType: row.assertionType,
    }));

    const summaries = await this.store.resolveVerificationSummaries(
      contexts,
      this.quorumPolicy,
    );

    const items = rows.map((row) => {
      const s = summaries.get(row.id);
      return {
        id: row.id,
        assertionRootId: row.assertionRootId,
        versionNumber: row.versionNumber,
        assertionKey: row.assertionKey,
        statementText: row.statementText,
        assertionType: row.assertionType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        aggregateTitleFa: row.aggregateTitleFa,
        aggregateTitleEn: row.aggregateTitleEn,
        aggregateSlug: row.aggregateSlug,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        clinicalSummary: s
          ? {
              isClinicallyVerified: s.isClinicallyVerified,
              quorumSatisfied: s.quorumSatisfied,
              requiredApprovals: s.requiredApprovals,
              validApprovalCount: s.validApprovalCount,
              validRejectionCount: s.validRejectionCount,
              activeDisagreement: s.activeDisagreement,
              hasActiveConflict: s.hasActiveConflict,
              hasActiveSafetyOverride: s.hasActiveSafetyOverride,
              verificationBlockReasons: s.verificationBlockReasons,
            }
          : {
              isClinicallyVerified: false,
              quorumSatisfied: false,
              requiredApprovals: 2,
              validApprovalCount: 0,
              validRejectionCount: 0,
              activeDisagreement: false,
              hasActiveConflict: false,
              hasActiveSafetyOverride: false,
              verificationBlockReasons: ["no_verifications" as const],
            },
      };
    });

    return {
      items,
      totalCount,
      limit,
      offset,
    };
  }

  /**
   * Retrieves assertion details for an active Clinical Reviewer, including
   * citations, Resolver summary, conflicts, audit history, and the caller's own
   * latest vote (never exposing other reviewers' identities).
   */
  async getReviewerAssertionDetail(
    actor: Actor,
    assertionId: string,
  ): Promise<PocketReviewerAssertionDetail> {
    await this.assertActiveClinicalReviewer(actor);

    const trimmedId = assertionId?.trim() ?? "";
    if (!trimmedId) {
      throw new DomainError("bad_request", "Assertion ID is required");
    }

    const detail = await this.store.getAssertionDetail(trimmedId);
    if (!detail) {
      throw new DomainError("not_found", `Assertion ${trimmedId} not found`);
    }

    const [summaries, latestVote] = await Promise.all([
      this.store.resolveVerificationSummaries(
        [
          {
            assertionId: detail.assertion.id,
            aggregateType: detail.assertion.aggregateType,
            aggregateId: detail.assertion.aggregateId,
            assertionType: detail.assertion.assertionType,
          },
        ],
        this.quorumPolicy,
      ),
      this.verificationStore
        ? this.verificationStore.findLatestVerificationByReviewerAndAssertion(
            actor.userId,
            detail.assertion.id,
          )
        : Promise.resolve(null),
    ]);

    const s = summaries.get(detail.assertion.id);
    const clinicalSummary = s
      ? {
          isClinicallyVerified: s.isClinicallyVerified,
          quorumSatisfied: s.quorumSatisfied,
          requiredApprovals: s.requiredApprovals,
          validApprovalCount: s.validApprovalCount,
          validRejectionCount: s.validRejectionCount,
          activeDisagreement: s.activeDisagreement,
          hasActiveConflict: s.hasActiveConflict,
          hasActiveSafetyOverride: s.hasActiveSafetyOverride,
          verificationBlockReasons: s.verificationBlockReasons,
        }
      : {
          isClinicallyVerified: false,
          quorumSatisfied: false,
          requiredApprovals: 2,
          validApprovalCount: 0,
          validRejectionCount: 0,
          activeDisagreement: false,
          hasActiveConflict: false,
          hasActiveSafetyOverride: false,
          verificationBlockReasons: ["no_verifications" as const],
        };

    return {
      assertion: {
        id: detail.assertion.id,
        assertionRootId: detail.assertion.assertionRootId,
        versionNumber: detail.assertion.versionNumber,
        previousVersionId: detail.assertion.previousVersionId,
        assertionKey: detail.assertion.assertionKey,
        statementText: detail.assertion.statementText,
        assertionType: detail.assertion.assertionType,
        aggregateType: detail.assertion.aggregateType,
        aggregateId: detail.assertion.aggregateId,
        aggregateTitleFa: detail.assertion.aggregateTitleFa,
        aggregateTitleEn: detail.assertion.aggregateTitleEn,
        aggregateSlug: detail.assertion.aggregateSlug,
        jurisdiction: detail.assertion.jurisdiction,
        targetPopulation: detail.assertion.targetPopulation,
        clinicalSetting: detail.assertion.clinicalSetting,
        status: detail.assertion.status,
        releaseId: detail.assertion.releaseId,
        validUntilDate: detail.assertion.validUntilDate,
        supersededAt: detail.assertion.supersededAt
          ? detail.assertion.supersededAt.toISOString()
          : null,
        createdAt: detail.assertion.createdAt.toISOString(),
        updatedAt: detail.assertion.updatedAt.toISOString(),
      },
      clinicalSummary,
      citations: detail.citations,
      versions: detail.versions,
      conflicts: detail.conflicts,
      history: detail.history,
      myLatestVote: latestVote
        ? {
            id: latestVote.id,
            verificationAction: latestVote.verificationAction,
            verifiedAt: latestVote.verifiedAt.toISOString(),
          }
        : null,
    };
  }
}
