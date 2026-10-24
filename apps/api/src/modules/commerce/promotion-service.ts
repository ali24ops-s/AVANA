/**
 * PromotionService — Promotion, Coupon, and Redemption Lifecycle Management.
 *
 * Implements:
 * 1. Server-authoritative coupon validation and price derivation.
 * 2. Race-safe atomic redemption reservations with 30-minute lazy expiration.
 * 3. Centralized promotion finalization (`finalizePromotionForPaidOrder`) for Online & Card-to-Card payments.
 * 4. Idempotent wallet cashback issuance.
 * 5. Admin CRUD, bulk code generation, statistics, and audit logging.
 */

import { randomUUID } from "node:crypto";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  promotions,
  promotionCodes,
  promotionProducts,
  promotionUsers,
  promotionRedemptions,
  users,
  orders,
} from "@avana/database/schema";
import {
  type OrderId,
  type PaymentId,
  type ProductId,
  type PromotionBenefitType,
  type PromotionId,
  type PromotionRecord,
  type PromotionRedemptionId,
  type PromotionRedemptionRecord,
  type PromotionValidationResult,
  type UserId,
  DomainError,
  asPromotionId,
  asPromotionCodeId,
  asPromotionRedemptionId,
  asUserId,
  asOrderId,
  calculatePromotionBenefit,
  validatePromotionEligibility,
  normalizePromotionCode,
  generateBulkPromotionCodes,
  REDEMPTION_RESERVATION_TTL_MINUTES,
} from "@avana/domain";
import type { WalletService } from "../wallet/wallet-service.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CreatePromotionInput {
  name: string;
  description?: string | null;
  benefitType: PromotionBenefitType;
  benefitValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number | null;
  totalUsageLimit?: number | null;
  perUserUsageLimit?: number | null;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  code?: string; // Optional initial single code
  productRestrictions?: { productId?: string; productType?: string }[];
  userRestrictions?: string[]; // Array of User UUIDs
  metadata?: Record<string, unknown>;
}

export interface UpdatePromotionInput {
  name?: string;
  description?: string | null;
  benefitType?: PromotionBenefitType;
  benefitValue?: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number | null;
  totalUsageLimit?: number | null;
  perUserUsageLimit?: number | null;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  productRestrictions?: { productId?: string; productType?: string }[];
  userRestrictions?: string[];
  metadata?: Record<string, unknown>;
}

export interface PromotionListItem {
  id: string;
  name: string;
  description: string | null;
  benefitType: PromotionBenefitType;
  benefitValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  totalUsageLimit: number | null;
  perUserUsageLimit: number | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  codesCount: number;
  primaryCode: string | null;
  totalRedemptions: number;
  totalDiscountGranted: number;
  totalCashbackGranted: number;
  createdAt: string;
}

export interface PromotionDetailResponse {
  promotion: PromotionRecord;
  codes: {
    id: string;
    code: string;
    maxUses: number | null;
    active: boolean;
    createdAt: string;
  }[];
  productRestrictions: {
    id: string;
    productId: string | null;
    productType: string | null;
  }[];
  userRestrictions: {
    id: string;
    userId: string;
    userName?: string;
    userEmail?: string;
  }[];
  stats: {
    totalRedemptions: number;
    completedRedemptions: number;
    pendingRedemptions: number;
    totalDiscountGranted: number;
    totalCashbackGranted: number;
    remainingUsage: number | null;
  };
}

export class PromotionService {
  constructor(
    private readonly db: DbClient,
    private readonly walletService?: WalletService,
  ) {}

  // -------------------------------------------------------------------------
  // 1. Lazy Cleanup Helper
  // -------------------------------------------------------------------------

