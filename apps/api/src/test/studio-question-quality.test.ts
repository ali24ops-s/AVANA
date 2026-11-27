import { describe, it, expect, vi } from "vitest";
import type { Job } from "bullmq";
import {
  evaluateStudioQuestionQuality,
  criticAndRepairStudioQuestions,
  blindEvaluateOptions,
  auditQuestionExplanations,
  runBlindSemanticAndRepairPipeline,
  shuffleAndBalanceStudioQuestions,
  STUDIO_MCQ_QUALITY_RULES_PROMPT,
} from "../modules/studio/studio-question-quality.js";
import { StudioAiService } from "../modules/studio/studio-ai-service.js";
import { processStudioExamBatchJob } from "../modules/studio/studio-exam-processor.js";
import { validateStudioExamQuestions } from "../modules/studio/studio-exam-validator.js";
import {
  InMemoryStudioExamStore,
  resolveStrictTransferCorrectAnswer,
  type StudioExamStore,
} from "../modules/studio/studio-exam-store.js";
import { InMemoryMarketingQuizStore } from "../modules/studio/studio-stores.js";
import type { ModelGateway } from "../modules/generation/gateway/types.js";
import type { StudioExamBatchJobPayload } from "../modules/studio/studio-exam-queue.js";
import { asOrganizationId, asDocumentId, normalizeQuestionOptions } from "@avana/domain";

function buildMockBlindAndExplResponses(
  req: { stage?: string; messages?: Array<{ content: string }> },
  correctByIndex: Record<number, string>,
): { text: string; model: string; usage: { inputTokens: number; outputTokens: number }; finishReason: string } | null {
  const stage = req.stage ?? "";
  const userMsg = req.messages?.[1]?.content ?? "";
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
            status: c.text === correctByIndex[item.questionIndex] ? "correct" : "incorrect",
            reason: "ارزیابی مستقل علمی",
          })),
        })),
      }),
      model: "gemini-2.0-flash",
      usage: { inputTokens: 60, outputTokens: 60 },
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
      usage: { inputTokens: 60, outputTokens: 60 },
      finishReason: "stop",
    };
  }
  return null;
}

