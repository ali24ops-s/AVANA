import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Counter } from "k6/metrics";

const submitStartTimeSpread = new Trend("submit_start_time_spread");
const answerLatency = new Trend("answer_save_latency");
const submitLatency = new Trend("submit_latency");
const errorCount = new Counter("exam_errors");

const fixtureData = new SharedArray("students", function () {
  const file = __ENV.FIXTURE_PATH || "./fixture.json";
  return JSON.parse(open(file));
});

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";
const SCENARIO_TYPE = __ENV.SCENARIO_TYPE || "realistic"; // "realistic" | "answer_burst" | "submit_burst"

export const options = {
  scenarios: {
    exam_workload: {
      executor: "per-vu-iterations",
      vus: fixtureData.length,
      iterations: 1,
      maxDuration: "3m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // Error rate < 1%
  },
};

export default function () {
  const vuIndex = __VU - 1;
  const student = fixtureData[vuIndex];
  if (!student) return;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${student.sessionToken}`,
    Cookie: `avana_session=${student.sessionToken}`,
  };

  if (SCENARIO_TYPE === "realistic") {
    // 1. GET exams list
    const listRes = http.get(
      `${BASE_URL}/v1/student/classrooms/${student.classroomId}/exams`,
      { headers: authHeaders, tags: { name: "GET_Exams" } }
    );
    check(listRes, { "list status is 200": (r) => r.status === 200 });

    // 2. POST start attempt
    const startRes = http.post(
      `${BASE_URL}/v1/student/exams/${student.examId}/start`,
      null,
      { headers: authHeaders, tags: { name: "POST_Start" } }
    );
    check(startRes, { "start status is 201 or 200": (r) => r.status === 201 || r.status === 200 });

    let questionIds = student.questionIds;
    if (startRes.status === 201 || startRes.status === 200) {
      try {
        const body = JSON.parse(startRes.body);
        if (body.attempt && body.attempt.questions) {
          questionIds = body.attempt.questions.map((q) => q.id);
        }
      } catch (e) {}
    }

    // 3. 40 Answer submissions with 200-800ms think time
    for (let i = 0; i < questionIds.length; i++) {
      const qId = questionIds[i];
      const thinkTime = 0.2 + Math.random() * 0.6;
      sleep(thinkTime);

      const ansPayload = JSON.stringify({
        selectedOptionId: `opt-a-${qId}`,
        finalized: true,
        activeDurationMs: Math.round(thinkTime * 1000),
      });

      const t0 = Date.now();
      const ansRes = http.put(
        `${BASE_URL}/v1/student/exams/${student.examId}/answers/${qId}`,
        ansPayload,
        { headers: authHeaders, tags: { name: "PUT_Answer" } }
      );
      answerLatency.add(Date.now() - t0);

      const ok = check(ansRes, { "answer saved": (r) => r.status === 200 });
      if (!ok) errorCount.add(1);
    }

    sleep(0.5);

    // 4. Submit attempt
    const tSubmit = Date.now();
    const subRes = http.post(
      `${BASE_URL}/v1/student/exams/${student.examId}/submit`,
      null,
      { headers: authHeaders, tags: { name: "POST_Submit" } }
    );
    submitLatency.add(Date.now() - tSubmit);
    const subOk = check(subRes, { "submit ok": (r) => r.status === 200 });
    if (!subOk) errorCount.add(1);

    // 5. GET review
    const revRes = http.get(
      `${BASE_URL}/v1/student/exams/${student.examId}/review`,
      { headers: authHeaders, tags: { name: "GET_Review" } }
    );
    check(revRes, { "review ok": (r) => r.status === 200 });

  } else if (SCENARIO_TYPE === "answer_burst") {
    // Answer Burst: All answers without sleep
    for (let i = 0; i < student.questionIds.length; i++) {
      const qId = student.questionIds[i];
      const ansPayload = JSON.stringify({
        selectedOptionId: `opt-a-${qId}`,
        finalized: true,
      });

      const t0 = Date.now();
      const ansRes = http.put(
        `${BASE_URL}/v1/student/exams/${student.examId}/answers/${qId}`,
        ansPayload,
        { headers: authHeaders, tags: { name: "PUT_Answer_Burst" } }
      );
      answerLatency.add(Date.now() - t0);
      const ok = check(ansRes, { "burst answer saved": (r) => r.status === 200 });
      if (!ok) errorCount.add(1);
    }

    const subRes = http.post(
      `${BASE_URL}/v1/student/exams/${student.examId}/submit`,
      null,
      { headers: authHeaders, tags: { name: "POST_Submit" } }
    );
    check(subRes, { "burst submit ok": (r) => r.status === 200 });

  } else if (SCENARIO_TYPE === "submit_burst") {
    // Simultaneous submit: records timestamp and immediately submits
    const startMs = Date.now();
    const subRes = http.post(
      `${BASE_URL}/v1/student/exams/${student.examId}/submit`,
      null,
      { headers: authHeaders, tags: { name: "POST_Submit_Burst" } }
    );
    const endMs = Date.now();
    submitLatency.add(endMs - startMs);
    const ok = check(subRes, { "simultaneous submit ok": (r) => r.status === 200 });
    if (!ok) errorCount.add(1);
  }
}
