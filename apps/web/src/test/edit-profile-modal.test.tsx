import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../providers/AuthProvider.js";
import { EditProfileModal } from "../components/shell/EditProfileModal.js";
import { useState } from "react";

function TestProfileWrapper() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div data-testid="current-user-name">{user?.name ?? "no-name"}</div>
      <EditProfileModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("EditProfileModal & Profile Update", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with initial user first and last name populated", async () => {
    // Mock /v1/me initial fetch
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: "u-123",
            email: "ali@example.com",
            name: "علی",
            role: "student",
            isVerified: true,
          },
          memberships: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderWithProviders(
      <AuthProvider>
        <TestProfileWrapper />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("علی")).toBeInTheDocument();
    });
  });

  it("successfully submits updated first and last name and updates current user state", async () => {
    // 1. Mock initial /v1/me
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-123",
              email: "ali@example.com",
              name: "علی",
              role: "student",
              isVerified: true,
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      // 2. Mock PATCH /v1/auth/profile
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-123",
              email: "ali@example.com",
              name: "علی محمدلو",
              role: "student",
              isVerified: true,
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    renderWithProviders(
      <AuthProvider>
        <TestProfileWrapper />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("علی")).toBeInTheDocument();
    });

    const lastNameInput = screen.getByPlaceholderText("مثلاً: محمدلو");
    fireEvent.change(lastNameInput, { target: { value: "محمدلو" } });

    const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("current-user-name")).toHaveTextContent("علی محمدلو");
    });
  });

  it("shows validation error if first name or last name is too short", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: "u-123",
            email: "ali@example.com",
            name: "علی",
            role: "student",
            isVerified: true,
          },
          memberships: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderWithProviders(
      <AuthProvider>
        <TestProfileWrapper />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("علی")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("نام خانوادگی باید حداقل ۲ کاراکتر باشد.")).toBeInTheDocument();
    });
  });

  it("renders academic field dropdown with actual Persian labels and invalidates course queries upon major update", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-123",
              email: "student@example.com",
              name: "سارا حسینی",
              role: "student",
              major: "pharmacy",
              isVerified: true,
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-123",
              email: "student@example.com",
              name: "سارا حسینی",
              role: "student",
              major: "medicine",
              isVerified: true,
            },
            memberships: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestProfileWrapper />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Verify select dropdown has option with Persian label "پزشکی" and "داروسازی"
    await waitFor(() => {
      const selectElement = screen.getByLabelText("رشته تحصیلی") as HTMLSelectElement;
      expect(selectElement).toBeInTheDocument();
      expect(selectElement.value).toBe("pharmacy");
      expect(screen.getByRole("option", { name: "داروسازی" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "پزشکی" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "دندانپزشکی" })).toBeInTheDocument();
    });

    // Change major to medicine
    const selectElement = screen.getByLabelText("رشته تحصیلی") as HTMLSelectElement;
    fireEvent.change(selectElement, { target: { value: "medicine" } });

    const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["my-courses"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["courses"] });
    });
  });
});
