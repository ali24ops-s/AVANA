import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asOrganizationId,
  asUserId,
  asCourseId,
  asModuleId,
  asLessonId,
  asQuizQuestionId,
  asQuizId,
  calculateSpecialExamPrice,
  SPECIAL_EXAM_PRICE_PER_QUESTION,
  DomainError,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { StudyService } from "../modules/study/study-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryQuizStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";

describe("Special Exam Wallet Payment & Atomic Lifecycle Suite", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let quizStore: InMemoryQuizStore;
  let studyService: StudyService;

  const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");

  const studentUser: Actor = {
    userId: asUserId("11111111-1111-1111-1111-111111111111"),
    role: "student",
  };
  const poorUser: Actor = {
    userId: asUserId("22222222-2222-2222-2222-222222222222"),
    role: "student",
  };

  const courseAId = asCourseId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const moduleA1Id = asModuleId("a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1");
  const lessonA1Id = asLessonId("a1111111-a111-a111-a111-a11111111111");

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway({ enabled: true });
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore, undefined, commerceStore);

    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore();

    studyService = new StudyService(
      new InMemoryFlashcardStore(),
      new InMemoryFlashcardReviewStore(),
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      new InMemoryProgressStore(),
      undefined,
      orgId,
      undefined,
      undefined,
      undefined,
      courseStore,
    );

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      quizStore,
      systemOrganizationId: orgId,
    });

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      lessonStore,
      {
        onlinePaymentEnabled: false,
        mockPaymentEnabled: false,
      },
      studyService,
      undefined,
      walletService,
    );

    // Setup Course A
    await courseStore.create({
      course: {
        id: courseAId,
        organizationId: orgId,
        name: "فارماکولوژی ۳",
        description: "دوره جامع فارماکولوژی پزشکی",
        subject: "داروسازی",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleA1Id,
      courseId: courseAId,
      title: "هورمون‌های جنسی و مهارکننده‌ها",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await lessonStore.create({
      id: lessonA1Id,
      moduleId: moduleA1Id,
      title: "استروژن‌ها و پروژستین‌ها",
      content: "محتوای درس",
      sortOrder: 1,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Populate question bank for Course A (30 questions)
    const dummyQuizId = asQuizId(randomUUID());
    await quizStore.create({
      id: dummyQuizId,
      organizationId: orgId,
      courseId: courseAId,
      moduleId: moduleA1Id,
      lessonId: lessonA1Id,
      title: "آزمون فارماکولوژی ۳",
      sortOrder: 1,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    for (let i = 1; i <= 30; i++) {
      await quizQuestionStore.insert({
        id: asQuizQuestionId(randomUUID()),
        quizId: dummyQuizId,
        question: `سؤال آزمون تستی فارماکولوژی ${i}`,
        options: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctOptionIndex: (i % 4),
        explanation: `پاسخ تشریحی سؤال ${i}`,
        sortOrder: i,
        difficulty: i <= 10 ? "easy" : i <= 20 ? "medium" : "hard",
        courseId: courseAId,
        moduleId: moduleA1Id,
        lessonId: lessonA1Id,
        topic: "فارماکولوژی ۳",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Seed student with 50,000 Tomans in wallet
    await walletService.credit({
      userId: studentUser.userId,
      amount: 50_000,
      source: "wallet_topup",
      referenceType: "system",
      referenceId: "initial_seed",
    });

    // Seed poorUser with only 2,000 Tomans (insufficient for 10 questions = 5,000 Tomans)
    await walletService.credit({
      userId: poorUser.userId,
      amount: 2_000,
      source: "wallet_topup",
      referenceType: "system",
      referenceId: "poor_seed",
    });
  });

  it("1. Verifies canonical pricing invariant (500 Toman per question)", () => {
    expect(SPECIAL_EXAM_PRICE_PER_QUESTION).toBe(500);
    expect(calculateSpecialExamPrice(5)).toBe(2_500);
    expect(calculateSpecialExamPrice(10)).toBe(5_000);
    expect(calculateSpecialExamPrice(20)).toBe(10_000);
    expect(calculateSpecialExamPrice(40)).toBe(20_000);
    expect(calculateSpecialExamPrice(60)).toBe(30_000);
    expect(calculateSpecialExamPrice(0)).toBe(0);
    expect(calculateSpecialExamPrice(-5)).toBe(0);
  });

  it("2. Successfully purchases a 10-question special exam from wallet", async () => {
    const questionCount = 10;
    const price = calculateSpecialExamPrice(questionCount); // 5,000 Toman

    const product = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `special-exam-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه فارماکولوژی (۱۰ سؤال)",
      description: "آزمون شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        moduleIds: [moduleA1Id],
        questionCount,
        difficulty: "medium",
        blueprint: [
          {
            name: "فارماکولوژی ۳",
            courseId: courseAId,
            moduleIds: [moduleA1Id],
            count: questionCount,
            difficulty: "medium",
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const initialWallet = await walletService.getMyWallet(studentUser);
    expect(initialWallet.balance).toBe(50_000);

    const checkoutRes = await commerceService.checkout(
      studentUser,
      {
        productId: product.id,
        callbackUrl: "http://localhost:5173/checkout/callback",
        gateway: "wallet",
      },
      "req_1",
    );

    expect(checkoutRes.order_id).toBeDefined();
    expect(checkoutRes.payment_id).toBeDefined();
    expect(checkoutRes.authority).toBe(`wallet_${checkoutRes.order_id}`);
    expect(checkoutRes.attempt_id).toBeDefined();
    expect(checkoutRes.attempt).toBeDefined();
    expect(checkoutRes.questions).toHaveLength(10);

    // Verify wallet balance debited exactly 5,000 Tomans
    const afterWallet = await walletService.getMyWallet(studentUser);
    expect(afterWallet.balance).toBe(45_000);

    // Verify wallet transaction ledger entry
    const { transactions } = await walletService.listMyTransactions(studentUser);
    const debitTx = transactions.find((t) => t.id === (transactions[0]?.id));
    expect(debitTx).toBeDefined();
    expect(debitTx?.type).toBe("debit");
    expect(debitTx?.amount).toBe(5_000);
    expect(debitTx?.source).toBe("special_exam_purchase");
    expect(debitTx?.reference_type).toBe("order");
    expect(debitTx?.reference_id).toBe(checkoutRes.order_id);
    expect(debitTx?.balance_before).toBe(50_000);
    expect(debitTx?.balance_after).toBe(45_000);

    // Verify Entitlement created
    const access = await entitlementService.checkAccess(studentUser, {
      userId: studentUser.userId,
      resourceType: "special_exam",
      resourceId: checkoutRes.attempt_id!,
    });
    expect(access.granted).toBe(true);
    expect(access.reason).toBe("special_exam_purchase");

    // Verify Attempt is persisted and frozen
    const attempt = await quizAttemptStore.findById(checkoutRes.attempt_id as any);
    expect(attempt).toBeDefined();
    expect(attempt?.userId).toBe(studentUser.userId);
    expect(attempt?.questionSnapshot).toHaveLength(10);
  });

  it("3. Blocks purchase when wallet balance is insufficient without modifying ledger or creating attempt", async () => {
    const questionCount = 10;
    const price = calculateSpecialExamPrice(questionCount); // 5,000 Toman (poorUser only has 2,000)

    const product = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `special-exam-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه فارماکولوژی (۱۰ سؤال)",
      description: "آزمون شبیه‌ساز",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      commerceService.checkout(
        poorUser,
        {
          productId: product.id,
          callbackUrl: "http://localhost:5173/checkout/callback",
          gateway: "wallet",
        },
        "req_poor",
      ),
    ).rejects.toThrow(DomainError);

    // Balance remains untouched
    const wallet = await walletService.getMyWallet(poorUser);
    expect(wallet.balance).toBe(2_000);

    // Zero attempts created for poorUser
    const attempts = await quizAttemptStore.listByUser(poorUser.userId);
    expect(attempts).toHaveLength(0);
  });

  it("4. Handles double clicks / duplicate debit requests idempotently", async () => {
    const questionCount = 10;
    const price = calculateSpecialExamPrice(questionCount);

    const product = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `special-exam-idemp-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه فارماکولوژی",
      description: "آزمون",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const res1 = await commerceService.checkout(
      studentUser,
      {
        productId: product.id,
        callbackUrl: "http://localhost:5173/checkout/callback",
        gateway: "wallet",
      },
      "req_dup_1",
    );

    const balanceAfterFirst = (await walletService.getMyWallet(studentUser)).balance;
    expect(balanceAfterFirst).toBe(45_000);

    // Direct wallet mutation with the exact same order debit key is idempotent
    const duplicateDebitAttempt = await walletStore.executeAtomicWalletMutation({
      userId: studentUser.userId,
      mutationType: "debit",
      amount: price,
      source: "special_exam_purchase",
      referenceType: "order",
      referenceId: res1.order_id,
      idempotencyKey: `special-exam-debit:${res1.order_id}`,
    });

    expect(duplicateDebitAttempt.isDuplicate).toBe(true);
    const balanceAfterDuplicate = (await walletService.getMyWallet(studentUser)).balance;
    expect(balanceAfterDuplicate).toBe(45_000); // ZERO double debit!
  });

  it("5. Automatically and idempotently refunds wallet debit if attempt creation fails", async () => {
    const questionCount = 50; // Exceeds 30 questions in pool
    const price = calculateSpecialExamPrice(questionCount); // 25,000 Tomans

    const product = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: `special-exam-fail-${randomUUID().slice(0, 8)}`,
      type: "special_exam",
      title: "آزمون ویژه غیرممکن (۵۰ سؤال)",
      description: "تست فیل",
      price,
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount,
        difficulty: "all",
        blueprint: [
          {
            name: "فارماکولوژی ۳",
            courseId: courseAId,
            count: questionCount,
            difficulty: "all",
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const beforeBalance = (await walletService.getMyWallet(studentUser)).balance;
    expect(beforeBalance).toBe(50_000);

    // Attempting checkout should fail at createSpecialExamAttempt and automatically trigger refund
    await expect(
      commerceService.checkout(
        studentUser,
        {
          productId: product.id,
          callbackUrl: "http://localhost:5173/checkout/callback",
          gateway: "wallet",
        },
        "req_fail",
      ),
    ).rejects.toThrow();

    // Verify user balance was completely restored (100% refunded)
    const afterBalance = (await walletService.getMyWallet(studentUser)).balance;
    expect(afterBalance).toBe(50_000);

    // Verify transactions in ledger show debit followed by refund
    const { transactions } = await walletService.listMyTransactions(studentUser);
    expect(transactions[0]?.type).toBe("refund");
    expect(transactions[0]?.source).toBe("special_exam_refund");
    expect(transactions[0]?.amount).toBe(25_000);
    expect(transactions[1]?.type).toBe("debit");
    expect(transactions[1]?.source).toBe("special_exam_purchase");
    expect(transactions[1]?.amount).toBe(25_000);
  });

  it("6. Rejects tampered pricing on special exam products", async () => {
    // Tampered product: 20 questions for only 100 Tomans (expected 10,000)
    const tamperedProduct = await commerceStore.createProduct({
      id: randomUUID() as any,
      code: "special-exam-tampered",
      type: "special_exam",
      title: "آزمون دستکاری شده",
      description: "تست",
      price: 100, // TAMPERED!
      currency: "toman",
      targetType: "special_exam",
      targetId: null,
      durationDays: null,
      active: true,
      metadata: {
        organizationId: orgId,
        courseId: courseAId,
        questionCount: 20,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      commerceService.checkout(
        studentUser,
        {
          productId: tamperedProduct.id,
          callbackUrl: "http://localhost:5173/checkout/callback",
          gateway: "wallet",
        },
        "req_tamp",
      ),
    ).rejects.toThrow(DomainError);
  });

  it("7. Concurrent purchases with limited balance only debit up to available balance", async () => {
    // studentUser currently has 50,000 Tomans.
    // Each product has 20 questions = 10,000 Tomans.
    // When student initiates 6 concurrent purchases (6 * 10,000 = 60,000 > 50,000):
    // Exactly 5 must succeed (50,000 deducted, 0 remaining) and 1 must fail with insufficient funds.
    const price = calculateSpecialExamPrice(20); // 10,000 Tomans each for 20 questions

    const makeProduct = async (idx: number) => {
      return commerceStore.createProduct({
        id: randomUUID() as any,
        code: `special-exam-conc-${idx}-${randomUUID().slice(0, 6)}`,
        type: "special_exam",
        title: `آزمون همزمان ${idx}`,
        description: "تست همزمانی",
        price,
        currency: "toman",
        targetType: "special_exam",
        targetId: null,
        durationDays: null,
        active: true,
        metadata: {
          organizationId: orgId,
          courseId: courseAId,
          questionCount: 20,
          difficulty: "all",
          blueprint: [
            {
              name: "فارماکولوژی ۳",
              courseId: courseAId,
              count: 20,
              difficulty: "all",
            },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    };

    const products = await Promise.all([
      makeProduct(1),
      makeProduct(2),
      makeProduct(3),
      makeProduct(4),
      makeProduct(5),
      makeProduct(6), // 6 * 10,000 = 60,000 Tomans (student has 50,000)
    ]);

    const results = await Promise.allSettled(
      products.map((p, idx) =>
        commerceService.checkout(
          studentUser,
          {
            productId: p.id,
            callbackUrl: "http://localhost:5173/checkout/callback",
            gateway: "wallet",
          },
          `req_conc_${idx}`,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(5); // 5 succeeded (5 * 10,000 = 50,000)
    expect(rejected.length).toBe(1); // 1 failed due to insufficient funds

    const finalWallet = await walletService.getMyWallet(studentUser);
    expect(finalWallet.balance).toBe(0); // 0 remaining, never negative!
  });
});
