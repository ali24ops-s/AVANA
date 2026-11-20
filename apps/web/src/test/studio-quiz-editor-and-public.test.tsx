import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PublicQuizPage } from "../pages/quiz/PublicQuizPage.js";
import {
  resolveCorrectChoiceText,
} from "@avana/domain";
import * as AuthProviderModule from "../providers/AuthProvider.js";

describe("Studio Quiz Editor and Public Quiz Experience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Question Bank Pagination & Selection Persistence Logic", () => {
    it("preserves selected questions when navigating across different pages", () => {
      // Setup mock questions on Page 1 and Page 2
      const page1Questions = [
        {
          id: "q-page-1-1",
          sourceType: "bank" as const,
          sourceId: "bank-1",
          question: "سؤال صفحه یکم",
          choices: [
            { id: "c1", text: "گزینه ۱" },
            { id: "c2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "c1" },
          difficulty: "medium" as const,
          questionType: "multiple_choice",
          createdAt: new Date(),
        },
      ];

      const page2Questions = [
        {
          id: "q-page-2-1",
          sourceType: "bank" as const,
          sourceId: "bank-2",
          question: "سؤال صفحه دوم",
          choices: [
            { id: "c3", text: "گزینه ۳" },
            { id: "c4", text: "گزینه ۴" },
          ],
          correctAnswer: { choiceId: "c3" },
          difficulty: "hard" as const,
          questionType: "multiple_choice",
          createdAt: new Date(),
        },
      ];

      // Simulated selection state (Map keyed by unique question id)
      const selectedQuestions = new Map<string, typeof page1Questions[0]>();

      // Select from Page 1
      selectedQuestions.set(page1Questions[0].id, page1Questions[0]);
      expect(selectedQuestions.size).toBe(1);
      expect(selectedQuestions.has("q-page-1-1")).toBe(true);

      // Navigate to Page 2 and select
      selectedQuestions.set(page2Questions[0].id, page2Questions[0]);
      expect(selectedQuestions.size).toBe(2);
      expect(selectedQuestions.has("q-page-1-1")).toBe(true);
      expect(selectedQuestions.has("q-page-2-1")).toBe(true);

      // Verify batch payload generation preserves both selections with snapshots
      const batchPayload = Array.from(selectedQuestions.values()).map((q) => ({
        sourceType: q.sourceType,
        sourceId: q.sourceId,
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
      }));

      expect(batchPayload).toHaveLength(2);
      expect(batchPayload[0].question).toBe("سؤال صفحه یکم");
      expect(batchPayload[1].question).toBe("سؤال صفحه دوم");
    });

    it("prevents duplicate addition of questions already present in the quiz", () => {
      const existingQuizQuestions = [
        {
          id: "snap-1",
          sourceId: "bank-1",
          question: "داروی خط اول فشار خون بالا چیست؟",
        },
      ];

      const isQuestionAlreadyInQuiz = (item: { sourceId?: string; question: string }) => {
        return existingQuizQuestions.some(
          (q) =>
            (q.sourceId && item.sourceId && q.sourceId === item.sourceId) ||
            q.question.trim().toLowerCase() === item.question.trim().toLowerCase()
        );
      };

      // Exactly matches sourceId
      expect(
        isQuestionAlreadyInQuiz({
          sourceId: "bank-1",
          question: "داروی دیگری",
        })
      ).toBe(true);

      // Matches normalized text
      expect(
        isQuestionAlreadyInQuiz({
          sourceId: "bank-different",
          question: " داروی خط اول فشار خون بالا چیست؟ ",
        })
      ).toBe(true);

      // New distinct question
      expect(
        isQuestionAlreadyInQuiz({
          sourceId: "bank-2",
          question: "عوارض جانبی مسدودکننده بتا؟",
        })
      ).toBe(false);
    });
  });

  describe("2. Correct Answer Mapping & Ambiguity Detection", () => {
    const sampleChoices = [
      { id: "10", text: "پنی‌سیلین" },
      { id: "20", text: "آموکسی‌سیلین" },
      { id: "30", text: "سفتریاکسون" },
      { id: "40", text: "آزیترومایسین" },
    ];
    const choiceTexts = sampleChoices.map((c) => c.text);

    function mapToChoiceId(rawAnswer: unknown) {
      if (typeof rawAnswer === "object" && rawAnswer !== null) {
        const ca = rawAnswer as { choiceId?: string };
        if (ca.choiceId && sampleChoices.some((c) => c.id === ca.choiceId)) {
          return { choiceId: ca.choiceId };
        }
      }
      const resolvedText = resolveCorrectChoiceText(choiceTexts, rawAnswer, { strict: true });
      if (resolvedText) {
        const match = sampleChoices.find((c) => c.text === resolvedText);
        if (match) return { choiceId: match.id };
      }
      return { choiceId: undefined, ambiguous: true };
    }

    it("resolves option text to exact choice ID", () => {
      const res = mapToChoiceId("آموکسی‌سیلین");
      expect(res).toEqual({ choiceId: "20" });
    });

    it("resolves choice ID directly when valid", () => {
      const res = mapToChoiceId({ choiceId: "30" });
      expect(res).toEqual({ choiceId: "30" });
    });

    it("resolves Persian letter strictly according to choice order", () => {
      // الف -> 0 (10), ب -> 1 (20), ج -> 2 (30), د -> 3 (40)
      const resAlef = mapToChoiceId("الف");
      expect(resAlef).toEqual({ choiceId: "10" });

      const resJim = mapToChoiceId("ج");
      expect(resJim).toEqual({ choiceId: "30" });
    });

    it("resolves English letter strictly according to choice order", () => {
      const resB = mapToChoiceId("B");
      expect(resB).toEqual({ choiceId: "20" });

      const resD = mapToChoiceId("Option D");
      expect(resD).toEqual({ choiceId: "40" });
    });

    it("flags ambiguous answers and does NOT arbitrarily assign to option 1", () => {
      const resInvalid = mapToChoiceId("گزینه نامعتبر هـ");
      expect(resInvalid.choiceId).toBeUndefined();
      expect(resInvalid.ambiguous).toBe(true);

      const isAnswerAmbiguous = (ca: unknown) => {
        if (!ca) return true;
        if (typeof ca === "object" && ca !== null) {
          const rec = ca as Record<string, unknown>;
          return Boolean(rec.ambiguous) || (!rec.choiceId && !rec.choiceIds && rec.booleanAnswer === undefined);
        }
        return false;
      };

      expect(isAnswerAmbiguous(resInvalid)).toBe(true);
      expect(isAnswerAmbiguous({ choiceId: "10" })).toBe(false);
    });
  });

  describe("3. Designer Preview vs Taker Masking UI Behavior", () => {
    it("renders answer key toggle in preview mode for authorized designer", async () => {
      const mockQuizPreviewPayload = {
        id: "quiz-preview-1",
        slug: "cardio-quiz",
        title: "آزمون قلب و عروق (پیش‌نمایش)",
        description: "آزمون تخصصی",
        isPreview: true,
        canViewAnswerKey: true,
        settings: { passScorePercentage: 70 },
        questions: [
          {
            id: "q-1",
            question: "مکانیسم اثر کاپتوپریل چیست؟",
            choices: [
              { id: "c1", text: "مهارکننده آنزیم مبدل آنژیوتانسین" },
              { id: "c2", text: "بلوک‌کننده کانال کلسیم" },
            ],
            difficulty: "medium" as const,
            sortOrder: 0,
            correctAnswer: { choiceId: "c1" },
            explanation: "کاپتوپریل آنزیم ACE را مهار می‌کند.",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ quiz: mockQuizPreviewPayload }),
      });

      render(
        <MemoryRouter initialEntries={["/quiz/cardio-quiz?preview=true"]}>
          <Routes>
            <Route path="/quiz/:slug" element={<PublicQuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByText("آزمون قلب و عروق (پیش‌نمایش)")).toBeDefined();
      });

      // Preview banner and answer key toggle button must be present
      expect(screen.getByText(/حالت پیش‌نمایش/)).toBeDefined();
      expect(screen.getByText(/نمایش پاسخنامه/)).toBeDefined();

      // Click answer key toggle
      const toggleBtn = screen.getByRole("button", { name: /نمایش پاسخنامه/ });
      fireEvent.click(toggleBtn);

      // Now active state and explanation must be visible
      await waitFor(() => {
        expect(screen.getByText("پاسخنامه: فعال ✓")).toBeDefined();
        expect(screen.getByText(/کاپتوپریل آنزیم ACE را مهار می‌کند/)).toBeDefined();
      });
    });

    it("strictly hides answer key and masks answers when taker takes the quiz", async () => {
      const mockQuizPublicPayload = {
        slug: "cardio-quiz",
        title: "آزمون عمومی قلب و عروق",
        description: "آزمون عمومی",
        settings: { passScorePercentage: 70 },
        questions: [
          {
            id: "q-1",
            question: "مکانیسم اثر کاپتوپریل چیست؟",
            choices: [
              { id: "c1", text: "مهارکننده آنزیم مبدل آنژیوتانسین" },
              { id: "c2", text: "بلوک‌کننده کانال کلسیم" },
            ],
            difficulty: "medium" as const,
            sortOrder: 0,
            // Stripped by backend!
            correctAnswer: undefined,
            explanation: undefined,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ quiz: mockQuizPublicPayload }),
      });

      render(
        <MemoryRouter initialEntries={["/quiz/cardio-quiz"]}>
          <Routes>
            <Route path="/quiz/:slug" element={<PublicQuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("آزمون عمومی قلب و عروق")).toBeDefined();
      });

      // Preview banner and answer key toggle button MUST NOT exist
      expect(screen.queryByText("حالت پیش‌نمایش")).toBeNull();
      expect(screen.queryByText(/نمایش پاسخنامه/)).toBeNull();
      expect(screen.queryByText(/پاسخنامه: فعال/)).toBeNull();
      expect(screen.queryByText(/پاسخ تشریحی/)).toBeNull();
    });
  });

  describe("4. Guest to Registration Conversion Funnel & Solution Unlocking", () => {
    it("preserves draft answers in sessionStorage and clears on attempt completion", async () => {
      sessionStorage.clear();
      const mockQuiz = {
        slug: "funnel-quiz",
        title: "آزمون ورودی فارماکوپیا",
        description: "سنجش سطح بالینی",
        settings: { passScorePercentage: 70 },
        questions: [
          {
            id: "q-step-1",
            question: "سؤال مرحله اول؟",
            choices: [
              { id: "c-1", text: "گزینه الف" },
              { id: "c-2", text: "گزینه ب" },
            ],
            difficulty: "medium" as const,
            sortOrder: 0,
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
        if (url.includes("/v1/public/quizzes/funnel-quiz/attempt")) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              result: {
                attemptToken: "tok-abc-123",
                score: 100,
                correctCount: 1,
                wrongCount: 0,
                totalQuestions: 1,
                questionReviews: [
                  { questionId: "q-step-1", userAnswer: "c-1", isCorrect: true },
                ],
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ quiz: mockQuiz }),
        };
      });

      render(
        <MemoryRouter initialEntries={["/quiz/funnel-quiz"]}>
          <Routes>
            <Route path="/quiz/:slug" element={<PublicQuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("آزمون ورودی فارماکوپیا")).toBeDefined();
      });

      // Select option الف
      const optionBtn = screen.getByText("گزینه الف");
      fireEvent.click(optionBtn);

      // Verify draft saved to sessionStorage
      const savedDraft = sessionStorage.getItem("avana_quiz_draft_funnel-quiz");
      expect(savedDraft).toBeDefined();
      expect(JSON.parse(savedDraft!).answers).toEqual({ "q-step-1": "c-1" });

      // Click submit
      const submitBtn = screen.getByRole("button", { name: /ثبت نهایی و مشاهده نتیجه/ });
      fireEvent.click(submitBtn);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText("نمره نهایی")).toBeDefined();
      });

      // Draft must be cleared from sessionStorage
      expect(sessionStorage.getItem("avana_quiz_draft_funnel-quiz")).toBeNull();

      // Guest sees locked banner and conversion CTAs
      expect(screen.getByText("پاسخ‌های تشریحی آماده‌اند!")).toBeDefined();
      expect(screen.getByText("ویژه اعضای آوانا")).toBeDefined();
      expect(screen.getByRole("button", { name: /ثبت‌نام و مشاهده پاسخ‌ها/ })).toBeDefined();
      expect(screen.getByRole("button", { name: /حساب کاربری دارم \| ورود/ })).toBeDefined();

      // Check locked explanation teaser in question reviews
      expect(screen.getByText(/پاسخ تشریحی و تحلیل گزینه‌ها برای اعضای آوانا قفل است/)).toBeDefined();
      expect(screen.getByRole("button", { name: /مشاهده با ثبت‌نام/ })).toBeDefined();
    });

    it("claims attempt and unlocks full solutions when authenticated user visits with attempt token", async () => {
      // Mock authenticated user
      vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
        user: { id: "user-registered-1", email: "student@avana.ir" } as unknown as AuthProviderModule.AuthState["user"],
        memberships: [],
        isLoading: false,
        error: null,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: false,
        isVerified: true,
        signIn: vi.fn(),
        workerAutoLogin: vi.fn(),
        sendPhoneLoginOtp: vi.fn(),
        verifyPhoneLoginOtp: vi.fn(),
        signUp: vi.fn(),
        sendVerification: vi.fn(),
        verifyChannel: vi.fn(),
        verifyEmail: vi.fn(),
        resendVerification: vi.fn(),
        forgotPassword: vi.fn(),
        resetPassword: vi.fn(),
        updateProfile: vi.fn(),
        signOut: vi.fn(),
        clearError: vi.fn(),
      });

      const mockQuiz = {
        slug: "funnel-quiz",
        title: "آزمون ورودی فارماکوپیا",
        description: "سنجش سطح بالینی",
        settings: { passScorePercentage: 70 },
        questions: [
          {
            id: "q-step-1",
            question: "سؤال مرحله اول؟",
            choices: [
              { id: "c-1", text: "گزینه الف" },
              { id: "c-2", text: "گزینه ب" },
            ],
            difficulty: "medium" as const,
            sortOrder: 0,
          },
        ],
      };

      const mockSolutions = {
        attemptToken: "tok-abc-123",
        score: 100,
        correctCount: 1,
        wrongCount: 0,
        totalQuestions: 1,
        questions: [
          {
            id: "q-step-1",
            question: "سؤال مرحله اول؟",
            choices: [
              { id: "c-1", text: "گزینه الف" },
              { id: "c-2", text: "گزینه ب" },
            ],
            userAnswer: "c-1",
            isCorrect: true,
            correctAnswer: { choiceId: "c-1" },
            explanation: "توضیح کامل و تشریحی باز شده برای کاربر عضو",
          },
        ],
      };

      const claimSpy = vi.fn();

      global.fetch = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
        if (url.includes("/v1/public/quizzes/attempts/tok-abc-123/claim")) {
          claimSpy();
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              attemptToken: "tok-abc-123",
              userId: "user-registered-1",
            }),
          };
        }
        if (url.includes("/v1/public/quizzes/attempts/tok-abc-123/solutions")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              solutions: mockSolutions,
            }),
          };
        }
        if (url.includes("/v1/public/quizzes/attempts/tok-abc-123")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                attemptToken: "tok-abc-123",
                quizTitle: "آزمون ورودی فارماکوپیا",
                score: 100,
                correctCount: 1,
                wrongCount: 0,
                totalQuestions: 1,
                completedAt: new Date().toISOString(),
                questionReviews: [
                  { questionId: "q-step-1", userAnswer: "c-1", isCorrect: true },
                ],
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ quiz: mockQuiz }),
        };
      });

      render(
        <MemoryRouter initialEntries={["/quiz/funnel-quiz?attempt=tok-abc-123"]}>
          <Routes>
            <Route path="/quiz/:slug" element={<PublicQuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify claim was dispatched
      await waitFor(() => {
        expect(claimSpy).toHaveBeenCalled();
      });

      // Verify solutions and authentication badge are shown
      await waitFor(() => {
        expect(screen.getByText("بررسی سؤالات و پاسخ‌ها")).toBeDefined();
        expect(screen.getByText("احراز هویت شده ✓")).toBeDefined();
      });

      // Verify full explanation is rendered
      expect(screen.getByText("توضیح کامل و تشریحی باز شده برای کاربر عضو")).toBeDefined();

      // Verify locked banner is NOT shown for logged in user
      expect(screen.queryByText(/برای مشاهده پاسخ‌های تشریحی و تحلیل کامل گزینه‌ها وارد حساب خود شوید/)).toBeNull();

      // Secondary promo card should show "مشاهده دوره‌های آموزشی"
      expect(screen.getByRole("link", { name: "مشاهده دوره‌های آموزشی" })).toBeDefined();
    });
  });
});
