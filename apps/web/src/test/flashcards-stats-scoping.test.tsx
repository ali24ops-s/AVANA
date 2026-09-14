import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-test", email: "tester@example.com" },
    memberships: [{ organization_id: "org-scope-test", role: "organization_admin" }],
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockStorage,
  writable: true,
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Flashcards Statistics Scoping (4 Stat Tiles)", () => {
  const mockOrgId = "org-scope-test";

  const mockSummaryData = {
    request_id: "req-scoping",
    total_cards: 90,
    total_due: 18,
    total_new: 27,
    total_overdue: 9,
    total_learning: 0,
    courses: [
      {
        course_id: "course-a",
        title: "دوره A",
        total_cards: 50,
        due_cards: 10,
        new_cards: 15,
        overdue_cards: 5,
        learning_cards: 0,
        modules: [
          {
            module_id: "mod-a1",
            title: "فصل A1",
            total_cards: 30,
            due_cards: 6,
            new_cards: 10,
            overdue_cards: 3,
            learning_cards: 0,
            lessons: [],
          },
          {
            module_id: "mod-a2",
            title: "فصل A2",
            total_cards: 20,
            due_cards: 4,
            new_cards: 5,
            overdue_cards: 2,
            learning_cards: 0,
            lessons: [],
          },
        ],
      },
      {
        course_id: "course-b",
        title: "دوره B",
        total_cards: 40,
        due_cards: 8,
        new_cards: 12,
        overdue_cards: 4,
        learning_cards: 0,
        modules: [
          {
            module_id: "mod-b1",
            title: "فصل B1",
            total_cards: 40,
            due_cards: 8,
            new_cards: 12,
            overdue_cards: 4,
            learning_cards: 0,
            lessons: [],
          },
        ],
      },
      {
        course_id: "course-empty",
        title: "دوره بدون کارت",
        total_cards: 0,
        due_cards: 0,
        new_cards: 0,
        overdue_cards: 0,
        learning_cards: 0,
        modules: [],
      },
    ],
  };

  beforeEach(() => {
    mockStorage.clear();
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Test Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSummaryData,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });
  });

  const getStatTileValue = (label: string): string => {
    const labelElem = screen.getByText(label);
    const tile = labelElem.closest("div");
    const h3 = tile?.querySelector("h3");
    return h3?.textContent?.trim() || "";
  };

  it("Scenario A: Initial state ('All') displays global total statistics across all accessible courses", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
    });

    // Forgotten (overdue): 9
    expect(getStatTileValue("کارت فراموش شده")).toBe("9");
    // New: 27
    expect(getStatTileValue("کارت‌های جدید")).toBe("27");
    // Due: 18
    expect(getStatTileValue("نیاز به مرور")).toBe("18");
    // Learned: 90 - (18 + 27) = 45
    expect(getStatTileValue("یادگرفته شده")).toBe("45");
  });

  it("Scenario B & G: Selecting Course A scopes all 4 statistics to Course A only, ignoring Course B", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
    });

    // Select Course A
    const courseAButton = screen.getByLabelText("انتخاب کل دوره دوره A");
    fireEvent.click(courseAButton);

    await waitFor(() => {
      // Course A stats:
      // Overdue: 5
      expect(getStatTileValue("کارت فراموش شده")).toBe("5");
      // New: 15
      expect(getStatTileValue("کارت‌های جدید")).toBe("15");
      // Due: 10
      expect(getStatTileValue("نیاز به مرور")).toBe("10");
      // Learned: 50 - (10 + 15) = 25
      expect(getStatTileValue("یادگرفته شده")).toBe("25");
    });
  });

  it("Scenario C, E, F: Chapter selection, fast switching between chapters, and returning to 'All'", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
    });

    // Expand Course A accordion
    fireEvent.click(screen.getByText("دوره A"));

    await waitFor(() => {
      expect(screen.getByText("فصل A1")).toBeDefined();
      expect(screen.getByText("فصل A2")).toBeDefined();
    });

    // 1. Scenario C: Select Chapter A1
    fireEvent.click(screen.getByText("فصل A1"));

    await waitFor(() => {
      // Mod A1 stats: total 30, due 6, new 10, overdue 3, learned 30 - 16 = 14
      expect(getStatTileValue("کارت فراموش شده")).toBe("3");
      expect(getStatTileValue("کارت‌های جدید")).toBe("10");
      expect(getStatTileValue("نیاز به مرور")).toBe("6");
      expect(getStatTileValue("یادگرفته شده")).toBe("14");
    });

    // 2. Scenario E: Fast switch from Chapter A1 to Chapter A2
    // Uncheck Chapter A1, check Chapter A2
    fireEvent.click(screen.getByText("فصل A1"));
    fireEvent.click(screen.getByText("فصل A2"));

    await waitFor(() => {
      // Mod A2 stats: total 20, due 4, new 5, overdue 2, learned 20 - 9 = 11
      expect(getStatTileValue("کارت فراموش شده")).toBe("2");
      expect(getStatTileValue("کارت‌های جدید")).toBe("5");
      expect(getStatTileValue("نیاز به مرور")).toBe("4");
      expect(getStatTileValue("یادگرفته شده")).toBe("11");
    });

    // 3. Scenario F: Return from Chapter A2 to "All" (deselect Chapter A2)
    fireEvent.click(screen.getByText("فصل A2"));

    await waitFor(() => {
      // Returns to global summary
      expect(getStatTileValue("کارت فراموش شده")).toBe("9");
      expect(getStatTileValue("کارت‌های جدید")).toBe("27");
      expect(getStatTileValue("نیاز به مرور")).toBe("18");
      expect(getStatTileValue("یادگرفته شده")).toBe("45");
    });
  });

  it("Scenario D: Empty scope returns 0 for all 4 statistics without error", async () => {
    // Custom test with an empty course summary
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Test Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-empty-scope",
            total_cards: 0,
            total_due: 0,
            total_new: 0,
            total_overdue: 0,
            courses: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است.")).toBeDefined();
    });

    expect(getStatTileValue("کارت فراموش شده")).toBe("0");
    expect(getStatTileValue("کارت‌های جدید")).toBe("0");
    expect(getStatTileValue("نیاز به مرور")).toBe("0");
    expect(getStatTileValue("یادگرفته شده")).toBe("0");
  });

  it("Scenario Union: Selecting multiple chapters across courses calculates their union accurately", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
      expect(screen.getByText("دوره B")).toBeDefined();
    });

    // Expand Course A & Course B
    fireEvent.click(screen.getByText("دوره A"));
    fireEvent.click(screen.getByText("دوره B"));

    await waitFor(() => {
      expect(screen.getByText("فصل A1")).toBeDefined();
      expect(screen.getByText("فصل B1")).toBeDefined();
    });

    // Select Chapter A1 and Chapter B1
    fireEvent.click(screen.getByText("فصل A1"));
    fireEvent.click(screen.getByText("فصل B1"));

    await waitFor(() => {
      // Mod A1 (30 cards, 6 due, 10 new, 3 overdue) + Mod B1 (40 cards, 8 due, 12 new, 4 overdue)
      // Total: 70 cards, 14 due, 22 new, 7 overdue, learned: 70 - (14 + 22) = 34
      expect(getStatTileValue("کارت فراموش شده")).toBe("7");
      expect(getStatTileValue("کارت‌های جدید")).toBe("22");
      expect(getStatTileValue("نیاز به مرور")).toBe("14");
      expect(getStatTileValue("یادگرفته شده")).toBe("34");
    });
  });

  it("Scenario Click Action: Clicking a stat tile with count > 0 creates a study session with exact scope and customMode", async () => {
    let capturedSessionPayload: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary") && !url.includes("flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Test Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSummaryData,
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-sessions`)) {
        if (options && options.body) {
          capturedSessionPayload = JSON.parse(options.body);
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            request_id: "req-sess",
            session: {
              id: "session-created-123",
              organization_id: mockOrgId,
              user_id: "user-test",
              total_cards: 5,
              status: "in_progress",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
    });

    // 1. Select Course A
    const courseAButton = screen.getByLabelText("انتخاب کل دوره دوره A");
    fireEvent.click(courseAButton);

    await waitFor(() => {
      expect(getStatTileValue("کارت فراموش شده")).toBe("5");
    });

    // 2. Click the "کارت فراموش شده" (Forgotten/overdue) tile
    const forgottenTile = screen.getByText("کارت فراموش شده").closest("div");
    expect(forgottenTile).toBeDefined();
    fireEvent.click(forgottenTile!);

    await waitFor(() => {
      expect(capturedSessionPayload).not.toBeNull();
      expect(capturedSessionPayload.courseIds).toEqual(["course-a"]);
      expect(capturedSessionPayload.customMode).toBe("overdue");
      expect(capturedSessionPayload.mode).toBe("custom");
      expect(capturedSessionPayload.limit).toBe(120);
      expect(mockNavigate).toHaveBeenCalledWith("/flashcards/review?sessionId=session-created-123");
    });
  });

  it("Scenario Zero Disabled: Clicking a stat tile with count == 0 is disabled and does NOT create a session", async () => {
    let sessionCreationAttempted = false;
    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary") && !url.includes("flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Test Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-empty-scope",
            total_cards: 0,
            total_due: 0,
            total_new: 0,
            total_overdue: 0,
            courses: [],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-sessions`)) {
        if (options?.method === "POST") {
          sessionCreationAttempted = true;
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ session: { id: "should-not-reach" } }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ sessions: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است.")).toBeDefined();
    });

    const forgottenTile = screen.getByText("کارت فراموش شده").closest("div");
    expect(forgottenTile?.className).toContain("cursor-not-allowed");
    expect(forgottenTile?.className).toContain("opacity-60");

    mockNavigate.mockClear();
    fireEvent.click(forgottenTile!);

    // Should NOT call session creation and should NOT navigate
    expect(sessionCreationAttempted).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("Scenario Review Limits: Default limits (40 for new, 120 for review) and custom user limits persist via localStorage and are sent to backend", async () => {
    let capturedSessionPayload: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary") && !url.includes("flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Test Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSummaryData,
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-sessions`)) {
        if (options && options.body) {
          capturedSessionPayload = JSON.parse(options.body);
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            request_id: "req-sess",
            session: {
              id: "session-created-456",
              organization_id: mockOrgId,
              user_id: "user-test",
              total_cards: 10,
              status: "in_progress",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره A")).toBeDefined();
    });

    // 1. Check default New Cards click sends limit: 40
    const newCardsTile = screen.getByText("کارت‌های جدید").closest("div");
    fireEvent.click(newCardsTile!);

    await waitFor(() => {
      expect(capturedSessionPayload).not.toBeNull();
      expect(capturedSessionPayload.customMode).toBe("new");
      expect(capturedSessionPayload.limit).toBe(40);
    });

    // 2. Open settings modal and change New Limit to 25 and Review Limit to 80
    fireEvent.click(screen.getByText("تنظیمات مرور"));

    const newLimitInput = screen.getByDisplayValue("40");
    fireEvent.change(newLimitInput, { target: { value: "25" } });

    const reviewLimitInput = screen.getByDisplayValue("120");
    fireEvent.change(reviewLimitInput, { target: { value: "80" } });

    // Click "ذخیره تغییرات"
    fireEvent.click(screen.getByText("ذخیره تغییرات"));

    // Verify localStorage has the persisted values
    expect(window.localStorage.getItem("avana_flashcards_new_limit")).toBe("25");
    expect(window.localStorage.getItem("avana_flashcards_review_limit")).toBe("80");

    // 3. Click "نیاز به مرور" tile and verify limit: 80 is sent
    capturedSessionPayload = null;
    const dueTile = screen.getByText("نیاز به مرور").closest("div");
    fireEvent.click(dueTile!);

    await waitFor(() => {
      expect(capturedSessionPayload).not.toBeNull();
      expect(capturedSessionPayload.customMode).toBe("due");
      expect(capturedSessionPayload.limit).toBe(80);
    });

    // 4. Click "کارت‌های جدید" tile and verify limit: 25 is sent
    capturedSessionPayload = null;
    fireEvent.click(newCardsTile!);

    await waitFor(() => {
      expect(capturedSessionPayload).not.toBeNull();
      expect(capturedSessionPayload.customMode).toBe("new");
      expect(capturedSessionPayload.limit).toBe(25);
    });
  });
});

