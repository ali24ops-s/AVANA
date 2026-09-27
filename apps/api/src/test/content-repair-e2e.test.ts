import { describe, it, expect } from "vitest";
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
  splitMarkdownDocument,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Content Repair Engine — End-to-End Verification (API, DB, Isolation, Concurrency, Auth)", () => {
  // 10-Block Production-like Lesson Fixture
  const block1 = "# مقدمه درس شیمی دارویی و فرآیندهای آلی";
  const block2 = "این فصل به بررسی فرآیندهای هیدرولیز، ترمودینامیک و سنتز ترکیبات دارویی و صنعتی می‌پردازد.";
  const block3 = "## ساختار و برهمکنش‌های ترکیبات";
  const block4 = "کلسیم کاربید ترکیبی است که در حضور آب واکنش داده و گاز استیلن تولید می‌کند.";
  const block5 = "| ماده | فرمول | وزن مولکولی |\n|---|---|---|\n| آب | H2O | 18 |\n| استیلن | C2H2 | 26 |";
  const corruptedBlock6 = "فرمول شیمیایی واکنش به صورت textCaC_2 + 2textH 2O در تعادل است.";
  const block7 = "> **نکته بالینی و آزمایشگاهی:** واکنش بسیار گرمازا است و نیاز به نظارت دقیق دارد.";
  const block8 = "- مرحله اول: اضافه کردن قطره‌ای آب\n- مرحله دوم: جمع‌آوری گاز در ظرف بسته\n- مرحله سوم: سنجش خلوص گاز حاصل";
  const block9 = "$$\n\\Delta H = -127 \\text{ kJ/mol}\n$$";
  const block10 = "جهت مطالعه تکمیلی و پروتکل‌های ایمنی به بخش فارماکوپه مراجعه نمایید.";

  const productionLessonContent = [
    block1,
    block2,
    block3,
    block4,
    block5,
    corruptedBlock6,
    block7,
    block8,
    block9,
    block10,
  ].join("\n\n");

  async function setupE2EApp() {
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
      return { user, sessionToken: session.sessionToken, orgId };
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

    return { app, admin, student, lessonStore, moduleStore };
  }

  it("Full Flow: Detection -> Preview -> Block Isolation (1-5, 7-10 unchanged, 6 repaired) -> Apply -> Persistence", async () => {
    const { app, admin, lessonStore } = await setupE2EApp();

    const lessonId = randomUUID() as LessonId;
    const moduleId = randomUUID() as ModuleId;
    const now = new Date().toISOString();

    // 1. Persist initial lesson with 10 blocks (block 6 corrupted)
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "شیمی دارویی - جلسه ۱",
      slug: "pharma-chem-1",
      sequence: 1,
      contentMarkdown: productionLessonContent,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Detection & Preview via Admin Endpoint
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId,
      },
    });

    expect(previewRes.statusCode).toBe(200);
    const previewBody = JSON.parse(previewRes.body);

    // Assert Detection
    expect(previewBody.hasRepairs).toBe(true);
    expect(previewBody.candidates).toHaveLength(1);
    expect(previewBody.candidates[0].ruleId).toBe("latex-command-corruption");
    expect(previewBody.candidates[0].confidenceLevel).toBe("HIGH");
    expect(previewBody.candidates[0].blockIndex).toBe(5); // 0-indexed block 6

    // Assert Preview content
    expect(previewBody.repairedContent).toContain("\\text{CaC}_2 + 2\\text{H}_2\\text{O}");
    expect(previewBody.repairedContent).not.toContain("textCaC_2");

    // Assert Scope & Block Isolation: 1-5 unchanged, 6 repaired, 7-10 unchanged
    const originalBlocks = splitMarkdownDocument(productionLessonContent).blocks;
    const repairedBlocks = splitMarkdownDocument(previewBody.repairedContent).blocks;

    expect(originalBlocks).toHaveLength(10);
    expect(repairedBlocks).toHaveLength(10);

    // Blocks 1 to 5 strictly unchanged (identical raw content and byte slices)
    expect(repairedBlocks[0].raw).toBe(originalBlocks[0].raw);
    expect(repairedBlocks[1].raw).toBe(originalBlocks[1].raw);
    expect(repairedBlocks[2].raw).toBe(originalBlocks[2].raw);
    expect(repairedBlocks[3].raw).toBe(originalBlocks[3].raw);
    expect(repairedBlocks[4].raw).toBe(originalBlocks[4].raw);

    // Block 6 strictly repaired
    expect(repairedBlocks[5].raw).not.toBe(originalBlocks[5].raw);
    expect(originalBlocks[5].raw).toBe(corruptedBlock6);
    expect(repairedBlocks[5].raw).toBe(
      "فرمول شیمیایی واکنش به صورت \\text{CaC}_2 + 2\\text{H}_2\\text{O} در تعادل است.",
    );

    // Blocks 7 to 10 strictly unchanged
    expect(repairedBlocks[6].raw).toBe(originalBlocks[6].raw);
    expect(repairedBlocks[7].raw).toBe(originalBlocks[7].raw);
    expect(repairedBlocks[8].raw).toBe(originalBlocks[8].raw);
    expect(repairedBlocks[9].raw).toBe(originalBlocks[9].raw);

    // 3. Apply repair
    const originalHash = previewBody.originalHash;
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: {
        authorization: `Bearer ${admin.sessionToken}`,
      },
      payload: {
        lessonId,
        originalHash,
        appliedRuleIds: ["latex-command-corruption"],
        appliedBlockIndices: [5],
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const applyBody = JSON.parse(applyRes.body);
    expect(applyBody.success).toBe(true);
    expect(applyBody.repairedBlockCount).toBe(1);

    // 4. Persistence Reload Verification
    const reloadedLesson = await lessonStore.findById(lessonId);
    expect(reloadedLesson).toBeDefined();
    expect(reloadedLesson?.contentMarkdown).toBe(previewBody.repairedContent);

    // Re-split reloaded content to confirm exact persistence
    const reloadedBlocks = splitMarkdownDocument(reloadedLesson!.contentMarkdown).blocks;
    expect(reloadedBlocks[0].raw).toBe(block1);
    expect(reloadedBlocks[1].raw).toBe(block2);
    expect(reloadedBlocks[2].raw).toBe(block3);
    expect(reloadedBlocks[3].raw).toBe(block4);
    expect(reloadedBlocks[4].raw).toBe(block5);
    expect(reloadedBlocks[5].raw).toBe(
      "فرمول شیمیایی واکنش به صورت \\text{CaC}_2 + 2\\text{H}_2\\text{O} در تعادل است.",
    );
    expect(reloadedBlocks[6].raw).toBe(block7);
    expect(reloadedBlocks[7].raw).toBe(block8);
    expect(reloadedBlocks[8].raw).toBe(block9);
    expect(reloadedBlocks[9].raw).toBe(block10);
  });

  it("Optimistic Concurrency Control: Rejects apply when content was modified concurrently", async () => {
    const { app, admin, lessonStore } = await setupE2EApp();

    const lessonId = randomUUID() as LessonId;
    const moduleId = randomUUID() as ModuleId;
    const now = new Date().toISOString();

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "شیمی - تست همروندی",
      slug: "concurrency-test",
      sequence: 1,
      contentMarkdown: productionLessonContent,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Admin gets preview with current hash
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { authorization: `Bearer ${admin.sessionToken}` },
      payload: { lessonId },
    });
    const { originalHash: previewHash } = JSON.parse(previewRes.body);

    // 2. Concurrent user modifies the lesson in background
    const modifiedContent = productionLessonContent + "\n\nویرایش هم‌زمان توسط کاربر دیگر.";
    await lessonStore.update({
      id: lessonId,
      moduleId,
      title: "شیمی - تست همروندی",
      slug: "concurrency-test",
      sequence: 1,
      contentMarkdown: modifiedContent,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    });

    // 3. Admin attempts to apply with stale previewHash
    const failedApplyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { authorization: `Bearer ${admin.sessionToken}` },
      payload: {
        lessonId,
        originalHash: previewHash,
      },
    });

    // Expect conflict rejection (409)
    expect(failedApplyRes.statusCode).toBe(409);
    const failedBody = JSON.parse(failedApplyRes.body);
    const msg = failedBody.error?.message || failedBody.message;
    expect(msg).toContain("عدم تطابق");

    // Verify DB was NOT overwritten with stale repair
    const intactLesson = await lessonStore.findById(lessonId);
    expect(intactLesson?.contentMarkdown).toBe(modifiedContent);

    // 4. Now with fresh hash, Apply succeeds
    const freshHash = computeContentHash(modifiedContent);
    const successApplyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { authorization: `Bearer ${admin.sessionToken}` },
      payload: {
        lessonId,
        originalHash: freshHash,
      },
    });

    expect(successApplyRes.statusCode).toBe(200);
    const updatedLesson = await lessonStore.findById(lessonId);
    expect(updatedLesson?.contentMarkdown).toContain("\\text{CaC}_2 + 2\\text{H}_2\\text{O}");
    expect(updatedLesson?.contentMarkdown).toContain("ویرایش هم‌زمان توسط کاربر دیگر.");
  });

  it("Admin Authorization: Non-admin users cannot access preview or apply endpoints", async () => {
    const { app, student } = await setupE2EApp();

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { authorization: `Bearer ${student.sessionToken}` },
      payload: { content: productionLessonContent },
    });
    expect(previewRes.statusCode).toBe(403);

    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { authorization: `Bearer ${student.sessionToken}` },
      payload: {
        content: productionLessonContent,
        originalHash: computeContentHash(productionLessonContent),
      },
    });
    expect(applyRes.statusCode).toBe(403);
  });
});
