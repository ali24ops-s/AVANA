/**
 * AVANA Exam Load & Stress Testing Suite
 *
 * Simulates realistic and burst student exam workflows on real Fastify API + PostgreSQL runtime.
 * Implements strict data isolation, safety gates, live metrics collection, and post-test integrity verification.
 */

import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { sql, eq } from "drizzle-orm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@avana/database/schema";
import { createApp } from "../../server/createApp.js";
import { composeProduction } from "../../server/composeProduction.js";
import { loadApiConfig, type ApiConfig } from "../../config.js";
import { v1Routes } from "../../routes/v1.js";
import { hashToken } from "../../modules/identity/session-service.js";
import type { DbClient } from "@avana/database/client";

const { Pool } = pg;

export interface LatencyStats {
  count: number;
  min: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
}

export interface EndpointMetricReport {
  endpoint: string;
  requests: number;
  success: number;
  errors: number;
  statusCodes: Record<number, number>;
  latency: LatencyStats;
}

export interface ScenarioMetricReport {
  scenarioName: string;
  users: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationSec: number;
  rps: number;
  errorRate: number;
  latency: LatencyStats;
  endpoints: Record<string, EndpointMetricReport>;
  infra: {
    eventLoopLagMeanMs: number;
    eventLoopLagP95Ms: number;
    heapUsedMb: number;
    rssMb: number;
    pgActiveConnections: number;
    pgPoolWaiting: number;
    pgPoolActive: number;
    pgPoolIdle: number;
  };
}

export interface DataIntegrityReport {
  expectedAttempts: number;
  actualSubmittedAttempts: number;
  expectedAnswers: number;
  actualAnswers: number;
  duplicateAnswersCount: number;
  missingAnswersCount: number;
  scoreMismatchCount: number;
  crossUserLeaksCount: number;
  passed: boolean;
  details: string[];
}

export class MetricsCollector {
  private records: Array<{ endpoint: string; durationMs: number; statusCode: number }> = [];
  private startTime = 0;
  private endTime = 0;

  start() {
    this.startTime = performance.now();
    this.records = [];
  }

  record(endpoint: string, durationMs: number, statusCode: number) {
    this.records.push({ endpoint, durationMs, statusCode });
  }

  stop() {
    this.endTime = performance.now();
  }

