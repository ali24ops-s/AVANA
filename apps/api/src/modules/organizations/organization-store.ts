/**
 *
 * Organization store abstraction.
 *
 * Decouples organization and membership data access from the database.
 * A Drizzle-backed implementation would be wired at composition root.
 *
 * Per PR-8:
 * - Organization creation (first user becomes admin)
 * - Membership reads (only org members can list)
 * - Organization-scoped resource resolution
 */

import type { AuditEvent, OrganizationId, Role, UserId } from "@avana/domain";

export type OrganizationRecord = {
  id: OrganizationId;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type MembershipRecord = {
  id: string;
  organizationId: OrganizationId;
  userId: UserId;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationRecords = {
  organization: OrganizationRecord;
  membership: MembershipRecord;
  auditEvents: readonly AuditEvent[];
};

export interface OrganizationStore {
  /** Atomically insert an organization, its first membership, and audits. */
  createWithAdminMembership(
    records: CreateOrganizationRecords,
  ): Promise<OrganizationRecord>;

  /** Find an organization only through the requesting user's membership. */
  findByIdForUser(
    id: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationRecord | undefined>;

  /** Find an organization by slug. */
  findBySlug(slug: string): Promise<OrganizationRecord | undefined>;

  /** List organizations for a given user (via memberships). */
  listByUserId(userId: UserId): Promise<OrganizationRecord[]>;

  /** List memberships for an organization. */
  listMemberships(organizationId: OrganizationId): Promise<MembershipRecord[]>;

  /** List all memberships for a user (across organizations). */
  listMembershipsByUserId(userId: UserId): Promise<MembershipRecord[]>;

  /** Find a membership by user and organization. */
  findMembership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<MembershipRecord | undefined>;
}
