import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvidenceSummary } from "../components/review/EvidenceSummary.js";
import {
  calculateWordCount,
  extractTopicsFromSourceChunks,
} from "../lib/utils/evidence-utils.js";
import type { SourceChunkResource } from "@avana/contracts";

describe("EvidenceSummary Component & Utilities", () => {
  beforeEach(() => {
    cleanup();
  });

  const mockChunks: SourceChunkResource[] = [
    {
      id: "chunk-1",
      sequence: 0,
      heading: "فارماکوکینتیک",
      content: "جذب دارو در دستگاه گوارش صورت می‌پذیرد.",
      start_page: 1,
      end_page: 2,
    },
    {
      id: "chunk-2",
      sequence: 1,
      heading: "جذب دارو",
      content: "توزیع دارو در بافت‌های مختلف بدن انجام می‌شود.",
      start_page: 3,
      end_page: 4,
    },
    {
      id: "chunk-3",
      sequence: 2,
      heading: null,
      content: "## متابولیسم\nمتابولیسم کبدی آنزیمی است.",
      start_page: 5,
      end_page: 5,
    },
  ];

  const mockPayload = {
    title: "مرور فارماکولوژی داروهای قلبی",
    outline: [
      { title: "اصول فارماکودینامیک" },
      { title: "مکانیسم‌های گیرنده‌ای" },
    ],
  };

  it("accurately calculates word count from source chunks", () => {
    const count = calculateWordCount(mockChunks);
    expect(count).toBe(21);
  });

  it("extracts AI initial outline topics from payload and source chunks without generic page fallbacks", () => {
    const topics = extractTopicsFromSourceChunks(mockChunks, mockPayload);
    // Topics from payload outline
    expect(topics).toContain("اصول فارماکودینامیک");
    expect(topics).toContain("مکانیسم‌های گیرنده‌ای");
    // Topics from headings / markdown
    expect(topics).toContain("فارماکوکینتیک");
    expect(topics).toContain("جذب دارو");
    expect(topics).toContain("متابولیسم");

    // Ensure NO generic 'مطالب صفحه' fallback strings are generated
    for (const t of topics) {
      expect(t).not.toMatch(/مطالب صفحه/i);
    }
  });

  it("renders Evidence Summary metrics and hides raw text / bulleted topic lists", () => {
    render(<EvidenceSummary sourceChunks={mockChunks} payload={mockPayload} />);

    expect(screen.getByText("تعداد کلمات خوانده‌شده")).toBeDefined();
    expect(screen.getByText("مطالب استخراج‌شده")).toBeDefined();

    // Verify raw quotes and topic headers are NOT rendered
    expect(screen.queryByText("فهرست مطالب و سرفصل‌های منبع:")).toBeNull();
    expect(screen.queryByText("جذب دارو در دستگاه گوارش صورت می‌پذیرد.")).toBeNull();
  });

  it("gracefully handles empty or missing source_chunks", () => {
    render(<EvidenceSummary sourceChunks={[]} />);
    expect(
      screen.getByText("ارجاع متنی مستقیمی برای این مورد ثبت نشده است."),
    ).toBeDefined();

    cleanup();

    render(<EvidenceSummary sourceChunks={null} />);
    expect(
      screen.getByText("ارجاع متنی مستقیمی برای این مورد ثبت نشده است."),
    ).toBeDefined();
  });
});
