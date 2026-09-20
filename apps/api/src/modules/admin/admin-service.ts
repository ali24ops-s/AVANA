/**
 * Admin Service.
 *
 * Handles admin-specific business logic, relying on the AdminStore.
 */

import type {
  AdminStore,
  DashboardStats,
  AdminUsersList,
  AdminGenerationJobRecord,
  AdminRejectedContentRecord,
  DataIntegrityReport,
  AdminCommerceStats,
  AdminOrdersList,
  AdminPaymentsList,
  AdminSubscriptionsList,
  AdminEntitlementsList,
  AdminProductRecord,
  AdminUserCommerceProfile,
  AdminGrantInput,
  AdminPromotionListItem,
  AdminPromotionDetail,
  CreateAdminPromotionInput,
  UpdateAdminPromotionInput,
  AdminPromotionRedemptionListItem,
} from "./admin-store.js";
import { randomUUID } from "node:crypto";
import {
  DomainError,
  asOrderId,
  asUserId,
  asOrganizationId,
  asUserEntitlementId,
  type UUID,
  type ContentGenerationPricingConfig,
  type UpdateContentGenerationPricingInput,
  type SubscriptionCreditBonusesConfig,
  resolveSubscriptionPlanType,
  resolveGiftCreditAmount,
  validateSubscriptionCreditBonuses,
} from "@avana/domain";
import type { WalletService } from "../wallet/wallet-service.js";
import type { CommerceStore } from "../commerce/commerce-store.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { PromotionService } from "../commerce/promotion-service.js";
import type { StudyService } from "../study/study-service.js";

export class AdminService {
  constructor(
    private readonly store: AdminStore,
    private readonly walletService?: WalletService,
    private readonly commerceStore?: CommerceStore,
    private readonly notificationService?: NotificationService,
    private readonly promotionService?: PromotionService,
    _referralService?: import("../referral/referral-service.js").ReferralService,
    private readonly studyService?: StudyService,
  ) {}

  async getDashboardStats(): Promise<DashboardStats> {
    return this.store.getDashboardStats();
  }

