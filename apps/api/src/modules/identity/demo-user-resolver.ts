/**
 * Demo User Resolver.
 *
 * Resolves the Current User in Demo / Public Mode directly from the
 * existing database record matching DEMO_USER_EMAIL without creating,
 * duplicating, migrating, or modifying any records.
 */

import { DomainError, resolveEffectiveRole, type Role } from "@avana/domain";
import type { UserRecord, UserStore } from "./user-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

export class DemoUserResolver {
  constructor(
    private readonly userStore: UserStore,
    private readonly organizationStore: OrganizationStore | undefined,
    private readonly demoUserEmail: string,
  ) {}

  getDemoUserEmail(): string {
    return this.demoUserEmail;
  }

  /**
   * Resolve the real user record and their organization memberships
   * for the configured demo user email.
   *
   * Fails safely if:
   * - No user with this email is found (throws DomainError('unauthorized'))
   * - Multiple users with this email are found (throws DomainError('internal_error'))
   */
  async resolveDemoUser(): Promise<{
    user: UserRecord;
    memberships: Array<{ organization_id: string; role: string }>;
  }> {
    const cleanEmail = this.demoUserEmail.trim().toLowerCase();

    let matchingUsers: UserRecord[] = [];
    if (typeof this.userStore.findAllByEmail === "function") {
      matchingUsers = await this.userStore.findAllByEmail(cleanEmail);
    } else {
      const singleUser = await this.userStore.findByEmail(cleanEmail);
      if (singleUser) {
        matchingUsers = [singleUser];
      }
    }

    if (matchingUsers.length === 0) {
      throw new DomainError(
        "unauthorized",
        `کاربر حالت دمو با ایمیل ${cleanEmail} در پایگاه داده یافت نشد.`,
      );
    }

    if (matchingUsers.length > 1) {
      throw new DomainError(
        "internal_error",
        `چندین رکورد کاربر با ایمیل ${cleanEmail} در پایگاه داده شناسایی شد. امکان انتخاب خودکار وجود ندارد.`,
      );
    }

    const userRecord = matchingUsers[0];

    // Resolve user's actual organization memberships
    let memberships: Array<{ organization_id: string; role: string }> = [];
    if (this.organizationStore) {
      const rawMemberships = await this.organizationStore.listMembershipsByUserId(
        userRecord.id as Parameters<OrganizationStore["listMembershipsByUserId"]>[0],
      );
      memberships = rawMemberships.map((m) => ({
        organization_id: m.organizationId,
        role: m.role,
      }));
    }

    const membershipRoles = memberships.map((m) => m.role as Role);
    const effectiveRole = resolveEffectiveRole(userRecord.globalRole, membershipRoles);

    return {
      user: {
        ...userRecord,
        role: effectiveRole,
      },
      memberships,
    };
  }
}
