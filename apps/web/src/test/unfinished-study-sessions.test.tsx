import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { UnfinishedSessionsList } from "../components/flashcards/UnfinishedSessionsList.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Unfinished Flashcard Study Sessions UI & Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockSessionId = "sess-12345";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders active unfinished session with title, progress bar, and card counters", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            sessions: [
              {
                id: mockSessionId,
                title: "مرور روزانه فارماکولوژی",
                mode: "daily",
                total_cards: 10,
                completed_cards: 4,
                current_index: 4,
                last_activity_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
      expect(screen.getByText("مرور روزانه فارماکولوژی")).toBeDefined();
      expect(screen.getByText("ادامه مطالعه")).toBeDefined();
      expect(screen.getByText((content) => content.includes("۴") && content.includes("۱۰"))).toBeDefined();
      expect(screen.getByText(/۴۰.*٪/)).toBeDefined();
    });
  });

  it("navigates to /flashcards/review with sessionId on resume click", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            sessions: [
              {
                id: mockSessionId,
                title: "مرور آزمون فشرده",
                mode: "exam",
                total_cards: 20,
                completed_cards: 8,
                current_index: 8,
                last_activity_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مرور آزمون فشرده")).toBeDefined();
    });

    fireEvent.click(screen.getByText("ادامه مطالعه"));

    expect(mockNavigate).toHaveBeenCalledWith(`/flashcards/review?sessionId=${mockSessionId}`);
  });

  it("calls cancel endpoint (soft delete) when user clicks delete button", async () => {
    vi.spyOn(window, "confirm").mockImplementation(() => true);
    let cancelCalled = false;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (url.includes(`/study/flashcard-sessions/${mockSessionId}/cancel`) && opts?.method === "POST") {
        cancelCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-cancel",
            session: { id: mockSessionId, status: "cancelled" },
          }),
        });
      }
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            sessions: [
              {
                id: mockSessionId,
                title: "مطالعه لغو شونده",
                mode: "daily",
                total_cards: 5,
                completed_cards: 1,
                current_index: 1,
                last_activity_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مطالعه لغو شونده")).toBeDefined();
    });

    const deleteBtn = screen.getByTitle("انصراف و حذف مطالعه");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(cancelCalled).toBe(true);
    });
  });

  it("resumes FlashcardExperience directly from the persisted session index", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/study/flashcard-sessions/${mockSessionId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-sess",
            session: {
              id: mockSessionId,
              title: "مرور با سشن",
              mode: "daily",
              total_cards: 2,
              completed_cards: 1,
              current_index: 1, // Start directly on card 2 (index 1)
              status: "in_progress",
            },
            cards: [
              {
                id: "c-1",
                question: "کارت اول (قبلاً دیده شده)",
                answer: "پاسخ ۱",
                organization_id: mockOrgId,
                course_id: "course-1",
                document_id: "doc-1",
                interval_days: 1,
                ease_factor: 2.5,
              },
              {
                id: "c-2",
                question: "کارت دوم (نقطه ادامه مطالعه)",
                answer: "پاسخ ۲",
                organization_id: mockOrgId,
                course_id: "course-1",
                document_id: "doc-1",
                interval_days: 0,
                ease_factor: 2.5,
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-sum", courses: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardExperience
            organizationId={mockOrgId}
            sessionId={mockSessionId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verifies that FlashcardExperience resumes immediately at card 2 (index 1)
    await waitFor(() => {
      expect(screen.getByText("کارت دوم (نقطه ادامه مطالعه)")).toBeDefined();
    });
  });

  it("handles the complete roundtrip flow: create session -> review cards -> leave -> see unfinished list -> resume", async () => {
    let currentSessionState = {
      id: "roundtrip-session-1",
      title: "مطالعه جامع فارماکولوژی",
      mode: "daily",
      total_cards: 3,
      completed_cards: 0,
      current_index: 0,
      status: "in_progress",
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const mockCards = [
      { id: "rc-1", question: "سوال ۱", answer: "جواب ۱", organization_id: mockOrgId, course_id: "c-1", interval_days: 0, ease_factor: 2.5 },
      { id: "rc-2", question: "سوال ۲", answer: "جواب ۲", organization_id: mockOrgId, course_id: "c-1", interval_days: 0, ease_factor: 2.5 },
      { id: "rc-3", question: "سوال ۳", answer: "جواب ۳", organization_id: mockOrgId, course_id: "c-1", interval_days: 0, ease_factor: 2.5 },
    ];

    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      // 1. Create session
      if (url.endsWith("/study/flashcard-sessions") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            request_id: "create-1",
            session: currentSessionState,
          }),
        });
      }

      // 2. List active sessions
      if (url.endsWith("/study/flashcard-sessions") && (!opts || opts.method === "GET")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "list-1",
            sessions: currentSessionState.status === "in_progress" ? [currentSessionState] : [],
          }),
        });
      }

      // 3. Get session detail
      if (url.includes(`/study/flashcard-sessions/${currentSessionState.id}`) && (!opts || opts.method === "GET")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "detail-1",
            session: currentSessionState,
            cards: mockCards,
          }),
        });
      }

      // 4. Update progress
      if (url.includes(`/study/flashcard-sessions/${currentSessionState.id}/progress`) && opts?.method === "PATCH") {
        const parsed = JSON.parse(opts.body || "{}");
        currentSessionState = {
          ...currentSessionState,
          current_index: parsed.current_index ?? currentSessionState.current_index,
          completed_cards: currentSessionState.completed_cards + 1,
          last_activity_at: new Date().toISOString(),
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "prog-1",
            session: currentSessionState,
          }),
        });
      }

      // 5. Submit review rating
      if (url.includes("/review") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "rev-1", success: true }),
        });
      }

      // 6. Flashcard summary
      if (url.includes("/flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "sum-1",
            courses: [{ course_id: "c-1", title: "فارماکولوژی", total_cards: 3, due_cards: 3, new_cards: 0 }],
            total_cards: 3,
            total_due: 3,
            total_new: 0,
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "def" }),
      });
    });

    const queryClient = createTestQueryClient();

    // Step A: Review first card in FlashcardExperience
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardExperience
            organizationId={mockOrgId}
            sessionId={currentSessionState.id}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial card 1 is displayed
    await waitFor(() => {
      expect(screen.getByText("سوال ۱")).toBeDefined();
    });

    // Flip card 1
    fireEvent.click(screen.getByLabelText(/سوال فلش‌کارت/i));

    // Rate card 1 as 'good'
    await waitFor(() => {
      expect(screen.getByText("خوب")).toBeDefined();
    });
    fireEvent.click(screen.getByText("خوب"));

    // Card 2 is now shown
    await waitFor(() => {
      expect(screen.getByText("سوال ۲")).toBeDefined();
      expect(currentSessionState.completed_cards).toBe(1);
      expect(currentSessionState.current_index).toBe(1);
    });

    // Step B: User leaves review page (unmount FlashcardExperience) and returns to Flashcards preparation page
    unmount();

    // Step C: Render UnfinishedSessionsList on Flashcards preparation page
    const freshQueryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={freshQueryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify «مطالعات ناتمام» is visible showing progress: 1 of 3 cards
    await waitFor(() => {
      expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
      expect(screen.getByText("مطالعه جامع فارماکولوژی")).toBeDefined();
      expect(screen.getByText((content) => content.includes("۱") && content.includes("۳"))).toBeDefined();
      expect(screen.getByText(/۳۳.*٪/)).toBeDefined();
    });

    // Step D: User clicks «ادامه مطالعه»
    const resumeBtn = screen.getByText("ادامه مطالعه");
    fireEvent.click(resumeBtn);
    expect(mockNavigate).toHaveBeenCalledWith(`/flashcards/review?sessionId=${currentSessionState.id}`);
  });

  it("verifies the exact 20-card / 5-reviewed scenario with refresh, completion, and cancellation", async () => {
    const totalCardCount = 20;
    const session1Id = "session-20cards-abc123";
    const session2Id = "session-cancel-xyz789";

    const mock20Cards = Array.from({ length: totalCardCount }, (_, i) => ({
      id: `card-${i + 1}`,
      question: `کارت شماره ${i + 1}`,
      answer: `پاسخ کارت ${i + 1}`,
      organization_id: mockOrgId,
      course_id: "course-1",
      interval_days: 0,
      ease_factor: 2.5,
    }));

    let session1 = {
      id: session1Id,
      title: "مرور ۲۰ فلش‌کارت انتخابی",
      mode: "daily",
      total_cards: totalCardCount,
      completed_cards: 0,
      current_index: 0,
      status: "in_progress",
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    let activeSessions = [session1];

    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      // 1. Create Session
      if (url.endsWith("/study/flashcard-sessions") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            request_id: "req-create",
            session: session1,
          }),
        });
      }

      // 2. List Active Sessions
      if (url.endsWith("/study/flashcard-sessions") && (!opts || opts.method === "GET")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-list",
            sessions: activeSessions.filter((s) => s.status === "in_progress"),
          }),
        });
      }

      // 3. Get Session Detail
      if (url.includes(`/study/flashcard-sessions/${session1Id}`) && (!opts || opts.method === "GET")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-detail",
            session: session1,
            cards: mock20Cards,
          }),
        });
      }

      // 4. Update Progress
      if (url.includes(`/study/flashcard-sessions/${session1Id}/progress`) && opts?.method === "PATCH") {
        const body = JSON.parse(opts.body || "{}");
        session1 = {
          ...session1,
          current_index: body.current_index ?? session1.current_index,
          completed_cards: session1.completed_cards + 1,
          last_activity_at: new Date().toISOString(),
        };
        const idx = activeSessions.findIndex((s) => s.id === session1Id);
        if (idx >= 0) activeSessions[idx] = session1;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-prog",
            session: session1,
          }),
        });
      }

      // 5. Complete Session
      if (url.includes(`/study/flashcard-sessions/${session1Id}/complete`) && opts?.method === "POST") {
        session1 = { ...session1, status: "completed" };
        activeSessions = activeSessions.filter((s) => s.id !== session1Id);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-comp", session: session1 }),
        });
      }

      // 6. Cancel Session
      if (url.includes(`/study/flashcard-sessions/${session2Id}/cancel`) && opts?.method === "POST") {
        activeSessions = activeSessions.filter((s) => s.id !== session2Id);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-canc",
            session: { id: session2Id, status: "cancelled" },
          }),
        });
      }

      // 7. Review rating
      if (url.includes("/review") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-rev", success: true }),
        });
      }

      // 8. Flashcard summary
      if (url.includes("/flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-sum",
            courses: [{ course_id: "course-1", title: "دوره اصلی", total_cards: 20, due_cards: 20, new_cards: 0 }],
            total_cards: 20,
            total_due: 20,
            total_new: 0,
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient1 = createTestQueryClient();

    // Step 1 to 5: User reviews 5 cards out of 20 in FlashcardExperience
    const { unmount: unmountReview1 } = render(
      <QueryClientProvider client={queryClient1}>
        <MemoryRouter>
          <FlashcardExperience
            organizationId={mockOrgId}
            sessionId={session1Id}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Review 5 cards in sequence
    for (let i = 1; i <= 5; i++) {
      await waitFor(() => {
        expect(screen.getByText(`کارت شماره ${i}`)).toBeDefined();
      });
      // Flip
      fireEvent.click(screen.getByLabelText(/سوال فلش‌کارت/i));
      // Rate good
      await waitFor(() => {
        expect(screen.getByText("خوب")).toBeDefined();
      });
      fireEvent.click(screen.getByText("خوب"));
    }

    // Step 6: User sees Card 6 on screen, but leaves review before finishing
    await waitFor(() => {
      expect(screen.getByText("کارت شماره 6")).toBeDefined();
      expect(session1.completed_cards).toBe(5);
      expect(session1.current_index).toBe(5);
    });

    unmountReview1();

    // Step 7 & 8: User returns to Flashcards preparation page
    const queryClient2 = createTestQueryClient();
    const { unmount: unmountPrep1 } = render(
      <QueryClientProvider client={queryClient2}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify «مطالعات ناتمام» is visible showing progress: 5 of 20 cards (25%)
    await waitFor(() => {
      expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
      expect(screen.getByText("مرور ۲۰ فلش‌کارت انتخابی")).toBeDefined();
      expect(screen.getByText((content) => content.includes("۵") && content.includes("۲۰"))).toBeDefined();
      expect(screen.getByText(/۲۵.*٪/)).toBeDefined();
    });

    // Step 9 & 10: User clicks «ادامه مطالعه»
    const resumeBtn = screen.getByText("ادامه مطالعه");
    fireEvent.click(resumeBtn);
    expect(mockNavigate).toHaveBeenCalledWith(`/flashcards/review?sessionId=${session1Id}`);

    unmountPrep1();

    // Step 11 & 12: Resuming session & Refresh page -> FlashcardExperience resumes directly on card 6 (index 5)
    const queryClient3 = createTestQueryClient();
    const { unmount: unmountReview2 } = render(
      <QueryClientProvider client={queryClient3}>
        <MemoryRouter>
          <FlashcardExperience
            organizationId={mockOrgId}
            sessionId={session1Id}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("کارت شماره 6")).toBeDefined();
    });

    unmountReview2();

    // Step 13: Complete Session -> verify section renders empty state when active sessions list is empty
    session1 = { ...session1, status: "completed", completed_cards: 20, current_index: 20 };
    activeSessions = [];

    const queryClient4 = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient4}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unfinished-sessions-section")).toBeDefined();
      expect(screen.getByTestId("unfinished-sessions-empty")).toBeDefined();
      expect(screen.getByText("هنوز مطالعه ناتمامی ندارید.")).toBeDefined();
      expect(screen.queryByText("مرور ۲۰ فلش‌کارت انتخابی")).toBeNull();
    });

    // Step 14: Create second session and cancel it -> verify cancelled and removed from active list
    const session2 = {
      id: session2Id,
      title: "مطالعه شماره ۲ جهت تست لغو",
      mode: "daily",
      total_cards: 10,
      completed_cards: 2,
      current_index: 2,
      status: "in_progress",
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    activeSessions = [session2];
    vi.spyOn(window, "confirm").mockImplementation(() => true);

    const queryClient5 = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient5}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مطالعه شماره ۲ جهت تست لغو")).toBeDefined();
    });

    const cancelBtn = screen.getByTitle("انصراف و حذف مطالعه");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(activeSessions.length).toBe(0);
    });
  });

  it("renders Empty State inside the section when API returns empty sessions list (sessions: [])", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-empty",
            sessions: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unfinished-sessions-section")).toBeDefined();
      expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
      expect(screen.getByTestId("unfinished-sessions-empty")).toBeDefined();
      expect(screen.getByText("هنوز مطالعه ناتمامی ندارید.")).toBeDefined();
      expect(
        screen.getByText(
          "مطالعه‌ای که شروع کنید و کامل نکنید، اینجا برای ادامه دادن نمایش داده می‌شود.",
        ),
      ).toBeDefined();
      expect(screen.queryByText("ادامه مطالعه")).toBeNull();
    });
  });

  it("renders active sessions and resume button when API returns sessions list", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-active",
            sessions: [
              {
                id: "sess-active-1",
                title: "مطالعه فعال ناتمام",
                mode: "daily",
                total_cards: 15,
                completed_cards: 5,
                current_index: 5,
                last_activity_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unfinished-sessions-section")).toBeDefined();
      expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
      expect(screen.getByText("مطالعه فعال ناتمام")).toBeDefined();
      expect(screen.getByText("ادامه مطالعه")).toBeDefined();
      expect(screen.queryByTestId("unfinished-sessions-empty")).toBeNull();
    });
  });

  it("renders Error State with retry button when API returns an error", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/study/flashcard-sessions")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            request_id: "req-err",
            error: "Internal Server Error",
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("unfinished-sessions-section")).toBeDefined();
      expect(screen.getByTestId("unfinished-sessions-error")).toBeDefined();
      expect(screen.getByText("خطا در بارگذاری مطالعات ناتمام")).toBeDefined();
      expect(screen.getByText("تلاش مجدد")).toBeDefined();
      expect(screen.queryByTestId("unfinished-sessions-empty")).toBeNull();
    });
  });

  it("renders Skeleton loading state while sessions query is in flight", () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UnfinishedSessionsList organizationId={mockOrgId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("unfinished-sessions-section")).toBeDefined();
    expect(screen.getByTestId("unfinished-sessions-skeleton")).toBeDefined();
    expect(screen.getByText("مطالعات ناتمام")).toBeDefined();
  });
});
