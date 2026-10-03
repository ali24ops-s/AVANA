/**
 * In-memory implementations of SessionStore and UserStore for testing.
 */

import { resolveEffectiveRole, type UserId } from "@avana/domain";
import type { SessionRecord, SessionStore } from "../session-store.js";
import type { UserRecord, UserStore } from "../user-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import { randomUUID } from "node:crypto";

import type {
  EmailVerificationCodeRecord,
  EmailVerificationStore,
} from "../email-verification-store.js";
import type {
  PasswordResetTokenRecord,
  PasswordResetStore,
} from "../password-reset-store.js";

import type {
  DeviceStore,
  RegisterDeviceInput,
  RecordAttemptInput,
  DeviceSessionTakeoverResult,
} from "../device-store.js";
import { resolveCanonicalDeviceId } from "../device-service.js";
import type {
  UserDevice,
  AuthenticationAttempt,
  DeviceType,
} from "@avana/domain";

export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, SessionRecord> = new Map();

  async insert(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.sessions.set(id, {
      id,
      userId: values.userId,
      tokenHash: values.tokenHash,
      deviceId: values.deviceId ?? null,
      expiresAt: values.expiresAt,
      revokedAt: null,
      revocationReason: null,
      lastUsedAt: now,
      createdAt: now,
    });
    return { id };
  }

  async createSessionWithTakeover(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
    deviceId?: string | null;
    revocationReason?: string;
  }): Promise<{ id: string; revokedCount: number }> {
    const now = new Date().toISOString();
    const reason = values.revocationReason ?? "session_takeover";
    let revokedCount = 0;

    for (const session of this.sessions.values()) {
      if (session.userId === values.userId && !session.revokedAt) {
        session.revokedAt = now;
        session.revocationReason = reason;
        revokedCount++;
      }
    }

    const id = randomUUID();
    this.sessions.set(id, {
      id,
      userId: values.userId,
      tokenHash: values.tokenHash,
      deviceId: values.deviceId ?? null,
      expiresAt: values.expiresAt,
      revokedAt: null,
      revocationReason: null,
      lastUsedAt: now,
      createdAt: now,
    });

    return { id, revokedCount };
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.lastUsedAt = lastUsedAt;
    }
  }

  async revoke(id: string, revokedAt: string, reason?: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = revokedAt;
      session.revocationReason = reason ?? "sign_out";
    }
  }

  async revokeAllByUser(userId: UserId, revokedAt: string, reason?: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        session.revocationReason = reason ?? "admin_reset";
      }
    }
  }

  setExpiresAt(id: string, expiresAt: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.expiresAt = expiresAt;
    }
  }
}

export class InMemoryDeviceStore implements DeviceStore {
  private devices: Map<string, UserDevice> = new Map();
  private attempts: AuthenticationAttempt[] = [];

  async findActiveByUserAndDeviceId(
    userId: UserId,
    deviceId: string,
  ): Promise<UserDevice | undefined> {
    for (const d of this.devices.values()) {
      if (d.userId === userId && d.deviceId === deviceId && !d.revokedAt) {
        return d;
      }
    }
    return undefined;
  }

  async findActiveByUser(userId: UserId): Promise<UserDevice[]> {
    const list: UserDevice[] = [];
    for (const d of this.devices.values()) {
      if (d.userId === userId && !d.revokedAt) {
        list.push(d);
      }
    }
    return list;
  }