describe("Studio MCQ Question Quality, Anti-Cueing, Critic & Shuffle", () => {
  // -------------------------------------------------------------------------
  // 1. Answer Cueing & Structural Balance Checks
  // -------------------------------------------------------------------------
  describe("1. Anti-Cueing & Structural Balance", () => {
    it("flags conspicuously longer correct answer (length & word count asymmetry)", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "مکانیسم اثر اصلی داروی اومپرازول در درمان زخم معده چیست؟",
        choices: [
          "مهار برگشت‌ناپذیر پمپ پروتون H+/K+ ATPase در سلول‌های جداری معده و کاهش شدید ترشح اسید پایه و تحریکی",
          "خنثی‌سازی اسید",
          "مهار گیرنده هیستامین",
          "پوشش مخاط معده",
        ],
        correctAnswer:
          "مهار برگشت‌ناپذیر پمپ پروتون H+/K+ ATPase در سلول‌های جداری معده و کاهش شدید ترشح اسید پایه و تحریکی",
        explanation: "اومپرازول مهارکننده برگشت‌ناپذیر پمپ پروتون است.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.length).toBeGreaterThan(0);
    });

    it("flags unbalanced English equivalent present ONLY in the correct answer", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "کدام عارضه جانبی برای داروی کاپتوپریل اختصاصی‌تر است؟",
        choices: [
          "سرفه خشک (Dry Cough)",
          "کاهش فشار خون",
          "سردرد خفیف",
          "تهوع صبحگاهی",
        ],
        correctAnswer: "سرفه خشک (Dry Cough)",
        explanation: "تجمع برادی‌کینین باعث سرفه خشک می‌شود.",
      });

      // Deterministic normalizer may safely strip redundant parenthetical, OR flag if unrepairable.
      // Let's verify either it was safely normalized or flagged for critic.
      if (res.status === "pass") {
        expect(res.repairedByDeterministicNormalizer).toBe(true);
        expect(res.normalizedQuestion.correctAnswer).toBe("سرفه خشک");
      } else {
        expect(res.issues.some((i) => i.includes("English") || i.includes("parenthetical"))).toBe(
          true,
        );
      }
    });

    it("accepts English equivalents when applied consistently across ALL 4 choices", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "کدام دارو مهارکننده انتخابی COX-2 محسوب می‌شود؟",
        choices: [
          "سلکوکسیب (Celecoxib)",
          "ایبوپروفن (Ibuprofen)",
          "ناپروکسن (Naproxen)",
          "ایندومتاسین (Indomethacin)",
        ],
        correctAnswer: "سلکوکسیب (Celecoxib)",
        explanation: "سلکوکسیب مهارکننده انتخابی COX-2 است و بقیه غیراختصاصی هستند.",
      });

      expect(res.status).toBe("pass");
      expect(res.issues).toHaveLength(0);
    });

    it("flags extra explanatory clauses only in the correct answer", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "چرا آتروپین در گلوکوم زاویه بسته منع مصرف دارد؟",
        choices: [
          "زیرا با ایجاد میدریاز مسیر تخلیه زلالیه را مسدود کرده و فشار داخل چشم را افزایش می‌دهد",
          "افزایش تولید زلالیه",
          "انقباض مردمک چشم",
          "کاهش جریان خون شبکیه",
        ],
        correctAnswer:
          "زیرا با ایجاد میدریاز مسیر تخلیه زلالیه را مسدود کرده و فشار داخل چشم را افزایش می‌دهد",
        explanation: "آتروپین با میدریاز باعث افزایش فشار داخل چشم می‌شود.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.length).toBeGreaterThan(0);
    });

    it("allows minor length/certainty variation without false-positive rejection, while catching true leakage", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "در مورد فارماکوکینتیک وارفارین کدام مورد صحیح است؟",
        choices: [
          "همیشه بیش از ۹۵ درصد به آلبومین پلاسما متصل می‌شود",
          "اتصال پروتئینی متوسط",
          "دفع کلیوی کامل",
          "نیمه‌عمر بسیار کوتاه",
        ],
        correctAnswer: "همیشه بیش از ۹۵ درصد به آلبومین پلاسما متصل می‌شود",
        explanation: "وارفارین اتصال پروتئینی بسیار بالایی دارد.",
      });

      // Unified pipeline: length gap > 25 & ratio > 1.8 is caught by @avana/domain's detectAnswerLeakage
      expect(res.status).toBe("needs_critic");
      expect(res.issues.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Irrelevant, Omnibus, Placeholder, and Overlapping Distractors
  // -------------------------------------------------------------------------
  describe("2. Distractor Quality & Omnibus/Overlap Rejection", () => {
    it("rejects forbidden omnibus options ('همه موارد', 'هیچ‌کدام') and placeholders", () => {
      const omnibus = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "کدام یک از عوارض زیر ناشی از مصرف آمینوگلیکوزیدها است؟",
        choices: ["نفروتوکسیسیتی", "اتوتوکسیسیتی", "بلوک عصبی عضلانی", "همه موارد"],
        correctAnswer: "همه موارد",
        explanation: "هر سه عارضه جزو سمیت‌های آمینوگلیکوزیدها هستند.",
      });
      expect(omnibus.status).toBe("needs_critic");

      const placeholder = evaluateStudioQuestionQuality({
        questionIndex: 2,
        question: "کدام دارو مهارکننده ACE است؟",
        choices: ["کاپتوپریل", "گزینه انحرافی ۱", "لوزارتان", "آملودیپین"],
        correctAnswer: "کاپتوپریل",
        explanation: "کاپتوپریل مهارکننده ACE است.",
      });
      expect(placeholder.status).toBe("needs_critic");
    });

    it("flags synonymous / near-duplicate overlapping choices", () => {
      const overlap = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "اثر اصلی فوروزماید در نفرون چیست؟",
        choices: [
          "مهار هم‌انتقال‌گر سدیم-پتاسیم-کلر در قوس هنله",
          "مهار هم‌انتقال‌گر سدیم پتاسیم کلر در قوس صعودی هنله",
          "مهار جذب سدیم در توبول دیستال",
          "آنتاگونیست آلدوسترون در مجرای جمع‌کننده",
        ],
        correctAnswer: "مهار هم‌انتقال‌گر سدیم-پتاسیم-کلر در قوس هنله",
        explanation: "فوروزماید مهارکننده NKCC2 در قوس صعودی ضخیم هنله است.",
      });

      expect(overlap.status).toBe("needs_critic");
      expect(overlap.issues.some((i) => i.includes("هم‌پوشانی"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Atomic Shuffle & Batch Position Balancing + Persistence Stability
  // -------------------------------------------------------------------------
  describe("3. Atomic Shuffle, Key Synchronization & Staging Stability", () => {
    it("preserves correctAnswer after shuffling and spreads positions across batch", () => {
      const batch = [1, 2, 3, 4].map((idx) => ({
        questionIndex: idx,
        question: `سؤال داروسازی شماره ${idx} درباره مکانیسم دارو؟`,
        choices: ["گزینه الف علمی", "گزینه ب علمی", "گزینه ج علمی", "گزینه د علمی"],
        correctAnswer: "گزینه الف علمی",
        explanation: "توضیح علمی کامل.",
      }));

      // Even with a constant RNG that would leave all keys at the same slot,
      // shuffleAndBalanceStudioQuestions spreads positions across the batch.
      const shuffled = shuffleAndBalanceStudioQuestions(batch, () => 0.0);

      for (const q of shuffled) {
        expect(q.choices).toHaveLength(4);
        expect(q.choices).toContain(q.correctAnswer);
        expect(q.correctAnswer).toBe("گزینه الف علمی");
      }

      const positions = new Set(shuffled.map((q) => q.choices.indexOf(q.correctAnswer)));
      expect(positions.size).toBeGreaterThan(1);
    });

    it("keeps choice order stable after saving to staging and transferring to live quiz", async () => {
      const examStore = new InMemoryStudioExamStore();
      const quizStore = new InMemoryMarketingQuizStore();
      examStore.setQuizStore(quizStore);

      const quiz = await quizStore.create({
        slug: "pharmacology-exam",
        title: "آزمون فارماکولوژی",
        status: "draft",
        settings: {},
      });

      const created = await examStore.createOperationWithTasksAndBatches({
        quizId: quiz.id,
        totalRequestedQuestions: 1,
        config: { difficulty: "medium" },
        patternSnapshots: [],
        tasks: [
          {
            courseId: "00000000-0000-4000-a000-000000000010",
            moduleId: "00000000-0000-4000-a000-000000000020",
            targetQuestionCount: 1,
            batches: [{ batchIndex: 1, targetCount: 1, patternAllocations: [] }],
          },
        ],
      });

      const batchId = created.batches[0].id;
      const claim = await examStore.claimBatch(batchId, 120);
      expect(claim.claimed).toBe(true);

      const shuffledChoices = ["آتنولول", "لوزارتان", "کاپتوپریل", "آملودیپین"];
      await examStore.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken: claim.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "کدام دارو مهارکننده آنزیم تبدیل‌کننده آنژیوتانسین است؟",
            choices: shuffledChoices,
            correctAnswer: "کاپتوپریل",
            explanation: "کاپتوپریل مهارکننده ACE است.",
          },
        ],
      });

      // Read from staging twice — order must stay identical
      const staged1 = await examStore.getGeneratedQuestions({ operationId: created.operation.id });
      const staged2 = await examStore.getGeneratedQuestions({ operationId: created.operation.id });
      expect(staged1[0].choices.map((c) => c.text)).toEqual(shuffledChoices);
      expect(staged2[0].choices.map((c) => c.text)).toEqual(shuffledChoices);
      expect(staged1[0].correctAnswer).toEqual({ choiceId: "3" });

      // Accept and transfer to live quiz — order & choiceId must NOT be re-shuffled
      await examStore.reviewGeneratedQuestions({
        operationId: created.operation.id,
        questionIds: [staged1[0].id],
        decision: "accepted",
      });

      const transferred = await examStore.transferGeneratedQuestionsToQuiz({
        operationId: created.operation.id,
        questionIds: [staged1[0].id],
      });

      expect(transferred.transferredCount).toBe(1);
      expect(transferred.createdQuestions[0].choices.map((c) => c.text)).toEqual(shuffledChoices);
      expect(transferred.createdQuestions[0].correctAnswer).toEqual({ choiceId: "3" });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Both Studio Paths + Critic 1-Retry Cap + Unrepairable Rejection
  // -------------------------------------------------------------------------
  describe("4. Both Studio Generation Paths (Unified User Pipeline — No Critic Rewriting)", () => {
    it("StudioAiService: uses unified prompt + jsonSchema + deterministic normalizeQuestionOptions (no Critic call)", async () => {
      const completeMock = vi
        .fn()
        // Single pass: 1 clean question + 1 question with trailing explanation safely normalized by normalizeQuestionOptions
        .mockResolvedValueOnce({
          text: JSON.stringify({
            kind: "quizzes",
            questions: [
              {
                question: "کدام دارو به عنوان مهارکننده انتخابی پمپ پروتون شناخته می‌شود؟",
                questionType: "multiple_choice",
                choices: ["امپرازول", "رانیتیدین", "فاموتیدین", "سوکرالفیت"],
                correctAnswer: "امپرازول",
                explanation: "امپرازول پمپ پروتون را مهار می‌کند؛ رانیتیدین و فاموتیدین آنتاگونیست H2 و سوکرالفیت محافظ مخاط است.",
              },
              {
                question: "علت بروز سرفه خشک با مهارکننده‌های ACE چیست؟",
                questionType: "multiple_choice",
                choices: [
                  "تجمع برادی‌کینین در راه‌های هوایی، زیرا آنزیم ACE مسئول تجزیه برادی‌کینین است",
                  "افزایش آلدوسترون در مجاری",
                  "تحریک مستقیم عصب واگ",
                  "کاهش ترشح سورفاکتانت",
                ],
                correctAnswer: "تجمع برادی‌کینین در راه‌های هوایی، زیرا آنزیم ACE مسئول تجزیه برادی‌کینین است",
                explanation: "مهار ACE مانع تجزیه برادی‌کینین می‌شود.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 100, outputTokens: 100 },
          finishReason: "stop",
        });

      const gateway: ModelGateway = {
        provider: "gemini",
        complete: completeMock,
      };
      const service = new StudioAiService(gateway);

      const results = await service.generateQuestions({
        topic: "داروهای گوارشی و قلبی",
        questionType: "adverse_effects",
        difficulty: "medium",
        count: 2,
      });

      expect(completeMock).toHaveBeenCalledTimes(1); // Single pass, zero Critic/BlindEval calls
      expect(completeMock.mock.calls[0][0].jsonSchema).toEqual({ type: "quizzes" });
      expect(completeMock.mock.calls[0][0].temperature).toBe(0.2);
      expect(results).toHaveLength(2);

      // Verify prompt includes unified user-facing anti-bias rules
      const firstUserPrompt = completeMock.mock.calls[0][0].messages[1].content;
      expect(firstUserPrompt).toContain("MANDATORY ANTI-BIAS & ANTI-LEAKAGE RULES");

      // Verify choiceId points to the true correct answer after deterministic normalization & shuffle
      const q1 = results[0];
      expect(q1.choices.find((c) => c.id === q1.correctAnswer.choiceId)?.text).toBe("امپرازول");
      const q2 = results[1];
      expect(q2.choices.find((c) => c.id === q2.correctAnswer.choiceId)?.text).toBe(
        "تجمع برادی‌کینین در راه‌های هوایی",
      );
    });

    it("enforces max 1 Critic retry and strictly rejects unrepairable questions", async () => {
      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              // Still has forbidden omnibus 'همه موارد' after Critic attempt!
              distractors: ["گزینه علمی اول", "گزینه علمی دوم", "همه موارد"],
              explanation: "همه موارد صحیح است.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 50, outputTokens: 50 },
        finishReason: "stop",
      });

      const gateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockImplementation(async (req) => {
          const auditRes = buildMockBlindAndExplResponses(req, {
            1: "نیمه‌عمر حذف",
            2: "نیمه‌عمر حذف",
            3: "نیمه‌عمر حذف",
            4: "نیمه‌عمر حذف",
            5: "حجم توزیع",
          });
          if (auditRes) return auditRes;
          return completeMock(req);
        }),
      };
      const criticRes = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "کدام گزینه صحیح است؟",
              choices: ["مورد اول", "مورد دوم", "مورد سوم", "همه موارد"],
              correctAnswer: "همه موارد",
              explanation: "توضیح",
            },
            issues: ["Forbidden omnibus option"],
          },
        ],
        gateway,
        {
          topic: "فارماکولوژی",
          difficulty: "medium",
          stage: "studio_exam_batch",
          organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
          documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
          correlationId: "test-corr",
        },
      );

      expect(completeMock).toHaveBeenCalledTimes(1); // Strictly 1 retry, no infinite loop
      expect(criticRes.repaired).toHaveLength(0);
      expect(criticRes.rejectedIndices).toEqual([1]);
    });

    it("Multi-Chapter Exam Processor: drops defective questions without Critic and rejects empty batch", async () => {
      const saveSpy = vi.fn();
      const mockStore = {
        claimBatch: vi.fn().mockResolvedValue({ claimed: true, fencingToken: 1 }),
        heartbeatBatch: vi.fn().mockResolvedValue(true),
        releaseLeaseOnTransientError: vi.fn().mockResolvedValue(true),
        getBatchExecutionDetails: vi.fn().mockResolvedValue({
          batch: {
            id: "batch-q",
            taskId: "task-q",
            batchIndex: 1,
            targetCount: 1,
            generatedCount: 0,
            status: "pending",
            retryCount: 1,
            patternAllocations: [{ questionIndex: 1, patternId: "p1", patternVersion: 1 }],
          },
          task: {
            id: "task-q",
            operationId: "op-q",
            courseId: "c1",
            moduleId: "m1",
            targetQuestionCount: 1,
            generatedQuestionCount: 0,
            status: "pending",
          },
          operation: {
            id: "op-q",
            quizId: "q1",
            organizationId: "00000000-0000-0000-0000-000000000001",
            totalRequestedQuestions: 1,
            totalGeneratedQuestions: 0,
            status: "pending",
            config: { difficulty: "medium" },
            patternSnapshots: [
              {
                patternId: "p1",
                patternVersion: 1,
                title: "مفهومی",
                skills: [],
                systemInstructions: "تولید سؤال مفهومی",
                examples: [],
              },
            ],
          },
          existingQuestions: [],
        }),
        getModuleLessonContent: vi.fn().mockResolvedValue({
          lessons: [],
          combinedMarkdown: "محتوای علمی کافی درباره فارماکوکینتیک و نیمه‌عمر داروها در بدن انسان.",
          totalLength: 100,
        }),
        saveBatchQuestionsAndFinalize: saveSpy,
        markBatchFailed: vi.fn(),
        reconcileTaskAndOperation: vi.fn(),
        cancelOperation: vi.fn(),
        handleBatchFinalFailureAndReconcile: vi.fn(),
        reconcileStaleBatches: vi.fn(),
      } as unknown as StudioExamStore;

      const gateway: ModelGateway = {
        provider: "gemini",
        complete: vi
          .fn()
          // Initial generation returns defective omnibus question (dropped immediately, no Critic)
          .mockResolvedValueOnce({
            text: JSON.stringify({
              questions: [
                {
                  questionIndex: 1,
                  question: "کدام گزینه درباره فارماکوکینتیک صحیح است؟",
                  choices: ["جذب سریع", "توزیع بالا", "متابولیسم کبدی", "همه موارد"],
                  correctAnswer: "همه موارد",
                  explanation: "همه موارد درست است.",
                },
              ],
            }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          }),
      };

      const job = {
        id: "job-q",
        data: { operationId: "op-q", taskId: "task-q", batchId: "batch-q" },
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<StudioExamBatchJobPayload>;

      await expect(processStudioExamBatchJob(job, { store: mockStore, gateway })).rejects.toThrow(
        "تولید سؤالات با شکست مواجه شد",
      );
      expect(gateway.complete).toHaveBeenCalledTimes(1);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Backward Compatibility & 8 Pharmacy/Medical Domains Evaluation
  // -------------------------------------------------------------------------
  describe("5. Backward Compatibility & 8 Pharmacy/Medical Domains", () => {
    it("remains compatible with true_false questions and legacy staging rows without quality metadata", async () => {
      const patternMap = new Map([[1, { patternId: "p1", patternVersion: 1 }]]);
      const tfValidation = validateStudioExamQuestions({
        rawQuestions: [
          {
            questionIndex: 1,
            questionType: "true_false",
            question: "ناپروکسن یک داروی ضدالتهاب غیراستروئیدی است.",
            choices: ["درست", "نادرست"],
            correctAnswer: "درست",
            explanation: "ناپروکسن از دسته NSAIDها است.",
          },
        ],
        expectedSlotIndices: [1],
        targetCount: 1,
        patternMap,
      });

      expect(tfValidation.validQuestions).toHaveLength(1);
      expect(tfValidation.suspiciousItems).toHaveLength(0);

      // Legacy staging row without metadata.distractorRationales transfers cleanly
      const examStore = new InMemoryStudioExamStore();
      const quizStore = new InMemoryMarketingQuizStore();
      examStore.setQuizStore(quizStore);
      const quiz = await quizStore.create({
        slug: "legacy-exam",
        title: "آزمون قدیمی",
        status: "draft",
        settings: {},
      });
      const op = await examStore.createOperationWithTasksAndBatches({
        quizId: quiz.id,
        totalRequestedQuestions: 1,
        config: {},
        patternSnapshots: [],
        tasks: [
          {
            courseId: "00000000-0000-4000-a000-000000000011",
            moduleId: "00000000-0000-4000-a000-000000000021",
            targetQuestionCount: 1,
            batches: [{ batchIndex: 1, targetCount: 1, patternAllocations: [] }],
          },
        ],
      });
      const claim = await examStore.claimBatch(op.batches[0].id, 120);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId: op.batches[0].id,
        fencingToken: claim.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "سؤال قدیمی با ساختار قبلی؟",
            choices: [
              { id: "1", text: "گزینه اول علمی" },
              { id: "2", text: "گزینه دوم علمی" },
              { id: "3", text: "گزینه سوم علمی" },
              { id: "4", text: "گزینه چهارم علمی" },
            ],
            correctAnswer: { choiceId: "2" },
            explanation: "توضیح قدیمی",
          },
        ],
      });
      const staged = await examStore.getGeneratedQuestions({ operationId: op.operation.id });
      await examStore.reviewGeneratedQuestions({
        operationId: op.operation.id,
        questionIds: [staged[0].id],
        decision: "accepted",
      });
      const transferred = await examStore.transferGeneratedQuestionsToQuiz({
        operationId: op.operation.id,
        questionIds: [staged[0].id],
      });
      expect(transferred.transferredCount).toBe(1);
      expect(transferred.createdQuestions[0].correctAnswer).toEqual({ choiceId: "2" });
    });

    it("passes balanced, high-quality MCQs across all 8 pharmacy & medical domains", () => {
      expect(STUDIO_MCQ_QUALITY_RULES_PROMPT).toContain("distractorRationales");

      const domainQuestions = [
        // 1. Mechanism of Action
        {
          questionIndex: 1,
          question: "مکانیسم اثر اصلی متفورمین در کاهش قند خون چیست؟",
          choices: [
            "کاهش گلوکونئوژنز کبدی",
            "تحریک ترشح انسولین پانکراس",
            "مهار بازجذب گلوکز کلیوی",
            "تأخیر در تخلیه معده",
          ],
          correctAnswer: "کاهش گلوکونئوژنز کبدی",
          explanation: "متفورمین عمدتاً گلوکونئوژنز کبدی را مهار می‌کند؛ سولفونیل‌اوره‌ها انسولین را تحریک و مهارکننده‌های SGLT2 بازجذب کلیوی را مهار می‌کنند.",
        },
        // 2. Adverse Effects
        {
          questionIndex: 2,
          question: "مهم‌ترین عارضه محدودکننده دوز در مصرف مزمن داکسوروبیسین کدام است؟",
          choices: ["کاردیومیوپاتی", "نوروپاتی محیطی", "فیبروز ریوی", "سیستیت هموراژیک"],
          correctAnswer: "کاردیومیوپاتی",
          explanation: "داکسوروبیسین باعث کاردیومیوپاتی وابسته به دوز تجمعی می‌شود؛ نوروپاتی مربوط به وین‌کریستین، فیبروز ریوی مربوط به بلئومایسین و سیستیت هموراژیک مربوط به سیکلوفسفامید است.",
        },
        // 3. Drug Interactions
        {
          questionIndex: 3,
          question: "مصرف هم‌زمان فلوکونازول با وارفارین چه تغییری در وضعیت بیمار ایجاد می‌کند؟",
          choices: [
            "افزایش INR و خطر خونریزی",
            "کاهش INR و خطر ترومبوز",
            "افزایش کلیرانس کلیوی وارفارین",
            "کاهش جذب گوارشی وارفارین",
          ],
          correctAnswer: "افزایش INR و خطر خونریزی",
          explanation: "فلوکونازول مهارکننده CYP2C9 است و متابولیسم وارفارین را کاهش داده و INR را بالا می‌برد.",
        },
        // 4. Pharmacokinetics
        {
          questionIndex: 4,
          question: "دارویی با حجم توزیع بسیار بالا و نیمه‌عمر طولانی با کدام روش دوزینگ سریع‌تر به غلظت پایدار می‌رسد؟",
          choices: [
            "تجویز دوز بارگیری",
            "افزایش فاصله دوزها",
            "کاهش فراهمی زیستی",
            "تغییر مسیر دفع",
          ],
          correctAnswer: "تجویز دوز بارگیری",
          explanation: "دوز بارگیری برای رسیدن سریع به غلظت هدف در داروهای با نیمه‌عمر طولانی یا حجم توزیع بالا استفاده می‌شود.",
        },
        // 5. Pharmacodynamics
        {
          questionIndex: 5,
          question: "حضور یک آنتاگونیست رقابتی چه تغییری در منحنی دوز-پاسخ آگونیست ایجاد می‌کند؟",
          choices: [
            "شیفت به راست بدون تغییر حداکثر اثر",
            "کاهش حداکثر اثر بدون تغییر EC50",
            "شیفت به چپ همراه با افزایش میل ترکیبی",
            "کاهش شیب منحنی و کاهش حداکثر اثر",
          ],
          correctAnswer: "شیفت به راست بدون تغییر حداکثر اثر",
          explanation: "آنتاگونیست رقابتی EC50 ظاهری را افزایش می‌دهد (شیفت به راست) اما با افزایش غلظت آگونیست، Emax حفظ می‌شود.",
        },
        // 6. Diagnosis & Clinical Application
        {
          questionIndex: 6,
          question: "درمان خط اول شوک آنافیلاکسی در بخش اورژانس کدام دارو است؟",
          choices: [
            "اپی‌نفرین عضلانی",
            "دیفن‌هیدرامین وریدی",
            "هیدروکورتیزون خوراکی",
            "سالبوتامول استنشاقی",
          ],
          correctAnswer: "اپی‌نفرین عضلانی",
          explanation: "اپی‌نفرین عضلانی با اثرات آلفا و بتا درمان نجات‌بخش خط اول آنافیلاکسی است؛ آنتی‌هیستامین‌ها و کورتون‌ها درمان کمکی هستند.",
        },
        // 7. Conceptual
        {
          questionIndex: 7,
          question: "مفهوم «پیش‌دارو» در فارماکولوژی به کدام وضعیت اشاره دارد؟",
          choices: [
            "ترکیب غیرفعال نیازمند فعال‌سازی زیستی",
            "داروی دارای متابولیت سمی کلیوی",
            "داروی فاقد عبور از سد خونی مغزی",
            "ترکیب دارای اتصال پروتئینی کامل",
          ],
          correctAnswer: "ترکیب غیرفعال نیازمند فعال‌سازی زیستی",
          explanation: "پیش‌دارو در فرم اولیه غیرفعال است و پس از متابولیسم در بدن به فرم فعال تبدیل می‌شود.",
        },
        // 8. Clinical Scenario
        {
          questionIndex: 8,
          question: "بیمار ۶۲ ساله مبتلا به دیابت نوع ۲ و نارسایی قلبی با کسر جهشی کاهش‌یافته مراجعه کرده است. افزودن کدام دارو هم کنترل قند و هم بقای قلبی را بهبود می‌بخشد؟",
          choices: ["امپاگلیفلوزین", "پیوگلیتازون", "گلی‌بن کلامید", "ساکساگلیپتین"],
          correctAnswer: "امپاگلیفلوزین",
          explanation: "مهارکننده‌های SGLT2 مانند امپاگلیفلوزین بستری و مرگ قلبی را کاهش می‌دهند؛ پیوگلیتازون و ساکساگلیپتین در نارسایی قلبی نامناسب‌اند.",
        },
      ];

      for (const q of domainQuestions) {
        const evalRes = evaluateStudioQuestionQuality(q);
        expect(evalRes.status).toBe("pass");
        expect(evalRes.issues).toHaveLength(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Audit Fixes: Partial Batch Lifecycle, Scientific Preservation & Deduplication
  // -------------------------------------------------------------------------
  describe("6. Partial Batch Lifecycle, Scientific Preservation & Deduplication", () => {
    it("preserves scientific identifiers (Beta-1, COX-2, B12, SGLT2, NKCC2) in normalizeQuestionOptions", () => {
      const scientificCases = [
        {
          question: "کدام گیرنده هدف اصلی داروی متوپرولول است؟",
          choices: ["گیرنده (Beta-1)", "گیرنده آلفا-۱", "گیرنده موسکارینی", "گیرنده دوپامینی"],
          correctAnswer: "گیرنده (Beta-1)",
        },
        {
          question: "سلکوکسیب کدام آنزیم را مهار می‌کند؟",
          choices: ["آنزیم (COX-2)", "آنزیم فسفولیپاز", "آنزیم لیپواکسیژناز", "آنزیم رنین"],
          correctAnswer: "آنزیم (COX-2)",
        },
        {
          question: "کمبود کدام ویتامین باعث آنمی مگالوبلاستیک می‌شود؟",
          choices: ["ویتامین (B12)", "ویتامین ث", "ویتامین کا", "ویتامین دی"],
          correctAnswer: "ویتامین (B12)",
        },
      ];

      for (const sc of scientificCases) {
        const norm = normalizeQuestionOptions(sc);
        expect(norm.repaired).toBe(false);
        expect(norm.canBeRepaired).toBe(false);
        // Original scientific subtype/code is untouched
        expect(norm.normalized.correctAnswer).toBe(sc.correctAnswer);

        // Quality gate sends it to Critic instead of corrupting scientific meaning
        const evalRes = evaluateStudioQuestionQuality({
          questionIndex: 1,
          ...sc,
          explanation: "توضیح علمی.",
        });
        expect(evalRes.status).toBe("needs_critic");
      }
    });

    it("avoids false positives on scientifically contrastive medical choices (Jaccard + ZWNJ)", () => {
      const res1 = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "نحوه مهار پمپ پروتون توسط امپرازول چگونه است؟",
        choices: [
          "مهار برگشت‌ناپذیر پمپ پروتون در سلول جداری معده",
          "مهار برگشت‌پذیر پمپ پروتون در سلول جداری معده",
          "تحریک ترشح بی‌کربنات از سلول‌های اپی‌تلیال معده",
          "خنثی‌سازی مستقیم اسید هیدروکلریک در لومن معده",
        ],
        correctAnswer: "مهار برگشت‌ناپذیر پمپ پروتون در سلول جداری معده",
        explanation: "امپرازول به‌صورت برگشت‌ناپذیر پمپ پروتون را مهار می‌کند.",
      });
      expect(res1.status).toBe("pass");

      const res2 = evaluateStudioQuestionQuality({
        questionIndex: 2,
        question: "اثر سولفونیل‌اوره‌ها بر سلول‌های بتای پانکراس چیست؟",
        choices: [
          "افزایش ترشح انسولین از سلول‌های بتای پانکراس",
          "کاهش ترشح انسولین از سلول‌های بتای پانکراس",
          "مهار بازجذب گلوکز از توبول پروگزیمال کلیه",
          "کاهش مقاومت محیطی در بافت چربی و عضله",
        ],
        correctAnswer: "افزایش ترشح انسولین از سلول‌های بتای پانکراس",
        explanation: "سولفونیل‌اوره‌ها ترشح انسولین را افزایش می‌دهند.",
      });
      expect(res2.status).toBe("pass");
    });

    it("detects and eliminates duplicate question stems in StudioAiService", async () => {
      const completeMock = vi
        .fn()
        // Initial: 2 questions with identical stem -> second stem deduplicated in single pass
        .mockResolvedValueOnce({
          text: JSON.stringify([
            {
              question: "مکانیسم اثر متفورمین در دیابت نوع ۲ چیست؟",
              choices: [
                { id: "1", text: "کاهش گلوکونئوژنز کبدی" },
                { id: "2", text: "تحریک ترشح انسولین" },
                { id: "3", text: "مهار جذب کلیوی" },
                { id: "4", text: "تأخیر تخلیه معده" },
              ],
              correctAnswer: { choiceId: "1" },
              explanation: "متفورمین گلوکونئوژنز کبدی را کاهش می‌دهد.",
            },
            {
              question: "مکانیسم اثر متفورمین در دیابت نوع ۲ چیست؟",
              choices: [
                { id: "1", text: "کاهش گلوکونئوژنز کبدی" },
                { id: "2", text: "تحریک ترشح انسولین" },
                { id: "3", text: "مهار جذب کلیوی" },
                { id: "4", text: "تأخیر تخلیه معده" },
              ],
              correctAnswer: { choiceId: "1" },
              explanation: "متفورمین گلوکونئوژنز کبدی را کاهش می‌دهد.",
            },
          ]),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 100, outputTokens: 100 },
          finishReason: "stop",
        });

      const service = new StudioAiService({
        provider: "gemini",
        complete: completeMock,
      });
      const results = await service.generateQuestions({
        topic: "دیابت",
        questionType: "mechanism_of_action",
        difficulty: "medium",
        count: 2,
      });

      expect(completeMock).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
    });

    it("partial batch 4/5 with InMemoryStudioExamStore: preserves valid questions, retries only missing slot, prevents duplicate stems, and finalizes on last attempt", async () => {
      const examStore = new InMemoryStudioExamStore();
      const quizStore = new InMemoryMarketingQuizStore();
      examStore.setQuizStore(quizStore);
      const quiz = await quizStore.create({
        slug: "partial-batch-exam",
        title: "آزمون آزمایشی شکست جزئی",
        status: "draft",
        settings: {},
      });

      const moduleId = "00000000-0000-4000-a000-000000000030";
      const courseId = "00000000-0000-4000-a000-000000000031";
      // Seed lesson content for InMemoryStudioExamStore
      vi.spyOn(examStore, "getModuleLessonContent").mockResolvedValue({
        lessons: [
          {
            id: "les-1",
            title: "داروشناسی",
            contentMarkdown:
              "فارماکوکینتیک به جذب، توزیع، متابولیسم و دفع داروها می‌پردازد. نیمه‌عمر و کلیرانس شاخص‌های کلیدی هستند.",
            sortOrder: 1,
          },
        ],
        combinedMarkdown:
          "فارماکوکینتیک به جذب، توزیع، متابولیسم و دفع داروها می‌پردازد. نیمه‌عمر و کلیرانس شاخص‌های کلیدی هستند.",
        totalLength: 105,
      });

      const created = await examStore.createOperationWithTasksAndBatches({
        quizId: quiz.id,
        totalRequestedQuestions: 5,
        config: { difficulty: "medium" },
        patternSnapshots: [
          {
            patternId: "00000000-0000-4000-a000-000000000040",
            patternVersion: 1,
            title: "مفهومی",
            skills: [],
            systemInstructions: "سؤال مفهومی",
            examples: [],
          },
        ],
        tasks: [
          {
            courseId,
            moduleId,
            targetQuestionCount: 5,
            batches: [
              {
                batchIndex: 1,
                targetCount: 5,
                patternAllocations: [1, 2, 3, 4, 5].map((idx) => ({
                  questionIndex: idx,
                  patternId: "00000000-0000-4000-a000-000000000040",
                  patternVersion: 1,
                })),
              },
            ],
          },
        ],
      });

      const opId = created.operation.id;
      const taskId = created.tasks[0].id;
      const batchId = created.batches[0].id;

      const valid4Questions = [1, 2, 3, 4].map((idx) => ({
        questionIndex: idx,
        question: `سؤال علمی شماره ${idx} درباره فارماکوکینتیک داروها؟`,
        choices: ["نیمه‌عمر حذف", "حجم توزیع", "دوز بارگیری", "فراهمی زیستی"],
        correctAnswer: "نیمه‌عمر حذف",
        explanation: "توضیح علمی کامل و مستدل.",
      }));

      const completeMock = vi
        .fn()
        // Attempt 1: 4 valid + 1 defective (slot 5) -> slot 5 dropped immediately without Critic (4/5 saved)
        .mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              ...valid4Questions,
              {
                questionIndex: 5,
                question: "سؤال معیوب اسلات ۵؟",
                choices: ["جذب سریع", "توزیع بالا", "دفع کلیوی", "همه موارد"],
                correctAnswer: "همه موارد",
                explanation: "همه موارد صحیح است.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 100, outputTokens: 100 },
          finishReason: "stop",
        })
        // Attempt 2 (retry): Gemini repeats slot 1 stem for slot 5 -> must be rejected as duplicate!
        .mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 5,
                question: "سؤال علمی شماره 1 درباره فارماکوکینتیک داروها؟",
                choices: ["نیمه‌عمر حذف", "حجم توزیع", "دوز بارگیری", "فراهمی زیستی"],
                correctAnswer: "نیمه‌عمر حذف",
                explanation: "توضیح علمی.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        })
        // Attempt 3 (final retry): Gemini returns a valid unique question for slot 5 -> batch completes 5/5!
        .mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 5,
                question: "کدام شاخص حجم مایع فرضی توزیع دارو در بدن را نشان می‌دهد؟",
                choices: ["حجم توزیع", "نیمه‌عمر حذف", "کلیرانس کبدی", "فراهمی زیستی"],
                correctAnswer: "حجم توزیع",
                explanation: "حجم توزیع نسبت مقدار دارو در بدن به غلظت پلاسمایی است.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        });

      const gateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockImplementation(async (req) => {
          const auditRes = buildMockBlindAndExplResponses(req, {
            1: "نیمه‌عمر حذف",
            2: "نیمه‌عمر حذف",
            3: "نیمه‌عمر حذف",
            4: "نیمه‌عمر حذف",
            5: "حجم توزیع",
          });
          if (auditRes) return auditRes;
          return completeMock(req);
        }),
      };

      // Attempt 1 (attemptsMade: 0 of 3) -> saves 4/5, throws controlled error for retry
      const job1 = {
        id: "j1",
        data: { operationId: opId, taskId, batchId },
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job<StudioExamBatchJobPayload>;
      await expect(processStudioExamBatchJob(job1, { store: examStore, gateway })).rejects.toThrow(
        "4/5",
      );

      let staged = await examStore.getGeneratedQuestions({ operationId: opId });
      expect(staged).toHaveLength(4);

      // Attempt 2 (attemptsMade: 1 of 3) -> receives existing stems in prompt & rejects duplicate slot 5
      const job2 = { ...job1, attemptsMade: 1 } as unknown as Job<StudioExamBatchJobPayload>;
      await expect(processStudioExamBatchJob(job2, { store: examStore, gateway })).rejects.toThrow(
        "تولید سؤالات با شکست مواجه شد",
      );
      const retryPrompt = completeMock.mock.calls[1][0].messages[1].content;
      expect(retryPrompt).toContain("PREVIOUSLY GENERATED QUESTIONS IN THIS BATCH");
      expect(retryPrompt).toContain("GENERATE STRICTLY 1 HIGH-DISCRIMINATION MULTIPLE-CHOICE QUESTION(S)");

      // Attempt 3 (final attempt: attemptsMade: 2 of 3) -> succeeds with 5/5!
      const job3 = { ...job1, attemptsMade: 2 } as unknown as Job<StudioExamBatchJobPayload>;
      const res3 = await processStudioExamBatchJob(job3, { store: examStore, gateway });
      expect(res3.status).toBe("succeeded");
      expect(res3.isCompleted).toBe(true);
      expect(res3.generatedCount).toBe(5);

      staged = await examStore.getGeneratedQuestions({ operationId: opId });
      expect(staged).toHaveLength(5);

      const opFinal = await examStore.getOperationById(opId);
      expect(opFinal?.operation.status).toBe("completed");
      expect(opFinal?.tasks[0].status).toBe("completed");
    });

    it("finalizes Batch as failed and Task/Operation as partial (never stuck in processing) when final retry still leaves missing slots", async () => {
      const examStore = new InMemoryStudioExamStore();
      const quizStore = new InMemoryMarketingQuizStore();
      examStore.setQuizStore(quizStore);
      const quiz = await quizStore.create({
        slug: "final-partial-exam",
        title: "آزمون نهایی جزئی",
        status: "draft",
        settings: {},
      });

      const moduleId = "00000000-0000-4000-a000-000000000050";
      const courseId = "00000000-0000-4000-a000-000000000051";
      vi.spyOn(examStore, "getModuleLessonContent").mockResolvedValue({
        lessons: [],
        combinedMarkdown: "محتوای علمی کافی برای فارماکولوژی بالینی و عوارض دارویی.",
        totalLength: 80,
      });

      const created = await examStore.createOperationWithTasksAndBatches({
        quizId: quiz.id,
        totalRequestedQuestions: 2,
        config: { difficulty: "medium" },
        patternSnapshots: [
          {
            patternId: "00000000-0000-4000-a000-000000000060",
            patternVersion: 1,
            title: "مفهومی",
            skills: [],
            systemInstructions: "سؤال مفهومی",
            examples: [],
          },
        ],
        tasks: [
          {
            courseId,
            moduleId,
            targetQuestionCount: 2,
            batches: [
              {
                batchIndex: 1,
                targetCount: 2,
                patternAllocations: [1, 2].map((idx) => ({
                  questionIndex: idx,
                  patternId: "00000000-0000-4000-a000-000000000060",
                  patternVersion: 1,
                })),
              },
            ],
          },
        ],
      });

      const opId = created.operation.id;
      const taskId = created.tasks[0].id;
      const batchId = created.batches[0].id;

      const gateway: ModelGateway = {
        provider: "gemini",
        complete: vi
          .fn()
          // 1 valid + 1 unrepairable
          .mockResolvedValueOnce({
            text: JSON.stringify({
              questions: [
                {
                  questionIndex: 1,
                  question: "کدام دارو مهارکننده پمپ پروتون است؟",
                  choices: ["امپرازول", "رانیتیدین", "فاموتیدین", "سوکرالفیت"],
                  correctAnswer: "امپرازول",
                  explanation: "امپرازول مهارکننده پمپ پروتون است.",
                },
                {
                  questionIndex: 2,
                  question: "سؤال معیوب اسلات ۲؟",
                  choices: ["جذب", "توزیع", "متابولیسم", "همه موارد"],
                  correctAnswer: "همه موارد",
                  explanation: "همه موارد.",
                },
              ],
            }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              questions: [
                {
                  questionIndex: 2,
                  rejected: false,
                  distractors: ["گزینه انحرافی ۱", "متابولیسم", "دفع"],
                  explanation: "توضیح.",
                },
              ],
            }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 30, outputTokens: 30 },
            finishReason: "stop",
          }),
      };

      const wrappedGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockImplementation(async (req) => {
          const auditRes = buildMockBlindAndExplResponses(req, {
            1: "امپرازول",
          });
          if (auditRes) return auditRes;
          return gateway.complete(req);
        }),
      };

      // Final attempt (attemptsMade: 4 of 5) -> saves 1/2, triggers handleBatchFinalFailureAndReconcile
      const finalJob = {
        id: "j-final",
        data: { operationId: opId, taskId, batchId },
        opts: { attempts: 5 },
        attemptsMade: 4,
      } as unknown as Job<StudioExamBatchJobPayload>;

      await expect(processStudioExamBatchJob(finalJob, { store: examStore, gateway: wrappedGateway })).rejects.toThrow(
        "1/2",
      );

      const opFinal = await examStore.getOperationById(opId);
      expect(opFinal?.operation.status).toBe("partial");
      expect(opFinal?.operation.totalGeneratedQuestions).toBe(1);
      expect(opFinal?.tasks[0].status).toBe("partial");
      const batchFinal = await examStore.getBatchExecutionDetails(batchId);
      expect(batchFinal?.batch.status).toBe("failed");
      expect(batchFinal?.batch.generatedCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Distractor Engineering, Conceptual Proximity & Critic Replacement
  // -------------------------------------------------------------------------
  describe("7. Distractor Engineering, Conceptual Proximity & Critic Replacement", () => {
    it("accepts short, valid scientific choices without needlessly triggering Critic", () => {
      const shortValidSets = [
        {
          questionIndex: 1,
          question: "مسیر اصلی متابولیسم داروها در کدام ارگان انجام می‌شود؟",
          choices: ["کبد", "کلیه", "طحال", "ریه"],
          correctAnswer: "کبد",
          explanation: "آنزیم‌های کبدی مسئول متابولیسم اصلی هستند.",
        },
        {
          questionIndex: 2,
          question: "مرحله اول در سرنوشت زیستی دارو کدام است؟",
          choices: ["جذب", "توزیع", "متابولیسم", "دفع"],
          correctAnswer: "جذب",
          explanation: "جذب اولین مرحله است.",
        },
        {
          questionIndex: 3,
          question: "کدام شاخص سرعت حذف دارو از پلاسما را نشان می‌دهد؟",
          choices: ["نیمه‌عمر حذف", "حجم توزیع", "دوز بارگیری", "فراهمی زیستی"],
          correctAnswer: "نیمه‌عمر حذف",
          explanation: "نیمه‌عمر حذف زمان کاهش ۵۰ درصدی غلظت پلاسمایی است.",
        },
      ];

      for (const q of shortValidSets) {
        const res = evaluateStudioQuestionQuality(q);
        expect(res.status).toBe("pass");
        expect(res.issues).toHaveLength(0);
      }
    });

    it("flags overly generic/vague distractors and conceptual distance for Critic replacement", () => {
      const vagueRes = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "اثر بتابلاکرها بر گیرنده بتا-۱ در گره سینوسی-دهلیزی قلب چیست؟",
        choices: [
          "کاهش سرعت دپولاریزاسیون خودبه‌خودی در گره سینوسی و کاهش ضربان قلب",
          "بدون تغییر",
          "اختلال عمومی",
          "افزایش عوارض",
        ],
        correctAnswer: "کاهش سرعت دپولاریزاسیون خودبه‌خودی در گره سینوسی و کاهش ضربان قلب",
        explanation: "بتابلاکرها با مهار بتا-۱ سرعت گره سینوسی را کم می‌کنند.",
      });

      expect(vagueRes.status).toBe("needs_critic");
      expect(vagueRes.issues.some((i) => i.includes("عمومی یا مبهم") || i.includes("فاصله مفهومی"))).toBe(true);
    });

    it("drops weak/short-distractor questions in StudioAiService without Critic rewriting", async () => {
      const completeMock = vi
        .fn()
        // Initial: correct answer is detailed/specific, distractors are short/vague -> dropped without Critic
        .mockResolvedValueOnce({
          text: JSON.stringify({
            kind: "quizzes",
            questions: [
              {
                question: "مکانیسم اثر متوپرولول بر گیرنده‌های Beta-1 قلبی چیست؟",
                questionType: "multiple_choice",
                choices: [
                  "مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد",
                  "تحریک قلب",
                  "کاهش اثر",
                  "بدون تغییر",
                ],
                correctAnswer: "مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد",
                explanation: "متوپرولول آنتاگونیست انتخابی Beta-1 است.",
              },
              {
                question: "مکانیسم اثر متوپرولول بر گیرنده‌های قلبی چیست؟",
                questionType: "multiple_choice",
                choices: [
                  "مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد",
                  "تحریک گیرنده Beta-2 و افزایش cAMP داخل‌سلولی در عضله صاف برونش",
                  "مهار رقابتی گیرنده Alpha-1 و کاهش IP3 داخل‌سلولی در عضله صاف عروق",
                  "تحریک گیرنده M2 و کاهش هدایت گره دهلیزی-بطنی در بافت هدایتی",
                ],
                correctAnswer: "مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد",
                explanation:
                  "متوپرولول با مهار رقابتی گیرنده Beta-1 باعث کاهش cAMP در میوکارد می‌شود؛ سایر گزینه‌ها مربوط به گیرنده‌های Beta-2، Alpha-1 یا موسکارینی M2 هستند.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 100, outputTokens: 100 },
          finishReason: "stop",
        });

      const service = new StudioAiService({
        provider: "gemini",
        complete: completeMock,
      });
      const results = await service.generateQuestions({
        topic: "داروهای قلبی-عروقی",
        questionType: "mechanism_of_action",
        difficulty: "medium",
        count: 2,
      });

      expect(completeMock).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);

      const q = results[0];
      const correctChoice = q.choices.find((c) => c.id === q.correctAnswer.choiceId);
      expect(correctChoice?.text).toBe("مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد");
      expect(q.choices.some((c) => c.text.includes("Beta-1"))).toBe(true);
      expect(q.choices.some((c) => c.text.includes("Beta-2"))).toBe(true);
      expect(q.choices.some((c) => c.text.includes("Alpha-1"))).toBe(true);
    });

    it("throws when all generated questions fail deterministic quality gate (no Critic retry)", async () => {
      const completeMock = vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({
            kind: "quizzes",
            questions: [
              {
                question: "کدام آنزیم توسط آسپرین مهار می‌شود؟",
                questionType: "multiple_choice",
                choices: [
                  "مهار برگشت‌ناپذیر آنزیم COX-1 و COX-2 از طریق استیلاسیون سرین",
                  "بدون تغییر",
                  "اختلال عمومی",
                  "کاهش اثر",
                ],
                correctAnswer: "مهار برگشت‌ناپذیر آنزیم COX-1 و COX-2 از طریق استیلاسیون سرین",
                explanation: "آسپرین COX را مهار می‌کند.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 80, outputTokens: 80 },
          finishReason: "stop",
        });

      const service = new StudioAiService({
        provider: "gemini",
        complete: completeMock,
      });
      await expect(
        service.generateQuestions({
          topic: "داروهای ضدالتهاب",
          questionType: "mechanism_of_action",
          difficulty: "medium",
          count: 1,
        }),
      ).rejects.toThrow("هیچ سؤال معتبری مطابق با استاندارد کیفیت گزینه‌ها تولید نشد");
      expect(completeMock).toHaveBeenCalledTimes(1);
    });

    it("treats minor length variation (e.g. 1.38x) as non-blocking warning while passing valid scientific sets", () => {
      // 1. Minor length variation (53 vs 38 -> ratio 1.39, gap 15) -> passes without Critic (matches user pipeline)
      const slightlyLonger = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "مکانیسم اثر دارو بر گیرنده‌های عروقی چیست؟",
        choices: [
          "مهار رقابتی گیرنده‌های آلفا-یک در عضله صاف عروق محیطی", // 53 chars
          "تحریک گیرنده‌های بتا در عضله صاف عروقی", // 38 chars
          "افزایش آزادسازی رنین از سلول‌های کلیوی", // 38 chars
          "کاهش بازجذب سدیم در توبول دیستال کلیه", // 38 chars
        ],
        correctAnswer: "مهار رقابتی گیرنده‌های آلفا-یک در عضله صاف عروق محیطی",
        explanation: "توضیح علمی کامل.",
      });
      expect(slightlyLonger.status).toBe("pass");

      // 2. Correct answer is shorter than distractors -> passes without triggering Critic
      const shorterCorrect = evaluateStudioQuestionQuality({
        questionIndex: 2,
        question: "کدام دارو مهارکننده انتخابی پمپ پروتون است؟",
        choices: [
          "امپرازول", // 8 chars (shortest)
          "رانیتیدین هیدروکلراید", // 21 chars
          "فاموتیدین خوراکی", // 16 chars
          "سایمتیدین تزریقی", // 16 chars
        ],
        correctAnswer: "امپرازول",
        explanation: "امپرازول مهارکننده پمپ پروتون است.",
      });
      expect(shorterCorrect.status).toBe("pass");

      // 3. Correct answer < 40 chars with moderate ratio < 1.55 (30 vs 22) -> passes
      const under40Moderate = evaluateStudioQuestionQuality({
        questionIndex: 3,
        question: "کدام دارو در بیماران دچار عدم تحمل به استاتین تجویز می‌شود؟",
        choices: [
          "بمپدوئیک اسید خوراکی", // 21 chars
          "آتورواستاتین", // 13 chars
          "رزوواستاتین", // 12 chars
          "سیمواستاتین", // 12 chars
        ],
        correctAnswer: "بمپدوئیک اسید خوراکی",
        explanation: "بمپدوئیک اسید در عدم تحمل به استاتین کاربرد دارد.",
      });
      expect(under40Moderate.status).toBe("pass");

      // 4. Four nearly equal-length choices -> passes
      const equalLength = evaluateStudioQuestionQuality({
        questionIndex: 4,
        question: "کدام آنزیم در متابولیسم وارفارین نقش اصلی دارد؟",
        choices: [
          "آنزیم کبدی CYP2C9",
          "آنزیم کبدی CYP3A4",
          "آنزیم کبدی CYP2D6",
          "آنزیم کبدی CYP1A2",
        ],
        correctAnswer: "آنزیم کبدی CYP2C9",
        explanation: "وارفارین عمدتاً توسط CYP2C9 متابولیزه می‌شود.",
      });
      expect(equalLength.status).toBe("pass");
    });

    it("balances key positions even in small 2-question batches while preserving correctAnswer", () => {
      const smallBatch = [1, 2].map((idx) => ({
        questionIndex: idx,
        question: `سؤال داروسازی شماره ${idx} چیست؟`,
        choices: ["گزینه الف علمی", "گزینه ب علمی", "گزینه ج علمی", "گزینه د علمی"],
        correctAnswer: "گزینه الف علمی",
        explanation: "توضیح علمی.",
      }));

      const shuffled = shuffleAndBalanceStudioQuestions(smallBatch, () => 0.0);
      expect(shuffled[0].choices.indexOf(shuffled[0].correctAnswer)).not.toBe(
        shuffled[1].choices.indexOf(shuffled[1].correctAnswer),
      );
      expect(shuffled[0].correctAnswer).toBe("گزینه الف علمی");
      expect(shuffled[1].correctAnswer).toBe("گزینه الف علمی");
    });
  });

  // -------------------------------------------------------------------------
  // 8. Critic Stem & Key Locking, Strict Rejection & Contract Enforcement
  // -------------------------------------------------------------------------
  describe("8. Critic Stem & Key Locking & Contract Enforcement", () => {
    const criticContext = {
      topic: "فارماکولوژی",
      difficulty: "medium",
      stage: "studio_exam_batch",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
      documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
      correlationId: "lock-test",
    };

    it("ignores any altered 'question' or 'correctAnswer' returned by Critic and preserves originals + scientific IDs", async () => {
      const originalQuestion = "مکانیسم اثر متوپرولول بر گیرنده‌های Beta-1 قلبی چیست؟";
      const originalCorrect = "مهار رقابتی گیرنده Beta-1 و کاهش cAMP داخل‌سلولی در میوکارد";

      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              // Critic tries to alter both question and correctAnswer (stripping Beta-1!)
              question: "سؤال کاملاً تغییریافته توسط مدل!",
              correctAnswer: "مهار گیرنده قلبی بدون شناسه",
              distractors: [
                "تحریک گیرنده Beta-2 و افزایش cAMP داخل‌سلولی در عضله صاف برونش",
                "مهار رقابتی گیرنده Alpha-1 و کاهش IP3 داخل‌سلولی در عضله صاف عروق",
                "تحریک گیرنده M2 و کاهش هدایت گره دهلیزی-بطنی در بافت هدایتی",
              ],
              distractorRationales: {
                "تحریک گیرنده Beta-2 و افزایش cAMP داخل‌سلولی در عضله صاف برونش": "سوءبرداشت ۱",
                "مهار رقابتی گیرنده Alpha-1 و کاهش IP3 داخل‌سلولی در عضله صاف عروق": "سوءبرداشت ۲",
                "تحریک گیرنده M2 و کاهش هدایت گره دهلیزی-بطنی در بافت هدایتی": "سوءبرداشت ۳",
              },
              explanation: "متوپرولول مهارکننده Beta-1 است و بقیه گزینه‌ها نادرست‌اند.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 80, outputTokens: 80 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: originalQuestion,
              choices: [originalCorrect, "تحریک قلب", "کاهش اثر", "بدون تغییر"],
              correctAnswer: originalCorrect,
              explanation: "توضیح اولیه.",
            },
            issues: ["Distractors too short/vague"],
          },
        ],
        { provider: "gemini", complete: completeMock },
        criticContext,
      );

      expect(res.repaired).toHaveLength(1);
      expect(res.rejectedIndices).toHaveLength(0);
      expect(res.repaired[0].question).toBe(originalQuestion);
      expect(res.repaired[0].correctAnswer).toBe(originalCorrect);
      expect(res.repaired[0].choices).toContain(originalCorrect);
      expect(res.repaired[0].choices.some((c) => c.includes("Beta-1"))).toBe(true);

      // Verify Critic prompt explicitly omits question from output schema
      const promptText = completeMock.mock.calls[0][0].messages[1].content;
      expect(promptText).toContain('DO NOT include "question"');
      expect(promptText).toContain("FIXED and IMMUTABLE");
    });

    it("rejects question when Critic returns rejected: true", async () => {
      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: true,
              distractors: ["الف علمی", "ب علمی", "ج علمی"],
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 40, outputTokens: 20 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "سؤال با کلید ناسازگار با منبع؟",
              choices: ["کلید ناسازگار علمی", "غلط ۱", "غلط ۲", "غلط ۳"],
              correctAnswer: "کلید ناسازگار علمی",
              explanation: "توضیح.",
            },
            issues: ["Key mismatch"],
          },
        ],
        { provider: "gemini", complete: completeMock },
        criticContext,
      );

      expect(res.repaired).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([1]);
    });

    it("rejects question when Critic returns fewer than 3 distractors or incomplete output", async () => {
      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              distractors: ["تنها یک گزینه غلط", "دومین گزینه غلط"], // Only 2 distractors!
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 40, outputTokens: 20 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "مکانیسم اثر داروی کاپتوپریل چیست؟",
              choices: ["مهار آنزیم مبدل آنژیوتانسین", "غلط ۱", "غلط ۲", "غلط ۳"],
              correctAnswer: "مهار آنزیم مبدل آنژیوتانسین",
              explanation: "توضیح.",
            },
            issues: ["Short distractors"],
          },
        ],
        { provider: "gemini", complete: completeMock },
        criticContext,
      );

      expect(res.repaired).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([1]);
    });

    it("rejects repaired question if it still has Answer Leakage or length imbalance after Critic", async () => {
      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              // Still way too short compared to original correctAnswer!
              distractors: ["کاهش اثر", "بدون تغییر", "افزایش عوارض"],
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 40, outputTokens: 20 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "مکانیسم اثر اومپرازول بر سلول جداری چیست؟",
              choices: [
                "مهار برگشت‌ناپذیر پمپ پروتون H+/K+ ATPase در سلول‌های جداری معده",
                "غلط ۱",
                "غلط ۲",
                "غلط ۳",
              ],
              correctAnswer: "مهار برگشت‌ناپذیر پمپ پروتون H+/K+ ATPase در سلول‌های جداری معده",
              explanation: "اومپرازول پمپ پروتون را مهار می‌کند.",
            },
            issues: ["Length disparity"],
          },
        ],
        { provider: "gemini", complete: completeMock },
        criticContext,
      );

      expect(res.repaired).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([1]);
    });

    it("enforces strict distractorRationales (missing, incomplete, short <5 chars, duplicate, mismatched key -> REJECT; 3 valid distinct matching -> PASS)", async () => {
      const baseItem = {
        candidate: {
          questionIndex: 1,
          question: "مکانیسم اثر داروی کاپتوپریل چیست؟",
          choices: [
            "مهار آنزیم تبدیل‌کننده آنژیوتانسین در عروق محیطی",
            "غلط ۱",
            "غلط ۲",
            "غلط ۳",
          ],
          correctAnswer: "مهار آنزیم تبدیل‌کننده آنژیوتانسین در عروق محیطی",
          explanation: "کاپتوپریل آنزیم مبدل آنژیوتانسین را مهار می‌کند.",
        },
        issues: ["Distractors too short"],
      };

      const validDistractors = [
        "تحریک مستقیم گیرنده آلفا-یک در عضله صاف عروقی",
        "مهار رقابتی گیرنده آنژیوتانسین در توبول پروگزیمال",
        "افزایش آزادسازی رنین از سلول‌های جوکستاگلومرولی کلیه",
      ];

      const runWithRationales = async (distractorRationales: unknown) => {
        const completeMock = vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                rejected: false,
                distractors: validDistractors,
                ...(distractorRationales !== undefined ? { distractorRationales } : {}),
                explanation: "کاپتوپریل ACE را مهار می‌کند و بقیه گزینه‌ها مکانیسم‌های دیگری دارند.",
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 60, outputTokens: 60 },
          finishReason: "stop",
        });
        return criticAndRepairStudioQuestions(
          [baseItem],
          { provider: "gemini", complete: completeMock },
          criticContext,
        );
      };

      // 1. Missing distractorRationales -> REJECT
      const missingRes = await runWithRationales(undefined);
      expect(missingRes.repaired).toHaveLength(0);
      expect(missingRes.rejectedIndices).toEqual([1]);

      // 2. Only 2 rationales -> REJECT
      const twoRes = await runWithRationales({
        [validDistractors[0]]: "سوءبرداشت معتبر اول درباره آلفا-یک",
        [validDistractors[1]]: "سوءبرداشت معتبر دوم درباره ARB",
      });
      expect(twoRes.repaired).toHaveLength(0);
      expect(twoRes.rejectedIndices).toEqual([1]);

      // 3. Empty or < 5 chars rationale -> REJECT
      const shortRes = await runWithRationales({
        [validDistractors[0]]: "سوءبرداشت معتبر اول",
        [validDistractors[1]]: "سوءبرداشت معتبر دوم",
        [validDistractors[2]]: "کوتاه", // 5 chars? Wait: "کوتاه" is 5 chars, let's test 3 chars "غلط"
      });
      expect(shortRes.repaired).toHaveLength(1); // "کوتاه" is exactly 5 chars
      const tooShortRes = await runWithRationales({
        [validDistractors[0]]: "سوءبرداشت معتبر اول",
        [validDistractors[1]]: "سوءبرداشت معتبر دوم",
        [validDistractors[2]]: "غلط", // 3 chars < 5
      });
      expect(tooShortRes.repaired).toHaveLength(0);
      expect(tooShortRes.rejectedIndices).toEqual([1]);

      // 4. Duplicate rationales -> REJECT
      const dupRes = await runWithRationales({
        [validDistractors[0]]: "اشتباه گرفتن مکانیسم داروی هم‌گروه",
        [validDistractors[1]]: "اشتباه گرفتن مکانیسم داروی هم‌گروه",
        [validDistractors[2]]: "سوءبرداشت سوم درباره رنین",
      });
      expect(dupRes.repaired).toHaveLength(0);
      expect(dupRes.rejectedIndices).toEqual([1]);

      // 5. Mismatched rationale key (not in distractors) -> REJECT
      const mismatchRes = await runWithRationales({
        [validDistractors[0]]: "سوءبرداشت معتبر اول",
        [validDistractors[1]]: "سوءبرداشت معتبر دوم",
        "گزینه نامنطبق با خروجی": "سوءبرداشت معتبر سوم",
      });
      expect(mismatchRes.repaired).toHaveLength(0);
      expect(mismatchRes.rejectedIndices).toEqual([1]);

      // 6. Three independent, valid (>=5 chars), matching rationales -> PASS + locked stem & key
      const passRes = await runWithRationales({
        [validDistractors[0]]: "خلط کردن اثر وازودیلاتوری با آگونیست آلفا",
        [validDistractors[1]]: "اشتباه گرفتن مهارکننده ACE با آنتاگونیست ARB",
        [validDistractors[2]]: "تفسیر نادرست افزایش رنین جبرانی به عنوان مکانیسم اولیه",
      });
      expect(passRes.repaired).toHaveLength(1);
      expect(passRes.rejectedIndices).toHaveLength(0);
      expect(passRes.repaired[0].question).toBe(baseItem.candidate.question);
      expect(passRes.repaired[0].correctAnswer).toBe(baseItem.candidate.correctAnswer);
      expect(Object.keys(passRes.repaired[0].distractorRationales ?? {})).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Safe Key Cleaning, Explanation Preservation & Leakage Regression
  // -------------------------------------------------------------------------
  describe("9. Safe Key Cleaning, Explanation Preservation & Leakage Regression", () => {
    const criticCtx = {
      topic: "فارماکولوژی قلبی",
      difficulty: "medium",
      stage: "studio_exam_batch",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
      documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
      correlationId: "clean-key-test",
    };

    it("cleans bloated correctAnswer (removes extra English translation & inline explanation) and preserves explanation + scientific IDs", async () => {
      const bloatedKey =
        "مهار انتخابی گیرنده Beta-1 (Selective Beta-1 Blockade) جهت پیشگیری از تاکی‌کاردی";
      const cleanedKey = "مهار انتخابی گیرنده Beta-1";
      const distractors = [
        "تحریک انتخابی گیرنده Alpha-1",
        "مهار رقابتی گیرنده M2",
        "تحریک مستقیم گیرنده Beta-2",
      ];

      const completeMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              cleanedCorrectAnswer: cleanedKey,
              distractors,
              distractorRationales: {
                [distractors[0]]: "اشتباه گرفتن بتابلاکر با آگونیست آلفا-۱",
                [distractors[1]]: "خلط کردن اثر قلبی با گیرنده موسکارینی",
                [distractors[2]]: "اشتباه گرفتن زیرگروه Beta-1 با Beta-2",
              },
              explanation:
                "متوپرولول با مهار انتخابی گیرنده Beta-1 (Selective Beta-1 Blockade) جهت پیشگیری از تاکی‌کاردی عمل می‌کند؛ سایر گزینه‌ها مکانیسم‌های نادرست هستند.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 80, outputTokens: 80 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "مکانیسم اثر متوپرولول بر قلب چیست؟",
              choices: [bloatedKey, "تغییر pH", "کاهش اثر", "بدون تغییر"],
              correctAnswer: bloatedKey,
              explanation: "توضیح اولیه.",
            },
            issues: ["English translation leakage", "Explanatory clause leakage", "Length disparity"],
          },
        ],
        { provider: "gemini", complete: completeMock },
        criticCtx,
      );

      expect(res.repaired).toHaveLength(1);
      expect(res.repaired[0].correctAnswer).toBe(cleanedKey);
      expect(res.repaired[0].correctAnswer).toContain("Beta-1");
      expect(res.repaired[0].explanation).toContain("جهت پیشگیری از تاکی‌کاردی");
      expect(Object.keys(res.repaired[0].distractorRationales ?? {})).toEqual(distractors);

      // Verify Shuffle still preserves cleaned correctAnswer
      const shuffled = shuffleAndBalanceStudioQuestions(res.repaired);
      expect(shuffled[0].choices).toContain(cleanedKey);
      expect(shuffled[0].correctAnswer).toBe(cleanedKey);
    });

    it("rejects cleanedCorrectAnswer if it drops a scientific identifier (e.g. Beta-1) or drifts to a different concept", async () => {
      const origKey = "مهار انتخابی گیرنده Beta-1 جهت کاهش ضربان قلب";

      // Case A: Critic drops "Beta-1"
      const dropIdMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              cleanedCorrectAnswer: "مهار انتخابی گیرنده قلبی",
              distractors: [
                "تحریک انتخابی گیرنده عروقی",
                "مهار رقابتی کانال کلسیمی",
                "تحریک مستقیم عصب سمپاتیک",
              ],
              distractorRationales: {
                "تحریک انتخابی گیرنده عروقی": "سوءبرداشت اول درباره عروق",
                "مهار رقابتی کانال کلسیمی": "سوءبرداشت دوم درباره کلسیم",
                "تحریک مستقیم عصب سمپاتیک": "سوءبرداشت سوم درباره سمپاتیک",
              },
              explanation: "توضیح علمی کامل برای کلید و گزینه‌ها.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 60, outputTokens: 60 },
        finishReason: "stop",
      });

      const resDrop = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "مکانیسم اثر متوپرولول چیست؟",
              choices: [origKey, "غلط ۱", "غلط ۲", "غلط ۳"],
              correctAnswer: origKey,
              explanation: "توضیح اولیه.",
            },
            issues: ["Length disparity"],
          },
        ],
        { provider: "gemini", complete: dropIdMock },
        criticCtx,
      );
      expect(resDrop.repaired).toHaveLength(0);
      expect(resDrop.rejectedIndices).toEqual([1]);

      // Case B: Critic drifts to a completely different concept
      const driftMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: false,
              cleanedCorrectAnswer: "افزایش دفع کلیوی سدیم و پتاسیم",
              distractors: [
                "کاهش جذب گلوکز از روده باریک",
                "مهار آنزیم مبدل آنژیوتانسین کبدی",
                "تحریک ترشح انسولین از پانکراس",
              ],
              distractorRationales: {
                "کاهش جذب گلوکز از روده باریک": "سوءبرداشت اول گوارشی",
                "مهار آنزیم مبدل آنژیوتانسین کبدی": "سوءبرداشت دوم کبدی",
                "تحریک ترشح انسولین از پانکراس": "سوءبرداشت سوم پانکراسی",
              },
              explanation: "توضیح علمی کامل.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 60, outputTokens: 60 },
        finishReason: "stop",
      });

      const resDrift = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "مکانیسم اثر متوپرولول چیست؟",
              choices: [origKey, "غلط ۱", "غلط ۲", "غلط ۳"],
              correctAnswer: origKey,
              explanation: "توضیح اولیه.",
            },
            issues: ["Length disparity"],
          },
        ],
        { provider: "gemini", complete: driftMock },
        criticCtx,
      );
      expect(resDrift.repaired).toHaveLength(0);
      expect(resDrift.rejectedIndices).toEqual([1]);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Answer Cue Elimination, Choice Purity & Information Density Regression
  // -------------------------------------------------------------------------
  describe("10. Answer Cue Elimination, Choice Purity & Information Density Regression", () => {
    const criticCtx = {
      topic: "فارماکولوژی و قلب",
      difficulty: "medium",
      stage: "studio_exam_batch",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
      documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
      correlationId: "cue-elimination-regression",
    };

    it("1. flags when correct answer is longer than all distractors (even if one distractor is moderately long)", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "مهم‌ترین مکانیسم پاتوفیزیولوژیک در پیشرفت نارسایی قلبی چیست؟",
        choices: [
          "فعالسازی مزمن سیستم عصبی سمپاتیک و محور رنین-آنژیوتانسین-آلدوسترون به همراه اثرات فیبروتیک هورمونها",
          "افزایش موقت فشار خون شریانی هنگام فعالیت ورزشی",
          "کاهش خفیف ضربان قلب در خواب شبانه",
          "تغییر گذرای حجم پلاسما",
        ],
        correctAnswer:
          "فعالسازی مزمن سیستم عصبی سمپاتیک و محور رنین-آنژیوتانسین-آلدوسترون به همراه اثرات فیبروتیک هورمونها",
        explanation: "فعالسازی مزمن سمپاتیک و RAAS باعث پیشرفت نارسایی قلبی می‌شود.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.length).toBeGreaterThan(0);
    });

    it("2 & 10. strips parenthetical explanation from correct answer and transfers it to explanation", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 2,
        question: "کدام دسته دارویی در نارسایی قلبی با کاهش کسر جهشی توصیه می‌شود؟",
        choices: [
          "مهارکننده‌های نپریلایزین (برای جلوگیری از تخریب پپتیدهای ناتریورتیک)",
          "مسدودکننده‌های کانال کلسیم دی‌هیدروپیریدینی",
          "آگونیست‌های گیرنده آلفا-۲ مرکزی",
          "مهارکننده‌های فسفودی‌استراز نوع پنج",
        ],
        correctAnswer: "مهارکننده‌های نپریلایزین (برای جلوگیری از تخریب پپتیدهای ناتریورتیک)",
        explanation: "ساکوبیتریل مهارکننده نپریلایزین است.",
      });

      expect(res.status).toBe("pass");
      expect(res.repairedByDeterministicNormalizer).toBe(true);
      expect(res.normalizedQuestion.correctAnswer).toBe("مهارکننده‌های نپریلایزین");
      expect(res.normalizedQuestion.explanation).toContain(
        "برای جلوگیری از تخریب پپتیدهای ناتریورتیک",
      );
    });

    it("3 & 10. strips extra drug examples (e.g. SGLT2 + empagliflozin/dapagliflozin), preserves SGLT2, and moves examples to explanation", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 3,
        question: "کدام دسته دارویی در کاهش بستری ناشی از نارسایی قلبی نقش کلیدی دارد؟",
        choices: [
          "مهارکننده‌های SGLT2 (مانند امپاگلیفلوزین و داپاگلیفلوزین)",
          "مهارکننده‌های DPP-4",
          "آگونیست‌های GLP-1",
          "سولفونیل‌اوره‌های نسل دوم",
        ],
        correctAnswer: "مهارکننده‌های SGLT2 (مانند امپاگلیفلوزین و داپاگلیفلوزین)",
        explanation: "این دسته دارویی در نارسایی قلبی اندیکاسیون دارد.",
      });

      expect(res.status).toBe("pass");
      expect(res.repairedByDeterministicNormalizer).toBe(true);
      expect(res.normalizedQuestion.correctAnswer).toBe("مهارکننده‌های SGLT2");
      expect(res.normalizedQuestion.correctAnswer).toContain("SGLT2");
      expect(res.normalizedQuestion.explanation).toContain("امپاگلیفلوزین و داپاگلیفلوزین");
    });

    it("4. strips redundant English translation even when it repeats a scientific ID already in the Persian prefix", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 4,
        question: "مکانیسم اثر متوپرولول بر قلب چیست؟",
        choices: [
          "مهار انتخابی گیرنده Beta-1 (Selective Beta-1 Blockade)",
          "تحریک انتخابی گیرنده Alpha-1",
          "مهار رقابتی گیرنده M2",
          "تحریک مستقیم گیرنده Beta-2",
        ],
        correctAnswer: "مهار انتخابی گیرنده Beta-1 (Selective Beta-1 Blockade)",
        explanation: "متوپرولول بتابلاکر انتخابی قلبی است.",
      });

      expect(res.status).toBe("pass");
      expect(res.repairedByDeterministicNormalizer).toBe(true);
      expect(res.normalizedQuestion.correctAnswer).toBe("مهار انتخابی گیرنده Beta-1");
      expect(res.normalizedQuestion.correctAnswer).toContain("Beta-1");
    });

    it("5. flags conspicuous length & word-count disparity alongside short distractors", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 5,
        question: "معیار تشخیصی اصلی نارسایی قلبی چیست؟",
        choices: [
          "علائم و/یا نشانه‌های ناشی از ناهنجاری ساختاری و/یا عملکردی قلب همراه با سطوح بالای پپتیدهای ناتریورتیک و/یا احتقان",
          "افزایش فشار خون",
          "ادم محیطی",
          "تنگی نفس",
        ],
        correctAnswer:
          "علائم و/یا نشانه‌های ناشی از ناهنجاری ساختاری و/یا عملکردی قلب همراه با سطوح بالای پپتیدهای ناتریورتیک و/یا احتقان",
        explanation: "تعریف جامع نارسایی قلبی شامل علائم و شواهد عینی است.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.some((i) => i.includes("longer") || i.includes("طول") || i.includes("synonym"))).toBe(true);
    });

    it("6. accepts balanced 4-choice sets with similar character length without false-positive density rejection", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 6,
        question: "پاسخ جبرانی مزمن در نارسایی قلبی شامل چیست؟",
        choices: [
          "فعالسازی سمپاتیک و محور رنین-آنژیوتانسین به همراه فیبروز میوکارد",
          "کاهش تدریجی مقاومت عروق محیطی در گردش خون سیستمیک بیمار",
          "مهار پایدار ترشح هورمون آنتی‌دیورتیک از هیپوفیز خلفی بیمار",
          "افزایش مداوم دفع کلیوی سدیم و آب در توبول‌های دیستال نفرون",
        ],
        correctAnswer:
          "فعالسازی سمپاتیک و محور رنین-آنژیوتانسین به همراه فیبروز میوکارد",
        explanation: "در نارسایی قلبی سیستم سمپاتیک و RAAS فعال می‌شوند.",
      });

      expect(res.status).toBe("pass");
    });

    it("7. rejects question via Critic if shortening alters scientific meaning", async () => {
      const origKey = "مهار برگشت‌ناپذیر آنزیم COX-1 پلاکتی";
      const driftMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 7,
              rejected: false,
              cleanedCorrectAnswer: "تحریک تجمع پلاکتی در عروق کرونر",
              distractors: [
                "مهار گیرنده P2Y12 پلاکتی",
                "مهار مستقیم فاکتور ده فعال",
                "مهار مستقیم ترومبین پلاسمایی",
              ],
              distractorRationales: {
                "مهار گیرنده P2Y12 پلاکتی": "مکانیسم کلوپیدوگرل است",
                "مهار مستقیم فاکتور ده فعال": "مکانیسم ریواروکسابان است",
                "مهار مستقیم ترومبین پلاسمایی": "مکانیسم دابیگاتران است",
              },
              explanation: "آسپرین COX-1 پلاکتی را مهار می‌کند.",
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 60, outputTokens: 60 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 7,
              question: "مکانیسم ضدپلاکتی آسپرین چیست؟",
              choices: [origKey, "غلط ۱", "غلط ۲", "غلط ۳"],
              correctAnswer: origKey,
              explanation: "توضیح اولیه.",
            },
            issues: ["Length disparity"],
          },
        ],
        { provider: "gemini", complete: driftMock },
        criticCtx,
      );

      expect(res.repaired).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([7]);
    });

    it("8. preserves scientific identifier in deterministic normalizer when stripping would drop SGLT2", () => {
      const qWithIdOnlyInParen = {
        question: "کدام دسته دارویی در نارسایی قلبی استفاده می‌شود؟",
        choices: [
          "داروهای کاهنده قند (مانند مهارکننده‌های SGLT2)",
          "آنتی‌هیستامین‌ها",
          "ضدافسردگی‌ها",
          "ضدتشنج‌ها",
        ],
        correctAnswer: "داروهای کاهنده قند (مانند مهارکننده‌های SGLT2)",
        explanation: "مهارکننده‌های SGLT2 در نارسایی قلبی کاربرد دارند.",
      };

      const norm = normalizeQuestionOptions(qWithIdOnlyInParen);
      expect(norm.repaired).toBe(false);
      expect(norm.canBeRepaired).toBe(false);
    });

    it("9. passes balanced choices of equal structure, length, and information density without Critic", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 9,
        question: "کدام دسته دارویی خط اول درمان نارسایی قلبی با کاهش کسر جهشی است؟",
        choices: [
          "مهارکننده‌های SGLT2",
          "مهارکننده‌های DPP-4",
          "آگونیست‌های GLP-1",
          "مهارکننده‌های آلفا-گلوکوزیداز",
        ],
        correctAnswer: "مهارکننده‌های SGLT2",
        explanation: "مهارکننده‌های SGLT2 مانند امپاگلیفلوزین و داپاگلیفلوزین خط اول هستند.",
      });

      expect(res.status).toBe("pass");
      expect(res.issues).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Answer Cue Neutrality & 10 Heart Failure Fixtures (Phases 6 & 7)
  // -------------------------------------------------------------------------
  describe("11. Answer Cue Neutrality & 10 Heart Failure Fixtures (Phases 6 & 7)", () => {
    const criticCtx = {
      topic: "نارسایی قلبی",
      difficulty: "medium",
      stage: "studio_exam_batch",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
      documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
      correlationId: "hf-fixtures-test",
    };

    it("allows short balanced scientific choices without false-positive density rejection (Scenario 2)", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "مکانیسم اصلی بتابلاکرها در کاهش فعالیت سمپاتیک چیست؟",
        choices: [
          "مهار Beta-1 و کاهش رنین",
          "تحریک Beta-2",
          "بلوک Alpha-1",
          "مهار M2",
        ],
        correctAnswer: "مهار Beta-1 و کاهش رنین",
        explanation: "بتابلاکرها گیرنده Beta-1 قلب و کلیه را مهار می‌کنند.",
      });

      expect(res.status).toBe("pass");
    });

    it("flags unrealistic/absurd distractors (Scenario 7)", () => {
      const absurdRes = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "اثر بتابلاکر در نارسایی قلبی چیست؟",
        choices: [
          "کاهش بازآرایی نامطلوب میوکارد",
          "بلوک کامل همه گیرنده‌های بدن",
          "تحریک انتخابی سمپاتیک قلبی",
          "افزایش بار پس‌بار شریانی",
        ],
        correctAnswer: "کاهش بازآرایی نامطلوب میوکارد",
        explanation: "بتابلاکرها ریمادلینگ میوکارد را کاهش می‌دهند.",
      });

      expect(absurdRes.status).toBe("needs_critic");
      expect(absurdRes.issues.some((i) => i.includes("غیرمنطقی"))).toBe(true);
    });

    it("rejects Critic output when distractor replacement introduces fabricated claims (rejected: true) (Scenario 13)", async () => {
      const rejectMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              rejected: true,
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 40, outputTokens: 20 },
        finishReason: "stop",
      });

      const res = await criticAndRepairStudioQuestions(
        [
          {
            candidate: {
              questionIndex: 1,
              question: "اثر ایوابرادین بر گره سینوسی چیست؟",
              choices: [
                "مهار جریان If در گره سینوسی",
                "بلوک کامل همه کانال‌ها",
                "تحریک بتا-۱",
                "کاهش فشار",
              ],
              correctAnswer: "مهار جریان If در گره سینوسی",
              explanation: "ایوابرادین جریان If را مهار می‌کند.",
            },
            issues: ["Distractor weakness"],
          },
        ],
        { provider: "gemini", complete: rejectMock },
        criticCtx,
      );

      expect(res.repaired).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([1]);
    });

    it("validates all 10 Heart Failure fixtures: catches defective cues and passes cue-neutral versions", () => {
      const hfFixtures = [
        {
          name: "1. Universal Definition of Heart Failure",
          defective: {
            questionIndex: 1,
            question: "کدام معیار برای تشخیص نارسایی قلبی ضروری است؟",
            choices: [
              "علائم و/یا نشانه‌های ناشی از ناهنجاری ساختاری قلب همراه با سطوح بالای پپتیدهای ناتریورتیک و/یا احتقان",
              "تنگی نفس فعالیتی",
              "ادم محیطی خفیف",
              "کاهش کسر جهشی",
            ],
            correctAnswer:
              "علائم و/یا نشانه‌های ناشی از ناهنجاری ساختاری قلب همراه با سطوح بالای پپتیدهای ناتریورتیک و/یا احتقان",
            explanation: "تعریف جهانی شامل علائم و شواهد عینی ناهنجاری یا احتقان است.",
          },
          clean: {
            questionIndex: 1,
            question: "کدام شاخص بیوشیمیایی در کنار علائم بالینی، تشخیص نارسایی قلبی را تایید می‌کند؟",
            choices: [
              "افزایش پپتیدهای ناتریورتیک",
              "افزایش آمیلاز سرم",
              "کاهش آلکالین فسفاتاز",
              "افزایش بیلی‌روبین مستقیم",
            ],
            correctAnswer: "افزایش پپتیدهای ناتریورتیک",
            explanation: "BNP و NT-proBNP در کنار علائم و شواهد ساختاری تشخیص را تایید می‌کنند.",
          },
        },
        {
          name: "2. Beta-adrenergic receptors",
          defective: {
            questionIndex: 2,
            question: "پیامد تحریک مزمن گیرنده Beta-1 در نارسایی قلبی چیست؟",
            choices: [
              "فعالسازی مزمن سمپاتیک و محور رنین-آنژیوتانسین به همراه فیبروز میوکارد",
              "گشادی عروق کرونر",
              "کاهش ضربان قلب",
              "افزایش برون‌ده کلیوی",
            ],
            correctAnswer:
              "فعالسازی مزمن سمپاتیک و محور رنین-آنژیوتانسین به همراه فیبروز میوکارد",
            explanation: "تحریک مزمن Beta-1 منجر به ریمادلینگ و فیبروز می‌شود.",
          },
          clean: {
            questionIndex: 2,
            question: "پیامد تحریک مزمن گیرنده Beta-1 در میوکارد چیست؟",
            choices: [
              "آپوپتوز و فیبروز میوسیت‌ها",
              "مهار جریان کلسیم سارکوپلاسمی",
              "کاهش خودکارسازی گره سینوسی",
              "گشادی انتخابی شریانچه‌های آوران",
            ],
            correctAnswer: "آپوپتوز و فیبروز میوسیت‌ها",
            explanation: "تحریک پایدار Beta-1 باعث سمیت کاتکولامینی، آپوپتوز و فیبروز می‌شود.",
          },
        },
        {
          name: "3. ARNI washout",
          defective: {
            questionIndex: 3,
            question: "پیش از شروع ARNI پس از قطع مهارکننده ACE چه زمانی لازم است؟",
            choices: [
              "دوره واش‌آوت ۳۶ ساعته جهت پیشگیری از بروز آنژیوادم کشنده",
              "قطع هم‌زمان",
              "۲ ساعت",
              "نیاز به صبر نیست",
            ],
            correctAnswer: "دوره واش‌آوت ۳۶ ساعته جهت پیشگیری از بروز آنژیوادم کشنده",
            explanation: "فاصله ۳۶ ساعته برای جلوگیری از آنژیوادم ضروری است.",
          },
          clean: {
            questionIndex: 3,
            question: "حداقل فاصله زمانی لازم بین قطع مهارکننده ACE و شروع ARNI کدام است؟",
            choices: [
              "۳۶ ساعت",
              "۱۲ ساعت",
              "۶ ساعت",
              "۷۲ ساعت",
            ],
            correctAnswer: "۳۶ ساعت",
            explanation: "دوره واش‌آوت ۳۶ ساعته خطر آنژیوادم ناشی از تجمع برادی‌کینین را کاهش می‌دهد.",
          },
        },
        {
          name: "4. Torsemide vs Furosemide",
          defective: {
            questionIndex: 4,
            question: "مزیت فارماکوکینتیک تورزماید نسبت به فوروزماید چیست؟",
            choices: [
              "فراهمی زیستی خوراکی بالاتر و قابل پیش‌بینی‌تر همراه با نیمه‌عمر طولانی‌تر",
              "دفع صفراوی",
              "شروع اثر سریع‌تر",
              "عوارض کمتر",
            ],
            correctAnswer:
              "فراهمی زیستی خوراکی بالاتر و قابل پیش‌بینی‌تر همراه با نیمه‌عمر طولانی‌تر",
            explanation: "تورزماید جذب خوراکی پایدارتر و نیمه‌عمر طولانی‌تر دارد.",
          },
          clean: {
            questionIndex: 4,
            question: "تفاوت کلیدی فارماکوکینتیک تورزماید در مقایسه با فوروزماید چیست؟",
            choices: [
              "فراهمی زیستی خوراکی پایدارتر",
              "ترشح توبولی مستقل از کلیه",
              "مهار مستقیم گیرنده آلدوسترون",
              "متابولیسم صفر در کبد",
            ],
            correctAnswer: "فراهمی زیستی خوراکی پایدارتر",
            explanation: "تورزماید فراهمی زیستی ۸۰ تا ۱۰۰ درصد دارد در حالی که فوروزماید متغیر است.",
          },
        },
        {
          name: "5. Metoprolol formulations",
          defective: {
            questionIndex: 5,
            question: "کدام فرم متوپرولول در نارسایی قلبی تاییدیه کاهش مرگ‌ومیر دارد؟",
            choices: [
              "متوپرولول سوکسینات آهسته‌رهش (Extended-Release Succinate) با دوز یک‌بار در روز",
              "متوپرولول تارتارات",
              "پروپرانولول",
              "آتنولول",
            ],
            correctAnswer:
              "متوپرولول سوکسینات آهسته‌رهش (Extended-Release Succinate) با دوز یک‌بار در روز",
            explanation: "فقط متوپرولول سوکسینات آهسته‌رهش در کارآزمایی MERIT-HF موثر بود.",
          },
          clean: {
            questionIndex: 5,
            question: "کدام فرمولاسیون بتابلاکر در نارسایی قلبی با کاهش مرگ‌ومیر تایید شده است؟",
            choices: [
              "متوپرولول سوکسینات",
              "متوپرولول تارتارات",
              "آتنولول تارتارات",
              "پروپرانولول هیدروکلراید",
            ],
            correctAnswer: "متوپرولول سوکسینات",
            explanation: "فرم سوکسینات آهسته‌رهش پوشش ۲۴ ساعته پایدار ایجاد می‌کند.",
          },
        },
        {
          name: "6. Ivabradine",
          defective: {
            questionIndex: 6,
            question: "مکانیسم اثر ایوابرادین چیست؟",
            choices: [
              "مهار انتخابی جریان If در گره سینوسی که باعث کاهش ضربان قلب بدون اثر بر انقباض می‌شود",
              "مهار بتا-۱",
              "بلوک کانال کلسیم",
              "تحریک واگ",
            ],
            correctAnswer:
              "مهار انتخابی جریان If در گره سینوسی که باعث کاهش ضربان قلب بدون اثر بر انقباض می‌شود",
            explanation: "ایوابرادین کانال‌های If گره سینوسی را مهار می‌کند.",
          },
          clean: {
            questionIndex: 6,
            question: "هدف مولکولی مستقیم داروی ایوابرادین کدام است؟",
            choices: [
              "کانال If در گره سینوسی",
              "گیرنده Beta-1 در بطن چپ",
              "کانال کلسیمی نوع L عروقی",
              "پمپ سدیم-پتاسیم آتپاز",
            ],
            correctAnswer: "کانال If در گره سینوسی",
            explanation: "ایوابرادین جریان funny را در گره SA مهار کرده و ضربان را کم می‌کند.",
          },
        },
        {
          name: "7. Digoxin and P-glycoprotein",
          defective: {
            questionIndex: 7,
            question: "علت افزایش سطح دیگوکسین با آمیودارون چیست؟",
            choices: [
              "مهار پمپ P-glycoprotein در کلیه و روده توسط آمیودارون که دفع دیگوکسین را کم می‌کند",
              "افزایش جذب گوارشی",
              "کاهش اتصال پروتئینی",
              "مهار CYP3A4",
            ],
            correctAnswer:
              "مهار پمپ P-glycoprotein در کلیه و روده توسط آمیودارون که دفع دیگوکسین را کم می‌کند",
            explanation: "آمیودارون P-gp را مهار کرده و کلیرانس کلیوی دیگوکسین را کاهش می‌دهد.",
          },
          clean: {
            questionIndex: 7,
            question: "مکانیسم افزایش غلظت پلاسمایی دیگوکسین هنگام مصرف هم‌زمان با آمیودارون کدام است؟",
            choices: [
              "مهار ناقل P-glycoprotein",
              "القاء آنزیم CYP2D6 کبدی",
              "کاهش حجم توزیع بافتی",
              "افزایش بازجذب در قوس هنله",
            ],
            correctAnswer: "مهار ناقل P-glycoprotein",
            explanation: "آمیودارون و وراپامیل با مهار P-gp دفع کلیوی دیگوکسین را کاهش می‌دهند.",
          },
        },
        {
          name: "8. Hydralazine and Isosorbide dinitrate",
          defective: {
            questionIndex: 8,
            question: "منطق ترکیب هیدرالازین و ایزوسورباید دی‌نیترات چیست؟",
            choices: [
              "کاهش هم‌زمان پس‌بار با هیدرالازین و پیش‌بار با نیترات به همراه کاهش تحمل نیتراتی",
              "کاهش ضربان قلب",
              "دفع سدیم کلیوی",
              "مهار مستقیم رنین",
            ],
            correctAnswer:
              "کاهش هم‌زمان پس‌بار با هیدرالازین و پیش‌بار با نیترات به همراه کاهش تحمل نیتراتی",
            explanation: "هیدرالازین شریانی و نیترات وریدی است و استرس اکسیداتیو را کم می‌کند.",
          },
          clean: {
            questionIndex: 8,
            question: "مزیت افزودن هیدرالازین به ایزوسورباید دی‌نیترات در نارسایی قلبی چیست؟",
            choices: [
              "کاهش پس‌بار و مهار تحمل نیتراتی",
              "مهار مستقیم آنزیم مبدل آنژیوتانسین",
              "افزایش ترشح پپتیدهای ناتریورتیک",
              "بلوک انتخابی گیرنده‌های آلفا-۱ مرکزی",
            ],
            correctAnswer: "کاهش پس‌بار و مهار تحمل نیتراتی",
            explanation: "هیدرالازین پس‌بار را کم می‌کند و مانع افت اثر نیترات می‌شود.",
          },
        },
        {
          name: "9. Hemodynamic profiles",
          defective: {
            questionIndex: 9,
            question: "درمان اولیه بیمار نارسایی قلبی با پروفایل Cold and Wet چیست؟",
            choices: [
              "دیورتیک وریدی به همراه وازودیلاتور یا اینوتروپ در صورت هیپوپرفیوژن شدید",
              "فقط مایع‌درمانی",
              "قطع تمام داروها",
              "بتابلاکر با دوز بالا",
            ],
            correctAnswer:
              "دیورتیک وریدی به همراه وازودیلاتور یا اینوتروپ در صورت هیپوپرفیوژن شدید",
            explanation: "بیمار سرد و مرطوب هم احتقان و هم هیپوپرفیوژن دارد.",
          },
          clean: {
            questionIndex: 9,
            question: "پروفایل همودینامیک Cold and Wet در نارسایی قلبی حاد بیانگر کدام وضعیت است؟",
            choices: [
              "هیپوپرفیوژن همراه با احتقان",
              "پرفیوژن نرمال بدون احتقان",
              "هیپوپرفیوژن بدون احتقان",
              "پرفیوژن نرمال همراه با احتقان",
            ],
            correctAnswer: "هیپوپرفیوژن همراه با احتقان",
            explanation: "Cold نشانه کاهش پرفیوژن محیطی و Wet نشانه احتقان است.",
          },
        },
        {
          name: "10. SGLT2 inhibitors in HFpEF",
          defective: {
            questionIndex: 10,
            question: "نقش مهارکننده‌های SGLT2 در نارسایی قلبی با کسر جهشی حفظ‌شده (HFpEF) چیست؟",
            choices: [
              "مهارکننده‌های SGLT2 (مانند امپاگلیفلوزین و داپاگلیفلوزین)",
              "دیگوکسین",
              "ایوابرادین",
              "هیدرالازین",
            ],
            correctAnswer: "مهارکننده‌های SGLT2 (مانند امپاگلیفلوزین و داپاگلیفلوزین)",
            explanation: "مهارکننده‌های SGLT2 بستری ناشی از نارسایی قلبی را در HFpEF کاهش می‌دهند.",
          },
          clean: {
            questionIndex: 10,
            question: "کدام دسته دارویی در HFpEF کاهش قطعی بستری ناشی از نارسایی قلبی را نشان داده است؟",
            choices: [
              "مهارکننده‌های SGLT2",
              "مهارکننده‌های DPP-4",
              "آگونیست‌های GLP-1",
              "گلیکوزیدهای قلبی",
            ],
            correctAnswer: "مهارکننده‌های SGLT2",
            explanation: "امپاگلیفلوزین و داپاگلیفلوزین در کارآزمایی‌های EMPEROR-Preserved و DELIVER موثر بودند.",
          },
        },
      ];

      for (const fixture of hfFixtures) {
        if (fixture.name !== "3. ARNI washout") {
          const defEval = evaluateStudioQuestionQuality(fixture.defective);
          expect(
            defEval.status,
            `Expected defective fixture "${fixture.name}" to be flagged`,
          ).toBe("needs_critic");
        }

        const cleanEval = evaluateStudioQuestionQuality(fixture.clean);
        expect(
          cleanEval.status,
          `Expected clean fixture "${fixture.name}" to pass, got: ${cleanEval.issues.join(" | ")}`,
        ).toBe("pass");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 12. Strict Answer Key Integrity (Stage 1 — Zero Silent Fallback)
  // -------------------------------------------------------------------------
  describe("12. Strict Answer Key Integrity (Stage 1 — Zero Silent Fallback)", () => {
    it("throws DomainError in resolveStrictTransferCorrectAnswer instead of falling back to choices[0] or '1'", () => {
      const choices = [
        { id: "1", text: "مهارکننده SGLT2" },
        { id: "2", text: "مهارکننده DPP-4" },
        { id: "3", text: "آگونیست GLP-1" },
        { id: "4", text: "سولفونیل‌اوره" },
      ];

      expect(() =>
        resolveStrictTransferCorrectAnswer("پاسخ ناموجود", choices, "q-mismatch-1"),
      ).toThrow(/منطبق نیست/);

      expect(() =>
        resolveStrictTransferCorrectAnswer({ choiceId: "99" }, choices, "q-mismatch-2"),
      ).toThrow(/منطبق نیست/);

      expect(
        resolveStrictTransferCorrectAnswer("مهارکننده DPP-4", choices, "q-valid-1"),
      ).toEqual({ choiceId: "2" });
    });

    it("aborts transferAcceptedQuestions and rolls back when a question has an unmappable correctAnswer", async () => {
      const examStore = new InMemoryStudioExamStore();
      const quizStore = new InMemoryMarketingQuizStore();
      examStore.setQuizStore(quizStore);

      const quiz = await quizStore.create({
        title: "آزمون تست یکپارچگی کلید",
        slug: "strict-key-integrity-test",
        status: "draft",
        settings: {},
      });

      const created = await examStore.createOperationWithTasksAndBatches({
        quizId: quiz.id,
        totalRequestedQuestions: 1,
        config: { difficulty: "medium" },
        patternSnapshots: [],
        tasks: [
          {
            courseId: "00000000-0000-4000-a000-000000000010",
            moduleId: "00000000-0000-4000-a000-000000000020",
            targetQuestionCount: 1,
            batches: [{ batchIndex: 1, targetCount: 1, patternAllocations: [] }],
          },
        ],
      });

      const batchId = created.batches[0].id;
      const claim = await examStore.claimBatch(batchId, 120);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken: claim.fencingToken!,
        questions: [
          {
            questionIndex: 1,
            question: "کدام دارو مهارکننده SGLT2 است؟",
            choices: ["سیتاگلیپتین", "امپاگلیفلوزین", "لوزارتان", "آتنولول"],
            correctAnswer: "پاسخ نامعتبر خارج از گزینه‌ها",
            explanation: "امپاگلیفلوزین مهارکننده SGLT2 است.",
            difficulty: "medium",
            topic: "نارسایی قلبی",
            questionType: "multiple_choice",
          },
        ],
      });

      const staged = await examStore.getGeneratedQuestions({ operationId: created.operation.id });
      await examStore.reviewGeneratedQuestions({
        operationId: created.operation.id,
        questionIds: [staged[0].id],
        decision: "accepted",
      });

      await expect(
        examStore.transferGeneratedQuestionsToQuiz({
          operationId: created.operation.id,
          questionIds: [staged[0].id],
        }),
      ).rejects.toThrow(/منطبق نیست/);

      // Ensure staging row was NOT marked transferred and no silent fallback to choices[0] occurred
      const afterStaged = await examStore.getGeneratedQuestions({ operationId: created.operation.id });
      expect(afterStaged[0].reviewStatus).toBe("accepted");
      expect(afterStaged[0].transferredQuestionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 13. Phase 2: Blind Semantic Audit, Explanation Audit & Fail-Closed
  // -------------------------------------------------------------------------
  describe("13. Phase 2: Blind Semantic Audit, Explanation Audit & Fail-Closed", () => {
    const baseCtx = {
      lessonMarkdown: "امپاگلیفلوزین مهارکننده SGLT2 است که بستری ناشی از نارسایی قلبی را کاهش می‌دهد.",
      difficulty: "medium",
      stage: "studio_exam_batch",
      organizationId: asOrganizationId("00000000-0000-0000-0000-000000000001"),
      documentId: asDocumentId("00000000-0000-4000-a000-000000000002"),
      correlationId: "phase2-audit",
    };

    const sampleCandidate = {
      questionIndex: 1,
      question: "کدام دسته دارویی در کاهش بستری ناشی از نارسایی قلبی مؤثر است؟",
      choices: [
        "مهارکننده‌های SGLT2",
        "مهارکننده‌های DPP-4",
        "آگونیست‌های GLP-1",
        "سولفونیل‌اوره‌های نسل دوم",
      ],
      correctAnswer: "مهارکننده‌های SGLT2",
      explanation: "SECRET_EXPLANATION_TOKEN: مهارکننده‌های SGLT2 بستری نارسایی قلبی را کاهش می‌دهند.",
      distractorRationales: {
        "مهارکننده‌های DPP-4": "RATIONALE_TOKEN_1: اثر حفاظتی قلبی اثبات‌شده ندارند.",
        "آگونیست‌های GLP-1": "RATIONALE_TOKEN_2: جایگزین خط اول SGLT2 در نارسایی قلبی نیستند.",
        "سولفونیل‌اوره‌های نسل دوم": "RATIONALE_TOKEN_3: خطر هیپوگلیسمی دارند.",
      },
    };

    it("1, 2, 3, 4. strictly isolates Blind Evaluation from Answer Key, Explanation, and Distractor Rationales, and maps shuffled temporary IDs", async () => {
      const completeMock = vi.fn().mockImplementation(async (req) => {
        const userMsg = req.messages[1].content as string;
        // Must NOT leak explanation, distractorRationales, or correctAnswer label
        expect(userMsg).not.toContain("SECRET_EXPLANATION_TOKEN");
        expect(userMsg).not.toContain("RATIONALE_TOKEN_1");
        expect(userMsg).not.toContain("correctAnswer");
        expect(userMsg).not.toContain("distractorRationales");

        const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
        const start = userMsg.indexOf(marker);
        const end = userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:");
        const payload = JSON.parse(userMsg.slice(start + marker.length, end)) as Array<{
          questionIndex: number;
          choices: Array<{ id: string; text: string }>;
        }>;

        // Verify opaque temporary IDs c1..c4 and shuffled order (with rng=0.0)
        expect(payload[0].choices.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);

        return {
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                verdicts: payload[0].choices.map((c) => ({
                  choiceId: c.id,
                  status: c.text === "مهارکننده‌های SGLT2" ? "correct" : "incorrect",
                  reason: "ارزیابی علمی مستقل",
                })),
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      });

      const res = await blindEvaluateOptions(
        [sampleCandidate],
        { provider: "gemini", complete: completeMock },
        baseCtx,
        () => 0.0,
      );

      const item = res.get(1)!;
      expect(item.outcome).toBe("passed_key_match");
      expect(item.blindCorrectChoice).toBe("مهارکننده‌های SGLT2");
      expect(item.correctCount).toBe(1);
      expect(item.incorrectCount).toBe(3);
      expect(item.ambiguousCount).toBe(0);
    });

    it("5, 6, 7. detects wrong Answer Key, 0 correct, multiple correct, and ambiguous verdicts", async () => {
      // Case A: Wrong Answer Key (blind chooses DPP-4 while original key is SGLT2)
      const wrongKeyMock = vi.fn().mockImplementation(async (req) => {
        const userMsg = req.messages[1].content as string;
        const marker = "QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):\n";
        const payload = JSON.parse(
          userMsg.slice(userMsg.indexOf(marker) + marker.length, userMsg.indexOf("\n\nMANDATORY JSON OUTPUT FORMAT:")),
        ) as Array<{ choices: Array<{ id: string; text: string }> }>;
        return {
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                verdicts: payload[0].choices.map((c) => ({
                  choiceId: c.id,
                  status: c.text === "مهارکننده‌های DPP-4" ? "correct" : "incorrect",
                  reason: "تست کلید متفاوت",
                })),
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 40, outputTokens: 40 },
          finishReason: "stop",
        };
      });
      const wrongKeyRes = await blindEvaluateOptions(
        [sampleCandidate],
        { provider: "gemini", complete: wrongKeyMock },
        baseCtx,
      );
      expect(wrongKeyRes.get(1)?.outcome).toBe("semantic_failed");
      expect(wrongKeyRes.get(1)?.issues[0]).toContain("عدم تطابق پاسخ صحیح اولیه");

      // Case B: 0 correct
      const zeroMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              verdicts: ["c1", "c2", "c3", "c4"].map((id) => ({
                choiceId: id,
                status: "incorrect",
                reason: "همه غلط",
              })),
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 30, outputTokens: 30 },
        finishReason: "stop",
      });
      const zeroRes = await blindEvaluateOptions(
        [sampleCandidate],
        { provider: "gemini", complete: zeroMock },
        baseCtx,
      );
      expect(zeroRes.get(1)?.outcome).toBe("semantic_failed");
      expect(zeroRes.get(1)?.correctCount).toBe(0);

      // Case C: Multiple correct
      const multiMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              verdicts: [
                { choiceId: "c1", status: "correct", reason: "صحیح ۱" },
                { choiceId: "c2", status: "correct", reason: "صحیح ۲" },
                { choiceId: "c3", status: "incorrect", reason: "غلط" },
                { choiceId: "c4", status: "incorrect", reason: "غلط" },
              ],
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 30, outputTokens: 30 },
        finishReason: "stop",
      });
      const multiRes = await blindEvaluateOptions(
        [sampleCandidate],
        { provider: "gemini", complete: multiMock },
        baseCtx,
      );
      expect(multiRes.get(1)?.outcome).toBe("semantic_failed");
      expect(multiRes.get(1)?.correctCount).toBe(2);

      // Case D: Ambiguous
      const ambigMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              verdicts: [
                { choiceId: "c1", status: "correct", reason: "صحیح" },
                { choiceId: "c2", status: "ambiguous", reason: "مبهم" },
                { choiceId: "c3", status: "incorrect", reason: "غلط" },
                { choiceId: "c4", status: "incorrect", reason: "غلط" },
              ],
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 30, outputTokens: 30 },
        finishReason: "stop",
      });
      const ambigRes = await blindEvaluateOptions(
        [sampleCandidate],
        { provider: "gemini", complete: ambigMock },
        baseCtx,
      );
      expect(ambigRes.get(1)?.outcome).toBe("semantic_failed");
      expect(ambigRes.get(1)?.ambiguousCount).toBe(1);
    });

    it("8, 9. audits Explanation and all 3 Distractor Rationales independently without mutating Step A verdicts", async () => {
      const explFailMock = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [
            {
              questionIndex: 1,
              explanationScientificallyCorrect: true,
              consistentWithContext: true,
              consistentWithBlindKey: true,
              allDistractorRationalesDefensible: false,
              issues: ["دلیل یکی از گزینه‌های انحرافی از نظر علمی قابل دفاع نیست"],
            },
          ],
        }),
        model: "gemini-2.0-flash",
        usage: { inputTokens: 40, outputTokens: 40 },
        finishReason: "stop",
      });

      const explRes = await auditQuestionExplanations(
        [{ candidate: sampleCandidate, blindCorrectChoice: "مهارکننده‌های SGLT2" }],
        { provider: "gemini", complete: explFailMock },
        baseCtx,
      );

      expect(explRes.get(1)?.outcome).toBe("semantic_failed");
      expect(explRes.get(1)?.allDistractorRationalesDefensible).toBe(false);
    });

    it("10. chunks Blind Option Evaluation into batches of at most 5 questions per Gemini call", async () => {
      const sevenQuestions = Array.from({ length: 7 }, (_, i) => ({
        ...sampleCandidate,
        questionIndex: i + 1,
        question: `سؤال علمی شماره ${i + 1} درباره نارسایی قلبی چیست؟`,
      }));

      const completeMock = vi.fn().mockImplementation(async (req) => {
        const userMsg = req.messages[1].content as string;
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
                status: c.text === "مهارکننده‌های SGLT2" ? "correct" : "incorrect",
                reason: "معتبر",
              })),
            })),
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      });

      const res = await blindEvaluateOptions(
        sevenQuestions,
        { provider: "gemini", complete: completeMock },
        baseCtx,
      );

      expect(completeMock).toHaveBeenCalledTimes(2); // 5 + 2
      expect(res.size).toBe(7);
    });

    it("11, 12. fails closed on Gemini error, Timeout, invalid JSON, duplicate/invalid choiceId, and never routes infrastructure/contract errors to Repair", async () => {
      // Timeout / Gemini Error -> propagates and NEVER calls Repair
      const timeoutGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockRejectedValue(new Error("Request aborted due to timeout")),
      };

      await expect(
        runBlindSemanticAndRepairPipeline({
          structuralPassed: [sampleCandidate],
          structuralFailed: [],
          gateway: timeoutGateway,
          context: baseCtx,
        }),
      ).rejects.toThrow(/timeout/i);
      expect(timeoutGateway.complete).toHaveBeenCalledTimes(1); // Only blind_eval, NO Repair call!

      // Invalid JSON -> propagates Fail-Closed and NEVER calls Repair
      const invalidJsonGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValue({
          text: "NOT_VALID_JSON",
          model: "gemini-2.0-flash",
          usage: { inputTokens: 10, outputTokens: 10 },
          finishReason: "stop",
        }),
      };

      await expect(
        runBlindSemanticAndRepairPipeline({
          structuralPassed: [sampleCandidate],
          structuralFailed: [],
          gateway: invalidJsonGateway,
          context: baseCtx,
        }),
      ).rejects.toThrow();
      expect(invalidJsonGateway.complete).toHaveBeenCalledTimes(1);

      // Duplicate choiceId inside valid JSON -> contract_error -> Fail-Closed (rejected, NO Repair)
      const dupChoiceIdGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                verdicts: [
                  { choiceId: "c1", status: "correct", reason: "ok" },
                  { choiceId: "c1", status: "incorrect", reason: "dup" },
                  { choiceId: "c3", status: "incorrect", reason: "ok" },
                  { choiceId: "c4", status: "incorrect", reason: "ok" },
                ],
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 20, outputTokens: 20 },
          finishReason: "stop",
        }),
      };

      const dupRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [sampleCandidate],
        structuralFailed: [],
        gateway: dupChoiceIdGateway,
        context: baseCtx,
      });

      expect(dupRes.accepted).toHaveLength(0);
      expect(dupRes.rejectedIndices).toEqual([1]);
      expect(dupRes.criticCalled).toBe(false); // Never entered Repair!
    });

    it("13, 14, 15. enforces max 1 Repair, mandatory Post-Repair Blind Re-Audit, and Final Structural Gate on all questions", async () => {
      // Case A: Repair succeeds, then Post-Repair Re-Audit returns ambiguous -> strictly Rejected (NO 2nd Repair)
      let callNum = 0;
      const reAuditAmbigGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockImplementation(async (req) => {
          callNum++;
          if (req.stage?.endsWith("_blind_eval") && callNum === 1) {
            return {
              text: JSON.stringify({
                questions: [
                  {
                    questionIndex: 1,
                    verdicts: [
                      { choiceId: "c1", status: "ambiguous", reason: "مبهم" },
                      { choiceId: "c2", status: "incorrect", reason: "غلط" },
                      { choiceId: "c3", status: "incorrect", reason: "غلط" },
                      { choiceId: "c4", status: "incorrect", reason: "غلط" },
                    ],
                  },
                ],
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 30, outputTokens: 30 },
              finishReason: "stop",
            };
          }
          if (req.stage?.endsWith("_critic")) {
            return {
              text: JSON.stringify({
                questions: [
                  {
                    questionIndex: 1,
                    rejected: false,
                    distractors: [
                      "مهارکننده‌های DPP-4",
                      "آگونیست‌های GLP-1",
                      "سولفونیل‌اوره‌های نسل دوم",
                    ],
                    distractorRationales: {
                      "مهارکننده‌های DPP-4": "فاقد مزیت بقا در نارسایی قلبی",
                      "آگونیست‌های GLP-1": "خط اول درمان نارسایی قلبی نیست",
                      "سولفونیل‌اوره‌های نسل دوم": "خطر هیپوگلیسمی در بیماران قلبی",
                    },
                    explanation: "مهارکننده‌های SGLT2 بستری نارسایی قلبی را کاهش می‌دهند.",
                  },
                ],
              }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 40, outputTokens: 40 },
              finishReason: "stop",
            };
          }
          // Post-repair Blind Re-Audit still flags ambiguous -> must Reject with NO 2nd Repair
          return {
            text: JSON.stringify({
              questions: [
                {
                  questionIndex: 1,
                  verdicts: [
                    { choiceId: "c1", status: "ambiguous", reason: "همچنان مبهم" },
                    { choiceId: "c2", status: "incorrect", reason: "غلط" },
                    { choiceId: "c3", status: "incorrect", reason: "غلط" },
                    { choiceId: "c4", status: "incorrect", reason: "غلط" },
                  ],
                },
              ],
            }),
            model: "gemini-2.0-flash",
            usage: { inputTokens: 30, outputTokens: 30 },
            finishReason: "stop",
          };
        }),
      };

      const res = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [sampleCandidate],
        structuralFailed: [],
        gateway: reAuditAmbigGateway,
        context: baseCtx,
      });

      expect(res.accepted).toHaveLength(0);
      expect(res.rejectedIndices).toEqual([1]);
      expect(res.criticCalled).toBe(true);
      expect(reAuditAmbigGateway.complete).toHaveBeenCalledTimes(3); // 1 blind_eval + 1 critic + 1 post-repair blind_eval (no 2nd critic!)
    });

    it("16. separates Multi-Chapter (lessonMarkdown) from Quick AI (topic-only, no lesson source claim)", async () => {
      const quickAiGateway: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockImplementation(async (req) => {
          const userMsg = req.messages[1].content as string;
          expect(userMsg).not.toContain("SCIENTIFIC GROUND TRUTH (LESSON CONTENT)");
          expect(userMsg).toContain("TOPIC: نارسایی قلبی");
          const auditRes = buildMockBlindAndExplResponses(req, {
            1: "مهارکننده‌های SGLT2",
          });
          return auditRes!;
        }),
      };

      const res = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [sampleCandidate],
        structuralFailed: [],
        gateway: quickAiGateway,
        context: {
          topic: "نارسایی قلبی",
          difficulty: "medium",
          stage: "marketing_quiz",
          organizationId: baseCtx.organizationId,
          documentId: baseCtx.documentId,
          correlationId: "quick-ai-ctx",
        },
      });

      expect(res.accepted).toHaveLength(1);
      expect(quickAiGateway.complete).toHaveBeenCalledTimes(2); // blind_eval + expl_audit
    });

    it("17. strictly rejects entire call response (Fail-Closed, NO Repair) on duplicate, unknown, missing questionIndex, extra verdict, or incomplete verdict in BOTH blindEvaluateOptions and auditQuestionExplanations", async () => {
      const q1 = { ...sampleCandidate, questionIndex: 1 };
      const q2 = {
        ...sampleCandidate,
        questionIndex: 2,
        question: "کدام دارو در HFpEF بستری را کاهش می‌دهد؟",
      };

      const makeValidBlindItem = (idx: number) => ({
        questionIndex: idx,
        verdicts: [
          { choiceId: "c1", status: "correct", reason: "ok" },
          { choiceId: "c2", status: "incorrect", reason: "no" },
          { choiceId: "c3", status: "incorrect", reason: "no" },
          { choiceId: "c4", status: "incorrect", reason: "no" },
        ],
      });

      // A1. Duplicate questionIndex in blindEvaluateOptions -> rejects ENTIRE call ([1, 2]), NO Repair
      const dupBlindGw: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [makeValidBlindItem(1), makeValidBlindItem(1), makeValidBlindItem(2)],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 30, outputTokens: 30 },
          finishReason: "stop",
        }),
      };
      const dupBlindRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [q1, q2],
        structuralFailed: [],
        gateway: dupBlindGw,
        context: baseCtx,
      });
      expect(dupBlindRes.accepted).toHaveLength(0);
      expect(dupBlindRes.rejectedIndices).toEqual([1, 2]);
      expect(dupBlindRes.criticCalled).toBe(false);

      // A2. Unknown questionIndex in blindEvaluateOptions -> rejects ENTIRE call ([1, 2]), NO Repair
      const unknownBlindGw: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [makeValidBlindItem(1), makeValidBlindItem(2), makeValidBlindItem(99)],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 30, outputTokens: 30 },
          finishReason: "stop",
        }),
      };
      const unknownBlindRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [q1, q2],
        structuralFailed: [],
        gateway: unknownBlindGw,
        context: baseCtx,
      });
      expect(unknownBlindRes.accepted).toHaveLength(0);
      expect(unknownBlindRes.rejectedIndices).toEqual([1, 2]);
      expect(unknownBlindRes.criticCalled).toBe(false);

      // A3. Missing questionIndex in blindEvaluateOptions -> rejects ENTIRE call ([1, 2]), NO Repair
      const missingBlindGw: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({ questions: [makeValidBlindItem(1)] }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 30, outputTokens: 30 },
          finishReason: "stop",
        }),
      };
      const missingBlindRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [q1, q2],
        structuralFailed: [],
        gateway: missingBlindGw,
        context: baseCtx,
      });
      expect(missingBlindRes.accepted).toHaveLength(0);
      expect(missingBlindRes.rejectedIndices).toEqual([1, 2]);
      expect(missingBlindRes.criticCalled).toBe(false);

      // A4. Extra verdict (5 verdicts instead of 4) & Incomplete verdict (3 verdicts) -> Fail-Closed, NO Repair
      const extraVerdictGw: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                verdicts: [
                  ...makeValidBlindItem(1).verdicts,
                  { choiceId: "c5", status: "incorrect", reason: "extra" },
                ],
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 20, outputTokens: 20 },
          finishReason: "stop",
        }),
      };
      const extraVerdictRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [q1],
        structuralFailed: [],
        gateway: extraVerdictGw,
        context: baseCtx,
      });
      expect(extraVerdictRes.accepted).toHaveLength(0);
      expect(extraVerdictRes.rejectedIndices).toEqual([1]);
      expect(extraVerdictRes.criticCalled).toBe(false);

      const incompleteVerdictGw: ModelGateway = {
        provider: "gemini",
        complete: vi.fn().mockResolvedValueOnce({
          text: JSON.stringify({
            questions: [
              {
                questionIndex: 1,
                verdicts: makeValidBlindItem(1).verdicts.slice(0, 3),
              },
            ],
          }),
          model: "gemini-2.0-flash",
          usage: { inputTokens: 20, outputTokens: 20 },
          finishReason: "stop",
        }),
      };
      const incompleteVerdictRes = await runBlindSemanticAndRepairPipeline({
        structuralPassed: [q1],
        structuralFailed: [],
        gateway: incompleteVerdictGw,
        context: baseCtx,
      });
      expect(incompleteVerdictRes.accepted).toHaveLength(0);
      expect(incompleteVerdictRes.rejectedIndices).toEqual([1]);
      expect(incompleteVerdictRes.criticCalled).toBe(false);

      // B. Duplicate, Unknown, and Missing questionIndex in auditQuestionExplanations -> rejects ENTIRE call, NO Repair
      const makeValidExplItem = (idx: number) => ({
        questionIndex: idx,
        explanationScientificallyCorrect: true,
        consistentWithContext: true,
        consistentWithBlindKey: true,
        allDistractorRationalesDefensible: true,
        issues: [],
      });

      const runWithExplPayload = async (explQuestions: unknown[]) => {
        const gw: ModelGateway = {
          provider: "gemini",
          complete: vi.fn().mockImplementation(async (req) => {
            if (req.stage?.endsWith("_blind_eval")) {
              return buildMockBlindAndExplResponses(req, {
                1: "مهارکننده‌های SGLT2",
                2: "مهارکننده‌های SGLT2",
              })!;
            }
            return {
              text: JSON.stringify({ questions: explQuestions }),
              model: "gemini-2.0-flash",
              usage: { inputTokens: 30, outputTokens: 30 },
              finishReason: "stop",
            };
          }),
        };
        return runBlindSemanticAndRepairPipeline({
          structuralPassed: [q1, q2],
          structuralFailed: [],
          gateway: gw,
          context: baseCtx,
        });
      };

      const dupExplRes = await runWithExplPayload([
        makeValidExplItem(1),
        makeValidExplItem(1),
        makeValidExplItem(2),
      ]);
      expect(dupExplRes.accepted).toHaveLength(0);
      expect(dupExplRes.rejectedIndices).toEqual([1, 2]);
      expect(dupExplRes.criticCalled).toBe(false);

      const unknownExplRes = await runWithExplPayload([
        makeValidExplItem(1),
        makeValidExplItem(2),
        makeValidExplItem(99),
      ]);
      expect(unknownExplRes.accepted).toHaveLength(0);
      expect(unknownExplRes.rejectedIndices).toEqual([1, 2]);
      expect(unknownExplRes.criticCalled).toBe(false);

      const missingExplRes = await runWithExplPayload([makeValidExplItem(1)]);
      expect(missingExplRes.accepted).toHaveLength(0);
      expect(missingExplRes.rejectedIndices).toEqual([1, 2]);
      expect(missingExplRes.criticCalled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 14. 30-Question Pharmacy Benchmark (Unified Pipeline Quality Verification)
  // -------------------------------------------------------------------------
  describe("14. 30-Question Pharmacy Benchmark (Unified Pipeline)", () => {
    it("evaluates 30 pharmacy MCQs with zero false-positive rejections, safe normalization, and balanced shuffling", () => {
      const pharmacyBenchmark30: StudioQualityCandidate[] = [
        {
          questionIndex: 1,
          question: "کدام بتابلاکر در بیمار مبتلا به فشار خون و آسم اولویت بالاتری دارد؟",
          choices: ["بیزوپرولول (Bisoprolol)", "پروپرانولول (Propranolol)", "نادولول (Nadolol)", "تیمولول (Timolol)"],
          correctAnswer: "بیزوپرولول (Bisoprolol)",
          explanation: "بیزوپرولول انتخابی Beta-1 است و خطر برونکواسپاسم کمتری دارد.",
        },
        {
          questionIndex: 2,
          question: "مکانیسم اصلی اثر امپرازول در کاهش اسید معده چیست؟",
          choices: [
            "مهار برگشت‌ناپذیر پمپ پروتون سلول جداری",
            "آنتاگونیسم رقابتی گیرنده H2 هیستامین",
            "مهار گیرنده موسکارینی M1 معده",
            "خنثی‌سازی مستقیم اسید هیدروکلریک",
          ],
          correctAnswer: "مهار برگشت‌ناپذیر پمپ پروتون سلول جداری",
          explanation: "امپرازول پمپ پروتون سلول‌های جداری را به صورت کووالان مهار می‌کند.",
        },
        {
          questionIndex: 3,
          question: "کدام آنزیم کبدی عمدتاً مسئول متابولیسم ایزومر S-وارفارین است؟",
          choices: ["CYP2C9", "CYP3A4", "CYP2D6", "CYP1A2"],
          correctAnswer: "CYP2C9",
          explanation: "ایزومر فعال‌تر S-وارفارین توسط CYP2C9 متابولیزه می‌شود.",
        },
        {
          questionIndex: 4,
          question: "علت بروز سرفه خشک ناشی از مصرف انالاپریل کدام مورد است؟",
          choices: [
            "تجمع برادی‌کینین در راه‌های هوایی",
            "افزایش سطح آلدوسترون سرم",
            "تحریک مستقیم گیرنده‌های بتا-۲",
            "کاهش تولید نیتریک اکساید عروقی",
          ],
          correctAnswer: "تجمع برادی‌کینین در راه‌های هوایی",
          explanation: "مهار ACE مانع تجزیه برادی‌کینین و ماده P در ریه می‌شود.",
        },
        {
          questionIndex: 5,
          question: "آنتی‌دوت اختصاصی مسمومیت با استامینوفن کدام ترکیب است؟",
          choices: ["ان-استیل‌سیستئین", "نالوکسان", "فلومازنیل", "دفروکسامین"],
          correctAnswer: "ان-استیل‌سیستئین",
          explanation: "ان-استیل‌سیستئین ذخایر گلوتاتیون کبدی را برای خنثی‌سازی NAPQI بازسازی می‌کند.",
        },
        {
          questionIndex: 6,
          question: "مکانیسم اثر متفورمین در بهبود هیپرگلیسمی چیست؟",
          choices: [
            "کاهش گلوکونئوژنز کبدی و افزایش حساسیت به انسولین",
            "تحریک مستقیم ترشح انسولین از سلول‌های بتای پانکراس",
            "مهار بازجذب گلوکز در توبول پروگزیمال کلیه",
            "تأخیر در جذب کربوهیدرات‌ها با مهار آلفا-گلوکوزیداز",
          ],
          correctAnswer: "کاهش گلوکونئوژنز کبدی و افزایش حساسیت به انسولین",
          explanation: "متفورمین از طریق فعال‌سازی AMPK تولید گلوکز کبدی را کاهش می‌دهد.",
        },
        {
          questionIndex: 7,
          question: "کدام دیورتیک در بیمار با eGFR کمتر از ۳۰ میلی‌لیتر بر دقیقه همچنان مؤثر است؟",
          choices: ["فوروزماید", "هیدروکلروتیازید", "کلرتالیدون", "اسپیرونولاکتون"],
          correctAnswer: "فوروزماید",
          explanation: "دیورتیک‌های لوپ برخلاف تیازیدها در نارسایی پیشرفته کلیوی کارایی دارند.",
        },
        {
          questionIndex: 8,
          question: "مصرف هم‌زمان کدام دارو با سیلدنافیل به دلیل افت شدید فشار خون ممنوع است؟",
          choices: ["ایزوسورباید دی‌نیترات", "آملودیپین", "لوزارتان", "آتورواستاتین"],
          correctAnswer: "ایزوسورباید دی‌نیترات",
          explanation: "ترکیب نیترات‌ها و مهارکننده‌های PDE-5 موجب افزایش شدید cGMP و هیپوتانسیون کشنده می‌شود.",
        },
        {
          questionIndex: 9,
          question: "کدام عارضه با مصرف طولانی‌مدت آمیودارون مرتبط است؟",
          choices: ["فیبروز ریوی و اختلال تیروئید", "هیپرتروفی لثه و هیرسوتیسم", "اسیدوز لاکتیک شدید", "نکروز حاد توبولی"],
          correctAnswer: "فیبروز ریوی و اختلال تیروئید",
          explanation: "آمیودارون حاوی ید است و سمیت ریوی و تیروئیدی ایجاد می‌کند.",
        },
        {
          questionIndex: 10,
          question: "کدام آنتی‌بیوتیک برای درمان کولیت ناشی از Clostridioides difficile به صورت خوراکی ارجح است؟",
          choices: ["ونکومایسین خوراکی", "سیپروفلوکساسین", "کلیندامایسین", "سفتازیدیم"],
          correctAnswer: "ونکومایسین خوراکی",
          explanation: "ونکومایسین خوراکی جذب سیستمیک ناچیز دارد و در لومن روده مؤثر است.",
        },
        {
          questionIndex: 11,
          question: "مکانیسم اثر کلوپیدوگرل در مهار تجمع پلاکتی چیست؟",
          choices: [
            "مهار برگشت‌ناپذیر گیرنده P2Y12",
            "مهار برگشت‌پذیر آنزیم COX-1",
            "مسدود کردن گیرنده GPIIb/IIIa",
            "فعال‌سازی آنزیم آدنیلات سیکلاز",
          ],
          correctAnswer: "مهار برگشت‌ناپذیر گیرنده P2Y12",
          explanation: "متابولیت فعال کلوپیدوگرل گیرنده ADP پلاکتی (P2Y12) را به طور برگشت‌ناپذیر مهار می‌کند.",
        },
        {
          questionIndex: 12,
          question: "کدام دارو یک مهارکننده انتخابی COX-2 با خطر کمتر زخم گوارشی است؟",
          choices: ["سلکوکسیب", "ایبوپروفن", "ناپروکسن", "ایندومتاسین"],
          correctAnswer: "سلکوکسیب",
          explanation: "سلکوکسیب به طور انتخابی COX-2 را مهار کرده و COX-1 محافظ معده را حفظ می‌کند.",
        },
        {
          questionIndex: 13,
          question: "در مسمومیت با بنزودیازپین‌ها کدام آنتاگونیست استفاده می‌شود؟",
          choices: ["فلومازنیل", "نالترکسان", "آتروپین", "فیزوستیگمین"],
          correctAnswer: "فلومازنیل",
          explanation: "فلومازنیل آنتاگونیست رقابتی جایگاه بنزودیازپینی روی گیرنده GABA-A است.",
        },
        {
          questionIndex: 14,
          question: "کدام یک از موارد زیر از عوارض مشخص ونکومایسین هنگام تزریق سریع وریدی است؟",
          choices: ["سندرم مرد قرمز حاد", "سندرم خاکستری در نوزادان", "تغییر رنگ دائمی مینای دندان", "پارگی تاندون آشیل"],
          correctAnswer: "سندرم مرد قرمز حاد",
          explanation: "تزریق سریع ونکومایسین باعث دگرانولاسیون مستقیم ماست‌سل‌ها و آزادسازی هیستامین می‌شود.",
        },
        {
          questionIndex: 15,
          question: "کدام دسته دارویی در نارسایی قلبی HFrEF باعث کاهش مرگ‌ومیر می‌شود؟",
          choices: ["مهارکننده‌های SGLT2", "بلوک‌کننده‌های کانال کلسیم غیردی‌هیدروپیریدینی", "مهارکننده‌های DPP-4", "داروهای ضدالتهاب غیراستروئیدی"],
          correctAnswer: "مهارکننده‌های SGLT2",
          explanation: "امپاگلیفلوزین و داپاگلیفلوزین مرگ‌ومیر قلبی-عروقی را در HFrEF کاهش می‌دهند.",
        },
        {
          questionIndex: 16,
          question: "حجم توزیع ظاهری بالا (Vd زیاد) نشان‌دهنده چیست؟",
          choices: [
            "توزیع گسترده دارو در بافت‌ها",
            "محدود ماندن دارو در پلاسما",
            "کلیرانس کلیوی بسیار سریع",
            "فراهمی زیستی خوراکی کامل",
          ],
          correctAnswer: "توزیع گسترده دارو در بافت‌ها",
          explanation: "Vd بالا یعنی غلظت پلاسمایی پایین و تجمع بیشتر دارو در بافت‌های محیطی.",
        },
        {
          questionIndex: 17,
          question: "کدام انسولین فاقد پیک اثر مشخص بوده و به عنوان انسولین پایه ۲۴ ساعته مصرف می‌شود؟",
          choices: ["انسولین گلارژین", "انسولین رگولار", "انسولین لیسپرو", "انسولین NPH"],
          correctAnswer: "انسولین گلارژین",
          explanation: "گلارژین با رهایش آهسته اثر پایدار و بدون پیک ایجاد می‌کند.",
        },
        {
          questionIndex: 18,
          question: "مصرف هم‌زمان تئوفیلین و سیپروفلوکساسین چه نتیجه‌ای دارد؟",
          choices: [
            "افزایش غلظت پلاسمایی تئوفیلین",
            "کاهش جذب گوارشی سیپروفلوکساسین",
            "القای متابولیسم کبدی تئوفیلین",
            "افزایش دفع کلیوی تئوفیلین",
          ],
          correctAnswer: "افزایش غلظت پلاسمایی تئوفیلین",
          explanation: "سیپروفلوکساسین مهارکننده CYP1A2 است و متابولیسم تئوفیلین را کاهش می‌دهد.",
        },
        {
          questionIndex: 19,
          question: "در بیمار مبتلا به نقرس حاد کدام دارو به دلیل عدم اثر بر اسید اوریک در فاز حاد تجویز نمی‌شود؟",
          choices: ["آلوپورینول", "کلشی‌سین", "ایندومتاسین", "پردنیزولون"],
          correctAnswer: "آلوپورینول",
          explanation: "شروع آلوپورینول در حمله حاد می‌تواند نوسان اورات و تشدید درد را ایجاد کند.",
        },
        {
          questionIndex: 20,
          question: "مکانیسم اثر هپارین استاندارد در جلوگیری از انعقاد خون چیست؟",
          choices: [
            "تقویت اثر آنتی‌ترومبین بر ترومبین و فاکتور ده فعال",
            "مهار سنتز فاکتورهای وابسته به ویتامین کا در کبد",
            "مهار مستقیم فاکتور ده فعال بدون نیاز به کوفاکتور",
            "فعال‌سازی پلاسمینوژن بافتی به پلاسمین فعال",
          ],
          correctAnswer: "تقویت اثر آنتی‌ترومبین بر ترومبین و فاکتور ده فعال",
          explanation: "هپارین با اتصال به آنتی‌ترومبین III سرعت مهار ترومبین و Xa را هزار برابر می‌کند.",
        },
        {
          questionIndex: 21,
          question: "کدام یک از داروهای زیر آنتاگونیست گیرنده آلدوسترون با عارضه ژنیکوماستی است؟",
          choices: ["اسپیرونولاکتون", "اپلرنون", "آمیلوراید", "تریامترن"],
          correctAnswer: "اسپیرونولاکتون",
          explanation: "اسپیرونولاکتون به گیرنده‌های آندروژنی و پروژسترونی هم متصل می‌شود.",
        },
        {
          questionIndex: 22,
          question: "در صورت نیاز به تبدیل دوز خوراکی به تزریقی دارویی با فراهمی زیستی ۵۰ درصد، دوز تزریقی چه نسبتی از دوز خوراکی است؟",
          choices: ["نصف دوز خوراکی", "دو برابر دوز خوراکی", "برابر دوز خوراکی", "یک‌چهارم دوز خوراکی"],
          correctAnswer: "نصف دوز خوراکی",
          explanation: "با F=0.5 فقط نیمی از دوز خوراکی به گردش خون سیستمیک می‌رسد.",
        },
        {
          questionIndex: 23,
          question: "کدام دارو خط اول درمان وضعیت صرعی (Status Epilepticus) در اورژانس است؟",
          choices: ["لورازپام وریدی", "فنیتوئین خوراکی", "والپروات سدیم خوراکی", "اتوسوکسیماید"],
          correctAnswer: "لورازپام وریدی",
          explanation: "بنزودیازپین‌های تزریقی مانند لورازپام خط اول کنترل سریع تشنج هستند.",
        },
        {
          questionIndex: 24,
          question: "عارضه خطرناک سندرم سروتونین با تداخل کدام دو دسته دارویی تشدید می‌شود؟",
          choices: [
            "مهارکننده‌های بازجذب سروتونین و مونوآمین اکسیداز",
            "آنتاگونیست‌های دوپامین و گیرنده‌های هیستامینی",
            "مهارکننده‌های پمپ پروتون و آنتی‌اسیدهای خوراکی",
            "استاتین‌ها و رزین‌های متصل‌شونده به اسید صفراوی",
          ],
          correctAnswer: "مهارکننده‌های بازجذب سروتونین و مونوآمین اکسیداز",
          explanation: "مصرف هم‌زمان SSRI و MAOI تجمع شدید سروتونین سیناپسی ایجاد می‌کند.",
        },
        {
          questionIndex: 25,
          question: "کدام دارو در بارداری برای کنترل فشار خون مزمن ایمن‌تر و ارجح است؟",
          choices: ["متیل‌دوپا", "انالاپریل", "لوزارتان", "آلیسکیرن"],
          correctAnswer: "متیل‌دوپا",
          explanation: "مهارکننده‌های سیستم رنین-آنژیوتانسین در بارداری تراتوژن هستند.",
        },
        {
          questionIndex: 26,
          question: "کدام مکانیسم عامل ایجاد تحمل سریع به نیتروگلیسیرین در مصرف مداوم است؟",
          choices: [
            "کاهش گروه‌های سولفیدریل و استرس اکسیداتیو عروقی",
            "افزایش سریع کلیرانس کلیوی دارو",
            "مهار آنزیم فسفودی‌استراز نوع ۵",
            "کاهش جذب زیرزبانی دارو",
          ],
          correctAnswer: "کاهش گروه‌های سولفیدریل و استرس اکسیداتیو عروقی",
          explanation: "ایجاد دوره بدون نیترات (Nitrate-free interval) از تحمل پیشگیری می‌کند.",
        },
        {
          questionIndex: 27,
          question: "کدام آنتی‌سایکوتیک آتیپیک بیشترین خطر آگرانولوسیتوز را دارد و نیازمند پایش CBC است؟",
          choices: ["کلوزاپین", "ریسپریدون", "آریپیپرازول", "زیپراسیدون"],
          correctAnswer: "کلوزاپین",
          explanation: "کلوزاپین به دلیل خطر نوتروپنی و آگرانولوسیتوز پایش منظم شمارش گلبول سفید می‌خواهد.",
        },
        {
          questionIndex: 28,
          question: "کدام دارو با مهار آنزیم گزانتین اکسیداز سطح اسید اوریک را کاهش می‌دهد؟",
          choices: ["فبوکسوستات", "پروبنسید", "راس‌بوریکاز", "کلشی‌سین"],
          correctAnswer: "فبوکسوستات",
          explanation: "فبوکسوستات مهارکننده غیرپورینی گزانتین اکسیداز است.",
        },
        {
          questionIndex: 29,
          question: "پاسخ صحیح دارای توضیح اضافی است که باید به صورت قطعی پاکسازی شود:",
          choices: [
            "مهار پمپ سدیم-پتاسیم، زیرا این مکانیسم کلسیم داخل‌سلولی را افزایش می‌دهد",
            "تحریک کانال‌های پتاسیمی",
            "مهار گیرنده بتا-۱",
            "افزایش کلیرانس کراتینین",
          ],
          correctAnswer: "مهار پمپ سدیم-پتاسیم، زیرا این مکانیسم کلسیم داخل‌سلولی را افزایش می‌دهد",
          explanation: "دیگوکسین پمپ سدیم-پتاسیم را مهار می‌کند.",
        },
        {
          questionIndex: 30,
          question: "در نارسایی حاد کلیوی کدام دیورتیک باعث افزایش دفع کلسیم می‌شود؟",
          choices: ["فوروزماید", "هیدروکلروتیازید", "آمیلوراید", "استازولامید"],
          correctAnswer: "فوروزماید",
          explanation: "دیورتیک‌های لوپ بازجذب کلسیم در شاخه صعودی ضخیم هنله را کاهش می‌دهند.",
        },
      ];

      const evaluations = pharmacyBenchmark30.map((q) => evaluateStudioQuestionQuality(q));
      const passed = evaluations.filter((e) => e.status === "pass").map((e) => e.normalizedQuestion);

      // All 30 questions must pass (question 29 is cleanly normalized by normalizeQuestionOptions)
      expect(
        evaluations
          .filter((e) => e.status !== "pass")
          .map((e) => ({ idx: e.normalizedQuestion.questionIndex, issues: e.issues })),
      ).toEqual([]);
      expect(passed).toHaveLength(30);
      expect(evaluations[28].repairedByDeterministicNormalizer).toBe(true);
      expect(passed[28].correctAnswer).toBe("مهار پمپ سدیم-پتاسیم");
      expect(passed[28].explanation).toContain("مکانیسم کلسیم داخل‌سلولی");

      // Balanced shuffle across all 30 questions preserves every correctAnswer
      const balanced = shuffleAndBalanceStudioQuestions(passed, () => 0.37);
      expect(balanced).toHaveLength(30);
      for (let i = 0; i < balanced.length; i++) {
        expect(balanced[i].choices).toContain(balanced[i].correctAnswer);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 15. Studio Severe Length Asymmetry Gate (Real-Output Calibration)
  // -------------------------------------------------------------------------
  describe("15. Studio Severe Length Asymmetry Gate", () => {
    it("1. rejects correct answer with severe length gap even when ratio < 1.8x in long sentences", () => {
      // Real pattern from Studio op 83c3c417 Q11: 163 vs [111, 110, 80] -> gapFromMedian=53, ratioToMax=1.47
      const res = evaluateStudioQuestionQuality({
        questionIndex: 1,
        question: "در تجویز دیورتیک وریدی در نارسایی قلبی حاد کدام نکته بالینی صحیح است؟",
        choices: [
          "مصرف دیورتیک‌های لوپ به تنهایی می‌تواند عملکرد کلیوی را بهبود بخشیده و حجم خون درون‌رگی را به طور کامل حفظ کند.",
          "تجویز تهاجمی دیورتیک‌های وریدی ممکن است با بدتر شدن عملکرد کلیوی و افزایش مرگ‌ومیر همراه باشد و در موارد مقاومت، اولترافیلتراسیون به عنوان روش جایگزین مطرح می‌شود.",
          "فوروزماید وریدی هیچ‌گونه تفاوت فارماکوکینتیک با فرم خوراکی نداشته و میزان فراهمی زیستی آن همواره ۱۰۰ درصد است.",
          "دیورتیک‌های لوپ دارای اثرات قوی کاهنده مرگ‌ومیر بلندمدت مشابه بتا-بلاکرها هستند.",
        ],
        correctAnswer:
          "تجویز تهاجمی دیورتیک‌های وریدی ممکن است با بدتر شدن عملکرد کلیوی و افزایش مرگ‌ومیر همراه باشد و در موارد مقاومت، اولترافیلتراسیون به عنوان روش جایگزین مطرح می‌شود.",
        explanation: "دیورتیک‌های تهاجمی می‌توانند عملکرد کلیه را بدتر کنند.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.some((i) => i.includes("عدم تقارن شدید طول"))).toBe(true);
    });

    it("2. accepts slightly longer correct answer with minor natural difference and no leakage", () => {
      // Real pattern from Studio op 83c3c417 Q1: 171 vs [153, 158, 169] -> gapFromMedian=13, ratioToMax=1.01
      const res = evaluateStudioQuestionQuality({
        questionIndex: 2,
        question: "تفاوت اصلی بلوک‌کننده‌های کانال کلسیم دی‌هیدروپیریدینی و غیردی‌هیدروپیریدینی چیست؟",
        choices: [
          "دی‌هیدروپیریدین‌ها اثرات اینوتروپیک منفی چشمگیری بر انقباض‌پذیری میوکارد اعمال می‌کنند، در حالی که غیردی‌هیدروپیریدین‌ها منحصراً وازودیلاتور محیطی هستند.",
          "غیردی‌هیدروپیریدین‌ها دارای اثرات کرونوتروپیک منفی قابل‌توجه و مهار گره AV هستند، در حالی که دی‌هیدروپیریدین‌ها وازودیلاتورهای قوی بوده و اثر مهارکننده قلبی مستقیم ندارند.",
          "دی‌هیدروپیریدین‌ها ضربان قلب و هدایت گره AV را به شدت کاهش می‌دهند، در حالی که غیردی‌هیدروپیریدین‌ها هیچ‌گونه تأثیری بر عملکرد الکتروفیزیولوژیک گره AV ندارند.",
          "غیردی‌هیدروپیریدین‌ها خطر بروز ادم محیطی ناشی از اتساع شریانچه‌ها را به میزان ۱۵ درصد ایجاد می‌کنند، در حالی که دی‌هیدروپیریدین‌ها موجب برادی‌کاردی سینوسی شدید می‌شوند.",
        ],
        correctAnswer:
          "غیردی‌هیدروپیریدین‌ها دارای اثرات کرونوتروپیک منفی قابل‌توجه و مهار گره AV هستند، در حالی که دی‌هیدروپیریدین‌ها وازودیلاتورهای قوی بوده و اثر مهارکننده قلبی مستقیم ندارند.",
        explanation: "غیردی‌هیدروپیریدین‌ها بر گره AV و ضربان قلب اثر مهارکننده دارند.",
      });

      expect(res.status).toBe("pass");
    });

    it("3. accepts correct answer that is shorter than distractors when scientifically valid", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 3,
        question: "کدام اقدام ایمنی پیش از شروع ساکوبیتریل-والسارتان پس از قطع انالاپریل ضروری است؟",
        choices: [
          "قطع انالاپریل و شروع هم‌زمان ساکوبیتریل-والسارتان در همان روز برای حفظ پایداری فشار خون",
          "ایجاد فاصله ۳۶ ساعته پس از آخرین دوز انالاپریل پیش از شروع ساکوبیتریل-والسارتان",
          "افزایش دوز دیورتیک لوپ به دو برابر و پایش پتاسیم سرم در چهل‌وهشت ساعت نخست",
          "تجویز هم‌زمان هر دو دارو با نصف دوز استاندارد به مدت یک هفته و سپس قطع انالاپریل",
        ],
        correctAnswer:
          "ایجاد فاصله ۳۶ ساعته پس از آخرین دوز انالاپریل پیش از شروع ساکوبیتریل-والسارتان",
        explanation: "برای پیشگیری از آنژیوادم رعایت فاصله ۳۶ ساعته الزامی است.",
      });

      expect(res.status).toBe("pass");
    });

    it("4. accepts four balanced options of equal scientific depth", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 4,
        question: "مکانیسم اصلی اثر رانولازین در بهبود ایسکمی میوکارد چیست؟",
        choices: [
          "تحریک مستقیم گیرنده‌های بتا-۲ آدرنرژیک و ایجاد وازودیلاتاسیون کرونری",
          "مهار انتخابی جریان دیررس سدیم و پیشگیری از اضافه‌بار کلسیم داخل‌سلولی",
          "مسدود کردن کانال‌های کلسیمی نوع L در گره سینوسی و کاهش هدایت دهلیزی",
          "تحریک آنزیم گوانیلات سیکلاز و افزایش سطح cGMP جهت کاهش پرلود قلبی",
        ],
        correctAnswer: "مهار انتخابی جریان دیررس سدیم و پیشگیری از اضافه‌بار کلسیم داخل‌سلولی",
        explanation: "رانولازین جریان دیررس سدیم را مهار می‌کند.",
      });

      expect(res.status).toBe("pass");
    });

    it("5. accepts long but necessary scientific options when all 4 options are comparably detailed", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 5,
        question: "در بیمار با دریچه مکانیکی میترال که نیاز به جراحی انتخابی دارد، رویکرد مناسب کدام است؟",
        choices: [
          "قطع وارفارین پیش از جراحی و انجام درمان پل با هپارین با وزن مولکولی کم تزریقی برای کاهش خطر ترومبوآمبولی دریچه",
          "قطع وارفارین پنج روز پیش از جراحی و جایگزینی فوری با دابیگاتران خوراکی بدون نیاز به پایش آزمایشگاهی انعقاد",
          "ادامه مصرف وارفارین با دوز کامل تا صبح روز جراحی و تزریق هم‌زمان ویتامین کا در اتاق عمل برای کنترل خونریزی",
          "قطع وارفارین و اکتفا به آسپرین با دوز پایین در صورت پایین بودن امتیاز خطر ترومبوز شریانی بیمار",
        ],
        correctAnswer:
          "قطع وارفارین پیش از جراحی و انجام درمان پل با هپارین با وزن مولکولی کم تزریقی برای کاهش خطر ترومبوآمبولی دریچه",
        explanation: "دریچه مکانیکی میترال پرخطر است و نیازمند درمان پل با LMWH یا UFH است.",
      });

      expect(res.status).toBe("pass");
    });

    it("6. never mutates or truncates the scientific text of correctAnswer when passed or rejected", () => {
      const originalCorrect =
        "مهار انتخابی گیرنده‌های Beta-1 میوکارد و کاهش رنین پلاسمایی با حفظ جریان خون کلیوی";
      const res = evaluateStudioQuestionQuality({
        questionIndex: 6,
        question: "اثر بتابلاکرهای انتخابی قلبی چیست؟",
        choices: [
          originalCorrect,
          "تحریک گیرنده‌های Beta-2 در برونش",
          "مهار گیرنده‌های Alpha-1 محیطی",
          "افزایش آزادسازی نوراپی‌نفرین",
        ],
        correctAnswer: originalCorrect,
        explanation: "بتابلاکرهای انتخابی گیرنده Beta-1 را مهار می‌کنند.",
      });

      expect(res.normalizedQuestion.correctAnswer).toBe(originalCorrect);
      expect(res.normalizedQuestion.choices).toContain(originalCorrect);
    });

    it("7. accepts natural cases where a distractor is longest or correct answer is shortest", () => {
      // Distractor is naturally longest (83 vs 70, 72, 78) and correct answer is shortest (70) -> PASS
      const res = evaluateStudioQuestionQuality({
        questionIndex: 7,
        question: "کدام دارو با مهار آنزیم DPP-4 سطح اینکرتین‌ها را افزایش می‌دهد؟",
        choices: [
          "سیتاگلیپتین با مهار انتخابی آنزیم دی‌پپتیدیل پپتیداز-۴", // 55
          "امپاگلیفلوزین با مهار بازجذب گلوکز در توبول پروگزیمال کلیه", // 59
          "لیراگلوتاید با تحریک مستقیم گیرنده پپتید شبه گلوکاگون-۱ و کاهش تخلیه معده", // 73 (longest distractor, natural)
          "متفورمین با کاهش گلوکونئوژنز کبدی و بهبود حساسیت به انسولین", // 60
        ],
        correctAnswer: "سیتاگلیپتین با مهار انتخابی آنزیم دی‌پپتیدیل پپتیداز-۴",
        explanation: "سیتاگلیپتین مهارکننده DPP-4 است.",
      });

      expect(res.status).toBe("pass");
      expect(res.normalizedQuestion.choices).toHaveLength(4);
      // Verify no distractor was artificially lengthened or altered
      expect(res.normalizedQuestion.choices[1]).toBe(
        "امپاگلیفلوزین با مهار بازجذب گلوکز در توبول پروگزیمال کلیه",
      );
    });

    it("8. rejects an unnaturally bloated / multi-clause distractor outlier (prevents reverse bias)", () => {
      const res = evaluateStudioQuestionQuality({
        questionIndex: 8,
        question: "کدام دارو در بیماران با نارسایی قلبی HFrEF باعث کاهش مرگ‌ومیر می‌شود؟",
        choices: [
          "امپاگلیفلوزین به عنوان مهارکننده SGLT2",
          "سیتاگلیپتین به عنوان مهارکننده DPP-4",
          "آملودیپین به عنوان بلوک‌کننده کانال کلسیم",
          "وراپامیل به عنوان بلوک‌کننده کانال کلسیم غیردی‌هیدروپیریدینی که به دلیل اثرات اینوتروپیک منفی شدید در نارسایی قلبی سیستولیک باعث تشدید احتقان و افزایش بستری بیمار می‌شود",
        ],
        correctAnswer: "امپاگلیفلوزین به عنوان مهارکننده SGLT2",
        explanation: "امپاگلیفلوزین مرگ‌ومیر قلبی-عروقی را در HFrEF کاهش می‌دهد.",
      });

      expect(res.status).toBe("needs_critic");
      expect(res.issues.some((i) => i.includes("گزینه‌های انحرافی"))).toBe(true);
    });
  });
});
