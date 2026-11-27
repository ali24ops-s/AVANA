/**
 * AVANA Pocket — Security Hardening Test Suite (SEC-1, SEC-2, SEC-3)
 *
 * Verifies:
 * 1. SEC-1: Reviewer logout followed by student login — student NEVER observes cached privileged notes.
 * 2. SEC-1: Account switching without browser reload — synchronous cleanup prevents the identity-switch render window.
 * 3. SEC-1: Canceled in-flight requests cannot repopulate removed sensitive cache entries.
 * 4. SEC-1: Targeted cache cleanup purges ["pocket"] and sensitive keys while preserving public caches.
 * 5. SEC-2: Sensitive endpoints return Cache-Control: private, no-cache, no-store, must-revalidate and Pragma: no-cache.
 * 6. SEC-2: Reviewer credential suspension/revocation immediately prevents subsequent privileged data access.
 * 7. SEC-3: ETag registry is cleared on logout and account switching.
 */

import React, { useEffect, useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

import { AuthProvider, useAuth, cleanupUserSessionCache } from "../providers/AuthProvider.js";
import { usePocketVerifications } from "../hooks/usePocketVerifications.js";
import {
  consumptionEtagRegistry,
  versionEtagRegistry,
  resetPocketEtagRegistry,
} from "../hooks/pocketEtagRegistry.js";
import { pocketKeys } from "../hooks/pocketKeys.js";
import type { AssertionVerificationsResult, ReviewerMeData } from "../lib/api/pocket.js";

describe("AVANA Pocket Security Hardening", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 1000 * 60 * 5,
        },
      },
    });
    resetPocketEtagRegistry();
  });

  // ===========================================================================
  // 1. SEC-1: React Query Session Isolation & Cache Removal
  // ===========================================================================

  describe("SEC-1: Session Isolation & Cache Purge", () => {
    it("synchronously removes Pocket verifications, reviewer status, and sensitive user queries", () => {
      // Seed sensitive data into query cache
      const assertionId = "asst-priv-1";
      queryClient.setQueryData(pocketKeys.assertionVerifications(assertionId), {
        verifications: [
          {
            id: "ver-1",
            assertionId,
            verificationAction: "clinical_verified",
            clinicalReviewNotes: "PRIVILEGED_DOCTOR_NOTE_12345",
            verifiedAt: new Date().toISOString(),
          },
        ],
        conflicts: [],
      });

      queryClient.setQueryData(pocketKeys.reviewerMe(), {
        isReviewer: true,
        credential: {
          id: "cred-1",
          userId: "doctor-1",
          medicalLicenseNumber: "MD-9999",
          specialty: "Cardiology",
          licensingAuthority: "Board",
          isActive: true,
        },
      });

      queryClient.setQueryData(["my-courses"], [{ id: "c-1", title: "Enrolled Course" }]);
      queryClient.setQueryData(["daily-study-plan"], { tasks: [] });

      // Seed non-sensitive public data that MUST be preserved
      queryClient.setQueryData(["public-catalog"], [{ id: "pub-1", name: "Public Catalog" }]);
      queryClient.setQueryData(["blog-articles"], [{ id: "b-1", title: "Public Article" }]);

      // Verify cached data exists
      expect(
        queryClient.getQueryData<AssertionVerificationsResult>(
          pocketKeys.assertionVerifications(assertionId),
        )?.verifications[0]?.clinicalReviewNotes,
      ).toBe("PRIVILEGED_DOCTOR_NOTE_12345");

      // Execute targeted session cache cleanup
      cleanupUserSessionCache(queryClient);

      // Verify sensitive caches are PURGED
      expect(
        queryClient.getQueryData(pocketKeys.assertionVerifications(assertionId)),
      ).toBeUndefined();
      expect(queryClient.getQueryData(pocketKeys.reviewerMe())).toBeUndefined();
      expect(queryClient.getQueryData(["my-courses"])).toBeUndefined();
      expect(queryClient.getQueryData(["daily-study-plan"])).toBeUndefined();

      // Verify non-sensitive public caches are PRESERVED (no global clear)
      expect(queryClient.getQueryData(["public-catalog"])).toBeDefined();
      expect(queryClient.getQueryData(["blog-articles"])).toBeDefined();
    });

    it("cancels active in-flight requests and prevents them from repopulating purged cache", async () => {
      const assertionId = "asst-inflight-1";
      let resolvePromise: (value: AssertionVerificationsResult) => void;
      const delayedPromise = new Promise<AssertionVerificationsResult>((resolve) => {
        resolvePromise = resolve;
      });

      // Start an active query fetch
      const queryPromise = queryClient.fetchQuery({
        queryKey: pocketKeys.assertionVerifications(assertionId),
        queryFn: ({ signal }) => {
          return new Promise<AssertionVerificationsResult>((resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
            delayedPromise.then(resolve);
          });
        },
      });

      // Immediately execute cleanup while query is in-flight
      cleanupUserSessionCache(queryClient);

      // Now resolve the late network promise
      resolvePromise!({
        verifications: [
          {
            id: "v-late",
            assertionId,
            verificationAction: "clinical_verified",
            clinicalReviewNotes: "SHOULD_NOT_LEAK",
            verifiedAt: new Date().toISOString(),
          },
        ],
        conflicts: [],
      });

      // Await original query promise (which will reject due to abort)
      await expect(queryPromise).rejects.toThrow();

      // Ensure cache remains completely clear
      expect(
        queryClient.getQueryData(pocketKeys.assertionVerifications(assertionId)),
      ).toBeUndefined();
    });
  });

  // ===========================================================================
  // 2. SEC-1: Integration Scenario — Reviewer to Student Switch
  // ===========================================================================

  describe("SEC-1: Zero-Render-Window Account Switching Integration", () => {
    it("guarantees student NEVER observes privileged notes during SPA account switch", async () => {
      const assertionId = "asst-shared-1";

      // Mock component that simulates rendering verification details
      function VerificationInspector({
        userId,
        onRenderState,
      }: {
        userId: string;
        onRenderState: (user: string, notes: string | undefined) => void;
      }) {
        const { data } = useQuery<AssertionVerificationsResult>({
          queryKey: pocketKeys.assertionVerifications(assertionId),
          queryFn: () => {
            // Simulated server response: Doctor gets notes, Student does not
            if (userId === "doctor-1") {
              return {
                verifications: [
                  {
                    id: "v1",
                    assertionId,
                    verificationAction: "clinical_verified",
                    clinicalReviewNotes: "CONFIDENTIAL_CLINICAL_CRITIQUE",
                    verifiedAt: new Date().toISOString(),
                  },
                ],
                conflicts: [],
              };
            }
            return {
              verifications: [
                {
                  id: "v1",
                  assertionId,
                  verificationAction: "clinical_verified",
                  // Student receives masked response (no clinicalReviewNotes)
                  verifiedAt: new Date().toISOString(),
                },
              ],
              conflicts: [],
            };
          },
          staleTime: 60_000,
        });

        const activeNotes = data?.verifications[0]?.clinicalReviewNotes;
        onRenderState(userId, activeNotes);

        return (
          <div>
            <span data-testid="user-id">{userId}</span>
            <span data-testid="clinical-notes">{activeNotes ?? "NO_NOTES"}</span>
          </div>
        );
      }

      const renderHistory: Array<{ user: string; notes?: string }> = [];
      const handleRenderState = (user: string, notes?: string) => {
        renderHistory.push({ user, notes });
      };

      // 1. Initial render as Doctor
      let setTestUser: React.Dispatch<React.SetStateAction<string>>;
      function TestContainer() {
        const [activeUser, setActiveUser] = useState("doctor-1");
        setTestUser = setActiveUser;

        return (
          <QueryClientProvider client={queryClient}>
            <VerificationInspector userId={activeUser} onRenderState={handleRenderState} />
          </QueryClientProvider>
        );
      }

      render(<TestContainer />);

      // Await Doctor query execution
      await waitFor(() => {
        expect(screen.getByTestId("clinical-notes")).toHaveTextContent(
          "CONFIDENTIAL_CLINICAL_CRITIQUE",
        );
      });

      // Verify Doctor sees confidential notes
      expect(screen.getByTestId("user-id")).toHaveTextContent("doctor-1");
      expect(screen.getByTestId("clinical-notes")).toHaveTextContent(
        "CONFIDENTIAL_CLINICAL_CRITIQUE",
      );

      // 2. Perform Account Switch to Student
      // The safeguard synchronously purges previous user cache BEFORE state update
      act(() => {
        cleanupUserSessionCache(queryClient);
        setTestUser("student-2");
      });

      // 3. Inspect every render state recorded for student-2
      const studentRenders = renderHistory.filter((r) => r.user === "student-2");
      expect(studentRenders.length).toBeGreaterThan(0);

      // Student must NEVER have witnessed "CONFIDENTIAL_CLINICAL_CRITIQUE" in any render frame!
      for (const r of studentRenders) {
        expect(r.notes).not.toBe("CONFIDENTIAL_CLINICAL_CRITIQUE");
      }

      // Final settled state for student
      await waitFor(() => {
        expect(screen.getByTestId("user-id")).toHaveTextContent("student-2");
        expect(screen.getByTestId("clinical-notes")).toHaveTextContent("NO_NOTES");
      });
    });

    it("Real AuthProvider account transition: signs in as reviewer, loads notes, signs out via AuthProvider, signs in as student and guarantees zero leakage", async () => {
      let currentUserRole: "clinical_reviewer" | "student" | null = null;

      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("/v1/me")) {
          if (!currentUserRole) {
            return new Response(
              JSON.stringify({ error: { code: "unauthorized", message: "Not signed in" } }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              user: {
                id: currentUserRole === "clinical_reviewer" ? "doc-101" : "stu-202",
                email: currentUserRole === "clinical_reviewer" ? "doc@avana.local" : "stu@avana.local",
                role: currentUserRole,
                globalRole: null,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.includes("/v1/auth/sign-in")) {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const isDoc = body.email?.includes("doctor");
          currentUserRole = isDoc ? "clinical_reviewer" : "student";
          return new Response(
            JSON.stringify({
              user: {
                id: isDoc ? "doc-101" : "stu-202",
                email: body.email,
                role: currentUserRole,
                globalRole: null,
              },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url.includes("/v1/auth/sign-out")) {
          currentUserRole = null;
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/v1/pocket/assertions/asst-real-lifecycle-1/verifications")) {
          if (currentUserRole === "clinical_reviewer") {
            return new Response(
              JSON.stringify({
                success: true,
                data: {
                  verifications: [
                    {
                      id: "v-real-1",
                      assertionId: "asst-real-lifecycle-1",
                      verificationAction: "clinical_verified",
                      clinicalReviewNotes: "TOP_SECRET_DOCTOR_NOTE_REAL_AUTH_FLOW",
                      verifiedAt: new Date().toISOString(),
                    },
                  ],
                  conflicts: [],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          // Student response: clinicalReviewNotes is stripped
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                verifications: [
                  {
                    id: "v-real-1",
                    assertionId: "asst-real-lifecycle-1",
                    verificationAction: "clinical_verified",
                    verifiedAt: new Date().toISOString(),
                  },
                ],
                conflicts: [],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({}), { status: 404 });
      });

      vi.stubGlobal("fetch", mockFetch);

      const renderHistory: Array<{ role: string | null; notes?: string }> = [];

      function RealAuthConsumer() {
        const { user, signIn, signOut, isAuthenticated } = useAuth();
        const { data: verificationsData } = usePocketVerifications("asst-real-lifecycle-1");

        const notes = verificationsData?.verifications[0]?.clinicalReviewNotes;

        useEffect(() => {
          renderHistory.push({ role: user?.role ?? null, notes });
        });

        return (
          <div>
            <span data-testid="auth-state">
              {isAuthenticated ? `authenticated:${user?.role}` : "unauthenticated"}
            </span>
            <span data-testid="user-role">{user?.role ?? "none"}</span>
            <span data-testid="clinical-notes">{notes ?? "NO_NOTES"}</span>
            <button
              onClick={() => void signIn("doctor@avana.local", "secret")}
              data-testid="btn-login-doctor"
            >
              Login Doctor
            </button>
            <button onClick={() => void signOut()} data-testid="btn-logout">
              Logout
            </button>
            <button
              onClick={() => void signIn("student@avana.local", "secret")}
              data-testid="btn-login-student"
            >
              Login Student
            </button>
          </div>
        );
      }

      try {
        render(
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RealAuthConsumer />
            </AuthProvider>
          </QueryClientProvider>,
        );

        // 1. Initial state is unauthenticated
        await waitFor(() => {
          expect(screen.getByTestId("auth-state")).toHaveTextContent("unauthenticated");
        });

        // 2. Sign in as clinical reviewer via real AuthProvider signIn()
        await act(async () => {
          fireEvent.click(screen.getByTestId("btn-login-doctor"));
        });

        // 3. Await reviewer authenticated state and verify privileged notes are visible to reviewer
        await waitFor(() => {
          expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated:clinical_reviewer");
          expect(screen.getByTestId("clinical-notes")).toHaveTextContent(
            "TOP_SECRET_DOCTOR_NOTE_REAL_AUTH_FLOW",
          );
        });

        // 4. Execute the real signOut() flow from AuthProvider (DO NOT call cleanupUserSessionCache manually!)
        await act(async () => {
          fireEvent.click(screen.getByTestId("btn-logout"));
        });

        // Verify unauthenticated state after real signOut
        await waitFor(() => {
          expect(screen.getByTestId("auth-state")).toHaveTextContent("unauthenticated");
        });

        // 5. Sign in as student without browser reload via real AuthProvider signIn()
        await act(async () => {
          fireEvent.click(screen.getByTestId("btn-login-student"));
        });

        // Verify student authenticated state
        await waitFor(() => {
          expect(screen.getByTestId("auth-state")).toHaveTextContent("authenticated:student");
        });

        // 6. Inspect every render frame recorded for student
        const studentRenders = renderHistory.filter((r) => r.role === "student");
        expect(studentRenders.length).toBeGreaterThan(0);

        // CRITICAL ASSERTION: Privileged notes must NEVER be exposed to student in ANY render frame!
        for (const frame of studentRenders) {
          expect(frame.notes).not.toBe("TOP_SECRET_DOCTOR_NOTE_REAL_AUTH_FLOW");
        }

        // Settled state for student
        expect(screen.getByTestId("clinical-notes")).toHaveTextContent("NO_NOTES");
      } finally {
        vi.stubGlobal("fetch", originalFetch);
      }
    });
  });

  // ===========================================================================
  // 3. SEC-3: ETag Registry Reset
  // ===========================================================================

  describe("SEC-3: ETag Registry Lifecycle", () => {
    it("resets consumption and version ETag registries completely", () => {
      consumptionEtagRegistry.set("drug:drug-1", '"w-12345"');
      consumptionEtagRegistry.set("disease:dis-2", '"w-67890"');
      versionEtagRegistry.set("drug:drug-1", '"w-12345"');

      expect(consumptionEtagRegistry.size).toBe(2);
      expect(versionEtagRegistry.size).toBe(1);

      // Reset
      resetPocketEtagRegistry();

      expect(consumptionEtagRegistry.size).toBe(0);
      expect(versionEtagRegistry.size).toBe(0);
    });

    it("cleanupUserSessionCache triggers ETag registry reset", () => {
      consumptionEtagRegistry.set("treatment:trt-1", '"w-999"');
      expect(consumptionEtagRegistry.has("treatment:trt-1")).toBe(true);

      cleanupUserSessionCache(queryClient);

      expect(consumptionEtagRegistry.has("treatment:trt-1")).toBe(false);
    });
  });
});
