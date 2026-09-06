/**
 * Device store abstraction.
 *
 * Defines the persistence contract for user devices and authentication attempts.
 * Implemented by DrizzleDeviceStore for production/Postgres and InMemoryDeviceStore for tests.
 */

import type { DeviceType, UserDevice, AuthenticationAttempt, UserId } from "@avana/domain";

export interface RegisterDeviceInput {
  userId: UserId;
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string | null;
  userAgent?: string | null;
  lastIp?: string | null;
}

export interface RecordAttemptInput {
  userId?: UserId | null;
  email: string;
  deviceType: DeviceType;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  result: string;
  details?: string | null;
}

export type DeviceSessionTakeoverResult =
  | {
      status: "SUCCESS";
      device: UserDevice;
      canonicalDeviceId: string;
      sessionId: string;
      isNewDevice: boolean;
      revokedSessionsCount: number;
    }
  | {
      status: "LIMIT_REACHED";
      deviceType: DeviceType;
      existingDevice: UserDevice;
    };

export interface DeviceStore {
  /** Find an active (non-revoked) registered device for the user with the given deviceId. */
  findActiveByUserAndDeviceId(
    userId: UserId,
    deviceId: string,
  ): Promise<UserDevice | undefined>;

  /** List all active (non-revoked) registered devices for the user. */
  findActiveByUser(userId: UserId): Promise<UserDevice[]>;

  /** List all registered devices for the user (including revoked ones, for admin audit). */
  listAllByUser(userId: UserId): Promise<UserDevice[]>;

  /** Register a new device for the user. */
  registerDevice(input: RegisterDeviceInput): Promise<UserDevice>;

  /** Update lastSeenAt timestamp and optional IP/User-Agent. */
  updateLastSeen(
    id: string,
    lastIp?: string | null,
    userAgent?: string | null,
  ): Promise<void>;

  /** Revoke all registered devices for a user (used during admin device reset). */
  revokeAllByUser(userId: UserId, revokedAt: string): Promise<number>;

  /** Record an authentication attempt (e.g. SUCCESS or DEVICE_LIMIT_REACHED). */
  recordAttempt(input: RecordAttemptInput): Promise<{ id: string }>;

  /** List recent authentication attempts for a user (for admin security inspection). */
  listAttemptsByUser(
    userId: UserId,
    limit?: number,
  ): Promise<AuthenticationAttempt[]>;

  /**
   * Atomically acquire user lock, evaluate device slots, register or touch device,
   * revoke all previous active sessions, and create new active session.
   * Completely eliminates TOCTOU races on concurrent logins.
   */
  authenticateAndTakeoverSession(params: {
    userId: UserId;
    incomingDeviceId?: string | null;
    deviceType: DeviceType;
    deviceName?: string | null;
    userAgent?: string | null;
    ip?: string | null;
    tokenHash: string;
    expiresAt: string;
    isPlatformAdmin?: boolean;
  }): Promise<DeviceSessionTakeoverResult>;
}
