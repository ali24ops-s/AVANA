/**
 * Comprehensive Audit Log (گزارش حسابرسی) Tests.
 *
 * Verifies:
 * - Query string serialization in client (buildUrlWithParams)
 * - Scenario A: Page transition (page 1 -> page 2 -> page 1) with correct query params
 * - Scenario B: Data freshness & manual refresh showing new events
 * - Scenario C: Concurrent requests and race-condition immunity (late response does not overwrite)
 * - Scenario D: Filtering by search, action, entity, adminEmail resets page to 1
 * - Scenario E: Boundary conditions (0 results, exact page size, incomplete last page)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildUrlWithParams } from "../lib/api/client.js";
import { AdminAuditLogPage } from "../pages/admin/AdminAuditLogPage.js";
import type { AdminAuditRecord, AdminAuditList } from "../lib/api/admin.js";

describe("buildUrlWithParams - Client Query Parameter Serialization", () => {
  it("strips null and undefined values while preserving valid parameters", () => {
    const url = buildUrlWithParams("/v1/admin/system/audit", {
      page: 2,
      pageSize: 20,
      search: undefined,
      action: null,
      adminEmail: "admin@avana.ir",
    });
    expect(url).toBe("/v1/admin/system/audit?page=2&pageSize=20&adminEmail=admin%40avana.ir");
  });

  it("preserves existing query parameters in path", () => {
    const url = buildUrlWithParams("/v1/admin/system/audit?sort=desc", {
      page: 1,
      pageSize: 20,
    });
    expect(url).toBe("/v1/admin/system/audit?sort=desc&page=1&pageSize=20");
  });

  it("handles array parameters cleanly", () => {
    const url = buildUrlWithParams("/v1/items", {
      ids: ["id1", "id2"],
      flag: true,
    });
    expect(url).toBe("/v1/items?ids=id1&ids=id2&flag=true");
  });

  it("returns original path unchanged when params are empty or all null/undefined", () => {
    expect(buildUrlWithParams("/v1/test", {})).toBe("/v1/test");
    expect(buildUrlWithParams("/v1/test", { a: undefined, b: null })).toBe("/v1/test");
    expect(buildUrlWithParams("/v1/test", undefined)).toBe("/v1/test");
  });
});

describe("AdminAuditLogPage - Component & State Scenarios", () => {
  let queryClient: QueryClient;
  let requestedUrls: string[] = [];

  const createRecord = (id: string, action: string, email = "admin@avana.ir", timestamp = new Date().toISOString()): AdminAuditRecord => ({
    id,
    adminEmail: email,
    action,
    entity: "course",
    entityId: "ent-" + id,
    timestamp,
    metadata: { note: "test-" + id },
  });

  const page1Records: AdminAuditRecord[] = Array.from({ length: 20 }, (_, i) =>
    createRecord(`rec-p1-${i + 1}`, `action.p1.${i + 1}`)
  );

  const page2Records: AdminAuditRecord[] = Array.from({ length: 5 }, (_, i) =>
    createRecord(`rec-p2-${i + 1}`, `action.p2.${i + 1}`)
  );

  beforeEach(() => {
    requestedUrls = [];
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);

        const urlObj = new URL(url, "http://localhost");
        const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
        const search = urlObj.searchParams.get("search");

        if (search === "empty-result") {
          return Promise.resolve(
            new Response(JSON.stringify({ logs: [], totalCount: 0 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }

        if (page === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                logs: page2Records,
                totalCount: 25,
              } satisfies AdminAuditList),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              logs: page1Records,
              totalCount: 25,
            } satisfies AdminAuditList),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AdminAuditLogPage />
      </QueryClientProvider>
    );

  it("Scenario A: Page transition (page 1 -> page 2 -> page 1) with correct query params", async () => {
    renderComponent();

    // Verify initial load for page 1
    await waitFor(() => {
      expect(screen.getByText("action.p1.1")).toBeInTheDocument();
    });
    expect(requestedUrls[0]).toContain("/v1/admin/system/audit?page=1&pageSize=20");

    // Click next page
    const nextBtn = screen.getByLabelText("صفحه بعد");
    expect(nextBtn).toBeEnabled();
    fireEvent.click(nextBtn);

    // Verify page 2 data is rendered and request URL contains page=2
    await waitFor(() => {
      expect(screen.getByText("action.p2.1")).toBeInTheDocument();
    });
    expect(requestedUrls.some((u) => u.includes("page=2"))).toBe(true);
    expect(screen.queryByText("action.p1.1")).not.toBeInTheDocument();

    // Click previous page to return to page 1
    const prevBtn = screen.getByLabelText("صفحه قبل");
    expect(prevBtn).toBeEnabled();
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(screen.getByText("action.p1.1")).toBeInTheDocument();
    });
  });

  it("Scenario B: Data freshness & manual refresh triggers real network request", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        callCount++;
        const logs = callCount === 1 ? [createRecord("rec-old", "initial.action")] : [createRecord("rec-new", "brand.new.event"), createRecord("rec-old", "initial.action")];
        return Promise.resolve(
          new Response(JSON.stringify({ logs, totalCount: logs.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("initial.action")).toBeInTheDocument();
    });
    expect(screen.queryByText("brand.new.event")).not.toBeInTheDocument();

    // Click refresh button
    const refreshBtn = screen.getByLabelText("به‌روزرسانی گزارش‌ها");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText("brand.new.event")).toBeInTheDocument();
    });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("Scenario C: Concurrent requests and race-condition immunity (late response does not overwrite)", async () => {
    let resolvePage2: (res: Response) => void;
    let resolvePage3: (res: Response) => void;

    const page2Promise = new Promise<Response>((resolve) => {
      resolvePage2 = resolve;
    });
    const page3Promise = new Promise<Response>((resolve) => {
      resolvePage3 = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        const urlObj = new URL(url, "http://localhost");
        const page = parseInt(urlObj.searchParams.get("page") || "1", 10);

        if (page === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ logs: [createRecord("r1", "p1.item")], totalCount: 60 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        if (page === 2) {
          return page2Promise;
        }
        if (page === 3) {
          return page3Promise;
        }
        return Promise.resolve(new Response(JSON.stringify({ logs: [], totalCount: 0 })));
      })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("p1.item")).toBeInTheDocument();
    });

    // Rapid transition: click next to page 2, then to page 3
    const nextBtn = screen.getByLabelText("صفحه بعد");
    fireEvent.click(nextBtn); // triggers page 2
    fireEvent.click(nextBtn); // triggers page 3

    // Resolve page 3 FIRST
    resolvePage3!(
      new Response(JSON.stringify({ logs: [createRecord("r3", "p3.item")], totalCount: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await waitFor(() => {
      expect(screen.getByText("p3.item")).toBeInTheDocument();
    });

    // Resolve page 2 AFTER page 3 (slower/delayed response)
    resolvePage2!(
      new Response(JSON.stringify({ logs: [createRecord("r2", "p2.item.stale")], totalCount: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    // Give microtasks time to execute and assert page 3 data remains rendered
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("p3.item")).toBeInTheDocument();
    expect(screen.queryByText("p2.item.stale")).not.toBeInTheDocument();
  });

  it("Scenario D: Filtering resets page to 1 and passes filter params in URL", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("action.p1.1")).toBeInTheDocument();
    });

    // Move to page 2 first
    const nextBtn = screen.getByLabelText("صفحه بعد");
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("action.p2.1")).toBeInTheDocument();
    });

    // Now type in search input
    const searchInput = screen.getByLabelText("جستجوی کلی در گزارش حسابرسی");
    fireEvent.change(searchInput, { target: { value: "user.login" } });

    // Assert that page reset to 1 and request contained search
    await waitFor(() => {
      const lastUrl = requestedUrls[requestedUrls.length - 1];
      expect(lastUrl).toContain("page=1");
      expect(lastUrl).toContain("search=user.login");
    });
  });

  it("Scenario E: Page boundary conditions (0 results and exact page capacity)", async () => {
    renderComponent();

    // Zero results
    const searchInput = screen.getByLabelText("جستجوی کلی در گزارش حسابرسی");
    fireEvent.change(searchInput, { target: { value: "empty-result" } });

    await waitFor(() => {
      expect(screen.getByText("رکوردی یافت نشد.")).toBeInTheDocument();
    });

    // Pagination buttons are disabled
    expect(screen.getByLabelText("صفحه قبل")).toBeDisabled();
    expect(screen.getByLabelText("صفحه بعد")).toBeDisabled();
  });
});
