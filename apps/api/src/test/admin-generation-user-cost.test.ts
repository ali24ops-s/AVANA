import { describe, expect, it } from "vitest";
import { resolveUserCostFromTransactions } from "../modules/admin/drizzle-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Generation User Cost Resolution", () => {
  it("resolves debited amount correctly for standard generation job", () => {
    const jobId = "job-debit-1";
    const transactions = [
      {
        id: "tx-1",
        type: "debit",
        amount: 45000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-debit:${jobId}`,
      },
    ];

    const result = resolveUserCostFromTransactions(jobId, transactions, false);

    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe("debited");
    expect(result.statusLabel).toBe("کسر شده از کیف پول");
    expect(result.chargedAmountToman).toBe(45000);
    expect(result.refundedAmountToman).toBe(0);
    expect(result.netPaidAmountToman).toBe(45000);
    expect(result.formattedNetPaid).toContain("۴۵,۰۰۰");
    expect(result.isFree).toBe(false);
  });

  it("resolves refunded status when job is fully refunded", () => {
    const jobId = "job-refunded-1";
    const transactions = [
      {
        id: "tx-debit",
        type: "debit",
        amount: 30000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-debit:${jobId}`,
      },
      {
        id: "tx-refund",
        type: "refund",
        amount: 30000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-refund:${jobId}`,
      },
    ];

    const result = resolveUserCostFromTransactions(jobId, transactions, false);

    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe("refunded");
    expect(result.statusLabel).toBe("بازپرداخت‌شده به کیف پول");
    expect(result.chargedAmountToman).toBe(30000);
    expect(result.refundedAmountToman).toBe(30000);
    expect(result.netPaidAmountToman).toBe(0);
    expect(result.formattedNetPaid).toContain("۰");
  });

  it("handles partial refunds correctly", () => {
    const jobId = "job-partial-refund";
    const transactions = [
      {
        id: "tx-1",
        type: "debit",
        amount: 50000,
        source: "content_generation",
        referenceType: "generation_job",
        referenceId: jobId,
      },
      {
        id: "tx-2",
        type: "refund",
        amount: 20000,
        source: "generation_refund",
        referenceType: "generation_job",
        referenceId: jobId,
      },
    ];

    const result = resolveUserCostFromTransactions(jobId, transactions, false);

    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe("debited");
    expect(result.statusLabel).toBe("کسر شده از کیف پول (با بازپرداخت جزئی)");
    expect(result.chargedAmountToman).toBe(50000);
    expect(result.refundedAmountToman).toBe(20000);
    expect(result.netPaidAmountToman).toBe(30000);
    expect(result.formattedNetPaid).toContain("۳۰,۰۰۰");
  });

  it("deduplicates identical transaction records by ID", () => {
    const jobId = "job-dedup-1";
    const duplicateTx = {
      id: "tx-duplicate",
      type: "debit",
      amount: 40000,
      source: "content_generation",
      referenceType: "generation_job",
      referenceId: jobId,
    };

    // Passed multiple times
    const transactions = [duplicateTx, duplicateTx, { ...duplicateTx }];

    const result = resolveUserCostFromTransactions(jobId, transactions, false);

    expect(result.chargedAmountToman).toBe(40000);
    expect(result.netPaidAmountToman).toBe(40000);
  });

  it("marks admin / system operations as free with zero charge", () => {
    const jobId = "job-admin-free";
    const result = resolveUserCostFromTransactions(jobId, [], true);

    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe("free");
    expect(result.statusLabel).toBe("رایگان (تولید سیستمی / مدیر)");
    expect(result.isFree).toBe(true);
    expect(result.chargedAmountToman).toBe(0);
    expect(result.netPaidAmountToman).toBe(0);
    expect(result.formattedNetPaid).toBe("رایگان");
  });

  it("marks missing or legacy records as unavailable without guessing", () => {
    const jobId = "job-legacy-missing";
    const result = resolveUserCostFromTransactions(jobId, [], false);

    expect(result.isAvailable).toBe(false);
    expect(result.status).toBe("unavailable");
    expect(result.statusLabel).toBe("اطلاعات هزینه در دسترس نیست");
    expect(result.chargedAmountToman).toBeUndefined();
    expect(result.netPaidAmountToman).toBeUndefined();
  });

  it("matches transactions via idempotencyKey when reference is missing", () => {
    const jobId = "job-idemp-match";
    const transactions = [
      {
        id: "tx-idemp-1",
        type: "debit",
        amount: 25000,
        source: "content_generation",
        referenceType: "",
        referenceId: "",
        idempotencyKey: `generation-debit:${jobId}`,
      },
    ];

    const result = resolveUserCostFromTransactions(jobId, transactions, false);

    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe("debited");
    expect(result.chargedAmountToman).toBe(25000);
  });
});

describe("Admin Generation API Endpoints with User Cost & File Financial Summary", () => {
  function makeTestConfig() {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";
    return loadApiConfig();
  }

  it("returns userCost and fileFinancialSummary for generation job detail", async () => {
    const config = makeTestConfig();
    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const orgStore = new InMemoryOrganizationStore();
    const courseStore = new InMemoryCourseStore();
    const documentStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const adminStore = new InMemoryAdminStore();

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      documentStore,
      documentChunkStore: chunkStore,
      auditService,
      adminStore,
    });

    // 1. Create admin user and session via register
    const regAdmin = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        name: "مدیر ارشد",
        email: "platform-admin@avana.test",
        password: "Password123!",
        phoneNumber: "09121110001",
      },
    });
    const cookie = regAdmin.cookies.find((c) => c.name === "avana_session");
    const adminToken = cookie?.value || "";
    const adminUser = (regAdmin.json() as { user: { id: string } }).user;
    const adminRec = (userStore as unknown as { users: Map<string, { role: string; globalRole?: string | null }> }).users.get(adminUser.id);
    if (adminRec) {
      adminRec.role = Roles.platform_admin;
      adminRec.globalRole = Roles.platform_admin;
    }

    // 2. Populate generation job in adminStore
    const jobId = "job-test-detail";
    const docId = "doc-test-1";
    adminStore.generationJobs.push({
      id: jobId,
      type: "course",
      status: "completed",
      errorMessage: null,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 45000,
      documentId: docId,
      documentName: "test-document.pdf",
      documentSizeBytes: 102400,
      documentMimeType: "application/pdf",
      userEmail: "student@avana.test",
      userCost: {
        isAvailable: true,
        status: "debited",
        statusLabel: "کسر شده از کیف پول",
        chargedAmountToman: 50000,
        refundedAmountToman: 0,
        netPaidAmountToman: 50000,
        formattedNetPaid: "۵۰,۰۰۰ تومان",
        isFree: false,
      },
      fileFinancialSummary: {
        documentId: docId,
        documentName: "test-document.pdf",
        totalOperationsCount: 1,
        totalDebitedToman: 50000,
        totalRefundedToman: 0,
        totalNetPaidToman: 50000,
        formattedTotalNetPaid: "۵۰,۰۰۰ تومان",
        isComplete: true,
        hasUnavailableRecords: false,
        hasRefundedRecords: false,
        operations: [
          {
            jobId,
            type: "course",
            status: "completed",
            createdAt: new Date().toISOString(),
            userCost: {
              isAvailable: true,
              status: "debited",
              statusLabel: "کسر شده از کیف پول",
              chargedAmountToman: 50000,
              refundedAmountToman: 0,
              netPaidAmountToman: 50000,
              formattedNetPaid: "۵۰,۰۰۰ تومان",
              isFree: false,
            },
          },
        ],
      },
    });

    // 3. Request generation job detail
    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/generation/${jobId}`,
      headers: {
        cookie: `avana_session=${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.userCost).toBeDefined();
    expect(json.userCost.status).toBe("debited");
    expect(json.userCost.chargedAmountToman).toBe(50000);
    expect(json.userCost.netPaidAmountToman).toBe(50000);
    expect(json.fileFinancialSummary).toBeDefined();
    expect(json.fileFinancialSummary.totalNetPaidToman).toBe(50000);
    expect(json.fileFinancialSummary.isComplete).toBe(true);
    // 4. Request generation jobs list
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/generation",
      headers: {
        cookie: `avana_session=${adminToken}`,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const listJson = listRes.json();
    expect(listJson.jobs).toBeDefined();
    expect(listJson.jobs.length).toBeGreaterThanOrEqual(1);
    expect(listJson.jobs[0].userCost).toBeDefined();
    expect(listJson.jobs[0].userCost.status).toBe("debited");
    expect(listJson.jobs[0].userCost.chargedAmountToman).toBe(50000);

    await app.close();
  });
});
