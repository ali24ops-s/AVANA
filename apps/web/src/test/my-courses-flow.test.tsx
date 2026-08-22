/**
 * Frontend Tests for "My Courses" (دوره‌های من) User Flow.
 *
 * Tests:
 * 1. Automatic modal opening for first-time user without courses.
 * 2. Course selection in modal and persisting with "تأیید و ادامه".
 * 3. Opening modal via "+ افزودن دوره" CTA button with preselected courses.
 * 4. Deleting a course with confirmation dialog.
 * 5. Empty state presentation when no courses remain without auto-modal looping.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseListPage } from "../pages/CourseListPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("avana_auth_token", "test-token");
  }
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("My Courses (دوره‌های من) Complete Frontend Flow", () => {
  const orgId = "org-my-courses-123";
  const course1 = {
    id: "00000000-0000-4000-8000-000000000001",
    organization_id: orgId,
    title: "فارماکولوژی ۱",
    subject: "داروسازی",
    exam_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
  };
  const course2 = {
    id: "00000000-0000-4000-8000-000000000002",
    organization_id: orgId,
    title: "فیزیولوژی ۱",
    subject: "پزشکی",
    exam_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
  };

  it("opens modal automatically for new user without courses and allows selecting courses", async () => {
    const queryClient = createTestQueryClient();
    let myCoursesList: any[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = url.toString();
      const method = init?.method || "GET";

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
                memberships: [{ organization_id: orgId, role: "student" }],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشکده پزشکی" }] }),
          text: () => Promise.resolve(JSON.stringify({ items: [{ id: orgId, name: "دانشکده پزشکی" }] })),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses/my`)) {
        if (method === "PUT") {
          let bodyObj: any = {};
          if (typeof init?.body === "string") {
            bodyObj = JSON.parse(init.body);
          } else if (init?.body) {
            bodyObj = init.body;
          }
          const ids = bodyObj.course_ids || [];
          myCoursesList = [course1, course2].filter((c) => ids.includes(c.id));
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: myCoursesList }),
            text: () => Promise.resolve(JSON.stringify({ items: myCoursesList })),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: myCoursesList }),
          text: () => Promise.resolve(JSON.stringify({ items: myCoursesList })),
        } as Response);
      }


      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [course1, course2] }),
          text: () => Promise.resolve(JSON.stringify({ items: [course1, course2] })),
        } as Response);
      }

      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ total_lessons: 5, completed_lessons: 2, percentage: 40 }),
          text: () => Promise.resolve(JSON.stringify({ total_lessons: 5, completed_lessons: 2, percentage: 40 })),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses"]}>
          <AuthProvider>
            <CourseListPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify modal title appears automatically
    await waitFor(() => {
      expect(
        screen.getByText("دوره‌های مورد علاقه‌ات را انتخاب کن"),
      ).toBeDefined();
    });

    // Both courses are rendered in the modal
    expect(screen.getByText("فارماکولوژی ۱")).toBeDefined();
    expect(screen.getByText("فیزیولوژی ۱")).toBeDefined();

    // Select course 1 (click on the card button)
    const course1Btn = screen.getByRole("button", { name: /فارماکولوژی ۱/ });
    fireEvent.click(course1Btn);

    // Submit selection
    const confirmButton = screen.getByRole("button", { name: "تأیید و ادامه" });
    fireEvent.click(confirmButton);

    // Modal closes and course 1 appears in My Courses
    expect(await screen.findByText(/1 دوره در لیست شما/)).toBeDefined();
  });


  it("opens delete confirmation modal and removes course from user list", async () => {
    const queryClient = createTestQueryClient();
    let myCoursesList = [course1];

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = url.toString();
      const method = init?.method || "GET";

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
                memberships: [{ organization_id: orgId, role: "student" }],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشکده پزشکی" }] }),
          text: () => Promise.resolve(JSON.stringify({ items: [{ id: orgId, name: "دانشکده پزشکی" }] })),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses/my/${course1.id}`)) {
        if (method === "DELETE") {
          myCoursesList = [];
          return Promise.resolve({
            ok: true,
            status: 204,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(""),
          } as Response);
        }
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses/my`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: myCoursesList }),
          text: () => Promise.resolve(JSON.stringify({ items: myCoursesList })),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [course1, course2] }),
          text: () => Promise.resolve(JSON.stringify({ items: [course1, course2] })),
        } as Response);
      }

      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ total_lessons: 5, completed_lessons: 2, percentage: 40 }),
          text: () => Promise.resolve(JSON.stringify({ total_lessons: 5, completed_lessons: 2, percentage: 40 })),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses"]}>
          <AuthProvider>
            <CourseListPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial page shows Course 1
    const deleteButton = await screen.findByLabelText("حذف از دوره‌های من");
    fireEvent.click(deleteButton);

    // Confirmation modal should be visible
    expect(await screen.findByText("حذف از دوره‌های من")).toBeDefined();
    expect(
      screen.getByText(/آیا مطمئن هستید که می‌خواهید دوره/),
    ).toBeDefined();

    // Click "حذف دوره" confirm button
    const confirmDeleteBtn = screen.getByRole("button", { name: "حذف دوره" });
    fireEvent.click(confirmDeleteBtn);

    // Verify empty state is rendered
    expect(
      await screen.findByText("هنوز دوره‌ای به لیست شما اضافه نشده است"),
    ).toBeDefined();
  });

  it("does NOT auto-open modal for user with existing courses, but opens on clicking CTA", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();

      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
                memberships: [{ organization_id: orgId, role: "student" }],
              }),
            ),
        } as Response);
      }

      if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشکده پزشکی" }] }),
          text: () => Promise.resolve(JSON.stringify({ items: [{ id: orgId, name: "دانشکده پزشکی" }] })),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses/my`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [course1] }),
          text: () => Promise.resolve(JSON.stringify({ items: [course1] })),
        } as Response);
      }

      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [course1, course2] }),
          text: () => Promise.resolve(JSON.stringify({ items: [course1, course2] })),
        } as Response);
      }

      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ total_lessons: 5, completed_lessons: 2, percentage: 40 }),
          text: () => Promise.resolve(JSON.stringify({ total_lessons: 5, completed_lessons: 2, percentage: 40 })),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses"]}>
          <AuthProvider>
            <CourseListPage />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial page shows Course 1 directly
    expect(await screen.findByText("فارماکولوژی ۱")).toBeDefined();

    // Modal should NOT be open
    expect(screen.queryByText("دوره‌های مورد علاقه‌ات را انتخاب کن")).toBeNull();

    // Click "+ افزودن دوره" CTA button in header
    const addCourseBtns = screen.getAllByRole("button", { name: /افزودن دوره/ });
    fireEvent.click(addCourseBtns[0]);


    // Modal opens
    expect(
      await screen.findByText("دوره‌های مورد علاقه‌ات را انتخاب کن"),
    ).toBeDefined();

    // 1 course is preselected (course1)
    expect(screen.getByText(/دوره انتخاب شده/)).toBeDefined();

    // Click "انصراف" to close

    const cancelBtn = screen.getByRole("button", { name: "انصراف" });
    fireEvent.click(cancelBtn);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText("دوره‌های مورد علاقه‌ات را انتخاب کن")).toBeNull();
    });
  });
});

