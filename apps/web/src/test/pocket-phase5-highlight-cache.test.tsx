/**
 * AVANA Pocket — Phase 5 SafeHighlight & Session Cache Test Suite
 *
 * Verifies:
 * 1. SafeHighlight XSS injection prevention (escapes script/HTML safely as React text nodes)
 * 2. Arabic/Persian letter unification (Kaf/Yeh) and diacritics/ZWNJ retention in highlight spans
 * 3. Surrogate pairs and non-BMP characters (💊, 💉) without index corruption
 * 4. Punctuation collapse, diacritics at word boundary, and case-insensitive matching
 * 5. ReDoS safety with large texts and repeated tokens
 * 6. Multi-token highlighting across different words in single text
 * 7. explorerSessionCache LRU eviction (max 5), TTL expiry (10m), generation isolation, and in-flight deduplication
 */

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SafeHighlight,
} from "../components/pocket/SafeHighlight.js";
import {
  buildExplorerSessionKey,
  clearExplorerSessionCache,
  clearOffsetInFlight,
  getExplorerSession,
  isOffsetInFlight,
  markOffsetInFlight,
  startExplorerSession,
  updateExplorerSession,
  MAX_SESSIONS,
  type ExplorerItem,
} from "../pages/pocket/explorerSessionCache.js";

describe("AVANA Pocket Phase 5: SafeHighlight Component", () => {
  it("renders text safely without executing script tags (XSS Prevention)", () => {
    const maliciousText = '<script>alert("xss")</script> آتورواستاتین';
    const { container } = render(
      <SafeHighlight text={maliciousText} query="آتورواستاتین" />,
    );

    // Verify script tags are rendered as plain text nodes, not HTML elements
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();
    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark?.textContent).toBe("آتورواستاتین");
  });

  it("handles Arabic Kaf and Yeh unification with Persian input", () => {
    // Raw text uses Arabic Kaf (ك) and Arabic Yeh (ي)
    const rawArabicText = "كپسول آتورواستاتين كلسيم";
    // Query uses Persian Kaf (ک) and Persian Yeh (ی)
    const persianQuery = "کپسول کلسیم";

    const { container } = render(
      <SafeHighlight text={rawArabicText} query={persianQuery} />,
    );

    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("كپسول");
    expect(marks[1].textContent).toBe("كلسيم");
  });

  it("preserves ZWNJ (نیم‌فاصله) within the highlighted mark tag", () => {
    const textWithZwnj = "بیماری‌های قلبی‌عروقی و فشار خون";
    const query = "قلبی‌عروقی";

    const { container } = render(
      <SafeHighlight text={textWithZwnj} query={query} />,
    );

    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark?.textContent).toBe("قلبی‌عروقی");
  });

  it("preserves surrogate pairs and emojis (💊, 💉) without corrupting UTF-16 indices", () => {
    const textWithEmoji = "💊 داروی آتورواستاتین 💉 تزریقی";
    const query = "آتورواستاتین";

    const { container } = render(
      <SafeHighlight text={textWithEmoji} query={query} />,
    );

    expect(screen.getByText(/💊 داروی/)).toBeInTheDocument();
    expect(screen.getByText(/💉 تزریقی/)).toBeInTheDocument();
    const mark = container.querySelector("mark");
    expect(mark?.textContent).toBe("آتورواستاتین");
  });

  it("encloses Arabic/Persian diacritics (تَشديد، تَنوین، ضَمّه) inside the highlight mark", () => {
    // Text with Tashdid and Damma
    const textWithDiacritics = "مُسکِّن قَویّ برای درد";
    const query = "مسکن قوی";

    const { container } = render(
      <SafeHighlight text={textWithDiacritics} query={query} />,
    );

    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe("مُسکِّن");
    expect(marks[1].textContent).toBe("قَویّ");
  });

  it("performs linear multi-token matching without regex ReDoS vulnerability", () => {
    const longRepeatedText = "آتورواستاتین ۲۰ میلی‌گرم ".repeat(100);
    const multiTokenQuery = "آتورواستاتین ۲۰";

    const startTime = performance.now();
    const { container } = render(
      <SafeHighlight text={longRepeatedText} query={multiTokenQuery} />,
    );
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(100); // Must be fast and linear
    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });

  it("safely returns null when text is null or undefined", () => {
    const { container: c1 } = render(<SafeHighlight text={null} query="تست" />);
    expect(c1.textContent).toBe("");

    const { container: c2 } = render(<SafeHighlight text={undefined} query="تست" />);
    expect(c2.textContent).toBe("");
  });

  it("returns raw text unchanged when query is empty or whitespace", () => {
    const text = "متن بدون جستجو";
    const { container } = render(<SafeHighlight text={text} query="   " />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector("mark")).toBeNull();
  });

  it("preserves exact full text content without omitting or duplicating any characters", () => {
    // 1. Leading diacritic
    const textWithLeadingDiacritic = "َسلام دنیا";
    const { container: c1 } = render(
      <SafeHighlight text={textWithLeadingDiacritic} query="سلام" />,
    );
    expect(c1.textContent).toBe(textWithLeadingDiacritic);
    expect(c1.querySelector("mark")?.textContent).toBe("سلام");

    // 2. Consecutive punctuation
    const textWithConsecutivePunct = "آتورواستاتین---کلسیم,,,۲۰";
    const { container: c2 } = render(
      <SafeHighlight text={textWithConsecutivePunct} query="کلسیم ۲۰" />,
    );
    expect(c2.textContent).toBe(textWithConsecutivePunct);
    const marks2 = c2.querySelectorAll("mark");
    expect(marks2.length).toBe(2);
    expect(marks2[0].textContent).toBe("کلسیم");
    expect(marks2[1].textContent).toBe("۲۰");

    // 3. Overlapping tokens
    const textWithOverlap = "داروسازی بالینی";
    const { container: c3 } = render(
      <SafeHighlight text={textWithOverlap} query="دارو داروسازی" />,
    );
    expect(c3.textContent).toBe(textWithOverlap);
    expect(c3.querySelectorAll("mark").length).toBe(1);
    expect(c3.querySelector("mark")?.textContent).toBe("داروسازی");

    // 4. HTML / Script tag safely rendered as text with identical textContent
    const htmlSnippet = '<script>alert("test")</script> قرص و کپسول';
    const { container: c4 } = render(
      <SafeHighlight text={htmlSnippet} query="قرص" />,
    );
    expect(c4.textContent).toBe(htmlSnippet);
    expect(c4.querySelectorAll("script").length).toBe(0);
    expect(c4.querySelector("mark")?.textContent).toBe("قرص");
  });
});

