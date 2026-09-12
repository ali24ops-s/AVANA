/**
 * CommerceService — Order Lifecycle, Payment Processing, and Entitlement Grants.
 *
 * Implements:
 * 1. Product catalog reads
 * 2. Idempotent checkout initialization
 * 3. Robust transaction verification with payment gateways (ZarinPal & Mock)
 * 4. Atomic entitlement and subscription provisioning
 * 5. Complete idempotency under concurrent verifies, network retries, and page refreshes.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type EntitlementResourceType,
  type OrderId,
  type OrderRecord,
  type PaymentId,
  type PaymentRecord,
  type ProductId,
  type ProductRecord,
  type UserId,
  type UserSubscriptionId,
  type UserEntitlementRecord,
  type UserSubscriptionRecord,
  type CardToCardPaymentInput,
  type CardToCardInfoResponse,
  type CardToCardSubmissionResult,
  DomainError,
  asOrderId,
  asPaymentId,
  asUserEntitlementId,
  asUserSubscriptionId,
  calculateSubscriptionExpiry,
  generateOrderNumber,
  sanitizePaymentText,
  calculateSpecialExamPrice,
} from "@avana/domain";
import type { CommerceStore } from "./commerce-store.js";
import type { PaymentGateway } from "./gateway/types.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { UserStore } from "../identity/user-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { ContentPackStore } from "../library/library-store.js";
import type { LessonStore } from "../learning/learning-store.js";
import type { StudyService } from "../study/study-service.js";

export interface CheckoutInput {
  productId: ProductId;
  callbackUrl: string;
  gateway?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutResponse {
  order_id: OrderId;
  payment_id: PaymentId;
  payment_url: string;
  authority: string;
}

export interface VerifyPaymentInput {
  authority: string;
  status?: string; // e.g. 'OK' or 'NOK' from gateway redirect query
}

export interface VerifyPaymentResponse {
  success: boolean;
  order_id?: OrderId;
  payment_id?: PaymentId;
  transaction_id?: string;
  error_message?: string;
  entitlement?: {
    resource_type: string;
    resource_id: string | null;
    expires_at: string | null;
  };
  subscription?: {
    id: string;
    expires_at: string;
  };
  attempt_id?: string;
}

export interface CommercePaymentOptions {
  onlinePaymentEnabled?: boolean;
  mockPaymentEnabled?: boolean;
}

export class CommerceService {
  constructor(
    private readonly store: CommerceStore,
    private readonly gateway: PaymentGateway,
    private readonly userStore?: UserStore,
    private readonly auditService?: AuditService,
    private readonly contentPackStore?: ContentPackStore,
    private readonly cardToCardConfig?: CardToCardInfoResponse,
    private readonly lessonStore?: LessonStore,
    private readonly paymentOptions?: CommercePaymentOptions,
    private readonly studyService?: StudyService,
    private readonly notificationService?: NotificationService,
  ) {}

  /**
   * List all sellable active products.
   */
  async listActiveProducts(): Promise<ProductRecord[]> {
    return this.store.listActiveProducts();
  }

  /**
   * Get product by ID.
   */
  async getProduct(productId: ProductId): Promise<ProductRecord> {
    const product = await this.store.findProductById(productId);
    if (!product || !product.active || product.deletedAt !== null) {
      throw new DomainError("not_found", "محصول یافت نشد یا غیرفعال است.");
    }
    return product;
  }

  /**
   * Initiate a checkout order and payment request.
   */
  async checkout(
    actor: Actor,
    input: CheckoutInput,
    requestId: string,
  ): Promise<CheckoutResponse> {
    // 0. Enforce Payment Method Availability & Globally Disable Mock Gateway
    const requestedGateway = input.gateway ?? this.gateway.gatewayName;
    if (requestedGateway === "mock" && !this.paymentOptions?.mockPaymentEnabled) {
      throw new DomainError(
        "bad_request",
        "درگاه پرداخت آزمایشی (Mock) غیرفعال است.",
      );
    }
    if (
      !this.paymentOptions?.onlinePaymentEnabled ||
      this.gateway.enabled === false
    ) {
      throw new DomainError(
        "bad_request",
        "درگاه پرداخت آنلاین در حال حاضر در دسترس نیست (به‌زودی). لطفاً از روش کارت‌به‌کارت استفاده کنید.",
      );
    }

    // 1. Fetch & validate product
    const product = await this.getProduct(input.productId);
    if (!product.active || product.price <= 0) {
      throw new DomainError(
        "bad_request",
        "این محصول در حال حاضر فعال یا قابل خرید نیست.",
      );
    }

    // 1.2 Validate special exam pricing (questionCount * 500)
    if (product.type === "special_exam") {
      const qCount = Number((product.metadata as any)?.questionCount) || 20;
      const expectedPrice = calculateSpecialExamPrice(qCount);
      if (product.price !== expectedPrice) {
        throw new DomainError(
          "bad_request",
          `قیمت آزمون ویژه (${product.price} تومان) با فرمول قیمت‌گذاری (${expectedPrice} تومان برای ${qCount} سؤال) مطابقت ندارد.`,
        );
      }
    }

    // 1.5 Validate target Content Pack if product targets a content pack
    if (product.targetType === "content_pack" && product.targetId) {
      if (this.contentPackStore) {
        const pack = await this.contentPackStore.findById(product.targetId as any);
        if (
          !pack ||
          pack.status !== "published" ||
          pack.deletedAt !== null ||
          pack.metadata.accessType !== "paid"
        ) {
          throw new DomainError(
            "bad_request",
            "این بسته آموزشی در حال حاضر منتشر نشده یا قابل خرید نیست.",
          );
        }
      }
    }

    // 1.6 Validate target Content/Lesson if product targets a lesson
    if (product.targetType === "content" && product.targetId) {
      if (this.lessonStore) {
        const lesson = await this.lessonStore.findById(product.targetId as any);
        if (
          !lesson ||
          lesson.publicationStatus !== "published" ||
          lesson.deletedAt !== null
        ) {
          throw new DomainError(
            "bad_request",
            "این محتوای آموزشی در حال حاضر منتشر نشده یا قابل خرید نیست.",
          );
        }
      }
    }

    // 2. Resolve user info
    let userEmail = "student@avana.ir";
    if (this.userStore) {
      const user = await this.userStore.findById(actor.userId);
      if (user) {
        userEmail = user.email;
      }
    }

    const now = new Date().toISOString();
    const orderId = asOrderId(randomUUID());
    const paymentId = asPaymentId(randomUUID());
    const orderNumber = generateOrderNumber();

    // 3. Create Pending Order Record
    const orderRecord: OrderRecord = {
      id: orderId,
      userId: actor.userId,
      productId: product.id,
      orderNumber,
      amount: product.price,
      currency: product.currency,
      status: "pending",
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const createdOrder = await this.store.createOrder(orderRecord);

    // 4. Create Pending Payment Record
    const paymentRecord: PaymentRecord = {
      id: paymentId,
      orderId: createdOrder.id,
      userId: actor.userId,
      amount: product.price,
      currency: product.currency,
      gateway: input.gateway ?? this.gateway.gatewayName,
      authority: null,
      transactionId: null,
      status: "pending",
      idempotencyKey: `pay_${orderId}`,
      rawCallbackMetadata: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.createPayment(paymentRecord);

    // 5. Request payment initiation from gateway
    const gatewayResult = await this.gateway.requestPayment({
      order: createdOrder,
      user: {
        userId: actor.userId,
        email: userEmail,
      },
      callbackUrl: input.callbackUrl,
    });

    // 6. Update payment with authority
    await this.store.updatePayment(paymentId, {
      authority: gatewayResult.authority,
    });

    if (this.auditService) {
      await this.auditService.emit([
        {
          actorId: actor.userId,
          organizationId: null,
          action: "payment.initiated",
          entityType: "order",
          entityId: orderId,
          createdAt: now,
          details: {
            productId: product.id,
            amount: product.price,
            currency: product.currency,
            authority: gatewayResult.authority,
            requestId,
          },
        },
      ]);
    }

    return {
      order_id: orderId,
      payment_id: paymentId,
      payment_url: gatewayResult.redirectUrl,
      authority: gatewayResult.authority,
    };
  }

  /**
   * Idempotently verifies a payment callback and provisions entitlements.
   */
  async verifyPayment(
    input: VerifyPaymentInput,
    requestId: string,
  ): Promise<VerifyPaymentResponse> {
    if (!input.authority) {
      throw new DomainError("bad_request", "شناسه تراکنش (Authority) الزامی است.");
    }

    // 1. Lookup payment by authority
    const payment = await this.store.findPaymentByAuthority(input.authority);
    if (!payment) {
      throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
    }

    const order = await this.store.findOrderById(payment.orderId);
    if (!order) {
      throw new DomainError("not_found", "سفارش مرتبط یافت نشد.");
    }

    // 1.5 Enforce Mock Gateway & Online Payment Disablement
    const isMockAuthority = input.authority.startsWith("mock_");
    const isMockGateway =
      payment.gateway === "mock" || this.gateway.gatewayName === "mock";
    if (
      (isMockAuthority || isMockGateway) &&
      !this.paymentOptions?.mockPaymentEnabled
    ) {
      await this.store.updatePayment(payment.id, {
        status: "failed",
        rawCallbackMetadata: { reason: "mock_gateway_disabled" },
      });
      await this.store.updateOrderStatus(order.id, "failed");
      return {
        success: false,
        order_id: order.id,
        payment_id: payment.id,
        error_message: "درگاه پرداخت آزمایشی (Mock) غیرفعال است.",
      };
    }

    if (
      !this.paymentOptions?.onlinePaymentEnabled ||
      this.gateway.enabled === false
    ) {
      await this.store.updatePayment(payment.id, {
        status: "failed",
        rawCallbackMetadata: { reason: "online_gateway_disabled" },
      });
      await this.store.updateOrderStatus(order.id, "failed");
      if (this.notificationService) {
        void this.notificationService.notifyPaymentFailed(payment.userId, {
          paymentId: payment.id,
          orderId: order.id,
          reason: "درگاه پرداخت آنلاین در حال حاضر در دسترس نیست.",
        });
      }
      return {
        success: false,
        order_id: order.id,
        payment_id: payment.id,
        error_message:
          "درگاه پرداخت آنلاین در حال حاضر در دسترس نیست (به‌زودی).",
      };
    }

    // 2. Check Idempotency: If already paid, return existing state immediately
    if (payment.status === "paid" && order.status === "paid") {
      const activeEntitlements = await this.store.listActiveEntitlements(
        payment.userId,
      );
      const activeSub = await this.store.findActiveSubscription(payment.userId);

      const orderEntitlement =
        activeEntitlements.find((e) => e.orderId === order.id) ??
        activeEntitlements[0];

      const attemptId =
        orderEntitlement?.resourceType === "special_exam"
          ? (orderEntitlement.resourceId ?? undefined)
          : undefined;

      return {
        success: true,
        order_id: order.id,
        payment_id: payment.id,
        transaction_id: payment.transactionId ?? undefined,
        entitlement: orderEntitlement
          ? {
              resource_type: orderEntitlement.resourceType,
              resource_id: orderEntitlement.resourceId,
              expires_at: orderEntitlement.expiresAt,
            }
          : undefined,
        subscription: activeSub
          ? {
              id: activeSub.id,
              expires_at: activeSub.expiresAt,
            }
          : undefined,
        attempt_id: attemptId,
      };
    }

    // 3. Check if user or gateway canceled
    if (input.status === "NOK") {
      await this.store.updatePayment(payment.id, { status: "cancelled" });
      await this.store.updateOrderStatus(order.id, "cancelled");
      if (this.notificationService) {
        void this.notificationService.notifyPaymentFailed(payment.userId, {
          paymentId: payment.id,
          orderId: order.id,
          reason: "پرداخت توسط کاربر یا درگاه لغو شد.",
        });
      }
      return {
        success: false,
        order_id: order.id,
        payment_id: payment.id,
        error_message: "پرداخت توسط کاربر یا درگاه لغو شد.",
      };
    }

    // 4. Call Gateway Verification
    const verifyResult = await this.gateway.verifyPayment({
      authority: input.authority,
      amount: payment.amount,
    });

    if (!verifyResult.success || !verifyResult.transactionId) {
      await this.store.updatePayment(payment.id, {
        status: "failed",
        rawCallbackMetadata: verifyResult.rawResponse,
      });
      await this.store.updateOrderStatus(order.id, "failed");

      if (this.notificationService) {
        void this.notificationService.notifyPaymentFailed(payment.userId, {
          paymentId: payment.id,
          orderId: order.id,
          reason: verifyResult.errorMessage || "تایید تراکنش با خطا مواجه شد.",
        });
      }

      return {
        success: false,
        order_id: order.id,
        payment_id: payment.id,
        error_message: verifyResult.errorMessage || "تایید تراکنش با خطا مواجه شد.",
      };
    }

    // 5. Fetch Product to determine entitlement grant specifications
    const product = await this.store.findProductById(order.productId);
    if (!product) {
      throw new DomainError("not_found", "محصول سفارش یافت نشد.");
    }

    const now = new Date();
    const paidAt = now.toISOString();

    let subscriptionToCreate: UserSubscriptionRecord | undefined;
    let entitlementExpiresAt: string | null = null;
    let entitlementResourceType: EntitlementResourceType = "subscription";
    let entitlementResourceId: string | null = null;

    if (product.type === "subscription") {
      const durationDays = product.durationDays ?? 30;
      // If user already has an active subscription, extend from existing expiresAt
      const existingSub = await this.store.findActiveSubscription(
        order.userId,
        now,
      );
      const baseDate =
        existingSub && new Date(existingSub.expiresAt).getTime() > now.getTime()
          ? new Date(existingSub.expiresAt)
          : now;

      const expiryDate = calculateSubscriptionExpiry(baseDate, durationDays);
      entitlementExpiresAt = expiryDate.toISOString();
      entitlementResourceType = "subscription";
      entitlementResourceId = null;

      subscriptionToCreate = {
        id: asUserSubscriptionId(randomUUID()),
        userId: order.userId,
        productId: product.id,
        orderId: order.id,
        status: "active",
        startedAt: paidAt,
        expiresAt: entitlementExpiresAt,
        createdAt: paidAt,
        updatedAt: paidAt,
      };
    } else if (product.type === "content_pack") {
      entitlementResourceType = "content_pack";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null; // Lifetime Ownership
    } else if (product.type === "course") {
      entitlementResourceType = "course";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null; // Lifetime Ownership
    } else if (product.type === "content") {
      entitlementResourceType = "content";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null; // Lifetime Ownership
    } else if (product.type === "special_exam") {
      entitlementResourceType = "special_exam";
      if (this.studyService) {
        const attemptResult = await this.studyService.createSpecialExamAttempt(
          { userId: order.userId, role: "student" } as Actor,
          (product.metadata?.organizationId as string) || "00000000-0000-0000-0000-000000000001",
          product,
          order.id,
        );
        entitlementResourceId = attemptResult.attempt.id;
      }
      entitlementExpiresAt = null; // Lifetime Ownership
    }

    const entitlementToCreate: UserEntitlementRecord = {
      id: asUserEntitlementId(randomUUID()),
      userId: order.userId,
      resourceType: entitlementResourceType,
      resourceId: entitlementResourceId,
      sourceType: "purchase",
      orderId: order.id,
      startsAt: paidAt,
      expiresAt: entitlementExpiresAt,
      createdAt: paidAt,
      updatedAt: paidAt,
    };

    // 6. Complete transaction atomically
    const completed = await this.store.completePaymentTransaction({
      paymentId: payment.id,
      orderId: order.id,
      transactionId: verifyResult.transactionId,
      paidAt,
      rawMetadata: verifyResult.rawResponse,
      subscriptionToCreate,
      entitlementToCreate,
    });

    if (this.notificationService) {
      void this.notificationService.notifyPurchaseCompleted(order.userId, {
        paymentId: payment.id,
        orderId: order.id,
        productTitle: product.title,
        productType: product.type,
        targetId: product.targetId,
      });
    }

    if (this.auditService) {
      await this.auditService.emit([
        {
          actorId: order.userId,
          organizationId: null,
          action: "payment.completed",
          entityType: "payment",
          entityId: payment.id,
          createdAt: paidAt,
          details: {
            orderId: order.id,
            productId: product.id,
            amount: payment.amount,
            transactionId: verifyResult.transactionId,
            resourceType: entitlementResourceType,
            resourceId: entitlementResourceId,
            expiresAt: entitlementExpiresAt,
            requestId,
          },
        },
      ]);
    }

    return {
      success: true,
      order_id: completed.order.id,
      payment_id: completed.payment.id,
      transaction_id: completed.payment.transactionId ?? undefined,
      entitlement: {
        resource_type: completed.entitlement.resourceType,
        resource_id: completed.entitlement.resourceId,
        expires_at: completed.entitlement.expiresAt,
      },
      subscription: completed.subscription
        ? {
            id: completed.subscription.id,
            expires_at: completed.subscription.expiresAt,
          }
        : undefined,
      attempt_id:
        completed.entitlement.resourceType === "special_exam"
          ? (completed.entitlement.resourceId ?? undefined)
          : undefined,
    };
  }

  /**
   * Get Card-to-Card destination info and availability.
   */
  getCardToCardInfo(): CardToCardInfoResponse {
    return {
      enabled: this.cardToCardConfig?.enabled ?? true,
      destinationCardNumber:
        this.cardToCardConfig?.destinationCardNumber ?? "5894631131738239",
      cardholderName: this.cardToCardConfig?.cardholderName ?? "",
      instructions:
        this.cardToCardConfig?.instructions ??
        "لطفاً مبلغ دقیق را به شماره کارت فوق واریز کرده و سپس اطلاعات پرداخت را ثبت نمایید. سفارش شما پس از بررسی و تأیید نهایی فعال خواهد شد.",
    };
  }

  /**
   * Submit Card-to-Card payment with initial validation and instant subscription activation.
   */
  async submitCardToCardPayment(
    actor: Actor,
    input: CardToCardPaymentInput,
    requestId: string,
  ): Promise<CardToCardSubmissionResult> {
    // 1. Check if card-to-card is enabled
    const c2cInfo = this.getCardToCardInfo();
    if (!c2cInfo.enabled) {
      throw new DomainError(
        "bad_request",
        "روش پرداخت کارت‌به‌کارت در حال حاضر فعال نیست.",
      );
    }

    // 2. Fetch & validate product
    const product = await this.getProduct(input.productId);

    // 2.1 Validate target Content Pack if product targets a content pack
    if (product.targetType === "content_pack" && product.targetId && this.contentPackStore) {
      const pack = await this.contentPackStore.findById(product.targetId as any);
      if (
        !pack ||
        pack.status !== "published" ||
        pack.deletedAt !== null ||
        pack.metadata.accessType !== "paid"
      ) {
        throw new DomainError(
          "bad_request",
          "این بسته آموزشی در حال حاضر منتشر نشده یا قابل خرید نیست.",
        );
      }
    }

    // 2.2 Validate target Content/Lesson if product targets a lesson
    if (product.targetType === "content" && product.targetId && this.lessonStore) {
      const lesson = await this.lessonStore.findById(product.targetId as any);
      if (
        !lesson ||
        lesson.publicationStatus !== "published" ||
        lesson.deletedAt !== null
      ) {
        throw new DomainError(
          "bad_request",
          "این محتوای آموزشی در حال حاضر منتشر نشده یا قابل خرید نیست.",
        );
      }
    }

    // 2.3 Validate special exam pricing (questionCount * 500)
    if (product.type === "special_exam") {
      const qCount = Number((product.metadata as any)?.questionCount) || 20;
      const expectedPrice = calculateSpecialExamPrice(qCount);
      if (product.price !== expectedPrice) {
        throw new DomainError(
          "bad_request",
          `قیمت آزمون ویژه (${product.price} تومان) با فرمول قیمت‌گذاری (${expectedPrice} تومان برای ${qCount} سؤال) مطابقت ندارد.`,
        );
      }
    }

    // 3. Validate Amount
    if (
      !input.amount ||
      !Number.isInteger(input.amount) ||
      input.amount !== product.price
    ) {
      throw new DomainError(
        "bad_request",
        `مبلغ واریزی (${input.amount?.toLocaleString("fa-IR") ?? 0} تومان) با مبلغ پلن انتخابی (${product.price.toLocaleString("fa-IR")} تومان) مطابقت ندارد.`,
      );
    }

    // 4. Validate Tracking Number
    const trackingNumber = input.trackingNumber
      ? input.trackingNumber.trim()
      : "";
    if (!trackingNumber || trackingNumber.length < 3) {
      throw new DomainError(
        "bad_request",
        "شماره پیگیری / شماره ارجاع بانکی الزامی و نامعتبر است.",
      );
    }

    // 5. Validate Source Card Last 4 Digits
    const sourceCardLast4 = input.sourceCardLast4
      ? input.sourceCardLast4.trim()
      : "";
    if (!/^\d{4}$/.test(sourceCardLast4)) {
      throw new DomainError(
        "bad_request",
        "۴ رقم آخر کارت مبدأ باید دقیقاً ۴ رقم عددی باشد.",
      );
    }

    // 6. Anti-Fraud Rule #7: Prevent multiple concurrent pending payments for the same user
    const pendingC2C = await this.store.findPendingCardToCardPaymentByUser(
      actor.userId,
    );
    if (pendingC2C) {
      throw new DomainError(
        "conflict",
        "شما یک پرداخت کارت‌به‌کارت در حال بررسی دارید. لطفاً تا مشخص شدن وضعیت آن صبور باشید.",
      );
    }

    // 7. Anti-Fraud Rule #6: Composite Duplicate Detection
    const duplicatePayment = await this.store.findDuplicateCardToCardPayment({
      trackingNumber,
      amount: input.amount,
      sourceCardLast4,
    });
    if (duplicatePayment) {
      throw new DomainError(
        "conflict",
        "این پرداخت با این مشخصات و شماره پیگیری قبلاً در سیستم ثبت شده است.",
      );
    }

    // Global tracking number check for non-rejected payments
    const existingByTracking =
      await this.store.findPaymentByTrackingNumber(trackingNumber);
    if (
      existingByTracking &&
      existingByTracking.status !== "admin_rejected" &&
      existingByTracking.status !== "failed" &&
      existingByTracking.status !== "cancelled"
    ) {
      throw new DomainError(
        "conflict",
        "این شماره پیگیری قبلاً برای پرداخت دیگری استفاده شده است.",
      );
    }

    // 8. Prepare IDs and Expiration
    const now = new Date();
    const nowIso = now.toISOString();
    const orderId = asOrderId(randomUUID());
    const paymentId = asPaymentId(randomUUID());
    const entitlementId = asUserEntitlementId(randomUUID());
    const orderNumber = generateOrderNumber("C2C");

    let subscriptionRecord: UserSubscriptionRecord | undefined;
    let entitlementResourceType: EntitlementResourceType = "subscription";
    let entitlementResourceId: string | null = null;
    let entitlementExpiresAt: string | null = null;
    let subscriptionId: UserSubscriptionId | undefined;

    if (product.type === "subscription") {
      subscriptionId = asUserSubscriptionId(randomUUID());
      const durationDays = product.durationDays ?? 30;
      const existingSub = await this.store.findActiveSubscription(
        actor.userId,
        now,
      );
      const baseDate =
        existingSub && new Date(existingSub.expiresAt).getTime() > now.getTime()
          ? new Date(existingSub.expiresAt)
          : now;
      entitlementExpiresAt = calculateSubscriptionExpiry(
        baseDate,
        durationDays,
      ).toISOString();

      subscriptionRecord = {
        id: subscriptionId,
        userId: actor.userId,
        productId: product.id,
        orderId,
        status: "active_pending_payment_review",
        startedAt: nowIso,
        expiresAt: entitlementExpiresAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      entitlementResourceType = "subscription";
      entitlementResourceId = null;
    } else if (product.type === "content_pack") {
      entitlementResourceType = "content_pack";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null;
    } else if (product.type === "course") {
      entitlementResourceType = "course";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null;
    } else if (product.type === "content") {
      entitlementResourceType = "content";
      entitlementResourceId = product.targetId;
      entitlementExpiresAt = null;
    } else if (product.type === "special_exam") {
      entitlementResourceType = "special_exam";
      if (this.studyService) {
        const attemptResult = await this.studyService.createSpecialExamAttempt(
          actor,
          (product.metadata?.organizationId as string) || "00000000-0000-0000-0000-000000000001",
          product,
          orderId,
        );
        entitlementResourceId = attemptResult.attempt.id;
      }
      entitlementExpiresAt = null;
    }

    const orderRecord: OrderRecord = {
      id: orderId,
      userId: actor.userId,
      productId: product.id,
      orderNumber,
      amount: product.price,
      currency: product.currency,
      status: "pending",
      metadata: {
        method: "card_to_card",
        trackingNumber,
        sourceCardLast4,
        payerName: input.payerName?.trim() || null,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const paymentRecord: PaymentRecord = {
      id: paymentId,
      orderId,
      userId: actor.userId,
      amount: product.price,
      currency: product.currency,
      gateway: "card_to_card",
      authority: null,
      transactionId: trackingNumber,
      status: "pending_admin_review",
      idempotencyKey: `pay_c2c_${trackingNumber}`,
      rawCallbackMetadata: null,
      paidAt: (() => {
        if (!input.paymentDate) return nowIso;
        const parsed = new Date(input.paymentDate);
        return isNaN(parsed.getTime()) ? nowIso : parsed.toISOString();
      })(),
      trackingNumber,
      sourceCardLast4,
      payerName: input.payerName?.trim() || null,
      receiptUrl: input.receiptUrl?.trim() || null,
      initialValidationResult: {
        amountMatched: true,
        formatValid: true,
        checkedAt: nowIso,
        planTitle: product.title,
        paymentExtraction: input.rawPaymentText
          ? {
              sanitizedPaymentText: sanitizePaymentText(input.rawPaymentText),
              extractionMethod: input.extractionMethod || "manual",
              extractedAt: nowIso,
            }
          : undefined,
      },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const entitlementRecord: UserEntitlementRecord = {
      id: entitlementId,
      userId: actor.userId,
      resourceType: entitlementResourceType,
      resourceId: entitlementResourceId,
      sourceType: "purchase",
      orderId,
      startsAt: nowIso,
      expiresAt: entitlementExpiresAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 9. Execute Atomic Transaction (Order + Payment + Sub? + Entitlement)
    const result = await this.store.submitCardToCardTransaction({
      order: orderRecord,
      payment: paymentRecord,
      subscription: subscriptionRecord,
      entitlement: entitlementRecord,
    });

    // 10. Emit Audit Log
    if (this.auditService) {
      await this.auditService.emit([
        {
          actorId: actor.userId,
          organizationId: null,
          action: "payment.c2c_submitted",
          entityType: "payment",
          entityId: paymentId,
          createdAt: nowIso,
          details: {
            orderId,
            productId: product.id,
            amount: product.price,
            trackingNumber,
            sourceCardLast4,
            expiresAt: entitlementExpiresAt,
            requestId,
          },
        },
      ]);
    }

    return {
      success: true,
      orderId: result.order.id,
      paymentId: result.payment.id,
      subscriptionId: result.subscription?.id,
      status: result.payment.status,
      subscriptionStatus: result.subscription?.status,
      expiresAt: result.subscription?.expiresAt ?? entitlementExpiresAt ?? undefined,
      entitlementId: result.entitlement.id,
      attemptId:
        entitlementResourceType === "special_exam"
          ? (entitlementResourceId ?? undefined)
          : undefined,
      message:
        product.type === "subscription"
          ? "پرداخت شما ثبت شد و اشتراک شما فعال شده است. اطلاعات پرداخت برای بررسی نهایی ارسال شد."
          : "پرداخت شما ثبت شد و دسترسی فعال گردید. اطلاعات پرداخت برای بررسی نهایی ارسال شد.",
    };
  }

  /**
   * Get single payment by ID with authorization checks.
   */
  async getPayment(actor: Actor, paymentId: PaymentId): Promise<PaymentRecord> {
    const payment = await this.store.findPaymentById(paymentId);
    if (!payment) {
      throw new DomainError("not_found", "تراکنش پرداخت یافت نشد.");
    }
    if (actor.role !== "platform_admin" && payment.userId !== actor.userId) {
      throw new DomainError(
        "forbidden",
        "شما اجازه دسترسی به این تراکنش پرداخت را ندارید.",
      );
    }
    return payment;
  }

  /**
   * Get current user's active subscription status.
   */
  async getMySubscription(
    userId: UserId,
  ): Promise<UserSubscriptionRecord | null> {
    return this.store.findActiveSubscription(userId);
  }

  /**
   * Get current user's active entitlements.
   */
  async getMyEntitlements(userId: UserId): Promise<UserEntitlementRecord[]> {
    return this.store.listActiveEntitlements(userId);
  }

  /**
   * Get current user's orders history.
   */
  async getMyOrders(userId: UserId): Promise<OrderRecord[]> {
    return this.store.listOrdersByUser(userId);
  }
}
