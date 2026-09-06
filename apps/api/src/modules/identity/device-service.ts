/**
 * Device Service.
 *
 * Implements server-side device detection, canonical device ID generation,
 * device slot enforcement (max 1 mobile, 1 desktop per user), and attempt logging.
 */

import { randomBytes } from "node:crypto";
import type { DeviceType, UserDevice, UserId } from "@avana/domain";
import type { DeviceStore, DeviceSessionTakeoverResult } from "./device-store.js";

/** Generate a cryptographically secure random device ID. */
export function generateDeviceId(): string {
  return `dev_${randomBytes(24).toString("hex")}`;
}

/**
 * Determine device type strictly as "mobile" or "desktop".
 * Prioritizes server-side User-Agent parsing; validates optional client hint.
 */
export function detectDeviceType(
  userAgent?: string | null,
  clientHint?: string | null,
): DeviceType {
  const ua = userAgent ?? "";

  // Mobile detection pattern
  const mobileRegex =
    /android.+mobile|iphone|ipod|iemobile|blackberry|mobile.+firefox|opera m(ob|in)i|windows phone/i;

  // Tablets are categorized as mobile per 2-slot model
  const tabletRegex = /ipad|android(?!.+mobile)|tablet/i;

  const isClearMobile = mobileRegex.test(ua) || tabletRegex.test(ua);
  const isClearDesktop =
    /macintosh|windows nt|x11; linux (x86_64|i686)|cros/i.test(ua) && !isClearMobile;

  // Security hardening: Client-supplied hint cannot bypass the slot system
  // when the User-Agent clearly identifies the device platform.
  if (isClearMobile) {
    return "mobile";
  }
  if (isClearDesktop) {
    return "desktop";
  }

  // For ambiguous or missing User-Agents (e.g. automated tests, API clients, native wrappers),
  // honor valid client hint if provided
  const normalizedHint = clientHint?.toLowerCase().trim();
  if (normalizedHint === "mobile" || normalizedHint === "desktop") {
    return normalizedHint;
  }

  // Deterministic fallback for unknown clients
  return "desktop";
}

/**
 * Parse a human-readable device name from User-Agent.
 */
export function parseDeviceName(
  userAgent?: string | null,
  deviceType: DeviceType = "desktop",
): string {
  if (!userAgent) {
    return deviceType === "mobile" ? "دستگاه همراه" : "رایانه";
  }

  let os = "سیستم ناشناخته";
  if (/iphone|ipad|ipod/i.test(userAgent)) os = "iOS";
  else if (/android/i.test(userAgent)) os = "Android";
  else if (/macintosh|mac os x/i.test(userAgent)) os = "macOS";
  else if (/windows/i.test(userAgent)) os = "Windows";
  else if (/linux/i.test(userAgent)) os = "Linux";

  let browser = "مرورگر";
  if (/edg/i.test(userAgent)) browser = "Edge";
  else if (/chrome|crios/i.test(userAgent)) browser = "Chrome";
  else if (/firefox|fxios/i.test(userAgent)) browser = "Firefox";
  else if (/safari/i.test(userAgent)) browser = "Safari";

  return `${browser} (${os})`;
}

export type DeviceEvaluationResult =
  | {
      action: "RECOGNIZE_EXISTING";
      device: UserDevice;
      isNewDevice: false;
    }
  | {
      action: "REGISTER_NEW";
      deviceType: DeviceType;
      isNewDevice: true;
    }
  | {
      action: "LIMIT_REACHED";
      deviceType: DeviceType;
      isNewDevice: true;
      existingDevice: UserDevice;
    };

export class DeviceService {
  constructor(private readonly store: DeviceStore) {}

