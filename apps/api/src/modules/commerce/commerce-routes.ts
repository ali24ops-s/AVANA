/**
 * Commerce HTTP Routes.
 *
 * Endpoints:
 * - GET  /v1/commerce/products            → List all active products (subscription plans, etc.)
 * - GET  /v1/commerce/products/:productId → Get single product
 * - POST /v1/commerce/checkout            → Initiate order & payment
 * - GET  /v1/commerce/callback            → Gateway callback handler
 * - POST /v1/commerce/verify              → Manual or programmatic payment verification
 * - GET  /v1/commerce/access/check        → Query centralized access check
 * - GET  /v1/commerce/subscriptions/my    → Get current user's active subscription
 * - GET  /v1/commerce/entitlements/my     → Get current user's entitlements
 */

import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type CheckAccessInput,
  type CardToCardInfoResponse,
  DomainError,
  parseProductId,
  parsePaymentId,
} from "@avana/domain";
import { CommerceService } from "./commerce-service.js";
import { EntitlementService } from "./entitlement-service.js";
import { PaymentInfoExtractionService } from "./payment-extraction-service.js";
import type { CommerceStore } from "./commerce-store.js";
import type { PaymentGateway } from "./gateway/types.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { UserStore } from "../identity/user-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type {
  LessonStore,
  ModuleStore,
  DocumentStore,
} from "../learning/learning-store.js";
import type { FlashcardStore, QuizStore } from "../study/study-store.js";
import type { ContentPackStore } from "../library/library-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface CommerceRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: UserStore;
  commerceStore: CommerceStore;
  gateway: PaymentGateway;
  modelGateway?: ModelGateway;
  paymentExtractionService?: PaymentInfoExtractionService;
  courseStore?: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  documentStore?: DocumentStore;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  contentPackStore?: ContentPackStore;
  auditService?: AuditService;
  cardToCardConfig?: CardToCardInfoResponse;
  onlinePaymentEnabled?: boolean;
  mockPaymentEnabled?: boolean;
}

