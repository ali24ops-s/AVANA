import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { GlobalGenerationIndicator } from "../components/generation/GlobalGenerationIndicator.js";
import type { ActiveGenerationItem } from "../lib/api/generation.js";

// Mock mutable auth state
let mockCurrentUser: { id: string; email: string; role: string; name?: string } | null = null;
let mockUserMemberships: { organization_id: string; role: string }[] = [];

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    memberships: mockUserMemberships,
    isLoading: false,
    error: null,
    isAuthenticated: mockCurrentUser !== null,
    signOut: vi.fn(),
  }),
}));

// Mock Commerce hook
vi.mock("../hooks/useCommerce.js", () => ({
  useMySubscription: () => ({
    data: null,
    isLoading: false,
  }),
}));

const { mockGetActiveGenerations } = vi.hoisted(() => ({
  mockGetActiveGenerations: vi.fn(),
}));

vi.mock("../lib/api/generation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/generation.js")>();
  return {
    ...actual,
    createGenerationApi: () => ({
      getActiveGenerations: mockGetActiveGenerations,
      stopGeneration: vi.fn(),
      deleteGeneration: vi.fn(),
      triggerGeneration: vi.fn(),
    }),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Header GlobalGenerationIndicator - Admin Restriction & Polling Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Normal User (student): does NOT render GlobalGenerationIndicator and does NOT query /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "student-1",
      email: "student@avana.ir",
      role: "student",
      name: "دانشجو",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "student" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Give time for any unexpected effect/query to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 1. /v1/generation/active should NEVER be called for student
    expect(mockGetActiveGenerations).not.toHaveBeenCalled();

    // 2. GlobalGenerationIndicator should NOT be in DOM
    expect(screen.queryByLabelText("نشانگر وضعیت تولید محتوا")).toBeNull();
    expect(screen.queryByText("در حال تولید محتوا")).toBeNull();
    expect(screen.queryByText("تولید متوقف شد")).toBeNull();
  });

  it("Normal User (student) isolated component mount: renders null and does NOT query /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "student-1",
      email: "student@avana.ir",
      role: "student",
      name: "دانشجو",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "student" },
    ];

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GlobalGenerationIndicator />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetActiveGenerations).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("نشانگر وضعیت تولید محتوا")).toBeNull();
  });

  it("Admin User (platform_admin): renders GlobalGenerationIndicator in Header and queries /v1/generation/active", async () => {
    mockCurrentUser = {
      id: "admin-1",
      email: "admin@avana.ir",
      role: "platform_admin",
      name: "مدیر سیستم",
    };
    mockUserMemberships = [];

    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-admin-1",
      items: [
        {
          documentId: "doc-global-1",
          documentName: "neurology-handbook.pdf",
          courseId: "course-101",
          organizationId: "system-org-uuid",
          status: "generating",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 2, total: 5, percentage: 40 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Should query /v1/generation/active for admin
    await waitFor(() => {
      expect(mockGetActiveGenerations).toHaveBeenCalledTimes(1);
    });

    // 2. GlobalGenerationIndicator should be rendered and visible in Header
    await waitFor(() => {
      expect(screen.getByLabelText("نشانگر وضعیت تولید محتوا")).toBeDefined();
      expect(screen.getByText("در حال تولید محتوا")).toBeDefined();
      expect(screen.getByText("40٪")).toBeDefined();
    });
  });

  it("Admin User (organization_admin membership): renders GlobalGenerationIndicator in Header", async () => {
    mockCurrentUser = {
      id: "org-admin-1",
      email: "orgadmin@avana.ir",
      role: "student",
      name: "مدیر موسسه",
    };
    mockUserMemberships = [
      { organization_id: "00000000-0000-0000-0000-000000000001", role: "organization_admin" },
    ];

    mockGetActiveGenerations.mockResolvedValueOnce({
      request_id: "req-org-admin-1",
      items: [
        {
          documentId: "doc-org-1",
          documentName: "pharmacology.pdf",
          courseId: "course-202",
          organizationId: "00000000-0000-0000-0000-000000000001",
          status: "stopped",
          stage: "lesson",
          stageLabel: "تولید درسنامه",
          progress: { current: 1, total: 4, percentage: 25 },
          stageStartedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          error: null,
          updatedAt: new Date().toISOString(),
        } as ActiveGenerationItem,
      ],
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthenticatedShell />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockGetActiveGenerations).toHaveBeenCalled();
      expect(screen.getByText("تولید متوقف شد")).toBeDefined();
    });
  });
});
