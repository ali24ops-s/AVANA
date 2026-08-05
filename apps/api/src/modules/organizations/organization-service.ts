/**
 * Organization business logic.
 *
 * Separated from HTTP concerns so it can be tested independently.
 * Delegates authorization decisions to the domain policy layer.
 */

import { randomUUID } from "node:crypto";
import {
  auditMembershipCreated,
  auditOrgCreated,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import type {
  Actor,
  AuthorizationPolicy,
  AuthContext,
  OrganizationId,
} from "@avana/domain";
import type {
  OrganizationStore,
  OrganizationRecord,
  MembershipRecord,
} from "./organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export class OrganizationService {
  constructor(
    private readonly store: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    // Retained for constructor signature compatibility with the composition
    // root. Aggregate audit events are persisted by the store transactionally
    // (PR5-B5); this service does not emit via AuditService itself.
    _auditService?: AuditService,
  ) {}

  /**
   * Create a new organization.
   * The creating user becomes the organization_admin.
   */
  async createOrganization(
    actor: Actor,
    name: string,
  ): Promise<OrganizationRecord> {
    const slug = generateSlug(name);
    if (!slug) {
      throw new DomainError("bad_request", "Invalid organization name");
    }

    const existing = await this.store.findBySlug(slug);
    if (existing) {
      throw new DomainError(
        "conflict",
        "Organization with this name already exists",
      );
    }

    const organizationId = randomUUID() as OrganizationId;
    const membershipId = randomUUID();
    const createdAt = new Date().toISOString();
    this.policy.require("org:create", actor, { organizationId });

    const organization: OrganizationRecord = {
      id: organizationId,
      name,
      slug,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    const membership: MembershipRecord = {
      id: membershipId,
      organizationId,
      userId: actor.userId,
      role: "organization_admin",
      createdAt,
      updatedAt: createdAt,
    };

    const auditEvents = [
      auditOrgCreated(actor.userId, organizationId, name),
      auditMembershipCreated(
        actor.userId,
        organizationId,
        membershipId,
        actor.userId,
        membership.role,
      ),
    ] as const;

    // The store is the single source of audit persistence for aggregate
    // events: createWithAdminMembership persists the organization, its first
    // membership, and these audit events atomically in one transaction.
    // Do NOT emit via AuditService here, or the same events would be written
    // twice (PR5-B5).
    return this.store.createWithAdminMembership({
      organization,
      membership,
      auditEvents,
    });
  }

  /**
   * List organizations visible to the actor.
   */
  async listOrganizations(actor: Actor): Promise<OrganizationRecord[]> {
    return this.store.listByUserId(actor.userId);
  }

  /**
   * List memberships for an organization.
   * Only organization admins can list members.
   */
  async listMemberships(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<MembershipRecord[]> {
    const membership = await this.requireMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role };
    const context: AuthContext = { organizationId };
    this.policy.require("org:list_members", scopedActor, context);

    return this.store.listMemberships(organizationId);
  }

  /**
   * Resolve an organization-scoped resource.
   * Ensures that no tenant-owned resource can be fetched by ID alone
   * without proving the actor belongs to the organization.
   *
   * Returns the org only if the actor has a membership in it.
   */
  async resolveScopedOrganization(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<OrganizationRecord> {
    const membership = await this.requireMembership(actor, organizationId);
    const scopedActor = { ...actor, role: membership.role };
    const context: AuthContext = { organizationId };
    this.policy.require("org:read", scopedActor, context);

    const organization = await this.store.findByIdForUser(
      organizationId,
      actor.userId,
    );
    if (!organization) {
      throw new DomainError("not_found", "Organization not found");
    }

    return organization;
  }

  private async requireMembership(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<MembershipRecord> {
    const membership = await this.store.findMembership(
      organizationId,
      actor.userId,
    );
    if (!membership) {
      throw new DomainError("not_found", "Organization not found");
    }
    return membership;
  }
}
