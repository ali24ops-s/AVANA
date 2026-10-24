/**
 * WelcomeGiftService — Business logic for signup welcome gifts.
 *
 * Coordinates:
 * 1. Eligibility evaluation (isolated to genuine new registrations)
 * 2. Deferred 7-day subscription activation upon dashboard entry
 * 3. 20,000 Tomans atomic wallet credit
 * 4. Popup view state tracking in backend
 * 5. Safe recovery if registration succeeded but initial record insertion failed
 */

import type {
  UserId,
  WelcomeGiftRecord,
  WelcomeGiftStatusResponse,
  WelcomeGiftAcknowledgeResponse,
} from "@avana/domain";
import type { WelcomeGiftStore } from "./welcome-gift-store.js";
import type { UserStore } from "./user-store.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface WelcomeGiftServiceOptions {
  store: WelcomeGiftStore;
  userStore: UserStore;
  notificationService?: NotificationService;
  auditService?: AuditService;
  /** ISO timestamp cutoff: Users created before this timestamp are legacy and ineligible */
  featureActivationTimestamp?: string;
}

export class WelcomeGiftService {
  private readonly store: WelcomeGiftStore;
  private readonly userStore: UserStore;
  private readonly notificationService?: NotificationService;
  private readonly auditService?: AuditService;
  private readonly featureCutoffMs: number;

  constructor(opts: WelcomeGiftServiceOptions) {
    this.store = opts.store;
    this.userStore = opts.userStore;
    this.notificationService = opts.notificationService;
    this.auditService = opts.auditService;
    // Default cutoff timestamp: 2026-10-21T00:00:00.000Z
    this.featureCutoffMs = opts.featureActivationTimestamp
      ? new Date(opts.featureActivationTimestamp).getTime()
      : new Date("2026-10-21T00:00:00.000Z").getTime();
  }

  /**
   * Registers a pending welcome gift during the user signup lifecycle.
   * Catches any transient errors so user registration itself is never blocked.
   */
  async registerOnSignup(userId: UserId): Promise<WelcomeGiftRecord | null> {
    try {
      return await this.store.createPendingGift(userId);
    } catch {
      // Graceful degradation: will be recovered safely when user enters dashboard
      return null;
    }
  }

  /**
   * Checks eligibility and activates the welcome gift (starting 7-day subscription from now)
   * if the user is a valid new registrant.
   */
  async getOrActivateStatus(userId: UserId): Promise<WelcomeGiftStatusResponse> {
    let gift = await this.store.findGiftByUserId(userId);

    // If no record exists, verify whether this is a legitimate new user needing recovery
    if (!gift) {
      const user = await this.userStore.findById(userId);
      if (!user) {
        return {
          eligible: false,
          granted: false,
          popup_seen: true,
          gift: null,
        };
      }

      // Check user registration creation time
      // Legacy users with createdAt before cutoff are strictly excluded
      const typedUser = user as { createdAt?: string | Date };
      const userCreatedAt = typedUser.createdAt
        ? new Date(typedUser.createdAt).getTime()
        : null;

      if (userCreatedAt === null || isNaN(userCreatedAt) || userCreatedAt < this.featureCutoffMs) {
        return {
          eligible: false,
          granted: false,
          popup_seen: true,
          gift: null,
        };
      }

      // Newly registered user whose gift record failed at registration -> recover safely
      gift = await this.store.createPendingGift(userId);
    }

    // If gift is pending, activate both gifts atomically right now (starts 7-day subscription from now)
    if (gift.status === "pending") {
      const grantResult = await this.store.executeAtomicGrant(userId);
      gift = grantResult.record;

      if (!grantResult.alreadyGranted) {
        // Emit audit log
        if (this.auditService) {
          try {
            await this.auditService.emit([
              {
                actorId: userId,
                organizationId: null,
                action: "wallet.credited",
                entityType: "wallet",
                entityId: gift.id,
                createdAt: gift.grantedAt ?? new Date().toISOString(),
                details: {
                  walletAmount: gift.walletAmount,
                  subscriptionDays: gift.subscriptionDays,
                  walletTransactionId: gift.walletTransactionId,
                  subscriptionId: gift.subscriptionId,
                },
              },
            ]);
          } catch {
            // Suppress audit log failures to preserve consistency
          }
        }

        // Notification
        if (this.notificationService) {
          try {
            await this.notificationService.notifyWelcomeGiftGranted(userId);
          } catch {
            // Suppress notification dispatch failure
          }
        }
      }
    }

    const popupSeen = Boolean(gift.popupSeenAt);

    return {
      eligible: true,
      granted: gift.status === "completed",
      popup_seen: popupSeen,
      gift: {
        wallet_amount: gift.walletAmount,
        currency: "toman",
        subscription_days: gift.subscriptionDays,
        granted_at: gift.grantedAt,
      },
    };
  }

  /**
   * Acknowledges that the user has seen or dismissed the welcome popup in their dashboard.
   */
  async acknowledgePopup(userId: UserId): Promise<WelcomeGiftAcknowledgeResponse> {
    const updated = await this.store.markPopupSeen(userId);
    const seenAt = updated?.popupSeenAt ?? new Date().toISOString();

    return {
      success: true,
      popup_seen_at: seenAt,
    };
  }
}
