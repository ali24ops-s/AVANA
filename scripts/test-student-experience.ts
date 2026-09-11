/**
 * Comprehensive verification of the test student account experience.
 */

import http from "node:http";
import pg from "pg";

const API_HOST = "127.0.0.1";
const API_PORT = 3000;
const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

interface TestResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  bodyData?: any,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const payload = bodyData ? JSON.stringify(bodyData) : undefined;
    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
          });
        });
      },
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log("==========================================================");
  console.log("       AVANA STUDENT ACCOUNT VERIFICATION SUITE           ");
  console.log("==========================================================\n");

  const pool = new pg.Pool({ connectionString: DB_URL });

  // Pre-test: Clear device registrations for student@avana.test so login succeeds cleanly
  await pool.query(`
    DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'student@avana.test');
    DELETE FROM user_devices WHERE user_id = (SELECT id FROM users WHERE email = 'student@avana.test');
  `);

  const results: Record<string, { pass: boolean; details: any }> = {};

  // 1. TEST LOGIN
  console.log("[1] Testing POST /v1/auth/sign-in...");
  const loginRes = await request("POST", "/v1/auth/sign-in", {}, {
    email: "student@avana.test",
    password: "AvanaStudent2026!",
  });

  console.log(`    Status: ${loginRes.statusCode}`);
  const setCookie = loginRes.headers["set-cookie"] || [];
  const sessionCookie = setCookie.find((c) => c.startsWith("avana_session="));
  const csrfCookie = setCookie.find((c) => c.startsWith("avana_csrf="));
  const deviceCookie = setCookie.find((c) => c.startsWith("avana_device_id="));

  const sessionToken = sessionCookie
    ? sessionCookie.split(";")[0].split("=")[1]
    : "";
  const deviceToken = deviceCookie
    ? deviceCookie.split(";")[0].split("=")[1]
    : "";

  const loginSuccess =
    loginRes.statusCode === 200 &&
    loginRes.body?.user?.email === "student@avana.test" &&
    loginRes.body?.user?.role === "student" &&
    Boolean(sessionToken);

  results["Login & Auth Tokens"] = {
    pass: loginSuccess,
    details: {
      status: loginRes.statusCode,
      user: loginRes.body?.user,
      hasSessionCookie: Boolean(sessionCookie),
      hasCsrfCookie: Boolean(csrfCookie),
      hasDeviceCookie: Boolean(deviceCookie),
      memberships: loginRes.body?.memberships,
    },
  };
  console.log(`    Result: ${loginSuccess ? "PASS" : "FAIL"}`);

  const authHeaders = {
    Cookie: `avana_session=${sessionToken}; avana_device_id=${deviceToken}`,
  };

  // 2. TEST /v1/me
  console.log("\n[2] Testing GET /v1/me with session cookie...");
  const meRes = await request("GET", "/v1/me", authHeaders);
  const meSuccess =
    meRes.statusCode === 200 &&
    meRes.body?.user?.role === "student" &&
    meRes.body?.user?.emailVerified === true &&
    meRes.body?.user?.isVerified === true;

  results["Session & /v1/me Validation"] = {
    pass: meSuccess,
    details: {
      status: meRes.statusCode,
      role: meRes.body?.user?.role,
      isVerified: meRes.body?.user?.isVerified,
      memberships: meRes.body?.memberships,
    },
  };
  console.log(`    Status: ${meRes.statusCode}, Role: ${meRes.body?.user?.role}`);
  console.log(`    Result: ${meSuccess ? "PASS" : "FAIL"}`);

  // 3. TEST ORGANIZATIONS
  console.log("\n[3] Testing GET /v1/organizations...");
  const orgsRes = await request("GET", "/v1/organizations", authHeaders);
  const orgs = orgsRes.body?.items || [];
  const personalOrg = orgs[0];
  const orgSuccess = orgsRes.statusCode === 200 && orgs.length > 0;
  results["Organizations"] = {
    pass: orgSuccess,
    details: {
      status: orgsRes.statusCode,
      count: orgs.length,
      organizations: orgs,
    },
  };
  console.log(`    Found ${orgs.length} organizations:`, orgs.map((o: any) => o.name));
  console.log(`    Result: ${orgSuccess ? "PASS" : "FAIL"}`);

  const studentOrgId = personalOrg?.id;

  // 4. TEST DASHBOARD & COURSES
  console.log("\n[4] Testing Dashboard & Courses...");
  const myCoursesRes = await request(
    "GET",
    `/v1/organizations/${studentOrgId}/courses/my`,
    authHeaders,
  );
  const myCourses = myCoursesRes.body?.items || [];
  console.log(`    My Courses (${myCourses.length}):`, myCourses.map((c: any) => c.title));

  const allCoursesRes = await request(
    "GET",
    `/v1/organizations/${studentOrgId}/courses`,
    authHeaders,
  );
  const allCourses = allCoursesRes.body?.items || [];
  console.log(`    Catalog Available Courses (${allCourses.length}):`, allCourses.map((c: any) => c.title));

  const coursesSuccess =
    myCoursesRes.statusCode === 200 &&
    allCoursesRes.statusCode === 200 &&
    myCourses.length > 0;

  results["Dashboard & Courses"] = {
    pass: coursesSuccess,
    details: {
      myCoursesCount: myCourses.length,
      catalogCoursesCount: allCourses.length,
      sampleMyCourse: myCourses[0]?.title,
    },
  };
  console.log(`    Result: ${coursesSuccess ? "PASS" : "FAIL"}`);

  // 5. TEST LEARNING HUB & LESSON PAYWALL
  console.log("\n[5] Testing Course Content & Lesson Paywall Access...");
  const testCourseId = "18a9cccc-7e89-40ac-a793-716c74bdc330"; // فارماکولوژی ۲
  const learnRes = await request(
    "GET",
    `/v1/courses/${testCourseId}/learn`,
    authHeaders,
  );

  const modules = learnRes.body?.modules || [];
  let totalLessons = 0;
  let previewLessons = 0;
  let lockedLessons = 0;

  for (const m of modules) {
    for (const l of m.lessons || []) {
      totalLessons++;
      if (l.is_preview) {
        previewLessons++;
      } else {
        lockedLessons++;
      }
    }
  }

  console.log(`    Course: ${learnRes.body?.course?.name}`);
  console.log(`    Total modules: ${modules.length}, Total lessons: ${totalLessons}`);
  console.log(`    Free preview lessons: ${previewLessons}, Locked/Paywalled lessons: ${lockedLessons}`);

  const flashcardCount = learnRes.body?.flashcard_count ?? 0;
  const quizCount = learnRes.body?.quiz_count ?? 0;
  console.log(`    Flashcard items: ${flashcardCount}, Quiz count: ${quizCount}`);

  results["Course & Lesson Experience"] = {
    pass: learnRes.statusCode === 200 && totalLessons > 0,
    details: {
      status: learnRes.statusCode,
      courseTitle: learnRes.body?.course?.name,
      totalLessons,
      previewLessons,
      lockedLessons,
      flashcardCount,
      quizCount,
    },
  };

  // 6. TEST ENTITLEMENTS & SUBSCRIPTION STATUS
  console.log("\n[6] Testing Commerce Entitlements & Subscriptions for student...");
  const entRes = await request("GET", "/v1/commerce/entitlements/my", authHeaders);
  const subRes = await request("GET", "/v1/commerce/subscriptions/my", authHeaders);

  const entitlements = entRes.body?.items || [];
  const subscriptions = subRes.body?.items || [];

  console.log(`    Active Entitlements: ${entitlements.length}`);
  console.log(`    Active Subscriptions: ${subscriptions.length}`);

  results["Entitlements & Subscriptions"] = {
    pass: entRes.statusCode === 200 && subRes.statusCode === 200,
    details: {
      entitlementCount: entitlements.length,
      subscriptionCount: subscriptions.length,
      isFreshUnsubscribedStudent: entitlements.length === 0,
    },
  };

  // 7. TEST LIBRARY
  console.log("\n[7] Testing Library & Public Packs...");
  const libraryRes = await request("GET", "/v1/library/packs", authHeaders);
  const libraryPacks = libraryRes.body?.items || [];
  console.log(`    Published Library Content Packs: ${libraryPacks.length}`);
  results["Library Access"] = {
    pass: libraryRes.statusCode === 200,
    details: {
      status: libraryRes.statusCode,
      packsCount: libraryPacks.length,
    },
  };

  // 8. TEST ADMIN RBAC PROTECTION (CRITICAL SECURITY TEST)
  console.log("\n[8] Testing Admin RBAC Isolation (Student MUST be rejected)...");
  const adminDashboardRes = await request("GET", "/v1/admin/dashboard", authHeaders);
  const adminUsersRes = await request("GET", "/v1/admin/users", authHeaders);
  const adminOrdersRes = await request("GET", "/v1/admin/commerce/orders", authHeaders);
  const adminSettingsRes = await request("GET", "/v1/admin/settings", authHeaders);

  const adminDashboardBlocked = adminDashboardRes.statusCode === 403;
  const adminUsersBlocked = adminUsersRes.statusCode === 403;
  const adminOrdersBlocked = adminOrdersRes.statusCode === 403;
  const adminSettingsBlocked = adminSettingsRes.statusCode === 403;

  console.log(`    GET /v1/admin/dashboard        -> ${adminDashboardRes.statusCode} (Expected 403: ${adminDashboardBlocked})`);
  console.log(`    GET /v1/admin/users            -> ${adminUsersRes.statusCode} (Expected 403: ${adminUsersBlocked})`);
  console.log(`    GET /v1/admin/commerce/orders  -> ${adminOrdersRes.statusCode} (Expected 403: ${adminOrdersBlocked})`);
  console.log(`    GET /v1/admin/settings         -> ${adminSettingsRes.statusCode} (Expected 403: ${adminSettingsBlocked})`);

  const adminSecurityPass =
    adminDashboardBlocked &&
    adminUsersBlocked &&
    adminOrdersBlocked &&
    adminSettingsBlocked;

  results["Admin RBAC Protection"] = {
    pass: adminSecurityPass,
    details: {
      adminDashboardStatus: adminDashboardRes.statusCode,
      adminUsersStatus: adminUsersRes.statusCode,
      adminOrdersStatus: adminOrdersRes.statusCode,
      adminSettingsStatus: adminSettingsRes.statusCode,
      errorResponse: adminDashboardRes.body,
    },
  };
  console.log(`    Result: ${adminSecurityPass ? "PASS (Zero Admin Access)" : "FAIL"}`);

  // Post-test cleanup: Clear test script's device and session so human user can login freely from browser
  await pool.query(`
    DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'student@avana.test');
    DELETE FROM user_devices WHERE user_id = (SELECT id FROM users WHERE email = 'student@avana.test');
  `);
  await pool.end();

  // SUMMARY
  console.log("\n==========================================================");
  console.log("                    SUMMARY OF RESULTS                    ");
  console.log("==========================================================");
  for (const [testName, res] of Object.entries(results)) {
    console.log(`[${res.pass ? "✓ PASS" : "✗ FAIL"}] ${testName}`);
  }
  console.log("==========================================================\n");
}

runTests().catch(console.error);
