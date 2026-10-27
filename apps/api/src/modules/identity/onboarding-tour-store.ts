/**
 * Onboarding Tour Store (Drizzle & In-Memory).
 *
 * Implements persistence for user onboarding tour status:
 * - findByUserId
 * - upsertStatus ('skipped' or 'completed')
 */

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import { userOnboardingTours } from "@avana/database/schema";
import type { UserId, OnboardingTourRecord, OnboardingTourStatus } from "@avana/domain";

export interface OnboardingTourStore {
  findByUserId(userId: UserId): Promise<OnboardingTourRecord | null>;
  upsertStatus(
    userId: UserId,
    status: OnboardingTourStatus,
    step?: number,
  ): Promise<OnboardingTourRecord>;
}

export class DrizzleOnboardingTourStore implements OnboardingTourStore {
  constructor(private readonly db: DbClient) {}

  private mapRecord(row: typeof userOnboardingTours.$inferSelect): OnboardingTourRecord {
    return {
      id: row.id,
      userId: row.userId as UserId,
      tourId: row.tourId,
      status: row.status as OnboardingTourStatus,
      step: row.step,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findByUserId(userId: UserId): Promise<OnboardingTourRecord | null> {
    const rows = await this.db
      .select()
      .from(userOnboardingTours)
      .where(eq(userOnboardingTours.userId, userId))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRecord(rows[0]);
  }

  async upsertStatus(
    userId: UserId,
    status: OnboardingTourStatus,
    step: number = 1,
  ): Promise<OnboardingTourRecord> {
    const now = new Date();
    const isCompleted = status === "completed";
    const isDismissed = status === "skipped";

    const [row] = await this.db
      .insert(userOnboardingTours)
      .values({
        id: randomUUID(),
        userId,
        tourId: "dashboard_overview",
        status,
        step,
        completedAt: isCompleted ? now : null,
        dismissedAt: isDismissed ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userOnboardingTours.userId],
        set: {
          status,
          step,
          completedAt: isCompleted ? now : undefined,
          dismissedAt: isDismissed ? now : undefined,
          updatedAt: now,
        },
      })
      .returning();

    return this.mapRecord(row);
  }
}

export class InMemoryOnboardingTourStore implements OnboardingTourStore {
  private readonly records = new Map<string, OnboardingTourRecord>();

  async findByUserId(userId: UserId): Promise<OnboardingTourRecord | null> {
    return this.records.get(userId) ?? null;
  }

  async upsertStatus(
    userId: UserId,
    status: OnboardingTourStatus,
    step: number = 1,
  ): Promise<OnboardingTourRecord> {
    const now = new Date().toISOString();
    const isCompleted = status === "completed";
    const isDismissed = status === "skipped";

    const existing = this.records.get(userId);
    const record: OnboardingTourRecord = {
      id: existing ? existing.id : randomUUID(),
      userId,
      tourId: "dashboard_overview",
      status,
      step,
      completedAt: isCompleted ? now : existing?.completedAt ?? null,
      dismissedAt: isDismissed ? now : existing?.dismissedAt ?? null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.records.set(userId, record);
    return record;
  }

  clear(): void {
    this.records.clear();
  }
}
