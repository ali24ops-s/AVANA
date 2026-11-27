import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PocketAggregateDetailPage } from "../pages/pocket/PocketAggregateDetailPage.js";
import type {
  ClinicalAggregateMetadata,
  AggregateAssertionsQueryResult,
  PocketRelatedEntitiesResponse,
} from "../lib/api/pocket.js";

// Sample valid RFC 4122 UUIDs
const DRUG_UUID = "c8b0a514-4fb9-4f80-b747-91f1a5ff6818";
const DISEASE_UUID = "11111111-2222-4333-8444-555555555555";
const TREATMENT_UUID = "22222222-3333-4444-8555-666666666666";
const EMERGENCY_UUID = "33333333-4444-4555-8666-777777777777";

// Mutable Mock States
let mockConsumptionData: AggregateAssertionsQueryResult | null = null;
let mockMetadataData: ClinicalAggregateMetadata | null = null;
let mockRelatedData: PocketRelatedEntitiesResponse | null = null;

let mockConsumptionLoading = false;
let mockMetadataLoading = false;
let mockRelatedLoading = false;

let mockConsumptionError: Error | null = null;
let mockMetadataError: Error | null = null;
let mockRelatedError: Error | null = null;

let mockRefetchConsumption = vi.fn();
let mockRefetchRelated = vi.fn();

let consumptionHookCalls: Array<{ type: string; id: string | undefined }> = [];
let metadataHookCalls: Array<{ type: string; id: string | undefined }> = [];
let relatedHookCalls: Array<{ type: string; id: string | undefined; enabled?: boolean }> = [];

vi.mock("../hooks/usePocketConsumption.js", () => ({
  usePocketConsumption: (type: string, id: string | undefined) => {
    consumptionHookCalls.push({ type, id });
    return {
      data: id ? mockConsumptionData : null,
      isLoading: id ? mockConsumptionLoading : false,
      error: id ? mockConsumptionError : null,
      refetch: mockRefetchConsumption,
    };
  },
}));

vi.mock("../hooks/usePocketAggregateMetadata.js", () => ({
  usePocketAggregateMetadata: (type: string, id: string | undefined) => {
    metadataHookCalls.push({ type, id });
    return {
      data: id ? mockMetadataData : null,
      isLoading: id ? mockMetadataLoading : false,
      error: id ? mockMetadataError : null,
    };
  },
}));

vi.mock("../hooks/usePocketRelatedEntities.js", () => ({
  usePocketRelatedEntities: (type: string, id: string | undefined, options?: { enabled?: boolean }) => {
    relatedHookCalls.push({ type, id, enabled: options?.enabled });
    return {
      data: id && options?.enabled ? mockRelatedData : null,
      isLoading: id && options?.enabled ? mockRelatedLoading : false,
      error: id && options?.enabled ? mockRelatedError : null,
      refetch: mockRefetchRelated,
    };
  },
}));

