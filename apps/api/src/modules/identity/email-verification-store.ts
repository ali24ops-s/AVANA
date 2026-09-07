import type { UserId } from "@avana/domain";

export interface EmailVerificationCodeRecord {
  id: string;
  userId: UserId;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  channel: "email" | "phone";
  target?: string | null;
  createdAt: string;
  usedAt: string | null;
}

export interface EmailVerificationStore {
  createCode(params: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
    channel?: "email" | "phone";
    target?: string | null;
  }): Promise<EmailVerificationCodeRecord>;

  findLatestActiveCode(
    userId: UserId,
    channel?: "email" | "phone",
  ): Promise<EmailVerificationCodeRecord | undefined>;

  incrementAttempts(id: string): Promise<void>;

  markAsUsed(id: string): Promise<void>;

  invalidateAllForUser(
    userId: UserId,
    channel?: "email" | "phone",
  ): Promise<void>;
}
