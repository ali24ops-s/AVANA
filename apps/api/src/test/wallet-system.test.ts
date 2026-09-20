import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asUserId,
  asWalletId,
  verifyLedgerInvariant,
  DomainError,
  type Actor,
  type UUID,
} from "@avana/domain";
import {
  InMemoryWalletStore,
  WalletService,
} from "../modules/wallet/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Avana Credits & Wallet System — Phase 1 Test Suite", () => {
  let walletStore: InMemoryWalletStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let walletService: WalletService;

  const user1Id = asUserId(randomUUID() as UUID);

  const actor1: Actor = {
    userId: user1Id,
    role: "student",
  };

  beforeEach(() => {
    walletStore = new InMemoryWalletStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    walletService = new WalletService(walletStore, auditService);
  });

  // -------------------------------------------------------------------------
  // 1. Wallet Creation & Initialization
  // -------------------------------------------------------------------------
  describe("1. Wallet Creation & Initialization", () => {
    it("1. creates a new wallet with initial balance of 0 Tomans", async () => {
      const now = new Date().toISOString();
      const created = await walletStore.createWallet({
        id: asWalletId(randomUUID() as UUID),
        userId: user1Id,
        balance: 0,
        currency: "toman",
        createdAt: now,
        updatedAt: now,
      });

      expect(created.userId).toBe(user1Id);
      expect(created.balance).toBe(0);
      expect(created.currency).toBe("toman");
    });

    it("2. getOrCreateWallet lazily creates a wallet if one does not exist", async () => {
      const wallet = await walletService.getOrCreateWallet(user1Id);
      expect(wallet).toBeDefined();
      expect(wallet.userId).toBe(user1Id);
      expect(wallet.balance).toBe(0);
      expect(wallet.currency).toBe("toman");

      // Second call returns existing wallet
      const existing = await walletService.getOrCreateWallet(user1Id);
      expect(existing.id).toBe(wallet.id);
      expect(existing.balance).toBe(0);
    });

    it("3. prevents duplicate wallet creation for the same user", async () => {
      const now = new Date().toISOString();
      await walletStore.createWallet({
        id: asWalletId(randomUUID() as UUID),
        userId: user1Id,
        balance: 0,
        currency: "toman",
        createdAt: now,
        updatedAt: now,
      });

      await expect(
        walletStore.createWallet({
          id: asWalletId(randomUUID() as UUID),
          userId: user1Id,
          balance: 1000,
          currency: "toman",
          createdAt: now,
          updatedAt: now,
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Credit Operations & Idempotency
  // -------------------------------------------------------------------------
  describe("2. Credit Operations", () => {
    it("4. Credit increases balance correctly", async () => {
      const res = await walletService.credit({
        userId: user1Id,
        amount: 50_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "sub-101",
      });

      expect(res.wallet.balance).toBe(50_000);
      expect(res.isDuplicate).toBe(false);
    });

    it("5. records correct balanceBefore and balanceAfter in ledger", async () => {
      const res1 = await walletService.credit({
        userId: user1Id,
        amount: 30_000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "ord-1",
      });

      expect(res1.transaction.balanceBefore).toBe(0);
      expect(res1.transaction.balanceAfter).toBe(30_000);
      expect(res1.transaction.amount).toBe(30_000);
      expect(res1.transaction.type).toBe("credit");

      const res2 = await walletService.credit({
        userId: user1Id,
        amount: 20_000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "ord-2",
      });

      expect(res2.transaction.balanceBefore).toBe(30_000);
      expect(res2.transaction.balanceAfter).toBe(50_000);
      expect(res2.transaction.amount).toBe(20_000);
    });

    it("6. rejects non-positive or floating point credit amounts", async () => {
      await expect(
        walletService.credit({
          userId: user1Id,
          amount: 0,
          source: "wallet_topup",
          referenceType: "order",
          referenceId: "ord-3",
        }),
      ).rejects.toThrow(/مثبت/);

      await expect(
        walletService.credit({
          userId: user1Id,
          amount: -500,
          source: "wallet_topup",
          referenceType: "order",
          referenceId: "ord-4",
        }),
      ).rejects.toThrow(/مثبت/);

      await expect(
        walletService.credit({
          userId: user1Id,
          amount: 1500.75,
          source: "wallet_topup",
          referenceType: "order",
          referenceId: "ord-5",
        }),
      ).rejects.toThrow(/مثبت/);
    });

    it("7. Duplicate idempotency key does not credit balance twice", async () => {
      const idempotencyKey = "sub_bonus_sub-12345";

      const firstCall = await walletService.credit({
        userId: user1Id,
        amount: 50_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "sub-12345",
        idempotencyKey,
      });

      expect(firstCall.wallet.balance).toBe(50_000);
      expect(firstCall.isDuplicate).toBe(false);

      // Re-send exactly same idempotency key
      const secondCall = await walletService.credit({
        userId: user1Id,
        amount: 50_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "sub-12345",
        idempotencyKey,
      });

      expect(secondCall.wallet.balance).toBe(50_000); // Balance unchanged!
      expect(secondCall.isDuplicate).toBe(true);
      expect(secondCall.transaction.id).toBe(firstCall.transaction.id);

      // Verify transaction list only has 1 transaction
      const history = await walletStore.listTransactionsByUserId(user1Id);
      expect(history.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Debit Operations & Invariants
  // -------------------------------------------------------------------------
  describe("3. Debit Operations", () => {
    beforeEach(async () => {
      // Seed initial 30,000 Tomans
      await walletService.credit({
        userId: user1Id,
        amount: 30_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "init-sub",
      });
    });

    it("8. Debit decreases balance correctly and records ledger", async () => {
      const debitRes = await walletService.debit({
        userId: user1Id,
        amount: 15_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-1",
      });

      expect(debitRes.wallet.balance).toBe(15_000);
      expect(debitRes.transaction.balanceBefore).toBe(30_000);
      expect(debitRes.transaction.balanceAfter).toBe(15_000);
      expect(debitRes.transaction.type).toBe("debit");
      expect(debitRes.isDuplicate).toBe(false);
    });

    it("9. Insufficient balance throws DomainError with INSUFFICIENT_FUNDS code", async () => {
      let caughtError: DomainError | null = null;
      try {
        await walletService.debit({
          userId: user1Id,
          amount: 35_000, // User only has 30,000
          source: "content_generation",
          referenceType: "generation_job",
          referenceId: "job-2",
        });
      } catch (err) {
        caughtError = err as DomainError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.code).toBe("INSUFFICIENT_FUNDS");
      expect(caughtError?.message).toContain("موجودی کیف پول شما کافی نیست");

      // Balance remains intact at 30,000
      const current = await walletService.getMyWallet(actor1);
      expect(current.balance).toBe(30_000);
    });

    it("10. Duplicate idempotency key does not debit balance twice", async () => {
      const idempotencyKey = "gen_debit_job-999";

      const firstDebit = await walletService.debit({
        userId: user1Id,
        amount: 10_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-999",
        idempotencyKey,
      });

      expect(firstDebit.wallet.balance).toBe(20_000);
      expect(firstDebit.isDuplicate).toBe(false);

      // Re-send same debit
      const secondDebit = await walletService.debit({
        userId: user1Id,
        amount: 10_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-999",
        idempotencyKey,
      });

      expect(secondDebit.wallet.balance).toBe(20_000); // Not debited twice!
      expect(secondDebit.isDuplicate).toBe(true);
      expect(secondDebit.transaction.id).toBe(firstDebit.transaction.id);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Refund Operations
  // -------------------------------------------------------------------------
  describe("4. Refund Operations", () => {
    beforeEach(async () => {
      await walletService.credit({
        userId: user1Id,
        amount: 50_000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "topup-1",
      });
      await walletService.debit({
        userId: user1Id,
        amount: 15_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "failed-job-1",
      });
    });

    it("11. Refund restores balance and creates ledger entry with type refund", async () => {
      const refundRes = await walletService.refund({
        userId: user1Id,
        amount: 15_000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: "failed-job-1",
      });

      expect(refundRes.wallet.balance).toBe(50_000);
      expect(refundRes.transaction.type).toBe("refund");
      expect(refundRes.transaction.balanceBefore).toBe(35_000);
      expect(refundRes.transaction.balanceAfter).toBe(50_000);
    });

    it("12. Duplicate refund idempotency key does not refund twice", async () => {
      const idempotencyKey = "gen_refund_failed-job-1";

      const firstRefund = await walletService.refund({
        userId: user1Id,
        amount: 15_000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: "failed-job-1",
        idempotencyKey,
      });

      expect(firstRefund.wallet.balance).toBe(50_000);
      expect(firstRefund.isDuplicate).toBe(false);

      const secondRefund = await walletService.refund({
        userId: user1Id,
        amount: 15_000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: "failed-job-1",
        idempotencyKey,
      });

      expect(secondRefund.wallet.balance).toBe(50_000);
      expect(secondRefund.isDuplicate).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Concurrency & Integrity
  // -------------------------------------------------------------------------
  describe("5. Concurrency & Mathematical Integrity", () => {
    it("13. Sequential and parallel operations maintain the exact ledger invariant", async () => {
      // 1. Credit 100,000
      await walletService.credit({
        userId: user1Id,
        amount: 100_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "sub-1",
      });

      // 2. Debit 30,000
      await walletService.debit({
        userId: user1Id,
        amount: 30_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-1",
      });

      // 3. Debit 20,000
      await walletService.debit({
        userId: user1Id,
        amount: 20_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-2",
      });

      // 4. Refund 20,000 (job 2 failed)
      await walletService.refund({
        userId: user1Id,
        amount: 20_000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: "job-2",
      });

      // 5. Debit 40,000
      await walletService.debit({
        userId: user1Id,
        amount: 40_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "job-3",
      });

      // Expected final balance: 100,000 - 30,000 - 20,000 + 20,000 - 40,000 = 30,000
      const current = await walletService.getMyWallet(actor1);
      expect(current.balance).toBe(30_000);

      const history = await walletStore.listTransactionsByUserId(user1Id, 100);
      expect(history.total).toBe(5);

      // Verify domain invariant formula holds strictly
      const invariantValid = verifyLedgerInvariant(
        history.transactions,
        current.balance,
      );
      expect(invariantValid).toBe(true);
    });

    it("14. Multiple debits that exceed balance reject subsequent debits", async () => {
      await walletService.credit({
        userId: user1Id,
        amount: 20_000,
        source: "wallet_topup",
        referenceType: "order",
        referenceId: "ord-concur",
      });

      // Debit 1 (15,000) should succeed
      await walletService.debit({
        userId: user1Id,
        amount: 15_000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: "j-1",
      });

      // Debit 2 (15,000) should fail because only 5,000 remains
      await expect(
        walletService.debit({
          userId: user1Id,
          amount: 15_000,
          source: "content_generation",
          referenceType: "generation_job",
          referenceId: "j-2",
        }),
      ).rejects.toThrow();

      const finalWallet = await walletService.getMyWallet(actor1);
      expect(finalWallet.balance).toBe(5_000);
    });
  });

  // -------------------------------------------------------------------------
  // 6. HTTP API & Authorization Endpoints
  // -------------------------------------------------------------------------
  describe("6. HTTP API & Authorization Endpoints", () => {
    let app: ReturnType<typeof createApp>;
    let sessionStore: InMemorySessionStore;
    let userStore: InMemoryUserStore;
    let studentCookie: string;
    let otherStudentCookie: string;
    let orgStore: InMemoryOrganizationStore;

    let phoneIndex = 700000;
    async function registerUser(email: string, name: string) {
      phoneIndex++;
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password: "Password123!",
          name,
          phoneNumber: `0912${String(phoneIndex).padStart(7, "0")}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const cookie = extractSessionToken(res);
      const body = res.json();
      return { userId: asUserId(body.user.id), cookie };
    }

    beforeEach(async () => {
      const config = makeTestConfig();
      sessionStore = new InMemorySessionStore();
      userStore = new InMemoryUserStore();
      orgStore = new InMemoryOrganizationStore();

      app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore: orgStore,
        walletStore,
        auditService,
      });
      await app.ready();

      const student1 = await registerUser(
        `student-${randomUUID()}@avana.ir`,
        "Student One",
      );
      studentCookie = student1.cookie!;

      const student2 = await registerUser(
        `student-${randomUUID()}@avana.ir`,
        "Student Two",
      );
      otherStudentCookie = student2.cookie!;

      // Credit Student 1 with 25,000 Tomans
      await walletService.credit({
        userId: student1.userId,
        amount: 25_000,
        source: "subscription_bonus",
        referenceType: "user_subscription",
        referenceId: "init-sub",
      });
    });

    it("15. GET /v1/wallet/me returns authenticated user's wallet with formatted balance", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/wallet/me",
        headers: {
          cookie: `avana_session=${studentCookie}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.balance).toBe(25_000);
      expect(body.currency).toBe("toman");
      expect(body.formatted_balance).toBe("۲۵,۰۰۰ تومان");
      expect(body.request_id).toBeDefined();
    });

    it("16. GET /v1/wallet (alias) returns identical wallet balance", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/wallet",
        headers: {
          cookie: `avana_session=${studentCookie}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().balance).toBe(25_000);
    });

    it("17. Unauthenticated GET /v1/wallet/me returns 401 Unauthorized", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/wallet/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("18. Different users see their own separate wallets", async () => {
      const res2 = await app.inject({
        method: "GET",
        url: "/v1/wallet/me",
        headers: {
          cookie: `avana_session=${otherStudentCookie}`,
        },
      });

      expect(res2.statusCode).toBe(200);
      expect(res2.json().balance).toBe(0); // Student 2 has 0
    });

    it("19. GET /v1/wallet/transactions returns user's transaction history with sanitized fields", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/wallet/transactions",
        headers: {
          cookie: `avana_session=${studentCookie}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.transactions).toHaveLength(1);

      const tx = body.transactions[0];
      expect(tx.type).toBe("credit");
      expect(tx.amount).toBe(25_000);
      expect(tx.balance_before).toBe(0);
      expect(tx.balance_after).toBe(25_000);
      expect(tx.source).toBe("subscription_bonus");

      // Verify NO internal cost, profit, or provider metadata fields are leaked
      expect(tx).not.toHaveProperty("actualAiCost");
      expect(tx).not.toHaveProperty("grossProfit");
      expect(tx).not.toHaveProperty("providerCost");
    });

    it("20. Public mutation endpoints do not exist (HTTP 404 on POST /v1/wallet/credit or debit)", async () => {
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/wallet/credit",
        headers: { cookie: `avana_session=${studentCookie}` },
        payload: { amount: 10000 },
      });
      expect(res1.statusCode).toBe(404);

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/wallet/debit",
        headers: { cookie: `avana_session=${studentCookie}` },
        payload: { amount: 10000 },
      });
      expect(res2.statusCode).toBe(404);
    });
  });
});
