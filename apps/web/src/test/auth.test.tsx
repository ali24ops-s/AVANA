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
});