  /**
   * Performs atomic lazy expiration of pending reservations whose TTL has expired.
   */
  async lazyExpirePendingRedemptions(txOrDb: DbClient = this.db): Promise<number> {
    const result = await txOrDb
      .update(promotionRedemptions)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(promotionRedemptions.status, "pending"),
          sql`${promotionRedemptions.reservationExpiresAt} <= NOW()`,
        ),
      )
      .returning({ id: promotionRedemptions.id });

    return result.length;
  }

  // -------------------------------------------------------------------------
  // 2. Validate Coupon for Checkout Preview (Server-Authoritative)
  // -------------------------------------------------------------------------

  async validateCoupon(
    rawCode: string,
    userId: UserId,
    items: { productId: ProductId | string; productType?: string | null; price: number }[],
    txOrDb: DbClient = this.db,
  ): Promise<PromotionValidationResult> {
    const code = normalizePromotionCode(rawCode);
    if (!code) {
      return {
        valid: false,
        reason: "کد تخفیف وارد نشده است.",
        eligibleSubtotal: 0,
        orderTotal: items.reduce((sum, it) => sum + Math.max(0, it.price), 0),
      };
    }

    // Lazy cleanup of expired reservations first
    await this.lazyExpirePendingRedemptions(txOrDb);

    // 1. Find Code
    const [codeRecord] = await txOrDb
      .select()
      .from(promotionCodes)
      .where(
        and(
          sql`UPPER(${promotionCodes.code}) = ${code}`,
          isNull(promotionCodes.deletedAt),
        ),
      )
      .limit(1);

    if (!codeRecord || !codeRecord.active) {
      return {
        valid: false,
        reason: "کد تخفیف نامعتبر است یا وجود ندارد.",
        eligibleSubtotal: 0,
        orderTotal: items.reduce((sum, it) => sum + Math.max(0, it.price), 0),
      };
    }

    // 2. Find Promotion
    const [promoRow] = await txOrDb
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.id, codeRecord.promotionId),
          isNull(promotions.deletedAt),
        ),
      )
      .limit(1);

    if (!promoRow || !promoRow.active) {
      return {
        valid: false,
        reason: "این پروموشن غیرفعال یا منقضی شده است.",
        eligibleSubtotal: 0,
        orderTotal: items.reduce((sum, it) => sum + Math.max(0, it.price), 0),
      };
    }

    // 3. Load Restrictions
    const productRestRows = await txOrDb
      .select()
      .from(promotionProducts)
      .where(eq(promotionProducts.promotionId, promoRow.id));

    const userRestRows = await txOrDb
      .select()
      .from(promotionUsers)
      .where(eq(promotionUsers.promotionId, promoRow.id));

    // 4. Count Active Redemptions (Completed + Non-Expired Pending)
    const [totalCountRow] = await txOrDb
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoRow.id),
          sql`(${promotionRedemptions.status} = 'completed' OR (${promotionRedemptions.status} = 'pending' AND ${promotionRedemptions.reservationExpiresAt} > NOW()))`,
        ),
      );

    const [userCountRow] = await txOrDb
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoRow.id),
          eq(promotionRedemptions.userId, userId),
          sql`(${promotionRedemptions.status} = 'completed' OR (${promotionRedemptions.status} = 'pending' AND ${promotionRedemptions.reservationExpiresAt} > NOW()))`,
        ),
      );

    // Check specific Code maxUses limit if configured
    if (codeRecord.maxUses !== null && codeRecord.maxUses !== undefined && codeRecord.maxUses > 0) {
      const [codeCountRow] = await txOrDb
        .select({ count: sql<number>`count(*)::int` })
        .from(promotionRedemptions)
        .where(
          and(
            eq(promotionRedemptions.codeId, codeRecord.id),
            sql`(${promotionRedemptions.status} = 'completed' OR (${promotionRedemptions.status} = 'pending' AND ${promotionRedemptions.reservationExpiresAt} > NOW()))`,
          ),
        );

      if ((codeCountRow?.count ?? 0) >= codeRecord.maxUses) {
        return {
          valid: false,
          reason: "سقف استفاده از این کد تخفیف تکمیل شده است.",
          eligibleSubtotal: 0,
          orderTotal: items.reduce((sum, it) => sum + Math.max(0, it.price), 0),
        };
      }
    }

    const promoDomain: PromotionRecord = {
      id: asPromotionId(promoRow.id),
      name: promoRow.name,
      description: promoRow.description,
      benefitType: promoRow.benefitType as PromotionBenefitType,
      benefitValue: promoRow.benefitValue,
      maxDiscountAmount: promoRow.maxDiscountAmount,
      minOrderAmount: promoRow.minOrderAmount,
      totalUsageLimit: promoRow.totalUsageLimit,
      perUserUsageLimit: promoRow.perUserUsageLimit,
      active: promoRow.active,
      startsAt: promoRow.startsAt ? promoRow.startsAt.toISOString() : null,
      endsAt: promoRow.endsAt ? promoRow.endsAt.toISOString() : null,
      metadata: (promoRow.metadata as Record<string, unknown>) ?? {},
      createdAt: promoRow.createdAt.toISOString(),
      updatedAt: promoRow.updatedAt.toISOString(),
      deletedAt: promoRow.deletedAt ? promoRow.deletedAt.toISOString() : null,
    };

    const codeDomain: import("@avana/domain").PromotionCodeRecord = {
      id: asPromotionCodeId(codeRecord.id),
      promotionId: asPromotionId(codeRecord.promotionId),
      code: codeRecord.code,
      maxUses: codeRecord.maxUses,
      active: codeRecord.active,
      createdAt: codeRecord.createdAt.toISOString(),
      deletedAt: codeRecord.deletedAt ? codeRecord.deletedAt.toISOString() : null,
    };

    const validation = validatePromotionEligibility(
      promoDomain,
      codeDomain,
      {
        userId,
        items,
        productRestrictions: productRestRows.map((pr) => ({
          id: pr.id,
          promotionId: asPromotionId(pr.promotionId),
          productId: pr.productId as ProductId | null,
          productType: pr.productType,
          createdAt: pr.createdAt.toISOString(),
        })),
        userRestrictions: userRestRows.map((ur) => ({
          id: ur.id,
          promotionId: asPromotionId(ur.promotionId),
          userId: asUserId(ur.userId),
          createdAt: ur.createdAt.toISOString(),
        })),
        totalActiveRedemptionsCount: totalCountRow?.count ?? 0,
        userActiveRedemptionsCount: userCountRow?.count ?? 0,
        now: new Date(),
      },
    );

    return {
      ...validation,
      promotion: promoDomain,
      code: codeDomain,
    } as PromotionValidationResult & {
      promotion?: PromotionRecord;
      code?: import("@avana/domain").PromotionCodeRecord;
    };
  }

  // -------------------------------------------------------------------------
  // 3. Evaluate and Reserve Promotion
  // -------------------------------------------------------------------------

  async evaluateAndReservePromotion(params: {
    userId: UserId;
    code: string;
    orderAmount: number;
    productId: string;
    productType?: string;
  }): Promise<{
    promotionId: PromotionId;
    redemptionId: PromotionRedemptionId;
    discountAmount: number;
    cashbackAmount: number;
    payableAmount: number;
    benefitType: PromotionBenefitType;
    benefitValue: number;
  }> {
    return this.db.transaction(async (tx) => {
      const normalizedCode = normalizePromotionCode(params.code);
      if (!normalizedCode) {
        throw new DomainError("bad_request", "کد تخفیف معتبر نیست.");
      }

      // 1. Identify code and acquire strict row-level lock on the promotion FIRST
      const [codeRow] = await tx
        .select({ promotionId: promotionCodes.promotionId, id: promotionCodes.id })
        .from(promotionCodes)
        .where(and(sql`UPPER(${promotionCodes.code}) = ${normalizedCode}`, isNull(promotionCodes.deletedAt)))
        .limit(1);

      if (codeRow) {
        // Concurrency lock on promotion row serialized under the transaction
        await tx
          .select({ id: promotions.id })
          .from(promotions)
          .where(eq(promotions.id, codeRow.promotionId))
          .for("update")
          .limit(1);

        // Concurrency lock on specific code row serialized under the transaction
        await tx
          .select({ id: promotionCodes.id })
          .from(promotionCodes)
          .where(eq(promotionCodes.id, codeRow.id))
          .for("update")
          .limit(1);

        // Pre-cleanup: Cancel any unlinked stale pending reservation for THIS user and code
        // under the lock, BEFORE validateCoupon to prevent retry lockout when perUserUsageLimit is enforced.
        await tx
          .update(promotionRedemptions)
          .set({
            status: "cancelled",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(promotionRedemptions.userId, params.userId),
              eq(promotionRedemptions.promotionId, codeRow.promotionId),
              eq(promotionRedemptions.status, "pending"),
              isNull(promotionRedemptions.orderId),
            ),
          );
      }

      // 2. Lazy cleanup of expired reservations inside transaction under lock
      await this.lazyExpirePendingRedemptions(tx);

      // 3. Validate coupon and calculate benefit under strict lock
      const validation = (await this.validateCoupon(
        params.code,
        params.userId,
        [
          {
            productId: params.productId,
            productType: params.productType,
            price: params.orderAmount,
          },
        ],
        tx,
      )) as PromotionValidationResult & {
        promotion?: PromotionRecord;
        code?: import("@avana/domain").PromotionCodeRecord;
      };

      if (!validation.valid || !validation.benefit || !validation.promotion || !validation.code) {
        throw new DomainError("bad_request", validation.reason || "کد تخفیف معتبر نیست.");
      }

      const now = new Date();
      const reservationExpiresAt = new Date(
        now.getTime() + REDEMPTION_RESERVATION_TTL_MINUTES * 60 * 1000,
      );

      const snapshot = {
        promotionId: validation.promotion.id,
        promotionName: validation.promotion.name,
        code: validation.code.code,
        benefitType: validation.promotion.benefitType,
        benefitValue: validation.promotion.benefitValue,
        maxDiscountAmount: validation.promotion.maxDiscountAmount,
        minOrderAmount: validation.promotion.minOrderAmount,
        appliedAt: now.toISOString(),
      };

      const redemptionId = randomUUID();

      const [insertedRedemption] = await tx
        .insert(promotionRedemptions)
        .values({
          id: redemptionId,
          promotionId: validation.promotion.id,
          codeId: validation.code.id,
          userId: params.userId,
          orderId: null,
          paymentId: null,
          benefitType: validation.promotion.benefitType,
          benefitValue: validation.promotion.benefitValue,
          discountAmount: validation.benefit.discountAmount,
          cashbackAmount: validation.benefit.cashbackAmount,
          orderOriginalAmount: params.orderAmount,
          orderFinalAmount: validation.benefit.payableAmount,
          status: "pending",
          reservationExpiresAt,
          promotionSnapshot: snapshot,
          redeemedAt: now,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        promotionId: asPromotionId(validation.promotion.id),
        redemptionId: asPromotionRedemptionId(insertedRedemption.id),
        discountAmount: validation.benefit.discountAmount,
        cashbackAmount: validation.benefit.cashbackAmount,
        payableAmount: validation.benefit.payableAmount,
        benefitType: validation.promotion.benefitType,
        benefitValue: validation.promotion.benefitValue,
      };
    });
  }

  async linkRedemptionToOrder(
    redemptionId: string,
    orderId: OrderId,
    txOrDb: DbClient = this.db,
  ): Promise<void> {
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "" || orderId === "00000000-0000-0000-0000-000000000000") {
      throw new DomainError("bad_request", "شناسه سفارش برای انتساب به تخفیف نامعتبر است.");
    }

    const [existing] = await txOrDb
      .select({
        id: promotionRedemptions.id,
        orderId: promotionRedemptions.orderId,
        status: promotionRedemptions.status,
      })
      .from(promotionRedemptions)
      .where(eq(promotionRedemptions.id, redemptionId))
      .limit(1);

    if (!existing) {
      throw new DomainError("not_found", "رکورد رزرو تخفیف یافت نشد.");
    }

    if (existing.status !== "pending") {
      throw new DomainError("bad_request", "تنها رزروهای معلق قابل اتصال به سفارش هستند.");
    }

    if (existing.orderId !== null && existing.orderId !== orderId) {
      throw new DomainError("bad_request", "این رزرو قبلاً به سفارش دیگری متصل شده است.");
    }

    await txOrDb
      .update(promotionRedemptions)
      .set({
        orderId,
        updatedAt: new Date(),
      })
      .where(eq(promotionRedemptions.id, redemptionId));
  }

  async cancelPromotionRedemptionById(
    redemptionId: string,
    _reason?: string,
    txOrDb: DbClient = this.db,
  ): Promise<boolean> {
    const result = await txOrDb
      .update(promotionRedemptions)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(promotionRedemptions.id, redemptionId),
          eq(promotionRedemptions.status, "pending"),
        ),
      )
      .returning({ id: promotionRedemptions.id });

    return result.length > 0;
  }

  // -------------------------------------------------------------------------
  // 4. Reserve Promotion Redemption (Checkout Transaction)
  // -------------------------------------------------------------------------

  async reservePromotionRedemption(
    tx: DbClient,
    params: {
      rawCode: string;
      userId: UserId;
      orderId: OrderId;
      items: { productId: ProductId | string; productType?: string | null; price: number }[];
      orderOriginalAmount: number;
    },
  ): Promise<{
    redemption: PromotionRedemptionRecord;
    benefit: ReturnType<typeof calculatePromotionBenefit>;
  }> {
    const code = normalizePromotionCode(params.rawCode);
    if (!code) {
      throw new DomainError("bad_request", "کد تخفیف نامعتبر است.");
    }

    // 1. Lazy cleanup inside the transaction
    await this.lazyExpirePendingRedemptions(tx);

    // 2. Find Code
    const [codeRecord] = await tx
      .select()
      .from(promotionCodes)
      .where(
        and(
          sql`UPPER(${promotionCodes.code}) = ${code}`,
          isNull(promotionCodes.deletedAt),
        ),
      )
      .limit(1);

    if (!codeRecord || !codeRecord.active) {
      throw new DomainError("bad_request", "کد تخفیف نامعتبر است یا وجود ندارد.");
    }

    // 3. Lock Promotion row (FOR UPDATE)
    const [promoRow] = await tx
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.id, codeRecord.promotionId),
          isNull(promotions.deletedAt),
        ),
      )
      .for("update")
      .limit(1);

    if (!promoRow || !promoRow.active) {
      throw new DomainError("bad_request", "این پروموشن غیرفعال یا منقضی شده است.");
    }

    // 4. Load Restrictions
    const productRestRows = await tx
      .select()
      .from(promotionProducts)
      .where(eq(promotionProducts.promotionId, promoRow.id));

    const userRestRows = await tx
      .select()
      .from(promotionUsers)
      .where(eq(promotionUsers.promotionId, promoRow.id));

    // 5. Count Active Redemptions
    const [totalCountRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoRow.id),
          sql`(${promotionRedemptions.status} = 'completed' OR (${promotionRedemptions.status} = 'pending' AND ${promotionRedemptions.reservationExpiresAt} > NOW()))`,
        ),
      );

    const [userCountRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoRow.id),
          eq(promotionRedemptions.userId, params.userId),
          sql`(${promotionRedemptions.status} = 'completed' OR (${promotionRedemptions.status} = 'pending' AND ${promotionRedemptions.reservationExpiresAt} > NOW()))`,
        ),
      );

    const promoDomain: PromotionRecord = {
      id: asPromotionId(promoRow.id),
      name: promoRow.name,
      description: promoRow.description,
      benefitType: promoRow.benefitType as PromotionBenefitType,
      benefitValue: promoRow.benefitValue,
      maxDiscountAmount: promoRow.maxDiscountAmount,
      minOrderAmount: promoRow.minOrderAmount,
      totalUsageLimit: promoRow.totalUsageLimit,
      perUserUsageLimit: promoRow.perUserUsageLimit,
      active: promoRow.active,
      startsAt: promoRow.startsAt ? promoRow.startsAt.toISOString() : null,
      endsAt: promoRow.endsAt ? promoRow.endsAt.toISOString() : null,
      metadata: (promoRow.metadata as Record<string, unknown>) ?? {},
      createdAt: promoRow.createdAt.toISOString(),
      updatedAt: promoRow.updatedAt.toISOString(),
      deletedAt: promoRow.deletedAt ? promoRow.deletedAt.toISOString() : null,
    };

    const validation = validatePromotionEligibility(
      promoDomain,
      {
        id: asPromotionCodeId(codeRecord.id),
        promotionId: asPromotionId(codeRecord.promotionId),
        code: codeRecord.code,
        maxUses: codeRecord.maxUses,
        active: codeRecord.active,
        createdAt: codeRecord.createdAt.toISOString(),
        deletedAt: codeRecord.deletedAt ? codeRecord.deletedAt.toISOString() : null,
      },
      {
        userId: params.userId,
        items: params.items,
        productRestrictions: productRestRows.map((pr) => ({
          id: pr.id,
          promotionId: asPromotionId(pr.promotionId),
          productId: pr.productId as ProductId | null,
          productType: pr.productType,
          createdAt: pr.createdAt.toISOString(),
        })),
        userRestrictions: userRestRows.map((ur) => ({
          id: ur.id,
          promotionId: asPromotionId(ur.promotionId),
          userId: asUserId(ur.userId),
          createdAt: ur.createdAt.toISOString(),
        })),
        totalActiveRedemptionsCount: totalCountRow?.count ?? 0,
        userActiveRedemptionsCount: userCountRow?.count ?? 0,
        now: new Date(),
      },
    );

    if (!validation.valid || !validation.benefit) {
      throw new DomainError("bad_request", validation.reason || "کد تخفیف معتبر نیست.");
    }

    const now = new Date();
    const reservationExpiresAt = new Date(
      now.getTime() + REDEMPTION_RESERVATION_TTL_MINUTES * 60 * 1000,
    );

    const snapshot = {
      promotionId: promoRow.id,
      promotionName: promoRow.name,
      code: codeRecord.code,
      benefitType: promoRow.benefitType as PromotionBenefitType,
      benefitValue: promoRow.benefitValue,
      maxDiscountAmount: promoRow.maxDiscountAmount,
      minOrderAmount: promoRow.minOrderAmount,
      appliedAt: now.toISOString(),
    };

    const redemptionId = randomUUID();

    const [insertedRedemption] = await tx
      .insert(promotionRedemptions)
      .values({
        id: redemptionId,
        promotionId: promoRow.id,
        codeId: codeRecord.id,
        userId: params.userId,
        orderId: params.orderId,
        paymentId: null,
        benefitType: promoRow.benefitType,
        benefitValue: promoRow.benefitValue,
        discountAmount: validation.benefit.discountAmount,
        cashbackAmount: validation.benefit.cashbackAmount,
        orderOriginalAmount: params.orderOriginalAmount,
        orderFinalAmount: validation.benefit.payableAmount,
        status: "pending",
        reservationExpiresAt,
        promotionSnapshot: snapshot,
        redeemedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return {
      redemption: {
        id: asPromotionRedemptionId(insertedRedemption.id),
        promotionId: asPromotionId(insertedRedemption.promotionId),
        codeId: asPromotionCodeId(insertedRedemption.codeId),
        userId: asUserId(insertedRedemption.userId),
        orderId: insertedRedemption.orderId ? asOrderId(insertedRedemption.orderId) : null,
        paymentId: insertedRedemption.paymentId as PaymentId | null,
        benefitType: insertedRedemption.benefitType as PromotionBenefitType,
        benefitValue: insertedRedemption.benefitValue,
        discountAmount: insertedRedemption.discountAmount,
        cashbackAmount: insertedRedemption.cashbackAmount,
        orderOriginalAmount: insertedRedemption.orderOriginalAmount,
        orderFinalAmount: insertedRedemption.orderFinalAmount,
        status: insertedRedemption.status as "pending",
        reservationExpiresAt: insertedRedemption.reservationExpiresAt.toISOString(),
        promotionSnapshot: insertedRedemption.promotionSnapshot as any,
        redeemedAt: insertedRedemption.redeemedAt.toISOString(),
        completedAt: null,
        createdAt: insertedRedemption.createdAt.toISOString(),
        updatedAt: insertedRedemption.updatedAt.toISOString(),
      },
      benefit: validation.benefit,
    };
  }

  // -------------------------------------------------------------------------
  // 5. Cancel Promotion Redemption (Order Failure / Rejection)
  // -------------------------------------------------------------------------

  async cancelPromotionRedemption(
    orderIdOrTx: OrderId | DbClient,
    reasonOrOrderId?: string | OrderId,
  ): Promise<boolean> {
    let txOrDb: DbClient = this.db;
    let orderId: OrderId;

    if (typeof orderIdOrTx === "object" && orderIdOrTx !== null && "update" in orderIdOrTx) {
      txOrDb = orderIdOrTx as DbClient;
      orderId = reasonOrOrderId as OrderId;
    } else {
      orderId = orderIdOrTx as OrderId;
    }

    const result = await txOrDb
      .update(promotionRedemptions)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(promotionRedemptions.orderId, orderId),
          eq(promotionRedemptions.status, "pending"),
        ),
      )
      .returning({ id: promotionRedemptions.id });

    return result.length > 0;
  }

  // -------------------------------------------------------------------------
  // 6. Centralized Finalize Promotion Operation
  // -------------------------------------------------------------------------

  /**
   * Authoritative, centralized operation to finalize a promotion redemption upon payment success.
   * Invoked by both Online Payment Verification and Card-to-Card Admin Approval.
   *
   * Guarantees:
   * - Strict Idempotency: Duplicate calls never credit cashback twice or error.
   * - Atomic Wallet Credit with Idempotency Key `cashback:redemption:${redemption.id}`.
   * - Status transition: pending -> completed.
   */
  async finalizePromotionForPaidOrder(
    orderIdOrTx: OrderId | DbClient,
    paymentIdOrOrderId: PaymentId | OrderId,
    paidAtOrPaymentId?: string | PaymentId,
    optionalPaidAt?: string,
  ): Promise<{ finalized: boolean; cashbackGranted: number }> {
    let txOrDb: DbClient = this.db;
    let orderId: OrderId;
    let paymentId: PaymentId;
    let paidAt: string = new Date().toISOString();

    if (typeof orderIdOrTx === "object" && orderIdOrTx !== null && "select" in orderIdOrTx) {
      txOrDb = orderIdOrTx as DbClient;
      orderId = paymentIdOrOrderId as OrderId;
      paymentId = paidAtOrPaymentId as PaymentId;
      if (optionalPaidAt) paidAt = optionalPaidAt;
    } else {
      orderId = orderIdOrTx as OrderId;
      paymentId = paymentIdOrOrderId as PaymentId;
      if (typeof paidAtOrPaymentId === "string") paidAt = paidAtOrPaymentId;
    }

    const runInTx = async (
      fn: (client: DbClient) => Promise<{ finalized: boolean; cashbackGranted: number }>,
    ): Promise<{ finalized: boolean; cashbackGranted: number }> => {
      if (typeof (txOrDb as unknown as { transaction: unknown }).transaction === "function") {
        return (txOrDb as unknown as { transaction: (cb: (tx: DbClient) => Promise<{ finalized: boolean; cashbackGranted: number }>) => Promise<{ finalized: boolean; cashbackGranted: number }> }).transaction(fn);
      }
      return fn(txOrDb);
    };

    return runInTx(async (client) => {
      let query = client
        .select()
        .from(promotionRedemptions)
        .where(eq(promotionRedemptions.orderId, orderId));

      if (typeof (query as unknown as { for: unknown }).for === "function") {
        query = (query as unknown as { for: (mode: string) => typeof query }).for("update");
      }

      const [redemption] = await query.limit(1);

      if (!redemption) {
        return { finalized: false, cashbackGranted: 0 };
      }

      // Idempotency check: if already completed, return immediately
      if (redemption.status === "completed") {
        return { finalized: true, cashbackGranted: redemption.cashbackAmount };
      }

      // If previously cancelled, do not finalize
      if (redemption.status === "cancelled") {
        return { finalized: false, cashbackGranted: 0 };
      }

      const now = new Date(paidAt);

      // 1. Credit Cashback if applicable (WalletService uses its own atomic mutation & idempotency lock)
      if (redemption.cashbackAmount > 0) {
        if (!this.walletService) {
          throw new DomainError(
            "internal_error",
            "سرویس کیف پول برای تسویه کش‌بک در دسترس نیست.",
          );
        }

        const creditResult = await this.walletService.credit({
          userId: asUserId(redemption.userId),
          amount: redemption.cashbackAmount,
          source: "promotion_cashback",
          referenceType: "order",
          referenceId: orderId,
          idempotencyKey: `cashback:redemption:${redemption.id}`,
          metadata: {
            promotionId: redemption.promotionId,
            codeId: redemption.codeId,
            orderId,
            paymentId,
            redemptionId: redemption.id,
            benefitType: redemption.benefitType,
            benefitValue: redemption.benefitValue,
            cashbackAmount: redemption.cashbackAmount,
            grantedAt: paidAt,
          },
        });

        if (!creditResult || !creditResult.transaction) {
          throw new DomainError(
            "internal_error",
            "خطا در شارژ کش‌بک کیف پول؛ تراکنش ثبت نشد.",
          );
        }
      }

      // 2. Mark Redemption Completed (Only after wallet credit is verified)
      await client
        .update(promotionRedemptions)
        .set({
          status: "completed",
          paymentId,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(promotionRedemptions.id, redemption.id));

      return { finalized: true, cashbackGranted: redemption.cashbackAmount };
    });
  }

  // -------------------------------------------------------------------------
  // 6. Admin CRUD & Bulk Generation
  // -------------------------------------------------------------------------

  async createPromotion(
    _adminId: string,
    input: CreatePromotionInput,
  ): Promise<PromotionDetailResponse> {
    if (!input.name?.trim()) {
      throw new DomainError("bad_request", "نام پروموشن الزامی است.");
    }
    if (!input.benefitValue || input.benefitValue <= 0) {
      throw new DomainError("bad_request", "مقدار تخفیف/کشبک باید بزرگتر از صفر باشد.");
    }
    if (
      input.benefitType === "percentage_discount" ||
      input.benefitType === "percentage_cashback"
    ) {
      if (input.benefitValue > 100) {
        throw new DomainError("bad_request", "درصد تخفیف/کشبک نمی‌تواند بیش از ۱۰۰ درصد باشد.");
      }
    }

    const promoId = randomUUID();
    const now = new Date();

    await this.db
      .insert(promotions)
      .values({
        id: promoId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        benefitType: input.benefitType,
        benefitValue: input.benefitValue,
        maxDiscountAmount: input.maxDiscountAmount ?? null,
        minOrderAmount: input.minOrderAmount ?? null,
        totalUsageLimit: input.totalUsageLimit ?? null,
        perUserUsageLimit: input.perUserUsageLimit ?? null,
        active: input.active ?? true,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      });

    // Insert initial single code if provided
    if (input.code) {
      const normCode = normalizePromotionCode(input.code);
      if (normCode) {
        // Check uniqueness for active code
        const [existing] = await this.db
          .select()
          .from(promotionCodes)
          .where(
            and(
              sql`UPPER(${promotionCodes.code}) = ${normCode}`,
              isNull(promotionCodes.deletedAt),
            ),
          )
          .limit(1);

        if (existing) {
          throw new DomainError("conflict", `کد تخفیف ${normCode} قبلاً در سیستم ثبت شده است.`);
        }

        await this.db.insert(promotionCodes).values({
          id: randomUUID(),
          promotionId: promoId,
          code: normCode,
          maxUses: null,
          active: true,
          createdAt: now,
        });
      }
    }

    // Insert Product Restrictions
    if (input.productRestrictions && input.productRestrictions.length > 0) {
      for (const pr of input.productRestrictions) {
        if (pr.productId || pr.productType) {
          await this.db.insert(promotionProducts).values({
            id: randomUUID(),
            promotionId: promoId,
            productId: pr.productId || null,
            productType: pr.productType || null,
            createdAt: now,
          });
        }
      }
    }

    // Insert User Restrictions
    if (input.userRestrictions && input.userRestrictions.length > 0) {
      for (const uid of input.userRestrictions) {
        await this.db.insert(promotionUsers).values({
          id: randomUUID(),
          promotionId: promoId,
          userId: uid,
          createdAt: now,
        });
      }
    }

    return this.getPromotionDetails(asPromotionId(promoId));
  }

  async updatePromotion(
    _adminId: string,
    promoId: PromotionId,
    patch: UpdatePromotionInput,
  ): Promise<PromotionDetailResponse> {
    const [existing] = await this.db
      .select()
      .from(promotions)
      .where(and(eq(promotions.id, promoId), isNull(promotions.deletedAt)))
      .limit(1);

    if (!existing) {
      throw new DomainError("not_found", "پروموشن مورد نظر یافت نشد.");
    }

    const now = new Date();

    await this.db
      .update(promotions)
      .set({
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        description: patch.description !== undefined ? patch.description : existing.description,
        benefitType: patch.benefitType ?? existing.benefitType,
        benefitValue: patch.benefitValue ?? existing.benefitValue,
        maxDiscountAmount: patch.maxDiscountAmount !== undefined ? patch.maxDiscountAmount : existing.maxDiscountAmount,
        minOrderAmount: patch.minOrderAmount !== undefined ? patch.minOrderAmount : existing.minOrderAmount,
        totalUsageLimit: patch.totalUsageLimit !== undefined ? patch.totalUsageLimit : existing.totalUsageLimit,
        perUserUsageLimit: patch.perUserUsageLimit !== undefined ? patch.perUserUsageLimit : existing.perUserUsageLimit,
        active: patch.active !== undefined ? patch.active : existing.active,
        startsAt: patch.startsAt !== undefined ? (patch.startsAt ? new Date(patch.startsAt) : null) : existing.startsAt,
        endsAt: patch.endsAt !== undefined ? (patch.endsAt ? new Date(patch.endsAt) : null) : existing.endsAt,
        metadata: patch.metadata !== undefined ? patch.metadata : existing.metadata,
        updatedAt: now,
      })
      .where(eq(promotions.id, promoId));

    // Update Product Restrictions if explicitly provided
    if (patch.productRestrictions !== undefined) {
      await this.db
        .delete(promotionProducts)
        .where(eq(promotionProducts.promotionId, promoId));

      for (const pr of patch.productRestrictions) {
        if (pr.productId || pr.productType) {
          await this.db.insert(promotionProducts).values({
            id: randomUUID(),
            promotionId: promoId,
            productId: pr.productId || null,
            productType: pr.productType || null,
            createdAt: now,
          });
        }
      }
    }

    // Update User Restrictions if explicitly provided
    if (patch.userRestrictions !== undefined) {
      await this.db
        .delete(promotionUsers)
        .where(eq(promotionUsers.promotionId, promoId));

      for (const uid of patch.userRestrictions) {
        await this.db.insert(promotionUsers).values({
          id: randomUUID(),
          promotionId: promoId,
          userId: uid,
          createdAt: now,
        });
      }
    }

    return this.getPromotionDetails(promoId);
  }

  async togglePromotionActive(
    _adminId: string,
    promoId: PromotionId,
    active: boolean,
  ): Promise<PromotionRecord> {
    const [updated] = await this.db
      .update(promotions)
      .set({
        active,
        updatedAt: new Date(),
      })
      .where(and(eq(promotions.id, promoId), isNull(promotions.deletedAt)))
      .returning();

    if (!updated) {
      throw new DomainError("not_found", "پروموشن یافت نشد.");
    }

    return {
      id: asPromotionId(updated.id),
      name: updated.name,
      description: updated.description,
      benefitType: updated.benefitType as PromotionBenefitType,
      benefitValue: updated.benefitValue,
      maxDiscountAmount: updated.maxDiscountAmount,
      minOrderAmount: updated.minOrderAmount,
      totalUsageLimit: updated.totalUsageLimit,
      perUserUsageLimit: updated.perUserUsageLimit,
      active: updated.active,
      startsAt: updated.startsAt ? updated.startsAt.toISOString() : null,
      endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
      metadata: (updated.metadata as Record<string, unknown>) ?? {},
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
    };
  }

  async deletePromotion(_adminId: string, promoId: PromotionId): Promise<boolean> {
    const now = new Date();
    const result = await this.db
      .update(promotions)
      .set({
        active: false,
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(promotions.id, promoId), isNull(promotions.deletedAt)))
      .returning({ id: promotions.id });

    if (result.length === 0) {
      throw new DomainError("not_found", "پروموشن یافت نشد.");
    }

    // Soft-delete linked codes as well
    await this.db
      .update(promotionCodes)
      .set({
        active: false,
        deletedAt: now,
      })
      .where(eq(promotionCodes.promotionId, promoId));

    return true;
  }

  async bulkGenerateCodes(
    _adminId: string,
    promoId: PromotionId,
    input: { count: number; prefix?: string; length?: number; maxUses?: number | null },
  ): Promise<{ generatedCount: number; sampleCodes: string[] }> {
    const [promo] = await this.db
      .select()
      .from(promotions)
      .where(and(eq(promotions.id, promoId), isNull(promotions.deletedAt)))
      .limit(1);

    if (!promo) {
      throw new DomainError("not_found", "پروموشن یافت نشد.");
    }

    // Load existing active codes to avoid in-batch or DB collisions
    const existingCodeRows = await this.db
      .select({ code: promotionCodes.code })
      .from(promotionCodes)
      .where(isNull(promotionCodes.deletedAt));

    const existingSet = new Set(
      existingCodeRows.map((r) => r.code.toUpperCase()),
    );

    const generatedCodes = generateBulkPromotionCodes({
      count: input.count,
      prefix: input.prefix,
      length: input.length,
      existingCodes: existingSet,
    });

    const now = new Date();
    const maxUses = input.maxUses !== undefined && input.maxUses !== null && input.maxUses > 0 ? input.maxUses : 1;
    for (const c of generatedCodes) {
      await this.db.insert(promotionCodes).values({
        id: randomUUID(),
        promotionId: promoId,
        code: c,
        maxUses,
        active: true,
        createdAt: now,
      });
    }

    return {
      generatedCount: generatedCodes.length,
      sampleCodes: generatedCodes,
    };
  }

  async listPromotions(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    benefitType?: string;
  }): Promise<{ items: PromotionListItem[]; totalCount: number }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    // Build filter conditions
    const conditions = [isNull(promotions.deletedAt)];

    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        sql`(${promotions.name} ILIKE ${q} OR EXISTS (
          SELECT 1 FROM promotion_codes 
          WHERE promotion_codes.promotion_id = ${promotions.id} 
          AND promotion_codes.code ILIKE ${q}
        ))`,
      );
    }

    const now = new Date();
    if (params.status === "active") {
      conditions.push(
        and(
          eq(promotions.active, true),
          sql`(${promotions.startsAt} IS NULL OR ${promotions.startsAt} <= ${now})`,
          sql`(${promotions.endsAt} IS NULL OR ${promotions.endsAt} >= ${now})`,
        )!,
      );
    } else if (params.status === "inactive") {
      conditions.push(eq(promotions.active, false));
    } else if (params.status === "expired") {
      conditions.push(sql`${promotions.endsAt} < ${now}`);
    }

    if (params.benefitType) {
      conditions.push(eq(promotions.benefitType, params.benefitType));
    }

    const whereClause = and(...conditions);

    // Total Count
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(promotions)
      .where(whereClause);

    const totalCount = countRow?.count ?? 0;

    // Fetch Rows
    const rows = await this.db
      .select()
      .from(promotions)
      .where(whereClause)
      .orderBy(desc(promotions.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items: PromotionListItem[] = [];

    for (const r of rows) {
      // Fetch codes count & primary code
      const codes = await this.db
        .select()
        .from(promotionCodes)
        .where(
          and(
            eq(promotionCodes.promotionId, r.id),
            isNull(promotionCodes.deletedAt),
          ),
        );

      // Aggregate redemptions
      const [statsRow] = await this.db
        .select({
          totalCount: sql<number>`count(*)::int`,
          totalDiscount: sql<number>`COALESCE(sum(${promotionRedemptions.discountAmount}), 0)::int`,
          totalCashback: sql<number>`COALESCE(sum(${promotionRedemptions.cashbackAmount}), 0)::int`,
        })
        .from(promotionRedemptions)
        .where(
          and(
            eq(promotionRedemptions.promotionId, r.id),
            eq(promotionRedemptions.status, "completed"),
          ),
        );

      items.push({
        id: r.id,
        name: r.name,
        description: r.description,
        benefitType: r.benefitType as PromotionBenefitType,
        benefitValue: r.benefitValue,
        maxDiscountAmount: r.maxDiscountAmount,
        minOrderAmount: r.minOrderAmount,
        totalUsageLimit: r.totalUsageLimit,
        perUserUsageLimit: r.perUserUsageLimit,
        active: r.active,
        startsAt: r.startsAt ? r.startsAt.toISOString() : null,
        endsAt: r.endsAt ? r.endsAt.toISOString() : null,
        codesCount: codes.length,
        primaryCode: codes.length > 0 ? codes[0].code : null,
        totalRedemptions: statsRow?.totalCount ?? 0,
        totalDiscountGranted: statsRow?.totalDiscount ?? 0,
        totalCashbackGranted: statsRow?.totalCashback ?? 0,
        createdAt: r.createdAt.toISOString(),
      });
    }

    return { items, totalCount };
  }

  async getPromotionDetails(promoId: PromotionId): Promise<PromotionDetailResponse> {
    const [r] = await this.db
      .select()
      .from(promotions)
      .where(and(eq(promotions.id, promoId), isNull(promotions.deletedAt)))
      .limit(1);

    if (!r) {
      throw new DomainError("not_found", "پروموشن مورد نظر یافت نشد.");
    }

    const codes = await this.db
      .select()
      .from(promotionCodes)
      .where(
        and(
          eq(promotionCodes.promotionId, promoId),
          isNull(promotionCodes.deletedAt),
        ),
      );

    const productRestrictions = await this.db
      .select()
      .from(promotionProducts)
      .where(eq(promotionProducts.promotionId, promoId));

    const userRestrictions = await this.db
      .select({
        id: promotionUsers.id,
        userId: promotionUsers.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(promotionUsers)
      .innerJoin(users, eq(promotionUsers.userId, users.id))
      .where(eq(promotionUsers.promotionId, promoId));

    // Stats
    const [completedStats] = await this.db
      .select({
        totalCount: sql<number>`count(*)::int`,
        totalDiscount: sql<number>`COALESCE(sum(${promotionRedemptions.discountAmount}), 0)::int`,
        totalCashback: sql<number>`COALESCE(sum(${promotionRedemptions.cashbackAmount}), 0)::int`,
      })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoId),
          eq(promotionRedemptions.status, "completed"),
        ),
      );

    const [pendingStats] = await this.db
      .select({
        totalCount: sql<number>`count(*)::int`,
      })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promoId),
          eq(promotionRedemptions.status, "pending"),
          sql`${promotionRedemptions.reservationExpiresAt} > NOW()`,
        ),
      );

    const completedRedemptions = completedStats?.totalCount ?? 0;
    const pendingRedemptions = pendingStats?.totalCount ?? 0;
    const totalRedemptions = completedRedemptions + pendingRedemptions;

    const remainingUsage =
      r.totalUsageLimit !== null
        ? Math.max(0, r.totalUsageLimit - totalRedemptions)
        : null;

    return {
      promotion: {
        id: asPromotionId(r.id),
        name: r.name,
        description: r.description,
        benefitType: r.benefitType as PromotionBenefitType,
        benefitValue: r.benefitValue,
        maxDiscountAmount: r.maxDiscountAmount,
        minOrderAmount: r.minOrderAmount,
        totalUsageLimit: r.totalUsageLimit,
        perUserUsageLimit: r.perUserUsageLimit,
        active: r.active,
        startsAt: r.startsAt ? r.startsAt.toISOString() : null,
        endsAt: r.endsAt ? r.endsAt.toISOString() : null,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      },
      codes: await (async () => {
        // Calculate timesUsed per code
        const codeUsageRows = await this.db
          .select({
            codeId: promotionRedemptions.codeId,
            count: sql<number>`count(*)::int`,
          })
          .from(promotionRedemptions)
          .where(
            and(
              eq(promotionRedemptions.promotionId, promoId),
              eq(promotionRedemptions.status, "completed"),
            ),
          )
          .groupBy(promotionRedemptions.codeId);

        const usageMap = new Map<string, number>();
        for (const row of codeUsageRows) {
          usageMap.set(row.codeId, row.count);
        }

        return codes.map((c) => ({
          id: c.id,
          code: c.code,
          maxUses: c.maxUses,
          timesUsed: usageMap.get(c.id) ?? 0,
          active: c.active,
          createdAt: c.createdAt.toISOString(),
        }));
      })(),
      productRestrictions: productRestrictions.map((pr) => ({
        id: pr.id,
        productId: pr.productId,
        productType: pr.productType,
      })),
      userRestrictions: userRestrictions.map((ur) => ({
        id: ur.id,
        userId: ur.userId,
        userName: ur.userName || undefined,
        userEmail: ur.userEmail,
      })),
      stats: {
        totalRedemptions,
        completedRedemptions,
        pendingRedemptions,
        totalDiscountGranted: completedStats?.totalDiscount ?? 0,
        totalCashbackGranted: completedStats?.totalCashback ?? 0,
        remainingUsage,
      },
    };
  }

  async listPromotionRedemptions(
    promoId?: PromotionId,
    params: { page: number; pageSize: number } = { page: 1, pageSize: 20 },
  ): Promise<{
    items: unknown[];
    totalCount: number;
    stats?: {
      totalCompleted: number;
      totalDiscountGranted: number;
      totalCashbackGranted: number;
    };
  }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const whereClause = promoId
      ? eq(promotionRedemptions.promotionId, promoId)
      : undefined;

    const countQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(promotionRedemptions);
    const [countRow] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const summaryQuery = this.db
      .select({
        totalCompleted: sql<number>`count(*) filter (where ${promotionRedemptions.status} = 'completed')::int`,
        totalDiscountGranted: sql<number>`coalesce(sum(${promotionRedemptions.discountAmount}) filter (where ${promotionRedemptions.status} = 'completed'), 0)::int`,
        totalCashbackGranted: sql<number>`coalesce(sum(${promotionRedemptions.cashbackAmount}) filter (where ${promotionRedemptions.status} = 'completed'), 0)::int`,
      })
      .from(promotionRedemptions);

    const [summaryRow] = whereClause
      ? await summaryQuery.where(whereClause)
      : await summaryQuery;

    const selectQuery = this.db
      .select({
        redemption: promotionRedemptions,
        user: { id: users.id, name: users.name, email: users.email },
        order: { id: orders.id, orderNumber: orders.orderNumber },
        code: promotionCodes.code,
      })
      .from(promotionRedemptions)
      .leftJoin(users, eq(promotionRedemptions.userId, users.id))
      .leftJoin(orders, eq(promotionRedemptions.orderId, orders.id))
      .leftJoin(promotionCodes, eq(promotionRedemptions.codeId, promotionCodes.id));

    const rows = whereClause
      ? await selectQuery.where(whereClause).orderBy(desc(promotionRedemptions.createdAt)).limit(pageSize).offset(offset)
      : await selectQuery.orderBy(desc(promotionRedemptions.createdAt)).limit(pageSize).offset(offset);

    return {
      items: rows.map((r) => ({
        id: r.redemption.id,
        userId: r.user?.id || r.redemption.userId,
        userName: r.user?.name || undefined,
        userEmail: r.user?.email || undefined,
        orderId: r.order?.id || r.redemption.orderId,
        orderNumber: r.order?.orderNumber || (r.redemption.orderId ? r.redemption.orderId.slice(0, 8) : "—"),
        code: r.code || (r.redemption.promotionSnapshot as { code?: string } | null)?.code || "—",
        benefitType: r.redemption.benefitType,
        benefitValue: r.redemption.benefitValue,
        discountAmount: r.redemption.discountAmount,
        cashbackAmount: r.redemption.cashbackAmount,
        orderOriginalAmount: r.redemption.orderOriginalAmount,
        orderFinalAmount: r.redemption.orderFinalAmount,
        status: r.redemption.status,
        redeemedAt: r.redemption.redeemedAt.toISOString(),
        completedAt: r.redemption.completedAt
          ? r.redemption.completedAt.toISOString()
          : null,
      })),
      totalCount: countRow?.count ?? 0,
      stats: {
        totalCompleted: summaryRow?.totalCompleted ?? 0,
        totalDiscountGranted: summaryRow?.totalDiscountGranted ?? 0,
        totalCashbackGranted: summaryRow?.totalCashbackGranted ?? 0,
      },
    };
  }
}

