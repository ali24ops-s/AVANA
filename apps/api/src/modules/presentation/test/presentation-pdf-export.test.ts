/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import fastify from "fastify";
import type {
  Actor,
  OrganizationId,
  UserId,
} from "@avana/domain";
import {
  asPresentationProjectId,
  asPresentationSlideId,
  asOrganizationId,
  asUserId,
} from "@avana/domain";
import {
  InMemoryPresentationProjectStore,
  InMemoryPresentationReferenceStore,
} from "../in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { presentationProjectRoutes } from "../presentation-project-routes.js";
import { InMemoryOrganizationStore } from "../../organizations/test/in-memory-stores.js";
import fastifyCookie from "@fastify/cookie";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import type { PdfGenerationService } from "../../admin/pdf-generation-service.js";
import { renderPresentationPdfHtml } from "../presentation-pdf-template.js";
import { generateBoundCsrfToken } from "../../identity/csrf.js";

describe("Presentation PDF Export Engine & Endpoint", () => {
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let referenceStore: InMemoryPresentationReferenceStore;
  let orgStore: InMemoryOrganizationStore;
  let mockPdfService: PdfGenerationService;
  let generatedHtmls: string[];

  const tenantOrgId = asOrganizationId(randomUUID());
  const otherOrgId = asOrganizationId(randomUUID());
  const ownerUserId = asUserId(randomUUID());
  const otherUserId = asUserId(randomUUID());

  const ownerToken = "token-owner";
  const otherOrgUserToken = "token-other-org";

  const createTestApp = async () => {
    const app = fastify();
    await app.register(fastifyCookie);
    await app.register(errorHandlerPlugin);

    const mockSessionService = {
      validateSession: async (token: string) => {
        if (token === otherOrgUserToken) {
          return { userId: otherUserId, role: "student", globalRole: null };
        }
        if (token === ownerToken) {
          return { userId: ownerUserId, role: "student", globalRole: null };
        }
        return null;
      },
      validateSessionDetails: async (token: string) => {
        if (token === otherOrgUserToken) {
          return {
            valid: true,
            revoked: false,
            user: { id: otherUserId, userId: otherUserId, role: "student", globalRole: null },
          };
        }
        if (token === ownerToken) {
          return {
            valid: true,
            revoked: false,
            user: { id: ownerUserId, userId: ownerUserId, role: "student", globalRole: null },
          };
        }
        return { valid: false, revoked: false, user: null };
      },
      getConfig: () => ({}),
    } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

    const mockUserStore = {
      findById: async (id: UserId) => ({
        id,
        role: "student",
        globalRole: null,
      }),
    } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

    await app.register(presentationProjectRoutes, {
      projectStore,
      slideStore,
      referenceStore,
      generationService: {
        generateSlide: vi.fn(),
        generateAllSlides: vi.fn(),
        getStatus: vi.fn(),
      } as any,
      organizationStore: orgStore,
      sessionService: mockSessionService,
      userStore: mockUserStore,
      pdfGenerationService: mockPdfService,
    });

    await app.ready();
    return app;
  };

  beforeEach(() => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    referenceStore = new InMemoryPresentationReferenceStore();
    orgStore = new InMemoryOrganizationStore();
    generatedHtmls = [];

    // Register organizations
    orgStore.addOrganization({
      id: tenantOrgId,
      name: "Tenant Alpha",
      slug: "tenant-alpha",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    orgStore.addOrganization({
      id: otherOrgId,
      name: "Tenant Beta",
      slug: "tenant-beta",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Register memberships
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: tenantOrgId,
      userId: ownerUserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: otherOrgId,
      userId: otherUserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Mock PdfGenerationService
    mockPdfService = {
      generatePdfFromHtml: vi.fn().mockImplementation(async (html: string) => {
        generatedHtmls.push(html);
        return Buffer.from("%PDF-1.4 Mock Presentation PDF Content");
      }),
    } as unknown as PdfGenerationService;
  });

  it("Scenario 1: exports PDF with real slide images and default sections", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "ارائه فارماکولوژی بالینی آنتی‌بیوتیک‌ها",
      targetDurationMinutes: 15,
      academicLevel: "advanced",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "مکانیسم اثر بتالاکتام‌ها",
      rawText: "مهار سنتز دیواره سلولی باکتری",
      speakerNotes: null,
    });

    await slideStore.updateSlide(slide.id, project.id, {
      extractionMetadata: {
        speechContent: {
          speechText: "در این اسلاید به بررسی اتصال پنی‌سیلین به PBP و مهار ترانس‌پپتیداسیون می‌پردازیم.",
          keyPoints: ["اتصال به PBP", "مهار سنتز پپتیدوگلیکان"],
          supplementaryExplanation: "این دسته از داروها اثر باکتریسید دارند.",
          clinicalExample: {
            scenario: "بیمار ۳۵ ساله با فارنژیت استرپتوکوکی",
            clinicalPearl: "در صورت سابقه آنافیلاکسی از سفالوسپورین‌ها پرهیز شود.",
          },
          transitionSentence: "حال بیایید به سراغ عوارض جانبی برویم.",
          suggestedDurationSeconds: 120,
        },
      },
    });

    const mockDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        options: {
          includeSlideImages: true,
          includeSpeechText: true,
          includeKeyPoints: true,
          includeSupplementary: true,
          includeClinicalExample: true,
          includeTransitionSentence: true,
          includeEstimatedDuration: true,
        },
        slideImages: {
          1: mockDataUrl,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment;");
    expect(res.body.startsWith("%PDF-")).toBe(true);

    // Verify HTML content passed to Playwright
    expect(generatedHtmls.length).toBe(1);
    const html = generatedHtmls[0];
    expect(html).toContain("ارائه فارماکولوژی بالینی آنتی‌بیوتیک‌ها");
    expect(html).toContain("مکانیسم اثر بتالاکتام‌ها");
    expect(html).toContain(mockDataUrl);
    expect(html).toContain("در این اسلاید به بررسی اتصال پنی‌سیلین");
    expect(html).toContain("اتصال به PBP");
    expect(html).toContain("بیمار ۳۵ ساله با فارنژیت استرپتوکوکی");
    expect(html).toContain("حال بیایید به سراغ عوارض جانبی برویم.");
    expect(html).toContain("زمان تقریبی: ۲ دقیقه");
  });

  it("Scenario 2: falls back to structured content when slide image is absent", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "ارائه بدون تصویر تبدیل‌شده",
      targetDurationMinutes: 10,
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "مقدمه بیوشیمی",
      rawText: "متابولیسم کربوهیدرات‌ها",
    });

    await slideStore.updateSlide(slide.id, project.id, {
      extractionMetadata: {
        textBlocks: [
          { type: "bullet", text: "گلیکولیز در سیتوزول رخ می‌دهد" },
          { type: "bullet", text: "تولید خالص ۲ مولکول ATP" },
        ],
        speechContent: {
          speechText: "فرایند گلیکولیز نخستین گام در تنفس سلولی است.",
        },
      },
      extractedTables: [
        {
          headers: ["مرحله", "آنزیم"],
          rows: [["۱", "هگزوکیناز"], ["۳", "فسفوفروکتوکیناز"]],
        },
      ],
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
      payload: {
        options: {
          includeSlideImages: true,
          includeSpeechText: true,
        },
        slideImages: {}, // No slide images provided
      },
    });

    expect(res.statusCode).toBe(200);
    const html = generatedHtmls[0];
    // Structured fallback notice must appear
    expect(html).toContain("بازسازی ساختار محتوایی اسلاید");
    expect(html).toContain("گلیکولیز در سیتوزول رخ می‌دهد");
    expect(html).toContain("هگزوکیناز");
    expect(html).toContain("فسفوفروکتوکیناز");
  });

  it("Scenario 3: user-edited speakerNotes and draftNotes take precedence over raw AI speech", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "تست اولویت متن کاربر",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "اسلاید اول",
      rawText: "محتوا",
      speakerNotes: "متن سخنرانی ویرایش‌شده و ذخیره‌شده در دیتابیس توسط کاربر",
    });

    await slideStore.updateSlide(slide.id, project.id, {
      extractionMetadata: {
        speechContent: {
          speechText: "متن اولیه خام تولیدشده توسط هوش مصنوعی",
        },
      },
    });

    // Test 1: Saved DB notes take precedence over AI text
    const res1 = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { options: {} },
    });

    expect(res1.statusCode).toBe(200);
    expect(generatedHtmls[0]).toContain("متن سخنرانی ویرایش‌شده و ذخیره‌شده در دیتابیس");
    expect(generatedHtmls[0]).not.toContain("متن اولیه خام تولیدشده توسط هوش مصنوعی");
    expect(generatedHtmls[0]).toContain("ویرایش‌شده توسط کاربر");

    // Test 2: Unsaved draft in request takes precedence over even DB notes
    generatedHtmls = [];
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        options: {},
        draftNotesBySlideId: {
          [slide.id]: "جدیدترین پیش‌نویس موقت تایپ‌شده در مرورگر قبل از کلیک دانلود",
        },
      },
    });

    expect(res2.statusCode).toBe(200);
    expect(generatedHtmls[0]).toContain("جدیدترین پیش‌نویس موقت تایپ‌شده در مرورگر");
    expect(generatedHtmls[0]).not.toContain("متن سخنرانی ویرایش‌شده و ذخیره‌شده در دیتابیس");
  });

  it("Scenario 4: respects disabled options (no empty boxes rendered)", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "تست بخش‌های غیرفعال",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "اسلاید تستی",
      rawText: "متن",
    });

    await slideStore.updateSlide(slide.id, project.id, {
      extractionMetadata: {
        speechContent: {
          speechText: "متن سخنرانی کامل",
          keyPoints: ["نکته ۱"],
          supplementaryExplanation: "توضیح تکمیلی",
          clinicalExample: { scenario: "سناریو تستی" },
          transitionSentence: "جمله انتقال تستی",
          suggestedDurationSeconds: 60,
        },
      },
    });

    // User disables all optional sections
    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        options: {
          includeSpeechText: false,
          includeKeyPoints: false,
          includeSupplementary: false,
          includeClinicalExample: false,
          includeTransitionSentence: false,
          includeEstimatedDuration: false,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const html = generatedHtmls[0];
    expect(html).not.toContain("متن ارائه شفاهی");
    expect(html).not.toContain("نکات کلیدی برای ارائه");
    expect(html).not.toContain("توضیحات تکمیلی");
    expect(html).not.toContain("سناریوی آموزشی و کاربردی");
    expect(html).not.toContain("جمله انتقال به اسلاید بعدی");
    expect(html).not.toContain("زمان تقریبی");
  });

  it("Scenario 5: enforces tenant isolation and rejects unauthorized access", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "پروژه محرمانه سازمان A",
    });

    // Request with token from different tenant
    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: {
        authorization: `Bearer ${otherOrgUserToken}`,
      },
      payload: { options: {} },
    });

    // Non-disclosing 404
    expect(res.statusCode).toBe(404);
    expect(mockPdfService.generatePdfFromHtml).not.toHaveBeenCalled();

    // Request without token (401)
    const unauthRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      payload: { options: {} },
    });
    expect(unauthRes.statusCode).toBe(401);
  });

  it("Scenario 6: rejects presentation with zero slides with 400 bad_request", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "پروژه خالی",
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { options: {} },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    const errorMessage = body.message || body.error?.message || "";
    expect(errorMessage).toContain("فاقد اسلاید");
  });

  it("Scenario 7: handles mixed Persian and English content with proper character escaping", async () => {
    const html = renderPresentationPdfHtml({
      projectTitle: "Pharmacology & بیوشیمی <script>alert(1)</script>",
      totalSlides: 1,
      options: {
        includeSpeechText: true,
      },
      slides: [
        {
          slideIndex: 1,
          title: "Inhibition of CYP3A4 & P-gp (P-glycoprotein)",
          speechText: "داروی Clarithromycin باعث افزایش غلظت خونی Digoxin به میزان 50% می‌شود.",
          isUserEditedNotes: false,
        },
      ],
    });

    // Verify XSS prevention
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    // Verify typography and mixed content
    expect(html).toContain("CYP3A4 &amp; P-gp");
    expect(html).toContain("Clarithromycin");
    expect(html).toContain("Digoxin");
    expect(html).toContain("dir=\"rtl\"");
  });

  it("Scenario 8: enforces cookie-based CSRF protection (validates, rejects missing/mismatched token)", async () => {
    const app = await createTestApp();

    const project = await projectStore.create({
      organizationId: tenantOrgId,
      ownerUserId,
      title: "پروژه تست کوکی و CSRF",
    });

    await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "اسلاید تستی",
      rawText: "محتوا",
    });

    const validCsrf = generateBoundCsrfToken(ownerToken);

    // 1. Success case: cookie avana_session + cookie avana_csrf + header x-csrf-token
    const successRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      cookies: {
        avana_session: ownerToken,
        avana_csrf: validCsrf,
      },
      headers: {
        "x-csrf-token": validCsrf,
        origin: "http://localhost:5173",
      },
      payload: { options: {} },
    });

    expect(successRes.statusCode).toBe(200);
    expect(successRes.headers["content-type"]).toBe("application/pdf");

    // 2. Failure case: cookie avana_session + avana_csrf but MISSING x-csrf-token header -> 403 Forbidden "CSRF token missing"
    const missingCsrfRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      cookies: {
        avana_session: ownerToken,
        avana_csrf: validCsrf,
      },
      headers: {
        origin: "http://localhost:5173",
      },
      payload: { options: {} },
    });

    expect(missingCsrfRes.statusCode).toBe(403);
    const missingBody = missingCsrfRes.json();
    const missingError = missingBody.message || missingBody.error?.message || "";
    expect(missingError).toContain("CSRF token missing");

    // 3. Failure case: cookie avana_session + avana_csrf but MISMATCHED x-csrf-token header -> 403 Forbidden "CSRF token mismatch"
    const mismatchedCsrfRes = await app.inject({
      method: "POST",
      url: `/v1/presentation/projects/${project.id}/export-pdf`,
      cookies: {
        avana_session: ownerToken,
        avana_csrf: validCsrf,
      },
      headers: {
        "x-csrf-token": "mismatched-token-value",
        origin: "http://localhost:5173",
      },
      payload: { options: {} },
    });

    expect(mismatchedCsrfRes.statusCode).toBe(403);
    const mismatchedBody = mismatchedCsrfRes.json();
    const mismatchedError = mismatchedBody.message || mismatchedBody.error?.message || "";
    expect(mismatchedError).toContain("CSRF token mismatch");
  });
});
