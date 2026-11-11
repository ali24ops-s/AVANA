/**
 * Error Monitoring & Observability Core Test Suite (Phase 1).
 *
 * Verifies:
 * - Deterministic, versioned SHA-256 fingerprinting
 * - Group splintering prevention (message normalization: UUIDs, timestamps, IDs)
 * - Environment inclusion & appVersion metadata independence
 * - Context sanitization (passwords, tokens, OTPs, auth headers, cookies)
 * - Ingestion & atomic counters (totalOccurrences, affectedUsersCount)
 * - User deduplication (same user vs distinct users vs anonymous)
 * - High-concurrency atomic upserts
 * - Intelligent sampling (full capture on initial occurrences, throttled events)
 * - Layer-traversal deduplication with Symbol
 * - Fail-Safe queue & non-crashing store error handling
 * - Filtering logic (4xx vs 5xx / DomainError / internal)
 * - Fastify integration & x-request-id propagation on 200 and 500
 * - Admin REST endpoints RBAC & operations (list, details, events, status, notes)
 * - Backwards-compatible /admin/system/logs adapter
 */

import { describe, expect, it, vi } from "vitest";
import {
  ErrorMonitoringService,
  InMemoryErrorStore,
  CAPTURED_ERROR_SYMBOL,
  CAPTURE_IN_PROGRESS_SYMBOL,
  isCapturedError,
  markErrorAsCaptured,
  sanitizeText,
} from "../observability/index.js";
import { sanitizeRequestId } from "../http/requestId.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { Roles, DomainError } from "@avana/domain";

describe("Error Monitoring Core - Fingerprinting & Normalization", () => {
  it("Scenario 1: Computes identical deterministic fingerprint for identical errors", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store, environment: "production" });

    const err1 = new Error("Database query timeout on table users");
    const err2 = new Error("Database query timeout on table users");

    const fp1 = service.computeFingerprint({
      fingerprintVersion: 1,
      environment: "production",
      source: "backend",
      feature: "api",
      normalizedMessage: service.normalizeErrorMessage(err1.message),
    });

    const fp2 = service.computeFingerprint({
      fingerprintVersion: 1,
      environment: "production",
      source: "backend",
      feature: "api",
      normalizedMessage: service.normalizeErrorMessage(err2.message),
    });

    expect(fp1).toHaveLength(64);
    expect(fp1).toBe(fp2);
  });

  it("Scenario 2: Differentiates fingerprints across different environments", () => {
    const store = new InMemoryErrorStore();
    const prodService = new ErrorMonitoringService({ store, environment: "production" });
    const devService = new ErrorMonitoringService({ store, environment: "development" });

    const err = new Error("Connection lost");
    const norm = prodService.normalizeErrorMessage(err.message);

    const prodFp = prodService.computeFingerprint({
      fingerprintVersion: 1,
      environment: "production",
      source: "backend",
      feature: "api",
      normalizedMessage: norm,
    });
    const devFp = devService.computeFingerprint({
      fingerprintVersion: 1,
      environment: "development",
      source: "backend",
      feature: "api",
      normalizedMessage: norm,
    });

    expect(prodFp).not.toBe(devFp);
  });

  it("Scenario 3: AppVersion change preserves the same fingerprint (stored as metadata)", () => {
    const store = new InMemoryErrorStore();
    const serviceV1 = new ErrorMonitoringService({
      store,
      environment: "production",
      appVersion: "1.0.0",
    });
    const serviceV2 = new ErrorMonitoringService({
      store,
      environment: "production",
      appVersion: "1.1.0",
    });

    const err = new Error("Syntax error in template engine");
    const norm = serviceV1.normalizeErrorMessage(err.message);

    const fp1 = serviceV1.computeFingerprint({
      fingerprintVersion: 1,
      environment: "production",
      source: "backend",
      feature: "api",
      normalizedMessage: norm,
    });
    const fp2 = serviceV2.computeFingerprint({
      fingerprintVersion: 1,
      environment: "production",
      source: "backend",
      feature: "api",
      normalizedMessage: norm,
    });

    expect(fp1).toBe(fp2);
  });

  it("Scenario 4: Normalizes dynamic parameters (UUIDs, timestamps, large numbers, IPs) to prevent group splintering", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    const uuid1 = "123e4567-e89b-12d3-a456-426614174000";
    const uuid2 = "987fcdeb-51a2-43f7-9012-3456789abcde";

    const normalized1 = service.normalizeErrorMessage(
      `Failed to load resource for user ${uuid1} at 2026-11-03T18:00:00.000Z from IP 192.168.1.50 with ID 992837482`,
    );
    const normalized2 = service.normalizeErrorMessage(
      `Failed to load resource for user ${uuid2} at 2026-11-03T19:30:15.123Z from IP 10.0.0.1 with ID 112233445`,
    );

    expect(normalized1).toBe(normalized2);
    expect(normalized1).toContain(":uuid");
    expect(normalized1).toContain(":timestamp");
    expect(normalized1).toContain(":ip");
    expect(normalized1).toContain(":id");
  });
});