  /**
   * Evaluates device identity and slot rules for an authentication attempt.
   */
  async evaluateDevice(params: {
    userId: UserId;
    deviceId?: string | null;
    deviceType: DeviceType;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<DeviceEvaluationResult> {
    const { userId, deviceId, deviceType, userAgent, ip } = params;

    // 1. Check if device is already registered and active
    if (deviceId) {
      const existingDevice = await this.store.findActiveByUserAndDeviceId(
        userId,
        deviceId,
      );
      if (existingDevice) {
        // Touch device timestamp & IP
        await this.store.updateLastSeen(existingDevice.id, ip, userAgent);
        return {
          action: "RECOGNIZE_EXISTING",
          device: existingDevice,
          isNewDevice: false,
        };
      }
    }

    // 2. Check occupied slots for this user
    const activeDevices = await this.store.findActiveByUser(userId);
    const occupiedSlot = activeDevices.find((d) => d.deviceType === deviceType);

    if (occupiedSlot) {
      return {
        action: "LIMIT_REACHED",
        deviceType,
        isNewDevice: true,
        existingDevice: occupiedSlot,
      };
    }

    // 3. Slot is free -> register new device
    return {
      action: "REGISTER_NEW",
      deviceType,
      isNewDevice: true,
    };
  }

  /**
   * Register a new device for the user.
   */
  async registerNewDevice(params: {
    userId: UserId;
    deviceId?: string | null;
    deviceType: DeviceType;
    userAgent?: string | null;
    ip?: string | null;
  }): Promise<UserDevice> {
    const finalDeviceId = params.deviceId?.trim() || generateDeviceId();
    const deviceName = parseDeviceName(params.userAgent, params.deviceType);

    return this.store.registerDevice({
      userId: params.userId,
      deviceId: finalDeviceId,
      deviceType: params.deviceType,
      deviceName,
      userAgent: params.userAgent,
      lastIp: params.ip,
    });
  }

  /**
   * Atomically authenticate device and execute session takeover under user lock.
   * Eliminates any TOCTOU race condition and logs audit attempts cleanly.
   */
  async authenticateAndTakeover(params: {
    userId: UserId;
    email: string;
    incomingDeviceId?: string | null;
    deviceType: DeviceType;
    deviceName?: string | null;
    userAgent?: string | null;
    ip?: string | null;
    tokenHash: string;
    expiresAt: string;
    isPlatformAdmin?: boolean;
  }): Promise<DeviceSessionTakeoverResult> {
    const deviceName =
      params.deviceName ??
      parseDeviceName(params.userAgent, params.deviceType);

    const result = await this.store.authenticateAndTakeoverSession({
      userId: params.userId,
      incomingDeviceId: params.incomingDeviceId,
      deviceType: params.deviceType,
      deviceName,
      userAgent: params.userAgent,
      ip: params.ip,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      isPlatformAdmin: params.isPlatformAdmin,
    });

    if (result.status === "LIMIT_REACHED") {
      await this.recordAttempt({
        userId: params.userId,
        email: params.email,
        deviceType: params.deviceType,
        deviceId: params.incomingDeviceId,
        userAgent: params.userAgent,
        ip: params.ip,
        result: "DEVICE_LIMIT_REACHED",
        details: `Device slot for ${params.deviceType} already occupied`,
      });
    } else {
      await this.recordAttempt({
        userId: params.userId,
        email: params.email,
        deviceType: params.deviceType,
        deviceId: result.canonicalDeviceId,
        userAgent: params.userAgent,
        ip: params.ip,
        result: "SUCCESS",
        details: result.isNewDevice
          ? (params.isPlatformAdmin ? "Admin device slot takeover" : "Registered new device")
          : "Recognized existing registered device",
      });
    }

    return result;
  }

  /**
   * Record an authentication attempt (audit logging).
   */
  async recordAttempt(params: {
    userId?: UserId | null;
    email: string;
    deviceType: DeviceType;
    deviceId?: string | null;
    userAgent?: string | null;
    ip?: string | null;
    result: string;
    details?: string | null;
  }): Promise<void> {
    await this.store.recordAttempt(params);
  }

  /**
   * Admin: List registered devices for user.
   */
  async listUserDevices(userId: UserId): Promise<UserDevice[]> {
    return this.store.listAllByUser(userId);
  }

  /**
   * Admin: List authentication attempts for user.
   */
  async listUserAttempts(userId: UserId, limit = 50) {
    return this.store.listAttemptsByUser(userId, limit);
  }

  /**
   * Admin: Reset registered devices for user.
   */
  async resetUserDevices(userId: UserId): Promise<number> {
    return this.store.revokeAllByUser(userId, new Date().toISOString());
  }

  getStore(): DeviceStore {
    return this.store;
  }
}
