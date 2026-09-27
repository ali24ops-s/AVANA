import { describe, it, expect, vi } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
} from "../modules/learning/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type ModuleId,
  type LessonId,
  computeContentHash,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Content Corruption Audit API & Read-only Verification", () => {
  async function setupAuditApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const lessonStore = new InMemoryLessonStore();
    const moduleStore = new InMemoryModuleStore();

    adminStore.setLearningStores({
      lessonStore,
      moduleStore,
    });

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUser(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const admin = await createUser("admin@avana.test", Roles.platform_admin);
    const student = await createUser("student@avana.test", Roles.student);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      lessonStore,
      moduleStore,
    });
    await app.ready();

    return { app, admin, student, adminStore, lessonStore, moduleStore };
  }

  it("1. Authorization: Blocks non-admin users with 403 Forbidden", async () => {
    const { app, student } = await setupAuditApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/content-repair/audit",
      headers: {
        authorization: `Bearer ${student.sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("2. Read-only Safety Guard: Audit executes zero mutations (0 updates/inserts/deletes)", async () => {
    const { app, admin, lessonStore } = await setupAuditApp();

    const lessonId = randomUUID() as LessonId;
    const moduleId = randomUUID() as ModuleId;
    const now = new Date().toISOString();
    const initialContent = "# عنوان درس\n\nمتن با خرابی فرمول textCaC_2 + 2textH 2O";

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "شیمی آلی",
      slug: "organic-chem",
      sequence: 1,
      contentMarkdown: initialContent,
      createdAt: now,
      updatedAt: now,
    });

    const hashBefore = computeContentHash(initialContent);

    // Spy on mutation methods to guarantee strictly read-only execution
    const updateSpy = vi.spyOn(lessonStore, "update");
    const deleteSpy = vi.spyOn(lessonStore, "delete");

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/content-repair/audit",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.body);
    expect(report.totalLessonsScanned).toBe(1);
    expect(report.totalCorruptionFindings).toBe(1);

    // Assert zero mutations occurred
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();

    // Assert database content is 100% untouched
    const fetchedLesson = await lessonStore.findById(lessonId);
    expect(fetchedLesson?.contentMarkdown).toBe(initialContent);
    expect(computeContentHash(fetchedLesson!.contentMarkdown)).toBe(hashBefore);
  });

  it("3. Comprehensive 10-Lesson 100-Block E2E Fixture Audit", async () => {
    const { app, admin, lessonStore } = await setupAuditApp();

    const moduleId = randomUUID() as ModuleId;
    const now = new Date().toISOString();

    // Helper to generate a healthy 10-block lesson markdown
    function makeHealthy10Blocks(prefix: string) {
      return Array.from({ length: 10 }, (_, i) => `${prefix} - بلوک سالم شماره ${i + 1}`).join("\n\n");
    }

    // Lesson 1: 10 blocks, healthy
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۱: مقدمه",
      slug: "l-1",
      sequence: 1,
      contentMarkdown: makeHealthy10Blocks("درس ۱"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 2: 10 blocks, Block 6 corrupted with latex-command-corruption
    const l2Blocks = Array.from({ length: 10 }, (_, i) =>
      i === 5 ? "فرمول هیدرولیز: textCaC_2 + 2textH 2O" : `درس ۲ - بلوک ${i + 1}`,
    );
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۲: شیمی",
      slug: "l-2",
      sequence: 2,
      contentMarkdown: l2Blocks.join("\n\n"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 3: 10 blocks, healthy
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۳: فیزیولوژی",
      slug: "l-3",
      sequence: 3,
      contentMarkdown: makeHealthy10Blocks("درس ۳"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 4: 10 blocks, Block 2 contains leaked JSON object
    const l4Blocks = Array.from({ length: 10 }, (_, i) => {
      if (i === 1) return '{"kind":"session","title":"جلسه ۲","contentMarkdown":"# متن درسنامه"}';
      return `درس ۴ - بلوک ${i + 1}`;
    });
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۴: فارماکولوژی",
      slug: "l-4",
      sequence: 4,
      contentMarkdown: l4Blocks.join("\n\n"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 5: 10 blocks, Block 10 has trailing citation UUIDs
    const l5Blocks = Array.from({ length: 10 }, (_, i) => {
      if (i === 9) return '"e5b67a12-89cd-4ef1-89ab-0123456789de", "5de9a319-4b67-4a12-89cd-0123456789de"';
      return `درس ۵ - بلوک ${i + 1}`;
    });
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۵: بافت‌شناسی",
      slug: "l-5",
      sequence: 5,
      contentMarkdown: l5Blocks.join("\n\n"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 6: 10 blocks, healthy
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۶: آسیب‌شناسی",
      slug: "l-6",
      sequence: 6,
      contentMarkdown: makeHealthy10Blocks("درس ۶"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 7: 10 blocks, Block 4 has duplicated numeric lines
    const l7Blocks = Array.from({ length: 10 }, (_, i) =>
      i === 3 ? "0.62\n0.62" : `درس ۷ - بلوک ${i + 1}`,
    );
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۷: آمار زیستی",
      slug: "l-7",
      sequence: 7,
      contentMarkdown: l7Blocks.join("\n\n"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 8: 10 blocks, healthy
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۸: ایمونولوژی",
      slug: "l-8",
      sequence: 8,
      contentMarkdown: makeHealthy10Blocks("درس ۸"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 9: 10 blocks, Block 8 has unprintable unicode control character
    const l9Blocks = Array.from({ length: 10 }, (_, i) =>
      i === 7 ? "متن با کاراکتر مخرب\u0000کنترلی" : `درس ۹ - بلوک ${i + 1}`,
    );
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۹: ژنتیک",
      slug: "l-9",
      sequence: 9,
      contentMarkdown: l9Blocks.join("\n\n"),
      createdAt: now,
      updatedAt: now,
    });

    // Lesson 10: 10 blocks, healthy
    await lessonStore.create({
      id: randomUUID() as LessonId,
      moduleId,
      title: "درس ۱۰: جمع‌بندی",
      slug: "l-10",
      sequence: 10,
      contentMarkdown: makeHealthy10Blocks("درس ۱۰"),
      createdAt: now,
      updatedAt: now,
    });

    // Run Audit via API endpoint
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/content-repair/audit",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.body);

    // Assert Overall Metrics
    expect(report.totalLessonsScanned).toBe(10);
    expect(report.totalBlocksScanned).toBe(100);
    expect(report.lessonsWithCorruption).toBe(5); // Lessons 2, 4, 5, 7, 9
    expect(report.totalCorruptionFindings).toBe(5); // 1 in L2, 1 in L4, 1 in L5, 1 in L7, 1 in L9

    // Assert Rule Specifics
    const rulesMap = new Map(report.ruleSummaries.map((r: any) => [r.ruleId, r]));

    expect(rulesMap.get("latex-command-corruption").triggerCount).toBe(1);
    expect(rulesMap.get("latex-command-corruption").affectedLessonCount).toBe(1);

    expect(rulesMap.get("json-leakage").triggerCount).toBe(1);
    expect(rulesMap.get("trailing-metadata-leakage").triggerCount).toBe(1);
    expect(rulesMap.get("duplicated-fragment").triggerCount).toBe(1);
    expect(rulesMap.get("unicode-formatting-corruption").triggerCount).toBe(1);

    // Untriggered rules
    expect(rulesMap.get("latex-delimiter-corruption").triggerCount).toBe(0);
    expect(rulesMap.get("broken-whitespace").triggerCount).toBe(0);
  });
});