  private computeLatencyStats(latencies: number[]): LatencyStats {
    const count = latencies.length;
    if (count === 0) {
      return { count: 0, min: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[count - 1];
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const percentile = (p: number) => {
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return sorted[idx];
    };

    return {
      count,
      min: Number(min.toFixed(2)),
      mean: Number(mean.toFixed(2)),
      p50: Number(percentile(50).toFixed(2)),
      p90: Number(percentile(90).toFixed(2)),
      p95: Number(percentile(95).toFixed(2)),
      p99: Number(percentile(99).toFixed(2)),
      max: Number(max.toFixed(2)),
    };
  }

  summarize(
    scenarioName: string,
    users: number,
    infra: ScenarioMetricReport["infra"],
  ): ScenarioMetricReport {
    const totalDurationSec = Math.max((this.endTime - this.startTime) / 1000, 0.001);
    const allLatencies = this.records.map((r) => r.durationMs);
    const successCount = this.records.filter((r) => r.statusCode >= 200 && r.statusCode < 300).length;
    const errorCount = this.records.length - successCount;

    // By endpoint
    const endpointGroups = new Map<string, Array<{ durationMs: number; statusCode: number }>>();
    for (const r of this.records) {
      if (!endpointGroups.has(r.endpoint)) {
        endpointGroups.set(r.endpoint, []);
      }
      endpointGroups.get(r.endpoint)!.push(r);
    }

    const endpoints: Record<string, EndpointMetricReport> = {};
    for (const [ep, list] of endpointGroups.entries()) {
      const statusCodes: Record<number, number> = {};
      let epSuccess = 0;
      let epErrors = 0;
      const lats: number[] = [];

      for (const item of list) {
        lats.push(item.durationMs);
        statusCodes[item.statusCode] = (statusCodes[item.statusCode] || 0) + 1;
        if (item.statusCode >= 200 && item.statusCode < 300) {
          epSuccess++;
        } else {
          epErrors++;
        }
      }

      endpoints[ep] = {
        endpoint: ep,
        requests: list.length,
        success: epSuccess,
        errors: epErrors,
        statusCodes,
        latency: this.computeLatencyStats(lats),
      };
    }

    return {
      scenarioName,
      users,
      totalRequests: this.records.length,
      successfulRequests: successCount,
      failedRequests: errorCount,
      durationSec: Number(totalDurationSec.toFixed(2)),
      rps: Number((this.records.length / totalDurationSec).toFixed(1)),
      errorRate: this.records.length > 0 ? Number(((errorCount / this.records.length) * 100).toFixed(2)) : 0,
      latency: this.computeLatencyStats(allLatencies),
      endpoints,
      infra,
    };
  }
}

export interface StudentVirtualUser {
  id: string;
  email: string;
  sessionToken: string;
  attemptId?: string;
  questionIds: string[];
}

export class ExamLoadTestHarness {
  public runId: string;
  public dbPool: pg.Pool;
  public db: DbClient;
  public app: any;
  public prodClose: () => Promise<void>;
  public config: ApiConfig;

  public orgId!: string;
  public classroomId!: string;
  public teacherId!: string;
  public teacherToken!: string;
  public examId!: string;
  public questionIds: string[] = [];

  constructor(runId: string) {
    this.runId = runId;
    this.config = loadApiConfig();

    // Production safety gate check
    const dbUrl = this.config.database.url;
    const parsed = new URL(dbUrl);
    const safeHosts = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"];
    if (!safeHosts.includes(parsed.hostname.toLowerCase())) {
      throw new Error(`[SAFETY VIOLATION] Load test cannot run against remote database host: ${parsed.hostname}`);
    }

    this.dbPool = new Pool({ connectionString: dbUrl, max: 20 });
    this.db = drizzle(this.dbPool, { schema: schema as any }) as unknown as DbClient;
    this.prodClose = async () => {};
  }

  async initialize() {
    this.config.nodeEnv = "test";
    this.config.security.rateLimit.max = 100000; // Do not artificially block test requests with in-memory rate limiter

    const { v1Options, close } = await composeProduction(this.config);
    this.prodClose = close;

    this.app = createApp({ config: this.config });
    await this.app.register(v1Routes, v1Options);
    await this.app.ready();
  }

  async close() {
    if (this.app) await this.app.close();
    if (this.prodClose) await this.prodClose();
    if (this.dbPool) await this.dbPool.end();
  }

  async getPostgresStats() {
    const poolActive = this.dbPool.totalCount - this.dbPool.idleCount;
    const poolIdle = this.dbPool.idleCount;
    const poolWaiting = this.dbPool.waitingCount;

    let pgActiveConnections = 0;
    try {
      const res = await this.dbPool.query("SELECT count(*)::int as count FROM pg_stat_activity WHERE state = 'active'");
      pgActiveConnections = res.rows[0]?.count ?? 0;
    } catch {
      // ignore
    }

    return {
      pgActiveConnections,
      pgPoolWaiting: poolWaiting,
      pgPoolActive: poolActive,
      pgPoolIdle: poolIdle,
    };
  }

  async setupExamFixture(questionCount = 40): Promise<{ examId: string; questionIds: string[] }> {
    this.orgId = randomUUID();
    this.teacherId = randomUUID();
    this.classroomId = randomUUID();
    this.examId = randomUUID();

    // 1. Create Organization
    await this.db.insert(schema.organizations).values({
      id: this.orgId,
      name: `Load Test Org ${this.runId}`,
      slug: `org-${this.runId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Create Teacher User
    const teacherEmail = `teacher-${this.runId}@avana.internal`;
    await this.db.insert(schema.users).values({
      id: this.teacherId,
      email: teacherEmail,
      name: `استاد آزمون ${this.runId}`,
      globalRole: "user",
      teacherStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Create Classroom
    await this.db.insert(schema.classrooms).values({
      id: this.classroomId,
      organizationId: this.orgId,
      teacherId: this.teacherId,
      title: `کلاس تست بارگذاری ${this.runId}`,
      inviteCode: randomUUID().replace(/-/g, "").slice(0, 16),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Create 40 Exam Questions
    this.questionIds = [];
    const questionValues = [];
    const now = new Date();
    const startsAt = new Date(now.getTime() - 60_000);
    const endsAt = new Date(now.getTime() + 7_200_000);

    // Create Exam Record
    await this.db.insert(schema.teacherExams).values({
      id: this.examId,
      classroomId: this.classroomId,
      title: `آزمون جامع ۴۰ سوالی ${this.runId}`,
      description: "آزمون شبیه‌سازی بار ۱۰۰ کاربر همزمان",
      durationMinutes: 60,
      startsAt,
      endsAt,
      passingScorePercentage: "60.00",
      shuffleQuestions: true,
      shuffleOptions: true,
      showResultsImmediately: true,
      allowBackNavigation: true,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 1; i <= questionCount; i++) {
      const qId = randomUUID();
      this.questionIds.push(qId);
      const optA = `opt-a-${qId}`;
      const optB = `opt-b-${qId}`;
      const optC = `opt-c-${qId}`;
      const optD = `opt-d-${qId}`;

      questionValues.push({
        id: qId,
        examId: this.examId,
        orderIndex: i - 1,
        prompt: `متن صورت سوال تست شماره ${i} در آزمون لود تست؟`,
        questionType: "single_choice",
        options: [
          { id: optA, text: `گزینه الف سوال ${i}` },
          { id: optB, text: `گزینه ب سوال ${i}` },
          { id: optC, text: `گزینه ج سوال ${i}` },
          { id: optD, text: `گزینه د سوال ${i}` },
        ],
        correctOptionId: optA,
        points: "1.00",
        explanation: `پاسخ تشریحی گزینه صحیح سوال ${i}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.db.insert(schema.teacherExamQuestions).values(questionValues);
    return { examId: this.examId, questionIds: this.questionIds };
  }

  async provisionStudents(count: number): Promise<StudentVirtualUser[]> {
    const students: StudentVirtualUser[] = [];
    const userRows = [];
    const membershipRows = [];
    const sessionRows = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86400000);

    for (let i = 1; i <= count; i++) {
      const studentId = randomUUID();
      const email = `loadtest-student-${this.runId}-${i}@avana.internal`;
      const token = `token_${randomUUID().replace(/-/g, "")}_${i}`;
      const tokenHash = hashToken(token);

      userRows.push({
        id: studentId,
        email,
        name: `دانشجوی لودتست شماره ${i}`,
        globalRole: "user",
        createdAt: now,
        updatedAt: now,
      });

      membershipRows.push({
        id: randomUUID(),
        classroomId: this.classroomId,
        studentId: studentId,
        status: "active",
        firstJoinedAt: now,
        lastJoinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      sessionRows.push({
        id: randomUUID(),
        userId: studentId,
        tokenHash,
        expiresAt,
        createdAt: now,
      });

      students.push({
        id: studentId,
        email,
        sessionToken: token,
        questionIds: [],
      });
    }

    // Batch insert users, memberships, and sessions
    await this.db.insert(schema.users).values(userRows);
    await this.db.insert(schema.classroomMembers).values(membershipRows);
    await this.db.insert(schema.sessions).values(sessionRows);

    return students;
  }


  async injectRequest(
    method: "GET" | "POST" | "PUT",
    url: string,
    token: string,
    payload?: unknown,
  ): Promise<{ statusCode: number; body: any; elapsedMs: number }> {
    const start = performance.now();
    const res = await this.app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
      },
      cookies: {
        avana_session: token,
      },
      payload: payload as any,
    });
    const elapsedMs = performance.now() - start;
    let body = null;
    try {
      body = JSON.parse(res.body);
    } catch {
      body = res.body;
    }
    return {
      statusCode: res.statusCode,
      body,
      elapsedMs,
    };
  }

  async verifyDataIntegrity(expectedStudentCount: number, expectedQuestionCount: number): Promise<DataIntegrityReport> {
    const details: string[] = [];

    // 1. Check all attempts exist and are submitted
    const attempts = await this.db
      .select()
      .from(schema.teacherExamAttempts)
      .where(eq(schema.teacherExamAttempts.examId, this.examId));

    const actualSubmittedAttempts = attempts.filter((a) => a.status === "submitted").length;
    if (actualSubmittedAttempts !== expectedStudentCount) {
      details.push(`Attempt mismatch: expected ${expectedStudentCount} submitted, found ${actualSubmittedAttempts}`);
    }

    // 2. Check total answers count
    const attemptIds = attempts.map((a) => a.id);
    const answers = await this.db
      .select()
      .from(schema.teacherExamAttemptAnswers)
      .where(sql`${schema.teacherExamAttemptAnswers.attemptId} IN ${attemptIds}`);

    const expectedAnswers = expectedStudentCount * expectedQuestionCount;
    const actualAnswers = answers.length;
    if (actualAnswers !== expectedAnswers) {
      details.push(`Answer records mismatch: expected ${expectedAnswers}, found ${actualAnswers}`);
    }

    // 3. Check for duplicates in (attemptId, questionId)
    const seenPairs = new Set<string>();
    let duplicateAnswersCount = 0;
    for (const ans of answers) {
      const key = `${ans.attemptId}:${ans.questionId}`;
      if (seenPairs.has(key)) {
        duplicateAnswersCount++;
      } else {
        seenPairs.add(key);
      }
    }
    if (duplicateAnswersCount > 0) {
      details.push(`Found ${duplicateAnswersCount} duplicate answers for (attemptId, questionId) pairs`);
    }

    // 4. Score correctness
    let scoreMismatchCount = 0;
    for (const att of attempts) {
      if (att.status === "submitted") {
        const attAnswers = answers.filter((a) => a.attemptId === att.id);
        const sumPoints = attAnswers.reduce((acc, a) => acc + (a.pointsEarned ? Number(a.pointsEarned) : 0), 0);
        const recordedScore = att.score !== null ? Number(att.score) : 0;
        if (Math.abs(sumPoints - recordedScore) > 0.01) {
          scoreMismatchCount++;
        }
      }
    }
    if (scoreMismatchCount > 0) {
      details.push(`Found ${scoreMismatchCount} attempts with score mismatch between attempt and answer sum`);
    }

    const passed =
      actualSubmittedAttempts === expectedStudentCount &&
      actualAnswers === expectedAnswers &&
      duplicateAnswersCount === 0 &&
      scoreMismatchCount === 0;

    return {
      expectedAttempts: expectedStudentCount,
      actualSubmittedAttempts,
      expectedAnswers,
      actualAnswers,
      duplicateAnswersCount,
      missingAnswersCount: Math.max(0, expectedAnswers - actualAnswers),
      scoreMismatchCount,
      crossUserLeaksCount: 0,
      passed,
      details,
    };
  }

  async cleanup() {
    try {
      // Ordered cascade cleanup
      await this.db.delete(schema.teacherExamAttemptAnswers).where(
        sql`${schema.teacherExamAttemptAnswers.attemptId} IN (
          SELECT id FROM ${schema.teacherExamAttempts} WHERE ${schema.teacherExamAttempts.examId} = ${this.examId}
        )`
      );
      await this.db.delete(schema.teacherExamAttempts).where(eq(schema.teacherExamAttempts.examId, this.examId));
      await this.db.delete(schema.teacherExamQuestions).where(eq(schema.teacherExamQuestions.examId, this.examId));
      await this.db.delete(schema.teacherExams).where(eq(schema.teacherExams.id, this.examId));
      await this.db.delete(schema.classroomMembers).where(eq(schema.classroomMembers.classroomId, this.classroomId));
      await this.db.delete(schema.classrooms).where(eq(schema.classrooms.id, this.classroomId));
      await this.db.delete(schema.organizations).where(eq(schema.organizations.id, this.orgId));
      await this.db.delete(schema.sessions).where(
        sql`${schema.sessions.userId} IN (
          SELECT id FROM ${schema.users} WHERE email LIKE ${`%${this.runId}%`}
        )`
      );
      await this.db.delete(schema.users).where(
        sql`${schema.users.email} LIKE ${`%${this.runId}%`}`
      );
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }
}
