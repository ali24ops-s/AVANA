/**
 * Drizzle-backed implementations of SessionStore and UserStore.
 *
 * These implement the store interfaces defined in session-store.ts and
 * user-store.ts. They are wired at the production composition root
 * (composeProduction.ts) and are NOT imported by services directly.
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  users,
  sessions,
  userDevices,
  authenticationAttempts,
  emailVerificationCodes,
  auditLogs,
  organizationMemberships,
} from "@avana/database/schema";
import type { SessionRecord, SessionStore } from "./session-store.js";
import type {
  DeviceStore,
  RegisterDeviceInput,
  RecordAttemptInput,
  DeviceSessionTakeoverResult,
} from "./device-store.js";
import { generateDeviceId } from "./device-service.js";
import type { UserRecord, UserStore } from "./user-store.js";
import type {
  EmailVerificationCodeRecord,
  EmailVerificationStore,
} from "./email-verification-store.js";
import {
  resolveEffectiveRole,
  type Role,
  type UserId,
  type VerifiedIdentity,
  type DeviceType,
  type UserDevice,
  type AuthenticationAttempt,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a database session row to the SessionRecord domain shape.
 * Converts Date objects to ISO strings for consistency with in-memory stores.
 */
function toSessionRecord(row: {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId?: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason?: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}): SessionRecord {
  return {
    id: row.id,
    userId: row.userId as UserId,
    tokenHash: row.tokenHash,
    deviceId: row.deviceId ?? null,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocationReason: row.revocationReason ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toUserDevice(row: {
  id: string;
  userId: string;
  deviceId: string;
  deviceType: string;
  deviceName: string | null;
  userAgent: string | null;
  lastIp: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserDevice {
  return {
    id: row.id,
    userId: row.userId as UserId,
    deviceId: row.deviceId,
    deviceType: row.deviceType as DeviceType,
    deviceName: row.deviceName,
    userAgent: row.userAgent,
    lastIp: row.lastIp,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Map a database user row to the UserRecord domain shape with resolved effective role.
 */
function toUserRecord(
  row: {
    id: string;
    email: string;
    name: string;
    globalRole?: string | null;
    emailVerifiedAt?: Date | null;
  },
  effectiveRole: Role = "student",
): UserRecord {
  return {
    id: row.id as UserId,
    email: row.email,
    name: row.name,
    role: effectiveRole,
    globalRole: row.globalRole ?? null,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    emailVerified: row.emailVerifiedAt != null,
  };
}

// ---------------------------------------------------------------------------
// DrizzleSessionStore
// ---------------------------------------------------------------------------

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: DbClient) {}

  async insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: values.userId,
        tokenHash: values.tokenHash,
        deviceId: values.deviceId ?? null,
        expiresAt: new Date(values.expiresAt),
      })
      .returning({ id: sessions.id });

    return { id: row.id };
  }

  async createSessionWithTakeover(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
    revocationReason?: string;
  }): Promise<{ id: string; revokedCount: number }> {
    const now = new Date();
    const reason = values.revocationReason ?? "session_takeover";

    return await this.db.transaction(async (tx) => {
      // 1. Lock user row to prevent race conditions on concurrent logins
      await tx.execute(
        sql`SELECT id FROM users WHERE id = ${values.userId}::uuid FOR UPDATE`,
      );

      // 2. Revoke all active sessions for this user
      const revoked = await tx
        .update(sessions)
        .set({
          revokedAt: now,
          revocationReason: reason,
        })
        .where(
          and(
            eq(sessions.userId, values.userId),
            sql`${sessions.revokedAt} IS NULL`,
          ),
        )
        .returning({ id: sessions.id });

      // 3. Create the new single active session
      const [newRow] = await tx
        .insert(sessions)
        .values({
          userId: values.userId,
          tokenHash: values.tokenHash,
          deviceId: values.deviceId ?? null,
          expiresAt: new Date(values.expiresAt),
        })
        .returning({ id: sessions.id });

      return {
        id: newRow.id,
        revokedCount: revoked.length,
      };
    });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    const row = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toSessionRecord(row);
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastUsedAt: new Date(lastUsedAt) })
      .where(eq(sessions.id, id));
  }

  async revoke(id: string, revokedAt: string, reason?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        revokedAt: new Date(revokedAt),
        revocationReason: reason ?? "sign_out",
      })
      .where(eq(sessions.id, id));
  }

  async revokeAllByUser(userId: UserId, revokedAt: string, reason?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        revokedAt: new Date(revokedAt),
        revocationReason: reason ?? "admin_reset",
      })
      .where(
        and(
          eq(sessions.userId, userId),
          sql`${sessions.revokedAt} IS NULL`,
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// DrizzleDeviceStore
// ---------------------------------------------------------------------------

export class DrizzleDeviceStore implements DeviceStore {
  constructor(private readonly db: DbClient) {}

  async findActiveByUserAndDeviceId(
    userId: UserId,
    deviceId: string,
  ): Promise<UserDevice | undefined> {
    const row = await this.db
      .select()
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, userId),
          eq(userDevices.deviceId, deviceId),
          sql`${userDevices.revokedAt} IS NULL`,
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toUserDevice(row);
  }

  async findActiveByUser(userId: UserId): Promise<UserDevice[]> {
    const rows = await this.db
      .select()
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, userId),
          sql`${userDevices.revokedAt} IS NULL`,
        ),
      );

    return rows.map(toUserDevice);
  }

  async listAllByUser(userId: UserId): Promise<UserDevice[]> {
    const rows = await this.db
      .select()
      .from(userDevices)
      .where(eq(userDevices.userId, userId))
      .orderBy(desc(userDevices.lastSeenAt));

    return rows.map(toUserDevice);
  }

  async registerDevice(input: RegisterDeviceInput): Promise<UserDevice> {
    const [row] = await this.db
      .insert(userDevices)
      .values({
        userId: input.userId,
        deviceId: input.deviceId,
        deviceType: input.deviceType,
        deviceName: input.deviceName ?? null,
        userAgent: input.userAgent ?? null,
        lastIp: input.lastIp ?? null,
      })
      .returning();

    return toUserDevice(row);
  }

  async updateLastSeen(
    id: string,
    lastIp?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };
    if (lastIp !== undefined) updateData.lastIp = lastIp;
    if (userAgent !== undefined) updateData.userAgent = userAgent;

    await this.db
      .update(userDevices)
      .set(updateData)
      .where(eq(userDevices.id, id));
  }

  async revokeAllByUser(userId: UserId, revokedAt: string): Promise<number> {
    const rows = await this.db
      .update(userDevices)
      .set({
        revokedAt: new Date(revokedAt),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userDevices.userId, userId),
          sql`${userDevices.revokedAt} IS NULL`,
        ),
      )
      .returning({ id: userDevices.id });

    return rows.length;
  }

  async recordAttempt(input: RecordAttemptInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(authenticationAttempts)
      .values({
        userId: input.userId ?? null,
        email: input.email,
        deviceType: input.deviceType,
        deviceId: input.deviceId ?? null,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
        result: input.result,
        details: input.details ?? null,
      })
      .returning({ id: authenticationAttempts.id });

    return { id: row.id };
  }

  async listAttemptsByUser(
    userId: UserId,
    limit = 50,
  ): Promise<AuthenticationAttempt[]> {
    const rows = await this.db
      .select()
      .from(authenticationAttempts)
      .where(eq(authenticationAttempts.userId, userId))
      .orderBy(desc(authenticationAttempts.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId as UserId | null,
      email: r.email,
      deviceType: r.deviceType as DeviceType,
      deviceId: r.deviceId,
      userAgent: r.userAgent,
      ip: r.ip,
      result: r.result,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async authenticateAndTakeoverSession(params: {
    userId: UserId;
    incomingDeviceId?: string | null;
    deviceType: DeviceType;
    deviceName?: string | null;
    userAgent?: string | null;
    ip?: string | null;
    tokenHash: string;
    expiresAt: string;
    isPlatformAdmin?: boolean;
  }): Promise<DeviceSessionTakeoverResult> {
    const {
      userId,
      incomingDeviceId,
      deviceType,
      deviceName,
      userAgent,
      ip,
      tokenHash,
      expiresAt,
      isPlatformAdmin,
    } = params;
    const now = new Date();

    return await this.db.transaction(async (tx) => {
      // 1. Lock user row to serialize concurrent logins and eliminate any TOCTOU race condition
      await tx.execute(
        sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`,
      );

      // 2. Check if incomingDeviceId matches an already registered active device for this user
      let matchedDevice: UserDevice | undefined;
      if (incomingDeviceId) {
        const rows = await tx
          .select()
          .from(userDevices)
          .where(
            and(
              eq(userDevices.userId, userId),
              eq(userDevices.deviceId, incomingDeviceId),
              sql`${userDevices.revokedAt} IS NULL`,
            ),
          )
          .limit(1);
        if (rows.length > 0) {
          matchedDevice = toUserDevice(rows[0]);
        }
      }

      let finalDevice: UserDevice;
      let isNewDevice = false;

      if (matchedDevice) {
        // Case A: Existing registered device recognized!
        await tx
          .update(userDevices)
          .set({
            lastSeenAt: now,
            lastIp: ip ?? null,
            userAgent: userAgent ?? null,
            updatedAt: now,
          })
          .where(eq(userDevices.id, matchedDevice.id));
        finalDevice = matchedDevice;
      } else {
        // Check occupied slots for this deviceType under lock
        const occupiedRows = await tx
          .select()
          .from(userDevices)
          .where(
            and(
              eq(userDevices.userId, userId),
              eq(userDevices.deviceType, deviceType),
              sql`${userDevices.revokedAt} IS NULL`,
            ),
          )
          .limit(1);

        if (occupiedRows.length > 0) {
          if (isPlatformAdmin) {
            // Controlled recovery/takeover for platform_admin when slot belongs to same user:
            // Revoke the old active device record for this slot to maintain audit history
            await tx
              .update(userDevices)
              .set({
                revokedAt: now,
                updatedAt: now,
              })
              .where(eq(userDevices.id, occupiedRows[0].id));

            // Register the new device for the slot
            const canonicalDeviceId = generateDeviceId();
            const [newDeviceRow] = await tx
              .insert(userDevices)
              .values({
                userId,
                deviceId: canonicalDeviceId,
                deviceType,
                deviceName: deviceName ?? null,
                userAgent: userAgent ?? null,
                lastIp: ip ?? null,
              })
              .returning();
            finalDevice = toUserDevice(newDeviceRow);
            isNewDevice = true;
          } else {
            // Case C: Slot is already occupied for regular user!
            // DO NOT revoke existing session, DO NOT register device.
            return {
              status: "LIMIT_REACHED",
              deviceType,
              existingDevice: toUserDevice(occupiedRows[0]),
            };
          }
        } else {
          // Case B: Slot is free -> register new device under lock
          const canonicalDeviceId = generateDeviceId();
          const [newDeviceRow] = await tx
            .insert(userDevices)
            .values({
              userId,
              deviceId: canonicalDeviceId,
              deviceType,
              deviceName: deviceName ?? null,
              userAgent: userAgent ?? null,
              lastIp: ip ?? null,
            })
            .returning();
          finalDevice = toUserDevice(newDeviceRow);
          isNewDevice = true;
        }
      }

      // 3. Atomically revoke all active sessions for this user under lock
      const revoked = await tx
        .update(sessions)
        .set({
          revokedAt: now,
          revocationReason: "session_takeover",
        })
        .where(
          and(
            eq(sessions.userId, userId),
            sql`${sessions.revokedAt} IS NULL`,
          ),
        )
        .returning({ id: sessions.id });

      // 4. Create single active session under lock
      const [newSession] = await tx
        .insert(sessions)
        .values({
          userId,
          tokenHash,
          deviceId: finalDevice.id,
          expiresAt: new Date(expiresAt),
        })
        .returning({ id: sessions.id });

      return {
        status: "SUCCESS",
        device: finalDevice,
        canonicalDeviceId: finalDevice.deviceId,
        sessionId: newSession.id,
        isNewDevice,
        revokedSessionsCount: revoked.length,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// DrizzleUserStore
// ---------------------------------------------------------------------------

export class DrizzleUserStore implements UserStore {
  constructor(private readonly db: DbClient) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.email, normalizedEmail));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(userRow.globalRole, roles);
    return toUserRecord(userRow, effectiveRole);
  }

  async findWithPasswordByEmail(
    email: string,
  ): Promise<(UserRecord & { passwordHash?: string | null }) | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.email, normalizedEmail));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(userRow.globalRole, roles);
    return {
      ...toUserRecord(userRow, effectiveRole),
      passwordHash: userRow.passwordHash ?? null,
    };
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const rows = await this.db
      .select({
        user: users,
        role: organizationMemberships.role,
      })
      .from(users)
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, users.id),
      )
      .where(eq(users.id, id));

    if (rows.length === 0) return undefined;
    const userRow = rows[0].user;
    const roles = rows
      .map((r) => r.role)
      .filter((r): r is Role => r != null);
    const effectiveRole = resolveEffectiveRole(userRow.globalRole, roles);
    return toUserRecord(userRow, effectiveRole);
  }

  async createFromVerifiedIdentity(
    identity: VerifiedIdentity,
  ): Promise<UserRecord> {
    const normalizedEmail = identity.email.trim().toLowerCase();
    const [row] = await this.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalizedEmail,
        name: identity.name,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        globalRole: users.globalRole,
        emailVerifiedAt: users.emailVerifiedAt,
      });

    return toUserRecord(row);
  }

  async createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
    globalRole?: string | null;
  }): Promise<UserRecord> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const [row] = await this.db
      .insert(users)
      .values({
        id: randomUUID(),
        email: normalizedEmail,
        passwordHash: params.passwordHash,
        name: params.name ?? normalizedEmail.split("@")[0],
        globalRole: params.globalRole ?? null,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        globalRole: users.globalRole,
        emailVerifiedAt: users.emailVerifiedAt,
      });

    const effectiveRole = resolveEffectiveRole(row.globalRole, []);
    return toUserRecord(row, effectiveRole);
  }

  async setEmailVerified(userId: UserId): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: UserId): Promise<void> {
    await this.db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await this.db.delete(users).where(eq(users.id, userId));
  }
}

// ---------------------------------------------------------------------------
// DrizzleEmailVerificationStore
// ---------------------------------------------------------------------------

export class DrizzleEmailVerificationStore implements EmailVerificationStore {
  constructor(private readonly db: DbClient) {}

  async createCode(values: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationCodeRecord> {
    const [row] = await this.db
      .insert(emailVerificationCodes)
      .values({
        userId: values.userId,
        codeHash: values.codeHash,
        expiresAt: new Date(values.expiresAt),
      })
      .returning();

    return {
      id: row.id,
      userId: row.userId as UserId,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt.toISOString(),
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
    };
  }

  async findLatestActiveCode(
    userId: UserId,
  ): Promise<EmailVerificationCodeRecord | undefined> {
    const row = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId as UserId,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt.toISOString(),
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      usedAt: row.usedAt?.toISOString() ?? null,
    };
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
      .where(eq(emailVerificationCodes.id, id));
  }

  async markAsUsed(id: string): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationCodes.id, id));
  }

  async invalidateAllForUser(userId: UserId): Promise<void> {
    await this.db
      .update(emailVerificationCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailVerificationCodes.userId, userId),
          sql`${emailVerificationCodes.usedAt} IS NULL`,
        ),
      );
  }
}