  async listAllByUser(userId: UserId): Promise<UserDevice[]> {
    const list: UserDevice[] = [];
    for (const d of this.devices.values()) {
      if (d.userId === userId) {
        list.push(d);
      }
    }
    return list.sort(
      (a, b) =>
        new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
  }

  async registerDevice(input: RegisterDeviceInput): Promise<UserDevice> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const device: UserDevice = {
      id,
      userId: input.userId,
      deviceId: input.deviceId,
      deviceType: input.deviceType,
      deviceName: input.deviceName ?? null,
      userAgent: input.userAgent ?? null,
      lastIp: input.lastIp ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.devices.set(id, device);
    return device;
  }

  async updateLastSeen(
    id: string,
    lastIp?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    const d = this.devices.get(id);
    if (d) {
      d.lastSeenAt = new Date().toISOString();
      d.updatedAt = d.lastSeenAt;
      if (lastIp !== undefined) d.lastIp = lastIp;
      if (userAgent !== undefined) d.userAgent = userAgent;
    }
  }

  async revokeAllByUser(userId: UserId, revokedAt: string): Promise<number> {
    let count = 0;
    for (const d of this.devices.values()) {
      if (d.userId === userId && !d.revokedAt) {
        d.revokedAt = revokedAt;
        d.updatedAt = revokedAt;
        count++;
      }
    }
    return count;
  }

  async recordAttempt(input: RecordAttemptInput): Promise<{ id: string }> {
    const id = randomUUID();
    const attempt: AuthenticationAttempt = {
      id,
      userId: input.userId ?? null,
      email: input.email,
      deviceType: input.deviceType,
      deviceId: input.deviceId ?? null,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      result: input.result,
      details: input.details ?? null,
      createdAt: new Date().toISOString(),
    };
    this.attempts.unshift(attempt);
    return { id };
  }

  async listAttemptsByUser(
    userId: UserId,
    limit = 50,
  ): Promise<AuthenticationAttempt[]> {
    return this.attempts
      .filter((a) => a.userId === userId)
      .slice(0, limit);
  }

  private sessionStore?: SessionStore;
  private userLocks: Map<string, Promise<void>> = new Map();

  setSessionStore(sessionStore: SessionStore): void {
    this.sessionStore = sessionStore;
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
    if (!this.sessionStore) {
      throw new Error("SessionStore must be configured in InMemoryDeviceStore");
    }

    // Acquire per-user lock to serialize concurrent logins
    const prevLock = this.userLocks.get(params.userId) ?? Promise.resolve();
    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.userLocks.set(params.userId, currentLock);

    await prevLock;
    try {
      // 1. Check if incomingDeviceId matches an already registered active device for this user
      let matchedDevice: UserDevice | undefined;
      if (params.incomingDeviceId) {
        for (const d of this.devices.values()) {
          if (
            d.userId === params.userId &&
            d.deviceId === params.incomingDeviceId &&
            !d.revokedAt
          ) {
            matchedDevice = d;
            break;
          }
        }
      }

      let finalDevice: UserDevice;
      let isNewDevice = false;

      if (matchedDevice) {
        // Case A: Existing registered device recognized!
        matchedDevice.lastSeenAt = new Date().toISOString();
        matchedDevice.lastIp = params.ip ?? null;
        matchedDevice.userAgent = params.userAgent ?? null;
        matchedDevice.updatedAt = new Date().toISOString();
        finalDevice = matchedDevice;
      } else {
        // Check occupied slots for this deviceType
        for (const d of this.devices.values()) {
          if (
            d.userId === params.userId &&
            d.deviceType === params.deviceType &&
            !d.revokedAt
          ) {
            // Controlled slot takeover on successful authentication (Newest-Login-Wins per device slot)
            d.revokedAt = new Date().toISOString();
            d.updatedAt = d.revokedAt;
            break;
          }
        }

        // Case B: Slot is free (or vacated on takeover) -> register new device (preserving persistent client device ID)
        const canonicalDeviceId = resolveCanonicalDeviceId(params.incomingDeviceId);
        const newDevice = await this.registerDevice({
          userId: params.userId,
          deviceId: canonicalDeviceId,
          deviceType: params.deviceType,
          deviceName: params.deviceName,
          userAgent: params.userAgent,
          lastIp: params.ip,
        });
        finalDevice = newDevice;
        isNewDevice = true;
      }

      // Atomically revoke old active sessions and insert new active session
      const { id: sessionId, revokedCount } =
        await this.sessionStore.createSessionWithTakeover({
          userId: params.userId,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
          deviceId: finalDevice.id,
          revocationReason: "session_takeover",
        });

      return {
        status: "SUCCESS",
        device: finalDevice,
        canonicalDeviceId: finalDevice.deviceId,
        sessionId,
        isNewDevice,
        revokedSessionsCount: revokedCount,
      };
    } finally {
      releaseLock!();
    }
  }
}

export class InMemoryUserStore implements UserStore {
  private users: Map<string, UserRecord & { passwordHash?: string | null }> = new Map();
  private organizationStore?: OrganizationStore;