function renderDetail(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/pocket/:type/:id" element={<PocketAggregateDetailPage />} />
          <Route path="/pocket/explorer" element={<div>صفحه کاوشگر</div>} />
          <Route path="/pocket" element={<div>خانه پاکت</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AVANA Pocket Phase 4: Aggregate Detail Pages & Related Entities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumptionHookCalls = [];
    metadataHookCalls = [];
    relatedHookCalls = [];

    mockConsumptionLoading = false;
    mockMetadataLoading = false;
    mockRelatedLoading = false;

    mockConsumptionError = null;
    mockMetadataError = null;
    mockRelatedError = null;

    mockRefetchConsumption = vi.fn();
    mockRefetchRelated = vi.fn();

    // Default Drug Data
    mockConsumptionData = {
      aggregateType: "drug",
      aggregateId: DRUG_UUID,
      currentVersion: 1,
      assertions: [
        {
          id: "asst-1",
          assertionRootId: "root-1",
          versionNumber: 1,
          previousVersionId: null,
          aggregateType: "drug",
          aggregateId: DRUG_UUID,
          assertionType: "contraindication",
          assertionKey: "atorva_rhabdo",
          statementText: "مصرف در نارسایی شدید کبدی منع قطعی دارد.",
          jurisdiction: "IR / FDA",
          targetPopulation: "بزرگسالان",
          clinicalSetting: "بستری و سرپایی",
          validUntilDate: null,
          publishedAt: "2026-03-20T10:00:00Z",
          isClinicallyVerified: false,
          verifiedAt: null,
        },
      ],
    };

    mockMetadataData = {
      id: DRUG_UUID,
      type: "drug",
      slug: "atorvastatin",
      nameEn: "Atorvastatin",
      nameFa: "آتورواستاتین",
      classification: "HMG-CoA Reductase Inhibitor",
      summary: "مهارکننده رقابتی آنزیم ردوکتاز جهت کاهش سنتز کلسترول.",
      publishedAt: "2026-03-20T10:00:00Z",
      versionNumber: 1,
    };

    mockRelatedData = {
      aggregateType: "drug",
      aggregateId: DRUG_UUID,
      groups: [
        {
          relationshipCategory: "indicated_diseases",
          relationshipLabelFa: "بیماری‌ها و اندیکاسیون‌های مرتبط",
          entities: [
            {
              id: DISEASE_UUID,
              slug: "hyperlipidemia",
              type: "disease",
              titleEn: "Hyperlipidemia",
              titleFa: "هیپرلیپیدمی اولیه",
              classification: "E78.5",
              relationshipType: "اندیکاسیون خط اول",
              clinicalNotes: "کاهش سطح LDL-C در بیماران با ریسک قلبی-عروقی بالا",
              verification: {
                isClinicallyVerified: true,
                verifiedAssertionsCount: 3,
                totalAssertionsCount: 3,
                lastVerifiedAt: "2026-03-21T10:00:00Z",
              },
            },
          ],
        },
        {
          relationshipCategory: "treatments",
          relationshipLabelFa: "پروتکل‌های درمانی مربوطه",
          entities: [
            {
              id: TREATMENT_UUID,
              slug: "lipid-lowering-guideline",
              type: "treatment",
              titleEn: "Lipid Lowering Protocol",
              titleFa: "پروتکل کاهش چربی خون",
              classification: "فارماکوتراپی",
              relationshipType: "درمان استاندارد",
              clinicalNotes: "دوز پایه ۲۰ تا ۸۰ میلی‌گرم روزانه",
              verification: {
                isClinicallyVerified: false,
                verifiedAssertionsCount: 0,
                totalAssertionsCount: 1,
                lastVerifiedAt: null,
              },
            },
          ],
        },
        {
          relationshipCategory: "interactions",
          relationshipLabelFa: "تداخلات دارویی مهم",
          entities: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              slug: "clarithromycin",
              type: "drug",
              titleEn: "Clarithromycin",
              titleFa: "کلاریترومایسین",
              classification: "Macrolide Antibiotic",
              relationshipType: "تداخل: شدید (Major)",
              clinicalNotes: "افزایش غلظت خونی آتورواستاتین — اقدام: قطع موقت یا کاهش دوز",
              verification: {
                isClinicallyVerified: true,
                verifiedAssertionsCount: 2,
                totalAssertionsCount: 2,
                lastVerifiedAt: "2026-03-21T12:00:00Z",
              },
            },
          ],
        },
      ],
    };
  });

  // ---------------------------------------------------------------------------
  // 1. Related Entities Rendering for All 4 Pillars
  // ---------------------------------------------------------------------------
  describe("1. Four Pillars Support", () => {
    it("renders Drug aggregate with pillar metadata and 3 related groups (diseases, treatments, interactions)", () => {
      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      // Overview Card & Pillar Labels
      expect(screen.getByRole("heading", { name: "آتورواستاتین" })).toBeInTheDocument();
      expect(screen.getByText("عنوان علمی لاتین: Atorvastatin")).toBeInTheDocument();
      expect(screen.getByText("رده دارویی: HMG-CoA Reductase Inhibitor")).toBeInTheDocument();
      expect(screen.getByText("مکانیسم اثر")).toBeInTheDocument();
      expect(screen.getByText("مهارکننده رقابتی آنزیم ردوکتاز جهت کاهش سنتز کلسترول.")).toBeInTheDocument();

      // Related Groups
      expect(screen.getByText("بیماری‌ها و اندیکاسیون‌های مرتبط")).toBeInTheDocument();
      expect(screen.getByText("پروتکل‌های درمانی مربوطه")).toBeInTheDocument();
      expect(screen.getByText("تداخلات دارویی مهم")).toBeInTheDocument();

      // Related Cards
      expect(screen.getByText("هیپرلیپیدمی اولیه")).toBeInTheDocument();
      expect(screen.getByText("پروتکل کاهش چربی خون")).toBeInTheDocument();
      expect(screen.getByText("کلاریترومایسین")).toBeInTheDocument();
    });

    it("renders Disease aggregate with ICD-10 and definition, plus related medications and treatments", () => {
      mockConsumptionData = {
        aggregateType: "disease",
        aggregateId: DISEASE_UUID,
        currentVersion: 2,
        assertions: [],
      };
      mockMetadataData = {
        id: DISEASE_UUID,
        type: "disease",
        slug: "asthma",
        nameEn: "Asthma",
        nameFa: "آسم برونشیال",
        classification: "J45.9",
        summary: "التهاب مزمن مجاری هوایی با هایپرریسپانسیونی و انسداد برگشت‌پذیر.",
        publishedAt: "2026-03-20T10:00:00Z",
        versionNumber: 2,
      };
      mockRelatedData = {
        aggregateType: "disease",
        aggregateId: DISEASE_UUID,
        groups: [
          {
            relationshipCategory: "medications",
            relationshipLabelFa: "داروهای مرتبط و اندیکاسیون",
            entities: [
              {
                id: DRUG_UUID,
                slug: "salbutamol",
                type: "drug",
                titleEn: "Salbutamol",
                titleFa: "سالبوتامول",
                classification: "SABA",
                relationshipType: "تسکین‌دهنده سریع",
                clinicalNotes: "استنشاقی در حملات حاد تنگی نفس",
                verification: {
                  isClinicallyVerified: true,
                  verifiedAssertionsCount: 1,
                  totalAssertionsCount: 1,
                  lastVerifiedAt: "2026-03-21T00:00:00Z",
                },
              },
            ],
          },
        ],
      };

      renderDetail(`/pocket/disease/${DISEASE_UUID}`);

      expect(screen.getByRole("heading", { name: "آسم برونشیال" })).toBeInTheDocument();
      expect(screen.getByText("کد طبقه‌بندی (ICD-10): J45.9")).toBeInTheDocument();
      expect(screen.getByText("تعریف و پاتوفیزیولوژی")).toBeInTheDocument();
      expect(screen.getByText("التهاب مزمن مجاری هوایی با هایپرریسپانسیونی و انسداد برگشت‌پذیر.")).toBeInTheDocument();

      // Related medication
      expect(screen.getByText("داروهای مرتبط و اندیکاسیون")).toBeInTheDocument();
      expect(screen.getByText("سالبوتامول")).toBeInTheDocument();
      expect(screen.getByText("(Salbutamol)")).toBeInTheDocument();
      expect(screen.getByText("تسکین‌دهنده سریع")).toBeInTheDocument();
    });

    it("renders Treatment aggregate with modality and pharmacological strategy", () => {
      mockConsumptionData = {
        aggregateType: "treatment",
        aggregateId: TREATMENT_UUID,
        currentVersion: 1,
        assertions: [],
      };
      mockMetadataData = {
        id: TREATMENT_UUID,
        type: "treatment",
        slug: "acs-protocol",
        nameEn: "Acute Coronary Syndrome Protocol",
        nameFa: "پروتکل مدیریت سندرم حاد کرونری",
        classification: "اورژانس قلبی-عروقی",
        summary: "تجویز همزمان ضدپلاکتی دوگانه (DAPT) و ضد انعقاد در فاز حاد.",
        publishedAt: "2026-03-20T10:00:00Z",
        versionNumber: 1,
      };
      mockRelatedData = {
        aggregateType: "treatment",
        aggregateId: TREATMENT_UUID,
        groups: [
          {
            relationshipCategory: "associated_conditions",
            relationshipLabelFa: "بیماری‌های هدف درمان",
            entities: [
              {
                id: DISEASE_UUID,
                slug: "myocardial-infarction",
                type: "disease",
                titleEn: "Myocardial Infarction",
                titleFa: "سکته قلبی حاد",
                classification: "I21.9",
                relationshipType: "بیماری هدف",
                clinicalNotes: "بیماران با تابلوی STEMI و NSTEMI",
                verification: {
                  isClinicallyVerified: true,
                  verifiedAssertionsCount: 2,
                  totalAssertionsCount: 2,
                  lastVerifiedAt: null,
                },
              },
            ],
          },
        ],
      };

      renderDetail(`/pocket/treatment/${TREATMENT_UUID}`);

      expect(screen.getByRole("heading", { name: "پروتکل مدیریت سندرم حاد کرونری" })).toBeInTheDocument();
      expect(screen.getByText("مدالیته و نوع درمان: اورژانس قلبی-عروقی")).toBeInTheDocument();
      expect(screen.getByText("استراتژی درمانی و فارماکولوژیک")).toBeInTheDocument();
      expect(screen.getByText("بیماری‌های هدف درمان")).toBeInTheDocument();
      expect(screen.getByText("سکته قلبی حاد")).toBeInTheDocument();
    });

    it("renders Emergency aggregate with triage category and triage guidance", () => {
      mockConsumptionData = {
        aggregateType: "emergency",
        aggregateId: EMERGENCY_UUID,
        currentVersion: 1,
        assertions: [],
      };
      mockMetadataData = {
        id: EMERGENCY_UUID,
        type: "emergency",
        slug: "anaphylaxis",
        nameEn: "Anaphylaxis",
        nameFa: "شوک آنافیلاکسی",
        classification: "کد احیا / قرمز",
        summary: "تزریق فوری اپی‌نفرین عضلانی در قدام ران، باز نگه داشتن راه هوایی و اکسیژن‌تراپی.",
        publishedAt: "2026-03-20T10:00:00Z",
        versionNumber: 1,
      };
      mockRelatedData = {
        aggregateType: "emergency",
        aggregateId: EMERGENCY_UUID,
        groups: [
          {
            relationshipCategory: "medications",
            relationshipLabelFa: "داروهای خط اول اورژانس",
            entities: [
              {
                id: DRUG_UUID,
                slug: "epinephrine",
                type: "drug",
                titleEn: "Epinephrine",
                titleFa: "اپی‌نفرین",
                classification: "آدرنرژیک",
                relationshipType: "مسیر تجویز: عضلانی (IM)",
                clinicalNotes: "دوز: 0.3-0.5 میلی‌گرم — احتیاط: پایش قلبی",
                verification: {
                  isClinicallyVerified: true,
                  verifiedAssertionsCount: 4,
                  totalAssertionsCount: 4,
                  lastVerifiedAt: "2026-03-21T10:00:00Z",
                },
              },
            ],
          },
        ],
      };

      renderDetail(`/pocket/emergency/${EMERGENCY_UUID}`);

      expect(screen.getByRole("heading", { name: "شوک آنافیلاکسی" })).toBeInTheDocument();
      expect(screen.getByText("رده و سطح تریاژ: کد احیا / قرمز")).toBeInTheDocument();
      expect(screen.getByText("راهنمای فوری تریاژ و مدیریت بحران")).toBeInTheDocument();
      expect(screen.getByText("تزریق فوری اپی‌نفرین عضلانی در قدام ران، باز نگه داشتن راه هوایی و اکسیژن‌تراپی.")).toBeInTheDocument();
      expect(screen.getByText("داروهای خط اول اورژانس")).toBeInTheDocument();
      expect(screen.getByText("اپی‌نفرین")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Relationship Grouping & Counts
  // ---------------------------------------------------------------------------
  describe("2. Relationship Grouping & Counts", () => {
    it("displays group labels and entity counts in section header and per group", () => {
      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      // Overall section badge: 3 entities total
      expect(screen.getByText("3 موجودیت مرتبط")).toBeInTheDocument();

      // Per-group count pills
      const countPills = screen.getAllByText("1 مورد");
      expect(countPills.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Clinical Verification Badges
  // ---------------------------------------------------------------------------
  describe("3. Verification Badges", () => {
    it("renders verified badge and verified count ratio when entity is clinically verified", () => {
      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      // Hyperlipidemia is clinically verified with 3/3 ratio
      expect(screen.getByText("3 از 3 بیانیه")).toBeInTheDocument();
      expect(screen.getAllByText("تأییدشده بالینی").length).toBeGreaterThan(0);
    });

    it("renders pending review badge when entity is unverified", () => {
      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      // Treatment protocol is unverified
      expect(screen.getByText("در انتظار داوری نهایی")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Optional Metadata Handling
  // ---------------------------------------------------------------------------
  describe("4. Optional Metadata", () => {
    it("renders clinical notes when provided, and omits container when missing", () => {
      mockRelatedData = {
        aggregateType: "drug",
        aggregateId: DRUG_UUID,
        groups: [
          {
            relationshipCategory: "indicated_diseases",
            relationshipLabelFa: "بیماری‌ها",
            entities: [
              {
                id: DISEASE_UUID,
                slug: "hypertension",
                type: "disease",
                titleEn: "",
                titleFa: "فشار خون بالا",
                classification: "",
                relationshipType: "اندیکاسیون",
                clinicalNotes: null, // No notes
                verification: {
                  isClinicallyVerified: false,
                  verifiedAssertionsCount: 0,
                  totalAssertionsCount: 0,
                  lastVerifiedAt: null,
                },
              },
            ],
          },
        ],
      };

      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      expect(screen.getByText("فشار خون بالا")).toBeInTheDocument();
      // Should not render English subtitle
      expect(screen.queryByText("(Hypertension)")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Navigation Links
  // ---------------------------------------------------------------------------
  describe("5. Navigation Between Aggregate Detail Pages", () => {
    it("renders links to corresponding aggregate detail routes", () => {
      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      const diseaseCard = screen.getByTestId(`related-entity-card-${DISEASE_UUID}`);
      const links = diseaseCard.querySelectorAll("a");
      const hrefs = Array.from(links).map((l) => l.getAttribute("href"));

      expect(hrefs).toContain(`/pocket/disease/${DISEASE_UUID}`);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Empty Related Entities State
  // ---------------------------------------------------------------------------
  describe("6. Empty Related Entities", () => {
    it("renders honest Persian empty state when aggregate has no linked entities", () => {
      mockRelatedData = {
        aggregateType: "drug",
        aggregateId: DRUG_UUID,
        groups: [],
      };

      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      expect(screen.getByText("هیچ موجودیت بالینی مرتبطی برای این مدخل ثبت نشده است")).toBeInTheDocument();
      expect(
        screen.getByText(/ارتباط مستقیم بالینی مصوب .* در پایگاه دانش موجود نیست/),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 7 & 8. Request Failure & Retry Behavior
  // ---------------------------------------------------------------------------
  describe("7 & 8. Request Failure and Retry Behavior", () => {
    it("displays graceful warning alert and allows retry without breaking assertions", () => {
      mockRelatedError = new Error("ارتباط شبکه با سرور قطع شد");

      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      // Core page and published assertion still render!
      expect(screen.getByRole("heading", { name: "آتورواستاتین" })).toBeInTheDocument();
      expect(screen.getByText("مصرف در نارسایی شدید کبدی منع قطعی دارد.")).toBeInTheDocument();

      // Non-blocking error alert in related section
      expect(screen.getByText("خطا در بازیابی موجودیت‌های بالینی مرتبط")).toBeInTheDocument();
      expect(screen.getByText("ارتباط شبکه با سرور قطع شد")).toBeInTheDocument();

      // Retry button triggers refetch
      const retryBtn = screen.getByRole("button", { name: /تلاش مجدد برای بارگذاری ارتباطات/ });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(mockRefetchRelated).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 9 & 10. Route Validation & Preventing Unnecessary Queries
  // ---------------------------------------------------------------------------
  describe("9 & 10. Route Validation & Preventing Inappropriate Queries", () => {
    it("renders invalid identifier error and does NOT pass ID to hooks for query execution", () => {
      renderDetail("/pocket/drug/invalid%20id!");

      expect(screen.getByText("شناسه موجودیت بالینی نامعتبر است")).toBeInTheDocument();
      expect(screen.getByText(/شناسه 'invalid id!' یک شناسه معتبر بالینی \(UUID یا اسلاگ\) نیست/)).toBeInTheDocument();

      // Verification: Hooks were called with id = undefined or enabled = false
      expect(consumptionHookCalls.every((c) => c.id === undefined)).toBe(true);
      expect(metadataHookCalls.every((c) => c.id === undefined)).toBe(true);
      expect(relatedHookCalls.every((c) => c.enabled === false)).toBe(true);
    });

    it("renders successfully when routed via canonical slug and displays canonical UUID", () => {
      renderDetail("/pocket/drug/atorvastatin");

      // Verifies page renders without error
      expect(screen.getAllByText("آتورواستاتین").length).toBeGreaterThan(0);
      expect(screen.getByText("رده دارویی: HMG-CoA Reductase Inhibitor")).toBeInTheDocument();
      expect(screen.getByText("اسلاگ: atorvastatin")).toBeInTheDocument();
      expect(screen.getByText(`UUID: ${DRUG_UUID}`)).toBeInTheDocument();

      // Verification: Hooks were invoked with the slug
      expect(consumptionHookCalls.some((c) => c.id === "atorvastatin")).toBe(true);
      expect(metadataHookCalls.some((c) => c.id === "atorvastatin")).toBe(true);
      expect(relatedHookCalls.some((c) => c.id === "atorvastatin" && c.enabled === true)).toBe(true);
    });

    it("renders invalid pillar error and does NOT trigger queries", () => {
      renderDetail(`/pocket/unsupported-pillar/${DRUG_UUID}`);

      expect(screen.getByText("نوع رکن بالینی نامعتبر است")).toBeInTheDocument();
      expect(consumptionHookCalls.every((c) => c.id === undefined)).toBe(true);
      expect(metadataHookCalls.every((c) => c.id === undefined)).toBe(true);
      expect(relatedHookCalls.every((c) => c.enabled === false)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Preserving Assertion Content when Related Entities Fail
  // ---------------------------------------------------------------------------
  describe("11. Preserving Assertion Content Isolation", () => {
    it("preserves published assertions count and list when related query fails", () => {
      mockRelatedError = new Error("500 Internal Server Error");

      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      expect(screen.getByText("1 بیانیه مصوب")).toBeInTheDocument();
      expect(screen.getByText("مصرف در نارسایی شدید کبدی منع قطعی دارد.")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Preventing Duplicate Related Entities
  // ---------------------------------------------------------------------------
  describe("12. Preventing Duplicate Related Entities", () => {
    it("renders distinct cards for distinct entities within group", () => {
      mockRelatedData = {
        aggregateType: "drug",
        aggregateId: DRUG_UUID,
        groups: [
          {
            relationshipCategory: "indicated_diseases",
            relationshipLabelFa: "بیماری‌ها",
            entities: [
              {
                id: DISEASE_UUID,
                slug: "disease-a",
                type: "disease",
                titleEn: "Disease A",
                titleFa: "بیماری الف",
                classification: "A01",
                relationshipType: "خط ۱",
                clinicalNotes: null,
                verification: {
                  isClinicallyVerified: true,
                  verifiedAssertionsCount: 1,
                  totalAssertionsCount: 1,
                  lastVerifiedAt: null,
                },
              },
              {
                id: "88888888-8888-4888-8888-888888888888",
                slug: "disease-b",
                type: "disease",
                titleEn: "Disease B",
                titleFa: "بیماری ب",
                classification: "B02",
                relationshipType: "خط ۲",
                clinicalNotes: null,
                verification: {
                  isClinicallyVerified: false,
                  verifiedAssertionsCount: 0,
                  totalAssertionsCount: 1,
                  lastVerifiedAt: null,
                },
              },
            ],
          },
        ],
      };

      renderDetail(`/pocket/drug/${DRUG_UUID}`);

      expect(screen.getByText("بیماری الف")).toBeInTheDocument();
      expect(screen.getByText("بیماری ب")).toBeInTheDocument();
      expect(screen.getAllByTestId(/related-entity-card-/).length).toBe(2);
    });
  });
});