  async listUsers(page: number, pageSize: number, search?: string, role?: string, status?: string): Promise<AdminUsersList> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listUsers({ page, pageSize, search, role, status });
  }

  async listGenerationJobs(page: number, pageSize: number, status?: string): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    if (page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (pageSize < 1 || pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    
    return this.store.listGenerationJobs({ page, pageSize, status });
  }

  async listRejectedGeneratedContents(params: {
    page: number;
    pageSize: number;
    type?: string;
    courseId?: string;
    search?: string;
  }): Promise<{ items: AdminRejectedContentRecord[]; totalCount: number }> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100)
      throw new DomainError("bad_request", "Page size must be between 1 and 100");

    return this.store.listRejectedGeneratedContents(params);
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return this.store.getDataIntegrityReport();
  }

  // ---------------------------------------------------------------------------
  // Monetization & Commerce
  // ---------------------------------------------------------------------------

  async getCommerceStats(): Promise<AdminCommerceStats> {
    return this.store.getCommerceStats();
  }

  async listCommerceOrders(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<AdminOrdersList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceOrders(params);
  }

  async listCommercePayments(params: {
    page: number;
    pageSize: number;
    search?: string;
    gateway?: string;
    status?: string;
    from?: string;
    to?: string;
    category?: string;
    productType?: string;
  }): Promise<AdminPaymentsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommercePayments(params);
  }

  async listCommerceSubscriptions(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }): Promise<AdminSubscriptionsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceSubscriptions(params);
  }

  async listCommerceEntitlements(params: {
    page: number;
    pageSize: number;
    search?: string;
    resourceType?: string;
    sourceType?: string;
    status?: string;
  }): Promise<AdminEntitlementsList> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100) throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommerceEntitlements(params);
  }

  async listCommerceProducts(): Promise<AdminProductRecord[]> {
    return this.store.listCommerceProducts();
  }

  async updateCommerceProduct(
    adminId: string,
    productId: string,
    payload: { active?: boolean; price?: number },
  ): Promise<AdminProductRecord> {
    if (!productId) throw new DomainError("bad_request", "Product ID is required");
    if (
      payload.price !== undefined &&
      (typeof payload.price !== "number" || isNaN(payload.price) || !Number.isInteger(payload.price) || payload.price < 0)
    ) {
      throw new DomainError("bad_request", "Price must be a non-negative integer");
    }
    return this.store.updateCommerceProduct(adminId, productId, payload);
  }

  async grantCommerceEntitlement(
    adminId: string,
    input: AdminGrantInput,
  ): Promise<any> {
    if (!input.userId) throw new DomainError("bad_request", "User ID is required");
    if (!["subscription", "course", "content_pack"].includes(input.resourceType)) {
      throw new DomainError("bad_request", "Invalid resource type");
    }
    if ((input.resourceType === "course" || input.resourceType === "content_pack") && !input.resourceId) {
      throw new DomainError("bad_request", "Resource ID is required for course or content_pack grants");
    }
    if (input.durationDays !== undefined && (input.durationDays < 1 || input.durationDays > 3650)) {
      throw new DomainError("bad_request", "durationDays must be between 1 and 3650");
    }
    return this.store.grantCommerceEntitlement(adminId, input);
  }

  async cancelUserSubscription(
    adminId: string,
    subscriptionId: string,
    reason?: string,
  ): Promise<{ success: boolean; subscription: any; message?: string }> {
    if (!subscriptionId) {
      throw new DomainError("bad_request", "شناسه اشتراک الزامی است.");
    }
    return this.store.cancelCommerceSubscription(adminId, subscriptionId, reason);
  }

  async approvePayment(
    adminId: string,
    paymentId: string,
  ): Promise<{ success: boolean; payment: any; message?: string }> {
    if (!paymentId) {
      throw new DomainError("bad_request", "شناسه پرداخت الزامی است.");
    }
    let result: { success: boolean; payment: any; message?: string };
    try {
      result = await this.store.approveCommercePayment(adminId, paymentId);
    } catch (err: any) {
      if (err.message === "not_found") {
        throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
      }
      if (err.message === "payment_already_rejected") {
        throw new DomainError(
          "conflict",
          "این پرداخت قبلاً رد شده و امکان تأیید آن وجود ندارد.",
        );
      }
      if (err.message === "invalid_payment_status") {
        throw new DomainError(
          "bad_request",
          "این پرداخت در وضعیت انتظار برای بررسی قرار ندارد.",
        );
      }
      throw err;
    }

    if (result.success && result.payment) {
      try {
        const orderId = asOrderId(result.payment.orderId as UUID);
        let order = this.commerceStore
          ? await this.commerceStore.findOrderById(orderId)
          : null;
        let product = order && this.commerceStore
          ? await this.commerceStore.findProductById(order.productId)
          : null;
        let userId = result.payment.userId;
        let orderNumber = result.payment.orderNumber;
        let isWalletTopup =
          product?.type === "wallet_topup" ||
          result.payment.productTitle === "شارژ کیف پول" ||
          result.payment.productType === "wallet_topup" ||
          (order?.metadata as any)?.type === "wallet_topup";

        if (!order && (this.store as any).memoryOrders) {
          const mOrder = (this.store as any).memoryOrders.find(
            (o: any) => o.id === orderId,
          );
          if (mOrder) {
            userId = mOrder.userId;
            orderNumber = mOrder.orderNumber;
            if (mOrder.productType === "wallet_topup" || mOrder.productTitle === "شارژ کیف پول") {
              isWalletTopup = true;
            }
            const mProd = (this.store as any).memoryProducts?.find(
              (p: any) => p.id === mOrder.productId,
            );
            if (mProd) {
              product = mProd;
              if (mProd.type === "wallet_topup") {
                isWalletTopup = true;
              }
            }
          }
        }

        if (product && product.type === "subscription" && this.commerceStore) {
          const planType = resolveSubscriptionPlanType(product);
          if (planType && this.walletService) {
            const subscriptions = await this.commerceStore.listSubscriptionsByUser(
              order!.userId,
            );
            const sub = subscriptions.find((s) => s.orderId === order!.id);
            if (sub) {
              const config = await this.store.getSubscriptionCreditBonuses();
              const giftAmount = resolveGiftCreditAmount(planType, config);
              if (giftAmount > 0) {
                await this.walletService.credit({
                  userId: order!.userId,
                  amount: giftAmount,
                  source: "subscription_bonus",
                  referenceType: "user_subscription",
                  referenceId: sub.id,
                  idempotencyKey: `subscription-gift:${sub.id}`,
                  metadata: {
                    subscriptionId: sub.id,
                    productId: product.id,
                    productTitle: product.title,
                    planType,
                    durationDays: product.durationDays,
                    giftAmount,
                    paymentId,
                    orderId: order!.id,
                    grantedAt: new Date().toISOString(),
                  },
                });
              }
            }
          }
          if (this.notificationService && userId) {
            await this.notificationService.notifyPurchaseCompleted(asUserId(userId as any), {
              paymentId,
              orderId,
              productTitle: product.title,
              productType: product.type,
            });
          }
        } else if (isWalletTopup) {
          if (this.walletService) {
            await this.walletService.credit({
              userId: asUserId(userId as any),
              amount: result.payment.amount,
              source: "wallet_topup",
              referenceType: "order",
              referenceId: orderId,
              idempotencyKey: `wallet-topup:payment:${paymentId}`,
              metadata: {
                paymentId,
                orderId,
                orderNumber,
                approvedBy: adminId,
                approvedAt: new Date().toISOString(),
              },
            });
          }
          if (this.notificationService && userId) {
            await this.notificationService.notifyWalletTopupApproved(
              asUserId(userId as any),
              {
                paymentId,
                amount: result.payment.amount,
                orderId,
              },
            );
          }
        } else if (product && product.type === "special_exam" && this.studyService && this.commerceStore) {
          const orgId = asOrganizationId(
            (product.metadata?.organizationId as string) || "00000000-0000-0000-0000-000000000001",
          );
          const attemptResult = await this.studyService.createSpecialExamAttempt(
            { userId: asUserId(userId as any), role: "student" },
            orgId,
            product,
            orderId,
          );
          await this.commerceStore.grantEntitlement({
            id: asUserEntitlementId(randomUUID()),
            userId: asUserId(userId as any),
            resourceType: "special_exam",
            resourceId: attemptResult.attempt.id,
            sourceType: "purchase",
            orderId,
            startsAt: new Date().toISOString(),
            expiresAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          if (this.notificationService && userId) {
            await this.notificationService.notifyPurchaseCompleted(asUserId(userId as any), {
              paymentId,
              orderId,
              productTitle: product.title,
              productType: product.type,
            });
          }
        } else if (product && this.notificationService && userId) {
          await this.notificationService.notifyPurchaseCompleted(asUserId(userId as any), {
            paymentId,
            orderId,
            productTitle: product.title,
            productType: product.type,
          });
        }

        // Finalize promotion redemption if any
        if (this.promotionService) {
          await this.promotionService.finalizePromotionForPaidOrder(orderId, paymentId);
        } else if ((this.store as any).memoryPromotionRedemptions) {
          const red = (this.store as any).memoryPromotionRedemptions.find(
            (r: any) => r.orderId === orderId && r.status === "pending",
          );
          if (red) {
            red.status = "completed";
            red.completedAt = new Date().toISOString();
            if (red.benefitType === "fixed_cashback" || red.benefitType === "percentage_cashback") {
              const cashback = Number(red.cashbackAmount || 0);
              if (cashback > 0 && this.walletService && userId) {
                await this.walletService.credit({
                  userId: asUserId(userId as any),
                  amount: cashback,
                  source: "promotion_cashback",
                  referenceType: "promotion",
                  referenceId: red.promotionId,
                  idempotencyKey: `cashback:redemption:${red.id}`,
                  metadata: {
                    promotionId: red.promotionId,
                    redemptionId: red.id,
                    orderId,
                    paymentId,
                    cashbackAmount: cashback,
                  },
                });
              }
            }
          }
        }
      } catch {
        // Handled silently to prevent blocking approval completion if wallet/notification fails
      }
    }

    return result;
  }

  async rejectPayment(
    adminId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ success: boolean; payment: any; message?: string }> {
    if (!paymentId) {
      throw new DomainError("bad_request", "شناسه پرداخت الزامی است.");
    }
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new DomainError("bad_request", "علت رد پرداخت (reason) الزامی است.");
    }
    let result: { success: boolean; payment: any; message?: string };
    try {
      result = await this.store.rejectCommercePayment(
        adminId,
        paymentId,
        trimmedReason,
      );
    } catch (err: any) {
      if (err.message === "not_found") {
        throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
      }
      if (err.message === "payment_already_approved") {
        throw new DomainError(
          "conflict",
          "این پرداخت قبلاً تأیید شده و امکان رد آن وجود ندارد.",
        );
      }
      if (err.message === "rejection_reason_required") {
        throw new DomainError("bad_request", "علت رد پرداخت الزامی است.");
      }
      if (err.message === "invalid_payment_status") {
        throw new DomainError(
          "bad_request",
          "این پرداخت در وضعیت انتظار برای بررسی قرار ندارد.",
        );
      }
      throw err;
    }

    if (result.success && result.payment) {
      try {
        const orderId = asOrderId(result.payment.orderId as UUID);
        const order = this.commerceStore
          ? await this.commerceStore.findOrderById(orderId)
          : null;
        const product = order && this.commerceStore
          ? await this.commerceStore.findProductById(order.productId)
          : null;
        let userId = result.payment.userId;
        let isWalletTopup =
          product?.type === "wallet_topup" ||
          result.payment.productTitle === "شارژ کیف پول" ||
          result.payment.productType === "wallet_topup" ||
          (order?.metadata as any)?.type === "wallet_topup";

        if (!order && (this.store as any).memoryOrders) {
          const mOrder = (this.store as any).memoryOrders.find(
            (o: any) => o.id === orderId,
          );
          if (mOrder) {
            userId = mOrder.userId;
            if (mOrder.productType === "wallet_topup" || mOrder.productTitle === "شارژ کیف پول") {
              isWalletTopup = true;
            }
          }
        }

        if (isWalletTopup && this.notificationService && userId) {
          await this.notificationService.notifyWalletTopupRejected(
            asUserId(userId as any),
            {
              paymentId,
              amount: result.payment.amount,
              orderId,
              reason: trimmedReason,
            },
          );
        } else if (this.notificationService && userId) {
          await this.notificationService.notifyPaymentFailed(
            asUserId(userId as any),
            {
              paymentId,
              orderId,
              reason: trimmedReason,
            },
          );
        }

        // Cancel promotion redemption if any
        if (this.promotionService) {
          await this.promotionService.cancelPromotionRedemption(orderId, "card_to_card_rejected");
        } else if ((this.store as any).memoryPromotionRedemptions) {
          const red = (this.store as any).memoryPromotionRedemptions.find(
            (r: any) => r.orderId === orderId && r.status === "pending",
          );
          if (red) {
            red.status = "cancelled";
          }
        }
      } catch {
        // Handled silently to prevent blocking rejection completion
      }
    }

    return result;
  }

  async getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile> {
    if (!userId) throw new DomainError("bad_request", "User ID is required");
    return this.store.getUserCommerceProfile(userId);
  }

  async getContentGenerationPricing(): Promise<ContentGenerationPricingConfig> {
    return this.store.getContentGenerationPricing();
  }

  async updateContentGenerationPricing(
    adminId: string,
    payload: UpdateContentGenerationPricingInput,
  ): Promise<ContentGenerationPricingConfig> {
    const validatePrice = (val: unknown, fieldName: string) => {
      if (val === undefined) return;
      if (
        typeof val !== "number" ||
        isNaN(val) ||
        !isFinite(val) ||
        !Number.isInteger(val) ||
        val < 0
      ) {
        throw new DomainError(
          "bad_request",
          `مقدار نامعتبر برای ${fieldName}. قیمت باید یک عدد صحیح نامنفی (تومان) باشد.`,
        );
      }
    };

    if (
      payload.lessonBaselinePriceToman === undefined &&
      payload.flashcardBaselinePriceToman === undefined &&
      payload.examBaselinePriceToman === undefined &&
      payload.summaryFixedPriceToman === undefined
    ) {
      throw new DomainError(
        "bad_request",
        "حداقل یک مقدار قیمت برای ویرایش باید ارسال شود.",
      );
    }

    validatePrice(payload.lessonBaselinePriceToman, "قیمت تولید درس");
    validatePrice(payload.flashcardBaselinePriceToman, "قیمت تولید فلشکارت");
    validatePrice(payload.examBaselinePriceToman, "قیمت تولید آزمون");
    validatePrice(payload.summaryFixedPriceToman, "قیمت خلاصه مروری");

    return this.store.updateContentGenerationPricing(adminId, payload);
  }

  async getSubscriptionCreditBonuses(): Promise<SubscriptionCreditBonusesConfig> {
    return this.store.getSubscriptionCreditBonuses();
  }

  async updateSubscriptionCreditBonuses(
    adminId: string,
    payload: Partial<SubscriptionCreditBonusesConfig>,
  ): Promise<SubscriptionCreditBonusesConfig> {
    if (!validateSubscriptionCreditBonuses(payload)) {
      throw new DomainError(
        "bad_request",
        "مقادیر پاداش اعتبار نامعتبر هستند. مبالغ باید اعداد صحیح نامنفی (تومان) باشند.",
      );
    }
    return this.store.updateSubscriptionCreditBonuses(adminId, payload);
  }

  async listCommercePromotions(params: {
    page: number;
    pageSize: number;
    search?: string;
    active?: boolean;
    benefitType?: string;
  }): Promise<{ items: AdminPromotionListItem[]; totalCount: number }> {
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100)
      throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommercePromotions(params);
  }

  async getCommercePromotion(id: string): Promise<AdminPromotionDetail> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    const promo = await this.store.getCommercePromotion(id);
    if (!promo) throw new DomainError("not_found", "پروموشن یافت نشد.");
    return promo;
  }

  async createCommercePromotion(
    adminId: string,
    payload: CreateAdminPromotionInput,
  ): Promise<AdminPromotionDetail> {
    if (!payload.name?.trim()) throw new DomainError("bad_request", "نام پروموشن الزامی است.");
    if (!payload.benefitType) throw new DomainError("bad_request", "نوع تخفیف الزامی است.");
    if (payload.benefitValue === undefined || payload.benefitValue <= 0)
      throw new DomainError("bad_request", "مقدار تخفیف باید بیشتر از صفر باشد.");
    if (
      (payload.benefitType === "percentage_discount" || payload.benefitType === "percentage_cashback") &&
      payload.benefitValue > 100
    ) {
      throw new DomainError("bad_request", "درصد تخفیف یا کش‌بک نمی‌تواند بیشتر از 100 باشد.");
    }
    return this.store.createCommercePromotion(adminId, payload);
  }

  async updateCommercePromotion(
    adminId: string,
    id: string,
    payload: UpdateAdminPromotionInput,
  ): Promise<AdminPromotionDetail> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    if (payload.name !== undefined && !payload.name.trim())
      throw new DomainError("bad_request", "نام پروموشن نمی‌تواند خالی باشد.");
    if (payload.benefitValue !== undefined && payload.benefitValue <= 0)
      throw new DomainError("bad_request", "مقدار تخفیف باید بیشتر از صفر باشد.");
    return this.store.updateCommercePromotion(adminId, id, payload);
  }

  async toggleCommercePromotionActive(
    adminId: string,
    id: string,
    active: boolean,
  ): Promise<AdminPromotionDetail> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    return this.store.toggleCommercePromotionActive(adminId, id, active);
  }

  async deleteCommercePromotion(adminId: string, id: string): Promise<{ success: boolean }> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    const success = await this.store.deleteCommercePromotion(adminId, id);
    return { success };
  }

  async bulkGenerateCommercePromotionCodes(
    adminId: string,
    id: string,
    params: { count: number; prefix?: string; length?: number; maxUses?: number },
  ): Promise<{ codes: string[]; count: number }> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    if (params.count < 1 || params.count > 1000)
      throw new DomainError("bad_request", "تعداد کدهای درخواستی باید بین 1 تا 1000 باشد.");
    const result = await this.store.bulkGenerateCommercePromotionCodes(adminId, id, params);
    return { codes: result.sampleCodes, count: result.generatedCount };
  }

  async listCommercePromotionRedemptions(
    id: string,
    params: { page: number; pageSize: number },
  ): Promise<{ items: AdminPromotionRedemptionListItem[]; totalCount: number }> {
    if (!id) throw new DomainError("bad_request", "Promotion ID is required");
    if (params.page < 1) throw new DomainError("bad_request", "Page must be >= 1");
    if (params.pageSize < 1 || params.pageSize > 100)
      throw new DomainError("bad_request", "Page size must be between 1 and 100");
    return this.store.listCommercePromotionRedemptions(id, params);
  }
}
