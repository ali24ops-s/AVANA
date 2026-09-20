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

import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type CheckAccessInput,
  type CardToCardInfoResponse,
  DomainError,
  parseProductId,
  isProductId,
  parsePaymentId,
  DEFAULT_SUBSCRIPTION_CREDIT_BONUSES,
  resolveSubscriptionPlanType,
  resolveGiftCreditAmount,
  calculateSpecialExamPrice,
  asProductId,
  asOrganizationId,
  asCourseId,
  asModuleId,
} from "@avana/domain";
import { CommerceService } from "./commerce-service.js";
import { EntitlementService } from "./entitlement-service.js";
import { PaymentInfoExtractionService } from "./payment-extraction-service.js";
import type { CommerceStore } from "./commerce-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
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
import type { StudyService } from "../study/study-service.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { SubscriptionCreditBonusesConfig } from "@avana/domain";
import type { PromotionService } from "./promotion-service.js";

export interface CommerceRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: UserStore;
  commerceStore: CommerceStore;
  gateway: PaymentGateway;
  storageProvider?: StorageProvider;
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
  studyService?: StudyService;
  notificationService?: NotificationService;
  walletService?: WalletService;
  subscriptionCreditBonusesProvider?: () => Promise<SubscriptionCreditBonusesConfig>;
  promotionService?: PromotionService;
  referralService?: import("../referral/referral-service.js").ReferralService;
  systemOrganizationId?: import("@avana/domain").OrganizationId;
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
    storageProvider,
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
    studyService,
    notificationService,
    walletService,
    subscriptionCreditBonusesProvider,
    promotionService,
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
    studyService,
    notificationService,
    walletService,
    subscriptionCreditBonusesProvider,
    promotionService,
    opts.referralService,
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
    const config = subscriptionCreditBonusesProvider
      ? await subscriptionCreditBonusesProvider()
      : DEFAULT_SUBSCRIPTION_CREDIT_BONUSES;

    return {
      items: products.map((p) => {
        const planType = resolveSubscriptionPlanType(p);
        const giftCredit =
          planType && p.type === "subscription"
            ? resolveGiftCreditAmount(planType, config)
            : null;

        return {
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
          gift_credit: giftCredit,
          metadata: p.metadata,
        };
      }),
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/commerce/products/:productId — Get single product
  // -------------------------------------------------------------------------
  app.get("/v1/commerce/products/:productId", async (request, _reply) => {
    const params = request.params as { productId: string };
    const productId = parseProductId(params.productId, "productId");
    const p = await commerceService.getProduct(productId);
    const config = subscriptionCreditBonusesProvider
      ? await subscriptionCreditBonusesProvider()
      : DEFAULT_SUBSCRIPTION_CREDIT_BONUSES;

    const planType = resolveSubscriptionPlanType(p);
    const giftCredit =
      planType && p.type === "subscription"
        ? resolveGiftCreditAmount(planType, config)
        : null;

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
        gift_credit: giftCredit,
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
        coupon_code?: string;
        couponCode?: string;
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

      const couponCode = body.coupon_code ?? body.couponCode;

      const result = await commerceService.checkout(
        actor,
        {
          productId,
          callbackUrl: defaultCallback,
          gateway: body.gateway,
          couponCode,
        },
        request.id,
      );

      reply.code(201);
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/commerce/promotions/validate — Validate coupon code for checkout
  // -------------------------------------------------------------------------
  app.post<{
    Body: {
      code?: string;
      product_id?: string;
      productId?: string;
    };
  }>(
    "/v1/commerce/promotions/validate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body || {};
      const code = body.code?.trim();
      const rawProductId = body.product_id ?? body.productId;

      if (!code) {
        return reply.status(400).send({
          valid: false,
          reason: "کد تخفیف الزامی است.",
          eligibleSubtotal: 0,
          orderTotal: 0,
        });
      }

      if (!rawProductId || !isProductId(rawProductId)) {
        return reply.status(400).send({
          valid: false,
          reason: "شناسه محصول نامعتبر است.",
          eligibleSubtotal: 0,
          orderTotal: 0,
        });
      }

      const product = await commerceService.getProduct(parseProductId(rawProductId));
      if (!product) {
        return reply.status(404).send({
          valid: false,
          reason: "محصول مورد نظر یافت نشد.",
          eligibleSubtotal: 0,
          orderTotal: 0,
        });
      }

      if (product.type === "wallet_topup") {
        return reply.status(400).send({
          valid: false,
          reason: "امکان استفاده از کد تخفیف برای شارژ کیف پول وجود ندارد.",
          eligibleSubtotal: 0,
          orderTotal: product.price,
        });
      }

      if (!opts.promotionService) {
        return reply.status(400).send({
          valid: false,
          reason: "سیستم تخفیف در حال حاضر غیرفعال است.",
          eligibleSubtotal: 0,
          orderTotal: product.price,
        });
      }

      const result = await opts.promotionService.validateCoupon(code, actor.userId, [
        {
          productId: product.id,
          productType: product.type,
          price: product.price,
        },
      ]);

      return reply.status(200).send(result);
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/commerce/special-exams/preview — Authoritative price & pool preview
  // -------------------------------------------------------------------------
  app.post<{
    Body: {
      organizationId?: string;
      courseId?: string;
      moduleIds?: string[];
      topics?: string[];
      questionCount?: number;
      difficulty?: string;
    };
  }>(
    "/v1/commerce/special-exams/preview",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body || {};

      const courseId = body.courseId?.trim();
      if (!courseId) {
        throw new DomainError("bad_request", "شناسه دوره (courseId) الزامی است.");
      }

      const questionCount = Number(body.questionCount) || 20;
      if (!Number.isInteger(questionCount) || questionCount <= 0) {
        throw new DomainError("bad_request", "تعداد سؤالات باید یک عدد صحیح مثبت باشد.");
      }

      const orgId = asOrganizationId(
        body.organizationId || opts.systemOrganizationId || "00000000-0000-0000-0000-000000000001",
      );

      // Verify course exists
      if (courseStore) {
        const course = await courseStore.findByIdForUser(
          asCourseId(courseId),
          actor.userId,
          opts.systemOrganizationId,
        ).catch(() => undefined);
        if (!course) {
          throw new DomainError("not_found", "دوره مورد نظر یافت نشد.");
        }
      }

      // Verify module scope belongs to this course
      if (moduleStore && body.moduleIds && body.moduleIds.length > 0) {
        for (const modId of body.moduleIds) {
          const mod = await moduleStore.findById(asModuleId(modId)).catch(() => undefined);
          if (!mod || mod.courseId !== courseId) {
            throw new DomainError("bad_request", "سرفصل یا ماژول انتخاب‌شده متعلق به این دوره نیست.");
          }
        }
      }

      const difficulty = body.difficulty || "medium";
      const price = calculateSpecialExamPrice(questionCount);

      let availableQuestions = questionCount;
      if (studyService) {
        const poolCheck = await studyService.validateExamBlueprintPool(orgId, {
          questionCount,
          difficulty,
          scope: {
            courseId,
            moduleIds: body.moduleIds,
            topics: body.topics,
          },
        });

        availableQuestions = poolCheck.totalAvailable;
        if (!poolCheck.isValid) {
          return reply.status(400).send({
            code: "insufficient_pool",
            message: "موجودی بانک سؤال برای این آزمون با این مشخصات کافی نیست.",
            valid: false,
            availableQuestions: poolCheck.totalAvailable,
            totalRequired: questionCount,
            price,
            currency: "toman",
            errors: poolCheck.errors,
          });
        }
      }

      return reply.send({
        valid: true,
        courseId,
        questionCount,
        availableQuestions,
        price,
        currency: "toman",
        difficulty,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/commerce/special-exams/order — Create order with immutable config
  // -------------------------------------------------------------------------
  app.post<{
    Body: {
      organizationId?: string;
      courseId?: string;
      moduleIds?: string[];
      topics?: string[];
      questionCount?: number;
      difficulty?: string;
      callbackUrl?: string;
      gateway?: string;
      couponCode?: string;
    };
  }>(
    "/v1/commerce/special-exams/order",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body || {};

      const courseId = body.courseId?.trim();
      if (!courseId) {
        throw new DomainError("bad_request", "شناسه دوره (courseId) الزامی است.");
      }

      const questionCount = Number(body.questionCount) || 20;
      if (!Number.isInteger(questionCount) || questionCount <= 0) {
        throw new DomainError("bad_request", "تعداد سؤالات باید یک عدد صحیح مثبت باشد.");
      }

      const orgId = asOrganizationId(
        body.organizationId || opts.systemOrganizationId || "00000000-0000-0000-0000-000000000001",
      );

      let courseTitle = "دوره آموزشی";
      if (courseStore) {
        const course = await courseStore.findByIdForUser(
          asCourseId(courseId),
          actor.userId,
          opts.systemOrganizationId,
        ).catch(() => undefined);
        if (!course) {
          throw new DomainError("not_found", "دوره مورد نظر یافت نشد.");
        }
        courseTitle = (course as { title?: string }).title || course.name || courseTitle;
      }

      // Verify module scope belongs to this course
      if (moduleStore && body.moduleIds && body.moduleIds.length > 0) {
        for (const modId of body.moduleIds) {
          const mod = await moduleStore.findById(asModuleId(modId)).catch(() => undefined);
          if (!mod || mod.courseId !== courseId) {
            throw new DomainError("bad_request", "سرفصل یا ماژول انتخاب‌شده متعلق به این دوره نیست.");
          }
        }
      }

      const difficulty = body.difficulty || "medium";
      const price = calculateSpecialExamPrice(questionCount);

      if (studyService) {
        const poolCheck = await studyService.validateExamBlueprintPool(orgId, {
          questionCount,
          difficulty,
          scope: {
            courseId,
            moduleIds: body.moduleIds,
            topics: body.topics,
          },
        });

        if (!poolCheck.isValid) {
          return reply.status(400).send({
            code: "insufficient_pool",
            message: "موجودی بانک سؤال برای این آزمون با این مشخصات کافی نیست.",
            valid: false,
            availableQuestions: poolCheck.totalAvailable,
            totalRequired: questionCount,
            price,
            currency: "toman",
            errors: poolCheck.errors,
          });
        }
      }

      // Create product with immutable configuration for this order
      const productId = asProductId(randomUUID());
      const productTitle = `آزمون ویژه: ${courseTitle} (${questionCount} سؤال)`;
      const code = `special-exam-order-${randomUUID().slice(0, 8)}`;

      const product = await commerceStore.createProduct({
        id: productId,
        code,
        type: "special_exam",
        title: productTitle,
        description: `آزمون ویژه و شبیه‌ساز ${questionCount} سؤالی از مباحث ${courseTitle}`,
        price,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          organizationId: orgId,
          courseId,
          moduleIds: body.moduleIds || [],
          topics: body.topics || [],
          questionCount,
          difficulty,
          scope: {
            courseId,
            moduleIds: body.moduleIds,
            topics: body.topics || [courseTitle],
          },
          blueprint: [
            {
              name: courseTitle,
              courseId,
              moduleIds: body.moduleIds,
              count: questionCount,
              difficulty,
            },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const defaultCallback =
        body.callbackUrl ??
        "http://localhost:5173/checkout/callback";

      const checkoutResult = await commerceService.checkout(
        actor,
        {
          productId: product.id,
          callbackUrl: defaultCallback,
          gateway: body.gateway,
          couponCode: body.couponCode,
        },
        request.id,
      );

      reply.code(201);
      return {
        ...checkoutResult,
        product: {
          id: product.id,
          code: product.code,
          title: product.title,
          price: product.price,
          currency: product.currency,
          questionCount,
          difficulty,
        },
      };
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
      amount?: number;
      use_ai_fallback?: boolean;
      useAiFallback?: boolean;
    };

    const rawText = body.text ?? body.payment_text ?? body.paymentText ?? "";
    const rawProductId = body.product_id ?? body.productId;
    const useAiFallback = body.use_ai_fallback ?? body.useAiFallback ?? true;

    let expectedAmount: number | undefined;
    if (typeof body.amount === "number" && Number.isInteger(body.amount) && body.amount > 0) {
      expectedAmount = body.amount;
    } else if (rawProductId) {
      try {
        if (rawProductId === "wallet_topup") {
          // For wallet_topup, amount is always dynamic and specified in body.amount, never product price
          expectedAmount = undefined;
        } else {
          let prodId: import("@avana/domain").ProductId | null = null;
          if (isProductId(rawProductId)) {
            prodId = rawProductId as import("@avana/domain").ProductId;
          } else {
            const prod = await commerceStore.findProductByCode(rawProductId);
            if (prod) prodId = prod.id;
          }
          if (prodId) {
            const product = await commerceService.getProduct(prodId);
            if (product.type !== "wallet_topup") {
              expectedAmount = product.price;
            }
          }
        }
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
        coupon_code?: string;
        couponCode?: string;
      };

      const rawProductId = body.product_id ?? body.productId;
      if (!rawProductId) {
        throw new DomainError(
          "bad_request",
          "شناسه محصول (product_id) الزامی است.",
        );
      }
      let productId: import("@avana/domain").ProductId;
      if (rawProductId === "wallet_topup") {
        const topupProd = await commerceStore.findProductByCode("wallet_topup");
        if (topupProd) {
          productId = topupProd.id;
        } else {
          throw new DomainError(
            "not_found",
            "محصول شارژ کیف پول در سیستم یافت نشد.",
          );
        }
      } else if (isProductId(rawProductId)) {
        productId = rawProductId as import("@avana/domain").ProductId;
      } else {
        const prodByCode = await commerceStore.findProductByCode(rawProductId);
        if (prodByCode) {
          productId = prodByCode.id;
        } else {
          throw new DomainError(
            "not_found",
            "محصول مورد نظر یافت نشد.",
          );
        }
      }

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
      const couponCode = body.coupon_code ?? body.couponCode;

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
          couponCode,
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
  // POST /v1/commerce/payments/receipt — Upload Payment Receipt Image
  // -------------------------------------------------------------------------
  app.post(
    "/v1/commerce/payments/receipt",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      getActor(request);
      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const file = await request.file({
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB limit
          files: 1,
        },
      });

      if (!file) {
        throw new DomainError(
          "bad_request",
          "فایل تصویر فیش واریزی ارسال نشده است.",
        );
      }

      const rawMime = (file.mimetype || "").toLowerCase();
      const ALLOWED_MIME_MAP: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };

      const ext = ALLOWED_MIME_MAP[rawMime];
      if (!ext) {
        throw new DomainError(
          "bad_request",
          "فرمت فایل نامعتبر است. فقط فرمت‌های تصویری JPG، PNG و WebP مجاز هستند.",
        );
      }

      const data = await file.toBuffer();
      if (data.length > 5 * 1024 * 1024) {
        throw new DomainError(
          "bad_request",
          "حجم تصویر فیش واریزی بیش از حد مجاز است (حداکثر ۵ مگابایت).",
        );
      }

      if (data.length === 0) {
        throw new DomainError(
          "bad_request",
          "فایل ارسالی خالی و فاقد محتوا است.",
        );
      }

      // Safe isolated key: receipts/<random-uuid>.<ext> (never trust client filename)
      const storageKey = `receipts/${randomUUID()}.${ext}`;

      await storageProvider.save({
        storageKey,
        data,
        mimeType: rawMime === "image/jpg" ? "image/jpeg" : rawMime,
      });

      const receiptUrl = `/v1/commerce/receipts/${encodeURIComponent(storageKey)}`;

      reply.code(201);
      return {
        receipt_url: receiptUrl,
        storage_key: storageKey,
      };
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/commerce/receipts/* — Stream/View Payment Receipt Image (Secure)
  // -------------------------------------------------------------------------
  app.get(
    "/v1/commerce/receipts/*",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      if (!storageProvider) {
        throw new DomainError(
          "service_unavailable",
          "سرویس ذخیره‌سازی فایل در دسترس نیست.",
        );
      }

      const rawKey = (request.params as { "*": string })["*"];
      if (!rawKey) {
        throw new DomainError("bad_request", "شناسه یا مسیر تصویر الزامی است.");
      }

      const storageKey = decodeURIComponent(rawKey);

      // Path traversal security check
      if (!storageKey.startsWith("receipts/") || storageKey.includes("..")) {
        throw new DomainError("bad_request", "مسیر فایل نامعتبر است.");
      }

      // Access Authorization Check:
      // Platform Admins have full access.
      // Regular users are only allowed if they are viewing their own payment's receipt.
      if (actor.role !== "platform_admin") {
        const associatedPayment = await commerceStore.findPaymentByReceiptUrl(storageKey);
        if (associatedPayment && associatedPayment.userId !== actor.userId) {
          throw new DomainError(
            "forbidden",
            "شما اجازه دسترسی به این تصویر فیش پرداخت را ندارید.",
          );
        }
      }

      const exists = await storageProvider.exists(storageKey);
      if (!exists) {
        throw new DomainError("not_found", "تصویر فیش پرداخت یافت نشد.");
      }

      const ext = storageKey.split(".").pop()?.toLowerCase();
      const mimeType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

      const data = await storageProvider.read(storageKey);

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `inline; filename="receipt.${ext}"`)
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
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

      const rawCourseId = query.course_id ?? query.courseId;
      const rawPackId = query.content_pack_id ?? query.contentPackId;

      const input: CheckAccessInput = {
        userId: actor.userId,
        resourceType,
        resourceId,
        courseId: rawCourseId ? (rawCourseId as import("@avana/domain").CourseId) : undefined,
        contentPackId: rawPackId ? (rawPackId as import("@avana/domain").ContentPackId) : undefined,
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
