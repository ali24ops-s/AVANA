import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../providers/AuthProvider.js";
import { LearningPage } from "../pages/LearningPage.js";
import type { CourseLearnResponse } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Course Lesson Study Page UI/UX Refinements", () => {
  const orgId = "org-test-123";
  const courseId = "course-test-123";
  const lesson1Id = "lesson-1";
  const lesson2Id = "lesson-2";
  const lesson3Id = "lesson-3";

  const mockCurriculumData: CourseLearnResponse = {
    request_id: "req-curriculum-test",
    course: {
      id: courseId,
      title: "فیزیولوژی قلب و عروق",
      subject: "پزشکی عمومی",
      exam_at: "2026-09-15T09:00:00.000Z",
    },
    modules: [
      {
        id: "mod-1",
        title: "فصل اول: الکتروفیزیولوژی قلب",
        description: "مبانی پتانسیل عمل و هدایت قلبی",
        sort_order: 0,
        lessons: [
          {
            id: lesson1Id,
            module_id: "mod-1",
            title: "گره سینوسی-دهلیزی (SA Node)",
            content_type: "markdown",
            content_markdown: "# گره سینوسی دهلیزی\n\nاین گره پیس‌میکر اصلی قلب انسان است و با ریتم ۶۰ تا ۱۰۰ ضربان در دقیقه پالس تولید می‌کند.",
            sort_order: 0,
            estimated_minutes: 10,
            completed: true,
            completed_at: "2026-08-20T10:00:00.000Z",
          },
          {
            id: lesson2Id,
            module_id: "mod-1",
            title: "گره دهلیزی-بطنی (AV Node)",
            content_type: "markdown",
            content_markdown: "# گره دهلیزی بطنی\n\nوظیفه ایجاد تاخیر در هدایت امواج دهلیزی به بطن‌ها را بر عهده دارد.",
            sort_order: 1,
            estimated_minutes: 8,
            completed: false,
            completed_at: null,
          },
        ],
      },
      {
        id: "mod-2",
        title: "فصل دوم: دینامیک خون و فشار",
        description: "همودینامیک و مقاومت عروقی",
        sort_order: 1,
        lessons: [
          {
            id: lesson3Id,
            module_id: "mod-2",
            title: "قانون استارلینگ قلب",
            content_type: "markdown",
            content_markdown: "# قانون استارلینگ\n\nافزایش حجم پایان دیاستولی موجب افزایش نیروی انقباضی میگردد.",
            sort_order: 0,
            estimated_minutes: 12,
            completed: false,
            completed_at: null,
          },
        ],
      },
    ],
    progress: {
      total_lessons: 3,
      completed_lessons: 1,
      progress_percent: 33,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculumData)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "سازمان آموزش پزشکی", slug: "med-org" }],
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/study-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-session",
                session: { id: "session-test-1", durationSeconds: 0 },
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders course header, progress, and initial lesson in full-width without static sidebar", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "فیزیولوژی قلب و عروق" })).toBeDefined();
      // Main lesson title rendered inside markdown content
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Drawer is closed by default — no static sidebar in DOM
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();

    // Verify progress with Persian numbers
    expect(screen.getByText(/۱ از ۳ درس تکمیل شده/i)).toBeDefined();
    expect(screen.getByText("۳۳٪")).toBeDefined();

    // Verify markdown rendered
    expect(screen.getByText(/این گره پیس‌میکر اصلی قلب انسان است/i)).toBeDefined();
  });

  it("opens curriculum drawer via button and closes via close button", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Initially drawer is closed
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();

    // Open drawer via "سرفصل‌ها" trigger button
    const openDrawerBtn = screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    fireEvent.click(openDrawerBtn);

    // Drawer should now be visible
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
      expect(screen.getAllByText("فصل اول: الکتروفیزیولوژی قلب").length).toBeGreaterThanOrEqual(1);
    });

    // Close drawer via close button (X)
    const closeBtn = screen.getByLabelText("بستن منوی سرفصل‌ها");
    fireEvent.click(closeBtn);

    // Drawer should be closed
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();
  });

  it("closes curriculum drawer via Escape key", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Open drawer
    const openDrawerBtn = screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    fireEvent.click(openDrawerBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Drawer should be closed
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();
  });

  it("closes curriculum drawer via backdrop click", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Open drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // Click backdrop
    const backdrop = screen.getByTestId("curriculum-backdrop");
    fireEvent.click(backdrop);

    // Drawer should be closed
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();
  });

  it("handles module accordion toggling and lesson selection with drawer closing", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Open drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByText("فصل دوم: دینامیک خون و فشار")).toBeDefined();
    });

    // Initially mod-2 lessons are collapsed
    expect(screen.queryByText("قانون استارلینگ قلب")).toBeNull();

    // Click to expand mod-2
    const mod2Button = screen.getByRole("button", { name: /فصل دوم: دینامیک خون و فشار/i });
    fireEvent.click(mod2Button);

    // Lessons in mod-2 should now be visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /قانون استارلینگ قلب/i })).toBeDefined();
    });

    // Click to select lesson 3
    const lesson3Btn = screen.getByRole("button", { name: /قانون استارلینگ قلب/i });
    fireEvent.click(lesson3Btn);

    // Selecting a lesson closes the drawer
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();

    // Main viewer should now display lesson 3 content
    await waitFor(() => {
      expect(screen.getByText(/افزایش حجم پایان دیاستولی موجب افزایش نیروی انقباضی/i)).toBeDefined();
    });
  });

  it("shows distinct status indicators for completed, current, and upcoming lessons", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Open drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // Chapters are closed by default upon mount. Expand Module 1 to inspect its lessons
    const mod1Button = screen.getByRole("button", { name: /فصل اول: الکتروفیزیولوژی قلب/i });
    fireEvent.click(mod1Button);

    await waitFor(() => {
      expect(screen.getByText("گره سینوسی-دهلیزی (SA Node)")).toBeDefined();
    });

    // Lesson 1 is selected and completed
    const lesson1Button = screen.getByRole("button", { name: /گره سینوسی-دهلیزی/i });
    expect(lesson1Button.getAttribute("aria-current")).toBe("true");

    // Lesson 2 is upcoming/uncompleted
    const lesson2Button = screen.getByRole("button", { name: /گره دهلیزی-بطنی/i });
    expect(lesson2Button.getAttribute("aria-current")).toBeNull();

    // Select lesson 2
    fireEvent.click(lesson2Button);

    // Drawer closes upon selection
    expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();

    // Reopen drawer to verify state
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      const updatedLesson2 = screen.getByRole("button", { name: /گره دهلیزی-بطنی/i });
      expect(updatedLesson2.getAttribute("aria-current")).toBe("true");
      const updatedLesson1 = screen.getByRole("button", { name: /گره سینوسی-دهلیزی/i });
      expect(updatedLesson1.getAttribute("aria-current")).toBeNull();
    });
  });

  it("renders syllabus drawer in document.body portal with 480px desktop width, correct layering, and body scroll lock", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // Body overflow should initially not be hidden
    expect(document.body.style.overflow).not.toBe("hidden");

    // Open drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    const drawer = screen.getByRole("dialog", { name: "سرفصل‌های دوره" });
    const backdrop = screen.getByTestId("curriculum-backdrop");

    // Drawer is portaled directly under document.body
    expect(drawer.parentElement?.parentElement).toBe(document.body);

    // Verify 576px desktop width class (additional 20% wider than 480px)
    expect(drawer.className).toContain("md:w-[576px]");
    expect(drawer.className).toContain("max-w-[576px]");

    // Verify layering z-index: backdrop is z-[60] (above sticky header at z-50), drawer is z-[70] (above backdrop)
    expect(backdrop.className).toContain("z-[60]");
    expect(drawer.className).toContain("z-[70]");

    // Body scroll should be locked while drawer is open
    expect(document.body.style.overflow).toBe("hidden");

    // Close drawer
    fireEvent.click(backdrop);

    // Body scroll should be released
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("renders study tools header with sticky classes, top offset below site header, and no overflow-hidden on article", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("study-tools-header")).toBeDefined();
    });

    const header = screen.getByTestId("study-tools-header");
    // Verify sticky classes: sticks at top-0 when site header scrolls out of view
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("z-30");
    expect(header.className).toContain("rounded-t-card");

    // Verify parent article has NO overflow-hidden that would break sticky
    const article = header.closest("article");
    expect(article).not.toBeNull();
    expect(article?.className).not.toContain("overflow-hidden");
    expect(article?.className).toContain("rounded-card");

    // Chapter title badge and buttons are present
    expect(screen.getByText("فصل اول: الکتروفیزیولوژی قلب")).toBeDefined();
    const syllabusBtn = within(header).getByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    expect(syllabusBtn).toBeDefined();
    expect(syllabusBtn.className).toContain("flex-shrink-0");

    const askAvanaBtn = within(header).getByRole("button", { name: /از آوانا بپرس/i });
    expect(askAvanaBtn).toBeDefined();
    expect(askAvanaBtn.className).toContain("flex-shrink-0");

    // Toggling Ask Avana changes button text and renders assistant chat panel
    fireEvent.click(askAvanaBtn);
    await waitFor(() => {
      expect(within(header).getByRole("button", { name: /بستن دستیار/i })).toBeDefined();
    });
    fireEvent.click(within(header).getByRole("button", { name: /بستن دستیار/i }));
    await waitFor(() => {
      expect(within(header).getByRole("button", { name: /از آوانا بپرس/i })).toBeDefined();
    });
  });

  it("filters out source filenames and extraction placeholder text from syllabus drawer while preserving scholarly descriptions", async () => {
    const customDataWithPollutedDescriptions: CourseLearnResponse = {
      ...mockCurriculumData,
      modules: [
        {
          id: "mod-dirty-1",
          title: "فصل اول: الکتروفیزیولوژی قلب",
          description: "مباحث و جلسات آموزشی استخراج‌شده از 32.pdf",
          sort_order: 0,
          lessons: [
            {
              id: "les-d1",
              module_id: "mod-dirty-1",
              title: "گره پیس‌میکر",
              content_type: "markdown",
              content_markdown: "محتوای تست",
              sort_order: 0,
              estimated_minutes: 10,
              completed: true,
              completed_at: null,
            },
          ],
        },
        {
          id: "mod-clean-2",
          title: "فصل دوم: دینامیک خون",
          description: "بررسی جامع اصول همودینامیک و مقاومت عروقی",
          sort_order: 1,
          lessons: [
            {
              id: "les-d2",
              module_id: "mod-clean-2",
              title: "فشار سرخرگی",
              content_type: "markdown",
              content_markdown: "محتوای فشار",
              sort_order: 0,
              estimated_minutes: 8,
              completed: false,
              completed_at: null,
            },
          ],
        },
        {
          id: "mod-dirty-3",
          title: "cardiology_notes.pdf",
          description: "استخراج شده از جزوه_فیزیولوژی.pdf",
          sort_order: 2,
          lessons: [
            {
              id: "les-d3",
              module_id: "mod-dirty-3",
              title: "درس تکمیلی",
              content_type: "markdown",
              content_markdown: "محتوای تکمیلی",
              sort_order: 0,
              estimated_minutes: 5,
              completed: false,
              completed_at: null,
            },
          ],
        },
        {
          id: "mod-generic-4",
          title: "فصل چهارم: فارماکولوژی بالینی",
          description: "مباحث و جلسات آموزشی جامع",
          sort_order: 3,
          lessons: [
            {
              id: "les-d4",
              module_id: "mod-generic-4",
              title: "فارماکوکینتیک داروها",
              content_type: "markdown",
              content_markdown: "محتوای داروها",
              sort_order: 0,
              estimated_minutes: 12,
              completed: false,
              completed_at: null,
            },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(customDataWithPollutedDescriptions)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "سازمان آموزش پزشکی", slug: "med-org" }],
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/study-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-session",
                session: { id: "session-test-1", durationSeconds: 0 },
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i })).toBeDefined();
    });

    // Open syllabus drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // 1. Polluted descriptions MUST NOT be rendered
    expect(screen.queryByText(/32\.pdf/i)).toBeNull();
    expect(screen.queryByText(/استخراج‌شده از 32\.pdf/i)).toBeNull();
    expect(screen.queryByText(/استخراج شده از جزوه_فیزیولوژی/i)).toBeNull();
    expect(screen.queryByText(/جزوه_فیزیولوژی\.pdf/i)).toBeNull();

    // 2. Polluted title cardiology_notes.pdf MUST NOT be rendered as a raw filename
    expect(screen.queryByText("cardiology_notes.pdf")).toBeNull();

    // 3. Genuine scholarly description MUST be rendered
    expect(screen.getByText("بررسی جامع اصول همودینامیک و مقاومت عروقی")).toBeDefined();

    // 4. Generic placeholder description 'مباحث و جلسات آموزشی جامع' MUST NOT be rendered
    expect(screen.queryByText("مباحث و جلسات آموزشی جامع")).toBeNull();

    // 5. Educational chapter titles and navigation remain fully intact
    expect(screen.getAllByText("فصل اول: الکتروفیزیولوژی قلب").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("فصل دوم: دینامیک خون")).toBeDefined();
    expect(screen.getByText("فصل چهارم: فارماکولوژی بالینی")).toBeDefined();
  });

  it("keeps only the last selected chapter open in syllabus drawer, keeps all closed on mount, and preserves learning progress", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "گره سینوسی دهلیزی" })).toBeDefined();
    });

    // 1. Open drawer
    fireEvent.click(screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // 2. On mount / initial load, ALL chapters are collapsed by default (Criterion 4)
    expect(screen.queryByText("گره سینوسی-دهلیزی (SA Node)")).toBeNull();
    expect(screen.queryByText("قانون استارلینگ قلب")).toBeNull();

    // 3. Opening Chapter A (Module 1) shows only Chapter A's lessons (Criterion 1)
    const mod1Button = screen.getByRole("button", { name: /فصل اول: الکتروفیزیولوژی قلب/i });
    fireEvent.click(mod1Button);

    await waitFor(() => {
      expect(screen.getByText("گره سینوسی-دهلیزی (SA Node)")).toBeDefined();
    });
    expect(screen.queryByText("قانون استارلینگ قلب")).toBeNull();

    // 4. Opening Chapter B (Module 2) closes Chapter A and shows only Chapter B's lessons (Criterion 2)
    const mod2Button = screen.getByRole("button", { name: /فصل دوم: دینامیک خون و فشار/i });
    fireEvent.click(mod2Button);

    await waitFor(() => {
      expect(screen.getByText("قانون استارلینگ قلب")).toBeDefined();
    });
    // Chapter A's lessons must now be closed
    expect(screen.queryByText("گره سینوسی-دهلیزی (SA Node)")).toBeNull();

    // 5. Clicking Chapter B again closes it so that no chapters remain open (Criterion 3)
    fireEvent.click(mod2Button);

    await waitFor(() => {
      expect(screen.queryByText("قانون استارلینگ قلب")).toBeNull();
    });
    expect(screen.queryByText("گره سینوسی-دهلیزی (SA Node)")).toBeNull();

    // 6. Learning progress and completed lessons counter remain unaffected (Criterion 5)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByText(/۳۳٪/)).toBeDefined();
  });

  it("renders study assistant as a side-by-side desktop sidebar with lesson content and returns to full width upon closing", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("study-tools-header")).toBeDefined();
    });

    const header = screen.getByTestId("study-tools-header");
    const askAvanaBtn = within(header).getByRole("button", { name: /از آوانا بپرس/i });

    // Initially, sidebar is closed and not present in DOM
    expect(screen.queryByTestId("study-assistant-sidebar")).toBeNull();

    // Open Study Assistant
    fireEvent.click(askAvanaBtn);

    // Sidebar should now be open
    await waitFor(() => {
      expect(screen.getByTestId("study-assistant-sidebar")).toBeDefined();
    });

    const sidebar = screen.getByTestId("study-assistant-sidebar");

    // Verify desktop classes: 380px on desktop, 430px on xl, sticky, border-s
    expect(sidebar.className).toContain("lg:w-[380px]");
    expect(sidebar.className).toContain("xl:w-[430px]");
    expect(sidebar.className).toContain("lg:sticky");
    expect(sidebar.className).toContain("lg:border-s");

    // Verify lesson content is in adjacent flex-1 column
    const workspaceContainer = sidebar.parentElement;
    expect(workspaceContainer?.className).toContain("lg:flex-row");
    const readingColumn = workspaceContainer?.firstElementChild;
    expect(readingColumn?.className).toContain("flex-1");
    expect(readingColumn?.className).toContain("min-w-0");

    // Close sidebar via the study tools header toggle
    const closeBtn = within(header).getByRole("button", { name: /بستن دستیار/i });
    fireEvent.click(closeBtn);

    // Sidebar should be removed and lesson returns to full width
    await waitFor(() => {
      expect(screen.queryByTestId("study-assistant-sidebar")).toBeNull();
    });
    expect(readingColumn?.className).toContain("w-full");
  });

  it("preserves conversation messages and chat history across closing and reopening the study assistant sidebar", async () => {
    // Mock the AI assistant response
    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      const method = opts?.method || "GET";
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockCurriculumData)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "سازمان آموزش پزشکی", slug: "med-org" }],
              }),
            ),
        } as unknown as Response);
      }
      if (urlStr.includes("/study-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-session",
                session: { id: "session-test-1", durationSeconds: 0 },
              }),
            ),
        } as unknown as Response);
      }
      if ((urlStr.includes("/ai/ask") || urlStr.includes("/ai/study-assistant")) && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                answer: "پاسخ هوشمند آوانا: گره SA پیس‌میکر طبیعی است.",
                conversationId: "conv-12345",
                sources: { lessonTitle: "گره سینوسی دهلیزی" },
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("study-tools-header")).toBeDefined();
    });

    const header = screen.getByTestId("study-tools-header");

    // 1. Open Assistant
    fireEvent.click(within(header).getByRole("button", { name: /از آوانا بپرس/i }));
    await waitFor(() => {
      expect(screen.getByTestId("study-assistant-sidebar")).toBeDefined();
    });

    const sidebar = screen.getByTestId("study-assistant-sidebar");

    // 2. Send a user question
    const textarea = within(sidebar).getByPlaceholderText(/سوال خود را در مورد این درس بنویسید/i);
    fireEvent.change(textarea, { target: { value: "عملکرد گره SA چگونه است؟" } });
    const sendBtn = within(sidebar).getByRole("button", { name: /ارسال پیام/i });
    fireEvent.click(sendBtn);

    // 3. Verify user message and assistant reply are rendered
    await waitFor(() => {
      expect(within(sidebar).getByText("عملکرد گره SA چگونه است؟")).toBeDefined();
      expect(within(sidebar).getByText(/گره SA پیس‌میکر طبیعی است/i)).toBeDefined();
    });

    // 4. Close the assistant via sidebar's close button (X)
    const closeBtn = within(sidebar).getByLabelText("بستن دستیار");
    fireEvent.click(closeBtn);

    // Sidebar is closed
    await waitFor(() => {
      expect(screen.queryByTestId("study-assistant-sidebar")).toBeNull();
    });

    // 5. Reopen the assistant
    fireEvent.click(within(header).getByRole("button", { name: /از آوانا بپرس/i }));
    await waitFor(() => {
      expect(screen.getByTestId("study-assistant-sidebar")).toBeDefined();
    });

    const reopenedSidebar = screen.getByTestId("study-assistant-sidebar");

    // 6. Verify that PREVIOUS MESSAGES ARE STILL PRESERVED!
    expect(within(reopenedSidebar).getByText("عملکرد گره SA چگونه است؟")).toBeDefined();
    expect(within(reopenedSidebar).getByText(/گره SA پیس‌میکر طبیعی است/i)).toBeDefined();
  });

  it("handles concurrent interactions between study assistant and curriculum syllabus drawer without state corruption", async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("study-tools-header")).toBeDefined();
    });

    const header = screen.getByTestId("study-tools-header");

    // 1. Open Assistant
    fireEvent.click(within(header).getByRole("button", { name: /از آوانا بپرس/i }));
    await waitFor(() => {
      expect(screen.getByTestId("study-assistant-sidebar")).toBeDefined();
    });

    // 2. Open Syllabus Drawer while Assistant is open
    fireEvent.click(within(header).getByRole("button", { name: /نمایش سرفصل‌های دوره/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "سرفصل‌های دوره" })).toBeDefined();
    });

    // 3. Verify stacking contexts: Syllabus drawer (z-[70]) is higher than assistant (z-[55] / z-10)
    const curriculumDrawer = screen.getByRole("dialog", { name: "سرفصل‌های دوره" });
    expect(curriculumDrawer.className).toContain("z-[70]");

    // 4. Close syllabus drawer via Escape
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "سرفصل‌های دوره" })).toBeNull();
    });

    // 5. Assistant remains open and functional
    expect(screen.getByTestId("study-assistant-sidebar")).toBeDefined();
  });
});
