import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { createDbClient } from "@avana/database/client";
import {
  DrizzleSessionStore,
  DrizzleUserStore,
  DrizzleEmailVerificationStore,
  MockEmailService,
  type EmailService,
} from "../modules/identity/index.js";
import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";
import { sql } from "drizzle-orm";

const postgresUrl =
  process.env.DATABASE_URL ??
  `postgres://${"avana"}:${"avana"}@127.0.0.1:5432/avana?sslmode=disable`;

describe("Real PostgreSQL Integration - Email Verification Flow", () => {
  let dbClient: ReturnType<typeof createDbClient>;
  let isConnected = false;

  beforeAll(async () => {
    try {
      dbClient = createDbClient(postgresUrl);
      await dbClient.db.execute(sql`SELECT 1;`);
      isConnected = true;
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (dbClient) {
      await dbClient.close().catch(() => {});
    }
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  it("persists email verification in real PostgreSQL database through full lifecycle", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }
    const config = loadApiConfig();
    const mockEmailService = new MockEmailService();

    const sessionStore = new DrizzleSessionStore(dbClient.db);
    const userStore = new DrizzleUserStore(dbClient.db);
    const emailVerificationStore = new DrizzleEmailVerificationStore(dbClient.db);
    const organizationStore = new DrizzleOrganizationStore(dbClient.db);

    const testEmail = `realpg_${Date.now()}@example.com`;
    const testPassword = "password123!";

    // 1. App Instance 1: Register User
    const app1 = createApp({ config });
    await app1.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService: mockEmailService,
      organizationStore,
    });

    const regRes = await app1.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: testEmail, password: testPassword, name: "PG User" },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.emailVerified).toBe(false);

    const token1 = extractSessionToken(regRes)!;
    expect(token1).toBeDefined();

    const sentCode = mockEmailService.getLastCodeFor(testEmail);
    expect(sentCode).toBeDefined();
    expect(sentCode).toMatch(/^\d{6}$/);

    // 2. Query Real PostgreSQL DB directly to verify code hash and email_verified_at state
    const userDbRow = await dbClient.db.execute(
      sql`SELECT id, email_verified_at FROM users WHERE email = ${testEmail};`,
    );
    expect(userDbRow.rows.length).toBe(1);
    expect(userDbRow.rows[0].email_verified_at).toBeNull();

    const userId = userDbRow.rows[0].id as string;
    const codeDbRow = await dbClient.db.execute(
      sql`SELECT id, code_hash, used_at FROM email_verification_codes WHERE user_id = ${userId}::uuid;`,
    );
    expect(codeDbRow.rows.length).toBe(1);
    expect(codeDbRow.rows[0].code_hash).not.toBe(sentCode); // Hashed, not plaintext!
    expect(codeDbRow.rows[0].used_at).toBeNull();

    // 3. Verify Email via API
    const verifyRes = await app1.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      cookies: { avana_session: token1 },
      payload: { code: sentCode },
    });

    expect(verifyRes.statusCode).toBe(200);
    expect(JSON.parse(verifyRes.body).user.emailVerified).toBe(true);

    await app1.close();

    // 4. Query Real PostgreSQL DB directly to verify email_verified_at is persisted!
    const verifiedUserDbRow = await dbClient.db.execute(
      sql`SELECT email_verified_at FROM users WHERE email = ${testEmail};`,
    );
    expect(verifiedUserDbRow.rows[0].email_verified_at).not.toBeNull();

    // 5. Restart / Re-initialize App Instance 2 (Simulate server restart)
    const app2 = createApp({ config });
    await app2.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService: mockEmailService,
      organizationStore,
    });

    // Login on new app instance
    const loginRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: testEmail, password: testPassword },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.user.emailVerified).toBe(true);

    const token2 = extractSessionToken(loginRes)!;

    // GET /v1/me returns emailVerified = true
    const meRes = await app2.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: token2 },
    });

    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).user.emailVerified).toBe(true);

    await app2.close();
  });

  it("verifies registration failure rollback in real PostgreSQL DB when Email Provider fails", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }
    const config = loadApiConfig();

    class FailingPgEmailService implements EmailService {
      async sendVerificationCode(): Promise<void> {
        throw new Error("Simulated Resend API delivery failure on PostgreSQL");
      }
    }

    const failingEmailService = new FailingPgEmailService();
    const sessionStore = new DrizzleSessionStore(dbClient.db);
    const userStore = new DrizzleUserStore(dbClient.db);
    const emailVerificationStore = new DrizzleEmailVerificationStore(dbClient.db);
    const organizationStore = new DrizzleOrganizationStore(dbClient.db);

    const failEmail = `realpg_fail_${Date.now()}@unregistered-domain.org`;
    const password = "Password123!";

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService: failingEmailService,
      organizationStore,
    });

    // A & B & C: Register with email, email provider fails -> 500 error returned
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: failEmail, password, name: "Failed User" },
    });
    expect(regRes.statusCode).toBe(500);

    // D & E: Directly query PostgreSQL database to verify user does NOT exist
    const userDbRow = await dbClient.db.execute(
      sql`SELECT id FROM users WHERE email = ${failEmail};`,
    );
    expect(userDbRow.rows.length).toBe(0);

    // F: Attempt login with that email and password -> 401 Unauthorized
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: failEmail, password },
    });
    expect(loginRes.statusCode).toBe(401);

    // G: Re-register with the exact same email -> Registration succeeds!
    const mockEmailService = new MockEmailService();
    const app2 = createApp({ config });
    await app2.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService: mockEmailService,
      organizationStore,
    });

    const retryRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: failEmail, password, name: "Retried User" },
    });
    expect(retryRes.statusCode).toBe(200);

    // Verify user now exists in PostgreSQL
    const retryDbRow = await dbClient.db.execute(
      sql`SELECT id FROM users WHERE email = ${failEmail};`,
    );
    expect(retryDbRow.rows.length).toBe(1);

    await app.close();
    await app2.close();
  });
});
