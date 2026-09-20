import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asUserId,
  asUserSubscriptionId,
  asProductId,
  normalizeReferralCode,
  generateRandomReferralCode,
  calculateSubscriptionExpiry,
} from "@avana/domain";
import { InMemoryReferralStore } from "../modules/referral/in-memory-stores.js";
import { ReferralService } from "../modules/referral/referral-service.js";

describe("AVANA Referral System (V1) Subscription Rewards & Abuse Hardening", () => {
  let referralStore: InMemoryReferralStore;
  let referralService: ReferralService;

  const inviterActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "platform_admin",
  };

  beforeEach(async () => {
    referralStore = new InMemoryReferralStore();
    referralService = new ReferralService(
      referralStore,
      undefined, // No wallet service
      undefined, // NotificationService
      undefined, // AuditService
    );

    // Set default config: 15 days reward, 4 max invites, 60 days max total
    await referralStore.updateReferralSystemConfig(adminActor.userId, {
      enabled: true,
      rewardDays: 15,
      maxRewardedReferrals: 4,
      maxRewardDays: 60,
    });
  });

  describe("1. Referral Code Generation & Normalization", () => {
    it("generates valid Crockford Base32-compliant referral codes", () => {
      for (let i = 0; i < 20; i++) {
        const code = generateRandomReferralCode();
        expect(code).toMatch(/^AVN[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
        expect(code).not.toMatch(/[01OIL]/);
      }
    });

    it("normalizes referral codes correctly", () => {
      expect(normalizeReferralCode("  avn7k4p2  ")).toBe("AVN7K4P2");
      expect(normalizeReferralCode("avn-7k4p2")).toBe("AVN7K4P2");
      expect(normalizeReferralCode("")).toBe("");
      expect(normalizeReferralCode("   ")).toBe("");
    });

    it("creates unique referral code lazily for user and returns summary", async () => {
      const summary1 = await referralService.getMyReferralSummary(inviterActor, "https://aavana.ir");
      expect(summary1.referralCode).toMatch(/^AVN/);
      expect(summary1.inviteUrl).toBe(`https://aavana.ir/register?ref=${summary1.referralCode}`);
      expect(summary1.totalInvites).toBe(0);
      expect(summary1.rewardedDays).toBe(0);
      expect(summary1.maxReferrals).toBe(4);
      expect(summary1.maxRewardDays).toBe(60);
      expect(summary1.isLimitReached).toBe(false);

      // Calling again returns the exact same code
      const summary2 = await referralService.getMyReferralSummary(inviterActor, "https://aavana.ir");
      expect(summary2.referralCode).toBe(summary1.referralCode);
    });
  });

  describe("2. Registration Qualification & Immediate 15-Day Reward", () => {
    it("qualifies immediately on valid registration and grants 15 days subscription to inviter", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const inviteeUserId = asUserId(randomUUID());

      const result = await referralService.processReferralOnRegister({
        invitedUserId: inviteeUserId,
        referralCode: code.toLowerCase(), // Case-insensitive test
        deviceId: "dev_invitee_clean_111111111111111111111111111111111111111111111111",
      });

      expect(result.success).toBe(true);
      expect(result.rewarded).toBe(true);
      expect(result.referral?.status).toBe("rewarded");
      expect(result.referral?.rewardStatus).toBe("completed");
      expect(result.referral?.rewardAmount).toBe(15);
      expect(result.referral?.rewardType).toBe("subscription_days");

      // Verify inviter's subscription was granted
      expect(referralStore.userSubscriptions.length).toBe(1);
      expect(referralStore.userSubscriptions[0].userId).toBe(inviterActor.userId);
      expect(referralStore.userSubscriptions[0].status).toBe("active");

      // Verify inviter's entitlement was granted
      expect(referralStore.userEntitlements.length).toBe(1);
      expect(referralStore.userEntitlements[0].userId).toBe(inviterActor.userId);
      expect(referralStore.userEntitlements[0].resourceType).toBe("subscription");
      expect(referralStore.userEntitlements[0].sourceType).toBe("gift");

      // Verify summary reflects 1 invite and 15 days
      const summary = await referralService.getMyReferralSummary(inviterActor);
      expect(summary.totalInvites).toBe(1);
      expect(summary.rewardedCount).toBe(1);
      expect(summary.rewardedDays).toBe(15);
      expect(summary.isLimitReached).toBe(false);
    });

    it("registration with invalid referral code succeeds without granting reward", async () => {
      const inviteeUserId = asUserId(randomUUID());

      const result = await referralService.processReferralOnRegister({
        invitedUserId: inviteeUserId,
        referralCode: "AVNNONEXISTENT",
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_code");
      expect(referralStore.userSubscriptions.length).toBe(0);
      expect(referralStore.userEntitlements.length).toBe(0);
    });

    it("rejects self-referral attempts without granting reward", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);

      const result = await referralService.processReferralOnRegister({
        invitedUserId: inviterActor.userId,
        referralCode: code,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("self_referral");
      expect(referralStore.userSubscriptions.length).toBe(0);
    });
  });

  describe("3. Purchase Independence", () => {
    it("inviter receives 15 days reward even if invited user never makes any purchase", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const inviteeUserId = asUserId(randomUUID());

      // Invitee registers with referral code
      const result = await referralService.processReferralOnRegister({
        invitedUserId: inviteeUserId,
        referralCode: code,
      });

      expect(result.rewarded).toBe(true);

      // Inviter already has active subscription from registration alone
      expect(referralStore.userSubscriptions.length).toBe(1);
      expect(referralStore.userSubscriptions[0].status).toBe("active");
    });
  });

  describe("4. Reward Limit: Max 4 Invites / 60 Days", () => {
    it("grants 15 days for first 4 referrals (60 days total) and caps at 4", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);

      // Referral #1 -> +15 days (Total 15)
      const res1 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: "dev_dev1_111111111111111111111111111111111111111111111111",
      });
      expect(res1.rewarded).toBe(true);

      // Referral #2 -> +15 days (Total 30)
      const res2 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: "dev_dev2_222222222222222222222222222222222222222222222222",
      });
      expect(res2.rewarded).toBe(true);

      // Referral #3 -> +15 days (Total 45)
      const res3 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: "dev_dev3_333333333333333333333333333333333333333333333333",
      });
      expect(res3.rewarded).toBe(true);

      // Referral #4 -> +15 days (Total 60)
      const res4 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: "dev_dev4_444444444444444444444444444444444444444444444444",
      });
      expect(res4.rewarded).toBe(true);

      // Referral #5 -> Capped! Referral recorded as limit_reached, NO reward granted
      const res5 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: "dev_dev5_555555555555555555555555555555555555555555555555",
      });
      expect(res5.success).toBe(true);
      expect(res5.rewarded).toBe(false);
      expect(res5.limitReached).toBe(true);
      expect(res5.referral?.status).toBe("qualified");
      expect(res5.referral?.rewardStatus).toBe("limit_reached");
      expect(res5.referral?.rewardAmount).toBe(0);

      // Total user subscriptions granted is exactly 4 records
      expect(referralStore.userSubscriptions.length).toBe(4);

      // Check summary
      const summary = await referralService.getMyReferralSummary(inviterActor);
      expect(summary.totalInvites).toBe(5);
      expect(summary.rewardedCount).toBe(4);
      expect(summary.rewardedDays).toBe(60);
      expect(summary.isLimitReached).toBe(true);
    });
  });

  describe("5. Existing Subscription Extension vs Fresh Subscription", () => {
    it("extends existing active subscription by 15 days from current expiry", async () => {
      // Setup existing subscription for inviter with 10 days remaining
      const now = new Date();
      const existingExpiry = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      referralStore.userSubscriptions.push({
        id: asUserSubscriptionId(randomUUID()),
        userId: inviterActor.userId,
        productId: asProductId("55555555-5555-4555-8555-555555555555"),
        orderId: null,
        status: "active",
        startedAt: now.toISOString(),
        expiresAt: existingExpiry.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const result = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
      });

      expect(result.rewarded).toBe(true);

      // The new subscription expiry should be exactly existingExpiry + 15 days
      const expectedExpiry = calculateSubscriptionExpiry(existingExpiry, 15);
      const latestSub = referralStore.userSubscriptions[referralStore.userSubscriptions.length - 1];
      const actualExpiry = new Date(latestSub.expiresAt);

      // Compare timestamps within 2-second tolerance
      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(2000);
    });

    it("starts fresh 15-day subscription from now if inviter has no active subscription", async () => {
      const beforeTime = new Date();
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const result = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
      });

      expect(result.rewarded).toBe(true);
      const latestSub = referralStore.userSubscriptions[0];
      const actualExpiry = new Date(latestSub.expiresAt);
      const expectedExpiry = calculateSubscriptionExpiry(beforeTime, 15);

      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(2000);
    });
  });

  describe("6. Device Abuse Prevention", () => {
    it("allows reward for first account on device, but rejects reward for second account on same device for same inviter", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const deviceX = "dev_shared_browser_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

      // Account B registered on Device X with Inviter A's code -> REWARD (+15)
      const resB = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: deviceX,
      });
      expect(resB.success).toBe(true);
      expect(resB.rewarded).toBe(true);
      expect(resB.abuse).toBe(false);

      // Account C registered on Device X with Inviter A's code -> Registration SUCCESS, but REWARD REJECTED (Abuse)
      const resC = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: deviceX,
      });
      expect(resC.success).toBe(true);
      expect(resC.rewarded).toBe(false);
      expect(resC.abuse).toBe(true);
      expect(resC.referral?.rewardStatus).toBe("abuse_rejected");
      expect(resC.referral?.rewardAmount).toBe(0);

      // Account D registered on Device X with Inviter A's code -> Registration SUCCESS, but REWARD REJECTED
      const resD = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: deviceX,
      });
      expect(resD.success).toBe(true);
      expect(resD.rewarded).toBe(false);
      expect(resD.abuse).toBe(true);

      // Account E registered on Device Y with Inviter A's code -> REWARD (+15)
      const deviceY = "dev_clean_phone_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy";
      const resE = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: deviceY,
      });
      expect(resE.success).toBe(true);
      expect(resE.rewarded).toBe(true);
      expect(resE.abuse).toBe(false);

      // Total rewarded subscriptions granted is exactly 2 (for B and E)
      expect(referralStore.userSubscriptions.length).toBe(2);
    });

    it("rejects self-referral when user registers on their own registered device", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const inviterDeviceId = "dev_inviter_macbook_iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii";

      // Register device for inviter
      referralStore.userDevices.push({
        userId: inviterActor.userId,
        deviceId: inviterDeviceId,
      });

      // Different user ID registers using inviter's device ID
      const newAccountUserId = asUserId(randomUUID());
      const res = await referralService.processReferralOnRegister({
        invitedUserId: newAccountUserId,
        referralCode: code,
        deviceId: inviterDeviceId,
      });

      // Registration succeeds, but referral reward rejected as self-device abuse
      expect(res.success).toBe(true);
      expect(res.rewarded).toBe(false);
      expect(res.abuse).toBe(true);
      expect(res.referral?.rewardStatus).toBe("abuse_rejected");
      expect(referralStore.userSubscriptions.length).toBe(0);
    });

    it("allows same device to register with a different inviter code", async () => {
      const inviterA = asUserId(randomUUID());
      const inviterB = asUserId(randomUUID());
      const codeA = (await referralService.getOrCreateReferralCode(inviterA)).code;
      const codeB = (await referralService.getOrCreateReferralCode(inviterB)).code;

      const deviceZ = "dev_shared_lab_pc_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

      // Account 1 refers to Inviter A on Device Z -> Rewarded
      const res1 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: codeA,
        deviceId: deviceZ,
      });
      expect(res1.rewarded).toBe(true);

      // Account 2 refers to Inviter B on Device Z -> Rewarded (different inviter!)
      const res2 = await referralService.processReferralOnRegister({
        invitedUserId: asUserId(randomUUID()),
        referralCode: codeB,
        deviceId: deviceZ,
      });
      expect(res2.rewarded).toBe(true);
    });
  });

  describe("7. Concurrency & Idempotency", () => {
    it("handles 5 concurrent registrations atomically and limits rewards to exactly 4", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);

      const registrations = Array.from({ length: 5 }, (_, i) => ({
        invitedUserId: asUserId(randomUUID()),
        referralCode: code,
        deviceId: `dev_concurrent_device_${i}_cccccccccccccccccccccccccccc`,
      }));

      // Fire 5 registrations simultaneously
      const results = await Promise.all(
        registrations.map((p) => referralService.processReferralOnRegister(p)),
      );

      const rewardedCount = results.filter((r) => r.rewarded).length;
      const limitReachedCount = results.filter((r) => r.limitReached).length;

      expect(rewardedCount).toBe(4);
      expect(limitReachedCount).toBe(1);
      expect(referralStore.userSubscriptions.length).toBe(4);

      // Total days granted is exactly 60
      const summary = await referralService.getMyReferralSummary(inviterActor);
      expect(summary.rewardedDays).toBe(60);
      expect(summary.rewardedCount).toBe(4);
    });

    it("processing same referral twice does NOT grant double reward", async () => {
      const { code } = await referralService.getOrCreateReferralCode(inviterActor.userId);
      const inviteeId = asUserId(randomUUID());
      const params = {
        invitedUserId: inviteeId,
        referralCode: code,
        deviceId: "dev_idempotency_111111111111111111111111111111111111111",
      };

      const first = await referralService.processReferralOnRegister(params);
      expect(first.rewarded).toBe(true);
      expect(referralStore.userSubscriptions.length).toBe(1);

      // Second identical call
      const second = await referralService.processReferralOnRegister(params);
      expect(second.success).toBe(false);
      expect(second.reason).toBe("already_referred");

      // Subscription count strictly remains 1
      expect(referralStore.userSubscriptions.length).toBe(1);
    });
  });
});