describe("Error Monitoring Core - Sanitization & Filtering", () => {
  it("Scenario 5: Redacts sensitive keys and values in context", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    const rawContext = {
      user: {
        id: "usr_123",
        password: "SuperSecretPassword123!",
        otpCode: "948271",
        token: "jwt.secret.token",
      },
      headers: {
        authorization: "Bearer secret-bearer-token",
        "set-cookie": "session_id=abcdef; Secure",
        cookie: "cookie_val=secret",
      },
      safeMetadata: {
        action: "login",
        attempt: 2,
      },
    };

    const sanitized = service.sanitizeContext(rawContext) as Record<string, unknown>;
    const user = sanitized.user as Record<string, unknown>;
    const headers = sanitized.headers as Record<string, unknown>;
    const safeMetadata = sanitized.safeMetadata as Record<string, unknown>;

    expect(user.password).toBe("[REDACTED]");
    expect(user.otpCode).toBe("[REDACTED]");
    expect(user.token).toBe("[REDACTED]");
    expect(user.id).toBe("usr_123");

    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers["set-cookie"]).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");

    expect(safeMetadata.action).toBe("login");
    expect(safeMetadata.attempt).toBe(2);
  });

  it("Scenario 6: Filters standard 4xx client errors while capturing 5xx and severe DomainErrors", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    // Client errors that should NOT be captured
    expect(service.shouldCapture(new Error("Unauthorized"), 401)).toBe(false);
    expect(service.shouldCapture(new Error("Forbidden"), 403)).toBe(false);
    expect(service.shouldCapture(new Error("Not Found"), 404)).toBe(false);

    // Standard 500 should be captured
    expect(service.shouldCapture(new Error("Internal Server Error"), 500)).toBe(true);

    // DomainError with 4xx is NOT captured
    const notFoundDomain = new DomainError("COURSE_NOT_FOUND", "Course not found");
    expect(service.shouldCapture(notFoundDomain, 404)).toBe(false);

    // Severe DomainError (e.g. database, internal, unexpected) IS captured
    const fatalDomain = new DomainError("DATABASE_UNAVAILABLE", "DB unreachable");
    expect(service.shouldCapture(fatalDomain, 503)).toBe(true);
  });

  it("Scenario 7: Prevents duplicate captures across layers using Symbol marking", () => {
    const err = new Error("Single business operation failure");
    expect(isCapturedError(err)).toBe(false);

    markErrorAsCaptured(err);
    expect(isCapturedError(err)).toBe(true);

    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });
    expect(service.shouldCapture(err, 500)).toBe(false);
  });
});

