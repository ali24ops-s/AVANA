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
    import.meta.env.VITE_AUTH_ENABLED = "true";
  });

  describe("when VITE_AUTH_ENABLED=false (Public / Demo Mode)", () => {
    it("calls /v1/me on mount to resolve demo user if backend is available", async () => {
      import.meta.env.VITE_AUTH_ENABLED = "false";
      const mockMeResponse = {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            request_id: "test-demo-req",
            user: {
              id: "79bda286-08a4-4a16-9340-4106864e0732",
              email: "ali1383mohammadlo@gmail.com",
              name: "علی",
              role: "platform_admin",
              emailVerified: true,
            },
            memberships: [
              {
                organization_id: "389575c5-7563-4242-854a-9af1a988eb3a",
                role: "student",
              },
            ],
          }),
      } as Response;

      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

      renderWithProviders(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(lastElement("loading").textContent).toBe("false");
      });

      expect(lastElement("authenticated").textContent).toBe("true");
      expect(lastElement("user-email").textContent).toBe("ali1383mohammadlo@gmail.com");
      expect(lastElement("error").textContent).toBe("null");
    });

    it("gracefully falls back without crashing when /v1/me fails on static host in demo mode", async () => {
      import.meta.env.VITE_AUTH_ENABLED = "false";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));

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

    it("does not dispatch network requests on signIn or signOut in demo mode", async () => {
      import.meta.env.VITE_AUTH_ENABLED = "false";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      let authContext: ReturnType<typeof useAuth>;
      function ConsumerWithActions() {
        authContext = useAuth();
        return <div data-testid="error">{authContext.error ?? "null"}</div>;
      }

      renderWithProviders(
        <AuthProvider>
          <ConsumerWithActions />
        </AuthProvider>,
      );

      await authContext!.signIn("any@example.com", "pass");
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Only the initial /v1/me on mount

      await authContext!.signOut();
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still only initial /v1/me
    });
  });

  describe("when VITE_AUTH_ENABLED=true (Full Authentication Mode)", () => {
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
});
});