  constructor(organizationStore?: OrganizationStore) {
    this.organizationStore = organizationStore;
  }

  setOrganizationStore(orgStore: OrganizationStore): void {
    this.organizationStore = orgStore;
  }

  private async resolveRole(userId: UserId, globalRoleOrFallbackRole: string | null | undefined): Promise<string> {
    if (this.organizationStore) {
      const memberships = await this.organizationStore.listMembershipsByUserId(userId);
      if (memberships.length > 0) {
        const roles = memberships.map((m) => m.role);
        return resolveEffectiveRole(globalRoleOrFallbackRole, roles);
      }
    }
    return resolveEffectiveRole(globalRoleOrFallbackRole, []);
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) {
        const userCopy = { ...user };
        delete userCopy.passwordHash;
        const globalRole = user.globalRole === "platform_admin" || user.role === "platform_admin" ? "platform_admin" : (user.globalRole ?? null);
        const role = await this.resolveRole(user.id, globalRole);
        return { ...userCopy, role, globalRole };
      }
    }
    return undefined;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<UserRecord | undefined> {
    const norm = phoneNumber.trim();
    for (const user of this.users.values()) {
      if (user.phoneNumber && user.phoneNumber.trim() === norm) {
        const userCopy = { ...user };
        delete userCopy.passwordHash;
        const globalRole = user.globalRole === "platform_admin" || user.role === "platform_admin" ? "platform_admin" : (user.globalRole ?? null);
        const role = await this.resolveRole(user.id, globalRole);
        return { ...userCopy, role, globalRole };
      }
    }
    return undefined;
  }