describe("Error Monitoring Core - Ingestion, Grouping & Affected Users", () => {
  it("Scenario 8: Group creation and atomic user count increment", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store, environment: "test" });

    const user1 = "usr_user_1";
    const user2 = "usr_user_2";

    // 1st occurrence (User 1)
    await service.captureErrorSync({
      error: new Error("Payment gateway failure"),
      source: "backend",
      severity: "critical",
      userId: user1,
    });

    const groups1 = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups1.items).toHaveLength(1);
    expect(groups1.items[0].totalOccurrences).toBe(1);
    expect(groups1.items[0].affectedUsersCount).toBe(1);

    // 2nd occurrence: SAME error, SAME user
    await service.captureErrorSync({
      error: new Error("Payment gateway failure"),
      source: "backend",
      severity: "critical",
      userId: user1,
    });

    const groups2 = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups2.items[0].totalOccurrences).toBe(2);
    // affectedUsersCount must NOT increment for the same user
    expect(groups2.items[0].affectedUsersCount).toBe(1);

    // 3rd occurrence: SAME error, DIFFERENT user
    await service.captureErrorSync({
      error: new Error("Payment gateway failure"),
      source: "backend",
      severity: "critical",
      userId: user2,
    });

    const groups3 = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups3.items[0].totalOccurrences).toBe(3);
    // affectedUsersCount MUST increment for user 2
    expect(groups3.items[0].affectedUsersCount).toBe(2);

    // 4th occurrence: SAME error, ANONYMOUS user (undefined)
    await service.captureErrorSync({
      error: new Error("Payment gateway failure"),
      source: "backend",
      severity: "critical",
      userId: undefined,
    });

    const groups4 = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups4.items[0].totalOccurrences).toBe(4);
    // affectedUsersCount stays at 2
    expect(groups4.items[0].affectedUsersCount).toBe(2);
  });

  it("Scenario 9: High concurrency test with Promise.all", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store, environment: "test" });

    const totalRequests = 25;
    const promises = Array.from({ length: totalRequests }, (_, i) =>
      service.captureErrorSync({
        error: new Error("Concurrent write conflict"),
        source: "backend",
        userId: `user_${i % 5}`, // 5 distinct users
      }),
    );

    await Promise.all(promises);

    const result = await store.listGroups({ page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].totalOccurrences).toBe(totalRequests);
    expect(result.items[0].affectedUsersCount).toBe(5);
  });

  it("Scenario 10: Intelligent sampling saves first 10 occurrences, then 1-in-10 thereafter", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({
      store,
      environment: "test",
    });

    // Ingest 25 occurrences of the same error
    for (let i = 1; i <= 25; i++) {
      await service.captureErrorSync({
        error: new Error("Repeated third-party timeout"),
        source: "backend",
      });
    }

    const groups = await store.listGroups({ page: 1, pageSize: 10 });
    const group = groups.items[0];
    expect(group.totalOccurrences).toBe(25);

    // Check stored raw events: first 10 occurrences (1..10) + 20th occurrence = 11 events
    const eventsResult = await store.listEvents({ groupId: group.id, page: 1, pageSize: 50 });
    expect(eventsResult.items).toHaveLength(11);
  });
});

