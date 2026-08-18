import type { UserId } from "@avana/domain";

export interface EmailVerificationCodeRecord {
  id: string;
  userId: UserId;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
  usedAt: string | null;
}

export interface EmailVerificationStore {
  createCode(params: {
    userId: UserId;
    codeHash: string;
    expiresAt: string;
  }): Promise<EmailVerificationCodeRecord>;

  findLatestActiveCode(userId: UserId): Promise<EmailVerificationCodeRecord | undefined>;

  incrementAttempts(id: string): Promise<void>;

  markAsUsed(id: string): Promise<void>;

  invalidateAllForUser(userId: UserId): Promise<void>;
}
