/**
 * Commerce Store Interface and Implementations (Drizzle & In-Memory).
 *
 * Handles persistence for:
 * - products
 * - orders
 * - payments
 * - user_subscriptions
 * - user_entitlements
 */

import { eq, and, desc, isNull, or, gt } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  products,
  orders,
  payments,
  userSubscriptions,
  userEntitlements,
} from "@avana/database/schema";
import {
  type OrderId,
  type OrderRecord,
  type PaymentId,
  type PaymentRecord,
  type ProductId,
  type ProductRecord,
  type UserId,
  type UserSubscriptionRecord,
  type UserEntitlementRecord,
  type EntitlementResourceType,
  asOrderId,
  asPaymentId,
  asProductId,
  asUserId,
  asUserSubscriptionId,
  asUserEntitlementId,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

export interface CommerceStore {
  // Products
  findProductById(id: ProductId): Promise<ProductRecord | null>;
  findProductByCode(code: string): Promise<ProductRecord | null>;
  findActiveProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null>;
  findProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null>;
  listActiveProducts(): Promise<ProductRecord[]>;
  createProduct(product: ProductRecord): Promise<ProductRecord>;
  updateProduct(
    id: ProductId,
    patch: Partial<ProductRecord>,
  ): Promise<ProductRecord | null>;

  // Orders
  findOrderById(id: OrderId): Promise<OrderRecord | null>;
  findOrderByNumber(orderNumber: string): Promise<OrderRecord | null>;
  listOrdersByUser(userId: UserId): Promise<OrderRecord[]>;
  createOrder(order: OrderRecord): Promise<OrderRecord>;
  updateOrderStatus(
    id: OrderId,
    status: OrderRecord["status"],
  ): Promise<OrderRecord | null>;

  // Payments
  findPaymentById(id: PaymentId): Promise<PaymentRecord | null>;
  findPaymentByAuthority(authority: string): Promise<PaymentRecord | null>;
  findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  findPaymentByTrackingNumber(trackingNumber: string): Promise<PaymentRecord | null>;
  findPendingCardToCardPaymentByUser(userId: UserId): Promise<PaymentRecord | null>;
  findDuplicateCardToCardPayment(params: {
    trackingNumber: string;
    amount: number;
    sourceCardLast4: string;
  }): Promise<PaymentRecord | null>;
  createPayment(payment: PaymentRecord): Promise<PaymentRecord>;
  updatePayment(
    id: PaymentId,
    updates: Partial<PaymentRecord>,
  ): Promise<PaymentRecord | null>;

  // Subscriptions
  findActiveSubscription(
    userId: UserId,
    referenceDate?: Date,
  ): Promise<UserSubscriptionRecord | null>;
  listSubscriptionsByUser(userId: UserId): Promise<UserSubscriptionRecord[]>;
  createSubscription(
    subscription: UserSubscriptionRecord,
  ): Promise<UserSubscriptionRecord>;

  // Entitlements
  findActiveEntitlement(
    userId: UserId,
    resourceType: EntitlementResourceType,
    resourceId?: string | null,
    referenceDate?: Date,
  ): Promise<UserEntitlementRecord | null>;
  listActiveEntitlements(
    userId: UserId,
    referenceDate?: Date,
  ): Promise<UserEntitlementRecord[]>;
  grantEntitlement(
    entitlement: UserEntitlementRecord,
  ): Promise<UserEntitlementRecord>;

  // Atomic completion transaction
  completePaymentTransaction(params: {
    paymentId: PaymentId;
    orderId: OrderId;
    transactionId: string;
    paidAt: string;
    rawMetadata?: Record<string, unknown>;
    subscriptionToCreate?: UserSubscriptionRecord;
    entitlementToCreate: UserEntitlementRecord;
  }): Promise<{
    payment: PaymentRecord;
    order: OrderRecord;
    subscription?: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }>;

  // Atomic Card-to-Card submission transaction
  submitCardToCardTransaction(params: {
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }): Promise<{
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }>;
}

// ---------------------------------------------------------------------------
// Drizzle Implementation
// ---------------------------------------------------------------------------

export class DrizzleCommerceStore implements CommerceStore {
  constructor(private readonly db: DbClient) {}

  // --- Products ---

  async findProductById(id: ProductId): Promise<ProductRecord | null> {
    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);
    return rows[0] ? this.mapProduct(rows[0]) : null;
  }

  async findProductByCode(code: string): Promise<ProductRecord | null> {
    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.code, code), isNull(products.deletedAt)))
      .limit(1);
    return rows[0] ? this.mapProduct(rows[0]) : null;
  }

  async findActiveProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null> {
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.targetType, targetType),
          eq(products.targetId, targetId),
          eq(products.active, true),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ? this.mapProduct(rows[0]) : null;
  }

  async findProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null> {
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.targetType, targetType),
          eq(products.targetId, targetId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ? this.mapProduct(rows[0]) : null;
  }

  async listActiveProducts(): Promise<ProductRecord[]> {
    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.active, true), isNull(products.deletedAt)))
      .orderBy(products.price);
    return rows.map((r) => this.mapProduct(r));
  }

  async createProduct(product: ProductRecord): Promise<ProductRecord> {
    const rows = await this.db
      .insert(products)
      .values({
        id: product.id,
        code: product.code,
        type: product.type,
        title: product.title,
        description: product.description,
        price: product.price,
        currency: product.currency,
        targetType: product.targetType,
        targetId: product.targetId,
        durationDays: product.durationDays,
        active: product.active,
        metadata: product.metadata,
        createdAt: new Date(product.createdAt),
        updatedAt: new Date(product.updatedAt),
      })
      .returning();
    return this.mapProduct(rows[0]);
  }

  async updateProduct(
    id: ProductId,
    patch: Partial<ProductRecord>,
  ): Promise<ProductRecord | null> {
    const setFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.price !== undefined) setFields.price = patch.price;
    if (patch.currency !== undefined) setFields.currency = patch.currency;
    if (patch.title !== undefined) setFields.title = patch.title;
    if (patch.description !== undefined) setFields.description = patch.description;
    if (patch.active !== undefined) setFields.active = patch.active;
    if (patch.metadata !== undefined) setFields.metadata = patch.metadata;

    const rows = await this.db
      .update(products)
      .set(setFields)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .returning();

    return rows[0] ? this.mapProduct(rows[0]) : null;
  }

  // --- Orders ---

  async findOrderById(id: OrderId): Promise<OrderRecord | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return rows[0] ? this.mapOrder(rows[0]) : null;
  }

  async findOrderByNumber(orderNumber: string): Promise<OrderRecord | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return rows[0] ? this.mapOrder(rows[0]) : null;
  }

  async listOrdersByUser(userId: UserId): Promise<OrderRecord[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
    return rows.map((r) => this.mapOrder(r));
  }

  async createOrder(order: OrderRecord): Promise<OrderRecord> {
    const rows = await this.db
      .insert(orders)
      .values({
        id: order.id,
        userId: order.userId,
        productId: order.productId,
        orderNumber: order.orderNumber,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        metadata: order.metadata,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt),
      })
      .returning();
    return this.mapOrder(rows[0]);
  }

  async updateOrderStatus(
    id: OrderId,
    status: OrderRecord["status"],
  ): Promise<OrderRecord | null> {
    const rows = await this.db
      .update(orders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();
    return rows[0] ? this.mapOrder(rows[0]) : null;
  }

  // --- Payments ---

  async findPaymentById(id: PaymentId): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findPaymentByAuthority(authority: string): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.authority, authority))
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findPaymentByIdempotencyKey(
    key: string,
  ): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, key))
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findPaymentByTrackingNumber(
    trackingNumber: string,
  ): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.trackingNumber, trackingNumber))
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findPendingCardToCardPaymentByUser(
    userId: UserId,
  ): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          eq(payments.gateway, "card_to_card"),
          eq(payments.status, "pending_admin_review"),
        ),
      )
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async findDuplicateCardToCardPayment(params: {
    trackingNumber: string;
    amount: number;
    sourceCardLast4: string;
  }): Promise<PaymentRecord | null> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.trackingNumber, params.trackingNumber),
          eq(payments.amount, params.amount),
          eq(payments.sourceCardLast4, params.sourceCardLast4),
        ),
      )
      .limit(1);
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    const rows = await this.db
      .insert(payments)
      .values({
        id: payment.id,
        orderId: payment.orderId,
        userId: payment.userId,
        amount: payment.amount,
        currency: payment.currency,
        gateway: payment.gateway,
        authority: payment.authority,
        transactionId: payment.transactionId,
        status: payment.status,
        idempotencyKey: payment.idempotencyKey,
        rawCallbackMetadata: payment.rawCallbackMetadata,
        paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
        trackingNumber: payment.trackingNumber,
        sourceCardLast4: payment.sourceCardLast4,
        payerName: payment.payerName,
        receiptUrl: payment.receiptUrl,
        initialValidationResult: payment.initialValidationResult,
        rejectionReason: payment.rejectionReason,
        reviewedAt: payment.reviewedAt ? new Date(payment.reviewedAt) : null,
        reviewedBy: payment.reviewedBy,
        createdAt: new Date(payment.createdAt),
        updatedAt: new Date(payment.updatedAt),
      })
      .returning();
    return this.mapPayment(rows[0]);
  }

  async updatePayment(
    id: PaymentId,
    updates: Partial<PaymentRecord>,
  ): Promise<PaymentRecord | null> {
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (updates.status !== undefined) values.status = updates.status;
    if (updates.authority !== undefined) values.authority = updates.authority;
    if (updates.transactionId !== undefined)
      values.transactionId = updates.transactionId;
    if (updates.rawCallbackMetadata !== undefined)
      values.rawCallbackMetadata = updates.rawCallbackMetadata;
    if (updates.paidAt !== undefined)
      values.paidAt = updates.paidAt ? new Date(updates.paidAt) : null;
    if (updates.trackingNumber !== undefined)
      values.trackingNumber = updates.trackingNumber;
    if (updates.sourceCardLast4 !== undefined)
      values.sourceCardLast4 = updates.sourceCardLast4;
    if (updates.payerName !== undefined) values.payerName = updates.payerName;
    if (updates.receiptUrl !== undefined) values.receiptUrl = updates.receiptUrl;
    if (updates.initialValidationResult !== undefined)
      values.initialValidationResult = updates.initialValidationResult;
    if (updates.rejectionReason !== undefined)
      values.rejectionReason = updates.rejectionReason;
    if (updates.reviewedAt !== undefined)
      values.reviewedAt = updates.reviewedAt
        ? new Date(updates.reviewedAt)
        : null;
    if (updates.reviewedBy !== undefined)
      values.reviewedBy = updates.reviewedBy;

    const rows = await this.db
      .update(payments)
      .set(values)
      .where(eq(payments.id, id))
      .returning();
    return rows[0] ? this.mapPayment(rows[0]) : null;
  }

  // --- Subscriptions ---

  async findActiveSubscription(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<UserSubscriptionRecord | null> {
    const rows = await this.db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          or(
            eq(userSubscriptions.status, "active"),
            eq(userSubscriptions.status, "active_pending_payment_review"),
          ),
          gt(userSubscriptions.expiresAt, referenceDate),
        ),
      )
      .orderBy(desc(userSubscriptions.expiresAt))
      .limit(1);
    return rows[0] ? this.mapSubscription(rows[0]) : null;
  }

  async listSubscriptionsByUser(
    userId: UserId,
  ): Promise<UserSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt));
    return rows.map((r) => this.mapSubscription(r));
  }

  async createSubscription(
    sub: UserSubscriptionRecord,
  ): Promise<UserSubscriptionRecord> {
    const rows = await this.db
      .insert(userSubscriptions)
      .values({
        id: sub.id,
        userId: sub.userId,
        productId: sub.productId,
        orderId: sub.orderId,
        status: sub.status,
        startedAt: new Date(sub.startedAt),
        expiresAt: new Date(sub.expiresAt),
        createdAt: new Date(sub.createdAt),
        updatedAt: new Date(sub.updatedAt),
      })
      .returning();
    return this.mapSubscription(rows[0]);
  }

  // --- Entitlements ---

  async findActiveEntitlement(
    userId: UserId,
    resourceType: EntitlementResourceType,
    resourceId?: string | null,
    referenceDate: Date = new Date(),
  ): Promise<UserEntitlementRecord | null> {
    const whereConditions = [
      eq(userEntitlements.userId, userId),
      eq(userEntitlements.resourceType, resourceType),
      or(
        isNull(userEntitlements.expiresAt),
        gt(userEntitlements.expiresAt, referenceDate),
      ),
    ];

    if (resourceId) {
      whereConditions.push(eq(userEntitlements.resourceId, resourceId));
    } else if (resourceType === "subscription") {
      whereConditions.push(isNull(userEntitlements.resourceId));
    }

    const rows = await this.db
      .select()
      .from(userEntitlements)
      .where(and(...whereConditions))
      .orderBy(desc(userEntitlements.createdAt))
      .limit(1);

    return rows[0] ? this.mapEntitlement(rows[0]) : null;
  }

  async listActiveEntitlements(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<UserEntitlementRecord[]> {
    const rows = await this.db
      .select()
      .from(userEntitlements)
      .where(
        and(
          eq(userEntitlements.userId, userId),
          or(
            isNull(userEntitlements.expiresAt),
            gt(userEntitlements.expiresAt, referenceDate),
          ),
        ),
      )
      .orderBy(desc(userEntitlements.createdAt));
    return rows.map((r) => this.mapEntitlement(r));
  }

  async grantEntitlement(
    ent: UserEntitlementRecord,
  ): Promise<UserEntitlementRecord> {
    // Idempotent grant using ON CONFLICT DO NOTHING / UPDATE
    const rows = await this.db
      .insert(userEntitlements)
      .values({
        id: ent.id,
        userId: ent.userId,
        resourceType: ent.resourceType,
        resourceId: ent.resourceId,
        sourceType: ent.sourceType,
        orderId: ent.orderId,
        startsAt: new Date(ent.startsAt),
        expiresAt: ent.expiresAt ? new Date(ent.expiresAt) : null,
        createdAt: new Date(ent.createdAt),
        updatedAt: new Date(ent.updatedAt),
      })
      .onConflictDoNothing()
      .returning();

    if (rows[0]) {
      return this.mapEntitlement(rows[0]);
    }

    // If duplicate lifetime entitlement existed, return existing record
    const existing = await this.findActiveEntitlement(
      ent.userId,
      ent.resourceType,
      ent.resourceId,
    );
    if (!existing) {
      throw new Error("Failed to grant entitlement");
    }
    return existing;
  }

  // --- Complete Payment Transaction (Atomic) ---

  async completePaymentTransaction(params: {
    paymentId: PaymentId;
    orderId: OrderId;
    transactionId: string;
    paidAt: string;
    rawMetadata?: Record<string, unknown>;
    subscriptionToCreate?: UserSubscriptionRecord;
    entitlementToCreate: UserEntitlementRecord;
  }): Promise<{
    payment: PaymentRecord;
    order: OrderRecord;
    subscription?: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }> {
    return this.db.transaction(async (tx) => {
      // 1. Update payment to paid
      const updatedPaymentRows = await tx
        .update(payments)
        .set({
          status: "paid",
          transactionId: params.transactionId,
          paidAt: new Date(params.paidAt),
          rawCallbackMetadata: params.rawMetadata ?? {},
          updatedAt: new Date(),
        })
        .where(eq(payments.id, params.paymentId))
        .returning();

      // 2. Update order to paid
      const updatedOrderRows = await tx
        .update(orders)
        .set({
          status: "paid",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, params.orderId))
        .returning();

      // 3. Create user subscription business record if applicable
      let createdSub: UserSubscriptionRecord | undefined;
      if (params.subscriptionToCreate) {
        const subRows = await tx
          .insert(userSubscriptions)
          .values({
            id: params.subscriptionToCreate.id,
            userId: params.subscriptionToCreate.userId,
            productId: params.subscriptionToCreate.productId,
            orderId: params.subscriptionToCreate.orderId,
            status: params.subscriptionToCreate.status,
            startedAt: new Date(params.subscriptionToCreate.startedAt),
            expiresAt: new Date(params.subscriptionToCreate.expiresAt),
            createdAt: new Date(params.subscriptionToCreate.createdAt),
            updatedAt: new Date(params.subscriptionToCreate.updatedAt),
          })
          .returning();
        createdSub = this.mapSubscription(subRows[0]);
      }

      // 4. Grant runtime entitlement
      const ent = params.entitlementToCreate;
      const entRows = await tx
        .insert(userEntitlements)
        .values({
          id: ent.id,
          userId: ent.userId,
          resourceType: ent.resourceType,
          resourceId: ent.resourceId,
          sourceType: ent.sourceType,
          orderId: ent.orderId,
          startsAt: new Date(ent.startsAt),
          expiresAt: ent.expiresAt ? new Date(ent.expiresAt) : null,
          createdAt: new Date(ent.createdAt),
          updatedAt: new Date(ent.updatedAt),
        })
        .onConflictDoNothing()
        .returning();

      let createdEnt: UserEntitlementRecord;
      if (entRows[0]) {
        createdEnt = this.mapEntitlement(entRows[0]);
      } else {
        const existingRows = await tx
          .select()
          .from(userEntitlements)
          .where(
            and(
              eq(userEntitlements.userId, ent.userId),
              eq(userEntitlements.resourceType, ent.resourceType),
              ent.resourceId
                ? eq(userEntitlements.resourceId, ent.resourceId)
                : isNull(userEntitlements.resourceId),
            ),
          )
          .limit(1);
        createdEnt = this.mapEntitlement(existingRows[0]);
      }

      return {
        payment: this.mapPayment(updatedPaymentRows[0]),
        order: this.mapOrder(updatedOrderRows[0]),
        subscription: createdSub,
        entitlement: createdEnt,
      };
    });
  }

  // --- Submit Card-to-Card Transaction (Atomic) ---

  async submitCardToCardTransaction(params: {
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }): Promise<{
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }> {
    return this.db.transaction(async (tx) => {
      // 1. Insert Order
      const [createdOrder] = await tx
        .insert(orders)
        .values({
          id: params.order.id,
          userId: params.order.userId,
          productId: params.order.productId,
          orderNumber: params.order.orderNumber,
          amount: params.order.amount,
          currency: params.order.currency,
          status: params.order.status,
          metadata: params.order.metadata,
          createdAt: new Date(params.order.createdAt),
          updatedAt: new Date(params.order.updatedAt),
        })
        .returning();

      // 2. Insert Payment
      const [createdPayment] = await tx
        .insert(payments)
        .values({
          id: params.payment.id,
          orderId: params.payment.orderId,
          userId: params.payment.userId,
          amount: params.payment.amount,
          currency: params.payment.currency,
          gateway: params.payment.gateway,
          authority: params.payment.authority,
          transactionId: params.payment.transactionId,
          status: params.payment.status,
          idempotencyKey: params.payment.idempotencyKey,
          rawCallbackMetadata: params.payment.rawCallbackMetadata,
          paidAt: params.payment.paidAt ? new Date(params.payment.paidAt) : null,
          trackingNumber: params.payment.trackingNumber,
          sourceCardLast4: params.payment.sourceCardLast4,
          payerName: params.payment.payerName,
          receiptUrl: params.payment.receiptUrl,
          initialValidationResult: params.payment.initialValidationResult,
          rejectionReason: params.payment.rejectionReason,
          reviewedAt: params.payment.reviewedAt
            ? new Date(params.payment.reviewedAt)
            : null,
          reviewedBy: params.payment.reviewedBy,
          createdAt: new Date(params.payment.createdAt),
          updatedAt: new Date(params.payment.updatedAt),
        })
        .returning();

      // 3. Insert Subscription (status: active_pending_payment_review)
      const [createdSub] = await tx
        .insert(userSubscriptions)
        .values({
          id: params.subscription.id,
          userId: params.subscription.userId,
          productId: params.subscription.productId,
          orderId: params.subscription.orderId,
          status: params.subscription.status,
          startedAt: new Date(params.subscription.startedAt),
          expiresAt: new Date(params.subscription.expiresAt),
          createdAt: new Date(params.subscription.createdAt),
          updatedAt: new Date(params.subscription.updatedAt),
        })
        .returning();

      // 4. Grant Entitlement
      const ent = params.entitlement;
      const [createdEnt] = await tx
        .insert(userEntitlements)
        .values({
          id: ent.id,
          userId: ent.userId,
          resourceType: ent.resourceType,
          resourceId: ent.resourceId,
          sourceType: ent.sourceType,
          orderId: ent.orderId,
          startsAt: new Date(ent.startsAt),
          expiresAt: ent.expiresAt ? new Date(ent.expiresAt) : null,
          createdAt: new Date(ent.createdAt),
          updatedAt: new Date(ent.updatedAt),
        })
        .onConflictDoNothing()
        .returning();

      let finalEnt: UserEntitlementRecord;
      if (createdEnt) {
        finalEnt = this.mapEntitlement(createdEnt);
      } else {
        const existingRows = await tx
          .select()
          .from(userEntitlements)
          .where(
            and(
              eq(userEntitlements.userId, ent.userId),
              eq(userEntitlements.resourceType, ent.resourceType),
              isNull(userEntitlements.resourceId),
            ),
          )
          .limit(1);
        finalEnt = this.mapEntitlement(existingRows[0]);
      }

      return {
        order: this.mapOrder(createdOrder),
        payment: this.mapPayment(createdPayment),
        subscription: this.mapSubscription(createdSub),
        entitlement: finalEnt,
      };
    });
  }

  // --- Mappers ---

  private mapProduct(row: typeof products.$inferSelect): ProductRecord {
    return {
      id: asProductId(row.id as any),
      code: row.code,
      type: row.type as any,
      title: row.title,
      description: row.description,
      price: row.price,
      currency: row.currency,
      targetType: row.targetType as any,
      targetId: row.targetId,
      durationDays: row.durationDays,
      active: row.active,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
  }

  private mapOrder(row: typeof orders.$inferSelect): OrderRecord {
    return {
      id: asOrderId(row.id as any),
      userId: asUserId(row.userId as any),
      productId: asProductId(row.productId as any),
      orderNumber: row.orderNumber,
      amount: row.amount,
      currency: row.currency,
      status: row.status as any,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPayment(row: typeof payments.$inferSelect): PaymentRecord {
    return {
      id: asPaymentId(row.id as any),
      orderId: asOrderId(row.orderId as any),
      userId: asUserId(row.userId as any),
      amount: row.amount,
      currency: row.currency,
      gateway: row.gateway,
      authority: row.authority,
      transactionId: row.transactionId,
      status: row.status as any,
      idempotencyKey: row.idempotencyKey,
      rawCallbackMetadata:
        (row.rawCallbackMetadata as Record<string, unknown>) ?? null,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      trackingNumber: row.trackingNumber ?? null,
      sourceCardLast4: row.sourceCardLast4 ?? null,
      payerName: row.payerName ?? null,
      receiptUrl: row.receiptUrl ?? null,
      initialValidationResult:
        (row.initialValidationResult as Record<string, unknown>) ?? null,
      rejectionReason: row.rejectionReason ?? null,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      reviewedBy: row.reviewedBy ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapSubscription(
    row: typeof userSubscriptions.$inferSelect,
  ): UserSubscriptionRecord {
    return {
      id: asUserSubscriptionId(row.id as any),
      userId: asUserId(row.userId as any),
      productId: asProductId(row.productId as any),
      orderId: row.orderId ? asOrderId(row.orderId as any) : null,
      status: row.status as any,
      startedAt: row.startedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapEntitlement(
    row: typeof userEntitlements.$inferSelect,
  ): UserEntitlementRecord {
    return {
      id: asUserEntitlementId(row.id as any),
      userId: asUserId(row.userId as any),
      resourceType: row.resourceType as any,
      resourceId: row.resourceId,
      sourceType: row.sourceType as any,
      orderId: row.orderId ? asOrderId(row.orderId as any) : null,
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// In-Memory Implementation for Fast Unit & Integration Testing
// ---------------------------------------------------------------------------

export class InMemoryCommerceStore implements CommerceStore {
  public products: ProductRecord[] = [];
  public orders: OrderRecord[] = [];
  public payments: PaymentRecord[] = [];
  public subscriptions: UserSubscriptionRecord[] = [];
  public entitlements: UserEntitlementRecord[] = [];

  constructor() {
    // Seed default subscription plans
    this.products = [
      {
        id: asProductId("11111111-1111-4111-8111-111111111111" as any),
        code: "sub_monthly",
        type: "subscription",
        title: "اشتراک ماهانه آوانا",
        description: "دسترسی کامل یک‌ماهه به تمام محتوای ویژه",
        price: 99000,
        currency: "toman",
        targetType: "plan",
        targetId: null,
        durationDays: 30,
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      {
        id: asProductId("22222222-2222-4222-8222-222222222222" as any),
        code: "sub_quarterly",
        type: "subscription",
        title: "اشتراک سه‌ماهه آوانا",
        description: "دسترسی کامل سه‌ماهه به تمام محتوای ویژه",
        price: 199000,
        currency: "toman",
        targetType: "plan",
        targetId: null,
        durationDays: 90,
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      {
        id: asProductId("33333333-3333-4333-8333-333333333333" as any),
        code: "sub_yearly",
        type: "subscription",
        title: "اشتراک سالانه آوانا",
        description: "دسترسی کامل دوازده‌ماهه به تمام محتوای ویژه",
        price: 599000,
        currency: "toman",
        targetType: "plan",
        targetId: null,
        durationDays: 365,
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    ];
  }

  // --- Products ---

  async findProductById(id: ProductId): Promise<ProductRecord | null> {
    const p = this.products.find((x) => x.id === id && x.deletedAt === null);
    return p ? { ...p } : null;
  }

  async findProductByCode(code: string): Promise<ProductRecord | null> {
    const p = this.products.find(
      (x) => x.code === code && x.deletedAt === null,
    );
    return p ? { ...p } : null;
  }

  async findActiveProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null> {
    const p = this.products.find(
      (x) =>
        x.targetType === targetType &&
        x.targetId === targetId &&
        x.active &&
        x.deletedAt === null,
    );
    return p ? { ...p } : null;
  }

  async findProductByTarget(
    targetType: string,
    targetId: string,
  ): Promise<ProductRecord | null> {
    const p = this.products.find(
      (x) =>
        x.targetType === targetType &&
        x.targetId === targetId &&
        x.deletedAt === null,
    );
    return p ? { ...p } : null;
  }

  async listActiveProducts(): Promise<ProductRecord[]> {
    return this.products
      .filter((x) => x.active && x.deletedAt === null)
      .map((p) => ({ ...p }));
  }

  async createProduct(product: ProductRecord): Promise<ProductRecord> {
    this.products.push({ ...product });
    return { ...product };
  }

  async updateProduct(
    id: ProductId,
    patch: Partial<ProductRecord>,
  ): Promise<ProductRecord | null> {
    const idx = this.products.findIndex(
      (x) => x.id === id && x.deletedAt === null,
    );
    if (idx === -1) return null;
    const now = new Date().toISOString();
    this.products[idx] = {
      ...this.products[idx],
      ...patch,
      updatedAt: now,
    };
    return { ...this.products[idx] };
  }

  // --- Orders ---

  async findOrderById(id: OrderId): Promise<OrderRecord | null> {
    const o = this.orders.find((x) => x.id === id);
    return o ? { ...o } : null;
  }

  async findOrderByNumber(orderNumber: string): Promise<OrderRecord | null> {
    const o = this.orders.find((x) => x.orderNumber === orderNumber);
    return o ? { ...o } : null;
  }

  async listOrdersByUser(userId: UserId): Promise<OrderRecord[]> {
    return this.orders.filter((x) => x.userId === userId).map((o) => ({ ...o }));
  }

  async createOrder(order: OrderRecord): Promise<OrderRecord> {
    this.orders.push({ ...order });
    return { ...order };
  }

  async updateOrderStatus(
    id: OrderId,
    status: OrderRecord["status"],
  ): Promise<OrderRecord | null> {
    const o = this.orders.find((x) => x.id === id);
    if (!o) return null;
    o.status = status;
    o.updatedAt = new Date().toISOString();
    return { ...o };
  }

  // --- Payments ---

  async findPaymentById(id: PaymentId): Promise<PaymentRecord | null> {
    const p = this.payments.find((x) => x.id === id);
    return p ? { ...p } : null;
  }

  async findPaymentByAuthority(authority: string): Promise<PaymentRecord | null> {
    const p = this.payments.find((x) => x.authority === authority);
    return p ? { ...p } : null;
  }

  async findPaymentByIdempotencyKey(
    key: string,
  ): Promise<PaymentRecord | null> {
    const p = this.payments.find((x) => x.idempotencyKey === key);
    return p ? { ...p } : null;
  }

  async findPaymentByTrackingNumber(
    trackingNumber: string,
  ): Promise<PaymentRecord | null> {
    const p = this.payments.find((x) => x.trackingNumber === trackingNumber);
    return p ? { ...p } : null;
  }

  async findPendingCardToCardPaymentByUser(
    userId: UserId,
  ): Promise<PaymentRecord | null> {
    const p = this.payments.find(
      (x) =>
        x.userId === userId &&
        x.gateway === "card_to_card" &&
        x.status === "pending_admin_review",
    );
    return p ? { ...p } : null;
  }

  async findDuplicateCardToCardPayment(params: {
    trackingNumber: string;
    amount: number;
    sourceCardLast4: string;
  }): Promise<PaymentRecord | null> {
    const p = this.payments.find(
      (x) =>
        x.trackingNumber === params.trackingNumber &&
        x.amount === params.amount &&
        x.sourceCardLast4 === params.sourceCardLast4,
    );
    return p ? { ...p } : null;
  }

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    this.payments.push({ ...payment });
    return { ...payment };
  }

  async updatePayment(
    id: PaymentId,
    updates: Partial<PaymentRecord>,
  ): Promise<PaymentRecord | null> {
    const p = this.payments.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, updates, { updatedAt: new Date().toISOString() });
    return { ...p };
  }

  // --- Subscriptions ---

  async findActiveSubscription(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<UserSubscriptionRecord | null> {
    const active = this.subscriptions.filter(
      (s) =>
        s.userId === userId &&
        (s.status === "active" ||
          s.status === "active_pending_payment_review") &&
        new Date(s.expiresAt).getTime() > referenceDate.getTime(),
    );
    active.sort(
      (a, b) =>
        new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
    );
    return active[0] ? { ...active[0] } : null;
  }

  async listSubscriptionsByUser(
    userId: UserId,
  ): Promise<UserSubscriptionRecord[]> {
    return this.subscriptions
      .filter((s) => s.userId === userId)
      .map((s) => ({ ...s }));
  }

  async createSubscription(
    subscription: UserSubscriptionRecord,
  ): Promise<UserSubscriptionRecord> {
    this.subscriptions.push({ ...subscription });
    return { ...subscription };
  }

  // --- Entitlements ---

  async findActiveEntitlement(
    userId: UserId,
    resourceType: EntitlementResourceType,
    resourceId?: string | null,
    referenceDate: Date = new Date(),
  ): Promise<UserEntitlementRecord | null> {
    const active = this.entitlements.filter((e) => {
      if (e.userId !== userId || e.resourceType !== resourceType) return false;
      if (resourceId && e.resourceId !== resourceId) return false;
      if (resourceType === "subscription" && e.resourceId !== null) return false;
      if (
        e.expiresAt !== null &&
        new Date(e.expiresAt).getTime() <= referenceDate.getTime()
      ) {
        return false;
      }
      return true;
    });
    return active[0] ? { ...active[0] } : null;
  }

  async listActiveEntitlements(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<UserEntitlementRecord[]> {
    return this.entitlements
      .filter((e) => {
        if (e.userId !== userId) return false;
        if (
          e.expiresAt !== null &&
          new Date(e.expiresAt).getTime() <= referenceDate.getTime()
        ) {
          return false;
        }
        return true;
      })
      .map((e) => ({ ...e }));
  }

  async grantEntitlement(
    entitlement: UserEntitlementRecord,
  ): Promise<UserEntitlementRecord> {
    const existing = await this.findActiveEntitlement(
      entitlement.userId,
      entitlement.resourceType,
      entitlement.resourceId,
    );
    if (existing && existing.expiresAt === null && entitlement.expiresAt === null) {
      return { ...existing };
    }
    this.entitlements.push({ ...entitlement });
    return { ...entitlement };
  }

  async completePaymentTransaction(params: {
    paymentId: PaymentId;
    orderId: OrderId;
    transactionId: string;
    paidAt: string;
    rawMetadata?: Record<string, unknown>;
    subscriptionToCreate?: UserSubscriptionRecord;
    entitlementToCreate: UserEntitlementRecord;
  }): Promise<{
    payment: PaymentRecord;
    order: OrderRecord;
    subscription?: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }> {
    const payment = await this.updatePayment(params.paymentId, {
      status: "paid",
      transactionId: params.transactionId,
      paidAt: params.paidAt,
      rawCallbackMetadata: params.rawMetadata ?? null,
    });
    const order = await this.updateOrderStatus(params.orderId, "paid");

    let sub: UserSubscriptionRecord | undefined;
    if (params.subscriptionToCreate) {
      sub = await this.createSubscription(params.subscriptionToCreate);
    }

    const ent = await this.grantEntitlement(params.entitlementToCreate);

    return {
      payment: payment!,
      order: order!,
      subscription: sub,
      entitlement: ent,
    };
  }

  async submitCardToCardTransaction(params: {
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }): Promise<{
    order: OrderRecord;
    payment: PaymentRecord;
    subscription: UserSubscriptionRecord;
    entitlement: UserEntitlementRecord;
  }> {
    const order = await this.createOrder(params.order);
    const payment = await this.createPayment(params.payment);
    const subscription = await this.createSubscription(params.subscription);
    const entitlement = await this.grantEntitlement(params.entitlement);

    return {
      order,
      payment,
      subscription,
      entitlement,
    };
  }
}
