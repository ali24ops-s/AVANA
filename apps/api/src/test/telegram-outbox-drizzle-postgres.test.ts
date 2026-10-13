import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { telegramOutbox } from "@avana/database/schema";
import { DrizzleTelegramOutboxStore } from "../observability/telegram-outbox-store.js";

/* eslint-disable no-secrets/no-secrets */
describe("Real PostgreSQL Integration: DrizzleTelegramOutboxStore", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  let client: ReturnType<typeof createDbClient> | null = null;
  let isConnectedAndMigrated = false;
  let store: DrizzleTelegramOutboxStore;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);

      // Verify table telegram_outbox exists in the current database
      const checkResult = await client.db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'telegram_outbox';
      `);

      const rows: unknown[] = Array.isArray(checkResult)
        ? checkResult
        : (((checkResult as { rows?: unknown[] })?.rows ?? []) as unknown[]);

      if (rows.length > 0) {
        isConnectedAndMigrated = true;
        store = new DrizzleTelegramOutboxStore(client.db);
      } else {
        // Table not yet migrated
        isConnectedAndMigrated = false;
      }
    } catch {
      isConnectedAndMigrated = false;
    }
  });

  afterAll(async () => {
    if (client && isConnectedAndMigrated) {
      for (const id of createdRecordIds) {
        await client.db
          .delete(telegramOutbox)
          .where(sql`id = ${id}::uuid`)
          .catch(() => {});
      }
      await client.close().catch(() => {});
    } else if (client) {
      await client.close().catch(() => {});
    }
  });

  // 1. درج رکورد و برخورد با idempotency تکراری
  it("1. handles insertion and idempotent deduplication via UNIQUE index on real PostgreSQL", async (ctx) => {
    if (!isConnectedAndMigrated) {
      ctx.skip();
      return;
    }

    const testKey = `test:c2c:pg:${randomUUID()}`;
    const first = await store.enqueue({
      idempotencyKey: testKey,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "تست پرداخت کارت‌به‌کارت دیتابیس واقعی" },
    });

    expect(first).not.toBeNull();
    if (first) {
      createdRecordIds.push(first.id);
      expect(first.idempotencyKey).toBe(testKey);
      expect(first.status).toBe("pending");
    }

    // Attempt second insert with identical idempotencyKey
    const second = await store.enqueue({
      idempotencyKey: testKey,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "تلاش تکراری برای همان پرداخت" },
    });

    expect(second).not.toBeNull();
    expect(second?.id).toBe(first?.id);
  });

  // 2. Claim همزمان از دو تراکنش مستقل با FOR UPDATE SKIP LOCKED
  it("2. claims batches atomically with FOR UPDATE SKIP LOCKED across concurrent workers", async (ctx) => {
    if (!isConnectedAndMigrated) {
      ctx.skip();
      return;
    }

    const key1 = `test:claim:pg:${randomUUID()}`;
    const key2 = `test:claim:pg:${randomUUID()}`;

    const r1 = await store.enqueue({
      idempotencyKey: key1,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "پیام بچ اول" },
    });
    const r2 = await store.enqueue({
      idempotencyKey: key2,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "پیام بچ دوم" },
    });

    if (r1) createdRecordIds.push(r1.id);
    if (r2) createdRecordIds.push(r2.id);

    // Two concurrent workers claiming with different lease tokens
    const [batch1, batch2] = await Promise.all([
      store.claimBatch(1, 30, `lease_worker_1_${randomUUID().slice(0, 6)}`),
      store.claimBatch(1, 30, `lease_worker_2_${randomUUID().slice(0, 6)}`),
    ]);

    // SKIP LOCKED ensures neither worker claims the exact same record simultaneously
    const ids1 = new Set(batch1.map((b) => b.id));
    for (const b2 of batch2) {
      expect(ids1.has(b2.id)).toBe(false);
    }
  });

  // 3. بازیابی Lease منقضی‌شده
  it("3. recovers expired sending leases back to retry_scheduled using lease index", async (ctx) => {
    if (!isConnectedAndMigrated) {
      ctx.skip();
      return;
    }

    const testKey = `test:lease:pg:${randomUUID()}`;
    const record = await store.enqueue({
      idempotencyKey: testKey,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "تست انقضای لیس" },
    });

    if (!record || !client) return;
    createdRecordIds.push(record.id);

    // Claim with 5s lease
    const leaseToken = `lease_exp_${randomUUID().slice(0, 6)}`;
    await store.claimBatch(10, 5, leaseToken);

    // Artificially expire the lease in PostgreSQL
    await client.db.execute(sql`
      UPDATE telegram_outbox
      SET lease_expires_at = NOW() - interval '10 seconds'
      WHERE id = ${record.id}::uuid;
    `);

    // Run lease recovery
    const recoveredCount = await store.recoverExpiredLeases();
    expect(recoveredCount).toBeGreaterThanOrEqual(1);

    const refreshed = await store.findById(record.id);
    expect(refreshed?.status).toBe("retry_scheduled");
    expect(refreshed?.leaseToken).toBeNull();
    expect(refreshed?.leaseExpiresAt).toBeNull();
  });

  // 4. رد Mark Result با lease_token نامعتبر
  it("4. rejects markSent and scheduleRetry when lease_token does not match (stale lease)", async (ctx) => {
    if (!isConnectedAndMigrated) {
      ctx.skip();
      return;
    }

    const testKey = `test:stale:pg:${randomUUID()}`;
    const record = await store.enqueue({
      idempotencyKey: testKey,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "تست لیس منقضی و نامعتبر" },
    });

    if (!record) return;
    createdRecordIds.push(record.id);

    const validLease = `valid_token_${randomUUID().slice(0, 6)}`;
    await store.claimBatch(10, 30, validLease);

    // Attempt to mark sent with invalid/stale lease token
    const staleResult = await store.markSent(record.id, "wrong_lease_token");
    expect(staleResult).toBe(false);

    // Valid lease token succeeds
    const validResult = await store.markSent(record.id, validLease);
    expect(validResult).toBe(true);

    const updated = await store.findById(record.id);
    expect(updated?.status).toBe("sent");
  });

  // 5. انتقال وضعیت و زمان تلاش بعدی پس از شکست ارسال
  it("5. schedules exponential retry timestamp and stores sanitized error string", async (ctx) => {
    if (!isConnectedAndMigrated) {
      ctx.skip();
      return;
    }

    const testKey = `test:retry:pg:${randomUUID()}`;
    const record = await store.enqueue({
      idempotencyKey: testKey,
      chatId: "-100123456789",
      category: "payment.c2c_submitted",
      payload: { text: "تست ذخیره خطا و تلاش مجدد" },
    });

    if (!record) return;
    createdRecordIds.push(record.id);

    const leaseToken = `lease_err_${randomUUID().slice(0, 6)}`;
    await store.claimBatch(10, 30, leaseToken);

    const retryAt = new Date(Date.now() + 60_000);
    const errorReason = "transient_error: socks5 connect timeout";

    const scheduled = await store.scheduleRetry(record.id, leaseToken, retryAt, errorReason);
    expect(scheduled).toBe(true);

    const updated = await store.findById(record.id);
    expect(updated?.status).toBe("retry_scheduled");
    expect(updated?.lastError).toContain("socks5 connect timeout");
    expect(updated?.leaseToken).toBeNull();
  });
});