  async findWithPasswordByEmail(
    email: string,
  ): Promise<(UserRecord & { passwordHash?: string | null }) | undefined> {
    const norm = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === norm) {
        const globalRole = user.globalRole === "platform_admin" || user.role === "platform_admin" ? "platform_admin" : (user.globalRole ?? null);
        const role = await this.resolveRole(user.id, globalRole);
        return { ...user, role, globalRole };
      }
    }
    return undefined;
  }

  async findById(id: UserId): Promise<UserRecord | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const userCopy = { ...user };
    delete userCopy.passwordHash;
    const globalRole = user.globalRole === "platform_admin" || user.role === "platform_admin" ? "platform_admin" : (user.globalRole ?? null);
    const role = await this.resolveRole(user.id, globalRole);
    return { ...userCopy, role, globalRole };
  }

  async createFromVerifiedIdentity(identity: {
    email: string;
    name: string;
    provider: string;
    providerSubject: string;
  }): Promise<UserRecord> {
    const id = randomUUID() as UserId;
    const normEmail = identity.email.trim().toLowerCase();
    const record: UserRecord = {
      id,
      email: normEmail,
      name: identity.name,
      role: "student",
      globalRole: null,
      phoneNumber: null,
      major: null,
      emailVerifiedAt: new Date().toISOString(),
      emailVerified: true,
      phoneVerifiedAt: null,
      phoneVerified: false,
    };
    this.users.set(id, record);
    return record;
  }

  async createUserWithPassword(params: {
    email: string;
    passwordHash: string;
    name?: string;
    phoneNumber?: string;
    major?: string | null;
    university?: string | null;
    faculty?: string | null;
    department?: string | null;
    globalRole?: string | null;
  }): Promise<UserRecord> {
    const id = randomUUID() as UserId;
    const normEmail = params.email.trim().toLowerCase();
    const globalRole = params.globalRole ?? null;
    const role = resolveEffectiveRole(globalRole, []);
    const userWithHash = {
      id,
      email: normEmail,
      name: params.name,
      role,
      globalRole,
      phoneNumber: params.phoneNumber ?? null,
      major: params.major ?? null,
      university: params.university ?? null,
      faculty: params.faculty ?? null,
      department: params.department ?? null,
      passwordHash: params.passwordHash,
      emailVerifiedAt: null,
      emailVerified: false,
      phoneVerifiedAt: null,
      phoneVerified: false,
    };
    this.users.set(id, userWithHash);
    return {
      id,
      email: normEmail,
      name: params.name,
      role,
      globalRole,
      phoneNumber: params.phoneNumber ?? null,
      major: params.major ?? null,
      university: params.university ?? null,
      faculty: params.faculty ?? null,
      department: params.department ?? null,
      emailVerifiedAt: null,
      emailVerified: false,
      phoneVerifiedAt: null,
      phoneVerified: false,
    };
  }

  async setEmailVerified(userId: UserId): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const iso = new Date().toISOString();
      user.emailVerifiedAt = iso;
      user.emailVerified = true;
    }
  }

  async setPhoneVerified(userId: UserId): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const iso = new Date().toISOString();
      user.phoneVerifiedAt = iso;
      user.phoneVerified = true;
    }
  }

  async updatePassword(userId: UserId, passwordHash: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
    }
  }

  async updateName(userId: UserId, name: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.name = name.trim();
    }
  }

  async updateMajor(userId: UserId, major: string | null): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.major = major ? major.trim() : null;
    }
  }

  async updateProfileFields(
    userId: UserId,
    fields: {
      name?: string;
      major?: string | null;
      university?: string | null;
      faculty?: string | null;
      department?: string | null;
    },
  ): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      if (fields.name !== undefined) user.name = fields.name.trim();
      if (fields.major !== undefined) user.major = fields.major ? fields.major.trim() : null;
      if (fields.university !== undefined) user.university = fields.university ? fields.university.trim() : null;
      if (fields.faculty !== undefined) user.faculty = fields.faculty ? fields.faculty.trim() : null;
      if (fields.department !== undefined) user.department = fields.department ? fields.department.trim() : null;
    }
  }

  async updatePhoneNumber(userId: UserId, phoneNumber: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.phoneNumber = phoneNumber;
      user.phoneVerifiedAt = null;
      user.phoneVerified = false;
    }
  }

  async deleteUser(userId: UserId): Promise<void> {
    this.users.delete(userId);
  }

  /** Directly insert a user record (used for seeding editor/admin roles in tests). */
  insert(record: UserRecord & { passwordHash?: string | null }): void {
    const emailVerified = record.emailVerified ?? (record.emailVerifiedAt != null);
    const phoneVerified = record.phoneVerified ?? (record.phoneVerifiedAt != null);
    const globalRole = record.globalRole !== undefined ? record.globalRole : (record.role === "platform_admin" ? "platform_admin" : null);
    this.users.set(record.id, { ...record, globalRole, emailVerified, phoneVerified });
  }

  async listAllUsers(): Promise<UserRecord[]> {
    const list: UserRecord[] = [];
    for (const id of this.users.keys()) {
      const u = await this.findById(id as UserId);
      if (u) {
        list.push(u);
      }
    }
    return list;
  }
}

export class InMemoryEmailVerificationStore implements EmailVerificationStore {
  private codes: Map<string, EmailVerificationCodeRecord> = new Map();

