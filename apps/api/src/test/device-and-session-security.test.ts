/**
 * AVANA — Device & Single-Session Subscription Security Tests.
 *
 * Covers:
 * 1. Device limit enforcement (1 mobile, 1 desktop per user).
 * 2. Second new device of same type rejected with DEVICE_LIMIT_REACHED (403).
 * 3. Session takeover (newest login wins, previous active session revoked with SESSION_REVOKED).
 * 4. Case C invariant: blocked attempt does NOT revoke existing session and does NOT replace device.
 * 5. Same registered device re-login does not create duplicate device records.
 * 6. Revoked session rejection with machine-readable SESSION_REVOKED (401).
 * 7. Admin device inspection, auth attempt listing, and reset.
 * 8. Non-admin forbidden from admin device endpoints (403).
 * 9. Subscription ownership isolation.
 * 10. Study session tracking independence.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryDeviceStore,
} from "../modules/identity/test/in-memory-stores.js";
import { hashToken } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import { asUserId } from "@avana/domain";
import { randomUUID } from "node:crypto";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Device & Single-Session Security", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let deviceStore: InMemoryDeviceStore;
  let organizationStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let commerceStore: InMemoryCommerceStore;
  let entitlementService: EntitlementService;
  let studySessionStore: InMemoryStudySessionStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    deviceStore = new InMemoryDeviceStore();
    organizationStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(organizationStore);
    adminStore = new InMemoryAdminStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    commerceStore = new InMemoryCommerceStore();
    entitlementService = new EntitlementService({ commerceStore });
    studySessionStore = new InMemoryStudySessionStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      deviceStore,
      organizationStore,
      adminStore,
      auditService,
      commerceStore,
      entitlementService,
      studySessionStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
    });
  });

  function extractCookie(
    res: { cookies: Array<{ name: string; value: string }> },
    name: string,
  ): string | undefined {
    return res.cookies.find((c) => c.name === name)?.value;
  }

  // -------------------------------------------------------------------------
  // 1. Device Limits & Rejection of 2nd Device of Same Type
  // -------------------------------------------------------------------------
  describe("1. Device Limits (1 mobile, 1 desktop)", () => {
    it("allows registering 1 mobile and 1 desktop device for the same user", async () => {
      // Register user from a mobile device
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
          "x-device-type": "mobile",
        },
        payload: {
          email: "student1@example.com",
          password: "Password123!",
          name: "Student One",
        },
      });

      expect(regRes.statusCode).toBe(200);
      const mobileDeviceId = extractCookie(regRes, "avana_device_id");
      expect(mobileDeviceId).toBeDefined();
      expect(mobileDeviceId).toMatch(/^dev_/);

      // Log in from a desktop device (different device)
      const deskLoginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "x-device-type": "desktop",
        },
        payload: {
          email: "student1@example.com",
          password: "Password123!",
        },
      });

      expect(deskLoginRes.statusCode).toBe(200);
      const desktopDeviceId = extractCookie(deskLoginRes, "avana_device_id");
      expect(desktopDeviceId).toBeDefined();
      expect(desktopDeviceId).not.toBe(mobileDeviceId);

      // Verify user has 2 active devices in store
      const devices = await deviceStore.findActiveByUser(asUserId(regRes.json().user.id));
      expect(devices).toHaveLength(2);
      expect(devices.map((d) => d.deviceType).sort()).toEqual(["desktop", "mobile"]);
    });

    it("rejects login from a 2nd mobile device with DEVICE_LIMIT_REACHED (403)", async () => {
      // Register user on Mobile Device 1
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "student2@example.com",
          password: "Password123!",
          name: "Student Two",
        },
      });
      expect(regRes.statusCode).toBe(200);

      // Attempt login from a SECOND, new Mobile Device
      const secondMobileRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Android 13; Mobile)",
          "x-device-type": "mobile",
        },
        payload: {
          email: "student2@example.com",
          password: "Password123!",
        },
      });

      expect(secondMobileRes.statusCode).toBe(403);
      const body = secondMobileRes.json();
      expect(body.error.code).toBe("DEVICE_LIMIT_REACHED");
    });

    it("rejects login from a 2nd desktop device with DEVICE_LIMIT_REACHED (403)", async () => {
      // Register user on Desktop Device 1
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "student3@example.com",
          password: "Password123!",
          name: "Student Three",
        },
      });
      expect(regRes.statusCode).toBe(200);

      // Attempt login from a SECOND, new Desktop Device
      const secondDesktopRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          "x-device-type": "desktop",
        },
        payload: {
          email: "student3@example.com",
          password: "Password123!",
        },
      });

      expect(secondDesktopRes.statusCode).toBe(403);
      const body = secondDesktopRes.json();
      expect(body.error.code).toBe("DEVICE_LIMIT_REACHED");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Session Takeover & Maximum 1 Active Session
  // -------------------------------------------------------------------------
  describe("2. Session Takeover & Single Active Session Enforcement", () => {
    it("revokes existing mobile session when user logs in from registered desktop device", async () => {
      // 1. Mobile login
      const mobileRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "takeover@example.com",
          password: "Password123!",
          name: "Takeover User",
        },
      });
      const mobileToken = extractCookie(mobileRes, "avana_session")!;
      const mobileDeviceId = extractCookie(mobileRes, "avana_device_id")!;

      // Verify mobile session is active
      const meMobile1 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${mobileToken}` },
      });
      expect(meMobile1.statusCode).toBe(200);

      // 2. Desktop login (new device with available desktop slot)
      const deskRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "takeover@example.com",
          password: "Password123!",
        },
      });
      expect(deskRes.statusCode).toBe(200);
      const deskToken = extractCookie(deskRes, "avana_session")!;
      const deskDeviceId = extractCookie(deskRes, "avana_device_id")!;

      // 3. New desktop session must be valid
      const meDesktop = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${deskToken}` },
      });
      expect(meDesktop.statusCode).toBe(200);

      // 4. Old mobile session must now be rejected with SESSION_REVOKED (401)
      const meMobile2 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${mobileToken}` },
      });
      expect(meMobile2.statusCode).toBe(401);
      const errBody = meMobile2.json();
      expect(errBody.error.code).toBe("SESSION_REVOKED");

      // 5. Reverse takeover: log in again from registered mobile device
      const mobileLoginAgain = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "x-device-type": "mobile",
          cookie: `avana_device_id=${mobileDeviceId}`,
        },
        payload: {
          email: "takeover@example.com",
          password: "Password123!",
        },
      });
      expect(mobileLoginAgain.statusCode).toBe(200);
      const newMobileToken = extractCookie(mobileLoginAgain, "avana_session")!;

      // 6. Mobile session is active again
      const meMobile3 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${newMobileToken}` },
      });
      expect(meMobile3.statusCode).toBe(200);

      // 7. Desktop session is now revoked with SESSION_REVOKED
      const meDesk2 = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${deskToken}` },
      });
      expect(meDesk2.statusCode).toBe(401);
      expect(meDesk2.json().error.code).toBe("SESSION_REVOKED");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Case C Invariant: Blocked Slot Does NOT Revoke Existing Session
  // -------------------------------------------------------------------------
  describe("3. Case C Invariant: Occupied Slot Protection", () => {
    it("does NOT revoke active session or replace device on blocked login", async () => {
      // 1. User registers from Desktop 1
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "casec@example.com",
          password: "Password123!",
          name: "Case C User",
        },
      });
      const originalSession = extractCookie(regRes, "avana_session")!;
      const originalDevice = extractCookie(regRes, "avana_device_id")!;
      const userId = asUserId(regRes.json().user.id);

      // 2. Attacker / second desktop attempts to log in
      const blockedRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "casec@example.com",
          password: "Password123!",
        },
      });
      expect(blockedRes.statusCode).toBe(403);
      expect(blockedRes.json().error.code).toBe("DEVICE_LIMIT_REACHED");

      // 3. Invariant: Original session is STILL VALID
      const checkRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${originalSession}` },
      });
      expect(checkRes.statusCode).toBe(200);

      // 4. Invariant: Registered device list has NOT changed
      const devices = await deviceStore.findActiveByUser(userId);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceId).toBe(originalDevice);

      // 5. Invariant: Attempt was recorded in authentication attempts
      const attempts = await deviceStore.listAttemptsByUser(userId);
      expect(attempts.length).toBeGreaterThanOrEqual(1);
      const blockedAttempt = attempts.find((a) => a.result === "DEVICE_LIMIT_REACHED");
      expect(blockedAttempt).toBeDefined();
      expect(blockedAttempt?.deviceType).toBe("desktop");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Same Device Re-login
  // -------------------------------------------------------------------------
  describe("4. Re-login from same registered device", () => {
    it("does not create duplicate device rows when logging in with existing avana_device_id", async () => {
      // 1. Initial register
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "samedevice@example.com",
          password: "Password123!",
          name: "Same Device User",
        },
      });
      const deviceId = extractCookie(regRes, "avana_device_id")!;
      const userId = asUserId(regRes.json().user.id);

      // 2. User signs out
      await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        headers: { cookie: `avana_session=${extractCookie(regRes, "avana_session")}` },
      });

      // 3. User logs in again presenting their device cookie
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: {
          "x-device-type": "desktop",
          cookie: `avana_device_id=${deviceId}`,
        },
        payload: {
          email: "samedevice@example.com",
          password: "Password123!",
        },
      });
      expect(loginRes.statusCode).toBe(200);

      // 4. Verify no duplicate device record was inserted
      const devices = await deviceStore.findActiveByUser(userId);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceId).toBe(deviceId);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Admin Inspection & Reset
  // -------------------------------------------------------------------------
  describe("5. Admin Device Inspection and Reset", () => {
    let adminToken: string;
    let targetUserId: string;

    beforeEach(async () => {
      // Create admin user
      const adminReg = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "admin@example.com",
          password: "Password123!",
          name: "Platform Admin",
        },
      });
      adminToken = extractCookie(adminReg, "avana_session")!;
      const adminId = adminReg.json().user.id;
      // Elevate to platform_admin in userStore
      const adminRecord = await userStore.findById(asUserId(adminId));
      if (adminRecord) {
        userStore.insert({
          ...adminRecord,
          role: "platform_admin",
          globalRole: "platform_admin",
        });
      }

      // Create target user with mobile & desktop devices
      const userReg = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "target@example.com",
          password: "Password123!",
          name: "Target User",
        },
      });
      targetUserId = userReg.json().user.id;

      // Add desktop device for target user
      await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "target@example.com",
          password: "Password123!",
        },
      });

      // Target tries 2nd desktop login -> blocked
      await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "target@example.com",
          password: "Password123!",
        },
      });
    });

    it("prevents non-admin from accessing admin device endpoints (403)", async () => {
      // Normal student login
      const studentReg = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "student@example.com",
          password: "Password123!",
          name: "Normal Student",
        },
      });
      const studentToken = extractCookie(studentReg, "avana_session")!;

      const resDevices = await app.inject({
        method: "GET",
        url: `/v1/admin/users/${targetUserId}/devices`,
        headers: { cookie: `avana_session=${studentToken}` },
      });
      expect(resDevices.statusCode).toBe(403);

      const resReset = await app.inject({
        method: "POST",
        url: `/v1/admin/users/${targetUserId}/reset-devices`,
        headers: { cookie: `avana_session=${studentToken}` },
      });
      expect(resReset.statusCode).toBe(403);
    });

    it("allows platform_admin to inspect user registered devices and auth attempts", async () => {
      const devicesRes = await app.inject({
        method: "GET",
        url: `/v1/admin/users/${targetUserId}/devices`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(devicesRes.statusCode).toBe(200);
      const devicesData = devicesRes.json();
      expect(devicesData.userId).toBe(targetUserId);
      expect(devicesData.devices).toHaveLength(2);

      const attemptsRes = await app.inject({
        method: "GET",
        url: `/v1/admin/users/${targetUserId}/auth-attempts`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(attemptsRes.statusCode).toBe(200);
      const attemptsData = attemptsRes.json();
      expect(attemptsData.attempts.length).toBeGreaterThanOrEqual(1);
      expect(attemptsData.attempts.some((a: any) => a.result === "DEVICE_LIMIT_REACHED")).toBe(true);
    });

    it("allows platform_admin to reset devices, revoking all devices and sessions", async () => {
      const resetRes = await app.inject({
        method: "POST",
        url: `/v1/admin/users/${targetUserId}/reset-devices`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.json().success).toBe(true);

      // Verify active devices in store is now 0
      const activeDevices = await deviceStore.findActiveByUser(asUserId(targetUserId));
      expect(activeDevices).toHaveLength(0);

      // Target user can now register a brand new desktop device and log in successfully
      const newLoginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "target@example.com",
          password: "Password123!",
        },
      });
      expect(newLoginRes.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Subscription Ownership Isolation
  // -------------------------------------------------------------------------
  describe("6. Subscription Ownership Isolation", () => {
    it("ensures premium access checks strictly resolve to the authenticated request user", async () => {
      // User A (with active subscription)
      const userARes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "usera@example.com",
          password: "Password123!",
          name: "User A",
        },
      });
      const userAToken = extractCookie(userARes, "avana_session")!;
      const userAId = asUserId(userARes.json().user.id);

      // Grant subscription to User A in commerce store
      await commerceStore.createSubscription({
        id: randomUUID(),
        userId: userAId,
        productId: randomUUID(),
        orderId: null,
        status: "active",
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await commerceStore.grantEntitlement({
        id: randomUUID(),
        userId: userAId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "subscription",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // User B (without subscription)
      const userBRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "userb@example.com",
          password: "Password123!",
          name: "User B",
        },
      });
      const userBToken = extractCookie(userBRes, "avana_session")!;

      // User A checks access
      const accessA = await app.inject({
        method: "GET",
        url: "/v1/commerce/access/check?resource_type=course&resource_id=premium-course-1",
        headers: { cookie: `avana_session=${userAToken}` },
      });
      expect(accessA.statusCode).toBe(200);
      expect(accessA.json().granted).toBe(true);

      // User B checks access
      const accessB = await app.inject({
        method: "GET",
        url: "/v1/commerce/access/check?resource_type=course&resource_id=premium-course-1",
        headers: { cookie: `avana_session=${userBToken}` },
      });
      expect(accessB.statusCode).toBe(200);
      expect(accessB.json().granted).toBe(false);

      // User B attempts to spoof User A's userId in query
      const spoofAccess = await app.inject({
        method: "GET",
        url: `/v1/commerce/access/check?resource_type=course&resource_id=premium-course-1&userId=${userAId}`,
        headers: { cookie: `avana_session=${userBToken}` },
      });
      expect(spoofAccess.statusCode).toBe(200);
      // Still denied because backend uses actor.userId from authentication token!
      expect(spoofAccess.json().granted).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Study Session Separation
  // -------------------------------------------------------------------------
  describe("7. Study Sessions Independence", () => {
    it("preserves study session records across authentication session takeovers", async () => {
      // 1. Mobile login
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "study@example.com",
          password: "Password123!",
          name: "Study User",
        },
      });
      const mobileToken = extractCookie(regRes, "avana_session")!;
      const userId = asUserId(regRes.json().user.id);

      // 2. Start a study session
      const startStudyRes = await app.inject({
        method: "POST",
        url: "/v1/study-sessions/start",
        headers: { cookie: `avana_session=${mobileToken}` },
        payload: {
          activityType: "lesson",
        },
      });
      expect(startStudyRes.statusCode).toBe(201);
      const studySessionId = startStudyRes.json().session.id;

      // 3. Desktop login triggers auth session takeover
      const deskLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "study@example.com",
          password: "Password123!",
        },
      });
      expect(deskLogin.statusCode).toBe(200);
      const deskToken = extractCookie(deskLogin, "avana_session")!;

      // 4. End the study session using the new active auth session
      const completeStudyRes = await app.inject({
        method: "POST",
        url: "/v1/study-sessions/end",
        headers: { cookie: `avana_session=${deskToken}` },
        payload: {
          sessionId: studySessionId,
        },
      });
      expect(completeStudyRes.statusCode).toBe(200);

      // Verify study session is intact in study store
      const studySession = await studySessionStore.findById(studySessionId);
      expect(studySession).toBeDefined();
      expect(studySession?.endedAt).toBeDefined();
      expect(studySession?.endedAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Single-Session Race Safety
  // -------------------------------------------------------------------------
  describe("8. Single-Session Race Safety", () => {
    it("guarantees only 1 session remains active when concurrent takeovers occur", async () => {
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "desktop" },
        payload: {
          email: "race@example.com",
          password: "Password123!",
          name: "Race User",
        },
      });
      const deviceId = extractCookie(regRes, "avana_device_id")!;

      // Execute 5 concurrent login requests for the same user
      const results = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          app.inject({
            method: "POST",
            url: "/v1/auth/sign-in",
            headers: {
              "x-device-type": "desktop",
              cookie: `avana_device_id=${deviceId}`,
            },
            payload: {
              email: "race@example.com",
              password: "Password123!",
            },
          }),
        ),
      );

      for (const res of results) {
        expect(res.statusCode).toBe(200);
      }

      // Query all sessions for this user from the store directly
      const tokens = results.map((r) => extractCookie(r, "avana_session")!);
      let activeCount = 0;
      let revokedCount = 0;

      for (const token of tokens) {
        const details = await sessionStore.findByTokenHash(hashToken(token));
        if (details && !details.revokedAt) {
          activeCount++;
        } else if (details && details.revokedAt) {
          revokedCount++;
        }
      }

      // Exactly 1 active session in the store!
      expect(activeCount).toBe(1);
      expect(revokedCount).toBe(4);
    });

    it("fires simultaneous logins from two different device types (mobile and desktop) and resolves with exactly 1 active session and both devices registered", async () => {
      // 1. Register user on Mobile Device 1
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: {
          "x-device-type": "mobile",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        },
        payload: {
          email: "twodevices@example.com",
          password: "Password123!",
          name: "Two Devices",
        },
      });
      const userId = asUserId(regRes.json().user.id);
      const mobileDeviceId = extractCookie(regRes, "avana_device_id")!;

      // 2. Fire simultaneous login: re-login from registered mobile + new login from desktop (desktop slot free)
      const [resMobile, resDesktop] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/auth/sign-in",
          headers: {
            "x-device-type": "mobile",
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
            cookie: `avana_device_id=${mobileDeviceId}`,
          },
          payload: {
            email: "twodevices@example.com",
            password: "Password123!",
          },
        }),
        app.inject({
          method: "POST",
          url: "/v1/auth/sign-in",
          headers: {
            "x-device-type": "desktop",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          },
          payload: {
            email: "twodevices@example.com",
            password: "Password123!",
          },
        }),
      ]);

      expect(resMobile.statusCode).toBe(200);
      expect(resDesktop.statusCode).toBe(200);

      // 3. Both devices must be registered in user_devices (1 mobile, 1 desktop)
      const registeredDevices = await deviceStore.findActiveByUser(userId);
      expect(registeredDevices.length).toBe(2);
      expect(registeredDevices.some((d) => d.deviceType === "mobile")).toBe(true);
      expect(registeredDevices.some((d) => d.deviceType === "desktop")).toBe(true);

      // 4. Exactly ONE active session in the store
      const mobileToken = extractCookie(resMobile, "avana_session")!;
      const desktopToken = extractCookie(resDesktop, "avana_session")!;
      const mobileSession = await sessionStore.findByTokenHash(hashToken(mobileToken));
      const desktopSession = await sessionStore.findByTokenHash(hashToken(desktopToken));

      const activeCount =
        (mobileSession && !mobileSession.revokedAt ? 1 : 0) +
        (desktopSession && !desktopSession.revokedAt ? 1 : 0);

      expect(activeCount).toBe(1);

      // One session was revoked via takeover
      const revokedSession = !mobileSession?.revokedAt ? desktopSession : mobileSession;
      expect(revokedSession?.revokedAt).toBeDefined();
      expect(revokedSession?.revocationReason).toBe("session_takeover");
    });
  });

  // -------------------------------------------------------------------------
  // 9. Legacy Pre-Migration Session Compatibility
  // -------------------------------------------------------------------------
  describe("9. Pre-Migration Legacy Session Compatibility", () => {
    it("allows existing session with device_id=null to access API, and revokes it when a new login occurs", async () => {
      // 1. Create user
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "legacy@example.com",
          password: "Password123!",
          name: "Legacy User",
        },
      });
      const userId = asUserId(regRes.json().user.id);

      // 2. Simulate pre-migration session: insert session directly with deviceId=null
      const legacyToken = "legacy_token_" + randomUUID();
      const legacyTokenHash = hashToken(legacyToken);
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();

      await sessionStore.createSessionWithTakeover({
        userId,
        tokenHash: legacyTokenHash,
        expiresAt,
        deviceId: null, // Legacy session has no device associated
      });

      // 3. Authenticated request with legacy session succeeds
      const meLegacy = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${legacyToken}` },
      });
      expect(meLegacy.statusCode).toBe(200);
      expect(meLegacy.json().user.id).toBe(userId);

      // 4. User logs in from a new mobile device
      const newLoginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "legacy@example.com",
          password: "Password123!",
        },
      });
      expect(newLoginRes.statusCode).toBe(200);
      const newSessionToken = extractCookie(newLoginRes, "avana_session")!;

      // 5. Subsequent request with legacy session returns 401 SESSION_REVOKED
      const meLegacyAfter = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${legacyToken}` },
      });
      expect(meLegacyAfter.statusCode).toBe(401);
      expect(meLegacyAfter.json().error.code).toBe("SESSION_REVOKED");

      // 6. Request with new session succeeds
      const meNewAfter = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${newSessionToken}` },
      });
      expect(meNewAfter.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Sensitive Credentials Leakage Prevention in Auth Attempt Logs
  // -------------------------------------------------------------------------
  describe("10. Attempt Logging Security", () => {
    it("records attempts without persisting passwords, raw session tokens, cookies, or secrets", async () => {
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "leaktest@example.com",
          password: "SuperSecretPassword123!",
          name: "Leak Test",
        },
      });
      const userId = asUserId(regRes.json().user.id);

      // Blocked 2nd mobile login
      await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "leaktest@example.com",
          password: "SuperSecretPassword123!",
        },
      });

      const attempts = await deviceStore.listAttemptsByUser(userId);
      expect(attempts.length).toBeGreaterThanOrEqual(1);

      for (const attempt of attempts) {
        // Stringify full attempt to check all persisted fields
        const str = JSON.stringify(attempt);
        expect(str).not.toContain("SuperSecretPassword123!");
        expect(str).not.toContain("avana_session");
        expect(str).not.toContain("Bearer");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11. Subscription & Entitlements Cross-User Hardening
  // -------------------------------------------------------------------------
  describe("11. Subscription & Entitlements Cross-User Hardening", () => {
    it("ensures unentitled user cannot access subscription data or entitlements via query/body tampering", async () => {
      // User A (active sub)
      const userARes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "subowner@example.com",
          password: "Password123!",
          name: "Sub Owner",
        },
      });
      const userAToken = extractCookie(userARes, "avana_session")!;
      const userAId = asUserId(userARes.json().user.id);

      await commerceStore.createSubscription({
        id: randomUUID(),
        userId: userAId,
        productId: randomUUID(),
        orderId: null,
        status: "active",
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await commerceStore.grantEntitlement({
        id: randomUUID(),
        userId: userAId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "subscription",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // User B (no sub)
      const userBRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "subattacker@example.com",
          password: "Password123!",
          name: "Sub Attacker",
        },
      });
      const userBToken = extractCookie(userBRes, "avana_session")!;

      // 1. User B queries GET /v1/commerce/subscriptions/my with userA's ID in query
      const mySubB = await app.inject({
        method: "GET",
        url: `/v1/commerce/subscriptions/my?userId=${userAId}&user_id=${userAId}`,
        headers: {
          cookie: `avana_session=${userBToken}`,
          "x-user-id": userAId,
        },
      });
      expect(mySubB.statusCode).toBe(200);
      expect(mySubB.json().subscription).toBeNull();

      // 2. User B queries GET /v1/commerce/entitlements/my with userA's ID in query
      const myEntsB = await app.inject({
        method: "GET",
        url: `/v1/commerce/entitlements/my?userId=${userAId}&user_id=${userAId}`,
        headers: {
          cookie: `avana_session=${userBToken}`,
          "x-user-id": userAId,
        },
      });
      expect(myEntsB.statusCode).toBe(200);
      expect(myEntsB.json().items).toEqual([]);

      // 3. User A's session is revoked, then tries accessing commerce endpoints -> 401 SESSION_REVOKED
      const mobileTakeover = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        headers: { "x-device-type": "mobile" },
        payload: {
          email: "subowner@example.com",
          password: "Password123!",
        },
      });
      expect(mobileTakeover.statusCode).toBe(200);

      const revokedAccess = await app.inject({
        method: "GET",
        url: "/v1/commerce/subscriptions/my",
        headers: { cookie: `avana_session=${userAToken}` },
      });
      expect(revokedAccess.statusCode).toBe(401);
      expect(revokedAccess.json().error.code).toBe("SESSION_REVOKED");
    });
  });
});
