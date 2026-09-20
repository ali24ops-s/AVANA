import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { CoursePublicationBanner } from "../components/courses/CoursePublicationBanner.js";
import { RequestCoursePublishModal } from "../components/courses/RequestCoursePublishModal.js";
import { CourseStructureManager } from "../components/courses/CourseStructureManager.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("User Course Publication Flow & Status UI", () => {
  const orgId = "org-user-1";
  const courseId = "course-123";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders CTA button when non-official course is not submitted for publication yet (Draft)", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/publication-status`)) {
        return new Response(JSON.stringify({ publication: null, isOfficial: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره هوش مصنوعی"
            courseSubject="مهندسی کامپیوتر"
            isOfficial={false}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("request-publish-cta-button")).toBeDefined();
      expect(screen.getByText("درخواست انتشار در کتابخانه")).toBeDefined();
      expect(screen.getByText("اشتراک‌گذاری و انتشار دوره در کتابخانه")).toBeDefined();
    });
  });

  it("does NOT render CTA or banner when course is an official AVANA course (isOfficial=true)", async () => {
    const queryClient = createTestQueryClient();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره فیزیولوژی پزشکی (رسمی)"
            courseSubject="پزشکی"
            isOfficial={true}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    // Completely removed from DOM
    expect(screen.queryByTestId("course-publication-banner")).toBeNull();
    expect(screen.queryByText("اشتراک‌گذاری و انتشار دوره در کتابخانه")).toBeNull();
    expect(screen.queryByText("درخواست انتشار در کتابخانه")).toBeNull();
    expect(screen.queryByTestId("request-publish-cta-button")).toBeNull();
    // No unnecessary network query when isOfficial is true
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT render CTA or banner when publication-status response indicates isOfficial=true", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/publication-status`)) {
        return new Response(JSON.stringify({ publication: null, isOfficial: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره فارماکولوژی"
            courseSubject="داروسازی"
            isOfficial={false}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("course-publication-banner")).toBeNull();
      expect(screen.queryByText("اشتراک‌گذاری و انتشار دوره در کتابخانه")).toBeNull();
      expect(screen.queryByText("درخواست انتشار در کتابخانه")).toBeNull();
    });
  });

  it("renders pending review badge and prevents duplicate requests when status is pending_review", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/publication-status`)) {
        return new Response(
          JSON.stringify({
            publication: {
              id: "pub-1",
              status: "pending_review",
              version: 1,
              publishedAt: null,
              rejectionReason: null,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره هوش مصنوعی"
            courseSubject="مهندسی کامپیوتر"
            isOfficial={false}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("در انتظار بررسی ادمین")).toBeDefined();
      expect(screen.queryByTestId("request-publish-cta-button")).toBeNull();
    });
  });

  it("renders published badge when non-official course publication is approved and published in library", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/publication-status`)) {
        return new Response(
          JSON.stringify({
            publication: {
              id: "pub-1",
              status: "published",
              version: 1,
              publishedAt: "2026-09-18T12:00:00Z",
              rejectionReason: null,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره هوش مصنوعی"
            courseSubject="مهندسی کامپیوتر"
            isOfficial={false}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("منتشر شده در کتابخانه")).toBeDefined();
      expect(screen.queryByTestId("request-publish-cta-button")).toBeNull();
    });
  });

  it("renders rejected badge, rejection reason and retry CTA when status is rejected", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/publication-status`)) {
        return new Response(
          JSON.stringify({
            publication: {
              id: "pub-1",
              status: "rejected",
              version: 1,
              publishedAt: null,
              rejectionReason: "کیفیت فایل پی‌دی‌اف اسکن‌شده پایین است.",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CoursePublicationBanner
            organizationId={orgId}
            courseId={courseId}
            courseTitle="دوره هوش مصنوعی"
            courseSubject="مهندسی کامپیوتر"
            isOfficial={false}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("رد شده")).toBeDefined();
      expect(
        screen.getByText(/کیفیت فایل پی‌دی‌اف اسکن‌شده پایین است/),
      ).toBeDefined();
      expect(screen.getByText("درخواست مجدد انتشار")).toBeDefined();
    });
  });

  it("submits publication request cleanly via RequestCoursePublishModal for non-official course", async () => {
    const publishSpy = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          publication: { id: "pub-created-1", status: "pending_review" },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(publishSpy);

    const onSubmitted = vi.fn();
    const onClose = vi.fn();

    render(
      <RequestCoursePublishModal
        isOpen={true}
        onClose={onClose}
        organizationId={orgId}
        courseId={courseId}
        courseTitle="دوره برنامه‌نویسی پایتون"
        courseDescription="آموزش صفر تا صد پایتون"
        courseSubject="برنامه‌نویسی"
        isOfficial={false}
        onSubmitted={onSubmitted}
      />,
    );

    expect(screen.getByText("دوره برنامه‌نویسی پایتون")).toBeDefined();
    expect(screen.getByText("آموزش صفر تا صد پایتون")).toBeDefined();

    const submitBtn = screen.getByText("ثبت درخواست انتشار");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(publishSpy).toHaveBeenCalled();
      expect(onSubmitted).toHaveBeenCalled();
      expect(screen.getByText("درخواست انتشار با موفقیت ثبت شد!")).toBeDefined();
    });
  });

  it("does NOT render RequestCoursePublishModal when isOfficial=true", () => {
    const onClose = vi.fn();
    const { container } = render(
      <RequestCoursePublishModal
        isOpen={true}
        onClose={onClose}
        organizationId={orgId}
        courseId={courseId}
        courseTitle="دوره رسمی آوانا"
        isOfficial={true}
      />,
    );

    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("درخواست انتشار دوره در کتابخانه")).toBeNull();
  });

  it("CourseStructureManager hides publication CTA and displays official badge for official courses", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/structure`)) {
        return new Response(
          JSON.stringify({
            course: {
              id: courseId,
              title: "دوره فارماکولوژی پایه (رسمی)",
              description: "توضیحات رسمی",
              subject: "داروسازی",
              status: "published",
              isOfficial: true,
              createdAt: "2026-09-18T12:00:00Z",
              updatedAt: "2026-09-18T12:00:00Z",
            },
            chapters: [
              {
                id: "chap-1",
                title: "فصل ۱: کلیات فارماکوکینتیک",
                sortOrder: 1,
                modules: [
                  {
                    id: "mod-1",
                    title: "جلسه اول - جذب دارو",
                    sortOrder: 1,
                    subCourseGroupId: "chap-1",
                    documentId: null,
                    lessons: [],
                  },
                ],
              },
            ],
            unassignedModules: [],
            publication: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/documents`)) {
        return new Response(JSON.stringify({ items: [], pagination: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CourseStructureManager
            organizationId={orgId}
            courseId={courseId}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // Official title & badge
      expect(screen.getByText("مدیریت سرفصل‌ها و ساختار آموزشی دوره")).toBeDefined();
      expect(screen.getByText("دوره رسمی آوانا")).toBeDefined();
      // Publish CTA must NOT be present
      expect(screen.queryByText("ارسال دوره برای انتشار در کتابخانه")).toBeNull();
      expect(screen.queryByText("ارسال نسخه به‌روزشده به کتابخانه")).toBeNull();
      expect(screen.queryByText("مدیریت ساختار دوره و انتشار در کتابخانه")).toBeNull();
      // Chapter and module structure must be active
      expect(screen.getByText("فصل ۱: کلیات فارماکوکینتیک")).toBeDefined();
      expect(screen.getByText("جلسه اول - جذب دارو")).toBeDefined();
    });
  });

  it("CourseStructureManager shows publication CTA and personal draft badge for non-official courses", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}/structure`)) {
        return new Response(
          JSON.stringify({
            course: {
              id: courseId,
              title: "دوره دست‌نویس فیزیولوژی قلب",
              description: "جزوه شخصی",
              subject: "فیزیولوژی",
              status: "draft",
              isOfficial: false,
              createdAt: "2026-09-18T12:00:00Z",
              updatedAt: "2026-09-18T12:00:00Z",
            },
            chapters: [],
            unassignedModules: [],
            publication: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/documents`)) {
        return new Response(JSON.stringify({ items: [], pagination: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CourseStructureManager
            organizationId={orgId}
            courseId={courseId}
          />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مدیریت ساختار دوره و انتشار در کتابخانه")).toBeDefined();
      expect(screen.getByText("پیش‌نویس شخصی")).toBeDefined();
      expect(screen.getByText("ارسال دوره برای انتشار در کتابخانه")).toBeDefined();
    });
  });
});