  async createCode(values: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
    channel?: "email" | "phone";
    target?: string | null;
  }): Promise<EmailVerificationCodeRecord> {
    const id = randomUUID();
    const record: EmailVerificationCodeRecord = {
      id,
      userId: values.userId,
      codeHash: values.codeHash,
      expiresAt: values.expiresAt,
      attempts: 0,
      channel: values.channel ?? "email",
      target: values.target ?? null,
      createdAt: new Date().toISOString(),
      usedAt: null,
    };
    this.codes.set(id, record);
    return record;
  }

  async findLatestActiveCode(
    userId: UserId,
    channel?: "email" | "phone",
  ): Promise<EmailVerificationCodeRecord | undefined> {
    const userCodes = Array.from(this.codes.values())
      .filter((c) => c.userId === userId && (!channel || c.channel === channel))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return userCodes[0];
  }

  async incrementAttempts(id: string): Promise<void> {
    const code = this.codes.get(id);
    if (code) {
      code.attempts += 1;
    }
  }

  async markAsUsed(id: string): Promise<void> {
    const code = this.codes.get(id);
    if (code) {
      code.usedAt = new Date().toISOString();
    }
  }

  async invalidateAllForUser(
    userId: UserId,
    channel?: "email" | "phone",
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const code of this.codes.values()) {
      if (code.userId === userId && (!channel || code.channel === channel) && !code.usedAt) {
        code.usedAt = now;
      }
    }
  }
}

export class InMemoryPasswordResetStore implements PasswordResetStore {
  private tokens: Map<string, PasswordResetTokenRecord> = new Map();
  private userStore?: UserStore;
  private sessionStore?: SessionStore;

  constructor(userStore?: UserStore, sessionStore?: SessionStore) {
    this.userStore = userStore;
    this.sessionStore = sessionStore;
  }

  setStores(userStore: UserStore, sessionStore?: SessionStore): void {
    this.userStore = userStore;
    this.sessionStore = sessionStore;
  }

  async createToken(values: {
    userId: UserId;
    tokenHash: string;
    expiresAt: string;
  }): Promise<PasswordResetTokenRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: PasswordResetTokenRecord = {
      id,
      userId: values.userId,
      tokenHash: values.tokenHash,
      expiresAt: values.expiresAt,
      createdAt: now,
      usedAt: null,
    };
    this.tokens.set(id, record);
    return { ...record };
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | undefined> {
    for (const record of this.tokens.values()) {
      if (record.tokenHash === tokenHash) {
        return { ...record };
      }
    }
    return undefined;
  }

  async atomicConsumeAndResetPassword(params: {
    tokenHash: string;
    newPasswordHash: string;
  }): Promise<{
    success: boolean;
    userId?: UserId;
    reason?: "invalid" | "expired" | "already_used";
  }> {
    let matched: PasswordResetTokenRecord | undefined;
    for (const record of this.tokens.values()) {
      if (record.tokenHash === params.tokenHash) {
        matched = record;
        break;
      }
    }

    if (!matched) {
      return { success: false, reason: "invalid" };
    }

    if (matched.usedAt != null) {
      return { success: false, reason: "already_used" };
    }

    const now = Date.now();
    const expiry = new Date(matched.expiresAt).getTime();
    if (expiry <= now) {
      return { success: false, reason: "expired" };
    }

    // Atomic consumption: set usedAt
    matched.usedAt = new Date().toISOString();

    const targetUserId = matched.userId;

    // Update password
    if (this.userStore?.updatePassword) {
      await this.userStore.updatePassword(targetUserId, params.newPasswordHash);
    }

    // Invalidate all other tokens for this user
    await this.invalidateAllForUser(targetUserId);

    // Invalidate active sessions
    if (this.sessionStore) {
      await this.sessionStore.revokeAllByUser(
        targetUserId,
        new Date().toISOString(),
        "password_reset",
      );
    }

    return { success: true, userId: targetUserId };
  }

  async deleteToken(id: string): Promise<void> {
    this.tokens.delete(id);
  }

  async invalidateAllForUser(userId: UserId): Promise<void> {
    const now = new Date().toISOString();
    for (const record of this.tokens.values()) {
      if (record.userId === userId && record.usedAt == null) {
        record.usedAt = now;
      }
    }
  }

  clear(): void {
    this.tokens.clear();
  }
}