export const commerceRoutes: FastifyPluginAsync<CommerceRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    commerceStore,
    gateway,
    courseStore,
    moduleStore,
    lessonStore,
    documentStore,
    flashcardStore,
    quizStore,
    contentPackStore,
    auditService,
    cardToCardConfig,
    onlinePaymentEnabled,
    mockPaymentEnabled,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  const commerceService = new CommerceService(
    commerceStore,
    gateway,
    userStore,
    auditService,
    contentPackStore,
    cardToCardConfig,
    lessonStore,
    {
      onlinePaymentEnabled,
      mockPaymentEnabled,
    },
  );

  const paymentExtractionService =
    opts.paymentExtractionService ??
    new PaymentInfoExtractionService(
      opts.modelGateway,
      cardToCardConfig?.destinationCardNumber,
    );

  const entitlementService = new EntitlementService({
    commerceStore,
    courseStore,
    moduleStore,
    lessonStore,
    documentStore,
    flashcardStore,
    quizStore,
    contentPackStore,
  });

  /** Helper to extract actor from authenticated request. */
  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
    };
  }

  // -------------------------------------------------------------------------
  // GET /v1/commerce/products — List all active products
  // -------------------------------------------------------------------------
  app.get("/v1/commerce/products", async (_request, _reply) => {
    const products = await commerceService.listActiveProducts();
    return {
      items: products.map((p) => ({
        id: p.id,
        code: p.code,
        type: p.type,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        target_type: p.targetType,
        target_id: p.targetId,
        duration_days: p.durationDays,
        metadata: p.metadata,
      })),
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/commerce/products/:productId — Get single product
  // -------------------------------------------------------------------------
  app.get("/v1/commerce/products/:productId", async (request, _reply) => {
    const params = request.params as { productId: string };
    const productId = parseProductId(params.productId, "productId");
    const p = await commerceService.getProduct(productId);

    return {
      product: {
        id: p.id,
        code: p.code,
        type: p.type,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency,
        target_type: p.targetType,
        target_id: p.targetId,
        duration_days: p.durationDays,
        metadata: p.metadata,
      },
    };
  });

  // -------------------------------------------------------------------------
  // POST /v1/commerce/checkout — Initiate checkout
  // -------------------------------------------------------------------------
  app.post(
    "/v1/commerce/checkout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = (request.body ?? {}) as {
        product_id?: string;
        productId?: string;
        callback_url?: string;
        callbackUrl?: string;
        gateway?: string;
      };

      const rawProductId = body.product_id ?? body.productId;
      if (!rawProductId) {
        throw new DomainError("bad_request", "شناسه محصول (product_id) الزامی است.");
      }
      const productId = parseProductId(rawProductId, "product_id");

      const defaultCallback =
        body.callback_url ??
        body.callbackUrl ??
        "http://localhost:5173/checkout/callback";

      const result = await commerceService.checkout(
        actor,
        {
          productId,
          callbackUrl: defaultCallback,
          gateway: body.gateway,
        },
        request.id,
      );

      reply.code(201);
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/callback — Gateway callback handler
  // -------------------------------------------------------------------------
  app.get("/v1/commerce/callback", async (request, _reply) => {
    const query = (request.query ?? {}) as {
      Authority?: string;
      authority?: string;
      Status?: string;
      status?: string;
    };

    const authority = query.Authority ?? query.authority;
    const status = query.Status ?? query.status;

    if (!authority) {
      throw new DomainError("bad_request", "پارامتر Authority الزامی است.");
    }

    const result = await commerceService.verifyPayment(
      {
        authority,
        status,
      },
      request.id,
    );

    return result;
  });

  // -------------------------------------------------------------------------
  // POST /v1/commerce/verify — Explicit verify endpoint
  // -------------------------------------------------------------------------
  app.post(
    "/v1/commerce/verify",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const body = (request.body ?? {}) as {
        authority?: string;
        status?: string;
      };

      if (!body.authority) {
        throw new DomainError("bad_request", "شناسه Authority الزامی است.");
      }

      return commerceService.verifyPayment(
        {
          authority: body.authority,
          status: body.status,
        },
        request.id,
      );
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/card-to-card/info — Card-to-Card Destination Details
  // -------------------------------------------------------------------------
  app.get("/v1/commerce/card-to-card/info", async (_request, reply) => {
    const info = commerceService.getCardToCardInfo();
    return reply.send(info);
  });

  // -------------------------------------------------------------------------
  // POST /v1/commerce/card-to-card/extract — Extract Payment Details (Read-Only)
  // -------------------------------------------------------------------------
  app.post("/v1/commerce/card-to-card/extract", async (request, reply) => {
    const body = (request.body ?? {}) as {
      text?: string;
      payment_text?: string;
      paymentText?: string;
      product_id?: string;
      productId?: string;
      use_ai_fallback?: boolean;
      useAiFallback?: boolean;
    };

    const rawText = body.text ?? body.payment_text ?? body.paymentText ?? "";
    const rawProductId = body.product_id ?? body.productId;
    const useAiFallback = body.use_ai_fallback ?? body.useAiFallback ?? true;

    let expectedAmount: number | undefined;
    if (rawProductId) {
      try {
        const prodId = parseProductId(rawProductId, "product_id");
        const product = await commerceService.getProduct(prodId);
        expectedAmount = product.price;
      } catch {
        // Ignore product lookup error during extraction
      }
    }

    const extractionResult = await paymentExtractionService.extract(rawText, {
      expectedAmount,
      useAiFallback,
      correlationId: request.id,
    });

    return reply.send(extractionResult);
  });

  // -------------------------------------------------------------------------
  // POST /v1/commerce/payments/card-to-card (and alias /v1/commerce/card-to-card/submit)
  // -------------------------------------------------------------------------
  for (const routePath of [
    "/v1/commerce/payments/card-to-card",
    "/v1/commerce/card-to-card/submit",
  ]) {
    app.post(
      routePath,
      { preHandler: [requireAuth] },
      async (request, reply) => {
        const actor = getActor(request);
      const body = (request.body ?? {}) as {
        product_id?: string;
        productId?: string;
        amount?: number;
        tracking_number?: string;
        trackingNumber?: string;
        source_card_last4?: string;
        sourceCardLast4?: string;
        payment_date?: string;
        paymentDate?: string;
        payment_time?: string;
        paymentTime?: string;
        payer_name?: string;
        payerName?: string;
        receipt_url?: string;
        receiptUrl?: string;
        raw_payment_text?: string;
        rawPaymentText?: string;
        extraction_method?: "rule" | "ai" | "hybrid" | "manual";
        extractionMethod?: "rule" | "ai" | "hybrid" | "manual";
      };

      const rawProductId = body.product_id ?? body.productId;
      if (!rawProductId) {
        throw new DomainError(
          "bad_request",
          "شناسه محصول (product_id) الزامی است.",
        );
      }
      const productId = parseProductId(rawProductId, "product_id");

      const amount = body.amount;
      const trackingNumber = body.tracking_number ?? body.trackingNumber;
      const sourceCardLast4 =
        body.source_card_last4 ?? body.sourceCardLast4;
      const paymentDate = body.payment_date ?? body.paymentDate;
      const paymentTime = body.payment_time ?? body.paymentTime;
      const payerName = body.payer_name ?? body.payerName;
      const receiptUrl = body.receipt_url ?? body.receiptUrl;
      const rawPaymentText = body.raw_payment_text ?? body.rawPaymentText;
      const extractionMethod = body.extraction_method ?? body.extractionMethod;

      if (!amount) {
        throw new DomainError("bad_request", "مبلغ واریزی (amount) الزامی است.");
      }
      if (!trackingNumber) {
        throw new DomainError(
          "bad_request",
          "شماره پیگیری (tracking_number) الزامی است.",
        );
      }
      if (!sourceCardLast4) {
        throw new DomainError(
          "bad_request",
          "۴ رقم آخر کارت مبدأ (source_card_last4) الزامی است.",
        );
      }

      const result = await commerceService.submitCardToCardPayment(
        actor,
        {
          productId,
          amount,
          trackingNumber,
          sourceCardLast4,
          paymentDate,
          paymentTime,
          payerName,
          receiptUrl,
          rawPaymentText,
          extractionMethod,
        },
        request.id,
      );

      reply.code(201);
      return result;
    },
  );
  }

  // -------------------------------------------------------------------------
  // GET /v1/commerce/payments/:paymentId — Get Single Payment Details
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/payments/:paymentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { paymentId: string };
      const paymentId = parsePaymentId(params.paymentId, "paymentId");

      const payment = await commerceService.getPayment(actor, paymentId);
      return reply.send({
        payment: {
          id: payment.id,
          order_id: payment.orderId,
          user_id: payment.userId,
          amount: payment.amount,
          currency: payment.currency,
          gateway: payment.gateway,
          status: payment.status,
          tracking_number: payment.trackingNumber,
          source_card_last4: payment.sourceCardLast4,
          payer_name: payment.payerName,
          receipt_url: payment.receiptUrl,
          rejection_reason: payment.rejectionReason,
          paid_at: payment.paidAt,
          reviewed_at: payment.reviewedAt,
          created_at: payment.createdAt,
        },
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/access/check — Query centralized access decision
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/access/check",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const query = (request.query ?? {}) as {
        resource_type?: string;
        resourceType?: string;
        resource_id?: string;
        resourceId?: string;
        course_id?: string;
        courseId?: string;
        content_pack_id?: string;
        contentPackId?: string;
      };

      const resourceType = (query.resource_type ??
        query.resourceType ??
        "course") as CheckAccessInput["resourceType"];
      const resourceId = query.resource_id ?? query.resourceId;

      if (!resourceId) {
        throw new DomainError("bad_request", "شناسه منبع (resource_id) الزامی است.");
      }

      const input: CheckAccessInput = {
        userId: actor.userId,
        resourceType,
        resourceId,
        courseId: (query.course_id ?? query.courseId) as any,
        contentPackId: (query.content_pack_id ?? query.contentPackId) as any,
      };

      const decision = await entitlementService.checkAccess(actor, input);
      return decision;
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/subscriptions/my — Current user's subscription
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/subscriptions/my",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const sub = await commerceService.getMySubscription(actor.userId);
      return {
        subscription: sub
          ? {
              id: sub.id,
              product_id: sub.productId,
              status: sub.status,
              started_at: sub.startedAt,
              expires_at: sub.expiresAt,
            }
          : null,
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/entitlements/my — Current user's entitlements
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/entitlements/my",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const entitlements = await commerceService.getMyEntitlements(
        actor.userId,
      );
      return {
        items: entitlements.map((e) => ({
          id: e.id,
          resource_type: e.resourceType,
          resource_id: e.resourceId,
          source_type: e.sourceType,
          starts_at: e.startsAt,
          expires_at: e.expiresAt,
        })),
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/orders/my — Current user's orders history
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/orders/my",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const orders = await commerceService.getMyOrders(actor.userId);
      return {
        items: orders.map((o) => ({
          id: o.id,
          order_number: o.orderNumber,
          product_id: o.productId,
          amount: o.amount,
          currency: o.currency,
          status: o.status,
          metadata: o.metadata,
          created_at: o.createdAt,
          updated_at: o.updatedAt,
        })),
      };
    },
  );
};
