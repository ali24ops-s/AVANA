import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentRepairAuditView } from "../components/admin/repair/ContentRepairAuditView.js";
import * as adminApi from "../lib/api/admin.js";
import type { ContentCorruptionAuditReport } from "@avana/domain";

vi.mock("../lib/api/admin.js", async () => {
  const actual = await vi.importActual("../lib/api/admin.js");
  return {
    ...actual,
    getContentRepairAudit: vi.fn(),
  };
});

describe("Content Repair Audit UI (Read-Only Content Health View)", () => {
  let queryClient: QueryClient;

  const mockReport: ContentCorruptionAuditReport = {
    totalLessonsScanned: 25,
    totalBlocksScanned: 250,
    lessonsWithCorruption: 3,
    totalCorruptionFindings: 4,
    overallConfidence: {
      HIGH: 3,
      MEDIUM: 1,
      LOW: 0,
    },
    ruleSummaries: [
      {
        ruleId: "latex-command-corruption",
        ruleName: "خرابی دستور فرمول / شیمی",
        triggered: true,
        triggerCount: 2,
        affectedLessonCount: 2,
        affectedBlockCount: 2,
        confidenceBreakdown: { HIGH: 2, MEDIUM: 0, LOW: 0 },
        samples: [
          {
            lessonId: "l-chem-1",
            lessonTitle: "شیمی دارویی ۱",
            blockIndex: 5,
            confidence: 0.96,
            confidenceLevel: "HIGH",
            reason: "الگوی شناخته‌شده خرابی دستورات فرمول یا شیمی شناسایی شد.",
            before: "textCaC_2 + 2textH 2O",
            suggested: "\\text{CaC}_2 + 2\\text{H}_2\\text{O}",
          },
        ],
      },
      {
        ruleId: "json-leakage",
        ruleName: "نشت ساختار JSON / داده‌های خام",
        triggered: true,
        triggerCount: 1,
        affectedLessonCount: 1,
        affectedBlockCount: 1,
        confidenceBreakdown: { HIGH: 1, MEDIUM: 0, LOW: 0 },
        samples: [
          {
            lessonId: "l-pharma-2",
            lessonTitle: "فارماکولوژی ۲",
            blockIndex: 0,
            confidence: 0.99,
            confidenceLevel: "HIGH",
            reason: "شیء کامل JSON درس به جای متن آموزشی قرار گرفته است.",
            before: '{"kind":"session","contentMarkdown":"# فارما"}',
            suggested: "# فارما",
          },
        ],
      },
      {
        ruleId: "latex-delimiter-corruption",
        ruleName: "خرابی دلیمیتر فرمول ریاضی",
        triggered: false,
        triggerCount: 0,
        affectedLessonCount: 0,
        affectedBlockCount: 0,
        confidenceBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        samples: [],
      },
      {
        ruleId: "duplicated-fragment",
        ruleName: "تکرار متوالی خطوط و فرمول‌ها",
        triggered: true,
        triggerCount: 1,
        affectedLessonCount: 1,
        affectedBlockCount: 1,
        confidenceBreakdown: { HIGH: 0, MEDIUM: 1, LOW: 0 },
        samples: [],
      },
      {
        ruleId: "trailing-metadata-leakage",
        ruleName: "نشت فراداده ارجاع و شناسه‌ها در انتها",
        triggered: false,
        triggerCount: 0,
        affectedLessonCount: 0,
        affectedBlockCount: 0,
        confidenceBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        samples: [],
      },
      {
        ruleId: "broken-whitespace",
        ruleName: "شکستگی خطوط فرمول و کلمات",
        triggered: false,
        triggerCount: 0,
        affectedLessonCount: 0,
        affectedBlockCount: 0,
        confidenceBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        samples: [],
      },
      {
        ruleId: "unicode-formatting-corruption",
        ruleName: "کاراکترهای کنترلی و نامعتبر یونیکد",
        triggered: false,
        triggerCount: 0,
        affectedLessonCount: 0,
        affectedBlockCount: 0,
        confidenceBreakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        samples: [],
      },
    ],
    scannedAt: "2026-09-23T02:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    (adminApi.getContentRepairAudit as any).mockResolvedValue(mockReport);
  });

  function renderView() {
    return render(
      <QueryClientProvider client={queryClient}>
        <ContentRepairAuditView />
      </QueryClientProvider>,
    );
  }

  it("1. Renders overview metrics and confidence breakdown", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByText(/گزارش سلامت متون آموزشی/i)).toBeInTheDocument();
    });

    // Metric cards
    expect(screen.getByText("درسنامه‌های بررسی‌شده")).toBeInTheDocument();
    expect(screen.getByText("بلوک‌های پردازش‌شده")).toBeInTheDocument();
    expect(screen.getByText("درس‌های دارای خرابی")).toBeInTheDocument();
    expect(screen.getByText("کل یافته‌های خرابی")).toBeInTheDocument();

    // Confidence breakdown
    expect(screen.getByText(/اطمینان بالا \(HIGH\): ۳/i)).toBeInTheDocument();
    expect(screen.getByText(/اطمینان متوسط \(MEDIUM\): ۱/i)).toBeInTheDocument();
  });

  it("2. Renders all 7 rules with triggered/untriggered status and allows expanding samples", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByText("خرابی دستور فرمول / شیمی")).toBeInTheDocument();
    });

    // Check presence of other rules
    expect(screen.getByText("نشت ساختار JSON / داده‌های خام")).toBeInTheDocument();
    expect(screen.getByText("خرابی دلیمیتر فرمول ریاضی")).toBeInTheDocument();

    // Find and expand sample button
    const sampleBtns = screen.getAllByRole("button", { name: /۱ نمونه/i });
    expect(sampleBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(sampleBtns[0]);

    // Verify expanded sample content
    await waitFor(() => {
      expect(screen.getByText("شیمی دارویی ۱")).toBeInTheDocument();
    });
    expect(screen.getByText(/textCaC_2 \+ 2textH 2O/)).toBeInTheDocument();
    expect(screen.getByText(/\\text{CaC}_2 \+ 2\\text{H}_2\\text{O}/)).toBeInTheDocument();
  });

  it("3. STRICT SAFETY ASSERTION: Zero Apply / Auto-Repair / Fix buttons exist in the Audit UI", async () => {
    renderView();

    await waitFor(() => {
      expect(screen.getByText(/گزارش سلامت متون آموزشی/i)).toBeInTheDocument();
    });

    // Must NOT contain any apply or mutation triggers
    expect(screen.queryByRole("button", { name: /اعمال اصلاحات/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /اصلاح همه/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /repair/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fix/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /auto repair/i })).toBeNull();
  });
});
