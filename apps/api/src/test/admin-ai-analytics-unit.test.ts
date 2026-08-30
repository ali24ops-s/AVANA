/**
 * Unit Tests for DrizzleAdminStore.getAiAnalytics mapping and aggregation logic.
 */

import { describe, expect, it, vi } from "vitest";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";

describe("DrizzleAdminStore getAiAnalytics - Unit & Edge Case Tests", () => {
  it("Scenario 1: Zero jobs and zero tokens produce expected empty analytics contract", async () => {
    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            // Can be overview, byType, or tokens
            return Promise.resolve([
              {
                totalJobs: 0,
                successful: 0,
                failed: 0,
                processing: 0,
                averageDurationMs: 0,
                tokenRecordsCount: 0,
                totalInput: 0,
                totalOutput: 0,
              },
            ]);
          }),
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    // Make select return chainable promises for Promise.all
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // overview
          return {
            where: vi.fn().mockResolvedValue([
              {
                totalJobs: 0,
                successful: 0,
                failed: 0,
                processing: 0,
                averageDurationMs: 0,
              },
            ]),
          };
        } else if (callCount === 2) {
          // byType
          return {
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([]),
            }),
          };
        } else {
          // tokens
          return {
            where: vi.fn().mockResolvedValue([
              {
                tokenRecordsCount: 0,
                totalInput: 0,
                totalOutput: 0,
              },
            ]),
          };
        }
      }),
    }));

    const store = new DrizzleAdminStore(mockDb);
    const res = await store.getAiAnalytics();

    expect(res).toEqual({
      overview: {
        totalJobs: 0,
        successful: 0,
        failed: 0,
        processing: 0,
        successRate: 0,
        averageDurationMs: 0,
      },
      byType: {},
      tokens: {
        available: false,
        input: 0,
        output: 0,
        total: 0,
      },
    });
  });

  it("Scenario 2: Correctly maps aggregated database rows with non-zero metrics", async () => {
    let callCount = 0;
    const mockDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // overview
            return {
              where: vi.fn().mockResolvedValue([
                {
                  totalJobs: 10,
                  successful: 8,
                  failed: 1,
                  processing: 1,
                  averageDurationMs: 2450.5,
                },
              ]),
            };
          } else if (callCount === 2) {
            // byType
            return {
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([
                  { type: "lesson", total: 6, success: 5 },
                  { type: "flashcard", total: 4, success: 3 },
                ]),
              }),
            };
          } else {
            // tokens
            return {
              where: vi.fn().mockResolvedValue([
                {
                  tokenRecordsCount: 7,
                  totalInput: 15420,
                  totalOutput: 8930,
                },
              ]),
            };
          }
        }),
      })),
    };

    const store = new DrizzleAdminStore(mockDb);
    const res = await store.getAiAnalytics();

    expect(res.overview.totalJobs).toBe(10);
    expect(res.overview.successful).toBe(8);
    expect(res.overview.failed).toBe(1);
    expect(res.overview.processing).toBe(1);
    expect(res.overview.successRate).toBe(80);
    expect(res.overview.averageDurationMs).toBe(2450.5);

    expect(res.byType).toEqual({
      lesson: { total: 6, success: 5 },
      flashcard: { total: 4, success: 3 },
    });

    expect(res.tokens).toEqual({
      available: true,
      input: 15420,
      output: 8930,
      total: 24350,
    });
  });

  it("Scenario 3: Safely handles null or undefined row returns from DB queries", async () => {
    let callCount = 0;
    const mockDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // overview returns empty array
            return { where: vi.fn().mockResolvedValue([]) };
          } else if (callCount === 2) {
            // byType returns empty array
            return {
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([]),
              }),
            };
          } else {
            // tokens returns empty array
            return { where: vi.fn().mockResolvedValue([]) };
          }
        }),
      })),
    };

    const store = new DrizzleAdminStore(mockDb);
    const res = await store.getAiAnalytics();

    expect(res.overview.totalJobs).toBe(0);
    expect(res.overview.successRate).toBe(0);
    expect(res.overview.averageDurationMs).toBe(0);
    expect(res.byType).toEqual({});
    expect(res.tokens.available).toBe(false);
  });
});
