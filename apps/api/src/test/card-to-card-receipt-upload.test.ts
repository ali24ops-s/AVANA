/**
 * Integration Test Suite: Card-to-Card Payment Receipt Upload & Streaming.
 */

import { describe, expect, it, beforeEach } from "vitest";
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
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryCommerceStore,
  MockPaymentGateway,
} from "../modules/commerce/index.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

function buildMultipartBody(options: {
  filename: string;
  contentType: string;
  data: Buffer;
}): { body: Buffer; contentType: string } {
  const boundary = "----avana-test-receipt-boundary";
  const chunks: Buffer[] = [];

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename}"\r\nContent-Type: ${options.contentType}\r\n\r\n`,
    ),
    options.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("Card-to-Card Payment Receipt Upload & Streaming Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let paymentGateway: MockPaymentGateway;
  let storageProvider: LocalStorageProvider;
  let auditService: AuditService;
  let tmpDir: string;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore(undefined, undefined, undefined, commerceStore);
    paymentGateway = new MockPaymentGateway();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-receipt-test-"));
    storageProvider = new LocalStorageProvider(tmpDir);
    auditService = new AuditService(new InMemoryAuditStore());
  });

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      adminStore,
      paymentGateway,
      storageProvider,
      auditService,
    });
    await app.ready();
    return app;
  }

  let phoneIndex = 500000;
  async function registerAndLogin(app: any, email: string, role = "student") {
    phoneIndex++;
    const signupRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "Password123!",
        name: "Test User",
        phoneNumber: `0912${String(phoneIndex).padStart(7, "0")}`,
      },
    });

    const token = extractSessionToken(signupRes);

    if (role === "platform_admin") {
      const user = await userStore.findByEmail(email);
      if (user) {
        const u = (userStore as any).users?.get(user.id);
        if (u) {
          u.globalRole = "platform_admin";
          u.role = "platform_admin";
        }
      }
    }

    return { token, email, res: signupRes };
  }

  describe("1. Receipt Upload Endpoint (POST /v1/commerce/payments/receipt)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const app = await buildTestApp();
      const fakeImage = Buffer.from("fake-image-bytes");
      const { body, contentType } = buildMultipartBody({
        filename: "receipt.jpg",
        contentType: "image/jpeg",
        data: fakeImage,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(401);
    });

    it("uploads a valid JPG receipt image successfully and returns 201 with isolated path", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer1@avana.ir");

      const imageBytes = Buffer.from("dummy-jpg-data-12345");
      const { body, contentType } = buildMultipartBody({
        filename: "my_bank_receipt.jpg",
        contentType: "image/jpeg",
        data: imageBytes,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
          cookie: `avana_session=${token}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.payload);
      expect(data.receipt_url).toBeDefined();
      expect(data.storage_key).toBeDefined();
      expect(data.storage_key).toMatch(/^receipts\/[0-9a-f-]+\.jpg$/);
      // User's original file name is never leaked in storageKey
      expect(data.storage_key).not.toContain("my_bank_receipt");

      // Verify file is persisted in storageProvider
      const exists = await storageProvider.exists(data.storage_key);
      expect(exists).toBe(true);
      const readBytes = await storageProvider.read(data.storage_key);
      expect(readBytes.toString()).toBe("dummy-jpg-data-12345");
    });

    it("supports PNG and WebP formats", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer2@avana.ir");

      // PNG
      const pngBody = buildMultipartBody({
        filename: "receipt.png",
        contentType: "image/png",
        data: Buffer.from("dummy-png-bytes"),
      });

      const pngRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": pngBody.contentType,
          cookie: `avana_session=${token}`,
        },
        payload: pngBody.body,
      });

      expect(pngRes.statusCode).toBe(201);
      const pngData = JSON.parse(pngRes.payload);
      expect(pngData.storage_key).toMatch(/\.png$/);

      // WebP
      const webpBody = buildMultipartBody({
        filename: "receipt.webp",
        contentType: "image/webp",
        data: Buffer.from("dummy-webp-bytes"),
      });

      const webpRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": webpBody.contentType,
          cookie: `avana_session=${token}`,
        },
        payload: webpBody.body,
      });

      expect(webpRes.statusCode).toBe(201);
      const webpData = JSON.parse(webpRes.payload);
      expect(webpData.storage_key).toMatch(/\.webp$/);
    });

    it("rejects invalid MIME types (e.g. PDF or text)", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer3@avana.ir");

      const pdfBody = buildMultipartBody({
        filename: "statement.pdf",
        contentType: "application/pdf",
        data: Buffer.from("%PDF-1.4..."),
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": pdfBody.contentType,
          cookie: `avana_session=${token}`,
        },
        payload: pdfBody.body,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.error.message).toContain("فرمت فایل نامعتبر است");
    });

    it("rejects files exceeding 5MB size limit", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer4@avana.ir");

      // 5.5 MB buffer
      const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, "a");
      const largeBody = buildMultipartBody({
        filename: "huge.jpg",
        contentType: "image/jpeg",
        data: largeBuffer,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": largeBody.contentType,
          cookie: `avana_session=${token}`,
        },
        payload: largeBody.body,
      });

      expect(res.statusCode).toBe(413);
    });
  });

  describe("2. End-to-End Card-to-Card Payment Submission with Receipt", () => {
    it("submits payment with uploaded receipt and stores receipt_url in payment record", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer5@avana.ir");

      // 1. Upload receipt
      const imageBytes = Buffer.from("actual-receipt-content");
      const { body, contentType } = buildMultipartBody({
        filename: "receipt.jpg",
        contentType: "image/jpeg",
        data: imageBytes,
      });

      const uploadRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
          cookie: `avana_session=${token}`,
        },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(201);
      const { receipt_url } = JSON.parse(uploadRes.payload);

      // 2. Submit C2C payment
      const productsRes = await app.inject({
        method: "GET",
        url: "/v1/commerce/products",
      });
      const products = JSON.parse(productsRes.payload).items;
      const subPlan = products.find((p: any) => p.code === "sub_monthly");

      const submitRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/card-to-card",
        headers: {
          cookie: `avana_session=${token}`,
        },
        payload: {
          product_id: subPlan.id,
          amount: subPlan.price,
          tracking_number: "TRK-RECEIPT-999",
          source_card_last4: "4321",
          payment_date: "1404/12/18",
          payment_time: "14:30",
          payer_name: "خریدار تست",
          receipt_url,
        },
      });

      expect(submitRes.statusCode).toBe(201);
      const submitData = JSON.parse(submitRes.payload);
      expect(submitData.paymentId).toBeDefined();

      // 3. Get single payment details and verify receipt_url
      const getPaymentRes = await app.inject({
        method: "GET",
        url: `/v1/commerce/payments/${submitData.paymentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      expect(getPaymentRes.statusCode).toBe(200);
      const payment = JSON.parse(getPaymentRes.payload).payment;
      expect(payment.receipt_url).toBe(receipt_url);
      expect(payment.tracking_number).toBe("TRK-RECEIPT-999");
      expect(payment.source_card_last4).toBe("4321");
    });

    it("supports backward compatibility: submitting payment without receipt is completely valid", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "payer6@avana.ir");

      const productsRes = await app.inject({
        method: "GET",
        url: "/v1/commerce/products",
      });
      const subPlan = JSON.parse(productsRes.payload).items.find(
        (p: any) => p.code === "sub_monthly",
      );

      const submitRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/card-to-card",
        headers: {
          cookie: `avana_session=${token}`,
        },
        payload: {
          product_id: subPlan.id,
          amount: subPlan.price,
          tracking_number: "TRK-NO-RECEIPT-111",
          source_card_last4: "8888",
        },
      });

      expect(submitRes.statusCode).toBe(201);
      const submitData = JSON.parse(submitRes.payload);

      const getPaymentRes = await app.inject({
        method: "GET",
        url: `/v1/commerce/payments/${submitData.paymentId}`,
        headers: {
          cookie: `avana_session=${token}`,
        },
      });

      const payment = JSON.parse(getPaymentRes.payload).payment;
      expect(payment.receipt_url).toBeNull();
    });
  });

  describe("3. Secure Receipt Streaming & Authorization (GET /v1/commerce/receipts/*)", () => {
    it("allows the owner of the payment to view their receipt image", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "owner@avana.ir");

      // Upload receipt
      const imageBytes = Buffer.from("super-secret-receipt-image");
      const { body, contentType } = buildMultipartBody({
        filename: "receipt.png",
        contentType: "image/png",
        data: imageBytes,
      });

      const uploadRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
          cookie: `avana_session=${token}`,
        },
        payload: body,
      });

      const { receipt_url } = JSON.parse(uploadRes.payload);

      // Submit payment
      const productsRes = await app.inject({
        method: "GET",
        url: "/v1/commerce/products",
      });
      const subPlan = JSON.parse(productsRes.payload).items.find(
        (p: any) => p.code === "sub_monthly",
      );

      await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/card-to-card",
        headers: { cookie: `avana_session=${token}` },
        payload: {
          product_id: subPlan.id,
          amount: subPlan.price,
          tracking_number: "TRK-STREAM-1",
          source_card_last4: "1111",
          receipt_url,
        },
      });

      // Stream receipt as owner
      const streamRes = await app.inject({
        method: "GET",
        url: receipt_url,
        headers: { cookie: `avana_session=${token}` },
      });

      expect(streamRes.statusCode).toBe(200);
      expect(streamRes.headers["content-type"]).toBe("image/png");
      expect(streamRes.headers["content-disposition"]).toContain("inline");
      expect(streamRes.rawPayload.toString()).toBe("super-secret-receipt-image");
    });

    it("allows platform_admin to view any user's receipt image", async () => {
      const app = await buildTestApp();
      const { token: userToken } = await registerAndLogin(app, "user1@avana.ir");
      const { token: adminToken } = await registerAndLogin(app, "admin@avana.ir", "platform_admin");

      // User uploads and creates payment
      const imageBytes = Buffer.from("admin-viewable-receipt");
      const { body, contentType } = buildMultipartBody({
        filename: "receipt.jpg",
        contentType: "image/jpeg",
        data: imageBytes,
      });

      const uploadRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
          cookie: `avana_session=${userToken}`,
        },
        payload: body,
      });

      const { receipt_url } = JSON.parse(uploadRes.payload);

      const productsRes = await app.inject({
        method: "GET",
        url: "/v1/commerce/products",
      });
      const subPlan = JSON.parse(productsRes.payload).items[0];

      await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/card-to-card",
        headers: { cookie: `avana_session=${userToken}` },
        payload: {
          product_id: subPlan.id,
          amount: subPlan.price,
          tracking_number: "TRK-ADMIN-VIEW",
          source_card_last4: "2222",
          receipt_url,
        },
      });

      // Admin accesses the receipt
      const adminRes = await app.inject({
        method: "GET",
        url: receipt_url,
        headers: { cookie: `avana_session=${adminToken}` },
      });

      expect(adminRes.statusCode).toBe(200);
      expect(adminRes.rawPayload.toString()).toBe("admin-viewable-receipt");
    });

    it("forbids another regular user from viewing someone else's payment receipt", async () => {
      const app = await buildTestApp();
      const { token: user1Token } = await registerAndLogin(app, "victim@avana.ir");
      const { token: user2Token } = await registerAndLogin(app, "attacker@avana.ir");

      // User1 uploads receipt and creates payment
      const imageBytes = Buffer.from("victim-sensitive-data");
      const { body, contentType } = buildMultipartBody({
        filename: "receipt.jpg",
        contentType: "image/jpeg",
        data: imageBytes,
      });

      const uploadRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/receipt",
        headers: {
          "content-type": contentType,
          cookie: `avana_session=${user1Token}`,
        },
        payload: body,
      });

      const { receipt_url } = JSON.parse(uploadRes.payload);

      const productsRes = await app.inject({
        method: "GET",
        url: "/v1/commerce/products",
      });
      const subPlan = JSON.parse(productsRes.payload).items[0];

      await app.inject({
        method: "POST",
        url: "/v1/commerce/payments/card-to-card",
        headers: { cookie: `avana_session=${user1Token}` },
        payload: {
          product_id: subPlan.id,
          amount: subPlan.price,
          tracking_number: "TRK-VICTIM-1",
          source_card_last4: "3333",
          receipt_url,
        },
      });

      // Attacker tries to access receipt_url
      const attackRes = await app.inject({
        method: "GET",
        url: receipt_url,
        headers: { cookie: `avana_session=${user2Token}` },
      });

      expect(attackRes.statusCode).toBe(403);
    });

    it("rejects path traversal attempts with 400", async () => {
      const app = await buildTestApp();
      const { token } = await registerAndLogin(app, "traversal@avana.ir");

      const res = await app.inject({
        method: "GET",
        url: "/v1/commerce/receipts/..%2F..%2Fetc%2Fpasswd",
        headers: { cookie: `avana_session=${token}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
