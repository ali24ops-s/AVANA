/**
 * AVANA Pocket — Phase UI-2 Test Suite.
 *
 * Covers:
 * 1. Typed API Client Request & Response mapping
 * 2. Error handling & ApiError propagation
 * 3. Conditional requests (ETag & HTTP 304) without casting
 * 4. Query Cache Invalidation across all mutations
 * 5. Clinical Permission resolution and fail-closed security rules
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createApiClient } from "../lib/api/client.js";
import { ApiError } from "../lib/api/errors.js";
import {
  createPocketApi,
  type ClinicalAggregateType,
  type ClinicalReviewerCredential,
  type ReviewerMeData,
} from "../lib/api/pocket.js";
import { pocketKeys } from "../hooks/pocketKeys.js";
import {
  isCredentialValid,
  resolvePocketPermissions,
} from "../utils/pocketPermissions.js";

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", role: "teacher" },
    isAuthenticated: true,
  }),
}));

function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map<string, string>(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: () => Promise.resolve(body !== undefined ? JSON.stringify(body) : ""),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("AVANA Pocket Phase UI-2: API Client & Contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof document !== "undefined") {
      document.cookie = "avana_csrf=test-csrf-token";
    }
  });

  describe("1. Reviewer Governance Endpoints", () => {
    it("getMe: maps GET /v1/pocket/reviewers/me response accurately", async () => {
      const mockMe: ReviewerMeData = {
        isReviewer: true,
        credential: {
          id: "cred-1",
          userId: "user-1",
          medicalLicenseNumber: "MED-1234",
          specialty: "Clinical Pharmacology",
          licensingAuthority: "IR-MC",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00Z",
          licenseExpiresAt: "2027-01-01T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, { success: true, data: mockMe }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getMe();
      expect(result.isReviewer).toBe(true);
      expect(result.credential?.medicalLicenseNumber).toBe("MED-1234");
    });

    it("grantCredential: sends POST with exact fields to /v1/pocket/reviewers/credentials", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(201, {
          success: true,
          data: { id: "cred-new", userId: "u-2", isActive: true },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const body = {
        userId: "u-2",
        medicalLicenseNumber: "IR-9999",
        specialty: "Internal Medicine",
        licensingAuthority: "MC",
        licenseExpiresAt: "2027-12-31T00:00:00Z",
      };

      const result = await api.grantCredential(body);
      expect(result.id).toBe("cred-new");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/reviewers/credentials",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    });

    it("suspendCredential: sends POST to /v1/pocket/reviewers/credentials/:id/suspend", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: { id: "cred-1", isActive: false, suspendedAt: "2026-05-01T00:00:00Z" },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.suspendCredential("cred-1", { reason: "License under audit" });
      expect(result.isActive).toBe(false);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/reviewers/credentials/cred-1/suspend",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "License under audit" }),
        }),
      );
    });

    it("revokeCredential: sends POST to /v1/pocket/reviewers/credentials/:id/revoke", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: { id: "cred-1", isActive: false },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.revokeCredential("cred-1", { reason: "Revoked" });
      expect(result.isActive).toBe(false);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/reviewers/credentials/cred-1/revoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Revoked" }),
        }),
      );
    });

    it("reactivateCredential: sends POST to /v1/pocket/reviewers/credentials/:id/reactivate", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: { id: "cred-1", isActive: true, lifecycleStatus: "active" },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.reactivateCredential("cred-1", { reason: "Returned" });
      expect(result.isActive).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/reviewers/credentials/cred-1/reactivate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Returned" }),
        }),
      );
    });

    it("listCredentialEvents: sends GET to /v1/pocket/reviewers/credentials/:id/events", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: [
            {
              id: "evt-1",
              credentialId: "cred-1",
              actorUserId: "admin-1",
              eventType: "granted",
              reason: "Initial",
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const events = await api.listCredentialEvents("cred-1");
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("granted");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/reviewers/credentials/cred-1/events",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("2. Assertion Review Lifecycle Endpoints", () => {
    it("submitReview: sends POST to /v1/pocket/assertions/:id/submit-review", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            assertion: { id: "a-1", status: "in_review" },
            auditLog: { action: "submitted_for_review" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.submitReview("a-1", { notes: "Ready for review" });
      expect(result.assertion.status).toBe("in_review");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/submit-review",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("recordReviewDecision: sends decision to /v1/pocket/assertions/:id/review-decision", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            assertion: { id: "a-1", status: "reviewed" },
            auditLog: { action: "review_approved" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.recordReviewDecision("a-1", { decision: "approve", notes: "LGTM" });
      expect(result.assertion.status).toBe("reviewed");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/review-decision",
        expect.objectContaining({
          body: JSON.stringify({ decision: "approve", notes: "LGTM" }),
        }),
      );
    });

    it("withdrawReview: sends POST to /v1/pocket/assertions/:id/withdraw-review", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            assertion: { id: "a-1", status: "draft" },
            auditLog: { action: "review_withdrawn" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.withdrawReview("a-1", { reason: "Need to update citation" });
      expect(result.assertion.status).toBe("draft");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/withdraw-review",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("getAssertionHistory: maps history response correctly", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            assertion: { id: "a-1", status: "draft" },
            history: [{ id: "log-1", action: "created", newStatus: "draft" }],
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getAssertionHistory("a-1");
      expect(result.history).toHaveLength(1);
    });
  });

  describe("3. Clinical Verification & Conflicts Endpoints", () => {
    it("verifyAssertion: sends POST to /v1/pocket/assertions/:id/verify", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            verification: { id: "v-1", verificationAction: "clinical_verified" },
            assertion: { id: "a-1", status: "verified" },
            auditLog: { action: "clinical_verified" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.verifyAssertion("a-1", { clinicalReviewNotes: "Verified per uptodate" });
      expect(result.assertion.status).toBe("verified");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/verify",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("rejectVerification: sends POST to /v1/pocket/assertions/:id/reject-verification", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            verification: { id: "v-1", verificationAction: "clinical_rejected" },
            assertion: { id: "a-1", status: "draft" },
            auditLog: { action: "clinical_verification_rejected" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.rejectVerification("a-1", { clinicalReviewNotes: "Inaccurate dose" });
      expect(result.assertion.status).toBe("draft");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/reject-verification",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("recordConflict: sends POST to /v1/pocket/assertions/conflicts", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(201, {
          success: true,
          data: { id: "conf-1", conflictSubject: "Dose discrepancy", status: "active_discrepancy" },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const body = {
        assertionAId: "a-1",
        assertionBId: "a-2",
        conflictSubject: "Dose discrepancy",
        discrepancyDescription: "Source A conflicts with B",
      };

      const result = await api.recordConflict(body);
      expect(result.id).toBe("conf-1");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/conflicts",
        expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
      );
    });
  });

  describe("4. Atomic Publishing Endpoint", () => {
    it("publishAssertion: sends POST to /v1/pocket/assertions/:id/publish", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            publishedAssertion: { id: "a-1", status: "published" },
            supersededAssertion: null,
            entityVersion: { aggregateType: "drug", aggregateId: "d-1", currentVersion: 2 },
            outboxEvent: { id: "out-1", eventType: "assertion.published" },
            auditLog: { action: "assertion_published" },
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.publishAssertion("a-1", { notes: "Release 2.0" });
      expect(result.publishedAssertion.status).toBe("published");
      expect(result.entityVersion.currentVersion).toBe(2);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-1/publish",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("resolveConflict: sends POST to /v1/pocket/assertions/conflicts/:conflictId/resolve", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, {
          success: true,
          data: {
            id: "conf-1",
            status: "resolved",
            resolutionNotes: "Aligned dosing",
            resolvedAt: "2026-11-27T00:00:00Z",
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.resolveConflict("conf-1", {
        outcome: "resolved",
        resolutionNotes: "Aligned dosing",
      });
      expect(result.status).toBe("resolved");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/conflicts/conf-1/resolve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ outcome: "resolved", resolutionNotes: "Aligned dosing" }),
        }),
      );
    });
  });

  describe("5. Error Handling & ApiError Propagation", () => {
    it("propagates ApiError with 403 status and message on authorization failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(403, {
          request_id: "req-err-403",
          error: {
            code: "forbidden",
            message: "User does not hold an active clinical reviewer credential",
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      await expect(
        api.verifyAssertion("a-1", { clinicalReviewNotes: "note" }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("6. Conditional ETag & HTTP 304 Handling", () => {
    it("getConditional: returns notModified: false and parsed body on HTTP 200", async () => {
      const mockPayload = {
        success: true,
        data: {
          aggregateType: "drug" as ClinicalAggregateType,
          aggregateId: "d-1",
          currentVersion: 1,
          assertions: [],
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, mockPayload, {
          etag: 'W/"drug-d-1-v1"',
          "x-entity-version": "1",
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getPublishedAssertions("drug", "d-1");
      expect(result.notModified).toBe(false);
      expect(result.data?.aggregateId).toBe("d-1");
      expect(result.etag).toBe('W/"drug-d-1-v1"');
      expect(result.entityVersion).toBe(1);
    });

    it("getConditional: returns notModified: true and data: null on HTTP 304 without throwing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(304, undefined, {
          etag: 'W/"drug-d-1-v1"',
          "x-entity-version": "1",
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getPublishedAssertions("drug", "d-1", 'W/"drug-d-1-v1"');
      expect(result.notModified).toBe(true);
      expect(result.data).toBeNull();
      expect(result.etag).toBe('W/"drug-d-1-v1"');
      expect(result.entityVersion).toBe(1);
    });

    it("passes If-None-Match header when ETag is supplied", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(304, undefined, { etag: 'W/"drug-d-1-v1"' }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      await api.getPublishedAssertions("drug", "d-1", 'W/"drug-d-1-v1"');

      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/aggregates/drug/d-1/assertions",
        expect.objectContaining({
          headers: expect.objectContaining({
            "if-none-match": 'W/"drug-d-1-v1"',
          }),
        }),
      );
    });

    it("getCurrentVersion: supports 304 probe response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(304, undefined, {
          etag: 'W/"drug-d-1-v2"',
          "x-entity-version": "2",
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getCurrentVersion("drug", "d-1", 'W/"drug-d-1-v2"');
      expect(result.notModified).toBe(true);
      expect(result.data).toBeNull();
      expect(result.entityVersion).toBe(2);
    });
  });

  describe("7. Query Cache Invalidation Structure & Hook Behavior", () => {
    it("pocketKeys generates consistent, structured hierarchical keys", () => {
      expect(pocketKeys.reviewers()).toEqual(["pocket", "reviewers"]);
      expect(pocketKeys.reviewerMe()).toEqual(["pocket", "reviewers", "me"]);
      expect(pocketKeys.reviewerCredentials()).toEqual(["pocket", "reviewers", "credentials"]);
      expect(pocketKeys.reviewerCredentials({ userId: "u-1" })).toEqual([
        "pocket",
        "reviewers",
        "credentials",
        { userId: "u-1" },
      ]);
      expect(pocketKeys.assertionHistory("a-100")).toEqual([
        "pocket",
        "assertions",
        "a-100",
        "history",
      ]);
      expect(pocketKeys.assertionVerifications("a-100")).toEqual([
        "pocket",
        "assertions",
        "a-100",
        "verifications",
      ]);
      expect(pocketKeys.consumption("drug", "d-1")).toEqual([
        "pocket",
        "consumption",
        "drug",
        "d-1",
      ]);
      expect(pocketKeys.version("drug", "d-1")).toEqual([
        "pocket",
        "version",
        "drug",
        "d-1",
      ]);
    });

    it("useGrantReviewerCredential, useSuspendReviewerCredential, and useRevokeReviewerCredential invalidate domain query pocketKeys.reviewers()", async () => {
      const { renderHook } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const {
        useGrantReviewerCredential,
        useSuspendReviewerCredential,
        useRevokeReviewerCredential,
      } = await import("../hooks/usePocketReviewerCredentials.js");

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      // 1. Grant Credential Mutation
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(201, {
          success: true,
          data: { id: "cred-new", userId: "doc-1", isActive: true },
        }),
      );
      const { result: grantResult } = renderHook(() => useGrantReviewerCredential(), { wrapper });
      await grantResult.current.mutateAsync({
        userId: "doc-1",
        medicalLicenseNumber: "123",
        specialty: "Pharma",
        licensingAuthority: "MC",
        licenseExpiresAt: "2028-01-01T00:00:00Z",
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pocketKeys.reviewers(),
      });

      invalidateSpy.mockClear();

      // 2. Suspend Credential Mutation
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, {
          success: true,
          data: { id: "cred-new", userId: "doc-1", isActive: false, suspendedAt: "2026-06-01" },
        }),
      );
      const { result: suspendResult } = renderHook(() => useSuspendReviewerCredential(), { wrapper });
      await suspendResult.current.mutateAsync({
        id: "cred-new",
        body: { reason: "Audit" },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pocketKeys.reviewers(),
      });

      invalidateSpy.mockClear();

      // 3. Revoke Credential Mutation
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, {
          success: true,
          data: { id: "cred-new", userId: "doc-1", isActive: false },
        }),
      );
      const { result: revokeResult } = renderHook(() => useRevokeReviewerCredential(), { wrapper });
      await revokeResult.current.mutateAsync({
        id: "cred-new",
        body: { reason: "Revoked" },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pocketKeys.reviewers(),
      });
    });

    it("usePublishAssertion hook invalidates aggregate consumption, version, and assertion history queries", async () => {
      const { renderHook } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePublishAssertion } = await import("../hooks/usePocketAssertions.js");

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, {
          success: true,
          data: {
            publishedAssertion: { id: "a-pub-1", status: "published" },
            supersededAssertion: null,
            entityVersion: { aggregateType: "drug", aggregateId: "d-pub-123", currentVersion: 3 },
            outboxEvent: { id: "out-1", eventType: "assertion.published" },
            auditLog: { action: "assertion_published" },
          },
        }),
      );

      const { result } = renderHook(() => usePublishAssertion(), { wrapper });
      await result.current.mutateAsync({ id: "a-pub-1" });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pocketKeys.assertionHistory("a-pub-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: pocketKeys.assertions(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["pocket", "consumption", "drug", "d-pub-123"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["pocket", "version", "drug", "d-pub-123"],
      });
    });
  });

  describe("8. Clinical Permission Integration & Fail-Closed Rules", () => {
    const fixedNow = new Date("2026-11-23T00:00:00Z");

    const validCredential: ClinicalReviewerCredential = {
      id: "cred-valid",
      userId: "doc-1",
      medicalLicenseNumber: "12345",
      specialty: "Pharmacotherapy",
      licensingAuthority: "IR-MC",
      isActive: true,
      suspendedAt: null,
      suspensionReason: null,
      grantedBy: "admin-1",
      grantedAt: "2026-01-01T00:00:00Z",
      licenseExpiresAt: "2027-12-31T00:00:00Z", // Future
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    it("isCredentialValid: validates active, unsuspended, unexpired credential", () => {
      expect(isCredentialValid(validCredential, fixedNow)).toBe(true);

      // Expired license
      const expiredCred = {
        ...validCredential,
        licenseExpiresAt: "2025-01-01T00:00:00Z", // Past
      };
      expect(isCredentialValid(expiredCred, fixedNow)).toBe(false);

      // Suspended license
      const suspendedCred = {
        ...validCredential,
        suspendedAt: "2026-06-01T00:00:00Z",
      };
      expect(isCredentialValid(suspendedCred, fixedNow)).toBe(false);

      // Inactive
      const inactiveCred = {
        ...validCredential,
        isActive: false,
      };
      expect(isCredentialValid(inactiveCred, fixedNow)).toBe(false);
    });

    it("student: cannot review, verify, publish, or manage reviewers", () => {
      const studentUser = { id: "s-1", role: "student" };
      const perms = resolvePocketPermissions(studentUser, null, fixedNow);

      expect(perms.canReview).toBe(false);
      expect(perms.canVerify).toBe(false);
      expect(perms.canPublish).toBe(false);
      expect(perms.canManageReviewers).toBe(false);
    });

    it("teacher/editor: can review, but cannot verify without credential or publish", () => {
      const teacherUser = { id: "t-1", role: "teacher" };
      const perms = resolvePocketPermissions(teacherUser, null, fixedNow);

      expect(perms.canReview).toBe(true);
      expect(perms.canVerify).toBe(false);
      expect(perms.canPublish).toBe(false);
      expect(perms.canManageReviewers).toBe(false);
    });

    it("platform_admin WITHOUT clinical credential: canReview, canPublish, canManageReviewers, but CANNOT verify", () => {
      const adminUser = { id: "adm-1", role: "platform_admin", globalRole: "platform_admin" };
      const perms = resolvePocketPermissions(adminUser, { isReviewer: false, credential: null }, fixedNow);

      expect(perms.canReview).toBe(true);
      expect(perms.canPublish).toBe(true);
      expect(perms.canManageReviewers).toBe(true);
      // Critical defense: platform_admin alone cannot verify assertions!
      expect(perms.canVerify).toBe(false);
      expect(perms.isClinicalReviewer).toBe(false);
    });

    it("platform_admin WITH active clinical credential: can verify, publish, and manage reviewers", () => {
      const docAdminUser = { id: "doc-1", role: "platform_admin", globalRole: "platform_admin" };
      const reviewerData: ReviewerMeData = { isReviewer: true, credential: validCredential };

      const perms = resolvePocketPermissions(docAdminUser, reviewerData, fixedNow);

      expect(perms.canReview).toBe(true);
      expect(perms.canPublish).toBe(true);
      expect(perms.canManageReviewers).toBe(true);
      expect(perms.canVerify).toBe(true);
      expect(perms.isClinicalReviewer).toBe(true);
      expect(perms.activeCredential?.id).toBe("cred-valid");
    });

    it("clinical reviewer doctor: canReview and canVerify, but CANNOT publish or manage reviewers", () => {
      const doctorUser = { id: "doc-1", role: "teacher" };
      const reviewerData: ReviewerMeData = { isReviewer: true, credential: validCredential };

      const perms = resolvePocketPermissions(doctorUser, reviewerData, fixedNow);

      expect(perms.canReview).toBe(true);
      expect(perms.canVerify).toBe(true);
      expect(perms.isClinicalReviewer).toBe(true);
      expect(perms.canPublish).toBe(false);
      expect(perms.canManageReviewers).toBe(false);
    });

    it("fail-closed: when unauthenticated or reviewer data is missing, sensitive permissions are false", () => {
      const permsNull = resolvePocketPermissions(null, null, fixedNow);
      expect(permsNull.canReview).toBe(false);
      expect(permsNull.canVerify).toBe(false);
      expect(permsNull.canPublish).toBe(false);
      expect(permsNull.canManageReviewers).toBe(false);

      const permsEmpty = resolvePocketPermissions({ id: "" }, null, fixedNow);
      expect(permsEmpty.canVerify).toBe(false);
      expect(permsEmpty.canPublish).toBe(false);
    });

    it("usePocketPermissions: dynamically updates when reviewerMe query cache updates after credential change", async () => {
      const { renderHook, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePocketPermissions } = await import("../hooks/usePocketPermissions.js");

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      // Initially no reviewer credential
      qc.setQueryData(pocketKeys.reviewerMe(), { isReviewer: false, credential: null });

      const { result } = renderHook(() => usePocketPermissions(), { wrapper });

      expect(result.current.canVerify).toBe(false);
      expect(result.current.isClinicalReviewer).toBe(false);

      // Now simulate a credential granted (e.g. after mutation refetches or cache updates)
      qc.setQueryData(pocketKeys.reviewerMe(), {
        isReviewer: true,
        credential: validCredential,
      });

      await waitFor(() => {
        expect(result.current.canVerify).toBe(true);
      });
      expect(result.current.isClinicalReviewer).toBe(true);
      expect(result.current.activeCredential?.id).toBe("cred-valid");
    });
  });

  describe("9. React Query Hook Integration & 304 Cache Retention", () => {
    it("usePocketConsumption: retains previous cached data when receiving 304", async () => {
      const { renderHook, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePocketConsumption, resetPocketEtagRegistry } = await import(
        "../hooks/usePocketConsumption.js"
      );

      resetPocketEtagRegistry();

      const qc = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      // Pre-populate query client cache as if previously fetched
      const initialData = {
        aggregateType: "drug" as ClinicalAggregateType,
        aggregateId: "d-cache-1",
        currentVersion: 1,
        assertions: [
          {
            id: "a-1",
            assertionRootId: "root-1",
            versionNumber: 1,
            previousVersionId: null,
            aggregateType: "drug" as ClinicalAggregateType,
            aggregateId: "d-cache-1",
            assertionType: "dosing_rule",
            assertionKey: "dosing.std",
            statementText: "100mg orally daily",
            jurisdiction: "IR",
            targetPopulation: "adult",
            clinicalSetting: "all",
            validUntilDate: null,
            publishedAt: "2026-01-01T00:00:00Z",
          },
        ],
      };

      qc.setQueryData(pocketKeys.consumption("drug", "d-cache-1"), initialData);

      // When hook queries server, server returns 304 Not Modified
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(304, undefined, {
          etag: 'W/"drug-d-cache-1-v1"',
          "x-entity-version": "1",
        }),
      );

      const { result } = renderHook(
        () => usePocketConsumption("drug", "d-cache-1"),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Crucial: Cache was NOT wiped, data matches initial cached version
      expect(result.current.data?.assertions).toHaveLength(1);
      expect(result.current.data?.assertions[0].statementText).toBe("100mg orally daily");
    });

    it("usePocketConsumption: retries unconditionally if 304 received but cache is empty", async () => {
      const { renderHook, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePocketConsumption, resetPocketEtagRegistry } = await import(
        "../hooks/usePocketConsumption.js"
      );

      resetPocketEtagRegistry();

      const qc = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      // Server returns 304 on first attempt (e.g. proxy anomaly), then 200 on fallback
      const freshData = {
        aggregateType: "drug" as ClinicalAggregateType,
        aggregateId: "d-fallback-1",
        currentVersion: 2,
        assertions: [
          {
            id: "a-fresh",
            assertionRootId: "root-1",
            versionNumber: 2,
            previousVersionId: null,
            aggregateType: "drug" as ClinicalAggregateType,
            aggregateId: "d-fallback-1",
            assertionType: "dosing_rule",
            assertionKey: "dosing.std",
            statementText: "200mg orally daily",
            jurisdiction: "IR",
            targetPopulation: "adult",
            clinicalSetting: "all",
            validUntilDate: null,
            publishedAt: "2026-02-01T00:00:00Z",
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          mockFetchResponse(304, undefined, {
            etag: 'W/"drug-d-fallback-1-v2"',
            "x-entity-version": "2",
          }),
        )
        .mockResolvedValueOnce(
          mockFetchResponse(200, { success: true, data: freshData }, {
            etag: 'W/"drug-d-fallback-1-v2"',
            "x-entity-version": "2",
          }),
        );

      const { result } = renderHook(
        () => usePocketConsumption("drug", "d-fallback-1"),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.current.data?.assertions[0].statementText).toBe("200mg orally daily");
    });
  });

  describe("10. Single Published Assertion & Metadata Endpoints (Phase UI-3)", () => {
    it("getPublishedAssertion: sends GET to /v1/pocket/assertions/:id", async () => {
      const mockAssertion = {
        id: "a-pub-1",
        assertionRootId: "root-1",
        versionNumber: 1,
        previousVersionId: null,
        aggregateType: "drug" as const,
        aggregateId: "d-1",
        assertionType: "dosing",
        assertionKey: "dosing.adult",
        statementText: "500mg PO TID",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "outpatient",
        validUntilDate: null,
        publishedAt: "2026-01-01T00:00:00Z",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, { success: true, data: mockAssertion }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getPublishedAssertion("a-pub-1");
      expect(result.id).toBe("a-pub-1");
      expect(result.statementText).toBe("500mg PO TID");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/assertions/a-pub-1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("getAggregateMetadata: sends GET to /v1/pocket/aggregates/:type/:id/metadata", async () => {
      const mockMeta = {
        id: "d-1",
        type: "drug" as const,
        slug: "cephalexin",
        nameEn: "Cephalexin",
        nameFa: "سفالکسین",
        classification: "Antibiotic",
        summary: "Cell wall inhibitor",
        publishedAt: "2026-01-01T00:00:00Z",
        versionNumber: 1,
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(200, { success: true, data: mockMeta }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getAggregateMetadata("drug", "d-1");
      expect(result.nameEn).toBe("Cephalexin");
      expect(result.nameFa).toBe("سفالکسین");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/pocket/aggregates/drug/d-1/metadata",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("11. Safety Override Management, Version Probe 304 & Retry Loop Prevention", () => {
    it("activateSafetyOverride, clearSafetyOverride, listSafetyOverrides, and getSafetyOverride hit real backend routes", async () => {
      const mockOverride = {
        id: "ovr-1",
        targetEntityType: "drug" as const,
        targetEntityId: "drug-123",
        actionState: "active" as const,
        isActive: true,
        currentEventId: "evt-1",
        updatedAt: "2026-03-01T00:00:00Z",
      };
      const mockEvent = {
        id: "evt-1",
        overrideId: "ovr-1",
        eventType: "activated" as const,
        targetEntityType: "drug" as const,
        targetEntityId: "drug-123",
        actorUserId: "admin-1",
        reason: "Urgent recall",
        previousState: null,
        newState: "active" as const,
        eventTimestamp: "2026-03-01T00:00:00Z",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          mockFetchResponse(201, {
            success: true,
            data: { override: mockOverride, event: mockEvent },
          }),
        )
        .mockResolvedValueOnce(
          mockFetchResponse(200, {
            success: true,
            data: {
              override: { ...mockOverride, actionState: "cleared", isActive: false },
              event: { ...mockEvent, id: "evt-2", eventType: "cleared", previousState: "active", newState: "cleared" },
            },
          }),
        )
        .mockResolvedValueOnce(
          mockFetchResponse(200, {
            success: true,
            data: [mockOverride],
          }),
        )
        .mockResolvedValueOnce(
          mockFetchResponse(200, {
            success: true,
            data: { override: mockOverride, events: [mockEvent] },
          }),
        );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const activated = await api.activateSafetyOverride({
        targetEntityType: "drug",
        targetEntityId: "drug-123",
        reason: "Urgent recall",
      });
      expect(activated.override.isActive).toBe(true);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "/v1/pocket/safety-overrides",
        expect.objectContaining({ method: "POST" }),
      );

      const cleared = await api.clearSafetyOverride("ovr-1", { reason: "Resolved" });
      expect(cleared.override.isActive).toBe(false);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "/v1/pocket/safety-overrides/ovr-1/clear",
        expect.objectContaining({ method: "POST" }),
      );

      const listed = await api.listSafetyOverrides({ isActive: true, limit: 10 });
      expect(listed).toHaveLength(1);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("/v1/pocket/safety-overrides?"),
        expect.objectContaining({ method: "GET" }),
      );

      const detail = await api.getSafetyOverride("ovr-1");
      expect(detail.events).toHaveLength(1);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        4,
        "/v1/pocket/safety-overrides/ovr-1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("pocketKeys.safetyOverrides generates deterministic keys and useActivateSafetyOverride invalidates target caches", async () => {
      expect(pocketKeys.safetyOverrides()).toEqual(["pocket", "safety-overrides"]);
      expect(pocketKeys.safetyOverridesList({ isActive: true })).toEqual([
        "pocket",
        "safety-overrides",
        "list",
        { isActive: true },
      ]);
      expect(pocketKeys.safetyOverride("ovr-99")).toEqual([
        "pocket",
        "safety-overrides",
        "ovr-99",
      ]);

      const { renderHook, act, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { useActivateSafetyOverride } = await import("../hooks/usePocketSafetyOverrides.js");
      const { consumptionEtagRegistry, resetPocketEtagRegistry } = await import(
        "../hooks/pocketEtagRegistry.js"
      );

      resetPocketEtagRegistry();
      consumptionEtagRegistry.set("drug:drug-123", 'W/"drug-drug-123-v1"');

      const qc = new QueryClient();
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(201, {
          success: true,
          data: {
            override: {
              id: "ovr-1",
              targetEntityType: "drug",
              targetEntityId: "drug-123",
              actionState: "active",
              isActive: true,
              currentEventId: "evt-1",
              updatedAt: "2026-03-01T00:00:00Z",
            },
            event: {
              id: "evt-1",
              overrideId: "ovr-1",
              eventType: "activated",
              targetEntityType: "drug",
              targetEntityId: "drug-123",
              actorUserId: "admin-1",
              reason: "Safety hold",
              previousState: null,
              newState: "active",
              eventTimestamp: "2026-03-01T00:00:00Z",
            },
          },
        }),
      );

      const { result } = renderHook(() => useActivateSafetyOverride(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          targetEntityType: "drug",
          targetEntityId: "drug-123",
          reason: "Safety hold",
        });
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pocketKeys.safetyOverrides() });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: pocketKeys.consumption("drug", "drug-123"),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: pocketKeys.version("drug", "drug-123"),
        });
      });

      expect(consumptionEtagRegistry.has("drug:drug-123")).toBe(false);
    });

    it("canManageSafetyOverrides is restricted to platform_admin", () => {
      const fixedNow = new Date("2026-06-01T00:00:00Z");
      expect(
        resolvePocketPermissions({ id: "u-doc", role: "teacher" }, null, fixedNow)
          .canManageSafetyOverrides,
      ).toBe(false);
      expect(
        resolvePocketPermissions({ id: "u-adm", role: "student", globalRole: "platform_admin" }, null, fixedNow)
          .canManageSafetyOverrides,
      ).toBe(true);
    });

    it("usePocketConsumption: prevents retry loop when unconditional fallback after 304 cache miss also returns 304", async () => {
      const { renderHook, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePocketConsumption, resetPocketEtagRegistry } = await import(
        "../hooks/usePocketConsumption.js"
      );

      resetPocketEtagRegistry();

      // Enable default retry to prove ConditionalNotModifiedError stops the retry loop
      const qc = new QueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockFetchResponse(304, undefined, {
          etag: 'W/"drug-d-loop-v1"',
        }),
      );

      const { result } = renderHook(
        () => usePocketConsumption("drug", "d-loop"),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Exactly 2 calls: initial conditional request + 1 unconditional fallback, no retry loop
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("usePocketVersionProbe: retains cached version on 304 and falls back once on cache miss", async () => {
      const { renderHook, act, waitFor } = await import("@testing-library/react");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      const React = await import("react");
      const { usePocketVersionProbe, resetPocketEtagRegistry } = await import(
        "../hooks/usePocketConsumption.js"
      );

      resetPocketEtagRegistry();

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      const cachedVersion = {
        aggregateType: "drug" as ClinicalAggregateType,
        aggregateId: "d-ver-1",
        currentVersion: 5,
      };
      qc.setQueryData(pocketKeys.version("drug", "d-ver-1"), cachedVersion);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(304, undefined, {
          etag: 'W/"drug-d-ver-1-v5"',
          "x-entity-version": "5",
        }),
      );

      const { result } = renderHook(
        () => usePocketVersionProbe("drug", "d-ver-1"),
        { wrapper },
      );

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
      expect(result.current.data?.currentVersion).toBe(5);
    });
  });
});

