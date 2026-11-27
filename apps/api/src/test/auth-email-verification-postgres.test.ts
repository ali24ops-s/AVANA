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
import { resolveSafePostgresTestUrl, assertSafeDestructiveTestOperation } from "./pg-test-guard.js";

describe("Real PostgreSQL Integration - Email Verification Flow", () => {
  let dbClient: ReturnType<typeof createDbClient>;
  let postgresUrl = "";
  let isConnected = false;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    postgresUrl = resolveSafePostgresTestUrl();
    dbClient = createDbClient(postgresUrl);
    await dbClient.db.execute(sql`SELECT 1;`);
    isConnected = true;
  });

  afterAll(async () => {
    if (dbClient && isConnected && postgresUrl && createdEmails.length > 0) {
      assertSafeDestructiveTestOperation("DELETE", postgresUrl);
      for (const email of createdEmails) {
        await dbClient.db.execute(sql`DELETE FROM users WHERE email = ${email};`).catch(() => {});
      }
    }
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
    createdEmails.push(testEmail);
    const testPhone = `0912${String(Math.floor(1000000 + Math.random() * 9000000))}`;
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
      payload: {
        email: testEmail,
        password: testPassword,
        name: "PG User",
        phoneNumber: testPhone,
      },
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

  it("preserves registration (200) without rollback in real PostgreSQL DB when Email Provider fails and allows resend", async (ctx) => {
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
    createdEmails.push(failEmail);
    const failPhone = `0912${String(Math.floor(1000000 + Math.random() * 9000000))}`;
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

    // A & B & C: Register with email; even if initial email provider fails, registration succeeds (200)
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: failEmail,
        password,
        name: "Failed Email User",
        phoneNumber: failPhone,
      },
    });
    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.emailVerified).toBe(false);
    const sessionToken = extractSessionToken(regRes);
    expect(sessionToken).toBeDefined();

    // D & E: Directly query PostgreSQL database to verify user EXISTS with email_verified_at = NULL
    const userDbRow = await dbClient.db.execute(
      sql`SELECT id, email_verified_at FROM users WHERE email = ${failEmail};`,
    );
    expect(userDbRow.rows.length).toBe(1);
    expect(userDbRow.rows[0].email_verified_at).toBeNull();

    // F: Sign-in with that email and password succeeds (200)
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: failEmail, password },
    });
    expect(loginRes.statusCode).toBe(200);

    // G: Sign in on app2 (with working EmailService) and retry verification email via POST /v1/auth/verification/send -> 200
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

    const app2LoginRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: failEmail, password },
    });
    expect(app2LoginRes.statusCode).toBe(200);
    const app2SessionToken = extractSessionToken(app2LoginRes);
    expect(app2SessionToken).toBeDefined();

    const resendRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/verification/send",
      cookies: { avana_session: app2SessionToken! },
      payload: { channel: "email" },
    });
    expect(resendRes.statusCode).toBe(200);
    expect(mockEmailService.getLastCodeFor(failEmail)).toMatch(/^\d{6}$/);

    await app.close();
    await app2.close();
  });
});
