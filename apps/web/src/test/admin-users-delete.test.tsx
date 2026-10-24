import * as React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";

const mockUserData = {
  id: "admin-1",
  email: "admin@avana.test",
  name: "Platform Admin User",
  role: "platform_admin" as const,
};

const mockUsersList = {
  users: [
    {
      id: "u-101",
      email: "student1@avana.test",
      name: "Student One",
      phoneNumber: "09121111111",
      role: "student",
      emailVerified: true,
      phoneVerified: true,
      isVerified: true,
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "u-102",
      email: "student2@avana.test",
      name: "Student Two",
      phoneNumber: null,
      role: "student",
      emailVerified: false,
      phoneVerified: false,
      isVerified: false,
      createdAt: "2026-08-05T12:00:00.000Z",
    },
  ],
  totalCount: 2,
};

function setupMockFetch(options: {
  deleteStatus?: number;
  deleteResponse?: unknown;
} = {}) {
  const { deleteStatus = 200, deleteResponse = { success: true } } = options;

  return vi.fn().mockImplementation((url: string, fetchOptions?: RequestInit) => {
    // Auth endpoints
    if (url.includes("/v1/auth/me") || url.includes("/v1/me")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ user: mockUserData }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Delete User endpoint
    if (url.includes("/v1/admin/users/") && fetchOptions?.method === "DELETE") {
      return Promise.resolve(
        new Response(
          JSON.stringify(deleteResponse),
          { status: deleteStatus, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // List Users endpoint
    if (url.includes("/v1/admin/users")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(mockUsersList),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })
    );
  });
}

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin/users"]}>
          <Routes>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("AdminUsersPage Delete User Modal & Action Tests", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders the delete account button for each user row and updated search placeholder", async () => {
    globalThis.fetch = setupMockFetch();
    renderComponent();

    // Check search placeholder
    const searchInput = await screen.findByPlaceholderText(/جستجو/i);
    expect(searchInput).toBeInTheDocument();

    // Check delete buttons in the table
    const deleteButtons = await screen.findAllByRole("button", { name: /حذف حساب کاربر/i });
    expect(deleteButtons).toHaveLength(2);
  });

  it("opens the delete confirmation modal with user info and cancel works", async () => {
    globalThis.fetch = setupMockFetch();
    renderComponent();

    const deleteButtons = await screen.findAllByRole("button", { name: /حذف حساب کاربر/i });
    fireEvent.click(deleteButtons[0]);

    // Modal title & content
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /حذف حساب کاربر/i })).toBeInTheDocument();
    expect(within(modal).getByText("student1@avana.test")).toBeInTheDocument();
    expect(within(modal).getByText("Student One")).toBeInTheDocument();
    expect(within(modal).getByText("09121111111")).toBeInTheDocument();
    expect(within(modal).getByText("u-101")).toBeInTheDocument();
    expect(within(modal).getByText(/هشدار: با حذف حساب/i)).toBeInTheDocument();

    // Cancel closes modal
    const cancelButton = screen.getByRole("button", { name: /انصراف/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /حذف حساب کاربر/i })).not.toBeInTheDocument();
    });
  });

  it("submits deletion successfully and calls DELETE API", async () => {
    const fetchMock = setupMockFetch({ deleteStatus: 200, deleteResponse: { success: true } });
    globalThis.fetch = fetchMock;
    renderComponent();

    const deleteButtons = await screen.findAllByRole("button", { name: /حذف حساب کاربر/i });
    fireEvent.click(deleteButtons[0]);

    const confirmButton = await screen.findByRole("button", { name: /تأیید و حذف حساب/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        (c: [string, RequestInit?]) => typeof c[0] === "string" && c[0].includes("/v1/admin/users/u-101") && c[1]?.method === "DELETE"
      );
      expect(deleteCalls.length).toBe(1);
    });

    // Modal closes on success
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /حذف حساب کاربر/i })).not.toBeInTheDocument();
    });
  });

  it("displays server error message and retry button when deletion fails", async () => {
    const errorMsg = "حساب کاربر دارای موجودی فعال در کیف پول است.";
    const fetchMock = setupMockFetch({
      deleteStatus: 409,
      deleteResponse: { error: { message: errorMsg } },
    });
    globalThis.fetch = fetchMock;
    renderComponent();

    const deleteButtons = await screen.findAllByRole("button", { name: /حذف حساب کاربر/i });
    fireEvent.click(deleteButtons[0]);

    const confirmButton = await screen.findByRole("button", { name: /تأیید و حذف حساب/i });
    fireEvent.click(confirmButton);

    // Error message appears
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    // Retry button is available
    expect(screen.getByRole("button", { name: /تلاش مجدد حذف/i })).toBeInTheDocument();
  });
});
