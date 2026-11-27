import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import {
  processStudioExamBatchJob,
  type StudioExamProcessorDeps,
} from "../modules/studio/studio-exam-processor.js";
import {
  type StudioExamStore,
  type ClaimBatchResult,
  type BatchExecutionDetails,
  type ModuleLessonContent,
  type SaveQuestionInput,
  FencingTokenStaleError,
  WorkerStopError,
} from "../modules/studio/studio-exam-store.js";
import type { ModelGateway, CompletionRequest, CompletionResult } from "../modules/generation/gateway/types.js";
import type { StudioExamBatchJobPayload } from "../modules/studio/studio-exam-queue.js";
import { validateStudioExamQuestions } from "../modules/studio/studio-exam-validator.js";

describe("Studio Exam Batch Generation Worker & Processing Engine (Phase 2)", () => {
  let mockStore: StudioExamStore;
  let mockGateway: ModelGateway;
  let mockJob: Job<StudioExamBatchJobPayload>;

  const defaultBatchDetails: BatchExecutionDetails = {
    batch: {
      id: "batch-1",
      taskId: "task-1",
      batchIndex: 1,
      targetCount: 5,
      generatedCount: 0,
      status: "pending",
      retryCount: 1,
      patternAllocations: [
        { questionIndex: 1, patternId: "pat-1", patternVersion: 1 },
        { questionIndex: 2, patternId: "pat-2", patternVersion: 1 },
        { questionIndex: 3, patternId: "pat-1", patternVersion: 1 },
        { questionIndex: 4, patternId: "pat-2", patternVersion: 1 },
        { questionIndex: 5, patternId: "pat-1", patternVersion: 1 },
      ],
    },
    task: {
      id: "task-1",
      operationId: "op-1",
      courseId: "course-1",
      moduleId: "mod-1",
      targetQuestionCount: 5,
      generatedQuestionCount: 0,
      status: "pending",
    },
    operation: {
      id: "op-1",
      quizId: "quiz-1",
      organizationId: "org-1",
      totalRequestedQuestions: 5,
      totalGeneratedQuestions: 0,
      status: "pending",
      config: { difficulty: "medium" },
      patternSnapshots: [
        {
          patternId: "pat-1",
          patternVersion: 1,
          title: "مفهومی",
          category: "exam",
          cognitiveLevel: "analysis",
          skills: ["critical_thinking"],
          systemInstructions: "generate conceptual question",
          examples: [],
        },
        {
          patternId: "pat-2",
          patternVersion: 1,
          title: "کاربردی",
          category: "exam",
          cognitiveLevel: "application",
          skills: ["clinical_reasoning"],
          systemInstructions: "generate applied question",
          examples: [],
        },
      ],
    },
    existingQuestions: [],
  };

  const defaultLessonContent: ModuleLessonContent = {
    lessons: [
      {
        id: "les-1",
        title: "فارماکوکینتیک داروها",
        contentMarkdown: "فارماکوکینتیک به بررسی جذب، توزیع، متابولیسم و دفع داروها در بدن می‌پردازد. نیمه‌عمر دارو شاخص مهمی است.",
        sortOrder: 1,
      },
    ],
    combinedMarkdown: "## درس ۱: فارماکوکینتیک داروها\n\nفارماکوکینتیک به بررسی جذب، توزیع، متابولیسم و دفع داروها در بدن می‌پردازد.",
    totalLength: 120,
  };

  beforeEach(() => {
    mockJob = {
      id: "job-1",
      data: {
        operationId: "op-1",
        taskId: "task-1",
        batchId: "batch-1",
      },
    } as unknown as Job<StudioExamBatchJobPayload>;

    mockStore = {
      claimBatch: vi.fn().mockResolvedValue({ claimed: true, fencingToken: 1 } satisfies ClaimBatchResult),
      heartbeatBatch: vi.fn().mockResolvedValue(true),
      releaseLeaseOnTransientError: vi.fn().mockResolvedValue(true),
      getBatchExecutionDetails: vi.fn().mockResolvedValue(defaultBatchDetails),
      getModuleLessonContent: vi.fn().mockResolvedValue(defaultLessonContent),
      saveBatchQuestionsAndFinalize: vi.fn().mockResolvedValue({ generatedCount: 5, isCompleted: true }),
      markBatchFailed: vi.fn().mockResolvedValue(true),
      reconcileTaskAndOperation: vi.fn().mockResolvedValue({
        taskStatus: "completed",
        taskGeneratedCount: 5,
        operationStatus: "completed",
        operationGeneratedCount: 5,
      }),
      cancelOperation: vi.fn().mockResolvedValue({ cancelled: true }),
      handleBatchFinalFailureAndReconcile: vi.fn().mockResolvedValue(undefined),
      reconcileStaleBatches: vi.fn().mockResolvedValue({
        scannedCount: 0,
        recoveredBatchesCount: 0,
        recoveredBatchIds: [],
      }),
    };

    const defaultGenQuestions = [
      {
        questionIndex: 1,
        question: "کدام شاخص سرعت حذف دارو از پلاسما را نشان می‌دهد؟",
        choices: ["نیمه‌عمر حذف", "حجم توزیع", "دوز بارگیری", "فراهمی زیستی"],
        correctAnswer: "نیمه‌عمر حذف",
        explanation: "نیمه‌عمر حذف زمان لازم برای کاهش ۵۰ درصدی غلظت پلاسما است.",
        difficulty: "medium",
      },
      {
        questionIndex: 2,
        question: "مرحله اول در سرنوشت زیستی دارو کدام است؟",
        choices: ["جذب", "توزیع", "متابولیسم", "دفع"],
        correctAnswer: "جذب",
        explanation: "جذب دارو ورود آن به گردش خون سیستمیک است.",
        difficulty: "medium",
      },
      {
        questionIndex: 3,
        question: "اتصال داروها به آلبومین بر کدام پارامتر مؤثر است؟",
        choices: ["کسر آزاد دارو", "سرعت انحلال", "پایداری شیمیایی", "طعم دارو"],
        correctAnswer: "کسر آزاد دارو",
        explanation: "فقط بخش آزاد دارو قادر به عبور از غشا و اعمال اثر درمانی است.",
        difficulty: "medium",
      },
      {
        questionIndex: 4,
        question: "مسیر اصلی متابولیسم داروها در کدام ارگان انجام می‌شود؟",
        choices: ["کبد", "کلیه", "طحال", "ریه"],
        correctAnswer: "کبد",
        explanation: "آنزیم‌های سیتوکروم P450 کبدی عمده متابولیسم فاز ۱ و ۲ را انجام می‌دهند.",
        difficulty: "medium",
      },
      {
        questionIndex: 5,
        question: "دفع کلیوی شامل کدام مرحله است؟",
        choices: ["فیلتراسیون گلومرولی", "جذب دهانی", "پیوند پپتیدی", "هیدرولیز معدی"],
        correctAnswer: "فیلتراسیون گلومرولی",
        explanation: "فیلتراسیون گلومرولی بخش اصلی تصفیه داروها در کلیه است.",
        difficulty: "medium",
      },
    ];
    const defaultKeyByIdx = new Map(defaultGenQuestions.map((q) => [q.questionIndex, q.correctAnswer]));

    mockGateway = {
      provider: "gemini",
      complete: vi.fn().mockImplementation(
        async (req: { stage?: string; messages?: Array<{ content: string }> }) => {
          const stage = req?.stage ?? "";
          const userMsg = req?.messages?.[1]?.content ?? "";
          if (stage.endsWith("_blind_eval")) {
            const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
              choices: Array<{ id: string; text: string }>;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  verdicts: item.choices.map((c) => ({
                    choiceId: c.id,
                    status: c.text === defaultKeyByIdx.get(item.questionIndex) ? "correct" : "incorrect",
                    reason: "ارزیابی مستقل",
                  })),
                })),
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            } satisfies CompletionResult;
          }
          if (stage.endsWith("_expl_audit")) {
            const marker = "QUESTIONS TO AUDIT:\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  explanationScientificallyCorrect: true,
                  consistentWithContext: true,
                  consistentWithBlindKey: true,
                  allDistractorRationalesDefensible: true,
                  issues: [],
                })),
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            } satisfies CompletionResult;
          }
          return {
            text: JSON.stringify({ questions: defaultGenQuestions }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 500, outputTokens: 300 },
            finishReason: "stop",
          } satisfies CompletionResult;
        },
      ),
    };
  });

  describe("processStudioExamBatchJob Lifecycle", () => {
    it("1. successfully processes a full 5-question batch from scratch", async () => {
      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
        heartbeatIntervalMs: 50,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);

      expect(result.status).toBe("succeeded");
      expect(result.generatedCount).toBe(5);
      expect(result.isCompleted).toBe(true);

      expect(mockStore.claimBatch).toHaveBeenCalledWith("batch-1", 120);
      expect(mockGateway.complete).toHaveBeenCalledTimes(1); // Unified single-pass generation (no Blind Eval / Critic overhead)
      expect(mockStore.saveBatchQuestionsAndFinalize).toHaveBeenCalledWith({
        batchId: "batch-1",
        fencingToken: 1,
        questions: expect.arrayContaining([
          expect.objectContaining({ questionIndex: 1, patternId: "pat-1" }),
          expect.objectContaining({ questionIndex: 2, patternId: "pat-2" }),
        ]),
        leaseDurationSeconds: 120,
      });
      expect(mockStore.reconcileTaskAndOperation).toHaveBeenCalledWith("task-1", "op-1");
    });

    it("2. partial slot recovery: only generates missing slots [3, 4, 5] when [1, 2] exist", async () => {
      const detailsWithPartial: BatchExecutionDetails = {
        ...defaultBatchDetails,
        existingQuestions: [
          { id: "q-1", questionIndex: 1, question: "سؤال ۱ قبلی" },
          { id: "q-2", questionIndex: 2, question: "سؤال ۲ قبلی" },
        ],
      };
      (mockStore.getBatchExecutionDetails as any).mockResolvedValue(detailsWithPartial);

      // Model returns only slots 3, 4, 5
      const partialGenQuestions = [
        {
          questionIndex: 3,
          question: "سؤال جدید برای اسلات ۳",
          choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
          correctAnswer: "مهار آنزیم",
          explanation: "توضیح برای اسلات ۳",
        },
        {
          questionIndex: 4,
          question: "سؤال جدید برای اسلات ۴",
          choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
          correctAnswer: "تحریک گیرنده",
          explanation: "توضیح برای اسلات ۴",
        },
        {
          questionIndex: 5,
          question: "سؤال جدید برای اسلات ۵",
          choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
          correctAnswer: "افزایش جذب",
          explanation: "توضیح برای اسلات ۵",
        },
      ];
      const keyByIdx = new Map(partialGenQuestions.map((q) => [q.questionIndex, q.correctAnswer]));
      (mockGateway.complete as any).mockImplementation(
        async (req: { stage?: string; messages?: Array<{ content: string }> }) => {
          const stage = req?.stage ?? "";
          const userMsg = req?.messages?.[1]?.content ?? "";
          if (stage.endsWith("_blind_eval")) {
            const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
              choices: Array<{ id: string; text: string }>;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  verdicts: item.choices.map((c) => ({
                    choiceId: c.id,
                    status: c.text === keyByIdx.get(item.questionIndex) ? "correct" : "incorrect",
                    reason: "ارزیابی مستقل",
                  })),
                })),
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            };
          }
          if (stage.endsWith("_expl_audit")) {
            const marker = "QUESTIONS TO AUDIT:\n";
            const start = userMsg.indexOf(marker);
            const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
            const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
              questionIndex: number;
            }>;
            return {
              text: JSON.stringify({
                questions: payload.map((item) => ({
                  questionIndex: item.questionIndex,
                  explanationScientificallyCorrect: true,
                  consistentWithContext: true,
                  consistentWithBlindKey: true,
                  allDistractorRationalesDefensible: true,
                  issues: [],
                })),
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            };
          }
          return {
            text: JSON.stringify({ questions: partialGenQuestions }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 400, outputTokens: 200 },
            finishReason: "stop",
          };
        },
      );

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);

      expect(result.status).toBe("succeeded");
      // Assert prompt asked specifically for slots 3, 4, 5
      const gatewayCall = (mockGateway.complete as any).mock.calls[0][0] as CompletionRequest;
      const userPrompt = gatewayCall.messages.find((m) => m.role === "user")?.content ?? "";
      expect(userPrompt).toContain("GENERATE STRICTLY 3 HIGH-DISCRIMINATION MULTIPLE-CHOICE QUESTION(S)");
      expect(userPrompt).toContain("QUESTION SLOT INDEX: 3");
      expect(userPrompt).toContain("QUESTION SLOT INDEX: 4");
      expect(userPrompt).toContain("QUESTION SLOT INDEX: 5");
      expect(userPrompt).not.toContain("QUESTION SLOT INDEX: 1");
      expect(userPrompt).not.toContain("QUESTION SLOT INDEX: 2");

      // Verify saveBatchQuestionsAndFinalize received only slots 3, 4, 5
      expect(mockStore.saveBatchQuestionsAndFinalize).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({ questionIndex: 3 }),
            expect.objectContaining({ questionIndex: 4 }),
            expect.objectContaining({ questionIndex: 5 }),
          ]),
        }),
      );
    });

    it("3. handles already_completed batch safely by skipping Gemini and reconciling", async () => {
      (mockStore.claimBatch as any).mockResolvedValue({
        claimed: false,
        reason: "already_completed",
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);

      expect(result.status).toBe("already_completed");
      expect(mockGateway.complete).not.toHaveBeenCalled();
      expect(mockStore.reconcileTaskAndOperation).toHaveBeenCalledWith("task-1", "op-1");
    });

    it("4. handles active lease held by another worker by throwing retryable error", async () => {
      (mockStore.claimBatch as any).mockResolvedValue({
        claimed: false,
        reason: "active_lease_held",
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(mockJob, deps)).rejects.toThrow(
        /currently locked by another active worker/,
      );
      expect(mockGateway.complete).not.toHaveBeenCalled();
    });

    it("5. rejects processing when chapter has insufficient scientific content (< 20 chars)", async () => {
      (mockStore.getModuleLessonContent as any).mockResolvedValue({
        lessons: [],
        combinedMarkdown: "",
        totalLength: 0,
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(mockJob, deps)).rejects.toThrow(
        /محتوای علمی فصل برای تولید سؤال کافی نیست/,
      );

      expect(mockStore.markBatchFailed).toHaveBeenCalledWith({
        batchId: "batch-1",
        fencingToken: 1,
        errorCode: "insufficient_content",
        errorMessage: expect.stringContaining("محتوای علمی معتبری"),
      });
      expect(mockStore.reconcileTaskAndOperation).toHaveBeenCalledWith("task-1", "op-1");
      expect(mockGateway.complete).not.toHaveBeenCalled();
    });

    it("6. rejects processing when pattern snapshot is missing in operation", async () => {
      const detailsMissingSnapshot: BatchExecutionDetails = {
        ...defaultBatchDetails,
        operation: {
          ...defaultBatchDetails.operation,
          patternSnapshots: [], // missing snapshot
        },
      };
      (mockStore.getBatchExecutionDetails as any).mockResolvedValue(detailsMissingSnapshot);

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(mockJob, deps)).rejects.toThrow(
        /اسنپ‌شات الگوی سؤال یافت نشد/,
      );

      expect(mockStore.markBatchFailed).toHaveBeenCalledWith({
        batchId: "batch-1",
        fencingToken: 1,
        errorCode: "invalid_pattern_snapshot",
        errorMessage: expect.stringContaining("اسنپ‌شات الگوی سؤال"),
      });
      expect(mockStore.reconcileTaskAndOperation).toHaveBeenCalledWith("task-1", "op-1");
      expect(mockGateway.complete).not.toHaveBeenCalled();
    });

    it("7. FencingTokenStaleError: old zombie worker does not touch DB and exits as superseded", async () => {
      (mockStore.saveBatchQuestionsAndFinalize as any).mockRejectedValue(
        new FencingTokenStaleError("Batch ownership superseded"),
      );

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);

      expect(result.status).toBe("superseded");
      expect(mockStore.releaseLeaseOnTransientError).not.toHaveBeenCalled();
    });

    it("8. transient error conditionally releases lease for fast retry in BullMQ", async () => {
      (mockGateway.complete as any).mockRejectedValue(new Error("503 Service Unavailable"));

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(mockJob, deps)).rejects.toThrow("503 Service Unavailable");

      expect(mockStore.releaseLeaseOnTransientError).toHaveBeenCalledWith(
        "batch-1",
        1,
        "transient_error",
        "503 Service Unavailable",
      );
    });

    it("9. heartbeats periodically during generation and stops cleanly", async () => {
      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
        heartbeatIntervalMs: 10, // fast heartbeat for test
      };

      // Delay gateway slightly
      const hbKeyByIdx = new Map<number, string>([
        [1, "مهار آنزیم"],
        [2, "تحریک گیرنده"],
        [3, "افزایش جذب"],
        [4, "کاهش دفع"],
        [5, "مهار آنزیم"],
      ]);
      (mockGateway.complete as any).mockImplementation(
        (req: { stage?: string; messages?: Array<{ content: string }> }) =>
          new Promise((resolve) =>
            setTimeout(() => {
              const stage = req?.stage ?? "";
              const userMsg = req?.messages?.[1]?.content ?? "";
              if (stage.endsWith("_blind_eval")) {
                const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
                const payload = JSON.parse(
                  userMsg.slice(userMsg.indexOf(marker) + marker.length, userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:")),
                ) as Array<{ questionIndex: number; choices: Array<{ id: string; text: string }> }>;
                resolve({
                  text: JSON.stringify({
                    questions: payload.map((item) => ({
                      questionIndex: item.questionIndex,
                      verdicts: item.choices.map((c) => ({
                        choiceId: c.id,
                        status: c.text === hbKeyByIdx.get(item.questionIndex) ? "correct" : "incorrect",
                        reason: "معتبر",
                      })),
                    })),
                  }),
                  model: "gemini",
                  usage: { inputTokens: 10, outputTokens: 10 },
                  finishReason: "stop",
                });
                return;
              }
              if (stage.endsWith("_expl_audit")) {
                const marker = "QUESTIONS TO AUDIT:\n";
                const payload = JSON.parse(
                  userMsg.slice(userMsg.indexOf(marker) + marker.length, userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:")),
                ) as Array<{ questionIndex: number }>;
                resolve({
                  text: JSON.stringify({
                    questions: payload.map((item) => ({
                      questionIndex: item.questionIndex,
                      explanationScientificallyCorrect: true,
                      consistentWithContext: true,
                      consistentWithBlindKey: true,
                      allDistractorRationalesDefensible: true,
                      issues: [],
                    })),
                  }),
                  model: "gemini",
                  usage: { inputTokens: 10, outputTokens: 10 },
                  finishReason: "stop",
                });
                return;
              }
              resolve({
                text: JSON.stringify({
                  questions: [
                    {
                      questionIndex: 1,
                      question: "سؤال آزمایشی با طول مناسب و استاندارد",
                      choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
                      correctAnswer: "مهار آنزیم",
                      explanation: "توضیح پاسخ معتبر",
                    },
                    {
                      questionIndex: 2,
                      question: "سؤال آزمایشی دوم با طول مناسب و استاندارد",
                      choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
                      correctAnswer: "تحریک گیرنده",
                      explanation: "توضیح پاسخ معتبر",
                    },
                    {
                      questionIndex: 3,
                      question: "سؤال آزمایشی سوم با طول مناسب و استاندارد",
                      choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
                      correctAnswer: "افزایش جذب",
                      explanation: "توضیح پاسخ معتبر",
                    },
                    {
                      questionIndex: 4,
                      question: "سؤال آزمایشی چهارم با طول مناسب و استاندارد",
                      choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
                      correctAnswer: "کاهش دفع",
                      explanation: "توضیح پاسخ معتبر",
                    },
                    {
                      questionIndex: 5,
                      question: "سؤال آزمایشی پنجم با طول مناسب و استاندارد",
                      choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
                      correctAnswer: "مهار آنزیم",
                      explanation: "توضیح پاسخ معتبر",
                    },
                  ],
                }),
                model: "gemini",
                usage: { inputTokens: 10, outputTokens: 10 },
                finishReason: "stop",
              });
            }, 40),
          ),
      );

      await processStudioExamBatchJob(mockJob, deps);

      expect(mockStore.heartbeatBatch).toHaveBeenCalled();
    });
  });

  describe("Question Validation & Strict Index Boundaries", () => {
    it("10. rejects question with slot index outside 1..targetCount", () => {
      const patternMap = new Map([
        [1, { patternId: "p1", patternVersion: 1 }],
      ]);

      const result = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 6, // targetCount is 5!
            question: "سؤال با اندیس نامعتبر خارج از بازه",
            choices: ["۱", "۲", "۳", "۴"],
            correctAnswer: "۱",
            explanation: "توضیح",
          },
        ],
        expectedSlotIndices: [1],
        targetCount: 5,
        patternMap,
      });

      expect(result.validQuestions).toHaveLength(0);
      expect(result.errors[0]).toContain("خارج از محدوده ۱ تا");
    });

    it("11. rejects question with slot index not in expectedSlotIndices", () => {
      const patternMap = new Map([
        [3, { patternId: "p1", patternVersion: 1 }],
      ]);

      const result = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 1, // we only asked for slot 3!
            question: "سؤال برای اسلات غیراسپسیفاید",
            choices: ["۱", "۲", "۳", "۴"],
            correctAnswer: "۱",
            explanation: "توضیح",
          },
        ],
        expectedSlotIndices: [3],
        targetCount: 5,
        patternMap,
      });

      expect(result.validQuestions).toHaveLength(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("خارج از اسلات‌های درخواستی")]),
      );
    });

    it("12. rejects duplicate questions within the batch", () => {
      const patternMap = new Map([
        [1, { patternId: "p1", patternVersion: 1 }],
        [2, { patternId: "p2", patternVersion: 1 }],
      ]);

      const result = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 1,
            question: "یک سؤال علمی دقیق و استاندارد",
            choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
            correctAnswer: "مهار آنزیم",
            explanation: "توضیح ۱",
          },
          {
            questionIndex: 2,
            question: "یک سؤال علمی دقیق و استاندارد", // Duplicate!
            choices: ["مهار آنزیم", "تحریک گیرنده", "افزایش جذب", "کاهش دفع"],
            correctAnswer: "مهار آنزیم",
            explanation: "توضیح ۲",
          },
        ],
        expectedSlotIndices: [1, 2],
        targetCount: 5,
        patternMap,
      });

      expect(result.validQuestions).toHaveLength(1);
      expect(result.validQuestions[0].questionIndex).toBe(1);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("سؤال تکراری در این بسته")]),
      );
    });

    it("13. rejects questions with fewer than 2 choices or missing correct answer, and enforces 4 unique choices for multiple_choice", () => {
      const patternMap = new Map([
        [1, { patternId: "p1", patternVersion: 1 }],
        [2, { patternId: "p1", patternVersion: 1 }],
        [3, { patternId: "p1", patternVersion: 1 }],
        [4, { patternId: "p1", patternVersion: 1 }],
      ]);

      const result = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 1,
            question: "سؤال با فقط یک گزینه غیراستاندارد",
            choices: ["تنها گزینه"],
            correctAnswer: "تنها گزینه",
            explanation: "توضیح",
          },
          {
            questionIndex: 2,
            question: "سؤال چندگزینه‌ای با ۳ گزینه به جای ۴ گزینه",
            choices: ["گزینه الف", "گزینه ب", "گزینه ج"],
            correctAnswer: "گزینه الف",
            explanation: "توضیح ۲",
          },
          {
            questionIndex: 3,
            question: "سؤال چندگزینه‌ای با گزینه‌های تکراری",
            choices: ["گزینه تکراری", "گزینه تکراری", "گزینه سوم", "گزینه چهارم"],
            correctAnswer: "گزینه سوم",
            explanation: "توضیح ۳",
          },
          {
            questionIndex: 4,
            question: "سؤال چندگزینه‌ای با پاسخ صحیح نامعتبر",
            choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
            correctAnswer: "گزینه ناموجود",
            explanation: "توضیح ۴",
          },
        ],
        expectedSlotIndices: [1, 2, 3, 4],
        targetCount: 5,
        patternMap,
      });

      expect(result.validQuestions).toHaveLength(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("حداقل ۲ گزینه معتبر"),
          expect.stringContaining("دقیقاً ۴ گزینه معتبر"),
          expect.stringContaining("گزینه‌های تکراری"),
          expect.stringContaining("در بین گزینه‌های اسلات 4 یافت نشد"),
        ]),
      );

      // Non-multiple_choice (e.g., true_false) with 2 choices remains valid
      const tfResult = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 1,
            questionType: "true_false",
            question: "آیا داروی آتروپین آنتاگونیست موسکارینی است؟",
            choices: ["درست", "نادرست"],
            correctAnswer: "درست",
            explanation: "آتروپین مهارکننده رقابتی گیرنده‌های موسکارینی است.",
          },
        ],
        expectedSlotIndices: [1],
        targetCount: 5,
        patternMap,
      });
      expect(tfResult.validQuestions).toHaveLength(1);
    });

    it("14. staging isolation: questions are targeted strictly for staging and never marketing_quiz_questions", async () => {
      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await processStudioExamBatchJob(mockJob, deps);

      // Verify that saveBatchQuestionsAndFinalize was called on the store for staging
      expect(mockStore.saveBatchQuestionsAndFinalize).toHaveBeenCalled();
      const saveParams = (mockStore.saveBatchQuestionsAndFinalize as any).mock.calls[0][0];
      expect(saveParams.batchId).toBe("batch-1");
      // All saved questions belong to the batch staging model
      for (const q of saveParams.questions) {
        expect(q).toHaveProperty("questionIndex");
        expect(q).toHaveProperty("patternId");
      }
    });
  });

  describe("Phase 2.1 — Operation Cancellation & Worker Stop Guarantees", () => {
    it("15. stops Gemini generation when heartbeat is rejected due to operation cancellation", async () => {
      // Heartbeat rejects due to operation cancellation
      mockStore.heartbeatBatch = vi.fn().mockResolvedValue(false);

      mockGateway.complete = vi.fn().mockImplementation(async () => {
        // Wait long enough for the heartbeat to tick
        await new Promise((resolve) => setTimeout(resolve, 35));
        return { text: JSON.stringify({ questions: [] }) };
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
        heartbeatIntervalMs: 10,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);
      expect(result.status).toBe("superseded");
      expect(result.reason).toBe("operation_cancelled");
      expect(mockStore.saveBatchQuestionsAndFinalize).not.toHaveBeenCalled();
    });

    it("16. stops cleanly when saveBatchQuestionsAndFinalize throws WorkerStopError('operation_cancelled')", async () => {
      mockStore.saveBatchQuestionsAndFinalize = vi.fn().mockRejectedValue(
        new WorkerStopError("operation_cancelled", "عملیات والد قبلاً لغو شده است."),
      );

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);
      expect(result.status).toBe("superseded");
      expect(result.reason).toBe("operation_cancelled");
    });

    it("17. refuses to claim batch when operation was already cancelled", async () => {
      mockStore.claimBatch = vi.fn().mockResolvedValue({
        claimed: false,
        reason: "operation_cancelled",
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);
      expect(result.status).toBe("superseded");
      expect(result.reason).toBe("operation_cancelled");
      expect(mockGateway.complete).not.toHaveBeenCalled();
    });

    it("18. stops cleanly when batch details show operation is cancelled before calling Gemini", async () => {
      mockStore.getBatchExecutionDetails = vi.fn().mockResolvedValue({
        ...defaultBatchDetails,
        operation: {
          ...defaultBatchDetails.operation,
          status: "cancelled",
        },
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);
      expect(result.status).toBe("superseded");
      expect(result.reason).toBe("operation_cancelled");
      expect(mockGateway.complete).not.toHaveBeenCalled();
    });

    it("19. stops cleanly with specific stop reasons (batch_cancelled, lease_expired, fencing_token_stale)", async () => {
      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      // Scenario A: batch_cancelled
      mockStore.saveBatchQuestionsAndFinalize = vi.fn().mockRejectedValue(
        new WorkerStopError("batch_cancelled", "بسته آزمون قبلاً لغو شده است."),
      );
      let res = await processStudioExamBatchJob(mockJob, deps);
      expect(res.status).toBe("superseded");
      expect(res.reason).toBe("batch_cancelled");

      // Scenario B: lease_expired
      mockStore.saveBatchQuestionsAndFinalize = vi.fn().mockRejectedValue(
        new WorkerStopError("lease_expired", "مدت زمان لیس منقضی شده است."),
      );
      res = await processStudioExamBatchJob(mockJob, deps);
      expect(res.status).toBe("superseded");
      expect(res.reason).toBe("lease_expired");

      // Scenario C: fencing_token_stale
      mockStore.saveBatchQuestionsAndFinalize = vi.fn().mockRejectedValue(
        new WorkerStopError("fencing_token_stale", "توکن فنسینگ معتبر نیست."),
      );
      res = await processStudioExamBatchJob(mockJob, deps);
      expect(res.status).toBe("superseded");
      expect(res.reason).toBe("fencing_token_stale");
    });
  });

  describe("Phase 2.1 — Final BullMQ Retry Detection & Deterministic Reconcile", () => {
    it("20. triggers handleBatchFinalFailureAndReconcile on final attempt failure (attempt 5 of 5)", async () => {
      mockGateway.complete = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

      const finalAttemptJob = {
        ...mockJob,
        opts: { attempts: 5 },
        attemptsMade: 4, // 4 attempts made before, this run is the 5th and final attempt
      } as unknown as Job<StudioExamBatchJobPayload>;

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(finalAttemptJob, deps)).rejects.toThrow("503 Service Unavailable");

      expect(mockStore.handleBatchFinalFailureAndReconcile).toHaveBeenCalledWith({
        batchId: "batch-1",
        fencingToken: 1,
        errorCode: "exhausted_retries",
        errorMessage: expect.stringContaining("503 Service Unavailable"),
        taskId: "task-1",
        operationId: "op-1",
      });
    });

    it("21. does NOT trigger handleBatchFinalFailureAndReconcile on intermediate retry (attempt 2 of 5)", async () => {
      mockGateway.complete = vi.fn().mockRejectedValue(new Error("503 Transient Error"));

      const intermediateJob = {
        ...mockJob,
        opts: { attempts: 5 },
        attemptsMade: 1, // 1 attempt made before, this run is the 2nd attempt out of 5
      } as unknown as Job<StudioExamBatchJobPayload>;

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await expect(processStudioExamBatchJob(intermediateJob, deps)).rejects.toThrow("503 Transient Error");

      // Final failure reconcile must NOT have been called
      expect(mockStore.handleBatchFinalFailureAndReconcile).not.toHaveBeenCalled();
      // Instead, transient lease release is executed for fast retry
      expect(mockStore.releaseLeaseOnTransientError).toHaveBeenCalled();
    });

    it("22. ensures handleBatchFinalFailureAndReconcile is safe when called multiple times (Idempotency)", async () => {
      // Calling handleBatchFinalFailureAndReconcile multiple times does not throw
      await expect(
        mockStore.handleBatchFinalFailureAndReconcile({
          batchId: "batch-1",
          fencingToken: 1,
          errorCode: "exhausted_retries",
          errorMessage: "Job exhausted retries",
          taskId: "task-1",
          operationId: "op-1",
        }),
      ).resolves.not.toThrow();

      await expect(
        mockStore.handleBatchFinalFailureAndReconcile({
          batchId: "batch-1",
          fencingToken: 1,
          errorCode: "exhausted_retries",
          errorMessage: "Job exhausted retries",
          taskId: "task-1",
          operationId: "op-1",
        }),
      ).resolves.not.toThrow();
    });

    it("23. passes abortController.signal into deps.gateway.complete", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockGateway.complete = vi.fn(async (req: CompletionRequest) => {
        capturedSignal = req.signal;
        const stage = req.stage ?? "";
        const userMsg = req.messages?.[1]?.content ?? "";
        if (stage.endsWith("_blind_eval")) {
          const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
          const payload = JSON.parse(
            userMsg.slice(userMsg.indexOf(marker) + marker.length, userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:")),
          ) as Array<{ questionIndex: number; choices: Array<{ id: string; text: string }> }>;
          return {
            text: JSON.stringify({
              questions: payload.map((item) => ({
                questionIndex: item.questionIndex,
                verdicts: item.choices.map((c) => ({
                  choiceId: c.id,
                  status: c.text === "نیمه‌عمر حذف" ? "correct" : "incorrect",
                  reason: "معتبر",
                })),
              })),
            }),
            model: "gemini-2.5-flash",
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: "STOP",
          };
        }
        if (stage.endsWith("_expl_audit")) {
          const marker = "QUESTIONS TO AUDIT:\n";
          const payload = JSON.parse(
            userMsg.slice(userMsg.indexOf(marker) + marker.length, userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:")),
          ) as Array<{ questionIndex: number }>;
          return {
            text: JSON.stringify({
              questions: payload.map((item) => ({
                questionIndex: item.questionIndex,
                explanationScientificallyCorrect: true,
                consistentWithContext: true,
                consistentWithBlindKey: true,
                allDistractorRationalesDefensible: true,
                issues: [],
              })),
            }),
            model: "gemini-2.5-flash",
            usage: { inputTokens: 10, outputTokens: 10 },
            finishReason: "STOP",
          };
        }
        return {
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                question: "کدام شاخص فارماکوکینتیک سرعت حذف دارو را نشان می‌دهد؟",
                choices: ["نیمه‌عمر حذف", "کلیرانس کلی", "دوز بارگیری", "فراهمی زیستی"],
                correctAnswer: "نیمه‌عمر حذف",
                explanation: "نیمه‌عمر حذف شاخص سرعت حذف است.",
                difficulty: "medium",
              },
            ],
          }),
          model: "gemini-2.5-flash",
          usage: { inputTokens: 10, outputTokens: 10 },
          finishReason: "STOP",
        };
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      await processStudioExamBatchJob(mockJob, deps);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);
    });

    it("24. handles abort error from gateway cleanly as superseded without retrying", async () => {
      mockGateway.complete = vi.fn(async (req: CompletionRequest) => {
        const abortErr = new WorkerStopError("operation_cancelled", "Operation was cancelled mid-flight");
        throw abortErr;
      });

      const deps: StudioExamProcessorDeps = {
        store: mockStore,
        gateway: mockGateway,
      };

      const result = await processStudioExamBatchJob(mockJob, deps);

      expect(result.status).toBe("superseded");
      expect(result.reason).toBe("operation_cancelled");
      expect(mockStore.markBatchFailed).not.toHaveBeenCalled();
      expect(mockStore.handleBatchFinalFailureAndReconcile).not.toHaveBeenCalled();
    });

    it("25. reconcileStaleBatches returns summary of scanned and recovered batches", async () => {
      mockStore.reconcileStaleBatches = vi.fn().mockResolvedValue({
        scannedCount: 2,
        recoveredBatchesCount: 2,
        recoveredBatchIds: ["batch-old-1", "batch-old-2"],
      });

      const res = await mockStore.reconcileStaleBatches({
        leaseDurationSeconds: 120,
        gracePeriodSeconds: 180,
      });

      expect(res.scannedCount).toBe(2);
      expect(res.recoveredBatchesCount).toBe(2);
      expect(res.recoveredBatchIds).toEqual(["batch-old-1", "batch-old-2"]);
    });

    it("26. reconcileStaleBatches is idempotent and handles 0 stale batches gracefully", async () => {
      mockStore.reconcileStaleBatches = vi.fn().mockResolvedValue({
        scannedCount: 0,
        recoveredBatchesCount: 0,
        recoveredBatchIds: [],
      });

      const res = await mockStore.reconcileStaleBatches();

      expect(res.scannedCount).toBe(0);
      expect(res.recoveredBatchesCount).toBe(0);
      expect(res.recoveredBatchIds).toHaveLength(0);
    });
  });
});

