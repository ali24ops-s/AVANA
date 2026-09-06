import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContentStudioPage } from "../pages/admin/AdminContentStudioPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import type {
  OfficialCourse,
  OfficialReviewWorkspace,
  ConsistencyValidationReport,
  AdminCourseHierarchy,
} from "../lib/api/admin.js";

const mockOfficialCourseDraft: OfficialCourse = {
  id: "official-course-1",
  organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
  name: "فارماکولوژی جامع بالینی",
  description: "دوره رسمی جامع داروشناسی بالینی برای آزمون دستیاری",
  subject: "داروسازی",
  status: "draft",
  isOfficial: true,
  moduleCount: 0,
  lessonCount: 0,
  flashcardCount: 0,
  quizQuestionCount: 0,
  product: {
    id: "product-1",
    code: "course_official-course-1",
    price: 499000,
    currency: "toman",
    active: false,
  },
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

const mockOfficialCourseApproved: OfficialCourse = {
  ...mockOfficialCourseDraft,
  id: "official-course-2",
  name: "شیمی دارویی پیشرفته",
  status: "approved",
  moduleCount: 3,
  lessonCount: 6,
  flashcardCount: 30,
  quizQuestionCount: 15,
};

const mockOfficialCoursePublished: OfficialCourse = {
  ...mockOfficialCourseApproved,
  id: "official-course-3",
  name: "بیوفارماسی جامع",
  status: "published",
  product: {
    id: "product-3",
    code: "course_official-course-3",
    price: 650000,
    currency: "toman",
    active: true,
  },
};

const mockDocuments = [
  {
    id: "doc-1",
    organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    course_id: "official-course-1",
    filename: "source_doc_1.pdf",
    original_name: "pharmacology_source.pdf",
    size_bytes: 5242880,
    mime_type: "application/pdf",
    status: "extracted",
    quality_score: 95,
    quality_level: "excellent",
    created_at: "2026-08-21T10:00:00Z",
  },
  {
    id: "doc-2",
    organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    course_id: "official-course-1",
    filename: "corrupted_source.pdf",
    original_name: "corrupted_source.pdf",
    size_bytes: 1048576,
    mime_type: "application/pdf",
    status: "failed",
    created_at: "2026-08-21T11:00:00Z",
  },
];

const mockReviewWorkspaceValid: OfficialReviewWorkspace = {
  course: mockOfficialCourseDraft,
  draftContents: [
    {
      id: "draft-lesson-1",
      documentId: "doc-1",
      contentType: "lesson",
      status: "pending_review",
      itemCount: 3,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: {
        sessions: [
          { title: "مقدمه بر گیرنده‌های آدرنرژیک", topic: "آدرنرژیک", sessionIndex: 1 },
          { title: "آگونیست‌های بتا", topic: "آگونیست بتا", sessionIndex: 2 },
          { title: "آنتاگونیست‌های آلفا", topic: "آنتاگونیست آلفا", sessionIndex: 3 },
        ],
      },
    },
    {
      id: "draft-flashcard-1",
      documentId: "doc-1",
      contentType: "flashcard",
      status: "pending_review",
      itemCount: 10,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: { cards: [{ topic: "آدرنرژیک", sessionIndex: 1 }] },
    },
    {
      id: "draft-quiz-1",
      documentId: "doc-1",
      contentType: "quiz",
      status: "pending_review",
      itemCount: 5,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: { questions: [{ topic: "آدرنرژیک", sessionIndex: 1 }] },
    },
  ],
  unresolvedLessonMappings: 0,
  readyForApproval: true,
};

const mockReviewWorkspaceWithErrors: OfficialReviewWorkspace = {
  course: mockOfficialCourseDraft,
  draftContents: [
    {
      id: "draft-flashcard-err",
      documentId: "doc-1",
      contentType: "flashcard",
      status: "pending_review",
      itemCount: 4,
      hasMappingErrors: true,
      unresolvedItems: 2,
      payload: { cards: [{}] },
    },
  ],
  unresolvedLessonMappings: 2,
  readyForApproval: false,
};

const mockHierarchy: AdminCourseHierarchy = {
  id: "official-course-1",
  name: "فارماکولوژی جامع بالینی",
  subject: "داروسازی",
  modules: [
    {
      id: "mod-1",
      title: "فصل اول: فارماکودینامیک و گیرنده‌ها",
      lessons: [
        {
          id: "les-1",
          title: "درس ۱: مقدمه بر گیرنده‌های آدرنرژیک",
          publicationStatus: "published",
          flashcardCount: 10,
          quizCount: 5,
          hasContent: true,
          createdAt: "2026-08-22T10:00:00Z",
        },
        {
          id: "les-2",
          title: "درس ۲: آگونیست‌های انتخابی بتا",
          publicationStatus: "published",
          flashcardCount: 8,
          quizCount: 4,
          hasContent: true,
          createdAt: "2026-08-22T11:00:00Z",
        },
      ],
    },
  ],
};

const mockConsistencyReportValid: ConsistencyValidationReport = {
  valid: true,
  courseStatus: "approved",
  moduleCount: 1,
  lessonCount: 2,
  flashcardCount: 18,
  quizCount: 1,
  quizQuestionCount: 9,
  unresolvedLessonMappings: 0,
  productLinked: true,
  productPrice: 499000,
  productActive: false,
  errors: [],
};

const mockConsistencyReportInvalid: ConsistencyValidationReport = {
  valid: false,
  courseStatus: "draft",
  moduleCount: 0,
  lessonCount: 0,
  flashcardCount: 0,
  quizCount: 0,
  quizQuestionCount: 0,
  unresolvedLessonMappings: 2,
  productLinked: false,
  productPrice: 0,
  productActive: false,
  errors: ["دوره هنوز تایید نشده است.", "محصول متصل به دوره یافت نشد."],
};

describe("Unified Official Content Studio Workspace — Comprehensive Test Matrix", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function setupFetchMock(options?: {
    userRole?: "platform_admin" | "student" | null;
    reviewWorkspace?: OfficialReviewWorkspace;
    consistencyReport?: ConsistencyValidationReport;
    coursesList?: OfficialCourse[];
    generateFails?: boolean;
    approvalFails?: boolean;
  }) {
    const role = options?.userRole !== undefined ? options.userRole : "platform_admin";
    const courses = options?.coursesList ?? [
      mockOfficialCourseDraft,
      mockOfficialCourseApproved,
      mockOfficialCoursePublished,
    ];
    const rw = options?.reviewWorkspace ?? mockReviewWorkspaceValid;
    const cr = options?.consistencyReport ?? mockConsistencyReportValid;

    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";

      // /v1/me
      if (url.includes("/v1/me")) {
        if (!role) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: "unauthorized", message: "Not signed in" } }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: "admin-user-id",
                email: "admin@avana.ir",
                name: "Admin User",
                role,
                emailVerified: true,
              },
              memberships: [
                {
                  id: "m-1",
                  organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776",
                  role: "platform_admin",
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/generate
      if (url.includes("/generate") && method === "POST") {
        if (options?.generateFails) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Quota exceeded on Gemini provider." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ generationRunId: "run-123", status: "review" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/approve
      if (url.includes("/approve") && method === "POST") {
        if (options?.approvalFails) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "امکان تایید دوره وجود ندارد: ۲ مورد خطای نگاشت درس وجود دارد." }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              approved: true,
              materialized: { modules: 1, lessons: 2, flashcards: 10, quizzes: 1, questions: 5 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/pricing
      if (url.includes("/pricing") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              product: { id: "product-1", code: "course_1", price: 550000, currency: "toman", active: false },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/publish
      if (url.includes("/publish") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, courseStatus: "published", productActive: true }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/organizations/:id/courses/:id/generated/review-queue
      if (url.includes("/review-queue")) {
        const pending = (rw.draftContents || []).map((d) => ({
          id: d.id,
          document_id: d.documentId,
          course_id: "official-course-1",
          type: d.contentType,
          status: d.status,
          title:
            d.contentType === "lesson"
              ? "درسنامه‌ها (Lessons)"
              : d.contentType === "flashcard"
              ? "فلش‌کارت‌ها (Flashcards)"
              : "آزمون تستی (Quizzes)",
          updated_at: d.createdAt || "2026-08-22T10:00:00Z",
        }));
        return Promise.resolve(
          new Response(
            JSON.stringify({ request_id: "req-queue", pending }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/review
      if (url.includes("/review")) {
        return Promise.resolve(
          new Response(JSON.stringify(rw), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // /v1/admin/content-studio/courses/:id/validate
      if (url.includes("/validate")) {
        return Promise.resolve(
          new Response(JSON.stringify(cr), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // /v1/admin/content/courses/:id/hierarchy
      if (url.includes("/hierarchy")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockHierarchy), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // /v1/organizations/:id/documents
      if (url.includes("/documents")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ request_id: "r1", items: mockDocuments }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses (GET or POST)
      if (url.includes("/admin/content-studio/courses")) {
        if (method === "POST") {
          const newCourse = {
            ...mockOfficialCourseDraft,
            id: "new-course-created",
            name: "دوره جدید ایجادشده",
          };
          courses.push(newCourse);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                course: newCourse,
              }),
              { status: 201, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ courses }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // Fallback
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    global.fetch = mockFetch;
    return mockFetch;
  }

  it("Scenario 1: Administrator can open Official Content Studio catalog page", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/استودیو محتوای رسمی آوانا/i)).toBeInTheDocument();
    });
  });

  it("Scenario 2: Administrator can create a new official course and automatically transition into its studio", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ایجاد دوره رسمی جدید")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("ایجاد دوره رسمی جدید"));
    expect(screen.getByPlaceholderText(/فارماکولوژی جامع بالینی/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/فارماکولوژی جامع بالینی/i), {
      target: { value: "دوره جدید ایجادشده" },
    });

    const submitBtn = screen.getByText("ایجاد دوره و ورود به استودیو");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("۱. منابع و تولید هوشمند (Sources & AI)")).toBeInTheDocument();
    });
  });

  it("Scenario 3: Selecting a course opens the unified production workspace inline without page redirection", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    const enterButtons = screen.getAllByText("ورود به استودیو");
    fireEvent.click(enterButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("۱. منابع و تولید هوشمند (Sources & AI)")).toBeInTheDocument();
      expect(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)")).toBeInTheDocument();
      expect(screen.getByText("۳. ساختار مصوب دوره (Course Structure)")).toBeInTheDocument();
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
  });

  it("Scenario 4: Source documents appear with extraction status and quality score in SourceProductionPanel", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_source.pdf")).toBeInTheDocument();
      expect(screen.getByText("استخراج‌شده و آماده")).toBeInTheDocument();
      expect(screen.getByText(/95٪/i)).toBeInTheDocument();
    });
  });

  it("Scenario 5: Extracted document exposes AI generation action and opens GenerateContentModal", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_source.pdf")).toBeInTheDocument();
    });

    const genButton = screen.getByText(/تولید هوشمند محتوای آموزشی/i);
    expect(genButton).toBeInTheDocument();

    fireEvent.click(genButton);
    expect(screen.getByText("انتخاب محتوای موردنظر")).toBeInTheDocument();
  });

  it("Scenario 6: Confirming generation calls existing POST /courses/:id/generate endpoint", async () => {
    const fetchMock = setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_source.pdf")).toBeInTheDocument();
    });

    const genButton = screen.getByText(/تولید هوشمند محتوای آموزشی/i);
    fireEvent.click(genButton);

    const confirmButton = screen.getByRole("button", { name: /تولید محتوا/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const genCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/content-studio/courses/official-course-1/generate"),
      );
      expect(genCalls.length).toBeGreaterThan(0);
    });
  });

  it("Scenario 7: Generation failure displays a user-friendly Persian error banner", async () => {
    setupFetchMock({ generateFails: true });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_source.pdf")).toBeInTheDocument();
    });

    const genButton = screen.getByText(/تولید هوشمند محتوای آموزشی/i);
    fireEvent.click(genButton);

    const confirmButton = screen.getByRole("button", { name: /تولید محتوا/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/خطا در تولید هوشمند:/i)).toBeInTheDocument();
      expect(screen.getByText(/سهمیه سرویس هوش مصنوعی/i)).toBeInTheDocument();
    });
  });

  it("Scenario 8: Course structure tree reflects real backend hierarchy with module/lesson/quiz counts", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۳. ساختار مصوب دوره (Course Structure)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۳. ساختار مصوب دوره (Course Structure)"));

    await waitFor(() => {
      expect(screen.getByText("فصل اول: فارماکودینامیک و گیرنده‌ها")).toBeInTheDocument();
      expect(screen.getByText("درس ۱: مقدمه بر گیرنده‌های آدرنرژیک")).toBeInTheDocument();
      expect(screen.getByText("10 کارت")).toBeInTheDocument();
      expect(screen.getByText("5 سؤال")).toBeInTheDocument();
    });
  });

  it("Scenario 9: Draft review workspace displays lesson mapping confirmation (unresolvedLessonMappings = 0)", async () => {
    setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)"));

    await waitFor(() => {
      expect(screen.getByText(/نگاشت قطعی درسنامه تایید شد/i)).toBeInTheDocument();
      expect(screen.getByText("درسنامه‌ها (Lessons)")).toBeInTheDocument();
      expect(screen.getByText("فلش‌کارت‌ها (Flashcards)")).toBeInTheDocument();
      expect(screen.getByText("آزمون تستی (Quizzes)")).toBeInTheDocument();
    });
  });

  it("Scenario 10: Unresolved mappings block approval UI with explanatory error banner", async () => {
    setupFetchMock({ reviewWorkspace: mockReviewWorkspaceWithErrors });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)"));

    await waitFor(() => {
      expect(screen.getByText(/خطای نگاشت درسنامه وجود دارد/i)).toBeInTheDocument();
      const approveBtn = screen.getByRole("button", { name: /تایید رسمی دوره/i });
      expect(approveBtn).toBeDisabled();
    });
  });

  it("Scenario 11: Valid approval materializes structure and invokes POST /courses/:id/approve", async () => {
    const fetchMock = setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)"));

    await waitFor(() => {
      const approveBtn = screen.getByRole("button", { name: /تایید رسمی دوره/i });
      expect(approveBtn).not.toBeDisabled();
    });

    const approveBtn = screen.getByRole("button", { name: /تایید رسمی دوره/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const approveCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/content-studio/courses/official-course-1/approve"),
      );
      expect(approveCalls.length).toBeGreaterThan(0);
    });
  });

  it("Scenario 12: Commercial pricing is configured and saved via POST /courses/:id/pricing", async () => {
    const fetchMock = setupFetchMock();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)"));

    await waitFor(() => {
      expect(screen.getByLabelText(/قیمت فروش دوره/i)).toBeInTheDocument();
    });

    const priceInput = screen.getByLabelText(/قیمت فروش دوره/i);
    fireEvent.change(priceInput, { target: { value: "550000" } });
    const savePriceBtn = screen.getByText("ثبت قیمت تجاری");
    fireEvent.click(savePriceBtn);

    await waitFor(() => {
      const priceCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/content-studio/courses/official-course-1/pricing"),
      );
      expect(priceCalls.length).toBeGreaterThan(0);
    });
  });

  it("Scenario 13: Consistency validation pre-flight report displays pass status when all invariants are met", async () => {
    setupFetchMock({ consistencyReport: mockConsistencyReportValid });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)"));

    await waitFor(() => {
      expect(screen.getByText(/تمامی الزامات انتشار با موفقیت تایید شد/i)).toBeInTheDocument();
    });
  });

  it("Scenario 14: Publish action is enabled when consistency is valid and calls POST /courses/:id/publish", async () => {
    const fetchMock = setupFetchMock({ consistencyReport: mockConsistencyReportValid });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio?courseId=official-course-1"]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۴. تایید، قیمت‌گذاری و انتشار (Publish)"));

    await waitFor(() => {
      const publishBtn = screen.getByRole("button", { name: /انتشار عمومی دوره/i });
      expect(publishBtn).not.toBeDisabled();
    });

    const publishBtn = screen.getByRole("button", { name: /انتشار عمومی دوره/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      const publishCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/content-studio/courses/official-course-1/publish"),
      );
      expect(publishCalls.length).toBeGreaterThan(0);
    });
  });

  it("Scenario 15: Non-admin users (students) are denied access and redirected to /home", async () => {
    setupFetchMock({ userRole: "student" });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio"]}>
            <Routes>
              <Route path="/home" element={<div data-testid="home-page">صفحه اصلی کاربر</div>} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("home-page")).toBeInTheDocument();
      expect(screen.queryByText(/استودیو محتوای رسمی/i)).not.toBeInTheDocument();
    });
  });

  it("Scenario 16: Unauthenticated users are redirected to /sign-in upon session expiry", async () => {
    setupFetchMock({ userRole: null });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/content-studio"]}>
            <Routes>
              <Route path="/sign-in" element={<div data-testid="signin-page">ورود به حساب کاربری</div>} />
              <Route path="/" element={<ProtectedRoute />}>
                <Route path="admin" element={<AdminLayout />}>
                  <Route path="content-studio" element={<AdminContentStudioPage />} />
                </Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("signin-page")).toBeInTheDocument();
    });
  });
});
