/**
 * Drizzle-backed implementation of OrganizationStore.
 *
 * Implements the OrganizationStore interface defined in organization-store.ts.
 * Uses db.transaction() for atomic multi-table writes (org + membership + audit).
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  organizations,
  organizationMemberships,
  auditLogs,
} from "@avana/database/schema";
import type {
  CreateOrganizationRecords,
  OrganizationRecord,
  MembershipRecord,
  OrganizationStore,
} from "./organization-store.js";
import type { OrganizationId, Role, UserId } from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a database organization row to the OrganizationRecord domain shape.
 */
function toOrganizationRecord(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): OrganizationRecord {
  return {
    id: row.id as OrganizationId,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Map a database membership row to the MembershipRecord domain shape.
 */
function toMembershipRecord(row: {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): MembershipRecord {
  return {
    id: row.id,
    organizationId: row.organizationId as OrganizationId,
    userId: row.userId as UserId,
    role: row.role as Role,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DrizzleOrganizationStore
// ---------------------------------------------------------------------------

export class DrizzleOrganizationStore implements OrganizationStore {
  constructor(private readonly db: DbClient) {}

  async createWithAdminMembership(
    records: CreateOrganizationRecords,
  ): Promise<OrganizationRecord> {
    const result = await this.db.transaction(async (tx) => {
      // Insert organization
      const [orgRow] = await tx
        .insert(organizations)
        .values({
          id: records.organization.id,
          name: records.organization.name,
          slug: records.organization.slug,
          createdAt: new Date(records.organization.createdAt),
          updatedAt: new Date(records.organization.updatedAt),
        })
        .returning();

      // Insert membership
      await tx.insert(organizationMemberships).values({
        id: records.membership.id,
        organizationId: records.membership.organizationId,
        userId: records.membership.userId,
        role: records.membership.role,
        createdAt: new Date(records.membership.createdAt),
        updatedAt: new Date(records.membership.updatedAt),
      });

      // Insert audit events
      for (const event of records.auditEvents) {
        await tx.insert(auditLogs).values({
          actorId: event.actorId,
          organizationId: event.organizationId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          details: event.details as Record<string, unknown> | null,
        });
      }

      return toOrganizationRecord(orgRow);
    });

    return result;
  }

  async findByIdForUser(
    id: OrganizationId,
    userId: UserId,
  ): Promise<OrganizationRecord | undefined> {
    const row = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        deletedAt: organizations.deletedAt,
      })
      .from(organizations)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, organizations.id),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .where(eq(organizations.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toOrganizationRecord(row);
  }

  async findBySlug(slug: string): Promise<OrganizationRecord | undefined> {
    const row = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toOrganizationRecord(row);
  }

  async listByUserId(userId: UserId): Promise<OrganizationRecord[]> {
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        deletedAt: organizations.deletedAt,
      })
      .from(organizations)
      .innerJoin(
        organizationMemberships,
        eq(organizationMemberships.organizationId, organizations.id),
      )
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          isNull(organizations.deletedAt),
        ),
      );

    return rows.map(toOrganizationRecord);
  }

  async listMemberships(
    organizationId: OrganizationId,
  ): Promise<MembershipRecord[]> {
    const rows = await this.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organizationId));

    return rows.map(toMembershipRecord);
  }

  async listMembershipsByUserId(userId: UserId): Promise<MembershipRecord[]> {
    const rows = await this.db
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId));

    return rows.map(toMembershipRecord);
  }

  async findMembership(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<MembershipRecord | undefined> {
    const row = await this.db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toMembershipRecord(row);
  }
}
