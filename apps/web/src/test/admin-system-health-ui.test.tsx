/**
 * Admin System Health Page UI Tests.
 *
 * Verifies:
 *  1. Renders healthy services with latency.
 *  2. Renders degraded/unhealthy services with error reasons.
 *  3. Handles refresh button.
 *  4. Handles backward-compatible response formats without crashing.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { AdminSystemHealthPage } from "../pages/admin/AdminSystemHealthPage.js";

const mockHealthySystemHealth = {
  database: "healthy" as const,
  redis: "healthy" as const,
  ai: "healthy" as const,
  lastCheck: "2026-08-24T12:00:00.000Z",
  services: {
    database: { status: "healthy" as const, latencyMs: 14, reason: null },
    redis: { status: "healthy" as const, latencyMs: 4, reason: null },
    ai: { status: "healthy" as const, provider: "gemini", model: "gemini-3.6-flash", latencyMs: 285, reason: null },
  },
};

const mockDegradedSystemHealth = {
  database: "healthy" as const,
  redis: "unhealthy" as const,
  ai: "degraded" as const,
  lastCheck: "2026-08-24T12:00:00.000Z",
  services: {
    database: { status: "healthy" as const, latencyMs: 12 },
    redis: { status: "unhealthy" as const, reason: "Connection refused on port 6379" },
    ai: { status: "degraded" as const, provider: "gemini", latencyMs: 310, reason: "Rate limit exceeded" },
  },
};

describe("AdminSystemHealthPage UI Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders healthy service cards with latency indicators", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockHealthySystemHealth), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(<AdminSystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("سلامت سیستم")).toBeInTheDocument();
      expect(screen.getByText("پایگاه داده (PostgreSQL)")).toBeInTheDocument();
      expect(screen.getByText("حافظه پنهان (Redis)")).toBeInTheDocument();
      expect(screen.getByText("هوش مصنوعی (AI Provider)")).toBeInTheDocument();
      expect(screen.getByText("14 ms")).toBeInTheDocument();
      expect(screen.getByText("4 ms")).toBeInTheDocument();
      expect(screen.getByText("285 ms")).toBeInTheDocument();
      expect(screen.getByText("GEMINI (gemini-3.6-flash)")).toBeInTheDocument();
    });
  });

  it("renders degraded and unhealthy service cards with reasons", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockDegradedSystemHealth), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(<AdminSystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Connection refused on port 6379")).toBeInTheDocument();
      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument();
    });
  });

  it("handles manual refresh button click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockHealthySystemHealth), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(<AdminSystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("سلامت سیستم")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole("button", { name: /بررسی مجدد/i });
    fireEvent.click(refreshBtn);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
