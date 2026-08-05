/**
 * In-memory implementations of OrganizationStore for testing.
 */

import type { AuditEvent, OrganizationId, Role, UserId } from "@avana/domain";
import type {
  CreateOrganizationRecords,
  OrganizationRecord,
  MembershipRecord,
  OrganizationStore,
} from "../organization-store.js";

export class InMemoryOrganizationStore implements OrganizationStore {
  private organizations: Map<string, OrganizationRecord> = new Map();
  private memberships: Map<string, MembershipRecord> = new Map();
  private auditEvents: AuditEvent[] = [];

  async createWithAdminMembership(
    records: CreateOrganizationRecords,
  ): Promise<OrganizationRecord> {
    if (
      this.organizations.has(records.organization.id) ||
      this.memberships.has(records.membership.id)
    ) {
      throw new Error("Duplicate organization records");
    }

    this.organizations.set(records.organization.id, records.organization);
    this.memberships.set(records.membership.id, records.membership);
    this.auditEvents.push(...records.auditEvents);
    return records.organization;
  }

  async findByIdForUser(
    id: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationRecord | undefined> {
    const membership = await this.findMembership(id, userId);
    return membership ? this.organizations.get(id) : undefined;
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | undefined> {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) return org;
    }
    return undefined;
  }

  async listByUserId(userId: UserId): Promise<OrganizationRecord[]> {
    const orgIds = new Set<string>();
    for (const membership of this.memberships.values()) {
      if (membership.userId === userId) {
        orgIds.add(membership.organizationId);
      }
    }
    return Array.from(orgIds)
      .map((oid) => this.organizations.get(oid))
      .filter((o): o is OrganizationRecord => o !== undefined);
  }

  async listMemberships(
    organizationId: OrganizationId,
  ): Promise<MembershipRecord[]> {
    return Array.from(this.memberships.values()).filter(
      (m) => m.organizationId === organizationId,
    );
  }

  async findMembership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<MembershipRecord | undefined> {
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId && m.userId === userId) return m;
    }
    return undefined;
  }

  getAuditEvents(): readonly AuditEvent[] {
    return this.auditEvents;
  }

  setMembershipRole(
    organizationId: OrganizationId,
    userId: UserId,
    role: Role,
  ): void {
    for (const membership of this.memberships.values()) {
      if (
        membership.organizationId === organizationId &&
        membership.userId === userId
      ) {
        membership.role = role;
      }
    }
  }
}