/**
 * In-Memory Implementation of PromotionService for unit tests & non-Postgres environments.
 */
export class InMemoryPromotionService {
  private memoryPromotions: any[] = [];
  private memoryCodes: any[] = [];
  private memoryRedemptions: any[] = [];
  private memoryProductRestrictions: any[] = [];
  private memoryUserRestrictions: any[] = [];

  constructor(
    _db?: any,
    private readonly walletService?: WalletService,
  ) {}

  async lazyExpirePendingRedemptions(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const r of this.memoryRedemptions) {
      if (r.status === "pending" && r.reservationExpiresAt && new Date(r.reservationExpiresAt) <= now) {
        r.status = "cancelled";
        r.updatedAt = now.toISOString();
        count++;
      }
    }
    return count;
  }

  async validateCoupon(
    rawCode: string,
    userId: UserId,
    items: { productId: ProductId | string; productType?: string | null; price: number }[],
  ): Promise<PromotionValidationResult> {
    const code = normalizePromotionCode(rawCode);
    const orderTotal = items.reduce((sum, it) => sum + Math.max(0, it.price), 0);
    if (!code) {
      return { valid: false, reason: "کد تخفیف وارد نشده است.", eligibleSubtotal: 0, orderTotal };
    }

    await this.lazyExpirePendingRedemptions();

    const codeRec = this.memoryCodes.find(
      (c) => c.code.toUpperCase() === code && c.active && c.deletedAt === null,
    );
    if (!codeRec) {
      return { valid: false, reason: "کد تخفیف نامعتبر است یا وجود ندارد.", eligibleSubtotal: 0, orderTotal };
    }

    const promo = this.memoryPromotions.find((p) => p.id === codeRec.promotionId && p.active && p.deletedAt === null);
    if (!promo) {
      return { valid: false, reason: "پروموشن مربوط به این کد فعال نیست.", eligibleSubtotal: 0, orderTotal };
    }

    const prodRestrictions = this.memoryProductRestrictions.filter((pr) => pr.promotionId === promo.id);
    const userRestrictions = this.memoryUserRestrictions.filter((ur) => ur.promotionId === promo.id);

    const activeRedemptions = this.memoryRedemptions.filter(
      (r) => r.promotionId === promo.id && (r.status === "completed" || r.status === "pending"),
    );

    const userRedemptions = activeRedemptions.filter((r) => r.userId === userId);

    if (codeRec.maxUses !== null && codeRec.maxUses !== undefined && codeRec.maxUses > 0) {
      const codeRedemptions = activeRedemptions.filter((r) => r.codeId === codeRec.id);
      if (codeRedemptions.length >= codeRec.maxUses) {
        return {
          valid: false,
          reason: "سقف استفاده از این کد تخفیف تکمیل شده است.",
          eligibleSubtotal: 0,
          orderTotal,
        };
      }
    }

    const eligibility = validatePromotionEligibility(promo, codeRec, {
      userId,
      items: items.map((it) => ({
        productId: String(it.productId),
        productType: it.productType || undefined,
        price: it.price,
      })),
      productRestrictions: prodRestrictions,
      userRestrictions: userRestrictions,
      totalActiveRedemptionsCount: activeRedemptions.length,
      userActiveRedemptionsCount: userRedemptions.length,
      now: new Date(),
    });

    if (!eligibility.valid) {
      return {
        valid: false,
        reason: eligibility.reason,
        eligibleSubtotal: eligibility.eligibleSubtotal,
        orderTotal: eligibility.orderTotal,
      };
    }

    return {
      valid: true,
      eligibleSubtotal: eligibility.eligibleSubtotal,
      orderTotal: eligibility.orderTotal,
      benefit: eligibility.benefit,
      promotion: {
        id: promo.id,
        name: promo.name,
        benefitType: promo.benefitType,
        benefitValue: promo.benefitValue,
        maxDiscountAmount: promo.maxDiscountAmount,
      },
      code: {
        id: codeRec.id,
        code: codeRec.code,
      },
    };
  }

  async validatePromotion(params: {
    code: string;
    userId: UserId;
    items: { productId: string; productType?: string; unitPrice: number; quantity: number }[];
  }): Promise<PromotionValidationResult> {
    return this.validateCoupon(
      params.code,
      params.userId,
      params.items.map((it) => ({
        productId: it.productId,
        productType: it.productType,
        price: it.unitPrice * (it.quantity || 1),
      })),
    );
  }

  private reservationQueue: Promise<void> = Promise.resolve();

  private async acquireReservationLock(): Promise<() => void> {
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentQueue = this.reservationQueue;
    this.reservationQueue = currentQueue.then(() => lockPromise).catch(() => lockPromise);
    await currentQueue;
    return releaseLock;
  }

  async evaluateAndReservePromotion(params: {
    userId: UserId;
    code: string;
    orderAmount?: number;
    productId?: string;
    productType?: string;
    items?: { productId: ProductId | string; productType?: string | null; price: number }[];
    reservationTtlMinutes?: number;
  }): Promise<{
    promotionId: PromotionId;
    redemptionId: PromotionRedemptionId;
    discountAmount: number;
    cashbackAmount: number;
    payableAmount: number;
    benefitType: PromotionBenefitType;
    benefitValue: number;
  }> {
    const release = await this.acquireReservationLock();
    try {
      const codeNorm = normalizePromotionCode(params.code);
      const codeRec = this.memoryCodes.find(
        (c) => normalizePromotionCode(c.code) === codeNorm && !c.deletedAt && c.active,
      );
      if (codeRec) {
        const nowIso = new Date().toISOString();
        for (const r of this.memoryRedemptions) {
          if (
            r.userId === params.userId &&
            r.promotionId === codeRec.promotionId &&
            r.status === "pending" &&
            r.orderId === null
          ) {
            r.status = "cancelled";
            r.updatedAt = nowIso;
          }
        }
      }

      const items = params.items || (params.productId ? [{
        productId: params.productId,
        productType: params.productType,
        price: params.orderAmount || 0,
      }] : []);

      const preview = await this.validateCoupon(params.code, params.userId, items);
      if (!preview.valid || !preview.benefit || !preview.promotion || !preview.code) {
        throw new DomainError("bad_request", preview.reason || "کد تخفیف نامعتبر است.");
      }

      const redemptionId = (await import("node:crypto")).randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (params.reservationTtlMinutes || 30) * 60 * 1000);

      const redemption = {
        id: redemptionId,
        promotionId: preview.promotion.id,
        codeId: preview.code.id,
        orderId: null,
        paymentId: null,
        userId: params.userId,
        benefitType: preview.promotion.benefitType,
        benefitValue: preview.promotion.benefitValue,
        discountAmount: preview.benefit.discountAmount,
        cashbackAmount: preview.benefit.cashbackAmount,
        orderOriginalAmount: preview.benefit.orderTotal,
        orderFinalAmount: preview.benefit.payableAmount,
        status: "pending",
        redeemedAt: now.toISOString(),
        reservationExpiresAt: expiresAt.toISOString(),
        completedAt: null,
        metadata: {},
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      this.memoryRedemptions.push(redemption);

      return {
        promotionId: asPromotionId(preview.promotion.id as any),
        redemptionId: asPromotionRedemptionId(redemptionId as any),
        discountAmount: preview.benefit.discountAmount,
        cashbackAmount: preview.benefit.cashbackAmount,
        payableAmount: preview.benefit.payableAmount,
        benefitType: preview.promotion.benefitType as any,
        benefitValue: preview.promotion.benefitValue,
      };
    } finally {
      release();
    }
  }

  async linkRedemptionToOrder(redemptionId: string, orderId: string): Promise<void> {
    if (!orderId || typeof orderId !== "string" || orderId.trim() === "" || orderId === "00000000-0000-0000-0000-000000000000") {
      throw new DomainError("bad_request", "شناسه سفارش برای انتساب به تخفیف نامعتبر است.");
    }
    const red = this.memoryRedemptions.find((r) => r.id === redemptionId);
    if (!red) {
      throw new DomainError("not_found", "رکورد رزرو تخفیف یافت نشد.");
    }
    if (red.status !== "pending") {
      throw new DomainError("bad_request", "تنها رزروهای معلق قابل اتصال به سفارش هستند.");
    }
    if (red.orderId !== null && red.orderId !== orderId) {
      throw new DomainError("bad_request", "این رزرو قبلاً به سفارش دیگری متصل شده است.");
    }
    red.orderId = orderId;
    red.updatedAt = new Date().toISOString();
  }

  async cancelPromotionRedemption(orderId: string, _reason?: string): Promise<void> {
    const red = this.memoryRedemptions.find((r) => r.orderId === orderId && r.status === "pending");
    if (red) {
      red.status = "cancelled";
      red.updatedAt = new Date().toISOString();
    }
  }

  async cancelPromotionRedemptionById(redemptionId: string, _reason?: string): Promise<boolean> {
    const red = this.memoryRedemptions.find((r) => r.id === redemptionId && r.status === "pending");
    if (red) {
      red.status = "cancelled";
      red.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  async finalizePromotionForPaidOrder(
    orderId: string,
    paymentId: string,
  ): Promise<{ finalized: boolean; cashbackGranted: number }> {
    const release = await this.acquireReservationLock();
    try {
      const red = this.memoryRedemptions.find(
        (r) => r.orderId === orderId && (r.status === "pending" || r.status === "completed"),
      );
      if (!red) return { finalized: false, cashbackGranted: 0 };

      if (red.status === "completed") {
        return { finalized: true, cashbackGranted: red.cashbackAmount }; // Idempotent
      }

      if (red.status === "cancelled") {
        return { finalized: false, cashbackGranted: 0 };
      }

      // 1. Credit Cashback if applicable (WalletService uses its own atomic mutation & idempotency lock)
      if (red.cashbackAmount > 0) {
        if (!this.walletService) {
          throw new DomainError(
            "internal_error",
            "سرویس کیف پول برای تسویه کش‌بک در دسترس نیست.",
          );
        }

        const creditResult = await this.walletService.credit({
          userId: red.userId,
          amount: red.cashbackAmount,
          source: "promotion_cashback",
          referenceType: "order",
          referenceId: orderId,
          idempotencyKey: `cashback:redemption:${red.id}`,
          metadata: {
            promotionId: red.promotionId,
            orderId: red.orderId,
            codeId: red.codeId,
            paymentId,
            redemptionId: red.id,
            cashbackAmount: red.cashbackAmount,
          },
        });

        if (!creditResult || !creditResult.transaction) {
          throw new DomainError(
            "internal_error",
            "خطا در شارژ کش‌بک کیف پول؛ تراکنش ثبت نشد.",
          );
        }
      }

      // 2. Mark Redemption Completed (Only after wallet credit is verified)
      const now = new Date().toISOString();
      red.status = "completed";
      red.paymentId = paymentId;
      red.completedAt = now;
      red.updatedAt = now;

      return { finalized: true, cashbackGranted: red.cashbackAmount };
    } finally {
      release();
    }
  }

  async createPromotion(
    adminIdOrInput: string | CreatePromotionInput,
    inputArg?: CreatePromotionInput,
  ): Promise<PromotionDetailResponse> {
    const input = typeof adminIdOrInput === "object" ? adminIdOrInput : inputArg!;
    if (!input.name?.trim()) {
      throw new DomainError("bad_request", "نام پروموشن الزامی است.");
    }
    if (!input.benefitValue || input.benefitValue <= 0) {
      throw new DomainError("bad_request", "مقدار تخفیف/کشبک باید بزرگتر از صفر باشد.");
    }

    const promoId = (await import("node:crypto")).randomUUID();
    const now = new Date().toISOString();

    const promo = {
      id: promoId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      benefitType: input.benefitType,
      benefitValue: input.benefitValue,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      minOrderAmount: input.minOrderAmount ?? null,
      totalUsageLimit: input.totalUsageLimit ?? null,
      perUserUsageLimit: input.perUserUsageLimit ?? null,
      active: input.active ?? true,
      startsAt: input.startsAt || null,
      endsAt: input.endsAt || null,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.memoryPromotions.push(promo);

    if (input.code) {
      const normCode = normalizePromotionCode(input.code);
      const codeId = (await import("node:crypto")).randomUUID();
      this.memoryCodes.push({
        id: codeId,
        promotionId: promoId,
        code: normCode,
        maxUses: null,
        active: true,
        createdAt: now,
        deletedAt: null,
      });
    }

    return (await this.getPromotion(promoId))!;
  }

  async getPromotion(id: string): Promise<PromotionDetailResponse | null> {
    const promo = this.memoryPromotions.find((p) => p.id === id && p.deletedAt === null);
    if (!promo) return null;

    const codes = this.memoryCodes.filter((c) => c.promotionId === id && c.deletedAt === null);
    const completed = this.memoryRedemptions.filter((r) => r.promotionId === id && r.status === "completed");
    const pending = this.memoryRedemptions.filter((r) => r.promotionId === id && r.status === "pending");

    const totalRedemptions = completed.length + pending.length;
    const totalDiscountGranted = completed.reduce((sum, r) => sum + (r.discountAmount || 0), 0);
    const totalCashbackGranted = completed.reduce((sum, r) => sum + (r.cashbackAmount || 0), 0);
    const remainingUsage =
      promo.totalUsageLimit !== null ? Math.max(0, promo.totalUsageLimit - totalRedemptions) : null;

    return {
      promotion: promo,
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        maxUses: c.maxUses,
        active: c.active,
        createdAt: c.createdAt,
      })),
      productRestrictions: [],
      userRestrictions: [],
      stats: {
        totalRedemptions,
        completedRedemptions: completed.length,
        pendingRedemptions: pending.length,
        totalDiscountGranted,
        totalCashbackGranted,
        remainingUsage,
      },
    };
  }

  async listRedemptions(params: { promotionId?: string; limit?: number }): Promise<{ items: any[]; totalCount: number }> {
    let list = this.memoryRedemptions;
    if (params.promotionId) {
      list = list.filter((r) => r.promotionId === params.promotionId);
    }
    return {
      items: list.slice(0, params.limit || 100),
      totalCount: list.length,
    };
  }
}

