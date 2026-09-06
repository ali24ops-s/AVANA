/**
 * Comprehensive Pipeline & Regression Tests for Educational Callouts & Zero-Emoji Enforcement.
 */

import { describe, it, expect } from "vitest";
import {
  getPromptRegistry,
  LESSON_GENERATION_SYSTEM_PROMPT,
  LANGUAGE_REQUIREMENT_PROMPT,
  buildLessonGenerationUserPrompt,
} from "../modules/generation/prompt-registry.js";
import { normalizeEducationalContent } from "@avana/domain";
import { ContentService } from "../modules/learning/content-service.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  parseCourseId,
  parseModuleId,
  parseOrganizationId,
  parseUserId,
  type Actor,
} from "@avana/domain";

describe("Educational Callouts & Zero-Emoji Pipeline Tests", () => {
  describe("1. Prompt Registry & Instructions Invariants", () => {
    it("ensures LANGUAGE_REQUIREMENT_PROMPT strictly prohibits emojis in educational content", () => {
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("MANDATORY ZERO-EMOJI & SEMANTIC CALLOUT POLICY");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("NEVER use emojis, stickers, or graphical icons");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("> **هشدار:**");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("> **اشتباه رایج:**");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("> **نکته بالینی:**");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("> **منع مصرف:**");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("> **نکته کلیدی:**");
    });

    it("ensures buildLessonGenerationUserPrompt contains semantic callout instructions without emoji labels", () => {
      const prompt = buildLessonGenerationUserPrompt({
        documentTitle: "فارماکولوژی سیستم قلبی عروقی",
        sessionBlueprint: "{}",
        chunkContext: "sample chunk context",
        chunkIdList: ["chk-1"],
      });

      // Section 7 must instruct clean semantic callouts
      expect(prompt).toContain("Use clean semantic Markdown callouts (STRICTLY WITHOUT ANY EMOJIS OR STICKERS)");
      expect(prompt).toContain("> **اشتباه رایج:**");
      expect(prompt).toContain("> **توضیح تکمیلی:**");
      expect(prompt).toContain("> **برای فهم بهتر:**");
      expect(prompt).toContain("> **هشدار:**");

      // Must not tell the model to use emoji labels as triggers
      expect(prompt).not.toContain("💡 توضیح تکمیلی");
      expect(prompt).not.toContain("🧠 برای فهم بهتر");
      expect(prompt).not.toContain("⚠️ اشتباه رایج");
      expect(prompt).not.toContain("📌 نکته آموزشی");
    });
  });

  describe("2. Normalization Engine Layer in Generation & Persistence", () => {
    it("recovers user bug scenario text to clean semantic callout", () => {
      const rawAiOutput =
        "⚠️ اشتباه رایج در بیماران مبتلا به آسم یا نارسایی قلبی شدید: اگر بتابلاکرها به دلیل برونکواسپاسم یا نارسایی قلبی شدید منع مصرف داشته باشند، برای کنترل تاکیکاردی و فشارخون میتوان از دیلتیازم (Diltiazem) استفاده کرد.";

      const normalized = normalizeEducationalContent(rawAiOutput);

      expect(normalized).toBe(
        "**اشتباه رایج:** در بیماران مبتلا به آسم یا نارسایی قلبی شدید: اگر بتابلاکرها به دلیل برونکواسپاسم یا نارسایی قلبی شدید منع مصرف داشته باشند، برای کنترل تاکیکاردی و فشارخون میتوان از دیلتیازم (Diltiazem) استفاده کرد."
      );
      expect(normalized).not.toContain("⚠️");
      expect(normalized).toContain("دیلتیازم (Diltiazem)");
    });

    it("preserves canonical semantic callout without duplication or alteration", () => {
      const canonicalInput =
        "> **اشتباه رایج:** اگر بتابلاکرها به دلیل برونکواسپاسم یا نارسایی قلبی شدید منع مصرف داشته باشند، برای کنترل تاکیکاردی و فشارخون میتوان از دیلتیازم (Diltiazem) استفاده کرد.";

      const normalized = normalizeEducationalContent(canonicalInput);

      expect(normalized).toBe(canonicalInput);
      expect(normalizeEducationalContent(normalized)).toBe(canonicalInput);
    });

    it("preserves medical symbols, dosages, Greek letters, and formulas", () => {
      const medicalContent = [
        "## مهارکننده‌های گیرنده $\\beta_1$ و $\\alpha_1$",
        "داروی کارودیلول روی هر دو گیرنده $\\alpha_1$ و $\\beta$ اثر مهاری دارد.",
        "دوز اولیه 3.125 mg دو بار در روز است و تا حداکثر 50 mg/day قابل افزایش است.",
        "در بیماران با نارسایی قلبی شدید، پایش $\\Delta P$ و ضربان قلب الزامی است.",
        "تبدیل $T_4 \\to T_3$ در تیروئید رخ می‌دهد.",
      ].join("\n");

      const normalized = normalizeEducationalContent(medicalContent);
      expect(normalized).toBe(medicalContent);
    });

    it("recovers all three real-world Callout subtitle cases without orphaned **", () => {
      // Sample 1: درباره سناریوی بالینی (Case Study):**
      const s1 = "> **نکته بالینی: درباره سناریوی بالینی (Case Study):** در بیمار با نارسایی قلبی، تجویز بتابلاکر غیراختصاصی منع مصرف دارد.";
      const norm1 = normalizeEducationalContent(s1);
      expect(norm1).toBe("> **نکته بالینی:** درباره سناریوی بالینی (Case Study): در بیمار با نارسایی قلبی، تجویز بتابلاکر غیراختصاصی منع مصرف دارد.");
      expect(norm1).not.toContain("Study):**");
      expect(norm1.replace("> **نکته بالینی:**", "")).not.toContain("**");

      // Sample 2: در ارتباط با کمبود آنزیمی:**
      const s2 = "**نکته آموزشی: در ارتباط با کمبود آنزیمی:** کمبود G6PD باعث همولیز می‌شود.";
      const norm2 = normalizeEducationalContent(s2);
      expect(norm2).toBe("**نکته آموزشی:** در ارتباط با کمبود آنزیمی: کمبود G6PD باعث همولیز می‌شود.");
      expect(norm2).not.toContain("آنزیمی:**");
      expect(norm2.replace("**نکته آموزشی:**", "")).not.toContain("**");

      // Sample 3: (آندروژنهای آدرنال):**
      const s3a = "> **نکته کلیدی: (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";
      const s3b = "> **نکته کلیدی (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";
      const norm3a = normalizeEducationalContent(s3a);
      const norm3b = normalizeEducationalContent(s3b);
      expect(norm3a).toBe("> **نکته کلیدی:** (آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");
      expect(norm3b).toBe("> **نکته کلیدی:** (آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");
      expect(norm3a).not.toContain("آدرنال):**");
      expect(norm3b).not.toContain("آدرنال):**");
      expect(norm3a.replace("> **نکته کلیدی:**", "")).not.toContain("**");
      expect(norm3b.replace("> **نکته کلیدی:**", "")).not.toContain("**");
    });
  });

  describe("3. ContentService write path enforcement", () => {
    it("normalizes contentMarkdown on createLesson and updateLesson", async () => {
      const orgStore = new InMemoryOrganizationStore();
      const courseStore = new InMemoryCourseStore();
      const moduleStore = new InMemoryModuleStore();
      const lessonStore = new InMemoryLessonStore();

      const orgId = "11111111-1111-1111-1111-111111111111" as OrganizationId;
      const userId = "22222222-2222-2222-2222-222222222222" as UserId;
      const courseId = "33333333-3333-3333-3333-333333333333" as CourseId;
      const moduleId = "44444444-4444-4444-4444-444444444444" as ModuleId;

      await orgStore.createWithAdminMembership({
        organization: {
          id: orgId,
          name: "Test Org",
          slug: "test-org",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: "55555555-5555-5555-5555-555555555555" as any,
          organizationId: orgId,
          userId,
          role: "organization_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      await courseStore.create({
        course: {
          id: courseId,
          organizationId: orgId,
          name: "داروشناسی بالینی",
          subject: "فارماکولوژی",
          examDate: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      await moduleStore.create({
        id: moduleId,
        courseId,
        title: "فصل اول",
        description: "",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const contentService = new ContentService(
        courseStore,
        orgStore,
        moduleStore,
        lessonStore,
      );

      const actor: Actor = {
        userId,
        role: "organization_admin",
      };

      // Create lesson with legacy emoji callout
      const created = await contentService.createLesson(
        actor,
        orgId,
        courseId,
        moduleId,
        "جلسه بتابلاکرها",
        "⚠️ اشتباه رایج: نباید در آسم مصرف شود.",
      );

      expect(created.lesson.content_markdown).toBe(
        "**اشتباه رایج:** نباید در آسم مصرف شود."
      );
      expect(created.lesson.content_markdown).not.toContain("⚠️");

      // Update lesson with another legacy emoji trigger
      const updated = await contentService.updateLesson(
        actor,
        orgId,
        courseId,
        moduleId,
        created.lesson.id as any,
        {
          contentMarkdown: "🚨 هشدار: خطر شوک آنافیلاکسی!",
        }
      );

      expect(updated.lesson.content_markdown).toBe(
        "**هشدار:** خطر شوک آنافیلاکسی!"
      );
      expect(updated.lesson.content_markdown).not.toContain("🚨");
    });
  });
});
