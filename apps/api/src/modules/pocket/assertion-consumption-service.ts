/**
 * AVANA Pocket — Assertion Consumption Service (Phase 2C-4A: Clinical Consumption API).
 *
 * Enforces validation, projection, and business rules for consuming published assertions:
 * 1. Validates aggregate type ("drug" | "disease" | "treatment" | "emergency").
 * 2. Validates aggregate UUID format.
 * 3. Retrieves published assertions and authoritative entity version.
 * 4. Ensures unverified, draft, and superseded versions are never exposed to consumers.
 */

import { DomainError } from "@avana/domain";
import {
  VALID_CLINICAL_AGGREGATE_TYPES,
  type AssertionConsumptionStore,
  type AggregateAssertionsQueryResult,
  type ClinicalAggregateMetadata,
  type ClinicalAggregateType,
  type PublishedAssertionItem,
} from "./assertion-consumption-store.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-zA-Z0-9_.-]+$/;

export interface AssertionConsumptionServiceDeps {
  consumptionStore: AssertionConsumptionStore;
}

export class AssertionConsumptionService {
  private readonly store: AssertionConsumptionStore;

  constructor(deps: AssertionConsumptionServiceDeps) {
    this.store = deps.consumptionStore;
  }

  /**
   * Validates aggregate type and format (accepts RFC 4122 UUID or canonical slug).
   */
  private validateAggregateInput(
    aggregateType: string,
    identifier: string,
  ): ClinicalAggregateType {
    if (!aggregateType || !VALID_CLINICAL_AGGREGATE_TYPES.includes(aggregateType as ClinicalAggregateType)) {
      throw new DomainError(
        "bad_request",
        `Invalid clinical aggregate type: '${aggregateType}'. Allowed types: ${VALID_CLINICAL_AGGREGATE_TYPES.join(", ")}`,
      );
    }

    const trimmed = identifier ? identifier.trim() : "";
    if (
      !trimmed ||
      trimmed.length > 255 ||
      (!UUID_REGEX.test(trimmed) && !SLUG_REGEX.test(trimmed))
    ) {
      throw new DomainError(
        "bad_request",
        `Invalid aggregate identifier format: '${identifier}'. Must be a valid UUID or slug.`,
      );
    }

    return aggregateType as ClinicalAggregateType;
  }

  /**
   * Get all published assertions for a clinical aggregate along with current entity version.
   * Supports both UUID and canonical slug.
   * Throws 404 (DomainError 'not_found') if aggregate entity does not exist.
   */
  async getPublishedAssertionsByAggregate(
    aggregateType: string,
    aggregateId: string,
  ): Promise<AggregateAssertionsQueryResult> {
    const validatedType = this.validateAggregateInput(aggregateType, aggregateId);
    const result = await this.store.findPublishedByAggregate(validatedType, aggregateId);
    if (!result) {
      throw new DomainError(
        "not_found",
        `Clinical aggregate '${validatedType}' with ID '${aggregateId}' was not found.`,
      );
    }
    return result;
  }

  /**
   * Lightweight method to fetch only current version of a clinical aggregate.
   * Supports both UUID and canonical slug. Always returns canonical UUID as aggregateId.
   * Throws 404 (DomainError 'not_found') if aggregate entity does not exist.
   */
  async getCurrentVersion(
    aggregateType: string,
    aggregateId: string,
  ): Promise<{ aggregateType: ClinicalAggregateType; aggregateId: string; currentVersion: number }> {
    const validatedType = this.validateAggregateInput(aggregateType, aggregateId);
    const identity = await this.store.resolveAggregateIdentity(validatedType, aggregateId);
    if (!identity) {
      throw new DomainError(
        "not_found",
        `Clinical aggregate '${validatedType}' with ID '${aggregateId}' was not found.`,
      );
    }
    const currentVersion = await this.store.getCurrentVersion(validatedType, identity.canonicalId);
    if (currentVersion === null) {
      throw new DomainError(
        "not_found",
        `Clinical aggregate '${validatedType}' with ID '${aggregateId}' was not found.`,
      );
    }
    return {
      aggregateType: validatedType,
      aggregateId: identity.canonicalId,
      currentVersion,
    };
  }

  /**
   * Fetch a single published scientific assertion by ID.
   * Throws 404 (DomainError 'not_found') if assertion does not exist or is not published.
   */
  async getPublishedAssertionById(id: string): Promise<PublishedAssertionItem> {
    if (!id || !UUID_REGEX.test(id)) {
      throw new DomainError("bad_request", `Invalid assertion ID: '${id}'. Must be a valid UUID.`);
    }

    const assertion = await this.store.findPublishedAssertionById(id);
    if (!assertion) {
      throw new DomainError("not_found", `Published assertion with ID '${id}' was not found.`);
    }

    return assertion;
  }

  /**
   * Fetch aggregate metadata (name, classification, summary, version) for an entity.
   * Throws 404 (DomainError 'not_found') if aggregate does not exist.
   */
  async getAggregateMetadata(
    aggregateType: string,
    aggregateId: string,
  ): Promise<ClinicalAggregateMetadata> {
    const validatedType = this.validateAggregateInput(aggregateType, aggregateId);
    const metadata = await this.store.getAggregateMetadata(validatedType, aggregateId);
    if (!metadata) {
      throw new DomainError(
        "not_found",
        `Clinical aggregate '${validatedType}' with ID '${aggregateId}' was not found.`,
      );
    }
    return metadata;
  }
}