describe("Error Monitoring Core - Fail-Safe & Queue Resilience", () => {
  it("Scenario 11: Swallows store errors without throwing and logs to Pino", async () => {
    const mockStore = new InMemoryErrorStore();
    // Simulate catastrophic store failure
    vi.spyOn(mockStore, "recordOccurrence").mockRejectedValue(new Error("Postgres connection dropped"));

    const loggerErrorSpy = vi.fn();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerErrorSpy,
    };

    const service = new ErrorMonitoringService({
      store: mockStore,
      logger: mockLogger,
      environment: "test",
    });

    // captureError (async bounded queue) must NEVER throw
    expect(() => {
      service.captureError({
        error: new Error("Business crash"),
        source: "backend",
      });
    }).not.toThrow();

    // captureErrorSync also handles fallback gracefully
    await expect(
      service.captureErrorSync({
        error: new Error("Business crash"),
        source: "backend",
      }),
    ).resolves.toBeUndefined();

    // Logger must have logged the storage failure
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it("Scenario 12: Drops events safely when maxQueueSize is exceeded", async () => {
    const slowStore = new InMemoryErrorStore();
    // Simulate slow store operation
    vi.spyOn(slowStore, "recordOccurrence").mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );

    const warnSpy = vi.fn();
    const mockLogger = {
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
    };

    const service = new ErrorMonitoringService({
      store: slowStore,
      logger: mockLogger,
      maxQueueSize: 3, // Very small queue
    });

    // Fire 10 events synchronously into bounded queue
    for (let i = 0; i < 10; i++) {
      service.captureError({
        error: new Error(`Overload event ${i}`),
        source: "backend",
      });
    }

    // Must have triggered drop warnings
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("Error Monitoring Core - Fastify Integration & x-request-id", () => {
  it("Scenario 13: Fastify attaches x-request-id to both successful and error responses", async () => {
    const config = loadApiConfig();
    const errorStore = new InMemoryErrorStore();
    const errorMonitoringService = new ErrorMonitoringService({
      store: errorStore,
      environment: "test",
    });

    const app = createApp({ config, errorMonitoringService });

    // Register a test route that succeeds and one that throws 500
    app.get("/test/success", async () => ({ status: "ok" }));
    app.get("/test/crash", async () => {
      throw new Error("Simulated unexpected route failure");
    });

    // 1. Successful response
    const successRes = await app.inject({
      method: "GET",
      url: "/test/success",
    });
    expect(successRes.statusCode).toBe(200);
    expect(successRes.headers["x-request-id"]).toBeDefined();
    expect(typeof successRes.headers["x-request-id"]).toBe("string");

    // 2. Error response
    const errorRes = await app.inject({
      method: "GET",
      url: "/test/crash",
    });
    expect(errorRes.statusCode).toBe(500);
    expect(errorRes.headers["x-request-id"]).toBeDefined();
    const errorBody = JSON.parse(errorRes.payload);
    expect(errorBody.error).toBeDefined();
    expect(errorBody.request_id).toBeDefined();

    // Verify error was asynchronously captured by ErrorMonitoringService
    // Allow queue to drain
    await new Promise((r) => setTimeout(r, 60));
    const captured = await errorStore.listGroups({ page: 1, pageSize: 10 });
    expect(captured.items.length).toBeGreaterThan(0);
    expect(captured.items[0].title).toContain("Simulated unexpected route failure");
  });
});

describe("Error Monitoring Core - Admin Endpoints & RBAC", () => {
  async function setupAdminTestContext() {
    const config = loadApiConfig();
    const orgStore = new InMemoryOrganizationStore();
    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore(orgStore);
    const errorStore = new InMemoryErrorStore();
    const errorMonitoringService = new ErrorMonitoringService({
      store: errorStore,
      environment: "test",
    });
    const adminStore = new InMemoryAdminStore(userStore, orgStore, { errorStore });
    const sessionService = new SessionService(sessionStore, config.session);

    // Create platform_admin
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "hash",
    });
    adminUser.globalRole = Roles.platform_admin;
    adminUser.role = Roles.platform_admin;
    userStore.insert({ ...adminUser });
    const adminSession = await sessionService.createSession(adminUser.id);

    // Create standard user (student)
    const regularUser = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "hash",
    });
    regularUser.globalRole = Roles.student;
    regularUser.role = Roles.student;
    userStore.insert({ ...regularUser });
    const regularSession = await sessionService.createSession(regularUser.id);

    const app = createApp({ config, errorMonitoringService });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      errorStore,
      errorMonitoringService,
      organizationStore: orgStore,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001",
    });

    return {
      app,
      errorStore,
      errorMonitoringService,
      adminToken: adminSession.sessionToken,
      regularToken: regularSession.sessionToken,
      adminId: adminUser.id,
    };
  }

  it("Scenario 14: Enforces RBAC - 403 for non-admin, 200 for platform_admin", async () => {
    const { app, regularToken, adminToken } = await setupAdminTestContext();

    // Non-admin request
    const forbiddenRes = await app.inject({
      method: "GET",
      url: "/v1/admin/system/errors/groups",
      headers: { authorization: `Bearer ${regularToken}` },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Admin request
    const okRes = await app.inject({
      method: "GET",
      url: "/v1/admin/system/errors/groups",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(okRes.statusCode).toBe(200);
    const body = JSON.parse(okRes.payload);
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("Scenario 15: Admin error group inspection, status update and notes lifecycle", async () => {
    const { app, errorStore, errorMonitoringService, adminToken } = await setupAdminTestContext();

    // Seed an error via errorMonitoringService
    await errorMonitoringService.captureErrorSync({
      error: new Error("DatabaseConnectionTimeout: Could not connect to PostgreSQL master"),
      source: "database",
      severity: "critical",
      environment: "production",
      appVersion: "1.0.0",
    });

    const groupsResult = await errorStore.listGroups({ page: 1, pageSize: 10 });
    expect(groupsResult.items.length).toBeGreaterThan(0);
    const groupId = groupsResult.items[0].id;

    // 1. Get Group Details
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/system/errors/groups/${groupId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.payload);
    expect(detailBody.id).toBe(groupId);
    expect(detailBody.title).toContain("DatabaseConnectionTimeout");

    // 2. Update Status to 'investigating'
    const statusRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/system/errors/groups/${groupId}/status`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ status: "investigating" }),
    });
    expect(statusRes.statusCode).toBe(200);
    const updatedStatusBody = JSON.parse(statusRes.payload);
    expect(updatedStatusBody.status).toBe("investigating");

    // 3. Add an Admin Note
    const addNoteRes = await app.inject({
      method: "POST",
      url: `/v1/admin/system/errors/groups/${groupId}/notes`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ note: "Investigating pool saturation with DevOps." }),
    });
    expect(addNoteRes.statusCode).toBe(201);
    const noteBody = JSON.parse(addNoteRes.payload);
    expect(noteBody.note).toBe("Investigating pool saturation with DevOps.");

    // 4. List Admin Notes
    const listNotesRes = await app.inject({
      method: "GET",
      url: `/v1/admin/system/errors/groups/${groupId}/notes`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(listNotesRes.statusCode).toBe(200);
    const notesList = JSON.parse(listNotesRes.payload);
    expect(Array.isArray(notesList.notes)).toBe(true);
    expect(notesList.notes).toHaveLength(1);
    expect(notesList.notes[0].note).toBe("Investigating pool saturation with DevOps.");
  });

  it("Scenario 16: Backwards compatibility - /admin/system/logs returns adapted error events", async () => {
    const { app, errorMonitoringService, adminToken } = await setupAdminTestContext();

    // Ingest error to generate log entry
    await errorMonitoringService.captureErrorSync({
      error: new Error("PaymentGatewayError: Zarinpal connection rejected with status 400"),
      source: "backend",
      severity: "error",
      environment: "production",
      appVersion: "1.0.0",
    });

    const logsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/system/logs?page=1&pageSize=10",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(logsRes.statusCode).toBe(200);
    const logsBody = JSON.parse(logsRes.payload);
    expect(logsBody.logs).toBeDefined();
    expect(logsBody.logs.length).toBeGreaterThan(0);

    const logRecord = logsBody.logs[0];
    expect(logRecord.level).toBe("ERROR");
    expect(logRecord.message).toContain("PaymentGatewayError");
    expect(logRecord.service).toContain("backend");
  });

  it("Scenario 17: Sanitizes compound/camelCase sensitive keys and strips query string from URLs", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    const rawContext = {
      apiKey: "secret-key-1",
      geminiApiKey: "AIzaSyAbc123456",
      resendApiKey: "re_123456789",
      authorization: "Bearer eyJhbGciOi...",
      bearer: "token_abc",
      accessToken: "access-token-val",
      refreshToken: "refresh-token-val",
      password: "SuperSecretPassword123!",
      secret: "webhook-secret",
      cookie: "session_id=12345",
      session: "session_token_xyz",
      nestedMeta: { privateKey: "-----BEGIN RSA PRIVATE KEY-----" },
      otp: "123456",
      url: "https://api.avana.ir/v1/auth/callback?code=super-secret-code&state=123",
      endpoint: "/api/v1/users?token=secret-token",
      safeKey: "public-value",
    };

    const sanitized = service.sanitizeContext(rawContext) as Record<string, unknown>;

    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.geminiApiKey).toBe("[REDACTED]");
    expect(sanitized.resendApiKey).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.bearer).toBe("[REDACTED]");
    expect(sanitized.accessToken).toBe("[REDACTED]");
    expect(sanitized.refreshToken).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.secret).toBe("[REDACTED]");
    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized.session).toBe("[REDACTED]");
    expect(sanitized.otp).toBe("[REDACTED]");
    expect((sanitized.nestedMeta as Record<string, unknown>).privateKey).toBe("[REDACTED]");

    // URLs have query strings stripped
    expect(sanitized.url).toBe("https://api.avana.ir/v1/auth/callback");
    expect(sanitized.endpoint).toBe("/api/v1/users");
    expect(sanitized.safeKey).toBe("public-value");
  });

  it("Scenario 18: Request ID validation and clamping adheres to 64 chars alphanumeric", () => {
    // Valid alphanumeric with underscore/hyphen/dot <= 64 chars
    const validId = "req_123-abc.456";
    expect(sanitizeRequestId(validId)).toBe(validId);

    // Oversized > 64 chars generates a fresh UUID
    const oversized = "a".repeat(65);
    const sanitizedOver = sanitizeRequestId(oversized);
    expect(sanitizedOver).not.toBe(oversized);
    expect(sanitizedOver).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Malicious SQL injection or forbidden chars generates a fresh UUID
    const malicious = "req'; DROP TABLE error_events; --";
    const sanitizedMal = sanitizeRequestId(malicious);
    expect(sanitizedMal).not.toBe(malicious);
    expect(sanitizedMal).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Empty or whitespace generates fresh UUID
    expect(sanitizeRequestId("")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sanitizeRequestId("   ")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("Scenario 19: ErrorMonitoringService drain waits for in-flight tasks and blocks new captures", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    // Capture an error asynchronously
    const capturePromise = service.captureErrorAsync({
      error: new Error("In flight job error"),
      source: "backend",
    });

    // Drain should wait for it and mark service as shutdown
    const drainResult = await service.drain(2000);
    expect(drainResult.drained).toBe(true);
    expect(drainResult.pending).toBe(0);
    expect(service.isShutdown()).toBe(true);

    await capturePromise;

    // Subsequent captures should be dropped safely
    service.captureError({
      error: new Error("Error after shutdown"),
      source: "backend",
    });
    expect(service.getQueueLength()).toBe(0);

    const groups = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups.items).toHaveLength(1);
    expect(groups.items[0].title).toContain("In flight job error");
  });

  it("Scenario 20: Anti-Loop captures errors on admin error endpoints without recursive loops", async () => {
    const { app, errorMonitoringService, adminToken } = await setupAdminTestContext();

    // Register a test route under /v1/admin/system/errors that throws a 500 error
    app.get("/v1/admin/system/errors/fail-test", async () => {
      throw new Error("Admin system error simulated 500 failure");
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/system/errors/fail-test?secretToken=do-not-leak",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(500);

    // Wait a brief moment for setImmediate error capture
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Error must be captured by ErrorMonitoringService (not ignored by a blanket path blacklist)
    const groups = await errorMonitoringService.getStore().listGroups({ page: 1, pageSize: 10 });
    const adminErrorGroup = groups.items.find((g) => g.title.includes("Admin system error simulated 500 failure"));
    expect(adminErrorGroup).toBeDefined();

    // Query parameter secretToken should NOT be in the stored endpoint or url context
    const events = await errorMonitoringService.getStore().listEvents({ groupId: adminErrorGroup!.id, page: 1, pageSize: 10 });
    expect(events.items.length).toBeGreaterThan(0);
    expect(events.items[0].endpoint).not.toContain("do-not-leak");
    expect((events.items[0].sanitizedContext as Record<string, unknown>).url).not.toContain("do-not-leak");
  });

  it("Scenario 21: sanitizeText thoroughly redacts all secret categories while preserving diagnostic data", () => {
    // 1. Google / Gemini Key
    const geminiInput = "Failed to query Gemini model: key AIzaSyD12345678901234567890123456789012";
    expect(sanitizeText(geminiInput)).toBe("Failed to query Gemini model: key [REDACTED_GEMINI_KEY]");

    // 2. Resend Key
    const resendInput = "Resend SMTP error with key re_1234567890abcdef1234567890";
    expect(sanitizeText(resendInput)).toBe("Resend SMTP error with key [REDACTED_RESEND_KEY]");

    // 3. OpenAI / Generic Key
    const openaiInput = "OpenAI rate limit: sk-1234567890abcdef1234567890";
    expect(sanitizeText(openaiInput)).toBe("OpenAI rate limit: [REDACTED_API_KEY]");

    // 4. JWT & Bearer
    const jwtInput = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const sanitizedJwt = sanitizeText(jwtInput);
    expect(sanitizedJwt).not.toContain("eyJhbGciOi");
    expect(sanitizedJwt).toContain("[REDACTED");

    // 5. Query String Secrets
    const queryInput = "GET https://api.avana.ir/v1/resource?token=secret123&apiKey=key_abc&safeId=100&password=mypassword";
    const sanitizedQuery = sanitizeText(queryInput);
    expect(sanitizedQuery).toContain("token=[REDACTED]");
    expect(sanitizedQuery).toContain("apiKey=[REDACTED]");
    expect(sanitizedQuery).toContain("password=[REDACTED]");
    expect(sanitizedQuery).toContain("safeId=100");

    // 6. Key-Value credential pairs in messages
    const kvInput = "Failed auth: password='SuperSecretPassword123!', otp: 887766, private_key: '-----BEGIN RSA...'";
    const sanitizedKv = sanitizeText(kvInput);
    expect(sanitizedKv).not.toContain("SuperSecretPassword123!");
    expect(sanitizedKv).not.toContain("887766");
    expect(sanitizedKv).not.toContain("BEGIN RSA");
    expect(sanitizedKv).toContain("password=[REDACTED]");
    expect(sanitizedKv).toContain("otp: [REDACTED]");

    // 7. Database & Cache URI Credentials (positive & negative tests)
    const pgUri = "Failed connecting to postgres://avana_user:mySuperSecretDbPassword123!@127.0.0.1:5432/avana_db";
    expect(sanitizeText(pgUri)).toBe("Failed connecting to postgres://avana_user:[REDACTED]@127.0.0.1:5432/avana_db");

    // Empty username in URI (e.g. redis://:password@host)
    const redisUri = "Redis cache auth failed: redis://:redisMasterSecretPass99@redis.internal:6379/0";
    expect(sanitizeText(redisUri)).toBe("Redis cache auth failed: redis://:[REDACTED]@redis.internal:6379/0");

    // Negative test: URI without credentials must NOT be modified
    const publicUrl = "http://localhost:3000/api/v1/health?status=ok";
    expect(sanitizeText(publicUrl)).toBe(publicUrl);

    // 8. AWS Access Key ID (positive & negative)
    const awsInput = "AWS S3 upload error with accessKeyId AKIAIOSFODNN7EXAMPLE in us-east-1";
    expect(sanitizeText(awsInput)).toBe("AWS S3 upload error with accessKeyId [REDACTED_AWS_KEY] in us-east-1");
    // Negative test: too short or lowercase must not be redacted
    expect(sanitizeText("AKIA_short")).toBe("AKIA_short");

    // 9. GitHub Tokens (positive & negative)
    const ghClassic = "GitHub sync error: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
    expect(sanitizeText(ghClassic)).toBe("GitHub sync error: [REDACTED_GITHUB_TOKEN]");

    const ghFineGrained = "GitHub token expired: github_pat_11ABCDE1234567890_abcdefghijklmnopqrstuvwxyz12345";
    expect(sanitizeText(ghFineGrained)).toBe("GitHub token expired: [REDACTED_GITHUB_TOKEN]");

    // Negative test: normal github url
    expect(sanitizeText("https://github.com/org/repo")).toBe("https://github.com/org/repo");

    // 10. PEM Private Key (positive & negative)
    const pemInput = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----";
    expect(sanitizeText(pemInput)).toBe("[REDACTED_PRIVATE_KEY]");

    // Negative test: public certificate must not be redacted
    const certInput = "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----";
    expect(sanitizeText(certInput)).toBe(certInput);

    // 11. Diagnostic Preservation: file paths, lines, error codes, HTTP statuses must NOT be redacted
    const diagnosticStack = "Error: Resource not found (HTTP 404)\n    at Object.getUser (/app/src/modules/users/service.ts:145:22)\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)";
    const cleanStack = sanitizeText(diagnosticStack);
    expect(cleanStack).toBe(diagnosticStack); // Completely identical because no secrets present!
  });

  it("Scenario 22: Message, Title, and Stack Trace are sanitized during ErrorMonitoringService capture", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    const rawError = new Error("Failed upstream call with key=AIzaSyD12345678901234567890123456789012 and password='secret_admin_pass'");
    rawError.stack = "Error: Failed upstream\n    at callVendor (https://api.vendor.com/v1?token=jwt_secret_token_12345:10:20)\n    at Header Authorization: Bearer secret_bearer_token_xyz";

    await service.captureErrorAsync({
      error: rawError,
      source: "backend",
    });

    const groups = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups.items).toHaveLength(1);
    const group = groups.items[0];

    // Title must NOT contain the Gemini API key or raw password
    expect(group.title).not.toContain("AIzaSyD");
    expect(group.title).not.toContain("secret_admin_pass");
    expect(group.title).toContain("[REDACTED_GEMINI_KEY]");
    expect(group.title).toContain("[REDACTED]");

    // Event stack trace must NOT contain the query string token or bearer token
    const events = await store.listEvents({ groupId: group.id, page: 1, pageSize: 10 });
    expect(events.items).toHaveLength(1);
    const event = events.items[0];
    expect(event.stackTrace).not.toContain("jwt_secret_token_12345");
    expect(event.stackTrace).not.toContain("secret_bearer_token_xyz");
    expect(event.stackTrace).toContain("token=[REDACTED]");
    expect(event.stackTrace).toContain("Bearer [REDACTED]");
  });

  it("Scenario 23: Race condition test - Immediate captureError followed synchronously by drain awaits completion", async () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    // Call captureError (schedules via setImmediate)
    service.captureError({
      error: new Error("Immediate race condition error"),
      source: "backend",
    });

    // Call drain IMMEDIATELY in the very next instruction without waiting for event loop
    const drainPromise = service.drain(3000);

    const result = await drainPromise;
    expect(result.drained).toBe(true);
    expect(result.pending).toBe(0);

    // Verify error was fully persisted to the store before drain finished
    const groups = await store.listGroups({ page: 1, pageSize: 10 });
    expect(groups.items).toHaveLength(1);
    expect(groups.items[0].title).toContain("Immediate race condition error");
  });

  it("Scenario 24: Drain timeout reporting, error resilience, and multiple sequential captures", async () => {
    const store = new InMemoryErrorStore();

    // 1. Multiple sequential captures then drain
    const service1 = new ErrorMonitoringService({ store });
    for (let i = 1; i <= 5; i++) {
      service1.captureError({
        error: new Error(`Sequential error ${i}`),
        source: "backend",
      });
    }

    const drainRes = await service1.drain(3000);
    expect(drainRes.drained).toBe(true);
    expect(drainRes.pending).toBe(0);

    // 2. Storage failure during capture does NOT cause unhandled rejection and drain settles
    const service2 = new ErrorMonitoringService({ store });
    vi.spyOn(store, "recordOccurrence").mockRejectedValueOnce(new Error("Disk full or connection closed"));

    service2.captureError({
      error: new Error("Error during storage failure"),
      source: "backend",
    });

    const drainRes2 = await service2.drain(3000);
    expect(drainRes2.drained).toBe(true);
    expect(drainRes2.pending).toBe(0);

    // 3. Timeout behavior: simulates a slow store operation exceeding drain timeout
    const service3 = new ErrorMonitoringService({ store });
    vi.spyOn(store, "recordOccurrence").mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );

    service3.captureError({
      error: new Error("Slow error exceeding timeout"),
      source: "backend",
    });

    // Drain with very short 50ms timeout
    const timeoutDrain = await service3.drain(50);
    expect(timeoutDrain.drained).toBe(false);
    expect(timeoutDrain.pending).toBeGreaterThanOrEqual(1);

    // Wait for the slow operation to finish so no dangling handles remain
    await new Promise((resolve) => setTimeout(resolve, 550));
  });

  it("Scenario 25: Context deep sanitization, circular and shared references, and max property limits", () => {
    const store = new InMemoryErrorStore();
    const service = new ErrorMonitoringService({ store });

    // 1. Nested secrets under generic, non-sensitive keys
    const rawContext = {
      details: "Database error with postgres://avana:dbPassword123@10.0.0.1:5432/main",
      metadata: "Model failed: key AIzaSyD12345678901234567890123456789012",
      logSnippet: "Bearer secret_user_token_987654321",
      arrayData: [
        "Normal string",
        "AWS error with AKIAIOSFODNN7EXAMPLE",
        { innerNote: "GitHub token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB" },
      ],
    };

    const sanitized = service.sanitizeContext(rawContext);
    expect((sanitized.details as string)).toContain("postgres://avana:[REDACTED]@10.0.0.1:5432/main");
    expect((sanitized.metadata as string)).toContain("[REDACTED_GEMINI_KEY]");
    expect((sanitized.logSnippet as string)).toBe("Bearer [REDACTED]");
    const arr = sanitized.arrayData as unknown[];
    expect(arr[0]).toBe("Normal string");
    expect((arr[1] as string)).toContain("[REDACTED_AWS_KEY]");
    expect(((arr[2] as Record<string, unknown>).innerNote as string)).toContain("[REDACTED_GITHUB_TOKEN]");

    // 2. Circular References
    const circularObj: any = { name: "cycle" };
    circularObj.self = circularObj;
    const sanitizedCircular = service.sanitizeContext(circularObj);
    expect(sanitizedCircular.name).toBe("cycle");
    expect((sanitizedCircular.self as Record<string, unknown>)?.["[CIRCULAR]"]).toBe(true);

    // 3. Shared References (must not be falsely flagged as circular)
    const shared = { sharedKey: "sharedValue" };
    const sharedContainer = { branchA: shared, branchB: shared };
    const sanitizedShared = service.sanitizeContext(sharedContainer);
    expect(((sanitizedShared.branchA as Record<string, unknown>).sharedKey)).toBe("sharedValue");
    expect(((sanitizedShared.branchB as Record<string, unknown>).sharedKey)).toBe("sharedValue");

    // 4. Max Context Properties Limit (100)
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 150; i++) {
      largeObj[`key_${i}`] = i;
    }
    const sanitizedLarge = service.sanitizeContext(largeObj);
    expect(sanitizedLarge["[TRUNCATED]"]).toBe("Max context properties exceeded");
    expect(Object.keys(sanitizedLarge).length).toBeLessThanOrEqual(102);
  });
});
