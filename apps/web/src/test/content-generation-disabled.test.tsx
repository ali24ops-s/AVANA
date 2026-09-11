import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { GenerateContentModal } from "../components/documents/GenerateContentModal.js";
import { LearningPage } from "../pages/LearningPage.js";
import { ReviewSummaryViewer } from "../components/documents/ReviewSummaryViewer.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { CONTENT_GENERATION_ENABLED } from "../config/features.js";
import {
  isContentManagerOrAdmin,
  canUserGenerateContent,
} from "../utils/generationPermissions.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Content Generation Disabled / Coming Soon for Regular Users", () => {
  const mockOrgId = "org-uuid-123";
  const mockCourseId = "course-uuid-456";
  const mockDocId = "doc-uuid-789";

  const mockDocument: DocumentResource = {
    id: mockDocId,
    organization_id: mockOrgId,
    course_id: mockCourseId,
    owner_user_id: "user-123",
    original_name: "pathology_notes.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024 * 50,
    sha256: "hash123",
    status: "extracted",
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("has CONTENT_GENERATION_ENABLED default set to false", () => {
    expect(CONTENT_GENERATION_ENABLED).toBe(false);
  });

  describe("Permission resolution: isContentManagerOrAdmin & canUserGenerateContent", () => {
    it("identifies platform_admin, content_worker, organization_admin, and course_editor as privileged", () => {
      // Platform Admin
      expect(isContentManagerOrAdmin({ role: "platform_admin" })).toBe(true);
      expect(canUserGenerateContent({ role: "platform_admin" })).toBe(true);

      // Content Worker
      expect(isContentManagerOrAdmin({ role: "content_worker" })).toBe(true);
      expect(canUserGenerateContent({ role: "content_worker" })).toBe(true);

      // Organization Admin via membership
      expect(
        isContentManagerOrAdmin(
          { role: "student" },
          [{ role: "organization_admin" as any }],
        ),
      ).toBe(true);
      expect(
        canUserGenerateContent(
          { role: "student" },
          [{ role: "organization_admin" as any }],
        ),
      ).toBe(true);

      // Course Editor via membership
      expect(
        isContentManagerOrAdmin(
          { role: "student" },
          [{ role: "course_editor" as any }],
        ),
      ).toBe(true);
      expect(
        canUserGenerateContent(
          { role: "student" },
          [{ role: "course_editor" as any }],
        ),
      ).toBe(true);
    });

    it("identifies student as non-privileged and blocks generation when flag is false", () => {
      const studentUser = { role: "student" };
      const studentMemberships = [{ role: "student" as any }];

      expect(isContentManagerOrAdmin(studentUser, studentMemberships)).toBe(false);
      expect(canUserGenerateContent(studentUser, studentMemberships)).toBe(false);
    });
  });

  describe("DocumentStatusCard UI: Regular User vs Admin", () => {
    it("renders «تولید محتوا (به‌زودی)» for student and opens Coming Soon modal on click", async () => {
      // Mock fetch for /v1/me returning regular student
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-1",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        // Document status query
        if (urlStr.includes("/content-status") || urlStr.includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-status",
                document_id: mockDocId,
                status: { status: "extracted" },
                lesson: { generated: false, count: 0 },
                flashcards: { generated: false, count: 0 },
                exam: { generated: false, count: 0 },
                can_generate: true,
                all_generated: false,
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider>
              <DocumentStatusCard
                document={mockDocument}
                organizationId={mockOrgId}
                courseId={mockCourseId}
              />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify the Coming Soon button is present
      const comingSoonBtn = await screen.findByRole("button", {
        name: /تولید محتوا \(به‌زودی\)/i,
      });
      expect(comingSoonBtn).toBeInTheDocument();

      // Verify the real generation button is NOT rendered
      expect(
        screen.queryByRole("button", { name: /تولید هوشمند محتوای آموزشی/i }),
      ).not.toBeInTheDocument();

      // Click the Coming Soon button
      fireEvent.click(comingSoonBtn);

      // Verify the Coming Soon modal opens with correct Persian text
      expect(
        await screen.findByText(
          "قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("تولید هوشمند محتوا")).toBeInTheDocument();

      // Close modal
      const dismissBtn = screen.getByRole("button", { name: /متوجه شدم/i });
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(
          screen.queryByText(
            "قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد.",
          ),
        ).not.toBeInTheDocument();
      });
    });

    it("renders active «تولید هوشمند محتوای آموزشی» button for platform_admin and preserves generation flow", async () => {
      // Mock fetch for /v1/me returning platform_admin
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-admin",
                user: { id: "adm-1", email: "admin@avana.ir", role: "platform_admin" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/content-status") || urlStr.includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-status",
                document_id: mockDocId,
                status: { status: "extracted" },
                lesson: { generated: false, count: 0 },
                flashcards: { generated: false, count: 0 },
                exam: { generated: false, count: 0 },
                can_generate: true,
                all_generated: false,
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider>
              <DocumentStatusCard
                document={mockDocument}
                organizationId={mockOrgId}
                courseId={mockCourseId}
              />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify the normal generation button is present for Admin
      const generateBtn = await screen.findByRole("button", {
        name: /تولید هوشمند محتوای آموزشی/i,
      });
      expect(generateBtn).toBeInTheDocument();

      // Verify Coming Soon button is NOT rendered for Admin
      expect(
        screen.queryByRole("button", { name: /تولید محتوا \(به‌زودی\)/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("GenerateContentModal: Defense in Depth for Regular User", () => {
    it("renders Coming Soon notice and prevents generation submission when accessed by regular student", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-1",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response);
      });

      const queryClient = createTestQueryClient();
      const mockConfirm = vi.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider>
              <GenerateContentModal
                isOpen={true}
                onClose={vi.fn()}
                documentName="sample.pdf"
                onConfirmGenerate={mockConfirm}
              />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify Coming Soon notice is displayed
      expect(
        await screen.findByText(
          "قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد.",
        ),
      ).toBeInTheDocument();

      // Verify submission button is not rendered
      expect(screen.queryByRole("button", { name: /^تولید محتوا$/i })).not.toBeInTheDocument();
      expect(mockConfirm).not.toHaveBeenCalled();
    });
  });

  describe("LearningPage: Documents & Review tabs for Regular Student vs Admin", () => {
    const mockCourseLearnData = {
      request_id: "req-learn",
      course: { id: mockCourseId, title: "بیوشیمی پزشکی", subject: "پزشکی", exam_at: null },
      modules: [],
      progress: { total_lessons: 0, completed_lessons: 0, progress_percent: 0 },
    };

    it("Regular student: tabs show Coming Soon badge and open modal when clicked", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-me",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "دانشگاه علوم پزشکی" }] }),
          } as Response);
        }
        if (urlStr.includes(`/v1/courses/${mockCourseId}/learn`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCourseLearnData),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/courses/${mockCourseId}`]}>
            <AuthProvider>
              <Routes>
                <Route path="/courses/:courseId" element={<LearningPage />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify course title loaded
      expect(await screen.findByText("بیوشیمی پزشکی")).toBeInTheDocument();

      // Manage link should NOT be visible for student
      expect(screen.queryByText("مدیریت محتوا و سرفصل‌ها")).not.toBeInTheDocument();

      // Check Documents tab
      const docsTab = screen.getByRole("tab", { name: /منابع و اسناد \(PDF\)/i });
      expect(docsTab).toBeInTheDocument();

      // Clicking Documents tab opens Coming Soon modal instead of switching tab
      fireEvent.click(docsTab);
      expect(
        await screen.findByText("قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد."),
      ).toBeInTheDocument();

      // Dismiss modal
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم/i }));

      // Check Review tab
      const reviewTab = screen.getByRole("tab", { name: /صف بررسی محتوا/i });
      expect(reviewTab).toBeInTheDocument();

      // Clicking Review tab opens Coming Soon modal
      fireEvent.click(reviewTab);
      expect(
        await screen.findByText("قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد."),
      ).toBeInTheDocument();

      // Dismiss modal
      fireEvent.click(screen.getByRole("button", { name: /متوجه شدم/i }));

      // Check empty state button "افزودن فایل PDF (به‌زودی)"
      const addPdfBtn = screen.getByRole("button", { name: /افزودن فایل PDF \(به‌زودی\)/i });
      expect(addPdfBtn).toBeInTheDocument();
      fireEvent.click(addPdfBtn);

      // Opens Coming Soon modal
      expect(
        await screen.findByText("قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد."),
      ).toBeInTheDocument();
    });

    it("Regular student: deep-linking to ?tab=documents renders Coming Soon panel", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-me",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "دانشگاه علوم پزشکی" }] }),
          } as Response);
        }
        if (urlStr.includes(`/v1/courses/${mockCourseId}/learn`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCourseLearnData),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/courses/${mockCourseId}?tab=documents`]}>
            <AuthProvider>
              <Routes>
                <Route path="/courses/:courseId" element={<LearningPage />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify inline Coming Soon card is displayed
      expect(await screen.findByText("اسناد و منابع (به‌زودی)")).toBeInTheDocument();
      // Verify real uploader is NOT displayed
      expect(screen.queryByText("اسناد و منابع بارگذاری‌شده")).not.toBeInTheDocument();
    });

    it("Regular student: deep-linking to ?tab=review renders Coming Soon panel", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-me",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "دانشگاه علوم پزشکی" }] }),
          } as Response);
        }
        if (urlStr.includes(`/v1/courses/${mockCourseId}/learn`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCourseLearnData),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/courses/${mockCourseId}?tab=review`]}>
            <AuthProvider>
              <Routes>
                <Route path="/courses/:courseId" element={<LearningPage />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify inline Coming Soon card is displayed
      expect(await screen.findByText("صف بازبینی محتوا (به‌زودی)")).toBeInTheDocument();
      // Verify real review queue list header is NOT displayed
      expect(screen.queryByText("صف بازبینی و تایید محتوا")).not.toBeInTheDocument();
    });

    it("Platform Admin: deep-linking to ?tab=documents renders real CourseDocumentsView", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-me",
                user: { id: "adm-1", email: "admin@avana.ir", role: "platform_admin" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/documents")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [{ id: mockOrgId, name: "دانشگاه علوم پزشکی" }] }),
          } as Response);
        }
        if (urlStr.includes(`/v1/courses/${mockCourseId}/learn`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCourseLearnData),
          } as Response);
        }
        if (urlStr.includes("/documents")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [] }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/courses/${mockCourseId}?tab=documents`]}>
            <AuthProvider>
              <Routes>
                <Route path="/courses/:courseId" element={<LearningPage />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify manage link IS visible for admin
      expect(await screen.findByText("مدیریت محتوا و سرفصل‌ها")).toBeInTheDocument();

      // Verify real documents view is rendered for admin
      expect(await screen.findByText("اسناد و منابع بارگذاری‌شده")).toBeInTheDocument();
      expect(screen.queryByText("منابع و اسناد (به‌زودی)")).not.toBeInTheDocument();
    });
  });

  describe("ReviewSummaryViewer: Regular User vs Admin", () => {
    it("Regular student clicking «تولید خلاصه مروری (به‌زودی)» opens Coming Soon modal and blocks mutation", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = url.toString();
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-1",
                user: { id: "std-1", email: "student@avana.ir", role: "student" },
                memberships: [],
              }),
          } as Response);
        }
        if (urlStr.includes("/review-summary")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ content: null }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider>
              <ReviewSummaryViewer
                organizationId={mockOrgId}
                documentId={mockDocId}
                courseId={mockCourseId}
              />
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const generateBtn = await screen.findByRole("button", {
        name: /تولید خلاصه مروری \(به‌زودی\)/i,
      });
      expect(generateBtn).toBeInTheDocument();

      fireEvent.click(generateBtn);

      expect(
        await screen.findByText("قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد."),
      ).toBeInTheDocument();
    });
  });
});
