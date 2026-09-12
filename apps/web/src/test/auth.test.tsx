/**
 * Auth Provider tests.
 *
 * Tests:
 *  - /v1/me loading success
 *  - /v1/me loading failure (unauthorized)
 *  - /v1/me loading failure (network error)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../providers/AuthProvider.js";
import type { ReactNode } from "react";

// Test component that consumes auth context
function TestConsumer() {
  const { user, isLoading, error, isAuthenticated } = useAuth();

  return (
    <div data-testid="consumer">
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="user-email">{user?.email ?? "null"}</div>
      <div data-testid="error">{error ?? "null"}</div>
    </div>
  );
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// Helper to get the last matching element (handles React 19 double-render)
function lastElement(testId: string): HTMLElement {
  const elements = screen.getAllByTestId(testId);
  return elements[elements.length - 1]!;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    // Mock fetch to never resolve (keep loading)
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(lastElement("loading").textContent).toBe("true");
    expect(lastElement("authenticated").textContent).toBe("false");
  });

  it("handles /v1/me success — sets authenticated user", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "alice@example.com",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("authenticated").textContent).toBe("true");
    });

    expect(lastElement("user-email").textContent).toBe("alice@example.com");
    expect(lastElement("error").textContent).toBe("null");
  });

  it("handles /v1/me 401 — unauthenticated (not an error)", async () => {
    const mockUnauthorizedResponse = {
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          error: { code: "unauthorized", message: "Not signed in" },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockUnauthorizedResponse);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("loading").textContent).toBe("false");
    });

    expect(lastElement("authenticated").textContent).toBe("false");
    expect(lastElement("user-email").textContent).toBe("null");
    expect(lastElement("error").textContent).toBe("null");
  });

  it("handles /v1/me 404 — unauthenticated on static host (not an error)", async () => {
    const mockNotFoundResponse = {
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          error: { code: "not_found", message: "The requested resource was not found." },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockNotFoundResponse);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("loading").textContent).toBe("false");
    });

    expect(lastElement("authenticated").textContent).toBe("false");
    expect(lastElement("user-email").textContent).toBe("null");
    expect(lastElement("error").textContent).toBe("null");
  });

  it("handles /v1/me network failure — sets error state", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("loading").textContent).toBe("false");
    });

    expect(lastElement("authenticated").textContent).toBe("false");
    expect(lastElement("user-email").textContent).toBe("null");
    expect(lastElement("error").textContent).not.toBe("null");
  });

  it("handles /v1/me success with optional user name", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-2",
            email: "bob@example.com",
            name: "سارا حسینی",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("authenticated").textContent).toBe("true");
    });

    expect(lastElement("user-email").textContent).toBe("bob@example.com");
  });

  it("handles unallowed email domain — displays Persian error message", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return {
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              request_id: "test-req",
              error: { code: "unauthorized", message: "Not signed in" },
            }),
        } as Response;
      }
      return {
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            request_id: "test-req",
            error: { code: "unauthorized", message: "Email domain not allowed" },
          }),
      } as Response;
    });

    let authContext: ReturnType<typeof useAuth>;
    function ConsumerWithSignIn() {
      authContext = useAuth();
      return <div data-testid="error">{authContext.error ?? "null"}</div>;
    }

    renderWithProviders(
      <AuthProvider>
        <ConsumerWithSignIn />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authContext.isLoading).toBe(false);
    });

    try {
      await authContext.signIn("user@invalid.com", "password123");
    } catch {
      // Expected error thrown by signIn
    }

    await waitFor(() => {
      expect(lastElement("error").textContent).toBe("دامنه ایمیل مجاز نیست.");
    });
  });

  it("handles user with phone verification and exposes verification helper functions", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-phone-1",
            email: "phoneuser@example.com",
            phoneNumber: "+989123456789",
            emailVerified: false,
            phoneVerified: true,
            isVerified: true,
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    let authContext: ReturnType<typeof useAuth>;
    function ConsumerWithPhone() {
      authContext = useAuth();
      return (
        <div>
          <div data-testid="is-phone-verified">{String(authContext.isPhoneVerified)}</div>
          <div data-testid="is-verified">{String(authContext.isVerified)}</div>
          <div data-testid="user-phone">{authContext.user?.phoneNumber ?? "null"}</div>
        </div>
      );
    }

    renderWithProviders(
      <AuthProvider>
        <ConsumerWithPhone />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("is-phone-verified").textContent).toBe("true");
    });

    expect(lastElement("is-verified").textContent).toBe("true");
    expect(lastElement("user-phone").textContent).toBe("+989123456789");
    expect(typeof authContext!.sendVerification).toBe("function");
    expect(typeof authContext!.verifyChannel).toBe("function");
  });

  it("automatically logs in worker when /v1/me is 401 and worker-auto-login endpoint succeeds", async () => {
    sessionStorage.clear();

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: "unauthorized" } }),
        });
      }
      if (url.includes("/v1/auth/worker-auto-login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-auto-1",
              user: {
                id: "worker-user-1",
                email: "worker-worker-001@avana.local",
                name: "Content Worker (worker-001)",
                role: "content_worker",
                isVerified: true,
              },
              memberships: [],
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    renderWithProviders(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("authenticated").textContent).toBe("true");
    });

    expect(lastElement("user-email").textContent).toBe("worker-worker-001@avana.local");
  });

  it("prevents auto-login loop after manual signOut()", async () => {
    let authContext: ReturnType<typeof useAuth>;
    function ConsumerForSignOut() {
      authContext = useAuth();
      return (
        <div>
          <div data-testid="auth-state">{String(authContext.isAuthenticated)}</div>
          <button data-testid="sign-out-btn" onClick={() => void authContext.signOut()}>
            Sign Out
          </button>
        </div>
      );
    }

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-1",
              user: {
                id: "worker-1",
                email: "worker@avana.local",
                role: "content_worker",
              },
            }),
        });
      }
      if (url.includes("/v1/auth/sign-out")) {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    renderWithProviders(
      <AuthProvider>
        <ConsumerForSignOut />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(lastElement("auth-state").textContent).toBe("true");
    });

    // Perform manual sign-out
    await authContext!.signOut();

    expect(sessionStorage.getItem("avana_worker_logged_out")).toBe("true");
    await waitFor(() => {
      expect(lastElement("auth-state").textContent).toBe("false");
    });
  });
});