describe("AVANA Pocket Phase 5: explorerSessionCache", () => {
  beforeEach(() => {
    clearExplorerSessionCache();
  });

  it("builds deterministic session keys based on query, type, and sort", () => {
    const key1 = buildExplorerSessionKey("  آتورواستاتین  ", "DRUG", "RECENT");
    const key2 = buildExplorerSessionKey("آتورواستاتین", "drug", "recent");
    expect(key1).toBe(key2);
    expect(key1).toBe(JSON.stringify(["آتورواستاتین", "drug", "recent"]));
  });

  it("tracks generation identity and starts new sessions", () => {
    const key = buildExplorerSessionKey("test", "all", "recent");
    const session1 = startExplorerSession(key);
    expect(session1.generation).toBe(1);

    // Re-starting existing session increments generation
    const session2 = startExplorerSession(key);
    expect(session2.generation).toBe(2);
  });

  it("rejects out-of-order updates from stale generations (Request Race Guard)", () => {
    const key = buildExplorerSessionKey("atorvastatin", "all", "recent");
    const { generation: gen1 } = startExplorerSession(key);
    const { generation: gen2 } = startExplorerSession(key); // Generation 2 active

    const fakeItem: ExplorerItem = {
      id: "item-1",
      type: "drug",
      slug: "item-1",
      titleEn: "Item 1",
      titleFa: "آیتم ۱",
      versionNumber: 1,
    };

    // Attempt update with old gen1
    const acceptedGen1 = updateExplorerSession(
      key,
      { items: [fakeItem], total: 1, offset: 0, hasMore: false },
      gen1,
    );
    expect(acceptedGen1).toBe(false);

    // Verify session data was NOT modified
    const currentSession = getExplorerSession(key);
    expect(currentSession?.items).toEqual([]);

    // Update with active gen2 succeeds
    const acceptedGen2 = updateExplorerSession(
      key,
      { items: [fakeItem], total: 1, offset: 0, hasMore: false },
      gen2,
    );
    expect(acceptedGen2).toBe(true);
    expect(getExplorerSession(key)?.items.length).toBe(1);
  });

  it("evicts least recently used session when exceeding MAX_SESSIONS (5)", () => {
    const baseTime = 1000000;

    // Create 5 sessions at consecutive timestamps
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      const key = buildExplorerSessionKey(`query-${i}`, "all", "recent");
      startExplorerSession(key, baseTime + i * 1000);
    }

    // All 5 should exist
    expect(getExplorerSession(buildExplorerSessionKey("query-1", "all", "recent"), baseTime + 6000)).not.toBeNull();

    // Adding 6th session should evict the oldest (query-2, since query-1 was just accessed)
    const key6 = buildExplorerSessionKey("query-6", "all", "recent");
    startExplorerSession(key6, baseTime + 7000);

    expect(getExplorerSession(buildExplorerSessionKey("query-2", "all", "recent"), baseTime + 8000)).toBeNull();
    expect(getExplorerSession(key6, baseTime + 8000)).not.toBeNull();
  });

  it("prunes sessions older than SESSION_TTL_MS (10 minutes)", () => {
    const initialTime = 1000000;
    const key = buildExplorerSessionKey("query", "all", "recent");
    startExplorerSession(key, initialTime);

    // Access just before TTL expires (9 minutes later)
    expect(getExplorerSession(key, initialTime + 9 * 60 * 1000)).not.toBeNull();

    // Access after TTL expired (11 minutes after last access)
    expect(getExplorerSession(key, initialTime + 21 * 60 * 1000)).toBeNull();
  });

  it("tracks and clears in-flight offsets to prevent concurrent redundant requests", () => {
    const key = buildExplorerSessionKey("query", "all", "recent");
    startExplorerSession(key);

    expect(isOffsetInFlight(key, 20)).toBe(false);

    markOffsetInFlight(key, 20);
    expect(isOffsetInFlight(key, 20)).toBe(true);

    clearOffsetInFlight(key, 20);
    expect(isOffsetInFlight(key, 20)).toBe(false);
  });

  it("handles Scenario A -> B -> A: prevents delayed A1 response from overwriting fresh A2 data", () => {
    // 1. User dispatches search request A1
    const keyA = buildExplorerSessionKey("aspirin", "all", "recent");
    const sessionA1 = startExplorerSession(keyA);
    const genA1 = sessionA1.generation;
    expect(genA1).toBe(1);

    // 2. User navigates away to search request B
    const keyB = buildExplorerSessionKey("metformin", "all", "recent");
    const sessionB1 = startExplorerSession(keyB);
    expect(sessionB1.generation).toBe(1);

    // 3. User navigates back to A and dispatches search request A2
    const sessionA2 = startExplorerSession(keyA);
    const genA2 = sessionA2.generation;
    expect(genA2).toBe(2);

    const freshA2Item: ExplorerItem = {
      id: "drug-a-fresh",
      type: "drug",
      slug: "aspirin-fresh",
      titleEn: "Aspirin Fresh",
      titleFa: "آسپرین جدید",
      versionNumber: 2,
    };

    // 4. Fresh response A2 arrives and updates session
    const a2Updated = updateExplorerSession(
      keyA,
      { items: [freshA2Item], total: 1, offset: 0, hasMore: false },
      genA2,
    );
    expect(a2Updated).toBe(true);
    expect(getExplorerSession(keyA)?.items[0].id).toBe("drug-a-fresh");

    // 5. Stale response A1 arrives late with generation 1
    const staleA1Item: ExplorerItem = {
      id: "drug-a-stale",
      type: "drug",
      slug: "aspirin-stale",
      titleEn: "Aspirin Stale",
      titleFa: "آسپرین قدیمی",
      versionNumber: 1,
    };

    const a1Updated = updateExplorerSession(
      keyA,
      { items: [staleA1Item], total: 1, offset: 0, hasMore: false },
      genA1,
    );

    // Stale update MUST be rejected and session MUST retain fresh A2 item
    expect(a1Updated).toBe(false);
    const currentSession = getExplorerSession(keyA);
    expect(currentSession?.items[0].id).toBe("drug-a-fresh");
    expect(currentSession?.generation).toBe(genA2);
  });

  it("rejects out-of-order page resolution across different offsets", () => {
    const key = buildExplorerSessionKey("atorvastatin", "all", "recent");
    const { generation } = startExplorerSession(key);

    const page1Item: ExplorerItem = {
      id: "drug-page1",
      type: "drug",
      slug: "atorvastatin-p1",
      titleEn: "Atorvastatin P1",
      titleFa: "آتورواستاتین صفحه ۱",
      versionNumber: 1,
    };

    // Page 1 is written
    updateExplorerSession(
      key,
      { items: [page1Item], total: 30, offset: 0, hasMore: true },
      generation,
    );
    expect(getExplorerSession(key)?.items.length).toBe(1);

    // Session transitions to generation 2 (e.g. filter or query changed)
    const { generation: gen2 } = startExplorerSession(key);
    expect(gen2).toBe(2);

    const latePage2Item: ExplorerItem = {
      id: "drug-page2",
      type: "drug",
      slug: "atorvastatin-p2",
      titleEn: "Atorvastatin P2",
      titleFa: "آتورواستاتین صفحه ۲",
      versionNumber: 1,
    };

    // Late page 2 response from gen1 arrives
    const lateUpdate = updateExplorerSession(
      key,
      { items: [page1Item, latePage2Item], total: 30, offset: 20, hasMore: false },
      generation, // gen1
    );

    expect(lateUpdate).toBe(false);
    expect(getExplorerSession(key)?.generation).toBe(gen2);
  });
});
